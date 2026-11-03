import { Button } from "../../Button";
import { Switch } from "../../Switch";
import { FeedClusterGlyph, type HappyAgentFeedCluster } from "./feedPresentation";

/** Every cluster row is this tall, so a long list of them is laid out without measuring. */
export const HAPPY_AGENT_FEED_CLUSTER_ROW_HEIGHT = 48;

export interface HappyAgentFeedClusterRowProps {
    cluster: HappyAgentFeedCluster;
    /** Follows the cluster, or mutes it. */
    onFollowChange: (clusterId: string, following: boolean) => void;
    /** Shows what is going on in the cluster without following it. */
    onPeek: (clusterId: string) => void;
}

/**
 * One place the feed gathers from: what it is, whether the reader follows it,
 * and a way to look in. Following is a switch so muting reads as the same
 * control turned off; while the change is on its way the switch shows where
 * it is going and refuses another press.
 */
export function HappyAgentFeedClusterRow(props: HappyAgentFeedClusterRowProps) {
    const cluster = props.cluster;
    const following = cluster.state === "subscribed";
    return (
        <div
            className="happy-agent-feed-cluster"
            data-cluster-id={cluster.id}
            data-happy-desktop-ui="happy-agent-feed-cluster"
            data-state={cluster.state}
        >
            <span
                aria-hidden="true"
                className="happy-agent-feed-cluster__glyph"
                data-happy-desktop-ui="happy-agent-feed-cluster-glyph"
            >
                <FeedClusterGlyph kind={cluster.kind} size={16} />
            </span>
            <span className="happy-agent-feed-cluster__label">{cluster.label}</span>
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
