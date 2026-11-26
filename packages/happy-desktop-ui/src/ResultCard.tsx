import { type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./Icon";

export type ResultCardProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** What kind of thing the card opens, as one 20px glyph in the leading chip. */
    glyph: ReactNode;
    /** The thing's own name: a title or a file name. Truncates, never wraps. */
    title: string;
    /** A short line of facts under the title, such as type and size. */
    detail: string;
    /** Opens the thing. Absent leaves the card a plain record rather than an inert button. */
    onOpen?: () => void;
    /** Asks for the card's own menu, as a right-click does. */
    onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
    "aria-label"?: string;
};

/**
 * C-291 ResultCard — one thing an agent produced, as a full-width card the
 * reader opens: a published artifact, a presented document, any other file.
 *
 * It says what the thing is and nothing of what is inside it, so it is the same
 * 64px row whatever was produced. The leading chip carries the kind, the title
 * is the bright part, and the detail line states type, size, or version. The
 * whole card is one button.
 */
export function ResultCard(props: ResultCardProps) {
    const className = ["happy-result-card", props.className].filter(Boolean).join(" ");
    const inner = (
        <>
            <span
                aria-hidden="true"
                className="happy-result-card__glyph"
                data-happy-desktop-ui="result-card-glyph"
            >
                {props.glyph}
            </span>
            <span className="happy-result-card__copy" data-happy-desktop-ui="result-card-copy">
                <span
                    className="happy-result-card__title"
                    data-happy-desktop-ui="result-card-title"
                >
                    {props.title}
                </span>
                <span
                    className="happy-result-card__detail"
                    data-happy-desktop-ui="result-card-detail"
                >
                    {props.detail}
                </span>
            </span>
            {props.onOpen ? (
                <span
                    aria-hidden="true"
                    className="happy-result-card__action"
                    data-happy-desktop-ui="result-card-action"
                >
                    <Icon name="chevron-right" size={16} />
                </span>
            ) : null}
        </>
    );
    return props.onOpen ? (
        <button
            aria-label={props["aria-label"] ?? `Open ${props.title}`}
            className={className}
            data-happy-desktop-ui="result-card"
            data-testid={props["data-testid"]}
            onClick={props.onOpen}
            onContextMenu={props.onContextMenu}
            style={props.style}
            type="button"
        >
            {inner}
        </button>
    ) : (
        <div
            className={className}
            data-happy-desktop-ui="result-card"
            data-testid={props["data-testid"]}
            onContextMenu={props.onContextMenu}
            style={props.style}
        >
            {inner}
        </div>
    );
}
