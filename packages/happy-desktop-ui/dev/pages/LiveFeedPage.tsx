import { useSyncExternalStore } from "react";
import { AppShell } from "../../src/AppShell";
import { Button } from "../../src/Button";
import { Composer } from "../../src/Composer";
import {
    LiveFeedEntry,
    LiveFeedPanel,
    LiveFeedToggle,
    type LiveFeedItem,
} from "../../src/LiveFeed";
import type {
    HappyAgentFeedCluster,
    HappyAgentFeedEntry,
    HappyAgentFeedListState,
} from "../../src/pages/feed/feedPresentation";
import { HappyAgentFeedPage } from "../../src/pages/feed/HappyAgentFeedPage";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ComponentPage, DimensionRule, FullScreenSpecimen, Specimen } from "../kit";
import { DEMO_SCRIPT, DEMO_SEED, DEMO_TASKS } from "./liveFeed/liveFeedData";
import {
    DEMO_EPOCH,
    LIVE_FEED_STREAM_TTL,
    LiveFeedDemo,
    type LiveFeedDemoSnapshot,
} from "./liveFeed/liveFeedDemo";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-031";

const noop = () => undefined;
const ZONE = { locale: "en-US", timeZone: "UTC" } as const;

/** One demo per page load; it starts no timer until Play. */
const demo = new LiveFeedDemo();

/** Steve's sidebar, as a static mock: his bots, the tasks he is in, the projects. */
const SECTIONS: SidebarSection[] = [
    {
        id: "bots",
        items: [
            { id: "chief", kind: "agent", label: "Chief of Staff", placeholderSeed: "chief" },
            {
                id: "health",
                kind: "agent",
                label: "Product Health",
                placeholderSeed: "uzqhssr8qd5j2e053jbfxieu",
            },
        ],
        label: "Bots",
    },
    {
        id: "tasks",
        items: [
            { id: "t1", kind: "agent", label: "Android files parity", status: "working" },
            { id: "t2", kind: "agent", label: "Mobile release & direct connection" },
            { id: "t3", kind: "agent", label: "Stories fixes" },
            { id: "t4", kind: "agent", label: "Happy Native Android" },
        ],
        label: "Tasks",
    },
    {
        id: "surfaces",
        items: [
            { id: "s1", kind: "agent", icon: "list", label: "Happy Native" },
            { id: "s2", kind: "agent", icon: "doc", label: "Interesting Libraries" },
            { id: "s3", kind: "agent", icon: "pulse", label: "System Monitor" },
        ],
        label: "Surfaces",
    },
    {
        id: "projects",
        items: [
            { id: "p1", kind: "project", label: "happy" },
            { id: "p2", kind: "project", label: "happy-agent" },
            { id: "p3", kind: "project", label: "happy-desktop" },
            { id: "p4", kind: "project", label: "happy-cluster" },
            { id: "p5", kind: "project", label: "tailcat-swift" },
        ],
        label: "Projects",
    },
];

const ready = <Item,>(items: readonly Item[]): HappyAgentFeedListState<Item> => ({
    items,
    loading: false,
    hasMore: false,
    loadingMore: false,
});

/** A live item as the full Feed lists it: one entry per subject, newest first. */
function feedEntryOf(item: LiveFeedItem): HappyAgentFeedEntry {
    return {
        id: item.id,
        subject: item.subject,
        ...(item.artifactType === undefined ? {} : { artifactType: item.artifactType }),
        title: item.title,
        ...(item.subject === "task" && item.actor.face.type === "human"
            ? { face: item.actor.face }
            : {}),
        actors: [item.actor],
        actorCount: 1,
        created: item.verb === "started" || item.verb === "published",
        updates: item.verb.startsWith("published v") ? 1 : 0,
        ...(item.detail === undefined ? {} : { detail: item.detail }),
        lastAt: item.at,
        unread: item.unread === true,
    };
}

const CLUSTERS: readonly HappyAgentFeedCluster[] = [
    { id: "*", kind: "everything", label: "Everything", state: "subscribed" },
    { id: "team", kind: "team", label: "Team", state: "subscribed" },
];

function FullFeed(props: { readonly snapshot: LiveFeedDemoSnapshot }) {
    // Everything that has happened so far, at the time it really happened:
    // what streamed, what the follow rule held back, and what was under the bar.
    const realAt = new Map(
        [...DEMO_SEED, ...DEMO_SCRIPT].map((event) => [event.item.id, event.realAt]),
    );
    const happened = [
        ...props.snapshot.stack,
        ...props.snapshot.held.map((held) => held.item),
        ...props.snapshot.below.map((event) => ({ ...event.item, at: 0 })),
    ];
    const entries = happened
        .map((item) => feedEntryOf({ ...item, at: realAt.get(item.id) ?? item.at }))
        .sort((left, right) => right.lastAt - left.lastAt);
    return (
        <HappyAgentFeedPage
            clusters={ready(
                CLUSTERS.concat(
                    DEMO_TASKS.map((task) => ({
                        id: `task:${task.id}`,
                        kind: "task" as const,
                        label: task.label,
                        state: props.snapshot.following.get(task.id) ? "subscribed" : "muted",
                    })),
                ),
            )}
            feed={ready(entries)}
            now={props.snapshot.now}
            onClusterFollowChange={(cluster, following) =>
                demo.followUpdate(cluster.replace(/^task:/u, ""), following)
            }
            onClusterPeek={noop}
            onEntryOpen={(id) => demo.itemOpen(id)}
            onLoadMore={noop}
            onPeekClose={noop}
            onPeekEntryOpen={noop}
            onPeekLoadMore={noop}
            onReadAll={noop}
            onViewChange={noop}
            unread={props.snapshot.unread}
            view="activity"
            zone={ZONE}
        />
    );
}

/*
 * What opening an item lands on, mocked: the chat it was said in, scrolled to
 * the message, which is ringed for a moment. A post or an artifact opens the
 * same way, on the chat that made it.
 */
function OpenedChat(props: { readonly item: LiveFeedItem }) {
    const item = props.item;
    return (
        <div
            style={{
                display: "flex",
                flex: "1 1 auto",
                flexDirection: "column",
                gap: "16px",
                height: "100%",
                padding: "16px 24px",
                color: "var(--text)",
                fontFamily: "var(--happy-font-ui)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "24px" }}>
                <strong style={{ fontSize: "14px" }}>{item.place ?? item.title}</strong>
                <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    jumped from the feed
                </span>
            </div>
            <div
                style={{
                    display: "flex",
                    flex: "1 1 auto",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    gap: "12px",
                }}
            >
                {item.tier === "mention" ? (
                    <div
                        style={{
                            alignSelf: "flex-end",
                            maxWidth: "70%",
                            padding: "10px 14px",
                            borderRadius: "14px",
                            background: "var(--user-message-background)",
                            color: "var(--user-message-text)",
                            fontSize: "14px",
                            lineHeight: "20px",
                        }}
                    >
                        i think it is unfair images we still have relay we just don’t store it and
                        it is pure traffic
                    </div>
                ) : null}
                <div
                    className="live-feed-jump-target"
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        maxWidth: "80%",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        boxShadow: "0 0 0 2px var(--text-link)",
                        fontSize: "14px",
                        lineHeight: "20px",
                    }}
                >
                    <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                        {item.actor.name}
                    </span>
                    <span>{item.detail ?? item.title}</span>
                </div>
            </div>
            <Composer
                mentions={[]}
                onSend={noop}
                onValueChange={noop}
                placeholder="Message Happy…"
                value=""
            />
        </div>
    );
}

function DemoWindow(props: { readonly snapshot: LiveFeedDemoSnapshot }) {
    const snapshot = props.snapshot;
    const opened = snapshot.stack.find((item) => item.id === snapshot.opened);
    return (
        <AppShell
            sidebar={
                <Sidebar
                    activeItemId={snapshot.view === "feed" ? "" : "t1"}
                    brand
                    footer={
                        // A mock of the footer row: the feed control leads it and the
                        // stream stands on it, beside the ordinary status-line controls.
                        <div
                            className="happy-sidebar-footer"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                width: "100%",
                            }}
                        >
                            <LiveFeedToggle
                                mode={snapshot.mode}
                                onToggle={() => demo.modeToggle()}
                                unread={snapshot.unread}
                            />
                            <LiveFeedPanel
                                items={snapshot.visible}
                                mode={snapshot.mode}
                                now={snapshot.now}
                                onFollowToggle={(id, following) => demo.followUpdate(id, following)}
                                onHoverChange={(hovering) => demo.hoverUpdate(hovering)}
                                onItemOpen={(id) => demo.itemOpen(id)}
                                onViewAll={() => demo.viewAllOpen()}
                                paused={snapshot.hovering}
                                queued={snapshot.queued}
                            />
                            <SidebarFooter
                                keepAwake={{ active: false, mode: "off", onModeSelect: noop }}
                                onSettingsOpen={noop}
                                style={{ flex: "1 1 auto", width: "auto" }}
                                theme={{ appearance: "dark", mode: "system", onModeSelect: noop }}
                            />
                        </div>
                    }
                    onCompose={noop}
                    onItemSelect={(id) => {
                        if (id === "t1") demo.chatHome();
                    }}
                    sections={SECTIONS}
                />
            }
            sidebarDefaultWidth={288}
        >
            {snapshot.view === "feed" ? (
                <FullFeed snapshot={snapshot} />
            ) : opened !== undefined ? (
                <OpenedChat item={opened} key={opened.id} />
            ) : (
                <div
                    style={{
                        display: "flex",
                        flex: "1 1 auto",
                        flexDirection: "column",
                        height: "100%",
                        justifyContent: "flex-end",
                        padding: "12px",
                    }}
                >
                    <Composer
                        mentions={[]}
                        onSend={noop}
                        onValueChange={noop}
                        placeholder="Message Happy…"
                        value=""
                    />
                </div>
            )}
        </AppShell>
    );
}

function DemoControls(props: { readonly snapshot: LiveFeedDemoSnapshot }) {
    const snapshot = props.snapshot;
    return (
        <div
            data-live-feed-controls=""
            style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}
        >
            <Button
                data-testid="live-feed-play"
                onClick={() => (snapshot.running ? demo.pause() : demo.play())}
                size="small"
                variant="primary"
            >
                {snapshot.running ? "Pause script" : "Play script"}
            </Button>
            <Button onClick={() => demo.eventNext()} size="small" variant="secondary">
                Next event
            </Button>
            <Button onClick={() => demo.modeToggle()} size="small" variant="secondary">
                {snapshot.mode === "stream" ? "Open the stack" : "Back to the stream"}
            </Button>
            <Button
                onClick={() => (snapshot.view === "feed" ? demo.viewClose() : demo.viewAllOpen())}
                size="small"
                variant="secondary"
            >
                {snapshot.view === "feed" ? "Back to chat" : "View all"}
            </Button>
            <DimensionRule
                label={`${snapshot.mode} · ${snapshot.hovering ? "paused" : "live"} · ${String(snapshot.queued)} waiting · ${String(snapshot.unread)} unread · ${String(snapshot.held.length)} held back (not following)`}
            />
        </div>
    );
}

const SAMPLE_NOW = DEMO_EPOCH + 60_000;
const SAMPLES: readonly LiveFeedItem[] = [...DEMO_SEED, ...DEMO_SCRIPT]
    .filter((event) =>
        [
            "seed-windows",
            "e-whats-left",
            "e-mention-relay",
            "e-ios-migration",
            "e-stories-instant",
        ].includes(event.item.id),
    )
    .map((event) => ({
        ...event.item,
        at: SAMPLE_NOW - 20_000,
        ...(event.followable
            ? {
                  follow: {
                      id: event.taskId,
                      label: DEMO_TASKS.find((task) => task.id === event.taskId)?.label ?? "",
                      following: event.item.id === "e-ios-migration",
                  },
              }
            : {}),
    }));

export function LiveFeedPage() {
    const snapshot = useSyncExternalStore(demo.subscribe, demo.get);
    return (
        <ComponentPage
            number={componentNumber}
            summary={`The feed as a live stream rising from the sidebar footer, where the update card stands. Items pop in at the bottom and wash out at the top; a line stays ${String(LIVE_FEED_STREAM_TTL.line / 1000)}s, a card ${String(LIVE_FEED_STREAM_TTL.card / 1000)}s, a post ${String(LIVE_FEED_STREAM_TTL.post / 1000)}s. Hovering holds the stream still and queues arrivals. Artifacts and posts reach you only for tasks you follow; new work a teammate starts reaches everyone, with Follow on hover. The footer's feed control toggles the stream and the stack, and the stack's View all opens the whole Feed. Prototype: driven by a script of this installation's real recent work.`}
            title="Live feed"
        >
            <DemoControls snapshot={snapshot} />
            <FullScreenSpecimen
                detail="Play runs the script; hover an item to pause, Follow a task from it, press the feed control at the footer's left to open the stack."
                label="Live feed in the sidebar"
                number="01"
                screen="01-live-feed-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <DemoWindow snapshot={snapshot} />
            </FullScreenSpecimen>
            <Specimen
                detail="Line: someone started something, added a todo, edited a document · card: an artifact published or a new version · post: media and a caption, what a story was — square beside its text, 16:9 across the item. Follow sits over the trailing edge and fades in on hover."
                label="Tiers"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "32px" }}>
                    {[264, 196].map((width) => (
                        <div
                            data-screen={`02-tiers-${String(width)}`}
                            key={width}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                                padding: "6px",
                                width: `${String(width)}px`,
                            }}
                        >
                            {SAMPLES.map((item) => (
                                <LiveFeedEntry
                                    item={item}
                                    key={item.id}
                                    now={SAMPLE_NOW}
                                    onFollowToggle={noop}
                                    onOpen={noop}
                                />
                            ))}
                            <DimensionRule label={`${String(width)}px footer row`} />
                        </div>
                    ))}
                </div>
            </Specimen>
            <Specimen
                detail="Not delivered to this reader: artifacts and posts of tasks they do not follow. Following a task brings these into the stack, already read; only later ones stream."
                label="Held back by the follow rule"
                number="03"
                stage="surface"
            >
                <ul style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0 }}>
                    {snapshot.held.length === 0 ? <li>Nothing held back yet.</li> : null}
                    {snapshot.held.map((held) => (
                        <li key={held.item.id}>
                            {held.item.title} — {held.taskLabel}
                        </li>
                    ))}
                </ul>
            </Specimen>
            <Specimen
                detail="Real events from the same hours that reached nobody's stream: version bumps, a dashboard refreshing itself, a second mention folded into the first."
                label="Below the bar"
                number="04"
                stage="surface"
            >
                <ul style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0 }}>
                    {snapshot.below.length === 0 ? <li>Nothing yet.</li> : null}
                    {snapshot.below.map((event) => (
                        <li key={event.item.id}>
                            {event.item.title} — {event.why}
                        </li>
                    ))}
                </ul>
            </Specimen>
        </ComponentPage>
    );
}
