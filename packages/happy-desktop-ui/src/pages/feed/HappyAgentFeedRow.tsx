import type { LocalTimeZone } from "../../localTime";
import {
    FeedActorFaces,
    FeedSubjectAvatar,
    FeedSubjectGlyph,
    feedActivityText,
    feedTimeText,
    type HappyAgentFeedEntry,
} from "./feedPresentation";

/** Every entry row is this tall, so a long feed is laid out without measuring. */
export const HAPPY_AGENT_FEED_ROW_HEIGHT = 64;
/** A date's heading over its card, with the gap down from the card before it. */
export const HAPPY_AGENT_FEED_HEADING_HEIGHT = 44;

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
 */
export function HappyAgentFeedRow(props: HappyAgentFeedRowProps) {
    const entry = props.entry;
    return (
        <button
            className="happy-agent-feed-card-row happy-agent-feed-row"
            data-entry-id={entry.id}
            data-first={props.first ? "" : undefined}
            data-happy-desktop-ui="happy-agent-feed-row"
            data-last={props.last ? "" : undefined}
            data-unread={entry.unread ? "" : undefined}
            onClick={() => props.onOpen(entry.id)}
            type="button"
        >
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
        </button>
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
