import type { CSSProperties, ReactNode } from "react";
import type {
    HappyAgentBackgroundProcess,
    HappyAgentGoal,
    HappyAgentGoalStatus,
    SubagentSummary,
    HappyAgentTodo,
    HappyAgentTaskStatus,
} from "happy-desktop-state";
import { Button } from "./Button";
import { ChangeStats } from "./ChangeStats";
import { CompactActivityRow } from "./CompactActivityRow";
import { changeCountLabel } from "./countText";
import { DelegatedAgentActivity } from "./DelegatedAgentActivity";
import { ScrollArea } from "./Scrollbar";

/** Where a cloud conversation's shell, file and git tools run. */
export type HappyAgentActivityCompute =
    | { readonly kind: "none" }
    | {
          readonly kind: "computer";
          /** The computer's name. */
          readonly label: string;
          /** Absent until the server has said. */
          readonly online?: boolean;
      };

/**
 * A repository a cloud conversation's agent checked out, or is checking out. A
 * failed checkout is not listed: its failure is told on the tool call that ran it.
 */
export interface HappyAgentActivityRepository {
    readonly id: string;
    readonly name: string;
    readonly branch: string;
    readonly checkout: "pending" | "ready";
    /** The agent may read it but not push to it. */
    readonly readOnly?: boolean;
    /** What the agent changed in it, once Git has counted; nothing changed draws no counts. */
    readonly changes?: {
        readonly files: number;
        readonly added: number;
        readonly deleted: number;
    };
}

export type HappyAgentActivityPanelProps = {
    /**
     * The computer the conversation's tools run on. Absent where the agent
     * does not join computers; `none` before it has joined one.
     */
    compute?: HappyAgentActivityCompute;
    /** The repositories the agent checked out, one row each. */
    repositories?: readonly HappyAgentActivityRepository[];
    /**
     * What the chat changed, published and delegated, listed ahead of the
     * session's own activity. Present, the panel is never empty.
     */
    leading?: ReactNode;
    /** The session's persistent goal, when one is set (`/goal`). */
    goal?: HappyAgentGoal;
    /** The session task list in display order (`/tasks`). */
    tasks: readonly HappyAgentTodo[];
    /** Delegated subagents for the live monitor (`/agents`). */
    subagents: readonly SubagentSummary[];
    /** Background terminals (`/ps`), running and exited. */
    backgroundProcesses: readonly HappyAgentBackgroundProcess[];
    /** Requests termination of one background terminal (`/stop`); omit to hide the control. */
    onBackgroundProcessStop?: (processId: number) => void;
    /** Opens one delegated child session through the owning workspace. */
    onSubagentSelect?: (sessionId: string) => void;
    /** Reference "now" (epoch millis) for computing subagent elapsed time. */
    now: number;
    /** `panel` fills and scrolls a side-panel tab; the default is inline content. */
    placement?: "content" | "panel";
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

const GOAL_STATUS_LABELS: Record<HappyAgentGoalStatus, string> = {
    active: "Active",
    blocked: "Blocked",
    complete: "Done",
    paused: "Paused",
};

const TASK_STATUS_LABELS: Record<HappyAgentTaskStatus, string> = {
    pending: "Pending",
    in_progress: "In progress",
    completed: "Done",
};

function priorityOrdered<T>(items: readonly T[], priority: (item: T) => number): readonly T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort(
            (left, right) => priority(left.item) - priority(right.item) || left.index - right.index,
        )
        .map(({ item }) => item);
}

function taskPriority(task: HappyAgentTodo): number {
    return task.status === "in_progress" ? 0 : task.status === "pending" ? 1 : 2;
}

function subagentPriority(subagent: SubagentSummary): number {
    switch (subagent.status) {
        case "running":
            return 0;
        case "queued":
            return 1;
        case "idle":
            return 2;
        case "suspended":
            return 3;
        case "completed":
            return 4;
        case "aborted":
        case "error":
        case "archived":
            return 5;
    }
}

/** Newest first, by when it last moved; ties keep the order they arrived in. */
function newestFirst<T>(items: readonly T[], at: (item: T) => number): readonly T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort((left, right) => at(right.item) - at(left.item) || left.index - right.index)
        .map(({ item }) => item);
}

function processOutcome(process: HappyAgentBackgroundProcess): string {
    if (process.status === "running") return "running";
    return process.exitCode === undefined ? "ended" : `exit ${String(process.exitCode)}`;
}

function SectionHeading(props: { count?: number; label: string }) {
    return (
        <h3 className="happy-agent-activity__heading">
            <span
                className="happy-agent-activity__heading-label"
                data-happy-desktop-ui="happy-agent-activity-heading-label"
            >
                {props.label}
            </span>
            {props.count === undefined ? null : (
                <span className="happy-agent-activity__count">{props.count}</span>
            )}
        </h3>
    );
}

function GoalSection(props: { goal: HappyAgentGoal }) {
    const { goal } = props;
    return (
        <section
            className="happy-agent-activity__section"
            data-happy-desktop-ui="happy-agent-activity-goal"
        >
            <SectionHeading label="Goal" />
            <div
                className="happy-agent-activity__list"
                data-happy-desktop-ui="happy-agent-activity-list"
            >
                <CompactActivityRow
                    arguments={[goal.objective]}
                    accessibleLabel={`Goal ${goal.objective}, ${GOAL_STATUS_LABELS[goal.status]}`}
                    icon="tasks"
                    meta={[GOAL_STATUS_LABELS[goal.status]]}
                    placement="panel"
                    verb="Goal"
                />
            </div>
        </section>
    );
}

function TaskRow(props: { task: HappyAgentTodo }) {
    const { task } = props;
    const label = task.status === "in_progress" && task.activeForm ? task.activeForm : task.subject;
    return (
        <li
            className="happy-agent-activity__task"
            data-happy-desktop-ui="happy-agent-activity-task"
        >
            <CompactActivityRow
                arguments={[label]}
                accessibleLabel={`Task ${label}, ${TASK_STATUS_LABELS[task.status]}`}
                icon="tasks"
                meta={[TASK_STATUS_LABELS[task.status]]}
                placement="panel"
                verb="Task"
            />
        </li>
    );
}

function SubagentRow(props: {
    subagent: SubagentSummary;
    now: number;
    onSelect?: (sessionId: string) => void;
}) {
    const { subagent, now } = props;
    return (
        <li
            className="happy-agent-activity__subagent"
            data-happy-desktop-ui="happy-agent-activity-subagent"
        >
            <DelegatedAgentActivity
                child={{
                    sessionId: subagent.id,
                    description: subagent.description,
                    ...(subagent.taskName === undefined ? {} : { taskName: subagent.taskName }),
                    modelId: subagent.modelId,
                    status: subagent.status,
                    ...(subagent.activeSince === undefined
                        ? {}
                        : { activeSince: subagent.activeSince }),
                    ...(subagent.elapsedMs === undefined ? {} : { elapsedMs: subagent.elapsedMs }),
                    ...(subagent.totalTokens === undefined
                        ? {}
                        : { totalTokens: subagent.totalTokens }),
                }}
                completedLabel="Done"
                now={now}
                onSelect={props.onSelect}
                placement="panel"
            />
        </li>
    );
}

function BackgroundProcessRow(props: {
    process: HappyAgentBackgroundProcess;
    onStop?: (processId: number) => void;
}) {
    const { process } = props;
    return (
        <li
            className="happy-agent-activity__process"
            data-happy-desktop-ui="happy-agent-activity-process"
        >
            <CompactActivityRow
                arguments={[process.command]}
                accessibleLabel={`Terminal ${process.command}, ${processOutcome(process)}`}
                icon="terminal"
                meta={[processOutcome(process), process.cwd]}
                placement="panel"
                trailing={
                    props.onStop && process.status === "running" ? (
                        <span
                            data-happy-desktop-ui="happy-agent-activity-process-stop"
                            data-testid="happy-agent-activity-process-stop"
                        >
                            <Button
                                onClick={() => props.onStop?.(process.id)}
                                size="small"
                                variant="ghost"
                            >
                                Stop
                            </Button>
                        </span>
                    ) : undefined
                }
                verb="Terminal"
            />
        </li>
    );
}

function computeLabel(compute: HappyAgentActivityCompute): string {
    if (compute.kind === "none")
        return "No computer is joined. The agent joins one when the work needs it.";
    return `Runs on ${compute.label}${compute.online === false ? ", offline" : ""}`;
}

function ComputeSection(props: { compute: HappyAgentActivityCompute }) {
    const { compute } = props;
    return (
        <section
            className="happy-agent-activity__section"
            data-happy-desktop-ui="happy-agent-activity-compute"
        >
            <SectionHeading label="Compute" />
            <div
                className="happy-agent-activity__list"
                data-happy-desktop-ui="happy-agent-activity-list"
            >
                <CompactActivityRow
                    arguments={[compute.kind === "none" ? "None" : compute.label]}
                    accessibleLabel={computeLabel(compute)}
                    icon="terminal"
                    meta={[
                        compute.kind === "none"
                            ? "joined when the work needs it"
                            : compute.online === undefined
                              ? "runs the agent's tools"
                              : compute.online
                                ? "online"
                                : "offline",
                    ]}
                    placement="panel"
                    verb="Computer"
                />
            </div>
        </section>
    );
}

function repositoryLabel(repository: HappyAgentActivityRepository): string {
    const where = `Works in ${repository.name}, branch ${repository.branch}`;
    const access = repository.readOnly ? ", read-only" : "";
    const checkout = repository.checkout === "pending" ? ", checking out" : "";
    const changes = repository.changes;
    if (!changes || changes.files === 0) return `${where}${access}${checkout}`;
    const files = `${String(changes.files)} ${changes.files === 1 ? "file" : "files"} changed`;
    return `${where}${access}${checkout}. ${files}, ${changeCountLabel(changes.added, changes.deleted)}`;
}

function RepositoryRow(props: { repository: HappyAgentActivityRepository }) {
    const { repository } = props;
    const changes = repository.changes;
    return (
        <li
            className="happy-agent-activity__repository"
            data-checkout={repository.checkout}
            data-happy-desktop-ui="happy-agent-activity-repository"
        >
            <CompactActivityRow
                arguments={[repository.name]}
                accessibleLabel={repositoryLabel(repository)}
                icon={repository.readOnly ? "lock" : "repository"}
                meta={[
                    repository.branch,
                    ...(repository.checkout === "pending" ? ["checking out"] : []),
                    ...(repository.readOnly ? ["read-only"] : []),
                ]}
                placement="panel"
                trailing={
                    repository.checkout === "ready" &&
                    changes &&
                    (changes.added > 0 || changes.deleted > 0) ? (
                        <ChangeStats added={changes.added} deleted={changes.deleted} />
                    ) : undefined
                }
                verb="Repository"
            />
        </li>
    );
}

function RepositorySection(props: { repositories: readonly HappyAgentActivityRepository[] }) {
    if (props.repositories.length === 0) return null;
    return (
        <section
            className="happy-agent-activity__section"
            data-happy-desktop-ui="happy-agent-activity-repositories"
        >
            <SectionHeading count={props.repositories.length} label="Repositories" />
            <ul
                className="happy-agent-activity__list"
                data-happy-desktop-ui="happy-agent-activity-list"
            >
                {props.repositories.map((repository) => (
                    <RepositoryRow key={repository.id} repository={repository} />
                ))}
            </ul>
        </section>
    );
}

function AgentSection(props: {
    agents: readonly SubagentSummary[];
    now: number;
    onSelect?: (sessionId: string) => void;
}) {
    if (props.agents.length === 0) return null;
    return (
        <section
            className="happy-agent-activity__section"
            data-happy-desktop-ui="happy-agent-activity-subagents"
        >
            <SectionHeading count={props.agents.length} label="Agents" />
            <ul
                className="happy-agent-activity__list"
                data-happy-desktop-ui="happy-agent-activity-list"
            >
                {props.agents.map((subagent) => (
                    <SubagentRow
                        key={subagent.id}
                        now={props.now}
                        onSelect={props.onSelect}
                        subagent={subagent}
                    />
                ))}
            </ul>
        </section>
    );
}

function TerminalSection(props: {
    processes: readonly HappyAgentBackgroundProcess[];
    onStop?: (processId: number) => void;
}) {
    if (props.processes.length === 0) return null;
    return (
        <section
            className="happy-agent-activity__section"
            data-happy-desktop-ui="happy-agent-activity-processes"
        >
            <SectionHeading count={props.processes.length} label="Terminals" />
            <ul
                className="happy-agent-activity__list"
                data-happy-desktop-ui="happy-agent-activity-list"
            >
                {props.processes.map((process) => (
                    <BackgroundProcessRow
                        key={process.id}
                        process={process}
                        onStop={props.onStop}
                    />
                ))}
            </ul>
        </section>
    );
}

/**
 * HappyAgentActivityPanel — the read-only session activity monitor combining the TUI's
 * `/goal`, `/tasks`, `/agents`, and `/ps` views. Where the work happens — the
 * computer its tools run on and the repositories it checked out — heads the
 * panel, because it changes least; then live agents and terminals lead;
 * everything that finished stays listed after them as a record, newest first,
 * and nothing is folded away. An optional
 * selection callback turns agent readouts into session-navigation buttons. Every
 * value flows from the reactive session snapshot (reconciled from
 * `tasks_changed`/`goal_changed`/`subagent_changed`/`background_processes_changed`
 * SSE events), so this component holds no product state and starts no work.
 */
export function HappyAgentActivityPanel(props: HappyAgentActivityPanelProps) {
    const { goal, tasks, subagents, backgroundProcesses } = props;
    const orderedTasks = priorityOrdered(tasks, taskPriority);
    const orderedSubagents = priorityOrdered(subagents, subagentPriority);
    const runningSubagents = orderedSubagents.filter(
        (subagent) =>
            subagent.status === "idle" ||
            subagent.status === "queued" ||
            subagent.status === "running" ||
            subagent.status === "suspended",
    );
    const finishedSubagents = newestFirst(
        subagents.filter(
            (subagent) =>
                subagent.status === "completed" ||
                subagent.status === "aborted" ||
                subagent.status === "error" ||
                subagent.status === "archived",
        ),
        (subagent) => subagent.updatedAt,
    );
    const runningProcesses = backgroundProcesses.filter((process) => process.status === "running");
    const exitedProcesses = newestFirst(
        backgroundProcesses.filter((process) => process.status === "exited"),
        (process) => process.endedAt ?? process.startedAt ?? 0,
    );
    const hasRunning = runningSubagents.length > 0 || runningProcesses.length > 0;
    const hasFinished = finishedSubagents.length > 0 || exitedProcesses.length > 0;
    const empty =
        props.leading === undefined &&
        goal === undefined &&
        tasks.length === 0 &&
        subagents.length === 0 &&
        backgroundProcesses.length === 0;
    const content = (
        <section
            className={["happy-agent-activity", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-activity-panel"
            data-placement={props.placement === "panel" ? "panel" : undefined}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {props.compute ? <ComputeSection compute={props.compute} /> : null}
            {props.repositories ? <RepositorySection repositories={props.repositories} /> : null}
            {props.leading}
            {empty ? (
                <p
                    className="happy-agent-activity__empty"
                    data-happy-desktop-ui="happy-agent-activity-empty"
                >
                    Nothing has happened in this chat yet.
                </p>
            ) : (
                <>
                    {hasRunning ? (
                        <section
                            className="happy-agent-activity__group"
                            data-happy-desktop-ui="happy-agent-activity-running"
                        >
                            <h2 className="happy-agent-activity__group-heading">Running</h2>
                            <div className="happy-agent-activity__group-content">
                                <AgentSection
                                    agents={runningSubagents}
                                    now={props.now}
                                    onSelect={props.onSubagentSelect}
                                />
                                <TerminalSection
                                    processes={runningProcesses}
                                    onStop={props.onBackgroundProcessStop}
                                />
                            </div>
                        </section>
                    ) : null}

                    {goal ? <GoalSection goal={goal} /> : null}

                    {tasks.length > 0 ? (
                        <section
                            className="happy-agent-activity__section"
                            data-happy-desktop-ui="happy-agent-activity-tasks"
                        >
                            <SectionHeading count={tasks.length} label="Tasks" />
                            <ul
                                className="happy-agent-activity__list"
                                data-happy-desktop-ui="happy-agent-activity-list"
                            >
                                {orderedTasks.map((task) => (
                                    <TaskRow key={task.id} task={task} />
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {hasFinished ? (
                        <section
                            className="happy-agent-activity__group"
                            data-happy-desktop-ui="happy-agent-activity-finished"
                        >
                            <h2 className="happy-agent-activity__group-heading">Finished</h2>
                            <div className="happy-agent-activity__group-content">
                                <AgentSection
                                    agents={finishedSubagents}
                                    now={props.now}
                                    onSelect={props.onSubagentSelect}
                                />
                                <TerminalSection processes={exitedProcesses} />
                            </div>
                        </section>
                    ) : null}
                </>
            )}
        </section>
    );
    return props.placement === "panel" ? (
        <ScrollArea
            axes="both"
            className="happy-agent-activity-panel-scroll"
            data-happy-desktop-ui="happy-agent-activity-panel-scroll"
            viewportClassName="happy-agent-activity-panel-scroll__viewport"
        >
            <div className="happy-agent-activity-panel-scroll__content">{content}</div>
        </ScrollArea>
    ) : (
        content
    );
}
