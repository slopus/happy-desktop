import * as Y from "yjs";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";

/** The least time between two changes sent for one document. */
const SEND_SPACING = 200;
/** The least time between two presence updates sent for one document. */
const PRESENCE_SPACING = 250;
/**
 * The most change bytes merged into one request, under the server's 1 MiB
 * bound on one change. A single change larger than this is still sent alone.
 */
const SEND_BATCH_BYTES = 768 * 1024;

/** Whether the reader's changes have reached the server. */
export type CollaborativeDocumentSyncState = "saved" | "saving" | "offline";

/** Someone else's window in the document, as its editor last described itself. */
export interface CollaborativeDocumentPresence {
    /** Names one window in this document; assigned by the server, opaque. */
    readonly clientKey: string;
    /** Rises with each update from that window. */
    readonly revision: number;
    readonly active: boolean;
    /** That editor's awareness update, base64; absent once the window has left. */
    readonly update?: string;
    /** That editor's awareness client, so its caret can be taken away when it leaves. */
    readonly awarenessClientId?: number;
}

/** The reader's own editor's awareness, to be relayed to everyone else in the document. */
export interface CollaborativeDocumentPresencePayload {
    readonly update: string;
    readonly awarenessClientId: number;
}

/**
 * One live frame for this document, with whatever names the document already
 * matched and taken off by its owner: the routes that address one are the
 * owner's, and so is the key its frames carry.
 */
export type CollaborativeDocumentFrame =
    | {
          readonly type: "document.update";
          readonly data: { readonly seq: number; readonly update: string };
      }
    | {
          readonly type: "document.presence";
          readonly data: {
              readonly clientKey: string;
              readonly revision: number;
              readonly active: boolean;
              readonly update?: string;
              readonly awarenessClientId?: number;
          };
      };

/**
 * How one collaborative document is reached. Every route answers what a
 * document Surface's route answers; only where it lives differs, so a Surface
 * and a handbook item's draft are carried by the same driver.
 */
export interface CollaborativeDocumentRoutes {
    /** The document whole, or only what a state vector lacks. */
    state(options: {
        readonly stateVector?: string;
        readonly signal: AbortSignal;
    }): Promise<{ readonly seq: number; readonly update: string }>;
    updateSend(
        request: { readonly mutationId: string; readonly update: string },
        signal: AbortSignal,
    ): Promise<unknown>;
    subscribe(streamId: string, signal: AbortSignal): Promise<unknown>;
    unsubscribe(streamId: string, signal: AbortSignal): Promise<unknown>;
    presenceSend(
        request: {
            readonly streamId: string;
            readonly awarenessClientId: number;
            readonly update: string;
        },
        signal: AbortSignal,
    ): Promise<unknown>;
    /** The HTTP status a route answered a failure with; undefined when it never answered. */
    status(error: unknown): number | undefined;
    /** A failure in words the reader can be shown. */
    userError(error: unknown): UserError;
}

/** The document once it has been read, open for writing. */
export interface CollaborativeDocumentLive {
    /**
     * The shared document itself. It is the CRDT everyone's changes merge
     * in: the editor writes to it directly, and the driver sends what is
     * written and applies what arrives. It stays the same object until the
     * server refuses a change, when it is replaced by what it holds.
     */
    readonly ydoc: Y.Doc;
    readonly sync: CollaborativeDocumentSyncState;
    /** Everyone else with the document open, by window. */
    readonly presence: readonly CollaborativeDocumentPresence[];
    /** The server refused a change, which was undone; cleared by the next one. */
    readonly failure?: UserError;
}

/**
 * The collaborative half of a document store. Its owner follows the
 * connection, tells the driver about streams and frames meant for this
 * document, and publishes a snapshot whenever `changed` is called.
 */
export interface CollaborativeDocumentSync {
    /** The document once read, or made here; undefined before. */
    live(): CollaborativeDocumentLive | undefined;
    /** The server says the document is gone. */
    missing(): boolean;
    /** Why the first read has not landed yet, while it is retried. */
    error(): UserError | undefined;
    /** The latest change seen from the stream or a read. */
    seq(): number;
    /** Made in this window: empty, and open for writing before the server has it. */
    open(): void;
    /** The connection's stream, which subscriptions name, is up. */
    streamConnected(streamId: string): void;
    /** The stream ended, and with it this document's subscription and presence. */
    streamDisconnected(): void;
    /** A live frame the owner matched to this document. */
    frameReceive(frame: CollaborativeDocumentFrame): void;
    /** Subscribes the current stream to the document, then catches up on it. */
    attach(signal: AbortSignal): Promise<void>;
    /** Ends the subscription, and with it this window's presence. */
    detach(): void;
    /** Drops the document altogether, as when a different server answers in another form. */
    reset(): void;
    presenceUpdate(payload: CollaborativeDocumentPresencePayload): void;
    pointerPressUpdate(pressed: boolean): void;
    /** Nobody reads it any more: the subscription ends and held changes are applied. */
    pause(): void;
    dispose(): void;
}

export interface CollaborativeDocumentSyncDeps {
    readonly routes: CollaborativeDocumentRoutes;
    /** Called whenever what `live`, `missing`, or `error` answer may have changed. */
    readonly changed: () => void;
    readonly now?: () => number;
    /**
     * Given for a document this window is still making: settles once the
     * server has it, rejected if it refused it. Sending and subscribing wait
     * for it.
     */
    readonly created?: Promise<void>;
}

/** The origin of every change this driver applies to the document from elsewhere. */
const REMOTE = Symbol("happy-collaborative-document-remote");

/** A change being sent, kept whole so a retry repeats it under the same mutation ID. */
interface Sending {
    readonly mutationId: string;
    readonly update: string;
}

function base64Encode(bytes: Uint8Array): string {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = (): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
        };
        const timer = setTimeout(done, milliseconds);
        signal.addEventListener("abort", done, { once: true });
    });
}

/**
 * One collaborative document, kept for the life of its owner.
 *
 * A collaborative document is one Yjs document. While something shows it, the
 * connection's event stream is subscribed to it, and every change anyone makes
 * arrives on that stream in order and is merged in; what the stream missed,
 * across a gap or a reconnect, is read as whatever the document here lacks.
 * The reader's own changes are written to the document by the editor and sent
 * from here: merged while one request is in flight, at most one request at a
 * time and no closer than 200 ms apart, each repeated under its mutation ID
 * until the server has it, whether or not the document is still on screen. A
 * change the server refuses cannot be taken back out of a CRDT, so the
 * document is replaced by what the server holds, and says so.
 *
 * The reader's editor describes its caret through `presenceUpdate`; that is
 * sent at most every 250 ms, and the editor itself renews it every 15 seconds
 * while it is open. Everyone else's arrives on the same stream.
 */
export function collaborativeDocumentSyncCreate(
    deps: CollaborativeDocumentSyncDeps,
): CollaborativeDocumentSync {
    const routes = deps.routes;
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const life = new AbortController();
    let disposed = false;
    let missing = false;
    let error: UserError | undefined;

    let ydoc: Y.Doc | undefined;
    /** Whether the document holds what the server had when it was first read. */
    let loaded = false;
    /** The latest change seen from the stream or a read; a frame past the next is a gap. */
    let seq = 0;
    /** The current connection's stream, while it is connected. */
    let streamId: string | undefined;
    /** The stream this document is subscribed on, once the server has said so. */
    let subscribed: string | undefined;
    /** The owner's following, which a read after a refusal belongs to. */
    let following: AbortSignal | undefined;
    const presence = new Map<string, CollaborativeDocumentPresence>();
    /** The reader's changes not yet in a request. */
    let pending: Uint8Array[] = [];
    let sending: Sending | undefined;
    let sendRunning = false;
    let sendAt = 0;
    /** The last request failed without an answer; the reader is offline until one arrives. */
    let sendFailing = false;
    let failure: UserError | undefined;
    let presenceLatest: CollaborativeDocumentPresencePayload | undefined;
    let presenceAt = 0;
    let presenceTimer: ReturnType<typeof setTimeout> | undefined;
    /** The reader's pointer is down in the document. */
    let pressed = false;
    /** Everyone else's changes that arrived while it was, for the document as it is now. */
    let held: Uint8Array[] = [];
    let live: CollaborativeDocumentLive | undefined;

    const notFound = (failed: unknown): boolean => routes.status(failed) === 404;
    /** The server answered and refused, as opposed to never answering or failing. */
    const refusal = (failed: unknown): boolean => {
        const status = routes.status(failed);
        return status !== undefined && status >= 400 && status < 500;
    };

    /** The same object while nothing it says has changed, so owners can compare by identity. */
    const liveOf = (): CollaborativeDocumentLive | undefined => {
        if (ydoc === undefined || !loaded) return undefined;
        const sync: CollaborativeDocumentSyncState =
            streamId === undefined || sendFailing
                ? "offline"
                : sending !== undefined || pending.length > 0
                  ? "saving"
                  : "saved";
        const entries = [...presence.values()];
        if (
            live !== undefined &&
            live.ydoc === ydoc &&
            live.sync === sync &&
            live.failure === failure &&
            live.presence.length === entries.length &&
            live.presence.every((entry, index) => entry === entries[index])
        )
            return live;
        live = {
            ydoc,
            sync,
            presence: entries,
            ...(failure === undefined ? {} : { failure }),
        };
        return live;
    };

    const changed = (): void => {
        if (!disposed) deps.changed();
    };

    const created = async (): Promise<boolean> => {
        if (deps.created === undefined) return true;
        try {
            await deps.created;
            return true;
        } catch {
            return false;
        }
    };

    const localChange = (update: Uint8Array, origin: unknown): void => {
        if (origin === REMOTE || disposed) return;
        pending.push(update);
        failure = undefined;
        changed();
        void sendRun();
    };

    const ydocCreate = (): Y.Doc => {
        const doc = new Y.Doc();
        doc.on("update", localChange);
        return doc;
    };

    /** Applies what the server sent, as everyone else's change, once the reader's pointer is up. */
    const remoteApply = (doc: Y.Doc, update: string): void => {
        if (pressed && doc === ydoc) held.push(base64Decode(update));
        else Y.applyUpdate(doc, base64Decode(update), REMOTE);
    };

    const heldRelease = (): void => {
        const updates = held;
        held = [];
        if (updates.length > 0 && ydoc !== undefined && !disposed)
            Y.applyUpdate(ydoc, Y.mergeUpdates(updates), REMOTE);
    };

    /**
     * Reads what the document here lacks and merges it in: the whole document
     * the first time. Answers false once the document turns out to be gone.
     */
    const catchUp = async (signal: AbortSignal): Promise<boolean> => {
        const doc = (ydoc ??= ydocCreate());
        const stateVector = loaded ? base64Encode(Y.encodeStateVector(doc)) : undefined;
        try {
            const state = await happyAgentSyncRead(
                signal,
                () =>
                    routes.state({
                        ...(stateVector === undefined ? {} : { stateVector }),
                        signal,
                    }),
                (readError) => {
                    if (notFound(readError)) throw readError;
                    if (!loaded) {
                        error = routes.userError(readError);
                        changed();
                    }
                },
            );
            if (signal.aborted || disposed || ydoc !== doc) return true;
            remoteApply(doc, state.update);
            seq = Math.max(seq, state.seq);
            loaded = true;
            error = undefined;
            changed();
            return true;
        } catch (readError) {
            if (notFound(readError)) {
                missing = true;
                changed();
                return false;
            }
            return true;
        }
    };

    const attach = async (signal: AbortSignal): Promise<void> => {
        following = signal;
        if (!(await created())) {
            missing = true;
            changed();
            return;
        }
        if (signal.aborted) return;
        const stream = streamId;
        if (stream !== undefined && subscribed !== stream) {
            const answered = await happyAgentSyncRead(
                signal,
                () => routes.subscribe(stream, signal),
                (subscribeError) => {
                    // A refusal is not asked again: a document that is gone is
                    // found by the read below, a stream that is gone is
                    // replaced by the next connection, and a document open in
                    // too many windows is still read, without live changes.
                    if (refusal(subscribeError) || streamId !== stream) throw subscribeError;
                },
            ).then(
                () => true,
                () => false,
            );
            if (signal.aborted) return;
            if (answered && streamId === stream) {
                subscribed = stream;
                // Said again on the new subscription, still no sooner than the pace allows.
                presenceSchedule();
            }
        }
        await catchUp(signal);
    };

    const detach = (): void => {
        const stream = subscribed;
        subscribed = undefined;
        presenceLatest = undefined;
        if (presenceTimer) clearTimeout(presenceTimer);
        presenceTimer = undefined;
        presence.clear();
        // Ending the subscription also ends this window's presence there.
        if (stream !== undefined && !disposed)
            void routes.unsubscribe(stream, life.signal).catch(() => undefined);
    };

    const sendRun = async (): Promise<void> => {
        if (sendRunning || disposed) return;
        sendRunning = true;
        try {
            if (!(await created())) {
                missing = true;
                changed();
                return;
            }
            let delay = 1_000;
            while (!disposed && (sending !== undefined || pending.length > 0)) {
                if (sending === undefined) {
                    let bytes = 0;
                    let count = 0;
                    while (
                        count < pending.length &&
                        (count === 0 || bytes + pending[count]!.length <= SEND_BATCH_BYTES)
                    ) {
                        bytes += pending[count]!.length;
                        count += 1;
                    }
                    const batch = pending.slice(0, count);
                    pending = pending.slice(count);
                    sending = {
                        mutationId: idCreate(),
                        update: base64Encode(
                            batch.length === 1 ? batch[0]! : Y.mergeUpdates(batch),
                        ),
                    };
                }
                const wait = sendAt + SEND_SPACING - now();
                if (wait > 0) await waitFor(wait, life.signal);
                if (disposed) return;
                sendAt = now();
                const request = sending;
                try {
                    await routes.updateSend(request, life.signal);
                    if (disposed) return;
                    sending = undefined;
                    sendFailing = false;
                    delay = 1_000;
                    changed();
                } catch (sendError) {
                    if (disposed || life.signal.aborted) return;
                    if (notFound(sendError)) {
                        missing = true;
                        sending = undefined;
                        pending = [];
                        changed();
                        return;
                    }
                    if (refusal(sendError)) {
                        // What was refused, and everything written over it,
                        // cannot be taken out of the document; it is read again.
                        sending = undefined;
                        pending = [];
                        failure = routes.userError(sendError);
                        ydocReplace();
                        return;
                    }
                    // Never answered, or the server failed: the same change,
                    // under the same mutation ID, once it can be heard again.
                    sendFailing = true;
                    changed();
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            sendRunning = false;
            // Written while the last run was ending, after it last looked.
            if (!disposed && !missing && pending.length > 0) void sendRun();
        }
    };

    /** Drops the document held here for what the server holds. */
    const ydocReplace = (): void => {
        const previous = ydoc;
        previous?.off("update", localChange);
        ydoc = ydocCreate();
        // The read below brings everything held for the old document.
        held = [];
        loaded = false;
        seq = 0;
        sendFailing = false;
        changed();
        previous?.destroy();
        const signal = following !== undefined && !following.aborted ? following : life.signal;
        void catchUp(signal);
    };

    const presenceSend = (): void => {
        presenceTimer = undefined;
        const payload = presenceLatest;
        const stream = subscribed;
        if (payload === undefined || stream === undefined || disposed) return;
        presenceAt = now();
        void routes
            .presenceSend(
                {
                    streamId: stream,
                    awarenessClientId: payload.awarenessClientId,
                    update: payload.update,
                },
                life.signal,
            )
            .catch(() => undefined);
    };

    const presenceSchedule = (): void => {
        if (presenceTimer !== undefined || subscribed === undefined) return;
        const wait = presenceAt + PRESENCE_SPACING - now();
        if (wait <= 0) presenceSend();
        else presenceTimer = setTimeout(presenceSend, wait);
    };

    return {
        live: liveOf,
        missing: () => missing,
        error: () => error,
        seq: () => seq,
        open() {
            if (ydoc !== undefined || disposed) return;
            ydoc = ydocCreate();
            loaded = true;
            changed();
        },
        streamConnected(next) {
            streamId = next;
            if (subscribed !== undefined && subscribed !== next) {
                // The old stream's subscription and presence ended with it.
                subscribed = undefined;
                presence.clear();
            }
            changed();
        },
        streamDisconnected() {
            streamId = undefined;
            subscribed = undefined;
            presence.clear();
            changed();
        },
        frameReceive(frame) {
            if (disposed) return;
            if (frame.type === "document.update") {
                // Applied even before the first read lands: Yjs holds a
                // change until what it builds on arrives, and the read may
                // have been taken before this change was made.
                const doc = (ydoc ??= ydocCreate());
                const gap = loaded && frame.data.seq > seq + 1;
                remoteApply(doc, frame.data.update);
                seq = Math.max(seq, frame.data.seq);
                // A change the stream skipped is read as whatever is missing.
                if (gap && following !== undefined && !following.aborted) void catchUp(following);
                changed();
                return;
            }
            const known = presence.get(frame.data.clientKey);
            if (known !== undefined && known.revision >= frame.data.revision) return;
            if (frame.data.active)
                presence.set(frame.data.clientKey, {
                    clientKey: frame.data.clientKey,
                    revision: frame.data.revision,
                    active: true,
                    ...(frame.data.update === undefined ? {} : { update: frame.data.update }),
                    ...(frame.data.awarenessClientId === undefined
                        ? {}
                        : { awarenessClientId: frame.data.awarenessClientId }),
                });
            else presence.delete(frame.data.clientKey);
            changed();
        },
        attach,
        detach,
        reset() {
            detach();
            ydoc?.off("update", localChange);
            ydoc?.destroy();
            ydoc = undefined;
            loaded = false;
            seq = 0;
            pending = [];
            held = [];
            sending = undefined;
            live = undefined;
        },
        presenceUpdate(payload) {
            if (disposed) return;
            presenceLatest = payload;
            presenceSchedule();
        },
        pointerPressUpdate(next) {
            if (disposed || pressed === next) return;
            pressed = next;
            if (!next) heldRelease();
        },
        pause() {
            following = undefined;
            detach();
            // Nobody is reading it, so no pointer is down in it.
            pressed = false;
            heldRelease();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            life.abort();
            if (presenceTimer) clearTimeout(presenceTimer);
            presenceTimer = undefined;
            ydoc?.off("update", localChange);
        },
    };
}
