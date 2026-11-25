import type { UserError } from "../types.js";

/*
 * The team's handbook on Happy Cloud: documents people and agents edit
 * together, in categories, and change requests the server merges with
 * automatic conflict resolution. Every shape the cluster's `/v0/handbook`
 * routes answer with is read in `handbookRead.ts`, against these types, so a
 * change to that contract is one edit in each.
 */

/** A category documents are filed under. Built-in ones never change; admin bots manage the rest. */
export interface HandbookCategory {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly builtIn: boolean;
    /**
     * Content changes only through merged change requests, or directly by the
     * document's maintainer and people who manage the handbook.
     */
    readonly protected: boolean;
}

/** What the reader may do with one document, as the server decides. All but `manage` are off once it is deleted. */
export interface HandbookDocumentAbilities {
    /** May change its content now. */
    readonly edit: boolean;
    /** May change its title. */
    readonly editMetadata: boolean;
    /** May change its slug, maintainer, and category, and delete and restore it. */
    readonly manage: boolean;
    /** May open a change request. */
    readonly propose: boolean;
    /** May merge and reject its change requests. */
    readonly merge: boolean;
}

/** Who wrote a document's summary: the team's own model, the title model, or an excerpt. */
export type HandbookSummarySource = "team" | "titles" | "excerpt";

export interface HandbookDocument {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
    /** Where agents read it, `/handbook/<category>/<slug>.md`. */
    readonly path: string;
    readonly categoryId: string;
    /** Always a person. */
    readonly authorUserId: string;
    /** Always a person. */
    readonly maintainerUserId: string;
    /** Null until the server has written one. */
    readonly summary: string | null;
    readonly summarySource: HandbookSummarySource | null;
    /** The document's version number, v1, v2, … */
    readonly revision: number;
    /** Position in its collaborative log; a change request is proposed against one. */
    readonly seq: number;
    /** Opaque; sent back as `If-Match` with a metadata change. */
    readonly version: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly deletedAt: number | null;
    readonly openChangeRequests: number;
    readonly abilities: HandbookDocumentAbilities;
}

export interface HandbookAbilities {
    readonly create: boolean;
    readonly manage: boolean;
}

export type HandbookRevisionKind = "create" | "edit" | "changeRequest";

/** One version of a document: one actor's run of edits, or one merged change request. */
export interface HandbookRevision {
    readonly n: number;
    readonly kind: HandbookRevisionKind;
    readonly actorUserId: string | null;
    readonly actorAgentId: string | null;
    readonly changeRequestId: string | null;
    /** The collaborative log span it covers; its Markdown is the text at `toSeq`. */
    readonly fromSeq: number;
    readonly toSeq: number;
    readonly createdAt: number;
    readonly updatedAt: number;
}

export type HandbookChangeRequestStatus = "open" | "merged" | "rejected" | "withdrawn";

export interface HandbookChangeRequestAbilities {
    readonly edit: boolean;
    readonly withdraw: boolean;
    readonly merge: boolean;
    readonly reject: boolean;
}

/** A change request as lists hold it: without its description or text. */
export interface HandbookChangeRequestSummary {
    readonly id: string;
    readonly documentId: string;
    readonly title: string;
    readonly status: HandbookChangeRequestStatus;
    readonly baseSeq: number;
    readonly baseRevision: number;
    /** Always a person: the agent's member when an agent proposed it. */
    readonly authorUserId: string;
    readonly authorAgentId: string | null;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly resolvedAt: number | null;
    readonly resolvedByUserId: string | null;
    readonly mergedRevision: number | null;
    readonly mergedSeq: number | null;
    /** Blocks both sides changed, resolved automatically at merge; null until merged. */
    readonly conflicts: number | null;
    readonly rejectReason: string | null;
    readonly abilities: HandbookChangeRequestAbilities;
}

export interface HandbookChangeRequest extends HandbookChangeRequestSummary {
    /** Markdown. */
    readonly description: string;
    /** The proposed document, whole, as Markdown. */
    readonly text: string;
}

/** What merging an open change request now would make, and how many blocks it resolves itself. */
export interface HandbookMergePreview {
    readonly text: string;
    readonly conflicts: number;
}

/** A change request's page as the server answers it. */
export interface HandbookChangeRequestDetail {
    readonly changeRequest: HandbookChangeRequest;
    readonly baseText: string;
    readonly currentText: string;
    readonly currentSeq: number;
    readonly mergePreview: HandbookMergePreview | null;
}

/** A new document. Its maintainer defaults to the reader. */
export interface HandbookDocumentCreateInput {
    readonly title: string;
    readonly categoryId: string;
    readonly maintainerUserId?: string;
}

/** A proposed change to a document's text, or the author's change to their own open one. */
export interface HandbookChangeRequestInput {
    readonly title: string;
    /** Markdown; may be empty. */
    readonly description: string;
    /** The proposed document, whole, as Markdown. */
    readonly text: string;
}

/** One revision's text, as its page holds it: loading, read, or refused with the reason to show. */
export type HandbookRevisionText =
    | { readonly state: "loading" }
    | { readonly state: "loaded"; readonly text: string }
    | { readonly state: "failed"; readonly error: UserError };

/** The realtime events the handbook's surfaces follow. Each is a hint to read again. */
export type HandbookEvent =
    | {
          readonly type: "handbook.updated";
          readonly documentId: string | null;
          readonly categoryId: string | null;
      }
    | {
          readonly type: "handbook.document.updated";
          readonly documentId: string;
          readonly seq: number;
          readonly revision: number;
      }
    | {
          readonly type: "handbook.change_request.updated";
          readonly changeRequestId: string;
          readonly documentId: string;
          readonly status: HandbookChangeRequestStatus;
      };

/** Someone else's window in a handbook document, as its editor last described itself. */
export interface HandbookDocumentPresence {
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
export interface HandbookDocumentPresencePayload {
    readonly update: string;
    readonly awarenessClientId: number;
}

/**
 * A live frame for a handbook document this connection subscribed: a change
 * as it is made, or someone's caret. Never journaled; one the stream skipped
 * is read back by state vector.
 */
export type HandbookDocumentLiveFrame =
    | {
          readonly type: "update";
          readonly documentId: string;
          readonly seq: number;
          /** One Yjs update, base64. */
          readonly update: string;
      }
    | ({ readonly type: "presence"; readonly documentId: string } & HandbookDocumentPresence);
