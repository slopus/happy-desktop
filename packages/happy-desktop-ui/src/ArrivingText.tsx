import { useState, type CSSProperties } from "react";

export interface ArrivingTextProps {
    readonly value: string;
    /**
     * Characters of the same line that stand before this text's first, so a
     * verb, its subject, and what follows them arrive as one run rather than
     * side by side.
     */
    readonly lead?: number;
    /**
     * The words are said by something else beside this text, which is itself
     * hidden from a reader that is not looking: nothing here repeats them.
     */
    readonly silent?: boolean;
    readonly "data-happy-desktop-ui"?: string;
    readonly "data-testid"?: string;
}

/** However long a line is, its last character starts within this long. */
const REVEAL_LONGEST = 360;
/** The place in the line whose character starts halfway through that time. */
const REVEAL_HALF = 18;

/**
 * When the character at `place` in a line starts moving, in milliseconds
 * after the line does. It depends on the place alone, never on how long the
 * line is, so two lines of different lengths keep step: the character leaving
 * a place and the one taking it start together. The first characters come 20ms
 * apart and the rest ever closer, so a long line is not long in arriving.
 */
function arrivingTextDelay(place: number): string {
    const delay = (REVEAL_LONGEST * place) / (place + REVEAL_HALF);
    return `${String(Math.round(delay * 10) / 10)}ms`;
}

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
 * It leaves the same way. Under an ancestor marked
 * `data-arriving-text="leaving"` each character goes up and out when its
 * place's turn comes, so a line laid over it and arriving on the same clock
 * replaces it letter by letter.
 *
 * The motion is `StreamingRevealMotion` in the mobile app, which took it from
 * Telegram's streaming replies. The mobile app has no replacement of one line
 * by another; leaving is that motion played on.
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
    const lead = props.lead ?? 0;
    return (
        <span
            className="happy-arriving-text"
            data-happy-desktop-ui={props["data-happy-desktop-ui"]}
            data-testid={props["data-testid"]}
            key={shown.turn}
        >
            {/* Read as the words they are, not letter by letter. */}
            {props.silent ? null : <span className="happy-visually-hidden">{shown.value}</span>}
            <span aria-hidden="true" className="happy-arriving-text__run">
                {characters.map((character, index) => (
                    <span
                        className="happy-arriving-text__glyph"
                        /* A character is its place in the line: one that is
                           already out keeps its node as more arrive. */
                        key={index}
                        style={
                            {
                                /* Characters added to words already shown
                                   come out from the first of them. */
                                "--happy-arriving-delay": arrivingTextDelay(
                                    shown.kept === 0 ? lead + index : index - shown.kept,
                                ),
                                "--happy-arriving-place": arrivingTextDelay(lead + index),
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
