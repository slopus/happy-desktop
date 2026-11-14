import { useSyncExternalStore, type ReactNode } from "react";
import { AppShell } from "../../src/AppShell";
import { Button } from "../../src/Button";
import { Composer } from "../../src/Composer";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import {
    HappyAgentNewPage,
    SidebarFloatingMenu,
    SidebarPinTiles,
    SidebarPriorityNote,
    SidebarSleepingCluster,
    type SidebarFace,
} from "../../src/FocusedSidebar";
import { HappyAgentCreateBotPage } from "../../src/HappyAgentCreateBotPage";
import { HappyAgentCreateTaskPage } from "../../src/HappyAgentCreateTaskPage";
import { commandShortcut } from "../../src/keyboardShortcut";
import {
    LIVE_FEED_ROWS,
    LiveFeedControl,
    LiveFeedPanel,
    type LiveFeedItem,
} from "../../src/LiveFeed";
import type { MenuItem } from "../../src/Menu";
import type {
    HappyAgentFeedCluster,
    HappyAgentFeedEntry,
    HappyAgentFeedListState,
} from "../../src/pages/feed/feedPresentation";
import { HappyAgentFeedPage } from "../../src/pages/feed/HappyAgentFeedPage";
import { SegmentedControl } from "../../src/SegmentedControl";
import { Sidebar, type SidebarItem, type SidebarSection } from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, FullScreenSpecimen, Specimen } from "../kit";
import {
    botFace,
    DEMO_PROJECTS,
    DEMO_SCRIPT,
    DEMO_SEED,
    taskFace,
    WAKE_NOTE,
    WAKING_BOT,
    type DemoPin,
    type DemoTask,
} from "./focusedSidebar/focusedSidebarData";
import {
    FEED_SEEN_MS,
    FocusedSidebarDemo,
    splitRowId,
    tasksSorted,
    type FocusedBot,
    type FocusedSnapshot,
    type FocusedVersion,
} from "./focusedSidebar/focusedSidebarDemo";
import { botCreationSpecimen } from "./HappyAgentCreateBotBlueprintPage";
import { taskCreationSpecimen } from "./HappyAgentCreateTaskBlueprintPage";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-032";

const noop = () => undefined;
const ZONE = { locale: "en-US", timeZone: "UTC" } as const;
const WINDOW = { width: 1100, height: 760 };
const SCREEN = "01-focused-sidebar-1100x760";

/** One demo per page load; its clock starts with the reader's first action. */
const demo = new FocusedSidebarDemo();

const VERSIONS: readonly { value: FocusedVersion; label: string; summary: string }[] = [
    {
        value: "shelf",
        label: "A · Shelf",
        summary:
            "Pins: four tiles and rows. Sleeping: one folded row in Bots. Priority: a flag on the row, and sorting.",
    },
    {
        value: "strip",
        label: "B · Strip",
        summary:
            "Pins: one line of bare marks, then rows for the ones known by name. Sleeping: faces and a count in the Bots heading. Priority: a flag on the row, and sorting.",
    },
    {
        value: "lanes",
        label: "C · Lanes",
        summary:
            "Pins: rows under a heading. Sleeping: a quiet “6 sleeping” line. Priority: its own section above Tasks.",
    },
];

/** How many pins are tiles in each version; the rest are rows. */
const TILE_COUNT: Record<FocusedVersion, number> = { shelf: 4, strip: 5, lanes: 0 };

const SLEEPING_ROW = "bots:sleeping";
const MENU_PRIORITY = "priority";
const MENU_SWAP = "swap:";
const MENU_PIN = "pin";
const MENU_UNPIN = "unpin";
const MENU_SLEEP = "sleep";
const MENU_WAKE = "wake";
const MENU_LEAVE = "leave";

function faceProps(
    face: SidebarFace,
): Pick<SidebarItem, "icon" | "imageUrl" | "initials" | "placeholderSeed" | "tint"> {
    return {
        initials: face.initials,
        ...(face.icon === undefined ? {} : { icon: face.icon }),
        ...(face.imageUrl === undefined ? {} : { imageUrl: face.imageUrl }),
        ...(face.placeholderSeed === undefined ? {} : { placeholderSeed: face.placeholderSeed }),
        ...(face.tint === undefined ? {} : { tint: face.tint }),
    };
}

function pinItem(pin: DemoPin): SidebarItem {
    return {
        id: pin.id,
        kind: "project",
        label: pin.label,
        ...faceProps(pin.face),
        ...(pin.count === undefined ? {} : { count: pin.count }),
        ...(pin.badge === undefined ? {} : { badge: pin.badge }),
        ...(pin.unread ? { unread: true } : {}),
    };
}

function botItem(bot: FocusedBot, quiet: boolean, depth = 0): SidebarItem {
    return {
        id: `bot:${bot.id}`,
        kind: "project",
        label: bot.name,
        ...faceProps(botFace(bot)),
        ...(depth > 0 ? { depth } : {}),
        ...(bot.working ? { status: "working" as const } : {}),
        ...(bot.unread ? { unread: true } : {}),
        // Dozing, and asleep where the sleeping are listed among the awake: the
        // row keeps its place and paints muted, as an archived row does.
        ...(quiet || bot.dozing ? { archived: true } : {}),
    };
}

function taskItem(task: DemoTask, swapping: boolean, marked = true): SidebarItem {
    const leave = task.owner === "kirill" ? `Leave ${task.name}` : `Stop following ${task.name}`;
    return {
        id: `task:${task.id}`,
        kind: "project",
        label: task.name,
        ...faceProps(taskFace(task)),
        ...(task.activity === "working" ? { status: "working" as const } : {}),
        ...(task.activity === "awaitingInput" ? { status: "awaitingInput" as const } : {}),
        ...(task.unread ? { unread: true } : {}),
        ...(task.priority && marked ? { priority: true } : {}),
        ...(swapping && task.priority
            ? // While a task waits for a place, each priority row offers its own.
              { action: { icon: "repeat" as const, label: `Swap out ${task.name}` } }
            : {
                  action: { icon: "close" as const, label: leave, reveal: "hover" as const },
                  secondaryAction: {
                      icon: task.priority ? ("flag-filled" as const) : ("flag" as const),
                      label: task.priority ? "Remove priority" : "Mark as priority",
                      reveal: "hover" as const,
                  },
              }),
    };
}

/** The sidebar a snapshot draws in its version: the pins' tiles and every section. */
function sidebarOf(snapshot: FocusedSnapshot): {
    readonly tiles: readonly DemoPin[];
    readonly sections: SidebarSection[];
} {
    const version = snapshot.version;
    const pinned = new Set(snapshot.pins.map((pin) => pin.id));
    const tiles = snapshot.pins.slice(0, TILE_COUNT[version]);
    const pinRows = snapshot.pins.slice(TILE_COUNT[version]).map(pinItem);

    const bots = snapshot.bots.filter((bot) => !pinned.has(`bot:${bot.id}`));
    const awake = bots.filter((bot) => !bot.asleep);
    const asleep = bots.filter((bot) => bot.asleep);
    const sleepingFaces = asleep.map(botFace);

    const tasks = snapshot.tasks.filter((task) => !pinned.has(`task:${task.id}`));
    const swapping = snapshot.swapFor !== null && version === "lanes";
    const waiting = snapshot.tasks.find((task) => task.id === snapshot.swapFor);
    const priorityCount = snapshot.tasks.filter((task) => task.priority).length;

    const sections: SidebarSection[] = [];
    if (version === "lanes") {
        if (pinRows.length > 0)
            sections.push({
                id: "pinned",
                label: "Pinned",
                collapsed: !snapshot.pinnedOpen,
                headingDisclosure: true,
                items: pinRows,
            });
    } else if (pinRows.length > 0) sections.push({ id: "pinned", items: pinRows });

    if (version === "shelf")
        sections.push({
            id: "bots",
            label: "Bots",
            items: [
                ...awake.map((bot) => botItem(bot, false)),
                ...(asleep.length === 0
                    ? []
                    : [
                          {
                              id: SLEEPING_ROW,
                              kind: "folder" as const,
                              label: "Sleeping",
                              collapsed: !snapshot.sleepingOpen,
                              count: asleep.length,
                              icon: "moon" as const,
                          },
                          ...asleep.map((bot) => botItem(bot, false, 1)),
                      ]),
            ],
        });
    else if (version === "strip")
        sections.push({
            id: "bots",
            label: "Bots",
            headingAccessory: (
                <SidebarSleepingCluster
                    count={asleep.length}
                    expanded={snapshot.sleepingOpen}
                    faces={sleepingFaces}
                    onToggle={() => demo.sleepingToggle()}
                />
            ),
            items: [
                ...awake.map((bot) => botItem(bot, false)),
                ...(snapshot.sleepingOpen ? asleep.map((bot) => botItem(bot, true)) : []),
            ],
        });
    else
        sections.push({
            id: "bots",
            label: "Bots",
            items: [
                ...awake.map((bot) => botItem(bot, false)),
                ...asleep.map((bot) => botItem(bot, true)),
            ],
            ...(asleep.length === 0
                ? {}
                : {
                      tail: {
                          visibleCount: awake.length,
                          expanded: snapshot.sleepingOpen,
                          label: `${String(asleep.length)} sleeping`,
                      },
                  }),
        });

    const tasksEmpty = {
        actionLabel: "New",
        description: "Start a task, or follow a teammate's from the feed.",
        icon: "tasks" as const,
        title: "No tasks yet",
    };
    if (version === "lanes") {
        const priority = tasksSorted(tasks.filter((task) => task.priority));
        const rest = tasksSorted(tasks.filter((task) => !task.priority));
        if (priority.length > 0 || swapping)
            sections.push({
                id: "priority",
                label: "Priority",
                headingAccessory: (
                    <span className="happy-sidebar__item-count">
                        {`${String(priorityCount)}/${String(snapshot.priorityLimit)}`}
                    </span>
                ),
                ...(swapping && waiting !== undefined
                    ? {
                          notice: (
                              <SidebarPriorityNote
                                  label={waiting.name}
                                  onCancel={() => demo.taskPrioritySwapCancel()}
                              />
                          ),
                      }
                    : {}),
                items: priority.map((task) => taskItem(task, swapping, false)),
            });
        sections.push({
            id: "tasks",
            label: "Tasks",
            items: rest.map((task) => taskItem(task, false)),
            ...(tasks.length === 0 ? { empty: tasksEmpty } : {}),
        });
    } else
        sections.push({
            id: "tasks",
            label: "Tasks",
            items: tasksSorted(tasks).map((task) => taskItem(task, false)),
            empty: tasksEmpty,
        });

    sections.push({
        id: "projects",
        label: "Projects",
        collapsed: !snapshot.projectsOpen,
        headingDisclosure: true,
        items: DEMO_PROJECTS.filter((project) => !pinned.has(project.id)).map((project) => ({
            id: project.id,
            kind: "project" as const,
            label: project.label,
            ...faceProps(project.face),
        })),
    });

    return { tiles, sections };
}

/** The menu a right-click on a row opens, and what the swap menu lists. */
function swapItems(snapshot: FocusedSnapshot): MenuItem[] {
    return [
        { kind: "label", label: `Priority is full (${String(snapshot.priorityLimit)}). Swap out…` },
        ...snapshot.tasks
            .filter((task) => task.priority)
            .map(
                (task): MenuItem => ({
                    kind: "item",
                    id: `${MENU_SWAP}${task.id}`,
                    label: task.name,
                    icon: "flag",
                }),
            ),
    ];
}

function rowMenuItems(snapshot: FocusedSnapshot, rowId: string): MenuItem[] {
    const [kind, id] = splitRowId(rowId);
    if (snapshot.pins.some((pin) => pin.id === rowId))
        return [{ kind: "item", id: MENU_UNPIN, label: "Unpin", icon: "pin" }];
    if (kind === "bot") {
        const bot = snapshot.bots.find((entry) => entry.id === id);
        if (bot === undefined) return [];
        return bot.asleep
            ? [{ kind: "item", id: MENU_WAKE, label: "Wake", icon: "sun" }]
            : [
                  { kind: "item", id: MENU_PIN, label: "Pin", icon: "pin" },
                  { kind: "item", id: MENU_SLEEP, label: "Put to sleep", icon: "moon" },
              ];
    }
    if (kind === "task") {
        const task = snapshot.tasks.find((entry) => entry.id === id);
        if (task === undefined) return [];
        const full =
            !task.priority &&
            snapshot.tasks.filter((entry) => entry.priority).length >= snapshot.priorityLimit;
        return [
            ...(full
                ? swapItems(snapshot)
                : [
                      {
                          kind: "item" as const,
                          id: MENU_PRIORITY,
                          label: task.priority ? "Remove priority" : "Mark as priority",
                          icon: "flag" as const,
                      },
                  ]),
            { kind: "separator" },
            { kind: "item", id: MENU_PIN, label: "Pin", icon: "pin" },
            {
                kind: "item",
                id: MENU_LEAVE,
                label: task.owner === "kirill" ? "Leave task" : "Stop following",
                icon: "close",
            },
        ];
    }
    return [];
}

/** What choosing an entry of a row's menu does. */
function rowMenuAct(store: FocusedSidebarDemo, rowId: string, actionId: string): void {
    const [, id] = splitRowId(rowId);
    if (actionId === MENU_UNPIN) store.pinRemove(rowId);
    else if (actionId === MENU_PIN) store.pinAdd(rowId);
    else if (actionId === MENU_SLEEP) store.botDoze(id);
    else if (actionId === MENU_WAKE) store.botWake(id);
    else if (actionId === MENU_LEAVE) store.taskLeave(id);
    else if (actionId === MENU_PRIORITY) store.taskPriorityToggle(id);
    else if (actionId.startsWith(MENU_SWAP))
        store.taskPrioritySwap(actionId.slice(MENU_SWAP.length), id);
}

/**
 * Where a menu of `rows` entries opens from a row of the demo window: under the
 * row, or over it when the window's foot is too near for the menu to fit.
 */
function menuPointAt(node: Element | null, rows: number): { x: number; y: number } | null {
    const root = document.querySelector(`[data-screen="${SCREEN}"]`);
    if (root === null || node === null) return null;
    const origin = root.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const height = rows * 28 + 16;
    const under = box.bottom - origin.top + 2;
    return {
        x: box.left - origin.left + 28,
        y: under + height > origin.height - 8 ? box.top - origin.top - height - 2 : under,
    };
}

/**
 * The focused sidebar itself: `Sidebar` with Search and New, the pins, Bots,
 * Tasks, a folded Projects, and the feed standing on its footer.
 */
function FocusedSidebarView(props: {
    readonly snapshot: FocusedSnapshot;
    readonly demo: FocusedSidebarDemo;
    readonly appearance: "light" | "dark";
}) {
    const snapshot = props.snapshot;
    const store = props.demo;
    const { tiles, sections } = sidebarOf(snapshot);
    const feed = snapshot.feed;
    const activeRow = snapshot.view.kind === "chat" ? snapshot.view.rowId : "";
    return (
        <Sidebar
            activeItemId={activeRow}
            bodyAccessory={
                tiles.length === 0 ? undefined : (
                    <SidebarPinTiles
                        activeId={activeRow}
                        onSelect={(id) => store.rowSelect(id)}
                        tiles={tiles.map((pin) => ({
                            id: pin.id,
                            label: pin.label,
                            face: pin.face,
                            ...(pin.unread ? { unread: true } : {}),
                            ...(pin.badge === undefined ? {} : { badge: pin.badge }),
                        }))}
                        variant={snapshot.version === "strip" ? "strip" : "grid"}
                    />
                )
            }
            brand={false}
            className={
                feed.on
                    ? "happy-focused-sidebar happy-focused-sidebar--feed"
                    : "happy-focused-sidebar"
            }
            composeActive={snapshot.view.kind === "new"}
            composeLabel="New"
            composeShortcut={commandShortcut("n")}
            footer={
                <div
                    className="happy-sidebar-footer"
                    style={{ display: "flex", alignItems: "center", gap: "4px", width: "100%" }}
                >
                    <LiveFeedControl
                        on={feed.on}
                        onReadAll={() => store.feedReadAll()}
                        onToggle={() => store.feedToggle()}
                        onViewAll={() => store.feedViewAll()}
                        unread={feed.unread}
                    />
                    <LiveFeedPanel
                        items={feed.unreadItems}
                        now={feed.now}
                        onFollowToggle={(id, following) => store.taskFollowUpdate(id, following)}
                        onHoverChange={(hovering) => store.feedHoverUpdate(hovering)}
                        onItemDismiss={(id) => store.feedItemDismiss(id)}
                        onItemOpen={(id) => store.feedItemOpen(id)}
                        onReadAll={() => store.feedReadAll()}
                        onViewAll={() => store.feedViewAll()}
                        shown={feed.on}
                    />
                    <SidebarFooter
                        keepAwake={{ active: false, mode: "off", onModeSelect: noop }}
                        onSettingsOpen={noop}
                        style={{ flex: "1 1 auto", width: "auto" }}
                        theme={{
                            appearance: props.appearance,
                            mode: "system",
                            onModeSelect: noop,
                        }}
                    />
                </div>
            }
            onCompose={() => store.newOpen()}
            onItemAction={(rowId) => {
                const [kind, id] = splitRowId(rowId);
                if (kind !== "task") return;
                const task = snapshot.tasks.find((entry) => entry.id === id);
                if (snapshot.swapFor !== null && task?.priority) store.taskPrioritySwap(id);
                else store.taskLeave(id);
            }}
            onItemCollapseToggle={(rowId) => {
                if (rowId === SLEEPING_ROW) store.sleepingToggle();
            }}
            onItemSecondaryAction={(rowId) => {
                const [kind, id] = splitRowId(rowId);
                if (kind !== "task") return;
                const choose = store.taskPriorityToggle(id);
                if (!choose || snapshot.version === "lanes") return;
                // Every place is taken: the same row opens the swap, right beside it.
                const at = menuPointAt(
                    document.querySelector(`[data-screen="${SCREEN}"] [data-item-id="${rowId}"]`),
                    snapshot.priorityLimit + 1,
                );
                if (at !== null) store.menuOpen({ kind: "swap", ...at });
            }}
            onItemSelect={(rowId) => {
                if (rowId === SLEEPING_ROW) store.sleepingToggle();
                else store.rowSelect(rowId);
            }}
            onSectionAction={(sectionId, source) => {
                if (sectionId === "tasks" && source === "empty") store.newOpen();
            }}
            onSectionCollapseToggle={(sectionId) => {
                if (sectionId === "projects") store.projectsToggle();
                if (sectionId === "pinned") store.pinnedToggle();
            }}
            onSectionTailToggle={(sectionId) => {
                if (sectionId === "bots") store.sleepingToggle();
            }}
            searchRow={{ label: "Search", shortcut: commandShortcut("k"), onOpen: noop }}
            sections={sections}
            style={{ width: "100%" }}
        />
    );
}

/* ---- The window around it ------------------------------------------------ */

const CONNECTIONS: ConnectionShellItem[] = [
    { id: "team", label: "Happy Engineering", local: false, status: "connected" },
    { id: "home", label: "This Mac", local: true, status: "connected" },
];

const ready = <Item,>(items: readonly Item[]): HappyAgentFeedListState<Item> => ({
    items,
    loading: false,
    hasMore: false,
    loadingMore: false,
});

function feedEntryOf(item: LiveFeedItem, unread: boolean): HappyAgentFeedEntry {
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
        updates: item.verb === "updated" ? 1 : 0,
        ...(item.detail === undefined ? {} : { detail: item.detail }),
        lastAt: item.at,
        unread,
    };
}

const CLUSTERS: readonly HappyAgentFeedCluster[] = [
    { id: "*", kind: "everything", label: "Everything", state: "subscribed" },
    { id: "team", kind: "team", label: "Team", state: "subscribed" },
];

/** View all: everything that happened, at the time it really happened, read or not. */
function AllActivity(props: {
    readonly snapshot: FocusedSnapshot;
    readonly demo: FocusedSidebarDemo;
}) {
    const feed = props.snapshot.feed;
    const realAt = new Map(
        [...DEMO_SEED, ...DEMO_SCRIPT].map((event) => [event.item.id, event.realAt]),
    );
    const happened = [
        ...feed.delivered,
        ...feed.held.map((event) => ({ ...event.item, at: 0 })),
        ...feed.below.map((event) => ({ ...event.item, at: 0 })),
    ];
    const entries = happened
        .map((item) =>
            feedEntryOf(
                { ...item, at: realAt.get(item.id) ?? item.at },
                feed.unreadIds.has(item.id),
            ),
        )
        .sort((left, right) => right.lastAt - left.lastAt);
    return (
        <HappyAgentFeedPage
            clusters={ready(
                CLUSTERS.concat(
                    props.snapshot.tasks.map((task) => ({
                        id: `task:${task.id}`,
                        kind: "task" as const,
                        label: task.name,
                        state: "subscribed" as const,
                    })),
                ),
            )}
            feed={ready(entries)}
            now={Date.parse("2026-11-14T09:40:00Z")}
            onClusterFollowChange={noop}
            onClusterPeek={noop}
            onEntryOpen={(id) => props.demo.feedItemOpen(id)}
            onLoadMore={noop}
            onPeekClose={noop}
            onPeekEntryOpen={noop}
            onPeekLoadMore={noop}
            onReadAll={() => props.demo.feedReadAll()}
            onViewChange={noop}
            unread={feed.unread}
            view="activity"
            zone={ZONE}
        />
    );
}

/** A chat, mocked: the line that brought the reader here, ringed, over the composer. */
function ChatMock(props: { readonly who?: string; readonly said?: string }) {
    return (
        <div
            style={{
                display: "flex",
                flex: "1 1 auto",
                flexDirection: "column",
                justifyContent: "flex-end",
                gap: "16px",
                height: "100%",
                padding: "16px 24px 12px",
                color: "var(--text)",
                fontFamily: "var(--happy-font-ui)",
            }}
        >
            {props.said === undefined ? null : (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        maxWidth: "80%",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "var(--happy-hover-fill)",
                        fontSize: "14px",
                        lineHeight: "20px",
                    }}
                >
                    <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                        {props.who}
                    </span>
                    <span>{props.said}</span>
                </div>
            )}
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

/** What the main area shows, and the name on its tab. */
function mainOf(
    snapshot: FocusedSnapshot,
    store: FocusedSidebarDemo,
): { readonly tab: string; readonly content: ReactNode } {
    const view = snapshot.view;
    if (view.kind === "new")
        return {
            tab: "New",
            content: (
                <HappyAgentNewPage
                    kind={snapshot.newKind}
                    onKindChange={(kind) => store.newKindUpdate(kind)}
                    onSurfaceKindChange={(kind) => store.newSurfaceKindUpdate(kind)}
                    surfaceKind={snapshot.newSurfaceKind}
                >
                    {snapshot.newKind === "bot"
                        ? botCreationSpecimen(
                              <HappyAgentCreateBotPage
                                  faceSlot={0}
                                  faces={["blueprint1", "blueprint2", "blueprint3", "blueprint4"]}
                                  name=""
                                  onCreditOpen={noop}
                                  onFacePick={noop}
                                  onFacesRoll={noop}
                                  onNameChange={noop}
                                  onSubmit={noop}
                              />,
                              "",
                          )
                        : taskCreationSpecimen(
                              <HappyAgentCreateTaskPage
                                  name=""
                                  onNameChange={noop}
                                  onSubmit={noop}
                              />,
                              "",
                          )}
                </HappyAgentNewPage>
            ),
        };
    if (view.kind === "feed")
        return { tab: "Activity", content: <AllActivity demo={store} snapshot={snapshot} /> };
    if (view.kind === "opened") {
        const item = snapshot.feed.delivered.find((entry) => entry.id === view.itemId);
        return {
            tab: item?.place ?? item?.title ?? "Chat",
            content: (
                <ChatMock
                    said={item?.detail ?? item?.title}
                    who={item?.actor.name}
                    key={view.itemId}
                />
            ),
        };
    }
    const [kind, id] = splitRowId(view.rowId);
    const bot = kind === "bot" ? snapshot.bots.find((entry) => entry.id === id) : undefined;
    const task = kind === "task" ? snapshot.tasks.find((entry) => entry.id === id) : undefined;
    const pin = snapshot.pins.find((entry) => entry.id === view.rowId);
    const project = DEMO_PROJECTS.find((entry) => entry.id === view.rowId);
    return {
        tab: bot?.name ?? task?.name ?? pin?.label ?? project?.label ?? "Chat",
        content: <ChatMock said={bot?.note} who={bot?.name} key={view.rowId} />,
    };
}

function FocusedWindow(props: {
    readonly snapshot: FocusedSnapshot;
    readonly demo: FocusedSidebarDemo;
    readonly appearance: "light" | "dark";
}) {
    const snapshot = props.snapshot;
    const store = props.demo;
    const main = mainOf(snapshot, store);
    const menu = snapshot.menu;
    const menuItems =
        menu === null
            ? []
            : menu.kind === "swap"
              ? swapItems(snapshot)
              : rowMenuItems(snapshot, menu.rowId);
    return (
        // The viewport stands in for the window: a row's menu opens at the pointer's
        // place in it, wherever the Blueprint has put the window on the page.
        <div
            onContextMenu={(event) => {
                const row = (event.target as HTMLElement).closest(
                    '[data-happy-desktop-ui="sidebar-item"][data-item-id], [data-pin-id]',
                );
                const rowId =
                    row?.getAttribute("data-item-id") ?? row?.getAttribute("data-pin-id") ?? "";
                const items = rowMenuItems(snapshot, rowId);
                if (items.length === 0) return;
                event.preventDefault();
                const origin = event.currentTarget.getBoundingClientRect();
                store.menuOpen({
                    kind: "row",
                    rowId,
                    x: event.clientX - origin.left,
                    // Kept clear of the window's foot, as the app's own row menu is.
                    y: Math.min(
                        event.clientY - origin.top,
                        origin.height - (items.length * 30 + 24),
                    ),
                });
            }}
            style={{
                position: "relative",
                display: "flex",
                width: "100%",
                height: "100%",
                transform: "translateZ(0)",
            }}
        >
            <ConnectionShell items={CONNECTIONS} onSelect={noop} selectedId="team" windowControls>
                <ConnectionSurface active>
                    <AppShell
                        navigationChrome="integrated"
                        sidebar={
                            <FocusedSidebarView
                                appearance={props.appearance}
                                demo={store}
                                snapshot={snapshot}
                            />
                        }
                        sidebarCollapsedLayout="overlay"
                        sidebarCollapsible
                        sidebarDefaultWidth={288}
                        sidebarOwnsCreate
                        windowControls
                    >
                        <TabbedPane
                            activeId="main"
                            onSelect={noop}
                            size="medium"
                            tabSizing="content"
                            tabs={[{ id: "main", label: main.tab, closable: false }]}
                        >
                            {main.content}
                        </TabbedPane>
                    </AppShell>
                </ConnectionSurface>
            </ConnectionShell>
            {menu === null ? null : (
                <SidebarFloatingMenu
                    items={menuItems}
                    onDismiss={() => store.menuDismiss()}
                    onSelect={(actionId) => {
                        if (menu.kind === "row") {
                            store.menuDismiss();
                            rowMenuAct(store, menu.rowId, actionId);
                        } else if (actionId.startsWith(MENU_SWAP))
                            store.taskPrioritySwap(actionId.slice(MENU_SWAP.length));
                    }}
                    x={menu.x}
                    y={menu.y}
                />
            )}
        </div>
    );
}

/* ---- Page ---------------------------------------------------------------- */

function DemoControls(props: { readonly snapshot: FocusedSnapshot }) {
    const snapshot = props.snapshot;
    const sleeping = snapshot.bots.filter((bot) => bot.asleep).length;
    const waker = snapshot.bots.find((bot) => bot.id === WAKING_BOT);
    const asking = snapshot.tasks.find((task) => task.id === "imw1gxm6l219edvoidnd75jy");
    return (
        <div
            data-focused-sidebar-controls=""
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                <SegmentedControl
                    aria-label="Version"
                    data-testid="focused-version"
                    onChange={(value) => {
                        const next = VERSIONS.find((entry) => entry.value === value);
                        if (next !== undefined) demo.versionUpdate(next.value);
                    }}
                    segments={VERSIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
                    size="small"
                    value={snapshot.version}
                />
                <DimensionRule
                    label={
                        VERSIONS.find((entry) => entry.value === snapshot.version)?.summary ?? ""
                    }
                />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                <Button
                    data-testid="focused-bot-doze"
                    onClick={() => demo.botWorkFinish()}
                    size="small"
                    variant="secondary"
                >
                    Releaser finishes
                </Button>
                <Button
                    data-testid="focused-bot-wake"
                    onClick={() =>
                        waker?.asleep ? demo.botWakeNext(WAKE_NOTE) : demo.botDoze(WAKING_BOT)
                    }
                    size="small"
                    variant="secondary"
                >
                    {waker?.asleep ? "Disk Sweeper wakes" : "Disk Sweeper dozes"}
                </Button>
                <Button
                    data-testid="focused-task-input"
                    onClick={() =>
                        demo.taskInputUpdate(
                            "imw1gxm6l219edvoidnd75jy",
                            asking?.activity !== "awaitingInput",
                        )
                    }
                    size="small"
                    variant="secondary"
                >
                    {asking?.activity === "awaitingInput"
                        ? "Windows builds answered"
                        : "Windows builds asks"}
                </Button>
                <Button
                    data-testid="focused-feed-next"
                    onClick={() => demo.feedEventNext()}
                    size="small"
                    variant="secondary"
                >
                    Feed event
                </Button>
                <SegmentedControl
                    aria-label="Priority limit"
                    data-testid="focused-limit"
                    onChange={(value) => demo.priorityLimitUpdate(Number(value))}
                    segments={[2, 3, 4].map((limit) => ({
                        value: String(limit),
                        label: `Limit ${String(limit)}`,
                    }))}
                    size="small"
                    value={String(snapshot.priorityLimit)}
                />
                <DimensionRule
                    label={`${String(sleeping)} sleeping · ${String(snapshot.tasks.filter((task) => task.priority).length)}/${String(snapshot.priorityLimit)} priority · ${String(snapshot.feed.unread)} unread`}
                />
            </div>
        </div>
    );
}

/** A snapshot that never changes, for a still: a fresh store, a few feed events, no clock. */
function still(
    version: FocusedVersion,
    options: { readonly empty?: boolean; readonly events?: number; readonly open?: boolean } = {},
): { readonly demo: FocusedSidebarDemo; readonly snapshot: FocusedSnapshot } {
    const store = new FocusedSidebarDemo({ version, empty: options.empty === true });
    store.feedAutoReadUpdate(false);
    for (let index = 0; index < (options.events ?? 0); index += 1) store.feedEventNext();
    if (options.open) store.sleepingToggle();
    const snapshot = store.get();
    store.dispose();
    return { demo: store, snapshot };
}

const STILLS = [
    { id: "a-shelf", label: "A · Shelf", ...still("shelf") },
    { id: "b-strip", label: "B · Strip", ...still("strip") },
    { id: "c-lanes", label: "C · Lanes", ...still("lanes") },
    { id: "a-shelf-feed", label: "A · Feed full", ...still("shelf", { events: 2 }) },
    { id: "a-shelf-sleeping-open", label: "A · Sleeping open", ...still("shelf", { open: true }) },
    { id: "b-strip-sleeping-open", label: "B · Sleeping open", ...still("strip", { open: true }) },
    { id: "c-lanes-sleeping-open", label: "C · Sleeping open", ...still("lanes", { open: true }) },
    { id: "empty", label: "Nothing yet", ...still("shelf", { empty: true }) },
] as const;

/** The sidebar as the app assembles it today, over the same content, for comparison. */
function todaySections(): SidebarSection[] {
    const snapshot = STILLS[0].snapshot;
    return [
        {
            id: "top",
            items: [
                {
                    icon: "doc",
                    id: "artifacts",
                    kind: "project",
                    label: "Artifacts",
                    tint: "purple",
                },
                { icon: "feed", id: "feed", kind: "project", label: "Feed", tint: "red", badge: 3 },
                ...snapshot.pins.filter((pin) => pin.kind === "surface").map(pinItem),
            ],
        },
        {
            id: "bots",
            label: "Bots",
            action: { icon: "plus", label: "New bot", reveal: "always" },
            items: snapshot.bots.map((bot) => botItem({ ...bot, asleep: false }, false)),
        },
        {
            id: "tasks",
            label: "Tasks",
            items: snapshot.tasks.map((task) => {
                const {
                    priority: _priority,
                    secondaryAction: _flag,
                    ...row
                } = taskItem(task, false);
                return row;
            }),
        },
        {
            id: "projects",
            label: "Projects",
            action: { icon: "plus", label: "Add project", reveal: "always" },
            items: [
                {
                    id: "p-desktop",
                    kind: "project",
                    label: "happy-desktop",
                    placeholderSeed: "xmtv7wnbg0310tvx6kee4ey5",
                },
                ...DEMO_PROJECTS.map((project) => ({
                    id: project.id,
                    kind: "project" as const,
                    label: project.label,
                    ...faceProps(project.face),
                })),
            ],
        },
    ];
}

const SIDEBAR_WINDOW = { width: 288, height: 760 };

export function FocusedSidebarPage() {
    const snapshot = useSyncExternalStore(demo.subscribe, demo.get);
    return (
        <ComponentPage
            number={componentNumber}
            summary={`A sidebar that starts from attention. Top to bottom: Search and one New; everything the reader pinned; Bots, where a background bot with nothing to say dozes off into Sleeping and wakes when it has something; Tasks, the reader's own and the ones they follow, sorted by needs-input and priority with at most three priority at a time; and the activity feed over the footer, ${String(LIVE_FEED_ROWS)} rows of finished work, new work and mentions (a line stays ${String((FEED_SEEN_MS.line ?? 0) / 1000)}s in view, a mention until dealt with). Three versions, switched above the window. Prototype: \`Sidebar\` itself with this installation's real bots, tasks and artifacts; nothing is wired into the app.`}
            title="Focused sidebar"
        >
            <DemoControls snapshot={snapshot} />
            <FullScreenSpecimen
                detail="Hover a task for its flag, or right-click it; mark a fourth to meet the limit. Right-click a bot to put it to sleep. Hover the feed for View all and Read all."
                label="Focused sidebar in the window"
                number="01"
                screen={SCREEN}
                window={WINDOW}
            >
                <FocusedWindow appearance="dark" demo={demo} snapshot={snapshot} />
            </FullScreenSpecimen>
            {(["dark", "light"] as const).map((appearance) => (
                <Specimen
                    detail={`Every version and state as a still, ${appearance}, beside the sidebar the app assembles today over the same content.`}
                    key={appearance}
                    label={`Versions, ${appearance}`}
                    number={appearance === "dark" ? "02" : "03"}
                    stage="app"
                >
                    <ThemeScope mode={appearance}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
                            <div
                                data-screen={`${appearance}-today-${String(SIDEBAR_WINDOW.width)}x${String(SIDEBAR_WINDOW.height)}`}
                                style={{
                                    display: "flex",
                                    width: SIDEBAR_WINDOW.width,
                                    height: SIDEBAR_WINDOW.height,
                                    background: "var(--groupped-background)",
                                }}
                            >
                                <Sidebar
                                    activeItemId="task:wmw24z24z1kra9thv75pcswb"
                                    brand={false}
                                    composeLabel="New task"
                                    composeShortcut={commandShortcut("n")}
                                    footer={
                                        <SidebarFooter
                                            keepAwake={{
                                                active: false,
                                                mode: "off",
                                                onModeSelect: noop,
                                            }}
                                            onSettingsOpen={noop}
                                            theme={{
                                                appearance,
                                                mode: "system",
                                                onModeSelect: noop,
                                            }}
                                        />
                                    }
                                    onCompose={noop}
                                    onItemAction={noop}
                                    onItemSelect={noop}
                                    searchRow={{
                                        label: "Search",
                                        shortcut: commandShortcut("k"),
                                        onOpen: noop,
                                    }}
                                    sections={todaySections()}
                                    style={{ width: "100%" }}
                                />
                            </div>
                            {STILLS.map((entry) => (
                                <div
                                    data-screen={`${appearance}-${entry.id}-${String(SIDEBAR_WINDOW.width)}x${String(SIDEBAR_WINDOW.height)}`}
                                    key={entry.id}
                                    style={{
                                        display: "flex",
                                        width: SIDEBAR_WINDOW.width,
                                        height: SIDEBAR_WINDOW.height,
                                        background: "var(--groupped-background)",
                                    }}
                                >
                                    <FocusedSidebarView
                                        appearance={appearance}
                                        demo={entry.demo}
                                        snapshot={entry.snapshot}
                                    />
                                </div>
                            ))}
                        </div>
                    </ThemeScope>
                </Specimen>
            ))}
            <Specimen
                detail="Not delivered to this reader, and real events that reached nobody's feed, with why."
                label="Held back, and below the bar"
                number="04"
                stage="surface"
            >
                <ul style={{ display: "flex", flexDirection: "column", gap: "4px", margin: 0 }}>
                    {snapshot.feed.held.length + snapshot.feed.below.length === 0 ? (
                        <li>Nothing yet.</li>
                    ) : null}
                    {snapshot.feed.held.map((event) => (
                        <li key={event.item.id}>
                            {event.item.title} — not the reader&apos;s, not followed
                        </li>
                    ))}
                    {snapshot.feed.below.map((event) => (
                        <li key={event.item.id}>
                            {event.item.title} — {event.why}
                        </li>
                    ))}
                </ul>
            </Specimen>
        </ComponentPage>
    );
}
