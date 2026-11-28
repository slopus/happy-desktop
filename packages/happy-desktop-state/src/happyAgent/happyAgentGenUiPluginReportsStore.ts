import { createStore } from "zustand/vanilla";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import type { HappyAgentGenUiSource } from "./happyAgentGenUiActions.js";
import type {
    HappyAgentPluginsSnapshot,
    HappyAgentPluginsStore,
} from "./happyAgentPluginsStore.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";

/** One artifact version, as the key its reported elements are held under. */
export type HappyAgentGenUiVersionKey = string & { readonly __brand: "HappyAgentGenUiVersionKey" };

export function happyAgentGenUiVersionKey(
    source: Pick<HappyAgentGenUiSource, "artifactId" | "version">,
): HappyAgentGenUiVersionKey {
    return `${source.artifactId}@${String(source.version)}` as HappyAgentGenUiVersionKey;
}

export interface HappyAgentGenUiPluginReportsSnapshot {
    /**
     * The elements of each version whose plugin setup the server took, by
     * render key. A version with none has no entry; one that gains an element
     * gets a new set, and every other version keeps its own.
     */
    readonly reported: ReadonlyMap<HappyAgentGenUiVersionKey, ReadonlySet<string>>;
}

/**
 * Tells the agent that wrote a Gen UI version when a `plugin` element it
 * offered has been set up. A tap starts watching that plugin's installations;
 * the first active one seen, already there or arriving while the plugin's page
 * opened from that tap is showing, is reported once against the element. The
 * server answers with the installations and tells the origin agent itself.
 */
export interface HappyAgentGenUiPluginReportsStore {
    get(): HappyAgentGenUiPluginReportsSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * The person tapped `element` of `source`, which asks for `pluginId`. A
     * version without a live origin agent has no one to tell: nothing is watched.
     */
    pluginSetupWatch(source: HappyAgentGenUiSource, element: string, pluginId: string): void;
    /** A plugin's page is showing. */
    pluginPageShow(pluginId: string): void;
    /** A plugin's page closed: what its taps were waiting for is no longer watched. */
    pluginPageHide(pluginId: string): void;
    [Symbol.dispose](): void;
}

/** One tap being watched, with the submission ID every retry of its report repeats. */
interface Watch {
    readonly source: HappyAgentGenUiSource;
    readonly element: string;
    readonly pluginId: string;
    readonly id: string;
    /** Whether the plugin's page has shown since the tap; only then does it closing end the watch. */
    pageSeen: boolean;
    phase: "watching" | "sending" | "waiting";
    /** The installations the last send was made on, so one that changed meanwhile is looked at again. */
    sentWith?: HappyAgentPluginsSnapshot["installations"];
    /** The failed sends in a row, which space the next retry. */
    failures: number;
    retry?: ReturnType<typeof setTimeout>;
}

const EMPTY: HappyAgentGenUiPluginReportsSnapshot = { reported: new Map() };
const RETRY_MS = 1_000;
const RETRY_MAX_MS = 30_000;

function watchKey(source: HappyAgentGenUiSource, element: string): string {
    return `${happyAgentGenUiVersionKey(source)}#${element}`;
}

/** A network failure or a server error: the same submission is sent again. */
function retriable(error: unknown): boolean {
    if (error instanceof HappyCloudRequestRefusal) return error.status >= 500;
    return error instanceof UserError && error.code === "offline";
}

/**
 * The plugin setup reports of one Happy Cloud connection. It follows the
 * plugins store, which streams installation changes, only while a tap is
 * being watched, and holds nothing on its own until then.
 */
export function happyAgentGenUiPluginReportsStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly plugins: HappyAgentPluginsStore;
    readonly now?: () => number;
}): HappyAgentGenUiPluginReportsStore {
    const store = createStore<HappyAgentGenUiPluginReportsSnapshot>()(() => EMPTY);
    const submissionId = cuid2Create(deps.now ?? Date.now);
    const watches = new Map<string, Watch>();
    const pagesShown = new Map<string, number>();
    let unfollow: (() => void) | undefined;
    /** The installations last looked at, so an unchanged list sends nothing again. */
    let seen: HappyAgentPluginsSnapshot["installations"] | undefined;
    let disposed = false;

    const active = (pluginId: string): boolean =>
        deps.plugins
            .get()
            .installations.some(
                (installation) =>
                    installation.pluginId === pluginId && installation.status === "active",
            );

    const followUpdate = (): void => {
        if (watches.size > 0 && !unfollow && !disposed) {
            seen = undefined;
            unfollow = deps.plugins.subscribe(installationsRead);
        } else if (watches.size === 0 && unfollow) {
            unfollow();
            unfollow = undefined;
        }
    };

    const watchEnd = (key: string): void => {
        const watch = watches.get(key);
        if (!watch) return;
        if (watch.retry !== undefined) clearTimeout(watch.retry);
        watches.delete(key);
        followUpdate();
    };

    const reportedSet = (watch: Watch): void => {
        const version = happyAgentGenUiVersionKey(watch.source);
        const current = store.getState().reported;
        const elements = current.get(version);
        if (elements?.has(watch.element)) return;
        const next = new Map(current);
        next.set(version, new Set([...(elements ?? []), watch.element]));
        store.setState({ reported: next }, true);
    };

    const send = (key: string, watch: Watch): void => {
        watch.phase = "sending";
        watch.sentWith = deps.plugins.get().installations;
        const path = `v0/artifacts/${encodeURIComponent(watch.source.artifactId)}/versions/${String(watch.source.version)}/actions`;
        deps.request("POST", path, { id: watch.id, element: watch.element }).then(
            () => {
                if (disposed || watches.get(key) !== watch) return;
                reportedSet(watch);
                watchEnd(key);
            },
            (error: unknown) => {
                if (disposed || watches.get(key) !== watch) return;
                if (retriable(error)) {
                    watch.phase = "waiting";
                    const delay = Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** watch.failures);
                    watch.failures += 1;
                    watch.retry = setTimeout(() => {
                        watch.retry = undefined;
                        if (watches.get(key) === watch) send(key, watch);
                    }, delay);
                    return;
                }
                // Not set up yet by the server's reading: the next change is looked at again.
                if (error instanceof HappyCloudRequestRefusal && error.code === "not_set_up") {
                    watch.phase = "watching";
                    watch.failures = 0;
                    if (watch.pageSeen && !pagesShown.has(watch.pluginId)) watchEnd(key);
                    // A setup that arrived while this was on its way was skipped then.
                    else if (deps.plugins.get().installations !== watch.sentWith)
                        watchCheck(key, watch);
                    return;
                }
                // No such element, no origin agent, or a refusal: there is nothing to report to.
                watchEnd(key);
            },
        );
    };

    const watchCheck = (key: string, watch: Watch): void => {
        if (watch.phase === "watching" && active(watch.pluginId)) send(key, watch);
    };

    function installationsRead(): void {
        const installations = deps.plugins.get().installations;
        if (installations === seen) return;
        seen = installations;
        for (const [key, watch] of watches) watchCheck(key, watch);
    }

    return {
        get: () => store.getState(),
        subscribe: (listener) => store.subscribe(listener),
        pluginSetupWatch(source, element, pluginId) {
            if (disposed || !source.origin) return;
            // Already reported here: tapping again only opens the page.
            if (store.getState().reported.get(happyAgentGenUiVersionKey(source))?.has(element))
                return;
            const key = watchKey(source, element);
            const existing = watches.get(key);
            if (existing) {
                existing.pageSeen ||= pagesShown.has(pluginId);
                watchCheck(key, existing);
                return;
            }
            const watch: Watch = {
                source,
                element,
                pluginId,
                id: submissionId(),
                pageSeen: pagesShown.has(pluginId),
                phase: "watching",
                failures: 0,
            };
            watches.set(key, watch);
            followUpdate();
            watchCheck(key, watch);
        },
        pluginPageShow(pluginId) {
            if (disposed) return;
            pagesShown.set(pluginId, (pagesShown.get(pluginId) ?? 0) + 1);
            for (const [key, watch] of watches)
                if (watch.pluginId === pluginId) {
                    watch.pageSeen = true;
                    watchCheck(key, watch);
                }
        },
        pluginPageHide(pluginId) {
            if (disposed) return;
            const shown = (pagesShown.get(pluginId) ?? 0) - 1;
            if (shown > 0) {
                pagesShown.set(pluginId, shown);
                return;
            }
            pagesShown.delete(pluginId);
            // A page detached and attached again in one commit, as a new ref or
            // Strict Mode does, has not closed: only one still gone after it ends a watch.
            // A report already on its way is finished; anything still waiting for a setup is not.
            queueMicrotask(() => {
                if (disposed || pagesShown.has(pluginId)) return;
                for (const [key, watch] of watches)
                    if (watch.pluginId === pluginId && watch.pageSeen && watch.phase === "watching")
                        watchEnd(key);
            });
        },
        [Symbol.dispose]() {
            disposed = true;
            for (const watch of watches.values())
                if (watch.retry !== undefined) clearTimeout(watch.retry);
            watches.clear();
            unfollow?.();
            unfollow = undefined;
        },
    };
}
