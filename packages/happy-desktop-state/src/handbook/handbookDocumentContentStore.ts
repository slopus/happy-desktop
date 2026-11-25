import * as Y from "yjs";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { handbookFollowCreate } from "./handbookFollow.js";
import { HANDBOOK_UNREADABLE } from "./handbookMutate.js";
import { handbookDocumentStateRead } from "./handbookRead.js";

/** The least time between two changes sent for one document. */
const SEND_SPACING = 200;
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
           * pulls what others wrote. It stays the same object until the server
           * refuses a change, when it is replaced by what the server holds.
           */
          readonly ydoc: Y.Doc;
          readonly sync: HandbookDocumentContentSync;
          /** The server refused a change, which was undone; cleared by the next one. */
          readonly failure?: UserError;
      };

/**
 * One handbook document's collaborative text, kept for the life of the
 * connection.
 *
 * The constructor opens nothing. The first subscriber reads the whole
 * document; after that, every `handbook.document.updated` about it and every
 * reconnect reads what the document here lacks, by its state vector. Events
 * are only hints: what arrives is always what the server answers.
 *
 * The reader's changes are written to the document by the editor and sent
 * from here: merged while one request is in flight, at most one request at a
 * time and no closer than 200 ms apart, each repeated under its mutation ID
 * until the server has it, whether or not the document is still on screen.
 * A change the server refuses cannot be taken back out of a CRDT, so the
 * document is replaced by what the server holds, and says so. Changes made
 * while the reader may not edit, such as the editor's own setup, are never
 * sent.
 */
export interface HandbookDocumentContentStore {
    get(): HandbookDocumentContentSnapshot;
    subscribe(listener: () => void): () => void;
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
    let loaded = false;
    let pending: Uint8Array[] = [];
    let sending: Sending | undefined;
    let sendRunning = false;
    let sendAt = 0;
    let sendFailing = false;
    let failure: UserError | undefined;
    let pressed = false;
    let held: Uint8Array[] = [];
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
                ...(failure === undefined ? {} : { failure }),
            };
        return { documentId, status: "loading", ...(error === undefined ? {} : { error }) };
    };
    let snapshot = snapshotOf();

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
                    next.failure === previous.failure)) &&
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
        loaded = true;
        error = undefined;
        publish();
    };

    const follow = handbookFollowCreate({
        sync: deps.sync,
        events: ["handbook.document.updated"],
        concerns: (event) =>
            event.type === "handbook.document.updated" && event.documentId === documentId,
        read: pull,
        failed: (readError) => {
            if (loaded) return;
            // The first read is tried again until it lands; later ones wait for the next hint.
            error = happyAgentUserError(readError);
            publish();
            if (retry) clearTimeout(retry);
            retry = setTimeout(() => {
                retry = undefined;
                follow.load();
            }, 2_000);
        },
    });

    /** Drops the document held here for what the server holds. */
    const ydocReplace = (): void => {
        const previous = ydoc;
        previous?.off("update", localChange);
        ydoc = ydocCreate();
        held = [];
        loaded = false;
        sendFailing = false;
        publish();
        previous?.destroy();
        void pull().catch((readError: unknown) => {
            error = happyAgentUserError(readError);
            publish();
        });
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

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (listeners.size === 1) follow.start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size > 0) return;
                follow.stop();
                if (retry) clearTimeout(retry);
                retry = undefined;
                // Nobody is reading it, so no pointer is down in it.
                pressed = false;
                heldRelease();
            };
        },
        pointerPressUpdate(next) {
            if (disposed || pressed === next) return;
            pressed = next;
            if (!next) heldRelease();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            follow.stop();
            if (retry) clearTimeout(retry);
            disposed = true;
            life.abort();
            ydoc?.off("update", localChange);
            listeners.clear();
        },
    };
}
