import { createStore } from "zustand/vanilla";
import type { HappyCloudRequest } from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { happyAgentHandbookDraftStoreCreate } from "./handbookDraftStore.js";
import { happyAgentHandbookHistoryStoreCreate } from "./handbookHistoryStore.js";
import {
    handbookComparisonRead,
    handbookFolderPath,
    handbookFolderRead,
    handbookItemRead,
    handbookPath,
    handbookRefusalCode,
    handbookRevisionRead,
    handbookSessionRead,
    handbookStatus,
    listOf,
    recordOf,
} from "./handbookRead.js";
import {
    HAPPY_AGENT_HANDBOOK_FOLDER_DEPTH_MAX,
    type HappyAgentHandbookDraftStore,
    type HappyAgentHandbookFolder,
    type HappyAgentHandbookFolderEdit,
    type HappyAgentHandbookFolderId,
    type HappyAgentHandbookMove,
    type HappyAgentHandbookHistoryStore,
    type HappyAgentHandbookItem,
    type HappyAgentHandbookItemId,
    type HappyAgentHandbookMetadataChange,
    type HappyAgentHandbookMetadataEdit,
    type HappyAgentHandbookReview,
    type HappyAgentHandbookReviewItem,
    type HappyAgentHandbookSnapshot,
    type HappyAgentHandbookStore,
} from "./handbookTypes.js";

const HANDBOOK_EVENTS = [
    "handbook.created",
    "handbook.updated",
    "handbook.applied",
    "handbook.removed",
    "handbook.folder.created",
    "handbook.folder.updated",
    "handbook.folder.deleted",
] as const;

/** How long typing in a title or description rests before it is sent. */
const METADATA_SETTLE_MS = 600;
/**
 * How often an open review asks who is still writing in its drafts. Typing
 * reaches no journal event, so the sheet polls while it is open.
 */
const REVIEW_POLL_MS = 4_000;
/** A session that ended this recently is someone still writing. */
const EDITING_RECENT_MS = 5 * 60 * 1_000;
const LIST_PAGES_MAX = 20;

const EDITS_NONE: ReadonlyMap<HappyAgentHandbookItemId, HappyAgentHandbookMetadataEdit> = new Map();

export interface HappyAgentHandbookStoreDeps {
    readonly request: HappyCloudRequest;
    /** Where `handbook.*` events and live draft frames arrive. */
    readonly sync: HappyAgentSync;
    /** The reader's own user ID, so their own writing is not "someone still editing". */
    readonly selfUserId?: () => Promise<string | null>;
    readonly now?: () => number;
}

/** The metadata fields a PATCH sends, each only when it differs from the item. */
type MetadataFields = {
    title?: string;
    description?: string;
    alwaysInContext?: boolean;
};

/** One PATCH being sent, kept whole so a retry repeats it under the same mutation ID. */
interface MetadataSending {
    readonly mutationId: string;
    readonly fields: MetadataFields;
}

function itemOrder(
    left: HappyAgentHandbookItem | HappyAgentHandbookFolder,
    right: HappyAgentHandbookItem | HappyAgentHandbookFolder,
): number {
    // The server compares `order` bytewise; so does this, not by locale.
    if (left.order !== right.order) return left.order < right.order ? -1 : 1;
    return left.createdAt - right.createdAt;
}

/** What a folder write's refusal means, in words its dialog or the page can show. */
function folderRefusal(error: unknown, name?: string): UserError {
    switch (handbookRefusalCode(error)) {
        case "conflict":
            return new UserError(
                `There's already a folder named “${name ?? "that"}” here.`,
                "conflict",
                error,
            );
        case "not_empty":
            return new UserError(
                "Only an empty folder can be deleted. Move its pages and folders out first; removed pages still count.",
                "not_empty",
                error,
            );
    }
    switch (handbookStatus(error)) {
        case 400:
            if (name?.includes("/"))
                return new UserError("A folder name can't contain “/”.", "invalid", error);
            return new UserError(
                `Folders nest at most ${String(HAPPY_AGENT_HANDBOOK_FOLDER_DEPTH_MAX)} levels deep, and a folder can't move into itself.`,
                "invalid",
                error,
            );
        case 404:
            return new UserError("That folder no longer exists.", "not_found", error);
    }
    return happyAgentUserError(error);
}

/** What an apply refusal means, in words the review can show. */
function applyRefusal(error: unknown, titleOf: (itemId: string) => string): UserError {
    const body =
        error instanceof UserError ? recordOf((error as { body?: unknown }).body) : undefined;
    const itemId = typeof body?.itemId === "string" ? body.itemId : undefined;
    const title = itemId === undefined ? "an item" : `“${titleOf(itemId)}”`;
    switch (handbookRefusalCode(error)) {
        case "stale":
            return new UserError(
                `Someone applied newer edits to ${title} since you opened this. Close it and review again.`,
                "stale",
                error,
            );
        case "removed":
            return new UserError(`${title} was removed, so it can't be applied.`, "removed", error);
        case "handbook_budget": {
            const bytes = typeof body?.bytes === "number" ? body.bytes : undefined;
            const limit = typeof body?.limit === "number" ? body.limit : 262_144;
            const kilobytes = (value: number): string => `${String(Math.ceil(value / 1024))} KB`;
            return new UserError(
                `Items always in context would take ${bytes === undefined ? "more" : kilobytes(bytes)} than the ${kilobytes(limit)} every agent is given. Turn “Always in context” off for an item first.`,
                "handbook_budget",
                error,
            );
        }
        default:
            return happyAgentUserError(error);
    }
}

/**
 * The team's handbook on one Happy Cloud server.
 *
 * The first subscriber reads the list and what the reader may do; every
 * `handbook.*` event, and every reconnect, reads the list again. Titles,
 * descriptions and "always in context" are draft state: what the reader
 * types shows at once as an edit, is sent once typing rests, and is repeated
 * under its mutation ID until the server has it.
 *
 * The review sheet holds each item at the draft change it showed when it
 * opened. Applying publishes the drafts as of those changes, so what someone
 * writes after the sheet opened stays unapplied, and the sheet says who is
 * still writing.
 */
export function happyAgentHandbookStoreCreate(
    deps: HappyAgentHandbookStoreDeps,
): HappyAgentHandbookStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const store = createStore<HappyAgentHandbookSnapshot>()(() => ({
        status: "loading",
        folders: [],
        items: [],
        search: "",
        access: { edit: false, apply: false },
        viewerId: null,
        edits: EDITS_NONE,
        historyOpen: false,
    }));
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let follow: AbortController | undefined;
    let viewerRead: Promise<string | null> | undefined;
    const drafts = new Map<HappyAgentHandbookItemId, HappyAgentHandbookDraftStore>();
    const histories = new Map<HappyAgentHandbookItemId, HappyAgentHandbookHistoryStore>();
    const metadataTimers = new Map<HappyAgentHandbookItemId, ReturnType<typeof setTimeout>>();
    const metadataSending = new Map<HappyAgentHandbookItemId, MetadataSending>();

    /** Each opened review is its own generation; an answer for an older one is dropped. */
    let reviewGeneration = 0;
    let reviewTimer: ReturnType<typeof setTimeout> | undefined;
    /** The apply being tried, kept so a retry after no answer repeats its mutation ID. */
    let applyMutationId: string | undefined;
    /** The folder write and the move being tried, kept the same way. */
    let folderMutationId: string | undefined;
    let folderCreateId: HappyAgentHandbookFolderId | undefined;
    let moveMutationId: string | undefined;
    /**
     * Where each removed item lives. The page never shows them, but a folder
     * holding one is not empty, so deleting the folder moves them to the root.
     */
    let removedFolders: ReadonlyMap<HappyAgentHandbookItemId, HappyAgentHandbookFolderId> =
        new Map();

    const itemOf = (itemId: string): HappyAgentHandbookItem | undefined =>
        store.getState().items.find((item) => item.id === itemId);

    const itemReplace = (item: HappyAgentHandbookItem): void => {
        const current = store.getState().items;
        const next = current.some((entry) => entry.id === item.id)
            ? current.map((entry) => (entry.id === item.id ? item : entry))
            : [...current, item];
        store.setState({ items: referencesPreserve(current, [...next].sort(itemOrder)) }, false);
    };

    // ---- Reading ---------------------------------------------------------

    const listRead = async (): Promise<{
        folders: HappyAgentHandbookFolder[];
        items: HappyAgentHandbookItem[];
    }> => {
        const folders = new Map<HappyAgentHandbookFolderId, HappyAgentHandbookFolder>();
        const items: HappyAgentHandbookItem[] = [];
        const removed = new Map<HappyAgentHandbookItemId, HappyAgentHandbookFolderId>();
        let cursor: string | undefined;
        for (let page = 0; page < LIST_PAGES_MAX; page += 1) {
            const answer = recordOf(
                await deps.request(
                    "GET",
                    cursor === undefined
                        ? "v0/handbook"
                        : `v0/handbook?cursor=${encodeURIComponent(cursor)}`,
                ),
            );
            for (const entry of listOf(answer?.folders)) {
                const folder = handbookFolderRead(entry);
                if (folder) folders.set(folder.id, folder);
            }
            for (const entry of listOf(answer?.items)) {
                const read = handbookItemRead(entry);
                // A removed item is history only; the page lists what agents can be given.
                if (read && !read.removed) items.push(read.item);
                else if (read && read.item.folderId !== null)
                    removed.set(read.item.id, read.item.folderId);
            }
            if (typeof answer?.cursor !== "string" || answer.cursor.length === 0) break;
            cursor = answer.cursor;
        }
        removedFolders = removed;
        return { folders: [...folders.values()].sort(itemOrder), items: items.sort(itemOrder) };
    };

    const read = async (): Promise<void> => {
        viewerRead ??= (deps.selfUserId?.() ?? Promise.resolve(null)).catch(() => null);
        const [{ folders, items }, permissions, viewerId] = await Promise.all([
            listRead(),
            deps.request("GET", "v0/permissions"),
            viewerRead,
        ]);
        if (disposed) return;
        const granted = listOf(recordOf(permissions)?.granted);
        const current = store.getState();
        const access =
            current.access.edit === granted.includes("handbook.edit") &&
            current.access.apply === granted.includes("handbook.apply")
                ? current.access
                : {
                      edit: granted.includes("handbook.edit"),
                      apply: granted.includes("handbook.apply"),
                  };
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                status: "ready",
                folders: referencesPreserve(current.folders, folders),
                items: referencesPreserve(current.items, items),
                access,
                viewerId,
            },
            true,
        );
        editsSettle();
        reviewFollow();
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        // A change heard during a read may have landed after the server answered it.
        if (reading) {
            readAgain = true;
            return;
        }
        reading = true;
        readAgain = false;
        void read()
            .catch((error: unknown) => {
                if (!disposed)
                    store.setState({ status: "ready", error: happyAgentUserError(error) }, false);
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
            });
    }

    const followStart = (): void => {
        if (follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...HANDBOOK_EVENTS],
            })) {
                if (input.kind === "error") continue;
                load();
            }
        })().catch(() => undefined);
    };

    const followStop = (): void => {
        follow?.abort();
        follow = undefined;
        if (reviewTimer) clearTimeout(reviewTimer);
        reviewTimer = undefined;
    };

    // ---- Metadata --------------------------------------------------------

    const editSet = (
        itemId: HappyAgentHandbookItemId,
        edit: HappyAgentHandbookMetadataEdit | undefined,
    ): void => {
        const edits = new Map(store.getState().edits);
        if (edit === undefined) edits.delete(itemId);
        else edits.set(itemId, edit);
        store.setState({ edits: edits.size === 0 ? EDITS_NONE : edits }, false);
    };

    /** The typed fields that still differ from what the server holds. */
    const fieldsOf = (itemId: HappyAgentHandbookItemId): MetadataFields => {
        const edit = store.getState().edits.get(itemId);
        const item = itemOf(itemId);
        if (!edit || !item) return {};
        const fields: MetadataFields = {};
        if (edit.title !== undefined && edit.title !== item.title) fields.title = edit.title;
        if (edit.description !== undefined && edit.description !== item.description)
            fields.description = edit.description;
        if (edit.alwaysInContext !== undefined && edit.alwaysInContext !== item.alwaysInContext)
            fields.alwaysInContext = edit.alwaysInContext;
        return fields;
    };

    /** Drops typed values the server now holds, once nothing is on its way for them. */
    const editsSettle = (): void => {
        for (const [itemId, edit] of store.getState().edits) {
            if (edit.saving || edit.error || metadataTimers.has(itemId)) continue;
            if (Object.keys(fieldsOf(itemId)).length === 0) editSet(itemId, undefined);
        }
    };

    const metadataSchedule = (itemId: HappyAgentHandbookItemId, delay: number): void => {
        const timer = metadataTimers.get(itemId);
        if (timer) clearTimeout(timer);
        metadataTimers.set(
            itemId,
            setTimeout(() => {
                metadataTimers.delete(itemId);
                void metadataSend(itemId);
            }, delay),
        );
    };

    const metadataSend = async (itemId: HappyAgentHandbookItemId): Promise<void> => {
        if (disposed || metadataSending.has(itemId)) return;
        const fields = fieldsOf(itemId);
        if (Object.keys(fields).length === 0) {
            const edit = store.getState().edits.get(itemId);
            if (edit && !edit.error) editSet(itemId, undefined);
            return;
        }
        const sending: MetadataSending = { mutationId: idCreate(), fields };
        metadataSending.set(itemId, sending);
        const markSaving = (saving: boolean, error?: UserError): void => {
            const edit = store.getState().edits.get(itemId);
            if (!edit) return;
            const { error: _cleared, ...rest } = edit;
            editSet(itemId, { ...rest, saving, ...(error === undefined ? {} : { error }) });
        };
        markSaving(true);
        let delay = 1_000;
        try {
            while (!disposed) {
                try {
                    const answer = await deps.request("PATCH", handbookPath(itemId), {
                        ...sending.fields,
                        mutationId: sending.mutationId,
                    });
                    const item = handbookItemRead(recordOf(answer)?.item);
                    if (disposed) return;
                    if (item && !item.removed) itemReplace(item.item);
                    // What was sent is held now; anything typed since is not.
                    const edit = store.getState().edits.get(itemId);
                    if (edit) {
                        const rest: HappyAgentHandbookMetadataEdit = {
                            saving: false,
                            ...(edit.title !== undefined && edit.title !== sending.fields.title
                                ? { title: edit.title }
                                : {}),
                            ...(edit.description !== undefined &&
                            edit.description !== sending.fields.description
                                ? { description: edit.description }
                                : {}),
                            ...(edit.alwaysInContext !== undefined &&
                            edit.alwaysInContext !== sending.fields.alwaysInContext
                                ? { alwaysInContext: edit.alwaysInContext }
                                : {}),
                        };
                        editSet(itemId, rest);
                    }
                    return;
                } catch (error) {
                    if (disposed) return;
                    if (handbookStatus(error) !== undefined) {
                        markSaving(false, happyAgentUserError(error));
                        return;
                    }
                    // Never answered: the same change, under the same mutation ID.
                    await new Promise<void>((resolve) => setTimeout(resolve, delay));
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            metadataSending.delete(itemId);
            if (!disposed) {
                const edit = store.getState().edits.get(itemId);
                if (edit && !edit.error && Object.keys(fieldsOf(itemId)).length > 0)
                    metadataSchedule(itemId, 0);
                else editsSettle();
            }
        }
    };

    const metadataUpdate = (
        itemId: HappyAgentHandbookItemId,
        change: MetadataFields,
        delay: number,
    ): void => {
        const state = store.getState();
        if (disposed || !state.access.edit || !itemOf(itemId)) return;
        const edit = state.edits.get(itemId);
        const { error: _cleared, ...rest } = edit ?? { saving: false };
        editSet(itemId, { ...rest, ...change });
        metadataSchedule(itemId, delay);
    };

    // ---- Review ----------------------------------------------------------

    const reviewSet = (review: HappyAgentHandbookReview | undefined): void => {
        const state = store.getState();
        if (review === undefined) {
            const { review: _closed, ...rest } = state;
            store.setState(rest, true);
        } else store.setState({ review }, false);
    };

    const reviewItemUpdate = (
        generation: number,
        itemId: HappyAgentHandbookItemId,
        change: (item: HappyAgentHandbookReviewItem) => HappyAgentHandbookReviewItem,
    ): void => {
        const review = store.getState().review;
        if (!review || generation !== reviewGeneration || disposed) return;
        reviewSet({
            ...review,
            items: review.items.map((entry) => (entry.itemId === itemId ? change(entry) : entry)),
        });
    };

    /** The applied text and the draft as of `baseSeq`, which the sheet compares. */
    const comparisonRead = (generation: number, entry: HappyAgentHandbookReviewItem): void => {
        void handbookComparisonRead(
            deps.request,
            entry.itemId,
            entry.applied === null ? { seq: 0 } : { revision: entry.applied.revision },
            { seq: entry.baseSeq },
        ).then(
            (comparison) =>
                reviewItemUpdate(generation, entry.itemId, (item) => ({
                    ...item,
                    comparison: { type: "ready", value: comparison },
                })),
            (error: unknown) =>
                reviewItemUpdate(generation, entry.itemId, (item) => ({
                    ...item,
                    comparison: { type: "error", error: happyAgentUserError(error) },
                })),
        );
    };

    /** The metadata an apply publishes with new values, against the revision agents follow. */
    const metadataRead = (generation: number, entry: HappyAgentHandbookReviewItem): void => {
        const applied = entry.applied;
        if (applied === null) return;
        void deps
            .request("GET", handbookPath(entry.itemId, `/revisions/${String(applied.revision)}`))
            .then((answer) => {
                const revision = handbookRevisionRead(answer);
                const item = itemOf(entry.itemId);
                if (!revision || !item) throw new Error("The revision could not be read.");
                const changes: HappyAgentHandbookMetadataChange[] = [];
                if (revision.title !== item.title)
                    changes.push({ field: "title", from: revision.title, to: item.title });
                if (revision.description !== item.description)
                    changes.push({
                        field: "description",
                        from: revision.description,
                        to: item.description,
                    });
                if (revision.alwaysInContext !== item.alwaysInContext)
                    changes.push({
                        field: "alwaysInContext",
                        from: revision.alwaysInContext,
                        to: item.alwaysInContext,
                    });
                reviewItemUpdate(generation, entry.itemId, (current) => ({
                    ...current,
                    metadata: { type: "ready", value: changes },
                }));
            })
            .catch((error: unknown) =>
                reviewItemUpdate(generation, entry.itemId, (current) => ({
                    ...current,
                    metadata: { type: "error", error: happyAgentUserError(error) },
                })),
            );
    };

    /** Who is still writing in a reviewed draft, from its newest edit session. */
    const editingRead = (generation: number, entry: HappyAgentHandbookReviewItem): void => {
        void deps
            .request("GET", handbookPath(entry.itemId, "/sessions?limit=1"))
            .then((answer) => {
                const session = handbookSessionRead(listOf(recordOf(answer)?.sessions)[0]);
                const viewerId = store.getState().viewerId;
                reviewItemUpdate(generation, entry.itemId, (item) => {
                    const userId = session?.actor.userId ?? null;
                    const past = session !== undefined && session.toSeq > item.baseSeq;
                    const recent =
                        session !== undefined &&
                        userId !== viewerId &&
                        now() - session.endedAt < EDITING_RECENT_MS;
                    const editing = userId !== null && (past || recent) ? [userId] : ([] as const);
                    const changed = item.changedSinceOpened || past;
                    if (
                        changed === item.changedSinceOpened &&
                        editing.length === item.editingUserIds.length &&
                        editing.every((id, index) => item.editingUserIds[index] === id)
                    )
                        return item;
                    return { ...item, editingUserIds: editing, changedSinceOpened: changed };
                });
            })
            .catch(() => undefined);
    };

    const reviewPoll = (generation: number): void => {
        if (reviewTimer) clearTimeout(reviewTimer);
        reviewTimer = undefined;
        if (disposed || listeners.size === 0 || generation !== reviewGeneration) return;
        const review = store.getState().review;
        if (!review) return;
        for (const entry of review.items) editingRead(generation, entry);
        reviewTimer = setTimeout(() => reviewPoll(generation), REVIEW_POLL_MS);
    };

    /** The list moved on: a reviewed draft past its `baseSeq` has changed since the sheet opened. */
    const reviewFollow = (): void => {
        const review = store.getState().review;
        if (!review) return;
        let changed = false;
        const items = review.items.map((entry) => {
            const item = itemOf(entry.itemId);
            if (!item || entry.changedSinceOpened || item.draftSeq <= entry.baseSeq) return entry;
            changed = true;
            return { ...entry, changedSinceOpened: true };
        });
        if (changed) reviewSet({ ...review, items });
    };

    // ---- Folders and failures --------------------------------------------

    /** Sets or clears one optional field of the snapshot, leaving no `undefined` key behind. */
    const optionalSet = <Key extends "failure" | "folderEdit" | "move">(
        key: Key,
        value: HappyAgentHandbookSnapshot[Key],
    ): void => {
        if (disposed) return;
        const state = store.getState();
        if (value === undefined) {
            if (state[key] === undefined) return;
            const rest = { ...state };
            delete rest[key];
            store.setState(rest, true);
        } else store.setState({ [key]: value }, false);
    };

    /** Records why a page or folder action did not happen, and hands the error back. */
    const failureSet = (failure: UserError | undefined): UserError | undefined => {
        optionalSet("failure", failure);
        return failure;
    };
    const folderEditSet = (edit: HappyAgentHandbookFolderEdit | undefined): void =>
        optionalSet("folderEdit", edit);
    const moveSet = (move: HappyAgentHandbookMove | undefined): void => optionalSet("move", move);

    const folderOf = (folderId: string): HappyAgentHandbookFolder | undefined =>
        store.getState().folders.find((folder) => folder.id === folderId);

    /** How deep a folder sits: a top-level folder is 1. */
    const folderDepth = (folderId: HappyAgentHandbookFolderId): number => {
        let depth = 0;
        let current = folderOf(folderId);
        while (current && depth <= HAPPY_AGENT_HANDBOOK_FOLDER_DEPTH_MAX) {
            depth += 1;
            current = current.parentId === null ? undefined : folderOf(current.parentId);
        }
        return depth;
    };

    const folderReplace = (folder: HappyAgentHandbookFolder): void => {
        const current = store.getState().folders;
        const next = current.some((entry) => entry.id === folder.id)
            ? current.map((entry) => (entry.id === folder.id ? folder : entry))
            : [...current, folder];
        store.setState({ folders: referencesPreserve(current, [...next].sort(itemOrder)) }, false);
    };

    // ---- Public ----------------------------------------------------------

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                load();
                if (store.getState().review) reviewPoll(reviewGeneration);
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) followStop();
            };
        },
        async itemCreate(title, folderId) {
            if (disposed) throw new UserError("The handbook is closed.");
            if (!store.getState().access.edit)
                return Promise.reject(
                    failureSet(new UserError("You can't add to the handbook.", "forbidden")),
                );
            failureSet(undefined);
            const id = idCreate() as HappyAgentHandbookItemId;
            let answer: unknown;
            try {
                answer = await deps.request("POST", "v0/handbook", {
                    id,
                    title,
                    ...(folderId === null ? {} : { folderId }),
                    mutationId: idCreate(),
                });
            } catch (error) {
                throw failureSet(
                    handbookStatus(error) === 404
                        ? folderRefusal(error)
                        : happyAgentUserError(error),
                );
            }
            const created = handbookItemRead(recordOf(answer)?.item);
            if (created && !disposed) itemReplace(created.item);
            load();
            return created?.item.id ?? id;
        },
        titleUpdate(itemId, value) {
            metadataUpdate(itemId, { title: value }, METADATA_SETTLE_MS);
        },
        descriptionUpdate(itemId, value) {
            metadataUpdate(itemId, { description: value }, METADATA_SETTLE_MS);
        },
        alwaysInContextUpdate(itemId, value) {
            metadataUpdate(itemId, { alwaysInContext: value }, 0);
        },
        itemDiscard(itemId) {
            if (disposed) return;
            if (!store.getState().access.edit) {
                failureSet(new UserError("You can't change the handbook.", "forbidden"));
                return;
            }
            failureSet(undefined);
            void deps
                .request("POST", handbookPath(itemId, "/discard"), { mutationId: idCreate() })
                .then(
                    () => load(),
                    (error: unknown) => {
                        failureSet(happyAgentUserError(error));
                    },
                );
        },
        async itemRemove(itemId) {
            if (disposed) return false;
            if (!store.getState().access.apply) {
                failureSet(
                    new UserError(
                        "Only people who can apply the handbook can remove a page.",
                        "forbidden",
                    ),
                );
                return false;
            }
            failureSet(undefined);
            try {
                await deps.request("POST", handbookPath(itemId, "/remove"), {
                    mutationId: idCreate(),
                });
            } catch (error) {
                failureSet(happyAgentUserError(error));
                return false;
            }
            if (disposed) return true;
            const current = store.getState().items;
            store.setState({ items: current.filter((item) => item.id !== itemId) }, false);
            load();
            return true;
        },
        failureDismiss() {
            failureSet(undefined);
        },
        searchUpdate(value) {
            if (!disposed && store.getState().search !== value)
                store.setState({ search: value }, false);
        },
        folderCreateOpen(parentId) {
            const state = store.getState();
            if (disposed || !state.access.edit || state.folderEdit?.saving) return;
            if (parentId !== null && folderDepth(parentId) >= HAPPY_AGENT_HANDBOOK_FOLDER_DEPTH_MAX)
                return;
            folderMutationId = undefined;
            folderCreateId = undefined;
            folderEditSet({
                target: { kind: "create", parentId },
                name: "",
                icon: null,
                saving: false,
            });
        },
        folderEditOpen(folderId) {
            const state = store.getState();
            const folder = folderOf(folderId);
            if (disposed || !state.access.edit || !folder || state.folderEdit?.saving) return;
            folderMutationId = undefined;
            folderEditSet({
                target: { kind: "edit", folderId },
                name: folder.name,
                icon: folder.icon,
                saving: false,
            });
        },
        folderNameUpdate(value) {
            const edit = store.getState().folderEdit;
            if (!edit || edit.saving || edit.name === value) return;
            const { error: _cleared, ...rest } = edit;
            folderEditSet({ ...rest, name: value });
        },
        folderIconUpdate(value) {
            const edit = store.getState().folderEdit;
            if (!edit || edit.saving || edit.icon === value) return;
            const { error: _cleared, ...rest } = edit;
            folderEditSet({ ...rest, icon: value });
        },
        folderSubmit() {
            const edit = store.getState().folderEdit;
            if (disposed || !edit || edit.saving) return;
            const name = edit.name.trim();
            if (name.length === 0) return;
            // A path names a page by its folders, separated by "/".
            if (name.includes("/")) {
                folderEditSet({
                    ...edit,
                    error: new UserError("A folder name can't contain “/”.", "invalid"),
                });
                return;
            }
            folderMutationId ??= idCreate();
            const mutationId = folderMutationId;
            const target = edit.target;
            const topLevel =
                target.kind === "create"
                    ? target.parentId === null
                    : folderOf(target.folderId)?.parentId === null;
            const { error: _cleared, ...rest } = edit;
            folderEditSet({ ...rest, saving: true });
            let request: Promise<unknown>;
            if (target.kind === "create") {
                folderCreateId ??= idCreate() as HappyAgentHandbookFolderId;
                request = deps.request("POST", handbookFolderPath(), {
                    id: folderCreateId,
                    ...(target.parentId === null ? {} : { parentId: target.parentId }),
                    name,
                    ...(topLevel && edit.icon !== null ? { icon: edit.icon } : {}),
                    mutationId,
                });
            } else {
                const folder = folderOf(target.folderId);
                request = deps.request("PATCH", handbookFolderPath(target.folderId), {
                    ...(folder?.name === name ? {} : { name }),
                    ...(topLevel && folder?.icon !== edit.icon ? { icon: edit.icon } : {}),
                    mutationId,
                });
            }
            void request.then(
                (answer) => {
                    if (disposed || store.getState().folderEdit?.target !== target) return;
                    folderMutationId = undefined;
                    folderCreateId = undefined;
                    const folder = handbookFolderRead(recordOf(answer)?.folder);
                    if (folder) folderReplace(folder);
                    folderEditSet(undefined);
                    load();
                },
                (error: unknown) => {
                    if (disposed) return;
                    if (handbookStatus(error) !== undefined) {
                        folderMutationId = undefined;
                        folderCreateId = undefined;
                    }
                    const current = store.getState().folderEdit;
                    if (current?.target !== target) return;
                    folderEditSet({ ...current, saving: false, error: folderRefusal(error, name) });
                },
            );
        },
        folderEditClose() {
            const edit = store.getState().folderEdit;
            if (!edit || edit.saving) return;
            folderMutationId = undefined;
            folderCreateId = undefined;
            folderEditSet(undefined);
        },
        folderDelete(folderId) {
            if (disposed) return;
            if (!store.getState().access.edit) {
                failureSet(new UserError("You can't change the handbook.", "forbidden"));
                return;
            }
            failureSet(undefined);
            const removed = [...removedFolders].filter(([, inside]) => inside === folderId);
            void (async () => {
                for (const [itemId] of removed)
                    await deps.request("PATCH", handbookPath(itemId), {
                        folderId: null,
                        mutationId: idCreate(),
                    });
                return deps.request(
                    "DELETE",
                    `${handbookFolderPath(folderId)}?mutationId=${encodeURIComponent(idCreate())}`,
                );
            })().then(
                () => {
                    if (disposed) return;
                    const current = store.getState().folders;
                    store.setState(
                        { folders: current.filter((folder) => folder.id !== folderId) },
                        false,
                    );
                    load();
                },
                (error: unknown) => {
                    failureSet(folderRefusal(error));
                },
            );
        },
        moveOpen(target) {
            const state = store.getState();
            if (disposed || !state.access.edit || state.move?.moving !== undefined) return;
            moveMutationId = undefined;
            moveSet({ target });
        },
        moveSubmit(folderId) {
            const move = store.getState().move;
            if (disposed || !move || move.moving !== undefined) return;
            const target = move.target;
            moveMutationId ??= idCreate();
            const mutationId = moveMutationId;
            moveSet({ target, moving: folderId });
            const request =
                target.kind === "item"
                    ? deps.request("PATCH", handbookPath(target.itemId), { folderId, mutationId })
                    : deps.request("PATCH", handbookFolderPath(target.folderId), {
                          parentId: folderId,
                          mutationId,
                      });
            void request.then(
                (answer) => {
                    if (disposed || store.getState().move?.target !== target) return;
                    moveMutationId = undefined;
                    const record = recordOf(answer);
                    const item = handbookItemRead(record?.item);
                    if (item && !item.removed) itemReplace(item.item);
                    const folder = handbookFolderRead(record?.folder);
                    if (folder) folderReplace(folder);
                    moveSet(undefined);
                    load();
                },
                (error: unknown) => {
                    if (disposed || store.getState().move?.target !== target) return;
                    if (handbookStatus(error) !== undefined) moveMutationId = undefined;
                    moveSet({ target, error: folderRefusal(error) });
                },
            );
        },
        moveClose() {
            const move = store.getState().move;
            if (!move || move.moving !== undefined) return;
            moveMutationId = undefined;
            moveSet(undefined);
        },
        historyToggle() {
            if (!disposed) store.setState({ historyOpen: !store.getState().historyOpen }, false);
        },
        reviewOpen(itemIds) {
            const state = store.getState();
            if (disposed || !state.access.apply || state.review?.applying) return;
            const items = itemIds.flatMap((itemId): HappyAgentHandbookReviewItem[] => {
                const item = itemOf(itemId);
                if (!item) return [];
                return [
                    {
                        itemId: item.id,
                        title: state.edits.get(item.id)?.title ?? item.title,
                        baseSeq: item.draftSeq,
                        applied: item.applied,
                        contributorIds: item.pendingUserIds,
                        comparison: { type: "loading" },
                        metadata:
                            item.applied === null
                                ? { type: "ready", value: [] }
                                : { type: "loading" },
                        editingUserIds: [],
                        changedSinceOpened: false,
                    },
                ];
            });
            if (items.length === 0) return;
            reviewGeneration += 1;
            applyMutationId = undefined;
            const generation = reviewGeneration;
            reviewSet({ items, note: "", applying: false });
            for (const entry of items) {
                comparisonRead(generation, entry);
                metadataRead(generation, entry);
            }
            reviewPoll(generation);
        },
        reviewNoteUpdate(value) {
            const review = store.getState().review;
            if (!review || review.applying || review.note === value) return;
            reviewSet({ ...review, note: value });
        },
        reviewSubmit() {
            const review = store.getState().review;
            if (disposed || !review || review.applying || !store.getState().access.apply) return;
            const generation = reviewGeneration;
            applyMutationId ??= idCreate();
            const mutationId = applyMutationId;
            const { error: _cleared, ...rest } = review;
            reviewSet({ ...rest, applying: true });
            const note = review.note.trim();
            void deps
                .request("POST", "v0/handbook/apply", {
                    mutationId,
                    ...(note.length === 0 ? {} : { note }),
                    items: review.items.map((entry) => ({
                        id: entry.itemId,
                        baseSeq: entry.baseSeq,
                    })),
                })
                .then(
                    () => {
                        if (disposed || generation !== reviewGeneration) return;
                        applyMutationId = undefined;
                        reviewGeneration += 1;
                        if (reviewTimer) clearTimeout(reviewTimer);
                        reviewTimer = undefined;
                        reviewSet(undefined);
                        load();
                    },
                    (error: unknown) => {
                        if (disposed || generation !== reviewGeneration) return;
                        // A refusal was an answer; applying again is a new apply.
                        if (handbookStatus(error) !== undefined) applyMutationId = undefined;
                        const current = store.getState().review;
                        if (!current) return;
                        reviewSet({
                            ...current,
                            applying: false,
                            error: applyRefusal(
                                error,
                                (itemId) =>
                                    current.items.find((entry) => entry.itemId === itemId)?.title ??
                                    "this item",
                            ),
                        });
                    },
                );
        },
        reviewClose() {
            const review = store.getState().review;
            if (!review || review.applying) return;
            reviewGeneration += 1;
            applyMutationId = undefined;
            if (reviewTimer) clearTimeout(reviewTimer);
            reviewTimer = undefined;
            reviewSet(undefined);
        },
        draft(itemId) {
            let draft = drafts.get(itemId);
            if (draft === undefined) {
                draft = happyAgentHandbookDraftStoreCreate({
                    request: deps.request,
                    sync: deps.sync,
                    itemId,
                    ...(deps.now === undefined ? {} : { now: deps.now }),
                });
                if (!disposed) drafts.set(itemId, draft);
            }
            return draft;
        },
        history(itemId) {
            let history = histories.get(itemId);
            if (history === undefined) {
                history = happyAgentHandbookHistoryStoreCreate({
                    request: deps.request,
                    sync: deps.sync,
                    itemId,
                    ...(deps.now === undefined ? {} : { now: deps.now }),
                });
                if (!disposed) histories.set(itemId, history);
            }
            return history;
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            followStop();
            for (const timer of metadataTimers.values()) clearTimeout(timer);
            metadataTimers.clear();
            for (const draft of drafts.values()) draft[Symbol.dispose]();
            drafts.clear();
            for (const history of histories.values()) history[Symbol.dispose]();
            histories.clear();
            listeners.clear();
        },
    };
}
