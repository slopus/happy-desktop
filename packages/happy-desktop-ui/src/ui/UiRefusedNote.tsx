import { Ionicon } from "../vectorIcons/VectorIcon";

/** The note's line box; the row model adds it under the greyed bubble. */
export const UI_REFUSED_NOTE_HEIGHT = 20;

/**
 * Under an answer that never became the person's words — a choice pressed
 * after the offer was answered, say — why it wasn't sent, from its record.
 */
export function UiRefusedNote(props: { readonly reason: string }) {
    return (
        <span
            className="happy-chat-ui__refused"
            data-happy-desktop-ui="chat-ui-refused"
            role="note"
        >
            <Ionicon name="close-circle-outline" size={14} />
            <span className="happy-chat-ui__refused-text">{`Not sent · ${props.reason}`}</span>
        </span>
    );
}
