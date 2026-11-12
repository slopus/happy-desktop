import type { CSSProperties } from "react";
import { Banner } from "./Banner";
import { LottieScene } from "./LottieScene";

export type HappyAgentCreateTaskPageProps = {
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
 * Props only, and every state is directly renderable: fresh, one the machine
 * refused, and one whose Happy Agent is away.
 */
export function HappyAgentCreateTaskPage(props: HappyAgentCreateTaskPageProps) {
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
                    {/* Still on its first frame until clicked, as on the
                        phone: one whole play, then back to that frame. */}
                    <LottieScene
                        name="clapper-board"
                        play="on-click"
                        rest="start"
                        replayLabel="Play the clapper board"
                        size={80}
                    />
                </span>
                <h1
                    className="happy-agent-create-task__title"
                    data-happy-desktop-ui="happy-agent-create-task-title"
                >
                    Create a new task
                </h1>
                <p
                    className="happy-agent-create-task__lede"
                    data-happy-desktop-ui="happy-agent-create-task-lede"
                >
                    A task is one piece of work with a conversation and a folder of its own.
                    Everyone who joins it works in that same conversation.
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
