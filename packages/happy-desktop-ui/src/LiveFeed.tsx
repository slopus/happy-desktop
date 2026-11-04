import type { HappyAgentArtifactType } from "happy-desktop-state";
import { useState, type ReactNode } from "react";
import { Avatar } from "./Avatar";
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
    /** Its time in the stream is up: it fades where it stands, then the owner drops it. */
    readonly leaving?: boolean;
    /** Arrived since the reader last opened the stack. */
    readonly unread?: boolean;
}

/** `stream` floats new items up and lets them go; `stack` holds them still to be read. */
export type LiveFeedMode = "stream" | "stack";

export interface LiveFeedPanelProps {
    readonly mode: LiveFeedMode;
    /** Oldest first: the newest item sits at the bottom, nearest the footer. */
    readonly items: readonly LiveFeedItem[];
    readonly now: number;
    /** The pointer is over the items: nothing arrives, nothing leaves. */
    readonly paused: boolean;
    /** Items that arrived while paused and wait to come in. */
    readonly queued: number;
    readonly onHoverChange: (hovering: boolean) => void;
    readonly onItemOpen: (itemId: string) => void;
    /** The item's ×: out of the stream now, or out of the stack. */
    readonly onItemDismiss: (itemId: string) => void;
    readonly onFollowToggle: (targetId: string, following: boolean) => void;
    /** Opens the whole Feed. */
    readonly onViewAll: () => void;
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
 * callback on the item's first attachment only: an item already on screen when
 * the panel turns into the stack keeps its node and does not play again, and
 * one shown first in the stack just appears.
 */
const entered = new WeakSet<Element>();
function liveFeedItemAttach(element: HTMLElement | null) {
    if (element === null || entered.has(element)) return;
    entered.add(element);
    if (element.closest('[data-mode="stack"]') !== null) return;
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
 * The band the stream may take is a fifth of the sidebar's height, which is
 * not the panel's containing block (the footer is), so the sidebar's height is
 * measured onto the panel as a custom property that only the band reads. The
 * column's height is measured too, for the scrim: it washes out only as much
 * of the sidebar as the stream holds, so an empty stream covers nothing.
 */
function liveFeedPanelAttach(element: HTMLDivElement | null) {
    if (element === null) return;
    const sidebar = element.closest<HTMLElement>(".happy-sidebar");
    const column = element.querySelector<HTMLElement>(".happy-live-feed__column");
    if (sidebar === null || column === null) return;
    const observer = new ResizeObserver(() => {
        element.style.setProperty(
            "--happy-live-feed-sidebar",
            `${String(sidebar.getBoundingClientRect().height)}px`,
        );
        element.style.setProperty(
            "--happy-live-feed-content",
            `${String(column.getBoundingClientRect().height)}px`,
        );
    });
    observer.observe(sidebar);
    observer.observe(column);
    return () => observer.disconnect();
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
 * One item: `[mark] line [hover: one quick action] ×`, as tall as a sidebar
 * row and drawn with the row's own box, type and hover. Clicking it opens what
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
            data-feed-unread={item.unread ? "" : undefined}
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
                    action={{ icon: "close", label: "Dismiss" }}
                    onAction={() => props.onDismiss(item.id)}
                />
            </span>
        </button>
    );
}

/**
 * LiveFeedPanel — the feed as a live stream rising from the sidebar footer.
 *
 * It stands where the update card stands, over the bottom of the sidebar's
 * rows and exactly as wide as them, and takes at most a fifth of the sidebar's
 * height. In `stream` mode new items come in at the bottom and the older ones
 * drift up and wash out at the top of that band; each leaves on its own after
 * a while, fading where it stands. The column is anchored to the bottom, so an
 * item leaving from the top moves nothing.
 *
 * While the pointer is over the items the stream holds still — nothing new
 * pushes in under the cursor and nothing times out — and what arrives in the
 * meantime waits, counted in the footer.
 *
 * In `stack` mode the same rows, with the same nodes, hold everything still
 * collected under a "Feed" heading with View all, on the sidebar's own
 * background: the wash lifts and the column scrolls.
 */
export function LiveFeedPanel(props: LiveFeedPanelProps) {
    const stack = props.mode === "stack";
    return (
        <div
            aria-label={stack ? "Feed" : "Live feed"}
            className="happy-live-feed"
            data-happy-desktop-ui="live-feed"
            data-mode={props.mode}
            data-paused={props.paused ? "" : undefined}
            ref={liveFeedPanelAttach}
            role="log"
        >
            <span aria-hidden="true" className="happy-live-feed__scrim" />
            {/* The stack's heading is a sidebar section heading: its label, its
                count, and View all where a heading keeps its control. */}
            <div aria-hidden={!stack} className="happy-live-feed__header" inert={!stack}>
                <span className="happy-sidebar__section-item-label happy-live-feed__heading">
                    {`Feed · ${String(props.items.length)}`}
                </span>
                <button
                    className="happy-live-feed__view-all"
                    onClick={props.onViewAll}
                    type="button"
                >
                    View all
                </button>
            </div>
            <div className="happy-live-feed__scroller">
                <div
                    className="happy-live-feed__column"
                    onPointerEnter={() => props.onHoverChange(true)}
                    onPointerLeave={() => props.onHoverChange(false)}
                >
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
            <span
                aria-live="polite"
                className="happy-live-feed__paused"
                data-shown={props.paused && !stack ? "" : undefined}
            >
                <Icon name="pause" size={12} />
                {props.queued > 0 ? `${String(props.queued)} new` : "Paused"}
            </span>
        </div>
    );
}

/**
 * LiveFeedToggle — the feed's control at the start of the footer's status
 * line: it switches the stream and the stack, and counts what arrived since
 * the stack was last opened. The count grows the control to its right only,
 * into the footer's free space, so nothing else on the row moves.
 */
export function LiveFeedToggle(props: {
    readonly mode: LiveFeedMode;
    readonly unread: number;
    readonly onToggle: () => void;
}) {
    const stack = props.mode === "stack";
    return (
        <button
            aria-label={
                stack
                    ? "Back to the live feed"
                    : props.unread > 0
                      ? `Open the feed, ${String(props.unread)} new`
                      : "Open the feed"
            }
            aria-pressed={stack}
            className="happy-live-feed-toggle"
            data-happy-desktop-ui="live-feed-toggle"
            data-unread={props.unread > 0 ? "" : undefined}
            onClick={props.onToggle}
            title={stack ? "Show the live feed" : "Show the feed stack"}
            type="button"
        >
            <Icon name="feed" size={14} />
            {props.unread > 0 ? (
                <span className="happy-live-feed-toggle__count">
                    {props.unread > 99 ? "99+" : String(props.unread)}
                </span>
            ) : null}
        </button>
    );
}
