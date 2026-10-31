import { useSyncExternalStore } from "react";
import type {
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
export function richTaskSubRowId(taskId: string, ref: RichTaskChildRef): string {
    return `${taskId}/${ref.kind}:${ref.id}`;
}

/** The task and child a sub-row id names, or `undefined` for a card's id. */
export function richTaskSubRowParse(
    id: string,
): { readonly taskId: string; readonly ref: RichTaskChildRef } | undefined {
    const match = /^([^/]+)\/(workspace|agent|artifact):(.+)$/u.exec(id);
    if (!match) return undefined;
    const kind = match[2] as RichTaskChildRef["kind"];
    return { taskId: match[1]!, ref: { kind, id: match[3]! } };
}

function subRowOf(taskId: string, child: RichTaskSubWork): RichTaskSubRowModel {
    const base = { dimmed: child.hidden };
    if (child.kind === "agent")
        return {
            ...base,
            id: richTaskSubRowId(taskId, { kind: "agent", id: child.agent.id }),
            mark: { kind: "glyph", icon: "hardware-chip-outline" },
            label: child.agent.title ?? "Subtask",
            working: child.agent.status !== "idle",
        };
    if (child.kind === "workspace")
        return {
            ...base,
            id: richTaskSubRowId(taskId, { kind: "workspace", id: child.workspace.id }),
            mark: { kind: "glyph", icon: "git-branch-outline" },
            label: child.workspace.name,
        };
    return {
        ...base,
        id: richTaskSubRowId(taskId, { kind: "artifact", id: child.artifact.id }),
        mark: { kind: "glyph", icon: ARTIFACT_GLYPHS[child.artifact.type] ?? "document-outline" },
        label: child.artifact.title,
    };
}

/**
 * What the open conversation is in the list: a subtask or workspace sub-row
 * when one is open, else the card of the task whose workspace is.
 */
function selectedOf(
    entries: readonly RichTaskListEntry[],
    tasks: readonly HappyAgentTask[],
    groupId: string | undefined,
    chatId: string | undefined,
): string | null {
    for (const entry of entries) {
        if (entry.kind !== "task") continue;
        for (const child of entry.children)
            if (
                (child.kind === "agent" && child.agent.id === chatId) ||
                (child.kind === "workspace" && child.workspace.id === groupId)
            )
                return subRowOf(entry.task.id, child).id;
    }
    return tasks.find((task) => task.workspaceId === groupId)?.id ?? null;
}

/** The minute the clock is in, so the cards' times redraw once a minute. */
function minuteOf(clock: HappyAgentClockStore): number {
    return Math.floor(clock.get() / 60_000) * 60_000;
}

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
    /** The open conversation and its group, which the selection follows. */
    readonly groupId?: string;
    readonly chatId?: string;
    readonly onSelect: (id: string) => void;
}) {
    const now = useSyncExternalStore(
        props.clock.subscribe,
        () => minuteOf(props.clock),
        () => minuteOf(props.clock),
    );
    const people = new Map<string, RichTaskFace>();
    for (const { owner } of props.tasks)
        if (owner?.userId !== undefined)
            people.set(owner.userId, {
                id: owner.userId,
                label: owner.name ?? "Someone",
                ...(owner.avatar ? { imageUrl: owner.avatar.url } : {}),
            });
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
                faces: entry.faces.flatMap((userId) => people.get(userId) ?? []),
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
            onSubRowHide={(id) => {
                const row = richTaskSubRowParse(id);
                if (row) props.store.childHide(row.taskId, row.ref);
            }}
            rows={rows}
            selectedId={selectedOf(props.entries, props.tasks, props.groupId, props.chatId)}
        />
    );
}
