import { useState, type CSSProperties } from "react";
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
    HappyAgentFeedHeading,
    HappyAgentFeedRow,
    happyAgentFeedEntryHeight,
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

/** Which entries Activity shows: every one, or the highlights — artifacts and tasks. */
export type HappyAgentFeedFilter = "all" | "highlights";

export interface HappyAgentFeedPageProps {
    view: HappyAgentFeedView;
    onViewChange: (view: HappyAgentFeedView) => void;
    /** Which entries `feed` holds; the owner applies it and keeps the reader's choice. */
    filter: HappyAgentFeedFilter;
    onFilterChange: (filter: HappyAgentFeedFilter) => void;
    /** The reader's feed under the filter, newest change first. */
    feed: HappyAgentFeedListState<HappyAgentFeedEntry>;
    /** How many entries under the filter the reader has not looked at. */
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
    /**
     * Entries whose long summaries start opened, as if the reader had asked;
     * after that, which are open is the reader's own choice, kept by the page.
     */
    defaultExpanded?: readonly string[];
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

const FILTERS = [
    { value: "all", label: "All" },
    { value: "highlights", label: "Highlights" },
];

/**
 * HappyAgentFeedPage — what happened on the installation, for one reader:
 * new tasks, bots, documents, todo lists, and artifacts, and changes to them,
 * newest change first, in inset grouped cards under the day they happened —
 * the card lists Happy's phones draw. Changes the reader has not looked at
 * fold into one entry per subject, which rises as it takes in more. An
 * artifact with a cover or a summary is drawn as a post, its summary under
 * the row and its cover across the card, and Highlights narrows the list to
 * artifacts and tasks.
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
                title="Activity"
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
                {props.view === "activity" ? (
                    <SegmentedControl
                        aria-label="Filter"
                        onChange={(value) => props.onFilterChange(value as HappyAgentFeedFilter)}
                        segments={FILTERS}
                        size="small"
                        value={props.filter}
                    />
                ) : null}
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

/** An entry's height at the card's width, its summary opened or not, or a heading's. */
const entrySlotHeight = (
    slot: HappyAgentFeedSlot<HappyAgentFeedEntry>,
    width: number,
    expanded: ReadonlySet<string>,
): number =>
    slot.kind === "heading"
        ? HAPPY_AGENT_FEED_HEADING_HEIGHT
        : happyAgentFeedEntryHeight(slot.row, width, expanded.has(slot.row.id));
const clusterSlotHeight = (slot: HappyAgentFeedSlot<HappyAgentFeedCluster>): number =>
    slot.kind === "heading" ? HAPPY_AGENT_FEED_HEADING_HEIGHT : HAPPY_AGENT_FEED_CLUSTER_ROW_HEIGHT;

/**
 * Entries as their date's cards, newest first. Which posts' summaries the
 * reader opened is theirs alone and lasts while the list is on screen.
 */
function FeedEntryCards(props: {
    label: string;
    list: HappyAgentFeedListState<HappyAgentFeedEntry>;
    now: number;
    zone?: LocalTimeZone;
    empty: { readonly loading: string; readonly title: string; readonly description: string };
    loadingTitle: string;
    defaultExpanded?: readonly string[];
    onOpen: (entryId: string) => void;
    onLoadMore: () => void;
}) {
    const list = props.list;
    const [expanded, expandedSet] = useState<ReadonlySet<string>>(
        () => new Set(props.defaultExpanded),
    );
    const expandedChange = (entryId: string, open: boolean) =>
        expandedSet((current) => {
            const next = new Set(current);
            if (open) next.add(entryId);
            else next.delete(entryId);
            return next;
        });
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
            // While the list is still being read, it shows as loading rather
            // than as a list with nothing in it yet.
            hasMore={list.loading ? false : list.hasMore}
            loadingMore={list.loading ? false : list.loadingMore}
            onLoadMore={props.onLoadMore}
            renderSlot={(slot, width) =>
                slot.kind === "heading" ? (
                    <HappyAgentFeedHeading label={slot.label} />
                ) : (
                    <HappyAgentFeedRow
                        entry={slot.row}
                        expanded={expanded.has(slot.row.id)}
                        first={slot.first}
                        last={slot.last}
                        now={props.now}
                        onExpandedChange={expandedChange}
                        onOpen={props.onOpen}
                        width={width}
                        {...(props.zone ? { zone: props.zone } : {})}
                    />
                )
            }
            slotHeight={(slot, width) => entrySlotHeight(slot, width, expanded)}
            slots={feedSlotsByDate(list.items, props.now, props.zone)}
        />
    );
}

function FeedActivity(props: HappyAgentFeedPageProps) {
    const feed = props.feed;
    return (
        <>
            <FeedNotice error={feed.error} title="Activity may be out of date" />
            <FeedEntryCards
                empty={
                    props.filter === "highlights"
                        ? {
                              loading: "Reading the highlights on this Happy Agent.",
                              title: "No highlights yet",
                              description:
                                  "Artifacts and new tasks appear here, with every change to them.",
                          }
                        : {
                              loading: "Reading what happened on this Happy Agent.",
                              title: "Nothing has happened yet",
                              description:
                                  "New tasks, bots, documents, todo lists, and artifacts appear here, with every change to them.",
                          }
                }
                label="Activity"
                list={feed}
                {...(props.defaultExpanded ? { defaultExpanded: props.defaultExpanded } : {})}
                loadingTitle="Loading activity…"
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
                                : "Tasks, bots, and Surfaces appear here once something happens in them."
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
