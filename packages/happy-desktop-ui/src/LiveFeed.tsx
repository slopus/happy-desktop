import type { HappyAgentArtifactType } from "happy-desktop-state";
import { useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Icon } from "./Icon";
import {
    FeedSubjectAvatar,
    FeedSubjectGlyph,
    type HappyAgentFeedActor,
    type HappyAgentFeedSubjectKind,
} from "./pages/feed/feedPresentation";

/**
 * How much room an item takes in the stream, chosen by what it carries rather
 * than by who sent it:
 *
 * - `line`: one 28px line — someone started a task, added a todo, edited a
 *   document. Ambient awareness; read in a glance or not at all.
 * - `card`: two lines on a tile — an artifact was published or got a new
 *   version. Something to open, named by its title.
 * - `post`: a post with media — what a story used to be. An image, or a
 *   video's still frame with its length, square or 16:9, with a caption. A
 *   video plays only when the reader presses it.
 * - `mention`: someone named the reader in a chat, looped them into a task, or
 *   replied to their post. Always delivered, whatever the reader follows,
 *   marked with an accent edge and "@ you", quoting the line that named them.
 */
export type LiveFeedTier = "line" | "card" | "post" | "mention";

/** A post's picture or clip. Shape is the owner's, from the media's own size. */
export interface LiveFeedMedia {
    readonly kind: "image" | "video";
    readonly url: string;
    /** A video's still frame, painted until the reader plays it. */
    readonly posterUrl?: string;
    /** A video's length, for the badge on its still. */
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
    /** A card's second thought, a post's caption, or the line that mentioned the reader. */
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
    readonly onFollowToggle: (targetId: string, following: boolean) => void;
    /** Opens the whole Feed. */
    readonly onViewAll: () => void;
}

/** "now", "40s", "3m", "2h": how long ago, in the width of a stream line. */
export function liveFeedAgeText(at: number, now: number): string {
    const seconds = Math.max(0, Math.round((now - at) / 1000));
    if (seconds < 10) return "now";
    if (seconds < 60) return `${String(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${String(minutes)}m`;
    return `${String(Math.floor(minutes / 60))}h`;
}

/*
 * An item comes in by growing from nothing at the bottom while it rises into
 * place, so the items above it glide up by exactly its height, once, instead
 * of stepping. Run from a ref callback on the item's first attachment only: an
 * item that is already on screen when the panel turns into the stack keeps its
 * node and does not play again, and one shown first in the stack just appears.
 */
const entered = new WeakSet<Element>();
function liveFeedItemAttach(element: HTMLDivElement | null) {
    if (element === null || entered.has(element)) return;
    entered.add(element);
    if (element.closest('[data-mode="stack"]') !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const height = element.getBoundingClientRect().height;
    element.animate(
        [
            {
                height: "0px",
                marginTop: "-6px",
                opacity: 0,
                transform: "translateY(12px) scale(0.96)",
            },
            { height: `${String(height)}px`, marginTop: "0px", opacity: 1, transform: "none" },
        ],
        { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
}

/*
 * The scrim behind the stream washes out the sidebar rows beneath it, the way
 * a live stream darkens the bottom of the video under its comments. It is as
 * tall as what the stream holds, so one item washes out one item's worth of
 * sidebar: the column's height is measured onto the panel as a custom
 * property, which only the scrim reads.
 */
function liveFeedColumnAttach(element: HTMLDivElement | null) {
    if (element === null) return;
    const panel = element.closest<HTMLElement>(".happy-live-feed");
    if (panel === null) return;
    const observer = new ResizeObserver(() => {
        panel.style.setProperty(
            "--happy-live-feed-content",
            `${String(element.getBoundingClientRect().height)}px`,
        );
    });
    observer.observe(element);
    return () => observer.disconnect();
}

function FollowControl(props: {
    readonly target: LiveFeedFollowTarget;
    readonly onToggle: (targetId: string, following: boolean) => void;
}) {
    const following = props.target.following;
    return (
        <button
            aria-label={
                following
                    ? `Unfollow ${props.target.label}`
                    : `Follow ${props.target.label} for its updates`
            }
            aria-pressed={following}
            className="happy-live-feed-follow"
            data-following={following ? "" : undefined}
            onClick={(event) => {
                event.stopPropagation();
                props.onToggle(props.target.id, !following);
            }}
            title={following ? `Following ${props.target.label}` : `Follow ${props.target.label}`}
            type="button"
        >
            <Icon name={following ? "check" : "plus"} size={12} />
            <span>{following ? "Following" : "Follow"}</span>
        </button>
    );
}

function ItemByline(props: { readonly item: LiveFeedItem; readonly now: number }) {
    return (
        <span className="happy-live-feed-item__byline">
            <span className="happy-live-feed-item__actor">{props.item.actor.name}</span>
            <span className="happy-live-feed-item__verb">{props.item.verb}</span>
            <span className="happy-live-feed-item__age">
                {liveFeedAgeText(props.item.at, props.now)}
            </span>
        </span>
    );
}

/** "0:09", "1:24": a clip's length on its still. */
export function liveFeedDurationText(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

/*
 * A video never plays by itself: the stream shows its still with a play mark
 * and its length, and pressing the still plays it in the same box, so
 * starting it moves nothing. It goes back to its still when it ends.
 */
function ItemMedia(props: { readonly media: LiveFeedMedia }) {
    const media = props.media;
    const [playing, playingSet] = useState(false);
    if (media.kind === "image")
        return (
            <span className="happy-live-feed-item__media" data-shape={media.shape}>
                <img alt="" draggable={false} src={media.url} />
            </span>
        );
    return (
        <span
            aria-label={playing ? "Playing" : "Play video"}
            className="happy-live-feed-item__media"
            data-playing={playing ? "" : undefined}
            data-shape={media.shape}
            onClick={(event) => {
                event.stopPropagation();
                playingSet(true);
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                playingSet(true);
            }}
            role="button"
            tabIndex={0}
        >
            {playing ? (
                <video
                    autoPlay
                    muted
                    onEnded={() => playingSet(false)}
                    playsInline
                    poster={media.posterUrl}
                    src={media.url}
                />
            ) : (
                <>
                    <img alt="" draggable={false} src={media.posterUrl} />
                    <span aria-hidden="true" className="happy-live-feed-item__play">
                        <Icon name="play" size={14} />
                    </span>
                    {media.durationMs === undefined ? null : (
                        <span className="happy-live-feed-item__duration">
                            {liveFeedDurationText(media.durationMs)}
                        </span>
                    )}
                </>
            )}
        </span>
    );
}

/** One item, drawn by its tier. The whole item opens what it is about. */
export function LiveFeedEntry(props: {
    readonly item: LiveFeedItem;
    readonly now: number;
    readonly onOpen: (itemId: string) => void;
    readonly onFollowToggle: (targetId: string, following: boolean) => void;
}) {
    const item = props.item;
    const follow =
        item.follow === undefined ? null : (
            <FollowControl onToggle={props.onFollowToggle} target={item.follow} />
        );
    let body;
    if (item.tier === "line") {
        body = (
            <>
                <Avatar {...item.actor.face} size="xs" />
                <span className="happy-live-feed-item__line">
                    <span className="happy-live-feed-item__actor">{item.actor.name}</span>{" "}
                    <span className="happy-live-feed-item__verb">{item.verb}</span>{" "}
                    <span className="happy-live-feed-item__title">{item.title}</span>
                </span>
            </>
        );
    } else if (item.tier === "mention") {
        body = (
            <span className="happy-live-feed-item__text">
                <span className="happy-live-feed-item__header">
                    <Avatar {...item.actor.face} size="xs" />
                    <span className="happy-live-feed-item__byline">
                        <span className="happy-live-feed-item__actor">{item.actor.name}</span>
                        <span className="happy-live-feed-item__verb">{item.verb}</span>
                        <span className="happy-live-feed-item__at-you">@ you</span>
                        <span className="happy-live-feed-item__age">
                            {liveFeedAgeText(item.at, props.now)}
                        </span>
                    </span>
                </span>
                {item.detail ? (
                    <span className="happy-live-feed-item__quote">{item.detail}</span>
                ) : null}
                <span className="happy-live-feed-item__place">
                    <Icon name="chat" size={12} />
                    <span>{item.place ?? item.title}</span>
                </span>
            </span>
        );
    } else if (item.tier === "card") {
        body = (
            <>
                <FeedSubjectAvatar face={undefined} size="sm">
                    <FeedSubjectGlyph
                        size={16}
                        subject={item.subject}
                        {...(item.artifactType === undefined
                            ? {}
                            : { artifactType: item.artifactType })}
                    />
                </FeedSubjectAvatar>
                <span className="happy-live-feed-item__text">
                    <ItemByline item={item} now={props.now} />
                    <span className="happy-live-feed-item__title">{item.title}</span>
                </span>
            </>
        );
    } else {
        const header = (
            <span className="happy-live-feed-item__header">
                <Avatar {...item.actor.face} size="xs" />
                <ItemByline item={item} now={props.now} />
            </span>
        );
        const caption = item.detail ? (
            <span className="happy-live-feed-item__caption">{item.detail}</span>
        ) : null;
        body =
            item.media?.shape === "square" ? (
                <span className="happy-live-feed-item__text">
                    {header}
                    <span className="happy-live-feed-item__beside">
                        <ItemMedia media={item.media} />
                        {caption}
                    </span>
                </span>
            ) : (
                <span className="happy-live-feed-item__text">
                    {header}
                    {item.media ? <ItemMedia media={item.media} /> : null}
                    {caption}
                </span>
            );
    }
    return (
        <div
            className="happy-live-feed-item"
            data-entry-id={item.id}
            data-happy-desktop-ui="live-feed-item"
            data-leaving={item.leaving ? "" : undefined}
            data-shape={item.media?.shape}
            data-tier={item.tier}
            data-unread={item.unread ? "" : undefined}
            ref={liveFeedItemAttach}
        >
            <button
                className="happy-live-feed-item__body"
                onClick={() => props.onOpen(item.id)}
                type="button"
            >
                {body}
            </button>
            {follow}
        </div>
    );
}

/**
 * LiveFeedPanel — the feed as a live stream rising from the sidebar footer.
 *
 * It stands where the update card stands: on the footer row, as wide as it,
 * inside the sidebar column. In `stream` mode new items come in at the bottom
 * and the older ones drift up and wash out under a fade at the top; each
 * leaves on its own after a while, fading where it stands. The column is
 * anchored to the bottom, so an item leaving from the top moves nothing.
 *
 * While the pointer is over the items the stream holds still — nothing new
 * pushes in under the cursor and nothing times out — and what arrives in the
 * meantime waits, counted on a pill.
 *
 * In `stack` mode the same box, with the same item nodes, becomes a card that
 * holds everything still collected: the wash lifts, older items come back, the
 * column scrolls, and "View all" opens the whole Feed. Nothing an item draws
 * moves between the two modes.
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
            role="log"
        >
            <span aria-hidden="true" className="happy-live-feed__scrim" />
            <div aria-hidden={!stack} className="happy-live-feed__header" inert={!stack}>
                <span className="happy-live-feed__heading">Feed</span>
                <span className="happy-live-feed__count">{props.items.length}</span>
                <Button onClick={props.onViewAll} size="small" variant="ghost">
                    View all
                </Button>
            </div>
            <div className="happy-live-feed__scroller">
                <div
                    className="happy-live-feed__column"
                    ref={liveFeedColumnAttach}
                    onPointerEnter={() => props.onHoverChange(true)}
                    onPointerLeave={() => props.onHoverChange(false)}
                >
                    {props.items.map((item) => (
                        <LiveFeedEntry
                            item={item}
                            key={item.id}
                            now={props.now}
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
                {props.queued > 0 ? `Paused · ${String(props.queued)} new` : "Paused"}
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
