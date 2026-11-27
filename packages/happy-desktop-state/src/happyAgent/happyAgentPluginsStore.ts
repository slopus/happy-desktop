import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";
import {
    HappyCloudRequestRefusal,
    happyCloudAssignment,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** A plugin's picture: its address, with the ThumbHash painted until it loads. */
export interface HappyAgentPluginImage {
    readonly url: string;
    readonly thumbhash: string | null;
}

export interface HappyAgentPluginTool {
    readonly name: string;
    readonly summary: string;
}

/** One value a fields sign-in asks for, such as an API key. */
export interface HappyAgentPluginAuthField {
    readonly key: string;
    readonly label: string;
    readonly help: string;
    readonly required: boolean;
    /** Typed into a password field and never shown again. */
    readonly secret: boolean;
    readonly multiline: boolean;
}

/** One way an installation signs in to the service its plugin wraps. */
export type HappyAgentPluginAuthMethod =
    | {
          readonly type: "oauth";
          readonly id: string;
          readonly label: string;
          readonly scopes: readonly string[];
      }
    | {
          readonly type: "fields";
          readonly id: string;
          readonly label: string;
          readonly fields: readonly HappyAgentPluginAuthField[];
      };

/**
 * What installing a plugin does. An `integration` gives the team's agents a
 * service's tools and is installed for the team by those who manage plugins.
 * A `feature` turns one of Happy's own features on for the person alone, in
 * every team they belong to: any member installs or uninstalls their own, it
 * has nothing to set up, and uninstalling it deletes nothing.
 */
export type HappyAgentPluginKind = "integration" | "feature";

/** One plugin the server offers, installed or not. */
export interface HappyAgentPlugin {
    /** The store's own key for it; pass it back unchanged, never read into. */
    readonly id: string;
    readonly kind: HappyAgentPluginKind;
    readonly name: string;
    readonly description: string;
    readonly version: string;
    readonly image: HappyAgentPluginImage | null;
    readonly tools: readonly HappyAgentPluginTool[];
    /** Whether an installation does nothing until it signs in. */
    readonly authRequired: boolean;
    /** Only the methods that work on this server. */
    readonly authMethods: readonly HappyAgentPluginAuthMethod[];
    /** Whether it may be installed again while installed. */
    readonly multiInstance: boolean;
    /** Why this server cannot install it, in plain words; null when it can. */
    readonly installRefusal: string | null;
    /** `cluster` for a Happy Agent plugin from its cluster's own catalog rather than the public one. */
    readonly catalog: "public" | "cluster" | null;
}

/** One skill a custom plugin gives agents. */
export interface HappyAgentCustomPluginSkill {
    readonly name: string;
    readonly description: string;
}

/**
 * A plugin agents made for this team: skills and docs with a name and an
 * avatar, and no tools. It is never installed; it is there for everyone who
 * sees it. `team` is shared with every member, `me` is the reader's own.
 */
export interface HappyAgentCustomPlugin {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly image: HappyAgentPluginImage | null;
    readonly owner: "team" | "me";
    readonly skills: readonly HappyAgentCustomPluginSkill[];
}

/**
 * `notConfigured` is installed but waiting for a sign-in; `methodUnavailable`
 * signed in with a method this server no longer offers. `installing` and
 * `failed` are a Happy Agent unpacking a plugin, and that ending in an error.
 */
export type HappyAgentPluginInstallationStatus =
    | "active"
    | "installing"
    | "failed"
    | "notConfigured"
    | "methodUnavailable";

interface HappyAgentPluginToolAccess {
    readonly canManageZones: boolean;
    readonly tools: readonly {
        readonly name: string;
        readonly critical: boolean;
        readonly zones: readonly string[];
    }[];
}

/** One installation of a plugin on the team. A plugin may be installed more than once. */
export interface HappyAgentPluginInstallation {
    readonly id: string;
    readonly pluginId: string;
    /** A `feature` installation is the reader's own, never another member's. */
    readonly kind: HappyAgentPluginKind;
    /** The plugin's name, or its ID once the server stops offering it. */
    readonly name: string;
    /** Counts installations of one plugin from 1; never reused. */
    readonly ordinal: number;
    readonly label: string | null;
    readonly status: HappyAgentPluginInstallationStatus;
    /** Why a `failed` installation failed. */
    readonly error: string | null;
    /** The method it signed in with, if any. */
    readonly authMethod: string | null;
    /** What the agent's tools from this installation are named with, where it has tools. */
    readonly toolPrefix: string | null;
    readonly image: HappyAgentPluginImage | null;
    /** False for a plugin this server no longer offers; it cannot be changed or removed then. */
    readonly available: boolean;
    /** Read on the plugin page, absent when the server has no tool access data. */
    readonly toolAccess?: HappyAgentPluginToolAccess;
}

export interface HappyAgentPluginsSnapshot {
    /** True until the server first answers, so "nothing installed" is never claimed early. */
    readonly loading: boolean;
    /** Why the first read failed. A later successful read clears it. */
    readonly error?: UserError;
    /** Sorted by name. */
    readonly plugins: readonly HappyAgentPlugin[];
    /** Every installation on the team; a reader who may not manage them sees them too. */
    readonly installations: readonly HappyAgentPluginInstallation[];
    /** The team's custom plugins and the reader's own, sorted by name. Agents manage them. */
    readonly customPlugins: readonly HappyAgentCustomPlugin[];
    /** Whether the reader may install, set up and remove plugins. */
    readonly manage: boolean;
}

/** What the person's browser is sent to for a sign-in. Never kept by the store. */
export interface HappyAgentPluginConnectTarget {
    open(url: string): void;
}

/**
 * A setup the server refused, with what is wrong with each field by its key.
 * The messages never repeat a value.
 */
export class HappyAgentPluginFieldsError extends UserError {
    constructor(
        message: string,
        readonly fields: ReadonlyMap<string, string>,
    ) {
        super(message, "invalid_fields");
        this.name = "HappyAgentPluginFieldsError";
    }
}

/**
 * The plugins one server offers and the team's installations of them. Every
 * action is a promise that rejects with the reason to show, and the list is
 * read again after it settles.
 */
export interface HappyAgentPluginsStore {
    get(): HappyAgentPluginsSnapshot;
    /** Subscribe with a plugin ID to also follow its installations' tool access. */
    subscribe(listener: () => void, pluginId?: string): () => void;
    /** Installs one plugin and answers the new installation's ID. */
    pluginInstall(pluginId: string): Promise<string>;
    /** Removes an installation with its secrets; one already gone counts as removed. */
    installationRemove(installationId: string): Promise<void>;
    /** Signs an installation in with a fields method. Refused fields reject with `HappyAgentPluginFieldsError`. */
    installationConfigure(
        installationId: string,
        methodId: string,
        values: ReadonlyMap<string, string>,
    ): Promise<void>;
    /** Starts an OAuth sign-in and sends `target` to the provider; the server finishes it. */
    installationConnect(
        installationId: string,
        methodId: string,
        target: HappyAgentPluginConnectTarget,
    ): Promise<void>;
    /** Forgets every secret of an installation, revoking each grant upstream where it can. */
    installationDisconnect(installationId: string): Promise<void>;
    /** Sets the critical flag for one installation's tool, where the server permits it. */
    installationToolCriticalUpdate?(input: {
        readonly installationId: string;
        readonly tool: string;
        readonly critical: boolean;
    }): Promise<void>;
    [Symbol.dispose](): void;
}

const EMPTY: HappyAgentPluginsSnapshot = {
    loading: true,
    plugins: [],
    installations: [],
    customPlugins: [],
    manage: false,
};
/** Installation and custom plugin writes stream an event; the catalog changes only with a server release. */
const POLL_INTERVAL_MS = 30_000;

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function listOf(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

function toolAccessRead(answer: unknown): HappyAgentPluginToolAccess | undefined {
    const body = recordOf(answer);
    const toolZones = recordOf(body?.toolZones);
    if (!toolZones) return undefined;
    return {
        canManageZones: body?.canManageZones === true,
        tools: Object.entries(toolZones).flatMap(([name, value]) => {
            const entry = recordOf(value);
            const zones: unknown = entry?.zones;
            if (
                typeof entry?.critical !== "boolean" ||
                !Array.isArray(zones) ||
                !zones.every((id): id is string => typeof id === "string")
            )
                return [];
            return [{ name, critical: entry.critical, zones }];
        }),
    };
}

function fieldRead(value: unknown): HappyAgentPluginAuthField | undefined {
    const field = recordOf(value);
    const key = textOrNull(field?.key);
    if (!field || key === null) return undefined;
    return {
        key,
        label: textOrNull(field.label) ?? key,
        help: text(field.help),
        required: field.required === true,
        secret: field.secret === true,
        multiline: field.multiline === true,
    };
}

function methodRead(value: unknown): HappyAgentPluginAuthMethod | undefined {
    const method = recordOf(value);
    const id = textOrNull(method?.id);
    if (!method || id === null) return undefined;
    const label = textOrNull(method.label) ?? id;
    switch (method.type) {
        case "oauth":
            return {
                type: "oauth",
                id,
                label,
                scopes: listOf(method.scopes).filter(
                    (scope): scope is string => typeof scope === "string",
                ),
            };
        case "fields":
            return {
                type: "fields",
                id,
                label,
                fields: listOf(method.fields).flatMap((field) => {
                    const read = fieldRead(field);
                    return read ? [read] : [];
                }),
            };
        default:
            return undefined;
    }
}

function statusRead(status: unknown, reason: unknown): HappyAgentPluginInstallationStatus {
    if (status === "active") return "active";
    return reason === "method_unavailable" ? "methodUnavailable" : "notConfigured";
}

/** A server older than feature plugins names no kind; every plugin it offers is an integration. */
function kindRead(value: unknown): HappyAgentPluginKind {
    return value === "feature" ? "feature" : "integration";
}

function compareByName(left: { readonly name: string }, right: { readonly name: string }): number {
    return left.name.localeCompare(right.name);
}

/**
 * The plugins of a Happy Cloud server, compiled into it, the team's
 * installations of them, and the custom plugins agents made. Both lists are
 * read again on `plugins.changed`, which every installation and custom plugin
 * write journals.
 */
export function happyAgentPluginsStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    /** Where the server serves plugin pictures from. */
    readonly endpoint: string;
    readonly sync?: HappyAgentSync;
}): HappyAgentPluginsStore {
    const store = createStore<HappyAgentPluginsSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    const watchedPlugins = new Map<string, number>();
    const savingToolAccess = new Set<string>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let toolWriteRevision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let follow: AbortController | undefined;
    const installation = (id: string): string =>
        `v0/plugins/installations/${encodeURIComponent(id)}`;

    const imageRead = (value: unknown): HappyAgentPluginImage | null => {
        const image = recordOf(value);
        const digest = textOrNull(image?.digest);
        if (digest === null) return null;
        const thumbhash = textOrNull(image?.thumbhash);
        return {
            url: happyAgentImageUrl(
                deps.endpoint,
                `/v0/plugins/images/${encodeURIComponent(digest)}`,
                thumbhash ?? digest,
            ),
            thumbhash,
        };
    };

    const pluginRead = (value: unknown): HappyAgentPlugin | undefined => {
        const plugin = recordOf(value);
        const id = textOrNull(plugin?.id);
        if (!plugin || id === null) return undefined;
        const auth = recordOf(plugin.auth);
        const kind = kindRead(plugin.kind);
        return {
            id,
            kind,
            name: textOrNull(plugin.name) ?? id,
            description: text(plugin.description),
            version: text(plugin.version),
            image: imageRead(plugin.image),
            tools: listOf(plugin.tools).flatMap((tool) => {
                const entry = recordOf(tool);
                const name = textOrNull(entry?.name);
                return name === null ? [] : [{ name, summary: text(entry?.summary) }];
            }),
            authRequired: auth?.required === true,
            authMethods: listOf(auth?.methods).flatMap((method) => {
                const read = methodRead(method);
                return read ? [read] : [];
            }),
            // The person has a feature or does not.
            multiInstance: kind === "integration",
            installRefusal: null,
            catalog: null,
        };
    };

    const customPluginRead = (value: unknown): HappyAgentCustomPlugin | undefined => {
        const plugin = recordOf(value);
        const id = textOrNull(plugin?.id);
        const owner = plugin?.owner;
        if (!plugin || id === null || (owner !== "team" && owner !== "me")) return undefined;
        return {
            id,
            name: textOrNull(plugin.name) ?? id,
            description: text(plugin.description),
            image: imageRead(plugin.image),
            owner,
            skills: listOf(plugin.skills).flatMap((skill) => {
                const entry = recordOf(skill);
                const name = textOrNull(entry?.name);
                return name === null ? [] : [{ name, description: text(entry?.description) }];
            }),
        };
    };

    const installationRead = (value: unknown): HappyAgentPluginInstallation | undefined => {
        const entry = recordOf(value);
        const id = textOrNull(entry?.id);
        const pluginId = textOrNull(entry?.plugin);
        if (!entry || id === null || pluginId === null) return undefined;
        return {
            id,
            pluginId,
            kind: kindRead(entry.kind),
            name: textOrNull(entry.pluginName) ?? pluginId,
            ordinal: typeof entry.ordinal === "number" ? entry.ordinal : 1,
            label: textOrNull(entry.label),
            status: statusRead(entry.status, entry.reason),
            error: null,
            authMethod: textOrNull(entry.authMethod),
            toolPrefix: textOrNull(entry.toolPrefix),
            image: imageRead(entry.image),
            available: entry.available !== false,
        };
    };

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, POLL_INTERVAL_MS);
    };

    const read = async (): Promise<void> => {
        const revision = toolWriteRevision;
        // Every member reads both; the installations say whether the reader may manage them.
        const [catalog, installed] = await Promise.all([
            deps.request("GET", "v0/plugins"),
            deps.request("GET", "v0/plugins/installations"),
        ]);
        const manage = recordOf(installed)?.canManage === true;
        const installations = listOf(recordOf(installed)?.installations).flatMap((entry) => {
            const installation = installationRead(entry);
            return installation ? [installation] : [];
        });
        const previous = new Map(store.getState().installations.map((entry) => [entry.id, entry]));
        const withTools = await Promise.all(
            installations.map(async (entry) => {
                const prior = previous.get(entry.id)?.toolAccess;
                if (entry.kind === "feature" || !watchedPlugins.has(entry.pluginId)) {
                    return prior ? { ...entry, toolAccess: prior } : entry;
                }
                try {
                    const toolAccess = toolAccessRead(
                        await deps.request("GET", installation(entry.id)),
                    );
                    return toolAccess ? { ...entry, toolAccess } : entry;
                } catch (error) {
                    // Older servers may not have the detail route. Keep the last data on transient failures.
                    return prior &&
                        !(
                            error instanceof HappyCloudRequestRefusal &&
                            [403, 404].includes(error.status)
                        )
                        ? { ...entry, toolAccess: prior }
                        : entry;
                }
            }),
        );
        // A response begun before a toggle settled must not undo its answer.
        if (disposed || revision !== toolWriteRevision) return;
        const current = store.getState();
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                manage,
                plugins: referencesPreserve(
                    current.plugins,
                    listOf(recordOf(catalog)?.plugins)
                        .flatMap((plugin) => {
                            const entry = pluginRead(plugin);
                            return entry ? [entry] : [];
                        })
                        .sort(compareByName),
                ),
                installations: referencesPreserve(current.installations, withTools),
                customPlugins: referencesPreserve(
                    current.customPlugins,
                    listOf(recordOf(catalog)?.customPlugins)
                        .flatMap((plugin) => {
                            const entry = customPluginRead(plugin);
                            return entry ? [entry] : [];
                        })
                        .sort(compareByName),
                ),
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
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        reading = true;
        readAgain = false;
        void read()
            .catch((error: unknown) => {
                if (!disposed && store.getState().loading)
                    store.setState({ loading: false, error: happyAgentUserError(error) });
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
                else schedule();
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
                events: [
                    "plugins.changed",
                    "zone.created",
                    "zone.updated",
                    "zone.deleted",
                    "zone.plugins",
                ],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                load();
            }
        })().catch(() => undefined);
    };

    /** Runs one write, then reads the list again whether it succeeded or not. */
    const write = async <T>(send: () => Promise<T>): Promise<T> => {
        if (disposed) throw new UserError("This Happy Cloud connection is closed.");
        try {
            return await send();
        } catch (error) {
            throw happyAgentUserError(error);
        } finally {
            load();
        }
    };

    return {
        get: () => store.getState(),
        subscribe(listener, pluginId) {
            if (disposed) return () => undefined;
            const watchers = pluginId === undefined ? 0 : (watchedPlugins.get(pluginId) ?? 0);
            if (pluginId !== undefined) watchedPlugins.set(pluginId, watchers + 1);
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) followStart();
            if (listeners.size === 1 || (pluginId !== undefined && watchers === 0)) {
                // Subscribing during React's commit never publishes synchronously.
                queueMicrotask(load);
            }
            return () => {
                unsubscribe();
                if (pluginId !== undefined) {
                    const remaining = (watchedPlugins.get(pluginId) ?? 1) - 1;
                    if (remaining === 0) watchedPlugins.delete(pluginId);
                    else watchedPlugins.set(pluginId, remaining);
                }
                listeners.delete(listener);
                if (listeners.size > 0) return;
                follow?.abort();
                follow = undefined;
                if (timer !== undefined) clearTimeout(timer);
                timer = undefined;
            };
        },
        pluginInstall: (pluginId) =>
            write(async () => {
                const answer = await deps.request("POST", "v0/plugins/installations", {
                    plugin: pluginId,
                });
                const id = textOrNull(recordOf(recordOf(answer)?.installation)?.id);
                if (id === null) throw new UserError("The server's answer had no installation.");
                return id;
            }),
        installationRemove: (installationId) =>
            write(async () => {
                try {
                    await deps.request("DELETE", installation(installationId));
                } catch (error) {
                    if (error instanceof UserError && error.code === "not_found") return;
                    throw error;
                }
            }),
        installationConfigure: (installationId, methodId, values) =>
            write(async () => {
                try {
                    await deps.request("POST", `${installation(installationId)}/configure`, {
                        method: methodId,
                        values: Object.fromEntries(values),
                    });
                } catch (error) {
                    const fields =
                        error instanceof HappyCloudRequestRefusal && error.code === "invalid_fields"
                            ? recordOf(recordOf(error.body)?.fields)
                            : undefined;
                    if (!fields) throw error;
                    throw new HappyAgentPluginFieldsError(
                        error instanceof Error ? error.message : "Some fields were refused.",
                        new Map(
                            Object.entries(fields).flatMap(([key, message]) =>
                                typeof message === "string" ? [[key, message] as const] : [],
                            ),
                        ),
                    );
                }
            }),
        installationConnect: (installationId, methodId, target) =>
            write(async () => {
                const answer = await deps.request(
                    "POST",
                    `${installation(installationId)}/connect`,
                    { method: methodId },
                );
                const url = textOrNull(recordOf(answer)?.authorizeUrl);
                if (url === null || !url.startsWith("https://"))
                    throw new UserError("The server gave no sign-in address.");
                target.open(url);
            }),
        installationDisconnect: (installationId) =>
            write(async () => {
                await deps.request("POST", `${installation(installationId)}/disconnect`, {});
            }),
        installationToolCriticalUpdate: ({ installationId, tool, critical }) =>
            write(async () => {
                const access = store
                    .getState()
                    .installations.find((entry) => entry.id === installationId)?.toolAccess;
                if (!access?.canManageZones || !access.tools.some((entry) => entry.name === tool)) {
                    throw new UserError(
                        "You can't change this tool's critical setting.",
                        "forbidden",
                    );
                }
                if (savingToolAccess.has(installationId)) {
                    throw new UserError("Another tool change is still saving.");
                }
                savingToolAccess.add(installationId);
                try {
                    const answer = await happyCloudAssignment(
                        deps.request,
                        `${installation(installationId)}/tools/${encodeURIComponent(tool)}/zone`,
                        { critical },
                    );
                    if (disposed) return;
                    const toolAccess = toolAccessRead(answer);
                    if (!toolAccess) return;
                    toolWriteRevision += 1;
                    store.setState((current) => ({
                        installations: current.installations.map((entry) =>
                            entry.id === installationId ? { ...entry, toolAccess } : entry,
                        ),
                    }));
                } finally {
                    savingToolAccess.delete(installationId);
                }
            }),
        [Symbol.dispose]() {
            disposed = true;
            follow?.abort();
            follow = undefined;
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
            listeners.clear();
            watchedPlugins.clear();
        },
    };
}

const NONE: HappyAgentPluginsSnapshot = { ...EMPTY, loading: false };

/** For a connection without plugins: nothing to read, nothing ever loads. */
export const happyAgentPluginsStoreNone: HappyAgentPluginsStore = {
    get: () => NONE,
    subscribe: () => () => undefined,
    pluginInstall: () => Promise.reject(new UserError("This server has no plugins.")),
    installationRemove: () => Promise.resolve(),
    installationConfigure: () => Promise.reject(new UserError("This server has no plugins.")),
    installationConnect: () => Promise.reject(new UserError("This server has no plugins.")),
    installationDisconnect: () => Promise.resolve(),
    [Symbol.dispose]: () => undefined,
};
