import type { CSSProperties } from "react";
import type {
    HappyAgentBackgroundProcess,
    HappyAgentGoal,
    HappyAgentGoalStatus,
    SubagentSummary,
    HappyAgentTodo,
    HappyAgentTaskStatus,
} from "happy-desktop-state";
import { Button } from "./Button";
import { CompactActivityRow } from "./CompactActivityRow";
import { DelegatedAgentActivity } from "./DelegatedAgentActivity";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";

export type HappyAgentActivityPanelProps = {
    /** Opens the native Completed disclosure on its first render; omitted is closed. */
    completedInitiallyOpen?: boolean;
    /** The session's persistent goal, when one is set (`/goal`). */
    goal?: HappyAgentGoal;
    /** The session task list in display order (`/tasks`). */
    tasks: readonly HappyAgentTodo[];
    /** Delegated subagents for the live monitor (`/agents`). */
    subagents: readonly SubagentSummary[];
    /** Running background terminals (`/ps`). */
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
                accessibleLabel={`Terminal ${process.command}, running`}
                icon="terminal"
                meta={["running", process.cwd]}
                placement="panel"
                trailing={
                    props.onStop ? (
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
 * `/goal`, `/tasks`, `/agents`, and `/ps` views. Live agents and terminals lead;
 * settled agents remain mounted inside a collapsed disclosure. An optional
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
    const completedSubagents = orderedSubagents.filter(
        (subagent) =>
            subagent.status === "completed" ||
            subagent.status === "aborted" ||
            subagent.status === "error" ||
            subagent.status === "archived",
    );
    const hasRunning = runningSubagents.length > 0 || backgroundProcesses.length > 0;
    const empty =
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
            {empty ? (
                <p
                    className="happy-agent-activity__empty"
                    data-happy-desktop-ui="happy-agent-activity-empty"
                >
                    No goal, tasks, agents, or background terminals for this session yet.
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
                                    processes={backgroundProcesses}
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

                    {completedSubagents.length > 0 ? (
                        <details
                            className="happy-agent-activity__completed"
                            data-happy-desktop-ui="happy-agent-activity-completed"
                            open={props.completedInitiallyOpen || undefined}
                        >
                            <summary className="happy-agent-activity__completed-summary">
                                <Icon
                                    className="happy-agent-activity__completed-chevron"
                                    name="chevron-right"
                                    size={12}
                                />
                                <h2 className="happy-agent-activity__completed-heading">
                                    Completed
                                </h2>
                                <span className="happy-agent-activity__count">
                                    {completedSubagents.length}
                                </span>
                            </summary>
                            <div className="happy-agent-activity__completed-content">
                                <AgentSection
                                    agents={completedSubagents}
                                    now={props.now}
                                    onSelect={props.onSubagentSelect}
                                />
                            </div>
                        </details>
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
