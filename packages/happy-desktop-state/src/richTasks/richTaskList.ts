/*
 * The rich task list: which tasks the reader sees, under which section, and
 * which of each task's sub-work stands under its card.
 *
 * The input shapes mirror protocol 34 (API.md, "Rich tasks"): `TaskIcon`,
 * `TaskChildRef`, `TaskChild` (a child choice), `TaskMembership.hidden`,
 * `TaskSection`, and the agent's `unread.from`, plus the worktree line totals
 * the client already holds. They stay local until the client package is
 * pinned; then its types replace them one for one.
 */

export type RichTaskChildRef = {
    readonly kind: "workspace" | "agent" | "artifact";
    readonly id: string;
};

/** `TaskIcon`: a slug from the icon library; the type set may grow. */
export type RichTaskIcon = { readonly type: "library"; readonly slug: string };

/** `TaskChild`: one choice about a (task, child) pair, shared by every member. No choice is the default. */
export type RichTaskChildChoice = {
    readonly ref: RichTaskChildRef;
    readonly visibility: "shown" | "hidden";
    readonly by: { readonly agentId: string | null; readonly userId: string | null };
    readonly updatedAt: number;
};

export type RichTaskAgent = {
    readonly id: string;
    readonly title: string;
    readonly status: "idle" | "working" | "error";
    readonly pendingQuestionId: string | null;
    readonly lastActivityAt: number;
    readonly statusLine: { readonly text: string } | null;
    /** `from`: the people whose messages arrived since the reader last read it, newest first. */
    readonly unread: {
        readonly reason: string;
        readonly since: number;
        readonly from?: readonly string[];
    } | null;
    readonly subtasks: readonly RichTaskAgent[];
};

export type RichTask = {
    readonly id: string;
    readonly name: string;
    readonly agent: RichTaskAgent;
    readonly icon?: RichTaskIcon | null;
    readonly children?: readonly RichTaskChildChoice[];
};

export type RichTaskMembership = {
    readonly taskId: string;
    readonly orderKey: string;
    readonly hidden?: boolean;
};

/** A header in the memberships' order-key space: it heads every task keyed after it. */
export type RichTaskSection = {
    readonly id: string;
    readonly name: string;
    readonly orderKey: string;
    readonly collapsed: boolean;
};

export type RichTaskWorkspace = {
    readonly id: string;
    readonly name: string;
    readonly projectId: string;
    readonly creatorAgentId: string | null;
    readonly subtaskAgentId?: string | null;
    readonly updatedAt: number;
    readonly addedLines: number;
    readonly deletedLines: number;
};

export type RichTaskArtifact = {
    readonly id: string;
    readonly type: string;
    readonly title: string;
    readonly source: { readonly agentId: string | null };
    readonly updatedAt: number;
};

/** One sub-row; `hidden` ones are drawn only while the card is expanded. */
export type RichTaskSubWork = { readonly hidden: boolean } & (
    | { readonly kind: "agent"; readonly agent: RichTaskAgent }
    | { readonly kind: "workspace"; readonly workspace: RichTaskWorkspace }
    | { readonly kind: "artifact"; readonly artifact: RichTaskArtifact }
);

export type RichTaskEntry = {
    readonly kind: "task";
    readonly task: RichTask;
    /** The sub-rows drawn under the card, most urgent first. */
    readonly children: readonly RichTaskSubWork[];
    /** How many children are not drawn: the "+k more" count. */
    readonly more: number;
    readonly expanded: boolean;
    /** `unread.from` without the reader: the faces beside the dot. */
    readonly faces: readonly string[];
};

export type RichTaskListEntry =
    | { readonly kind: "section"; readonly section: RichTaskSection }
    | RichTaskEntry;

export type RichTaskListInput = {
    readonly tasks: readonly RichTask[];
    readonly memberships: readonly RichTaskMembership[];
    readonly sections: readonly RichTaskSection[];
    readonly workspaces: readonly RichTaskWorkspace[];
    readonly artifacts: readonly RichTaskArtifact[];
    /** The reader, left out of the faces; `null` for the standalone person. */
    readonly viewerUserId: string | null;
    /** Cards the reader opened with "+k more". */
    readonly expandedTaskIds: ReadonlySet<string>;
};

/** How many sub-rows a card shows before "+k more". */
export const RICH_TASK_SHOWN_CHILDREN = 3;

function descendants(agent: RichTaskAgent): readonly RichTaskAgent[] {
    return agent.subtasks.flatMap((subtask) => [subtask, ...descendants(subtask)]);
}

function childKey(ref: RichTaskChildRef): string {
    return `${ref.kind}:${ref.id}`;
}

function childAt(child: RichTaskSubWork): number {
    if (child.kind === "agent") return child.agent.lastActivityAt;
    if (child.kind === "workspace") return child.workspace.updatedAt;
    return child.artifact.updatedAt;
}

/** A subtask waiting on the reader comes first; then the most recently active. */
function urgencyOrder(left: RichTaskSubWork, right: RichTaskSubWork): number {
    const asks = (child: RichTaskSubWork) =>
        child.kind === "agent" && child.agent.pendingQuestionId !== null ? 0 : 1;
    return asks(left) - asks(right) || childAt(right) - childAt(left);
}

/**
 * A task's sub-work: the workspaces and artifacts its agents made and the
 * subtasks that are working or asking (derived), plus what an edge shows,
 * minus what an edge hides.
 */
export function richTaskChildren(
    task: RichTask,
    workspaces: readonly RichTaskWorkspace[],
    artifacts: readonly RichTaskArtifact[],
): readonly RichTaskSubWork[] {
    const subtasks = descendants(task.agent);
    const agentIds = new Set([task.agent.id, ...subtasks.map((agent) => agent.id)]);
    const owned = (id: string | null | undefined) => id != null && agentIds.has(id);
    const said = new Map(
        (task.children ?? []).map((edge) => [childKey(edge.ref), edge.visibility]),
    );
    const children: RichTaskSubWork[] = [];
    // Shown by an edge, or derived and not hidden by one; derived and hidden waits behind "+k more".
    const consider = (
        ref: RichTaskChildRef,
        derived: boolean,
        child: (hidden: boolean) => RichTaskSubWork,
    ) => {
        const visibility = said.get(childKey(ref));
        if (visibility === "shown" || (derived && visibility === undefined))
            children.push(child(false));
        else if (derived) children.push(child(true));
    };
    for (const agent of subtasks)
        consider(
            { kind: "agent", id: agent.id },
            agent.status === "working" || agent.pendingQuestionId !== null,
            (hidden) => ({ kind: "agent", agent, hidden }),
        );
    for (const workspace of workspaces)
        consider(
            { kind: "workspace", id: workspace.id },
            owned(workspace.creatorAgentId) || owned(workspace.subtaskAgentId),
            (hidden) => ({ kind: "workspace", workspace, hidden }),
        );
    for (const artifact of artifacts)
        if (artifact.type !== "story")
            consider(
                { kind: "artifact", id: artifact.id },
                owned(artifact.source.agentId),
                (hidden) => ({ kind: "artifact", artifact, hidden }),
            );
    return children.sort(urgencyOrder);
}

/**
 * The reader's list in order: section headers and tasks interleaved by order
 * key, hidden memberships and tasks under a collapsed section left out, and
 * each task's sub-rows cut to the first three unless the card is expanded.
 */
export function richTaskList(input: RichTaskListInput): readonly RichTaskListEntry[] {
    const tasks = new Map(input.tasks.map((task) => [task.id, task]));
    type Keyed =
        | { orderKey: string; section: RichTaskSection }
        | { orderKey: string; task: RichTask };
    const keyed: Keyed[] = [
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
    for (const item of keyed) {
        if ("section" in item) {
            collapsed = item.section.collapsed;
            entries.push({ kind: "section", section: item.section });
            continue;
        }
        if (collapsed) continue;
        const task = item.task;
        const children = richTaskChildren(task, input.workspaces, input.artifacts);
        const expanded = input.expandedTaskIds.has(task.id);
        const visible = children.filter((child) => !child.hidden);
        const drawn = expanded
            ? [...visible, ...children.filter((child) => child.hidden)]
            : visible.slice(0, RICH_TASK_SHOWN_CHILDREN);
        entries.push({
            kind: "task",
            task,
            children: drawn,
            more: children.length - drawn.length,
            expanded,
            faces: (task.agent.unread?.from ?? []).filter(
                (userId) => userId !== input.viewerUserId,
            ),
        });
    }
    return entries;
}
