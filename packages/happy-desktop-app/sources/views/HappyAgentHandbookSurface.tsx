import { useSyncExternalStore } from "react";
import type {
    HappyAgentClockStore,
    HappyAgentHandbookComparison,
    HappyAgentHandbookDraftSnapshot,
    HappyAgentHandbookDraftStore,
    HappyAgentHandbookFolderId,
    HappyAgentHandbookHistoryEntry,
    HappyAgentHandbookHistorySnapshot,
    HappyAgentHandbookHistoryStore,
    HappyAgentHandbookItem,
    HappyAgentHandbookItemId,
    HappyAgentHandbookMetadataChange,
    HappyAgentHandbookReviewItem,
    HappyAgentHandbookStore,
    HappyAgentTeamRoster,
    Loadable,
} from "happy-desktop-state";
import {
    HappyAgentHandbookPage,
    handbookPath,
    handbookTreeOf,
    localAgoTime,
    localClockTime,
    localDayTime,
    type DocumentEditorUser,
    type HappyAgentHandbookComparisonView,
    type HappyAgentHandbookEditorContent,
    type HappyAgentHandbookEditorProps,
    type HappyAgentHandbookFolderDialogProps,
    type HappyAgentHandbookPageProps,
    type HappyAgentHandbookHistoryPanelProps,
    type HappyAgentHandbookHistoryRow,
    type HappyAgentHandbookMetadataChangeView,
    type HappyAgentHandbookPerson,
    type HappyAgentHandbookReviewEntry,
    type HappyAgentHandbookReviewSheetProps,
} from "happy-desktop-ui";

/** Stands in for the draft and history stores while no item asks for one, so hooks stay unconditional. */
const DRAFT_NONE_SNAPSHOT: HappyAgentHandbookDraftSnapshot = {
    itemId: "" as HappyAgentHandbookItemId,
    status: "missing",
};
const DRAFT_NONE: HappyAgentHandbookDraftStore = {
    get: () => DRAFT_NONE_SNAPSHOT,
    subscribe: () => () => undefined,
    presenceUpdate: () => undefined,
    pointerPressUpdate: () => undefined,
    [Symbol.dispose]: () => undefined,
};
const HISTORY_NONE_SNAPSHOT: HappyAgentHandbookHistorySnapshot = {
    itemId: "" as HappyAgentHandbookItemId,
    status: "loading",
    entries: [],
    more: false,
    loadingMore: false,
    expanded: new Map(),
};
const HISTORY_NONE: HappyAgentHandbookHistoryStore = {
    get: () => HISTORY_NONE_SNAPSHOT,
    subscribe: () => () => undefined,
    sessionsMore: () => undefined,
    entryToggle: () => undefined,
    entryRestore: () => undefined,
    [Symbol.dispose]: () => undefined,
};

const METADATA_LABELS = {
    title: "Title",
    description: "Description",
    alwaysInContext: "Always in context",
} as const satisfies Record<HappyAgentHandbookMetadataChange["field"], string>;

/** A member by the name the team knows them by, the reader as "You". */
function personOf(
    team: HappyAgentTeamRoster | undefined,
    userId: string,
): HappyAgentHandbookPerson {
    if (userId === team?.viewerId) {
        const self = team.members.find((member) => member.id === userId);
        return { id: userId, name: "You", ...(self?.imageUrl ? { imageUrl: self.imageUrl } : {}) };
    }
    const member = team?.members.find((entry) => entry.id === userId);
    return {
        id: userId,
        name: member?.name ?? "A person",
        ...(member?.imageUrl ? { imageUrl: member.imageUrl } : {}),
    };
}

function comparisonView(
    comparison: Loadable<HappyAgentHandbookComparison> | undefined,
): HappyAgentHandbookComparisonView {
    if (comparison?.type === "ready")
        return { kind: "ready", before: comparison.value.before, after: comparison.value.after };
    if (comparison?.type === "error") return { kind: "error", message: comparison.error.message };
    return { kind: "loading" };
}

function metadataValue(value: string | boolean): string {
    if (typeof value === "boolean") return value ? "On" : "Off";
    return value === "" ? "Empty" : value;
}

/**
 * The team's handbook on one Happy Cloud server: its items, the one the
 * address opens with its live draft and history, and the apply review. Each
 * part stays current on its own from the server's handbook events.
 */
export function HappyAgentHandbookSurface(props: {
    readonly handbook: HappyAgentHandbookStore;
    /** The page the address opens; the home when none is named. */
    readonly itemId?: string;
    readonly clock: HappyAgentClockStore;
    /** Names whose edits these are; without it they are "A person". */
    readonly team?: HappyAgentTeamRoster;
    /** The reader as everyone else in a draft sees their caret. */
    readonly user: DocumentEditorUser;
    onItemOpen(itemId?: string): void;
}) {
    const handbook = props.handbook;
    const snapshot = useSyncExternalStore(handbook.subscribe, handbook.get, handbook.get);
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const team = props.team;
    const people = (userIds: readonly string[]) => userIds.map((userId) => personOf(team, userId));
    const selected: HappyAgentHandbookItem | undefined =
        props.itemId === undefined
            ? undefined
            : snapshot.items.find((item) => item.id === props.itemId);
    const folders = snapshot.folders.map((folder) => ({
        id: folder.id,
        parentId: folder.parentId,
        name: folder.name,
        icon: folder.icon,
    }));
    const items = snapshot.items.map((item) => ({
        id: item.id,
        title: snapshot.edits.get(item.id)?.title ?? item.title,
        description: snapshot.edits.get(item.id)?.description ?? item.description,
        folderId: item.folderId,
        alwaysInContext: snapshot.edits.get(item.id)?.alwaysInContext ?? item.alwaysInContext,
        pending: item.pending,
        revision: item.applied?.revision ?? null,
        pendingPeople: people(item.pendingUserIds),
    }));
    const tree = handbookTreeOf(folders, items);
    const draftStore = selected ? handbook.draft(selected.id) : DRAFT_NONE;
    const draft = useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get);
    const historyStore =
        selected && snapshot.historyOpen ? handbook.history(selected.id) : HISTORY_NONE;
    const history = useSyncExternalStore(
        historyStore.subscribe,
        historyStore.get,
        historyStore.get,
    );
    const canEdit = snapshot.access.edit;
    const canApply = snapshot.access.apply;

    const editor = ((): HappyAgentHandbookEditorProps | undefined => {
        if (!selected) return undefined;
        const edit = snapshot.edits.get(selected.id);
        const content = ((): HappyAgentHandbookEditorContent => {
            if (draft.status !== "live") return { kind: draft.status };
            return {
                kind: "live",
                ydoc: draft.ydoc,
                user: props.user,
                presence: draft.presence,
                onPresence: draftStore.presenceUpdate,
                onPointerPress: draftStore.pointerPressUpdate,
                sync: draft.sync,
                ...(draft.failure === undefined ? {} : { failure: draft.failure.message }),
            };
        })();
        const itemId = selected.id;
        return {
            itemId,
            title: edit?.title ?? selected.title,
            description: edit?.description ?? selected.description,
            alwaysInContext: edit?.alwaysInContext ?? selected.alwaysInContext,
            revision: selected.applied?.revision ?? null,
            pending: selected.pending,
            pendingPeople: people(selected.pendingUserIds),
            editedLabel: `edited ${localAgoTime(selected.updatedAt, now)}`,
            ...(edit?.error === undefined ? {} : { metadataError: edit.error.message }),
            canEdit,
            canApply,
            content,
            historyOpen: snapshot.historyOpen,
            onTitleChange: (value) => handbook.titleUpdate(itemId, value),
            onDescriptionChange: (value) => handbook.descriptionUpdate(itemId, value),
            onAlwaysInContextChange: (value) => handbook.alwaysInContextUpdate(itemId, value),
            onHistoryToggle: handbook.historyToggle,
            onApply: () => handbook.reviewOpen([itemId]),
            onDiscard: () => handbook.itemDiscard(itemId),
            onMove: () => handbook.moveOpen({ kind: "item", itemId }),
            onHandbookOpen: () => props.onItemOpen(),
            breadcrumb: handbookPath(tree, selected.folderId),
            onRemove: () =>
                void handbook.itemRemove(itemId).then((removed) => {
                    if (removed) props.onItemOpen();
                }),
        };
    })();

    const historyPanel = ((): HappyAgentHandbookHistoryPanelProps | undefined => {
        if (!selected || !snapshot.historyOpen) return undefined;
        const appliedRevision = selected.applied?.revision ?? null;
        const row = (entry: HappyAgentHandbookHistoryEntry): HappyAgentHandbookHistoryRow => {
            if (entry.kind === "revision") {
                const revision = entry.revision;
                return {
                    kind: "revision",
                    key: entry.key,
                    revision: revision.revision,
                    appliedBy: personOf(team, revision.appliedBy),
                    when: localAgoTime(revision.appliedAt, now),
                    ...(revision.note === null ? {} : { note: revision.note }),
                    contributors: people(revision.contributors),
                    current: revision.revision === appliedRevision,
                };
            }
            const session = entry.session;
            const actor = session.actor;
            const person = actor.userId === null ? undefined : personOf(team, actor.userId);
            const author: HappyAgentHandbookPerson =
                actor.agentId === null
                    ? (person ?? { id: entry.key, name: "Someone" })
                    : {
                          id: actor.agentId,
                          name:
                              person === undefined
                                  ? "An agent"
                                  : person.name === "You"
                                    ? "Your agent"
                                    : `${person.name}'s agent`,
                      };
            const start = localDayTime(session.startedAt, now);
            const sameMinute =
                localClockTime(session.startedAt) === localClockTime(session.endedAt);
            return {
                kind: "session",
                key: entry.key,
                author,
                when: sameMinute ? start : `${start}–${localClockTime(session.endedAt)}`,
                changes: session.changes,
            };
        };
        return {
            status: history.status,
            ...(history.error === undefined ? {} : { error: history.error.message }),
            rows: history.entries.map(row),
            expanded: new Map(
                [...history.expanded].map(([key, comparison]) => [key, comparisonView(comparison)]),
            ),
            more: history.more,
            loadingMore: history.loadingMore,
            ...(history.restoring === undefined ? {} : { restoring: history.restoring }),
            ...(history.restoreError === undefined
                ? {}
                : { restoreError: history.restoreError.message }),
            canEdit,
            onToggle: historyStore.entryToggle,
            onRestore: historyStore.entryRestore,
            onMore: historyStore.sessionsMore,
            onClose: handbook.historyToggle,
        };
    })();

    const review = ((): HappyAgentHandbookReviewSheetProps | undefined => {
        const open = snapshot.review;
        if (!open) return undefined;
        const entry = (item: HappyAgentHandbookReviewItem): HappyAgentHandbookReviewEntry => ({
            id: item.itemId,
            title: item.title,
            revision: item.applied?.revision ?? null,
            contributors: people(item.contributorIds),
            metadata:
                item.metadata.type === "ready"
                    ? {
                          kind: "ready",
                          changes: item.metadata.value.map(
                              (change): HappyAgentHandbookMetadataChangeView => ({
                                  label: METADATA_LABELS[change.field],
                                  from: metadataValue(change.from),
                                  to: metadataValue(change.to),
                              }),
                          ),
                      }
                    : item.metadata.type === "error"
                      ? { kind: "error", message: item.metadata.error.message }
                      : { kind: "loading" },
            comparison: comparisonView(item.comparison),
            editing: people(item.editingUserIds),
            changedSinceOpened: item.changedSinceOpened,
        });
        return {
            entries: open.items.map(entry),
            note: open.note,
            applying: open.applying,
            ...(open.error === undefined ? {} : { error: open.error.message }),
            onNoteChange: handbook.reviewNoteUpdate,
            onApply: handbook.reviewSubmit,
            onClose: handbook.reviewClose,
        };
    })();

    const folderEdit = snapshot.folderEdit;
    const folderDialog = ((): HappyAgentHandbookFolderDialogProps | undefined => {
        if (!folderEdit) return undefined;
        const target = folderEdit.target;
        const parentId =
            target.kind === "create"
                ? target.parentId
                : (snapshot.folders.find((folder) => folder.id === target.folderId)?.parentId ??
                  null);
        return {
            mode: target.kind,
            topLevel: parentId === null,
            ...(target.kind === "create" && parentId !== null
                ? { parentPath: handbookPath(tree, parentId).join(" › ") }
                : {}),
            name: folderEdit.name,
            icon: folderEdit.icon,
            saving: folderEdit.saving,
            ...(folderEdit.error === undefined ? {} : { error: folderEdit.error.message }),
            onNameChange: handbook.folderNameUpdate,
            onIconChange: handbook.folderIconUpdate,
            onSubmit: handbook.folderSubmit,
            onClose: handbook.folderEditClose,
        };
    })();

    const moving = snapshot.move;
    const move = ((): HappyAgentHandbookPageProps["move"] => {
        if (!moving) return undefined;
        const target = moving.target;
        const item =
            target.kind === "item"
                ? snapshot.items.find((entry) => entry.id === target.itemId)
                : undefined;
        const folder =
            target.kind === "folder"
                ? snapshot.folders.find((entry) => entry.id === target.folderId)
                : undefined;
        const shown = item
            ? {
                  target: {
                      kind: "item" as const,
                      id: item.id,
                      title: snapshot.edits.get(item.id)?.title ?? item.title,
                  },
                  current: item.folderId,
              }
            : folder
              ? {
                    target: { kind: "folder" as const, id: folder.id, title: folder.name },
                    current: folder.parentId,
                }
              : undefined;
        if (!shown) return undefined;
        return {
            ...shown,
            ...(moving.moving === undefined ? {} : { moving: moving.moving }),
            ...(moving.error === undefined ? {} : { error: moving.error.message }),
            onMove: (folderId) =>
                handbook.moveSubmit(folderId as HappyAgentHandbookFolderId | null),
            onClose: handbook.moveClose,
        };
    })();

    const asFolder = (folderId: string) => folderId as HappyAgentHandbookFolderId;
    return (
        <HappyAgentHandbookPage
            canApply={canApply}
            canEdit={canEdit}
            {...(editor ? { editor } : {})}
            {...(snapshot.error === undefined ? {} : { error: snapshot.error.message })}
            {...(snapshot.failure === undefined ? {} : { failure: snapshot.failure.message })}
            {...(folderDialog ? { folderDialog } : {})}
            folders={folders}
            {...(historyPanel ? { history: historyPanel } : {})}
            items={items}
            {...(move ? { move } : {})}
            onApplyAll={() =>
                handbook.reviewOpen(
                    snapshot.items.filter((item) => item.pending).map((item) => item.id),
                )
            }
            onFailureDismiss={handbook.failureDismiss}
            onFolderCreate={(parentId) =>
                handbook.folderCreateOpen(parentId === null ? null : asFolder(parentId))
            }
            onFolderDelete={(folderId) => handbook.folderDelete(asFolder(folderId))}
            onFolderEdit={(folderId) => handbook.folderEditOpen(asFolder(folderId))}
            onFolderMove={(folderId) =>
                handbook.moveOpen({ kind: "folder", folderId: asFolder(folderId) })
            }
            onHome={() => props.onItemOpen()}
            // A refusal stands in the page's failure banner.
            onItemCreate={(folderId) =>
                void handbook
                    .itemCreate("Untitled", folderId === null ? null : asFolder(folderId))
                    .then(props.onItemOpen, () => undefined)
            }
            onItemSelect={props.onItemOpen}
            onSearchChange={handbook.searchUpdate}
            {...(review ? { review } : {})}
            search={snapshot.search}
            {...(selected ? { selectedId: selected.id } : {})}
            status={snapshot.status}
        />
    );
}
