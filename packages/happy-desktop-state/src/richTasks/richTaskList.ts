/*
 * The rich task list: which tasks the reader sees, under which section, and
 * which of each task's sub-work stands under its card. Inputs are the client's
 * protocol-34 types narrowed to the fields read, so wire objects and small
 * fixtures both fit.
 */
import type {
    Agent,
    Artifact,
    Task,
    TaskChildRef,
    TaskMembership,
    TaskSection,
    Workspace,
} from "@slopus/happy-agent-client";

export type RichTaskChildRef = TaskChildRef;

/** An agent as the list reads it; `unread.from` names who wrote since the reader last read it. */
export type RichTaskAgent = Pick<
    Agent,
    "id" | "title" | "status" | "pendingQuestionId" | "unread"
> & {
    readonly lastActivityAt?: number;
    readonly statusLine?: { readonly text: string } | null;
    readonly subtasks?: readonly RichTaskAgent[];
};

export type RichTask = Pick<Task, "id" | "name" | "icon" | "children"> & {
    readonly agent: RichTaskAgent;
};

/** A workspace, with the line totals over main when the client holds them. */
export type RichTaskWorkspace = Pick<
    Workspace,
    "id" | "name" | "projectId" | "creatorAgentId" | "subtaskAgentId" | "updatedAt"
> & { readonly addedLines?: number; readonly deletedLines?: number };

export type RichTaskArtifact = Pick<Artifact, "id" | "type" | "title" | "updatedAt"> & {
    readonly source: { readonly agentId: string | null };
};

/** One sub-row; `hidden` ones are drawn only while the card is expanded. */
export type RichTaskSubWork = { readonly hidden: boolean } & (
    | { readonly kind: "agent"; readonly agent: RichTaskAgent }
    | { readonly kind: "workspace"; readonly workspace: RichTaskWorkspace }
    | { readonly kind: "artifact"; readonly artifact: RichTaskArtifact }
);

export type RichTaskListEntry =
    | { readonly kind: "section"; readonly section: TaskSection }
    | {
          readonly kind: "task";
          readonly task: RichTask;
          /** The task icon's picture once read; absent while it loads, without a hash, or unreadable. */
          readonly iconSrc?: string;
          /** The sub-rows drawn under the card, most urgent first. */
          readonly children: readonly RichTaskSubWork[];
          /** How many children are not drawn: the "+k more" count. */
          readonly more: number;
          readonly expanded: boolean;
          /** `unread.from` without the reader: the faces beside the dot. */
          readonly faces: readonly string[];
      };

export type RichTaskListInput = {
    readonly tasks: readonly RichTask[];
    /** Every agent the client holds: a "shown" choice may put any of them, or their subtasks, under a task. */
    readonly agents: readonly RichTaskAgent[];
    readonly memberships: readonly Pick<TaskMembership, "taskId" | "orderKey" | "hidden">[];
    readonly sections: readonly TaskSection[];
    readonly workspaces: readonly RichTaskWorkspace[];
    readonly artifacts: readonly RichTaskArtifact[];
    /** The reader, left out of the faces; `null` for the standalone person. */
    readonly viewerUserId: string | null;
    /** Cards the reader opened with "+k more". */
    readonly expandedTaskIds: ReadonlySet<string>;
};

/** How many sub-rows a card shows before "+k more". */
const SHOWN_CHILDREN = 3;

const descendants = (agent: RichTaskAgent): readonly RichTaskAgent[] =>
    (agent.subtasks ?? []).flatMap((subtask) => [subtask, ...descendants(subtask)]);

const childAt = (child: RichTaskSubWork): number =>
    child.kind === "agent"
        ? (child.agent.lastActivityAt ?? 0)
        : (child.kind === "workspace" ? child.workspace : child.artifact).updatedAt;

/** A subtask waiting on the reader comes first; then the most recently active. */
const asks = (child: RichTaskSubWork) =>
    child.kind === "agent" && child.agent.pendingQuestionId !== null ? 0 : 1;

/**
 * A task's sub-work: the workspaces and artifacts its agents made and the
 * subtasks that are working or asking (derived), plus what a choice shows,
 * minus what a choice hides. A shown child is looked up in the whole
 * collections, since it may be something the task did not make.
 */
function richTaskChildren(task: RichTask, input: RichTaskListInput): RichTaskSubWork[] {
    const subtasks = descendants(task.agent);
    const subtaskIds = new Set(subtasks.map((agent) => agent.id));
    const owned = (id: string | null | undefined) =>
        id != null && (id === task.agent.id || subtaskIds.has(id));
    const said = new Map(
        (task.children ?? []).map((edge) => [`${edge.ref.kind}:${edge.ref.id}`, edge.visibility]),
    );
    const children: RichTaskSubWork[] = [];
    // Shown by an edge, or derived and not hidden by one; derived and hidden waits behind "+k more".
    const consider = (ref: TaskChildRef, derived: boolean, child: RichTaskSubWork) => {
        const visibility = said.get(`${ref.kind}:${ref.id}`);
        if (visibility === "shown" || (derived && visibility === undefined)) children.push(child);
        else if (derived) children.push({ ...child, hidden: true });
    };
    const candidates = new Map(
        [...subtasks, ...input.agents.flatMap((agent) => [agent, ...descendants(agent)])].map(
            (agent) => [agent.id, agent],
        ),
    );
    candidates.delete(task.agent.id);
    for (const agent of candidates.values())
        consider(
            { kind: "agent", id: agent.id },
            subtaskIds.has(agent.id) &&
                (agent.status !== "idle" || agent.pendingQuestionId !== null),
            { kind: "agent", agent, hidden: false },
        );
    for (const workspace of input.workspaces)
        consider(
            { kind: "workspace", id: workspace.id },
            owned(workspace.creatorAgentId) || owned(workspace.subtaskAgentId),
            { kind: "workspace", workspace, hidden: false },
        );
    for (const artifact of input.artifacts)
        if (artifact.type !== "story")
            consider({ kind: "artifact", id: artifact.id }, owned(artifact.source.agentId), {
                kind: "artifact",
                artifact,
                hidden: false,
            });
    return children.sort(
        (left, right) => asks(left) - asks(right) || childAt(right) - childAt(left),
    );
}

/**
 * The reader's list in order: section headers and tasks interleaved by order
 * key, hidden memberships and tasks under a collapsed section left out, and
 * each task's sub-rows cut to the first three unless the card is expanded.
 */
export function richTaskList(input: RichTaskListInput): readonly RichTaskListEntry[] {
    const tasks = new Map(input.tasks.map((task) => [task.id, task]));
    const keyed: { orderKey: string; section?: TaskSection; task?: RichTask }[] = [
        ...input.sections.map((section) => ({ orderKey: section.orderKey, section })),
        ...input.memberships.flatMap((membership) => {
            const task = tasks.get(membership.taskId);
            return task && !membership.hidden ? [{ orderKey: membership.orderKey, task }] : [];
        }),
    ];
    // Plain string order, as the classic list compares order keys.
    keyed.sort((left, right) =>
        left.orderKey < right.orderKey ? -1 : left.orderKey > right.orderKey ? 1 : 0,
    );
    const entries: RichTaskListEntry[] = [];
    let collapsed = false;
    for (const { section, task } of keyed) {
        if (section) {
            collapsed = section.collapsed;
            entries.push({ kind: "section", section });
            continue;
        }
        if (collapsed || !task) continue;
        const children = richTaskChildren(task, input);
        const expanded = input.expandedTaskIds.has(task.id);
        const visible = children.filter((child) => !child.hidden);
        const drawn = expanded
            ? [...visible, ...children.filter((child) => child.hidden)]
            : visible.slice(0, SHOWN_CHILDREN);
        const faces = (task.agent.unread?.from ?? []).filter((id) => id !== input.viewerUserId);
        entries.push({
            kind: "task",
            task,
            children: drawn,
            more: children.length - drawn.length,
            expanded,
            faces,
        });
    }
    return entries;
}
