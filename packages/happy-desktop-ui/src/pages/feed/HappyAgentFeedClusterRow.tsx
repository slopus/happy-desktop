import { Button } from "../../Button";
import { Switch } from "../../Switch";
import {
    FeedClusterGlyph,
    FeedSubjectAvatar,
    type HappyAgentFeedCluster,
} from "./feedPresentation";

/** Every cluster row is this tall, so a long list of them is laid out without measuring. */
export const HAPPY_AGENT_FEED_CLUSTER_ROW_HEIGHT = 52;

export interface HappyAgentFeedClusterRowProps {
    cluster: HappyAgentFeedCluster;
    /** The row's part of its card: the first rounds its top, the last its bottom. */
    first: boolean;
    last: boolean;
    /** Follows the cluster, or mutes it. */
    onFollowChange: (clusterId: string, following: boolean) => void;
    /** Shows what is going on in the cluster without following it. */
    onPeek: (clusterId: string) => void;
}

/**
 * One place the feed gathers from, as a row of its card: its avatar, a way to
 * look in, and whether the reader follows it. Following is a switch so muting
 * reads as the same control turned off; while the change is on its way the
 * switch shows where it is going and refuses another press.
 */
export function HappyAgentFeedClusterRow(props: HappyAgentFeedClusterRowProps) {
    const cluster = props.cluster;
    const following = cluster.state === "subscribed";
    return (
        <div
            className="happy-agent-feed-card-row happy-agent-feed-cluster"
            data-cluster-id={cluster.id}
            data-first={props.first ? "" : undefined}
            data-happy-desktop-ui="happy-agent-feed-cluster"
            data-last={props.last ? "" : undefined}
            data-state={cluster.state}
        >
            <FeedSubjectAvatar face={cluster.face} size="sm">
                <FeedClusterGlyph kind={cluster.kind} size={16} />
            </FeedSubjectAvatar>
            <span className="happy-agent-feed-card-row__text">
                <span className="happy-agent-feed-cluster__label">{cluster.label}</span>
            </span>
            <span className="happy-agent-feed-cluster__actions">
                <Button onClick={() => props.onPeek(cluster.id)} size="small" variant="ghost">
                    Peek
                </Button>
                <Switch
                    aria-label={`Follow ${cluster.label}`}
                    checked={following}
                    disabled={cluster.pending === true}
                    onChange={(checked) => props.onFollowChange(cluster.id, checked)}
                    size="small"
                />
            </span>
        </div>
    );
}
