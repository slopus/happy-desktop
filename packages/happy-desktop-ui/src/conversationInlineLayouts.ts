import {
    conversationActionBlockParse,
    conversationActionSegments,
    conversationTextLayoutParse,
    conversationTextSegments,
    type ChatActionBlock,
    type ChatFigure,
    type ConversationEntry,
    type ConversationMediaItem,
    type ConversationMediaLayout,
    type ConversationMediaLayoutNode,
    type ConversationTextSegment,
    type ConversationToolCall,
} from "happy-desktop-state";
import type { ConversationMediaRunMember } from "./conversationMediaRuns";
import { mediaTreeSound } from "./MediaTree";
import { mediaVideoFramesSignature } from "./mediaVideoFrames";

/**
 * Layouts an agent wrote into its reply as HTML, drawn where it wrote them.
 *
 * An `<img src>` in a layout names a picture or recording already shown
 * earlier in the conversation — read, presented, or generated — by the path a
 * tool showed it from, the same way a `present_files` layout names its files. Nothing is loaded from disk or the network: the source resolves to that
 * call's existing item, the latest call that showed the path winning, and an
 * image that names nothing is left out. A block in which no image resolves is
 * not a layout and stays the inert HTML it always was. So does one the client
 * cannot parse, and one that lays out absurdly tall: a broken layout is text,
 * and its pictures stay under the calls that showed them.
 *
 * A picture placed in a reply is not drawn again under the call that showed
 * it: that call's media hides it, and a call left with nothing to show draws
 * only its line. A layout that does not resolve hides nothing.
 *
 * Each layout is cut out of the reply's text and replaced by a placeholder
 * comment on its own lines, which the Markdown renderer and the row-height
 * model both read as one block: the layout, sized by the same off-screen
 * measurement every agent-written tree uses. An HTML block still open at the
 * end of a streaming reply is held back until it closes, so it never flashes
 * as raw text; once the reply settles it is inert HTML like any other.
 *
 * Inline action blocks — a menu, a checklist, a code field, steps, a status
 * line, a tree, a live figure — are cut out the same way, from the Markdown
 * the layouts leave, exactly where `@slopus/happy-agent-client` finds and
 * numbers them, and drawn by `ChatActionBlock`. They need no earlier picture,
 * so any agent reply may hold one. A block the client refuses, and a figure
 * this surface does not draw, stay the inert text they were written as.
 */

/** One layout in a reply: a tree over pictures it named, or an action block. */
export type MessageInlineLayout = MessageMediaLayout | MessageActionLayout;

export type MessageMediaLayout = {
    readonly kind: "media";
    readonly key: string;
    readonly root: readonly ConversationMediaLayoutNode[];
    /** The picture each item node shows, by the node's index. */
    readonly members: readonly ConversationMediaRunMember[];
};

export type MessageActionLayout = {
    readonly kind: "actions";
    readonly key: string;
    readonly block: ChatActionBlock;
    /** The block's index across its whole message: what its choice and its presses name. */
    readonly blockIndex: number;
};

/** The pictures a reply's layout places; an action block places none. */
export function messageLayoutMembers(
    layout: MessageInlineLayout,
): readonly ConversationMediaRunMember[] {
    return layout.kind === "media" ? layout.members : [];
}

/** A reply's layouts, and its text with each one replaced by its placeholder. */
export type MessageInlineLayouts = {
    readonly text: string;
    readonly layouts: ReadonlyMap<string, MessageInlineLayout>;
    /** Everything the reply's height reads of its layouts, for a row's cache key. */
    readonly signature: string;
};

export type ConversationInlineLayouts = {
    /** Each reply with a layout or a held block, by its entry key. */
    readonly messages: ReadonlyMap<string, MessageInlineLayouts>;
    /** Each call's items placed in a reply, by the call's entry key. */
    readonly hidden: ReadonlyMap<string, ReadonlySet<number>>;
};

const PLACEHOLDER = /^<!--happy-layout:([0-9a-z-]+)-->$/u;

/** The layout key a placeholder block names, or nothing for any other HTML. */
export function messageInlineLayoutKey(html: string): string | undefined {
    return PLACEHOLDER.exec(html.trim())?.[1];
}

const NONE: ConversationInlineLayouts = { messages: new Map(), hidden: new Map() };

/** Each path a picture or recording was shown from, to the latest item shown from it. */
type Shown = Map<string, ConversationMediaRunMember>;

/** Every reply's layouts in `entries`, and the pictures they take from their calls. */
export function conversationInlineLayouts(
    entries: readonly ConversationEntry[],
    /**
     * The `mediaVideoFrames` version the caller read: a recording that stated
     * no size is part of its layout's identity once its size is learned, so
     * the reply's text, and every height keyed on it, changes with it.
     */
    framesAt?: number,
    /** The live figures this surface draws; any other stays text. One value per surface. */
    figureTypes: ReadonlySet<ChatFigure["type"]> = NO_FIGURES,
): ConversationInlineLayouts {
    const shown: Shown = new Map();
    let messages: Map<string, MessageInlineLayouts> | undefined;
    let hidden: Map<string, Set<number>> | undefined;
    for (const entry of entries) {
        if (entry.kind === "agentActivity" && entry.activity.kind === "tool") {
            const tool = entry.activity.tool;
            if (tool.presentation?.type !== "media") continue;
            for (const [index, item] of tool.presentation.items.entries()) {
                if ((item.kind !== "image" && item.kind !== "video") || item.source === undefined)
                    continue;
                const member = memberOf(entry.id, tool, index, item);
                shown.set(item.source.path, member);
                shown.set(item.source.absolutePath, member);
            }
            continue;
        }
        if (entry.kind !== "message" || entry.message.sender?.kind !== "agent") continue;
        if (shown.size === 0 && entry.actions === undefined) continue;
        const layouts = messageInlineLayouts(entry, shown, framesAt, figureTypes);
        if (layouts === undefined) continue;
        messages ??= new Map();
        messages.set(entry.message.id, layouts);
        for (const layout of layouts.layouts.values())
            for (const member of messageLayoutMembers(layout)) {
                hidden ??= new Map();
                let indexes = hidden.get(member.entryId);
                if (!indexes) {
                    indexes = new Set();
                    hidden.set(member.entryId, indexes);
                }
                indexes.add(member.index);
            }
    }
    return messages === undefined ? NONE : { messages, hidden: hidden ?? new Map() };
}

/* One value per picture, so a block's parse can tell whether a source still
   names the picture it named before by identity alone. */
const members = new WeakMap<ConversationMediaItem, ConversationMediaRunMember>();

function memberOf(
    entryId: string,
    tool: ConversationToolCall,
    index: number,
    item: ConversationMediaItem,
): ConversationMediaRunMember {
    const held = members.get(item);
    if (held?.entryId === entryId && held.tool === tool && held.index === index) return held;
    const member = { entryId, tool, index, item };
    members.set(item, member);
    return member;
}

const NO_FIGURES: ReadonlySet<ChatFigure["type"]> = new Set();

/* A reply's text is cut once per entry, however often the transcript updates. */
const segmentsOf = new WeakMap<ConversationEntry, readonly ConversationTextSegment[]>();

/** A stretch of Markdown a media layout left, with its action blocks cut out. */
type ActionCut = {
    readonly text: string;
    readonly layouts: readonly MessageActionLayout[];
    /** How many complete action blocks it holds, drawn or not: the client numbers them all. */
    readonly count: number;
    /** Whether anything was cut out or held back. */
    readonly changed: boolean;
};

/* Cut once per stretch of text, where its blocks start, and figures drawn. */
const actionCuts = new Map<string, ActionCut>();
const ACTION_CUTS = 256;

function actionCut(
    markdown: string,
    blockStart: number,
    streaming: boolean,
    figureTypes: ReadonlySet<ChatFigure["type"]>,
): ActionCut {
    if (!markdown.includes("<")) return { text: markdown, layouts: [], count: 0, changed: false };
    const cacheKey = `${String(blockStart)}\u0000${streaming ? "s" : ""}\u0000${[...figureTypes].join(",")}\u0000${markdown}`;
    const held = actionCuts.get(cacheKey);
    if (held) return held;
    const pieces: string[] = [];
    const layouts: MessageActionLayout[] = [];
    let count = 0;
    let changed = false;
    for (const segment of conversationActionSegments(markdown)) {
        if (segment.type === "markdown") {
            pieces.push(segment.text);
            continue;
        }
        /* Held while the reply streams, so its tags never flash; one the reply
           ended without closing is plain text, and the client never numbers it. */
        if (!segment.complete) {
            if (streaming) changed = true;
            else pieces.push(segment.html);
            continue;
        }
        const blockIndex = blockStart + count;
        count += 1;
        const block = conversationActionBlockParse(segment.html, blockIndex);
        if (
            block === undefined ||
            (block.kind === "figure" && !figureTypes.has(block.figure.type))
        ) {
            pieces.push(segment.html);
            continue;
        }
        changed = true;
        const key = `a${String(blockIndex)}-${hash(segment.html)}`;
        layouts.push({ kind: "actions", key, block, blockIndex });
        /* Its own block, at the left margin, whatever surrounds it. */
        pieces.push(`\n\n<!--happy-layout:${key}-->\n\n`);
    }
    const cut = { text: changed ? pieces.join("") : markdown, layouts, count, changed };
    actionCuts.set(cacheKey, cut);
    if (actionCuts.size > ACTION_CUTS) actionCuts.delete(actionCuts.keys().next().value!);
    return cut;
}

/* An entry is immutable; its layouts change only when what its sources
   resolve to does, so an unchanged resolution keeps its value. */
const resolved = new WeakMap<ConversationEntry, MessageInlineLayouts>();

function messageInlineLayouts(
    entry: Extract<ConversationEntry, { kind: "message" }>,
    shown: Shown,
    framesAt: number | undefined,
    figureTypes: ReadonlySet<ChatFigure["type"]>,
): MessageInlineLayouts | undefined {
    const message = entry.message;
    /* No tag, no layout: almost every reply leaves here. */
    if (!message.text.includes("<")) return undefined;
    const streaming = message.generationStatus === "streaming";
    const actions = entry.actions;
    const pieces: string[] = [];
    const layouts = new Map<string, MessageInlineLayout>();
    let changed = false;
    let segments = segmentsOf.get(entry);
    if (segments === undefined) {
        segments = conversationTextSegments(message.text);
        segmentsOf.set(entry, segments);
    }
    if (actions === undefined && !segments.some((segment) => segment.type === "layout"))
        return undefined;
    /* The client numbers action blocks only in the Markdown media layouts leave. */
    let blockIndex = actions?.blockStart ?? 0;
    for (const [position, segment] of segments.entries()) {
        if (segment.type === "markdown") {
            if (actions === undefined) {
                pieces.push(segment.text);
                continue;
            }
            const cut = actionCut(segment.text, blockIndex, streaming, figureTypes);
            blockIndex += cut.count;
            pieces.push(cut.text);
            if (cut.changed) changed = true;
            for (const layout of cut.layouts) layouts.set(layout.key, layout);
            continue;
        }
        /* A block still open is held while the reply streams, so its tags
           never flash; one the reply ended without closing is plain text. */
        if (!segment.complete) {
            if (streaming) changed = true;
            else pieces.push(segment.html);
            continue;
        }
        const layout = shown.size === 0 ? undefined : blockLayout(segment.html, shown);
        if (
            layout === undefined ||
            !mediaTreeSound(
                layout.root,
                layout.members.map((member) => member.item),
            )
        ) {
            pieces.push(segment.html);
            continue;
        }
        changed = true;
        const key = `${String(position)}-${hash(
            `${segment.html}\u0000${layout.members.map(memberSignature).join(",")}\u0000${mediaVideoFramesSignature(
                layout.members.map((member) => member.item),
                framesAt,
            )}`,
        )}`;
        layouts.set(key, { kind: "media", key, ...layout });
        /* Its own block, at the left margin, whatever surrounds it. */
        pieces.push(`\n\n<!--happy-layout:${key}-->\n\n`);
    }
    if (!changed) return undefined;
    const text = pieces.join("");
    const signature = [...layouts.keys()].join(",");
    const held = resolved.get(entry);
    if (held?.text === text && held.signature === signature) return held;
    const value = { text, layouts, signature };
    resolved.set(entry, value);
    return value;
}

type BlockParse = {
    /** Each source the parser asked about, and the picture it named then. */
    readonly asked: ReadonlyMap<string, ConversationMediaRunMember | undefined>;
    readonly layout: Omit<MessageMediaLayout, "key" | "kind"> | undefined;
};

/* A block's parse depends on its HTML and on what each source it asked about
   resolved to. A transcript re-derives its layouts on every update, so the
   parse is kept while those answers stand. */
const BLOCK_PARSES = 128;
const blockParses = new Map<string, BlockParse>();

function blockLayout(
    html: string,
    shown: Shown,
): Omit<MessageMediaLayout, "key" | "kind"> | undefined {
    const held = blockParses.get(html);
    if (held && [...held.asked].every(([source, member]) => shown.get(source) === member)) {
        blockParses.delete(html);
        blockParses.set(html, held);
        return held.layout;
    }
    const asked = new Map<string, ConversationMediaRunMember | undefined>();
    const candidates: ConversationMediaRunMember[] = [];
    const parsed = conversationTextLayoutParse(html, (source) => {
        const member = shown.get(source);
        asked.set(source, member);
        if (member === undefined) return undefined;
        const known = candidates.indexOf(member);
        if (known >= 0) return known;
        candidates.push(member);
        return candidates.length - 1;
    });
    const layout = parsed && {
        root: parsed.root,
        members: parsed.placed.map((position) => candidates[position]!),
    };
    blockParses.set(html, { asked, layout });
    if (blockParses.size > BLOCK_PARSES) blockParses.delete(blockParses.keys().next().value!);
    return layout;
}

function memberSignature(member: ConversationMediaRunMember): string {
    return `${member.entryId}:${String(member.index)}:${String(member.item.width)}x${String(member.item.height)}@${String(member.item.scale ?? 1)}`;
}

/** 32-bit FNV-1a, in base 36: a layout's identity in its reply's text. */
function hash(value: string): string {
    let state = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        state ^= value.charCodeAt(index);
        state = Math.imul(state, 0x01000193);
    }
    return (state >>> 0).toString(36);
}

/** What a call still draws under its line once the items placed in replies are gone. */
export type ConversationMediaVisible = {
    readonly items: readonly ConversationMediaItem[];
    readonly layout?: ConversationMediaLayout;
    /** Each drawn item's index in the call's own items. */
    readonly indexes: readonly number[];
};

/**
 * A call's media less the items a reply placed. A tree that lays out absurdly
 * tall is broken: the call draws its items in the automatic layout instead.
 */
export function conversationMediaVisible(
    items: readonly ConversationMediaItem[],
    layout: ConversationMediaLayout | undefined,
    hidden: ReadonlySet<number> | undefined,
): ConversationMediaVisible {
    if (hidden === undefined || hidden.size === 0)
        return {
            items,
            ...visibleLayout(items, layout),
            indexes: items.map((_, index) => index),
        };
    const indexes = items.map((_, index) => index).filter((index) => !hidden.has(index));
    const visible = indexes.map((index) => items[index]!);
    return {
        items: visible,
        ...visibleLayout(
            visible,
            layout?.type === "tree"
                ? { type: "tree", root: mediaLayoutRootHide(layout.root, indexes) }
                : layout,
        ),
        indexes,
    };
}

function visibleLayout(
    items: readonly ConversationMediaItem[],
    layout: ConversationMediaLayout | undefined,
): { layout?: ConversationMediaLayout } {
    if (layout === undefined) return {};
    if (layout.type === "tree" && !mediaTreeSound(layout.root, items)) return {};
    return { layout };
}

/* A tree less its hidden items, kept per tree and visible set so the same
   call measures the same root on every render. */
const hiddenRoots = new WeakMap<
    readonly ConversationMediaLayoutNode[],
    Map<string, ConversationMediaLayoutNode[]>
>();

function mediaLayoutRootHide(
    root: readonly ConversationMediaLayoutNode[],
    indexes: readonly number[],
): ConversationMediaLayoutNode[] {
    const key = indexes.join(",");
    let byVisible = hiddenRoots.get(root);
    const held = byVisible?.get(key);
    if (held) return held;
    const positions = new Map(indexes.map((index, position) => [index, position]));
    const hidden = mediaLayoutRootReindex(root, (index) => positions.get(index));
    if (!byVisible) {
        byVisible = new Map();
        hiddenRoots.set(root, byVisible);
    }
    byVisible.set(key, hidden);
    return hidden;
}

/**
 * A tree with each item node renumbered by `place`; an item `place` refuses is
 * left out, and everything around it stays.
 */
function mediaLayoutRootReindex(
    root: readonly ConversationMediaLayoutNode[],
    place: (index: number) => number | undefined,
): ConversationMediaLayoutNode[] {
    const nodes: ConversationMediaLayoutNode[] = [];
    for (const node of root) {
        if (node.type === "item") {
            const index = place(node.index);
            if (index !== undefined) nodes.push({ ...node, index });
        } else if (node.type === "element")
            nodes.push({ ...node, children: mediaLayoutRootReindex(node.children, place) });
        else nodes.push(node);
    }
    return nodes;
}
