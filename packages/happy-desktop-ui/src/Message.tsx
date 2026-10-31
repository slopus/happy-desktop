import { partitionComponentProps } from "./componentProps";
import type { FileLinkOpenHandler, FileOpenHandler } from "./fileReference";
import {
    observeElementOffset,
    useVirtualizer,
    type Range,
    type Virtualizer,
} from "@tanstack/react-virtual";
import {
    Children,
    Fragment,
    isValidElement,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type HTMLAttributes,
    type Key,
    type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Avatar, type AvatarSize, type ToneName } from "./Avatar";
import { happyLogoBlackUrl } from "./assets";
import { AutomatedTag } from "./AutomatedTag";
import { ReactionChip } from "./Badge";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import {
    MESSAGE_MEDIA_LIMITS,
    MESSAGE_MEDIA_MAX,
    MESSAGE_MEDIA_MAX_WIDTH,
    mediaJustifiedPlan,
} from "./mediaLayout";
import { MediaFlow } from "./MediaFlow";
import { messagePlainTextNormalize, type MessageBodyFormat } from "./messagePlainText";
import { messagePlainTextSegments, type MessageReferences } from "./messageReferences";
import {
    MessageListDisclosureAnchorProvider,
    type MessageListDisclosureAnchor,
} from "./messageListDisclosureAnchor";
import { messageListRowHeightCheckRef } from "./messageListRowHeightCheck";
import {
    markdownTablesSolve,
    MessageReferenceLink,
    renderMessageMarkdown,
    type LinkOpenHandler,
    type LinkOpenPlacement,
    type MessageGenerationStatus,
    type MessageLayoutRender,
} from "./MessageMarkdown";
import { ScrollArea } from "./Scrollbar";
import { ShimmerText } from "./ShimmerText";
import { AgentTraceRow } from "./AgentTraceRow";
import { MessageListRowWidthContext } from "./messageListRowWidth";
export type MessageSegment =
    | {
          kind: "text";
          text: string;
      }
    | {
          kind: "mention";
          text: string;
      }
    | {
          kind: "code";
          text: string;
      }
    | {
          kind: "link";
          text: string;
      };
export type MessageReaction = {
    active?: boolean;
    count: number;
    emoji: string;
};
export type MessageImage = {
    id: string;
    url: string;
    /** Tiny decoded ThumbHash shown while the attachment preview downloads. */
    placeholderUrl?: string;
    alt?: string;
    /** Intrinsic pixel dimensions — reserve a stable box before the image loads. */
    width?: number;
    height?: number;
    /** The attachment's ThumbHash, whose header gives the shape when the dimensions are absent. */
    thumbhash?: string;
};

/**
 * One image tile at its box in the message's photo flow: the box `MediaFlow`
 * sizes from every photo's own shape, so the layout is reserved up front and
 * nothing reflows when the bytes arrive — and the transcript's virtualizer,
 * which reserves the row from the same plan, agrees with it. Without an open
 * action it remains media, not a fake button.
 */
function MessageMediaItem(props: {
    image: MessageImage;
    style: CSSProperties;
    onOpen?: (id: string) => void;
}) {
    const content = props.image.url ? (
        <img
            alt={props.image.alt ?? ""}
            className="happy-message__media-image"
            data-happy-desktop-ui="message-media-image"
            draggable={false}
            height={props.image.height}
            loading="lazy"
            src={props.image.url}
            width={props.image.width}
        />
    ) : (
        <span
            aria-label={`Loading ${props.image.alt ?? "image"}`}
            className="happy-message__media-loading"
            data-happy-desktop-ui="message-media-loading"
            role="status"
            style={
                props.image.placeholderUrl
                    ? { backgroundImage: `url(${props.image.placeholderUrl})` }
                    : undefined
            }
        />
    );
    const shared = {
        className: "happy-message__media-item",
        "data-fixed": "",
        "data-media-id": props.image.id,
        "data-happy-desktop-ui": "message-media-item",
        style: props.style,
    } as const;
    return props.onOpen ? (
        <button
            {...shared}
            aria-label={props.image.alt ? `Open ${props.image.alt}` : "Open image"}
            data-interactive=""
            onClick={() => props.onOpen?.(props.image.id)}
            type="button"
        >
            {content}
        </button>
    ) : (
        <div {...shared}>{content}</div>
    );
}
export type MessageDeliveryState = "failed" | "pending_steering" | "sending" | "sent";
export type MessageProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    /** Author is an agent → accent AGENT badge next to the name. */
    agent?: boolean;
    /**
     * The message was posted through automation (a plugin/API acting on the
     * author's behalf) rather than typed by hand. Shows a restrained "Automated"
     * marker beside the author. This is orthogonal to `agent`: an automated
     * message is still attributed to its human author and keeps their identity —
     * it is not the separate agent/system identity treatment.
     */
    automated?: boolean;
    /** Who the message addressed, e.g. "To agents · Happy + 1". */
    audienceLabel?: string;
    /**
     * A short standing fact about this incoming message, printed as a quiet
     * second line under the author name — where another person's message stands
     * with respect to the agent's context, for example. It is display text chosen by
     * the producer, never a state name, and a message with nothing to say about
     * itself simply omits it. An own message has no author line, so it never
     * carries one.
     */
    contextNote?: string;
    /** Compact optional action placed in the author metadata before the time. */
    metaAccessory?: ReactNode;
    author: string;
    body: string | MessageSegment[];
    /** Format of a string body. Human messages use plain text. */
    bodyFormat?: MessageBodyFormat;
    /** Modeled preview geometry for a submitted human message. */
    bodyFold?: {
        readonly previewHeight: number;
        readonly expanded: boolean;
        readonly onExpandedChange: (expanded: boolean) => void;
    };
    /** Attachment cards (runs, approvals, events) rendered below the body. */
    children?: ReactNode;
    /** Follow-up message: no avatar/author row, time sits in the gutter. */
    compact?: boolean;
    /** Delivery styling that never inserts or removes layout. */
    deliveryState?: MessageDeliveryState;
    /**
     * Readable fallback for an intentionally empty message summary. Owners use
     * this for collapsed tool-only turns; expanded identity headers leave it off.
     */
    emptyText?: string;
    /** Agent reply generation lifecycle for a string body. Separate from
     * `deliveryState`: delivery is outgoing, generation is the incoming reply
     * being produced. `streaming` marks a body still arriving; `failed` shows a
     * minimal marker. */
    generationStatus?: MessageGenerationStatus;
    /**
     * A caret riding the end of a `streaming` body, matching the typing caret
     * activity labels wear. Off by default: showing it is a surface-wide
     * choice the conversation surface makes, not a per-message one.
     */
    streamingCaret?: boolean;
    /** Consecutive message from the same author. Preferred over `compact`. */
    grouped?: boolean;
    /** Compact time for the grouped gutter (e.g. "12:55") so a wide 12-hour
     * "12:55 AM" — fine inline on the first message — still fits the 36px gutter.
     * Defaults to `time`. */
    gutterTime?: string;
    imageUrl?: string;
    /** Unframed entity artwork, shared with its sidebar row and tab. */
    imageMark?: { src: string; srcSet?: string; alt?: string };
    /** Inline photo attachments rendered as a clickable thumbnail grid. */
    images?: MessageImage[];
    /** Opens an image (by id) — wire to a web-modal lightbox, never a new tab. */
    onImageOpen?: (id: string) => void;
    /**
     * Draws a layout the reply placed among its text, by the key its
     * placeholder block names. Absent, placeholders draw nothing.
     */
    layoutRender?: MessageLayoutRender;
    /**
     * Opens a workspace file this message links to, in the product's own file
     * viewer. Absent leaves such links inert, which is what a surface with no
     * workspace behind it can honestly offer.
     */
    onFileOpen?: FileOpenHandler;
    /**
     * Opens a file a `happy://` or `happy-file://` file link in this message names in another
     * agent's or workspace's folder. Absent leaves such links inert.
     */
    onFileLinkOpen?: FileLinkOpenHandler;
    /**
     * Opens a web link this message carries where the reader asked for it —
     * the machine's browser or the side panel — from the link's context menu.
     * Absent leaves a link as it is: a plain click that goes where the host
     * sends it, with no menu offered.
     */
    onLinkOpen?: LinkOpenHandler;
    /** Which of the two places a plain click on a link goes, marked in its menu. */
    linkOpenDefault?: LinkOpenPlacement;
    /**
     * What the Happy references in a Markdown body read as, and where opening
     * one goes. Absent, each reference reads as inert placeholder text.
     */
    references?: MessageReferences;
    /** Makes the avatar and author name clickable to open the author's profile.
     *  Only the leading message of a group renders an avatar/name, so grouped
     *  follow-ups intentionally carry no profile affordance. */
    onAuthorSelect?: () => void;
    initials?: string;
    /** Selects one of the existing reaction chips rendered below the message. */
    onReactionSelect?: (emoji: string) => void;
    /**
     * The viewer's own outgoing message. Renders as a right-aligned accent
     * bubble with no avatar and no author name — only humans send, so an `own`
     * message is never also an `agent`. Incoming human messages (neither flag)
     * render as a left neutral bubble; agents render on the surface unbubbled.
     */
    own?: boolean;
    reactions?: MessageReaction[];
    style?: CSSProperties;
    /**
     * Rendered send time. Optional because a producer may genuinely have none
     * (a local agent transcript is ordered, not timestamped); the meta and
     * gutter slots keep their boxes either way so no layout shifts.
     */
    time?: string;
    tone?: ToneName;
};
function deriveInitials(author: string) {
    return author
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0] ?? "")
        .join("")
        .toUpperCase();
}
function renderSegment(segment: MessageSegment): ReactNode {
    switch (segment.kind) {
        case "mention":
            return (
                <span className="happy-message__mention" data-happy-desktop-ui="message-mention">
                    @{segment.text}
                </span>
            );
        case "code":
            return (
                <code className="happy-message__code" data-happy-desktop-ui="message-code">
                    {segment.text}
                </code>
            );
        case "link":
            return (
                <span className="happy-message__link" data-happy-desktop-ui="message-link">
                    {segment.text}
                </span>
            );
        default:
            return segment.text;
    }
}
function hasRenderableChild(value: ReactNode): boolean {
    if (Array.isArray(value)) return value.some(hasRenderableChild);
    return (
        value !== undefined && value !== null && value !== false && value !== true && value !== ""
    );
}
/**
 * One chat message on the app surface: a compact inline identity, author/time row,
 * rich body segments, attachment slot, reactions, and reply affordance.
 */
/**
 * Edge of the mark in the identity gutter. An `Avatar` is shrunk to this by
 * `.happy-message__avatar-dangling` in `message.css`; a generated mark carries
 * its size inline, where a stylesheet cannot reach it, so it is stated here and
 * the two must stay equal or the gutter's marks will not match.
 */
const GUTTER_MARK_PIXELS = 12;

/**
 * Literal text with the same 16px/24px body type as agent paragraphs. A Happy
 * reference in it reads as what it names, as a link when it can be opened;
 * everything else is exactly as typed.
 */
function renderMessagePlainText(
    source: string,
    trailing: ReactNode,
    references: MessageReferences | undefined,
): ReactNode {
    const text = messagePlainTextNormalize(source);
    if (text.length === 0) return null;
    return (
        <p className="happy-message__plain-text" data-happy-desktop-ui="message-plain-text">
            {!/happy/iu.test(text)
                ? text
                : messagePlainTextSegments(text, references).map((segment, index) =>
                      segment.type === "text" ? (
                          // The runs of one body never move, so their order is their identity.
                          <Fragment key={index}>{segment.text}</Fragment>
                      ) : references === undefined ? (
                          <Fragment key={index}>{segment.label}</Fragment>
                      ) : (
                          <MessageReferenceLink
                              href={segment.href}
                              key={index}
                              reference={segment.reference}
                              references={references}
                          >
                              {segment.label}
                          </MessageReferenceLink>
                      ),
                  )}
            {trailing === null || trailing === undefined ? null : (
                <>
                    {"\u00a0"}
                    {trailing}
                </>
            )}
        </p>
    );
}

export function Message(props: MessageProps) {
    const [local, rest] = partitionComponentProps(props, [
        "agent",
        "audienceLabel",
        "automated",
        "author",
        "body",
        "bodyFormat",
        "bodyFold",
        "children",
        "className",
        "compact",
        "contextNote",
        "deliveryState",
        "emptyText",
        "generationStatus",
        "streamingCaret",
        "grouped",
        "gutterTime",
        "imageUrl",
        "imageMark",
        "images",
        "onImageOpen",
        "layoutRender",
        "onFileOpen",
        "onFileLinkOpen",
        "onLinkOpen",
        "linkOpenDefault",
        "references",
        "initials",
        "metaAccessory",
        "onAuthorSelect",
        "onReactionSelect",
        "own",
        "reactions",
        "style",
        "time",
        "tone",
    ]);
    const attachments = local.children;
    const body = useRef<HTMLDivElement>(null);
    const generationMarker = useRef<HTMLSpanElement>(null);
    const segments = (): MessageSegment[] =>
        typeof local.body === "string" ? [{ kind: "text", text: local.body }] : local.body;
    const isStringBody = () => typeof local.body === "string";
    const plainBody = () => local.bodyFormat === "plain";
    const hasAttachments = () => hasRenderableChild(attachments);
    const grouped = () => local.grouped || local.compact;
    const showIncomingIdentity = () => !local.own && !grouped();
    /* The leading incoming message owns the author line. Grouped follow-ups keep
       their hover metadata inline after the body instead of repeating identity. */
    const showIncomingMeta = () => !local.own && !grouped();
    const authorActionLabel = () => `View ${local.author}’s profile`;
    const happyAgent = () => local.agent && local.author.trim().toLocaleLowerCase() === "happy";
    const renderAvatar = (size: AvatarSize) =>
        local.imageMark ? (
            <img
                alt={local.imageMark.alt ?? ""}
                className="happy-message__image-mark"
                src={local.imageMark.src}
                srcSet={local.imageMark.srcSet}
            />
        ) : (
            <Avatar
                imageTheme={happyAgent() ? "brand" : undefined}
                imageUrl={happyAgent() ? happyLogoBlackUrl : local.imageUrl}
                initials={local.initials ?? deriveInitials(local.author)}
                size={size}
                tone={local.tone}
                type={local.agent ? "agent" : "human"}
            />
        );
    const renderDanglingAvatar = () =>
        local.onAuthorSelect ? (
            <button
                aria-label={authorActionLabel()}
                className="happy-message__identity happy-message__avatar-dangling"
                data-happy-desktop-ui="message-identity"
                onClick={() => local.onAuthorSelect?.()}
                type="button"
            >
                {renderAvatar("xs")}
            </button>
        ) : (
            <span className="happy-message__avatar-dangling">{renderAvatar("xs")}</span>
        );
    const deliveryState = () => local.deliveryState ?? "sent";
    /* A failed-generation marker is painted at the end of the final rendered
       text run. It stays absolutely positioned so settling cannot alter the
       message's flow geometry. Streaming itself has no typing marker. */
    // eslint-disable-next-line happy-react/no-layout-effect -- the failure marker must measure the committed final text range and write its absolute DOM position without changing message flow
    useLayoutEffect(() => {
        const bodyElement = body.current;
        const marker = generationMarker.current;
        if (!bodyElement || !marker) return;
        markdownTablesSolve();
        const position = () => {
            const textNodes = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
            let textRect: DOMRect | undefined;
            for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
                const text = node as Text;
                if (!text.textContent?.trim()) continue;
                const range = document.createRange();
                range.setStart(text, Math.max(0, text.length - 1));
                range.setEnd(text, text.length);
                const rects = range.getClientRects();
                const finalRect = rects.item(rects.length - 1);
                if (finalRect) textRect = finalRect;
            }
            if (!textRect) {
                marker.style.transform = "translate(0px, 0px)";
                marker.style.visibility = "visible";
                return;
            }
            const bodyRect = bodyElement.getBoundingClientRect();
            marker.style.transform = `translate(${textRect.right - bodyRect.left}px, ${
                textRect.top - bodyRect.top
            }px)`;
            marker.style.visibility = "visible";
        };
        position();
        const observer = new ResizeObserver(position);
        observer.observe(bodyElement);
        return () => observer.disconnect();
    }, [local.body, local.generationStatus]);
    /* Automation attribution belongs to the message, so on an own message it
       opens the bubble instead of floating beside it: the reader sees that a
       plugin posted this before reading a word of it. It never depends on hover
       for the same reason. */
    const ownAutomatedLine =
        local.own && local.automated ? (
            <span
                className="happy-message__automated happy-message__automated--own"
                data-happy-desktop-ui="message-automated"
            >
                <AutomatedTag />
            </span>
        ) : null;
    const renderIncomingHoverMeta = (placement: "header" | "inline", leadingSeparator = false) =>
        !local.own && (local.metaAccessory || local.time) ? (
            <span
                className="happy-message__hover-meta"
                data-happy-desktop-ui="message-hover-meta"
                data-has-accessory={local.metaAccessory ? "" : undefined}
                data-placement={placement}
            >
                {leadingSeparator ? (
                    <span
                        aria-hidden="true"
                        className="happy-message__meta-separator"
                        data-happy-desktop-ui="message-meta-separator"
                    />
                ) : null}
                {local.metaAccessory ? (
                    <span
                        className="happy-message__meta-accessory"
                        data-happy-desktop-ui="message-meta-accessory"
                    >
                        {local.metaAccessory}
                    </span>
                ) : null}
                {local.metaAccessory && local.time ? (
                    <span
                        aria-hidden="true"
                        className="happy-message__meta-separator"
                        data-happy-desktop-ui="message-meta-separator"
                    />
                ) : null}
                {local.time ? (
                    <span className="happy-message__time" data-happy-desktop-ui="message-time">
                        <span data-happy-desktop-ui="message-time-label">{local.time}</span>
                    </span>
                ) : null}
            </span>
        ) : null;
    const inlineIncomingHoverMeta = showIncomingIdentity()
        ? null
        : renderIncomingHoverMeta("inline");
    const bodyNode =
        !local.body &&
        local.emptyText === undefined &&
        local.generationStatus === undefined ? null : isStringBody() ? (
            <div
                className={
                    plainBody()
                        ? "happy-message__body happy-message__body--plain"
                        : "happy-message__body happy-message__body--markdown"
                }
                data-markdown={plainBody() ? undefined : ""}
                data-body-fold={
                    local.bodyFold?.expanded === false
                        ? "closed"
                        : local.bodyFold
                          ? "open"
                          : undefined
                }
                style={
                    local.bodyFold?.expanded === false
                        ? ({
                              "--message-preview-height": `${local.bodyFold.previewHeight}px`,
                          } as CSSProperties)
                        : undefined
                }
                data-happy-desktop-ui="message-body"
                ref={body}
            >
                {ownAutomatedLine}
                {typeof local.body === "string" && plainBody()
                    ? renderMessagePlainText(local.body, inlineIncomingHoverMeta, local.references)
                    : typeof local.body === "string"
                      ? renderMessageMarkdown(
                            local.body,
                            inlineIncomingHoverMeta ?? undefined,
                            local.onFileOpen,
                            local.generationStatus,
                            local.onLinkOpen,
                            local.linkOpenDefault,
                            local.references,
                            local.onFileLinkOpen,
                            local.layoutRender,
                        )
                      : null}
                {local.bodyFold ? (
                    <AgentTraceRow
                        entryCount={0}
                        status="complete"
                        variant="meta"
                        toggles
                        open={local.bodyFold.expanded}
                        toggleLabels={{ closed: "Show full", open: "Show less" }}
                        disclosureHold={
                            local.bodyFold.expanded ? "row-start-or-control" : "row-start"
                        }
                        onOpen={() => local.bodyFold?.onExpandedChange(!local.bodyFold.expanded)}
                    />
                ) : null}
                {/* An empty generated reply keeps a non-breaking-space line box
                    so generation-state changes cannot collapse the message row. */}
                {!local.body && local.emptyText !== undefined ? (
                    <p
                        className="happy-message__empty-text"
                        data-happy-desktop-ui="message-empty-text"
                    >
                        {local.emptyText}
                    </p>
                ) : !local.body && local.generationStatus !== undefined ? (
                    <p aria-hidden="true" className="happy-message__generation-anchor">
                        {"\u00a0"}
                    </p>
                ) : null}
                {local.generationStatus === "failed" ? (
                    <span
                        aria-label="Generation failed"
                        className="happy-message__generation-marker"
                        data-empty={!local.body ? "" : undefined}
                        data-generation-marker="failed"
                        data-happy-desktop-ui="message-generation-failed"
                        ref={generationMarker}
                        role="img"
                    />
                ) : null}
            </div>
        ) : (
            <div className="happy-message__body" data-happy-desktop-ui="message-body">
                {ownAutomatedLine}
                {segments().map((segment, index) => (
                    <span key={`${segment.kind}-${index}`}>{renderSegment(segment)}</span>
                ))}
                {inlineIncomingHoverMeta ? (
                    <>
                        {"\u00a0"}
                        {inlineIncomingHoverMeta}
                    </>
                ) : null}
            </div>
        );
    // An own attachment/image-only automated message still needs the durable
    // attribution marker. Normal media remains flush: this line exists only
    // when automation requires it, never for ordinary media-only messages.
    const ownBubbleLine =
        local.own &&
        (bodyNode !== null ||
            (local.automated && (Boolean(local.images?.length) || hasAttachments())));
    const shownImages = local.images?.slice(0, MESSAGE_MEDIA_MAX) ?? [];
    const mediaPlan = mediaJustifiedPlan(shownImages, MESSAGE_MEDIA_LIMITS);
    const groupedIncomingLine =
        !local.own && grouped() && bodyNode !== null ? (
            <div
                className="happy-message__incoming-line"
                data-happy-desktop-ui="message-incoming-line"
            >
                {bodyNode}
            </div>
        ) : null;
    const incomingMeta = showIncomingMeta() ? (
        <div className="happy-message__meta" data-happy-desktop-ui="message-meta">
            {!showIncomingIdentity() ? null : local.onAuthorSelect ? (
                <button
                    aria-label={authorActionLabel()}
                    className="happy-message__author happy-message__author--button"
                    data-happy-desktop-ui="message-author"
                    onClick={() => local.onAuthorSelect?.()}
                    type="button"
                >
                    <span data-happy-desktop-ui="message-author-label">{local.author}</span>
                </button>
            ) : (
                <span className="happy-message__author" data-happy-desktop-ui="message-author">
                    <span data-happy-desktop-ui="message-author-label">{local.author}</span>
                </span>
            )}
            {local.automated && showIncomingIdentity() ? (
                <>
                    <span
                        aria-hidden="true"
                        className="happy-message__meta-separator"
                        data-happy-desktop-ui="message-meta-separator"
                    />
                    <span
                        className="happy-message__automated"
                        data-happy-desktop-ui="message-automated"
                    >
                        <AutomatedTag />
                    </span>
                </>
            ) : null}
            {showIncomingIdentity() && (local.metaAccessory || local.time)
                ? renderIncomingHoverMeta("header", true)
                : null}
        </div>
    ) : null;
    return (
        <div
            {...rest}
            className={["happy-message", local.className].filter(Boolean).join(" ")}
            data-agent={local.agent ? "" : undefined}
            data-own={local.own ? "" : undefined}
            data-compact={grouped() ? "" : undefined}
            data-delivery-state={deliveryState()}
            data-generation-status={local.generationStatus}
            data-streaming-caret={
                local.streamingCaret && local.generationStatus === "streaming" ? "" : undefined
            }
            data-grouped={grouped() ? "" : undefined}
            data-has-body={local.body || local.emptyText !== undefined ? "" : undefined}
            data-happy-desktop-ui="message"
            aria-busy={
                deliveryState() === "sending" ||
                deliveryState() === "pending_steering" ||
                local.generationStatus === "streaming"
                    ? "true"
                    : undefined
            }
            style={local.style}
        >
            <div className="happy-message__gutter" data-happy-desktop-ui="message-gutter">
                {showIncomingIdentity() ? renderDanglingAvatar() : null}
            </div>
            <div className="happy-message__content" data-happy-desktop-ui="message-content">
                {/* Own messages carry no meta row — the accent bubble on the
                    right is identity enough; no author, time, or audience pill. */}
                {incomingMeta}
                {/* A standing fact about the message belongs under the name it
                    is a fact about, not inside the hover metadata: it is read
                    before the body, once, and it does not appear and disappear
                    with the pointer. */}
                {showIncomingIdentity() && local.contextNote ? (
                    <span
                        className="happy-message__context-note"
                        data-happy-desktop-ui="message-context-note"
                    >
                        {local.contextNote}
                    </span>
                ) : null}
                {ownBubbleLine ? (
                    <div
                        className="happy-message__bubble-line"
                        data-happy-desktop-ui="message-bubble-line"
                    >
                        {/* A media-only automated message has no bubble to open, so
                            its marker rides the bubble line beside the hover time
                            instead. It stays visible either way. */}
                        {local.automated && bodyNode === null ? (
                            <span
                                className="happy-message__automated happy-message__automated--own"
                                data-happy-desktop-ui="message-automated"
                            >
                                <AutomatedTag />
                            </span>
                        ) : null}
                        <span
                            className="happy-message__aside-time"
                            data-happy-desktop-ui="message-aside-time"
                        >
                            {local.gutterTime ?? local.time ?? ""}
                        </span>
                        {bodyNode}
                    </div>
                ) : (
                    (groupedIncomingLine ?? bodyNode)
                )}
                {shownImages.length > 0 ? (
                    <MediaFlow
                        align={local.own ? "end" : "start"}
                        className="happy-message__media"
                        maxWidth={MESSAGE_MEDIA_MAX_WIDTH}
                        plan={mediaPlan}
                        renderTile={(position, style) => (
                            <MessageMediaItem
                                image={shownImages[position]!}
                                key={shownImages[position]!.id}
                                onOpen={local.onImageOpen}
                                style={style}
                            />
                        )}
                    />
                ) : null}
                {hasAttachments() ? (
                    <div
                        className="happy-message__attachments"
                        data-happy-desktop-ui="message-attachments"
                    >
                        {attachments}
                    </div>
                ) : null}
                {local.reactions && local.reactions.length > 0 ? (
                    <div
                        className="happy-message__reactions"
                        data-happy-desktop-ui="message-reactions"
                    >
                        {local.reactions.map((reaction, index) => (
                            <ReactionChip
                                active={reaction.active}
                                count={reaction.count}
                                emoji={reaction.emoji}
                                onSelect={() => local.onReactionSelect?.(reaction.emoji)}
                                key={`${reaction.emoji}-${index}`}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
export type MessageListProps = {
    children: ReactNode;
    className?: string;
    /**
     * A row at the start of the list's content, above the oldest message. Like
     * the footer it is part of the virtualized row collection with a reserved
     * stable key, so it scrolls, anchors, and reconciles as the transcript's
     * first row. While the rows fit the scrollport the list rests it with its
     * `headerLift` line at `LEADING_HEADER_REST_TOP` down, and the rows after
     * it fill in below it rather than lifting it; once they no longer fit, the
     * list scrolls as it always does.
     */
    header?: ReactNode;
    /** Height model supplied to the virtualizer for the header row. It is asked on every commit. */
    headerHeight?: number | ((width: number) => number);
    /**
     * How far below the header's top the row after it begins once there is
     * one: the line the header rests at `LEADING_HEADER_REST_TOP` down, so the
     * first send lands on it. Defaults to the header's height.
     */
    headerLift?: number | ((width: number) => number);
    /**
     * A chrome row below the last message by default. It is
     * part of the virtualized row collection with a reserved stable key, not an
     * overlay or sticky chrome, so it scrolls and reconciles like every other
     * transcript row.
     */
    footer?: ReactNode;
    /** Insert the live chrome before this child; later children remain ordinary keyed rows. */
    footerBefore?: number;
    /**
     * Height model supplied to the virtualizer for the stable footer row. It
     * reads state outside the rows, so it is asked on every commit, and so is
     * the row before it, which may read that same state as its successor.
     */
    footerHeight?: number | ((width: number) => number);
    /**
     * While true, a follower keeps the whole footer in view as it grows: the
     * reader has just sent, and the reply starts in the footer. Otherwise a
     * follower holds footer growth below the fold, so a status that appears on
     * its own never moves the transcript.
     */
    footerFollowed?: boolean;
    /** Room below queued rows for the footer that will follow them when accepted. */
    footerReserveHeight?: number;
    /** A send queued during a run: carry it into view from near the bottom, without reserving reply space. */
    followKey?: string;
    /**
     * Told the first and last of the caller's rows on screen, partly or wholly,
     * each time that range or the number of rows changes. Read from the range
     * the virtual list already computes, so it adds no layout work.
     */
    onVisibleRowsChange?: (first: number, last: number, list: HTMLElement) => void;
    /**
     * Offers a button back to the newest row while the reader is scrolled away
     * from it by more than a third of a screen.
     */
    jumpToEnd?: boolean;
    /**
     * Sweeps the same shimmer as every other in-progress label through the
     * jump button's arrow, for a transcript whose agent is still working: the
     * newest row is still being written, so the way back to it says so. Idle
     * lists show the plain arrow.
     */
    jumpToEndWorking?: boolean;
    /** Bottom clearance represented inside the virtualizer's coordinate space. */
    paddingEnd?: number;
    /**
     * Height of row `index` at the list's current content width, computed from
     * the caller's own data rather than from the DOM. This is the authoritative
     * row geometry for mounted and unmounted content alike; MessageList never
     * observes or measures an individual row. Return `undefined` only when the
     * caller deliberately accepts the fixed fallback size.
     */
    estimateRowSize?: (index: number, width: number) => number | undefined;
    /**
     * The same height, only when the caller already holds it for this width,
     * without laying anything out; `undefined` when it would have to. A list
     * returning to a width it has laid out before reads its rows back this
     * way, so a round trip restores every row and the scroll offset exactly
     * instead of leaving them to idle refinement.
     */
    cachedRowSize?: (index: number, width: number) => number | undefined;
    /** Background-only steps that warm the same cache as estimateRowSize.
     * Visible rows remain synchronous; unfinished preparation is never published. */
    prepareRowSize?: (index: number, width: number) => Iterator<void>;
    /**
     * Converts the full scrollport width to the width rows actually occupy.
     * Centered, max-width content uses this so growing chrome beyond its readable
     * measure neither creates cache variants nor invalidates virtual estimates.
     */
    estimateRowWidth?: (scrollportWidth: number) => number;
    /** Rebuilds the row-size model when its non-width inputs change. */
    estimateVersion?: number;
    /**
     * Values read by `estimateRowSize`, compared by identity. Change one when
     * the caller's row data changes; ordinary parent renders with the same
     * values leave the geometry model intact. A change re-asks every row.
     */
    estimateDependencies?: readonly unknown[];
    /**
     * The value each row is estimated from, one per child in order, compared
     * by identity. A row's estimate may read every row before it, the row after
     * it, and whether it is the last row — nothing further ahead. The last row
     * may also read whatever `footerHeight` reads. When only
     * these values change, the model keeps every row before the one preceding
     * the first changed value and re-asks the rest, so appending to a long
     * transcript costs the rows that changed rather than the whole history.
     * Without it, row data belongs in `estimateDependencies`.
     */
    estimateRows?: readonly unknown[];
    /** Restores a previously detached reader position on this list's first layout. */
    initialScrollPosition?: MessageListScrollPosition | MessageListLegacyScrollPosition;
    /** Persistent row to hold after folding, named by the caller's child key or row alias. */
    rowFallbackKey?: (index: number) => string | undefined;
    /** Optional stable alias for a persistent row whose entity key is not known until it arrives. */
    rowAnchorKey?: (index: number) => string | undefined;
    /** Reports user scrolling and the final position before this list detaches. */
    onScrollPositionChange?: (position: MessageListScrollPosition) => void;
    /**
     * The oldest loaded row is on screen, so an owner holding older content
     * loads it here.
     *
     * Scrolling to the top says this, and so does a transcript with nothing to
     * scroll: a page whose rows all fit the scrollport leaves the reader no
     * gesture that could ever ask for what came before them, and it is the list
     * — the only thing that knows its own geometry — that has to say so. That
     * short list is asked for again after each commit that leaves it short, so
     * a history arriving a page at a time keeps loading until it fills the
     * scrollport or the owner stops answering.
     */
    onStartReached?: () => void;
    style?: CSSProperties;
    /**
     * Enables TanStack Virtual for this list's entire mounted lifetime. Callers
     * that can grow into long histories must opt in from the first render so
     * crossing an arbitrary row-count threshold never reparents live rows.
     */
    virtualize?: boolean;
};
/**
 * Where a reader is, as the list's fixed point rather than a pixel offset. A
 * follower is held by the bottom. A parked reader is held by one row: the
 * point `offset` px below that row's top stays `viewportInset` px above
 * the viewport's lower edge, whatever the rows above it measure, so a restore
 * needs only that row and its viewport laid out.
 */
export type MessageListScrollPosition =
    | { readonly type: "bottom" }
    | {
          readonly type: "row";
          /** The row's React key within this list. */
          readonly rowKey: string;
          readonly fallbackRowKey?: string;
          readonly offset: number;
          /** Distance from the viewport's lower edge; absent in older saved positions. */
          readonly viewportInset?: number;
          /** Viewport height when this point was saved, before any hidden resize. */
          readonly viewportHeight?: number;
          /** Leading space held when a short transcript was opened in place. */
          readonly leadingInset?: number;
      };
/**
 * The pixel position lists used to report, accepted only as a restore input. A
 * parked offset is placed by every row above it, so restoring one lays out
 * that whole prefix.
 */
export interface MessageListLegacyScrollPosition {
    readonly scrollTop: number;
    readonly following: boolean;
    readonly rowWidth?: number;
}
/** A reader returning this close to the bottom (px) can resume following. */
const FOLLOW_BOTTOM_THRESHOLD = 8;
/** Sending near the end carries the queued instruction into view. */
const SEND_FOLLOW_THRESHOLD = 80;
/** A reader this close to the top (px) is looking at the oldest loaded row. */
const START_REACHED_THRESHOLD = 64;
/**
 * A reader within this many screens of the oldest loaded row asks for the page before it, so it
 * has arrived by the time they scroll there instead of after.
 */
const START_READ_AHEAD_SCREENS = 2;
/** Do not expose the final fractional/integer pixels to a further downward wheel. */
const BOTTOM_WHEEL_EPSILON = 2;
/** Transcript clearances represented inside the virtualizer's coordinate space. */
const MESSAGE_LIST_PADDING_START = 12;
/**
 * Where a resting leading header's lift line sits, as a share of the
 * viewport's height from its top: the first message lands there, with the
 * rest of the viewport left for the reply.
 */
export const LEADING_HEADER_REST_TOP = 0.3;
const MESSAGE_LIST_PADDING_END_DEFAULT = 8;
/** Model-space point kept stable near a parked reader's lower viewport edge. */
const VIRTUAL_ANCHOR_INSET = 32;
/** Row height used only when a virtualized caller supplies no model for a row. */
const ROW_SIZE_FALLBACK = 72;
/** Rows TanStack mounts beyond the visible range on each side, once laid out. */
const MESSAGE_LIST_OVERSCAN = 12;
/**
 * Longest one idle slice spends laying out rows the reader cannot see (ms),
 * even when the browser offers a longer idle period: input arriving during a
 * slice waits for it. A row is never split, so one slice can overrun by the
 * row in progress.
 */
const ROW_REFINE_SLICE_MS = 8;
/** Longest one model update spends reading already laid-out rows back (ms). */
const ROW_CACHE_LOOKUP_MS = 2;
/** The slice an overdue idle callback, or a browser without one, still gets. */
const ROW_REFINE_FORCED_MS = 4;
/**
 * Longest laid-out rows wait in the size cache before one batched commit
 * publishes them. Rows are laid out in many short slices, but each commit
 * re-renders the list, so the model takes them together.
 */
const ROW_REFINE_COMMIT_MS = 200;
/** Reserved stable entity key for the optional final footer row. */
const MESSAGE_LIST_FOOTER_KEY = "__happy_message_list_footer__";
/** Reserved stable entity key for the optional first header row. */
const MESSAGE_LIST_HEADER_KEY = "__happy_message_list_header__";
/** Native read-back can differ by a fraction; one pixel starts a new reading point. */
function messageListScrollOffsetMoved(next: number, previous: number): boolean {
    return Math.abs(next - previous) >= 1;
}
/** The padding/border-free viewport uses an overlaid scrollbar, so its resolved
 * CSS width is also its content width. Unlike clientWidth, this retains flex
 * layout's fractions without including ancestor zoom or transforms. */
function messageListViewportWidth(element: HTMLElement): number {
    return Number.parseFloat(element.ownerDocument.defaultView!.getComputedStyle(element).width);
}
function messageListViewportHeight(element: HTMLElement): number {
    return Number.parseFloat(element.ownerDocument.defaultView!.getComputedStyle(element).height);
}
function messageListRowWidth(
    scrollportWidth: number,
    estimate: MessageListProps["estimateRowWidth"],
): number {
    return estimate?.(scrollportWidth) ?? scrollportWidth;
}
/**
 * The rows one model update must lay out exactly before it returns: the ones
 * the reader sees in the commit it produces.
 */
type MessageListLayoutFocus =
    /** A follower reads the newest rows, up from the end. */
    | { readonly type: "end" }
    /** A legacy restored scrollTop is placed by every row above it, so all of them. */
    | { readonly type: "offset"; readonly offset: number }
    /** A parked reader: its anchor row, and the rows its viewport shows around it. */
    | {
          readonly type: "anchor";
          readonly index: number;
          readonly itemOffset: number;
          readonly viewportInset: number;
      }
    /** Rows already rendered. */
    | { readonly type: "rows"; readonly first: number; readonly last: number };
type MessageListVirtualAnchor =
    | {
          readonly type: "item";
          readonly index: number;
          readonly itemOffset: number;
          readonly key: Key;
          /** A collapsing control's point, resolved once against its new row size. */
          readonly itemEndOffset?: number;
          readonly fallbackKey?: Key;
          readonly viewportInset: number;
      }
    | {
          readonly type: "scrollTop";
          readonly scrollTop: number;
      };
/**
 * Scrolling message column. A `margin-top: auto` spacer bottom-anchors sparse
 * histories while long histories scroll chronologically from the top.
 *
 * Follows the newest content: scrolls to the bottom instantly on mount and
 * whenever its content grows — unless the user has scrolled up, in which case
 * their position is preserved (standard chat behavior). The "was at/near the
 * bottom before the mutation" flag is tracked from scroll events, so it always
 * reflects the position prior to the DOM change.
 */
export function MessageList(props: MessageListProps) {
    const list = useRef<HTMLDivElement>(null);
    const spacer = useRef<HTMLDivElement>(null);
    const estimateRowWidth = props.estimateRowWidth;
    /* The restore payload is read once, at mount. This list reports its own
       position back out, and an owner that stores it where a later render can
       read it would otherwise feed it back in mid-session — re-anchoring a list
       the reader is actively scrolling. Restoring is a lifetime event, and the
       lifetime boundary is the caller's `key`. */
    const restore = useRef(props.initialScrollPosition);
    const restoredFollowing =
        restore.current === undefined ||
        ("type" in restore.current ? restore.current.type === "bottom" : restore.current.following);
    const following = useRef(restoredFollowing);
    const escapedFromFollow = useRef(!restoredFollowing);
    const positionChange = useRef(props.onScrollPositionChange);
    positionChange.current = props.onScrollPositionChange;
    const startReached = useRef(props.onStartReached);
    startReached.current = props.onStartReached;
    /* The content height the unscrollable list last asked about, so a commit
       that brought nothing new does not ask again. */
    const startReportedHeight = useRef(-1);
    const expectedScrollTop = useRef<number | undefined>(undefined);
    /* The reader's opening position — the newest content, or the restored
       one — is written once, by the first commit whose DOM carries the real
       row model. Writing it earlier would clamp it against placeholder
       geometry. */
    const initialPositionApplied = useRef(false);
    /* Where the restored anchor puts the reader in the opening model. */
    const openingScrollTop = useRef<number | undefined>(undefined);
    const scrollHeightBaseline = useRef(0);
    const readerScrollTop = useRef(
        restore.current !== undefined && !("type" in restore.current)
            ? restore.current.scrollTop
            : 0,
    );
    const viewportGeometry = useRef({ height: 0, width: 0 });
    const viewportScale = useRef(0);
    const geometryPlacementPending = useRef(false);
    /* The rows the last commit mounted, by key with the index each had there. */
    const mountedRows = useRef<readonly { readonly key: Key; readonly index: number }[]>([]);
    const viewportGeometryCommitCurrent = useRef((_width: number, _height: number) => {});
    const pendingViewportGeometry = useRef<{ width: number; height: number } | undefined>(
        undefined,
    );
    const virtualContent = useRef<HTMLDivElement | null>(null);
    // Space held below the transcript: by a viewport that grows keeping its
    // previous content extent. It moves with the
    // transcript's end. A shrinking viewport or new content takes it up.
    const geometryExtent = useRef(0);
    // A viewport resize makes held tail space reclaimable once wholly unseen.
    const geometryExtentResized = useRef(false);
    const geometrySparseInset = useRef(0);
    const geometryFollowInset = useRef(0);
    const footerFollowed = useRef(false);
    /* A send following just acquired, whose start must stay in view. */
    const followSentPending = useRef<string | undefined>(undefined);
    /* The row count while following holds the end back for a send. Any row
       arriving, the reply first of all, releases the hold. */
    const followSentHold = useRef<number | undefined>(undefined);
    const followSeen = useRef(props.followKey);
    const wheelScrollPending = useRef(false);
    footerFollowed.current = props.footerFollowed === true;
    const pendingFollowerTop = useRef<number | undefined>(undefined);
    const readerAnchor = useRef<MessageListVirtualAnchor | undefined>(undefined);
    const pendingAnchor = useRef<
        | {
              readonly anchor: MessageListVirtualAnchor;
              readonly viewportHeight: number;
              /** Floor ownership before this commit changed the row model. */
              readonly floored?: boolean;
              /** Restore as the scrollTop anchor the reader held before refinement. */
              readonly scrollTopAnchor?: boolean;
          }
        | undefined
    >(undefined);
    /* Cancels the scheduled idle refinement slice, if one is waiting. */
    const refinementCancel = useRef<(() => void) | undefined>(undefined);
    const overscanMountCancel = useRef<(() => void) | undefined>(undefined);
    const overscanMountCurrent = useRef(() => {});
    const rowSizeModelRefineCurrent = useRef((_slice: number) => {});
    const overscanRequireCurrent = useRef(() => {});
    /* TanStack's own offset listener, so a programmatic write reaches its
       range in the commit that made it rather than at the next scroll event. */
    const virtualOffsetReport = useRef<
        ((offset: number, isScrolling: boolean) => void) | undefined
    >(undefined);
    const scrollTopWrite = (
        element: HTMLElement,
        value: number,
        placed?: (top: number) => void,
    ) => {
        // This model placement supersedes wheel intent that has not moved yet.
        wheelScrollPending.current = false;
        // Reassigning WebKit's reported offset at fractional zoom can round
        // its native position down a pixel, even though the value is equal.
        if (element.scrollTop !== value) element.scrollTop = value;
        expectedScrollTop.current = element.scrollTop;
        readerScrollTop.current = element.scrollTop;
        placed?.(element.scrollTop);
        virtualOffsetReport.current?.(element.scrollTop, virtualizer.isScrolling);
        // An active observer must see the old cache: preassigning makes its
        // scrolling guard mistake this model write for a duplicate event.
        // Activity reattachment still needs the cache when no observer exists.
        virtualizer.scrollOffset = element.scrollTop;
    };
    const scrollBottomFollow = (
        element: HTMLElement,
        height = messageListViewportHeight(element),
    ) => {
        const geometry = viewportGeometry.current;
        if (geometry.height > 0 && Math.abs(geometry.height - height) > 1 / 64) {
            // An idle refinement can commit between native textarea resizing
            // and ResizeObserver delivery. Apply that geometry before following.
            viewportGeometryCommitCurrent.current(geometry.width, height);
            return;
        }
        const reserve = props.footerReserveHeight ?? 0;
        if (following.current && virtualized && reserve > 0) {
            geometryFollowInset.current = 0;
            geometryExtentRequire(
                geometrySparseInset.current + estimatedContentHeight() + reserve - height,
                height,
            );
        }
        // Virtual rows already have authoritative geometry. Native scrollHeight
        // can still include overflow from a previous virtual range mid-commit.
        const total = virtualized
            ? Math.max(estimatedContentHeight(), geometryExtent.current) +
              geometrySparseInset.current
            : element.scrollHeight;
        // Native geometry may retain a fractional maximum at browser zoom.
        // Following never writes upward; model compensation owns that change.
        const bottom = total - (geometry.height || height) - geometryFollowInset.current;
        const current = element.scrollTop;
        if (bottom > current) scrollTopWrite(element, bottom);
    };
    /**
     * Holds a resting header's gap at its current size, as the list's sparse
     * inset. Unheld, the gap is the spacer itself, which gives way to rows
     * growing below it; held, it stays put until it is entirely above the
     * reader, like any other inset.
     */
    const headerRestHold = (gap: number) => {
        const spacerElement = spacer.current;
        if (!spacerElement || geometrySparseInset.current > 0 || gap <= 0) return;
        geometrySparseInset.current = gap;
        spacerElement.style.flex = "none";
        spacerElement.style.height = `${String(gap)}px`;
        spacerElement.style.maxHeight = "none";
    };
    /** The resting header's gap as laid out now, or what is held of it. */
    const headerRestGap = () =>
        geometrySparseInset.current || (spacer.current?.getBoundingClientRect().height ?? 0);
    const spacerHoldRelease = () => {
        spacer.current?.style.removeProperty("margin-top");
        spacer.current?.style.removeProperty("flex");
        spacer.current?.style.removeProperty("height");
        headerRestApply();
    };
    const sparseInsetHold = () => {
        const spacerElement = spacer.current;
        const firstRow = spacerElement?.nextElementSibling;
        if (!spacerElement || !firstRow) return;
        if (headerLeads) {
            headerRestHold(headerRestGap());
            return;
        }
        const inset = virtualized
            ? leadingGap(viewportGeometry.current.height)
            : Math.max(
                  0,
                  Number.parseFloat(
                      spacerElement.ownerDocument.defaultView!.getComputedStyle(spacerElement)
                          .marginTop,
                  ) || 0,
              );
        if (inset > 0.5) {
            if (virtualized) geometrySparseInset.current = inset;
            spacerElement.style.marginTop = `${String(inset)}px`;
        }
    };
    const sparseInsetRelease = () => {
        if (geometrySparseInset.current > 0) return;
        spacerHoldRelease();
    };
    /* Context identity stays fixed for the mounted list: thousands of rows may
       consume it, and ordinary transcript renders must not notify them all. */
    const disclosureAnchor = useRef<MessageListDisclosureAnchor>((disclosure, hold) => {
        const element = list.current;
        if (!element || !element.contains(disclosure)) return;
        /* Expanding a row is a reading action, not new transcript content.
           Keep the control under the pointer while its details take space
           below it. A short transcript needs its resolved auto-margin held
           too; otherwise bottom alignment consumes that margin first and
           visually inserts the body above the disclosure. */
        sparseInsetHold();
        escapedFromFollow.current = true;
        following.current = false;
        pendingAnchor.current = undefined;
        /* Held by its row where the model has one, so the control also stays
           put when what is above it reflows, as when a panel opening beside
           the transcript narrows it; otherwise by the scroll offset. */
        readerAnchor.current = disclosureRowAnchorCurrent.current(element, disclosure, hold) ?? {
            scrollTop: element.scrollTop,
            type: "scrollTop",
        };
        readerScrollTop.current = element.scrollTop;
        if (hold === "row-start" || hold === "row-start-or-control") positionReport();
    }).current;
    const startReachedReport = (element: HTMLElement) => {
        if (
            element.scrollTop >
            Math.max(START_REACHED_THRESHOLD, element.clientHeight * START_READ_AHEAD_SCREENS)
        )
            return;
        startReportedHeight.current = element.scrollHeight;
        startReached.current?.();
    };
    const entryItems = Children.toArray(props.children);
    const headerLeads = props.header !== undefined;
    /* Where the caller's row `index` sits among the list's own rows. */
    const headerOffset = headerLeads ? 1 : 0;
    const footerChildIndex = Math.min(props.footerBefore ?? entryItems.length, entryItems.length);
    const footerIndex = props.footer === undefined ? undefined : headerOffset + footerChildIndex;
    const entryIndex = (index: number) =>
        index - headerOffset - (footerIndex !== undefined && index > footerIndex ? 1 : 0);
    const rowFallbackAt = (index: number) =>
        (headerLeads && index === 0) || index === footerIndex
            ? undefined
            : props.rowFallbackKey?.(entryIndex(index));
    const virtualIndex = (index: number) =>
        headerOffset + index + (footerIndex !== undefined && index >= footerChildIndex ? 1 : 0);
    const items =
        !headerLeads && footerIndex === undefined
            ? entryItems
            : [
                  ...(headerLeads
                      ? [
                            <div
                                className="happy-message-list__header"
                                data-happy-desktop-ui="message-list-header"
                                key={MESSAGE_LIST_HEADER_KEY}
                            >
                                {props.header}
                            </div>,
                        ]
                      : []),
                  ...entryItems.slice(0, footerChildIndex),
                  ...(footerIndex === undefined
                      ? []
                      : [
                            <div
                                className="happy-message-list__footer"
                                data-happy-desktop-ui="message-list-footer"
                                data-item-id="working-status"
                                key={MESSAGE_LIST_FOOTER_KEY}
                            >
                                {props.footer}
                            </div>,
                        ]),
                  ...entryItems.slice(footerChildIndex),
              ];
    const itemKeyAt = (index: number): Key => {
        const item = items[index];
        return isValidElement(item) && item.key !== null ? item.key : index;
    };
    /* TanStack recomputes every offset whenever its key function changes, so it
       gets one for the list's lifetime. Every model update that changes a row
       calls `measure`, which is what tells TanStack the rows moved. */
    const itemKeyAtCurrent = useRef(itemKeyAt);
    itemKeyAtCurrent.current = itemKeyAt;
    const [virtualItemKey] = useState(() => (index: number) => itemKeyAtCurrent.current(index));
    const virtualized = props.virtualize === true;
    const paddingEnd = props.paddingEnd ?? MESSAGE_LIST_PADDING_END_DEFAULT;
    const headerSize = (rowWidth: number) =>
        typeof props.headerHeight === "function"
            ? props.headerHeight(rowWidth)
            : (props.headerHeight ?? ROW_SIZE_FALLBACK);
    const estimateItemSize = (index: number, rowWidth: number) =>
        headerLeads && index === 0
            ? headerSize(rowWidth)
            : index === footerIndex
              ? typeof props.footerHeight === "function"
                  ? props.footerHeight(rowWidth)
                  : (props.footerHeight ?? ROW_SIZE_FALLBACK)
              : (props.estimateRowSize?.(entryIndex(index), rowWidth) ?? ROW_SIZE_FALLBACK);
    /** Where a resting header's lift line sits, from the viewport's top edge. */
    const headerRestLine = (viewportHeight: number) =>
        Math.round(viewportHeight * LEADING_HEADER_REST_TOP);
    /**
     * Rests the header's lift line at `headerRestLine` while the rows fit:
     * the spacer above it grows into the free space up to that point and no
     * further, so rows added below take the space under it first.
     */
    const headerRestApply = () => {
        const element = spacer.current;
        if (!element || geometrySparseInset.current > 0) return;
        const { height, width } = viewportGeometry.current;
        if (!headerLeads || width <= 0) {
            element.style.removeProperty("max-height");
            return;
        }
        const rowWidth = messageListRowWidth(width, estimateRowWidth);
        const lift =
            props.headerLift === undefined
                ? headerSize(rowWidth)
                : typeof props.headerLift === "function"
                  ? props.headerLift(rowWidth)
                  : props.headerLift;
        element.style.maxHeight = `${String(Math.max(0, headerRestLine(height) - MESSAGE_LIST_PADDING_START - lift))}px`;
    };
    /*
     * This model is the only row-geometry authority. TanStack reads it to build
     * offsets, but no mounted row can write back into it. New data or a changed
     * container width updates it in one layout transaction.
     *
     * Nothing is modeled until the scrollport reports the width rows actually
     * occupy: a row estimated at any other width is work thrown away, and at
     * width zero every word overflows the measure and is laid out grapheme by
     * grapheme. Until then the list renders no rows at all.
     *
     * Laying out a long cold history is too much work for one task, so a size
     * may be a placeholder: a row that is not `exact` keeps its last size, or the
     * mean of the rows already laid out, until idle time lays it out for real. A
     * pending row is never painted — any that TanStack renders is laid out
     * before that commit can reach the screen, and overscan mounts only exact
     * rows — and refining rows the reader cannot see keeps a parked reader's
     * anchor, or a follower's tail, fixed.
     */
    const [rowSizeModel] = useState(() => ({
        /* Index-aligned with `items` after every model update. */
        keys: [] as Key[],
        sizes: [] as number[],
        starts: [] as number[],
        /* Whether each size was laid out at `width`, rather than a placeholder. */
        exact: [] as boolean[],
        /* How many rows are still placeholders. */
        pending: 0,
        /* The previous layout's queued footer room, consumed on acceptance. */
        footerReserveHeight: 0,
        width: undefined as number | undefined,
        /* Advances whenever any row's size or exactness may have changed. */
        version: 0,
        /* The rows idle time has laid out into the caller's size cache but not
           yet published, a contiguous range around `center`, and when the
           first of them was laid out. Any model update discards it. */
        refined: undefined as
            | {
                  center: number;
                  first: number;
                  last: number;
                  since: number;
                  active?: { index: number; work: Iterator<void> };
              }
            | undefined,
    }));
    /**
     * Updates the model at `rowWidth`, in place. Rows before `from` kept their
     * inputs and keep their size; every later row is asked again. Only the rows
     * `focus` names — what the reader sees in the commit this update produces —
     * are laid out now; every other row that changed becomes pending, for idle
     * time to lay out nearest the reader first. Offsets are rewritten only from
     * the first row whose size or position moved.
     */
    function rowSizeModelLayout(rowWidth: number, from: number, focus: MessageListLayoutFocus) {
        const element = list.current;
        const heldBlank = Math.min(
            rowSizeModel.footerReserveHeight,
            Math.max(0, geometryExtent.current - estimatedContentHeight()),
        );
        if (
            wheelScrollPending.current &&
            !following.current &&
            element &&
            messageListScrollOffsetMoved(element.scrollTop, readerScrollTop.current)
        ) {
            wheelScrollPending.current = false;
            // The native offset can change before its scroll event arrives.
            // An idle/model commit must hold that user position immediately.
            readerScrollTop.current = element.scrollTop;
            pendingAnchor.current = undefined;
            readerAnchor.current = modelAnchorCapture(
                viewportGeometry.current.height,
                element.scrollTop,
            );
            focus = readerFocus(viewportGeometry.current.height);
        }
        if (props.followKey !== followSeen.current) {
            followSeen.current = props.followKey;
            const bottom =
                Math.max(estimatedContentHeight(), geometryExtent.current) +
                geometrySparseInset.current -
                viewportGeometry.current.height -
                geometryFollowInset.current;
            if (
                props.followKey !== undefined &&
                bottom - (list.current?.scrollTop ?? readerScrollTop.current) <=
                    SEND_FOLLOW_THRESHOLD
            ) {
                following.current = true;
                escapedFromFollow.current = false;
                pendingAnchor.current = undefined;
                readerAnchor.current = undefined;
                geometryFollowInset.current = 0;
                followSentPending.current = props.followKey;
                focus = { type: "end" };
            }
        }
        const model = rowSizeModel;
        const { keys, sizes, starts, exact } = model;
        const count = items.length;
        const previousCount = keys.length;
        const previousKeys = keys.slice();
        const previousSizes = sizes.slice();
        const previousExact = exact.slice();
        const previousStarts = starts.slice();
        const previousFooterIndex = keys.indexOf(MESSAGE_LIST_FOOTER_KEY);
        const footerBefore = previousFooterIndex < 0 ? 0 : (sizes[previousFooterIndex] ?? 0);
        const widthReflow = model.width !== rowWidth;
        const parkedViewportHeight = viewportGeometry.current.height;
        let parkedAnchor =
            initialPositionApplied.current && !following.current && list.current
                ? (pendingAnchor.current ?? {
                      anchor: refinementAnchor(list.current, parkedViewportHeight),
                      viewportHeight: parkedViewportHeight,
                      floored: modelFloored(parkedViewportHeight),
                  })
                : undefined;
        if (parkedAnchor && parkedAnchor.floored === undefined)
            parkedAnchor = { ...parkedAnchor, floored: modelFloored(parkedViewportHeight) };
        if (parkedAnchor?.anchor?.type === "item") {
            const anchor = modelAnchorFallback(parkedAnchor.anchor, parkedAnchor.viewportHeight);
            if (anchor !== parkedAnchor.anchor) {
                parkedAnchor = { ...parkedAnchor, anchor };
                readerAnchor.current = anchor;
                focus = {
                    type: "anchor",
                    index: anchor.index,
                    itemOffset: anchor.itemOffset,
                    viewportInset: anchor.viewportInset,
                };
            }
        }
        if (!widthReflow && from < previousCount && parkedAnchor?.anchor?.type === "item") {
            // A width roundtrip retains an offset beyond a temporarily shorter
            // row. Once content changes, hold the point actually on screen so
            // new streamed lines cannot pull the reader toward that old offset.
            if (
                parkedAnchor.anchor.viewportInset < 0 ||
                parkedAnchor.anchor.viewportInset > parkedAnchor.viewportHeight
            ) {
                const visible = modelAnchorCapture(
                    parkedAnchor.viewportHeight,
                    readerScrollTop.current,
                );
                if (visible) parkedAnchor = { ...parkedAnchor, anchor: visible };
            }
            const anchor = parkedAnchor.anchor;
            if (anchor?.type === "item") {
                const previous = previousKeys.indexOf(anchor.key);
                const size = previousSizes[previous];
                if (size !== undefined && anchor.itemOffset > size)
                    parkedAnchor = { ...parkedAnchor, anchor: { ...anchor, itemOffset: size } };
            }
        }
        const kept =
            model.width === rowWidth ? Math.max(0, Math.min(from, count, previousCount)) : 0;
        /* Rows from `kept` on carry their previous size, found by key, as the
           placeholder they keep until they are asked again. */
        const tailKeys = keys.slice(kept);
        const tailSizes = sizes.slice(kept);
        let tailPending = 0;
        for (let index = kept; index < previousCount; index += 1)
            if (!exact[index]) tailPending += 1;
        let tailIndex: Map<Key, number> | undefined;
        let pending = model.pending - tailPending + (count - kept);
        keys.length = count;
        sizes.length = count;
        exact.length = count;
        let unsized = false;
        for (let index = kept; index < count; index += 1) {
            const key = itemKeyAt(index);
            let previous: number | undefined = index - kept;
            if (tailKeys[previous] !== key) {
                if (!tailIndex) {
                    tailIndex = new Map();
                    for (let tail = 0; tail < tailKeys.length; tail += 1)
                        tailIndex.set(tailKeys[tail]!, tail);
                }
                previous = tailIndex.get(key);
            }
            keys[index] = key;
            sizes[index] = previous === undefined ? -1 : tailSizes[previous]!;
            exact[index] = false;
            if (previous === undefined) unsized = true;
        }
        let moved = kept;
        const layout = (index: number) => {
            if (!exact[index]) {
                const size = estimateItemSize(index, rowWidth);
                if (size !== sizes[index]) moved = Math.min(moved, index);
                sizes[index] = size;
                exact[index] = true;
                pending -= 1;
            }
            return sizes[index]!;
        };
        if (footerIndex !== undefined) {
            if (exact[footerIndex]) pending += 1;
            exact[footerIndex] = false;
            layout(footerIndex);
        }
        if (headerLeads) {
            if (exact[0]) pending += 1;
            exact[0] = false;
            layout(0);
        }
        const viewportHeight = viewportGeometry.current.height || list.current?.clientHeight || 0;
        /* The rows the reader's viewport covers in the commit this produces. */
        let first = 0;
        let last = count - 1;
        if (focus.type === "end") {
            let covered = 0;
            let index = count - 1;
            for (; index >= 0 && covered < viewportHeight; index -= 1) covered += layout(index);
            first = index + 1;
        } else if (focus.type === "offset") {
            let start = MESSAGE_LIST_PADDING_START;
            let index = 0;
            for (; index < count && start < focus.offset + viewportHeight; index += 1)
                start += layout(index);
            last = index - 1;
        } else if (focus.type === "anchor") {
            /* The anchor's point sits `viewportInset` above the viewport's lower
               edge; the viewport spans that far below it and the rest above. */
            const size = layout(focus.index);
            const point = Math.min(focus.itemOffset, size);
            let above = viewportHeight - focus.viewportInset - point;
            let index = focus.index - 1;
            for (; index >= 0 && above > 0; index -= 1) above -= layout(index);
            first = index + 1;
            let below = focus.viewportInset - (size - point);
            for (index = focus.index + 1; index < count && below > 0; index += 1)
                below -= layout(index);
            last = index - 1;
        } else {
            first = focus.first;
            last = focus.last;
        }
        /* A list that is not virtualized mounts every row, so it models them all. */
        if (!virtualized) {
            first = 0;
            last = count - 1;
        }
        for (let index = Math.max(0, first); index <= Math.min(count - 1, last); index += 1)
            layout(index);
        /* A send just followed is held by its start, measured from the end:
           every row from it on is laid out, not only those the end shows. */
        const sent =
            followSentPending.current === undefined
                ? undefined
                : sentRowIndex(followSentPending.current);
        if (sent !== undefined) for (let index = sent; index < count; index += 1) layout(index);
        /* Width changes and new rows can leave mounted neighbours at estimates.
           Their real bodies can overflow those estimates into the viewport.
           Keep their nodes and lay out this small mounted set before paint. */
        for (const row of mountedRows.current) {
            const index = itemIndexOf(row.key, row.index);
            if (index !== undefined) layout(index);
        }
        /* Any other row the caller already holds at this width is exact for
           the price of a lookup, nearest the reader first. */
        const cachedRowSize = props.cachedRowSize;
        const cached =
            cachedRowSize &&
            ((index: number, width: number) =>
                headerLeads && index === 0
                    ? headerSize(width)
                    : cachedRowSize(entryIndex(index), width));
        const lookupDeadline = performance.now() + ROW_CACHE_LOOKUP_MS;
        for (let distance = 1; cached && pending > 0; distance += 1) {
            const above = first - distance;
            const below = last + distance;
            if (above < 0 && below >= count) break;
            if (performance.now() >= lookupDeadline) break;
            for (const index of [above, below]) {
                if (index < 0 || index >= count || exact[index]) continue;
                const size = cached(index, rowWidth);
                if (size === undefined) continue;
                if (size !== sizes[index]) moved = Math.min(moved, index);
                sizes[index] = size;
                exact[index] = true;
                pending -= 1;
            }
        }
        if (unsized) {
            /* A row never sized before and not reached in this update takes the
               mean of the rows that are. */
            let exactTotal = 0;
            let exactCount = 0;
            for (let index = 0; index < count; index += 1) {
                if (!exact[index]) continue;
                exactTotal += sizes[index]!;
                exactCount += 1;
            }
            const placeholder =
                exactCount > 0 ? Math.round(exactTotal / exactCount) : ROW_SIZE_FALLBACK;
            for (let index = kept; index < count; index += 1) {
                if (sizes[index]! >= 0) continue;
                sizes[index] = placeholder;
                moved = Math.min(moved, index);
            }
        }
        starts.length = count;
        let start =
            moved === 0 ? MESSAGE_LIST_PADDING_START : starts[moved - 1]! + sizes[moved - 1]!;
        for (let index = moved; index < count; index += 1) {
            starts[index] = start;
            start += sizes[index]!;
        }
        model.pending = pending;
        model.footerReserveHeight = props.footerReserveHeight ?? 0;
        model.width = rowWidth;
        model.version += 1;
        model.refined = undefined;
        const footerDelta =
            (footerIndex === undefined ? 0 : (sizes[footerIndex] ?? 0)) - footerBefore;
        if (following.current && initialPositionApplied.current)
            geometryFollowInset.current = Math.max(
                0,
                geometryFollowInset.current +
                    (footerFollowed.current
                        ? Math.min(0, footerDelta)
                        : footerDelta > 0
                          ? Math.max(0, footerDelta - heldBlank)
                          : footerDelta),
            );
        // A content update can also discover cached sizes for cold rows. Only
        // their placeholder correction (or a width reflow) changes coordinates;
        // appended content and changes to already exact rows remain real growth.
        let coordinateDelta = 0;
        let previousIndex: Map<Key, number> | undefined;
        for (let index = 0; index < count; index += 1) {
            if (keys[index] === MESSAGE_LIST_FOOTER_KEY) continue;
            let previous: number | undefined = index;
            if (previousKeys[previous] !== keys[index]) {
                previousIndex ??= new Map(previousKeys.map((key, index) => [key, index]));
                previous = previousIndex.get(keys[index]!);
            }
            if (previous === undefined || (!widthReflow && previousExact[previous])) continue;
            coordinateDelta += sizes[index]! - previousSizes[previous]!;
        }
        /* How far the last row the model already had moved: everything
           inserted, removed, refined, or reflowed above it. Content from that
           row on is what is new at the end. */
        const tailShift = () => {
            for (let previous = previousCount - 1; previous >= 0; previous -= 1) {
                const key = previousKeys[previous]!;
                if (key === MESSAGE_LIST_FOOTER_KEY) continue;
                const index = keys.lastIndexOf(key);
                if (index < 0) continue;
                return (
                    starts[index]! -
                    previousStarts[previous]! +
                    (widthReflow || !previousExact[previous]
                        ? sizes[index]! - previousSizes[previous]!
                        : 0)
                );
            }
            return 0;
        };
        const extentShift = geometryExtent.current > 0 ? tailShift() : 0;
        if (following.current && !widthReflow)
            // An answered request can enter history before newer messages.
            // Keep the retained tail in the same place; content appended after
            // it still follows naturally. This also covers cold prefix sizes.
            coordinateDelta = geometryExtent.current > 0 ? extentShift : tailShift();
        if (extentShift !== 0) {
            // The held space belongs to the end of the transcript: rows that
            // arrive, leave, or change above its last row carry it along, so
            // only content added at the end grows into it.
            geometryExtent.current += extentShift;
            if (virtualContent.current)
                virtualContent.current.style.minHeight = `${String(geometryExtent.current)}px`;
        }
        /* A footer held below the fold only stays there while nothing else
           moves it. Content written past the end carries a follower anyway,
           so it carries them to the real end, live status included: a turn
           that started on its own, or a retry, must not stream with its end
           cut off. A held send is released by its own rule. */
        if (
            following.current &&
            initialPositionApplied.current &&
            followSentHold.current === undefined &&
            geometryFollowInset.current > 0 &&
            Math.max(estimatedContentHeight(), geometryExtent.current) +
                geometrySparseInset.current -
                viewportGeometry.current.height -
                geometryFollowInset.current >
                readerScrollTop.current + coordinateDelta + 1 / 64
        )
            geometryFollowInset.current = 0;
        let nextOffset: number | undefined;
        if (following.current && initialPositionApplied.current && coordinateDelta !== 0) {
            // Refining unseen rows moves model coordinates, not the reader.
            // Carry the same delta through the eventual DOM commit, including
            // when estimates shrink while geometry slack prevents a clamp.
            pendingFollowerTop.current = readerScrollTop.current + coordinateDelta;
            readerScrollTop.current = pendingFollowerTop.current;
            // The next render must select rows at the compensated offset.
            // Waiting for its layout effect would briefly unmount visible rows.
            nextOffset = Math.max(0, pendingFollowerTop.current);
        } else if (parkedAnchor?.anchor) {
            let anchor = parkedAnchor.anchor;
            if (anchor.type === "item" && anchor.itemEndOffset !== undefined) {
                const size = sizes[keys.indexOf(anchor.key)];
                if (size !== undefined) {
                    const { itemEndOffset, ...fromStart } = anchor;
                    anchor = { ...fromStart, itemOffset: Math.max(0, size - itemEndOffset) };
                }
            }
            if (!widthReflow && anchor.type === "item") {
                const size = sizes[keys.indexOf(anchor.key)];
                if (size !== undefined && anchor.itemOffset > size)
                    anchor = {
                        ...anchor,
                        viewportInset: anchor.viewportInset + anchor.itemOffset - size,
                        itemOffset: size,
                    };
            }
            // Insertions above a parked point consume its free floor gap
            // before scrolling; insertions below it keep that gap unchanged.
            if (
                !widthReflow &&
                !headerLeads &&
                geometrySparseInset.current > 0 &&
                anchor.type === "item"
            ) {
                const before = previousKeys.indexOf(anchor.key);
                const after = keys.indexOf(anchor.key);
                if (before >= 0 && after >= 0) {
                    const shift =
                        starts[after]! +
                        Math.min(anchor.itemOffset, sizes[after]!) -
                        previousStarts[before]! -
                        Math.min(anchor.itemOffset, previousSizes[before]!);
                    if (shift !== 0) {
                        geometrySparseInset.current = Math.max(
                            0,
                            geometrySparseInset.current - shift,
                        );
                        if (geometrySparseInset.current > 0)
                            spacer.current!.style.marginTop = `${String(geometrySparseInset.current)}px`;
                        else spacerHoldRelease();
                    }
                }
            }
            const top =
                anchor.type === "scrollTop"
                    ? anchor.scrollTop
                    : modelAnchorPlace(anchor, parkedAnchor.viewportHeight)?.scrollTop;
            pendingAnchor.current = { ...parkedAnchor, anchor };
            if (top !== undefined) nextOffset = Math.max(0, top);
        }
        // Publish all compensation before notifying React. A scrolling offset
        // report can render synchronously and must read the new measurements.
        if (virtualized) virtualizer.measure();
        if (nextOffset !== undefined) {
            virtualOffsetReport.current?.(nextOffset, virtualizer.isScrolling);
            virtualizer.scrollOffset = nextOffset;
        }
        if (pending > 0) refinementSchedule();
    }
    /** Lays out pending rows in the browser's idle time, one bounded slice at a time. */
    const refinementSchedule = () => {
        const targetWindow = list.current?.ownerDocument.defaultView;
        if (refinementCancel.current || !targetWindow) return;
        const run = (slice: number) => {
            refinementCancel.current = undefined;
            rowSizeModelRefineCurrent.current(slice);
        };
        if (typeof targetWindow.requestIdleCallback === "function") {
            const id = targetWindow.requestIdleCallback(
                (deadline) =>
                    run(
                        deadline.didTimeout
                            ? ROW_REFINE_FORCED_MS
                            : Math.min(ROW_REFINE_SLICE_MS, deadline.timeRemaining()),
                    ),
                { timeout: 250 },
            );
            refinementCancel.current = () => targetWindow.cancelIdleCallback(id);
        } else {
            const id = targetWindow.setTimeout(() => run(ROW_REFINE_FORCED_MS), 16);
            refinementCancel.current = () => targetWindow.clearTimeout(id);
        }
    };
    /** Total modeled height of every row. */
    const estimatedContentHeight = () => {
        const last = rowSizeModel.keys.length - 1;
        return (
            (last < 0
                ? MESSAGE_LIST_PADDING_START
                : rowSizeModel.starts[last]! + rowSizeModel.sizes[last]!) + paddingEnd
        );
    };
    function geometryExtentCommit() {
        const element = list.current;
        const content = virtualContent.current;
        if (!element || !content) return;
        const naturalHeight = estimatedContentHeight();
        const intendedTop = pendingFollowerTop.current ?? element.scrollTop;
        // Content takes up held space as it grows; resized space can also be
        // released once wholly outside the viewport.
        if (geometryExtent.current > 0 && naturalHeight >= geometryExtent.current) {
            const removed = Math.max(0, geometryExtent.current - naturalHeight);
            geometryExtent.current = 0;
            geometryExtentResized.current = false;
            content.style.removeProperty("min-height");
            geometryFollowInset.current = Math.max(0, geometryFollowInset.current - removed);
        }
        const inset = geometrySparseInset.current;
        if (inset > 0 && intendedTop >= inset) {
            // The leading gap is entirely above the reader. Remove it and
            // compensate in this commit so every visible row stays put.
            const top = intendedTop;
            if (pendingFollowerTop.current !== undefined) pendingFollowerTop.current -= inset;
            geometrySparseInset.current = 0;
            spacerHoldRelease();
            scrollTopWrite(element, top - inset);
        }
    }
    function geometryExtentOffscreenRelease(top: number, height: number) {
        if (!geometryExtentResized.current || geometryExtent.current === 0) return;
        if (top + height > leadingGap(height) + estimatedContentHeight()) return;
        // The next native scroll must compare against the released height,
        // otherwise returning to the bottom looks like a content mutation.
        scrollHeightBaseline.current -= Math.max(
            0,
            geometryExtent.current - estimatedContentHeight(),
        );
        geometryExtent.current = 0;
        geometryExtentResized.current = false;
        virtualContent.current?.style.removeProperty("min-height");
    }
    /** The newest row a caller's key names, else the footer. */
    function sentRowIndex(key: string): number | undefined {
        const [keyed] = Children.toArray([<Fragment key={key} />]);
        const childKey = isValidElement(keyed) ? keyed.key : undefined;
        for (let candidate = items.length - 1; candidate >= 0; candidate -= 1)
            if (itemKeyAt(candidate) === childKey) return candidate;
        return footerIndex;
    }
    /**
     * A send followed mid-turn waits under the live footer. In a viewport too
     * short for both, following the end would carry the send out of view
     * above. Hold the end back instead: the whole send stays in view when it
     * fits, and its end, the last thing written, when it does not.
     */
    function sentStartKeep(element: HTMLElement, key: string) {
        // Queued sends follow their reserved status room, including when the
        // message is taller than the viewport and only its end can be shown.
        if ((props.footerReserveHeight ?? 0) > 0) return;
        const index = sentRowIndex(key);
        const start = index === undefined ? undefined : rowSizeModel.starts[index];
        const size = index === undefined ? undefined : rowSizeModel.sizes[index];
        if (start === undefined || size === undefined) return;
        const height = viewportGeometry.current.height;
        const end = Math.max(estimatedContentHeight(), geometryExtent.current);
        const withheld = end - start - Math.max(height, size);
        if (withheld <= geometryFollowInset.current) return;
        geometryFollowInset.current = withheld;
        followSentHold.current = items.length;
        /* The end was followed past the send before it was held back. */
        scrollTopWrite(element, geometrySparseInset.current + end - height - withheld);
    }
    function geometryExtentRequire(top: number, height: number) {
        const content = virtualContent.current;
        if (!content) return;
        const extent = top + height - geometrySparseInset.current;
        if (extent <= estimatedContentHeight() || extent <= geometryExtent.current) return;
        geometryExtent.current = extent;
        content.style.minHeight = `${String(extent)}px`;
    }
    /**
     * Where the list opens: the restored reader position, or the newest
     * content. TanStack reads this once, after the scrollport has reported its
     * box and the row model exists, so its first range is the one painted.
     */
    const initialScrollTop = () =>
        following.current
            ? Math.max(0, estimatedContentHeight() - viewportGeometry.current.height)
            : (openingScrollTop.current ?? readerScrollTop.current);
    /** The reader's fixed point, as it is saved: the anchor it holds, not its pixel offset. */
    function positionCurrent(element: HTMLElement): MessageListScrollPosition {
        if (following.current) return { type: "bottom" };
        let top = readerScrollTop.current;
        const nativeTop = element.scrollTop;
        if (messageListScrollOffsetMoved(nativeTop, top)) {
            const geometry = viewportGeometry.current;
            const style = element.ownerDocument.defaultView!.getComputedStyle(element);
            const width = Number.parseFloat(style.width);
            const height = Number.parseFloat(style.height);
            const boxMatches =
                Math.abs(width - geometry.width) <= 1 / 64 &&
                Math.abs(height - geometry.height) <= 1 / 64;
            const scale = boxMatches
                ? (element.getBoundingClientRect().width / width) *
                  element.ownerDocument.defaultView!.devicePixelRatio
                : 0;
            const zoomChanged =
                scale > 0 &&
                viewportScale.current > 0 &&
                Math.abs(scale / viewportScale.current - 1) > 0.01;
            if (boxMatches && !zoomChanged) top = nativeTop;
        }
        const nativeMoved = messageListScrollOffsetMoved(top, readerScrollTop.current);
        const held = nativeMoved ? undefined : readerAnchor.current;
        let anchor =
            held?.type === "item" &&
            held.viewportInset >= 0 &&
            held.viewportInset <= viewportGeometry.current.height &&
            modelAnchorRealized(held, viewportGeometry.current.height, top)
                ? held
                : /* An out-of-view point, or a raw scrollTop, is read back
                     as the row at the standard anchor point. Native scrolling
                     may already be clamped by an undelivered viewport resize;
                     only an unchanged box can supply a newer native position. */
                  modelAnchorCapture(viewportGeometry.current.height, top);
        if (anchor?.type === "item")
            anchor = modelAnchorFallback(anchor, viewportGeometry.current.height);
        readerAnchor.current = anchor;
        if (nativeMoved) {
            // Hide can precede the target scroll listener. Retained views must
            // adopt the same native input this published cold position holds.
            readerScrollTop.current = top;
            wheelScrollPending.current = false;
            pendingAnchor.current = undefined;
            // Notify an active observer before changing its cache, just as a
            // model write does. A hidden view has no observer and only needs
            // the cached offset that TanStack writes when it reattaches.
            virtualOffsetReport.current?.(top, virtualizer.isScrolling);
            virtualizer.scrollOffset = top;
        }
        return anchor?.type === "item"
            ? {
                  type: "row",
                  rowKey: String(anchor.key),
                  ...(anchor.fallbackKey === undefined
                      ? {}
                      : { fallbackRowKey: String(anchor.fallbackKey) }),
                  offset: anchor.itemOffset,
                  viewportInset: anchor.viewportInset,
                  viewportHeight: viewportGeometry.current.height,
                  ...(geometrySparseInset.current > 0
                      ? { leadingInset: geometrySparseInset.current }
                      : {}),
              }
            : { type: "bottom" };
    }
    const positionCurrentRef = useRef(positionCurrent);
    positionCurrentRef.current = positionCurrent;
    const positionReport = () => {
        const element = list.current;
        if (!element || !positionChange.current) return;
        positionChange.current(positionCurrentRef.current(element));
    };
    /* Model lookups use the model's own row order, which matches `items`
       except inside the commit that changed them, before the model follows. */
    function modeledItemAtIndex(index: number) {
        if (index < 0 || index >= rowSizeModel.keys.length) return undefined;
        return { size: rowSizeModel.sizes[index]!, start: rowSizeModel.starts[index]! };
    }
    function modeledItemAtOffset(offset: number) {
        const keys = rowSizeModel.keys;
        let lower = 0;
        let upper = keys.length - 1;
        while (lower <= upper) {
            const index = Math.floor((lower + upper) / 2);
            const start = rowSizeModel.starts[index]!;
            const size = rowSizeModel.sizes[index]!;
            if (offset < start) upper = index - 1;
            else if (offset > start + size) lower = index + 1;
            else return { index, key: keys[index]!, size, start };
        }
        const index = lower;
        const item = modeledItemAtIndex(index);
        return item ? { ...item, index, key: keys[index]! } : undefined;
    }
    /** Index of `key` among the current rows, checking `hint` first. */
    function itemIndexOf(key: Key, hint: number): number | undefined {
        if (hint >= 0 && hint < items.length && itemKeyAt(hint) === key) return hint;
        for (let index = 0; index < items.length; index += 1)
            if (itemKeyAt(index) === key) return index;
        return undefined;
    }
    /**
     * The rows a model update must lay out for where the reader is now: the
     * anchor the reader holds, or the one their scroll offset names.
     */
    function readerFocus(viewportHeight: number): MessageListLayoutFocus {
        if (following.current) return { type: "end" };
        const held = readerAnchor.current;
        const captured =
            held?.type === "item"
                ? held
                : modelAnchorCapture(viewportHeight, readerScrollTop.current);
        const anchor =
            captured?.type === "item" ? modelAnchorFallback(captured, viewportHeight) : captured;
        const index = anchor?.type === "item" ? itemIndexOf(anchor.key, anchor.index) : undefined;
        return anchor?.type === "item" && index !== undefined
            ? {
                  type: "anchor",
                  index,
                  itemOffset: anchor.itemOffset,
                  viewportInset: Math.min(anchor.viewportInset, viewportHeight),
              }
            : { type: "end" };
    }
    /**
     * The blank space above the first row: the held inset, or, without a
     * header, the spacer's free margin above a transcript shorter than the
     * viewport, which sits on the viewport's floor.
     */
    function leadingGap(viewportHeight: number): number {
        if (geometrySparseInset.current > 0 || headerLeads) return geometrySparseInset.current;
        return Math.max(
            0,
            viewportHeight - Math.max(estimatedContentHeight(), geometryExtent.current),
        );
    }
    function modelFloored(viewportHeight: number): boolean {
        return (
            readerScrollTop.current <= 1 &&
            leadingGap(viewportHeight) +
                Math.max(estimatedContentHeight(), geometryExtent.current) <=
                viewportHeight + 1
        );
    }
    function modelAnchorCapture(
        viewportHeight: number,
        scrollTop = readerScrollTop.current,
    ): MessageListVirtualAnchor | undefined {
        if (following.current || items.length === 0) return undefined;
        const viewportInset = Math.min(VIRTUAL_ANCHOR_INSET, viewportHeight);
        // Model starts exclude the leading gap; native scroll offsets
        // include it. Capture and restore the same physical row point.
        const gap = leadingGap(viewportHeight);
        const point = scrollTop + Math.max(0, viewportHeight - viewportInset) - gap;
        let item = modeledItemAtOffset(point);
        let heldPoint = point;
        if (!item || item.key === MESSAGE_LIST_FOOTER_KEY) {
            // Resizing can preserve blank space below the last row. Anchor
            // that row's end when the point lands in blank space or a changing
            // status footer, so only history owns the reader's fixed point.
            const keys = rowSizeModel.keys;
            const index =
                item?.key === MESSAGE_LIST_FOOTER_KEY
                    ? item.index - 1
                    : keys.length - (keys.at(-1) === MESSAGE_LIST_FOOTER_KEY ? 2 : 1);
            const tail = modeledItemAtIndex(index);
            if (tail) {
                item = { ...tail, index, key: keys[index]! };
                heldPoint = tail.start + tail.size;
            }
        }
        if (!item) return { scrollTop, type: "scrollTop" };
        const fallback = rowFallbackAt(item.index);
        const [fallbackChild] =
            fallback === undefined ? [] : Children.toArray([<Fragment key={fallback} />]);
        return {
            index: item.index,
            itemOffset: Math.max(0, Math.min(heldPoint - item.start, item.size)),
            key: item.key,
            ...(isValidElement(fallbackChild) && fallbackChild.key !== null
                ? { fallbackKey: fallbackChild.key }
                : {}),
            type: "item",
            viewportInset: viewportHeight - (heldPoint + gap - scrollTop),
        };
    }
    const modelAnchorCaptureCurrent = useRef(modelAnchorCapture);
    function modelAnchorFallback(
        anchor: Extract<MessageListVirtualAnchor, { type: "item" }>,
        viewportHeight: number,
    ): Extract<MessageListVirtualAnchor, { type: "item" }> {
        const current = itemIndexOf(anchor.key, anchor.index);
        if (current !== undefined) {
            if (anchor.fallbackKey !== undefined) return anchor;
            const fallback = rowFallbackAt(current);
            const [child] =
                fallback === undefined ? [] : Children.toArray([<Fragment key={fallback} />]);
            return isValidElement(child) && child.key !== null
                ? { ...anchor, fallbackKey: child.key }
                : anchor;
        }
        if (anchor.fallbackKey === undefined) return anchor;
        const index = fallbackIndexOf(anchor.fallbackKey);
        if (index === undefined) return anchor;
        return {
            type: "item",
            index,
            key: itemKeyAt(index),
            itemOffset: 0,
            viewportInset: Math.min(viewportHeight, anchor.viewportInset + anchor.itemOffset),
        };
    }
    function fallbackIndexOf(key: Key): number | undefined {
        const direct = itemIndexOf(key, 0);
        if (direct !== undefined) return direct;
        for (let index = 0; index < entryItems.length; index += 1) {
            const alias = props.rowAnchorKey?.(index);
            if (alias === undefined) continue;
            const [child] = Children.toArray([<Fragment key={alias} />]);
            if (isValidElement(child) && child.key === key) return virtualIndex(index);
        }
        return undefined;
    }
    modelAnchorCaptureCurrent.current = modelAnchorCapture;
    /**
     * The anchor that keeps `disclosure` at its place in the viewport: the
     * modeled row it sits in, at the control's offset within that row. Absent
     * outside a virtual list, or for a control that is not on screen.
     */
    function disclosureRowAnchor(
        element: HTMLElement,
        disclosure: HTMLElement,
        hold?: "above" | "row-start" | "row-start-or-control",
    ): MessageListVirtualAnchor | undefined {
        if (!virtualized) return undefined;
        const row = disclosure.closest<HTMLElement>(".happy-message-list__virtual-row");
        const index = row ? Number(row.dataset.index) : Number.NaN;
        if (!row || !Number.isInteger(index) || index < 0 || index >= items.length)
            return undefined;
        const viewportHeight = messageListViewportHeight(element);
        const viewportTop = element.getBoundingClientRect().top;
        const rowBounds = row.getBoundingClientRect();
        const collapseControl = hold === "row-start-or-control" && rowBounds.top < viewportTop;
        const rowStart =
            hold === "row-start" || (hold === "row-start-or-control" && !collapseControl);
        // A preview may start just above the viewport. Its first visible
        // point still holds the same row top while text opens below it.
        const top = rowStart
            ? Math.max(rowBounds.top, viewportTop)
            : disclosure.getBoundingClientRect().top;
        const offset = top - viewportTop;
        if (offset < 0 || offset > viewportHeight) return undefined;
        if (rowStart)
            return {
                index,
                itemOffset: top - rowBounds.top,
                key: itemKeyAt(index),
                type: "item",
                viewportInset: viewportHeight - offset,
            };
        const above = index - 1;
        const aboveSize = rowSizeModel.sizes[above];
        if (hold === "above" && above >= 0 && aboveSize !== undefined)
            /* The lower edge of the row above, which is where this row starts. */
            return {
                index: above,
                itemOffset: aboveSize,
                key: itemKeyAt(above),
                type: "item",
                viewportInset:
                    viewportHeight -
                    (row.getBoundingClientRect().top - element.getBoundingClientRect().top),
            };
        return {
            index,
            itemOffset: Math.max(0, top - rowBounds.top),
            ...(collapseControl ? { itemEndOffset: rowBounds.bottom - top } : {}),
            key: itemKeyAt(index),
            type: "item",
            viewportInset: viewportHeight - offset,
        };
    }
    const disclosureRowAnchorCurrent = useRef(disclosureRowAnchor);
    disclosureRowAnchorCurrent.current = disclosureRowAnchor;
    /**
     * Where an item anchor puts the reader in the current model. A row
     * shorter than the anchor's offset holds its lower edge at the anchor
     * point, but the anchor keeps its own offset: a width that shrank the
     * row and then a width that restores it return the reader to the same
     * pixel, rather than to wherever the shorter row clamped it.
     */
    function modelAnchorPlace(
        anchor: Extract<MessageListVirtualAnchor, { type: "item" }>,
        viewportHeight: number,
    ) {
        const index = itemIndexOf(anchor.key, anchor.index);
        const item = index === undefined ? undefined : modeledItemAtIndex(index);
        if (index === undefined || !item) return undefined;
        const point =
            item.start +
            Math.min(anchor.itemOffset, item.size) -
            Math.max(0, viewportHeight - anchor.viewportInset);
        /* A transcript on the viewport's floor cannot scroll: its rows sit
           where the floor puts them. Placing a point any lower needs held
           space, which takes the floor gap away, so it counts only the held
           inset, as every scrolled transcript does. */
        const floored = leadingGap(viewportHeight) + point;
        return floored <= 0
            ? { index, scrollTop: 0, floored: true, clamped: floored < 0 }
            : {
                  index,
                  scrollTop: geometrySparseInset.current + point,
                  floored: false,
                  clamped: false,
              };
    }
    /** Whether this point was actually painted, rather than clamped by a floor. */
    function modelAnchorRealized(
        anchor: Extract<MessageListVirtualAnchor, { type: "item" }>,
        viewportHeight: number,
        scrollTop: number,
    ): boolean {
        const keys = rowSizeModel.keys;
        const index = keys[anchor.index] === anchor.key ? anchor.index : keys.indexOf(anchor.key);
        const item = modeledItemAtIndex(index);
        return (
            item !== undefined &&
            Math.abs(
                leadingGap(viewportHeight) +
                    item.start +
                    anchor.itemOffset -
                    scrollTop -
                    (viewportHeight - anchor.viewportInset),
            ) <= 1
        );
    }
    function modelAnchorRestore(anchor: MessageListVirtualAnchor, viewportHeight: number) {
        const element = list.current;
        if (!element || following.current) return false;
        if (anchor.type === "scrollTop") {
            geometryExtentRequire(anchor.scrollTop, viewportHeight);
            readerAnchor.current = anchor;
            scrollTopWrite(element, anchor.scrollTop);
            return true;
        }
        const place = modelAnchorPlace(anchor, viewportHeight);
        if (!place) {
            readerAnchor.current = undefined;
            return false;
        }
        // A floored place is where the floor already puts the rows; held
        // space would take that floor away.
        if (!place.floored) geometryExtentRequire(place.scrollTop, viewportHeight);
        // Pending restoration may still use the previous viewport. Persist its
        // point in the current basis before the offset report can render again.
        readerAnchor.current = {
            ...anchor,
            index: place.index,
            viewportInset: anchor.viewportInset + viewportGeometry.current.height - viewportHeight,
        };
        scrollTopWrite(element, place.scrollTop, (top) => {
            // A clamp or a growing dock can leave the old point outside the
            // viewport. Hold the point actually painted in the new geometry,
            // before reporting that offset can render another range.
            const held = readerAnchor.current;
            if (
                place.clamped ||
                Math.abs(top - place.scrollTop) > 1 ||
                (held?.type === "item" &&
                    (held.viewportInset < 0 ||
                        held.viewportInset > viewportGeometry.current.height))
            )
                readerAnchor.current = modelAnchorCapture(viewportGeometry.current.height, top);
        });
        return true;
    }
    /**
     * Lays out every pending row within overscan of the viewport, in one
     * synchronous commit, before a gesture that could scroll one into view
     * takes effect. Idle refinement normally got there first.
     */
    function overscanRequire() {
        const element = list.current;
        const rowWidth = rowSizeModel.width;
        if (!virtualized || !element || rowWidth === undefined || rowSizeModel.pending === 0)
            return;
        const count = rowSizeModel.keys.length;
        const top = modeledItemAtOffset(element.scrollTop)?.index ?? 0;
        const bottom =
            modeledItemAtOffset(element.scrollTop + element.clientHeight)?.index ?? count - 1;
        const first = Math.max(0, top - MESSAGE_LIST_OVERSCAN);
        const last = Math.min(count - 1, bottom + MESSAGE_LIST_OVERSCAN);
        let pending = false;
        for (let index = first; index <= last && !pending; index += 1)
            pending = !rowSizeModel.exact[index];
        if (!pending) return;
        const viewportHeight = viewportGeometry.current.height || element.clientHeight;
        flushSync(() => {
            const scrollTopAnchor = readerAnchor.current?.type === "scrollTop";
            const anchor = following.current
                ? undefined
                : refinementAnchor(element, viewportHeight);
            if (anchor) pendingAnchor.current ??= { anchor, viewportHeight, scrollTopAnchor };
            rowSizeModelLayout(rowWidth, items.length, { type: "rows", first, last });
        });
    }
    /** The anchor a refinement holds still: the reader's own, or the one their offset names. */
    function refinementAnchor(element: HTMLElement, viewportHeight: number) {
        const held = readerAnchor.current;
        return held?.type === "item" ? held : modelAnchorCapture(viewportHeight, element.scrollTop);
    }
    /**
     * One idle refinement slice. It lays pending rows out into the caller's
     * size cache, nearest the reader first, without touching the model. A row
     * may prepare across slices, but only complete rows can be published: the
     * model and DOM must never disagree. When every pending row is laid out, or the
     * oldest has waited `ROW_REFINE_COMMIT_MS`, one synchronous commit
     * publishes them all — the model, the DOM, and the reader's position
     * change together, and the rows it asks again are cache hits.
     */
    function rowSizeModelRefine(slice: number) {
        const element = list.current;
        const rowWidth = rowSizeModel.width;
        if (!element || rowWidth === undefined || rowSizeModel.pending === 0) return;
        const viewportHeight = viewportGeometry.current.height || element.clientHeight;
        const sliceStart = performance.now();
        const deadline = sliceStart + slice;
        const count = rowSizeModel.keys.length;
        let refined = rowSizeModel.refined;
        if (!refined) {
            const focus = readerFocus(viewportHeight);
            const center = focus.type === "anchor" ? focus.index : Math.max(0, count - 1);
            refined = { center, first: center, last: center, since: sliceStart };
            rowSizeModel.refined = refined;
        }
        const warm = (index: number): boolean => {
            if (rowSizeModel.exact[index]) return true;
            if (props.prepareRowSize) {
                const active = (refined.active ??= {
                    index,
                    work: props.prepareRowSize(entryIndex(index), rowWidth),
                });
                do {
                    if (active.work.next().done) {
                        refined.active = undefined;
                        return true;
                    }
                } while (performance.now() < deadline);
                return false;
            }
            estimateItemSize(index, rowWidth);
            return true;
        };
        /* Retain the iterator across idle callbacks. Its boundary is included
           only once complete, so a timed publication cannot synchronously size
           an unfinished row. Input/width changes discard the whole refinement. */
        if (refined.active) {
            const index = refined.active.index;
            if (!warm(index)) {
                refinementSchedule();
                return;
            }
            refined.first = Math.min(refined.first, index);
            refined.last = Math.max(refined.last, index);
        } else if (!warm(refined.center)) {
            refinementSchedule();
            return;
        }
        while (refined.first > 0 || refined.last < count - 1) {
            if (
                performance.now() >= deadline ||
                performance.now() - refined.since >= ROW_REFINE_COMMIT_MS
            )
                break;
            if (refined.first > 0) {
                if (!warm(refined.first - 1)) break;
                refined.first -= 1;
            }
            if (
                performance.now() >= deadline ||
                performance.now() - refined.since >= ROW_REFINE_COMMIT_MS
            )
                break;
            if (refined.last < count - 1) {
                if (!warm(refined.last + 1)) break;
                refined.last += 1;
            }
        }
        const complete = refined.first === 0 && refined.last === count - 1;
        if (
            refined.active ||
            (!complete && performance.now() - refined.since < ROW_REFINE_COMMIT_MS)
        ) {
            refinementSchedule();
            return;
        }
        const { first, last } = refined;
        flushSync(() => {
            const scrollTopAnchor = readerAnchor.current?.type === "scrollTop";
            const anchor = refinementAnchor(element, viewportHeight);
            if (anchor) pendingAnchor.current ??= { anchor, viewportHeight, scrollTopAnchor };
            rowSizeModelLayout(rowWidth, items.length, { type: "rows", first, last });
        });
    }
    function viewportGeometryCommit(nextWidth: number, nextHeight: number) {
        if (rowSizeModel.width !== undefined && !rowModelCurrent()) {
            pendingViewportGeometry.current = { width: nextWidth, height: nextHeight };
            return;
        }
        pendingViewportGeometry.current = undefined;
        const previous = viewportGeometry.current;
        const previouslyFloored = pendingAnchor.current?.floored ?? modelFloored(previous.height);
        const element = list.current;
        const scale =
            element && nextWidth > 0
                ? (element.getBoundingClientRect().width / nextWidth) *
                  element.ownerDocument.defaultView!.devicePixelRatio
                : viewportScale.current;
        const zoomChanged =
            viewportScale.current > 0 && Math.abs(scale / viewportScale.current - 1) > 0.01;
        if (zoomChanged) {
            // Held blank space has a physical size. Counter a zoom instead of
            // magnifying it until the transcript has left the visible viewport.
            const natural = estimatedContentHeight();
            const ratio = viewportScale.current / scale;
            const blank = Math.min(
                Math.max(0, geometryExtent.current - natural) * ratio,
                nextHeight * (1 - LEADING_HEADER_REST_TOP),
            );
            geometryExtent.current = blank > 0 ? natural + blank : 0;
            if (virtualContent.current)
                virtualContent.current.style.minHeight =
                    blank > 0 ? `${String(geometryExtent.current)}px` : "";
            geometryPlacementPending.current = following.current;
        }
        viewportScale.current = scale;
        if (previous.width === nextWidth && previous.height === nextHeight && !zoomChanged) return;
        const nextRowWidth = messageListRowWidth(nextWidth, estimateRowWidth);
        if (rowSizeModel.width === undefined) {
            /* The first report: there is no earlier geometry to keep a reader
               anchored in, only the model to build at its real width. A
               scrollport with no width yet has nothing to model rows at. */
            if (nextRowWidth <= 0) return;
            const opening = following.current ? undefined : restore.current;
            const openingHeight =
                opening && "type" in opening && opening.type === "row"
                    ? (opening.viewportHeight ?? nextHeight)
                    : nextHeight;
            // Build the saved viewport first. The next report passes its
            // resize through the same geometry transition as a retained view.
            viewportGeometry.current = { height: openingHeight, width: nextWidth };
            if (
                opening &&
                "type" in opening &&
                opening.type === "row" &&
                opening.leadingInset !== undefined
            ) {
                if (headerLeads) headerRestHold(opening.leadingInset);
                else {
                    geometrySparseInset.current = opening.leadingInset;
                    if (spacer.current)
                        spacer.current.style.marginTop = `${opening.leadingInset}px`;
                }
            }
            headerRestApply();
            if (opening !== undefined && "type" in opening) {
                /* A saved anchor names its row by key. Lay out that row and the
                   viewport around it; the rows above it are laid out later
                   without moving the reader, so the restore never waits for
                   the history above what the reader was reading. */
                const rowKey = opening.type === "row" ? opening.rowKey : undefined;
                let index = items.findIndex(
                    (_item, candidate) => String(itemKeyAt(candidate)) === rowKey,
                );
                let folded = false;
                if (index < 0 && opening.type === "row" && opening.fallbackRowKey !== undefined) {
                    index = fallbackIndexOf(opening.fallbackRowKey) ?? -1;
                    folded = index >= 0;
                }
                if (opening.type === "row" && index >= 0) {
                    const anchor: Extract<MessageListVirtualAnchor, { type: "item" }> = {
                        type: "item",
                        index,
                        itemOffset: folded ? 0 : opening.offset,
                        key: itemKeyAt(index),
                        ...(!folded && opening.fallbackRowKey !== undefined
                            ? { fallbackKey: opening.fallbackRowKey }
                            : {}),
                        viewportInset: Math.min(
                            (opening.viewportInset ?? VIRTUAL_ANCHOR_INSET) +
                                (folded ? opening.offset : 0),
                            openingHeight,
                        ),
                    };
                    readerAnchor.current = anchor;
                    rowSizeModelLayout(nextRowWidth, 0, readerFocus(openingHeight));
                    openingScrollTop.current = modelAnchorPlace(anchor, openingHeight)?.scrollTop;
                    return;
                }
                /* The row is gone: the reader returns to the newest content. */
                following.current = true;
                escapedFromFollow.current = false;
            }
            rowSizeModelLayout(
                nextRowWidth,
                0,
                opening === undefined || "type" in opening
                    ? { type: "end" }
                    : { type: "offset", offset: opening.scrollTop },
            );
            return;
        }
        const previousHeight = previous.height || nextHeight;
        if (nextHeight !== previousHeight && !zoomChanged) {
            geometryExtentResized.current = geometryExtent.current > estimatedContentHeight();
            geometryExtentOffscreenRelease(readerScrollTop.current, previousHeight);
        }
        const widthChanged = nextRowWidth !== rowSizeModel.width;
        let floorShrank = false;
        if (
            element &&
            virtualContent.current &&
            (!zoomChanged || (previouslyFloored && nextHeight < previousHeight)) &&
            nextHeight !== previousHeight &&
            /* Rows that fit under a resting header stay with it, as it
               re-centres in the new scrollport. */
            !(headerLeads && estimatedContentHeight() <= previousHeight)
        ) {
            const naturalHeight = estimatedContentHeight();
            const wasFloored = previouslyFloored;
            floorShrank = wasFloored && nextHeight < previousHeight;
            if (nextHeight < previousHeight && geometryExtent.current > naturalHeight) {
                // Any shrinking viewport takes existing tail space first.
                // Once it is exhausted, following carries rows one-for-one.
                geometryExtent.current -= Math.min(
                    previousHeight - nextHeight,
                    geometryExtent.current - naturalHeight,
                );
                virtualContent.current.style.minHeight = `${String(geometryExtent.current)}px`;
            }
            let inset =
                geometrySparseInset.current ||
                Math.max(0, previousHeight - Math.max(naturalHeight, geometryExtent.current));
            if (nextHeight < previousHeight) {
                if (following.current || wasFloored)
                    inset = Math.min(inset, Math.max(0, nextHeight - naturalHeight));
                else {
                    const held =
                        pendingAnchor.current?.anchor ??
                        readerAnchor.current ??
                        modelAnchorCapture(previousHeight);
                    const heldHeight = pendingAnchor.current?.viewportHeight ?? previousHeight;
                    const point =
                        held?.type === "item"
                            ? heldHeight - held.viewportInset
                            : previousHeight - Math.min(VIRTUAL_ANCHOR_INSET, previousHeight);
                    if (point > nextHeight) {
                        const correction =
                            point - (nextHeight - Math.min(VIRTUAL_ANCHOR_INSET, nextHeight));
                        const gap = Math.min(inset, correction);
                        inset -= gap;
                    }
                }
            }
            if (inset !== geometrySparseInset.current) {
                geometrySparseInset.current = inset;
                if (inset === 0) spacerHoldRelease();
                else if (headerLeads) spacer.current!.style.height = `${String(inset)}px`;
                else spacer.current!.style.marginTop = `${String(inset)}px`;
            }
            if (inset > 0) {
                geometrySparseInset.current = inset;
                // A held header gap is already pinned as the spacer's height.
                if (!headerLeads) spacer.current!.style.marginTop = `${String(inset)}px`;
            }
            const extent = readerScrollTop.current + nextHeight - inset;
            if (extent > naturalHeight) {
                geometryExtent.current = Math.max(geometryExtent.current, extent);
                virtualContent.current.style.minHeight = `${String(geometryExtent.current)}px`;
            }
            /* A shorter viewport (a growing composer) leaves the inset as it
               was, so the follower keeps its bottom in view and the transcript
               rises with the composer. A taller one is held by the extent.
               Rows appended in this same commit must still follow: the new
               height may consume a withheld inset, never create more of it. */
            if (following.current && nextHeight > previousHeight)
                geometryFollowInset.current = Math.min(
                    geometryFollowInset.current,
                    Math.max(
                        0,
                        Math.max(naturalHeight, geometryExtent.current) +
                            inset -
                            nextHeight -
                            readerScrollTop.current,
                    ),
                );
        }
        // A proportional cap changes the carry rate as the window crosses it.
        // The shrink above consumes one pixel of blank per pixel of drag.
        if (nextHeight !== previousHeight && !zoomChanged)
            geometryExtentResized.current = geometryExtent.current > estimatedContentHeight();
        const pending = pendingAnchor.current;
        const heldAnchor =
            pending?.anchor ?? readerAnchor.current ?? modelAnchorCapture(previousHeight);
        const heldHeight = pending?.viewportHeight ?? previousHeight;
        let nextInset =
            heldAnchor?.type === "item" ? heldAnchor.viewportInset + nextHeight - heldHeight : 0;
        if (floorShrank && heldAnchor?.type === "item") {
            const index = itemIndexOf(heldAnchor.key, heldAnchor.index);
            const item = index === undefined ? undefined : modeledItemAtIndex(index);
            if (item) {
                // Releasing the floor gap raises the rows first. Keep a point
                // that is still visible there; otherwise carry its previous
                // bottom inset into the shorter viewport.
                const point =
                    leadingGap(nextHeight) +
                    item.start +
                    Math.min(heldAnchor.itemOffset, item.size) -
                    readerScrollTop.current;
                if (point >= 0 && point <= nextHeight) nextInset = nextHeight - point;
                else {
                    const inset = heldAnchor.viewportInset + previousHeight - heldHeight;
                    const globalPoint = point + readerScrollTop.current;
                    const requestedTop = globalPoint - Math.max(0, nextHeight - inset);
                    const maximumTop = Math.max(
                        0,
                        Math.max(estimatedContentHeight(), geometryExtent.current) +
                            geometrySparseInset.current -
                            nextHeight,
                    );
                    const top = Math.max(0, Math.min(requestedTop, maximumTop));
                    // A floor restore may use held space, but cannot create
                    // more blank space just to reach the previous bottom inset.
                    nextInset = nextHeight - (globalPoint - top);
                }
            }
        }
        // A height change moves the viewport's lower edge, not the reader's
        // screen position. Carry the same row point through that resize.
        const anchor =
            heldAnchor?.type === "item"
                ? {
                      ...heldAnchor,
                      viewportInset: nextInset,
                  }
                : heldAnchor;
        const focus = readerFocus(previousHeight);
        viewportGeometry.current = { height: nextHeight, width: nextWidth };
        headerRestApply();
        if (anchor) pendingAnchor.current = { ...pending, anchor, viewportHeight: nextHeight };
        if (widthChanged) {
            rowSizeModelLayout(nextRowWidth, 0, focus);
            return;
        }
        if (!element) return;
        if (following.current) scrollBottomFollow(element, nextHeight);
        else if (anchor) {
            modelAnchorRestore(anchor, nextHeight);
            pendingAnchor.current = undefined;
        } else if (previous.height !== 0 && previous.height !== nextHeight) {
            scrollTopWrite(element, readerScrollTop.current + previousHeight - nextHeight);
        }
        positionReport();
    }
    viewportGeometryCommitCurrent.current = viewportGeometryCommit;
    function rowModelCurrent() {
        return (
            !virtualized ||
            (rowSizeModel.keys.length === items.length &&
                props.estimateRows === modelInputs.current.rows &&
                props.estimateVersion === modelInputs.current.estimateVersion)
        );
    }
    const observeScrollportRect = (
        instance: Virtualizer<HTMLDivElement, HTMLElement>,
        report: (rect: { width: number; height: number }) => void,
    ) => {
        const element = instance.scrollElement;
        const targetWindow = instance.targetWindow;
        if (!element || !targetWindow) return;
        const reportRect = (width: number, height: number) => {
            const rect = { width, height: Math.round(height) };
            report(rect);
        };
        const width = messageListViewportWidth(element);
        const height = messageListViewportHeight(element);
        viewportGeometryCommitCurrent.current(width, height);
        reportRect(width, height);
        const geometryChanged: ResizeObserverCallback = (entries) => {
            const width = entries[0]!.contentRect.width;
            const height = entries[0]!.contentRect.height;
            /* ResizeObserver runs after layout. Rebuild every keyed size from
               that fractional content box before publishing the rect to
               TanStack. Rounding up can lose a wrapped line and overlap the
               next row; even two widths with the same clientWidth can reflow. */
            flushSync(() => {
                viewportGeometryCommitCurrent.current(width, height);
                reportRect(width, height);
            });
        };
        const observer = targetWindow.ResizeObserver
            ? new targetWindow.ResizeObserver(geometryChanged)
            : undefined;
        /* Observe the viewport's content box: that width is the measure every
           virtual row actually paints at and must rebuild the whole keyed size
           model. The overlaid scrollbar never changes it. */
        observer?.observe(element);
        return () => {
            observer?.unobserve(element);
        };
    };
    /*
     * Overscan mounts a row beyond the visible range only once it is laid out,
     * and keeps a row it already mounted. Laying out overscan before the commit
     * that first shows the viewport would make every row near it mandatory
     * work; idle refinement lays them out instead, nearest first, and the
     * commits after publication mount them one at a time during idle periods.
     * A mounted overscan row a new
     * width made pending stays mounted, offscreen, so a resize never remounts
     * the rows around the reader; any gesture that could scroll one into view
     * lays them out first (`overscanRequire`). The model version is this
     * function's identity, because TanStack recomputes the range only when
     * that or the visible range changes.
     */
    const mountedKeys = useRef<ReadonlySet<Key>>(new Set());
    /* The way back to the end, shown while the reader is far enough from it.
       Shown and hidden on the element itself: a commit here, between a scroll
       and the event reporting it, would hold the reader's old place. */
    const jump = useRef<HTMLDivElement>(null);
    const endAwayUpdate = (element: HTMLElement) => {
        const button = jump.current;
        if (!button) return;
        const height = viewportGeometry.current.height || element.clientHeight;
        /* The modeled end, as following reads it: no layout is forced to know it. */
        const total = virtualized
            ? Math.max(estimatedContentHeight(), geometryExtent.current) +
              geometrySparseInset.current
            : element.scrollHeight;
        const away = !following.current && total - height - element.scrollTop > height / 3;
        if (button.hidden === !away) return;
        button.hidden = !away;
    };
    const endAwayUpdateCurrent = useRef(endAwayUpdate);
    endAwayUpdateCurrent.current = endAwayUpdate;
    /** Takes the reader back to the newest row, following it from there. */
    const jumpToEnd = () => {
        const element = list.current;
        if (!element) return;
        geometryFollowInset.current = 0;
        escapedFromFollow.current = false;
        following.current = true;
        pendingAnchor.current = undefined;
        readerAnchor.current = undefined;
        sparseInsetRelease();
        scrollBottomFollow(element);
        endAwayUpdate(element);
    };
    const visibleRowsReported = useRef<{ first: number; last: number; rows: number } | undefined>(
        undefined,
    );
    const admittedKeys = useRef<ReadonlySet<Key>>(new Set());
    /* Prepending history or accepting queued messages can move a mounted row
       beyond the old range before its row model is committed. Keep its key in
       that intermediate range too, preserving its DOM until the anchor moves
       the range. Only relocated mounted rows need the full key scan. */
    const relocatedIndexes: number[] = [];
    if (
        rowSizeModel.width !== undefined &&
        mountedRows.current.some(({ key, index }) => itemKeyAt(index) !== key)
    )
        for (let index = 0; index < items.length; index += 1)
            if (mountedKeys.current.has(itemKeyAt(index))) relocatedIndexes.push(index);
    const [overscanMountVersion, setOverscanMountVersion] = useState(0);
    const rangeExtractor = useRef<
        | {
              readonly version: number;
              readonly mountVersion: number;
              readonly relocatedIndexes: readonly number[];
              readonly extract: (range: Range) => number[];
          }
        | undefined
    >(undefined);
    if (
        rangeExtractor.current?.version !== rowSizeModel.version ||
        rangeExtractor.current.mountVersion !== overscanMountVersion ||
        rangeExtractor.current.relocatedIndexes.length !== relocatedIndexes.length ||
        rangeExtractor.current.relocatedIndexes.some(
            (index, offset) => index !== relocatedIndexes[offset],
        )
    )
        rangeExtractor.current = {
            version: rowSizeModel.version,
            mountVersion: overscanMountVersion,
            relocatedIndexes,
            extract: (range) => {
                const indexes: number[] = [];
                const first = Math.max(0, range.startIndex - range.overscan);
                const last = Math.min(range.count - 1, range.endIndex + range.overscan);
                for (let index = first; index <= last; index += 1) {
                    const key = itemKeyAtCurrent.current(index);
                    if (
                        (index >= range.startIndex && index <= range.endIndex) ||
                        (admittedKeys.current.has(key) &&
                            rowSizeModel.exact[index] === true &&
                            rowSizeModel.keys[index] === key) ||
                        mountedKeys.current.has(key)
                    )
                        indexes.push(index);
                }
                if (relocatedIndexes.length === 0) return indexes;
                return [...new Set([...indexes, ...relocatedIndexes])].sort(
                    (left, right) => left - right,
                );
            },
        };
    // TanStack Virtual deliberately owns mutable measurement functions; this leaf
    // remains outside compiler memoization while every rendered row stays eligible.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        /* Happy pins a true follower after TanStack publishes final geometry.
           Start anchoring keeps edge-key changes from independently moving a
           parked reader; the semantic bottom-edge anchor below owns that case. */
        anchorTo: "start",
        count: virtualized ? items.length : 0,
        estimateSize: (index) =>
            rowSizeModel.keys[index] === itemKeyAt(index)
                ? rowSizeModel.sizes[index]!
                : ROW_SIZE_FALLBACK,
        getItemKey: virtualItemKey,
        getScrollElement: () => list.current,
        observeElementOffset: (instance, report) => {
            virtualOffsetReport.current = report;
            let observing = true;
            const unobserve = observeElementOffset(instance, (offset, scrolling) => {
                // TanStack's debounce can outlive unobserve. A hidden view no
                // longer has a native element to validate its captured offset.
                if (!observing) return;
                // An idle callback can retain the native offset from before a
                // model-owned restore. Its later scroll event has not arrived
                // yet; read back that write instead of mounting the old range.
                if (!scrolling) {
                    const current = instance.scrollElement?.scrollTop;
                    if (current !== undefined && current !== offset) offset = current;
                }
                report(offset, scrolling);
            });
            return () => {
                observing = false;
                virtualOffsetReport.current = undefined;
                unobserve?.();
            };
        },
        observeElementRect: observeScrollportRect,
        /* Opening a conversation lands on its newest content, which means the
           first offset has to be the height of everything above it. Counting
           every row at the generic fallback got that badly wrong whenever real
           rows were taller — the list opened part way up its own history — so
           the caller's model answers for each row exactly as it does for every
           later layout. The list reads no virtual items before that model
           exists, which is what keeps TanStack from asking for this early. */
        initialOffset: virtualized ? initialScrollTop : 0,
        overscan: MESSAGE_LIST_OVERSCAN,
        rangeExtractor: rangeExtractor.current.extract,
        /*
         * These are the same visual clearances the non-virtual list owns in CSS.
         * Keeping them here makes row starts, total size, scrollTop, anchoring,
         * and restored scroll positions use one coordinate system.
         */
        paddingEnd,
        paddingStart: MESSAGE_LIST_PADDING_START,
    });
    function visibleRowsReport(element: HTMLElement) {
        const range = virtualizer.range;
        const report = props.onVisibleRowsChange;
        if (!report) visibleRowsReported.current = undefined;
        if (!report || !range || viewportGeometry.current.height <= 0) return;
        const first = entryIndex(range.startIndex);
        const last = Math.min(
            entryItems.length - 1,
            entryIndex(range.endIndex) - (range.endIndex === footerIndex ? 1 : 0),
        );
        const rows = entryItems.length;
        const reported = visibleRowsReported.current;
        // Rows arriving or leaving move what the indices name, so they report too.
        if (reported?.first === first && reported.last === last && reported.rows === rows) return;
        visibleRowsReported.current = { first, last, rows };
        report(first, last, element);
    }
    /** Exact geometry can be published without mounting every newly ready row.
     * Mount one offscreen neighbour per idle callback: a burst of table/Markdown
     * mounts otherwise spends an entire task in React commit and forced layout. */
    function nextOverscanMount(): Key | undefined {
        const range = virtualizer.range;
        if (!virtualized || !range) return undefined;
        for (let distance = 1; distance <= MESSAGE_LIST_OVERSCAN; distance += 1) {
            for (const index of [range.startIndex - distance, range.endIndex + distance]) {
                if (index < 0 || index >= items.length) continue;
                const key = itemKeyAt(index);
                if (
                    !mountedKeys.current.has(key) &&
                    rowSizeModel.exact[index] &&
                    rowSizeModel.keys[index] === key
                )
                    return key;
            }
        }
        return undefined;
    }
    function overscanMountSchedule() {
        const targetWindow = list.current?.ownerDocument.defaultView;
        if (overscanMountCancel.current || !targetWindow || nextOverscanMount() === undefined)
            return;
        const run = () => {
            overscanMountCancel.current = undefined;
            overscanMountCurrent.current();
        };
        if (typeof targetWindow.requestIdleCallback === "function") {
            const id = targetWindow.requestIdleCallback(run, { timeout: 250 });
            overscanMountCancel.current = () => targetWindow.cancelIdleCallback(id);
        } else {
            const id = targetWindow.setTimeout(run, 16);
            overscanMountCancel.current = () => targetWindow.clearTimeout(id);
        }
    }
    /* Whether this render's DOM carries the row model. A virtual list's first
       render has no width to model rows at, so it paints no rows and must not
       position the reader against that placeholder. */
    const modelRendered = !virtualized || rowSizeModel.width !== undefined;
    /* Moving the footer can reorder rows without changing their count. Until
       this commit's measure runs, TanStack can return the previous keys at
       those indexes. Pair each rendered child with its current entity key so
       React preserves the message while the modeled offsets catch up. */
    const virtualItems = modelRendered
        ? virtualizer.getVirtualItems().map((item) => {
              const key = itemKeyAt(item.index);
              return item.key === key ? item : { ...item, key };
          })
        : [];
    // eslint-disable-next-line happy-react/no-layout-effect -- streaming React commits publish a new modeled scrollHeight; a follower must pin in this same pre-paint commit
    useLayoutEffect(() => {
        headerRestApply();
        rowSizeModelRefineCurrent.current = rowSizeModelRefine;
        // Scroll-height reads must see this commit's tables at their solved widths.
        markdownTablesSolve();
        overscanRequireCurrent.current = overscanRequire;
        mountedKeys.current = new Set(virtualItems.map((item) => item.key));
        mountedRows.current = virtualItems.map(({ key, index }) => ({ key, index }));
        admittedKeys.current = mountedKeys.current;
        overscanMountCurrent.current = () => {
            const next = nextOverscanMount();
            if (next === undefined) return;
            admittedKeys.current = new Set([...mountedKeys.current, next]);
            flushSync(() => setOverscanMountVersion((version) => version + 1));
        };
        overscanMountSchedule();
        const element = list.current;
        if (!element || !modelRendered) return;
        if (!rowModelCurrent()) return;
        visibleRowsReport(element);
        endAwayUpdate(element);
        const actualHeight = messageListViewportHeight(element);
        const geometry =
            pendingViewportGeometry.current ??
            (Math.abs(actualHeight - viewportGeometry.current.height) > 1 / 64
                ? { width: messageListViewportWidth(element), height: actualHeight }
                : undefined);
        if (geometry) {
            const version = rowSizeModel.version;
            viewportGeometryCommit(geometry.width, geometry.height);
            if (rowSizeModel.version !== version) return;
        }
        geometryExtentCommit();
        if (geometryPlacementPending.current) {
            geometryPlacementPending.current = false;
            geometryFollowInset.current = Math.min(
                geometryFollowInset.current,
                footerIndex === undefined ? 0 : (rowSizeModel.sizes[footerIndex] ?? 0),
            );
            pendingFollowerTop.current = Math.max(
                0,
                Math.max(estimatedContentHeight(), geometryExtent.current) +
                    geometrySparseInset.current -
                    viewportGeometry.current.height -
                    geometryFollowInset.current,
            );
        }
        if (!following.current) pendingFollowerTop.current = undefined;
        if (!initialPositionApplied.current) {
            initialPositionApplied.current = true;
            pendingAnchor.current = undefined;
            if (following.current) scrollBottomFollow(element);
            else {
                const opening = restore.current;
                if (
                    readerAnchor.current &&
                    opening &&
                    "type" in opening &&
                    opening.type === "row" &&
                    opening.viewportHeight !== undefined
                )
                    modelAnchorRestore(readerAnchor.current, viewportGeometry.current.height);
                else
                    scrollTopWrite(
                        element,
                        openingScrollTop.current ?? readerScrollTop.current,
                        (top) => {
                            const held = readerAnchor.current;
                            if (
                                held?.type === "item" &&
                                !modelAnchorRealized(held, viewportGeometry.current.height, top)
                            )
                                readerAnchor.current = modelAnchorCapture(
                                    viewportGeometry.current.height,
                                    top,
                                );
                        },
                    );
                /* A restored anchor is the reader's fixed point already. */
                readerAnchor.current ??= modelAnchorCapture(viewportGeometry.current.height);
            }
        } else if (following.current) {
            pendingAnchor.current = undefined;
            readerAnchor.current = undefined;
            if (pendingFollowerTop.current !== undefined) {
                const top = pendingFollowerTop.current;
                pendingFollowerTop.current = undefined;
                scrollTopWrite(element, top);
            } else if (readerScrollTop.current > element.scrollTop) {
                // A shorter footer or disclosure may clamp native scrollTop
                // before this commit. Keep its previous extent and position.
                const top = readerScrollTop.current;
                geometryExtentRequire(top, viewportGeometry.current.height);
                scrollTopWrite(element, top);
            }
            if (followSentHold.current !== undefined && followSentHold.current !== items.length) {
                followSentHold.current = undefined;
                geometryFollowInset.current = 0;
            }
            /* A resting header's gap is held once a row lands under it, so
               the rows that follow fill the space under it instead of moving
               the header. */
            if (headerLeads && entryItems.length > 0) headerRestHold(headerRestGap());
            const followed = followSentPending.current;
            followSentPending.current = undefined;
            if (followed !== undefined) sentStartKeep(element, followed);
            scrollBottomFollow(element);
        } else if (pendingAnchor.current) {
            const pending = pendingAnchor.current;
            pendingAnchor.current = undefined;
            if (
                modelAnchorRestore(pending.anchor, pending.viewportHeight) &&
                pending.scrollTopAnchor
            )
                readerAnchor.current = { scrollTop: element.scrollTop, type: "scrollTop" };
        }
        /* A transcript that fits the scrollport has no scrolling left to do, so
           no gesture of the reader's will ever reach past its oldest row. Ask
           for the page before it here — once per content height, so a commit
           that added nothing does not ask twice. A list that does scroll is the
           reader's to drive, and asks from `onScroll` instead. */
        if (
            element.scrollHeight - element.clientHeight <= START_REACHED_THRESHOLD &&
            element.scrollHeight !== startReportedHeight.current
        )
            startReachedReport(element);
    });
    const modelInputs = useRef({
        dependencies: props.estimateDependencies
            ? [...props.estimateDependencies]
            : [props.children],
        estimateVersion: props.estimateVersion,
        footerIndex,
        rows: props.estimateRows,
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- authoritative row data changes rebuild modeled offsets before the browser can paint the new rows; the caller supplies the semantic dependency list
    useLayoutEffect(() => {
        const dependencies = props.estimateDependencies ?? [props.children];
        const rows = props.estimateRows;
        const previous = modelInputs.current;
        modelInputs.current = {
            dependencies: previous.dependencies,
            estimateVersion: props.estimateVersion,
            footerIndex,
            rows,
        };
        /* The first row whose estimate may differ from the model's, or the
           row count when none can. */
        let from = items.length;
        if (
            previous.estimateVersion !== props.estimateVersion ||
            previous.dependencies.length !== dependencies.length ||
            previous.dependencies.some(
                (dependency, index) => !Object.is(dependency, dependencies[index]),
            )
        ) {
            modelInputs.current.dependencies = [...dependencies];
            from = 0;
        } else if (rows !== previous.rows) {
            if (rows === undefined || previous.rows === undefined) from = 0;
            else {
                const shared = Math.min(rows.length, previous.rows.length);
                let changed = 0;
                while (changed < shared && Object.is(rows[changed], previous.rows[changed]))
                    changed += 1;
                /* The row before the first change reads it as its successor. */
                if (changed < shared || rows.length !== previous.rows.length)
                    from = Math.max(0, virtualIndex(changed) - 1);
            }
        }
        /* Before the first scrollport report there is no model to update; that
           report builds it from these same inputs. */
        const element = list.current;
        const rowWidth = rowSizeModel.width;
        if (!virtualized || !element || rowWidth === undefined) return;
        /* The model holds one size per row, whatever the caller reported. */
        if (items.length !== rowSizeModel.keys.length)
            from = Math.min(
                from,
                Math.max(0, Math.min(items.length, rowSizeModel.keys.length) - 1),
            );
        /* Moving the footer also changes the old predecessor's closing
           padding, even when the caller's entry identities did not change. */
        if (previous.footerIndex !== undefined && previous.footerIndex !== footerIndex) {
            const previousLast = previous.footerIndex - 1;
            const key = rowSizeModel.keys[previousLast];
            const index = key === undefined ? undefined : itemIndexOf(key, previousLast);
            if (
                index !== undefined &&
                from > index &&
                rowSizeModel.sizes[previousLast] !== estimateItemSize(index, rowWidth)
            )
                from = index;
        }
        /* The footer reads state outside the rows, so it is asked on every
           commit, and so is the row above it, which reads the footer's state as
           its successor: a live turn starting or ending changes those two rows,
           not the history above them. */
        const lastRow = footerIndex === undefined ? undefined : footerIndex - 1;
        if (
            lastRow !== undefined &&
            lastRow >= 0 &&
            from > lastRow &&
            (rowSizeModel.keys[lastRow] !== itemKeyAt(lastRow) ||
                rowSizeModel.sizes[lastRow] !== estimateItemSize(lastRow, rowWidth))
        )
            from = lastRow;
        if (
            footerIndex !== undefined &&
            from > footerIndex &&
            (rowSizeModel.keys[footerIndex] !== MESSAGE_LIST_FOOTER_KEY ||
                rowSizeModel.sizes[footerIndex] !== estimateItemSize(footerIndex, rowWidth))
        )
            from = footerIndex;
        /* A header arriving, leaving, or changing height moves every row after it. */
        if (
            (rowSizeModel.keys[0] === MESSAGE_LIST_HEADER_KEY) !== headerLeads ||
            (headerLeads && rowSizeModel.sizes[0] !== estimateItemSize(0, rowWidth))
        )
            from = 0;
        const viewportHeight = viewportGeometry.current.height || element.clientHeight;
        if (from < items.length) {
            const anchor = readerAnchor.current ?? modelAnchorCapture(viewportHeight);
            if (anchor) pendingAnchor.current ??= { anchor, viewportHeight };
            /* New transcript rows grow below a parked point without consuming
               the floor gap that currently places it. A footer-only change
               still rests on the floor; viewport changes own its resize. */
            if (
                !following.current &&
                !headerLeads &&
                (rows !== previous.rows || items.length !== rowSizeModel.keys.length)
            ) {
                const gap = leadingGap(viewportHeight);
                if (gap > 0) {
                    geometrySparseInset.current = gap;
                    spacer.current!.style.marginTop = `${String(gap)}px`;
                }
            }
            rowSizeModelLayout(rowWidth, from, readerFocus(viewportHeight));
            return;
        }
        /* A pending row TanStack has just rendered in view is laid out now,
           before this commit can paint it at its placeholder size. A pending
           overscan row stays offscreen until idle time or a scroll gesture. */
        if (rowSizeModel.pending === 0) return;
        const top = element.scrollTop;
        const bottom = top + viewportHeight;
        let first = -1;
        let last = -1;
        for (const item of virtualItems) {
            if (rowSizeModel.keys[item.index] !== item.key || rowSizeModel.exact[item.index])
                continue;
            const start = rowSizeModel.starts[item.index]!;
            if (start >= bottom || start + rowSizeModel.sizes[item.index]! <= top) continue;
            if (first < 0) first = item.index;
            last = item.index;
        }
        if (first < 0) return;
        const scrollTopAnchor = readerAnchor.current?.type === "scrollTop";
        const anchor = refinementAnchor(element, viewportHeight);
        if (anchor) pendingAnchor.current ??= { anchor, viewportHeight, scrollTopAnchor };
        rowSizeModelLayout(rowWidth, items.length, { type: "rows", first, last });
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- the transcript owns live scroll position, ResizeObserver, and scroll listeners whose initial restoration and cleanup must align with the committed list DOM
    useLayoutEffect(() => {
        const element = list.current;
        if (!element) return;
        let wheelDirection = 0;
        const targetWindow = element.ownerDocument.defaultView!;
        let wheelExpiry: number | undefined;
        const wheelExpiryCancel = () => {
            if (wheelExpiry !== undefined) targetWindow.cancelAnimationFrame(wheelExpiry);
            wheelExpiry = undefined;
        };
        const scrollToBottom = () => {
            scrollBottomFollow(element);
        };
        const onGeometryScrollIntent = () => {
            wheelExpiryCancel();
            wheelDirection = 0;
            wheelScrollPending.current = false;
            expectedScrollTop.current = undefined;
            overscanRequireCurrent.current();
        };
        const onWheel = (event: WheelEvent) => {
            onGeometryScrollIntent();
            if (event.ctrlKey) return;
            wheelDirection = Math.sign(event.deltaY) || wheelDirection;
            /*
             * The wheel precedes the browser's scroll event. Hand ownership to
             * the reader immediately so a streaming commit in the same frame
             * cannot pin them back to the tail before that scroll is reported.
             */
            if (event.deltaY < 0) {
                wheelScrollPending.current = true;
                geometryFollowInset.current = 0;
                escapedFromFollow.current = true;
                following.current = false;
                readerAnchor.current = modelAnchorCaptureCurrent.current(
                    messageListViewportHeight(element),
                    element.scrollTop,
                ) ?? { scrollTop: element.scrollTop, type: "scrollTop" };
                wheelExpiry = targetWindow.requestAnimationFrame(() => {
                    wheelExpiry = undefined;
                    if (!wheelScrollPending.current) return;
                    wheelScrollPending.current = false;
                    // A boundary wheel may produce no event. If native input
                    // did move while its report was delayed, adopt it before
                    // expiring the intent so the next model commit holds it.
                    if (messageListScrollOffsetMoved(element.scrollTop, readerScrollTop.current)) {
                        const position = positionCurrentRef.current(element);
                        positionChange.current?.(position);
                    }
                });
            } else if (event.deltaY > 0) {
                geometryFollowInset.current = 0;
                const bottomOffset = Math.max(
                    0,
                    element.scrollHeight - element.scrollTop - element.clientHeight,
                );
                if (!event.ctrlKey && bottomOffset <= BOTTOM_WHEEL_EPSILON) event.preventDefault();
                if (bottomOffset <= FOLLOW_BOTTOM_THRESHOLD) {
                    escapedFromFollow.current = false;
                    following.current = true;
                    sparseInsetRelease();
                    scrollToBottom();
                    positionReport();
                }
            }
        };
        if (viewportGeometry.current.height === 0) {
            viewportGeometry.current = {
                height: messageListViewportHeight(element),
                width: messageListViewportWidth(element),
            };
            headerRestApply();
        }
        let previousScrollTop = element.scrollTop;
        scrollHeightBaseline.current = element.scrollHeight;
        const onScroll = () => {
            const currentScrollHeight = element.scrollHeight;
            const expected = expectedScrollTop.current;
            if (
                expected !== undefined &&
                !messageListScrollOffsetMoved(element.scrollTop, expected)
            ) {
                wheelScrollPending.current = false;
                expectedScrollTop.current = undefined;
                previousScrollTop = element.scrollTop;
                readerScrollTop.current = element.scrollTop;
                scrollHeightBaseline.current = currentScrollHeight;
                positionReport();
                return;
            }
            expectedScrollTop.current = undefined;
            if (!messageListScrollOffsetMoved(element.scrollTop, readerScrollTop.current)) {
                wheelScrollPending.current = false;
                // A browser can emit more than one event for a model write.
                // Its echoes retain the actual held point, including an inset
                // that differs from the standard point used for user input.
                previousScrollTop = element.scrollTop;
                scrollHeightBaseline.current = currentScrollHeight;
                positionReport();
                startReachedReport(element);
                endAwayUpdateCurrent.current(element);
                return;
            }
            /*
             * Until the opening position is written, a native scroll is the
             * browser clamping the scrollport to rows still being sized, not
             * the reader: a follower must still open at the end.
             */
            if (!initialPositionApplied.current) {
                previousScrollTop = element.scrollTop;
                scrollHeightBaseline.current = currentScrollHeight;
                return;
            }
            /*
             * A growing viewport can clamp scrollTop before ResizeObserver runs.
             * Ignore that transient scroll event so it cannot replace the bottom
             * offset captured against the previous viewport height.
             */
            const viewportHeight = viewportGeometry.current.height || element.clientHeight;
            const viewportStyle = element.ownerDocument.defaultView!.getComputedStyle(element);
            if (
                Math.abs(Number.parseFloat(viewportStyle.height) - viewportHeight) > 1 / 64 ||
                // Resolved style serializes to fewer decimals than ResizeObserver.
                Math.abs(Number.parseFloat(viewportStyle.width) - viewportGeometry.current.width) >
                    1 / 64
            ) {
                previousScrollTop = element.scrollTop;
                scrollHeightBaseline.current = currentScrollHeight;
                return;
            }
            if (wheelScrollPending.current) {
                wheelScrollPending.current = false;
                readerAnchor.current = modelAnchorCaptureCurrent.current(
                    viewportGeometry.current.height,
                    element.scrollTop,
                );
            }
            const bottomOffset = Math.max(
                0,
                element.scrollHeight -
                    element.scrollTop -
                    viewportHeight -
                    geometryFollowInset.current,
            );
            const scrollDelta = element.scrollTop - previousScrollTop;
            const contentHeightChanged =
                Math.abs(currentScrollHeight - scrollHeightBaseline.current) > 1;
            previousScrollTop = element.scrollTop;
            readerScrollTop.current = element.scrollTop;
            scrollHeightBaseline.current = currentScrollHeight;
            geometryExtentOffscreenRelease(readerScrollTop.current, viewportHeight);
            if (scrollDelta < 0) escapedFromFollow.current = true;
            else if (
                scrollDelta > 0 &&
                // Geometry compensation must not resume following against an upward wheel.
                wheelDirection >= 0 &&
                !contentHeightChanged &&
                bottomOffset <= FOLLOW_BOTTOM_THRESHOLD
            )
                escapedFromFollow.current = false;
            following.current =
                !escapedFromFollow.current && bottomOffset <= FOLLOW_BOTTOM_THRESHOLD;
            if (following.current) {
                sparseInsetRelease();
                scrollToBottom();
            }
            pendingAnchor.current = undefined;
            readerAnchor.current = following.current
                ? undefined
                : modelAnchorCaptureCurrent.current(viewportHeight, readerScrollTop.current);
            positionReport();
            startReachedReport(element);
            endAwayUpdateCurrent.current(element);
        };
        /* Capture runs before TanStack's own scroll listener on this element,
           whose range change can commit synchronously: the commit must see
           whether the reader left the tail, or it pins them back to it. */
        element.addEventListener("scroll", onScroll, { capture: true, passive: true });
        element.addEventListener("scrollend", positionReport);
        element.addEventListener("pointerdown", onGeometryScrollIntent);
        /* Keyboard scrolling moves the viewport too; it is not a reason to
           read the next scroll event as the reader's. */
        const onKeyDown = (event: KeyboardEvent) => {
            wheelExpiryCancel();
            wheelDirection = 0;
            wheelScrollPending.current = false;
            expectedScrollTop.current = undefined;
            overscanRequireCurrent.current();
            if (
                event.key === "End" &&
                !event.defaultPrevented &&
                !(
                    event.target instanceof HTMLElement &&
                    event.target.closest("input, textarea, select, [contenteditable]")
                ) &&
                element.scrollHeight - element.scrollTop - element.clientHeight <=
                    FOLLOW_BOTTOM_THRESHOLD
            ) {
                // End at the maximum has no scroll event. The key itself owns
                // resuming following, just as a downward wheel at the end does.
                escapedFromFollow.current = false;
                following.current = true;
                sparseInsetRelease();
                scrollToBottom();
                positionReport();
            }
        };
        element.addEventListener("keydown", onKeyDown);
        element.addEventListener("touchstart", onGeometryScrollIntent, { passive: true });
        /* This is the one viewport wheel listener that may cancel a default:
           Chromium/WebKit can otherwise consume the last 1–2px at the chat
           boundary even though the reader is already visibly at the bottom. */
        element.addEventListener("wheel", onWheel, { passive: false });
        /* A non-virtual list has no row model, so ordinary DOM mutations are
           still what tell a follower that its content grew. */
        const observer = virtualized
            ? undefined
            : new MutationObserver(() => {
                  if (following.current) scrollToBottom();
              });
        observer?.observe(element, { characterData: true, childList: true, subtree: true });
        return () => {
            wheelExpiryCancel();
            wheelScrollPending.current = false;
            // Activity may have disconnected the ref already. Capture from
            // this listener lifetime's element, and retain the held row point
            // so a hidden width change restores the same reader when shown.
            const position = positionCurrentRef.current(element);
            positionChange.current?.(position);
            refinementCancel.current?.();
            refinementCancel.current = undefined;
            overscanMountCancel.current?.();
            overscanMountCancel.current = undefined;
            observer?.disconnect();
            pendingAnchor.current = undefined;
            expectedScrollTop.current = undefined;
            element.removeEventListener("scroll", onScroll, { capture: true });
            element.removeEventListener("scrollend", positionReport);
            element.removeEventListener("pointerdown", onGeometryScrollIntent);
            element.removeEventListener("keydown", onKeyDown);
            element.removeEventListener("touchstart", onGeometryScrollIntent);
            element.removeEventListener("wheel", onWheel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- current capture refs read the latest modeled rows while this effect owns one scrollport-listener lifetime
    }, [virtualized, virtualizer]);
    return (
        <MessageListDisclosureAnchorProvider value={disclosureAnchor}>
            <MessageListRowWidthContext.Provider value={rowSizeModel.width}>
                <ScrollArea
                    className={["happy-message-list", props.className].filter(Boolean).join(" ")}
                    data-happy-desktop-ui="message-list"
                    data-header={headerLeads ? "" : undefined}
                    style={props.style}
                    viewportClassName="happy-message-list__viewport"
                    viewportRef={list}
                    overlay={
                        props.jumpToEnd ? (
                            <div className="happy-message-list__jump" hidden ref={jump}>
                                <Button
                                    aria-label="Jump to latest"
                                    iconOnly
                                    onClick={jumpToEnd}
                                    size="small"
                                    variant="secondary"
                                >
                                    {props.jumpToEndWorking ? (
                                        <ShimmerText sweep="sheen" tone="inherit">
                                            <Icon name="arrow-down" size={16} />
                                        </ShimmerText>
                                    ) : (
                                        <Icon name="arrow-down" size={16} />
                                    )}
                                </Button>
                            </div>
                        ) : undefined
                    }
                >
                    <div
                        className="happy-message-list__content"
                        data-happy-desktop-ui="message-list-content"
                        data-virtualized={virtualized ? "" : undefined}
                    >
                        <div
                            aria-hidden="true"
                            className="happy-message-list__spacer"
                            data-happy-desktop-ui="message-list-spacer"
                            ref={spacer}
                        />
                        {virtualized ? (
                            <div
                                className="happy-message-list__virtual"
                                data-happy-desktop-ui="message-list-virtual"
                                ref={virtualContent}
                                style={{ height: `${String(virtualizer.getTotalSize())}px` }}
                            >
                                {virtualItems.map((virtualItem) => (
                                    <div
                                        className="happy-message-list__virtual-row"
                                        data-index={virtualItem.index}
                                        data-item-id={
                                            virtualItem.index === footerIndex
                                                ? "working-status"
                                                : undefined
                                        }
                                        key={virtualItem.key}
                                        ref={messageListRowHeightCheckRef(
                                            virtualItem.index === footerIndex
                                                ? "working-status"
                                                : virtualItem.key,
                                            virtualItem.index,
                                            virtualItem.size,
                                        )}
                                        style={{
                                            transform: `translateY(${String(virtualItem.start)}px)`,
                                        }}
                                    >
                                        {items[virtualItem.index]}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            items
                        )}
                    </div>
                </ScrollArea>
            </MessageListRowWidthContext.Provider>
        </MessageListDisclosureAnchorProvider>
    );
}
/** Centered plain-text date separating message days. */
export function DayDivider(props: { className?: string; label: string }) {
    return (
        <div
            aria-label={props.label}
            className={["happy-day-divider", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="day-divider"
            role="separator"
        >
            <span className="happy-day-divider__label" data-happy-desktop-ui="day-divider-label">
                {props.label}
            </span>
        </div>
    );
}
export type SystemNoticeSegment =
    | {
          kind: "text";
          text: string;
      }
    | {
          kind: "ref";
          text: string;
      };
/* Split a service line into plain runs and highlighted @user / #channel refs.
   The regex keeps the delimiters so spacing and punctuation survive verbatim;
   a ref token is the sigil plus an unbroken run of word characters. */
const SYSTEM_NOTICE_REF = /([@#][\p{L}\p{N}_.-]+)/u;
function systemNoticeSegments(text: string): SystemNoticeSegment[] {
    return text
        .split(SYSTEM_NOTICE_REF)
        .filter((part) => part.length > 0)
        .map((part) =>
            SYSTEM_NOTICE_REF.test(part) && (part[0] === "@" || part[0] === "#")
                ? { kind: "ref", text: part }
                : { kind: "text", text: part },
        );
}
/**
 * Low-emphasis service line for durable chat events such as membership and
 * agent-setting changes. It is not a chat bubble: a small leading glyph sits
 * beside muted body text, with @user and #channel references color-lifted so
 * the affected entities read at a glance.
 *
 * `align` chooses between the two places a service line belongs. `center` is
 * the shared-channel default, where a notice separates two people's turns.
 * `start` is the assistant-turn hint: context a single agent emitted mid-turn,
 * which reads as part of that turn and therefore lines up with its text column
 * instead of interrupting the thread with a centered banner.
 */
export function SystemNotice(props: {
    align?: "center" | "start";
    className?: string;
    icon?: IconName;
    style?: CSSProperties;
    text: string;
}) {
    const segments = systemNoticeSegments(props.text);
    return (
        <div
            aria-label={props.text}
            className={["happy-system-notice", props.className].filter(Boolean).join(" ")}
            data-align={props.align ?? "center"}
            data-happy-desktop-ui="system-notice"
            role="note"
            style={props.style}
        >
            <span
                aria-hidden="true"
                className="happy-system-notice__icon"
                data-happy-desktop-ui="system-notice-icon"
            >
                <Icon name={props.icon ?? "users"} size={14} />
            </span>
            <span className="happy-system-notice__text" data-happy-desktop-ui="system-notice-text">
                {segments.map((segment, index) =>
                    segment.kind === "ref" ? (
                        <span
                            className="happy-system-notice__ref"
                            data-happy-desktop-ui="system-notice-ref"
                            key={`${segment.text}-${index}`}
                        >
                            {segment.text}
                        </span>
                    ) : (
                        <span key={index}>{segment.text}</span>
                    ),
                )}
            </span>
        </div>
    );
}
/**
 * The service line for a message the agent took while it was already working.
 * The message itself keeps its own place in the transcript — nothing a reader is
 * looking at moves — so this line is what says when the agent actually picked it
 * up, and it quotes that message so the moment reads on its own.
 */
export function SteeringNotice(props: {
    className?: string;
    quote: string;
    style?: CSSProperties;
    text: string;
}) {
    return (
        <div
            aria-label={`${props.text}: ${props.quote}`}
            className={["happy-steering-notice", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="steering-notice"
            role="note"
            style={props.style}
        >
            <SystemNotice
                className="happy-steering-notice__line"
                icon="arrow-right"
                text={props.text}
            />
            <blockquote
                className="happy-steering-notice__quote"
                data-happy-desktop-ui="steering-notice-quote"
            >
                {props.quote}
            </blockquote>
        </div>
    );
}
