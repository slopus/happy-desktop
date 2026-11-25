import type {
    HandbookAbilities,
    HandbookCategory,
    HandbookChangeRequest,
    HandbookChangeRequestDetail,
    HandbookChangeRequestStatus,
    HandbookChangeRequestSummary,
    HandbookDocument,
    HandbookDocumentLiveFrame,
    HandbookEvent,
    HandbookRevision,
    HandbookRevisionKind,
    HandbookSummarySource,
} from "./handbookTypes.js";

/*
 * Readers for the cluster's handbook routes and events. Each takes what a
 * route answered and returns the typed value, or undefined when the answer is
 * not that shape. This file and `handbookTypes.ts` are the whole wire contract.
 */

type Fields = Record<string, unknown>;

function recordOf(value: unknown): Fields | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Fields)
        : undefined;
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads every entry of a list that is the right shape, dropping the rest. */
function listOf<T>(value: unknown, read: (entry: unknown) => T | undefined): T[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry: unknown) => {
        const item = read(entry);
        return item === undefined ? [] : [item];
    });
}

export function handbookCategoryRead(value: unknown): HandbookCategory | undefined {
    const category = recordOf(value);
    if (!category || typeof category.id !== "string") return undefined;
    return {
        id: category.id,
        name: textOrNull(category.name) ?? category.id,
        description: text(category.description),
        builtIn: category.builtIn === true,
        protected: category.protected === true,
    };
}

const SUMMARY_SOURCES: readonly HandbookSummarySource[] = ["team", "titles", "excerpt"];

export function handbookDocumentRead(value: unknown): HandbookDocument | undefined {
    const document = recordOf(value);
    const revision = numberOrNull(document?.revision);
    if (
        !document ||
        typeof document.id !== "string" ||
        typeof document.categoryId !== "string" ||
        revision === null
    )
        return undefined;
    const abilities = recordOf(document.abilities) ?? {};
    const summary = textOrNull(document.summary);
    return {
        id: document.id,
        title: text(document.title),
        slug: text(document.slug),
        path: text(document.path),
        categoryId: document.categoryId,
        authorUserId: text(document.authorUserId),
        maintainerUserId: text(document.maintainerUserId),
        summary,
        summarySource:
            summary === null
                ? null
                : (SUMMARY_SOURCES.find((source) => source === document.summarySource) ?? null),
        revision,
        seq: numberOrNull(document.seq) ?? 0,
        version: text(document.version),
        createdAt: numberOrNull(document.createdAt) ?? 0,
        updatedAt: numberOrNull(document.updatedAt) ?? 0,
        deletedAt: numberOrNull(document.deletedAt),
        openChangeRequests: numberOrNull(document.openChangeRequests) ?? 0,
        abilities: {
            edit: abilities.edit === true,
            editMetadata: abilities.editMetadata === true,
            manage: abilities.manage === true,
            propose: abilities.propose === true,
            merge: abilities.merge === true,
        },
    };
}

/** `GET /v0/handbook` → `{ categories, documents, abilities }`. */
export function handbookRead(answer: unknown):
    | {
          readonly categories: HandbookCategory[];
          readonly documents: HandbookDocument[];
          readonly abilities: HandbookAbilities;
      }
    | undefined {
    const handbook = recordOf(answer);
    if (!handbook || !Array.isArray(handbook.categories)) return undefined;
    const abilities = recordOf(handbook.abilities) ?? {};
    return {
        categories: listOf(handbook.categories, handbookCategoryRead),
        documents: listOf(handbook.documents, handbookDocumentRead),
        abilities: { create: abilities.create === true, manage: abilities.manage === true },
    };
}

/** `{ document }`, as creating, changing, deleting, and restoring one answer. */
export function handbookDocumentAnswerRead(answer: unknown): HandbookDocument | undefined {
    return handbookDocumentRead(recordOf(answer)?.document);
}

/** `GET /v0/handbook/documents/:id?revision=` → `{ document, text, seq }`. */
export function handbookDocumentTextRead(
    answer: unknown,
):
    | { readonly document: HandbookDocument; readonly text: string; readonly seq: number }
    | undefined {
    const page = recordOf(answer);
    const document = handbookDocumentRead(page?.document);
    if (!page || !document || typeof page.text !== "string") return undefined;
    return { document, text: page.text, seq: numberOrNull(page.seq) ?? document.seq };
}

/** `GET …/state` → `{ seq, update, stateVector }`, the update base64. */
export function handbookDocumentStateRead(
    answer: unknown,
): { readonly seq: number; readonly update: string } | undefined {
    const state = recordOf(answer);
    const seq = numberOrNull(state?.seq);
    if (!state || seq === null || typeof state.update !== "string") return undefined;
    return { seq, update: state.update };
}

const REVISION_KINDS: readonly HandbookRevisionKind[] = ["create", "edit", "changeRequest"];

function revisionRead(value: unknown): HandbookRevision | undefined {
    const revision = recordOf(value);
    const n = numberOrNull(revision?.n);
    const kind = REVISION_KINDS.find((entry) => entry === revision?.kind);
    if (!revision || n === null || !kind) return undefined;
    return {
        n,
        kind,
        actorUserId: textOrNull(revision.actorUserId),
        actorAgentId: textOrNull(revision.actorAgentId),
        changeRequestId: textOrNull(revision.changeRequestId),
        fromSeq: numberOrNull(revision.fromSeq) ?? 0,
        toSeq: numberOrNull(revision.toSeq) ?? 0,
        createdAt: numberOrNull(revision.createdAt) ?? 0,
        updatedAt: numberOrNull(revision.updatedAt) ?? 0,
    };
}

/** `GET …/revisions?before=` → `{ revisions, nextBefore }`, newest first. */
export function handbookRevisionsRead(answer: unknown): {
    readonly revisions: HandbookRevision[];
    readonly nextBefore: number | null;
} {
    const page = recordOf(answer);
    return {
        revisions: listOf(page?.revisions, revisionRead).sort((left, right) => right.n - left.n),
        nextBefore: numberOrNull(page?.nextBefore),
    };
}

const STATUSES: readonly HandbookChangeRequestStatus[] = [
    "open",
    "merged",
    "rejected",
    "withdrawn",
];

function statusRead(value: unknown): HandbookChangeRequestStatus | undefined {
    return STATUSES.find((status) => status === value);
}

function changeRequestSummaryRead(value: unknown): HandbookChangeRequestSummary | undefined {
    const request = recordOf(value);
    const status = statusRead(request?.status);
    if (!request || typeof request.id !== "string" || typeof request.documentId !== "string")
        return undefined;
    if (!status) return undefined;
    const abilities = recordOf(request.abilities) ?? {};
    return {
        id: request.id,
        documentId: request.documentId,
        title: text(request.title),
        status,
        baseSeq: numberOrNull(request.baseSeq) ?? 0,
        baseRevision: numberOrNull(request.baseRevision) ?? 0,
        authorUserId: text(request.authorUserId),
        authorAgentId: textOrNull(request.authorAgentId),
        createdAt: numberOrNull(request.createdAt) ?? 0,
        updatedAt: numberOrNull(request.updatedAt) ?? 0,
        resolvedAt: numberOrNull(request.resolvedAt),
        resolvedByUserId: textOrNull(request.resolvedByUserId),
        mergedRevision: numberOrNull(request.mergedRevision),
        mergedSeq: numberOrNull(request.mergedSeq),
        // A list of the blocks resolved, or their count.
        conflicts: Array.isArray(request.conflicts)
            ? request.conflicts.length
            : numberOrNull(request.conflicts),
        rejectReason: textOrNull(request.rejectReason),
        abilities: {
            edit: abilities.edit === true,
            withdraw: abilities.withdraw === true,
            merge: abilities.merge === true,
            reject: abilities.reject === true,
        },
    };
}

function changeRequestRead(value: unknown): HandbookChangeRequest | undefined {
    const summary = changeRequestSummaryRead(value);
    const request = recordOf(value);
    if (!summary || !request) return undefined;
    return { ...summary, description: text(request.description), text: text(request.text) };
}

/** `GET /v0/handbook/change-requests?…` → `{ changeRequests, nextCursor }`, newest first. */
export function handbookChangeRequestsRead(answer: unknown): {
    readonly changeRequests: HandbookChangeRequestSummary[];
    readonly nextCursor: string | null;
} {
    const page = recordOf(answer);
    return {
        changeRequests: listOf(page?.changeRequests, changeRequestSummaryRead),
        nextCursor: textOrNull(page?.nextCursor),
    };
}

/** `{ changeRequest }`, as creating, changing, merging, rejecting, and withdrawing one answer. */
export function handbookChangeRequestAnswerRead(
    answer: unknown,
): HandbookChangeRequest | undefined {
    return changeRequestRead(recordOf(answer)?.changeRequest);
}

/** `GET /v0/handbook/change-requests/:id` → `{ changeRequest, baseText, currentText, currentSeq, mergePreview }`. */
export function handbookChangeRequestDetailRead(
    answer: unknown,
): HandbookChangeRequestDetail | undefined {
    const page = recordOf(answer);
    const changeRequest = changeRequestRead(page?.changeRequest);
    if (!page || !changeRequest) return undefined;
    const preview = recordOf(page.mergePreview);
    return {
        changeRequest,
        baseText: text(page.baseText),
        currentText: text(page.currentText),
        currentSeq: numberOrNull(page.currentSeq) ?? 0,
        mergePreview:
            preview && typeof preview.text === "string"
                ? {
                      text: preview.text,
                      conflicts: Array.isArray(preview.conflicts)
                          ? preview.conflicts.length
                          : (numberOrNull(preview.conflicts) ?? 0),
                  }
                : null,
    };
}

/** One of the handbook's journal events, from its type and payload. */
export function handbookEventRead(event: {
    readonly type: string;
    readonly payload?: unknown;
}): HandbookEvent | undefined {
    const payload = recordOf(event.payload) ?? {};
    switch (event.type) {
        case "handbook.updated":
            return {
                type: event.type,
                documentId: textOrNull(payload.documentId),
                categoryId: textOrNull(payload.categoryId),
            };
        case "handbook.document.updated":
            return typeof payload.documentId === "string"
                ? {
                      type: event.type,
                      documentId: payload.documentId,
                      seq: numberOrNull(payload.seq) ?? 0,
                      revision: numberOrNull(payload.revision) ?? 0,
                  }
                : undefined;
        case "handbook.change_request.updated": {
            const status = statusRead(payload.status);
            return typeof payload.changeRequestId === "string" &&
                typeof payload.documentId === "string" &&
                status
                ? {
                      type: event.type,
                      changeRequestId: payload.changeRequestId,
                      documentId: payload.documentId,
                      status,
                  }
                : undefined;
        }
        default:
            return undefined;
    }
}

/**
 * A live frame on the stream, as `document.update` or `document.presence`,
 * when it is a handbook document's: it names a `documentId` and no Surface.
 */
export function handbookLiveFrameRead(frame: {
    readonly type: string;
    readonly data: unknown;
}): HandbookDocumentLiveFrame | undefined {
    const data = recordOf(frame.data);
    if (!data || typeof data.documentId !== "string" || data.surfaceId !== undefined)
        return undefined;
    if (frame.type === "document.update") {
        const seq = numberOrNull(data.seq);
        return seq !== null && typeof data.update === "string"
            ? { type: "update", documentId: data.documentId, seq, update: data.update }
            : undefined;
    }
    if (frame.type !== "document.presence") return undefined;
    const revision = numberOrNull(data.revision);
    if (typeof data.clientKey !== "string" || revision === null) return undefined;
    const awarenessClientId = numberOrNull(data.awarenessClientId);
    return {
        type: "presence",
        documentId: data.documentId,
        clientKey: data.clientKey,
        revision,
        active: data.active === true,
        ...(typeof data.update === "string" ? { update: data.update } : {}),
        ...(awarenessClientId === null ? {} : { awarenessClientId }),
    };
}
