import { MediaImageTile } from "../../ConversationMedia";
import type { LocalTimeZone } from "../../localTime";
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
 * row's own headline and activity where a row has them, 10px down from the
 * top; a 12px gap; the summary's one line and another 12px gap when there is
 * one; the cover; and the 16px inset the cover keeps from the card's sides
 * and foot.
 */
const POST_HEAD = 10 + 44 + 12;
const POST_SUMMARY = 20 + 12;
const POST_INSET = 16;

/** A cover's height when drawn `width` wide, at exactly its shape. */
export function happyAgentFeedCoverHeight(
    cover: Pick<HappyAgentFeedCover, "aspect">,
    width: number,
): number {
    return cover.aspect === "wide" ? Math.round((width * 9) / 16) : width;
}

/**
 * How tall an entry's slot is in a card `width` wide: a row's fixed height, or
 * a post's, which follows its cover's shape at the card's width. Known ahead
 * from the cover's shape, so the feed is laid out without measuring a post.
 */
export function happyAgentFeedEntryHeight(entry: HappyAgentFeedEntry, width: number): number {
    if (entry.cover === undefined) return HAPPY_AGENT_FEED_ROW_HEIGHT;
    const coverWidth = Math.max(0, width - 2 * POST_INSET);
    return (
        POST_HEAD +
        (entry.summary === undefined ? 0 : POST_SUMMARY) +
        happyAgentFeedCoverHeight(entry.cover, coverWidth) +
        POST_INSET
    );
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
}

/**
 * One feed entry as a row of its date's card: the subject's avatar, its title
 * and when it last changed, and under them the faces of who changed it beside
 * what they did — the newest change's own words where it has them, such as a
 * new todo's text. An entry the reader has not looked at is set heavier and
 * carries a dot in a lane every row reserves, so reading it recolours the row
 * and moves nothing. The whole row opens the subject.
 *
 * An artifact with a cover is a post: the same row, then its summary, then
 * the cover across the card at exactly its shape, 16:9 or square. The post's
 * height is known from that shape, and the picture fades in over its
 * placeholder without moving anything.
 */
export function HappyAgentFeedRow(props: HappyAgentFeedRowProps) {
    const entry = props.entry;
    const cover = entry.cover;
    return (
        <button
            className="happy-agent-feed-card-row happy-agent-feed-row"
            data-entry-id={entry.id}
            data-first={props.first ? "" : undefined}
            data-happy-desktop-ui="happy-agent-feed-row"
            data-last={props.last ? "" : undefined}
            data-post={cover === undefined ? undefined : ""}
            data-unread={entry.unread ? "" : undefined}
            onClick={() => props.onOpen(entry.id)}
            type="button"
        >
            {cover === undefined ? (
                <HappyAgentFeedRowHead {...props} />
            ) : (
                <>
                    <span className="happy-agent-feed-row__head">
                        <HappyAgentFeedRowHead {...props} />
                    </span>
                    {entry.summary === undefined ? null : (
                        <span
                            className="happy-agent-feed-row__post-summary"
                            data-happy-desktop-ui="happy-agent-feed-row-post-summary"
                            title={entry.summary}
                        >
                            {entry.summary}
                        </span>
                    )}
                    <MediaImageTile
                        alt={`${entry.title || "Untitled"} cover`}
                        className="happy-agent-feed-row__cover"
                        style={
                            cover.background === undefined
                                ? undefined
                                : { background: cover.background }
                        }
                        url={cover.url}
                    />
                </>
            )}
        </button>
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
