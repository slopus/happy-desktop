import * as Y from "yjs";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { HANDBOOK_UNREADABLE } from "./handbookMutate.js";
import {
    handbookDocumentStateRead,
    handbookEventRead,
    handbookLiveFrameRead,
} from "./handbookRead.js";
import type { HandbookDocumentPresence, HandbookDocumentPresencePayload } from "./handbookTypes.js";

/** The least time between two changes sent for one document. */
const SEND_SPACING = 200;
/** The least time between two presence updates sent for one document. */
const PRESENCE_SPACING = 250;
/** The most change bytes merged into one request; a single larger change is still sent alone. */
const SEND_BATCH_BYTES = 768 * 1024;

/** Whether the reader's changes have reached the server. */
export type HandbookDocumentContentSync = "saved" | "saving" | "offline";

export type HandbookDocumentContentSnapshot =
    | {
          readonly documentId: string;
          /** Not read yet. A read that failed is tried again, and says why meanwhile. */
          readonly status: "loading";
          readonly error?: UserError;
      }
    | { readonly documentId: string; readonly status: "missing" }
    | {
          readonly documentId: string;
          readonly status: "live";
          /**
           * The shared document itself, the CRDT everyone's changes merge in:
           * the editor writes to it, and the store sends what is written and
           * applies what arrives. It stays the same object until the server
           * refuses a change, when it is replaced by what the server holds.
           */
          readonly ydoc: Y.Doc;
          readonly sync: HandbookDocumentContentSync;
          /** Everyone else with the document open, by window; empty where live editing is off. */
          readonly presence: readonly HandbookDocumentPresence[];
          /** The server refused a change, which was undone; cleared by the next one. */
          readonly failure?: UserError;
      };

/**
 * One handbook document's collaborative text, kept for the life of the
 * connection.
 *
 * The constructor opens nothing. While something shows it, the connection's
 * stream is subscribed to the document, and every change anyone makes
 * arrives on it in order and is merged in; one the stream skipped, across a
 * gap or a reconnect, is read as whatever the document here lacks, by its
 * state vector. Where the server does not serve live editing, the document is
 * read the same way on every `handbook.document.updated` about it instead.
 * Deleting a document silently ends its subscriptions, so any change to its
 * facts, a restore among them, subscribes again.
 *
 * The reader's changes are written to the document by the editor and sent
 * from here: merged while one request is in flight, at most one request at a
 * time and no closer than 200 ms apart, each repeated under its mutation ID
 * until the server has it, whether or not the document is still on screen.
 * A change the server refuses cannot be taken back out of a CRDT, so the
 * document is replaced by what the server holds, and says so. Changes made
 * while the reader may not edit, such as the editor's own setup, are never
 * sent.
 *
 * The reader's editor describes its caret through `presenceUpdate`; that is
 * sent at most every 250 ms, and the editor itself renews it every 15 seconds
 * while it is open. Everyone else's arrives on the same stream.
 */
export interface HandbookDocumentContentStore {
    get(): HandbookDocumentContentSnapshot;
    subscribe(listener: () => void): () => void;
    /** The reader's editor says where its caret is; everyone else is told, at a steady pace. */
    presenceUpdate(payload: HandbookDocumentPresencePayload): void;
    /**
     * The reader's pointer went down in the document, or came back up. While
     * it is down, everyone else's changes wait, so a click still placing the
     * caret is not undone by one arriving.
     */
    pointerPressUpdate(pressed: boolean): void;
    [Symbol.dispose](): void;
}

/** The origin of every change this store applies to the document from elsewhere. */
const REMOTE = Symbol("handbook-document-remote");

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

function refusalOf(error: unknown): HappyCloudRequestRefusal | undefined {
    return error instanceof HappyCloudRequestRefusal ? error : undefined;
}

export function handbookDocumentContentStoreCreate(deps: {
    readonly documentId: string;
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
    /** Whether the server, as last read, lets the reader edit this document. */
    readonly editable: () => boolean;
    readonly now?: () => number;
}): HandbookDocumentContentStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const documentId = deps.documentId;
    const path = `v0/handbook/documents/${encodeURIComponent(documentId)}`;
    const listeners = new Set<() => void>();
    const life = new AbortController();
    let disposed = false;

    let missing = false;
    let error: UserError | undefined;
    let ydoc: Y.Doc | undefined;
    /** Whether the document holds what the server had when it was first read. */
    let loaded = false;
    /** The latest change seen from the stream or a read; a frame past the next is a gap. */
    let seq = 0;
    let pending: Uint8Array[] = [];
    let sending: Sending | undefined;
    let sendRunning = false;
    let sendAt = 0;
    let sendFailing = false;
    let failure: UserError | undefined;
    let pressed = false;
    let held: Uint8Array[] = [];

    /** The current connection's stream, while it is connected. */
    let streamId: string | undefined;
    /** The stream this document is subscribed on, once the server has said so. */
    let subscribed: string | undefined;
    /** A stream the server would not subscribe, such as one where live editing is off. */
    let refusedOn: string | undefined;
    const presence = new Map<string, HandbookDocumentPresence>();
    let presenceLatest: HandbookDocumentPresencePayload | undefined;
    let presenceAt = 0;
    let presenceTimer: ReturnType<typeof setTimeout> | undefined;

    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const snapshotOf = (): HandbookDocumentContentSnapshot => {
        if (missing) return { documentId, status: "missing" };
        if (ydoc !== undefined && loaded)
            return {
                documentId,
                status: "live",
                ydoc,
                sync: sendFailing
                    ? "offline"
                    : sending !== undefined || pending.length > 0
                      ? "saving"
                      : "saved",
                presence: [...presence.values()],
                ...(failure === undefined ? {} : { failure }),
            };
        return { documentId, status: "loading", ...(error === undefined ? {} : { error }) };
    };
    let snapshot = snapshotOf();

    const publish = (): void => {
        if (disposed) return;
        const next = snapshotOf();
        const previous = snapshot;
        // The status line and the carets change far less often than the document does.
        if (next.status === "live" && previous.status === "live") {
            if (
                next.ydoc === previous.ydoc &&
                next.sync === previous.sync &&
                next.failure === previous.failure &&
                next.presence.length === previous.presence.length &&
                next.presence.every((entry, index) => entry === previous.presence[index])
            )
                return;
        } else if (
            next.status === previous.status &&
            (next.status !== "loading" ||
                (previous.status === "loading" && next.error === previous.error))
        )
            return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const localChange = (update: Uint8Array, origin: unknown): void => {
        if (origin === REMOTE || disposed) return;
        // The editor's own setup, or anything written while the reader may not edit.
        if (!loaded || !deps.editable()) return;
        pending.push(update);
        failure = undefined;
        publish();
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

    // ---- Reading what is missing ------------------------------------------

    /** Reads what the document here lacks and merges it in: the whole document the first time. */
    const pull = async (): Promise<void> => {
        const doc = (ydoc ??= ydocCreate());
        const query = loaded
            ? `?stateVector=${encodeURIComponent(base64Encode(Y.encodeStateVector(doc)))}`
            : "";
        let answer: unknown;
        try {
            answer = await deps.request("GET", `${path}/state${query}`);
        } catch (readError) {
            if (refusalOf(readError)?.status === 404) {
                missing = true;
                publish();
                return;
            }
            throw readError;
        }
        if (disposed || ydoc !== doc) return;
        const state = handbookDocumentStateRead(answer);
        if (!state) throw HANDBOOK_UNREADABLE;
        remoteApply(doc, state.update);
        seq = Math.max(seq, state.seq);
        loaded = true;
        error = undefined;
        publish();
    };

    let pulling = false;
    let pullAgain = false;
    /** Reads now, or once more after the read in flight; the first read is tried until it lands. */
    const pullRun = (): void => {
        if (disposed || missing) return;
        if (pulling) {
            pullAgain = true;
            return;
        }
        pulling = true;
        pullAgain = false;
        void pull()
            .catch((readError: unknown) => {
                if (loaded || disposed) return;
                error = happyAgentUserError(readError);
                publish();
                if (retry) clearTimeout(retry);
                retry = setTimeout(() => {
                    retry = undefined;
                    if (following) pullRun();
                }, 2_000);
            })
            .finally(() => {
                pulling = false;
                if (pullAgain) pullRun();
            });
    };

    // ---- Live editing ---------------------------------------------------

    const presenceSend = (): void => {
        presenceTimer = undefined;
        const payload = presenceLatest;
        const stream = subscribed;
        if (payload === undefined || stream === undefined || disposed) return;
        presenceAt = now();
        void deps
            .request("POST", `${path}/presence`, {
                streamId: stream,
                awarenessClientId: payload.awarenessClientId,
                update: payload.update,
            })
            .catch(() => undefined);
    };

    const presenceSchedule = (): void => {
        if (presenceTimer !== undefined || subscribed === undefined) return;
        const wait = presenceAt + PRESENCE_SPACING - now();
        if (wait <= 0) presenceSend();
        else presenceTimer = setTimeout(presenceSend, wait);
    };

    /** Subscribes the current stream to the document, then reads what it may have missed. */
    const attach = async (signal: AbortSignal): Promise<void> => {
        const stream = streamId;
        if (stream === undefined || subscribed === stream || refusedOn === stream) {
            pullRun();
            return;
        }
        let delay = 1_000;
        while (!signal.aborted && streamId === stream) {
            try {
                await deps.request("POST", `${path}/subscribe`, { streamId: stream });
                if (signal.aborted || streamId !== stream) return;
                subscribed = stream;
                // Said again on the new subscription, still no sooner than the pace allows.
                presenceSchedule();
                break;
            } catch (subscribeError) {
                if (signal.aborted) return;
                // Answered and refused: live editing is off here, or the stream
                // is gone. Not asked again on this stream; events still bring
                // the document current, and the next connection asks again.
                if (refusalOf(subscribeError) !== undefined) {
                    refusedOn = stream;
                    break;
                }
                await waitFor(delay, signal);
                delay = Math.min(delay * 2, 10_000);
            }
        }
        if (!signal.aborted) pullRun();
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
            void deps
                .request("POST", `${path}/unsubscribe`, { streamId: stream })
                .catch(() => undefined);
    };

    // ---- Sending --------------------------------------------------------

    /** Drops the document held here for what the server holds. */
    const ydocReplace = (): void => {
        const previous = ydoc;
        previous?.off("update", localChange);
        ydoc = ydocCreate();
        held = [];
        loaded = false;
        seq = 0;
        sendFailing = false;
        publish();
        previous?.destroy();
        pullRun();
    };

    const sendRun = async (): Promise<void> => {
        if (sendRunning || disposed) return;
        sendRunning = true;
        try {
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
                const body = sending;
                try {
                    await deps.request("POST", `${path}/changes`, body);
                    if (disposed) return;
                    sending = undefined;
                    sendFailing = false;
                    delay = 1_000;
                    publish();
                } catch (sendError) {
                    if (disposed) return;
                    const refusal = refusalOf(sendError);
                    if (refusal?.status === 404) {
                        missing = true;
                        sending = undefined;
                        pending = [];
                        publish();
                        return;
                    }
                    if (refusal !== undefined && refusal.status < 500) {
                        // What was refused, and everything written over it,
                        // cannot be taken out of the document; it is read again.
                        sending = undefined;
                        pending = [];
                        failure = happyAgentUserError(sendError);
                        ydocReplace();
                        return;
                    }
                    // Never answered, or the server failed: the same change,
                    // under the same mutation ID, once it can be heard again.
                    sendFailing = true;
                    publish();
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            sendRunning = false;
            if (!disposed && !missing && pending.length > 0) void sendRun();
        }
    };

    // ---- Following ------------------------------------------------------

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        const sync = deps.sync;
        if (sync)
            void (async () => {
                for await (const input of sync.follow({
                    signal: active.signal,
                    events: ["handbook.updated", "handbook.document.updated"],
                    documents: true,
                })) {
                    if (input.kind === "error") continue;
                    // A bootstrap or reconcile may have missed some.
                    if (input.kind !== "update") {
                        pullRun();
                        continue;
                    }
                    const update = input.update;
                    if (update.kind === "connected") {
                        if (subscribed !== undefined && subscribed !== update.streamId) {
                            // The old stream's subscription and presence ended with it.
                            subscribed = undefined;
                            presence.clear();
                            publish();
                        }
                        streamId = update.streamId;
                        void attach(active.signal);
                        continue;
                    }
                    if (update.kind === "disconnected") {
                        streamId = undefined;
                        subscribed = undefined;
                        presence.clear();
                        publish();
                        continue;
                    }
                    if (update.kind === "state_lost") {
                        pullRun();
                        continue;
                    }
                    if (update.kind === "document") {
                        // Frames reach this connection only for documents it
                        // subscribed, and may arrive before the subscription or
                        // the first read has answered; neither is waited for.
                        const frame = handbookLiveFrameRead(update.frame);
                        if (frame === undefined || frame.documentId !== documentId) continue;
                        if (frame.type === "update") {
                            // Applied even before the first read lands: Yjs holds a
                            // change until what it builds on arrives.
                            const doc = (ydoc ??= ydocCreate());
                            const gap = loaded && frame.seq > seq + 1;
                            remoteApply(doc, frame.update);
                            seq = Math.max(seq, frame.seq);
                            // A change the stream skipped is read as whatever is missing.
                            if (gap) pullRun();
                            continue;
                        }
                        const known = presence.get(frame.clientKey);
                        if (known !== undefined && known.revision >= frame.revision) continue;
                        if (frame.active)
                            presence.set(frame.clientKey, {
                                clientKey: frame.clientKey,
                                revision: frame.revision,
                                active: true,
                                ...(frame.update === undefined ? {} : { update: frame.update }),
                                ...(frame.awarenessClientId === undefined
                                    ? {}
                                    : { awarenessClientId: frame.awarenessClientId }),
                            });
                        else presence.delete(frame.clientKey);
                        publish();
                        continue;
                    }
                    if (update.kind !== "event") continue;
                    // Cloud events travel as the daemon's event envelope, typed by name.
                    const event = handbookEventRead(
                        update.event as { readonly type: string; readonly payload?: unknown },
                    );
                    if (event === undefined || event.type === "handbook.change_request.updated")
                        continue;
                    if (event.documentId !== documentId) continue;
                    if (event.type === "handbook.updated") {
                        // Deleting a document silently ends its subscriptions, and a
                        // restore needs a new one; any change to its facts asks again.
                        subscribed = undefined;
                        refusedOn = undefined;
                        void attach(active.signal);
                        continue;
                    }
                    // Live frames already brought it, unless this is past what they did.
                    if (subscribed !== undefined && event.seq <= seq) continue;
                    pullRun();
                }
            })()
                .catch(() => undefined)
                .finally(() => {
                    if (following === active) following = undefined;
                    if (!active.signal.aborted && !disposed && listeners.size > 0)
                        retry = setTimeout(start, 1_000);
                });
        pullRun();
    };

    const stop = (): void => {
        following?.abort();
        following = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
        detach();
        // Nobody is reading it, so no pointer is down in it.
        pressed = false;
        heldRelease();
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
            if (disposed) return;
            presenceLatest = payload;
            presenceSchedule();
        },
        pointerPressUpdate(next) {
            if (disposed || pressed === next) return;
            pressed = next;
            if (!next) heldRelease();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            stop();
            disposed = true;
            life.abort();
            ydoc?.off("update", localChange);
            listeners.clear();
        },
    };
}
