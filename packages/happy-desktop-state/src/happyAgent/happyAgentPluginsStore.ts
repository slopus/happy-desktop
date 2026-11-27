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
import { happyAgentZonePluginRead } from "./happyAgentZoneReach.js";

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

/** One tool of an installation, with the zones that enable it. */
export interface HappyAgentPluginToolZones {
    readonly name: string;
    /** The zones whose agents may use it, by ID; empty until someone enables it. */
    readonly zones: readonly string[];
}

/** Where agents can use one installation's tools, read on the plugin page. */
export interface HappyAgentPluginZoneAccess {
    /** Whether the reader may list it in zones and enable its tools there. */
    readonly canManageZones: boolean;
    /** The zones that list it, by ID. A zone lists it before it enables any tool. */
    readonly zones: readonly string[];
    /**
     * The zones that list it from before per-zone tools, which enable every
     * tool it has or gets, by ID. Changing any tool there sends the explicit
     * set, and the zone enables only those from then on.
     */
    readonly allTools: readonly string[];
    /** Every tool of the installation. A tool starts disabled in every zone. */
    readonly tools: readonly HappyAgentPluginToolZones[];
}

/**
 * Right after an install: choosing where agents can use the new
 * installation's tools, for a reader who may manage zones, or the word that
 * someone who does must enable them, for anyone else.
 */
export type HappyAgentPluginZoneSetup =
    | {
          readonly kind: "choose";
          readonly installationId: string;
          readonly pluginId: string;
          /** The installation's tools, in the plugin's order. */
          readonly tools: readonly string[];
          /** The tools switched on, by zone ID. Every tool starts off everywhere. */
          readonly enabled: ReadonlyMap<string, readonly string[]>;
          /** The zones whose tools are shown, by ID. */
          readonly expanded: readonly string[];
          readonly saving: boolean;
          /** Zones accepted by a partially successful Done; they need not be saved again. */
          readonly savedZones?: readonly string[];
          /** Why the last Done did not go through for every zone. */
          readonly error?: UserError;
      }
    | {
          readonly kind: "notice";
          readonly installationId: string;
          readonly pluginId: string;
      };

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
    /**
     * False while turned off: agents get none of its tools, skills or docs
     * anywhere, and its zones and tools are kept for when it is back on. A
     * feature installation is always enabled.
     */
    readonly enabled: boolean;
    /** Read on the plugin page; absent where the server says nothing of zones. */
    readonly zoneAccess?: HappyAgentPluginZoneAccess;
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
    /** Where an installation just made should be enabled, until it is settled. */
    readonly zoneSetup?: HappyAgentPluginZoneSetup;
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
    /**
     * Turns an installation on or off everywhere. The switch moves at once and
     * moves back when the server refuses, which rejects with its reason.
     */
    installationEnabledUpdate?(installationId: string, enabled: boolean): Promise<void>;
    /**
     * Asks, after `pluginInstall`, where agents can use the new installation:
     * a reader who may manage zones chooses in `zoneSetup`, anyone else is
     * told who must. Nothing opens for an installation without tools, or on a
     * server that says nothing of zones.
     */
    pluginZoneSetupOpen?(pluginId: string, installationId: string): void;
    /** Switches one tool on or off in one zone of the setup. */
    zoneSetupToolToggle?(zoneId: string, tool: string): void;
    /** Switches every tool on or off in one zone of the setup. */
    zoneSetupZoneAllUpdate?(zoneId: string, enabled: boolean): void;
    /** Shows or hides one zone's tools in the setup. */
    zoneSetupZoneToggle?(zoneId: string): void;
    /** Enables the chosen tools in each zone that has any, then closes the setup. */
    zoneSetupApply?(zoneIds: readonly string[]): void;
    /** Closes the setup, leaving every tool disabled. */
    zoneSetupClose?(): void;
    /** Enables or disables one tool of an installation in one zone, listing it there if needed. */
    installationZoneToolEnabledUpdate?(input: {
        readonly installationId: string;
        readonly zoneId: string;
        readonly tool: string;
        readonly enabled: boolean;
    }): Promise<void>;
    /** Replaces the tools an installation enables in one zone, listing it there if needed. */
    installationZoneToolsEnabledUpdate?(input: {
        readonly installationId: string;
        readonly zoneId: string;
        readonly enabled: readonly string[];
    }): Promise<void>;
    /** Lists an installation in one more zone, with none of its tools enabled. */
    installationZoneAdd?(input: {
        readonly installationId: string;
        readonly zoneId: string;
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

function zoneIdsRead(value: unknown): readonly string[] | undefined {
    return Array.isArray(value) && value.every((id): id is string => typeof id === "string")
        ? value
        : undefined;
}

/**
 * An installation's zones, as `GET v0/plugins/installations/{id}` answers. A
 * server from before per-zone tools names no `zones`, and says nothing here.
 */
function zoneAccessRead(answer: unknown): HappyAgentPluginZoneAccess | undefined {
    const body = recordOf(answer);
    const toolZones = recordOf(body?.toolZones);
    const zones = zoneIdsRead(body?.zones);
    if (!toolZones || !zones) return undefined;
    return {
        canManageZones: body?.canManageZones === true,
        zones,
        allTools: zoneIdsRead(body?.allTools) ?? [],
        tools: Object.entries(toolZones).flatMap(([name, value]) => {
            const enabled = zoneIdsRead(recordOf(value)?.zones);
            return enabled ? [{ name, zones: enabled }] : [];
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
    /** The key each zone's assignment in the open setup is sent with, by zone and tools. */
    const setupKeys = new Map<string, string>();
    /** Enabled switches sent and not yet answered, with the value asked for last. */
    const enabledPending = new Map<string, boolean>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let writeRevision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let follow: AbortController | undefined;
    const installation = (id: string): string =>
        `v0/plugins/installations/${encodeURIComponent(id)}`;
    const zoneInstallation = (zoneId: string, installationId: string): string =>
        `v0/zones/${encodeURIComponent(zoneId)}/plugins/${encodeURIComponent(installationId)}`;

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
        const kind = kindRead(entry.kind);
        return {
            id,
            pluginId,
            kind,
            name: textOrNull(entry.pluginName) ?? pluginId,
            ordinal: typeof entry.ordinal === "number" ? entry.ordinal : 1,
            label: textOrNull(entry.label),
            status: statusRead(entry.status, entry.reason),
            error: null,
            authMethod: textOrNull(entry.authMethod),
            toolPrefix: textOrNull(entry.toolPrefix),
            image: imageRead(entry.image),
            available: entry.available !== false,
            // A server from before the switch, and every feature, leaves it on.
            enabled: kind === "feature" || entry.enabled !== false,
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
        const revision = writeRevision;
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
        const withZones = await Promise.all(
            installations.map(async (entry) => {
                const prior = previous.get(entry.id)?.zoneAccess;
                if (entry.kind === "feature" || !watchedPlugins.has(entry.pluginId)) {
                    return prior ? { ...entry, zoneAccess: prior } : entry;
                }
                try {
                    const zoneAccess = zoneAccessRead(
                        await deps.request("GET", installation(entry.id)),
                    );
                    return zoneAccess ? { ...entry, zoneAccess } : entry;
                } catch (error) {
                    // Older servers may not have the detail route. Keep the last data on transient failures.
                    return prior &&
                        !(
                            error instanceof HappyCloudRequestRefusal &&
                            [403, 404].includes(error.status)
                        )
                        ? { ...entry, zoneAccess: prior }
                        : entry;
                }
            }),
        );
        // A response begun before a toggle settled must not undo its answer.
        if (disposed || revision !== writeRevision) return;
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
                installations: referencesPreserve(
                    current.installations,
                    withZones.map(enabledPendingShow),
                ),
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

    /** An installation with an Enabled switch still on its way shown as the reader left it. */
    const enabledPendingShow = (
        entry: HappyAgentPluginInstallation,
    ): HappyAgentPluginInstallation => {
        const pending = enabledPending.get(entry.id);
        return pending === undefined || pending === entry.enabled
            ? entry
            : { ...entry, enabled: pending };
    };
    const installationEnabledShow = (installationId: string, enabled: boolean): void => {
        store.setState((current) => ({
            installations: current.installations.map((entry) =>
                entry.id === installationId && entry.enabled !== enabled
                    ? { ...entry, enabled }
                    : entry,
            ),
        }));
    };

    const setupUpdate = (
        change: Partial<Extract<HappyAgentPluginZoneSetup, { kind: "choose" }>>,
    ): void => {
        const setup = store.getState().zoneSetup;
        if (setup?.kind === "choose") store.setState({ zoneSetup: { ...setup, ...change } });
    };
    /** A change to the setup's choice, while it is not being sent. */
    const setupEnabledUpdate = (
        zoneId: string,
        tools: (
            current: readonly string[],
            setup: Extract<HappyAgentPluginZoneSetup, { kind: "choose" }>,
        ) => readonly string[],
    ): void => {
        const setup = store.getState().zoneSetup;
        if (
            disposed ||
            setup?.kind !== "choose" ||
            setup.saving ||
            setup.savedZones?.includes(zoneId)
        )
            return;
        const enabled = new Map(setup.enabled);
        const chosen = new Set(tools(enabled.get(zoneId) ?? [], setup));
        // Kept in the installation's own order, whatever order they were switched on in.
        const next = setup.tools.filter((tool) => chosen.has(tool));
        if (next.length === 0) enabled.delete(zoneId);
        else enabled.set(zoneId, next);
        const { error: _cleared, ...rest } = setup;
        store.setState({ zoneSetup: { ...rest, enabled } });
    };
    const setupClose = (): void => {
        setupKeys.clear();
        const { zoneSetup: _closed, ...rest } = store.getState();
        store.setState(rest, true);
    };

    /**
     * Sends one change to where an installation's tools are enabled, which
     * the server answers with the zone's page, then reads the installation's
     * zones again. A read begun before it settled is not let undo it.
     */
    const zoneWrite = (
        input: { readonly installationId: string; readonly zoneId: string },
        send: () => Promise<unknown>,
    ): Promise<void> =>
        write(async () => {
            const answer = await send();
            writeRevision += 1;
            if (disposed) return;
            const listing = listOf(recordOf(answer)?.plugins)
                .flatMap((entry) => happyAgentZonePluginRead(deps.endpoint, entry) ?? [])
                .find((entry) => entry.id === input.installationId);
            if (!listing) return;
            store.setState((current) => ({
                installations: current.installations.map((entry) => {
                    const access = entry.zoneAccess;
                    if (entry.id !== input.installationId || !access) return entry;
                    const tools = new Map(listing.tools.map((tool) => [tool.name, tool.enabled]));
                    const withZone = (
                        ids: readonly string[],
                        included: boolean,
                    ): readonly string[] =>
                        included === ids.includes(input.zoneId)
                            ? ids
                            : included
                              ? [...ids, input.zoneId]
                              : ids.filter((id) => id !== input.zoneId);
                    const nextTools = access.tools.map((tool) => {
                        const enabled = tools.get(tool.name);
                        tools.delete(tool.name);
                        return typeof enabled === "boolean"
                            ? { ...tool, zones: withZone(tool.zones, enabled) }
                            : tool;
                    });
                    for (const [name, enabled] of tools) {
                        nextTools.push({ name, zones: enabled ? [input.zoneId] : [] });
                    }
                    return {
                        ...entry,
                        zoneAccess: {
                            ...access,
                            zones: withZone(access.zones, true),
                            allTools: withZone(access.allTools, listing.allTools),
                            tools: nextTools,
                        },
                    };
                }),
            }));
        });

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
        async installationEnabledUpdate(installationId, enabled) {
            if (disposed) throw new UserError("This Happy Cloud connection is closed.");
            const current = store.getState();
            const entry = current.installations.find(
                (candidate) => candidate.id === installationId,
            );
            if (!entry || entry.kind === "feature")
                throw new UserError("This installation can't be turned off.");
            if (!current.manage || !entry.available)
                throw new UserError("You can't change this installation.");
            if (entry.enabled === enabled || enabledPending.has(installationId)) return;
            enabledPending.set(installationId, enabled);
            installationEnabledShow(installationId, enabled);
            try {
                const answer = await happyCloudAssignment(
                    deps.request,
                    `${installation(installationId)}/enabled`,
                    { enabled },
                );
                const answered = installationRead(recordOf(answer)?.installation);
                if (!disposed && answered)
                    installationEnabledShow(installationId, answered.enabled);
            } catch (error) {
                if (!disposed) installationEnabledShow(installationId, entry.enabled);
                throw happyAgentUserError(error);
            } finally {
                enabledPending.delete(installationId);
                writeRevision += 1;
                load();
            }
        },
        pluginZoneSetupOpen(pluginId, installationId) {
            if (disposed) return;
            const plugin = store.getState().plugins.find((entry) => entry.id === pluginId);
            if (plugin?.kind === "feature") return;
            void deps.request("GET", installation(installationId)).then(
                (answer) => {
                    const access = zoneAccessRead(answer);
                    if (disposed || !access || access.tools.length === 0) return;
                    if (store.getState().zoneSetup?.kind === "choose") return;
                    setupKeys.clear();
                    if (!access.canManageZones) {
                        store.setState({ zoneSetup: { kind: "notice", installationId, pluginId } });
                        return;
                    }
                    const order = plugin?.tools.map((tool) => tool.name) ?? [];
                    const rank = (name: string): number => {
                        const index = order.indexOf(name);
                        return index === -1 ? order.length : index;
                    };
                    store.setState({
                        zoneSetup: {
                            kind: "choose",
                            installationId,
                            pluginId,
                            tools: access.tools
                                .map((tool) => tool.name)
                                .sort((left, right) => rank(left) - rank(right)),
                            enabled: new Map(),
                            expanded: [],
                            saving: false,
                        },
                    });
                },
                // A server without the route, or one that refused it, asks nothing.
                () => undefined,
            );
        },
        zoneSetupToolToggle(zoneId, tool) {
            setupEnabledUpdate(zoneId, (current) =>
                current.includes(tool)
                    ? current.filter((entry) => entry !== tool)
                    : [...current, tool],
            );
        },
        zoneSetupZoneAllUpdate(zoneId, enabled) {
            setupEnabledUpdate(zoneId, (_current, setup) => (enabled ? setup.tools : []));
        },
        zoneSetupZoneToggle(zoneId) {
            const setup = store.getState().zoneSetup;
            if (disposed || setup?.kind !== "choose") return;
            setupUpdate({
                expanded: setup.expanded.includes(zoneId)
                    ? setup.expanded.filter((id) => id !== zoneId)
                    : [...setup.expanded, zoneId],
            });
        },
        zoneSetupApply(zoneIds) {
            const setup = store.getState().zoneSetup;
            if (disposed || setup?.kind !== "choose" || setup.saving) return;
            const { error: _cleared, ...rest } = setup;
            store.setState({ zoneSetup: { ...rest, saving: true } });
            const assignments = [...setup.enabled].filter(
                ([zoneId]) => zoneIds.includes(zoneId) && !setup.savedZones?.includes(zoneId),
            );
            void Promise.allSettled(
                assignments.map(async ([zoneId, tools]) => {
                    // The same assignment sent again, after a Done that failed somewhere, keeps its key.
                    const assignment = JSON.stringify([setup.installationId, zoneId, tools]);
                    const key = setupKeys.get(assignment) ?? crypto.randomUUID();
                    setupKeys.set(assignment, key);
                    await happyCloudAssignment(
                        deps.request,
                        `${zoneInstallation(zoneId, setup.installationId)}/tools`,
                        { enabled: tools },
                        key,
                    );
                    return zoneId;
                }),
            ).then((results) => {
                if (disposed) return;
                writeRevision += 1;
                load();
                const refused = results.find((result) => result.status === "rejected");
                if (store.getState().zoneSetup?.installationId !== setup.installationId) return;
                if (refused) {
                    setupUpdate({
                        saving: false,
                        savedZones: [
                            ...(setup.savedZones ?? []),
                            ...results.flatMap((result) =>
                                result.status === "fulfilled" ? [result.value] : [],
                            ),
                        ],
                        error: happyAgentUserError(refused.reason),
                    });
                    return;
                }
                setupClose();
            });
        },
        zoneSetupClose() {
            const setup = store.getState().zoneSetup;
            if (disposed || !setup || (setup.kind === "choose" && setup.saving)) return;
            setupClose();
        },
        installationZoneToolEnabledUpdate: (input) =>
            zoneWrite(input, () => {
                const { installationId, zoneId, tool, enabled } = input;
                const access = store
                    .getState()
                    .installations.find((entry) => entry.id === installationId)?.zoneAccess;
                // A zone enabling every tool gets the explicit set: all of them but this one.
                if (access?.allTools.includes(zoneId))
                    return happyCloudAssignment(
                        deps.request,
                        `${zoneInstallation(zoneId, installationId)}/tools`,
                        {
                            enabled: access.tools
                                .map((entry) => entry.name)
                                .filter((name) => name !== tool || enabled),
                        },
                    );
                return happyCloudAssignment(
                    deps.request,
                    `${zoneInstallation(zoneId, installationId)}/tools/${encodeURIComponent(tool)}`,
                    { enabled },
                );
            }),
        installationZoneToolsEnabledUpdate: (input) =>
            zoneWrite(input, () =>
                happyCloudAssignment(
                    deps.request,
                    `${zoneInstallation(input.zoneId, input.installationId)}/tools`,
                    { enabled: input.enabled },
                ),
            ),
        installationZoneAdd: (input) =>
            zoneWrite(input, () =>
                happyCloudAssignment(
                    deps.request,
                    zoneInstallation(input.zoneId, input.installationId),
                    {},
                ),
            ),
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
