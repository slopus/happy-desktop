import {
    clearCache,
    layout,
    layoutNextLine,
    measureNaturalWidth,
    prepare,
    prepareWithSegments,
    type PreparedText,
} from "@chenglou/pretext";
import {
    measureRichInlineStats,
    prepareRichInline,
    type PreparedRichInline,
    type RichInlineItem,
} from "@chenglou/pretext/rich-inline";
import {
    MERMAID_DIAGRAM_BORDER,
    mermaidDiagramMeasure,
    mermaidDiagramNaturalHeight,
    type MermaidDiagramDimensions,
} from "./mermaidDiagramRender";
import { messageMarkdownParse, type MessageMarkdownAst } from "./messageMarkdownAst";
import {
    GUIDED_REVIEW_SECTION,
    guidedReviewDocument,
    guidedReviewFenceLabel,
    guidedReviewFenceOpen,
    guidedReviewSectionsApply,
    type GuidedReviewSectionParts,
} from "./guidedReview";
import { guidedReviewFenceHeight } from "./guidedReviewLayout";
import { happyUiSignature, type HappyUiGrounding } from "./happyUiGrounding";

/**
 * Height of chat body copy, resolved from the font and the measure instead of
 * from a mounted element.
 *
 * The virtualized message list needs a row's height *before* that row mounts: a
 * constant guess makes the scrollbar lie and turns every offset the reader
 * scrolls into a correction. Pretext resolves the same line breaking the browser
 * would, so an unmounted row is sized to within a line of its painted height.
 *
 * Every constant below mirrors `styles/message.css` and the `--happy-font-*`
 * tokens in `theme.css`. They are duplicated deliberately — reading them back
 * out of the cascade needs a mounted element, which is the thing this module
 * exists to avoid — so a change to either must be made here too.
 */
const UI_FAMILY = '"happy Figtree", system-ui, sans-serif';
const MONO_FAMILY = '"happy Mono", ui-monospace, monospace';
/** `.happy-message__body p` — the shape almost every chat line takes. */
const PARAGRAPH_SIZE = 16;
const PARAGRAPH_LINE = 24;
/** `.happy-message__body pre code`, which never wraps (`white-space: pre`). */
const CODE_LINE = 20;
const CODE_PADDING = 16;
/** `.happy-message__body--markdown code`: 14px mono with 5px of inline padding each side. */
const INLINE_CODE_FONT = `14px ${MONO_FAMILY}`;
/** `.happy-message__body > * + *` stacking, and the wider margin around `pre`. */
const BLOCK_GAP = 8;
const CODE_GAP = 12;
/** `hr`, and the 8px vertical / 12px horizontal padding inside every table cell. */
const RULE_HEIGHT = 1;
const TABLE_CELL_PADDING = 8;
const TABLE_CELL_INLINE_PADDING = 24;
/** A column no wider than this on one line (padding included) — an ID, a
 * status, a count — keeps that line while the wider prose columns wrap. */
const TABLE_SHORT_COLUMN = 140;
/** A prose column's width (padding included) in a table that scrolls anyway:
 * about 28 characters of body copy per line. */
const TABLE_READABLE_COLUMN = 240;
/** `blockquote` — a 2px rule plus its 10px inset, taken off the measure. */
const QUOTE_INSET = 12;
/** `ul/ol` indent, and the extra leading between consecutive `li`. */
const LIST_INDENT = 24;
const LIST_ITEM_GAP = 6;
/** Deterministic inline box reserved by a rendered GFM task checkbox. The
 * non-breaking space item beside it models remark-rehype's generated separator. */
const TASK_CHECKBOX_INLINE = 19;
/** The scrollport reports integer client widths while CSS inline layout retains
 * 1/64px units. Admit that one layout unit without accepting a genuinely wider
 * word at the next boundary. */
const INLINE_MEASURE_EPSILON = 1 / 64;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** Browser inline layout is the external boundary Pretext cannot describe.
 * Blink decides whether a slice-decorated inline word must fragment from its
 * glyphs plus start/end padding. WebKit first reserves the closing padding,
 * then accounts for both edges after that run is already fragmenting. */
const WEBKIT_INLINE_SLICE =
    typeof navigator !== "undefined" &&
    /AppleWebKit\//u.test(navigator.userAgent) &&
    !/(?:Chrome|Chromium|CriOS|Edg|OPR)\//u.test(navigator.userAgent);
const GECKO_INLINE_SLICE = typeof navigator !== "undefined" && /Gecko\//u.test(navigator.userAgent);
/** Gecko follows UAX #14 and may break after a `/` that precedes a letter, so
 * paths and URLs wrap at their slashes; Blink and WebKit keep such a token
 * whole, and so does Pretext. In Gecko, mark that opportunity with a
 * zero-width break before the text is measured. */
const GECKO_SLASH_BREAK = /\/(?=\p{L})/gu;
function inlineBreaksMark(text: string): string {
    return GECKO_INLINE_SLICE ? text.replace(GECKO_SLASH_BREAK, "/\u200b") : text;
}
/** `.happy-system-notice__text` — 13px copy on a 20px line. */
const NOTICE_SIZE = 13;
const NOTICE_LINE = 20;
let fontsWatched = false;
let fontGeneration = 0;
const fontListeners = new Set<() => void>();
type Dictionary<T> = Record<string, T | undefined>;
const dictionaryCreate = <T>(): Dictionary<T> => Object.create(null) as Dictionary<T>;
// Prepared glyph/segment objects can occupy over 100 times their source text.
// Keep exact final heights, but bound the expensive width-independent preparation.
const PREPARED_SOURCE_CAPACITY = 128 * 1_024;
type PreparedCacheEntry = { readonly key: string; readonly font?: string; readonly size: number };
export interface MessageTextLayoutCache {
    /** Font generation this cache was measured against. */
    generation: number;
    /** Width-independent Pretext preparation, grouped by font then source text. */
    prepared: Dictionary<Dictionary<PreparedText>>;
    /** Final Markdown body heights, grouped by source text then wrapping measure. */
    markdownHeights: Dictionary<Dictionary<number>>;
    /** Intrinsic Beautiful Mermaid geometry, or null for an invalid fence. */
    mermaidDimensions: Dictionary<MermaidDiagramDimensions | null>;
    /** Parsed remark/GFM documents, grouped by immutable message source. */
    markdownTrees: Dictionary<MessageMarkdownAst>;
    /** Footnote numbering and generated-footer geometry from each parsed document. */
    markdownFootnotes: Dictionary<MarkdownFootnotes>;
    /** Final wrapped-run heights, grouped by font, source text, then layout dimensions. */
    runHeights: Dictionary<Dictionary<Dictionary<number>>>;
    /** Prepared mixed-font AST inline runs, grouped by their explicit item signature. */
    richPrepared: Dictionary<PreparedRichInline>;
    /** Natural widths, grouped by font then source text. */
    naturalWidths: Dictionary<Dictionary<number>>;
    preparedOrder: PreparedCacheEntry[];
    preparedSourceSize: number;
    /** Where this cache's streaming text is measured; see `streamingCache`. */
    streaming?: MessageTextLayoutCache;
}
/**
 * One conversation's text-layout cache. Settled transcript text is retained so
 * revisiting a long history does not reparse it. Streaming text deliberately
 * uses a measurement-local cache: each growing prefix receives the same exact
 * layout without retaining another Markdown tree and prepared run until the
 * view dies. The conversation surface owns the settled cache lifetime.
 */
export function messageTextLayoutCacheCreate(): MessageTextLayoutCache {
    return {
        generation: fontGeneration,
        prepared: dictionaryCreate(),
        markdownHeights: dictionaryCreate(),
        mermaidDimensions: dictionaryCreate(),
        markdownTrees: dictionaryCreate(),
        markdownFootnotes: dictionaryCreate(),
        runHeights: dictionaryCreate(),
        richPrepared: dictionaryCreate(),
        naturalWidths: dictionaryCreate(),
        preparedOrder: [],
        preparedSourceSize: 0,
    };
}
/** Standalone callers keep the old no-setup API; chat surfaces supply their own cache. */
const sharedCache = messageTextLayoutCacheCreate();
/**
 * Every cached layout was resolved against whichever face was installed at the
 * time. A webfont arriving later changes real line breaking, so the generation
 * advances once and Pretext's own cache is dropped. Conversation caches clear
 * lazily the next time they are read, without a global registry retaining them.
 */
function watchFonts() {
    if (fontsWatched || typeof document === "undefined" || !document.fonts) return;
    fontsWatched = true;
    /* Canvas measurement does not reliably initiate a webfont request. Ask for
       both owned variable faces explicitly; `document.fonts.ready` alone can
       resolve while an as-yet-unused face is still absent, leaving the model's
       first prepared runs permanently backed by fallback metrics. */
    void Promise.all([
        document.fonts.load(`16px ${UI_FAMILY}`),
        document.fonts.load(`14px ${MONO_FAMILY}`),
    ]).then(() => {
        fontGeneration += 1;
        clearCache();
        for (const listener of fontListeners) listener();
    });
}
/** Current generation of the faces every text estimate was resolved against. */
export function messageTextLayoutFontGenerationGet(): number {
    return fontGeneration;
}
/** Notifies mounted transcript estimators when webfont arrival changes line breaking. */
export function messageTextLayoutFontGenerationSubscribe(listener: () => void): () => void {
    watchFonts();
    fontListeners.add(listener);
    return () => fontListeners.delete(listener);
}
/** Clears one conversation's text-layout results when the installed font changes. */
export function messageTextLayoutCacheRefresh(cache: MessageTextLayoutCache): boolean {
    watchFonts();
    if (cache.generation === fontGeneration) return false;
    cache.prepared = dictionaryCreate();
    cache.markdownHeights = dictionaryCreate();
    cache.runHeights = dictionaryCreate();
    cache.richPrepared = dictionaryCreate();
    cache.naturalWidths = dictionaryCreate();
    cache.preparedOrder = [];
    cache.preparedSourceSize = 0;
    cache.generation = fontGeneration;
    return true;
}

/**
 * The cache one streaming prefix is measured in. A prefix keeps no tree and no
 * final height: those start empty for every prefix, so a long stream retains
 * nothing per delta. Width-independent preparation is kept, bounded, in this
 * cache's own set, so the blocks that have finished arriving are not prepared
 * again on every delta, and a stream never displaces the settled transcript's.
 */
function streamingCache(cache: MessageTextLayoutCache): MessageTextLayoutCache {
    const scratch = cache.streaming ?? messageTextLayoutCacheCreate();
    cache.streaming = scratch;
    messageTextLayoutCacheRefresh(scratch);
    scratch.markdownHeights = dictionaryCreate();
    scratch.mermaidDimensions = dictionaryCreate();
    scratch.markdownTrees = dictionaryCreate();
    scratch.markdownFootnotes = dictionaryCreate();
    scratch.runHeights = dictionaryCreate();
    scratch.naturalWidths = dictionaryCreate();
    return scratch;
}

/**
 * Height of pre-wrapped monospace output. Newlines remain hard boundaries and
 * each physical line wraps at the same measure as the browser's `pre-wrap`
 * block; a trailing newline does not create another painted line box.
 */
export function monoOutputTextHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    streaming = false,
): number {
    const lines = text.split("\n");
    if (lines.length > 1 && lines.at(-1) === "") lines.pop();
    /* A line a newline has closed never changes again, even while the output
       is still running, so it is settled text. Only the line still arriving
       is measured apart from the settled cache. */
    const open = streaming && !text.endsWith("\n") ? lines.length - 1 : lines.length;
    let height = 0;
    for (const [index, line] of lines.entries())
        height += runHeight(
            line,
            `12px ${MONO_FAMILY}`,
            18,
            measure,
            index < open ? cache : streamingCache(cache),
        );
    return Math.max(18, height);
}
function cacheReady(cache: MessageTextLayoutCache): MessageTextLayoutCache {
    messageTextLayoutCacheRefresh(cache);
    return cache;
}
/** Retain a bounded recent set; oversized runs are measured exactly and then released. */
function preparationRetain(cache: MessageTextLayoutCache, key: string, font?: string): boolean {
    const size = key.length + (font?.length ?? 0);
    if (size > PREPARED_SOURCE_CAPACITY) return false;
    while (cache.preparedSourceSize + size > PREPARED_SOURCE_CAPACITY) {
        const oldest = cache.preparedOrder.shift()!;
        if (oldest.font === undefined) delete cache.richPrepared[oldest.key];
        else delete cache.prepared[oldest.font]?.[oldest.key];
        cache.preparedSourceSize -= oldest.size;
    }
    cache.preparedOrder.push({ key, font, size });
    cache.preparedSourceSize += size;
    return true;
}
function preparedText(
    text: string,
    font: string,
    cache: MessageTextLayoutCache,
    whiteSpace: "normal" | "pre-wrap" = "normal",
): PreparedText {
    const ready = cacheReady(cache);
    const fontKey = whiteSpace === "normal" ? font : `${font}:pre-wrap`;
    let byText = ready.prepared[fontKey];
    if (!byText) {
        byText = dictionaryCreate();
        ready.prepared[fontKey] = byText;
    }
    const hit = byText[text];
    if (hit !== undefined) return hit;
    const value = prepare(text, font, { whiteSpace });
    if (preparationRetain(ready, text, fontKey)) byText[text] = value;
    return value;
}
/** Painted height of one wrapped run, never less than a single line box. */
function runHeight(
    text: string,
    font: string,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
    whiteSpace: "normal" | "pre-wrap" = "normal",
): number {
    if (measure <= 0 || (whiteSpace === "normal" && text.trim().length === 0)) return lineHeight;
    const ready = cacheReady(cache);
    const fontKey = whiteSpace === "normal" ? font : `${font}:pre-wrap`;
    let byText = ready.runHeights[fontKey];
    if (!byText) {
        byText = dictionaryCreate();
        ready.runHeights[fontKey] = byText;
    }
    let layouts = byText[text];
    if (!layouts) {
        layouts = dictionaryCreate();
        byText[text] = layouts;
    }
    const key = `${String(measure)}:${String(lineHeight)}`;
    const hit = layouts[key];
    if (hit !== undefined) return hit;
    const value = preparedText(text, font, ready, whiteSpace);
    const height = Math.max(lineHeight, layout(value, measure, lineHeight).height);
    layouts[key] = height;
    return height;
}

/**
 * Rows of one `pre-wrap` run whose first row is `first` wide and whose later
 * rows, hanging under it, are `rest` wide; never fewer than one.
 */
function hangingRows(
    text: string,
    font: string,
    first: number,
    rest: number,
    cache: MessageTextLayoutCache,
): number {
    if (first <= 0 || rest <= 0) return 1;
    const ready = cacheReady(cache);
    const fontKey = `${font}:hanging`;
    let byText = ready.runHeights[fontKey];
    if (!byText) {
        byText = dictionaryCreate();
        ready.runHeights[fontKey] = byText;
    }
    let layouts = byText[text];
    if (!layouts) {
        layouts = dictionaryCreate();
        byText[text] = layouts;
    }
    const key = `${String(first)}:${String(rest)}`;
    const hit = layouts[key];
    if (hit !== undefined) return hit;
    const prepared = prepareWithSegments(text, font, { whiteSpace: "pre-wrap" });
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let rows = 0;
    for (;;) {
        const line = layoutNextLine(prepared, cursor, rows === 0 ? first : rest);
        if (line === null) break;
        rows += 1;
        cursor = line.end;
    }
    const value = Math.max(1, rows);
    layouts[key] = value;
    return value;
}

function preparedRichItems(
    items: readonly RichInlineItem[],
    cache: MessageTextLayoutCache,
): PreparedRichInline {
    const ready = cacheReady(cache);
    const key = JSON.stringify(
        items.map((item) => [
            item.text,
            item.font,
            item.letterSpacing ?? null,
            item.break ?? null,
            item.extraWidth ?? null,
        ]),
    );
    const hit = ready.richPrepared[key];
    if (hit !== undefined) return hit;
    const value = prepareRichInline([...items]);
    if (preparationRetain(ready, key)) ready.richPrepared[key] = value;
    return value;
}
function richItemsHeight(
    items: readonly RichInlineItem[],
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
): number {
    if (measure <= 0 || items.length === 0) return lineHeight;
    const measured = preparedRichItems(items, cache);
    const relaxedMeasure = measure + INLINE_MEASURE_EPSILON;
    const relaxed = measureRichInlineStats(measured, relaxedMeasure);
    /* Pretext can hang a token slightly beyond its supplied measure. Keep the
       one-layout-unit tolerance only when the resulting line also stays inside
       that contract; otherwise resolve the real, unrelaxed line break. */
    const stats =
        relaxed.maxLineWidth <= relaxedMeasure
            ? relaxed
            : measureRichInlineStats(measured, measure);
    return Math.max(1, stats.lineCount) * lineHeight;
}
function richItemsNaturalWidth(
    items: readonly RichInlineItem[],
    cache: MessageTextLayoutCache,
): number {
    return measureRichInlineStats(preparedRichItems(items, cache), Number.MAX_SAFE_INTEGER)
        .maxLineWidth;
}

type MarkdownRootContent = MessageMarkdownAst["children"][number];
type MarkdownParagraph = Extract<MarkdownRootContent, { type: "paragraph" }>;
type MarkdownPhrasing = MarkdownParagraph["children"][number];
type MarkdownFootnoteDefinition = Extract<MarkdownRootContent, { type: "footnoteDefinition" }>;
type MarkdownFootnotes = {
    readonly counts: ReadonlyMap<string, number>;
    readonly definitions: ReadonlyMap<string, MarkdownFootnoteDefinition>;
    readonly numbers: ReadonlyMap<string, number>;
    readonly order: readonly string[];
};
type MarkdownInlineStyle = {
    readonly italic: boolean;
    readonly size: number;
    readonly weight: number;
};
function markdownInlineFont(style: MarkdownInlineStyle): string {
    return `${style.italic ? "italic " : ""}${style.weight === 400 ? "" : `${String(style.weight)} `}${String(style.size)}px ${UI_FAMILY}`;
}
function markdownImageLabel(node: Extract<MarkdownPhrasing, { type: "image" }>): string {
    return node.alt?.trim() || node.url || "image";
}
/** Preserve the browser's Unicode line-breaking boundary across adjacent AST
 * nodes. In particular, punctuation immediately after a styled node belongs to
 * that preceding word; it cannot start a new line independently just because
 * Markdown represented the two fonts as separate nodes. */
function markdownInlineLeadingTokenAttach(
    items: RichInlineItem[],
    text: string,
    font: string,
    cache: MessageTextLayoutCache,
    measure: number,
    enabled: boolean,
): string {
    const previous = items.at(-1);
    if (!enabled || !previous || /\s$/u.test(previous.text) || /^\s/u.test(text)) return text;
    const match = /^\S+/u.exec(text);
    if (!match) return text;
    const tokenWidth = naturalTextWidth(match[0], font, cache);
    /* Punctuation and other no-space continuations belong to the preceding
       fragment only while that combined fragment fits. Otherwise CSS can wrap
       at the inline-element boundary; charging the continuation as chrome would
       incorrectly repeat it on every emergency fragment. */
    if (
        naturalTextWidth(previous.text, previous.font, cache) +
            (previous.extraWidth ?? 0) +
            tokenWidth >
        measure
    )
        return text;
    previous.extraWidth = (previous.extraWidth ?? 0) + tokenWidth;
    return text.slice(match[0].length);
}
/** Split one overlong decorated segment. Pretext chooses the grapheme
 * boundaries; separate atomic items expose the true final fragment for link
 * punctuation and keep code padding on only its first/last fragments. */
function markdownInlineFragmentItems(
    text: string,
    font: string,
    measure: number,
    startExtraWidth: number,
    endExtraWidth: number,
    cache: MessageTextLayoutCache,
    decoratedFlow = false,
): RichInlineItem[] {
    /* `overflow-wrap: break-word` emergency-breaks the glyph run, not an intact
       word whose text fits and whose inline start/end decoration alone hangs
       beyond the measure. Keep that word atomic and let its box chrome occupy
       the same slight overflow the browser paints. */
    const textWidth = naturalTextWidth(text, font, cache);
    if (
        textWidth + (decoratedFlow ? startExtraWidth + endExtraWidth : 0) <=
        measure + INLINE_MEASURE_EPSILON
    )
        return [
            {
                break: "never",
                extraWidth: startExtraWidth + endExtraWidth,
                font,
                text,
            },
        ];
    const graphemes = [...GRAPHEME_SEGMENTER.segment(text)].map((part) => part.segment);
    const items: RichInlineItem[] = [];
    let graphemeIndex = 0;
    let first = true;
    while (graphemeIndex < graphemes.length) {
        const firstExtraWidth = first ? startExtraWidth : 0;
        const finalAvailable = Math.max(1, measure - firstExtraWidth - endExtraWidth);
        const remaining = graphemes.slice(graphemeIndex).join("");
        const prepared = prepareWithSegments(remaining, font, { whiteSpace: "normal" });
        let available = finalAvailable;
        let line = layoutNextLine(prepared, { graphemeIndex: 0, segmentIndex: 0 }, available);
        if (!line) break;
        let count = [...GRAPHEME_SEGMENTER.segment(line.text)].length;
        if (count < graphemes.length - graphemeIndex && endExtraWidth > 0) {
            const fullAvailable = Math.max(1, measure - firstExtraWidth);
            const fullLine = layoutNextLine(
                prepared,
                { graphemeIndex: 0, segmentIndex: 0 },
                fullAvailable,
            );
            if (fullLine) {
                const fullCount = [...GRAPHEME_SEGMENTER.segment(fullLine.text)].length;
                /* The closing inset belongs only to the code element's final
                   fragment. Use the unreserved candidate only when content
                   still remains after it. */
                if (fullCount < graphemes.length - graphemeIndex) {
                    available = fullAvailable;
                    count = fullCount;
                    line = fullLine;
                }
            }
        }
        let fragment = graphemes.slice(graphemeIndex, graphemeIndex + count).join("");
        let fragmentWidth = naturalTextWidth(fragment, font, cache);
        /* Pretext follows Blink's punctuation hanging and can return a preferred
           hyphen breakpoint whose painted width exceeds the supplied measure.
           A padded inline fragment has no space for that overhang in WebKit.
           Retreat to the last real grapheme fit, retaining Pretext's chosen
           boundary whenever it already fits. */
        while (count > 1 && fragmentWidth > available + INLINE_MEASURE_EPSILON) {
            count -= 1;
            fragment = graphemes.slice(graphemeIndex, graphemeIndex + count).join("");
            fragmentWidth = naturalTextWidth(fragment, font, cache);
        }
        const final = graphemeIndex + count >= graphemes.length;
        items.push({
            break: "never",
            extraWidth: firstExtraWidth + (final ? endExtraWidth : 0),
            font,
            text: fragment,
        });
        graphemeIndex += count;
        first = false;
    }
    return items;
}
function markdownInlineItemsAppend(
    node: MarkdownPhrasing,
    style: MarkdownInlineStyle,
    runs: RichInlineItem[][],
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    measure: number,
    bindDecoratedPunctuation: boolean,
    fragmentLong = false,
    atomic = false,
): void {
    const current = () => runs[runs.length - 1]!;
    if (node.type === "text") {
        const font = markdownInlineFont(style);
        const text = markdownInlineLeadingTokenAttach(
            current(),
            inlineBreaksMark(node.value),
            font,
            cache,
            measure,
            bindDecoratedPunctuation,
        );
        if (text.length === 0) return;
        const tokens = atomic ? [text] : (text.match(/\s*\S+|\s+$/gu) ?? [text]);
        for (const token of tokens) {
            const match = /^(\s*)(\S+)$/u.exec(token);
            if (
                fragmentLong &&
                match &&
                naturalTextWidth(match[2]!, font, cache) > measure + INLINE_MEASURE_EPSILON
            ) {
                if (match[1]!.length > 0) current().push({ font, text: match[1]! });
                /* Only a piece with no break opportunity of its own needs an
                   emergency break. The pieces between such pieces stay one
                   item, which breaks where it may: separate items would not. */
                let breakable = "";
                for (const piece of prepareWithSegments(match[2]!, font, { whiteSpace: "normal" })
                    .segments) {
                    if (naturalTextWidth(piece, font, cache) <= measure + INLINE_MEASURE_EPSILON) {
                        breakable += piece;
                        continue;
                    }
                    if (breakable.length > 0) current().push({ font, text: breakable });
                    breakable = "";
                    current().push(
                        ...markdownInlineFragmentItems(piece, font, measure, 0, 0, cache),
                    );
                }
                if (breakable.length > 0) current().push({ font, text: breakable });
                continue;
            }
            current().push({
                break: atomic ? "never" : undefined,
                font,
                text: token,
            });
        }
        return;
    }
    if (node.type === "inlineCode") {
        const text = inlineBreaksMark(node.value.replace(/\r?\n|\r/gu, " "));
        const font = INLINE_CODE_FONT;
        /* An opening bracket in the preceding prose cannot end a browser line
           independently of the code it introduces: `(` + `code` wraps as one
           run. Keep its whitespace in flow, but charge the bracket to the
           first code fragment so a font boundary cannot create that break. */
        const previous = current().at(-1);
        const opening = previous?.text.match(/[\p{Ps}\p{Pi}]+$/u)?.[0];
        const openingWidth =
            opening && previous ? naturalTextWidth(opening, previous.font, cache) : 0;
        if (opening && previous) previous.text = previous.text.slice(0, -opening.length);
        const textWidth = naturalTextWidth(text, font, cache);
        /* Gecko reserves sliced code padding while breaking continuation lines
           too: the closing 5px on every line the code fragments onto, the
           opening 5px only on its first. A breakable run carries its decoration
           on each fragment, and fragments sharing a line add up: the first word
           carries the opening padding and the rest the closing padding that
           every line reserves. Charging only the first/last words can omit a
           whole wrapped line. */
        if (GECKO_INLINE_SLICE && textWidth > measure && /\s/u.test(text)) {
            const first = /^\S*/u.exec(text)![0];
            if (first.length > 0)
                current().push({ extraWidth: 5 + openingWidth, font, text: first });
            current().push({
                extraWidth: first.length > 0 ? 5 : 10 + openingWidth,
                font,
                text: text.slice(first.length),
            });
            return;
        }
        const decoratedFlow =
            openingWidth + textWidth + (WEBKIT_INLINE_SLICE ? 5 : 10) >
            measure + INLINE_MEASURE_EPSILON;
        const segments = prepareWithSegments(text, font, { whiteSpace: "normal" }).segments;
        for (const [index, segment] of segments.entries()) {
            const items = markdownInlineFragmentItems(
                segment,
                font,
                measure,
                index === 0 ? 5 + openingWidth : 0,
                index === segments.length - 1 ? 5 : 0,
                cache,
                decoratedFlow,
            );
            current().push(...items);
        }
        return;
    }
    if (node.type === "break") {
        runs.push([]);
        return;
    }
    if (node.type === "image") {
        current().push({
            break: atomic ? "never" : undefined,
            font: markdownInlineFont(style),
            text: markdownImageLabel(node),
        });
        return;
    }
    if (node.type === "imageReference") {
        current().push({
            break: atomic ? "never" : undefined,
            font: markdownInlineFont(style),
            text: node.alt?.trim() || node.label || node.identifier || "image",
        });
        return;
    }
    if (node.type === "footnoteReference") {
        const number = footnotes.numbers.get(node.identifier.toUpperCase());
        current().push({
            break: "never",
            font: markdownInlineFont(style),
            text: number === undefined ? (node.label ?? node.identifier) : String(number),
        });
        return;
    }
    if (node.type === "html") return;
    const nestedStyle: MarkdownInlineStyle =
        node.type === "strong"
            ? { ...style, weight: 700 }
            : node.type === "emphasis"
              ? { ...style, italic: true }
              : style;
    const nestedAtomic = atomic;
    const nestedFragmentLong =
        fragmentLong || node.type === "link" || node.type === "linkReference";
    for (const child of node.children)
        markdownInlineItemsAppend(
            child,
            nestedStyle,
            runs,
            cache,
            footnotes,
            measure,
            bindDecoratedPunctuation,
            nestedFragmentLong,
            nestedAtomic,
        );
}
function markdownTrailingInlineApply(
    runs: RichInlineItem[][],
    lastChildStart: { readonly item: number; readonly run: number },
    lastChild: MarkdownPhrasing,
    trailingExtraWidth: number,
    baseFont: string,
    cache: MessageTextLayoutCache,
): void {
    if (trailingExtraWidth <= 0) return;
    const finalRun = runs.at(-1);
    if (!finalRun || lastChildStart.run !== runs.length - 1) return;
    if (lastChild.type === "text") {
        const finalItem = finalRun.at(-1);
        if (!finalItem) return;
        const match = /^(.*?)(\s+)(\S+)$/u.exec(finalItem.text);
        if (match) {
            finalRun.splice(
                finalRun.length - 1,
                1,
                { ...finalItem, text: `${match[1]!}${match[2]!}` },
                {
                    ...finalItem,
                    break: "never",
                    extraWidth: (finalItem.extraWidth ?? 0) + trailingExtraWidth,
                    text: match[3]!,
                },
            );
            return;
        }
        finalRun[finalRun.length - 1] = {
            ...finalItem,
            break: "never",
            extraWidth: (finalItem.extraWidth ?? 0) + trailingExtraWidth,
        };
        return;
    }
    const childItems = finalRun.splice(lastChildStart.item);
    if (childItems.length === 0) return;
    const childWidth = richItemsNaturalWidth(childItems, cache);
    const spaceWidth = naturalTextWidth("\u00a0", baseFont, cache);
    finalRun.push({
        break: "never",
        extraWidth: Math.max(0, childWidth + trailingExtraWidth - spaceWidth),
        font: baseFont,
        text: "\u00a0",
    });
}
function markdownInlineRuns(
    children: readonly MarkdownPhrasing[],
    style: MarkdownInlineStyle,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailingExtraWidth: number,
    task: boolean,
    suffixText: string,
): readonly RichInlineItem[][] {
    const baseFont = markdownInlineFont(style);
    const runs: RichInlineItem[][] = [[]];
    if (task) {
        runs[0]!.push({
            break: "never",
            extraWidth: TASK_CHECKBOX_INLINE,
            font: baseFont,
            text: "\u00a0",
        });
    }
    let lastChildStart = { item: runs[0]!.length, run: 0 };
    for (const [index, child] of children.entries()) {
        if (index === children.length - 1)
            lastChildStart = { item: runs.at(-1)!.length, run: runs.length - 1 };
        markdownInlineItemsAppend(
            child,
            style,
            runs,
            cache,
            footnotes,
            measure,
            suffixText.length === 0,
            false,
        );
    }
    const lastChild = children.at(-1);
    if (lastChild)
        markdownTrailingInlineApply(
            runs,
            lastChildStart,
            lastChild,
            trailingExtraWidth,
            baseFont,
            cache,
        );
    if (suffixText.length > 0) runs.at(-1)!.push({ font: baseFont, text: suffixText });
    return runs;
}
function markdownInlineHeight(
    children: readonly MarkdownPhrasing[],
    style: MarkdownInlineStyle,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailingExtraWidth = 0,
    task = false,
    suffixText = "",
): number {
    if (
        !markdownInlineHasLineBox(children) &&
        trailingExtraWidth === 0 &&
        !task &&
        suffixText.length === 0
    )
        return 0;
    const runs = markdownInlineRuns(
        children,
        style,
        measure,
        cache,
        footnotes,
        trailingExtraWidth,
        task,
        suffixText,
    );
    const height = runs.reduce(
        (total, items) => total + richItemsHeight(items, lineHeight, measure, cache),
        0,
    );
    return height;
}

/** Tight-list paragraphs unwrap into the `<li>`. A following nested list is
 * then an element sibling of whatever inline elements that phrasing painted,
 * which is what `.happy-message__body--markdown li > * + *` matches. */
function markdownPhrasingPaintsElement(children: readonly MarkdownPhrasing[]): boolean {
    return children.some((node) => node.type !== "text" && node.type !== "html");
}

/** Empty cells have padding but no line box. Mirror the rendered inline tree:
 * skipped HTML and collapsed ASCII whitespace do not create one, whereas code
 * decoration, images-as-labels, references and explicit breaks do. */
function markdownInlineHasLineBox(children: readonly MarkdownPhrasing[]): boolean {
    return children.some((node) => {
        if (node.type === "html") return false;
        if (node.type === "text") return /[^\t\n\r ]/u.test(node.value);
        if (
            node.type === "inlineCode" ||
            node.type === "break" ||
            node.type === "image" ||
            node.type === "imageReference" ||
            node.type === "footnoteReference"
        )
            return true;
        return markdownInlineHasLineBox(node.children);
    });
}

/** Height of one ordinary UI-font run at an explicit type ramp and measure. */
export function uiTextHeight(
    text: string,
    size: number,
    lineHeight: number,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return runHeight(text, `${String(size)}px ${UI_FAMILY}`, lineHeight, measure, cache);
}

/** The error card's 14/20 text, including preserved diagnostic line breaks. */
export function errorTextHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    heading = false,
): number {
    return runHeight(
        text,
        `${heading ? "500 " : ""}14px ${UI_FAMILY}`,
        20,
        measure,
        cache,
        heading ? "normal" : "pre-wrap",
    );
}
/** The heading ramp: h2 is the largest, h3 alone carries a taller line. */
const HEADINGS = [
    { size: 16, line: 24, weight: 900 },
    { size: 20, line: 24, weight: 600 },
    { size: 16, line: 28, weight: 600 },
    { size: 16, line: 24, weight: 600 },
    { size: 16, line: 24, weight: 600 },
    { size: 16, line: 24, weight: 600 },
] as const;
/** A block's painted box plus the margins that separate it from its neighbours. */
type Block = { readonly height: number; readonly marginTop: number; readonly marginBottom: number };
const flow = (height: number): Block => ({ height, marginTop: 0, marginBottom: 0 });
type MarkdownList = Extract<MarkdownRootContent, { type: "list" }>;
type MarkdownTrailingInline = {
    readonly endOffset: number;
    readonly extraWidth: number;
};

function messageMarkdownTree(text: string, cache: MessageTextLayoutCache): MessageMarkdownAst {
    const hit = cache.markdownTrees[text];
    if (hit !== undefined) return hit;
    const tree = messageMarkdownParse(text);
    // A guided review's chapters are grouped exactly as the renderer groups them.
    guidedReviewSectionsApply(tree as unknown as Parameters<typeof guidedReviewSectionsApply>[0]);
    cache.markdownTrees[text] = tree;
    return tree;
}
type MutableMarkdownFootnotes = {
    readonly counts: Map<string, number>;
    readonly definitions: Map<string, MarkdownFootnoteDefinition>;
    readonly numbers: Map<string, number>;
    readonly order: string[];
};
function markdownFootnoteReferenceCollect(
    node: MarkdownPhrasing,
    footnotes: MutableMarkdownFootnotes,
): void {
    if (node.type === "footnoteReference") {
        const identifier = node.identifier.toUpperCase();
        if (!footnotes.numbers.has(identifier)) {
            footnotes.order.push(identifier);
            footnotes.numbers.set(identifier, footnotes.order.length);
        }
        footnotes.counts.set(identifier, (footnotes.counts.get(identifier) ?? 0) + 1);
        return;
    }
    if (
        node.type === "text" ||
        node.type === "inlineCode" ||
        node.type === "break" ||
        node.type === "image" ||
        node.type === "imageReference" ||
        node.type === "html"
    )
        return;
    for (const child of node.children) markdownFootnoteReferenceCollect(child, footnotes);
}
function markdownFootnoteReferencesCollect(
    node: MarkdownRootContent,
    footnotes: MutableMarkdownFootnotes,
): void {
    if (node.type === "paragraph" || node.type === "heading") {
        for (const child of node.children) markdownFootnoteReferenceCollect(child, footnotes);
        return;
    }
    if (node.type === "blockquote") {
        for (const child of node.children) markdownFootnoteReferencesCollect(child, footnotes);
        return;
    }
    if (node.type === "list") {
        for (const item of node.children)
            for (const child of item.children) markdownFootnoteReferencesCollect(child, footnotes);
        return;
    }
    if (node.type === "table") {
        for (const row of node.children)
            for (const cell of row.children)
                for (const child of cell.children)
                    markdownFootnoteReferenceCollect(child, footnotes);
    }
}
/** Mirrors mdast-util-to-hast's reference-order numbering and generated footer. */
function messageMarkdownFootnotes(
    text: string,
    tree: MessageMarkdownAst,
    cache: MessageTextLayoutCache,
): MarkdownFootnotes {
    const hit = cache.markdownFootnotes[text];
    if (hit !== undefined) return hit;
    const footnotes: MutableMarkdownFootnotes = {
        counts: new Map(),
        definitions: new Map(),
        numbers: new Map(),
        order: [],
    };
    for (const node of tree.children)
        if (node.type === "footnoteDefinition")
            footnotes.definitions.set(node.identifier.toUpperCase(), node);
    /* Definitions are collected but skipped during the main transform. Their
       content is transformed later, in first-reference order, and can itself
       introduce another referenced definition. */
    for (const node of tree.children)
        if (node.type !== "footnoteDefinition") markdownFootnoteReferencesCollect(node, footnotes);
    for (let index = 0; index < footnotes.order.length; index += 1) {
        const definition = footnotes.definitions.get(footnotes.order[index]!);
        if (!definition) continue;
        for (const child of definition.children)
            markdownFootnoteReferencesCollect(child, footnotes);
    }
    cache.markdownFootnotes[text] = footnotes;
    return footnotes;
}
function markdownBlocksHeight(
    nodes: readonly MarkdownRootContent[],
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    gap: number,
    codeMargins: boolean,
    trailing: MarkdownTrailingInline | undefined,
    mermaidEnabled: boolean,
    review: MarkdownReview,
): number {
    const blocks = nodes
        .map((node) =>
            markdownBlockHeight(
                node,
                measure,
                cache,
                footnotes,
                codeMargins,
                trailing,
                false,
                mermaidEnabled,
                review,
            ),
        )
        .filter((block) => block !== undefined);
    let total = 0;
    let pendingMargin = 0;
    for (const [index, block] of blocks.entries()) {
        pendingMargin = Math.max(pendingMargin, index > 0 ? gap : 0, block.marginTop);
        if (block.height === 0) {
            // Empty block margins collapse through the element, rather than
            // adding another paragraph gap before the next painted block.
            pendingMargin = Math.max(pendingMargin, block.marginBottom);
            continue;
        }
        total += pendingMargin + block.height;
        pendingMargin = block.marginBottom;
    }
    return total + pendingMargin;
}
function markdownListHeight(
    list: MarkdownList,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailing: MarkdownTrailingInline | undefined,
    mermaidEnabled: boolean,
    review: MarkdownReview,
): number {
    const itemMeasure = measure - LIST_INDENT;
    let total = 0;
    for (const [itemIndex, item] of list.children.entries()) {
        const blocks = item.children
            .map((node, childIndex) =>
                markdownBlockHeight(
                    node,
                    itemMeasure,
                    cache,
                    footnotes,
                    false,
                    trailing,
                    childIndex === 0 && item.checked !== null,
                    mermaidEnabled,
                    review,
                ),
            )
            .filter((block) => block !== undefined);
        const first = blocks[0];
        if (itemIndex > 0) total += LIST_ITEM_GAP;
        if (!first) {
            // The list marker creates a body line even before the item's
            // first text node arrives (for example a streamed "1. ").
            total += PARAGRAPH_LINE;
            continue;
        }
        let itemHeight = first.height;
        for (let index = 1; index < blocks.length; index += 1) {
            /* Tight-list paragraphs unwrap into the `<li>`, so `li > * + *`
               does not apply when that phrasing is only text nodes. Inline
               elements (`a`, `code`, `strong`, …) still become element
               siblings of a following nested list, and the 6px child-block
               gap paints. Spread items keep `<p>` and always take the gap. */
            const previous = item.children[index - 1];
            const gap =
                previous?.type === "paragraph" &&
                !list.spread &&
                !item.spread &&
                !markdownPhrasingPaintsElement(previous.children)
                    ? 0
                    : LIST_ITEM_GAP;
            itemHeight += gap + blocks[index]!.height;
        }
        total += itemHeight;
    }
    return total;
}

function mermaidBlockHeight(
    source: string,
    measure: number,
    cache: MessageTextLayoutCache,
    enabled: boolean,
): number {
    const lines = Math.max(1, source.split("\n").length);
    const sourceHeight = MERMAID_DIAGRAM_BORDER + CODE_PADDING * 2 + lines * CODE_LINE;
    if (!enabled) return sourceHeight;
    let dimensions = cache.mermaidDimensions[source];
    if (dimensions === undefined) {
        try {
            dimensions = mermaidDiagramMeasure(source);
        } catch {
            dimensions = null;
        }
        cache.mermaidDimensions[source] = dimensions;
    }
    return dimensions === null ? sourceHeight : mermaidDiagramNaturalHeight(dimensions, measure);
}

/** What a body's Happy fences are read against: the body, and the change behind it. */
type MarkdownReview = {
    readonly text: string;
    readonly streaming: boolean;
    readonly grounding: HappyUiGrounding | undefined;
};

/* `guided-review.css`: a chapter's gaps, its number chip, and the column
   width from which its words and its aside stand side by side. */
const SECTION_MARGIN = 24;
const SECTION_GAP = 12;
const SECTION_WORDS_GAP = 8;
const SECTION_HEADING_LINE = 24;
const SECTION_CHIP = 20 + 10;
const SECTION_WIDE = 720;
const SECTION_WORDS_WIDTH = 280;
const SECTION_COLUMN_GAP = 24;

/** A guided review's chapter: its words, the one thing beside them, the rest. */
function guidedReviewSectionHeight(
    parts: GuidedReviewSectionParts,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    trailing: MarkdownTrailingInline | undefined,
    mermaidEnabled: boolean,
    review: MarkdownReview,
): Block {
    const block = (node: unknown, width: number) =>
        markdownBlockHeight(
            node as MarkdownRootContent,
            width,
            cache,
            footnotes,
            false,
            trailing,
            false,
            mermaidEnabled,
            review,
        )?.height ?? 0;
    const wide = parts.aside !== undefined && measure >= SECTION_WIDE;
    const wordsWidth = wide ? SECTION_WORDS_WIDTH : measure;
    const heading = parts.heading as unknown as { children: readonly MarkdownPhrasing[] };
    let words = Math.max(
        SECTION_HEADING_LINE,
        markdownInlineHeight(
            heading.children,
            { italic: false, size: 16, weight: 600 },
            SECTION_HEADING_LINE,
            wordsWidth - SECTION_CHIP,
            cache,
            footnotes,
        ),
    );
    for (const node of parts.prose) words += SECTION_WORDS_GAP + block(node, wordsWidth);
    const asideWidth = wide ? measure - SECTION_WORDS_WIDTH - SECTION_COLUMN_GAP : measure;
    const aside = parts.aside === undefined ? undefined : block(parts.aside, asideWidth);
    let height =
        aside === undefined ? words : wide ? Math.max(words, aside) : words + SECTION_GAP + aside;
    for (const node of parts.rest) height += SECTION_GAP + block(node, measure);
    return { height, marginTop: SECTION_MARGIN, marginBottom: 0 };
}

/** Measures one actual remark/GFM block node with the same type ramp as its renderer. */
function markdownBlockHeight(
    node: MarkdownRootContent,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    codeMargins: boolean,
    trailing: MarkdownTrailingInline | undefined,
    task: boolean,
    mermaidEnabled: boolean,
    review: MarkdownReview,
    suffixText = "",
): Block | undefined {
    if (node.type === "paragraph") {
        const extraWidth =
            trailing !== undefined && node.position?.end.offset === trailing.endOffset
                ? trailing.extraWidth
                : 0;
        return flow(
            markdownInlineHeight(
                node.children,
                { italic: false, size: PARAGRAPH_SIZE, weight: 400 },
                PARAGRAPH_LINE,
                measure,
                cache,
                footnotes,
                extraWidth,
                task,
                suffixText,
            ),
        );
    }
    if (node.type === "heading") {
        const ramp = HEADINGS[node.depth - 1]!;
        return flow(
            markdownInlineHeight(
                node.children,
                { italic: false, size: ramp.size, weight: ramp.weight },
                ramp.line,
                measure,
                cache,
                footnotes,
            ),
        );
    }
    if ((node as { type: string }).type === GUIDED_REVIEW_SECTION)
        return guidedReviewSectionHeight(
            (node as unknown as { data: { guidedReview: GuidedReviewSectionParts } }).data
                .guidedReview,
            measure,
            cache,
            footnotes,
            trailing,
            mermaidEnabled,
            review,
        );
    if (node.type === "code") {
        /* A Happy fence is a block of its own; while it is still being
           written it is the one line that holds its place. */
        const label = guidedReviewFenceLabel(node.lang);
        if (label !== undefined)
            return {
                height: guidedReviewFenceHeight(
                    label,
                    node.value,
                    guidedReviewFenceOpen(
                        review.text,
                        node.position?.end.offset ?? review.text.length,
                        review.streaming,
                    ),
                    review.streaming,
                    measure,
                    {
                        text: (text, size, weight, lineHeight, width) =>
                            runHeight(
                                text,
                                markdownInlineFont({ italic: false, size, weight }),
                                lineHeight,
                                width,
                                cache,
                            ),
                        markdown: (text, width) =>
                            markdownBodyHeight(
                                text,
                                width,
                                cache,
                                0,
                                true,
                                false,
                                review.grounding,
                            ),
                        code: (source) =>
                            CODE_PADDING * 2 + Math.max(1, source.split("\n").length) * CODE_LINE,
                        codeRows: (text, first, rest) =>
                            hangingRows(text, `12px ${MONO_FAMILY}`, first, rest, cache),
                        document: guidedReviewDocument(review.text),
                        ...(review.grounding === undefined ? {} : { grounding: review.grounding }),
                    },
                ),
                marginTop: codeMargins ? CODE_GAP : 0,
                marginBottom: codeMargins ? CODE_GAP : 0,
            };
        if (node.lang?.trim().toLowerCase() === "mermaid")
            return {
                height: mermaidBlockHeight(node.value, measure, cache, mermaidEnabled),
                marginTop: codeMargins ? CODE_GAP : 0,
                marginBottom: codeMargins ? CODE_GAP : 0,
            };
        const lines = Math.max(1, node.value.split("\n").length);
        return {
            height: CODE_PADDING * 2 + lines * CODE_LINE,
            marginTop: codeMargins ? CODE_GAP : 0,
            marginBottom: codeMargins ? CODE_GAP : 0,
        };
    }
    if (node.type === "table")
        return flow(markdownTableLayout(node, measure, cache, footnotes).height);
    if (node.type === "thematicBreak") return flow(RULE_HEIGHT);
    if (node.type === "blockquote")
        return flow(
            markdownBlocksHeight(
                node.children,
                measure - QUOTE_INSET,
                cache,
                footnotes,
                BLOCK_GAP,
                false,
                trailing,
                mermaidEnabled,
                review,
            ),
        );
    if (node.type === "list")
        return flow(
            markdownListHeight(node, measure, cache, footnotes, trailing, mermaidEnabled, review),
        );
    /* Definitions and skipped HTML create no DOM box. That is distinct from
       an empty heading/paragraph: its zero-height element still participates
       in the CSS sibling-margin sequence while the next token is arriving. */
    return undefined;
}
type MarkdownTable = Extract<MarkdownRootContent, { type: "table" }>;
type MarkdownTableCell = MarkdownTable["children"][number]["children"][number];
/** One cell's extents on a single line, independent of the column it lands in. */
type MarkdownTableCellExtent = {
    /** Widest run that cannot wrap: the narrowest content box the cell reads well at. */
    readonly min: number;
    /** Widest hard-broken run with no wrapping at all. */
    readonly max: number;
    /** Line boxes the cell paints at any measure that fits `max`. */
    readonly lines: number;
};
/**
 * Whole-pixel geometry of one GFM table at one measure. The row-height model
 * and `MessageMarkdown`'s `<colgroup>` both take it from `markdownTableLayout`,
 * so a mounted table paints exactly the rows the virtual list reserved.
 */
export type MarkdownTableLayout = {
    /** Border-box width of every column; cells keep 12px of padding each side. */
    readonly columnWidths: readonly number[];
    /** Line boxes per row, header first. A row with no text paints none. */
    readonly rowLines: readonly number[];
    /** Sum of the column widths, wider than the measure only when it scrolls. */
    readonly width: number;
    readonly height: number;
};
const TABLE_HEADER_STYLE: MarkdownInlineStyle = {
    italic: false,
    size: PARAGRAPH_SIZE,
    weight: 600,
};
const TABLE_BODY_STYLE: MarkdownInlineStyle = { italic: false, size: PARAGRAPH_SIZE, weight: 400 };
/**
 * Measured cells outlive any one Markdown source. A streamed reply is laid out
 * from a scratch cache on every update, so without this each update would
 * re-measure every cell it already measured; a settled reply's cells are the
 * same cells again. Entries are keyed by everything that decides a cell's
 * geometry — its phrasing tree without source positions, its header/body
 * style, and the numbers its footnote references resolve to — and the engine
 * is fixed for the process. The whole cache is dropped when the installed font
 * changes, and it is bounded by key size, least recently used first.
 */
type TableCellEntry = {
    readonly extent: MarkdownTableCellExtent;
    /** Line boxes at each content width the cell has wrapped at, oldest first. */
    readonly lines: Map<number, number>;
};
const TABLE_CELL_CAPACITY = 256 * 1_024;
const TABLE_CELL_WIDTHS = 8;
const tableCells = {
    generation: fontGeneration,
    entries: new Map<string, TableCellEntry>(),
    size: 0,
};
function tableCellKey(
    cell: MarkdownTableCell,
    style: MarkdownInlineStyle,
    footnotes: MarkdownFootnotes,
): string {
    const phrasing = JSON.stringify(cell.children, (key, value: unknown) => {
        if (key === "position") return undefined;
        const node = value as { type?: string; identifier?: string } | null;
        if (node?.type === "footnoteReference")
            return { ...node, number: footnotes.numbers.get(node.identifier!.toUpperCase()) };
        return value;
    });
    return `${String(style.weight)}:${phrasing}`;
}
function tableCellEntry(
    cell: MarkdownTableCell,
    style: MarkdownInlineStyle,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
): TableCellEntry {
    if (tableCells.generation !== fontGeneration) {
        tableCells.generation = fontGeneration;
        tableCells.entries.clear();
        tableCells.size = 0;
    }
    const key = tableCellKey(cell, style, footnotes);
    const hit = tableCells.entries.get(key);
    if (hit !== undefined) {
        /* Map order is insertion order: re-inserting marks it most recent. */
        tableCells.entries.delete(key);
        tableCells.entries.set(key, hit);
        return hit;
    }
    const entry: TableCellEntry = {
        extent: markdownTableCellExtent(cell, style, cache, footnotes),
        lines: new Map(),
    };
    if (key.length > TABLE_CELL_CAPACITY) return entry;
    while (tableCells.size + key.length > TABLE_CELL_CAPACITY) {
        const oldest = tableCells.entries.keys().next().value!;
        tableCells.entries.delete(oldest);
        tableCells.size -= oldest.length;
    }
    tableCells.entries.set(key, entry);
    tableCells.size += key.length;
    return entry;
}
/** Line boxes a cached cell paints at one content width. */
function tableCellLines(
    entry: TableCellEntry,
    cell: MarkdownTableCell,
    style: MarkdownInlineStyle,
    content: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
): number {
    if (entry.extent.max <= content + INLINE_MEASURE_EPSILON) return entry.extent.lines;
    const hit = entry.lines.get(content);
    if (hit !== undefined) return hit;
    const lines = markdownInlineHeight(cell.children, style, 1, content, cache, footnotes);
    if (entry.lines.size >= TABLE_CELL_WIDTHS) entry.lines.delete(entry.lines.keys().next().value!);
    entry.lines.set(content, lines);
    return lines;
}
function markdownTableCellExtent(
    cell: MarkdownTableCell,
    style: MarkdownInlineStyle,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
): MarkdownTableCellExtent {
    if (!markdownInlineHasLineBox(cell.children)) return { min: 0, max: 0, lines: 0 };
    /* An unbounded measure never fragments a token, so these runs describe
       the cell's text alone. */
    const runs = markdownInlineRuns(
        cell.children,
        style,
        Number.MAX_SAFE_INTEGER,
        cache,
        footnotes,
        0,
        false,
        "",
    );
    let min = 0;
    let max = 0;
    for (const items of runs) {
        if (items.length === 0) continue;
        max = Math.max(max, richItemsNaturalWidth(items, cache));
        /* The widest word, where a word may span several items: `*` before an
           emphasis or `,` after a link has no break opportunity at the font
           boundary. A column at least this wide never needs an emergency break,
           which is where engines disagree most about where a word splits. */
        let word = 0;
        const wordEnd = () => {
            min = Math.max(min, word);
            word = 0;
        };
        for (const item of items) {
            if (/^\s/u.test(item.text)) wordEnd();
            if (item.break === "never") {
                if (item.text.trim().length > 0)
                    word +=
                        naturalTextWidth(item.text, item.font, cache) +
                        /* Gecko reserves code padding on every line a code span
                           fragments onto, so each of its words needs both sides. */
                        (GECKO_INLINE_SLICE && item.font === INLINE_CODE_FONT
                            ? 10
                            : (item.extraWidth ?? 0));
            } else {
                const prepared = prepareWithSegments(item.text, item.font, {
                    whiteSpace: "normal",
                });
                let previous: string | undefined;
                for (const [index, kind] of prepared.kinds.entries()) {
                    if (kind === "text" || kind === "glue") {
                        /* Pretext splits one item's text exactly where it may break. */
                        if (kind === "text" && previous === "text") wordEnd();
                        word += prepared.widths[index]!;
                    } else wordEnd();
                    previous = kind;
                }
                word += item.extraWidth ?? 0;
            }
            if (/\s$/u.test(item.text)) wordEnd();
        }
        wordEnd();
    }
    return { min, max, lines: runs.length };
}
/** Adds `extra` whole pixels to `base` in proportion to `weights`, handing the
 * rounding remainder to the largest fractions so the sum stays exact. */
function tableWidthsDistribute(
    base: readonly number[],
    weights: readonly number[],
    extra: number,
): number[] {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const shares = base.map((_, index) =>
        total > 0 ? (extra * weights[index]!) / total : extra / base.length,
    );
    const widths = base.map((width, index) => width + Math.floor(shares[index]!));
    let remainder = extra - shares.reduce((sum, share) => sum + Math.floor(share), 0);
    const order = shares
        .map((share, index) => ({ fraction: share - Math.floor(share), index }))
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (const { index } of order) {
        if (remainder <= 0) break;
        widths[index]! += 1;
        remainder -= 1;
    }
    return widths;
}
/**
 * Column widths at one whole-pixel measure. A table that fits on one line per
 * cell fills the measure in proportion to its columns. Otherwise short columns
 * keep their single line and every wider column shares what is left in
 * proportion to how much it wants beyond its widest word. Only when that is
 * still too wide do the short columns give way too. When even every column at
 * its widest word is too wide, the table scrolls at readable widths.
 */
function markdownTableColumnWidths(
    min: readonly number[],
    max: readonly number[],
    target: number,
): number[] {
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
    const maxTotal = sum(max);
    if (maxTotal <= target) return tableWidthsDistribute(max, max, target - maxTotal);
    const short = max.map((width) => width <= TABLE_SHORT_COLUMN);
    const pinned = max.map((width, index) => (short[index] ? width : min[index]!));
    const pinnedTotal = sum(pinned);
    if (pinnedTotal <= target)
        return tableWidthsDistribute(
            pinned,
            max.map((width, index) => (short[index] ? 0 : width - min[index]!)),
            target - pinnedTotal,
        );
    const minTotal = sum(min);
    if (minTotal <= target)
        return tableWidthsDistribute(
            min,
            max.map((width, index) => (short[index] ? width - min[index]! : 0)),
            target - minTotal,
        );
    /* The table scrolls whatever the widths. Short columns keep their line and
       prose columns get a readable measure instead of their widest word, which
       would set prose one or two words to a line. */
    return max.map((width, index) =>
        short[index] ? width : Math.min(width, Math.max(min[index]!, TABLE_READABLE_COLUMN)),
    );
}
/** Lays one GFM table out at `measure`: shared by the row-height model and the renderer. */
function markdownTableLayout(
    table: MarkdownTable,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
): MarkdownTableLayout {
    const columns = table.children[0]?.children.length ?? 0;
    /* mdast-util-to-hast pads a short row with empty cells and drops cells
       beyond the header's count; only the cells it renders take part. */
    const rows = table.children.map((row, rowIndex) => {
        const style = rowIndex === 0 ? TABLE_HEADER_STYLE : TABLE_BODY_STYLE;
        return row.children.slice(0, columns).map((cell) => ({
            cell,
            entry: tableCellEntry(cell, style, cache, footnotes),
            style,
        }));
    });
    const min = Array.from({ length: columns }, () => 0);
    const max = Array.from({ length: columns }, () => 0);
    for (const row of rows)
        for (const [index, { entry }] of row.entries()) {
            min[index] = Math.max(min[index]!, entry.extent.min);
            max[index] = Math.max(max[index]!, entry.extent.max);
        }
    /* Whole pixels on both edges: the `<col>` widths the renderer writes are
       integers, and so is the scrollport width this measure stands for. */
    for (let index = 0; index < columns; index += 1) {
        max[index] = Math.ceil(max[index]!) + TABLE_CELL_INLINE_PADDING;
        min[index] = Math.min(max[index]!, Math.ceil(min[index]!) + TABLE_CELL_INLINE_PADDING);
    }
    const columnWidths = markdownTableColumnWidths(
        min,
        max,
        Math.max(0, Math.floor(measure + INLINE_MEASURE_EPSILON)),
    );
    const rowLines = rows.map((row) =>
        row.reduce(
            (lines, { cell, entry, style }, index) =>
                Math.max(
                    lines,
                    tableCellLines(
                        entry,
                        cell,
                        style,
                        columnWidths[index]! - TABLE_CELL_INLINE_PADDING,
                        cache,
                        footnotes,
                    ),
                ),
            0,
        ),
    );
    return {
        columnWidths,
        rowLines,
        width: columnWidths.reduce((total, width) => total + width, 0),
        height: rowLines.reduce(
            (total, lines) => total + TABLE_CELL_PADDING * 2 + lines * PARAGRAPH_LINE,
            0,
        ),
    };
}
function markdownFootnoteBackrefs(count: number): string {
    let text = "";
    for (let reference = 1; reference <= count; reference += 1)
        text += ` ↩${reference === 1 ? "" : String(reference)}`;
    return text;
}
function markdownFootnoteDefinitionHeight(
    definition: MarkdownFootnoteDefinition,
    count: number,
    measure: number,
    cache: MessageTextLayoutCache,
    footnotes: MarkdownFootnotes,
    mermaidEnabled: boolean,
    review: MarkdownReview,
): number {
    const itemMeasure = measure - LIST_INDENT;
    const last = definition.children.at(-1);
    const suffix = markdownFootnoteBackrefs(count);
    const suffixAttached = last?.type === "paragraph";
    const blocks = definition.children
        .map((node) =>
            markdownBlockHeight(
                node,
                itemMeasure,
                cache,
                footnotes,
                false,
                undefined,
                false,
                mermaidEnabled,
                review,
                node === last && suffixAttached ? suffix : "",
            ),
        )
        .filter((block) => block !== undefined);
    const first = blocks[0];
    let total = first?.height ?? 0;
    for (let index = 1; index < blocks.length; index += 1)
        total += LIST_ITEM_GAP + blocks[index]!.height;
    /* mdast-util-to-hast appends backreferences directly to a definition whose
       final child is not a paragraph. That anonymous inline run still paints
       one body line after the preceding block. */
    if (!suffixAttached) total += PARAGRAPH_LINE;
    return total;
}
function markdownFootnotesHeight(
    footnotes: MarkdownFootnotes,
    measure: number,
    cache: MessageTextLayoutCache,
    mermaidEnabled: boolean,
    review: MarkdownReview,
): number {
    let total = 0;
    let rendered = 0;
    for (const identifier of footnotes.order) {
        const definition = footnotes.definitions.get(identifier);
        if (!definition) continue;
        if (rendered > 0) total += LIST_ITEM_GAP;
        total += markdownFootnoteDefinitionHeight(
            definition,
            footnotes.counts.get(identifier) ?? 0,
            measure,
            cache,
            footnotes,
            mermaidEnabled,
            review,
        );
        rendered += 1;
    }
    return total;
}
/**
 * Painted height of a Markdown message body wrapped at `measure` px. Adjacent
 * block margins collapse to the larger of the two, exactly as they do in flow,
 * and only a block carrying its own margin (fenced code) contributes one at the
 * body's outer edges. An empty source string occupies one line box, matching
 * the anchor paragraph a generation keeps before text arrives. Nonempty source
 * that renders empty syntax (such as `##`) keeps its actual zero-height box.
 */
export function markdownBodyHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
    trailingExtraWidth = 0,
    mermaidEnabled = true,
    streaming = false,
    grounding?: HappyUiGrounding,
): number {
    const review: MarkdownReview = { text, streaming, grounding };
    /* A virtual row's size is authoritative even while it streams. Bound the
       lifetime of prefix layout, not its accuracy: use the same Markdown/font
       model in a scratch cache that cannot accumulate in settled history. The
       row-height cache still reuses the result for an unchanged entry/width. */
    const ready = cacheReady(streaming ? streamingCache(cache) : cache);
    let byMeasure = ready.markdownHeights[text];
    if (!byMeasure) {
        byMeasure = dictionaryCreate();
        ready.markdownHeights[text] = byMeasure;
    }
    /* A guided review's height follows what the grounding answers, so a
       change finishing its read re-sizes the row rather than reusing the
       height cached while it was loading. */
    const measureKey = `${String(measure)}:${String(trailingExtraWidth)}:${mermaidEnabled ? "diagram" : "source"}:${happyUiSignature(text, grounding)}`;
    const cached = byMeasure[measureKey];
    if (cached !== undefined) return cached;
    const tree = messageMarkdownTree(text, ready);
    const trailing =
        trailingExtraWidth > 0
            ? { endOffset: text.trimEnd().length, extraWidth: trailingExtraWidth }
            : undefined;
    const footnotes = messageMarkdownFootnotes(text, tree, ready);
    const content = tree.children.filter((node) => node.type !== "footnoteDefinition");
    const contentHeight = markdownBlocksHeight(
        content,
        measure,
        ready,
        footnotes,
        BLOCK_GAP,
        true,
        trailing,
        mermaidEnabled,
        review,
    );
    const footnotesHeight = markdownFootnotesHeight(
        footnotes,
        measure,
        ready,
        mermaidEnabled,
        review,
    );
    const height =
        contentHeight +
        (contentHeight > 0 && footnotesHeight > 0 ? BLOCK_GAP : 0) +
        footnotesHeight;
    const painted = text.length === 0 ? PARAGRAPH_LINE : height;
    byMeasure[measureKey] = painted;
    return painted;
}

/** Mounted tables re-solve on every resize and streamed prefix. Keep their
 * parsed sources in one cache that is replaced, not grown, once it holds a
 * few sources or a few long ones: every streamed prefix is a new source, and
 * measured cells survive the reset in the shared cell cache. */
const TABLE_RENDER_SOURCES = 32;
const TABLE_RENDER_CHARACTERS = 64 * 1_024;
let tableRenderCache = messageTextLayoutCacheCreate();
let tableRenderSources = 0;
let tableRenderCharacters = 0;
function markdownTableAt(
    nodes: readonly MarkdownRootContent[],
    offset: number,
): MarkdownTable | undefined {
    for (const node of nodes) {
        if (node.type === "table" && node.position?.start.offset === offset) return node;
        const children =
            node.type === "blockquote" || node.type === "footnoteDefinition"
                ? node.children
                : node.type === "list"
                  ? node.children.flatMap((item) => item.children)
                  : undefined;
        const found = children && markdownTableAt(children, offset);
        if (found) return found;
    }
    return undefined;
}
/**
 * Layout of the table that starts at `offset` in Markdown `source`, at the
 * measure its mounted scrollport actually has. This is the same AST and the
 * same solve `markdownBodyHeight` used for the row, not a second model.
 */
export function markdownTableLayoutAt(
    source: string,
    offset: number,
    measure: number,
): MarkdownTableLayout | undefined {
    if (tableRenderCache.markdownTrees[source] === undefined) {
        tableRenderSources += 1;
        tableRenderCharacters += source.length;
        if (
            tableRenderSources > TABLE_RENDER_SOURCES ||
            tableRenderCharacters > TABLE_RENDER_CHARACTERS
        ) {
            tableRenderCache = messageTextLayoutCacheCreate();
            tableRenderSources = 1;
            tableRenderCharacters = source.length;
        }
    }
    const cache = cacheReady(tableRenderCache);
    const tree = messageMarkdownTree(source, cache);
    const table = markdownTableAt(tree.children, offset);
    if (!table) return undefined;
    return markdownTableLayout(
        table,
        measure,
        cache,
        messageMarkdownFootnotes(source, tree, cache),
    );
}

/** Painted height of a service line's 13px copy wrapped at `measure` px. */
export function noticeTextHeight(
    text: string,
    measure: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return runHeight(text, `${NOTICE_SIZE}px ${UI_FAMILY}`, NOTICE_LINE, measure, cache);
}
/**
 * Width of the 11px mono time that shares the own-message bubble line. It is
 * transparent until hover but always in flow, so it takes real measure away
 * from the bubble beside it.
 */
export function asideTimeWidth(time: string, cache: MessageTextLayoutCache = sharedCache): number {
    if (time.length === 0) return 0;
    const font = `11px ${MONO_FAMILY}`;
    return naturalTextWidth(time, font, cache);
}
/** Natural width of ordinary message UI text at one explicit size. */
export function uiTextNaturalWidth(
    text: string,
    size: number,
    cache: MessageTextLayoutCache = sharedCache,
    weight = 400,
): number {
    const font = `${weight === 400 ? "" : `${String(weight)} `}${String(size)}px ${UI_FAMILY}`;
    return naturalTextWidth(text, font, cache);
}
/** Natural width of one mono run at an explicit size. */
export function monoTextNaturalWidth(
    text: string,
    size: number,
    cache: MessageTextLayoutCache = sharedCache,
): number {
    return naturalTextWidth(text, `${String(size)}px ${MONO_FAMILY}`, cache);
}
function naturalTextWidth(text: string, font: string, cache: MessageTextLayoutCache): number {
    const ready = cacheReady(cache);
    let byText = ready.naturalWidths[font];
    if (!byText) {
        byText = dictionaryCreate();
        ready.naturalWidths[font] = byText;
    }
    const hit = byText[text];
    if (hit !== undefined) return hit;
    const width = measureNaturalWidth(prepareWithSegments(text, font, { whiteSpace: "normal" }));
    byText[text] = width;
    return width;
}
