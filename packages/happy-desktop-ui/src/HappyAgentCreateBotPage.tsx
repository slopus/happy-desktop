import type { CSSProperties, MouseEvent } from "react";
import { Banner } from "./Banner";
import { BotFace, botFaceCredit } from "./BotFace";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { TextField } from "./TextField";

/** One of the four faces on offer, by position. */
export type HappyAgentCreateBotFaceSlot = 0 | 1 | 2 | 3;

export type HappyAgentCreateBotPageProps = {
    /** The chosen name. Blank, the host names the bot from its first message. */
    name: string;
    /** The four face seeds on offer, in the order they stand. */
    faces: readonly [string, string, string, string];
    /** Which of the four the bot gets. Always one of them. */
    faceSlot: HappyAgentCreateBotFaceSlot;
    /** True while the bot is being made: the surface stays up and inert. */
    submitting?: boolean;
    /** A refused creation, stated here rather than thrown away. */
    error?: string;
    /** Why the bot cannot currently be made on its Happy Agent. */
    submitDisabledReason?: string;
    /** Whether the bot is made an admin bot. */
    admin?: boolean;
    /** Turns admin on or off. Omitted, the page offers no admin choice. */
    onAdminChange?: (admin: boolean) => void;
    onNameChange: (name: string) => void;
    onFacePick: (slot: HappyAgentCreateBotFaceSlot) => void;
    onFacesRoll: () => void;
    /**
     * Opens the artist's page. The page is on the web, and where a web address
     * opens is the host's decision — an embedded tab, the machine's own
     * browser — so the address is handed over rather than followed here.
     */
    onCreditOpen: (url: string) => void;
    /** Makes the bot without saying anything to it. */
    onSubmit: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** The size a face is offered at: big enough to have an expression, small enough for four. */
const FACE_SIZE = 56;

/**
 * C-238 HappyAgentCreateBotPage — what is decided about a bot before it exists,
 * standing in the body of the conversation it is about to become.
 *
 * It is reached from the "+" on the sidebar's Bots heading and rendered as the
 * empty content of a conversation view whose composer is the bot's own: the
 * first message is written down there, where every later one will be, and
 * sending it makes the bot on the way. This panel is everything else.
 *
 * The four faces are the middle of the page, on both axes: the one thing that
 * is decided by looking. Everything else is placed relative to them. Above,
 * at the top of the body, the title and a sentence about what a bot is for,
 * because arriving somewhere should say where you are and why; directly over
 * the faces, the credit for the pack, flush with the leftmost face; to the
 * right of the faces, the die that rolls four more, not counted in what is
 * centred. Below, the name, as wide as the faces, which may be left blank for
 * the host to give from the first message, and Create beside it for making
 * the bot without saying anything to it yet. Nothing here is required.
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
    const onCreditClick = (event: MouseEvent<HTMLAnchorElement>): void => {
        // The href is kept for what a link is — copying, hovering, the status
        // line — but following it is the host's to do.
        event.preventDefault();
        props.onCreditOpen(botFaceCredit.artistUrl);
    };
    return (
        <div
            className={["happy-agent-create-bot", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-create-bot"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {/* Everything above the faces: the title and lede held to the top
                of the body, the credit held to the bottom of the same track so
                it sits directly on the faces. */}
            <div
                className="happy-agent-create-bot__above"
                data-happy-desktop-ui="happy-agent-create-bot-above"
            >
                <header
                    className="happy-agent-create-bot__header"
                    data-happy-desktop-ui="happy-agent-create-bot-header"
                >
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
                        A bot is a colleague that does not end: one permanent conversation with a
                        folder of its own. Give it a standing job, come back to it whenever you
                        like, and let it delegate work into your projects.
                    </p>
                </header>
                <p
                    className="happy-agent-create-bot__credit"
                    data-happy-desktop-ui="happy-agent-create-bot-credit"
                >
                    {botFaceCredit.pack} by{" "}
                    <a
                        className="happy-agent-create-bot__artist"
                        data-happy-desktop-ui="happy-agent-create-bot-artist"
                        href={botFaceCredit.artistUrl}
                        onClick={onCreditClick}
                        rel="noopener noreferrer"
                    >
                        {botFaceCredit.artist}
                    </a>
                </p>
            </div>

            {/* Four faces, the centre of the page. Picking is by position: the
                ring stays where it was put through a roll, wearing whatever
                face lands there. */}
            <div
                aria-label="Face"
                className="happy-agent-create-bot__face-row"
                data-happy-desktop-ui="happy-agent-create-bot-face-row"
                role="radiogroup"
            >
                {props.faces.map((seed, index) => {
                    const slot = index as HappyAgentCreateBotFaceSlot;
                    const picked = slot === props.faceSlot;
                    return (
                        <button
                            aria-checked={picked}
                            className="happy-agent-create-bot__face"
                            data-happy-desktop-ui="happy-agent-create-bot-face"
                            data-picked={picked ? "" : undefined}
                            disabled={submitting}
                            key={slot}
                            onClick={() => props.onFacePick(slot)}
                            role="radio"
                            type="button"
                        >
                            <BotFace seed={seed} size={FACE_SIZE} />
                        </button>
                    );
                })}
            </div>
            {/* The die acts on all four and is not a fifth choice: it stands
                beside the faces, in the margin, outside what is centred. */}
            <Button
                aria-label="Roll four new faces"
                className="happy-agent-create-bot__die"
                disabled={submitting}
                icon="dice"
                iconOnly
                onClick={() => props.onFacesRoll()}
                title="Roll four new faces"
                variant="secondary"
            />

            {/* Below the faces: the name, as wide as they are, and under it
                why the bot cannot be made right now, or why it was not. */}
            <div
                className="happy-agent-create-bot__below"
                data-happy-desktop-ui="happy-agent-create-bot-below"
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
                {props.onAdminChange ? (
                    <Switch
                        checked={props.admin === true}
                        className="happy-agent-create-bot__admin"
                        data-testid="happy-agent-create-bot-admin"
                        description="Can create bots, change other bots' settings, and permanently delete bots, tasks, projects, and workspaces."
                        disabled={submitting}
                        label="Admin"
                        onChange={props.onAdminChange}
                        size="small"
                    />
                ) : null}
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
            {/* Makes the bot with nothing said to it yet. It stands beside the
                name, in the same margin as the die, because the name is the
                last thing decided up here; the other way of making the bot is
                the send below. */}
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
    );
}
