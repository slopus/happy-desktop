import { memo } from "react";
import type { ComposerTag } from "./composerDraft";

/**
 * The draft again, behind the composer's textarea, with each mention on a
 * tint. Its own glyphs are transparent: the textarea draws every character,
 * the caret, the selection, and the spelling marks, and this layer only lays
 * the same text out in the same box so a tint lands under the words it marks.
 *
 * It can only paint behind the text. Anything that would change a glyph's
 * width — bold, another face, letter spacing — would move the words under the
 * textarea's own, so a mention is a background and nothing else.
 *
 * Both sit in one scroller, so the layer needs no scroll of its own.
 *
 * Only the text through the paragraph of the last mention is laid out again:
 * later paragraphs cannot move a tint, so typing below the last mention leaves
 * the layer's input unchanged and it does not render at all. With no mention
 * there is no layer.
 */
export const ComposerMentionLayer = memo(function ComposerMentionLayer(props: {
    /** The draft through the end of its last mention's paragraph. */
    readonly text: string;
    /** The draft's mentions, all of them inside `text`. */
    readonly tags: readonly ComposerTag[];
}) {
    const ranges = props.tags;
    if (ranges.length === 0) return null;
    // One block per paragraph: an edit lays out only its own paragraph again,
    // not every line above the last mention. Lines are a fixed height and a
    // paragraph already ends in a hard break, so no line moves.
    const paragraphs: React.JSX.Element[] = [];
    let next = 0;
    let at = 0;
    for (const paragraph of props.text.split("\n")) {
        const end = at + paragraph.length;
        const parts: (string | React.JSX.Element)[] = [];
        let from = at;
        while (next < ranges.length && ranges[next]!.start < end) {
            const range = ranges[next++]!;
            if (range.start > from) parts.push(props.text.slice(from, range.start));
            parts.push(
                <mark
                    className="happy-composer__mention"
                    data-happy-desktop-ui="composer-mention"
                    // Keyed within the paragraph: an edit above shifts every
                    // offset below it, and offset keys would remount them all.
                    key={parts.length}
                >
                    {props.text.slice(range.start, range.end)}
                </mark>,
            );
            from = range.end;
        }
        if (from < end) parts.push(props.text.slice(from, end));
        paragraphs.push(
            <div className="happy-composer__mention-paragraph" key={paragraphs.length}>
                {parts}
            </div>,
        );
        at = end + 1;
    }
    return (
        <div
            aria-hidden="true"
            className="happy-composer__mention-layer"
            data-happy-desktop-ui="composer-mention-layer"
        >
            <div className="happy-composer__mention-layer-text">{paragraphs}</div>
        </div>
    );
});
