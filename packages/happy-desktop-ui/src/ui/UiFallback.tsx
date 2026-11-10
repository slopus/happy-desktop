import { uiTextHeight, type MessageTextLayoutCache } from "../messageTextLayout";

/* `.happy-chat-ui__fallback`: 15px words on 24px lines. */
const FALLBACK_SIZE = 15;
const FALLBACK_LINE = 24;

/**
 * A chat UI component this build doesn't draw, as the one line the server
 * wrote for it, such as "Sign in to Claude in Happy on your computer".
 */
export function UiFallback(props: { readonly text: string }) {
    return (
        <div
            className="happy-chat-ui happy-chat-ui__fallback"
            data-happy-desktop-ui="chat-ui-fallback"
        >
            {props.text}
        </div>
    );
}

/** The line's height wrapped at `width`. */
export function uiFallbackHeight(
    text: string,
    width: number,
    cache?: MessageTextLayoutCache,
): number {
    return Math.max(FALLBACK_LINE, uiTextHeight(text, FALLBACK_SIZE, FALLBACK_LINE, width, cache));
}
