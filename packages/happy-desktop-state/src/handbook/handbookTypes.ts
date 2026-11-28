import type * as Y from "yjs";
import type { Loadable } from "../conversation/loadable.js";
import type {
    CollaborativeDocumentPresence,
    CollaborativeDocumentPresencePayload,
    CollaborativeDocumentSyncState,
} from "../documents/collaborativeDocumentSync.js";
import type { UserError } from "../types.js";

declare const happyAgentHandbookItemIdBrand: unique symbol;

/** One handbook item, as the server names it. */
export type HappyAgentHandbookItemId = string & { readonly [happyAgentHandbookItemIdBrand]: true };

declare const happyAgentHandbookFolderIdBrand: unique symbol;

/** One handbook folder, as the server names it. */
export type HappyAgentHandbookFolderId = string & {
    readonly [happyAgentHandbookFolderIdBrand]: true;
};

/** Folders nest at most this deep; a top-level folder is level 1. */
export const HAPPY_AGENT_HANDBOOK_FOLDER_DEPTH_MAX = 4;

/**
 * One folder of the handbook. Top-level folders are its categories. Folders
 * are organization, not content: creating, renaming and moving them takes
 * effect at once, with no apply, and agents are never told.
 */
export interface HappyAgentHandbookFolder {
    readonly id: HappyAgentHandbookFolderId;
    /** `null` for a top-level folder. */
    readonly parentId: HappyAgentHandbookFolderId | null;
    readonly name: string;
    /** The icon a top-level folder shows, from desktop's own set; opaque to the server. */
    readonly icon: string | null;
    /** Where it sorts among its siblings; presentation only. */
    readonly order: string;
    readonly createdBy: string;
    readonly createdAt: number;
    readonly updatedAt: number;
}

/** The revision agents follow now, and the draft change it publishes. */
export interface HappyAgentHandbookApplied {
    readonly revision: number;
    readonly seq: number;
    readonly appliedBy: string;
    readonly appliedAt: number;
}

/**
 * One document of the team's handbook. Its title, description and whether it
 * is always in context are draft state like its text: they reach agents with
 * the next apply.
 */
export interface HappyAgentHandbookItem {
    readonly id: HappyAgentHandbookItemId;
    readonly title: string;
    readonly description: string;
    readonly alwaysInContext: boolean;
    /** Where it sorts in the list; presentation only. */
    readonly order: string;
    /** The folder it lives in; `null` for the root. Moving it takes effect at once. */
    readonly folderId: HappyAgentHandbookFolderId | null;
    readonly createdBy: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly lastEditorUserId: string | null;
    /** The latest change to its draft. */
    readonly draftSeq: number;
    /** The draft or its metadata says something agents have not been given yet. */
    readonly pending: boolean;
    /** Whose edits are not applied yet. */
    readonly pendingUserIds: readonly string[];
    /** What agents follow now; `null` for an item never applied. */
    readonly applied: HappyAgentHandbookApplied | null;
}

/**
 * Two versions of an item's text, as Markdown, for the reader to compare. The
 * server serves versions, not diffs; the comparison is drawn where it is shown.
 */
export interface HappyAgentHandbookComparison {
    readonly before: string;
    readonly after: string;
}

/** One applied version of an item: what agents were given, by whom, and why. */
export interface HappyAgentHandbookRevision {
    readonly revision: number;
    /** The draft change it publishes. */
    readonly seq: number;
    readonly title: string;
    readonly description: string;
    readonly alwaysInContext: boolean;
    readonly appliedBy: string;
    readonly appliedAt: number;
    /** Whose edits it published. */
    readonly contributors: readonly string[];
    readonly changesetId: string;
    readonly note: string | null;
}

/**
 * A run of draft changes by one author with no pause over five minutes, as
 * the server grouped them. It never spans an apply.
 */
export interface HappyAgentHandbookSession {
    readonly fromSeq: number;
    readonly toSeq: number;
    readonly actor: { readonly userId: string | null; readonly agentId: string | null };
    readonly startedAt: number;
    readonly endedAt: number;
    readonly changes: number;
    /** The revision applied exactly at its end, when one was. */
    readonly appliedRevision: number | null;
}

/** What the reader may do with the handbook; everyone may read it. */
export interface HappyAgentHandbookAccess {
    /** Create items and edit drafts and metadata (`handbook.edit`). */
    readonly edit: boolean;
    /** Apply and remove items (`handbook.apply`). */
    readonly apply: boolean;
}

/** Metadata the reader typed that the server has not confirmed yet. */
export interface HappyAgentHandbookMetadataEdit {
    readonly title?: string;
    readonly description?: string;
    readonly alwaysInContext?: boolean;
    /** A change is on its way. */
    readonly saving: boolean;
    /** Why the server refused the last one; the typed value stays to be tried again. */
    readonly error?: UserError;
}

/** One metadata field an apply would publish with a new value. */
export type HappyAgentHandbookMetadataChange =
    | { readonly field: "title"; readonly from: string; readonly to: string }
    | { readonly field: "description"; readonly from: string; readonly to: string }
    | { readonly field: "alwaysInContext"; readonly from: boolean; readonly to: boolean };

/** One item in an apply review, as it stood when the review opened. */
export interface HappyAgentHandbookReviewItem {
    readonly itemId: HappyAgentHandbookItemId;
    readonly title: string;
    /**
     * The draft change the reader reviews; the apply publishes the draft as of
     * it. Read from the server as the review opens, so it is settled once
     * `comparison` is no longer loading.
     */
    readonly baseSeq: number;
    /** The revision agents follow now; `null` for an item never applied. */
    readonly applied: HappyAgentHandbookApplied | null;
    /** Whose edits this apply publishes. */
    readonly contributorIds: readonly string[];
    /** The applied text, and the draft as of `baseSeq`. */
    readonly comparison: Loadable<HappyAgentHandbookComparison>;
    /** Metadata the apply publishes with new values; empty for a new item, which has none before. */
    readonly metadata: Loadable<readonly HappyAgentHandbookMetadataChange[]>;
    /**
     * People still writing in the draft, or who wrote past `baseSeq` after the
     * review opened. What they write from here stays unapplied.
     */
    readonly editingUserIds: readonly string[];
    /** The draft has moved past `baseSeq` since the review opened. */
    readonly changedSinceOpened: boolean;
}

/** The apply review sheet, while it is open. */
export interface HappyAgentHandbookReview {
    readonly items: readonly HappyAgentHandbookReviewItem[];
    readonly note: string;
    readonly applying: boolean;
    /** Why the apply was refused, or did not reach the server. */
    readonly error?: UserError;
}

/** What a folder dialog makes or changes. */
export type HappyAgentHandbookFolderEditTarget =
    | { readonly kind: "create"; readonly parentId: HappyAgentHandbookFolderId | null }
    | { readonly kind: "edit"; readonly folderId: HappyAgentHandbookFolderId };

/** The dialog that names a new folder, or renames one, while it is open. */
export interface HappyAgentHandbookFolderEdit {
    readonly target: HappyAgentHandbookFolderEditTarget;
    readonly name: string;
    /** Shown only for a top-level folder. */
    readonly icon: string | null;
    readonly saving: boolean;
    /** Why the server refused it, such as a sibling with that name. */
    readonly error?: UserError;
}

/** What the "Move to…" picker moves. */
export type HappyAgentHandbookMoveTarget =
    | { readonly kind: "item"; readonly itemId: HappyAgentHandbookItemId }
    | { readonly kind: "folder"; readonly folderId: HappyAgentHandbookFolderId };

/** The "Move to…" picker, while it is open. */
export interface HappyAgentHandbookMove {
    readonly target: HappyAgentHandbookMoveTarget;
    /** The folder being moved into; `null` for the root. */
    readonly moving?: HappyAgentHandbookFolderId | null;
    readonly error?: UserError;
}

/** The handbook page: every folder and item in order, who may do what, and its dialogs. */
export interface HappyAgentHandbookSnapshot {
    /** `loading` until the first read lands. */
    readonly status: "loading" | "ready";
    /** Why the list could not be read; a later read clears it. */
    readonly error?: UserError;
    /** Every folder, in the server's order; siblings share a `parentId`. */
    readonly folders: readonly HappyAgentHandbookFolder[];
    /** Every item not removed, in the server's order. */
    readonly items: readonly HappyAgentHandbookItem[];
    /** What the reader typed in the home's search box; filtering it is the page's. */
    readonly search: string;
    readonly access: HappyAgentHandbookAccess;
    /** The reader's own user ID, once known. */
    readonly viewerId: string | null;
    /** Metadata typed here and not confirmed yet, by item. */
    readonly edits: ReadonlyMap<HappyAgentHandbookItemId, HappyAgentHandbookMetadataEdit>;
    /** The history panel is open beside the editor. */
    readonly historyOpen: boolean;
    readonly review?: HappyAgentHandbookReview;
    readonly folderEdit?: HappyAgentHandbookFolderEdit;
    readonly move?: HappyAgentHandbookMove;
    /**
     * Why the last item create, discard or remove, or folder delete, did not
     * happen. It stands until the reader dismisses it or tries another.
     */
    readonly failure?: UserError;
}

export interface HappyAgentHandbookStore {
    get(): HappyAgentHandbookSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Makes an empty item in a folder (`null` for the root) and answers its ID
     * once the server has it. A refusal rejects, and also stands in `failure`.
     */
    itemCreate(
        title: string,
        folderId: HappyAgentHandbookFolderId | null,
    ): Promise<HappyAgentHandbookItemId>;
    titleUpdate(itemId: HappyAgentHandbookItemId, value: string): void;
    descriptionUpdate(itemId: HappyAgentHandbookItemId, value: string): void;
    alwaysInContextUpdate(itemId: HappyAgentHandbookItemId, value: boolean): void;
    /**
     * Resets the item's draft to what agents follow, written as a new change.
     * A refusal stands in `failure`.
     */
    itemDiscard(itemId: HappyAgentHandbookItemId): void;
    /**
     * Takes the item out of the handbook; its history stays readable. Answers
     * whether it was removed; a refusal stands in `failure`.
     */
    itemRemove(itemId: HappyAgentHandbookItemId): Promise<boolean>;
    failureDismiss(): void;
    searchUpdate(value: string): void;
    /** Opens the dialog that names a new folder in `parentId` (`null` for a category). */
    folderCreateOpen(parentId: HappyAgentHandbookFolderId | null): void;
    /** Opens the dialog that renames a folder, and picks a category's icon. */
    folderEditOpen(folderId: HappyAgentHandbookFolderId): void;
    folderNameUpdate(value: string): void;
    folderIconUpdate(value: string | null): void;
    /** Creates or renames the folder; the dialog closes once the server has it. */
    folderSubmit(): void;
    folderEditClose(): void;
    /** Deletes an empty folder; a refusal stands in `failure`. */
    folderDelete(folderId: HappyAgentHandbookFolderId): void;
    moveOpen(target: HappyAgentHandbookMoveTarget): void;
    /** Moves the picker's target into a folder (`null` for the root); it closes once moved. */
    moveSubmit(folderId: HappyAgentHandbookFolderId | null): void;
    moveClose(): void;
    historyToggle(): void;
    /** Opens the review of these items, each at the draft change it holds now. */
    reviewOpen(itemIds: readonly HappyAgentHandbookItemId[]): void;
    reviewNoteUpdate(value: string): void;
    /** Applies every reviewed item as of its `baseSeq`; the sheet closes once it has. */
    reviewSubmit(): void;
    reviewClose(): void;
    /** One item's live draft, kept while this store lives. */
    draft(itemId: HappyAgentHandbookItemId): HappyAgentHandbookDraftStore;
    /** One item's history, kept while this store lives. */
    history(itemId: HappyAgentHandbookItemId): HappyAgentHandbookHistoryStore;
    [Symbol.dispose](): void;
}

export type HappyAgentHandbookDraftSync = CollaborativeDocumentSyncState;
export type HappyAgentHandbookDraftPresence = CollaborativeDocumentPresence;
export type HappyAgentHandbookDraftPresencePayload = CollaborativeDocumentPresencePayload;

/** One item's draft, written by everyone at once. */
export type HappyAgentHandbookDraftSnapshot =
    | {
          readonly itemId: HappyAgentHandbookItemId;
          /** Not read yet. A read that failed is retried, and says why meanwhile. */
          readonly status: "loading";
          readonly error?: UserError;
      }
    | { readonly itemId: HappyAgentHandbookItemId; readonly status: "missing" }
    | {
          readonly itemId: HappyAgentHandbookItemId;
          readonly status: "live";
          /** The shared document; the editor writes in it and everyone's changes merge in it. */
          readonly ydoc: Y.Doc;
          readonly sync: HappyAgentHandbookDraftSync;
          /** Everyone else with the draft open, by window. */
          readonly presence: readonly HappyAgentHandbookDraftPresence[];
          /** The server refused a change, which was undone; cleared by the next one. */
          readonly failure?: UserError;
      };

export interface HappyAgentHandbookDraftStore {
    get(): HappyAgentHandbookDraftSnapshot;
    subscribe(listener: () => void): () => void;
    presenceUpdate(payload: HappyAgentHandbookDraftPresencePayload): void;
    /** While the reader's pointer is down in the draft, everyone else's changes wait. */
    pointerPressUpdate(pressed: boolean): void;
    [Symbol.dispose](): void;
}

/** One row of an item's history: an applied revision, or a session of edits before one. */
export type HappyAgentHandbookHistoryEntry =
    | {
          readonly kind: "revision";
          readonly key: string;
          readonly revision: HappyAgentHandbookRevision;
      }
    | {
          readonly kind: "session";
          readonly key: string;
          readonly session: HappyAgentHandbookSession;
      };

/** One item's history, newest first: what was applied, and the edits between. */
export interface HappyAgentHandbookHistorySnapshot {
    readonly itemId: HappyAgentHandbookItemId;
    readonly status: "loading" | "ready";
    readonly error?: UserError;
    readonly entries: readonly HappyAgentHandbookHistoryEntry[];
    /** Older sessions remain to be read. */
    readonly more: boolean;
    readonly loadingMore: boolean;
    /** The text before and after each entry the reader opened, by entry key. */
    readonly expanded: ReadonlyMap<string, Loadable<HappyAgentHandbookComparison>>;
    /** The entry whose version is being written back into the draft. */
    readonly restoring?: string;
    readonly restoreError?: UserError;
}

export interface HappyAgentHandbookHistoryStore {
    get(): HappyAgentHandbookHistorySnapshot;
    subscribe(listener: () => void): () => void;
    sessionsMore(): void;
    /** Opens an entry to the text before and after it, or closes it. */
    entryToggle(key: string): void;
    /** Writes an entry's version into the draft as a new change. */
    entryRestore(key: string): void;
    [Symbol.dispose](): void;
}
