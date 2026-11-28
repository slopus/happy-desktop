import { collaborativeDocumentSyncCreate } from "../documents/collaborativeDocumentSync.js";
import type { HappyCloudRequest } from "../happyAgent/happyAgentProviderCredentials.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { handbookDraftRoutes, recordOf } from "./handbookRead.js";
import type {
    HappyAgentHandbookDraftSnapshot,
    HappyAgentHandbookDraftStore,
    HappyAgentHandbookItemId,
} from "./handbookTypes.js";

export interface HappyAgentHandbookDraftDeps {
    readonly request: HappyCloudRequest;
    readonly sync: HappyAgentSync;
    readonly itemId: HappyAgentHandbookItemId;
    readonly now?: () => number;
    /** Given for an item this window is still making; sending and subscribing wait for it. */
    readonly created?: Promise<void>;
}

/**
 * The item a live document frame names. Handbook drafts share the document
 * frame names (contract change 1): their data carries `itemId` where a
 * Surface's carries `surfaceId`, which the published client does not type.
 */
function frameItemId(data: unknown): string | undefined {
    const itemId = recordOf(data)?.itemId;
    return typeof itemId === "string" ? itemId : undefined;
}

/**
 * One handbook item's draft, kept for the life of the handbook store.
 *
 * The constructor opens nothing. While something shows it, the connection's
 * stream is subscribed to the draft through `/v0/handbook/:id/subscribe`, and
 * the collaborative document driver merges everyone's changes and sends the
 * reader's, exactly as it does for a document Surface. Without
 * `handbook.edit` the editor is read-only, so nothing is written here; the
 * draft is still followed live.
 */
export function happyAgentHandbookDraftStoreCreate(
    deps: HappyAgentHandbookDraftDeps,
): HappyAgentHandbookDraftStore {
    const itemId = deps.itemId;
    const listeners = new Set<() => void>();
    let disposed = false;
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** The latest subscribe-and-read; a newer one supersedes it. */
    let attaching: AbortController | undefined;

    const snapshotOf = (): HappyAgentHandbookDraftSnapshot => {
        if (collaborative.missing()) return { itemId, status: "missing" };
        const live = collaborative.live();
        if (live !== undefined)
            return {
                itemId,
                status: "live",
                ydoc: live.ydoc,
                sync: live.sync,
                presence: live.presence,
                ...(live.failure === undefined ? {} : { failure: live.failure }),
            };
        const error = collaborative.error();
        return { itemId, status: "loading", ...(error === undefined ? {} : { error }) };
    };

    const publish = (): void => {
        if (disposed) return;
        const next = snapshotOf();
        const previous = snapshot;
        if (
            next.status === previous.status &&
            (next.status !== "live" ||
                (previous.status === "live" &&
                    next.ydoc === previous.ydoc &&
                    next.sync === previous.sync &&
                    next.failure === previous.failure &&
                    next.presence === previous.presence)) &&
            (next.status !== "loading" ||
                (previous.status === "loading" && next.error === previous.error))
        )
            return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const collaborative = collaborativeDocumentSyncCreate({
        routes: handbookDraftRoutes(deps.request, itemId),
        changed: () => publish(),
        ...(deps.now === undefined ? {} : { now: deps.now }),
        ...(deps.created === undefined ? {} : { created: deps.created }),
    });
    let snapshot = snapshotOf();

    const attach = (signal: AbortSignal): void => {
        attaching?.abort();
        const own = new AbortController();
        attaching = own;
        void collaborative.attach(AbortSignal.any([signal, own.signal]));
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        if (deps.created !== undefined) collaborative.open();
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [],
                documents: true,
            })) {
                if (input.kind === "error") continue;
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    attach(active.signal);
                    continue;
                }
                if (input.kind !== "update") continue;
                const update = input.update;
                if (update.kind === "connected") {
                    if (update.streamId === undefined) collaborative.streamDisconnected();
                    else collaborative.streamConnected(update.streamId);
                    attach(active.signal);
                    continue;
                }
                if (update.kind === "disconnected") {
                    collaborative.streamDisconnected();
                    continue;
                }
                if (update.kind !== "document") continue;
                if (frameItemId(update.frame.data) !== itemId) continue;
                collaborative.frameReceive(update.frame);
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };

    const stop = (): void => {
        following?.abort();
        following = undefined;
        attaching?.abort();
        attaching = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
        collaborative.pause();
        publish();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        presenceUpdate(payload) {
            if (!disposed) collaborative.presenceUpdate(payload);
        },
        pointerPressUpdate(pressed) {
            if (!disposed) collaborative.pointerPressUpdate(pressed);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            stop();
            disposed = true;
            collaborative.dispose();
            listeners.clear();
        },
    };
}
