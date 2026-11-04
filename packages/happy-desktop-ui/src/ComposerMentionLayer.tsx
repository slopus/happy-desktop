import { composerMentionRanges } from "./composerMentionRanges";

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
export function ComposerMentionLayer(props: {
    /** The draft through the end of its last mention's paragraph. */
    readonly text: string;
    readonly names: readonly string[];
}) {
    const ranges = composerMentionRanges(props.text, props.names);
    if (ranges.length === 0) return null;
    const parts: (string | React.JSX.Element)[] = [];
    let from = 0;
    for (const range of ranges) {
        if (range.start > from) parts.push(props.text.slice(from, range.start));
        parts.push(
            <mark
                className="happy-composer__mention"
                data-happy-desktop-ui="composer-mention"
                key={range.start}
            >
                {props.text.slice(range.start, range.end)}
            </mark>,
        );
        from = range.end;
    }
    if (from < props.text.length) parts.push(props.text.slice(from));
    return (
        <div
            aria-hidden="true"
            className="happy-composer__mention-layer"
            data-happy-desktop-ui="composer-mention-layer"
        >
            <div className="happy-composer__mention-layer-text">{parts}</div>
        </div>
    );
}
