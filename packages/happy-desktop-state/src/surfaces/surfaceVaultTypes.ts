/**
 * Closed product projections of a vault Surface: a shared tree of folders
 * and files, where a file is a plain file or an artifact (a small app named
 * `*.artifact`, shown without that suffix), each file keeping numbered versions under the vault's
 * retention policy. The wire shapes are projected at the state boundary in
 * `surfaceVaultProject.ts`.
 */

import type { HappyAgentArtifactPage } from "../artifacts/artifactViewerStore.js";
import type { HappyAgentArtifactPageMode } from "../artifacts/artifactPageMode.js";
import type { UserError } from "../types.js";
import type { HappyAgentSurfaceId, HappyAgentSurfacePerson } from "./surfaceTypes.js";

declare const happyAgentVaultItemIdBrand: unique symbol;

/** Branded identifier of a vault folder or file, unique across both (CUID2 on the wire). */
export type HappyAgentVaultItemId = string & { readonly [happyAgentVaultItemIdBrand]: true };

/**
 * Who made a change. `userId` is the person, `agentId` the agent that acted
 * for them through its tools; either may be `null`, and both are on a
 * standalone installation's own HTTP changes.
 */
export interface HappyAgentVaultActor {
    readonly userId: string | null;
    readonly agentId: string | null;
}

/** What an artifact is: an HTML app, or a Markdown document. */
export interface HappyAgentVaultArtifactSummary {
    readonly type: "html" | "markdown";
    readonly entry: "index.html" | "index.md";
    readonly fileCount: number;
}

interface HappyAgentVaultItemFields {
    readonly id: HappyAgentVaultItemId;
    readonly surfaceId: HappyAgentSurfaceId;
    /** The folder holding it, or `null` at the vault's root, which is not a folder. */
    readonly parentId: HappyAgentVaultItemId | null;
    readonly name: string;
    readonly createdAt: number;
    readonly createdBy: HappyAgentVaultActor;
    /** The latest change of any kind: content, rename, move, Trash, or restore. */
    readonly updatedAt: number;
    readonly updatedBy: HappyAgentVaultActor;
    /** When this item itself went to the Trash; items inside a deleted folder keep `null`. */
    readonly deletedAt: number | null;
    /** The resource version a change must name; unrelated to numbered versions. */
    readonly version: string;
}

/** A folder: it holds other items, may be empty, and has no versions. */
export type HappyAgentVaultFolder = HappyAgentVaultItemFields & { readonly kind: "folder" };

/** One node of the tree, a folder or a file. Its ID is its identity; its path follows its names. */
export type HappyAgentVaultItem =
    | HappyAgentVaultFolder
    | (HappyAgentVaultItemFields & {
          readonly kind: "file";
          readonly latestVersion: number;
          readonly size: number;
          readonly sha256: string;
          /** From the name's extension; `application/octet-stream` when unknown. */
          readonly mediaType: string;
      })
    | (HappyAgentVaultItemFields & {
          readonly kind: "artifact";
          readonly latestVersion: number;
          /** All of its newest version's files together. */
          readonly size: number;
          readonly artifact: HappyAgentVaultArtifactSummary;
      });

export type HappyAgentVaultItemKind = HappyAgentVaultItem["kind"];

/** A file with numbered versions: a plain file, or an artifact named `*.artifact`. */
export type HappyAgentVaultFile = Exclude<HappyAgentVaultItem, { readonly kind: "folder" }>;

/** One immutable content version; only `pinned` ever changes. */
export interface HappyAgentVaultVersion {
    readonly fileId: HappyAgentVaultItemId;
    readonly number: number;
    readonly size: number;
    /** The file's digest; `null` for an artifact version. */
    readonly sha256: string | null;
    /** The artifact's summary for an artifact version; `null` for a file. */
    readonly artifact: HappyAgentVaultArtifactSummary | null;
    /** Pinned versions are never pruned. */
    readonly pinned: boolean;
    /** The version whose content this one copied, when it was a restore. */
    readonly restoredFrom: number | null;
    readonly createdAt: number;
    readonly actor: HappyAgentVaultActor;
    /** Made through the app (`api`) or by an agent's tool (`tool`). */
    readonly source: "api" | "tool";
}

interface HappyAgentVaultActivityFields {
    readonly id: string;
    readonly itemId: HappyAgentVaultItemId;
    readonly at: number;
    readonly actor: HappyAgentVaultActor;
    readonly source: "api" | "tool";
}

/** One record of what happened to a folder or file, newest first in a history. */
export type HappyAgentVaultActivity =
    | (HappyAgentVaultActivityFields & {
          readonly kind: "created";
          readonly parentId: HappyAgentVaultItemId | null;
          readonly name: string;
          readonly copiedFrom: HappyAgentVaultItemId | null;
      })
    | (HappyAgentVaultActivityFields & {
          readonly kind: "moved";
          readonly fromParentId: HappyAgentVaultItemId | null;
          readonly toParentId: HappyAgentVaultItemId | null;
          readonly fromName: string;
          readonly toName: string;
      })
    | (HappyAgentVaultActivityFields & { readonly kind: "deleted" })
    | (HappyAgentVaultActivityFields & {
          readonly kind: "restored";
          readonly parentId: HappyAgentVaultItemId | null;
          readonly name: string;
      })
    | (HappyAgentVaultActivityFields & {
          readonly kind: "version_created";
          readonly number: number;
          readonly restoredFrom: number | null;
      })
    | (HappyAgentVaultActivityFields & {
          readonly kind: "pinned" | "unpinned";
          readonly number: number;
      })
    /** A kind of record this build does not know yet; shown as a change. */
    | (HappyAgentVaultActivityFields & { readonly kind: "changed" });

/** After `afterDays`, keep one version in every `everyDays`. */
export interface HappyAgentVaultRetentionTier {
    readonly afterDays: number;
    readonly everyDays: number;
}

/** Which earlier versions a vault keeps, and how long its Trash holds things. */
export interface HappyAgentVaultRetention {
    /** At most this many versions of each file, the newest included; `null` for no cap. */
    readonly maxVersions: number | null;
    /** Versions older than this many days are dropped; `null` keeps them however old. */
    readonly maxAgeDays: number | null;
    /** Every version younger than this many days is kept. */
    readonly keepAllDays: number;
    /** Up to 8 tiers in strictly increasing `afterDays`. */
    readonly thinning: readonly HappyAgentVaultRetentionTier[];
    /** Days a Trash item stays before it is removed for good; `null` keeps it. */
    readonly trashDays: number | null;
}

/** Where the browser is: a folder (the root is `null`), or the vault's Trash. */
export type HappyAgentVaultLocation =
    | { readonly kind: "folder"; readonly folderId: HappyAgentVaultItemId | null }
    | { readonly kind: "trash" };

/** One step of the breadcrumb, the root first. */
export interface HappyAgentVaultCrumb {
    /** `null` is the vault's root. */
    readonly id: HappyAgentVaultItemId | null;
    readonly name: string;
}

/** One Trash item: a deleted folder or file whose folders are all live, and where it was. */
export interface HappyAgentVaultTrashItem {
    readonly item: HappyAgentVaultItem;
    readonly path: string;
}

export type HappyAgentVaultTrash =
    | { readonly status: "loading" }
    | {
          readonly status: "ready";
          readonly items: readonly HappyAgentVaultTrashItem[];
      }
    | { readonly status: "failed"; readonly error: UserError };

/** One file this window is sending, from its first byte to its place in the vault. */
export type HappyAgentVaultUpload = {
    /** This window's own key for it. */
    readonly id: string;
    readonly name: string;
    /** What it becomes, by its name: a `.artifact` file is an artifact, anything else a file. */
    readonly kind: "file" | "artifact";
    /** The folder it goes into; `null` is the root. */
    readonly folderId: HappyAgentVaultItemId | null;
    readonly size: number;
    /** Bytes the Happy Agent has received. */
    readonly sent: number;
} & (
    | { readonly phase: "waiting" | "sending" | "placing" }
    /** It is in the vault: a new file, or a new version of the one that had its name. */
    | { readonly phase: "done"; readonly itemId: HappyAgentVaultItemId }
    /**
     * It stopped. `retryable` is whether sending it again could go otherwise:
     * not when the daemon refused the file itself, as it does a `.artifact`
     * that is not one.
     */
    | { readonly phase: "failed"; readonly error: UserError; readonly retryable: boolean }
);

/** What the preview shows for the version on screen. */
export type HappyAgentVaultContent =
    | { readonly type: "loading" }
    | { readonly type: "error"; readonly error: UserError }
    /** Served bytes an element renders from its address: a picture, a recording, a PDF. */
    | { readonly type: "url"; readonly url: string }
    /** A text file, decoded. */
    | { readonly type: "text"; readonly text: string }
    /** Nothing can be shown here; the file can still be downloaded. */
    | { readonly type: "unavailable"; readonly reason: "binary" | "large" }
    | {
          readonly type: "markdownArtifact";
          readonly entryPath: string;
          readonly text: string;
          /** Every file of the version by path, at the address it is served from. */
          readonly files: ReadonlyMap<string, string>;
      }
    | {
          readonly type: "htmlArtifact";
          readonly entryPath: string;
          readonly page: HappyAgentArtifactPage;
          readonly pageMode: HappyAgentArtifactPageMode;
      };

/** A file's versions and activity, newest first, read a page at a time. */
export type HappyAgentVaultHistory =
    | { readonly status: "loading" }
    | {
          readonly status: "ready";
          readonly versions: readonly HappyAgentVaultVersion[];
          readonly activity: readonly HappyAgentVaultActivity[];
          /** Older versions or activity remain to be read. */
          readonly hasMore: boolean;
          readonly loadingMore: boolean;
      }
    | { readonly status: "failed"; readonly error: UserError };

/** The file or artifact open beside the listing. */
export interface HappyAgentVaultPreview {
    readonly itemId: HappyAgentVaultItemId;
    /** The file as last known; absent once it is gone for good. */
    readonly file?: HappyAgentVaultFile;
    /** Where it is, `/Reports/summary.pdf`. */
    readonly path: string;
    readonly inTrash: boolean;
    /** The numbered version on screen; absent follows the newest as it changes. */
    readonly versionSelected?: number;
    /** The number of the version `content` shows, once it is known. */
    readonly versionShown?: number;
    readonly content: HappyAgentVaultContent;
    /** Which face of the pane is showing. */
    readonly panel: "preview" | "history";
    readonly history: HappyAgentVaultHistory;
}

/** The form open over the vault, if any; what is typed into it is the form's own. */
export type HappyAgentVaultDialog =
    | { readonly kind: "folderCreate" }
    /** `name` is the one the field starts from, as the reader sees it: an artifact's without `.artifact`. */
    | { readonly kind: "rename"; readonly itemId: HappyAgentVaultItemId; readonly name: string }
    /** Picks the folder an item moves into. */
    | { readonly kind: "move"; readonly itemId: HappyAgentVaultItemId }
    | { readonly kind: "settings" };

/** The vault's retention policy as the Happy Agent holds it, with this window's edit applied. */
export type HappyAgentVaultSettings =
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly retention: HappyAgentVaultRetention }
    | { readonly status: "failed"; readonly error: UserError };

/**
 * A file the reader can save: its name, and the address its bytes are served
 * from. A folder and an artifact are saved as a zip made on request.
 */
export interface HappyAgentVaultDownload {
    readonly fileName: string;
    readonly url: string;
}

export interface HappyAgentVaultSnapshot {
    readonly surfaceId: HappyAgentSurfaceId;
    /**
     * `loading` until the tree has been read once, and `missing` when the
     * Happy Agent has no such vault. A vault read before stays `ready` while
     * it is read again.
     */
    readonly status: "loading" | "ready" | "missing";
    /** The last read failed; what was held stays visible and the read is retried. */
    readonly error?: UserError;
    /** Every live folder and file by ID, with this window's own changes applied as they are made. */
    readonly items: ReadonlyMap<HappyAgentVaultItemId, HappyAgentVaultItem>;
    /**
     * Each live folder's children, folders first, then by name; `null` is the
     * root. A folder with nothing in it is absent.
     */
    readonly children: ReadonlyMap<HappyAgentVaultItemId | null, readonly HappyAgentVaultItem[]>;
    readonly location: HappyAgentVaultLocation;
    /** From the root to the folder shown; just the root in the Trash. */
    readonly crumbs: readonly HappyAgentVaultCrumb[];
    /** The folder's contents: its folders, then its files, each by name. */
    readonly listing: readonly HappyAgentVaultItem[];
    /** The item picked in the listing or the Trash. */
    readonly selectedId?: HappyAgentVaultItemId;
    /** Read while the Trash is shown. */
    readonly trash: HappyAgentVaultTrash;
    readonly preview?: HappyAgentVaultPreview;
    /** Unsaved text remains in this vault when the reader opens another item. */
    readonly textEdits?: ReadonlyMap<HappyAgentVaultItemId, HappyAgentVaultTextEdit>;
    /** Newest first; finished ones stay until dismissed. */
    readonly uploads: readonly HappyAgentVaultUpload[];
    readonly settings: HappyAgentVaultSettings;
    readonly dialog?: HappyAgentVaultDialog;
    /** The people the vault's history names, by user ID, as they are learned. */
    readonly people: ReadonlyMap<string, HappyAgentSurfacePerson>;
    /** The agents the vault's history names, by agent ID, as they are learned. */
    readonly agents: ReadonlyMap<string, string>;
    /** The last change the Happy Agent refused, until it is dismissed or another is made. */
    readonly failure?: UserError;
}

export type HappyAgentVaultTextEdit = {
    readonly baseVersion: string;
    readonly original: string;
    readonly draft: string;
} & (
    | { readonly status: "editing"; readonly error?: UserError }
    | { readonly status: "saving" }
    | { readonly status: "conflict" }
);

/** One file picked or dropped, with the folders it sat in when a folder was dropped. */
export interface HappyAgentVaultUploadFile {
    readonly file: File;
    /** `photos/2026/a.jpg` for a file inside a dropped folder; absent for a file on its own. */
    readonly relativePath?: string;
}
