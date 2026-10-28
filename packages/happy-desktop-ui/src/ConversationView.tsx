import { type CSSProperties, type ReactNode, useRef, useState, useSyncExternalStore } from "react";
import type { FileLinkOpenHandler, FileOpenHandler } from "./fileReference";
import {
    MarkdownLayoutCacheContext,
    type LinkOpenHandler,
    type LinkOpenPlacement,
} from "./MessageMarkdown";
import type { MessageReferences } from "./messageReferences";
import {
    entryKey,
    type ConversationAuthor,
    type ConversationEntry,
    type ConversationErrorAssistance,
    type ConversationErrorAssistanceEntry,
    type ConversationRequestSubmission,
    type ConversationRetrying,
    type ConversationToolCall,
    type HappyAgentTraceViewer,
} from "happy-desktop-state";
import { type ActivityMotion, type ActivityTreatment } from "./AgentActivityRow";
import {
    AgentWorkingStatus,
    type AgentWaitStatus,
    type AgentWorkingPhase,
} from "./AgentWorkingStatus";
import { ChannelHeader } from "./ChannelHeader";
import {
    ConversationEntryView,
    type ConversationEntryFailureProps,
    type ConversationEntryViewProps,
} from "./ConversationEntryView";
import { composerModelListedAccounts } from "./ComposerModelControl";
import {
    conversationFailureTargetKey,
    conversationFailureTargetLabel,
    conversationRetryingLabel,
    type ConversationFailureClock,
} from "./conversationFailureText";
import {
    CONVERSATION_SWITCH_USAGE_NONE,
    conversationSwitchTargetPreferred,
    conversationSwitchTargets,
    conversationSwitchUsageFeed,
    type ConversationSwitchSource,
    type ConversationSwitchTarget,
} from "./conversationSwitchTargets";
import {
    conversationAgentRowStartsGroup,
    conversationEntryPrecedesActivity,
    conversationEntryResumesAfterActivity,
    conversationMessageClosedByStatus,
    conversationMessageGrouped,
    conversationOwnMessageContinued,
    conversationTurnStatusAfterActivity,
    conversationTurnStatusStartsGroup,
    conversationWorkingStatusStartsGroup,
} from "./conversationMessageGrouped";
import {
    contentWidth,
    conversationReferencesSignature,
    conversationRowHeight,
    conversationWorkingStatusHeight,
    conversationRowHeightCached,
    conversationRowHeightPrepare,
    conversationRowHeightCacheCreate,
    conversationRowHeightCachePrune,
    type ConversationFailureRowContext,
    type ConversationRowContext,
    type ConversationRowHeightCache,
} from "./conversationRowHeight";
import {
    conversationInlineArtifactLeads,
    conversationInlinePage,
    type ConversationInlinePageLocal,
    type ConversationInlinePages,
} from "./conversationInlinePages";
import { EmptyState } from "./EmptyState";
import {
    Message,
    MessageList,
    type MessageListLegacyScrollPosition,
    type MessageListScrollPosition,
} from "./Message";
import {
    messageTextLayoutFontGenerationGet,
    messageTextLayoutFontGenerationSubscribe,
} from "./messageTextLayout";
import type { HappyAgentUserInputAnswerMap } from "./HappyAgentUserInputPrompt";
import { ScrollArea } from "./Scrollbar";
import { Spinner } from "./Spinner";
import { toolCallStillGlyph } from "./toolCallStillGlyph";
import { WindowOverlay } from "./WindowOverlay";
import { conversationMediaRunRows, conversationMediaRuns } from "./conversationMediaRuns";
import { conversationInlineLayouts } from "./conversationInlineLayouts";
import {
    mediaVideoFramesSignature,
    mediaVideoFramesSubscribe,
    mediaVideoFramesVersion,
} from "./mediaVideoFrames";
import {
    mediaComponentHeightsSubscribe,
    mediaComponentHeightsVersion,
} from "./mediaComponentHeights";
import { MediaTreeComponentsContext, mediaTreeWidgetsSignature } from "./MediaTree";

/** The transcript's first row: what it shows, and how tall it is at a row width. */
export type ConversationLeadingHeader = {
    readonly content: ReactNode;
    /** Computed from the block's own data, like every row's height; never measured. */
    readonly height: (width: number) => number;
    /**
     * Where the first entry lands, from the block's top: the line that rests
     * at the height a send is lifted to, so the first send takes the same
     * slot as every later one.
     */
    readonly lift: (width: number) => number;
};
export type ConversationViewProps = {
    /**
     * Titles this conversation's own 56px header. Omit it when the surface that
     * hosts this view already names what is open — the local workspace heads a
     * whole directory and switches sessions with tabs beneath that heading — and
     * no header renders at all.
     */
    title?: string;
    /** Secondary header line: the working directory, topic, or participants. */
    subtitle?: string;
    /** True while the agent is working; drives the live activity line. */
    running?: boolean;
    /** True while the addressed conversation is hydrating its transcript. */
    loading?: boolean;
    /** Elapsed run time in ms, supplied by the owner (no timers live in the UI). */
    elapsedMs?: number;
    /** Current reader-facing phase of the active turn. */
    workingPhase?: AgentWorkingPhase;
    /** Humanized activity text from the agent, preferred over the phase word. */
    workingLabel?: string;
    /** The scheduled wait the turn is inside, counted down by the owner's clock. */
    workingWait?: AgentWaitStatus;
    /**
     * The automatic recovery the turn is running. It names itself on the
     * working line in place of `workingLabel`, with the usual Stop.
     */
    retrying?: ConversationRetrying;
    /**
     * What the latest failure card can do. Each handler is told which failure
     * row it acts on; a missing one leaves its button off the card.
     */
    failureActions?: ConversationFailureHandlers;
    /**
     * What the latest failure card can switch to: the conversation's own model
     * picker props, so the card lists the accounts, models, and live usage the
     * picker does. Absent offers no switch, whatever `failureActions` holds.
     */
    failureSwitch?: ConversationSwitchSource;
    /**
     * Pins the clock failure cards tell reset times on, for a blueprint or
     * test. Otherwise they use `now` in the viewer's own time zone.
     */
    failureClock?: ConversationFailureClock;
    /**
     * Transient states of the current failure card, rendered directly so a
     * blueprint or test can show them without a pointer. Each only seeds local
     * state: the picked target, and the switch list open with a row hovered.
     */
    failurePreview?: { readonly target?: string; readonly menu?: { readonly active?: string } };
    /**
     * How many agents this conversation delegated to are still working. A turn
     * can hand work to a child and end before the child does, and the reader is
     * then watching a conversation that looks finished while it is not: this is
     * what keeps the status line saying so.
     */
    delegatedAgents?: number;
    /**
     * How long those agents have been going, when the owner knows. Absent leaves
     * the dedicated status without a clock rather than inventing one.
     */
    delegatedElapsedMs?: number;
    /**
     * Motion profile for live activity rows and the working-status footer.
     * Defaults to the historical typewriter behavior.
     */
    motion?: ActivityMotion;
    /** Activity-row content/chrome policy, independent of animation. */
    activityTreatment?: ActivityTreatment;
    /**
     * A live summary of external work, rendered as the final transcript entry
     * instead of taking space above the composer.
     */
    activityControl?: ReactNode;
    /**
     * The global switch for a caret at the end of a still-streaming reply.
     * Off by default, preserving the historical no-caret text stream.
     */
    streamingCaret?: boolean;
    entries: readonly ConversationEntry[];
    errorAssistance?: readonly ConversationErrorAssistanceEntry[];
    errorAssistanceUnavailable?: string;
    onErrorAssistanceRequest?: (entryId: string) => void;
    /** Custom introduction for a loaded conversation with no transcript entries. */
    emptyContent?: ReactNode;
    /**
     * A fixed block that opens the transcript as its first row, such as new
     * work's mark and the line under it. With one, an empty conversation is
     * this row alone rather than `emptyContent`: it rests with its lift line
     * at the height a send is lifted to, and the first message lands on that
     * line without anything above it moving.
     */
    leadingHeader?: ConversationLeadingHeader;
    /** Agent identity shown when a tool/activity row opens a turn before prose exists. */
    agentAuthor?: ConversationAuthor;
    /** Identity id of the reader, so their own messages take the own treatment. */
    viewerId?: string;
    /**
     * Which conversation these entries belong to. It is the transcript's
     * lifetime boundary: switching conversations mounts a new list, so one
     * conversation's reading position is never applied to another's.
     */
    conversationId?: string;
    /**
     * Where this conversation was last being read, restored on mount. Absent
     * means the newest content, which is where a conversation opens.
     */
    scrollPosition?: MessageListScrollPosition | MessageListLegacyScrollPosition;
    /** Reports the reading position, including the final one before unmount. */
    onScrollPositionChange?: (position: MessageListScrollPosition) => void;
    /**
     * The oldest loaded entry is on screen and older ones are wanted: the
     * reader scrolled to the top of the transcript, or the whole loaded
     * transcript fits on screen and they have nothing left to scroll.
     */
    onStartReached?: () => void;
    /** Header controls composed by the surface owner. */
    headerActions?: ReactNode;
    /**
     * A modal-class surface (settings dialog, picker) hosted above this one.
     * The owner decides whether it is open; this surface only says where it
     * belongs in the product. It is rendered in the window's own overlay lane,
     * so it stacks over the whole window rather than over the conversation's
     * corner of it.
     */
    overlay?: ReactNode;
    /**
     * Something to say about this conversation that is not part of it, held
     * above every message rather than mixed in among them.
     *
     * It is a fixed row between the header and the body, so it stays put while
     * the transcript scrolls and reads as a fact about the place the
     * conversation is happening in — a checkout still being prepared, above all
     * — rather than as something that was said in it. The transcript underneath
     * behaves exactly as it otherwise would, empty or full.
     */
    notice?: ReactNode;
    /** Replaces the conversation body while an owner-selected panel is open. */
    panel?: ReactNode;
    /**
     * The write end under the transcript, usually a `ConversationDock`. Absent,
     * the conversation is only read here.
     *
     * A slot rather than the draft and its handlers: the draft changes a
     * keystroke at a time, and the owner hands this view an element whose own
     * subscription to the draft re-renders only the dock. The transcript and
     * header above it are drawn from the conversation and stay as they are
     * while the reader types.
     */
    dock?: ReactNode;
    /** Shows or hides the intermediate entries of a finished turn. */
    onTraceToggle?: (turnId: string) => void;
    /** Finished turns currently listing their intermediate entries. */
    expandedTurnIds?: ReadonlySet<string>;
    expandedMessageIds?: ReadonlySet<string>;
    onMessageExpandedChange?: (messageId: string, expanded: boolean) => void;
    /**
     * Told which turns left open because the reader watched them finish this
     * view has on screen. The owner folds one once no view shows any of it, so
     * nothing the reader sees moves.
     */
    onTracesSeen?: (viewer: HappyAgentTraceViewer, turnIds: ReadonlySet<string>) => void;
    /** @deprecated Pending steering now renders as an ordered transcript message. */
    queued?: readonly { readonly id: string; readonly text: string }[];
    /** Opens one transcript image full size; the owner hosts the viewer in `overlay`. */
    onImageOpen?: (messageId: string, attachmentId: string) => void;
    /** Opens or downloads one linked transcript attachment. */
    onAttachmentOpen?: ConversationEntryViewProps["onAttachmentOpen"];
    /** Opens one tool entry in the workspace's replaceable Preview tab. */
    onToolSelect?: (entryId: string, tool: ConversationToolCall) => void;
    /** Opens one file a tool call presented: a picture full size, a file in its preview. */
    onToolMediaOpen?: ConversationEntryViewProps["onToolMediaOpen"];
    /** Opens a child session from an inline delegated-agent row. */
    onDelegationSelect?: ConversationEntryViewProps["onDelegationSelect"];
    /** Reference epoch millis used by delegated-agent timers. */
    now?: number;
    /**
     * Opens a workspace file the transcript names — the file a tool call worked
     * on, or one a message links to — in the product's own file viewer. Absent
     * leaves those affordances out entirely, because a transcript with no
     * workspace behind it has nothing to open.
     */
    onFileOpen?: FileOpenHandler;
    /**
     * Opens a file a `happy-file:` link in a message names in another agent's
     * or workspace's folder, beside this transcript. Absent leaves such links
     * inert.
     */
    onFileLinkOpen?: FileLinkOpenHandler;
    /**
     * Opens a web link a message carries where the reader chose from the
     * link's context menu: the machine's browser or the side panel. Absent
     * offers no menu, and a click goes where the host sends every link.
     */
    onLinkOpen?: LinkOpenHandler;
    /** Which of the two places a plain click on a link goes, marked in its menu. */
    linkOpenDefault?: LinkOpenPlacement;
    /**
     * What the Happy references agents name read as right now, and where
     * opening one goes. Supplied by the owner of the live stores behind them;
     * a new value re-renders the references and re-sizes the rows naming them.
     */
    references?: MessageReferences;
    /**
     * The artifacts and web pages tool calls show inline, and the engines that
     * draw them. Absent, every such call keeps its card.
     */
    inlinePages?: ConversationInlinePages;
    onRequestAnswer?: (requestId: string, answers: HappyAgentUserInputAnswerMap) => void;
    /** Request-id-scoped local answer submission lifecycles. */
    requestSubmissions?: readonly ConversationRequestSubmission[];
    /**
     * Options ticked into each pending question but not yet submitted, by
     * request id. The owner keeps them across view changes until the card's
     * Submit action sends them.
     */
    requestSelections?: ReadonlyMap<string, Readonly<Record<string, readonly string[]>>>;
    /** Reports each tick to the owner that keeps the selections. */
    onRequestSelectionChange?: (requestId: string, answers: HappyAgentUserInputAnswerMap) => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** How many recently opened conversations keep their prepared row layout. */
const ROW_HEIGHT_CACHE_LIMIT = 4;
/*
 * One row-layout cache per recently opened conversation. The owner remounts
 * this view for every conversation it opens, so the registry belongs to the
 * module rather than to one view's lifetime: returning to a conversation reuses
 * its prepared text layout instead of laying its whole history out again.
 * These are memo caches, not product state — retaining a calculation never
 * drives a render — and Map insertion order is the bounded LRU.
 */
const rowHeightCaches = new Map<string, ConversationRowHeightCache>();
function conversationRowHeightCacheGet(key: string): ConversationRowHeightCache {
    const cache = rowHeightCaches.get(key) ?? conversationRowHeightCacheCreate();
    // The conversation being read is touched last and so survives the evictions below.
    rowHeightCaches.delete(key);
    rowHeightCaches.set(key, cache);
    while (rowHeightCaches.size > ROW_HEIGHT_CACHE_LIMIT) {
        const oldest = rowHeightCaches.keys().next().value as string | undefined;
        if (oldest === undefined || oldest === key) break;
        rowHeightCaches.delete(oldest);
    }
    return cache;
}

/** How many inline pages keep their reader's collapse and last height. */
const INLINE_PAGE_MEMORY_LIMIT = 2_000;
/*
 * What the reader did to each inline page, and the height its page last
 * reported, by conversation and row. Like the row-layout caches they belong to
 * the module: a row scrolled out of the virtualized list, or a conversation
 * opened again, keeps its page's height and its collapse instead of jumping.
 * Collapse is local to this reader, as the product asks. Map insertion order
 * is the bounded LRU.
 */
const inlinePageCollapse = new Map<string, boolean>();
const inlinePageHeights = new Map<string, number>();
function inlinePageRemember<Value>(memory: Map<string, Value>, key: string, value: Value): void {
    memory.delete(key);
    memory.set(key, value);
    while (memory.size > INLINE_PAGE_MEMORY_LIMIT) {
        const oldest = memory.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        memory.delete(oldest);
    }
}

/** Where each turn left open because the reader watched it finish lies, by row. */
type ConversationTraceSpans = ReadonlyMap<
    string,
    { readonly first: number; readonly last: number }
>;

/**
 * The rows of every turn left open because the reader watched it finish, from
 * the one its control opens on to the footer that closes it. Read once per
 * transcript, so reporting what is on screen costs only the open turns.
 */
function conversationTraceSpans(transcript: readonly ConversationEntry[]): ConversationTraceSpans {
    const spans = new Map<string, { first: number; last: number }>();
    for (let index = 0; index < transcript.length; index += 1) {
        const entry = transcript[index]!;
        const trace =
            entry.kind === "message"
                ? entry.message.agentTrace
                : entry.kind === "agentActivity" ||
                    entry.kind === "delegation" ||
                    entry.kind === "turnStatus"
                  ? entry.agentTrace
                  : undefined;
        if (!trace?.quiet) continue;
        const span = spans.get(trace.turnId);
        if (span) span.last = index;
        else spans.set(trace.turnId, { first: index, last: index });
    }
    return spans;
}

/** The watched turns any of whose rows is among `first`–`last`. */
function conversationTracesOnScreen(
    spans: ConversationTraceSpans,
    first: number,
    last: number,
): ReadonlySet<string> {
    const seen = new Set<string>();
    for (const [turnId, span] of spans)
        if (span.last >= first && span.first <= last) seen.add(turnId);
    return seen;
}

/** Whether the turn this row carries the trace control for is currently open. */
function conversationEntryTraceOpen(
    entry: ConversationEntry,
    expandedTurnIds: ReadonlySet<string> | undefined,
): boolean {
    const trace =
        entry.kind === "message"
            ? entry.message.agentTrace
            : entry.kind === "agentActivity" ||
                entry.kind === "delegation" ||
                entry.kind === "turnStatus"
              ? entry.agentTrace
              : undefined;
    return trace !== undefined && expandedTurnIds?.has(trace.turnId) === true;
}

/**
 * Boundary classes a transcript row takes from its neighbours, or `undefined`
 * when it takes none.
 */
function conversationRowClassName(
    entries: readonly ConversationEntry[],
    index: number,
    liveStatus: boolean,
    viewerId: string | undefined,
): string | undefined {
    const classNames: string[] = [];
    if (
        entries[index]?.kind === "turnStatus" &&
        conversationTurnStatusAfterActivity(entries, index)
    )
        classNames.push("happy-turn-status--after-trace");
    if (conversationEntryResumesAfterActivity(entries, index))
        classNames.push("happy-conversation__resumed");
    if (conversationEntryPrecedesActivity(entries, index))
        classNames.push("happy-conversation__continues");
    if (conversationMessageClosedByStatus(entries, index, liveStatus))
        classNames.push("happy-conversation__closing");
    if (conversationOwnMessageContinued(entries, index, viewerId))
        classNames.push("happy-conversation__own-continued");
    return classNames.length === 0 ? undefined : classNames.join(" ");
}

/**
 * Splits off the queued steering waiting at the end of the transcript.
 *
 * Steering is the one thing in a conversation that has not happened yet: the
 * reader typed it while the agent was working and it will be handed over at the
 * next boundary. Ordered among the rows above the live status, it reads as
 * something already said and answers the wrong question — the reader looks at
 * their own words sitting above "Thinking" and cannot tell whether the turn has
 * seen them. Below that line it reads as what it is, next in the queue.
 *
 * Only a run of them at the very tail moves. Steering that was already applied
 * is ordinary history and stays where it happened.
 */
function conversationPendingSteering(entries: readonly ConversationEntry[]): {
    readonly transcript: readonly ConversationEntry[];
    readonly queued: readonly ConversationEntry[];
} {
    let start = entries.length;
    while (start > 0) {
        const entry = entries[start - 1];
        if (entry?.kind !== "message" || entry.delivery !== "pending_steering") break;
        start -= 1;
    }
    return start === entries.length
        ? { transcript: entries, queued: [] }
        : { transcript: entries.slice(0, start), queued: entries.slice(start) };
}

/**
 * Whether the running turn is only sitting out a scheduled wait: at least one
 * wait call is in flight and nothing else in the transcript is still running.
 */
function conversationScheduledWait(transcript: readonly ConversationEntry[]): boolean {
    let waiting = false;
    for (const entry of transcript) {
        if (entry.kind !== "agentActivity") continue;
        const activity = entry.activity;
        if (activity.kind === "tool") {
            if (activity.tool.status !== "running") continue;
            if (toolCallStillGlyph(activity.tool.toolName) !== "clock") return false;
            waiting = true;
        } else if (
            (activity.kind === "shell" && activity.running) ||
            (activity.kind === "labeled" && activity.status === "running") ||
            (activity.kind === "reasoning" && activity.streaming)
        )
            return false;
    }
    return waiting;
}

function elapsedFormat(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${(seconds % 60).toString().padStart(2, "0")}s`;
}

/**
 * The agent's live run state for the header that names what is open. It sits
 * here rather than inside `ConversationView` because a surface whose heading
 * spans a whole directory still shows the open session's activity.
 */
export function ConversationStatus(props: { elapsedMs?: number; running?: boolean }) {
    return (
        <span
            className="happy-conversation__status"
            data-happy-desktop-ui="conversation-status"
            data-running={props.running ? "" : undefined}
        >
            <span aria-hidden="true" className="happy-conversation__status-dot" />
            {props.running ? "Running" : "Idle"}
            {props.running && props.elapsedMs !== undefined ? (
                <span
                    className="happy-conversation__status-elapsed"
                    data-happy-desktop-ui="conversation-elapsed"
                >
                    {elapsedFormat(props.elapsedMs)}
                </span>
            ) : null}
        </span>
    );
}

/**
 * ConversationView — the assembled conversation surface: a `ChannelHeader` with
 * the title, subtitle, and owner-supplied controls; the virtualized shared
 * `MessageList` of `ConversationEntry` rows; an optional owner panel that takes
 * the body; and the owner's `dock` under them, usually a `ConversationDock`
 * holding the shared `Composer`. A running turn keeps one minimal `AgentWorkingStatus` in the
 * message list footer — elapsed clock and current phase — alongside any active
 * external-work summary, all of which scrolls with the transcript rather than
 * floating over it.
 *
 * Every value comes from props. The draft is not one of them: it belongs to the
 * dock, so a keystroke never re-renders the transcript.
 */
/** What a conversation can do about its latest failure, told which failure row it acts on. */
export interface ConversationFailureHandlers {
    readonly onRetry?: (entryId: string) => void;
    readonly onNewChat?: (entryId: string) => void;
    readonly onSwitch?: (entryId: string, target: ConversationSwitchTarget) => void;
}

/**
 * The failure the conversation ends on, which is the only one still offering
 * its actions. A failure followed by anything but the turn's closing status
 * has been moved past.
 */
function conversationCurrentFailure(transcript: readonly ConversationEntry[]): string | undefined {
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
        const entry = transcript[index]!;
        if (entry.kind === "turnStatus") continue;
        return entry.kind === "notice" &&
            entry.variant !== "compute" &&
            entry.failure !== undefined &&
            entry.failure.resolution === undefined
            ? entry.id
            : undefined;
    }
    return undefined;
}

/** The reader's newest send from this view, while it is still the newest message. */
function conversationSentHereKey(entries: readonly ConversationEntry[]): string | undefined {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index]!;
        if (entry.kind !== "message") continue;
        return entry.sentHere === true && entry.delivery !== "failed"
            ? entry.message.id
            : undefined;
    }
    return undefined;
}

/** The geometry-relevant part of a failure row's props, for the row-height model. */
function failureRowContext(failure: ConversationEntryFailureProps): ConversationFailureRowContext {
    return {
        current: failure.current,
        actions: {
            retry: failure.onRetry !== undefined,
            newChat: failure.onNewChat !== undefined,
            switch: failure.onSwitch !== undefined,
        },
        ...(failure.switchTargets === undefined ? {} : { switchTargets: failure.switchTargets }),
        ...(failure.target === undefined ? {} : { target: failure.target }),
        ...(failure.clock === undefined ? {} : { clock: failure.clock }),
    };
}

export function ConversationView(props: ConversationViewProps) {
    /* The switch target picked on each failure card. Picking only changes the
       target; it is this view's own UI state, keyed like row expansion so it
       never leaks into another conversation. */
    const [failureTargets, setFailureTargets] = useState(() => new Map<string, string>());
    const failurePreview = props.failurePreview;
    const errorAssistanceByEntry = new Map(
        props.errorAssistance?.map((entry) => [entry.entryId, entry.assistance]),
    );
    const errorAssistanceFor = (
        entry: ConversationEntry | undefined,
    ): ConversationErrorAssistance | undefined => {
        if (entry?.kind !== "notice") return undefined;
        const assistance = errorAssistanceByEntry.get(entry.id);
        if (!assistance) return undefined;
        return props.errorAssistanceUnavailable === undefined || assistance.status === "pending"
            ? assistance
            : { status: "unavailable", reason: props.errorAssistanceUnavailable };
    };
    const textLayoutGeneration = useSyncExternalStore(
        messageTextLayoutFontGenerationSubscribe,
        messageTextLayoutFontGenerationGet,
        messageTextLayoutFontGenerationGet,
    );
    /* A recording that stated no size changes its row's height once its
       metadata reports one; the rows that hold such a recording are asked again. */
    const framesAt = useSyncExternalStore(
        mediaVideoFramesSubscribe,
        mediaVideoFramesVersion,
        mediaVideoFramesVersion,
    );
    /* The same for a widget once its page reports its height: the rows that
       hold a widget are asked again. */
    useSyncExternalStore(
        mediaComponentHeightsSubscribe,
        mediaComponentHeightsVersion,
        mediaComponentHeightsVersion,
    );
    const conversationCacheKey =
        props.conversationId === undefined ? "anonymous" : `conversation:${props.conversationId}`;
    const [rowExpansion, setRowExpansion] = useState(() => new Map<string, boolean>());
    const rowExpansionKey = (entry: ConversationEntry) =>
        `${conversationCacheKey}:${entryKey(entry)}`;
    const rowExpanded = (entry: ConversationEntry) =>
        rowExpansion.get(rowExpansionKey(entry)) ??
        (entry.kind === "agentActivity" && entry.activity.kind === "shell");
    const rowExpandedChange = (entry: ConversationEntry, expanded: boolean) => {
        const key = rowExpansionKey(entry);
        setRowExpansion((current) => {
            if (current.get(key) === expanded) return current;
            const next = new Map(current);
            next.set(key, expanded);
            return next;
        });
    };
    const messageExpanded = (entry: Extract<ConversationEntry, { kind: "message" }>) =>
        props.expandedMessageIds?.has(entry.message.id) ?? rowExpanded(entry);
    const messageExpandedChange = (entry: ConversationEntry, expanded: boolean) => {
        if (entry.kind === "message" && props.onMessageExpandedChange)
            props.onMessageExpandedChange(entry.message.id, expanded);
        else rowExpandedChange(entry, expanded);
    };
    const rowHeightCache = conversationRowHeightCacheGet(conversationCacheKey);
    conversationRowHeightCachePrune(rowHeightCache, props.entries);
    /* With no turn running, a send waiting on the daemon is next to nothing:
       it keeps the row it will have once accepted. */
    const steering =
        props.running === true
            ? conversationPendingSteering(props.entries)
            : { transcript: props.entries, queued: [] };
    const queued = steering.queued;
    const transcript = steering.transcript;
    // A queued message keeps its entity key and virtual row when Stop ends
    // the turn and when the daemon accepts it into the next one.
    const listEntries = queued.length === 0 ? transcript : [...transcript, ...queued];
    const traceSpans = conversationTraceSpans(transcript);
    /* This view, as the chat's owner counts the views holding a turn open:
       one whose list has left the document holds nothing. */
    const traceList = useRef<HTMLElement | undefined>(undefined);
    const [traceViewer] = useState(() => ({
        live: () => traceList.current?.isConnected === true,
    }));
    /* Every change to an inline page's collapse or height is one generation,
       which re-sizes the rows; the values themselves live in module memory. */
    const [inlinePageGeneration, setInlinePageGeneration] = useState(0);
    const inlinePageLocal: ConversationInlinePageLocal = {
        collapsed: (key) => inlinePageCollapse.get(key),
        collapsedSet: (key, collapsed) => {
            if (inlinePageCollapse.get(key) === collapsed) return;
            inlinePageRemember(inlinePageCollapse, key, collapsed);
            setInlinePageGeneration((generation) => generation + 1);
        },
        height: (key) => inlinePageHeights.get(key),
        heightSet: (key, height) => {
            if (inlinePageHeights.get(key) === height) return;
            inlinePageRemember(inlinePageHeights, key, height);
            setInlinePageGeneration((generation) => generation + 1);
        },
    };
    const inlineLayouts = conversationInlineLayouts(transcript, framesAt);
    const mediaRuns = conversationMediaRuns(transcript, inlineLayouts.hidden);
    /* What a row draws because of a reply's layouts: the pictures a call gave
       up to one, or the layouts a reply draws. */
    const placedOf = (entry: ConversationEntry | undefined) => {
        if (entry === undefined) return {};
        if (entry.kind === "message") {
            const layouts = inlineLayouts.messages.get(entry.message.id);
            return layouts ? { messageLayouts: layouts } : {};
        }
        const placed = inlineLayouts.hidden.get(entryKey(entry));
        return placed ? { mediaPlaced: placed } : {};
    };
    const inlinePages = props.inlinePages;
    /* A widget in a reply is a standard component on a page of its own, drawn
       by the engine that draws an artifact's page. */
    const componentRender = inlinePages?.artifactRender;
    const componentSitesRequest = inlinePages?.componentSitesRequest;
    const mediaComponents =
        inlinePages?.componentSites !== undefined && componentSitesRequest && componentRender
            ? {
                  sites: inlinePages.componentSites,
                  request: componentSitesRequest,
                  render: componentRender,
              }
            : undefined;
    const inlineLeads = inlinePages ? conversationInlineArtifactLeads(transcript) : undefined;
    const inlinePageOf = (entry: ConversationEntry | undefined) =>
        entry === undefined || inlinePages === undefined || inlineLeads === undefined
            ? undefined
            : conversationInlinePage(
                  entry,
                  rowExpansionKey(entry),
                  inlinePages,
                  inlineLeads,
                  inlinePageLocal,
              );
    const currentFailureId =
        props.running === true ? undefined : conversationCurrentFailure(transcript);
    /* The switch reads the picker's own catalog and usage, live. Usage is
       followed only while the current failure offers a switch, through one
       subscription that sizes the card's row and fills its list alike. */
    const switchSource =
        currentFailureId !== undefined && props.failureActions?.onSwitch !== undefined
            ? props.failureSwitch
            : undefined;
    const switchFeed = switchSource?.usageWatch
        ? conversationSwitchUsageFeed(switchSource.usageWatch)
        : CONVERSATION_SWITCH_USAGE_NONE;
    const switchUsage = useSyncExternalStore(switchFeed.subscribe, switchFeed.get, switchFeed.get);
    const switchTargets = switchSource
        ? conversationSwitchTargets(switchSource, switchUsage)
        : undefined;
    const switchPreferred = switchTargets
        ? conversationSwitchTargetPreferred(switchTargets, switchSource?.selection?.service)
        : undefined;
    /** Opening the switch list asks for the usage of every account the picker lists. */
    const switchOpen = () =>
        switchSource?.usageWatch?.refresh(
            composerModelListedAccounts(switchSource.services, switchSource.selection),
        );
    const failureFor = (
        entry: ConversationEntry | undefined,
    ): ConversationEntryFailureProps | undefined => {
        if (entry?.kind !== "notice" || entry.variant === "compute" || entry.failure === undefined)
            return undefined;
        const current = entry.id === currentFailureId;
        const key = rowExpansionKey(entry);
        const actions = props.failureActions;
        const picked = failureTargets.get(key) ?? (current ? failurePreview?.target : undefined);
        const offered = current ? switchTargets : undefined;
        // A pick the live list no longer offers gives way to its best account.
        const target =
            offered === undefined ||
            offered.some((candidate) => conversationFailureTargetKey(candidate) === picked)
                ? picked
                : switchPreferred && conversationFailureTargetKey(switchPreferred);
        return {
            current,
            ...(offered === undefined
                ? {}
                : {
                      switchTargets: offered,
                      onSwitchOpen: switchOpen,
                      ...(switchUsage === undefined ? {} : { usageNow: switchUsage.now }),
                  }),
            ...(current && failurePreview?.menu ? { previewMenu: failurePreview.menu } : {}),
            ...(target === undefined ? {} : { target }),
            ...((clock) => (clock ? { clock } : {}))(
                props.failureClock ?? (props.now === undefined ? undefined : { now: props.now }),
            ),
            ...(current && actions?.onRetry ? { onRetry: () => actions.onRetry!(entry.id) } : {}),
            ...(current && actions?.onNewChat
                ? { onNewChat: () => actions.onNewChat!(entry.id) }
                : {}),
            ...(current && actions?.onSwitch
                ? {
                      onSwitch: (switchTarget: ConversationSwitchTarget) =>
                          actions.onSwitch!(entry.id, switchTarget),
                  }
                : {}),
            onTargetChange: (choice: string) =>
                setFailureTargets((targets) => {
                    if (targets.get(key) === choice) return targets;
                    const next = new Map(targets);
                    next.set(key, choice);
                    return next;
                }),
        };
    };
    const awaitingInput = transcript.some(
        (entry) =>
            entry.kind === "request" &&
            entry.request.kind === "userInput" &&
            entry.request.status !== "answered",
    );
    /* The reader's message is on its way and nothing has answered it yet. The
       status line arrives with the message, in the same commit, rather than a
       beat later when the run is reported started. */
    const sendPending = props.entries.some(
        (entry) =>
            entry.kind === "message" &&
            entry.sentHere === true &&
            (entry.delivery === "sending" || entry.delivery === "pending_steering"),
    );
    const awaitingReply = props.running !== true && sendPending;
    /* A send made while the agent is idle is lifted to the top with room for
       its reply. One made mid-turn waits under the streaming reply instead,
       which would push a lifted row down. A send already present when the
       view opens is history. */
    const sentKey = conversationSentHereKey(props.entries);
    const [sendLift, setSendLift] = useState(() => ({
        conversationId: props.conversationId,
        sentKey,
        liftKey: undefined as string | undefined,
        followKey: undefined as string | undefined,
    }));
    if (sendLift.conversationId !== props.conversationId)
        setSendLift({
            conversationId: props.conversationId,
            sentKey,
            liftKey: undefined,
            followKey: undefined,
        });
    else if (sendLift.sentKey !== sentKey)
        setSendLift({
            conversationId: props.conversationId,
            sentKey,
            liftKey: sentKey !== undefined && props.running !== true ? sentKey : sendLift.liftKey,
            followKey:
                sentKey !== undefined && props.running === true ? sentKey : sendLift.followKey,
        });
    /*
     * The turn ended and the agents it delegated to did not. That is a state of
     * its own rather than a continuation of the turn: the conversation is still
     * working, but nothing of the parent's is running, so the line takes the
     * loader and the children's clock instead of the finished turn's phase,
     * label, and wait — and it never claims the identity header, because the
     * work it reports was set going by the turn above it.
     */
    const delegating =
        props.running !== true &&
        !awaitingInput &&
        !awaitingReply &&
        (props.delegatedAgents ?? 0) > 0;
    /* A wait whose end the owner did not supply still is not work: the footer
       takes a still clock rather than the loader. */
    const scheduledWait =
        props.running === true &&
        !awaitingInput &&
        props.workingWait === undefined &&
        conversationScheduledWait(transcript);
    /*
     * An unanswered question keeps the footer after the run that asked it
     * stops. The turn is not over — it is waiting on the reader — and the one
     * line that reports what this conversation is doing is the place that says
     * so, rather than leaving the transcript looking finished.
     */
    const statusVisible = props.running === true || awaitingInput || delegating || awaitingReply;
    const workingStatusStartsGroup =
        statusVisible &&
        !delegating &&
        props.agentAuthor !== undefined &&
        conversationWorkingStatusStartsGroup(transcript);
    const workingStatusClosesMessage =
        statusVisible && conversationMessageClosedByStatus(transcript, transcript.length - 1, true);
    const workingStatus = (
        <AgentWorkingStatus
            active={statusVisible}
            awaitingInput={awaitingInput}
            className={[
                "happy-conversation-turn-status",
                workingStatusClosesMessage
                    ? "happy-conversation-turn-status--after-message"
                    : undefined,
            ]
                .filter(Boolean)
                .join(" ")}
            elapsedMs={delegating ? props.delegatedElapsedMs : awaitingReply ? 0 : props.elapsedMs}
            label={
                delegating
                    ? undefined
                    : props.retrying
                      ? conversationRetryingLabel(props.retrying)
                      : props.workingLabel
            }
            /* The phase word is the one label whose changes are the whole
               point of the row, so it retypes wherever the rows above it
               retype verbs. */
            motion={
                props.motion === undefined ||
                props.motion === "typewriter" ||
                props.motion === "verb-typed"
                    ? "typewriter"
                    : "calm"
            }
            phase={delegating ? "delegating" : awaitingReply ? "waiting" : props.workingPhase}
            wait={delegating ? undefined : props.workingWait}
            waiting={scheduledWait}
        />
    );
    /**
     * The live turn and its external work share one line: the status keeps the
     * left and the activity summary sits at the far right. When no parent turn
     * is active, the same line remains with only the external-work summary, so
     * a terminal or subagent never jumps into the settled "Completed in" row.
     */
    const workingStatusLine = (
        <div
            className="happy-conversation__status-line"
            data-active-turn={statusVisible ? "" : undefined}
            data-happy-desktop-ui="conversation-status-line"
        >
            {workingStatus}
            {props.activityControl ? (
                <div
                    className="happy-conversation__activity-entry"
                    data-happy-desktop-ui="conversation-activity-entry"
                >
                    {props.activityControl}
                </div>
            ) : null}
        </div>
    );
    const workingStatusRow =
        workingStatusStartsGroup && props.agentAuthor ? (
            <Message
                agent
                author={props.agentAuthor.displayName}
                body=""
                className="happy-message--activity-lead happy-message--working-lead"
                initials={initialsOf(props.agentAuthor.displayName)}
            >
                {workingStatusLine}
            </Message>
        ) : (
            workingStatusLine
        );
    const activityFallback = props.activityControl ? (
        <div
            className="happy-conversation__activity-fallback"
            data-happy-desktop-ui="conversation-activity-fallback"
        >
            {props.activityControl}
        </div>
    ) : null;
    const rowContext = (index: number, width: number): ConversationRowContext => {
        const entry = listEntries[index];
        const inlinePage = inlinePageOf(entry);
        return {
            activityTreatment: props.activityTreatment,
            errorAssistance: errorAssistanceFor(entry),
            ...((failure) => (failure ? { failure: failureRowContext(failure) } : {}))(
                failureFor(entry),
            ),
            expanded: entry === undefined ? false : rowExpanded(entry),
            messageExpanded:
                entry?.kind === "message" && entry.message.sender?.kind === "human"
                    ? messageExpanded(entry)
                    : undefined,
            surface: "conversation",
            liveStatus: index < transcript.length && statusVisible,
            ...(props.references ? { references: props.references } : {}),
            ...(inlinePage ? { inlinePage: inlinePage.geometry } : {}),
            ...((run) => (run ? { mediaRun: run } : {}))(
                entry === undefined ? undefined : mediaRuns.get(entryKey(entry)),
            ),
            ...placedOf(entry),
            viewerId: props.viewerId,
            width,
        };
    };
    /*
     * The rows a row reads its neighbours from. A transcript row ends at the
     * live status, so queueing never restyles the row above it. Queued steering
     * reads back across the status as it will once the turn takes it: it
     * groups with the reader's message before it exactly as it will then, so
     * taking up the queue changes none of its spacing.
     */
    const conversationRowSource = (index: number) =>
        index < transcript.length ? transcript : listEntries;
    const rowGeometry = (index: number, width: number) =>
        [conversationRowSource(index), index, rowContext(index, width), rowHeightCache] as const;
    const workingStatusHeight = conversationWorkingStatusHeight({
        visible: statusVisible,
        startsGroup: workingStatusStartsGroup,
        closesMessage: workingStatusClosesMessage,
        activityControl: Boolean(props.activityControl),
    });
    const queuedStatusHeight =
        queued.length === 0
            ? 0
            : conversationWorkingStatusHeight({
                  visible: true,
                  startsGroup: props.agentAuthor !== undefined,
                  closesMessage: false,
                  activityControl: Boolean(props.activityControl),
              });
    return (
        <section
            className={["happy-conversation", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="conversation-view"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {props.title === undefined ? null : (
                <ChannelHeader
                    actions={
                        <>
                            <ConversationStatus
                                elapsedMs={props.elapsedMs}
                                running={props.running}
                            />
                            {props.headerActions}
                        </>
                    }
                    icon="spark"
                    title={props.title}
                    topic={props.subtitle}
                />
            )}

            {props.notice ? (
                <div
                    className="happy-conversation__notice"
                    data-happy-desktop-ui="conversation-notice"
                >
                    {props.notice}
                </div>
            ) : null}

            {props.panel ? (
                <ScrollArea
                    axes="both"
                    className="happy-conversation__panel"
                    data-happy-desktop-ui="conversation-panel"
                    viewportClassName="happy-conversation__panel-viewport"
                >
                    {props.panel}
                </ScrollArea>
            ) : props.loading ? (
                <ScrollArea
                    axes="both"
                    className="happy-conversation__empty happy-conversation__loading"
                    data-happy-desktop-ui="conversation-loading"
                    viewportClassName="happy-conversation__empty-viewport"
                >
                    <Spinner
                        className="happy-conversation__loading-spinner"
                        label="Loading conversation"
                        size={20}
                        tone="muted"
                        variant="line"
                    />
                    {activityFallback}
                </ScrollArea>
            ) : props.entries.length === 0 && props.leadingHeader === undefined ? (
                <ScrollArea
                    axes="both"
                    className="happy-conversation__empty"
                    data-happy-desktop-ui="conversation-empty"
                    viewportClassName="happy-conversation__empty-viewport"
                >
                    {props.emptyContent ?? (
                        <EmptyState
                            // A conversation with nothing in it is something small
                            // about to come out, so that is what it looks like.
                            animation="hatching-chick"
                            description="Send a message to start working in this conversation."
                            icon="chat"
                            size="panel"
                            title="Nothing here yet"
                        />
                    )}
                    {activityFallback}
                </ScrollArea>
            ) : (
                <MarkdownLayoutCacheContext.Provider value={rowHeightCache.text}>
                    <MediaTreeComponentsContext.Provider value={mediaComponents}>
                        <MessageList
                            /* Inputs every row's estimate may read. The live status is
                       not one: only the final row reads it, as its successor,
                       and the list asks that row again with the footer. */
                            estimateDependencies={[
                                props.errorAssistance,
                                props.errorAssistanceUnavailable,
                                // Which actions a card offers sizes it; their identity does not.
                                props.failureActions?.onRetry === undefined,
                                props.failureActions?.onNewChat === undefined,
                                props.failureActions?.onSwitch === undefined,
                                props.failureClock,
                                failureTargets,
                                currentFailureId,
                                // The labels the switch can show and which one it shows now.
                                switchTargets?.map(conversationFailureTargetLabel).join("\n"),
                                switchPreferred && conversationFailureTargetKey(switchPreferred),
                                props.viewerId,
                                props.activityTreatment,
                                rowExpansion,
                                conversationReferencesSignature(transcript, props.references),
                                inlinePageGeneration,
                                inlinePages?.artifacts,
                                inlinePages?.artifactRender === undefined,
                                inlinePages?.liveRender === undefined,
                            ]}
                            estimateRowSize={(index, width) =>
                                conversationRowHeight(...rowGeometry(index, width))
                            }
                            cachedRowSize={(index, width) =>
                                conversationRowHeightCached(...rowGeometry(index, width))
                            }
                            prepareRowSize={(index, width) =>
                                conversationRowHeightPrepare(...rowGeometry(index, width))
                            }
                            estimateRows={conversationMediaRunRows(
                                listEntries,
                                mediaRuns,
                                (entry) => {
                                    if (entry.kind === "message") {
                                        const fold =
                                            entry.message.sender?.kind === "human"
                                                ? messageExpanded(entry)
                                                    ? "message-open"
                                                    : "message-closed"
                                                : "";
                                        const layouts = inlineLayouts.messages.get(
                                            entry.message.id,
                                        );
                                        if (layouts === undefined) return fold;
                                        let frames = "";
                                        for (const layout of layouts.layouts.values())
                                            frames += `${mediaVideoFramesSignature(
                                                layout.members.map((member) => member.item),
                                                framesAt,
                                            )}${mediaTreeWidgetsSignature(layout.root)}`;
                                        return `${fold}|${layouts.signature}|${frames}`;
                                    }
                                    const placed = [
                                        ...(inlineLayouts.hidden.get(entryKey(entry)) ?? []),
                                    ].join(",");
                                    const presentation =
                                        entry.kind === "agentActivity" &&
                                        entry.activity.kind === "tool"
                                            ? entry.activity.tool.presentation
                                            : undefined;
                                    const frames =
                                        presentation?.type === "media"
                                            ? `${mediaVideoFramesSignature(presentation.items, framesAt)}${
                                                  presentation.layout?.type === "tree"
                                                      ? mediaTreeWidgetsSignature(
                                                            presentation.layout.root,
                                                        )
                                                      : ""
                                              }`
                                            : "";
                                    return frames === "" ? placed : `${placed}|${frames}`;
                                },
                            )}
                            estimateRowWidth={contentWidth}
                            estimateVersion={textLayoutGeneration}
                            footer={workingStatusRow}
                            footerBefore={transcript.length}
                            /* The status and any queued message arrive with a
                           send; a reader at the bottom sees where the reply
                           will start rather than having it held below. */
                            footerFollowed={sendPending}
                            footerReserveHeight={queuedStatusHeight}
                            liftKey={sendLift.liftKey}
                            followKey={sendLift.followKey}
                            {...(props.leadingHeader
                                ? {
                                      header: props.leadingHeader.content,
                                      headerHeight: props.leadingHeader.height,
                                      headerLift: props.leadingHeader.lift,
                                  }
                                : {})}
                            footerHeight={workingStatusHeight}
                            initialScrollPosition={props.scrollPosition}
                            rowFallbackKey={(index) => listEntries[index]?.traceFoldTargetId}
                            rowAnchorKey={(index) => listEntries[index]?.traceFoldAnchorId}
                            // The conversation is this list's lifetime: switching to
                            // another one mounts its own list, which is what lets each
                            // restore its own position instead of inheriting one.
                            key={props.conversationId}
                            onScrollPositionChange={props.onScrollPositionChange}
                            onStartReached={props.onStartReached}
                            {...(props.onTracesSeen
                                ? {
                                      onVisibleRowsChange: (
                                          first: number,
                                          last: number,
                                          element: HTMLElement,
                                      ) => {
                                          traceList.current = element;
                                          props.onTracesSeen!(
                                              traceViewer,
                                              conversationTracesOnScreen(traceSpans, first, last),
                                          );
                                      },
                                  }
                                : {})}
                            jumpToEnd
                            /* Shimmers exactly while the status line spins: not on
                           a question or a wait, and on through delegation. */
                            jumpToEndWorking={
                                statusVisible &&
                                !awaitingInput &&
                                !scheduledWait &&
                                (delegating || props.workingWait === undefined)
                            }
                            paddingEnd={24}
                            virtualize
                        >
                            {listEntries.map((entry, index) => {
                                const source = conversationRowSource(index);
                                const submission =
                                    entry.kind === "request"
                                        ? props.requestSubmissions?.find(
                                              (candidate) =>
                                                  candidate.requestId === entry.request.requestId,
                                          )
                                        : undefined;
                                const inlinePage = inlinePageOf(entry);
                                return (
                                    <ConversationEntryView
                                        /* The key leads the spread props below so React
                                   takes its direct element path for each of the
                                   transcript's rows instead of copying props. */
                                        key={entry.kind === "message" ? entry.message.id : entry.id}
                                        {...(inlinePage ? { inlinePage: inlinePage.props } : {})}
                                        errorAssistance={errorAssistanceFor(entry)}
                                        failure={failureFor(entry)}
                                        onErrorAssistanceRequest={props.onErrorAssistanceRequest}
                                        activityMotion={props.motion}
                                        activityTreatment={props.activityTreatment}
                                        {...(props.streamingCaret === undefined
                                            ? {}
                                            : { streamingCaret: props.streamingCaret })}
                                        {...(entry.kind === "message" &&
                                        entry.contextNote !== undefined
                                            ? { contextNote: entry.contextNote }
                                            : {})}
                                        activityAuthor={
                                            props.agentAuthor &&
                                            (conversationAgentRowStartsGroup(source, index) ||
                                                conversationTurnStatusStartsGroup(source, index))
                                                ? props.agentAuthor
                                                : undefined
                                        }
                                        className={
                                            [
                                                conversationRowClassName(
                                                    source,
                                                    index,
                                                    index < transcript.length && statusVisible,
                                                    props.viewerId,
                                                ),
                                                index >= transcript.length
                                                    ? "happy-conversation__queued"
                                                    : undefined,
                                            ]
                                                .filter(Boolean)
                                                .join(" ") || undefined
                                        }
                                        entry={entry}
                                        grouped={
                                            entry.kind === "message"
                                                ? conversationMessageGrouped(source, index)
                                                : undefined
                                        }
                                        onImageOpen={props.onImageOpen}
                                        onAttachmentOpen={props.onAttachmentOpen}
                                        onRequestAnswer={props.onRequestAnswer}
                                        onRequestSelectionChange={props.onRequestSelectionChange}
                                        onRowExpandedChange={(expanded) =>
                                            entry.kind === "message"
                                                ? messageExpandedChange(entry, expanded)
                                                : rowExpandedChange(entry, expanded)
                                        }
                                        messageExpanded={
                                            entry.kind === "message" &&
                                            entry.message.sender?.kind === "human"
                                                ? messageExpanded(entry)
                                                : undefined
                                        }
                                        requestSelection={
                                            entry.kind === "request"
                                                ? props.requestSelections?.get(
                                                      entry.request.requestId,
                                                  )
                                                : undefined
                                        }
                                        onToolSelect={props.onToolSelect}
                                        {...(props.onToolMediaOpen
                                            ? { onToolMediaOpen: props.onToolMediaOpen }
                                            : {})}
                                        {...((run) => (run ? { mediaRun: run } : {}))(
                                            mediaRuns.get(entryKey(entry)),
                                        )}
                                        {...placedOf(entry)}
                                        onDelegationSelect={props.onDelegationSelect}
                                        now={props.now}
                                        {...(props.onFileOpen
                                            ? { onFileOpen: props.onFileOpen }
                                            : {})}
                                        {...(props.onFileLinkOpen
                                            ? { onFileLinkOpen: props.onFileLinkOpen }
                                            : {})}
                                        {...(props.onLinkOpen
                                            ? { onLinkOpen: props.onLinkOpen }
                                            : {})}
                                        {...(props.references
                                            ? { references: props.references }
                                            : {})}
                                        {...(props.linkOpenDefault
                                            ? { linkOpenDefault: props.linkOpenDefault }
                                            : {})}
                                        onTraceToggle={props.onTraceToggle}
                                        /* Either kind of row can be the one a turn hung
                                   its control on: the answer when the turn is
                                   folded up, the row its work starts on when it
                                   is open. */
                                        traceOpen={conversationEntryTraceOpen(
                                            entry,
                                            props.expandedTurnIds,
                                        )}
                                        requestError={
                                            submission?.status === "failed"
                                                ? submission.error
                                                : undefined
                                        }
                                        requestRetryAnswers={
                                            submission?.status === "failed"
                                                ? submission.answers
                                                : undefined
                                        }
                                        requestPending={submission?.status === "pending"}
                                        rowExpanded={rowExpanded(entry)}
                                        viewerId={props.viewerId}
                                    />
                                );
                            })}
                        </MessageList>
                    </MediaTreeComponentsContext.Provider>
                </MarkdownLayoutCacheContext.Provider>
            )}

            {props.dock}

            {props.overlay ? <WindowOverlay>{props.overlay}</WindowOverlay> : null}
        </section>
    );
}

function initialsOf(displayName: string): string {
    return displayName
        .split(/\s+/u)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}
