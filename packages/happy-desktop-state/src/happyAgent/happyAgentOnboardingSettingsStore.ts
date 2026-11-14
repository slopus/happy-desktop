import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** Whether a gate is left out, offered, or required before the reader may start. */
export type HappyAgentOnboardingRequirement = "off" | "optional" | "required";

/** Where a setting's value came from, as the server names its layers. */
export type HappyAgentOnboardingSettingSource = "default" | "global" | "operator-tenant" | "tenant";
/**
 * Who may set it: `tenant-editable` lets the team's owner override the
 * operator; `per-tenant` and `global` are the operator's alone.
 */
export type HappyAgentOnboardingSettingScope = "global" | "per-tenant" | "tenant-editable";

/** One onboarding gate's requirement, as Settings › Administration lists it. */
export interface HappyAgentOnboardingGateSetting {
    /** The gate's ID, as `GET /v0/onboarding` names it. */
    readonly id: string;
    readonly requirement: HappyAgentOnboardingRequirement;
    /** Whether this reader may change it, as the server decides for them. */
    readonly editable: boolean;
    readonly source: HappyAgentOnboardingSettingSource;
    readonly scope: HappyAgentOnboardingSettingScope;
    /** A change the server has not answered yet. */
    readonly saving: boolean;
}

export interface HappyAgentOnboardingSettingsSnapshot {
    /** True until the first answer. */
    readonly loading: boolean;
    /**
     * Whether the server reports onboarding settings at all. A server deployed
     * before onboarding gates reports none, and Settings leaves the page out.
     */
    readonly available: boolean;
    /** Every gate the server has a setting for, in the server's order. */
    readonly gates: readonly HappyAgentOnboardingGateSetting[];
    /** The plugins the plugins gate asks for; empty asks for any one. */
    readonly requiredPlugins: {
        readonly ids: readonly string[];
        readonly editable: boolean;
        readonly saving: boolean;
    };
    readonly error?: UserError;
    /** Why the last change was not saved; it was put back. */
    readonly saveError?: UserError;
}

/**
 * Settings › Administration on Happy Cloud: which onboarding gates the team asks
 * for, read from the layered settings in `GET /v0/config`. Followed through
 * `config.updated` and `onboarding.updated` while it is on screen.
 */
export interface HappyAgentOnboardingSettingsStore {
    get(): HappyAgentOnboardingSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    gateRequirementUpdate(gateId: string, requirement: HappyAgentOnboardingRequirement): void;
    requiredPluginsUpdate(ids: readonly string[]): void;
    [Symbol.dispose](): void;
}

const GATE_PREFIX = "onboarding.gates.";
const REQUIRED_PLUGINS = "onboarding.requiredPlugins";

const EMPTY: HappyAgentOnboardingSettingsSnapshot = {
    loading: true,
    available: false,
    gates: [],
    requiredPlugins: { ids: [], editable: false, saving: false },
};

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function requirementOf(value: unknown): HappyAgentOnboardingRequirement | undefined {
    return value === "off" || value === "optional" || value === "required" ? value : undefined;
}

function scopeOf(value: unknown): HappyAgentOnboardingSettingScope {
    return value === "tenant-editable" || value === "per-tenant" ? value : "global";
}

function sourceOf(value: unknown): HappyAgentOnboardingSettingSource {
    return value === "global" || value === "operator-tenant" || value === "tenant"
        ? value
        : "default";
}

function idsOf(value: unknown): readonly string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export function happyAgentOnboardingSettingsStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
}): HappyAgentOnboardingSettingsStore {
    const store = createStore<HappyAgentOnboardingSettingsSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let follow: AbortController | undefined;
    /** Values sent and not yet answered, by setting key; a read keeps showing them. */
    const pending = new Map<string, unknown>();

    const set = (change: Partial<HappyAgentOnboardingSettingsSnapshot>): void => {
        store.setState(change, false);
    };

    const read = async (): Promise<void> => {
        const answer = await deps.request("GET", "v0/config");
        if (disposed) return;
        const config = recordOf(recordOf(answer)?.config);
        const settings = recordOf(config?.settings) ?? {};
        const operator = recordOf(config?.operatorSettings) ?? {};
        const layers = recordOf(config?.settingLayers) ?? {};
        const valueOf = (key: string): unknown =>
            pending.has(key) ? pending.get(key) : key in settings ? settings[key] : operator[key];
        const gates: HappyAgentOnboardingGateSetting[] = [];
        for (const [key, layer] of Object.entries(layers)) {
            if (!key.startsWith(GATE_PREFIX)) continue;
            const requirement = requirementOf(valueOf(key));
            if (!requirement) continue;
            gates.push({
                id: key.slice(GATE_PREFIX.length),
                requirement,
                editable: recordOf(layer)?.editable === true,
                source: sourceOf(recordOf(layer)?.source),
                scope: scopeOf(recordOf(layer)?.scope),
                saving: pending.has(key),
            });
        }
        const pluginsLayer = recordOf(layers[REQUIRED_PLUGINS]);
        const current = store.getState();
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                available: gates.length > 0,
                gates: referencesPreserve(current.gates, gates),
                requiredPlugins: {
                    ids: referencesPreserve(
                        current.requiredPlugins.ids,
                        idsOf(valueOf(REQUIRED_PLUGINS)),
                    ),
                    editable: pluginsLayer?.editable === true,
                    saving: pending.has(REQUIRED_PLUGINS),
                },
            },
            true,
        );
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        if (reading) {
            readAgain = true;
            return;
        }
        reading = true;
        readAgain = false;
        void read()
            .catch((error: unknown) => {
                if (!disposed && store.getState().loading)
                    set({ loading: false, error: happyAgentUserError(error) });
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
            });
    }

    const followStart = (): void => {
        const sync = deps.sync;
        if (!sync || follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["config.updated", "onboarding.updated"],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                load();
            }
        })().catch(() => undefined);
    };

    /** Shows `value` for `key` at once, sends it, and puts the server's back if refused. */
    const save = (key: string, value: unknown, show: () => void): void => {
        pending.set(key, value);
        const { saveError: _cleared, ...rest } = store.getState();
        store.setState(rest, true);
        show();
        void deps
            .request("PATCH", "v0/config", {
                settings: { [key]: value },
                mutationId: crypto.randomUUID(),
            })
            .then(
                () => undefined,
                (error: unknown) => {
                    if (!disposed) set({ saveError: happyAgentUserError(error) });
                },
            )
            .finally(() => {
                if (pending.get(key) === value) pending.delete(key);
                load();
            });
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                load();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size > 0) return;
                follow?.abort();
                follow = undefined;
            };
        },
        gateRequirementUpdate(gateId, requirement) {
            const snapshot = store.getState();
            const gate = snapshot.gates.find((entry) => entry.id === gateId);
            if (disposed || !gate?.editable) return;
            if (gate.requirement === requirement) return;
            save(`${GATE_PREFIX}${gateId}`, requirement, () =>
                set({
                    gates: snapshot.gates.map((entry) =>
                        entry.id === gateId ? { ...entry, requirement, saving: true } : entry,
                    ),
                }),
            );
        },
        requiredPluginsUpdate(ids) {
            const snapshot = store.getState();
            if (disposed || !snapshot.requiredPlugins.editable) return;
            const next = [...new Set(ids)];
            save(REQUIRED_PLUGINS, next, () =>
                set({ requiredPlugins: { ...snapshot.requiredPlugins, ids: next, saving: true } }),
            );
        },
        [Symbol.dispose]() {
            disposed = true;
            follow?.abort();
            follow = undefined;
            listeners.clear();
        },
    };
}

const INERT_SNAPSHOT: HappyAgentOnboardingSettingsSnapshot = { ...EMPTY, loading: false };

/** Stands in where there is no Happy Cloud server, so a view subscribes unconditionally. */
export const happyAgentOnboardingSettingsStoreNoop: HappyAgentOnboardingSettingsStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    gateRequirementUpdate: () => undefined,
    requiredPluginsUpdate: () => undefined,
    [Symbol.dispose]: () => undefined,
};
