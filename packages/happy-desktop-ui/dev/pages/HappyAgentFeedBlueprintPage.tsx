import { useState } from "react";
import { Button } from "../../src/Button";
import type {
    HappyAgentFeedActor,
    HappyAgentFeedCluster,
    HappyAgentFeedEntry,
    HappyAgentFeedListState,
} from "../../src/pages/feed/feedPresentation";
import {
    HappyAgentFeedPage,
    type HappyAgentFeedView,
} from "../../src/pages/feed/HappyAgentFeedPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-028";

/** Every time is told against this moment, on this clock, so each capture is the same. */
const NOW = 1_760_100_000_000;
const ZONE = { locale: "en-US", timeZone: "UTC" } as const;
const MINUTE = 60_000;

const steve: HappyAgentFeedActor = {
    key: "user-steve",
    name: "Steve",
    face: {
        type: "human",
        initials: "S",
        imageUrl: new URL("../assets/profile-photo.webp", import.meta.url).href,
    },
};
const ana: HappyAgentFeedActor = {
    key: "user-ana",
    name: "Ana",
    face: { type: "human", initials: "A", placeholderSeed: "user-ana" },
};
const releaseBot: HappyAgentFeedActor = {
    key: "agent-release",
    name: "Release notes bot",
    face: { type: "agent", initials: "RN", placeholderSeed: "bot-release" },
};
const research: HappyAgentFeedActor = {
    key: "agent-research",
    name: "Market research",
    face: { type: "agent", initials: "MR", placeholderSeed: "bot-research" },
};

const lead: readonly HappyAgentFeedEntry[] = [
    {
        id: "e-report",
        subject: "artifact",
        artifactType: "markdown",
        title: "Q3 revenue report",
        actors: [research, steve],
        actorCount: 2,
        created: true,
        updates: 49,
        lastAt: NOW - 2 * MINUTE,
        unread: true,
    },
    {
        id: "e-shopping",
        subject: "todoList",
        title: "Shopping",
        actors: [ana],
        actorCount: 1,
        created: false,
        updates: 5,
        detail: "Oat milk, two cartons",
        lastAt: NOW - 14 * MINUTE,
        unread: true,
    },
    {
        id: "e-task",
        subject: "task",
        title: "Migrate the billing tables to the new schema",
        face: steve.face,
        actors: [steve],
        actorCount: 1,
        created: true,
        updates: 0,
        lastAt: NOW - 52 * MINUTE,
        unread: true,
    },
    {
        id: "e-bot",
        subject: "bot",
        title: "Release coordinator",
        face: { type: "agent", initials: "RC", placeholderSeed: "bot-release-coordinator" },
        actors: [ana],
        actorCount: 1,
        created: true,
        updates: 0,
        lastAt: NOW - 3 * 60 * MINUTE,
        unread: false,
    },
    {
        id: "e-doc",
        subject: "document",
        title: "Launch plan",
        actors: [steve, ana, releaseBot],
        actorCount: 4,
        created: false,
        updates: 3,
        lastAt: NOW - 5 * 60 * MINUTE,
        unread: false,
    },
    {
        id: "e-landing",
        subject: "artifact",
        artifactType: "html",
        title: "Landing page mock",
        actors: [releaseBot],
        actorCount: 1,
        created: false,
        updates: 1,
        lastAt: NOW - 26 * 60 * MINUTE,
        unread: false,
    },
    {
        id: "e-calendar",
        subject: "calendar",
        title: "Team calendar",
        actors: [steve],
        actorCount: 1,
        created: true,
        updates: 0,
        lastAt: NOW - 3 * 24 * 60 * MINUTE,
        unread: false,
    },
];

/** A long history behind the lead entries, for the virtualized column. */
const history: readonly HappyAgentFeedEntry[] = Array.from({ length: 400 }, (_, index) => ({
    id: `e-history-${String(index)}`,
    subject: (["task", "artifact", "document", "bot"] as const)[index % 4]!,
    ...(index % 4 === 1 ? { artifactType: "image" as const } : {}),
    title: `Earlier work ${String(index + 1)}`,
    ...(index % 4 === 3
        ? { face: { type: "agent", initials: "", placeholderSeed: `bot-history-${String(index)}` } }
        : index % 4 === 0
          ? { face: steve.face }
          : {}),
    actors: [index % 3 === 0 ? steve : research],
    actorCount: 1,
    created: index % 2 === 0,
    updates: index % 5,
    lastAt: NOW - (4 + index) * 24 * 60 * MINUTE,
    unread: false,
}));

const entries = [...lead, ...history];

const ready = <Item,>(items: readonly Item[]): HappyAgentFeedListState<Item> => ({
    items,
    loading: false,
    hasMore: false,
    loadingMore: false,
});

const clusters: readonly HappyAgentFeedCluster[] = [
    { id: "*", kind: "everything", label: "Everything", state: "subscribed" },
    { id: "team", kind: "team", label: "Team", state: "subscribed" },
    {
        id: "task:billing",
        kind: "task",
        label: "Migrate the billing tables",
        face: steve.face,
        state: "subscribed",
    },
    {
        id: "bot:release",
        kind: "bot",
        label: "Release coordinator",
        face: { type: "agent", initials: "RC", placeholderSeed: "bot-release-coordinator" },
        state: "muted",
    },
    {
        id: "surface:shopping",
        kind: "surface",
        label: "Shopping",
        state: "subscribed",
        pending: true,
    },
    { id: "workspace:feed", kind: "workspace", label: "happy-desktop / feed", state: "subscribed" },
];

const handlers = {
    onClusterFollowChange: () => undefined,
    onClusterPeek: () => undefined,
    onEntryOpen: () => undefined,
    onLoadMore: () => undefined,
    onPeekClose: () => undefined,
    onPeekEntryOpen: () => undefined,
    onPeekLoadMore: () => undefined,
    onReadAll: () => undefined,
    onViewChange: () => undefined,
};

const base = {
    ...handlers,
    clusters: ready(clusters),
    feed: { ...ready(entries), hasMore: true },
    now: NOW,
    unread: 3,
    view: "activity" as HappyAgentFeedView,
    zone: ZONE,
};

/**
 * The feed as a reader would live with it: folding a change into an entry
 * lifts it to the top, opening one reads it, and the view switch works.
 */
function LiveFeed() {
    const [items, itemsSet] = useState<readonly HappyAgentFeedEntry[]>(entries.slice(0, 24));
    const [view, viewSet] = useState<HappyAgentFeedView>("activity");
    const [peek, peekSet] = useState<string | undefined>(undefined);
    const [turn, turnSet] = useState(0);
    const fold = () => {
        const at = 2 + ((turn * 5) % (items.length - 2));
        const moved = items[at]!;
        itemsSet([
            { ...moved, updates: moved.updates + 1, lastAt: NOW, unread: true },
            ...items.filter((_, index) => index !== at),
        ]);
        turnSet(turn + 1);
    };
    const open = (id: string) =>
        itemsSet(items.map((item) => (item.id === id ? { ...item, unread: false } : item)));
    const peeked = clusters.find((cluster) => cluster.id === peek);
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", gap: 8, padding: 8 }}>
                <Button onClick={fold} size="small" variant="secondary">
                    Fold a change into an entry
                </Button>
            </div>
            <HappyAgentFeedPage
                {...base}
                feed={ready(items)}
                onClusterPeek={peekSet}
                onEntryOpen={open}
                onPeekClose={() => peekSet(undefined)}
                onReadAll={() => itemsSet(items.map((item) => ({ ...item, unread: false })))}
                onViewChange={viewSet}
                {...(peeked
                    ? { peek: { label: peeked.label, list: ready(lead.slice(0, 3)) } }
                    : {})}
                unread={items.filter((item) => item.unread).length}
                view={view}
            />
        </div>
    );
}

export function HappyAgentFeedBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="What happened on a Happy Agent, for one reader: new tasks, bots, Surfaces, and artifacts, and changes to them, newest change first. Unseen changes fold into one entry per subject; the places activity gathers from can be muted, followed, or peeked into."
            title="HappyAgentFeed"
        >
            <FullScreenSpecimen
                detail="Three unread entries over a long, virtualized history, in one card per date. Each row: the subject's avatar, its title and when, and the faces of who changed it beside what they did. Unread rows are set heavier and carry a dot in a lane every row reserves."
                label="Activity"
                number="01"
                screen="01-activity-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentFeedPage {...base} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same activity at the window's minimum size."
                label="Activity, narrow"
                number="02"
                screen="02-activity-720x640"
                window={{ width: 720, height: 640 }}
            >
                <HappyAgentFeedPage {...base} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Everything read: Mark all read has nothing left to do."
                label="Up to date"
                number="03"
                screen="03-read-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentFeedPage
                    {...base}
                    feed={ready(entries.map((entry) => ({ ...entry, unread: false })))}
                    unread={0}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The first read has not answered yet."
                label="Loading"
                number="04"
                screen="04-loading-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentFeedPage {...base} feed={{ ...ready([]), loading: true }} unread={0} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Nothing has happened yet."
                label="Empty"
                number="05"
                screen="05-empty-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentFeedPage {...base} feed={ready([])} unread={0} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A read failed: what is held stays readable beneath the banner, and older entries are being read."
                label="Out of date, reading older"
                number="06"
                screen="06-error-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentFeedPage
                    {...base}
                    feed={{
                        ...ready(lead),
                        error: "The Happy Agent did not answer. It will be asked again.",
                        hasMore: true,
                        loadingMore: true,
                    }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Where activity gathers from. A muted cluster reads quieter; one whose change is on its way holds its switch."
                label="Following"
                number="07"
                screen="07-following-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentFeedPage {...base} view="following" />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Looking into one cluster without following it: what happened there, one entry per subject."
                label="Peek"
                number="08"
                screen="08-peek-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentFeedPage
                    {...base}
                    peek={{
                        label: "Migrate the billing tables",
                        list: ready(lead.map((entry) => ({ ...entry, unread: false }))),
                    }}
                    view="following"
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Interactive: fold a change and the entry glides to the top while the rows it passes glide aside; open one to read it."
                label="Live"
                number="09"
                window={{ width: 1100, height: 760 }}
            >
                <LiveFeed />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
