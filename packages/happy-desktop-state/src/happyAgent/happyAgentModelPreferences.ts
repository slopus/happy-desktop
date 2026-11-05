import type { UserSettingValue } from "@slopus/happy-agent-client";
import type {
    HappyAgentModelPreference,
    HappyAgentModelPreferenceDocument,
    HappyAgentModelPreferenceIdentity,
    HappyAgentModelPreferencePersistence,
    HappyAgentNewSessionStart,
} from "./happyAgentModelStore.js";
import { deepEqual } from "./happyAgentSupport.js";
import {
    HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
    type HappyAgentThinkingLevel,
    type HappyAgentPermissionMode,
} from "./happyAgentTypes.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsPersistence,
    type HappyAgentUserSettingsSource,
} from "./happyAgentUserSettings.js";

// Independent defaults are separate LWW keys. Model IDs stay inside values, so
// arbitrary provider IDs and slash-containing model IDs need no key encoding.
// The default names a model alone; the provider picked last is its own key.
const DEFAULT_MODEL = "happy-desktop.model.default";
const DEFAULT_EFFORT = "happy-desktop.model.effort";
const DEFAULT_ACCESS = "happy-desktop.model.access";
const PROVIDER = "happy-desktop.model.provider";
const MEMORY = "happy-desktop.model.memory";
const START = "happy-desktop.model.start";
const KEYS = new Set([DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_ACCESS, PROVIDER, MEMORY, START]);
const EMPTY: HappyAgentModelPreferenceDocument = {
    defaultEffort: HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
    defaultPermissionMode: "auto",
    preferences: {},
};
const CONNECTION = "connection";

function object(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
function effortParse(value: unknown): HappyAgentThinkingLevel | undefined {
    switch (value) {
        case "off":
        case "on":
        case "minimal":
        case "low":
        case "medium":
        case "high":
        case "xhigh":
        case "max":
        case "ultra":
            return value;
        default:
            return undefined;
    }
}
function accessParse(value: unknown): HappyAgentPermissionMode | undefined {
    switch (value) {
        case "auto":
        case "workspace_write":
        case "read_only":
        case "full_access":
            return value;
        default:
            return undefined;
    }
}
function startParse(value: unknown): HappyAgentNewSessionStart | undefined {
    return value === "lastStarted" || value === "default" ? value : undefined;
}
function identityParse(value: unknown): HappyAgentModelPreferenceIdentity | undefined {
    const entry = object(value);
    if (
        !entry ||
        typeof entry["providerId"] !== "string" ||
        !entry["providerId"] ||
        typeof entry["modelId"] !== "string" ||
        !entry["modelId"]
    )
        return undefined;
    return {
        providerId: entry["providerId"],
        modelId: entry["modelId"],
    };
}
function idParse(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}
function documentParse(value: unknown): HappyAgentModelPreferenceDocument {
    const entry = object(value);
    if (!entry) return EMPTY;
    const defaultModelId = idParse(entry["defaultModelId"]);
    const lastPickedProviderId = idParse(entry["lastPickedProviderId"]);
    // Legacy defaults embedded an effort in the model. Move that choice into
    // the separate effort field before import, where an existing daemon key wins.
    const defaultEffort =
        effortParse(object(entry["defaultSelection"])?.["effort"]) ??
        effortParse(entry["defaultEffort"]);
    const defaultPermissionMode = accessParse(entry["defaultPermissionMode"]);
    const newSessionStart = startParse(entry["newSessionStart"]);
    const preferences: Record<string, Record<string, HappyAgentModelPreference>> = Object.create(
        null,
    );
    for (const [providerId, models] of Object.entries(object(entry["preferences"]) ?? {})) {
        const provider: Record<string, HappyAgentModelPreference> = Object.create(null);
        for (const [modelId, raw] of Object.entries(object(models) ?? {})) {
            const preference = object(raw);
            if (!preference) continue;
            const effort = effortParse(preference["effort"]);
            const tier = preference["serviceTier"];
            provider[modelId] = {
                ...(effort ? { effort } : preference["effort"] === null ? { effort: null } : {}),
                ...(typeof tier === "string" || tier === null ? { serviceTier: tier } : {}),
            };
        }
        preferences[providerId] = provider;
    }
    return {
        ...(defaultModelId ? { defaultModelId } : {}),
        ...(lastPickedProviderId ? { lastPickedProviderId } : {}),
        defaultEffort: defaultEffort ?? HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
        defaultPermissionMode: defaultPermissionMode ?? "auto",
        ...(newSessionStart === "default" ? { newSessionStart } : {}),
        preferences,
    };
}

/** Picker memory is capped at 256 entries and 48 KiB, below the daemon's 64 KiB value limit. */
function memoryValue(document: HappyAgentModelPreferenceDocument): UserSettingValue {
    const entries: {
        providerId: string;
        modelId: string;
        effort?: HappyAgentThinkingLevel | null;
        serviceTier?: string | null;
    }[] = [];
    let bytes = 2;
    const encoder = new TextEncoder();
    for (const [providerId, models] of Object.entries(document.preferences).reverse()) {
        for (const [modelId, preference] of Object.entries(models ?? {}).reverse()) {
            if (!preference) continue;
            const entry = { providerId, modelId, ...preference };
            const size = encoder.encode(JSON.stringify(entry)).length + 1;
            if (entries.length >= 256 || bytes + size > 48 * 1024) continue;
            entries.push(entry);
            bytes += size;
        }
    }
    return entries.length ? entries.reverse() : null;
}
function encode(
    document: HappyAgentModelPreferenceDocument,
): ReadonlyMap<string, UserSettingValue> {
    return new Map<string, UserSettingValue>([
        [DEFAULT_MODEL, document.defaultModelId ? { modelId: document.defaultModelId } : null],
        [
            DEFAULT_EFFORT,
            document.defaultEffort === HAPPY_AGENT_DEFAULT_THINKING_LEVEL
                ? null
                : (document.defaultEffort ?? null),
        ],
        [
            DEFAULT_ACCESS,
            document.defaultPermissionMode === "auto"
                ? null
                : (document.defaultPermissionMode ?? null),
        ],
        [PROVIDER, document.lastPickedProviderId ?? null],
        [MEMORY, memoryValue(document)],
        [START, document.newSessionStart === "default" ? "default" : null],
    ]);
}
function decode(values: ReadonlyMap<string, UserSettingValue>): HappyAgentModelPreferenceDocument {
    const preferences: Record<string, Record<string, HappyAgentModelPreference>> = Object.create(
        null,
    );
    const memory = values.get(MEMORY);
    if (Array.isArray(memory))
        for (const raw of memory) {
            const identity = identityParse(raw),
                entry = object(raw);
            if (!identity || !entry) continue;
            const provider = preferences[identity.providerId] ?? Object.create(null);
            provider[identity.modelId] = entry;
            preferences[identity.providerId] = provider;
        }
    return documentParse({
        defaultModelId: object(values.get(DEFAULT_MODEL))?.["modelId"],
        defaultEffort: values.get(DEFAULT_EFFORT),
        defaultPermissionMode: values.get(DEFAULT_ACCESS),
        lastPickedProviderId: values.get(PROVIDER),
        newSessionStart: values.get(START),
        preferences,
    });
}

/** A connection's typed preference adapter backed by the same driver as attention. Opens no transport. */
export function happyAgentModelPreferencesOwnedCreate(options: {
    readonly legacy: HappyAgentModelPreferencePersistence;
    readonly cache?: HappyAgentUserSettingsPersistence;
    readonly now?: () => number;
}): {
    readonly preferences: HappyAgentModelPreferencePersistence;
    readonly connectionFollow: (source: HappyAgentUserSettingsSource) => () => void;
} {
    const driver = happyAgentUserSettingsCreate<HappyAgentModelPreferenceDocument>({
        empty: EMPTY,
        equal: deepEqual,
        keyAccept: (key) => KEYS.has(key),
        encode,
        decode,
        deviceParse: documentParse,
        deviceSerialize: (document) => document,
        now: options.now,
        persistence: {
            read: () =>
                options.cache?.read() ?? {
                    connections: { [CONNECTION]: { device: options.legacy.read() ?? EMPTY } },
                },
            write(document) {
                options.cache?.write(document);
                const connection = document.connections[CONNECTION];
                if (connection && connection.userSettings !== "supported")
                    options.legacy.write(documentParse(connection.device));
            },
        },
    });
    return {
        preferences: {
            read: () => driver.choicesRead(CONNECTION),
            write: (document) => driver.choicesUpdate(CONNECTION, documentParse(document)),
            subscribe: driver.subscribe,
        },
        connectionFollow: (source) => driver.connectionFollow(CONNECTION, source),
    };
}
