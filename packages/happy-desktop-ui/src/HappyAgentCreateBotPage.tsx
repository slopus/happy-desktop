import type { CSSProperties } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { LottieScene } from "./LottieScene";
import { TextField } from "./TextField";

export type HappyAgentCreateBotPageProps = {
    /** The chosen name. Blank, the host names the bot from its first message. */
    name: string;
    /** True while the bot is being made: the surface stays up and inert. */
    submitting?: boolean;
    /** A refused creation, stated here rather than thrown away. */
    error?: string;
    /** Why the bot cannot currently be made on its Happy Agent. */
    submitDisabledReason?: string;
    onNameChange: (name: string) => void;
    /** Makes the bot without saying anything to it. */
    onSubmit: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * C-238 HappyAgentCreateBotPage — what is decided about a bot before it exists,
 * standing in the body of the conversation it is about to become.
 *
 * It is reached from the "+" on the sidebar's Bots heading and rendered as the
 * empty content of a conversation view whose composer is the bot's own: the
 * first message is written down there, where every later one will be, and
 * sending it makes the bot on the way. A bot is given no picture here: it
 * wears the placeholder its id picks, as the phone draws it. So this panel is
 * the robot (an agent ready to be told what to do), the title, a sentence
 * about what a bot is for, and the name — which may be left blank for the host
 * to give from the first message — with Create beside it for making the bot
 * without saying anything to it yet. Nothing here is required.
 *
 * Props only, and every state is directly renderable: fresh, filled in, a
 * creation in flight, one the machine refused, and one whose Happy Agent is
 * away. The draft belongs to the caller, so navigating away and back keeps it.
 */
export function HappyAgentCreateBotPage(props: HappyAgentCreateBotPageProps) {
    const submitting = props.submitting === true;
    const submittable = !submitting && props.submitDisabledReason === undefined;
    const submit = () => {
        if (submittable) props.onSubmit();
    };
    return (
        <div
            className={["happy-agent-create-bot", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-create-bot"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <header
                className="happy-agent-create-bot__header"
                data-happy-desktop-ui="happy-agent-create-bot-header"
            >
                <span
                    className="happy-agent-create-bot__stage"
                    data-happy-desktop-ui="happy-agent-create-bot-stage"
                >
                    {/* Still until a pointer enters it: one play each time,
                        then back to the resting robot. */}
                    <LottieScene
                        name="robot"
                        play="on-hover"
                        replayLabel="Play the robot"
                        size={80}
                    />
                </span>
                <h1
                    className="happy-agent-create-bot__title"
                    data-happy-desktop-ui="happy-agent-create-bot-title"
                >
                    Create a new bot
                </h1>
                <p
                    className="happy-agent-create-bot__lede"
                    data-happy-desktop-ui="happy-agent-create-bot-lede"
                >
                    A bot is a colleague that does not end: one permanent conversation with a folder
                    of its own. Give it a standing job, come back to it whenever you like, and let
                    it delegate work into your projects.
                </p>
            </header>
            {/* The name, and Create beside it: the last thing decided up here.
                The other way of making the bot is the send below. Under them,
                why the bot cannot be made right now, or why it was not. */}
            <div
                className="happy-agent-create-bot__below"
                data-happy-desktop-ui="happy-agent-create-bot-below"
            >
                <div
                    className="happy-agent-create-bot__row"
                    data-happy-desktop-ui="happy-agent-create-bot-row"
                >
                    <TextField
                        aria-label="Name"
                        className="happy-agent-create-bot__name"
                        data-testid="happy-agent-create-bot-name"
                        disabled={submitting}
                        fullWidth
                        onSubmit={submit}
                        onValueChange={props.onNameChange}
                        placeholder="Name, generated if left blank"
                        value={props.name}
                    />
                    <Button
                        className="happy-agent-create-bot__create"
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
                        className="happy-agent-create-bot__reason"
                        data-happy-desktop-ui="happy-agent-create-bot-reason"
                    >
                        {props.submitDisabledReason}
                    </p>
                ) : null}
                {props.error ? <Banner tone="danger">{props.error}</Banner> : null}
            </div>
        </div>
    );
}
