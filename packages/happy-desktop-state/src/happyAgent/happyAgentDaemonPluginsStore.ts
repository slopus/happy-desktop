import {
    HappyAgentApiError,
    type AvailablePlugin,
    type HappyAgentClient,
    type PluginInstallation,
    type PluginInstallationStatus,
} from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import type {
    HappyAgentPlugin,
    HappyAgentPluginInstallation,
    HappyAgentPluginInstallationStatus,
    HappyAgentPluginsSnapshot,
    HappyAgentPluginsStore,
} from "./happyAgentPluginsStore.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

export interface HappyAgentDaemonPluginsStoreDeps {
    readonly client: Pick<
        HappyAgentClient,
        "listAvailablePlugins" | "listPlugins" | "installPlugin" | "uninstallPlugin"
    >;
    readonly sync: HappyAgentSync;
}

/** One catalog entry the store installs from: the version it offers for a plugin. */
type CatalogEntry = Pick<AvailablePlugin, "source" | "pluginId" | "version">;

const EMPTY: HappyAgentPluginsSnapshot = {
    loading: true,
    plugins: [],
    installations: [],
    manage: true,
};
/** How long a failed read waits before it is tried again while the list is watched. */
const RETRY_MS = 4_000;
const PLUGIN_EVENTS = ["plugins.updated"] as const;
const NO_SIGN_IN = "Plugins on this machine have no sign-in.";
const STATUS: Record<PluginInstallationStatus, HappyAgentPluginInstallationStatus> = {
    installing: "installing",
    installed: "active",
    failed: "failed",
};

/*
 * The two catalogs are never merged: a plugin ID may name a different plugin
 * in each, so the store keys every plugin by its catalog too. The key is only
 * ever looked up, never taken apart.
 */
function keyOf(entry: { readonly source: string; readonly pluginId: string }): string {
    return `${entry.source}:${entry.pluginId}`;
}

/* Numeric parts compare as numbers; a release sorts after its prereleases. */
function versionCompare(left: string, right: string): number {
    const [leftCore = "", leftPre] = left.split("-", 2);
    const [rightCore = "", rightPre] = right.split("-", 2);
    const leftParts = leftCore.split(".");
    const rightParts = rightCore.split(".");
    for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
        const difference = Number(leftParts[index] ?? 0) - Number(rightParts[index] ?? 0);
        if (Number.isFinite(difference) && difference !== 0) return difference;
    }
    if (leftPre === undefined) return rightPre === undefined ? 0 : 1;
    if (rightPre === undefined) return -1;
    return leftPre.localeCompare(rightPre, undefined, { numeric: true });
}

/** Per plugin, the newest version this machine can install, or else the newest. */
function offered(available: readonly AvailablePlugin[]): Map<string, AvailablePlugin> {
    const chosen = new Map<string, AvailablePlugin>();
    for (const entry of available) {
        const key = keyOf(entry);
        const current = chosen.get(key);
        if (
            current === undefined ||
            (entry.installable && !current.installable) ||
            (entry.installable === current.installable &&
                versionCompare(entry.version, current.version) > 0)
        )
            chosen.set(key, entry);
    }
    return chosen;
}

function pluginProject(entry: AvailablePlugin): HappyAgentPlugin {
    return {
        id: keyOf(entry),
        name: entry.name || entry.pluginId,
        description: entry.description,
        version: entry.version,
        image: null,
        tools: [],
        authRequired: false,
        authMethods: [],
        multiInstance: entry.multiInstance,
        installRefusal: entry.installable
            ? null
            : (entry.reason ?? "This machine can't install this version."),
        catalog: entry.source,
    };
}

function installationsProject(
    installed: readonly PluginInstallation[],
): HappyAgentPluginInstallation[] {
    const counts = new Map<string, number>();
    return [...installed]
        .sort((left, right) => left.createdAt - right.createdAt)
        .map((entry) => {
            const key = keyOf(entry);
            const ordinal = (counts.get(key) ?? 0) + 1;
            counts.set(key, ordinal);
            return {
                id: entry.id,
                pluginId: key,
                name: entry.name || entry.pluginId,
                ordinal,
                label: null,
                status: STATUS[entry.status],
                error: entry.status === "failed" ? entry.error : null,
                authMethod: null,
                toolPrefix: null,
                image: null,
                available: true,
            };
        });
}

/**
 * A Happy Agent's plugins: what its public and cluster catalogs offer, and
 * what it installed. Live while watched: the connection's bootstrap,
 * reconciles and `plugins.updated` are delivery hints, each answered by one
 * read of both lists. Installing is answered at once and finishes in the
 * background, which `plugins.updated` reports.
 */
export function happyAgentDaemonPluginsStoreCreate(
    deps: HappyAgentDaemonPluginsStoreDeps,
): HappyAgentPluginsStore {
    const store = createStore<HappyAgentPluginsSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let disposed = false;
    let follower: AbortController | undefined;
    let reading: AbortController | undefined;
    let readAgain = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** What each plugin key installs, as last read. */
    let catalog = new Map<string, CatalogEntry>();

    const retryCancel = (): void => {
        if (retry === undefined) return;
        clearTimeout(retry);
        retry = undefined;
    };

    const read = async (signal: AbortSignal): Promise<void> => {
        const [available, installed] = await Promise.all([
            deps.client.listAvailablePlugins({ signal }),
            deps.client.listPlugins({ signal }),
        ]);
        if (disposed || signal.aborted) return;
        const chosen = offered(available.plugins);
        catalog = new Map(
            [...chosen].map(([key, entry]) => [
                key,
                { source: entry.source, pluginId: entry.pluginId, version: entry.version },
            ]),
        );
        const current = store.getState();
        store.setState(
            {
                loading: false,
                manage: true,
                plugins: referencesPreserve(
                    current.plugins,
                    [...chosen.values()]
                        .map(pluginProject)
                        .sort((left, right) => left.name.localeCompare(right.name)),
                ),
                installations: referencesPreserve(
                    current.installations,
                    installationsProject(installed.plugins),
                ),
            },
            true,
        );
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        if (reading !== undefined) {
            readAgain = true;
            return;
        }
        retryCancel();
        const controller = new AbortController();
        reading = controller;
        readAgain = false;
        void read(controller.signal)
            .catch((error: unknown) => {
                if (disposed || controller.signal.aborted) return;
                const unsupported =
                    error instanceof HappyAgentApiError &&
                    (error.status === 404 || error.status === 501);
                // A daemon from before plugins offers none; any other failure keeps what was read.
                if (unsupported) {
                    catalog = new Map();
                    store.setState({ ...EMPTY, loading: false }, true);
                } else if (store.getState().loading)
                    store.setState({ loading: false, error: happyAgentUserError(error) });
                if (!unsupported && retry === undefined)
                    retry = setTimeout(() => {
                        retry = undefined;
                        load();
                    }, RETRY_MS);
            })
            .finally(() => {
                if (reading !== controller) return;
                reading = undefined;
                if (readAgain) load();
            });
    }

    const follow = (): void => {
        if (disposed || follower !== undefined) return;
        const active = new AbortController();
        follower = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: PLUGIN_EVENTS,
            })) {
                if (input.kind === "error") continue;
                // Every new connection may be a different daemon.
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    input.update.kind === "event" ||
                    input.update.kind === "connected"
                )
                    load();
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (follower === active) follower = undefined;
            });
    };

    const stop = (): void => {
        follower?.abort();
        follower = undefined;
        retryCancel();
        reading?.abort();
        reading = undefined;
        readAgain = false;
    };

    /** Runs one write, then reads both lists again whether it succeeded or not. */
    const write = async <T>(send: () => Promise<T>): Promise<T> => {
        if (disposed) throw new UserError("This Happy Agent connection is closed.");
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
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                follow();
                // Subscribing during React's commit never publishes synchronously.
                queueMicrotask(load);
            }
            return () => {
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        pluginInstall: (pluginId) =>
            write(async () => {
                const entry = catalog.get(pluginId);
                if (!entry) throw new UserError("This plugin is no longer offered.");
                const answer = await deps.client.installPlugin({
                    ...entry,
                    mutationId: globalThis.crypto.randomUUID(),
                });
                return answer.plugin.id;
            }),
        installationRemove: (installationId) =>
            write(async () => {
                try {
                    await deps.client.uninstallPlugin(installationId, {
                        mutationId: globalThis.crypto.randomUUID(),
                    });
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 404) return;
                    throw error;
                }
            }),
        installationConfigure: () => Promise.reject(new UserError(NO_SIGN_IN)),
        installationConnect: () => Promise.reject(new UserError(NO_SIGN_IN)),
        installationDisconnect: () => Promise.reject(new UserError(NO_SIGN_IN)),
        [Symbol.dispose]() {
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
