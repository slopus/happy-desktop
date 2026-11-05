import type { HappyAgentArtifactType } from "happy-desktop-state";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { CountBadge } from "./Badge";
import { Icon } from "./Icon";
import {
    FeedSubjectGlyph,
    type HappyAgentFeedActor,
    type HappyAgentFeedSubjectKind,
} from "./pages/feed/feedPresentation";
import { SidebarRowAction } from "./Sidebar";

/**
 * What an item is, which decides its leading mark, its one line, and the one
 * quick action hovering it offers. Every item is one sidebar row tall, except a
 * post, which carries an image or a clip and is exactly two rows tall.
 *
 * - `line`: a teammate started a task — their face, "Kirill started …";
 *   hover offers Follow.
 * - `card`: an artifact was published — its type glyph and its title.
 * - `post`: what a story used to be — a small thumbnail, the caption, and
 *   under it who posted and when. A clip never plays by itself; hover offers
 *   Play.
 * - `mention`: someone named the reader, looped them in, or replied to them —
 *   an "@" in the mark's place and "Name: what they said"; hover offers Reply.
 */
export type LiveFeedTier = "line" | "card" | "post" | "mention";

/** A post's picture or clip. Shape is the owner's, from the media's own size. */
export interface LiveFeedMedia {
    readonly kind: "image" | "video";
    readonly url: string;
    /** A video's still frame, painted until the reader plays it. */
    readonly posterUrl?: string;
    /** A video's length, told on its still and on Play. */
    readonly durationMs?: number;
    readonly shape: "square" | "landscape";
}

/** The task an item belongs to, which the reader may follow from the item. */
export interface LiveFeedFollowTarget {
    readonly id: string;
    readonly label: string;
    readonly following: boolean;
}

/** One item of the live feed, already put into words by its owner. */
export interface LiveFeedItem {
    readonly id: string;
    readonly tier: LiveFeedTier;
    /** Who did it: a teammate, or an agent named by its task or bot. */
    readonly actor: HappyAgentFeedActor;
    /** What they did, in a few lowercase words: "started", "published". */
    readonly verb: string;
    /** What it is about: the task, artifact, list, or document. */
    readonly title: string;
    readonly subject: HappyAgentFeedSubjectKind;
    readonly artifactType?: HappyAgentArtifactType;
    /** A post's caption, or the line that mentioned the reader. */
    readonly detail?: string;
    /** Where a mention happened: the chat or task it was said in. */
    readonly place?: string;
    readonly media?: LiveFeedMedia;
    readonly follow?: LiveFeedFollowTarget;
    readonly at: number;
    /** It was read — ×, opened, Read all, or its time on screen is up: it fades
        where it stands, then the owner drops it. */
    readonly leaving?: boolean;
}

/**
 * How many sidebar rows the feed region is tall, and it never grows past
 * that: 4 × 32 + 3 × 2 = 134px, under a fifth of a 760px sidebar. With more
 * unread than fits, the top row washes out and the rest wait above it.
 */
export const LIVE_FEED_ROWS = 4;

/** The rows an item takes: a post with media is two, everything else one. */
export function liveFeedItemRows(item: LiveFeedItem): 1 | 2 {
    return item.tier === "post" && item.media !== undefined ? 2 : 1;
}

export interface LiveFeedPanelProps {
    /** The footer's feed control is on; off, the region is not drawn at all. */
    readonly shown: boolean;
    /** Everything unread, oldest first: the newest sits at the bottom, nearest the footer. */
    readonly items: readonly LiveFeedItem[];
    readonly now: number;
    /** The pointer is over the feed: the owner holds arrivals and expiry still. */
    readonly onHoverChange: (hovering: boolean) => void;
    readonly onItemOpen: (itemId: string) => void;
    /** The item's ×: it is read and leaves, and what stood above it drops down. */
    readonly onItemDismiss: (itemId: string) => void;
    readonly onFollowToggle: (targetId: string, following: boolean) => void;
    /** Opens the whole Feed. */
    readonly onViewAll: () => void;
    /** Marks everything read, which empties the region. */
    readonly onReadAll: () => void;
}

/** "now", "40s", "3m", "2h": how long ago, in the width of a row's meta. */
export function liveFeedAgeText(at: number, now: number): string {
    const seconds = Math.max(0, Math.round((now - at) / 1000));
    if (seconds < 10) return "now";
    if (seconds < 60) return `${String(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${String(minutes)}m`;
    return `${String(Math.floor(minutes / 60))}h`;
}

/** "0:09", "1:24": a clip's length. */
export function liveFeedDurationText(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

/*
 * An item comes in by growing from nothing at the bottom, so the items above it
 * glide up by exactly its height, once, instead of stepping. Run from a ref
 * callback on the item's first attachment only: one that arrived while the
 * feed was switched off is already there when it is switched on, and just
 * appears with the rest.
 */
const entered = new WeakSet<Element>();
function liveFeedItemAttach(element: HTMLElement | null) {
    if (element === null || entered.has(element)) return;
    entered.add(element);
    if (element.closest("[hidden]") !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const height = element.getBoundingClientRect().height;
    element.animate(
        [
            { height: "0px", marginTop: "-2px", opacity: 0 },
            { height: `${String(height)}px`, marginTop: "0px", opacity: 1 },
        ],
        { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
}

/*
 * The column's height is measured onto the panel for the scrim and the hover
 * header: the scrim washes out only as much of the sidebar as the feed holds,
 * so an empty feed covers nothing, and the header stands on top of what is
 * there rather than at the top of an empty region.
 */
function liveFeedPanelAttach(element: HTMLDivElement | null) {
    if (element === null) return;
    const column = element.querySelector<HTMLElement>(".happy-live-feed__column");
    if (column === null) return;
    const observer = new ResizeObserver(() => {
        element.style.setProperty(
            "--happy-live-feed-content",
            `${String(column.getBoundingClientRect().height)}px`,
        );
    });
    observer.observe(column);
    return () => observer.disconnect();
}

/** A quiet text button: View all, Read all. */
function LiveFeedLink(props: {
    readonly label: string;
    readonly disabled?: boolean;
    readonly onPress: () => void;
}) {
    return (
        <button
            className="happy-live-feed__link"
            data-happy-desktop-ui="live-feed-link"
            disabled={props.disabled}
            onClick={props.onPress}
            type="button"
        >
            {props.label}
        </button>
    );
}

/** The one thing hovering an item offers; each has its own width to clear. */
type LiveFeedQuickKind = "follow" | "following" | "reply" | "play";

/** The one thing hovering an item offers, laid over the end of its line. */
function QuickAction(props: {
    readonly label: string;
    readonly title: string;
    readonly kind: LiveFeedQuickKind;
    readonly onAction: () => void;
}) {
    return (
        /* A `span`, as the sidebar's row controls are: the row is the button. */
        <span
            aria-label={props.title}
            className="happy-live-feed-item__quick"
            data-happy-desktop-ui="live-feed-item-quick"
            data-kind={props.kind}
            onClick={(event) => {
                event.stopPropagation();
                props.onAction();
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                props.onAction();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            role="button"
            tabIndex={0}
            title={props.title}
        >
            {props.kind === "following" ? <Icon name="check" size={12} /> : null}
            {props.kind === "play" ? <Icon name="play" size={12} /> : null}
            <span>{props.label}</span>
        </span>
    );
}

/** A post's thumbnail: two rows tall, square or 16:9. A clip plays in it only when asked. */
function Thumbnail(props: {
    readonly media: LiveFeedMedia;
    readonly playing: boolean;
    readonly onPlay: () => void;
    readonly onEnded: () => void;
}) {
    const media = props.media;
    if (media.kind === "image")
        return (
            <span className="happy-live-feed-item__thumb" data-shape={media.shape}>
                <img alt="" draggable={false} src={media.url} />
            </span>
        );
    return (
        /* Pressing the still plays it, as Play does; the rest of the row opens the post. */
        <span
            aria-label={props.playing ? "Playing" : "Play video"}
            className="happy-live-feed-item__thumb"
            data-playing={props.playing ? "" : undefined}
            data-shape={media.shape}
            onClick={(event) => {
                event.stopPropagation();
                props.onPlay();
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                props.onPlay();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            role="button"
            tabIndex={-1}
        >
            {props.playing ? (
                <video
                    autoPlay
                    muted
                    onEnded={props.onEnded}
                    playsInline
                    poster={media.posterUrl}
                    src={media.url}
                />
            ) : (
                <img alt="" draggable={false} src={media.posterUrl} />
            )}
            {props.playing ? null : (
                <span aria-hidden="true" className="happy-live-feed-item__thumb-play">
                    <Icon name="play" size={12} />
                </span>
            )}
        </span>
    );
}

/**
 * One item: `[mark] line [hover: one quick action, ×]`, as tall as a sidebar
 * row and drawn with the row's own box, type and hover. The × is a
 * hover-revealed row action, shown on hover or its own keyboard focus. Clicking it opens what
 * it is about.
 */
export function LiveFeedEntry(props: {
    readonly item: LiveFeedItem;
    readonly now: number;
    readonly onOpen: (itemId: string) => void;
    readonly onDismiss: (itemId: string) => void;
    readonly onFollowToggle: (targetId: string, following: boolean) => void;
}) {
    const item = props.item;
    const [playing, playingSet] = useState(false);
    const media = item.tier === "post" ? item.media : undefined;

    let lead;
    let line;
    if (media !== undefined) {
        lead = (
            <Thumbnail
                media={media}
                onEnded={() => playingSet(false)}
                onPlay={() => playingSet(true)}
                playing={playing}
            />
        );
        line = <span className="happy-live-feed-item__strong">{item.detail ?? item.title}</span>;
    } else if (item.tier === "mention") {
        lead = (
            <span className="happy-live-feed-item__at">
                <Icon name="at" size={16} />
            </span>
        );
        line = (
            <>
                <span className="happy-live-feed-item__who">{item.actor.name}</span>
                <span className="happy-live-feed-item__colon">: </span>
                <span className="happy-live-feed-item__said">{item.detail}</span>
            </>
        );
    } else if (item.tier === "card") {
        lead = (
            <FeedSubjectGlyph
                size={16}
                subject={item.subject}
                {...(item.artifactType === undefined ? {} : { artifactType: item.artifactType })}
            />
        );
        line = (
            <>
                <span className="happy-live-feed-item__strong">{item.title}</span>
                {` · ${item.actor.name}`}
            </>
        );
    } else {
        lead = <Avatar {...item.actor.face} size="xs" />;
        line = (
            <>
                <span className="happy-live-feed-item__strong">{item.actor.name}</span>
                {` ${item.verb} `}
                <span className="happy-live-feed-item__strong">{item.title}</span>
            </>
        );
    }

    let quick: { readonly kind: LiveFeedQuickKind; readonly node: ReactNode } | null = null;
    if (media?.kind === "video") {
        if (!playing)
            quick = {
                kind: "play",
                node: (
                    <QuickAction
                        kind="play"
                        label={
                            media.durationMs === undefined
                                ? "Play"
                                : liveFeedDurationText(media.durationMs)
                        }
                        onAction={() => playingSet(true)}
                        title="Play video"
                    />
                ),
            };
    } else if (item.tier === "mention") {
        quick = {
            kind: "reply",
            node: (
                <QuickAction
                    kind="reply"
                    label="Reply"
                    onAction={() => props.onOpen(item.id)}
                    title={`Reply in ${item.place ?? item.title}`}
                />
            ),
        };
    } else if (item.follow !== undefined && item.tier === "line") {
        const target = item.follow;
        const kind = target.following ? "following" : "follow";
        quick = {
            kind,
            node: (
                <QuickAction
                    kind={kind}
                    label={target.following ? "Following" : "Follow"}
                    onAction={() => props.onFollowToggle(target.id, !target.following)}
                    title={target.following ? `Unfollow ${target.label}` : `Follow ${target.label}`}
                />
            ),
        };
    }

    return (
        <button
            className="happy-sidebar__item happy-live-feed-item"
            data-entry-id={item.id}
            data-happy-desktop-ui="live-feed-item"
            data-leaving={item.leaving ? "" : undefined}
            data-quick={quick?.kind}
            data-rows={media === undefined ? "1" : "2"}
            data-tier={item.tier}
            onClick={() => props.onOpen(item.id)}
            ref={liveFeedItemAttach}
            title={item.tier === "mention" ? `${item.actor.name}: ${item.detail ?? ""}` : undefined}
            type="button"
        >
            <span className="happy-live-feed-item__lead">{lead}</span>
            <span className="happy-live-feed-item__text">
                <span className="happy-sidebar__item-label happy-live-feed-item__line">{line}</span>
                {media === undefined ? null : (
                    <span className="happy-live-feed-item__meta">
                        {`${item.actor.name} · ${liveFeedAgeText(item.at, props.now)}`}
                    </span>
                )}
            </span>
            {quick?.node}
            <span className="happy-live-feed-item__close">
                <SidebarRowAction
                    action={{ icon: "close", label: "Dismiss", reveal: "hover" }}
                    onAction={() => props.onDismiss(item.id)}
                />
            </span>
        </button>
    );
}

/**
 * LiveFeedPanel — what is unread in the feed, rising from the sidebar footer.
 *
 * It stands where the update card stands, over the bottom of the sidebar's
 * rows and exactly as wide as them, in one region of a fixed height:
 * `LIVE_FEED_ROWS` rows. Items stack newest at the bottom; when more is
 * unread than fits, the top row washes out and the rest wait above it. When
 * an item is read — its ×, opened, or its time on screen is up — it fades
 * where it stands and its slot closes, so everything above drops down and the
 * older items come back into view, until nothing is unread and the region is
 * gone.
 *
 * Hovering it holds it still (the owner stops arrivals and expiry, without
 * saying so) and lays View all and Read all over its top-left corner, which
 * take no room and move nothing. The footer's control shows or hides the
 * whole region.
 */
export function LiveFeedPanel(props: LiveFeedPanelProps) {
    let rows = 0;
    let live = false;
    for (const item of props.items) {
        rows += liveFeedItemRows(item);
        if (item.leaving !== true) live = true;
    }
    return (
        <div
            aria-label="Live feed"
            className="happy-live-feed"
            data-empty={live ? undefined : ""}
            data-happy-desktop-ui="live-feed"
            data-overflow={rows > LIVE_FEED_ROWS ? "" : undefined}
            hidden={!props.shown}
            onPointerEnter={() => props.onHoverChange(true)}
            onPointerLeave={() => props.onHoverChange(false)}
            ref={liveFeedPanelAttach}
            role="log"
            style={{ "--happy-live-feed-rows": LIVE_FEED_ROWS } as CSSProperties}
        >
            <span aria-hidden="true" className="happy-live-feed__scrim" />
            <div className="happy-live-feed__scroller">
                <div className="happy-live-feed__column">
                    {props.items.map((item) => (
                        <LiveFeedEntry
                            item={item}
                            key={item.id}
                            now={props.now}
                            onDismiss={props.onItemDismiss}
                            onFollowToggle={props.onFollowToggle}
                            onOpen={props.onItemOpen}
                        />
                    ))}
                </div>
            </div>
            <div className="happy-live-feed__header" data-happy-desktop-ui="live-feed-header">
                <LiveFeedLink label="View all" onPress={props.onViewAll} />
                <LiveFeedLink label="Read all" onPress={props.onReadAll} />
            </div>
        </div>
    );
}

/**
 * LiveFeedControl — the feed's control at the start of the footer's status
 * line. The glyph shows or hides the feed region and carries the unread
 * count: quiet while the feed is on screen, the sidebar's unread red while it
 * is off and things pile up unseen. Hovering it lays View feed and Read all
 * just after it, over the footer's free space, so nothing on the row moves;
 * Read all is there but disabled when nothing is unread.
 */
export function LiveFeedControl(props: {
    readonly on: boolean;
    readonly unread: number;
    readonly onToggle: () => void;
    readonly onViewAll: () => void;
    readonly onReadAll: () => void;
}) {
    return (
        <div
            className="happy-live-feed-control"
            data-happy-desktop-ui="live-feed-control"
            data-on={props.on ? "" : undefined}
        >
            <button
                aria-label={
                    props.unread > 0 ? `Live feed, ${String(props.unread)} unread` : "Live feed"
                }
                aria-pressed={props.on}
                className="happy-live-feed-toggle"
                data-happy-desktop-ui="live-feed-toggle"
                onClick={props.onToggle}
                type="button"
            >
                <Icon name="feed" size={14} />
                {props.unread > 0 ? (
                    <CountBadge
                        className="happy-live-feed-toggle__count"
                        count={Math.min(props.unread, 99)}
                        tone="neutral"
                    />
                ) : null}
            </button>
            <div className="happy-live-feed-control__actions">
                <LiveFeedLink label="View feed" onPress={props.onViewAll} />
                <LiveFeedLink
                    disabled={props.unread === 0}
                    label="Read all"
                    onPress={props.onReadAll}
                />
            </div>
        </div>
    );
}
