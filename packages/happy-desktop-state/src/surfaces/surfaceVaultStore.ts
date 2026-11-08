import {
    HappyAgentApiError,
    type HappyAgentClient,
    vaultArtifactDownloadName,
    type VaultFile,
    type VaultFolder,
    type VaultItem,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { happyAgentVersionNewer } from "./surfaceProject.js";
import { happyAgentSurfacePeopleReaderCreate } from "./surfacePeople.js";
import type { HappyAgentSurfaceId, HappyAgentSurfacePerson } from "./surfaceTypes.js";
import {
    happyAgentVaultContentRead,
    type HappyAgentVaultContentDeps,
} from "./surfaceVaultContent.js";
import {
    HAPPY_AGENT_VAULT_EVENT_TYPES,
    happyAgentVaultActivityProject,
    happyAgentVaultFileChangesApply,
    happyAgentVaultFileProject,
    happyAgentVaultFolderChangesApply,
    happyAgentVaultFolderProject,
    happyAgentVaultItemProject,
    happyAgentVaultEventSurface,
    happyAgentVaultRetentionProject,
    happyAgentVaultRetentionWire,
    happyAgentVaultVersionProject,
    type HappyAgentVaultEvent,
} from "./surfaceVaultProject.js";
import { happyAgentVaultRetentionEqual } from "./surfaceVaultRetention.js";
import {
    vaultChildren,
    vaultContains,
    vaultCrumbs,
    vaultLive,
    happyAgentVaultArtifactNamed,
    happyAgentVaultNameProblem,
    happyAgentVaultNameShown,
    happyAgentVaultNameStored,
    vaultNameFree,
    vaultNameKey,
    vaultPath,
} from "./surfaceVaultTree.js";
import { happyAgentVaultUploadSend } from "./happyAgentVaultUploadSend.js";
import type {
    HappyAgentVaultActivity,
    HappyAgentVaultFile,
    HappyAgentVaultDialog,
    HappyAgentVaultDownload,
    HappyAgentVaultItem,
    HappyAgentVaultItemId,
    HappyAgentVaultRetention,
    HappyAgentVaultSnapshot,
    HappyAgentVaultUpload,
    HappyAgentVaultUploadFile,
    HappyAgentVaultVersion,
    HappyAgentVaultTextEdit,
} from "./surfaceVaultTypes.js";

export interface HappyAgentVaultStore {
    get(): HappyAgentVaultSnapshot;
    subscribe(listener: () => void): () => void;
    /** Shows a folder's contents; `null` is the root. Closes the preview. */
    folderOpen(folderId: HappyAgentVaultItemId | null): void;
    /** Shows the Trash. */
    trashShow(): void;
    /** Picks one item, or none. */
    itemSelect(itemId: HappyAgentVaultItemId | undefined): void;
    /**
     * Opens an item: a folder is shown, a file or an artifact opens in the
     * preview in its folder's place. An item in the Trash opens in the preview.
     * Asked before the vault is first read, it opens once it is.
     */
    itemOpen(itemId: HappyAgentVaultItemId): void;
    previewClose(): void;
    textEditStart(): void;
    textDraftUpdate(value: string): void;
    textEditDiscard(): void;
    textEditSave(): void;
    previewPanelUpdate(panel: "preview" | "history"): void;
    /** Shows one numbered version; the newest number, or none, follows the newest again. */
    previewVersionSelect(number: number | undefined): void;
    /** Reads the next page of the open item's versions and activity. */
    historyMoreLoad(): void;
    /** Makes an earlier version of the open item its newest, as a new version. */
    versionRestore(number: number): void;
    versionPinnedUpdate(number: number, pinned: boolean): void;
    dialogOpen(dialog: HappyAgentVaultDialog): void;
    dialogClose(): void;
    /** Makes a folder in the folder shown. */
    folderCreate(name: string): void;
    itemRename(itemId: HappyAgentVaultItemId, name: string): void;
    /** Moves an item into a folder; `null` is the root. A folder never goes inside itself. */
    itemMove(itemId: HappyAgentVaultItemId, folderId: HappyAgentVaultItemId | null): void;
    /** Moves an item, and everything in a folder, to the Trash. */
    itemDelete(itemId: HappyAgentVaultItemId): void;
    /** Brings a Trash item back where it was, or to the root when that folder is gone. */
    trashRestore(itemId: HappyAgentVaultItemId): void;
    /**
     * Sends files into a folder, `null` being the root, recreating the
     * folders of a dropped folder. A file whose name is taken there becomes
     * that file's new version. A `.artifact` file becomes an artifact, or
     * the new version of the artifact with its name.
     */
    filesUpload(
        folderId: HappyAgentVaultItemId | null,
        files: readonly HappyAgentVaultUploadFile[],
    ): void;
    /** Sends a failed upload again. */
    uploadRetry(uploadId: string): void;
    /** Takes a finished or failed upload off the list; one still sending is cancelled. */
    uploadDismiss(uploadId: string): void;
    retentionUpdate(retention: HappyAgentVaultRetention): void;
    failureDismiss(): void;
    /**
     * What saving an item downloads: a file version's bytes, an artifact
     * version or a folder as a zip. `version` defaults to the newest.
     */
    downloadOf(
        itemId: HappyAgentVaultItemId,
        version?: number,
    ): HappyAgentVaultDownload | undefined;
    /** The address of a picture's newest version, small enough to draw as a thumbnail. */
    thumbnailOf(entry: HappyAgentVaultItem): string | undefined;
    [Symbol.dispose](): void;
}

export interface HappyAgentVaultDeps {
    readonly client: HappyAgentVaultContentDeps["client"] &
        Pick<
            HappyAgentClient,
            | "endpoint"
            | "getUsers"
            | "getAgent"
            | "listVaultTree"
            | "getVaultFolder"
            | "getVaultFile"
            | "listVaultTrash"
            | "createVaultFolder"
            | "createVaultFile"
            | "updateVaultFolder"
            | "updateVaultFile"
            | "deleteVaultFolder"
            | "deleteVaultFile"
            | "restoreVaultFolder"
            | "restoreVaultFile"
            | "listVaultVersions"
            | "listVaultFileActivity"
            | "createVaultVersion"
            | "pinVaultVersion"
            | "unpinVaultVersion"
            | "getVaultSettings"
            | "updateVaultSettings"
            | "vaultArtifactZipUrl"
            | "vaultFolderZipUrl"
            | "createVaultUpload"
            | "uploadVaultChunk"
            | "getVaultUpload"
            | "cancelVaultUpload"
        >;
    readonly sync: HappyAgentSync;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly now?: () => number;
    /** Given for a vault this window is still making: reads and changes wait for it. */
    readonly surfaceCreated?: Promise<void>;
    /** Runs an artifact item's HTML version as a live app; absent shows it as a static page. */
    readonly appOpen?: HappyAgentVaultContentDeps["appOpen"];
}

/** How many versions and activity records one history read asks for. */
const HISTORY_PAGE = 50;
/** How often one change is re-sent after the item moved on under it before it gives up. */
const CONFLICT_RETRIES = 3;
/** The largest picture drawn as a thumbnail from its own bytes. */
const THUMBNAIL_MAX_BYTES = 16 * 1024 * 1024;
/** The root's name in the breadcrumb; the page names it after the vault. */
const ROOT_NAME = "Vault";

const NO_ENTRIES: ReadonlyMap<HappyAgentVaultItemId, HappyAgentVaultItem> = new Map();
const NO_CHILDREN: ReadonlyMap<HappyAgentVaultItemId | null, readonly HappyAgentVaultItem[]> =
    new Map();
const NO_PEOPLE: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map();
const NO_AGENTS: ReadonlyMap<string, string> = new Map();

/** One change this window asked for, held over the tree until the Happy Agent answers. */
type VaultOp =
    | {
          readonly kind: "create";
          readonly itemId: HappyAgentVaultItemId;
          readonly parentId: HappyAgentVaultItemId | null;
          readonly name: string;
          readonly at: number;
      }
    | {
          readonly kind: "move";
          readonly itemId: HappyAgentVaultItemId;
          readonly parentId: HappyAgentVaultItemId | null;
          readonly name: string;
      }
    | { readonly kind: "delete"; readonly itemId: HappyAgentVaultItemId; readonly at: number };

interface QueuedOp {
    op: VaultOp;
    /** One idempotency key for every attempt of this change. */
    readonly mutationId: string;
    sent: boolean;
    conflicts: number;
    /** Told whether the Happy Agent took the change. */
    readonly settle: (taken: boolean) => void;
}

/** One upload, with what only this store needs: the bytes, and where it stands. */
interface UploadRecord {
    view: HappyAgentVaultUpload;
    readonly file: File;
    /** The folders between the drop's folder and the file, for a dropped folder. */
    readonly folders: readonly string[];
    /** The Happy Agent's upload, once it has one. */
    uploadId?: string;
    /** The item a new file is made as, so a repeated placement makes it once. */
    readonly itemId: HappyAgentVaultItemId;
    readonly mutationId: string;
    /**
     * The upload as one operation: every attempt at making it a new version,
     * a retry with a fresh upload included, carries it, so the Happy Agent
     * makes that version once and answers a repeat with its first answer.
     */
    readonly operationId: string;
    controller: AbortController;
}

function opApply(
    entry: HappyAgentVaultItem | undefined,
    op: VaultOp,
): HappyAgentVaultItem | undefined {
    if (entry === undefined) return undefined;
    if (op.kind === "move")
        return entry.name === op.name && entry.parentId === op.parentId
            ? entry
            : { ...entry, name: op.name, parentId: op.parentId };
    if (op.kind === "delete")
        return entry.deletedAt === null ? { ...entry, deletedAt: op.at } : entry;
    return entry;
}

function apiCode(error: unknown): string | undefined {
    return error instanceof HappyAgentApiError ? (error.code ?? undefined) : undefined;
}

/**
 * The folder or file a `409 conflict` carries as it now is. A `name_taken`
 * carries the sibling as `item` instead, which is not this one.
 */
function conflictItem(error: unknown): HappyAgentVaultItem | undefined {
    if (!(error instanceof HappyAgentApiError) || error.status !== 409) return undefined;
    if (error.code === "name_taken") return undefined;
    const folder = error.body?.["folder"];
    if (typeof folder === "object" && folder !== null)
        return happyAgentVaultFolderProject(folder as VaultFolder);
    const file = error.body?.["file"];
    if (typeof file === "object" && file !== null)
        return happyAgentVaultFileProject(file as VaultFile);
    return undefined;
}

/** The sibling a `409 name_taken` names, holding the name asked for. */
function nameTakenItem(error: unknown): HappyAgentVaultItem | undefined {
    if (!(error instanceof HappyAgentApiError) || error.code !== "name_taken") return undefined;
    const item = error.body?.["item"];
    return typeof item === "object" && item !== null
        ? happyAgentVaultItemProject(item as VaultItem)
        : undefined;
}

function notFound(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status === 404;
}

function refused(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status >= 400 && error.status < 500;
}

/** A refusal that says "not now" rather than "not this": a timeout, a conflict, or too many requests. */
function retryableRefusal(error: unknown): boolean {
    return (
        error instanceof HappyAgentApiError &&
        (error.status === 408 || error.status === 409 || error.status === 429)
    );
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

/** Versions newest first: the fresh first page, then older ones held from before it. */
function versionsMerge(
    fresh: readonly HappyAgentVaultVersion[],
    held: readonly HappyAgentVaultVersion[],
    complete: boolean,
): readonly HappyAgentVaultVersion[] {
    if (complete) return fresh;
    const oldest = fresh.at(-1)?.number ?? Infinity;
    return [...fresh, ...held.filter((version) => version.number < oldest)];
}

function activityMerge(
    fresh: readonly HappyAgentVaultActivity[],
    held: readonly HappyAgentVaultActivity[],
): readonly HappyAgentVaultActivity[] {
    const byId = new Map(held.map((activity) => [activity.id, activity]));
    for (const activity of fresh) byId.set(activity.id, activity);
    return [...byId.values()].sort((left, right) => (left.id < right.id ? 1 : -1));
}

/** What a dropped folder's relative path says: the folders above the file. */
function foldersOf(relativePath: string | undefined): readonly string[] {
    if (relativePath === undefined) return [];
    const segments = relativePath.split("/").filter((segment) => segment.length > 0);
    return segments.slice(0, -1);
}

/**
 * One vault Surface, kept live while something shows it.
 *
 * The constructor opens nothing. The first subscriber follows `vault.*`
 * events and reads the whole live tree, page by page, and the settings. The
 * tree is held in full: the browser, the tree, the breadcrumb, and every path
 * are drawn from it, and a folder in the Trash keeps its contents known so
 * restoring it brings them back without a read. A folder restored from the
 * Trash whose contents were never read here reads the tree again.
 *
 * Renames, moves, new folders, and deletions apply at once and are held over
 * the Happy Agent's tree until it answers, sent one at a time with the
 * item's version as `If-Match`. An item that moved on meanwhile is adopted
 * from the conflict and the change is sent again only if it still changes
 * anything. A request that never arrived is retried under the same mutation
 * ID; one that was refused is dropped and the refusal is stated.
 *
 * Uploads run one at a time: their bytes as a resumable upload, then placed
 * in their folder as a new file, or as a new version of the file that has
 * their name there. Pending changes and uploads go on whether or not the
 * vault is still on screen.
 *
 * Events are delivery hints applied by version chain. One that arrives while
 * the tree is being read is replayed onto its answer, and a broken chain
 * reads that one item again.
 */
export function happyAgentVaultStoreCreate(deps: HappyAgentVaultDeps): HappyAgentVaultStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const { client, surfaceId } = deps;
    const listeners = new Set<() => void>();
    const life = new AbortController();
    /** The Happy Agent's items as last read or confirmed, live or in the Trash. */
    let authoritative = new Map<HappyAgentVaultItemId, HappyAgentVaultItem>();
    let queue: QueuedOp[] = [];
    let queueRunning = false;
    let uploads: UploadRecord[] = [];
    let uploadsRunning = false;
    let settingsVersion: string | undefined;
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reads = new AbortController();
    let readsInFlight = 0;
    let readLatest = 0;
    let journal: HappyAgentVaultEvent[] = [];
    let failed = false;
    let disposed = false;
    /** The content on screen, the version it is for, and what to let go of with it. */
    let contentKey: string | undefined;
    let contentRead: AbortController | undefined;
    let contentRelease: (() => void) | undefined;
    let historyRead: AbortController | undefined;
    let historyCursors: { versions: string | null; activity: string | null } = {
        versions: null,
        activity: null,
    };
    let trashTimer: ReturnType<typeof setTimeout> | undefined;
    let trashRead: AbortController | undefined;
    /** An item asked to open before the tree was first read, opened once it is. */
    let openWaiting: HappyAgentVaultItemId | undefined;
    const agentsAsked = new Set<string>();

    let snapshot: HappyAgentVaultSnapshot = {
        surfaceId,
        status: "loading",
        items: NO_ENTRIES,
        children: NO_CHILDREN,
        location: { kind: "folder", folderId: null },
        crumbs: [{ id: null, name: ROOT_NAME }],
        listing: [],
        trash: { status: "loading" },
        uploads: [],
        settings: { status: "loading" },
        people: NO_PEOPLE,
        agents: NO_AGENTS,
    };

    const notify = (): void => {
        for (const listener of listeners) listener();
    };

    const people = happyAgentSurfacePeopleReaderCreate({
        client,
        signal: life.signal,
        read(read) {
            if (disposed) return;
            snapshot = { ...snapshot, people: new Map([...snapshot.people, ...read]) };
            notify();
        },
    });

    /** Names everyone the given changes credit, people and agents alike. */
    const actorsRequest = (actors: Iterable<{ userId: string | null; agentId: string | null }>) => {
        const userIds: (string | null)[] = [];
        for (const actor of actors) {
            userIds.push(actor.userId);
            const agentId = actor.agentId;
            if (agentId === null || agentsAsked.has(agentId)) continue;
            agentsAsked.add(agentId);
            void client.getAgent(agentId, { signal: life.signal }).then(
                ({ agent }) => {
                    const title = agent.title?.trim();
                    if (disposed || !title) return;
                    snapshot = {
                        ...snapshot,
                        agents: new Map(snapshot.agents).set(agentId, title),
                    };
                    notify();
                },
                () => undefined,
            );
        }
        people.request(userIds);
    };

    /** The Happy Agent's items with every pending change applied, in order. */
    const projected = (): ReadonlyMap<HappyAgentVaultItemId, HappyAgentVaultItem> => {
        if (queue.length === 0) return authoritative;
        const items = new Map(authoritative);
        for (const { op } of queue) {
            if (op.kind === "create") {
                if (items.has(op.itemId)) continue;
                const actor = { userId: null, agentId: null };
                items.set(op.itemId, {
                    id: op.itemId,
                    surfaceId,
                    parentId: op.parentId,
                    name: op.name,
                    kind: "folder",
                    createdAt: op.at,
                    createdBy: actor,
                    updatedAt: op.at,
                    updatedBy: actor,
                    deletedAt: null,
                    version: "",
                });
                continue;
            }
            const next = opApply(items.get(op.itemId), op);
            if (next !== undefined) items.set(op.itemId, next);
        }
        return items;
    };

    /** The item a preview or a download names, wherever this store has seen it. */
    const contentEntryOf = (itemId: HappyAgentVaultItemId): HappyAgentVaultFile | undefined => {
        const entry =
            projected().get(itemId) ??
            (snapshot.trash.status === "ready"
                ? snapshot.trash.items.find((held) => held.item.id === itemId)?.item
                : undefined) ??
            snapshot.preview?.file;
        return entry === undefined || entry.kind === "folder" || entry.id !== itemId
            ? undefined
            : entry;
    };

    /** Recomputes everything drawn from the tree, then the preview, and tells subscribers. */
    const republish = (next: Partial<HappyAgentVaultSnapshot> = {}): void => {
        snapshot = { ...snapshot, ...next };
        const all = projected();
        const live = vaultLive(all);
        const children = vaultChildren(live);
        let location = snapshot.location;
        if (
            location.kind === "folder" &&
            location.folderId !== null &&
            !live.has(location.folderId)
        ) {
            // The folder went to the Trash or away: show the nearest folder still here.
            let id: HappyAgentVaultItemId | null = all.get(location.folderId)?.parentId ?? null;
            while (id !== null && !live.has(id)) id = all.get(id)?.parentId ?? null;
            location = { kind: "folder", folderId: id };
        }
        const folderId = location.kind === "folder" ? location.folderId : null;
        const listing = location.kind === "folder" ? (children.get(folderId) ?? []) : [];
        let preview = snapshot.preview;
        if (preview !== undefined) {
            const entry = all.get(preview.itemId);
            if (entry !== undefined && entry.kind !== "folder")
                preview = {
                    ...preview,
                    file: entry,
                    path: vaultPath(all, entry.id),
                    inTrash: !live.has(entry.id),
                };
        }
        const selectedId =
            snapshot.selectedId !== undefined &&
            (live.has(snapshot.selectedId) || location.kind === "trash")
                ? snapshot.selectedId
                : undefined;
        snapshot = {
            ...snapshot,
            items: live,
            children,
            location,
            crumbs:
                location.kind === "folder"
                    ? vaultCrumbs(all, folderId, ROOT_NAME)
                    : [{ id: null, name: ROOT_NAME }],
            listing,
            ...(preview === undefined ? {} : { preview }),
        };
        if (selectedId === undefined) {
            const { selectedId: _selected, ...rest } = snapshot;
            snapshot = rest;
        }
        contentSync();
        notify();
    };

    // ---- Preview -------------------------------------------------------------------------

    const contentReleaseNow = (): void => {
        contentRelease?.();
        contentRelease = undefined;
    };

    /** Reads the content of the version the preview should show, when it is not on screen yet. */
    const contentSync = (): void => {
        const preview = snapshot.preview;
        const entry = preview?.file;
        if (preview === undefined || entry === undefined) return;
        const number = preview.versionSelected ?? entry.latestVersion;
        // An artifact's newest summary moves with its version, so the key names both.
        const key = `${entry.id}:${String(number)}`;
        if (key === contentKey) return;
        contentKey = key;
        contentRead?.abort();
        const controller = new AbortController();
        contentRead = controller;
        // The same file's next version keeps the one on screen until it is read.
        if (preview.versionShown === undefined || snapshot.preview?.content.type === "error")
            snapshot = { ...snapshot, preview: { ...preview, content: { type: "loading" } } };
        void happyAgentVaultContentRead(
            { client, surfaceId, ...(deps.appOpen ? { appOpen: deps.appOpen } : {}) },
            entry,
            number,
            controller.signal,
        ).then(
            (read) => {
                if (controller.signal.aborted || snapshot.preview?.itemId !== entry.id) {
                    read.release?.();
                    return;
                }
                contentReleaseNow();
                contentRelease = read.release;
                snapshot = {
                    ...snapshot,
                    preview: { ...snapshot.preview, content: read.content, versionShown: number },
                };
                notify();
            },
            (error: unknown) => {
                if (controller.signal.aborted || snapshot.preview?.itemId !== entry.id) return;
                contentKey = undefined;
                snapshot = {
                    ...snapshot,
                    preview: {
                        ...snapshot.preview,
                        content: {
                            type: "error",
                            error: notFound(error)
                                ? new UserError("This version is no longer kept.")
                                : happyAgentUserError(error),
                        },
                        versionShown: number,
                    },
                };
                notify();
            },
        );
    };

    const previewSet = (next: Partial<NonNullable<HappyAgentVaultSnapshot["preview"]>>): void => {
        const preview = snapshot.preview;
        if (preview === undefined) return;
        snapshot = { ...snapshot, preview: { ...preview, ...next } };
    };

    /** Reads the open item's newest versions and activity, merged over what is held. */
    const historyLoad = (more: boolean): void => {
        const preview = snapshot.preview;
        if (preview === undefined) return;
        const itemId = preview.itemId;
        if (!more) historyRead?.abort();
        const controller = new AbortController();
        historyRead = controller;
        const held = preview.history.status === "ready" ? preview.history : undefined;
        if (more && held !== undefined) {
            previewSet({ history: { ...held, loadingMore: true } });
            notify();
        }
        const cursors = historyCursors;
        const signal = AbortSignal.any([controller.signal, life.signal]);
        void Promise.all([
            more && cursors.versions === null
                ? undefined
                : client.listVaultVersions(
                      surfaceId,
                      itemId,
                      {
                          limit: HISTORY_PAGE,
                          ...(more && cursors.versions ? { pageCursor: cursors.versions } : {}),
                      },
                      { signal },
                  ),
            more && cursors.activity === null
                ? undefined
                : client.listVaultFileActivity(
                      surfaceId,
                      itemId,
                      {
                          limit: HISTORY_PAGE,
                          ...(more && cursors.activity ? { pageCursor: cursors.activity } : {}),
                      },
                      { signal },
                  ),
        ]).then(
            ([versionsPage, activityPage]) => {
                if (signal.aborted || snapshot.preview?.itemId !== itemId) return;
                const versions = (versionsPage?.versions ?? []).map(happyAgentVaultVersionProject);
                const activity = (activityPage?.activity ?? []).map(happyAgentVaultActivityProject);
                actorsRequest([...versions.map((v) => v.actor), ...activity.map((a) => a.actor)]);
                const current =
                    snapshot.preview.history.status === "ready"
                        ? snapshot.preview.history
                        : undefined;
                historyCursors = more
                    ? {
                          versions: versionsPage ? versionsPage.nextPageCursor : cursors.versions,
                          activity: activityPage ? activityPage.nextPageCursor : cursors.activity,
                      }
                    : current !== undefined &&
                        (cursors.versions !== null || cursors.activity !== null)
                      ? cursors
                      : {
                            versions: versionsPage?.nextPageCursor ?? null,
                            activity: activityPage?.nextPageCursor ?? null,
                        };
                previewSet({
                    history: {
                        status: "ready",
                        versions: more
                            ? [
                                  ...(current?.versions ?? []),
                                  ...versions.filter(
                                      (v) =>
                                          !(current?.versions ?? []).some(
                                              (h) => h.number === v.number,
                                          ),
                                  ),
                              ]
                            : versionsMerge(
                                  versions,
                                  current?.versions ?? [],
                                  versionsPage?.nextPageCursor === null,
                              ),
                        activity: activityMerge(activity, current?.activity ?? []),
                        hasMore:
                            historyCursors.versions !== null || historyCursors.activity !== null,
                        loadingMore: false,
                    },
                });
                notify();
            },
            (error: unknown) => {
                if (signal.aborted || snapshot.preview?.itemId !== itemId) return;
                if (held !== undefined) {
                    previewSet({ history: { ...held, loadingMore: false } });
                    snapshot = { ...snapshot, failure: happyAgentUserError(error) };
                } else
                    previewSet({
                        history: { status: "failed", error: happyAgentUserError(error) },
                    });
                notify();
            },
        );
    };

    const previewOpen = (entry: HappyAgentVaultFile, path: string, inTrash: boolean): void => {
        if (snapshot.preview?.itemId === entry.id) return;
        contentRead?.abort();
        historyRead?.abort();
        contentReleaseNow();
        contentKey = undefined;
        historyCursors = { versions: null, activity: null };
        snapshot = {
            ...snapshot,
            selectedId: entry.id,
            preview: {
                itemId: entry.id,
                file: entry,
                path,
                inTrash,
                content: { type: "loading" },
                panel: snapshot.preview?.panel ?? "preview",
                history: { status: "loading" },
            },
        };
        actorsRequest([entry.createdBy, entry.updatedBy]);
        historyLoad(false);
        republish();
    };

    /** Lets the preview go, and what it was reading, without telling anyone yet. */
    const previewDrop = (): void => {
        if (snapshot.preview === undefined) return;
        contentRead?.abort();
        historyRead?.abort();
        contentReleaseNow();
        contentKey = undefined;
        const { preview: _preview, ...rest } = snapshot;
        snapshot = rest;
    };

    const previewClose = (): void => {
        if (snapshot.preview === undefined) return;
        previewDrop();
        notify();
    };

    // ---- Trash ---------------------------------------------------------------------------

    const trashLoad = (): void => {
        if (trashTimer) clearTimeout(trashTimer);
        trashTimer = undefined;
        if (snapshot.location.kind !== "trash") return;
        trashRead?.abort();
        const controller = new AbortController();
        trashRead = controller;
        const signal = AbortSignal.any([controller.signal, life.signal]);
        void (async () => {
            await deps.surfaceCreated?.catch(() => undefined);
            const items: { item: HappyAgentVaultItem; path: string }[] = [];
            let pageCursor: string | undefined;
            for (let page = 0; page < 20; page += 1) {
                const response = await client.listVaultTrash(
                    surfaceId,
                    { limit: 500, ...(pageCursor ? { pageCursor } : {}) },
                    { signal },
                );
                for (const item of response.items)
                    items.push({ item: happyAgentVaultItemProject(item.item), path: item.path });
                if (response.nextPageCursor === null) break;
                pageCursor = response.nextPageCursor;
            }
            return items;
        })().then(
            (items) => {
                if (signal.aborted) return;
                actorsRequest(items.map((held) => held.item.updatedBy));
                snapshot = { ...snapshot, trash: { status: "ready", items } };
                notify();
            },
            (error: unknown) => {
                if (signal.aborted) return;
                snapshot = {
                    ...snapshot,
                    trash: { status: "failed", error: happyAgentUserError(error) },
                };
                notify();
            },
        );
    };

    const trashSchedule = (): void => {
        if (snapshot.location.kind !== "trash" || listeners.size === 0) return;
        if (trashTimer) clearTimeout(trashTimer);
        trashTimer = setTimeout(trashLoad, 250);
    };

    // ---- Settings ------------------------------------------------------------------------

    let settingsPending: { retention: HappyAgentVaultRetention; mutationId: string } | undefined;

    const settingsLoad = (signal: AbortSignal): void => {
        void happyAgentSyncRead(
            signal,
            async () => {
                await deps.surfaceCreated?.catch(() => undefined);
                return await client.getVaultSettings(surfaceId, { signal });
            },
            () => undefined,
        ).then(
            (response) => {
                if (signal.aborted) return;
                settingsVersion = response.settings.version;
                if (settingsPending !== undefined) return;
                snapshot = {
                    ...snapshot,
                    settings: {
                        status: "ready",
                        retention: happyAgentVaultRetentionProject(response.settings.retention),
                    },
                };
                notify();
            },
            () => undefined,
        );
    };

    // ---- Reading the tree and following events -------------------------------------------

    const entryAdopt = (entry: HappyAgentVaultItem): boolean => {
        if (entry.surfaceId !== surfaceId) return false;
        const current = authoritative.get(entry.id);
        if (current !== undefined && !happyAgentVersionNewer(entry.version, current.version))
            return false;
        authoritative = new Map(authoritative).set(entry.id, entry);
        return true;
    };

    const entryRemove = (itemId: HappyAgentVaultItemId): void => {
        const gone = new Set<HappyAgentVaultItemId>([itemId]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const entry of authoritative.values())
                if (!gone.has(entry.id) && entry.parentId !== null && gone.has(entry.parentId)) {
                    gone.add(entry.id);
                    grew = true;
                }
        }
        authoritative = new Map([...authoritative].filter(([id]) => !gone.has(id)));
    };

    const entryReread = (kind: "folder" | "file", itemId: HappyAgentVaultItemId): void => {
        const read =
            kind === "folder"
                ? client
                      .getVaultFolder(surfaceId, itemId, { signal: life.signal })
                      .then((response) => happyAgentVaultFolderProject(response.folder))
                : client
                      .getVaultFile(surfaceId, itemId, { signal: life.signal })
                      .then((response) => happyAgentVaultFileProject(response.file));
        void read.then(
            (item) => {
                if (entryAdopt(item)) republish();
            },
            (error: unknown) => {
                if (!notFound(error) || !authoritative.has(itemId)) return;
                entryRemove(itemId);
                republish();
            },
        );
    };

    /** Applies one event to the tree; answers whether anything drawn from it changed. */
    const eventApply = (event: HappyAgentVaultEvent): boolean => {
        switch (event.type) {
            case "vault.folder.created":
                return entryAdopt(happyAgentVaultFolderProject(event.payload.folder));
            case "vault.file.created":
                return entryAdopt(happyAgentVaultFileProject(event.payload.file));
            case "vault.folder.updated": {
                const payload = event.payload;
                const folderId = payload.folderId as HappyAgentVaultItemId;
                const current = authoritative.get(folderId);
                if (current === undefined || current.kind !== "folder") {
                    entryReread("folder", folderId);
                    return false;
                }
                if (!happyAgentVersionNewer(payload.version, current.version)) return false;
                if (current.version !== payload.previousVersion) {
                    entryReread("folder", folderId);
                    return false;
                }
                authoritative = new Map(authoritative).set(
                    folderId,
                    happyAgentVaultFolderChangesApply(current, payload),
                );
                // A folder back from the Trash may hold what this window never read.
                if (payload.changes.deletedAt === null) reload();
                return true;
            }
            case "vault.file.updated": {
                const payload = event.payload;
                const fileId = payload.fileId as HappyAgentVaultItemId;
                const current = authoritative.get(fileId);
                if (current === undefined || current.kind === "folder") {
                    entryReread("file", fileId);
                    return false;
                }
                if (!happyAgentVersionNewer(payload.version, current.version)) return false;
                const next =
                    current.version === payload.previousVersion
                        ? happyAgentVaultFileChangesApply(current, payload)
                        : undefined;
                if (next === undefined) {
                    entryReread("file", fileId);
                    return false;
                }
                authoritative = new Map(authoritative).set(fileId, next);
                return true;
            }
            case "vault.folder.removed":
            case "vault.file.removed": {
                const itemId = (
                    event.type === "vault.folder.removed"
                        ? event.payload.folderId
                        : event.payload.fileId
                ) as HappyAgentVaultItemId;
                if (!authoritative.has(itemId)) return false;
                entryRemove(itemId);
                return true;
            }
            case "vault.version.updated":
            case "vault.settings.updated":
                return false;
        }
    };

    /** What an event means for the parts of the vault read on their own: preview, history, settings. */
    const eventSideApply = (event: HappyAgentVaultEvent): void => {
        const preview = snapshot.preview;
        switch (event.type) {
            case "vault.folder.updated":
            case "vault.file.updated": {
                if (event.payload.changes.deletedAt !== undefined) trashSchedule();
                if (event.type === "vault.file.updated" && preview?.itemId === event.payload.fileId)
                    historyLoad(false);
                actorsRequest([event.payload.changes.updatedBy]);
                return;
            }
            case "vault.folder.created":
                actorsRequest([event.payload.folder.createdBy]);
                return;
            case "vault.file.created":
                actorsRequest([event.payload.file.createdBy]);
                return;
            case "vault.folder.removed":
            case "vault.file.removed":
                trashSchedule();
                return;
            case "vault.version.updated": {
                if (preview?.itemId !== event.payload.fileId || preview.history.status !== "ready")
                    return;
                const { number, pinned } = event.payload;
                previewSet({
                    history: {
                        ...preview.history,
                        versions: preview.history.versions.map((version) =>
                            version.number === number && version.pinned !== pinned
                                ? { ...version, pinned }
                                : version,
                        ),
                    },
                });
                historyLoad(false);
                notify();
                return;
            }
            case "vault.settings.updated": {
                const payload = event.payload;
                if (
                    settingsVersion !== undefined &&
                    !happyAgentVersionNewer(payload.version, settingsVersion)
                )
                    return;
                if (settingsVersion !== payload.previousVersion) {
                    settingsLoad(reads.signal);
                    return;
                }
                settingsVersion = payload.version;
                if (settingsPending !== undefined) return;
                snapshot = {
                    ...snapshot,
                    settings: {
                        status: "ready",
                        retention: happyAgentVaultRetentionProject(payload.changes.retention),
                    },
                };
                notify();
                return;
            }
        }
    };

    const reload = (): void => {
        if (following === undefined) return;
        readsInFlight += 1;
        readLatest += 1;
        const token = readLatest;
        const signal = reads.signal;
        const mark = journal.length;
        let ended = false;
        const end = (): void => {
            if (ended || signal.aborted) return;
            ended = true;
            readsInFlight -= 1;
            if (readsInFlight === 0) journal = [];
        };
        void happyAgentSyncRead(
            signal,
            async () => {
                try {
                    await deps.surfaceCreated;
                } catch {
                    return undefined;
                }
                try {
                    const items: VaultItem[] = [];
                    let pageCursor: string | undefined;
                    for (;;) {
                        const page = await client.listVaultTree(
                            surfaceId,
                            { limit: 1_000, ...(pageCursor ? { pageCursor } : {}) },
                            { signal },
                        );
                        items.push(...page.items);
                        if (page.nextPageCursor === null) return items;
                        pageCursor = page.nextPageCursor;
                    }
                } catch (error) {
                    if (notFound(error)) return undefined;
                    throw error;
                }
            },
            (error) => {
                if (signal.aborted) return;
                failed = true;
                snapshot = { ...snapshot, error: happyAgentUserError(error) };
                notify();
            },
        )
            .then((items) => {
                if (signal.aborted || token !== readLatest) return;
                failed = false;
                const { error: _error, ...rest } = snapshot;
                snapshot = rest;
                if (items === undefined) {
                    authoritative = new Map();
                    republish({ status: "missing" });
                    return;
                }
                const read = new Map<HappyAgentVaultItemId, HappyAgentVaultItem>();
                for (const wire of items) {
                    const entry = happyAgentVaultItemProject(wire);
                    const held = authoritative.get(entry.id);
                    // An unchanged item keeps its identity, so its row does not redraw.
                    read.set(
                        entry.id,
                        held !== undefined && held.version === entry.version ? held : entry,
                    );
                }
                authoritative = read;
                for (const event of journal.slice(mark)) eventApply(event);
                republish({ status: "ready" });
                if (openWaiting !== undefined) {
                    const itemId = openWaiting;
                    openWaiting = undefined;
                    store.itemOpen(itemId);
                }
                if (snapshot.preview !== undefined) historyLoad(false);
                trashSchedule();
            })
            .catch(() => undefined)
            .finally(end);
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...HAPPY_AGENT_VAULT_EVENT_TYPES, "profile.updated"],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    reload();
                    settingsLoad(reads.signal);
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const raw = input.update.event;
                if (raw.type === "profile.updated") {
                    const userId = raw.payload.userId ?? raw.payload.profile?.userId;
                    if (userId != null && snapshot.people.has(userId)) people.request([], userId);
                    continue;
                }
                if (happyAgentVaultEventSurface(raw) !== surfaceId) continue;
                const event = raw as HappyAgentVaultEvent;
                if (readsInFlight > 0) journal.push(event);
                if (snapshot.status === "ready" && eventApply(event)) republish();
                eventSideApply(event);
            }
        })()
            .catch(() => {
                failed = true;
            })
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };

    const stop = (): void => {
        following?.abort();
        following = undefined;
        reads.abort();
        reads = new AbortController();
        readsInFlight = 0;
        journal = [];
        if (retry) clearTimeout(retry);
        retry = undefined;
        if (trashTimer) clearTimeout(trashTimer);
        trashTimer = undefined;
    };

    // ---- Changes -------------------------------------------------------------------------

    const opNeeded = (op: VaultOp): boolean => {
        const entry = authoritative.get(op.itemId);
        if (op.kind === "create") return entry === undefined;
        if (entry === undefined) return false;
        if (op.kind === "move") return entry.name !== op.name || entry.parentId !== op.parentId;
        return entry.deletedAt === null;
    };

    const opSend = async (entry: QueuedOp): Promise<HappyAgentVaultItem> => {
        const op = entry.op;
        const signal = life.signal;
        if (op.kind === "create")
            return happyAgentVaultFolderProject(
                (
                    await client.createVaultFolder(
                        surfaceId,
                        {
                            id: op.itemId,
                            parentId: op.parentId,
                            name: op.name,
                            mutationId: entry.mutationId,
                        },
                        { signal },
                    )
                ).folder,
            );
        const held = authoritative.get(op.itemId)!;
        const ifMatch = held.version;
        if (op.kind === "move") {
            const request = { name: op.name, parentId: op.parentId, mutationId: entry.mutationId };
            return held.kind === "folder"
                ? happyAgentVaultFolderProject(
                      (
                          await client.updateVaultFolder(surfaceId, op.itemId, request, {
                              ifMatch,
                              signal,
                          })
                      ).folder,
                  )
                : happyAgentVaultFileProject(
                      (
                          await client.updateVaultFile(surfaceId, op.itemId, request, {
                              ifMatch,
                              signal,
                          })
                      ).file,
                  );
        }
        const options = { ifMatch, mutationId: entry.mutationId, signal };
        return held.kind === "folder"
            ? happyAgentVaultFolderProject(
                  (await client.deleteVaultFolder(surfaceId, op.itemId, options)).folder,
              )
            : happyAgentVaultFileProject(
                  (await client.deleteVaultFile(surfaceId, op.itemId, options)).file,
              );
    };

    /** Why a change was refused, in words for the reader. */
    const refusalOf = (op: VaultOp, error: unknown): UserError => {
        if (apiCode(error) === "name_taken") {
            const name =
                op.kind === "delete" ? "That name" : `“${happyAgentVaultNameShown(op.name)}”`;
            return new UserError(`${name} is already used in that folder.`, "name_taken", error);
        }
        return happyAgentUserError(error);
    };

    const queueRun = async (): Promise<void> => {
        if (queueRunning) return;
        queueRunning = true;
        try {
            await deps.surfaceCreated?.catch(() => undefined);
            let delay = 1_000;
            while (!disposed && queue.length > 0) {
                const entry = queue[0]!;
                if (!opNeeded(entry.op)) {
                    queue = queue.slice(1);
                    entry.settle(authoritative.has(entry.op.itemId));
                    republish();
                    continue;
                }
                entry.sent = true;
                try {
                    const result = await opSend(entry);
                    if (disposed) return;
                    delay = 1_000;
                    entryAdopt(result);
                    queue = queue.filter((queued) => queued !== entry);
                    entry.settle(true);
                    republish();
                    if (entry.op.kind === "delete") trashSchedule();
                } catch (error) {
                    if (disposed || life.signal.aborted) return;
                    const current = conflictItem(error);
                    if (current !== undefined) {
                        entryAdopt(current);
                        entry.sent = false;
                        entry.conflicts += 1;
                        if (entry.conflicts <= CONFLICT_RETRIES) {
                            republish();
                            continue;
                        }
                    }
                    if (refused(error)) {
                        queue = queue.filter((queued) => queued !== entry);
                        entry.settle(false);
                        republish({ failure: refusalOf(entry.op, error) });
                        continue;
                    }
                    entry.sent = false;
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            queueRunning = false;
        }
    };

    /** Queues one change; a move of an item whose last move has not gone yet replaces it. */
    const enqueue = (op: VaultOp): Promise<boolean> => {
        if (disposed) return Promise.resolve(false);
        const { failure: _failure, ...rest } = snapshot;
        snapshot = rest;
        let settle!: (taken: boolean) => void;
        const taken = new Promise<boolean>((resolve) => {
            settle = resolve;
        });
        let last: QueuedOp | undefined;
        for (const queued of queue) if (queued.op.itemId === op.itemId) last = queued;
        if (last !== undefined && !last.sent && last.op.kind === "move" && op.kind === "move") {
            last.op = op;
            const previous = last.settle;
            (last as { settle: (taken: boolean) => void }).settle = (value) => {
                previous(value);
                settle(value);
            };
        } else
            queue = [...queue, { op, mutationId: idCreate(), sent: false, conflicts: 0, settle }];
        republish();
        void queueRun();
        return taken;
    };

    const fail = (message: string): void => {
        snapshot = { ...snapshot, failure: new UserError(message) };
        notify();
    };

    /**
     * A name the reader typed, cleaned and stored as the daemon would take it,
     * an artifact's with its `.artifact`, or `undefined` after saying why not.
     */
    const nameClean = (name: string, kind: HappyAgentVaultItem["kind"]): string | undefined => {
        const clean = name.trim().normalize("NFC");
        const problem = happyAgentVaultNameProblem(clean, kind);
        if (problem !== undefined) {
            fail(problem);
            return undefined;
        }
        return happyAgentVaultNameStored(clean, kind);
    };

    const siblingsOf = (
        folderId: HappyAgentVaultItemId | null,
        except?: HappyAgentVaultItemId,
    ): readonly HappyAgentVaultItem[] =>
        (snapshot.children.get(folderId) ?? []).filter((entry) => entry.id !== except);

    const nameTaken = (
        folderId: HappyAgentVaultItemId | null,
        name: string,
        except?: HappyAgentVaultItemId,
    ): HappyAgentVaultItem | undefined =>
        siblingsOf(folderId, except).find(
            (entry) => vaultNameKey(entry.name) === vaultNameKey(name),
        );

    // ---- Uploads -------------------------------------------------------------------------

    const uploadsPublish = (): void => {
        snapshot = { ...snapshot, uploads: uploads.map((record) => record.view) };
        notify();
    };

    const uploadView = (
        record: UploadRecord,
        next: Partial<HappyAgentVaultUpload> & Pick<HappyAgentVaultUpload, "phase">,
    ): void => {
        record.view = { ...record.view, ...next } as HappyAgentVaultUpload;
        uploadsPublish();
    };

    /** The folder `name` inside `parentId`, made when it is not there. */
    const folderEnsure = async (
        parentId: HappyAgentVaultItemId | null,
        name: string,
    ): Promise<HappyAgentVaultItemId> => {
        const held = nameTaken(parentId, name);
        if (held?.kind === "folder") return held.id;
        const itemId = idCreate() as HappyAgentVaultItemId;
        const free = held === undefined ? name : vaultNameFree(siblingsOf(parentId), name);
        const taken = await enqueue({ kind: "create", itemId, parentId, name: free, at: now() });
        if (!taken) throw new UserError(`The folder “${free}” could not be made.`);
        return itemId;
    };

    /** Places a received upload: a new version of the file or artifact with its name, or a new one. */
    const uploadPlace = async (
        record: UploadRecord,
        uploadId: string,
        folderId: HappyAgentVaultItemId | null,
        signal: AbortSignal,
    ): Promise<HappyAgentVaultItemId> => {
        const name = record.view.name;
        const kind = record.view.kind;
        for (let attempt = 0; attempt < CONFLICT_RETRIES + 2; attempt += 1) {
            const held = nameTaken(folderId, name);
            try {
                if (held?.kind === kind && held.id !== record.itemId) {
                    const response = await client.createVaultVersion(
                        surfaceId,
                        held.id,
                        {
                            uploadId,
                            mutationId: record.mutationId,
                            operationId: record.operationId,
                        },
                        { ifMatch: held.version, signal },
                    );
                    // A `null` version is the same content as the newest: placed all the same.
                    entryAdopt(happyAgentVaultFileProject(response.file));
                    return held.id;
                }
                const placed =
                    held === undefined || held.id === record.itemId
                        ? name
                        : vaultNameFree(siblingsOf(folderId), name);
                // The name decides the kind: a `.artifact` name makes an artifact.
                const response = await client.createVaultFile(
                    surfaceId,
                    {
                        id: record.itemId,
                        parentId: folderId,
                        name: placed,
                        uploadId,
                        mutationId: record.mutationId,
                    },
                    { signal },
                );
                entryAdopt(happyAgentVaultFileProject(response.file));
                return record.itemId;
            } catch (error) {
                const current = conflictItem(error) ?? nameTakenItem(error);
                if (current === undefined) throw error;
                // Someone made or changed the name meanwhile: learn it and place again.
                entryAdopt(current);
                republish();
            }
        }
        throw new UserError(
            `“${happyAgentVaultNameShown(name)}” could not be placed; the folder kept changing.`,
        );
    };

    const uploadsRun = async (): Promise<void> => {
        if (uploadsRunning) return;
        uploadsRunning = true;
        try {
            await deps.surfaceCreated?.catch(() => undefined);
            for (;;) {
                if (disposed) return;
                let record: UploadRecord | undefined;
                for (const candidate of uploads)
                    if (candidate.view.phase === "waiting") record = candidate;
                if (record === undefined) return;
                const signal = AbortSignal.any([record.controller.signal, life.signal]);
                try {
                    uploadView(record, { phase: "sending" });
                    const uploadId = await happyAgentVaultUploadSend(
                        { client },
                        record.file,
                        record.uploadId,
                        (id, received) => {
                            record.uploadId = id;
                            uploadView(record, { phase: "sending", sent: received });
                        },
                        signal,
                    );
                    uploadView(record, { phase: "placing" });
                    let folderId = record.view.folderId;
                    for (const name of record.folders)
                        folderId = await folderEnsure(folderId, name);
                    const itemId = await uploadPlace(record, uploadId, folderId, signal);
                    uploadView(record, { phase: "done", itemId, sent: record.view.size });
                    republish();
                } catch (error) {
                    if (disposed || signal.aborted) continue;
                    // An upload used up or expired is begun again on retry.
                    const expired = notFound(error) && record.view.phase === "sending";
                    if (expired) delete record.uploadId;
                    uploadView(record, {
                        phase: "failed",
                        error: happyAgentUserError(error),
                        retryable: expired || !refused(error) || retryableRefusal(error),
                    });
                }
            }
        } finally {
            uploadsRunning = false;
        }
    };

    // ---- The store -----------------------------------------------------------------------

    const textSaveAttempts = new Map<
        HappyAgentVaultItemId,
        {
            draft: string;
            baseVersion: string;
            mutationId: string;
            operationId: string;
            uploadId?: string;
            uploadedId?: string;
        }
    >();
    const textEditSet = (
        itemId: HappyAgentVaultItemId,
        edit: HappyAgentVaultTextEdit | undefined,
    ): void => {
        const textEdits = new Map(snapshot.textEdits);
        if (edit) textEdits.set(itemId, edit);
        else textEdits.delete(itemId);
        snapshot = { ...snapshot, textEdits };
        notify();
    };

    const store: HappyAgentVaultStore = {
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
        folderOpen(folderId) {
            if (disposed) return;
            openWaiting = undefined;
            if (folderId !== null && !snapshot.items.has(folderId)) return;
            const { selectedId: _selected, ...rest } = snapshot;
            snapshot = rest;
            previewDrop();
            republish({ location: { kind: "folder", folderId } });
        },
        trashShow() {
            if (disposed || snapshot.location.kind === "trash") return;
            openWaiting = undefined;
            const { selectedId: _selected, ...rest } = snapshot;
            snapshot = rest;
            previewDrop();
            republish({ location: { kind: "trash" } });
            trashLoad();
        },
        itemSelect(itemId) {
            if (disposed || itemId === snapshot.selectedId) return;
            if (itemId === undefined) {
                const { selectedId: _selected, ...rest } = snapshot;
                snapshot = rest;
            } else snapshot = { ...snapshot, selectedId: itemId };
            notify();
        },
        itemOpen(itemId) {
            if (disposed) return;
            openWaiting = undefined;
            const live = snapshot.items.get(itemId);
            if (live === undefined && snapshot.status === "loading") {
                // Opened from outside the vault, as a search hit is, before its tree is read.
                openWaiting = itemId;
                return;
            }
            if (live?.kind === "folder") {
                store.folderOpen(itemId);
                return;
            }
            if (live !== undefined) {
                // The preview stands in its folder's place, so the folder is the one it is in.
                const location = snapshot.location;
                if (location.kind !== "folder" || location.folderId !== live.parentId)
                    republish({ location: { kind: "folder", folderId: live.parentId } });
                previewOpen(live, vaultPath(projected(), itemId), false);
                return;
            }
            const item =
                snapshot.trash.status === "ready"
                    ? snapshot.trash.items.find((held) => held.item.id === itemId)
                    : undefined;
            if (item !== undefined && item.item.kind !== "folder")
                previewOpen(item.item, item.path, true);
            else if (item !== undefined) store.itemSelect(itemId);
        },
        previewClose,
        textEditStart() {
            const preview = snapshot.preview;
            const file = preview?.file;
            if (
                disposed ||
                !preview ||
                preview.inTrash ||
                file?.kind !== "file" ||
                (file.mediaType !== "text/plain" && file.mediaType !== "text/markdown") ||
                preview.content.type !== "text" ||
                preview.versionShown !== file.latestVersion ||
                snapshot.textEdits?.has(file.id)
            )
                return;
            previewSet({ panel: "preview" });
            textEditSet(file.id, {
                status: "editing",
                baseVersion: file.version,
                original: preview.content.text,
                draft: preview.content.text,
            });
        },
        textDraftUpdate(value) {
            const itemId = snapshot.preview?.itemId;
            const edit = itemId ? snapshot.textEdits?.get(itemId) : undefined;
            if (!itemId || !edit || edit.status === "saving" || disposed) return;
            textEditSet(itemId, { ...edit, draft: value });
        },
        textEditDiscard() {
            const itemId = snapshot.preview?.itemId;
            if (!itemId || disposed || snapshot.textEdits?.get(itemId)?.status === "saving") return;
            textSaveAttempts.delete(itemId);
            textEditSet(itemId, undefined);
        },
        textEditSave() {
            const preview = snapshot.preview;
            const itemId = preview?.itemId;
            const edit = itemId ? snapshot.textEdits?.get(itemId) : undefined;
            if (
                disposed ||
                !preview?.file ||
                preview.inTrash ||
                !itemId ||
                !edit ||
                edit.status !== "editing" ||
                edit.draft === edit.original
            )
                return;
            let attempt = textSaveAttempts.get(itemId);
            if (
                !attempt ||
                attempt.draft !== edit.draft ||
                attempt.baseVersion !== edit.baseVersion
            ) {
                attempt = {
                    draft: edit.draft,
                    baseVersion: edit.baseVersion,
                    mutationId: idCreate(),
                    operationId: idCreate(),
                };
                textSaveAttempts.set(itemId, attempt);
            }
            const saving = attempt;
            textEditSet(itemId, { ...edit, status: "saving" });
            void (async () => {
                const signal = life.signal;
                const uploadId =
                    saving.uploadedId ??
                    (await happyAgentVaultUploadSend(
                        { client },
                        new Blob([saving.draft], { type: "text/plain" }),
                        saving.uploadId,
                        (id) => {
                            saving.uploadId = id;
                        },
                        signal,
                    ));
                saving.uploadedId = uploadId;
                const response = await client.createVaultVersion(
                    surfaceId,
                    itemId,
                    {
                        uploadId,
                        mutationId: saving.mutationId,
                        operationId: saving.operationId,
                    },
                    { ifMatch: saving.baseVersion, signal },
                );
                if (disposed) return;
                const file = happyAgentVaultFileProject(response.file);
                entryAdopt(file);
                textSaveAttempts.delete(itemId);
                // A deduplicated retry can return a newer current file alongside our older version.
                // Never adopt that newer concurrency token as the base of this draft.
                const superseded = response.version
                    ? response.version.number !== file.latestVersion
                    : file.version !== saving.baseVersion;
                textEditSet(
                    itemId,
                    superseded
                        ? { ...edit, status: "conflict" }
                        : {
                              status: "editing",
                              baseVersion: file.version,
                              original: saving.draft,
                              draft: saving.draft,
                          },
                );
                republish();
                if (snapshot.preview?.itemId === itemId) historyLoad(false);
            })().catch((error: unknown) => {
                if (disposed) return;
                // A stale base is never retried against a newer version: the draft is the reader's.
                if (
                    error instanceof HappyAgentApiError &&
                    error.status === 409 &&
                    error.code === "conflict"
                ) {
                    const current = conflictItem(error);
                    if (current) entryAdopt(current);
                    textEditSet(itemId, { ...edit, status: "conflict" });
                    republish();
                } else
                    textEditSet(itemId, {
                        ...edit,
                        status: "editing",
                        error: happyAgentUserError(error),
                    });
            });
        },
        previewPanelUpdate(panel) {
            if (disposed || snapshot.preview === undefined || snapshot.preview.panel === panel)
                return;
            previewSet({ panel });
            notify();
        },
        previewVersionSelect(number) {
            const preview = snapshot.preview;
            if (disposed || preview?.file === undefined) return;
            const selected =
                number === undefined || number === preview.file.latestVersion ? undefined : number;
            if (selected === preview.versionSelected) return;
            if (selected === undefined) {
                const { versionSelected: _version, ...rest } = preview;
                snapshot = { ...snapshot, preview: rest };
            } else previewSet({ versionSelected: selected });
            contentSync();
            notify();
        },
        historyMoreLoad() {
            const history = snapshot.preview?.history;
            if (disposed || history?.status !== "ready" || !history.hasMore || history.loadingMore)
                return;
            historyLoad(true);
        },
        versionRestore(number) {
            const preview = snapshot.preview;
            const entry = preview?.file;
            if (
                disposed ||
                entry === undefined ||
                preview?.inTrash ||
                number === entry.latestVersion
            )
                return;
            const mutationId = idCreate();
            // One restore the reader asked for, however many times it is sent.
            const operationId = idCreate();
            void (async () => {
                let ifMatch = entry.version;
                for (let attempt = 0; attempt <= CONFLICT_RETRIES; attempt += 1) {
                    try {
                        const response = await client.createVaultVersion(
                            surfaceId,
                            entry.id,
                            { fromVersion: number, mutationId, operationId },
                            { ifMatch, signal: life.signal },
                        );
                        // A `null` version means the newest already held it: restored all the same.
                        entryAdopt(happyAgentVaultFileProject(response.file));
                        if (snapshot.preview?.itemId === entry.id) {
                            const { versionSelected: _version, ...rest } = snapshot.preview;
                            snapshot = { ...snapshot, preview: rest };
                            historyLoad(false);
                        }
                        republish();
                        return;
                    } catch (error) {
                        const current = conflictItem(error);
                        if (current !== undefined) {
                            entryAdopt(current);
                            ifMatch = current.version;
                            continue;
                        }
                        if (disposed || life.signal.aborted) return;
                        republish({
                            failure: notFound(error)
                                ? new UserError(`Version ${String(number)} is no longer kept.`)
                                : happyAgentUserError(error),
                        });
                        return;
                    }
                }
            })();
        },
        versionPinnedUpdate(number, pinned) {
            const preview = snapshot.preview;
            if (disposed || preview === undefined || preview.history.status !== "ready") return;
            const itemId = preview.itemId;
            const flip = (value: boolean) => {
                const current = snapshot.preview;
                if (current?.itemId !== itemId || current.history.status !== "ready") return;
                previewSet({
                    history: {
                        ...current.history,
                        versions: current.history.versions.map((version) =>
                            version.number === number ? { ...version, pinned: value } : version,
                        ),
                    },
                });
                notify();
            };
            flip(pinned);
            const send = pinned
                ? client.pinVaultVersion.bind(client)
                : client.unpinVaultVersion.bind(client);
            void send(surfaceId, itemId, number, {
                mutationId: idCreate(),
                signal: life.signal,
            }).then(
                (response) => flip(response.version.pinned),
                (error: unknown) => {
                    if (disposed || life.signal.aborted) return;
                    flip(!pinned);
                    snapshot = { ...snapshot, failure: happyAgentUserError(error) };
                    notify();
                },
            );
        },
        dialogOpen(dialog: HappyAgentVaultDialog) {
            if (disposed) return;
            snapshot = { ...snapshot, dialog };
            notify();
        },
        dialogClose() {
            if (disposed || snapshot.dialog === undefined) return;
            const { dialog: _dialog, ...rest } = snapshot;
            snapshot = rest;
            notify();
        },
        folderCreate(name) {
            const location = snapshot.location;
            if (disposed || snapshot.status === "missing" || location.kind !== "folder") return;
            const clean = nameClean(name, "folder");
            if (clean === undefined) return;
            if (nameTaken(location.folderId, clean) !== undefined) {
                fail(`“${happyAgentVaultNameShown(clean)}” is already used in this folder.`);
                return;
            }
            store.dialogClose();
            const itemId = idCreate() as HappyAgentVaultItemId;
            snapshot = { ...snapshot, selectedId: itemId };
            void enqueue({
                kind: "create",
                itemId,
                parentId: location.folderId,
                name: clean,
                at: now(),
            });
        },
        itemRename(itemId, name) {
            const entry = snapshot.items.get(itemId);
            if (disposed || entry === undefined) return;
            const clean = nameClean(name, entry.kind);
            if (clean === undefined) return;
            store.dialogClose();
            if (clean === entry.name) return;
            if (nameTaken(entry.parentId, clean, itemId) !== undefined) {
                fail(`“${happyAgentVaultNameShown(clean)}” is already used in this folder.`);
                return;
            }
            void enqueue({ kind: "move", itemId, parentId: entry.parentId, name: clean });
        },
        itemMove(itemId, folderId) {
            const entry = snapshot.items.get(itemId);
            if (disposed || entry === undefined) return;
            store.dialogClose();
            if (entry.parentId === folderId) return;
            if (folderId !== null && !snapshot.items.has(folderId)) return;
            if (vaultContains(projected(), itemId, folderId)) return;
            if (nameTaken(folderId, entry.name, itemId) !== undefined) {
                fail(`“${happyAgentVaultNameShown(entry.name)}” is already used in that folder.`);
                return;
            }
            void enqueue({ kind: "move", itemId, parentId: folderId, name: entry.name });
        },
        itemDelete(itemId) {
            if (disposed || !snapshot.items.has(itemId)) return;
            void enqueue({ kind: "delete", itemId, at: now() });
        },
        trashRestore(itemId) {
            const trash = snapshot.trash;
            if (disposed || trash.status !== "ready") return;
            const item = trash.items.find((held) => held.item.id === itemId);
            if (item === undefined) return;
            snapshot = {
                ...snapshot,
                trash: { status: "ready", items: trash.items.filter((held) => held !== item) },
            };
            notify();
            const mutationId = idCreate();
            void (async () => {
                let ifMatch = item.item.version;
                let name: string | undefined;
                for (let attempt = 0; attempt <= CONFLICT_RETRIES; attempt += 1) {
                    try {
                        const request = { mutationId, ...(name === undefined ? {} : { name }) };
                        const options = { ifMatch, signal: life.signal };
                        const restored =
                            item.item.kind === "folder"
                                ? happyAgentVaultFolderProject(
                                      (
                                          await client.restoreVaultFolder(
                                              surfaceId,
                                              itemId,
                                              request,
                                              options,
                                          )
                                      ).folder,
                                  )
                                : happyAgentVaultFileProject(
                                      (
                                          await client.restoreVaultFile(
                                              surfaceId,
                                              itemId,
                                              request,
                                              options,
                                          )
                                      ).file,
                                  );
                        entryAdopt(restored);
                        if (restored.kind === "folder") reload();
                        republish();
                        trashSchedule();
                        return;
                    } catch (error) {
                        if (disposed || life.signal.aborted) return;
                        const sibling = nameTakenItem(error);
                        if (apiCode(error) === "name_taken") {
                            // Its name was taken meanwhile: it comes back beside the newcomer.
                            const parentId = sibling?.parentId ?? item.item.parentId;
                            if (sibling !== undefined) entryAdopt(sibling);
                            name = vaultNameFree(siblingsOf(parentId), item.item.name);
                            continue;
                        }
                        const current = conflictItem(error);
                        if (
                            current !== undefined &&
                            current.id === itemId &&
                            current.version !== ifMatch
                        ) {
                            ifMatch = current.version;
                            continue;
                        }
                        republish({ failure: happyAgentUserError(error) });
                        trashSchedule();
                        return;
                    }
                }
            })();
        },
        filesUpload(folderId, files) {
            if (disposed || snapshot.status === "missing" || files.length === 0) return;
            if (folderId !== null && !snapshot.items.has(folderId)) return;
            const added = files.map((picked): UploadRecord => {
                const name = picked.file.name.normalize("NFC");
                return {
                    view: {
                        id: idCreate(),
                        name,
                        kind: happyAgentVaultArtifactNamed(name) ? "artifact" : "file",
                        folderId,
                        size: picked.file.size,
                        sent: 0,
                        phase: "waiting",
                    },
                    file: picked.file,
                    folders: foldersOf(picked.relativePath),
                    itemId: idCreate() as HappyAgentVaultItemId,
                    mutationId: idCreate(),
                    operationId: idCreate(),
                    controller: new AbortController(),
                };
            });
            // Newest first on screen; sent in the order they were given.
            uploads = [...added.reverse(), ...uploads];
            uploadsPublish();
            void uploadsRun();
        },
        uploadRetry(uploadId) {
            const record = uploads.find((candidate) => candidate.view.id === uploadId);
            if (disposed || record?.view.phase !== "failed" || !record.view.retryable) return;
            record.controller = new AbortController();
            uploadView(record, { phase: "waiting" });
            void uploadsRun();
        },
        uploadDismiss(uploadId) {
            const record = uploads.find((candidate) => candidate.view.id === uploadId);
            if (disposed || record === undefined) return;
            record.controller.abort();
            if (record.uploadId !== undefined && record.view.phase !== "done")
                void client.cancelVaultUpload(record.uploadId).catch(() => undefined);
            uploads = uploads.filter((candidate) => candidate !== record);
            uploadsPublish();
        },
        retentionUpdate(retention) {
            const settings = snapshot.settings;
            if (disposed || settings.status !== "ready") return;
            if (happyAgentVaultRetentionEqual(settings.retention, retention)) return;
            const before = settings.retention;
            const pending = { retention, mutationId: idCreate() };
            settingsPending = pending;
            snapshot = { ...snapshot, settings: { status: "ready", retention } };
            notify();
            void (async () => {
                await deps.surfaceCreated?.catch(() => undefined);
                let delay = 1_000;
                for (;;) {
                    if (disposed || settingsPending !== pending) return;
                    try {
                        const response = await client.updateVaultSettings(
                            surfaceId,
                            {
                                retention: happyAgentVaultRetentionWire(retention),
                                mutationId: pending.mutationId,
                            },
                            { signal: life.signal },
                        );
                        if (settingsPending !== pending) return;
                        settingsPending = undefined;
                        settingsVersion = response.settings.version;
                        snapshot = {
                            ...snapshot,
                            settings: {
                                status: "ready",
                                retention: happyAgentVaultRetentionProject(
                                    response.settings.retention,
                                ),
                            },
                        };
                        notify();
                        return;
                    } catch (error) {
                        if (disposed || life.signal.aborted || settingsPending !== pending) return;
                        if (refused(error)) {
                            settingsPending = undefined;
                            snapshot = {
                                ...snapshot,
                                settings: { status: "ready", retention: before },
                                failure: happyAgentUserError(error),
                            };
                            notify();
                            return;
                        }
                        await waitFor(delay, life.signal);
                        delay = Math.min(delay * 2, 10_000);
                    }
                }
            })();
        },
        failureDismiss() {
            if (disposed || snapshot.failure === undefined) return;
            const { failure: _failure, ...rest } = snapshot;
            snapshot = rest;
            notify();
        },
        downloadOf(itemId, version) {
            const live = snapshot.items.get(itemId);
            if (live?.kind === "folder")
                return {
                    fileName: `${live.name}.zip`,
                    url: client.vaultFolderZipUrl(surfaceId, itemId),
                };
            const entry = contentEntryOf(itemId);
            if (entry === undefined) return undefined;
            const number = version ?? entry.latestVersion;
            if (entry.kind === "artifact")
                return {
                    // The name already ends in `.artifact`, and so does the file.
                    fileName: vaultArtifactDownloadName(entry),
                    url: client.vaultArtifactZipUrl(surfaceId, itemId, number),
                };
            return {
                fileName: entry.name,
                url: client.vaultFileContentUrl(surfaceId, itemId, number, { download: true }),
            };
        },
        thumbnailOf(entry) {
            if (
                entry.kind !== "file" ||
                !entry.mediaType.startsWith("image/") ||
                entry.size > THUMBNAIL_MAX_BYTES
            )
                return undefined;
            return client.vaultFileContentUrl(surfaceId, entry.id, entry.latestVersion);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            contentRead?.abort();
            historyRead?.abort();
            trashRead?.abort();
            contentReleaseNow();
            for (const record of uploads) record.controller.abort();
            life.abort();
            listeners.clear();
            queue = [];
        },
    };
    return store;
}
