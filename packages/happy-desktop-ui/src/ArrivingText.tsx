import { useState, type CSSProperties } from "react";

export interface ArrivingTextProps {
    readonly value: string;
    /**
     * Characters of the same line that come out before this text's first, so
     * a verb and its subject arrive as one run rather than side by side.
     */
    readonly lead?: number;
    /** Characters in the whole line this text is part of. Defaults to its own. */
    readonly run?: number;
    readonly "data-happy-desktop-ui"?: string;
    readonly "data-testid"?: string;
}

/** The slowest the characters come: 40 a second, as the mobile reveal starts. */
const STEP_LONGEST = 25;
/** A line that is already whole is out in this long, however long it is: the
    mobile reveal's finish time for words that are all here. */
const RUN_LONGEST = 300;

/**
 * ArrivingText — a line of text that comes in a character at a time, the way
 * the mobile app shows a reply arriving: each character fades in, rises from
 * 6px below and grows from half its size, one behind the other.
 *
 * It is for text that appears while the reader watches; the text it mounts
 * with always arrives. Text that grows keeps what it showed and brings in only
 * the characters that are new, and text that changes to other words arrives
 * again from its first character.
 *
 * The motion is `StreamingRevealMotion` in the mobile app, which took it from
 * Telegram's streaming replies; the pace is the one it finishes at, since a
 * line here arrives whole.
 */
export function ArrivingText(props: ArrivingTextProps) {
    /* What the last render showed: the words, how many of them were already
       there when the rest arrived, and how many times the words were replaced
       outright. Compared during render, as TypedText compares its own. */
    const [shown, setShown] = useState({ value: props.value, kept: 0, turn: 0 });
    if (shown.value !== props.value)
        setShown(
            props.value.startsWith(shown.value)
                ? { value: props.value, kept: Array.from(shown.value).length, turn: shown.turn }
                : { value: props.value, kept: 0, turn: shown.turn + 1 },
        );
    const characters = Array.from(shown.value);
    /* Only a line arriving whole waits for the text before it. */
    const lead = shown.kept === 0 ? (props.lead ?? 0) : 0;
    const run = Math.max(1, props.run ?? characters.length);
    return (
        <span
            className="happy-arriving-text"
            data-happy-desktop-ui={props["data-happy-desktop-ui"]}
            data-testid={props["data-testid"]}
            key={shown.turn}
            style={
                {
                    "--happy-arriving-step": `${String(Math.min(STEP_LONGEST, RUN_LONGEST / run))}ms`,
                } as CSSProperties
            }
        >
            {/* Read as the words they are, not letter by letter. */}
            <span className="happy-visually-hidden">{shown.value}</span>
            <span aria-hidden="true" className="happy-arriving-text__run">
                {characters.map((character, index) => (
                    <span
                        className="happy-arriving-text__glyph"
                        /* A character is its place in the line: one that is
                           already out keeps its node as more arrive. */
                        key={index}
                        style={
                            {
                                "--happy-arriving-index": lead + Math.max(0, index - shown.kept),
                            } as CSSProperties
                        }
                    >
                        {character}
                    </span>
                ))}
            </span>
        </span>
    );
}
