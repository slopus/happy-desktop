import { useSyncExternalStore } from "react";
import { MediaImageTile } from "../../ConversationMedia";
import type { LocalTimeZone } from "../../localTime";
import {
    uiTextClampLayout,
    uiTextNaturalWidth,
    type UiTextClampLayout,
} from "../../messageTextLayout";
import { reducedMotionGet, reducedMotionSubscribe } from "../../reducedMotion";
import { thumbhashDataUrl } from "../../thumbhashDataUrl";
import {
    FeedActorFaces,
    FeedSubjectAvatar,
    FeedSubjectGlyph,
    feedActivityText,
    feedTimeText,
    type HappyAgentFeedCover,
    type HappyAgentFeedEntry,
} from "./feedPresentation";

/** Every entry row is this tall, so a long feed is laid out without measuring. */
export const HAPPY_AGENT_FEED_ROW_HEIGHT = 64;
/** A date's heading over its card, with the gap down from the card before it. */
export const HAPPY_AGENT_FEED_HEADING_HEIGHT = 44;

/*
 * A post's rows, top to bottom, which `happy-agent-feed.css` lays out: the
 * row's own headline and activity, 10px down from the top; the summary's
 * lines; the cover; and the 16px inset the summary and cover keep from the
 * card's sides and foot, with a 12px gap between each of them.
 */
const POST_TOP = 10;
const POST_HEAD = 44;
const POST_GAP = 12;
const POST_INSET = 16;
/* The summary: the feed's 14/20 body text, kept to four lines until opened. */
const SUMMARY_SIZE = 14;
const SUMMARY_LINE = 20;
const SUMMARY_LINES = 4;
/* The controls that end the summary's last line, glued to the word before
   them as they are drawn. */
const SUMMARY_MORE = "\u2026\u00a0Show more";
const SUMMARY_LESS = "\u00a0Show less";

/** A cover's height when drawn `width` wide, at exactly its shape. */
export function happyAgentFeedCoverHeight(
    cover: Pick<HappyAgentFeedCover, "aspect">,
    width: number,
): number {
    return cover.aspect === "wide" ? Math.round((width * 9) / 16) : width;
}

/** How a post's summary is laid out in a card `width` wide. */
function summaryLayout(summary: string, width: number): UiTextClampLayout {
    return uiTextClampLayout(
        summary,
        SUMMARY_SIZE,
        Math.max(0, width - 2 * POST_INSET),
        SUMMARY_LINES,
        uiTextNaturalWidth(SUMMARY_MORE, SUMMARY_SIZE),
        uiTextNaturalWidth(SUMMARY_LESS, SUMMARY_SIZE),
    );
}

/** Whether an entry is drawn as a post: an artifact with a cover or a summary. */
function isPost(entry: HappyAgentFeedEntry): boolean {
    return entry.cover !== undefined || entry.summary !== undefined;
}

/**
 * How tall an entry's slot is in a card `width` wide: a row's fixed height, or
 * a post's, which is its summary's lines as laid out at that width, collapsed
 * or `expanded`, and its cover's shape at the card's width. Known ahead, so
 * the feed is laid out without measuring a post.
 */
export function happyAgentFeedEntryHeight(
    entry: HappyAgentFeedEntry,
    width: number,
    expanded: boolean,
): number {
    if (!isPost(entry)) return HAPPY_AGENT_FEED_ROW_HEIGHT;
    let height = POST_TOP + POST_HEAD + POST_INSET;
    if (entry.summary !== undefined) {
        const layout = summaryLayout(entry.summary, width);
        height +=
            POST_GAP +
            SUMMARY_LINE *
                (expanded && layout.clamped !== null ? layout.lines : layout.clampedLines);
    }
    if (entry.cover !== undefined)
        height +=
            POST_GAP + happyAgentFeedCoverHeight(entry.cover, Math.max(0, width - 2 * POST_INSET));
    return height;
}

export interface HappyAgentFeedRowProps {
    entry: HappyAgentFeedEntry;
    /** The row's part of its card: the first rounds its top, the last its bottom. */
    first: boolean;
    last: boolean;
    /** The moment the row's time is told against. */
    now: number;
    zone?: LocalTimeZone;
    onOpen: (entryId: string) => void;
    /** The card's width, which a post's summary is laid out at. */
    width: number;
    /** Whether a post's long summary is shown whole: the reader's own choice, per entry. */
    expanded: boolean;
    onExpandedChange: (entryId: string, expanded: boolean) => void;
}

/**
 * One feed entry as a row of its date's card: the subject's avatar, its title
 * and when it last changed, and under them the faces of who changed it beside
 * what they did — the newest change's own words where it has them, such as a
 * new todo's text. An entry the reader has not looked at is set heavier and
 * carries a dot in a lane every row reserves, so reading it recolours the row
 * and moves nothing. The whole row opens the subject.
 *
 * An artifact with a cover or a summary is a post: the same row, then its
 * summary, then the cover across the card at exactly its shape, 16:9 or
 * square. A long summary shows four lines, the last ending in "Show more",
 * which opens the rest in place; anywhere else on the post opens the
 * artifact. The post's height is known from the summary's laid-out lines and
 * the cover's shape, and the picture fades in over its ThumbHash without
 * moving anything. An animated cover plays, unless the reader asked for less
 * motion, when it holds its first frame.
 */
export function HappyAgentFeedRow(props: HappyAgentFeedRowProps) {
    const entry = props.entry;
    const shared = {
        className: "happy-agent-feed-card-row happy-agent-feed-row",
        "data-entry-id": entry.id,
        "data-first": props.first ? "" : undefined,
        "data-happy-desktop-ui": "happy-agent-feed-row",
        "data-last": props.last ? "" : undefined,
        "data-unread": entry.unread ? "" : undefined,
    } as const;
    if (!isPost(entry))
        return (
            <button {...shared} onClick={() => props.onOpen(entry.id)} type="button">
                <HappyAgentFeedRowHead {...props} />
            </button>
        );
    const cover = entry.cover;
    // The post opens through one control laid over all of it, so "Show more"
    // can be a control of its own rather than one nested in another.
    return (
        <div {...shared} data-post="">
            <span className="happy-agent-feed-row__head">
                <HappyAgentFeedRowHead {...props} />
            </span>
            {entry.summary === undefined ? null : (
                <FeedPostSummary
                    expanded={props.expanded}
                    layout={summaryLayout(entry.summary, props.width)}
                    onExpandedChange={(expanded) => props.onExpandedChange(entry.id, expanded)}
                />
            )}
            {cover === undefined ? null : <FeedPostCover cover={cover} title={entry.title} />}
            <button
                aria-label={`Open ${entry.title || "Untitled"}`}
                className="happy-agent-feed-row__open"
                data-happy-desktop-ui="happy-agent-feed-row-open"
                onClick={() => props.onOpen(entry.id)}
                type="button"
            />
        </div>
    );
}

/**
 * A post's summary, its line breaks kept: whole, or its first four lines with
 * "Show more" closing the last, as `layout` laid them out at the card's width.
 */
function FeedPostSummary(props: {
    layout: UiTextClampLayout;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
}) {
    const layout = props.layout;
    const clamped = layout.clamped !== null && !props.expanded;
    return (
        <p
            className="happy-agent-feed-row__post-summary"
            data-expanded={layout.clamped !== null && props.expanded ? "" : undefined}
            data-happy-desktop-ui="happy-agent-feed-row-post-summary"
        >
            {clamped ? layout.clamped : layout.text}
            {layout.clamped === null ? null : (
                <>
                    {clamped ? "\u2026\u00a0" : "\u00a0"}
                    <button
                        aria-expanded={props.expanded}
                        className="happy-agent-feed-row__more"
                        data-happy-desktop-ui="happy-agent-feed-row-more"
                        onClick={() => props.onExpandedChange(!props.expanded)}
                        type="button"
                    >
                        {clamped ? "Show more" : "Show less"}
                    </button>
                </>
            )}
        </p>
    );
}

/**
 * A post's cover across the card, read whole so an animated one plays; the
 * browser stops it while it is off screen or the window is hidden, and it
 * holds its first frame for a reader who asked for less motion.
 */
function FeedPostCover(props: { cover: HappyAgentFeedCover; title: string }) {
    const cover = props.cover;
    const still = useSyncExternalStore(reducedMotionSubscribe, reducedMotionGet);
    const placeholderUrl =
        cover.thumbhash === undefined ? undefined : thumbhashDataUrl(cover.thumbhash);
    return (
        <MediaImageTile
            alt={`${props.title || "Untitled"} cover`}
            className="happy-agent-feed-row__cover"
            {...(placeholderUrl === undefined ? {} : { placeholderUrl })}
            still={still}
            style={cover.background === undefined ? undefined : { background: cover.background }}
            url={cover.url}
        />
    );
}

/** A row's avatar, headline, and activity: the whole of a row, and the top of a post. */
function HappyAgentFeedRowHead(props: HappyAgentFeedRowProps) {
    const entry = props.entry;
    return (
        <>
            <FeedSubjectAvatar face={entry.face} size="md">
                <FeedSubjectGlyph
                    size={18}
                    subject={entry.subject}
                    {...(entry.artifactType === undefined
                        ? {}
                        : { artifactType: entry.artifactType })}
                />
            </FeedSubjectAvatar>
            <span className="happy-agent-feed-card-row__text">
                <span className="happy-agent-feed-card-row__headline">
                    <span className="happy-agent-feed-row__title">{entry.title || "Untitled"}</span>
                    <span className="happy-agent-feed-row__time">
                        {feedTimeText(entry.lastAt, props.now, props.zone)}
                    </span>
                    <span
                        aria-label={entry.unread ? "Unread" : undefined}
                        className="happy-agent-feed-row__unread"
                        data-happy-desktop-ui="happy-agent-feed-row-unread"
                        role={entry.unread ? "img" : undefined}
                    />
                </span>
                <span className="happy-agent-feed-row__meta">
                    <FeedActorFaces actors={entry.actors} count={entry.actorCount} />
                    <span className="happy-agent-feed-row__summary">
                        {entry.detail ?? feedActivityText(entry)}
                    </span>
                </span>
            </span>
        </>
    );
}

/** A date's heading over its card. */
export function HappyAgentFeedHeading(props: { label: string }) {
    return (
        <div className="happy-agent-feed-heading" data-happy-desktop-ui="happy-agent-feed-heading">
            <span className="happy-agent-feed-heading__label">{props.label}</span>
        </div>
    );
}
