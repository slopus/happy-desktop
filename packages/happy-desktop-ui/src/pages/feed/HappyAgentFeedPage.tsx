import type { CSSProperties } from "react";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import type { LocalTimeZone } from "../../localTime";
import { SegmentedControl } from "../../SegmentedControl";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { FeedVirtualList } from "./FeedVirtualList";
import {
    HAPPY_AGENT_FEED_CLUSTER_ROW_HEIGHT,
    HappyAgentFeedClusterRow,
} from "./HappyAgentFeedClusterRow";
import { HAPPY_AGENT_FEED_ROW_HEIGHT, HappyAgentFeedRow } from "./HappyAgentFeedRow";
import type {
    HappyAgentFeedCluster,
    HappyAgentFeedEntry,
    HappyAgentFeedListState,
} from "./feedPresentation";

/** Which of the page's two lists is on screen. */
export type HappyAgentFeedView = "activity" | "following";

export interface HappyAgentFeedPageProps {
    view: HappyAgentFeedView;
    onViewChange: (view: HappyAgentFeedView) => void;
    /** The reader's feed, newest change first. */
    feed: HappyAgentFeedListState<HappyAgentFeedEntry>;
    /** How many entries the reader has not looked at, as the daemon counts them. */
    unread: number;
    /** The places the feed gathers from, and whether the reader follows each. */
    clusters: HappyAgentFeedListState<HappyAgentFeedCluster>;
    /**
     * One cluster the reader is looking into without following it, shown in
     * place of the list of clusters until they go back.
     */
    peek?: {
        readonly label: string;
        readonly list: HappyAgentFeedListState<HappyAgentFeedEntry>;
    };
    /** The moment every row's time is told against. */
    now: number;
    zone?: LocalTimeZone;
    /** Opens what an entry is about; the owner marks it seen. */
    onEntryOpen: (entryId: string) => void;
    /** Reads older entries of the feed. */
    onLoadMore: () => void;
    /** Marks every entry seen. */
    onReadAll: () => void;
    onClusterFollowChange: (clusterId: string, following: boolean) => void;
    onClusterPeek: (clusterId: string) => void;
    /** Opens what an entry seen through a peek is about. */
    onPeekEntryOpen: (entryId: string) => void;
    onPeekLoadMore: () => void;
    onPeekClose: () => void;
    /** Why the Happy Agent cannot take the reader's changes right now. */
    unavailable?: string;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

const VIEWS = [
    { value: "activity", label: "Activity" },
    { value: "following", label: "Following" },
];

/**
 * HappyAgentFeedPage — what happened on the installation, for one reader:
 * new tasks, bots, documents, todo lists, and artifacts, and changes to them,
 * newest change first. Changes the reader has not looked at fold into one
 * entry per subject, which rises as it takes in more.
 *
 * Beside it, the places the feed gathers from, which the reader can mute,
 * follow again, or peek into without following.
 *
 * It renders what it is handed and reports each act upward; the lists change
 * when the owner's store does, which it does on its own as things happen.
 */
export function HappyAgentFeedPage(props: HappyAgentFeedPageProps) {
    const feed = props.feed;
    const subtitle = feed.loading
        ? "Loading…"
        : props.unread > 0
          ? `${String(props.unread)} unread`
          : "Up to date";
    return (
        <div
            className={["happy-agent-feed", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-feed"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-agent-feed__header"
                subtitle={subtitle}
                title="Feed"
                trailing={
                    <Button
                        disabled={props.unread === 0 || props.unavailable !== undefined}
                        icon="check"
                        onClick={props.onReadAll}
                        size="small"
                        title={props.unavailable}
                        variant="ghost"
                    >
                        Mark all read
                    </Button>
                }
            />
            <div className="happy-agent-feed__bar" data-happy-desktop-ui="happy-agent-feed-bar">
                <SegmentedControl
                    aria-label="Show"
                    onChange={(value) => props.onViewChange(value as HappyAgentFeedView)}
                    segments={VIEWS}
                    size="small"
                    value={props.view}
                />
            </div>
            {props.view === "activity" ? (
                <FeedActivity {...props} />
            ) : props.peek ? (
                <FeedPeek {...props} peek={props.peek} />
            ) : (
                <FeedClusters {...props} />
            )}
        </div>
    );
}

function FeedNotice(props: { title: string; error: string | undefined }) {
    if (props.error === undefined) return null;
    return (
        <div className="happy-agent-feed__notice">
            <Banner tone="danger" title={props.title}>
                {props.error}
            </Banner>
        </div>
    );
}

function FeedActivity(props: HappyAgentFeedPageProps) {
    const feed = props.feed;
    return (
        <>
            <FeedNotice error={feed.error} title="The feed may be out of date" />
            <FeedVirtualList
                aria-label="Feed"
                empty={
                    <EmptyState
                        description={
                            feed.loading
                                ? "Reading what happened on this Happy Agent."
                                : "New tasks, bots, documents, todo lists, and artifacts appear here, with every change to them."
                        }
                        icon={feed.loading ? "clock" : "feed"}
                        size="panel"
                        title={feed.loading ? "Loading the feed…" : "Nothing has happened yet"}
                    />
                }
                hasMore={feed.hasMore}
                items={feed.items}
                loadingMore={feed.loadingMore}
                onLoadMore={props.onLoadMore}
                renderRow={(entry) => (
                    <HappyAgentFeedRow
                        entry={entry}
                        now={props.now}
                        onOpen={props.onEntryOpen}
                        {...(props.zone ? { zone: props.zone } : {})}
                    />
                )}
                rowHeight={HAPPY_AGENT_FEED_ROW_HEIGHT}
            />
        </>
    );
}

function FeedClusters(props: HappyAgentFeedPageProps) {
    const clusters = props.clusters;
    return (
        <>
            <FeedNotice error={clusters.error} title="These may be out of date" />
            <FeedVirtualList
                aria-label="Following"
                empty={
                    <EmptyState
                        description={
                            clusters.loading
                                ? "Reading where this Happy Agent's feed gathers from."
                                : "Tasks, bots, and Surfaces appear here once something happens in them."
                        }
                        icon={clusters.loading ? "clock" : "users"}
                        size="panel"
                        title={clusters.loading ? "Loading…" : "Nothing to follow yet"}
                    />
                }
                hasMore={clusters.hasMore}
                items={clusters.items}
                loadingMore={clusters.loadingMore}
                renderRow={(cluster) => (
                    <HappyAgentFeedClusterRow
                        cluster={
                            props.unavailable === undefined
                                ? cluster
                                : { ...cluster, pending: true }
                        }
                        onFollowChange={props.onClusterFollowChange}
                        onPeek={props.onClusterPeek}
                    />
                )}
                rowHeight={HAPPY_AGENT_FEED_CLUSTER_ROW_HEIGHT}
            />
        </>
    );
}

function FeedPeek(
    props: HappyAgentFeedPageProps & { peek: NonNullable<HappyAgentFeedPageProps["peek"]> },
) {
    const list = props.peek.list;
    return (
        <>
            <div className="happy-agent-feed__peek" data-happy-desktop-ui="happy-agent-feed-peek">
                <Button
                    icon="chevron-left"
                    onClick={props.onPeekClose}
                    size="small"
                    variant="ghost"
                >
                    Following
                </Button>
                <span className="happy-agent-feed__peek-label">{props.peek.label}</span>
            </div>
            <FeedNotice error={list.error} title="This may be out of date" />
            <FeedVirtualList
                aria-label={props.peek.label}
                empty={
                    <EmptyState
                        description={
                            list.loading
                                ? "Reading what happened here."
                                : "Nothing has happened here in the last 30 days."
                        }
                        icon={list.loading ? "clock" : "feed"}
                        size="panel"
                        title={list.loading ? "Loading…" : "Quiet here"}
                    />
                }
                hasMore={list.hasMore}
                items={list.items}
                loadingMore={list.loadingMore}
                onLoadMore={props.onPeekLoadMore}
                renderRow={(entry) => (
                    <HappyAgentFeedRow
                        entry={entry}
                        now={props.now}
                        onOpen={props.onPeekEntryOpen}
                        {...(props.zone ? { zone: props.zone } : {})}
                    />
                )}
                rowHeight={HAPPY_AGENT_FEED_ROW_HEIGHT}
            />
        </>
    );
}
