import { localAgoTime, type LocalTimeZone } from "../../localTime";
import {
    FeedSubjectGlyph,
    feedActivityText,
    feedActorsText,
    feedSubjectLabel,
    type HappyAgentFeedEntry,
} from "./feedPresentation";

/** Every feed row is this tall, so a long feed can be laid out without measuring it. */
export const HAPPY_AGENT_FEED_ROW_HEIGHT = 56;

export interface HappyAgentFeedRowProps {
    entry: HappyAgentFeedEntry;
    /** The moment the row's time is told against. */
    now: number;
    zone?: LocalTimeZone;
    onOpen: (entryId: string) => void;
}

/**
 * One feed entry: the subject's glyph, its title, and a line saying what kind
 * of thing it is, who changed it, and how much; when, at the trailing edge.
 * An entry the reader has not looked at is set heavier and carries a dot in a
 * lane every row reserves, so reading it recolours the row and moves nothing.
 * The whole row opens the subject.
 */
export function HappyAgentFeedRow(props: HappyAgentFeedRowProps) {
    const entry = props.entry;
    const actors = feedActorsText(entry.actors, entry.actorCount);
    const meta = [
        feedSubjectLabel(entry.subject),
        actors,
        feedActivityText(entry),
        entry.detail === undefined ? "" : `“${entry.detail}”`,
    ].filter((part) => part.length > 0);
    return (
        <button
            className="happy-agent-feed-row"
            data-entry-id={entry.id}
            data-happy-desktop-ui="happy-agent-feed-row"
            data-unread={entry.unread ? "" : undefined}
            onClick={() => props.onOpen(entry.id)}
            type="button"
        >
            <span
                aria-hidden="true"
                className="happy-agent-feed-row__glyph"
                data-happy-desktop-ui="happy-agent-feed-row-glyph"
                data-subject={entry.subject}
            >
                <FeedSubjectGlyph
                    size={18}
                    subject={entry.subject}
                    {...(entry.artifactType === undefined
                        ? {}
                        : { artifactType: entry.artifactType })}
                />
            </span>
            <span className="happy-agent-feed-row__text">
                <span className="happy-agent-feed-row__headline">
                    <span className="happy-agent-feed-row__title">{entry.title || "Untitled"}</span>
                    <span className="happy-agent-feed-row__time">
                        {localAgoTime(entry.lastAt, props.now, props.zone)}
                    </span>
                </span>
                <span className="happy-agent-feed-row__meta">{meta.join(" · ")}</span>
            </span>
            <span
                aria-label={entry.unread ? "Unread" : undefined}
                className="happy-agent-feed-row__unread"
                data-happy-desktop-ui="happy-agent-feed-row-unread"
                role={entry.unread ? "img" : undefined}
            />
        </button>
    );
}
