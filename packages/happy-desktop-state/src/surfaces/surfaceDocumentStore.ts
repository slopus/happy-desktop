import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import type * as Y from "yjs";
import {
    collaborativeDocumentSyncCreate,
    type CollaborativeDocumentPresence,
    type CollaborativeDocumentPresencePayload,
    type CollaborativeDocumentSyncState,
} from "../documents/collaborativeDocumentSync.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import {
    HAPPY_AGENT_SURFACE_DOCUMENT_EVENT_TYPES,
    happyAgentSurfaceDocumentEventProject,
    happyAgentSurfaceDocumentProject,
    happyAgentVersionNewer,
} from "./surfaceProject.js";
import type { HappyAgentSurfaceDocument, HappyAgentSurfaceId } from "./surfaceTypes.js";

/** Whether the reader's changes have reached the Happy Agent. */
export type HappyAgentSurfaceDocumentSync = CollaborativeDocumentSyncState;

/** Someone else's window in the document, as its editor last described itself. */
export type HappyAgentSurfaceDocumentPresence = CollaborativeDocumentPresence;

/** The reader's own editor's awareness, to be relayed to everyone else in the document. */
export type HappyAgentSurfaceDocumentPresencePayload = CollaborativeDocumentPresencePayload;

export type HappyAgentSurfaceDocumentSnapshot =
    | {
          readonly surfaceId: HappyAgentSurfaceId;
          /** Not read yet. A read that failed is retried, and says why meanwhile. */
          readonly status: "loading";
          readonly error?: UserError;
      }
    | { readonly surfaceId: HappyAgentSurfaceId; readonly status: "missing" }
    | {
          readonly surfaceId: HappyAgentSurfaceId;
          /** A collaborative document, open for writing. */
          readonly status: "live";
          /**
           * The shared document itself. It is the CRDT everyone's changes merge
           * in: the editor writes to it directly, and the store sends what is
           * written and applies what arrives. It stays the same object until the
           * Happy Agent refuses a change, when it is replaced by what it holds.
           */
          readonly ydoc: Y.Doc;
          readonly sync: HappyAgentSurfaceDocumentSync;
          /** Everyone else with the document open, by window. */
          readonly presence: readonly HappyAgentSurfaceDocumentPresence[];
          /** The Happy Agent refused a change, which was undone; cleared by the next one. */
          readonly failure?: UserError;
          /** Made in this window, so the reader is about to write its first line. */
          readonly madeHere: boolean;
      }
    | {
          readonly surfaceId: HappyAgentSurfaceId;
          /**
           * A Happy Agent too old for collaborative documents: its Markdown,
           * shown as it is and kept current, but not written here.
           */
          readonly status: "readOnly";
          readonly text: string;
          readonly error?: UserError;
      };

export interface HappyAgentSurfaceDocumentStore {
    get(): HappyAgentSurfaceDocumentSnapshot;
    subscribe(listener: () => void): () => void;
    /** The reader's editor says where its caret is; everyone else is told, at a steady pace. */
    presenceUpdate(payload: HappyAgentSurfaceDocumentPresencePayload): void;
    /**
     * The reader's pointer went down in the document, or came back up. While
     * it is down, everyone else's changes wait: one arriving while a click is
     * still placing the caret would put back the caret from before the click.
     */
    pointerPressUpdate(pressed: boolean): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceDocumentDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "getHealth"
        | "getSurfaceDocument"
        | "getSurfaceDocumentState"
        | "sendSurfaceDocumentUpdate"
        | "subscribeSurfaceDocument"
        | "unsubscribeSurfaceDocument"
        | "sendSurfaceDocumentPresence"
    >;
    readonly sync: HappyAgentSync;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly now?: () => number;
    /**
     * Given for a document this window is still making: settles once the
     * daemon has it, rejected if it refused it. A document is only made here
     * when the Happy Agent serves collaborative documents, so it is open for
     * writing at once, empty; sending and subscribing wait for it.
     */
    readonly surfaceCreated?: Promise<void>;
}

function notFound(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status === 404;
}

/**
 * One document Surface, kept for the life of the connection.
 *
 * The constructor opens nothing. The first subscriber asks the Happy Agent's
 * health whether it serves collaborative documents, and asks again on every
 * new connection, since a different daemon may be answering.
 *
 * A collaborative document is carried by the shared collaborative document
 * driver, addressed by this Surface's routes and fed the live frames that
 * name it; see `collaborativeDocumentSyncCreate`.
 *
 * An older Happy Agent has the Markdown text only, which is shown read-only
 * and kept current from its `surface.document.updated` events.
 */
export function happyAgentSurfaceDocumentStoreCreate(
    deps: HappyAgentSurfaceDocumentDeps,
): HappyAgentSurfaceDocumentStore {
    const surfaceId = deps.surfaceId;
    const listeners = new Set<() => void>();
    let disposed = false;

    /** What this Happy Agent serves, once its health has said. */
    let mode: "collaborative" | "markdown" | undefined =
        deps.surfaceCreated === undefined ? undefined : "collaborative";
    let missing = false;
    let error: UserError | undefined;

    // Markdown.
    let markdown: HappyAgentSurfaceDocument | undefined;

    // Following.
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let health: AbortController | undefined;

    const snapshotOf = (): HappyAgentSurfaceDocumentSnapshot => {
        if (missing || (mode === "collaborative" && collaborative.missing()))
            return { surfaceId, status: "missing" };
        const live = mode === "collaborative" ? collaborative.live() : undefined;
        if (live !== undefined)
            return {
                surfaceId,
                status: "live",
                ydoc: live.ydoc,
                sync: live.sync,
                presence: live.presence,
                ...(live.failure === undefined ? {} : { failure: live.failure }),
                madeHere: deps.surfaceCreated !== undefined,
            };
        if (mode === "markdown" && markdown !== undefined)
            return {
                surfaceId,
                status: "readOnly",
                text: markdown.text,
                ...(error === undefined ? {} : { error }),
            };
        const reading = mode === "collaborative" ? collaborative.error() : error;
        return {
            surfaceId,
            status: "loading",
            ...(reading === undefined ? {} : { error: reading }),
        };
    };

    const publish = (): void => {
        if (disposed) return;
        const next = snapshotOf();
        const previous = snapshot;
        // The status line changes far less often than the document does.
        if (
            next.status === "live" &&
            previous.status === "live" &&
            next.ydoc === previous.ydoc &&
            next.sync === previous.sync &&
            next.failure === previous.failure &&
            next.presence === previous.presence
        )
            return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const collaborative = collaborativeDocumentSyncCreate({
        routes: {
            state: ({ stateVector, signal }) =>
                deps.client.getSurfaceDocumentState(surfaceId, {
                    ...(stateVector === undefined ? {} : { stateVector }),
                    signal,
                }),
            updateSend: (request, signal) =>
                deps.client.sendSurfaceDocumentUpdate(surfaceId, request, { signal }),
            subscribe: (streamId, signal) =>
                deps.client.subscribeSurfaceDocument(surfaceId, { streamId }, { signal }),
            unsubscribe: (streamId, signal) =>
                deps.client.unsubscribeSurfaceDocument(surfaceId, { streamId }, { signal }),
            presenceSend: (request, signal) =>
                deps.client.sendSurfaceDocumentPresence(surfaceId, request, { signal }),
            status: (failed) => (failed instanceof HappyAgentApiError ? failed.status : undefined),
            userError: happyAgentUserError,
        },
        changed: () => publish(),
        ...(deps.now === undefined ? {} : { now: deps.now }),
        ...(deps.surfaceCreated === undefined ? {} : { created: deps.surfaceCreated }),
    });
    let snapshot = snapshotOf();

    // ---- Markdown -------------------------------------------------------

    const markdownRead = async (signal: AbortSignal): Promise<void> => {
        try {
            const response = await happyAgentSyncRead(
                signal,
                () => deps.client.getSurfaceDocument(surfaceId, { signal }),
                (readError) => {
                    if (notFound(readError)) throw readError;
                    error = happyAgentUserError(readError);
                    publish();
                },
            );
            if (signal.aborted || mode !== "markdown") return;
            const document = happyAgentSurfaceDocumentProject(response.document);
            // An event may already have brought a later version than this read.
            if (
                markdown === undefined ||
                !happyAgentVersionNewer(markdown.version, document.version)
            )
                markdown = document;
            error = undefined;
            publish();
        } catch (readError) {
            if (notFound(readError) && !signal.aborted) {
                missing = true;
                publish();
            }
        }
    };

    // ---- Following ------------------------------------------------------

    /** Learns what this Happy Agent serves, then reads the document as that. */
    const modeCheck = (signal: AbortSignal): void => {
        health?.abort();
        const own = new AbortController();
        health = own;
        const checkSignal = AbortSignal.any([signal, own.signal]);
        void (async () => {
            // A document this window is making is collaborative; asking would
            // only delay writing in it.
            let next = mode;
            if (deps.surfaceCreated === undefined) {
                try {
                    const answer = await happyAgentSyncRead(
                        checkSignal,
                        () => deps.client.getHealth({ signal: checkSignal }),
                        () => undefined,
                    );
                    next =
                        answer.capabilities?.collaborativeDocuments === true
                            ? "collaborative"
                            : "markdown";
                } catch {
                    return;
                }
            }
            if (checkSignal.aborted || disposed) return;
            if (next !== mode) {
                // A different daemon answers now; what the last one held is
                // read again in the form this one serves.
                if (mode === "collaborative") collaborative.reset();
                markdown = undefined;
                mode = next;
                publish();
            }
            if (mode === "collaborative") await collaborative.attach(checkSignal);
            else await markdownRead(checkSignal);
        })();
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        // Made here: empty, and open for writing before the daemon has it.
        if (mode === "collaborative" && deps.surfaceCreated !== undefined) collaborative.open();
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...HAPPY_AGENT_SURFACE_DOCUMENT_EVENT_TYPES],
                documents: true,
            })) {
                if (input.kind === "error") continue;
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    modeCheck(active.signal);
                    continue;
                }
                if (input.kind !== "update") continue;
                const update = input.update;
                if (update.kind === "connected") {
                    if (update.streamId === undefined) collaborative.streamDisconnected();
                    else collaborative.streamConnected(update.streamId);
                    modeCheck(active.signal);
                    continue;
                }
                if (update.kind === "disconnected") {
                    collaborative.streamDisconnected();
                    continue;
                }
                if (update.kind === "document") {
                    // Frames reach this connection only for documents it
                    // subscribed, and can arrive before the subscription or
                    // the first read has answered; neither is waited for.
                    if (update.frame.data.surfaceId !== surfaceId || mode !== "collaborative")
                        continue;
                    collaborative.frameReceive(update.frame);
                    continue;
                }
                if (update.kind !== "event" || mode !== "markdown") continue;
                const event = happyAgentSurfaceDocumentEventProject(update.event);
                if (event === undefined || event.surfaceId !== surfaceId) continue;
                if (
                    markdown === undefined ||
                    !happyAgentVersionNewer(event.version, markdown.version)
                )
                    continue;
                markdown = {
                    ...markdown,
                    text: event.text,
                    lastEditorUserId: event.lastEditorUserId,
                    updatedAt: event.updatedAt,
                    version: event.version,
                };
                publish();
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
        health?.abort();
        health = undefined;
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
            if (disposed || mode !== "collaborative") return;
            collaborative.presenceUpdate(payload);
        },
        pointerPressUpdate(next) {
            if (disposed) return;
            collaborative.pointerPressUpdate(next);
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
