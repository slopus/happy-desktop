import { useSyncExternalStore } from "react";
import type {
    HappyAgentArtifactPeopleStore,
    HappyAgentClockStore,
    HappyAgentRichTasksStore,
    HappyAgentTask,
    RichTaskChildRef,
    RichTaskListEntry,
    RichTaskSubWork,
} from "happy-desktop-state";
import {
    localAgoTime,
    RichTaskList,
    type IoniconName,
    type RichTaskFace,
    type RichTaskListRow,
    type RichTaskSubRowModel,
    type StoryRingSegments,
} from "happy-desktop-ui";

const ARTIFACT_GLYPHS: Readonly<Record<string, IoniconName>> = {
    html: "globe-outline",
    document: "document-text-outline",
    markdown: "document-text-outline",
    video: "play-outline",
    image: "image-outline",
    image_series: "images-outline",
};

/** A sub-row's id: unique in the list, since one child can stand under two tasks. */
const subRowId = (taskId: string, ref: RichTaskChildRef) => `${taskId}/${ref.kind}:${ref.id}`;

/** The task and child a sub-row id names, or `undefined` for a card's id. */
export function richTaskSubRowParse(
    id: string,
): { readonly taskId: string; readonly ref: RichTaskChildRef } | undefined {
    const match = /^([^/]+)\/(workspace|agent|artifact):(.+)$/u.exec(id);
    if (!match) return undefined;
    return {
        taskId: match[1]!,
        ref: { kind: match[2] as RichTaskChildRef["kind"], id: match[3]! },
    };
}

const refOf = (child: RichTaskSubWork): RichTaskChildRef => ({
    kind: child.kind,
    id: (child.kind === "agent"
        ? child.agent
        : child.kind === "workspace"
          ? child.workspace
          : child.artifact
    ).id,
});

function subRowOf(taskId: string, child: RichTaskSubWork): RichTaskSubRowModel {
    const base = { id: subRowId(taskId, refOf(child)), dimmed: child.hidden };
    if (child.kind === "agent")
        return {
            ...base,
            mark: { kind: "glyph", icon: "hardware-chip-outline" },
            label: child.agent.title ?? "Subtask",
            working: child.agent.status !== "idle",
        };
    if (child.kind === "workspace")
        return {
            ...base,
            mark: { kind: "glyph", icon: "git-branch-outline" },
            label: child.workspace.name,
        };
    const icon = ARTIFACT_GLYPHS[child.artifact.type] ?? "document-outline";
    return { ...base, mark: { kind: "glyph", icon }, label: child.artifact.title };
}

/**
 * What the open conversation is in the list: the subtask sub-row, else the
 * card that is it, else a sub-row for its workspace, else its workspace's card.
 */
function selectedOf(
    entries: readonly RichTaskListEntry[],
    tasks: readonly HappyAgentTask[],
    groupId: string | undefined,
    chatId: string | undefined,
): string | null {
    const child = (match: (child: RichTaskSubWork) => boolean) => {
        for (const entry of entries) {
            const found = entry.kind === "task" ? entry.children.find(match) : undefined;
            if (found && entry.kind === "task") return subRowId(entry.task.id, refOf(found));
        }
        return undefined;
    };
    return (
        child((found) => found.kind === "agent" && found.agent.id === chatId) ??
        (chatId === undefined
            ? undefined
            : tasks.find((task) => task.conversation.id === chatId)?.id) ??
        child((found) => found.kind === "workspace" && found.workspace.id === groupId) ??
        tasks.find((task) => task.workspaceId === groupId)?.id ??
        null
    );
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();
const NO_SUBSCRIBE = () => () => undefined;
const NO_NAMES_GET = () => NO_NAMES;

/**
 * The Tasks area in rich mode: the state projection worded and pictured for
 * the cards. Opening, folding and hiding go to the owner and the store.
 */
export function AppHappyAgentRichTasks(props: {
    readonly entries: readonly RichTaskListEntry[];
    readonly store: HappyAgentRichTasksStore;
    readonly clock: HappyAgentClockStore;
    /** The reader's tasks as the classic list knows them, for their owners' faces. */
    readonly tasks: readonly HappyAgentTask[];
    /** Everyone else the connection can name, read as a face needs them. */
    readonly people?: HappyAgentArtifactPeopleStore;
    /** The open conversation and its group, which the selection follows. */
    readonly groupId?: string;
    readonly chatId?: string;
    /** Each task's live stories, by task id: the ring around its card's disc. */
    readonly stories?: ReadonlyMap<string, StoryRingSegments>;
    readonly onStoryOpen?: (taskId: string) => void;
    readonly onSelect: (id: string) => void;
}) {
    // The minute the clock is in, so the cards' times redraw once a minute.
    const minute = () => Math.floor(props.clock.get() / 60_000) * 60_000;
    const now = useSyncExternalStore(props.clock.subscribe, minute, minute);
    const names = useSyncExternalStore(
        props.people?.subscribe ?? NO_SUBSCRIBE,
        props.people?.get ?? NO_NAMES_GET,
        props.people?.get ?? NO_NAMES_GET,
    );
    const owners = new Map<string, RichTaskFace>();
    for (const { owner } of props.tasks)
        if (owner?.userId !== undefined)
            owners.set(owner.userId, {
                id: owner.userId,
                label: owner.name ?? "Someone",
                ...(owner.avatar ? { imageUrl: owner.avatar.url } : {}),
            });
    /** A writer's face: a task owner's photo, else the name the connection knows, else a placeholder while it is read. */
    const faceOf = (userId: string): RichTaskFace => {
        const name = names.get(userId);
        if (owners.has(userId)) return owners.get(userId)!;
        if (name !== undefined) return { id: userId, label: name };
        props.people?.userNameRequest(userId);
        return { id: userId, label: "Someone", initials: "?" };
    };
    const rows = props.entries.map((entry): RichTaskListRow => {
        if (entry.kind === "section") return { kind: "section", ...entry.section };
        const { task } = entry;
        return {
            kind: "task",
            card: {
                id: task.id,
                title: task.name,
                time: localAgoTime(task.agent.lastActivityAt ?? now, now),
                status: task.agent.statusLine?.text ?? null,
                iconSlug: task.icon?.slug ?? null,
                story: props.stories?.get(task.id),
                faces: entry.faces.map(faceOf),
                signal: task.agent.unread
                    ? "unread"
                    : task.agent.status !== "idle"
                      ? "working"
                      : null,
                subRows: entry.children.map((child) => subRowOf(task.id, child)),
                more: entry.more,
                expanded: entry.expanded,
            },
        };
    });
    return (
        <RichTaskList
            onMoreToggle={props.store.taskExpandToggle}
            onSectionCollapseToggle={props.store.sectionCollapseToggle}
            onSelect={props.onSelect}
            onStoryOpen={props.onStoryOpen}
            onSubRowHide={(id) => {
                const row = richTaskSubRowParse(id);
                if (row) props.store.childHide(row.taskId, row.ref);
            }}
            onTaskMove={props.store.taskMove}
            rows={rows}
            selectedId={selectedOf(props.entries, props.tasks, props.groupId, props.chatId)}
        />
    );
}
