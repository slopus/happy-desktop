import {
    entryKey,
    type AgentTurnTraceSummary,
    type ConversationEntry,
    type ConversationErrorAssistance,
    type ConversationMediaItem,
    type ConversationMediaLayout,
    type ConversationRequest,
    type HappyReference,
} from "happy-desktop-state";
import {
    conversationAgentRowStartsGroup,
    conversationEntryPrecedesActivity,
    conversationEntryResumesAfterActivity,
    conversationMessageClosedByStatus,
    conversationMessageGrouped,
    conversationOwnMessageContinued,
    conversationTurnStatusAfterActivity,
    conversationTurnStatusStartsGroup,
} from "./conversationMessageGrouped";
import {
    asideTimeWidth,
    controlLabelNaturalWidth,
    errorRichTextHeight,
    errorTextHeight,
    markdownBodyHeight,
    markdownBodyPrepare,
    plainTextHeight,
    MESSAGE_PLAIN_LINE_HEIGHT,
    messageTextLayoutCacheCreate,
    messageTextLayoutCacheRefresh,
    messageTextLayoutCacheSettledClear,
    monoOutputTextHeight,
    monoTextNaturalWidth,
    noticeTextHeight,
    uiTextHeight,
    uiTextNaturalWidth,
    textLayoutCssSize,
    type MessageTextLayoutCache,
} from "./messageTextLayout";
import {
    messageReferencesNamed,
    messageReferencesPlainText,
    messageReferencesResolve,
    messageReferencesSignature,
    type MessageReferences,
} from "./messageReferences";
import { messageBodyFormat, type MessageBodyFormat } from "./messagePlainText";
import {
    INLINE_PAGE_TITLE_HEIGHT,
    inlinePageHeight,
    type InlinePageGeometry,
} from "./inlinePageFit";
import { SYSTEM_NOTIFICATION_HEIGHT } from "./systemNotification";
import { agentTraceMetaStats, agentTraceMetaTitle } from "./agentTraceMeta";
import { conversationErrorTitle } from "./conversationErrorTitle";
import { conversationErrorAssistanceText } from "./conversationErrorAssistanceText";
import { conversationErrorDetails } from "./conversationErrorDetails";
import {
    conversationFailureCardLayout,
    conversationFailureMessage,
    type ConversationFailureClock,
    conversationFailureSwitchLabel,
    conversationFailureTargetKey,
} from "./conversationFailureText";
import type { ConversationSwitchTarget } from "./conversationSwitchTargets";
import {
    MESSAGE_MEDIA_LIMITS,
    MESSAGE_MEDIA_MAX,
    MESSAGE_MEDIA_MAX_WIDTH,
    conversationMediaPlan,
    mediaColumnsPlan,
    mediaFlowHeight,
    mediaJustifiedPlan,
    type MediaFlowImage,
} from "./mediaLayout";
import { mediaItemsFramed, mediaVideoFramesSignature } from "./mediaVideoFrames";
import { mediaTreeHeight, mediaTreeWidgetsSignature } from "./MediaTree";
import { userInputRuleText } from "./userInputRule";
import { conversationMediaRunSignature, type ConversationMediaRun } from "./conversationMediaRuns";
import {
    conversationMediaVisible,
    messageInlineLayoutKey,
    type MessageInlineLayouts,
} from "./conversationInlineLayouts";
import { AGENT_WORKING_STATUS_ROW_HEIGHT } from "./AgentWorkingStatus";
import { HAPPY_AGENT_ACTIVITY_CONTROL_TRANSCRIPT_HEIGHT } from "./HappyAgentActivityControl";

/** The same footer geometry for the live row and the room a queued turn will need. */
export function conversationWorkingStatusHeight(input: {
    readonly visible: boolean;
    readonly startsGroup: boolean;
    readonly closesMessage: boolean;
    readonly activityControl: boolean;
}): number {
    return Math.max(
        input.visible
            ? input.startsGroup
                ? 68
                : input.closesMessage
                  ? 32
                  : AGENT_WORKING_STATUS_ROW_HEIGHT
            : 0,
        input.activityControl ? HAPPY_AGENT_ACTIVITY_CONTROL_TRANSCRIPT_HEIGHT : 0,
    );
}

/**
 * Height of one conversation row, computed from the entry and the list's measure
 * alone — no mounted element, no render.
 *
 * The virtualizer needs a size for every row, including the thousands nobody has
 * scrolled to. Estimating them all at one constant makes the scrollbar
 * proportions fiction and turns each newly reached row into a visible
 * correction. Modelling height per entry kind removes that: free text is laid
 * out with Pretext, an activity row is a known constant, and an image box is
 * arithmetic on its intrinsic dimensions.
 *
 * This model is the row's geometry; mounted rows are never observed or measured.
 * A kind that deliberately has no detailed model returns `undefined` and takes
 * the list's fixed fallback height.
 *
 * Every constant mirrors `styles/message.css`, `styles/conversation.css`,
 * `styles/chat-conversation.css`, and `styles/agent-activity-row.css`. They are
 * duplicated deliberately: reading them from the cascade needs the element this
 * module exists to avoid mounting. A change to that CSS must be made here too.
 */
export type ConversationSurface = "conversation" | "chat";
export type ConversationRowContext = {
    /** The scroll port's content width in px. */
    readonly width: number;
    /** Which surface's row padding applies; the two chrome scales differ. */
    readonly surface: ConversationSurface;
    /** Identity of the reader, so their own messages take the own geometry. */
    readonly viewerId?: string;
    /** Activity-row chrome used by the owning conversation surface. */
    readonly activityTreatment?: "detailed" | "focused";
    /** Explicit disclosure state supplied by the UI owner; never inferred from a row. */
    readonly expanded?: boolean;
    /** Explicit per-message reading choice; absent on surfaces without compact sends. */
    readonly messageExpanded?: boolean;
    /** A live status footer follows the final agent message. */
    readonly liveStatus?: boolean;
    readonly errorAssistance?: ConversationErrorAssistance;
    /** What a failure card on this row offers, which sets the buttons it lays out. */
    readonly failure?: ConversationFailureRowContext;
    /**
     * What the Happy references in message bodies read as now. A reference is
     * laid out as its live title, the words the reader sees, so the row is
     * sized from the same resolution the body renders.
     */
    readonly references?: MessageReferences;
    /**
     * The page this row's tool call shows inline, as its owner holds it: where
     * it sits, whether it is collapsed, and the height its page last reported.
     */
    readonly inlinePage?: InlinePageGeometry;
    /** This row's part in a run of calls whose pictures form one grid. */
    readonly mediaRun?: ConversationMediaRun;
    /** This call's pictures a reply placed in its own layout, which its row no longer draws. */
    readonly mediaPlaced?: ReadonlySet<number>;
    /** The layouts this reply draws, and its text with each one's placeholder. */
    readonly messageLayouts?: MessageInlineLayouts;
};
export type ConversationFailureRowContext = {
    /** The conversation has not moved past this failure, so its actions are offered. */
    readonly current: boolean;
    readonly actions: {
        readonly retry: boolean;
        readonly newChat: boolean;
        readonly switch: boolean;
    };
    /** Every account the turn can continue on; the switch is offered only with one. */
    readonly switchTargets?: readonly ConversationSwitchTarget[];
    /** The picked switch target's key, which sets the split button's label. */
    readonly target?: string;
    readonly clock?: ConversationFailureClock;
};
/** A failure card whose owner offers nothing: its message and nothing else. */
const FAILURE_ROW_INERT: ConversationFailureRowContext = {
    current: false,
    actions: { retry: false, newChat: false, switch: false },
};
function smallButtonWidth(label: string, cache: MessageTextLayoutCache | undefined): number {
    return controlLabelNaturalWidth(label, 12, 700, 0.12, cache) + SMALL_BUTTON_CHROME;
}
type CachedRowHeight = { readonly value: number | undefined };
type Dictionary<T> = Record<string, T | undefined>;
type CachedEntryHeights = {
    readonly entry: ConversationEntry;
    readonly variants: Dictionary<CachedRowHeight>;
};
const dictionaryCreate = <T>(): Dictionary<T> => Object.create(null) as Dictionary<T>;
export interface ConversationRowHeightCache {
    /** Font generation of row results, independent of other text-cache consumers. */
    generation: number;
    /** Immutable-entry results at every width this conversation has occupied. */
    rows: Dictionary<CachedEntryHeights>;
    /** How many entries `rows` holds. */
    size: number;
    /** Prepared text and final text-layout results owned by this conversation. */
    readonly text: MessageTextLayoutCache;
}
/** Creates the row-layout cache for one conversation; the view bounds its lifetime. */
export function conversationRowHeightCacheCreate(): ConversationRowHeightCache {
    const text = messageTextLayoutCacheCreate();
    return {
        generation: text.generation,
        rows: dictionaryCreate(),
        size: 0,
        text,
    };
}
/**
 * A transcript lets go of its oldest rows as it keeps growing, but its cache would keep their
 * results for as long as the conversation stays open. Once it holds results for twice the rows
 * the transcript still has, it keeps only theirs and forgets its settled text layout, so what one
 * conversation retains stays proportional to what it shows.
 */
export function conversationRowHeightCachePrune(
    cache: ConversationRowHeightCache,
    entries: readonly ConversationEntry[],
): void {
    if (cache.size <= Math.max(ROW_CACHE_PRUNE_MINIMUM, entries.length * 2)) return;
    const rows = dictionaryCreate<CachedEntryHeights>();
    let size = 0;
    for (const entry of entries) {
        const id = entryKey(entry);
        const kept = cache.rows[id];
        if (kept === undefined || rows[id] !== undefined) continue;
        rows[id] = kept;
        size += 1;
    }
    cache.rows = rows;
    cache.size = size;
    messageTextLayoutCacheSettledClear(cache.text);
}
/** Below this many cached rows a conversation is never pruned. */
const ROW_CACHE_PRUNE_MINIMUM = 600;
/* Set while `conversationRowHeightCached` asks: a miss is recorded, not laid out. */
let cacheProbe: { missed: boolean } | undefined;
function rowHeightCached(
    cache: ConversationRowHeightCache | undefined,
    entry: ConversationEntry,
    key: string,
    calculate: () => number | undefined,
): number | undefined {
    if (!cache) return calculate();
    messageTextLayoutCacheRefresh(cache.text);
    if (cache.generation !== cache.text.generation) {
        cache.rows = dictionaryCreate();
        cache.size = 0;
        cache.generation = cache.text.generation;
    }
    const id = entryKey(entry);
    let cachedEntry = cache.rows[id];
    if (!cachedEntry || cachedEntry.entry !== entry) {
        if (!cachedEntry) cache.size += 1;
        cachedEntry = { entry, variants: dictionaryCreate() };
        cache.rows[id] = cachedEntry;
    }
    const hit = cachedEntry.variants[key];
    if (hit) return hit.value;
    if (cacheProbe) {
        cacheProbe.missed = true;
        return undefined;
    }
    const value = calculate();
    cachedEntry.variants[key] = { value };
    return value;
}
const NO_REFERENCES: readonly HappyReference[] = [];
/* The references each entry's laid-out body names. An entry is immutable, so
   its parse lives exactly as long as the entry does. */
const entryReferences = new WeakMap<ConversationEntry, readonly HappyReference[]>();
function conversationEntryReferences(entry: ConversationEntry): readonly HappyReference[] {
    const text =
        entry.kind === "message"
            ? entry.message.text
            : entry.kind === "agentActivity" &&
                (entry.activity.kind === "reasoning" || entry.activity.kind === "agentMessage")
              ? entry.activity.text
              : undefined;
    if (text === undefined) return NO_REFERENCES;
    let named = entryReferences.get(entry);
    if (!named) {
        named = messageReferencesNamed(text);
        entryReferences.set(entry, named);
    }
    return named;
}
/**
 * What every reference the rows of `entries` are laid out with reads as now,
 * once per distinct reference. Row heights read nothing else from
 * `MessageReferences`, so this changes when one of those titles does, or a
 * reference is named for the first time — not on every new `references`
 * object an owner happens to be handed.
 */
export function conversationReferencesSignature(
    entries: readonly ConversationEntry[],
    references: MessageReferences | undefined,
): string {
    const seen = new Set<string>();
    let signature = "";
    for (const entry of entries)
        for (const reference of conversationEntryReferences(entry)) {
            const key = `${reference.kind}/${reference.id}/${String(reference.version)}/${reference.workspaceId ?? ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            signature += `${key}\u0000${messageReferencesSignature([reference], references)}\u0000`;
        }
    return signature;
}
/**
 * `--happy-chat-measure`. Both surfaces centre their scrolling column at this
 * readable measure — `.happy-conversation` in `conversation.css`, and
 * `.happy-chat-conversation` in `terminal-panel.css` — so a wide window does
 * not widen a row, and neither does its text measure.
 */
export const CHAT_MEASURE = 880;
/** Vertical chrome around a message body, by author treatment and grouping. */
const MESSAGE_CHROME = {
    conversation: { agent: [57, 4], incoming: [77, 28], own: [52, 28] },
    chat: { agent: [41, 16], incoming: [77, 28], own: [52, 28] },
} as const;
/**
 * `.happy-conversation__resumed` raises an agent row's top padding to 8px when
 * its prose resumes after a tool run, replacing whichever padding grouping had
 * given it. Only the top edge changes.
 */
const RESUMED_PADDING_TOP = 8;
const CONVERSATION_AGENT_PADDING_TOP = { leading: 16, grouped: 2 } as const;
/**
 * `.happy-conversation__continues` gives prose the same 8px on the way into a
 * tool run that `.happy-conversation__resumed` gives it on the way out, and
 * `.happy-conversation__closing` trims an answer's trailing padding to 4px so
 * the status closing it sits a paragraph break away. Only the bottom edge
 * changes.
 */
const CONTINUES_PADDING_BOTTOM = 8;
const CLOSING_PADDING_BOTTOM = 4;
const CONVERSATION_AGENT_PADDING_BOTTOM = { leading: 16, grouped: 2 } as const;
/**
 * `.happy-conversation__own-continued` gives the reader's message that opens a
 * run of theirs a grouped row's 4px trailing padding instead of a fresh group's
 * 16px. Only the bottom edge changes.
 */
const OWN_PADDING_BOTTOM = { leading: 16, grouped: 4 } as const;
/** Horizontal chrome: row padding, then the 76% bubble cap, then bubble padding. */
const AGENT_INSET = 94;
/** CSS rounds each padding edge separately at native zoom. */
function agentInset(): number {
    return textLayoutCssSize(30) + textLayoutCssSize(64);
}
const INCOMING_INSET = 50;
const OWN_INSET = 48;
const BUBBLE_CAP = 0.76;
const BUBBLE_PADDING = 24;
/** The transparent-until-hover time that shares an own message's bubble line. */
const ASIDE_TIME_GAP = 8;
/** Inline grouped-message metadata: NBSP plus `.happy-message__hover-meta` padding. */
const GROUPED_TRAILING_META_PADDING = 8;
/** Six-pixel flex gaps on both sides of the metadata separator. */
const GROUPED_TRAILING_META_GAPS = 12;
/** Two-pixel dot separating a trace accessory from the timestamp. */
const GROUPED_TRAILING_META_SEPARATOR = 2;
/** Gaps around the optional two-pixel separator inside trace metadata. */
const TRACE_META_GAPS = 12;
const TRACE_META_SEPARATOR = 2;
/** `.happy-message__media` — its top margin under a body, and without one. */
const MEDIA_MARGIN = 8;
const MEDIA_MARGIN_BARE = 4;
/** Linked attachment cards: 64px cards, 4px gaps, and the message slot's top inset. */
const ATTACHMENT_CARD_HEIGHT = 64;
const ATTACHMENT_CARD_GAP = 4;
/** Collapsed `.happy-agent-activity-row` heights, by activity kind. */
const ACTIVITY_HEIGHT = { tool: 32, labeled: 32, reasoning: 40, agentMessage: 32 } as const;
/** Expanded reasoning: outer/header/gap chrome around its Markdown body. */
const REASONING_ACTIVITY_CHROME = 44;
/** The same chrome on an agent message, which rests on the tighter tool rhythm. */
const AGENT_MESSAGE_ACTIVITY_CHROME = 36;
/** Expanded shell row: outer/header/body chrome around pre-wrapped 12/18 output. */
const SHELL_ACTIVITY_CHROME = 60;
const SHELL_ACTIVITY_OUTPUT_INSET = 36;
const ACTIVITY_ROW_INSET = { detailed: 126, focused: 60 } as const;
/**
 * The same inset on the row a tool-first turn opens with, inside the Message
 * that carries the agent's identity line: the message's 30px leading inset,
 * then a detailed row ends on prose's 64px trailing edge while a focused row
 * keeps its own 30px on top of the message's 30px.
 */
const ACTIVITY_LEAD_INSET = { detailed: AGENT_INSET, focused: 90 } as const;
/** Tool-first Message: 16px top inset + 20px identity row, then no lower chrome. */
const ACTIVITY_LEAD_CHROME = 36;
/**
 * A lead row holding a run of activity restores the meta row's margin, because
 * the identity line opens its own boundary onto the run beneath it. Only a lead
 * whose content is an activity row pays it.
 */
const ACTIVITY_LEAD_RUN_SEPARATION = 6;
/** One delegated agent row: 20px call + 20px metadata + 4px vertical inset. */
const DELEGATION_HEIGHT = 44;
/** A summary row's toggle, and each detail line it opens onto. */
const SUMMARY_HEIGHT = 36;
const SUMMARY_DETAIL_HEIGHT = 22;
const SUMMARY_DETAILS_PADDING = 6;
/** `.happy-day-divider` — 20px padding around a 20px label that never wraps. */
export const DIVIDER_HEIGHT = 60;
/** Centered `.happy-system-notice`: 16px padding above and below. */
const NOTICE_CHROME_CENTER = 32;
const NOTICE_INSET = 50;
/** Error card: 14px icon and the 8px gap beside the text. */
const ERROR_TEXT_INSET = 22;
/** Error card: 6px vertical padding per side, plus 4px between heading and reason. */
const ERROR_TEXT_CHROME = 16;
/**
 * The shared `--happy-chat-frame-outset`: a frame in a transcript stands out
 * from the text column by this much on either side, and what it holds sits
 * this far inside it.
 */
const CHAT_FRAME_OUTSET = 12;
/**
 * `--happy-chat-frame-text-inset`: a frame's inset above or below a 20px line
 * of 14px text, whose glyphs sit 3px into the line.
 */
const CHAT_FRAME_TEXT_INSET = CHAT_FRAME_OUTSET - 3;
/**
 * Failure card: the row's 6px above and below, then the frame's inset (its
 * border included) above its message line and below a last line of text. A
 * card that ends on the switch button pads by the full outset below it.
 */
const FAILURE_CHROME = 2 * 6 + 2 * CHAT_FRAME_TEXT_INSET;
const FAILURE_CONTROL_END = CHAT_FRAME_OUTSET - CHAT_FRAME_TEXT_INSET;
/** Failure card: between the message line and the button row, and below that row. */
const FAILURE_SECTION_GAP = 12;
/** Failure card: between the message line and the record of what was done. */
const FAILURE_RESOLUTION_GAP = 6;
/** `.happy-conversation-failure-card__line` gap before the line's own button. */
const FAILURE_LINE_GAP = 8;
/** A command box: 5px padding per side, the 2px gap and the 20px copy button. */
const FAILURE_CODE_EXTRA = 32;
/** Small Button: 28px tall, 10px padding and a 1px border per side, 12/700 at 0.01em. */
const SMALL_BUTTON_HEIGHT = 28;
const SMALL_BUTTON_CHROME = 22;
/** `.happy-conversation-failure-card__line-actions` gap between its quiet buttons. */
const FAILURE_LINE_ACTIONS_GAP = 4;
/* A steering notice keeps the notice row's 16px lead but closes to 4px above the
   quote it introduces; the quote itself wraps at 560px, inset 20px per side, and
   closes the row with the notice's usual 16px. */
const STEERING_LINE_CHROME = 20;
const STEERING_QUOTE_MEASURE = 560;
const STEERING_QUOTE_INSET = 40;
const STEERING_QUOTE_MARGIN = 16;
/** Transcript request chrome from happy-agent-chat.css / approval-card.css. */
/* Questions share the agent's 16px/24px prose and column. Options reserve only
   the 18px checkbox and its 12px gap; settled answers have no inner padding. */
const USER_INPUT_HORIZONTAL_MARGIN = AGENT_INSET;
/** The prompt's gap after its Markdown context. */
const USER_INPUT_CONTEXT_GAP = 12;
const USER_INPUT_OPTION_HORIZONTAL_CHROME = 30;
/** A 20px label line, followed by 4px before the question's prose. */
const USER_INPUT_QUESTION_LEGEND_CHROME = 24;
/** `.happy-agent-input__eyebrow`: name and rule 8px apart, wrapping 8px below. */
const USER_INPUT_EYEBROW_GAP = 8;
const USER_INPUT_EYEBROW_LINE = 20;
const USER_INPUT_QUESTION_GAP = 20;
const USER_INPUT_CONTENT_INSET = 8;
const USER_INPUT_OPTION_GAP = 4;
const USER_INPUT_ANSWER_GAP = 8;
const USER_INPUT_OPTION_VERTICAL_PADDING = 8;
/** 12px parent gap, 4px padding either side of the 28px button. */
const USER_INPUT_FOOTER_HEIGHT = 48;
/* The card's own 153px, less 1px above its chip and plus 3px above and below
   its footer buttons, which the transcript pads by the chat frame outset. */
const APPROVAL_CARD_FIXED_CHROME = 153 - 1 + 2 * 3;
const APPROVAL_CARD_EXPANDED_DETAILS = 98;
const APPROVAL_CARD_MAX_WIDTH = 680;
/** Compute detail flex row: transcript insets, left detail inset, and row/column gaps. */
const COMPUTE_DETAIL_INSET = 146;
const COMPUTE_DETAIL_COLUMN_GAP = 16;
const COMPUTE_DETAIL_ROW_GAP = 4;
const COMPUTE_DETAIL_LABEL_GAP = 6;
const COMPUTE_DETAIL_TOP = 4;

/** The list's content measure, after the shared readable maximum. */
export function contentWidth(width: number): number {
    return Math.min(width, CHAT_MEASURE);
}
/**
 * Painted height of a message's photos: at most four, in justified rows at
 * the width the message's content column gives them, up to the bubble-sized
 * `MESSAGE_MEDIA_MAX_WIDTH` — which is also what `Message` paints.
 */
function mediaHeight(images: readonly MediaFlowImage[], measure: number, hasBody: boolean): number {
    const margin = hasBody ? MEDIA_MARGIN : MEDIA_MARGIN_BARE;
    return (
        margin +
        mediaFlowHeight(
            mediaJustifiedPlan(images.slice(0, MESSAGE_MEDIA_MAX), MESSAGE_MEDIA_LIMITS),
            Math.min(measure, MESSAGE_MEDIA_MAX_WIDTH),
        )
    );
}
/**
 * `.happy-conversation-media`: the blocks a tool call's presented files stack
 * into, the gap between them, and the 8px gap that separates them from the
 * call's own line.
 */
const TOOL_MEDIA_GAP = 8;
/** A file or document presented by a tool is one 64px `ResultCard`. */
const RESULT_CARD_HEIGHT = 64;

/**
 * Painted height of the files one tool call presented, laid out the way
 * `ConversationMedia` lays them out: a tree the agent wrote, measured at this
 * width; otherwise every picture and recording together first, as one flow,
 * then one card per document or file.
 */
export function conversationMediaHeight(
    stated: readonly ConversationMediaItem[],
    measure: number,
    layout?: ConversationMediaLayout,
): number {
    const items = mediaItemsFramed(stated);
    if (layout?.type === "tree") return mediaTreeHeight(layout.root, items, measure);
    const visuals = items.filter((item) => item.kind === "image" || item.kind === "video");
    const blocks: number[] = [];
    if (visuals.length > 0)
        blocks.push(mediaFlowHeight(conversationMediaPlan(visuals, layout), measure));
    for (const item of items)
        if (item.kind !== "image" && item.kind !== "video") blocks.push(RESULT_CARD_HEIGHT);
    if (blocks.length === 0) return 0;
    return blocks.reduce((total, block) => total + block, 0) + (blocks.length - 1) * TOOL_MEDIA_GAP;
}

/**
 * What a tool call's result adds beneath its line, from its presentation
 * alone: presented files, or the card for the artifact it published. Zero for
 * every other call, which stays one line.
 */
function toolResultHeight(
    entry: ConversationEntry,
    measure: number,
    inlinePage: InlinePageGeometry | undefined,
    mediaRun: ConversationMediaRun | undefined,
    mediaPlaced: ReadonlySet<number> | undefined,
): number {
    if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") return 0;
    if (inlinePage !== undefined) return TOOL_MEDIA_GAP + inlinePageHeight(inlinePage);
    const tool = entry.activity.tool;
    const presentation = tool.presentation;
    if (presentation?.type === "media" && presentation.items.length > 0) {
        /* A call in a run draws nothing under its line until the last one,
           which draws the run's whole grid. */
        if (mediaRun?.type === "deferred") return 0;
        if (mediaRun?.type === "end")
            return (
                TOOL_MEDIA_GAP +
                mediaFlowHeight(
                    mediaColumnsPlan(
                        mediaRun.members.map((member) => member.item),
                        mediaRun.columns,
                    ),
                    measure,
                )
            );
        const visible = conversationMediaVisible(
            presentation.items,
            presentation.layout,
            mediaPlaced,
        );
        /* Every picture went to a reply's layout: the call is its line. */
        if (visible.items.length === 0) return 0;
        return TOOL_MEDIA_GAP + conversationMediaHeight(visible.items, measure, visible.layout);
    }
    // Without the transcript's own artifacts, a call's artifact is its title.
    if (presentation?.type === "artifact" || presentation?.type === "page")
        return TOOL_MEDIA_GAP + INLINE_PAGE_TITLE_HEIGHT;
    return 0;
}

/** The learned sizes of a call's recordings that stated none, as part of its row's cache key. */
function activityFramesSignature(entry: ConversationEntry): string {
    if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") return "";
    const presentation = entry.activity.tool.presentation;
    if (presentation?.type !== "media") return "";
    const widgets =
        presentation.layout?.type === "tree"
            ? mediaTreeWidgetsSignature(presentation.layout.root)
            : "";
    return `${mediaVideoFramesSignature(presentation.items)}${widgets}`;
}

/** The same for the recordings and widgets a reply's layouts place. */
function messageLayoutsFramesSignature(layouts: MessageInlineLayouts | undefined): string {
    if (layouts === undefined) return "";
    let signature = "";
    for (const layout of layouts.layouts.values())
        signature += `${mediaVideoFramesSignature(layout.members.map((member) => member.item))}${mediaTreeWidgetsSignature(layout.root)}`;
    return signature;
}

/** Which of a call's pictures went to replies, as part of its row's cache key. */
function mediaPlacedSignature(placed: ReadonlySet<number> | undefined): string {
    return placed === undefined ? "" : [...placed].sort((a, b) => a - b).join(",");
}

/** What of an inline page a row's height reads, as part of its cache key. */
function inlinePageSignature(inlinePage: InlinePageGeometry | undefined): string {
    if (inlinePage === undefined) return "";
    return `${inlinePage.placement}/${inlinePage.collapsed ? "c" : "o"}/${String(inlinePage.height ?? 0)}`;
}

/** Which of the three author treatments a message row takes. */
export type MessageTreatment = "agent" | "incoming" | "own";
/**
 * The text measure a message body wraps at, after its row padding, the 76%
 * bubble cap, the bubble's own padding, and — for an own message — the mono time
 * that shares its bubble line and takes real width from it.
 */
export function messageBodyMeasure(
    width: number,
    treatment: MessageTreatment,
    time: string,
    cache?: MessageTextLayoutCache,
): number {
    if (treatment === "agent") return width - agentInset();
    if (treatment === "incoming") return (width - INCOMING_INSET) * BUBBLE_CAP - BUBBLE_PADDING;
    const column = width - OWN_INSET;
    const aside = asideTimeWidth(time, cache);
    return Math.min(column * BUBBLE_CAP, column - ASIDE_TIME_GAP - aside) - BUBBLE_PADDING;
}
/** Fixed collapsed height of an activity row, or `undefined` for a richer kind. */
export function conversationActivityHeight(kind: string): number | undefined {
    return kind === "tool" || kind === "labeled" || kind === "reasoning" || kind === "agentMessage"
        ? ACTIVITY_HEIGHT[kind]
        : undefined;
}
/** Height of a service line, wrapped at the measure its alignment leaves it. */
export function noticeRowHeight(
    text: string,
    width: number,
    align: "center" | "start",
    cache?: MessageTextLayoutCache,
): number {
    if (align === "start") return SYSTEM_NOTIFICATION_HEIGHT;
    return NOTICE_CHROME_CENTER + noticeTextHeight(text, width - NOTICE_INSET, cache);
}
/** Height of a steering notice: its service line above the message it quotes. */
export function steeringNoticeRowHeight(
    text: string,
    quote: string,
    width: number,
    cache?: MessageTextLayoutCache,
): number {
    return (
        STEERING_LINE_CHROME +
        noticeTextHeight(text, width - NOTICE_INSET, cache) +
        noticeTextHeight(
            quote,
            Math.min(STEERING_QUOTE_MEASURE, width) - STEERING_QUOTE_INSET,
            cache,
        ) +
        STEERING_QUOTE_MARGIN
    );
}
/**
 * The width a message's content column has, which its photos are laid out in:
 * the row padding alone, before any bubble cap. An agent's body has no bubble,
 * so its column is its body measure.
 */
function messageContentMeasure(width: number, treatment: MessageTreatment): number {
    if (treatment === "agent") return width - agentInset();
    return width - (treatment === "incoming" ? INCOMING_INSET : OWN_INSET);
}
/** Height of a message's photos at the measure its treatment leaves them. */
export function messageMediaHeight(
    images: readonly MediaFlowImage[],
    width: number,
    treatment: MessageTreatment,
    hasBody: boolean,
): number {
    return mediaHeight(images, messageContentMeasure(width, treatment), hasBody);
}
/**
 * Height of a message row: its chrome for the author treatment and grouping,
 * plus the body wrapped at that treatment's measure. Attachments, media, and
 * reactions are added by the caller, which is what knows how its own surface
 * projects them.
 */
type MessageRowHeightInput = {
    readonly body: string;
    readonly bodyFormat: MessageBodyFormat;
    readonly bodyVisible: boolean;
    readonly bodyExpanded?: boolean;
    readonly grouped: boolean;
    readonly mermaidEnabled?: boolean;
    readonly references?: MessageReferences;
    readonly streaming?: boolean;
    readonly trailingExtraWidth: number;
    readonly surface: ConversationSurface;
    readonly textCache?: MessageTextLayoutCache;
    readonly time: string;
    readonly treatment: MessageTreatment;
    readonly width: number;
    /** The layouts the body's placeholders stand for. */
    readonly layouts?: MessageInlineLayouts;
};
const MESSAGE_PREVIEW_HEIGHT = 10 * MESSAGE_PLAIN_LINE_HEIGHT;
// Existing trace metadata control: 16px plus the plain body's 8px sibling gap.
const MESSAGE_FOLD_CONTROL_HEIGHT = 24;
function messagePlainBodyHeight(input: MessageRowHeightInput): number {
    return plainTextHeight(
        messageReferencesPlainText(input.body, input.references),
        messageBodyMeasure(input.width, input.treatment, input.time, input.textCache),
        input.textCache,
        input.trailingExtraWidth,
    );
}
export function messageRowHeight(input: MessageRowHeightInput): number {
    const [leading, tight] = MESSAGE_CHROME[input.surface][input.treatment];
    const chrome = input.grouped ? tight : leading;
    if (!input.bodyVisible) return chrome;
    const measure = messageBodyMeasure(input.width, input.treatment, input.time, input.textCache);
    if (input.bodyFormat === "plain") {
        const full = messagePlainBodyHeight(input);
        return (
            chrome +
            (input.bodyExpanded !== undefined && full > MESSAGE_PREVIEW_HEIGHT
                ? (input.bodyExpanded ? full : MESSAGE_PREVIEW_HEIGHT) + MESSAGE_FOLD_CONTROL_HEIGHT
                : full)
        );
    }
    /* Grouped incoming/agent rows glue their hover time to the final word with
       a no-break space. Include it in the text model: at a narrow width it can
       move the final word and timestamp onto the next line. */
    return (
        chrome +
        markdownBodyHeight(
            /* Rendered from the same resolution `renderMessageMarkdown` makes:
               every reference as the words it reads as, and a tag still
               arriving held back. */
            messageReferencesResolve(input.body, input.references, input.streaming === true),
            measure,
            input.textCache,
            input.trailingExtraWidth,
            input.mermaidEnabled,
            input.streaming,
            messageLayoutsHeight(input.layouts),
        )
    );
}

/**
 * A reply's layout is as tall as its tree laid out at the body's measure: the
 * same off-screen measurement as a presented layout, uncapped. A placeholder
 * naming no layout of this reply is HTML, which draws nothing.
 */
function messageLayoutsHeight(
    layouts: MessageInlineLayouts | undefined,
): ((html: string, measure: number) => number | undefined) | undefined {
    if (layouts === undefined || layouts.layouts.size === 0) return undefined;
    return (html, measure) => {
        const key = messageInlineLayoutKey(html);
        const layout = key === undefined ? undefined : layouts.layouts.get(key);
        if (layout === undefined) return undefined;
        return mediaTreeHeight(
            layout.root,
            mediaItemsFramed(layout.members.map((member) => member.item)),
            measure,
        );
    };
}

function conversationMessageHeightInput(
    entry: Extract<ConversationEntry, { kind: "message" }>,
    grouped: boolean,
    context: ConversationRowContext,
    cache: Pick<ConversationRowHeightCache, "text"> | undefined,
): MessageRowHeightInput {
    const message = entry.message;
    const agent = message.sender?.kind === "agent";
    const own = message.sender !== undefined && message.sender.id === context.viewerId;
    const trace = message.agentTrace;
    const traceCollapsible =
        trace !== undefined &&
        trace.status !== "pending" &&
        trace.status !== "running" &&
        trace.entryCount > 0;
    const time = messageTimeSample(message.createdAt);
    const layouts = context.messageLayouts;
    return {
        body: layouts?.text ?? message.text,
        bodyFormat: messageBodyFormat(message.sender),
        ...(message.sender?.kind === "human" && context.messageExpanded !== undefined
            ? { bodyExpanded: context.messageExpanded }
            : {}),
        bodyVisible:
            (agent ? message.text.trim().length > 0 : message.text.length > 0) ||
            message.generationStatus !== undefined ||
            traceCollapsible,
        grouped,
        mermaidEnabled: message.generationStatus !== "streaming",
        ...(context.references ? { references: context.references } : {}),
        streaming: message.generationStatus === "streaming",
        surface: context.surface,
        textCache: cache?.text,
        time,
        trailingExtraWidth:
            grouped && !own
                ? groupedTrailingMetaWidth(time, traceCollapsible ? trace : undefined, cache?.text)
                : 0,
        treatment: agent ? "agent" : own ? "own" : "incoming",
        width: contentWidth(context.width),
        ...(layouts ? { layouts } : {}),
    };
}

/** The renderer and row model use the same source, references and body measure. */
export function conversationMessageCompactLayout(
    entry: Extract<ConversationEntry, { kind: "message" }>,
    grouped: boolean,
    context: ConversationRowContext,
    cache: MessageTextLayoutCache | undefined,
): { readonly previewHeight: number; readonly expanded: boolean } | undefined {
    if (entry.message.sender?.kind !== "human" || context.messageExpanded === undefined)
        return undefined;
    const input = conversationMessageHeightInput(
        entry,
        grouped,
        context,
        cache ? { text: cache } : undefined,
    );
    const full = messagePlainBodyHeight(input);
    return full > MESSAGE_PREVIEW_HEIGHT
        ? { previewHeight: MESSAGE_PREVIEW_HEIGHT, expanded: context.messageExpanded }
        : undefined;
}

/** Background-only preparation. The final call writes the authoritative row
 * cache; neither a yield nor a partially warmed body publishes row geometry. */
export function* conversationRowHeightPrepare(
    entries: readonly ConversationEntry[],
    index: number,
    context: ConversationRowContext,
    cache: ConversationRowHeightCache,
): Generator<void> {
    if (conversationRowHeightCached(entries, index, context, cache) !== undefined) return;
    const entry = entries[index];
    if (entry?.kind === "message") {
        const input = conversationMessageHeightInput(
            entry,
            conversationMessageGrouped(entries, index),
            context,
            cache,
        );
        if (input.bodyVisible && input.bodyFormat !== "plain" && !input.streaming)
            yield* markdownBodyPrepare(
                messageReferencesResolve(input.body, input.references, false),
                messageBodyMeasure(input.width, input.treatment, input.time, input.textCache),
                input.textCache,
                input.trailingExtraWidth,
                input.mermaidEnabled,
            );
    }
    conversationRowHeight(entries, index, context, cache);
}

/** Width of the one non-wrapping run Message appends to a grouped reply. */
function groupedTrailingMetaWidth(
    time: string,
    trace: AgentTurnTraceSummary | undefined,
    cache: MessageTextLayoutCache | undefined,
): number {
    if (!time && !trace) return 0;
    let width = GROUPED_TRAILING_META_PADDING + uiTextNaturalWidth("\u00a0", 16, cache);
    if (trace) {
        width += Math.max(
            monoTextNaturalWidth(agentTraceMetaTitle(false), 11, cache),
            monoTextNaturalWidth(agentTraceMetaTitle(true), 11, cache),
        );
        const stats = agentTraceMetaStats(trace.toolCallCount, trace.totalTokens);
        if (stats)
            width +=
                TRACE_META_GAPS + TRACE_META_SEPARATOR + monoTextNaturalWidth(stats, 11, cache);
    }
    if (time) {
        if (trace) width += GROUPED_TRAILING_META_GAPS + GROUPED_TRAILING_META_SEPARATOR;
        width += asideTimeWidth(time, cache);
    }
    return width;
}

/**
 * What a question's name and rule add beyond their one shared line: a column
 * too narrow for both wraps the rule below the name, and a name or rule wider
 * than the column wraps itself.
 */
function userInputEyebrowWrap(
    header: string,
    rule: string,
    measure: number,
    cache?: MessageTextLayoutCache,
): number {
    const headerWidth = uiTextNaturalWidth(header, 13, cache, 500);
    const ruleWidth = uiTextNaturalWidth(rule, 13, cache);
    if (headerWidth + USER_INPUT_EYEBROW_GAP + ruleWidth <= measure) return 0;
    return (
        (headerWidth <= measure
            ? USER_INPUT_EYEBROW_LINE
            : uiTextHeight(header, 13, 20, measure, cache)) +
        USER_INPUT_EYEBROW_GAP +
        (ruleWidth <= measure
            ? USER_INPUT_EYEBROW_LINE
            : uiTextHeight(rule, 13, 20, measure, cache)) -
        USER_INPUT_EYEBROW_LINE
    );
}

/** Height of the structured question form or its compact answered history. */
function userInputRequestHeight(
    request: Extract<ConversationRequest, { kind: "userInput" }>,
    width: number,
    cache?: MessageTextLayoutCache,
): number {
    const contentWidth = width - USER_INPUT_HORIZONTAL_MARGIN;
    const promptMeasure = contentWidth;
    const optionMeasure = contentWidth - USER_INPUT_OPTION_HORIZONTAL_CHROME;
    const answerMeasure = contentWidth;
    /* The shared Markdown context reads above the first question in both
       states, through the same body model as an agent reply. */
    let total = request.context
        ? USER_INPUT_CONTEXT_GAP +
          markdownBodyHeight(
              messageReferencesResolve(request.context, undefined, false),
              promptMeasure,
              cache,
          )
        : 0;
    for (const [questionIndex, question] of request.questions.entries()) {
        if (questionIndex > 0) total += USER_INPUT_QUESTION_GAP;
        total +=
            USER_INPUT_QUESTION_LEGEND_CHROME +
            userInputEyebrowWrap(
                question.header,
                userInputRuleText(
                    question,
                    "card",
                    request.status === "answered"
                        ? (request.answers[question.id] ?? [])
                        : undefined,
                ),
                promptMeasure,
                cache,
            ) +
            uiTextHeight(question.question, 16, 24, promptMeasure, cache);
        if (request.status === "answered") {
            total += USER_INPUT_CONTENT_INSET;
            const answers = request.answers[question.id] ?? [];
            const shown = answers.length > 0 ? answers : [""];
            for (const [answerIndex, answer] of shown.entries()) {
                if (answerIndex > 0) total += USER_INPUT_ANSWER_GAP;
                const option = question.options.find((candidate) => candidate.label === answer);
                total += uiTextHeight(answer || "No answer", 16, 24, answerMeasure, cache);
                if (option?.description)
                    total += 2 + uiTextHeight(option.description, 14, 20, answerMeasure, cache);
            }
            continue;
        }
        if (question.options.length > 0) total += USER_INPUT_CONTENT_INSET;
        for (const [optionIndex, option] of question.options.entries()) {
            if (optionIndex > 0) total += USER_INPUT_OPTION_GAP;
            const contentHeight =
                uiTextHeight(option.label, 16, 24, optionMeasure, cache) +
                (option.description
                    ? 2 + uiTextHeight(option.description, 14, 20, optionMeasure, cache)
                    : 0);
            total += Math.max(32, USER_INPUT_OPTION_VERTICAL_PADDING + contentHeight);
        }
    }
    const submitVisible =
        request.status === "pending" &&
        request.questions.every((question) => question.options.length > 0);
    return 2 * CHAT_FRAME_TEXT_INSET + total + (submitVisible ? USER_INPUT_FOOTER_HEIGHT : 0);
}

/** Pending permission gate in its default collapsed transcript state. */
function permissionRequestHeight(
    request: Exclude<ConversationRequest, { kind: "userInput" }>,
    width: number,
    expanded: boolean,
    cache?: MessageTextLayoutCache,
): number {
    /* The frame stands out from the text column by the chat frame outset and
       caps at the card's maximum; its text keeps the outset inside it. */
    const measure =
        Math.min(width - AGENT_INSET + 2 * CHAT_FRAME_OUTSET, APPROVAL_CARD_MAX_WIDTH) -
        2 * CHAT_FRAME_OUTSET;
    return (
        APPROVAL_CARD_FIXED_CHROME +
        (expanded ? APPROVAL_CARD_EXPANDED_DETAILS : 0) +
        uiTextHeight(request.review.action, 15, 20, measure, cache) +
        uiTextHeight(request.review.reason, 13, 18, measure, cache)
    );
}
function computeElapsedLabel(elapsedMs: number): string {
    const seconds = Math.round(elapsedMs / 1_000);
    if (seconds < 60) return `${String(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes)}m ${String(seconds % 60)}s`;
}
function computeNoticeHeight(
    entry: Extract<ConversationEntry, { kind: "notice"; variant: "compute" }>,
    width: number,
    expanded: boolean,
    cache?: MessageTextLayoutCache,
): number {
    if (!expanded) return 32;
    const details = [
        { label: "Provider", value: entry.provider },
        { label: "Phase", value: entry.phase },
        { label: "Instance", value: entry.instanceId },
        ...(entry.elapsedMs === undefined
            ? []
            : [{ label: "Elapsed", value: computeElapsedLabel(entry.elapsedMs) }]),
    ];
    const available = Math.max(1, width - COMPUTE_DETAIL_INSET);
    const rows: { height: number; width: number }[] = [];
    for (const detail of details) {
        const labelWidth = uiTextNaturalWidth(detail.label, 12, cache, 500);
        const naturalWidth =
            labelWidth + COMPUTE_DETAIL_LABEL_GAP + monoTextNaturalWidth(detail.value, 12, cache);
        const previous = rows.at(-1);
        if (previous && previous.width + COMPUTE_DETAIL_COLUMN_GAP + naturalWidth <= available) {
            previous.width += COMPUTE_DETAIL_COLUMN_GAP + naturalWidth;
            continue;
        }
        const valueMeasure = available - labelWidth - COMPUTE_DETAIL_LABEL_GAP;
        rows.push({
            height: Math.max(18, monoOutputTextHeight(detail.value, valueMeasure, cache)),
            width: naturalWidth,
        });
    }
    return (
        32 +
        COMPUTE_DETAIL_TOP +
        rows.reduce((total, row) => total + row.height, 0) +
        Math.max(0, rows.length - 1) * COMPUTE_DETAIL_ROW_GAP
    );
}
/**
 * Height of one row, or `undefined` when a future entry kind has no explicit
 * model yet and should take MessageList's fixed fallback.
 */
/**
 * The row's height only when `cache` already holds it for this exact context,
 * without laying anything out; `undefined` when it would have to. A list
 * returning to a width it has already laid out reads every row back this way.
 */
export function conversationRowHeightCached(
    entries: readonly ConversationEntry[],
    index: number,
    context: ConversationRowContext,
    cache: ConversationRowHeightCache,
): number | undefined {
    const probe = { missed: false };
    cacheProbe = probe;
    try {
        const height = conversationRowHeight(entries, index, context, cache);
        return probe.missed ? undefined : height;
    } finally {
        cacheProbe = undefined;
    }
}
export function conversationRowHeight(
    entries: readonly ConversationEntry[],
    index: number,
    context: ConversationRowContext,
    cache?: ConversationRowHeightCache,
): number | undefined {
    const entry = entries[index];
    if (!entry) return undefined;
    const width = contentWidth(context.width);
    if (entry.kind === "agentActivity") {
        const startsGroup =
            context.surface === "conversation" && conversationAgentRowStartsGroup(entries, index);
        const expanded = context.expanded ?? entry.activity.kind === "shell";
        const activityInset = (startsGroup ? ACTIVITY_LEAD_INSET : ACTIVITY_ROW_INSET)[
            context.activityTreatment ?? "detailed"
        ];
        /* The output and body are laid out only on a miss: on a hit, the entry
           and everything its height reads are already in the key. */
        return rowHeightCached(
            cache,
            entry,
            `activity:${context.surface}:${context.activityTreatment ?? "detailed"}:${String(width)}:${expanded ? "expanded" : "collapsed"}:${startsGroup ? "lead" : "plain"}:${inlinePageSignature(context.inlinePage)}:${conversationMediaRunSignature(context.mediaRun)}:${mediaPlacedSignature(context.mediaPlaced)}:${activityFramesSignature(entry)}:${messageReferencesSignature(
                conversationEntryReferences(entry),
                context.references,
            )}`,
            () => {
                const activityHeight =
                    entry.activity.kind === "shell"
                        ? expanded && entry.activity.output.trim().length > 0
                            ? SHELL_ACTIVITY_CHROME +
                              monoOutputTextHeight(
                                  entry.activity.output,
                                  width - activityInset - SHELL_ACTIVITY_OUTPUT_INSET,
                                  cache?.text,
                                  entry.activity.running,
                              )
                            : ACTIVITY_HEIGHT.reasoning
                        : entry.activity.kind === "reasoning" && expanded
                          ? REASONING_ACTIVITY_CHROME +
                            markdownBodyHeight(
                                messageReferencesResolve(
                                    entry.activity.text,
                                    context.references,
                                    false,
                                ),
                                width - activityInset - 16,
                                cache?.text,
                                0,
                                true,
                                entry.activity.streaming,
                            )
                          : entry.activity.kind === "agentMessage" && expanded
                            ? AGENT_MESSAGE_ACTIVITY_CHROME +
                              markdownBodyHeight(
                                  messageReferencesResolve(
                                      entry.activity.text,
                                      context.references,
                                      false,
                                  ),
                                  width - activityInset - 16,
                                  cache?.text,
                              )
                            : entry.activity.kind === "tool"
                              ? ACTIVITY_HEIGHT.tool +
                                toolResultHeight(
                                    entry,
                                    width - activityInset,
                                    context.inlinePage,
                                    context.mediaRun,
                                    context.mediaPlaced,
                                )
                              : conversationActivityHeight(entry.activity.kind);
                if (activityHeight === undefined) return undefined;
                return startsGroup
                    ? ACTIVITY_LEAD_CHROME + ACTIVITY_LEAD_RUN_SEPARATION + activityHeight
                    : activityHeight;
            },
        );
    }
    /* A settled footer owns the clearance above it when prior activity exists. */
    if (entry.kind === "turnStatus") {
        const afterActivity = conversationTurnStatusAfterActivity(entries, index);
        const startsGroup =
            context.surface === "conversation" && conversationTurnStatusStartsGroup(entries, index);
        return rowHeightCached(
            cache,
            entry,
            [
                "turn-status",
                afterActivity ? "after-activity" : "plain",
                startsGroup ? "leading" : "continuous",
            ].join(":"),
            () => (afterActivity ? 36 : 32) + (startsGroup ? ACTIVITY_LEAD_CHROME : 0),
        );
    }
    if (entry.kind === "delegation") {
        const startsGroup =
            context.surface === "conversation" && conversationAgentRowStartsGroup(entries, index);
        return rowHeightCached(
            cache,
            entry,
            `delegation:${startsGroup ? "lead" : "plain"}`,
            () => DELEGATION_HEIGHT + (startsGroup ? ACTIVITY_LEAD_CHROME : 0),
        );
    }
    if (entry.kind === "notice") {
        if (entry.variant === "compute")
            return rowHeightCached(
                cache,
                entry,
                `notice:compute:${String(width)}:${context.expanded ? "expanded" : "collapsed"}`,
                () => computeNoticeHeight(entry, width, context.expanded ?? false, cache?.text),
            );
        if (entry.variant === "divider")
            return rowHeightCached(cache, entry, "notice:divider", () => DIVIDER_HEIGHT);
        /* A notice that opens its turn wears the same identity header a
           tool-first row does, and therefore the same chrome above it, with
           the same 6px a run of tool rows opens under it. */
        const lead =
            context.surface === "conversation" && conversationAgentRowStartsGroup(entries, index)
                ? ACTIVITY_LEAD_CHROME + ACTIVITY_LEAD_RUN_SEPARATION
                : 0;
        if (entry.failure !== undefined) {
            const failure = entry.failure;
            /* Led or not, the card's content keeps the agent's text column. */
            const measure = width - AGENT_INSET - ERROR_TEXT_INSET;
            const options = context.failure ?? FAILURE_ROW_INERT;
            const layout = conversationFailureCardLayout(failure, {
                current: options.current,
                actions: options.actions,
                ...(options.switchTargets ? { targets: options.switchTargets } : {}),
                ...(context.errorAssistance ? { assistance: context.errorAssistance } : {}),
            });
            const segments = conversationFailureMessage(failure, options.clock ?? {});
            const target =
                layout.switchTargets?.find(
                    (candidate) => conversationFailureTargetKey(candidate) === options.target,
                ) ?? layout.switchTargets?.[0];
            const switchLabel = target ? conversationFailureSwitchLabel(target) : "";
            return rowHeightCached(
                cache,
                entry,
                [
                    "failure",
                    String(width),
                    String(lead),
                    segments.map((segment) => `${segment.kind}:${segment.text}`).join("\u0000"),
                    layout.lineAction?.label ?? "",
                    switchLabel,
                    layout.assistance?.label ?? "",
                    layout.assistance?.detail ?? "",
                    layout.resolution ?? "",
                ].join(":"),
                () => {
                    /* The message's own action and Ask Chief of Staff follow
                       it on its line, and the message wraps beside them. */
                    const lineButtons = [
                        ...(layout.lineAction
                            ? [smallButtonWidth(layout.lineAction.label, cache?.text)]
                            : []),
                        ...(layout.assistance
                            ? [smallButtonWidth(layout.assistance.label, cache?.text)]
                            : []),
                    ];
                    const lineActions =
                        lineButtons.length === 0
                            ? 0
                            : FAILURE_LINE_GAP +
                              lineButtons.reduce((total, button) => total + button, 0) +
                              (lineButtons.length - 1) * FAILURE_LINE_ACTIONS_GAP;
                    let height =
                        lead +
                        FAILURE_CHROME +
                        errorRichTextHeight(
                            segments.map((segment) =>
                                segment.kind === "code"
                                    ? { code: segment.text, extraWidth: FAILURE_CODE_EXTRA }
                                    : { text: segment.text },
                            ),
                            measure - lineActions,
                            cache?.text,
                        );
                    if (layout.resolution !== undefined)
                        return (
                            height +
                            FAILURE_RESOLUTION_GAP +
                            errorTextHeight(layout.resolution, measure, cache?.text)
                        );
                    if (layout.assistance?.detail)
                        height +=
                            FAILURE_SECTION_GAP +
                            errorTextHeight(layout.assistance.detail, measure, cache?.text);
                    /* The switch button has the row under the message to
                       itself; its main segment gives way rather than wrap. */
                    if (target)
                        height += FAILURE_SECTION_GAP + SMALL_BUTTON_HEIGHT + FAILURE_CONTROL_END;
                    return height;
                },
            );
        }
        if (entry.level === "error" || entry.retry !== undefined) {
            const measure = width - (lead > 0 ? AGENT_INSET : 126) - ERROR_TEXT_INSET;
            const assistance =
                context.errorAssistance &&
                (!entry.error || entry.error.recovery.actions.includes("ask_chief"))
                    ? conversationErrorAssistanceText(context.errorAssistance)
                    : undefined;
            return rowHeightCached(
                cache,
                entry,
                `error:${String(width)}:${String(lead)}:${assistance?.label ?? ""}:${assistance?.detail ?? ""}`,
                () =>
                    lead +
                    ERROR_TEXT_CHROME +
                    errorTextHeight(conversationErrorTitle(entry), measure, cache?.text, true) +
                    errorTextHeight(entry.text, measure, cache?.text) +
                    [
                        ...conversationErrorDetails(entry.error),
                        ...(entry.error?.recovery.steps ?? []),
                    ].reduce(
                        (height, text) => height + 4 + errorTextHeight(text, measure, cache?.text),
                        0,
                    ) +
                    (entry.error?.recovery.commands ?? []).reduce(
                        (height, command) =>
                            height +
                            4 +
                            errorTextHeight(command.label, measure, cache?.text) +
                            4 +
                            36,
                        0,
                    ) +
                    (assistance
                        ? 4 +
                          errorTextHeight(assistance.label, measure, cache?.text) +
                          (assistance.detail
                              ? 4 + errorTextHeight(assistance.detail, measure, cache?.text)
                              : 0)
                        : 0),
            );
        }
        return rowHeightCached(
            cache,
            entry,
            `notice:${entry.level}:${String(width)}:${String(lead)}`,
            () => lead + SYSTEM_NOTIFICATION_HEIGHT,
        );
    }
    if (entry.kind === "request") {
        /* An answered question that opens its turn carries the identity line. */
        const lead =
            entry.request.kind === "userInput" &&
            context.surface === "conversation" &&
            conversationAgentRowStartsGroup(entries, index);
        return rowHeightCached(
            cache,
            entry,
            `request:${String(width)}:${context.expanded ? "expanded" : "collapsed"}:${lead ? "lead" : "plain"}`,
            () =>
                entry.request.kind === "userInput"
                    ? (lead ? ACTIVITY_LEAD_CHROME : 0) +
                      userInputRequestHeight(entry.request, width, cache?.text)
                    : permissionRequestHeight(
                          entry.request,
                          width,
                          context.expanded ?? false,
                          cache?.text,
                      ),
        );
    }
    if (entry.kind === "summary")
        return rowHeightCached(
            cache,
            entry,
            `summary:${context.expanded ? "expanded" : "collapsed"}`,
            () =>
                SUMMARY_HEIGHT +
                (context.expanded && entry.details.length > 0
                    ? entry.details.length * SUMMARY_DETAIL_HEIGHT + SUMMARY_DETAILS_PADDING
                    : 0),
        );
    const message = entry.message;
    const agent = message.sender?.kind === "agent";
    const own = message.sender !== undefined && message.sender.id === context.viewerId;
    const grouped = conversationMessageGrouped(entries, index);
    const treatment: MessageTreatment = agent ? "agent" : own ? "own" : "incoming";
    const trace = message.agentTrace;
    /* A running turn keeps its live readout on the message-list footer, so the
       message row itself only gains the compact "View traces" accessory once the
       turn has settled. */
    const traceCollapsible =
        trace !== undefined &&
        trace.status !== "pending" &&
        trace.status !== "running" &&
        trace.entryCount > 0;
    const hasBody = agent ? message.text.trim().length > 0 : message.text.length > 0;
    const resumesAfterActivity =
        agent &&
        context.surface === "conversation" &&
        conversationEntryResumesAfterActivity(entries, index);
    const precedesActivity =
        agent &&
        context.surface === "conversation" &&
        conversationEntryPrecedesActivity(entries, index);
    const closedByStatus =
        context.surface === "conversation" &&
        conversationMessageClosedByStatus(entries, index, context.liveStatus);
    const ownContinued =
        context.surface === "conversation" &&
        conversationOwnMessageContinued(entries, index, context.viewerId);
    const cacheKey = [
        "message",
        String(width),
        context.surface,
        treatment,
        grouped ? "grouped" : "leading",
        context.messageExpanded === undefined
            ? "uncapped"
            : context.messageExpanded
              ? "expanded"
              : "compact",
        traceCollapsible ? "trace" : "plain",
        resumesAfterActivity ? "resumed" : "continuous",
        precedesActivity
            ? "continues"
            : closedByStatus
              ? "closing"
              : ownContinued
                ? "own-continued"
                : "open",
        // What the body's references read as: a title changing re-sizes the row.
        messageReferencesSignature(conversationEntryReferences(entry), context.references),
        context.messageLayouts?.signature ?? "",
        messageLayoutsFramesSignature(context.messageLayouts),
    ].join(":");
    return rowHeightCached(cache, entry, cacheKey, () => {
        let height = messageRowHeight(
            conversationMessageHeightInput(entry, grouped, context, cache),
        );
        if (resumesAfterActivity)
            height +=
                RESUMED_PADDING_TOP -
                (grouped
                    ? CONVERSATION_AGENT_PADDING_TOP.grouped
                    : CONVERSATION_AGENT_PADDING_TOP.leading);
        if (precedesActivity || closedByStatus)
            height +=
                (precedesActivity ? CONTINUES_PADDING_BOTTOM : CLOSING_PADDING_BOTTOM) -
                (grouped
                    ? CONVERSATION_AGENT_PADDING_BOTTOM.grouped
                    : CONVERSATION_AGENT_PADDING_BOTTOM.leading);
        if (ownContinued) height -= OWN_PADDING_BOTTOM.leading - OWN_PADDING_BOTTOM.grouped;
        const images: MediaFlowImage[] = [];
        let cards = 0;
        for (const attachment of message.attachments) {
            if (attachment.kind === "inlineImage") {
                images.push({ width: attachment.width, height: attachment.height });
            } else if (attachment.attachmentKind === "image" && attachment.openUrl !== undefined) {
                images.push({
                    width: attachment.width,
                    height: attachment.height,
                    ...(attachment.thumbhash ? { thumbhash: attachment.thumbhash } : {}),
                });
            } else {
                cards += 1;
            }
        }
        if (images.length > 0) height += messageMediaHeight(images, width, treatment, hasBody);
        if (cards > 0)
            height +=
                (hasBody ? MEDIA_MARGIN : MEDIA_MARGIN_BARE) +
                cards * ATTACHMENT_CARD_HEIGHT +
                (cards - 1) * ATTACHMENT_CARD_GAP;
        if (!own && !grouped && entry.contextNote) height += 21;
        return height;
    });
}
/**
 * The rendered clock string for a timestamp, formatted exactly as
 * `ConversationEntryView` formats it so its measured width is the real one.
 */
function messageTimeSample(value: string): string {
    if (value.trim().length === 0) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return MESSAGE_TIME_FORMATTER.format(date);
}
const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
});
