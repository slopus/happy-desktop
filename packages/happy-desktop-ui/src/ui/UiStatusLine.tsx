import { Spinner } from "../Spinner";
import { Ionicon } from "../vectorIcons/VectorIcon";

/**
 * What one chat UI control says about itself under its controls, when it says
 * anything: why this person can't use it, the server's refusal of the last
 * attempt, or that an attempt is on its way. Every control draws the same
 * line, so a refusal reads the same in a choice and in a sign-in.
 */
export type UiControlState = {
    /** Why this person can't use the control, such as who can. It is drawn disabled. */
    readonly blocked?: string;
    /** An attempt from this window is on its way. */
    readonly pending?: boolean;
    /** Why the last attempt was refused, from its record, or why it never arrived. */
    readonly error?: string;
    /** The offer takes no more answers: answered, or the conversation moved on. */
    readonly closed?: boolean;
};

/** Whether a control in this state takes input. */
export function uiControlUsable(state: UiControlState | undefined): boolean {
    return state?.blocked === undefined && state?.closed !== true && state?.pending !== true;
}

/** The one line a control shows, or nothing when it has nothing to say. */
export function uiControlLine(state: UiControlState | undefined): string | undefined {
    return state?.error ?? state?.blocked;
}

export function UiStatusLine(props: {
    readonly state: UiControlState | undefined;
    /** Pins the spinner on one frame, for a still fixture. */
    readonly spinnerFrame?: number;
}) {
    const text = uiControlLine(props.state);
    if (text === undefined) return null;
    const error = props.state?.error !== undefined;
    return (
        <div
            className="happy-chat-ui__line"
            data-error={error ? "" : undefined}
            data-happy-desktop-ui="chat-ui-line"
            role={error ? "alert" : "note"}
        >
            <span className="happy-chat-ui__mark">
                {error ? (
                    <Ionicon name="alert-circle" size={16} />
                ) : props.state?.pending ? (
                    <Spinner
                        size={16}
                        {...(props.spinnerFrame === undefined ? {} : { frame: props.spinnerFrame })}
                    />
                ) : (
                    <Ionicon name="lock-closed-outline" size={16} />
                )}
            </span>
            <span className="happy-chat-ui__text">{text}</span>
        </div>
    );
}
