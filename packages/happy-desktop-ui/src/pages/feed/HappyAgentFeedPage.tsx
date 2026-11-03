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
import {
    HAPPY_AGENT_FEED_HEADING_HEIGHT,
    HAPPY_AGENT_FEED_ROW_HEIGHT,
    HappyAgentFeedHeading,
    HappyAgentFeedRow,
} from "./HappyAgentFeedRow";
import {
    feedSlotsByDate,
    type HappyAgentFeedCluster,
    type HappyAgentFeedEntry,
    type HappyAgentFeedListState,
    type HappyAgentFeedSlot,
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
 * newest change first, in inset grouped cards under the day they happened —
 * the card lists Happy's phones draw. Changes the reader has not looked at
 * fold into one entry per subject, which rises as it takes in more.
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

/** A row's height or a heading's, for every slot of the feed's card lists. */
function slotHeight(rowHeight: number) {
    return (slot: HappyAgentFeedSlot<unknown>): number =>
        slot.kind === "heading" ? HAPPY_AGENT_FEED_HEADING_HEIGHT : rowHeight;
}
const entrySlotHeight = slotHeight(HAPPY_AGENT_FEED_ROW_HEIGHT);
const clusterSlotHeight = slotHeight(HAPPY_AGENT_FEED_CLUSTER_ROW_HEIGHT);

/** Entries as their date's cards, newest first. */
function FeedEntryCards(props: {
    label: string;
    list: HappyAgentFeedListState<HappyAgentFeedEntry>;
    now: number;
    zone?: LocalTimeZone;
    empty: { readonly loading: string; readonly title: string; readonly description: string };
    loadingTitle: string;
    onOpen: (entryId: string) => void;
    onLoadMore: () => void;
}) {
    const list = props.list;
    return (
        <FeedVirtualList
            aria-label={props.label}
            empty={
                <EmptyState
                    description={list.loading ? props.empty.loading : props.empty.description}
                    icon={list.loading ? "clock" : "feed"}
                    size="panel"
                    title={list.loading ? props.loadingTitle : props.empty.title}
                />
            }
            hasMore={list.hasMore}
            loadingMore={list.loadingMore}
            onLoadMore={props.onLoadMore}
            renderSlot={(slot) =>
                slot.kind === "heading" ? (
                    <HappyAgentFeedHeading label={slot.label} />
                ) : (
                    <HappyAgentFeedRow
                        entry={slot.row}
                        first={slot.first}
                        last={slot.last}
                        now={props.now}
                        onOpen={props.onOpen}
                        {...(props.zone ? { zone: props.zone } : {})}
                    />
                )
            }
            slotHeight={entrySlotHeight}
            slots={feedSlotsByDate(list.items, props.now, props.zone)}
        />
    );
}

function FeedActivity(props: HappyAgentFeedPageProps) {
    const feed = props.feed;
    return (
        <>
            <FeedNotice error={feed.error} title="The feed may be out of date" />
            <FeedEntryCards
                empty={{
                    loading: "Reading what happened on this Happy Agent.",
                    title: "Nothing has happened yet",
                    description:
                        "New tasks, bots, documents, todo lists, and artifacts appear here, with every change to them.",
                }}
                label="Feed"
                list={feed}
                loadingTitle="Loading the feed…"
                now={props.now}
                onLoadMore={props.onLoadMore}
                onOpen={props.onEntryOpen}
                {...(props.zone ? { zone: props.zone } : {})}
            />
        </>
    );
}

/** The clusters as two cards: everything and the team, then each place on its own. */
function clusterSlots(
    clusters: readonly HappyAgentFeedCluster[],
): HappyAgentFeedSlot<HappyAgentFeedCluster>[] {
    const broad = clusters.filter(
        (cluster) => cluster.kind === "everything" || cluster.kind === "team",
    );
    const places = clusters.filter(
        (cluster) => cluster.kind !== "everything" && cluster.kind !== "team",
    );
    const card = (id: string, label: string, rows: readonly HappyAgentFeedCluster[]) =>
        rows.length === 0
            ? []
            : [
                  { kind: "heading" as const, id: `heading:${id}`, label },
                  ...rows.map((row, index) => ({
                      kind: "row" as const,
                      id: row.id,
                      row,
                      first: index === 0,
                      last: index === rows.length - 1,
                  })),
              ];
    return [...card("everywhere", "Everywhere", broad), ...card("places", "Places", places)];
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
                                : "Tasks, bots, and tabs appear here once something happens in them."
                        }
                        icon={clusters.loading ? "clock" : "users"}
                        size="panel"
                        title={clusters.loading ? "Loading…" : "Nothing to follow yet"}
                    />
                }
                hasMore={clusters.hasMore}
                loadingMore={clusters.loadingMore}
                renderSlot={(slot) =>
                    slot.kind === "heading" ? (
                        <HappyAgentFeedHeading label={slot.label} />
                    ) : (
                        <HappyAgentFeedClusterRow
                            cluster={
                                props.unavailable === undefined
                                    ? slot.row
                                    : { ...slot.row, pending: true }
                            }
                            first={slot.first}
                            last={slot.last}
                            onFollowChange={props.onClusterFollowChange}
                            onPeek={props.onClusterPeek}
                        />
                    )
                }
                slotHeight={clusterSlotHeight}
                slots={clusterSlots(clusters.items)}
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
            <FeedEntryCards
                empty={{
                    loading: "Reading what happened here.",
                    title: "Quiet here",
                    description: "Nothing has happened here in the last 30 days.",
                }}
                label={props.peek.label}
                list={list}
                loadingTitle="Loading…"
                now={props.now}
                onLoadMore={props.onPeekLoadMore}
                onOpen={props.onPeekEntryOpen}
                {...(props.zone ? { zone: props.zone } : {})}
            />
        </>
    );
}
