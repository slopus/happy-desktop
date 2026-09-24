import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
    DesktopAppearanceMode,
    DesktopConfig,
    DesktopDefaultModel,
    DesktopKeepAwakeMode,
    DesktopLinkOpenPlacement,
    DesktopModelIdentity,
    DesktopModelPreference,
    DesktopPermissionMode,
    DesktopScrollbarVisibility,
} from "../shared/desktopContract";

const CONFIG_VERSION = 1;
const DEFAULT_EFFORT = "medium";
const MAXIMUM_MODEL_PREFERENCES = 1_000;
const MAXIMUM_VALUE_LENGTH = 500;
const PERMISSION_MODES: ReadonlySet<string> = new Set([
    "auto",
    "workspace_write",
    "read_only",
    "full_access",
]);

class InvalidDesktopConfigError extends Error {}

export const desktopConfigEmpty: DesktopConfig = {
    appearance: "system",
    defaultEffort: DEFAULT_EFFORT,
    defaultPermissionMode: "auto",
    modelPreferences: [],
    scrollbarVisibility: "automatic",
    version: CONFIG_VERSION,
};

/** The one desktop config path shared by packaged Electron and browser development. */
export function desktopConfigPath(homeDirectory = homedir()): string {
    return join(homeDirectory, ".happy", "desktop", "config.json");
}

/**
 * Owns the desktop preference document and serializes every replacement so two
 * quick picker changes cannot race their temporary-file renames.
 */
export class DesktopConfigStore {
    private operation = Promise.resolve();

    private constructor(
        private readonly path: string,
        private value: DesktopConfig,
    ) {}

    static async create(path: string): Promise<DesktopConfigStore> {
        return new DesktopConfigStore(path, await desktopConfigRead(path));
    }

    get(): DesktopConfig {
        return this.value;
    }

    write(candidate: unknown): Promise<void> {
        const value = desktopConfigValidate(candidate);
        const operation = this.operation.then(async () => {
            await desktopConfigWrite(this.path, value);
            this.value = value;
        });
        this.operation = operation.catch(() => undefined);
        return operation;
    }
}

/** Reads one complete validated document, falling back safely when none exists. */
export async function desktopConfigRead(path: string): Promise<DesktopConfig> {
    try {
        return desktopConfigValidate(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
        if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT")
            return desktopConfigEmpty;
        if (error instanceof InvalidDesktopConfigError) return desktopConfigEmpty;
        throw error;
    }
}

/**
 * Replaces the config atomically: readers observe the complete previous file or
 * the complete next file, never a partially written JSON document.
 */
export async function desktopConfigWrite(path: string, config: DesktopConfig): Promise<void> {
    const value = desktopConfigValidate(config);
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(value, undefined, 2)}\n`, {
            flag: "wx",
            mode: 0o600,
        });
        await rename(temporary, path);
    } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}

/** Validates the complete renderer-supplied replacement at the privileged boundary. */
export function desktopConfigValidate(candidate: unknown): DesktopConfig {
    if (!isRecord(candidate) || candidate.version !== CONFIG_VERSION) throw invalidConfigError();
    if (
        !Array.isArray(candidate.modelPreferences) ||
        candidate.modelPreferences.length > MAXIMUM_MODEL_PREFERENCES
    )
        throw invalidConfigError();
    const allowed = new Set([
        "appearance",
        "defaultEffort",
        "defaultModel",
        "defaultPermissionMode",
        "keepAwake",
        "lastPickedModel",
        "linkOpen",
        "modelPreferences",
        "previewUpdatesEnabled",
        "scrollbarVisibility",
        "titleShimmerEnabled",
        "version",
    ]);
    if (Object.keys(candidate).some((key) => !allowed.has(key))) throw invalidConfigError();
    if (
        candidate.previewUpdatesEnabled !== undefined &&
        typeof candidate.previewUpdatesEnabled !== "boolean"
    )
        throw invalidConfigError();
    if (
        candidate.titleShimmerEnabled !== undefined &&
        typeof candidate.titleShimmerEnabled !== "boolean"
    )
        throw invalidConfigError();

    const appearance =
        candidate.appearance === undefined ? "system" : appearanceModeParse(candidate.appearance);
    const defaultModel =
        candidate.defaultModel === undefined
            ? undefined
            : defaultModelParse(candidate.defaultModel);
    const defaultEffort =
        candidate.defaultEffort === undefined
            ? (defaultModel?.effort ?? DEFAULT_EFFORT)
            : preferenceValueValid(candidate.defaultEffort)
              ? candidate.defaultEffort
              : undefined;
    const defaultPermissionMode =
        candidate.defaultPermissionMode === undefined
            ? "auto"
            : permissionModeParse(candidate.defaultPermissionMode);
    const keepAwake =
        candidate.keepAwake === undefined ? undefined : keepAwakeModeParse(candidate.keepAwake);
    const lastPickedModel =
        candidate.lastPickedModel === undefined
            ? undefined
            : modelIdentityOnlyParse(candidate.lastPickedModel);
    const linkOpen =
        candidate.linkOpen === undefined ? undefined : linkOpenPlacementParse(candidate.linkOpen);
    const titleShimmerEnabled =
        typeof candidate.titleShimmerEnabled === "boolean"
            ? candidate.titleShimmerEnabled
            : undefined;
    const scrollbarVisibility =
        candidate.scrollbarVisibility === undefined
            ? "automatic"
            : scrollbarVisibilityParse(candidate.scrollbarVisibility);
    if (
        !appearance ||
        (candidate.defaultModel !== undefined && !defaultModel) ||
        !defaultEffort ||
        !defaultPermissionMode ||
        (candidate.keepAwake !== undefined && !keepAwake) ||
        (candidate.lastPickedModel !== undefined && !lastPickedModel) ||
        (candidate.linkOpen !== undefined && !linkOpen) ||
        !scrollbarVisibility
    )
        throw invalidConfigError();

    const modelPreferences: DesktopModelPreference[] = [];
    const identities = new Set<string>();
    for (const value of candidate.modelPreferences) {
        const preference = modelPreferenceParse(value);
        if (!preference) throw invalidConfigError();
        const identity = JSON.stringify([preference.providerId, preference.modelId]);
        if (identities.has(identity)) throw invalidConfigError();
        identities.add(identity);
        modelPreferences.push(preference);
    }
    return {
        appearance,
        defaultEffort,
        ...(defaultModel ? { defaultModel } : {}),
        defaultPermissionMode,
        ...(keepAwake ? { keepAwake } : {}),
        ...(lastPickedModel ? { lastPickedModel } : {}),
        ...(linkOpen ? { linkOpen } : {}),
        modelPreferences,
        ...(candidate.previewUpdatesEnabled === undefined
            ? {}
            : { previewUpdatesEnabled: candidate.previewUpdatesEnabled as boolean }),
        scrollbarVisibility,
        ...(titleShimmerEnabled === undefined ? {} : { titleShimmerEnabled }),
        version: CONFIG_VERSION,
    };
}

function appearanceModeParse(value: unknown): DesktopAppearanceMode | undefined {
    return value === "dark" || value === "light" || value === "system" ? value : undefined;
}

function linkOpenPlacementParse(value: unknown): DesktopLinkOpenPlacement | undefined {
    return value === "panel" || value === "browser" ? value : undefined;
}

function keepAwakeModeParse(value: unknown): DesktopKeepAwakeMode | undefined {
    return value === "on" || value === "agent" || value === "off" ? value : undefined;
}

function scrollbarVisibilityParse(value: unknown): DesktopScrollbarVisibility | undefined {
    return value === "always" || value === "automatic" ? value : undefined;
}

function defaultModelParse(candidate: unknown): DesktopDefaultModel | undefined {
    if (!isRecord(candidate)) return undefined;
    const identity = modelIdentityParse(candidate);
    if (!identity) return undefined;
    const allowed = new Set(["effort", "modelId", "providerId"]);
    if (
        Object.keys(candidate).some((key) => !allowed.has(key)) ||
        (candidate.effort !== undefined && !preferenceValueValid(candidate.effort))
    )
        return undefined;
    return {
        ...identity,
        ...(typeof candidate.effort === "string" ? { effort: candidate.effort } : {}),
    };
}

function modelPreferenceParse(candidate: unknown): DesktopModelPreference | undefined {
    if (!isRecord(candidate)) return undefined;
    const identity = modelIdentityParse(candidate);
    if (!identity) return undefined;
    const allowed = new Set(["lastEffort", "lastSpeed", "modelId", "providerId"]);
    if (
        Object.keys(candidate).some((key) => !allowed.has(key)) ||
        !preferenceValueValid(candidate.lastSpeed) ||
        (candidate.lastEffort !== undefined && !preferenceValueValid(candidate.lastEffort))
    )
        return undefined;
    return {
        ...identity,
        ...(typeof candidate.lastEffort === "string" ? { lastEffort: candidate.lastEffort } : {}),
        lastSpeed: candidate.lastSpeed as string,
    };
}

function modelIdentityParse(candidate: unknown): DesktopModelIdentity | undefined {
    if (!isRecord(candidate)) return undefined;
    if (!identityValueValid(candidate.providerId) || !identityValueValid(candidate.modelId))
        return undefined;
    return {
        providerId: candidate.providerId as string,
        modelId: candidate.modelId as string,
    };
}

function modelIdentityOnlyParse(candidate: unknown): DesktopModelIdentity | undefined {
    const identity = modelIdentityParse(candidate);
    if (
        !identity ||
        !isRecord(candidate) ||
        Object.keys(candidate).some((key) => key !== "providerId" && key !== "modelId")
    )
        return undefined;
    return identity;
}

function identityValueValid(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= MAXIMUM_VALUE_LENGTH;
}

function preferenceValueValid(value: unknown): value is string {
    return identityValueValid(value);
}

function permissionModeParse(value: unknown): DesktopPermissionMode | undefined {
    return typeof value === "string" && PERMISSION_MODES.has(value)
        ? (value as DesktopPermissionMode)
        : undefined;
}

function invalidConfigError(): Error {
    return new InvalidDesktopConfigError("Desktop config is invalid.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
