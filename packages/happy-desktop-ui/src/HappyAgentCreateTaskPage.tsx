import type { CSSProperties } from "react";
import { Banner } from "./Banner";
import { LottieScene } from "./LottieScene";
import clapperBoardStill from "./assets/animations/stills/clapper-board.webp?inline";

export type HappyAgentCreateTaskPageProps = {
    /**
     * What the task is for. A bug report is the same task, headed by the crow
     * and a word about why reports matter. Defaults to an ordinary task.
     */
    purpose?: "task" | "bugReport";
    /** A refused creation, stated here rather than thrown away. */
    error?: string;
    /** Why the task cannot currently be made on its Happy Agent. */
    submitDisabledReason?: string;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * C-287 HappyAgentCreateTaskPage — what a task is, standing in the body of the
 * conversation it is about to become.
 *
 * It is reached from the "+" on the sidebar's Tasks heading and rendered as
 * the empty content of a conversation view whose composer is the task's own:
 * the first message is written down there, and sending it is the one way the
 * task is made. Nothing is decided up here — the host names the task from that
 * first message — so this panel is only the clapper board (a piece of work
 * about to begin), the title, and a sentence about what a task is for. Under
 * them, why the task cannot be made right now, or why it was not.
 *
 * A bug report is a task with its own draft, so the same panel heads it: the
 * crow in place of the clapper board, and a word on why reports matter.
 *
 * Props only, and every state is directly renderable: fresh, one the machine
 * refused, one whose Happy Agent is away, and a bug report.
 */
const PURPOSES = {
    task: {
        scene: "clapper-board",
        motion: { play: "on-hover", rest: "start", still: clapperBoardStill },
        replayLabel: "Play the clapper board",
        title: "Create a new task",
        lede: "A task is for one-off work. It can work across several projects and start subtasks of its own.",
    },
    bugReport: {
        scene: "crow-eating-worm",
        motion: {},
        replayLabel: "Play the crow again",
        title: "Create a bug report",
        lede: "Your report helps us reproduce what is different about your setup. Happy is young and changing fast, so bugs come before features.",
    },
} as const;

export function HappyAgentCreateTaskPage(props: HappyAgentCreateTaskPageProps) {
    const purpose = PURPOSES[props.purpose ?? "task"];
    return (
        <div
            className={["happy-agent-create-task", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-create-task"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <header
                className="happy-agent-create-task__header"
                data-happy-desktop-ui="happy-agent-create-task-header"
            >
                <span
                    className="happy-agent-create-task__stage"
                    data-happy-desktop-ui="happy-agent-create-task-stage"
                >
                    {/* The clapper board is still on its first frame until a
                        pointer enters it: one whole play each time, then back
                        to that frame. The crow plays once as the bug report
                        opens, then replays on click. */}
                    <LottieScene
                        name={purpose.scene}
                        {...purpose.motion}
                        replayLabel={purpose.replayLabel}
                        size={80}
                    />
                </span>
                <h1
                    className="happy-agent-create-task__title"
                    data-happy-desktop-ui="happy-agent-create-task-title"
                >
                    {purpose.title}
                </h1>
                <p
                    className="happy-agent-create-task__lede"
                    data-happy-desktop-ui="happy-agent-create-task-lede"
                >
                    {purpose.lede}
                </p>
            </header>
            {props.submitDisabledReason || props.error ? (
                <div
                    className="happy-agent-create-task__status"
                    data-happy-desktop-ui="happy-agent-create-task-status"
                >
                    {props.submitDisabledReason ? (
                        <p
                            className="happy-agent-create-task__reason"
                            data-happy-desktop-ui="happy-agent-create-task-reason"
                        >
                            {props.submitDisabledReason}
                        </p>
                    ) : null}
                    {props.error ? <Banner tone="danger">{props.error}</Banner> : null}
                </div>
            ) : null}
        </div>
    );
}
