import { useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";

export interface CopyButtonProps {
    readonly className?: string;
    readonly "data-happy-desktop-ui"?: string;
    readonly "data-testid"?: string;
    /** What the button offers to copy, for example "Copy command". */
    readonly label: string;
    /**
     * Written beside the glyph, for a copy action that is the whole control
     * rather than a quiet affordance on a row that already says what it holds.
     */
    readonly caption?: string;
    /** Said instead of the caption for the moment after a copy lands. */
    readonly copiedCaption?: string;
    readonly style?: CSSProperties;
    /** Exact text handed to the clipboard, read lazily when deriving it is expensive. */
    readonly text: string | (() => string);
    /** Told once the clipboard has taken the text; never told what the text was. */
    readonly onCopy?: () => void;
}

/** How long the copied check stays before the button offers the copy again. */
const COPIED_MS = 1_600;

/**
 * CopyButton — the quiet clipboard action for a line whose full text is longer
 * than the row showing it. It confirms itself with a check for a moment, so a
 * reader knows the copy landed without a toast interrupting the surface.
 *
 * The surrounding row decides when the button is visible; the button only owns
 * its own copied state.
 */
export function CopyButton(props: CopyButtonProps) {
    const [copied, setCopied] = useState(false);
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const copy = async () => {
        try {
            const text = typeof props.text === "function" ? props.text() : props.text;
            await navigator.clipboard.writeText(text);
            setCopied(true);
            props.onCopy?.();
            if (copiedTimer.current !== undefined) clearTimeout(copiedTimer.current);
            copiedTimer.current = setTimeout(() => {
                copiedTimer.current = undefined;
                setCopied(false);
            }, COPIED_MS);
        } catch {
            // The browser owns clipboard permission; keep the action retryable.
        }
    };
    return (
        <button
            aria-label={copied ? "Copied" : props.label}
            className={["happy-copy-button", props.className].filter(Boolean).join(" ")}
            data-captioned={props.caption === undefined ? undefined : ""}
            data-copied={copied ? "" : undefined}
            data-happy-desktop-ui={props["data-happy-desktop-ui"] ?? "copy-button"}
            data-testid={props["data-testid"]}
            onClick={(event) => {
                // The line often sits inside a row that opens a detail surface.
                event.stopPropagation();
                void copy();
            }}
            style={props.style}
            type="button"
        >
            <Icon name={copied ? "check" : "copy"} size={14} />
            {props.caption === undefined ? null : (
                <span className="happy-copy-button__caption">
                    {copied ? (props.copiedCaption ?? props.caption) : props.caption}
                </span>
            )}
        </button>
    );
}
