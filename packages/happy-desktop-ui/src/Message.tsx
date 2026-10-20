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
import { AvatarBrutalist } from "./AvatarBrutalist";
import { happyLogoBlackUrl } from "./assets";
import { AutomatedTag } from "./AutomatedTag";
import { ReactionChip } from "./Badge";
import { Icon, type IconName } from "./Icon";
import {
    MEDIA_MOSAIC_MAX_WIDTH,
    MESSAGE_MEDIA_MAX,
    mediaMosaicLayout,
    mediaMosaicStyle,
    mediaMosaicTileStyle,
    type MediaMosaicLayout,
    type MediaMosaicTile,
} from "./mediaMosaic";
import { messagePlainTextNormalize, type MessageBodyFormat } from "./messagePlainText";
import type { MessageReferences } from "./messageReferences";
import {
    MessageListDisclosureAnchorProvider,
    type MessageListDisclosureAnchor,
} from "./messageListDisclosureAnchor";
import {
    markdownTablesSolve,
    renderMessageMarkdown,
    type LinkOpenHandler,
    type LinkOpenPlacement,
    type MessageGenerationStatus,
} from "./MessageMarkdown";
import { ScrollArea } from "./Scrollbar";
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
 * One image tile at its frame in the message's photo mosaic: the box
 * `mediaMosaicLayout` computes from every photo's own shape, so the layout is
 * reserved up front and nothing reflows when the bytes arrive — and the
 * transcript's virtualizer, which reserves the row from the same function,
 * agrees with it. Without an open action it remains media, not a fake button.
 */
function MessageMediaItem(props: {
    image: MessageImage;
    layout: MediaMosaicLayout;
    tile: MediaMosaicTile;
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
        style: mediaMosaicTileStyle(props.layout, props.tile),
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
export type MessageDeliveryState =
    | "failed"
    | "pending_queued"
    | "pending_steering"
    | "sending"
    | "sent";
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
    /**
     * A session this message speaks for rather than a person: the avatar becomes
     * that session's generated mark instead of initials. It is what separates a
     * message that arrived from another session from one written here — and the
     * mark matches the one that session wears in the tab strip, so the two read
     * as the same thing. An `imageUrl` still wins over it.
     */
    avatarSessionId?: string;
    /** Inline photo attachments rendered as a clickable thumbnail grid. */
    images?: MessageImage[];
    /** Opens an image (by id) — wire to a web-modal lightbox, never a new tab. */
    onImageOpen?: (id: string) => void;
    /**
     * Opens a workspace file this message links to, in the product's own file
     * viewer. Absent leaves such links inert, which is what a surface with no
     * workspace behind it can honestly offer.
     */
    onFileOpen?: FileOpenHandler;
    /**
     * Opens a file a `happy-file:` link in this message names in another
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

/** Literal text with the same 16px/24px body type as agent paragraphs. */
function renderMessagePlainText(source: string, trailing: ReactNode): ReactNode {
    const text = messagePlainTextNormalize(source);
    if (text.length === 0) return null;
    return (
        <p className="happy-message__plain-text" data-happy-desktop-ui="message-plain-text">
            {text}
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
        "avatarSessionId",
        "body",
        "bodyFormat",
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
        "images",
        "onImageOpen",
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
        local.avatarSessionId !== undefined && local.imageUrl === undefined && !happyAgent() ? (
            <AvatarBrutalist id={local.avatarSessionId} size={GUTTER_MARK_PIXELS} />
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
                data-happy-desktop-ui="message-body"
                ref={body}
            >
                {ownAutomatedLine}
                {typeof local.body === "string" && plainBody()
                    ? renderMessagePlainText(local.body, inlineIncomingHoverMeta)
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
                        )
                      : null}
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
    /* Laid out at full size; a narrower column scales the frame, and the tiles
       with it, exactly as the row model scales this layout to its measure. */
    const mosaic = mediaMosaicLayout(shownImages, MEDIA_MOSAIC_MAX_WIDTH);
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
                deliveryState() === "pending_queued" ||
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
                    <div
                        className="happy-message__media"
                        data-count={shownImages.length}
                        data-happy-desktop-ui="message-media"
                        style={mediaMosaicStyle(mosaic)}
                    >
                        {shownImages.map((image, position) => (
                            <MessageMediaItem
                                image={image}
                                key={image.id}
                                layout={mosaic}
                                onOpen={local.onImageOpen}
                                tile={mosaic.tiles[position]!}
                            />
                        ))}
                    </div>
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
     * A row at the end of the list's content, below the last message. It is
     * part of the virtualized row collection with a reserved stable key, not an
     * overlay or sticky chrome, so it scrolls and reconciles like every other
     * transcript row.
     */
    footer?: ReactNode;
    /**
     * Height model supplied to the virtualizer for the stable footer row. It
     * reads state outside the rows, so it is asked on every commit, and so is
     * the last row, which may read that same state as its successor.
     */
    footerHeight?: number | ((width: number) => number);
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
 * point `offset` px below that row's top stays `VIRTUAL_ANCHOR_INSET` px above
 * the viewport's lower edge, whatever the rows above it measure, so a restore
 * needs only that row and its viewport laid out.
 */
export type MessageListScrollPosition =
    | { readonly type: "bottom" }
    | {
          readonly type: "row";
          /** The row's React key within this list. */
          readonly rowKey: string;
          readonly offset: number;
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
    const viewportGeometryCommitCurrent = useRef((_width: number, _height: number) => {});
    const readerAnchor = useRef<MessageListVirtualAnchor | undefined>(undefined);
    const pendingAnchor = useRef<
        | {
              readonly anchor: MessageListVirtualAnchor;
              readonly viewportHeight: number;
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
    const scrollTopWrite = (element: HTMLElement, value: number) => {
        element.scrollTop = value;
        expectedScrollTop.current = element.scrollTop;
        readerScrollTop.current = element.scrollTop;
        virtualOffsetReport.current?.(element.scrollTop, virtualizer.isScrolling);
    };
    const sparseInsetHold = () => {
        const spacerElement = spacer.current;
        const firstRow = spacerElement?.nextElementSibling;
        if (!spacerElement || !firstRow) return;
        const inset = Math.max(
            0,
            firstRow.getBoundingClientRect().top - spacerElement.getBoundingClientRect().bottom,
        );
        if (inset > 0.5) spacerElement.style.marginTop = `${String(inset)}px`;
    };
    const sparseInsetRelease = () => {
        spacer.current?.style.removeProperty("margin-top");
    };
    /* Context identity stays fixed for the mounted list: thousands of rows may
       consume it, and ordinary transcript renders must not notify them all. */
    const disclosureAnchor = useRef<MessageListDisclosureAnchor>((disclosure) => {
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
        readerAnchor.current = disclosureRowAnchorCurrent.current(element, disclosure) ?? {
            scrollTop: element.scrollTop,
            type: "scrollTop",
        };
        readerScrollTop.current = element.scrollTop;
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
    const footerIndex = props.footer === undefined ? undefined : entryItems.length;
    const items =
        footerIndex === undefined
            ? entryItems
            : [
                  ...entryItems,
                  <div
                      className="happy-message-list__footer"
                      data-happy-desktop-ui="message-list-footer"
                      data-item-id="working-status"
                      key={MESSAGE_LIST_FOOTER_KEY}
                  >
                      {props.footer}
                  </div>,
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
    const estimateItemSize = (index: number, rowWidth: number) =>
        index === footerIndex
            ? typeof props.footerHeight === "function"
                ? props.footerHeight(rowWidth)
                : (props.footerHeight ?? ROW_SIZE_FALLBACK)
            : (props.estimateRowSize?.(index, rowWidth) ?? ROW_SIZE_FALLBACK);
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
        const model = rowSizeModel;
        const { keys, sizes, starts, exact } = model;
        const count = items.length;
        const previousCount = keys.length;
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
        /* Any other row the caller already holds at this width is exact for
           the price of a lookup, nearest the reader first. */
        const cached = props.cachedRowSize;
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
        model.width = rowWidth;
        model.version += 1;
        model.refined = undefined;
        if (virtualized) virtualizer.measure();
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
        const held = readerAnchor.current;
        const anchor =
            held?.type === "item" &&
            held.viewportInset === Math.min(VIRTUAL_ANCHOR_INSET, element.clientHeight)
                ? held
                : /* A disclosure's own inset, or a raw scrollTop, is read back
                     as the row at the standard anchor point. */
                  modelAnchorCapture(element.clientHeight, element.scrollTop);
        return anchor?.type === "item"
            ? { type: "row", rowKey: String(anchor.key), offset: anchor.itemOffset }
            : { type: "bottom" };
    }
    const positionReport = () => {
        const element = list.current;
        if (!element || !positionChange.current) return;
        positionChange.current(positionCurrent(element));
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
        const anchor =
            held?.type === "item"
                ? held
                : modelAnchorCapture(viewportHeight, readerScrollTop.current);
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
    function modelAnchorCapture(
        viewportHeight: number,
        scrollTop = readerScrollTop.current,
    ): MessageListVirtualAnchor | undefined {
        if (following.current || items.length === 0) return undefined;
        const viewportInset = Math.min(VIRTUAL_ANCHOR_INSET, viewportHeight);
        const point = scrollTop + Math.max(0, viewportHeight - viewportInset);
        const item = modeledItemAtOffset(point);
        if (!item) return { scrollTop, type: "scrollTop" };
        return {
            index: item.index,
            itemOffset: Math.max(0, Math.min(point - item.start, item.size)),
            key: item.key,
            type: "item",
            viewportInset,
        };
    }
    const modelAnchorCaptureCurrent = useRef(modelAnchorCapture);
    modelAnchorCaptureCurrent.current = modelAnchorCapture;
    /**
     * The anchor that keeps `disclosure` at its place in the viewport: the
     * modeled row it sits in, at the control's offset within that row. Absent
     * outside a virtual list, or for a control that is not on screen.
     */
    function disclosureRowAnchor(
        element: HTMLElement,
        disclosure: HTMLElement,
    ): MessageListVirtualAnchor | undefined {
        if (!virtualized) return undefined;
        const row = disclosure.closest<HTMLElement>(".happy-message-list__virtual-row");
        const index = row ? Number(row.dataset.index) : Number.NaN;
        if (!row || !Number.isInteger(index) || index < 0 || index >= items.length)
            return undefined;
        const viewportHeight = element.clientHeight;
        const top = disclosure.getBoundingClientRect().top;
        const offset = top - element.getBoundingClientRect().top;
        if (offset < 0 || offset > viewportHeight) return undefined;
        return {
            index,
            itemOffset: Math.max(0, top - row.getBoundingClientRect().top),
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
        return {
            index,
            scrollTop:
                item.start +
                Math.min(anchor.itemOffset, item.size) -
                Math.max(0, viewportHeight - anchor.viewportInset),
        };
    }
    function modelAnchorRestore(anchor: MessageListVirtualAnchor, viewportHeight: number) {
        const element = list.current;
        if (!element || following.current) return false;
        if (anchor.type === "scrollTop") {
            scrollTopWrite(element, anchor.scrollTop);
            readerAnchor.current = anchor;
            return true;
        }
        const place = modelAnchorPlace(anchor, viewportHeight);
        if (!place) {
            readerAnchor.current = undefined;
            return false;
        }
        scrollTopWrite(element, place.scrollTop);
        readerAnchor.current = { ...anchor, index: place.index };
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
            rowSizeModelLayout(rowWidth, items.length, { type: "rows", first, last });
            if (anchor) pendingAnchor.current = { anchor, viewportHeight, scrollTopAnchor };
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
                    work: props.prepareRowSize(index, rowWidth),
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
            rowSizeModelLayout(rowWidth, items.length, { type: "rows", first, last });
            if (anchor) pendingAnchor.current = { anchor, viewportHeight, scrollTopAnchor };
        });
    }
    function viewportGeometryCommit(nextWidth: number, nextHeight: number) {
        const previous = viewportGeometry.current;
        if (previous.width === nextWidth && previous.height === nextHeight) return;
        const nextRowWidth = messageListRowWidth(nextWidth, estimateRowWidth);
        if (rowSizeModel.width === undefined) {
            /* The first report: there is no earlier geometry to keep a reader
               anchored in, only the model to build at its real width. A
               scrollport with no width yet has nothing to model rows at. */
            if (nextRowWidth <= 0) return;
            viewportGeometry.current = { height: nextHeight, width: nextWidth };
            const opening = following.current ? undefined : restore.current;
            if (opening !== undefined && "type" in opening) {
                /* A saved anchor names its row by key. Lay out that row and the
                   viewport around it; the rows above it are laid out later
                   without moving the reader, so the restore never waits for
                   the history above what the reader was reading. */
                const rowKey = opening.type === "row" ? opening.rowKey : undefined;
                const index = items.findIndex(
                    (_item, candidate) => String(itemKeyAt(candidate)) === rowKey,
                );
                if (opening.type === "row" && index >= 0) {
                    const anchor: Extract<MessageListVirtualAnchor, { type: "item" }> = {
                        type: "item",
                        index,
                        itemOffset: opening.offset,
                        key: itemKeyAt(index),
                        viewportInset: Math.min(VIRTUAL_ANCHOR_INSET, nextHeight),
                    };
                    readerAnchor.current = anchor;
                    rowSizeModelLayout(nextRowWidth, 0, readerFocus(nextHeight));
                    openingScrollTop.current = modelAnchorPlace(anchor, nextHeight)?.scrollTop;
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
        const widthChanged = nextRowWidth !== rowSizeModel.width;
        const anchor = readerAnchor.current ?? modelAnchorCapture(previousHeight);
        const focus = readerFocus(previousHeight);
        viewportGeometry.current = { height: nextHeight, width: nextWidth };
        if (anchor) pendingAnchor.current = { anchor, viewportHeight: nextHeight };
        if (widthChanged) {
            rowSizeModelLayout(nextRowWidth, 0, focus);
            return;
        }
        const element = list.current;
        if (!element) return;
        if (following.current) scrollTopWrite(element, element.scrollHeight - nextHeight);
        else if (anchor) {
            modelAnchorRestore(anchor, nextHeight);
            pendingAnchor.current = undefined;
        } else if (previous.height !== 0 && previous.height !== nextHeight) {
            scrollTopWrite(element, readerScrollTop.current + previousHeight - nextHeight);
        }
        positionReport();
    }
    viewportGeometryCommitCurrent.current = viewportGeometryCommit;
    const observeScrollportRect = (
        instance: Virtualizer<HTMLDivElement, HTMLElement>,
        report: (rect: { width: number; height: number }) => void,
    ) => {
        const element = instance.scrollElement;
        const targetWindow = instance.targetWindow;
        if (!element || !targetWindow) return;
        const reportRect = (width: number, height: number) => {
            const rect = { width: Math.round(width), height: Math.round(height) };
            report(rect);
        };
        viewportGeometryCommitCurrent.current(element.clientWidth, element.clientHeight);
        reportRect(element.clientWidth, element.clientHeight);
        const geometryChanged = () => {
            /* ResizeObserver runs after layout. Rebuild every keyed size from
               that settled client box before publishing the rect to TanStack,
               so one render cannot combine new cell widths with old offsets. */
            flushSync(() => {
                viewportGeometryCommitCurrent.current(element.clientWidth, element.clientHeight);
                reportRect(element.clientWidth, element.clientHeight);
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
    const admittedKeys = useRef<ReadonlySet<Key>>(new Set());
    const [overscanMountVersion, setOverscanMountVersion] = useState(0);
    const rangeExtractor = useRef<
        | {
              readonly version: number;
              readonly mountVersion: number;
              readonly extract: (range: Range) => number[];
          }
        | undefined
    >(undefined);
    if (
        rangeExtractor.current?.version !== rowSizeModel.version ||
        rangeExtractor.current.mountVersion !== overscanMountVersion
    )
        rangeExtractor.current = {
            version: rowSizeModel.version,
            mountVersion: overscanMountVersion,
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
                return indexes;
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
            const unobserve = observeElementOffset(instance, report);
            return () => {
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
    const virtualItems = modelRendered ? virtualizer.getVirtualItems() : [];
    // eslint-disable-next-line happy-react/no-layout-effect -- streaming React commits publish a new modeled scrollHeight; a follower must pin in this same pre-paint commit
    useLayoutEffect(() => {
        rowSizeModelRefineCurrent.current = rowSizeModelRefine;
        // Scroll-height reads must see this commit's tables at their solved widths.
        markdownTablesSolve();
        overscanRequireCurrent.current = overscanRequire;
        mountedKeys.current = new Set(virtualItems.map((item) => item.key));
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
        if (!initialPositionApplied.current) {
            initialPositionApplied.current = true;
            pendingAnchor.current = undefined;
            if (following.current)
                scrollTopWrite(element, element.scrollHeight - element.clientHeight);
            else {
                scrollTopWrite(element, openingScrollTop.current ?? readerScrollTop.current);
                /* A restored anchor is the reader's fixed point already. */
                readerAnchor.current ??= modelAnchorCapture(element.clientHeight);
            }
        } else if (following.current) {
            pendingAnchor.current = undefined;
            readerAnchor.current = undefined;
            scrollTopWrite(element, element.scrollHeight - element.clientHeight);
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
                    from = Math.max(0, changed - 1);
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
        const viewportHeight = viewportGeometry.current.height || element.clientHeight;
        if (from < items.length) {
            const anchor = readerAnchor.current ?? modelAnchorCapture(viewportHeight);
            if (anchor) pendingAnchor.current = { anchor, viewportHeight };
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
        rowSizeModelLayout(rowWidth, items.length, { type: "rows", first, last });
        if (anchor) pendingAnchor.current = { anchor, viewportHeight, scrollTopAnchor };
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- the transcript owns live scroll position, ResizeObserver, and scroll listeners whose initial restoration and cleanup must align with the committed list DOM
    useLayoutEffect(() => {
        const element = list.current;
        if (!element) return;
        const scrollToBottom = () => {
            scrollTopWrite(element, element.scrollHeight - element.clientHeight);
        };
        const onGeometryScrollIntent = () => {
            expectedScrollTop.current = undefined;
            overscanRequireCurrent.current();
        };
        const onWheel = (event: WheelEvent) => {
            onGeometryScrollIntent();
            /*
             * The wheel precedes the browser's scroll event. Hand ownership to
             * the reader immediately so a streaming commit in the same frame
             * cannot pin them back to the tail before that scroll is reported.
             */
            if (event.deltaY < 0) {
                escapedFromFollow.current = true;
                following.current = false;
                readerAnchor.current = { scrollTop: element.scrollTop, type: "scrollTop" };
            } else if (event.deltaY > 0) {
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
                }
            }
        };
        if (viewportGeometry.current.height === 0)
            viewportGeometry.current = {
                height: element.clientHeight,
                width: element.clientWidth,
            };
        let previousScrollTop = element.scrollTop;
        scrollHeightBaseline.current = element.scrollHeight;
        const onScroll = () => {
            const currentScrollHeight = element.scrollHeight;
            const expected = expectedScrollTop.current;
            if (expected !== undefined && Math.abs(element.scrollTop - expected) <= 1) {
                expectedScrollTop.current = undefined;
                previousScrollTop = element.scrollTop;
                readerScrollTop.current = element.scrollTop;
                scrollHeightBaseline.current = currentScrollHeight;
                positionReport();
                return;
            }
            expectedScrollTop.current = undefined;
            /*
             * A growing viewport can clamp scrollTop before ResizeObserver runs.
             * Ignore that transient scroll event so it cannot replace the bottom
             * offset captured against the previous viewport height.
             */
            const viewportHeight = viewportGeometry.current.height || element.clientHeight;
            if (
                element.clientHeight !== viewportHeight ||
                element.clientWidth !== viewportGeometry.current.width
            ) {
                previousScrollTop = element.scrollTop;
                scrollHeightBaseline.current = currentScrollHeight;
                return;
            }
            const bottomOffset = Math.max(
                0,
                element.scrollHeight - element.scrollTop - viewportHeight,
            );
            const scrollDelta = element.scrollTop - previousScrollTop;
            const contentHeightChanged =
                Math.abs(currentScrollHeight - scrollHeightBaseline.current) > 1;
            previousScrollTop = element.scrollTop;
            readerScrollTop.current = element.scrollTop;
            scrollHeightBaseline.current = currentScrollHeight;
            if (scrollDelta < 0) escapedFromFollow.current = true;
            else if (
                scrollDelta > 0 &&
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
                : bottomOffset <= FOLLOW_BOTTOM_THRESHOLD
                  ? { scrollTop: element.scrollTop, type: "scrollTop" }
                  : modelAnchorCaptureCurrent.current(viewportHeight, element.scrollTop);
            positionReport();
            startReachedReport(element);
        };
        /* Capture runs before TanStack's own scroll listener on this element,
           whose range change can commit synchronously: the commit must see
           whether the reader left the tail, or it pins them back to it. */
        element.addEventListener("scroll", onScroll, { capture: true, passive: true });
        element.addEventListener("scrollend", positionReport);
        element.addEventListener("pointerdown", onGeometryScrollIntent);
        /* Keyboard scrolling moves the viewport too; it is not a reason to
           read the next scroll event as the reader's. */
        const onKeyDown = () => overscanRequireCurrent.current();
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
            positionReport();
            refinementCancel.current?.();
            refinementCancel.current = undefined;
            overscanMountCancel.current?.();
            overscanMountCancel.current = undefined;
            observer?.disconnect();
            pendingAnchor.current = undefined;
            readerAnchor.current = undefined;
            expectedScrollTop.current = undefined;
            element.removeEventListener("scroll", onScroll, { capture: true });
            element.removeEventListener("scrollend", positionReport);
            element.removeEventListener("pointerdown", onGeometryScrollIntent);
            element.removeEventListener("keydown", onKeyDown);
            element.removeEventListener("touchstart", onGeometryScrollIntent);
            element.removeEventListener("wheel", onWheel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- modelAnchorCaptureCurrent reads the current modeled rows, while this effect deliberately owns one scrollport-listener lifetime
    }, [virtualized, virtualizer]);
    return (
        <MessageListDisclosureAnchorProvider value={disclosureAnchor}>
            <ScrollArea
                className={["happy-message-list", props.className].filter(Boolean).join(" ")}
                data-happy-desktop-ui="message-list"
                style={props.style}
                viewportClassName="happy-message-list__viewport"
                viewportRef={list}
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
