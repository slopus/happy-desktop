import { useContext, type CSSProperties, type ReactNode } from "react";
import { MarkdownLayoutCacheContext } from "./MessageMarkdown";
import { conversationMessageCompactLayout } from "./conversationRowHeight";
import { useMessageListRowWidth } from "./messageListRowWidth";
import type { FileLinkOpenHandler, FileOpenHandler } from "./fileReference";
import type { LinkOpenHandler, LinkOpenPlacement } from "./MessageMarkdown";
import type { MessageReferences } from "./messageReferences";
import { thumbhashDataUrl } from "./thumbhashDataUrl";
import type {
    AgentTurnTraceSummary,
    ConversationAttachment,
    ConversationAuthor,
    ConversationEntry,
    ConversationErrorAssistance,
    ConversationToolCall,
    UserError,
} from "happy-desktop-state";
import { messageBodyFormat } from "./messagePlainText";
import {
    AgentActivityRow,
    type ActivityMotion,
    type ActivityTreatment,
    type AgentActivityMediaRun,
} from "./AgentActivityRow";
import type { ConversationMediaRun } from "./conversationMediaRuns";
import type { MessageInlineLayouts } from "./conversationInlineLayouts";
import { ConversationMedia } from "./ConversationMedia";
import type { InlinePageProps } from "./InlinePage";
import { ConversationComputeEvent } from "./ConversationComputeEvent";
import { ConversationErrorCard } from "./ConversationErrorCard";
import {
    ConversationFailureCard,
    type ConversationFailureActions,
} from "./ConversationFailureCard";
import type { ConversationFailureClock } from "./conversationFailureText";
import type { ConversationSwitchTarget } from "./conversationSwitchTargets";
import { ConversationSummaryRow } from "./ConversationSummaryRow";
import { conversationErrorTitle } from "./conversationErrorTitle";
import { DelegatedAgentActivity } from "./DelegatedAgentActivity";
import { TurnSummary } from "./TurnSummary";
import { AgentTraceRow } from "./AgentTraceRow";
import { DayDivider, Message, SystemNotice, type MessageImage } from "./Message";
import {
    ConversationRequestView,
    type ConversationRequestDecision,
} from "./ConversationRequestView";
import { type HappyAgentUserInputAnswerMap } from "./HappyAgentUserInputPrompt";
import { FileAttachment, type FileAttachmentKind } from "./FileAttachment";
import { SYSTEM_NOTIFICATION_LABEL } from "./systemNotification";

/** A failure card's live state and actions, supplied by the conversation that owns it. */
export type ConversationEntryFailureProps = ConversationFailureActions & {
    /** The conversation has not moved past this failure, so its actions are offered. */
    readonly current: boolean;
    /** Every account the turn can continue on, from the model picker's live catalog and usage. */
    readonly switchTargets?: readonly ConversationSwitchTarget[];
    readonly target?: string;
    readonly onTargetChange?: (key: string) => void;
    /** The switch list was opened, so every account's usage is worth reading again. */
    readonly onSwitchOpen?: () => void;
    readonly usageNow?: number;
    readonly clock?: ConversationFailureClock;
    /** Seeds the switch list open, for a blueprint or test. */
    readonly previewMenu?: { readonly active?: string };
};

type ConversationLinkedAttachment = Extract<ConversationAttachment, { kind: "linked" }>;

export type ConversationEntryViewProps = {
    entry: ConversationEntry;
    errorAssistance?: ConversationErrorAssistance;
    onErrorAssistanceRequest?: (entryId: string) => void;
    /**
     * What a failure card on this row offers and which switch target is
     * picked. Absent, the card shows its message and offers only Ask Chief of
     * Staff.
     */
    failure?: ConversationEntryFailureProps;
    /** Identity heading for the first activity in an agent turn. */
    activityAuthor?: ConversationAuthor;
    /** Identity id of the reader, so their own messages take the own treatment. */
    viewerId?: string;
    /**
     * A short standing fact about this message, printed under the author name:
     * where another person's message stands with respect to the agent's
     * context, for example. The owning surface supplies the finished sentence,
     * since only it knows what the message is and what became of it.
     */
    contextNote?: string;
    /** Consecutive entry from the same author: no avatar/author row. */
    grouped?: boolean;
    /** Answers a pending question request entry. */
    onRequestAnswer?: (requestId: string, answers: HappyAgentUserInputAnswerMap) => void;
    /** Options ticked into this question so far, when the owner keeps them. */
    requestSelection?: Readonly<Record<string, readonly string[]>>;
    /** Reports each tick to an owner that keeps the selection. */
    onRequestSelectionChange?: (requestId: string, answers: HappyAgentUserInputAnswerMap) => void;
    /** Approves or denies a pending gate request entry. */
    onRequestDecide?: (requestId: string, decision: ConversationRequestDecision) => void;
    /**
     * Resolves a durable attachment to a fetchable URL. Inline attachments carry
     * their own bytes and never need this.
     */
    attachmentUrl?: (fileId: string) => string;
    /** Opens an attached image full size. */
    onImageOpen?: (messageId: string, attachmentId: string) => void;
    /** Opens or downloads one linked attachment through the owning product surface. */
    onAttachmentOpen?: (attachment: ConversationLinkedAttachment) => void;
    /** Opens this entry's tool call in an owner-provided preview surface. */
    onToolSelect?: (entryId: string, tool: ConversationToolCall) => void;
    /** Opens one file this entry's tool call presented, by its media position. */
    onToolMediaOpen?: (entryId: string, tool: ConversationToolCall, index: number) => void;
    /**
     * This row's part in a run of calls whose pictures form one grid, from
     * `conversationMediaRuns`. Absent, a tool call draws its own pictures.
     */
    mediaRun?: ConversationMediaRun;
    /** This call's pictures a reply placed in its own layout, from `conversationInlineLayouts`. */
    mediaPlaced?: ReadonlySet<number>;
    /**
     * The layouts this reply draws among its text, from
     * `conversationInlineLayouts`; each picture opens as the item of the call
     * that showed it.
     */
    messageLayouts?: MessageInlineLayouts;
    /** Opens one child session represented by a delegated-agent entry. */
    onDelegationSelect?: (sessionId: string) => void;
    /** Reference epoch millis used by live delegated-agent timers. */
    now?: number;
    /** Opens a workspace file named by a tool call or linked from a message. */
    onFileOpen?: FileOpenHandler;
    /** Opens a file a `happy://` or `happy-file://` file link in a message names in another workspace. */
    onFileLinkOpen?: FileLinkOpenHandler;
    /** Opens a web link from a message where its context menu asked for it. */
    onLinkOpen?: LinkOpenHandler;
    /** Which of the two places a plain click on a link goes, marked in its menu. */
    linkOpenDefault?: LinkOpenPlacement;
    /** What the Happy references a message names read as, and where opening one goes. */
    references?: MessageReferences;
    /** The page this row's tool call shows inline, when its owner shows one. */
    inlinePage?: InlinePageProps;
    /** Disables request controls while a prior submission is in flight. */
    requestPending?: boolean;
    /** Last failed submission for this request. */
    requestError?: UserError;
    requestRetryAnswers?: Readonly<Record<string, readonly string[]>>;
    /** Renders rich activity bodies expanded from the first paint (blueprint/tests). */
    activityDefaultExpanded?: boolean;
    /** Controlled disclosure state for this transcript row. */
    rowExpanded?: boolean;
    /** Submitted human text may open below its ten-line preview. */
    messageExpanded?: boolean;
    /** Reports disclosure changes to the owning row-geometry model. */
    onRowExpandedChange?: (expanded: boolean) => void;
    /** Motion profile for live activity rows; see `AgentActivityRow`. */
    activityMotion?: ActivityMotion;
    /** Content/chrome policy for activity rows; independent of motion. */
    activityTreatment?: ActivityTreatment;
    /** Shows a caret at the end of a still-streaming reply body. */
    streamingCaret?: boolean;
    /** Shows or hides the intermediate entries of this message's finished turn. */
    onTraceToggle?: (turnId: string) => void;
    /** That turn's intermediate entries are currently listed. */
    traceOpen?: boolean;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

const NOTICE_ICON = { info: "dot", warning: "shield" } as const;

/**
 * Whether a turn has settled into something worth revealing. A running turn
 * lists its steps in the transcript and keeps its live readout on the
 * message-list footer, so no row of its own carries a control while it works.
 */
function traceSettled(trace: AgentTurnTraceSummary | undefined): boolean {
    return (
        trace !== undefined &&
        trace.status !== "pending" &&
        trace.status !== "running" &&
        trace.entryCount > 0
    );
}

/**
 * The compact "View traces" / "Hide traces" control for the row a settled turn
 * anchored it to. Which row that is belongs to product state — the answer when
 * the turn is folded up, its first row when it is open — so this only renders
 * whatever row was handed the summary.
 */
function traceControl(
    trace: AgentTurnTraceSummary | undefined,
    open: boolean | undefined,
    onToggle: ((turnId: string) => void) | undefined,
): ReactNode {
    if (!trace || !traceSettled(trace)) return undefined;
    return (
        <AgentTraceRow
            entryCount={trace.entryCount}
            foldsAway={trace.foldsAway === true}
            onOpen={onToggle ? () => onToggle(trace.turnId) : undefined}
            open={open}
            status={trace.status === "failed" ? "failed" : "complete"}
            toggles
            toolCallCount={trace.toolCallCount}
            totalTokens={trace.totalTokens}
            variant="meta"
        />
    );
}

/**
 * ConversationEntryView — renders one `ConversationEntry` through the shared
 * chat vocabulary: an authored message is a `Message`, agent activity is one
 * glanceable `AgentActivityRow`, a service line is a `SystemNotice`, a section
 * boundary is a `DayDivider`, and something waiting on the reader is its request
 * prompt. Both stacks render their conversations through this one component, so
 * neither grows a second message list.
 *
 * A running turn needs no status row of its own: its steps are listed in the
 * transcript as it works, and the surface keeps one minimal status line in the
 * message-list footer. Once the turn ends the steps fold away behind the
 * compact "View traces" link on the line that opened the turn.
 */
export function ConversationEntryView(props: ConversationEntryViewProps) {
    const rowWidth = useMessageListRowWidth();
    const textCache = useContext(MarkdownLayoutCacheContext);
    const entry = props.entry;
    if (entry.kind === "delegation") {
        /* A delegated child opens its turn the same way a tool call does, so it
           carries the identity header and the trace control when it is the
           first agent-owned row of the turn. */
        /* A quiet control waits for a header to ride: appended below, it
           would grow a row the reader is looking at. */
        const traceRow =
            entry.agentTrace?.quiet && !props.activityAuthor
                ? undefined
                : traceControl(entry.agentTrace, props.traceOpen, props.onTraceToggle);
        const activity = (
            <DelegatedAgentActivity
                child={entry.child}
                data-testid={props["data-testid"]}
                now={props.now}
                onSelect={props.onDelegationSelect}
            />
        );
        return props.activityAuthor ? (
            <Message
                agent
                author={props.activityAuthor.displayName}
                body=""
                className={["happy-message--activity-lead", props.className]
                    .filter(Boolean)
                    .join(" ")}
                initials={initialsOf(props.activityAuthor.displayName)}
                metaAccessory={traceRow}
                style={props.style}
                time={eventTime(entry.child.createdAt)}
            >
                {activity}
            </Message>
        ) : (
            <div
                className={[
                    "happy-delegated-agent-entry",
                    traceRow ? "happy-delegated-agent-entry--trace" : undefined,
                    props.className,
                ]
                    .filter(Boolean)
                    .join(" ")}
                style={props.style}
            >
                {activity}
                {traceRow}
            </div>
        );
    }
    if (entry.kind === "agentActivity") {
        const time = eventTime(entry.occurredAt);
        /* An expanded turn hangs its "Hide traces" control on the row it began
           with, which is this one when the agent reached for a tool before it
           said anything. The row's identity header is the only meta line it
           has, so the control rides there rather than opening a line of its
           own between the header and the work. */
        const leadTrace = traceControl(entry.agentTrace, props.traceOpen, props.onTraceToggle);
        const activity = (
            <AgentActivityRow
                activity={entry.activity}
                data-testid={props["data-testid"]}
                defaultExpanded={props.activityDefaultExpanded}
                expanded={props.rowExpanded}
                motion={props.activityMotion}
                onExpandedChange={props.onRowExpandedChange}
                treatment={props.activityTreatment}
                onToolSelect={
                    entry.activity.kind === "tool"
                        ? (tool) => props.onToolSelect?.(entry.id, tool)
                        : undefined
                }
                {...(props.onFileOpen ? { onFileOpen: props.onFileOpen } : {})}
                {...(props.onToolMediaOpen
                    ? {
                          onMediaOpen: (tool: ConversationToolCall, index: number) =>
                              props.onToolMediaOpen?.(entry.id, tool, index),
                      }
                    : {})}
                {...((run) => (run ? { mediaRun: run } : {}))(
                    activityMediaRun(props.mediaRun, props.onToolMediaOpen),
                )}
                {...(props.mediaPlaced ? { mediaPlaced: props.mediaPlaced } : {})}
                {...(props.references ? { references: props.references } : {})}
                {...(props.inlinePage ? { inlinePage: props.inlinePage } : {})}
                singleLine={entry.activity.kind === "tool"}
                time={
                    (entry.activity.kind === "tool" || entry.activity.kind === "agentMessage") &&
                    props.activityTreatment === "focused"
                        ? time
                        : props.activityAuthor
                          ? undefined
                          : time
                }
            />
        );
        return props.activityAuthor ? (
            <Message
                agent
                author={props.activityAuthor.displayName}
                body=""
                className={["happy-message--activity-lead", props.className]
                    .filter(Boolean)
                    .join(" ")}
                initials={initialsOf(props.activityAuthor.displayName)}
                metaAccessory={leadTrace}
                style={props.style}
                time={time}
            >
                {activity}
            </Message>
        ) : (
            <div className={props.className} style={props.style}>
                {activity}
            </div>
        );
    }
    if (entry.kind === "turnStatus") {
        const summary = (
            <TurnSummary
                className={
                    props.activityAuthor
                        ? "happy-conversation-turn-status"
                        : ["happy-conversation-turn-status", props.className]
                              .filter(Boolean)
                              .join(" ")
                }
                copyText={entry.copyText}
                data-testid={props["data-testid"]}
                durationMs={entry.durationMs}
                usedTokens={entry.usedTokens}
                finalContextTokens={entry.finalContextTokens}
                reason={entry.reason}
                status={entry.status}
                accessory={traceControl(entry.agentTrace, props.traceOpen, props.onTraceToggle)}
                {...(props.activityAuthor ? {} : { style: props.style })}
            />
        );
        /* A turn whose only visible history was hidden reasoning has nothing
           else to be attributed to, so its status carries the identity itself
           rather than closing a turn that appears to belong to no one. */
        return props.activityAuthor ? (
            <Message
                agent
                author={props.activityAuthor.displayName}
                body=""
                className={["happy-message--activity-lead", props.className]
                    .filter(Boolean)
                    .join(" ")}
                initials={initialsOf(props.activityAuthor.displayName)}
                style={props.style}
            >
                {summary}
            </Message>
        ) : (
            summary
        );
    }
    if (entry.kind === "notice") {
        /* Compute preparation is the runtime materializing the workspace, not
           the agent working: Happy Agent attributes it to every session running out of
           that directory, including ones with no turn in flight. So it takes no
           agent identity header — it is the session's own machine, reported in
           order among the rows it holds up. */
        if (entry.variant === "compute")
            return (
                <ConversationComputeEvent
                    className={props.className}
                    data-testid={props["data-testid"]}
                    defaultExpanded={props.activityDefaultExpanded}
                    expanded={props.rowExpanded}
                    {...(entry.elapsedMs === undefined ? {} : { elapsedMs: entry.elapsedMs })}
                    instanceId={entry.instanceId}
                    message={entry.message}
                    onExpandedChange={props.onRowExpandedChange}
                    {...(entry.percent === undefined ? {} : { percent: entry.percent })}
                    phase={entry.phase}
                    provider={entry.provider}
                    state={entry.state}
                    style={props.style}
                    text={entry.text}
                />
            );
        if (entry.variant === "divider")
            return <DayDivider className={props.className} label={entry.text} />;
        const notice =
            entry.failure !== undefined ? (
                <ConversationFailureCard
                    assistance={props.errorAssistance}
                    className={props.activityAuthor ? undefined : props.className}
                    {...(props.failure?.clock ? { clock: props.failure.clock } : {})}
                    current={props.failure?.current ?? false}
                    data-testid={props["data-testid"]}
                    failure={entry.failure}
                    onAssistanceRequest={
                        props.onErrorAssistanceRequest
                            ? () => props.onErrorAssistanceRequest!(entry.id)
                            : undefined
                    }
                    onNewChat={props.failure?.onNewChat}
                    onRetry={props.failure?.onRetry}
                    onSwitch={props.failure?.onSwitch}
                    onSwitchOpen={props.failure?.onSwitchOpen}
                    onTargetChange={props.failure?.onTargetChange}
                    style={props.activityAuthor ? undefined : props.style}
                    switchTargets={props.failure?.switchTargets}
                    target={props.failure?.target}
                    usageNow={props.failure?.usageNow}
                    {...(props.failure?.previewMenu
                        ? { previewMenu: props.failure.previewMenu }
                        : {})}
                />
            ) : entry.level === "error" || entry.retry !== undefined ? (
                <ConversationErrorCard
                    assistance={props.errorAssistance}
                    onAssistanceRequest={
                        props.onErrorAssistanceRequest
                            ? () => props.onErrorAssistanceRequest!(entry.id)
                            : undefined
                    }
                    className={props.activityAuthor ? undefined : props.className}
                    data-testid={props["data-testid"]}
                    reason={entry.text}
                    error={entry.error}
                    style={props.activityAuthor ? undefined : props.style}
                    title={conversationErrorTitle(entry)}
                    tone={entry.retry ? "warning" : "error"}
                />
            ) : (
                // The raw context belongs to the agent, not the transcript.
                // Readers only need to know that the daemon inserted something,
                // in the same compact one-line rhythm as a tool call.
                <SystemNotice
                    align="start"
                    className={props.activityAuthor ? undefined : props.className}
                    icon={NOTICE_ICON[entry.level]}
                    style={props.activityAuthor ? undefined : props.style}
                    text={
                        entry.variant === "configuration" ? entry.text : SYSTEM_NOTIFICATION_LABEL
                    }
                />
            );
        /* A turn can fail before it does anything else, and then these notices
           are the entire turn. They take the same identity header a tool-first
           turn takes, so a run that only failed still reads as the agent's work
           rather than as loose text in the transcript. */
        return props.activityAuthor ? (
            <Message
                agent
                author={props.activityAuthor.displayName}
                body=""
                className={["happy-message--activity-lead", props.className]
                    .filter(Boolean)
                    .join(" ")}
                initials={initialsOf(props.activityAuthor.displayName)}
                style={props.style}
            >
                {notice}
            </Message>
        ) : (
            notice
        );
    }
    if (entry.kind === "request") {
        const lead = props.activityAuthor !== undefined && entry.request.kind === "userInput";
        const request = (
            <ConversationRequestView
                className={lead ? undefined : props.className}
                data-testid={props["data-testid"]}
                defaultExpanded={props.activityDefaultExpanded}
                error={props.requestError}
                retryAnswers={props.requestRetryAnswers}
                expanded={props.rowExpanded}
                {...(props.onRequestAnswer ? { onAnswer: props.onRequestAnswer } : {})}
                {...(props.onRequestSelectionChange
                    ? { onSelectionChange: props.onRequestSelectionChange }
                    : {})}
                {...(props.requestSelection ? { selection: props.requestSelection } : {})}
                {...(props.onRequestDecide ? { onDecide: props.onRequestDecide } : {})}
                pending={props.requestPending}
                onExpandedChange={props.onRowExpandedChange}
                request={entry.request}
                {...(lead ? {} : { style: props.style })}
            />
        );
        /* An answered question the turn opens with carries the turn's identity,
           as a tool-first turn's first call does. */
        return lead && props.activityAuthor ? (
            <Message
                agent
                author={props.activityAuthor.displayName}
                body=""
                className={["happy-message--activity-lead", props.className]
                    .filter(Boolean)
                    .join(" ")}
                initials={initialsOf(props.activityAuthor.displayName)}
                style={props.style}
            >
                {request}
            </Message>
        ) : (
            request
        );
    }
    if (entry.kind === "summary")
        return (
            <div
                className={["happy-conversation-summary-entry", props.className]
                    .filter(Boolean)
                    .join(" ")}
                data-testid={props["data-testid"]}
                style={props.style}
            >
                <ConversationSummaryRow
                    details={entry.details}
                    expanded={props.rowExpanded ?? false}
                    kind="batch"
                    label={entry.label}
                    onExpandedChange={props.onRowExpandedChange}
                />
            </div>
        );

    const message = entry.message;
    const author = message.sender;
    const own = author !== undefined && author.id === props.viewerId;
    const images = imagesOf(message.attachments);
    const linked = message.attachments.filter(
        (attachment): attachment is ConversationLinkedAttachment =>
            attachment.kind === "linked" &&
            (attachment.attachmentKind !== "image" || attachment.openUrl === undefined),
    );
    const trace = message.agentTrace;
    const traceCollapsible = traceSettled(trace);
    /* A grouped row has no header to carry a quiet control in. */
    const traceRow =
        trace?.quiet && props.grouped
            ? undefined
            : traceControl(trace, props.traceOpen, props.onTraceToggle);
    const compact =
        rowWidth === undefined
            ? undefined
            : conversationMessageCompactLayout(
                  entry,
                  props.grouped === true,
                  {
                      width: rowWidth,
                      surface: "conversation",
                      viewerId: props.viewerId,
                      references: props.references,
                      messageExpanded: props.messageExpanded,
                  },
                  textCache,
              );
    return (
        <Message
            agent={author?.kind === "agent"}
            author={author?.displayName ?? "Unknown"}
            imageUrl={
                author?.imageUrl ??
                (author?.avatar ? thumbhashDataUrl(author.avatar.thumbhash) : undefined)
            }
            body={props.messageLayouts?.text ?? message.text}
            bodyFormat={messageBodyFormat(author)}
            {...(compact
                ? {
                      bodyFold: {
                          ...compact,
                          onExpandedChange: (expanded: boolean) =>
                              props.onRowExpandedChange?.(expanded),
                      },
                  }
                : {})}
            {...(props.messageLayouts
                ? { layoutRender: messageLayoutRender(props.messageLayouts, props.onToolMediaOpen) }
                : {})}
            className={props.className}
            {...(props.contextNote === undefined ? {} : { contextNote: props.contextNote })}
            data-testid={props["data-testid"]}
            deliveryState={entry.delivery}
            emptyText={
                traceCollapsible && props.traceOpen !== true && message.text.trim().length === 0
                    ? "(no text)"
                    : undefined
            }
            // The sibling error card owns failed-turn presentation. Rendering
            // settled text as complete prevents a duplicate red end marker.
            generationStatus={
                message.generationStatus === "failed" ? "complete" : message.generationStatus
            }
            {...(props.streamingCaret === undefined
                ? {}
                : { streamingCaret: props.streamingCaret })}
            grouped={props.grouped}
            initials={initialsOf(author?.displayName)}
            metaAccessory={traceRow}
            images={images.length > 0 ? [...images] : undefined}
            onImageOpen={
                props.onImageOpen
                    ? (imageId: string) => props.onImageOpen?.(message.id, imageId)
                    : undefined
            }
            {...(props.onFileOpen ? { onFileOpen: props.onFileOpen } : {})}
            {...(props.onFileLinkOpen ? { onFileLinkOpen: props.onFileLinkOpen } : {})}
            {...(props.onLinkOpen ? { onLinkOpen: props.onLinkOpen } : {})}
            {...(props.linkOpenDefault ? { linkOpenDefault: props.linkOpenDefault } : {})}
            {...(props.references ? { references: props.references } : {})}
            own={own}
            style={props.style}
            time={messageTime(message.createdAt)}
        >
            {linked.map((attachment) => (
                <FileAttachment
                    aria-label={`Open ${attachment.name}`}
                    key={attachment.id}
                    kind={linkedAttachmentFileKind(attachment.attachmentKind)}
                    name={attachment.name}
                    onOpen={
                        props.onAttachmentOpen
                            ? () => props.onAttachmentOpen?.(attachment)
                            : undefined
                    }
                    size={
                        attachment.bytes === undefined
                            ? attachment.description
                            : fileSizeFormat(attachment.bytes)
                    }
                    thumbnailPlaceholderUrl={
                        attachment.thumbhash ? thumbhashDataUrl(attachment.thumbhash) : undefined
                    }
                    thumbnailUrl={attachment.thumbnailUrl}
                    variant="chat"
                />
            ))}
        </Message>
    );
}

/**
 * Projects message attachments into the renderable image list. Inline images
 * carry their bytes, so they become data URLs directly; a durable file needs the
 * owner to resolve a URL and is skipped when it cannot.
 */
function imagesOf(attachments: readonly ConversationAttachment[]): readonly MessageImage[] {
    const images: MessageImage[] = [];
    for (const attachment of attachments) {
        if (attachment.kind === "inlineImage") {
            images.push({
                id: attachment.id,
                url: `data:${attachment.mediaType};base64,${attachment.data}`,
                alt: "Attached image",
                ...(attachment.width !== undefined ? { width: attachment.width } : {}),
                ...(attachment.height !== undefined ? { height: attachment.height } : {}),
            });
            continue;
        }
        if (attachment.kind === "linked") {
            if (attachment.attachmentKind !== "image" || !attachment.openUrl) continue;
            images.push({
                id: attachment.id,
                url: attachment.openUrl,
                alt: attachment.name,
                ...(attachment.thumbhash
                    ? {
                          placeholderUrl: thumbhashDataUrl(attachment.thumbhash),
                          thumbhash: attachment.thumbhash,
                      }
                    : {}),
                ...(attachment.width !== undefined ? { width: attachment.width } : {}),
                ...(attachment.height !== undefined ? { height: attachment.height } : {}),
            });
            continue;
        }
    }
    return images;
}

function linkedAttachmentFileKind(
    kind: ConversationLinkedAttachment["attachmentKind"],
): FileAttachmentKind {
    if (kind === "audio" || kind === "video") return kind;
    if (kind === "image") return "photo";
    return "file";
}

function fileSizeFormat(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 102.4) / 10)} KB`;
    return `${String(Math.round(bytes / (102.4 * 1024)) / 10)} MB`;
}

/**
 * The clock every transcript row is stamped with. Building one of these is the
 * expensive part of formatting a time, and every row in view rebuilt two of them
 * on every frame of a live turn, so the formatter is made once and the rows
 * share it. `conversationRowHeight` keeps its own copy of this same shape, and
 * the two must stay identical or a row is measured against a width it does not
 * print.
 */
const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
});

function messageTime(value: string): string | undefined {
    if (value.trim().length === 0) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return MESSAGE_TIME_FORMATTER.format(date);
}

function eventTime(value: number | undefined): string | undefined {
    if (value === undefined || !Number.isFinite(value)) return undefined;
    return MESSAGE_TIME_FORMATTER.format(value);
}

function initialsOf(displayName: string | undefined): string {
    if (!displayName || displayName.length === 0) return "?";
    const parts = displayName.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "?";
    const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    return `${first}${second}`.toUpperCase();
}

/**
 * A row's part in a picture run, as its activity row draws it: the run's
 * pictures, each opening as the item of the call it belongs to, so the viewer
 * steps through the whole transcript from there.
 */
function activityMediaRun(
    run: ConversationMediaRun | undefined,
    open: ConversationEntryViewProps["onToolMediaOpen"],
): AgentActivityMediaRun | undefined {
    if (run === undefined || run.type === "deferred") return run;
    return {
        type: "end",
        columns: run.columns,
        items: run.members.map((member) => member.item),
        ...(open
            ? {
                  onItemOpen: (position: number) => {
                      const member = run.members[position];
                      if (member) open(member.entryId, member.tool, member.index);
                  },
              }
            : {}),
    };
}

/**
 * Draws a reply's layout by its placeholder's key: the tree over the pictures
 * it placed, uncapped, each opening as the item of the call that showed it so
 * the viewer steps through the whole transcript from there.
 */
function messageLayoutRender(
    layouts: MessageInlineLayouts,
    open: ConversationEntryViewProps["onToolMediaOpen"],
) {
    return function messageLayout(key: string): ReactNode {
        const layout = layouts.layouts.get(key);
        if (layout === undefined) return null;
        return (
            <ConversationMedia
                items={layout.members.map((member) => member.item)}
                layout={{ type: "tree", root: layout.root }}
                {...(open
                    ? {
                          onItemOpen: (position: number) => {
                              const member = layout.members[position];
                              if (member) open(member.entryId, member.tool, member.index);
                          },
                      }
                    : {})}
            />
        );
    };
}
