import type { CSSProperties } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { TextField } from "./TextField";

export type HappyAgentCreateTaskPageProps = {
    /** The chosen name. Blank, the host names the task from its first message. */
    name: string;
    /** True while the task is being made: the surface stays up and inert. */
    submitting?: boolean;
    /** A refused creation, stated here rather than thrown away. */
    error?: string;
    /** Why the task cannot currently be made on its Happy Agent. */
    submitDisabledReason?: string;
    onNameChange: (name: string) => void;
    /** Makes the task without saying anything to it. */
    onSubmit: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * C-287 HappyAgentCreateTaskPage — what is decided about a task before it
 * exists, standing in the body of the conversation it is about to become.
 *
 * It is reached from the "+" on the sidebar's Tasks heading and rendered as
 * the empty content of a conversation view whose composer is the task's own,
 * exactly as a new bot is: the first message is written down there, and
 * sending it makes the task on the way. A task has no face, so this panel is
 * only the title, a sentence about what a task is for, and the name — which
 * may be left blank for the host to give from the first message — with Create
 * beside it for making the task without saying anything to it yet.
 *
 * Props only, and every state is directly renderable: fresh, filled in, a
 * creation in flight, one the machine refused, and one whose Happy Agent is
 * away. The draft belongs to the caller, so navigating away and back keeps it.
 */
export function HappyAgentCreateTaskPage(props: HappyAgentCreateTaskPageProps) {
    const submitting = props.submitting === true;
    const submittable = !submitting && props.submitDisabledReason === undefined;
    const submit = () => {
        if (submittable) props.onSubmit();
    };
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
            {/* The name, and Create beside it: the last thing decided up here.
                The other way of making the task is the send below. Under them,
                why the task cannot be made right now, or why it was not. */}
            <div
                className="happy-agent-create-task__below"
                data-happy-desktop-ui="happy-agent-create-task-below"
            >
                <div
                    className="happy-agent-create-task__row"
                    data-happy-desktop-ui="happy-agent-create-task-row"
                >
                    <TextField
                        aria-label="Name"
                        className="happy-agent-create-task__name"
                        data-testid="happy-agent-create-task-name"
                        disabled={submitting}
                        fullWidth
                        onSubmit={submit}
                        onValueChange={props.onNameChange}
                        placeholder="Name, generated if left blank"
                        value={props.name}
                    />
                    <Button
                        className="happy-agent-create-task__create"
                        disabled={!submittable}
                        onClick={submit}
                        title={props.submitDisabledReason}
                        variant="secondary"
                    >
                        {submitting ? "Creating…" : "Create"}
                    </Button>
                </div>
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
        </div>
    );
}
