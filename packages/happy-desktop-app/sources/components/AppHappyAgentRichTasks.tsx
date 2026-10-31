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
 * What the open conversation is in the list: the subtask sub-row or card that
 * is it, else a sub-row for its workspace, else the card of its workspace.
 */
function selectedOf(
    entries: readonly RichTaskListEntry[],
    tasks: readonly HappyAgentTask[],
    groupId: string | undefined,
    chatId: string | undefined,
): string | null {
    const cards = entries.flatMap((entry) => (entry.kind === "task" ? [entry] : []));
    const own = (task: HappyAgentTask) => task.conversation.id === chatId;
    for (const match of [
        (child: RichTaskSubWork) => child.kind === "agent" && child.agent.id === chatId,
        (child: RichTaskSubWork) => child.kind === "workspace" && child.workspace.id === groupId,
    ]) {
        for (const entry of cards) {
            const child = entry.children.find(match);
            if (child) return subRowOf(entry.task.id, child).id;
        }
        // After the subtasks, before the workspaces: the card whose own conversation is open.
        const card = tasks.find(own);
        if (card && chatId !== undefined) return card.id;
    }
    return tasks.find((task) => task.workspaceId === groupId)?.id ?? null;
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();
const NO_SUBSCRIBE = () => () => undefined;
const NO_NAMES_GET = () => NO_NAMES;

/**
 * A writer's face: a task owner's photo, else the name the connection knows,
 * else a placeholder while the name is read.
 */
function faceOf(
    userId: string,
    owners: ReadonlyMap<string, RichTaskFace>,
    names: ReadonlyMap<string, string>,
    people: HappyAgentArtifactPeopleStore | undefined,
): RichTaskFace {
    const owner = owners.get(userId);
    if (owner) return owner;
    const name = names.get(userId);
    if (name === undefined) people?.userNameRequest(userId);
    return name === undefined
        ? { id: userId, label: "Someone", initials: "?" }
        : { id: userId, label: name };
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
    /** Everyone else the connection can name, read as a face needs them. */
    readonly people?: HappyAgentArtifactPeopleStore;
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
    const names = useSyncExternalStore(
        props.people?.subscribe ?? NO_SUBSCRIBE,
        props.people?.get ?? NO_NAMES_GET,
        props.people?.get ?? NO_NAMES_GET,
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
                faces: entry.faces.map((userId) => faceOf(userId, people, names, props.people)),
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
            onTaskMove={props.store.taskMove}
            onSubRowHide={(id) => {
                const row = richTaskSubRowParse(id);
                if (row) props.store.childHide(row.taskId, row.ref);
            }}
            rows={rows}
            selectedId={selectedOf(props.entries, props.tasks, props.groupId, props.chatId)}
        />
    );
}
