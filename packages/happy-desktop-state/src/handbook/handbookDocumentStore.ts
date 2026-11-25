import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { entitiesSettle } from "../happyAgentConnection/projection.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { deepEqual, happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { handbookFollowCreate } from "./handbookFollow.js";
import { HANDBOOK_UNREADABLE, handbookMutate } from "./handbookMutate.js";
import {
    handbookChangeRequestAnswerRead,
    handbookChangeRequestsRead,
    handbookDocumentAnswerRead,
    handbookDocumentTextRead,
    handbookRevisionsRead,
} from "./handbookRead.js";
import type {
    HandbookChangeRequestInput,
    HandbookChangeRequestSummary,
    HandbookDocument,
    HandbookRevision,
    HandbookRevisionText,
} from "./handbookTypes.js";

/** The document's versions, newest first, as far as they have been paged in. */
export interface HandbookRevisions {
    /** True until the first page answers. */
    readonly loading: boolean;
    readonly entries: readonly HandbookRevision[];
    /** Where the next older page starts; null when every revision is in. */
    readonly nextBefore: number | null;
    readonly loadingMore: boolean;
    readonly error?: UserError;
}

/** The document's change requests, newest first, whatever their status. */
export interface HandbookDocumentChangeRequests {
    /** True until the first answer. */
    readonly loading: boolean;
    readonly entries: readonly HandbookChangeRequestSummary[];
    readonly error?: UserError;
}

export interface HandbookDocumentSnapshot {
    readonly documentId: string;
    /** True until the first answer. */
    readonly loading: boolean;
    /** Null until read, and for a document the server does not have. */
    readonly document: HandbookDocument | null;
    /** The server answered that there is no such document. */
    readonly missing: boolean;
    /**
     * The document's Markdown as last read, and the collaborative position it
     * was read at: what a change request is proposed against.
     */
    readonly text: string;
    readonly seq: number;
    readonly revisions: HandbookRevisions;
    readonly changeRequests: HandbookDocumentChangeRequests;
    /** The revision whose Markdown is on screen; null shows the live document. */
    readonly revisionSelected: number | null;
    readonly revisionTexts: ReadonlyMap<number, HandbookRevisionText>;
    /** Why the last read failed; what is shown is the last one read. */
    readonly error?: UserError;
}

/**
 * One handbook document's page, apart from its collaborative text: its facts,
 * versions, and change requests, read again on every event about it. A
 * revision's Markdown is read once, since revisions are fixed once a later one
 * exists, and again while it is still the newest.
 *
 * The facts change through the promise actions, each sent with the version
 * the reader saw; a change made meanwhile by someone else is refused, its
 * answer taken in, and the reader is told.
 */
export interface HandbookDocumentStore {
    get(): HandbookDocumentSnapshot;
    subscribe(listener: () => void): () => void;
    titleSave(title: string): Promise<void>;
    categorySave(categoryId: string): Promise<void>;
    maintainerSave(userId: string): Promise<void>;
    /** Deletes the document; it can be restored. */
    documentDelete(): Promise<void>;
    documentRestore(): Promise<void>;
    /**
     * Proposes a change against the text as last read, and answers the
     * change request's ID once the server has it.
     */
    changeRequestCreate(input: HandbookChangeRequestInput): Promise<string>;
    /** Shows one revision's Markdown; null goes back to the live document. */
    revisionSelect(n: number | null): void;
    /** Reads the next older page of revisions. */
    revisionsMore(): void;
    [Symbol.dispose](): void;
}

const STALE = new UserError(
    "Someone changed this document while you were looking at it. Its newest details are shown now; try again.",
);

export function handbookDocumentStoreCreate(deps: {
    readonly documentId: string;
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
    readonly now?: () => number;
}): HandbookDocumentStore {
    const documentId = deps.documentId;
    const store = createStore<HandbookDocumentSnapshot>()(() => ({
        documentId,
        loading: true,
        document: null,
        missing: false,
        text: "",
        seq: 0,
        revisions: { loading: true, entries: [], nextBefore: null, loadingMore: false },
        changeRequests: { loading: true, entries: [] },
        revisionSelected: null,
        revisionTexts: new Map(),
    }));
    const path = `v0/handbook/documents/${encodeURIComponent(documentId)}`;
    const idCreate = cuid2Create(deps.now ?? Date.now);
    let disposed = false;
    let listeners = 0;
    let pagedPastFirst = false;

    /** Takes in the document as the server answered it, keeping the same object when unchanged. */
    const documentSet = (document: HandbookDocument): void => {
        const current = store.getState().document;
        if (current !== null && deepEqual(current, document)) return;
        store.setState({ document, missing: false });
    };

    const revisionTextSet = (n: number, text: HandbookRevisionText): void => {
        const revisionTexts = new Map(store.getState().revisionTexts);
        revisionTexts.set(n, text);
        store.setState({ revisionTexts });
    };

    const revisionTextRead = (n: number): void => {
        revisionTextSet(n, { state: "loading" });
        void deps.request("GET", `${path}?revision=${String(n)}`).then(
            (answer) => {
                if (disposed) return;
                const page = handbookDocumentTextRead(answer);
                revisionTextSet(
                    n,
                    page
                        ? { state: "loaded", text: page.text }
                        : { state: "failed", error: HANDBOOK_UNREADABLE },
                );
            },
            (error: unknown) => {
                if (!disposed)
                    revisionTextSet(n, { state: "failed", error: happyAgentUserError(error) });
            },
        );
    };

    const follow = handbookFollowCreate({
        sync: deps.sync,
        events: [
            "handbook.updated",
            "handbook.document.updated",
            "handbook.change_request.updated",
        ],
        concerns: (event) =>
            event.type === "handbook.updated"
                ? // A category change alone is the list's; the page names categories from it.
                  event.documentId === documentId ||
                  (event.documentId === null && event.categoryId === null)
                : event.documentId === documentId,
        read: async () => {
            let answers: readonly unknown[];
            try {
                answers = await Promise.all([
                    deps.request("GET", path),
                    deps.request("GET", `${path}/revisions`),
                    deps.request(
                        "GET",
                        `v0/handbook/change-requests?documentId=${encodeURIComponent(documentId)}&limit=100`,
                    ),
                ]);
            } catch (error) {
                if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                    if (!disposed)
                        store.setState({ loading: false, missing: true, document: null });
                    return;
                }
                throw error;
            }
            if (disposed) return;
            const page = handbookDocumentTextRead(answers[0]);
            if (!page) throw HANDBOOK_UNREADABLE;
            const revisions = handbookRevisionsRead(answers[1]);
            const requests = handbookChangeRequestsRead(answers[2]);
            const current = store.getState();
            const previousNewest = current.document?.revision;
            documentSet(page.document);
            const kept = pagedPastFirst
                ? current.revisions.entries.filter(
                      (entry) => !revisions.revisions.some((fresh) => fresh.n === entry.n),
                  )
                : [];
            const entries = [...revisions.revisions, ...kept].sort(
                (left, right) => right.n - left.n,
            );
            const { error: _cleared, ...rest } = store.getState();
            store.setState(
                {
                    ...rest,
                    loading: false,
                    text: page.text,
                    seq: page.seq,
                    revisions: {
                        loading: false,
                        loadingMore: current.revisions.loadingMore,
                        entries: revisionsSettle(current.revisions.entries, entries),
                        nextBefore: pagedPastFirst
                            ? current.revisions.nextBefore
                            : revisions.nextBefore,
                    },
                    changeRequests: {
                        loading: false,
                        entries: entitiesSettle(
                            current.changeRequests.entries,
                            requests.changeRequests,
                        ),
                    },
                },
                true,
            );
            // The newest revision grows while its actor keeps writing; one on screen is read again.
            const selected = store.getState().revisionSelected;
            if (
                selected !== null &&
                previousNewest !== undefined &&
                selected === previousNewest &&
                store.getState().revisionTexts.get(selected)?.state === "loaded"
            )
                revisionTextRead(selected);
        },
        failed: (error) => {
            store.setState({ loading: false, error: happyAgentUserError(error) });
        },
    });

    /** Sends a change to the document's facts with the version the reader saw. */
    const metadataSave = async (change: {
        readonly title?: string;
        readonly categoryId?: string;
        readonly maintainerUserId?: string;
    }): Promise<void> => {
        const document = store.getState().document;
        if (document === null) throw new UserError("This document hasn't been read yet.");
        let answer: unknown;
        try {
            answer = await handbookMutate(deps.request, "PATCH", path, change, {
                "if-match": document.version,
            });
        } catch (error) {
            if (error instanceof HappyCloudRequestRefusal && error.status === 409) {
                const fresh = handbookDocumentAnswerRead(error.body);
                if (fresh && !disposed) documentSet(fresh);
                follow.load();
                throw STALE;
            }
            throw error;
        }
        const fresh = handbookDocumentAnswerRead(answer);
        if (fresh && !disposed) documentSet(fresh);
        follow.load();
    };

    const lifecycle = async (method: "DELETE" | "POST", suffix: string): Promise<void> => {
        const answer = await handbookMutate(deps.request, method, `${path}${suffix}`);
        const fresh = handbookDocumentAnswerRead(answer);
        if (fresh && !disposed) documentSet(fresh);
        follow.load();
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            const unsubscribe = store.subscribe(listener);
            listeners += 1;
            if (listeners === 1 && !disposed) follow.start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners -= 1;
                if (listeners > 0) return;
                follow.stop();
                // Leaving the page goes back to the live document for the next visit.
                if (store.getState().revisionSelected !== null)
                    store.setState({ revisionSelected: null });
            };
        },
        titleSave: (title) => metadataSave({ title }),
        categorySave: (categoryId) => metadataSave({ categoryId }),
        maintainerSave: (maintainerUserId) => metadataSave({ maintainerUserId }),
        documentDelete: () => lifecycle("DELETE", ""),
        documentRestore: () => lifecycle("POST", "/restore"),
        async changeRequestCreate(input) {
            const current = store.getState();
            if (current.document === null)
                throw new UserError("This document hasn't been read yet.");
            const answer = await handbookMutate(deps.request, "POST", `${path}/change-requests`, {
                title: input.title,
                ...(input.description.trim() === "" ? {} : { description: input.description }),
                baseSeq: current.seq,
                text: input.text,
                mutationId: idCreate(),
            });
            const request = handbookChangeRequestAnswerRead(answer);
            if (!request) throw HANDBOOK_UNREADABLE;
            follow.load();
            return request.id;
        },
        revisionSelect(n) {
            if (disposed) return;
            const current = store.getState();
            if (n === current.revisionSelected) return;
            store.setState({ revisionSelected: n });
            if (n === null) return;
            const known = current.revisionTexts.get(n);
            if (known?.state === "loaded" || known?.state === "loading") return;
            revisionTextRead(n);
        },
        revisionsMore() {
            const revisions = store.getState().revisions;
            if (disposed || revisions.loadingMore || revisions.nextBefore === null) return;
            const before = revisions.nextBefore;
            store.setState({ revisions: { ...revisions, loadingMore: true } });
            void deps.request("GET", `${path}/revisions?before=${String(before)}`).then(
                (answer) => {
                    if (disposed) return;
                    const page = handbookRevisionsRead(answer);
                    const { error: _cleared, ...current } = store.getState().revisions;
                    const known = new Set(current.entries.map((entry) => entry.n));
                    pagedPastFirst = true;
                    store.setState({
                        revisions: {
                            ...current,
                            loadingMore: false,
                            entries: [
                                ...current.entries,
                                ...page.revisions.filter((entry) => !known.has(entry.n)),
                            ],
                            nextBefore: page.nextBefore,
                        },
                    });
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState({
                        revisions: {
                            ...store.getState().revisions,
                            loadingMore: false,
                            error: happyAgentUserError(error),
                        },
                    });
                },
            );
        },
        [Symbol.dispose]() {
            disposed = true;
            follow.stop();
        },
    };
}

/** `next`, keeping each revision that came back equal, and the previous list when all did. */
function revisionsSettle(
    previous: readonly HandbookRevision[],
    next: readonly HandbookRevision[],
): readonly HandbookRevision[] {
    const byNumber = new Map(previous.map((revision) => [revision.n, revision]));
    let changed = previous.length !== next.length;
    const settled = next.map((revision, index) => {
        const before = byNumber.get(revision.n);
        const kept = before !== undefined && deepEqual(before, revision) ? before : revision;
        if (kept !== previous[index]) changed = true;
        return kept;
    });
    return changed ? settled : previous;
}
