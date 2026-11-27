import { type ReactNode, useState } from "react";
import { type MenuItem } from "../../src/Menu";
import { type TabItem, Tabs, type TabsSize } from "../../src/Tabs";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** Closing a tab asks first, below the tab; the answer only closes the card here. */
function QuestionBar() {
    const [asked, setAsked] = useState<string>();
    const tab = laneTabs({}).find((candidate) => candidate.id === asked);
    return (
        <div style={{ width: "560px" }}>
            <Tabs
                activeId="one"
                closeQuestion={
                    tab
                        ? {
                              confirmLabel: "Archive",
                              initialFocus: "confirm",
                              message: `“${tab.label}” leaves the tabs. Search finds it again.`,
                              onCancel: () => setAsked(undefined),
                              onConfirm: () => setAsked(undefined),
                              tabId: tab.id,
                              title: "Archive this chat?",
                              tone: "warning",
                          }
                        : undefined
                }
                onClose={setAsked}
                onSelect={() => {}}
                tabs={laneTabs({})}
            />
        </div>
    );
}

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-025";
const inboxTabs: TabItem[] = [
    { id: "all", label: "All", icon: "inbox" },
    { id: "unread", label: "Unread", unread: true },
    { id: "mentions", label: "Mentions", icon: "at", badge: 12 },
    { id: "channels", label: "Channels", icon: "hash" },
    { id: "reactions", label: "Reactions" },
];
/**
 * Session-shaped tabs: no glyph of their own, but they report `busy` and
 * `unread`, so they hold the leading lane open in every state.
 */
const laneTabs = (state: {
    avatar?: boolean;
    busy?: boolean;
    unread?: boolean;
    waiting?: boolean;
    awaitingInput?: boolean;
}): TabItem[] =>
    ["one", "two", "three"].map((id, index) => ({
        id,
        label: ["Migrate the table", "Rewrite the header", "Connect a Happy Agent"][index]!,
        icon: state.avatar === true ? "chat" : undefined,
        busy: state.busy === true,
        waiting: state.waiting === true,
        awaitingInput: state.awaitingInput === true,
        unread: state.unread === true,
    }));
const adminTabs: TabItem[] = [
    { id: "members", label: "Members", badge: 128 },
    { id: "bans", label: "Bans", badge: 4 },
    { id: "audit", label: "Audit log" },
    { id: "backups", label: "Backups" },
];
/** The sweeps a document strip typically offers, for the context-menu fixture. */
const sweepMenu = (tab: TabItem): MenuItem[] => [
    { kind: "item", id: "close", label: "Close tab" },
    { kind: "separator" },
    { kind: "item", id: "close-others", label: "Close other tabs" },
    { kind: "item", id: "close-left", label: "Close tabs to the left", disabled: tab.id === "all" },
    { kind: "item", id: "close-right", label: "Close tabs to the right" },
    { kind: "separator" },
    { kind: "item", id: "close-all", label: "Close all tabs" },
];
function Bar(props: {
    active: string;
    onClose?: (id: string) => void;
    onReorder?: (ids: readonly string[]) => void;
    size?: TabsSize;
    tabMenuItems?: (tab: TabItem) => MenuItem[];
    tabs: TabItem[];
    width?: number;
}) {
    return (
        <div style={{ width: `${props.width ?? 560}px` }}>
            <Tabs
                activeId={props.active}
                onClose={props.onClose}
                onReorder={props.onReorder}
                onSelect={() => {}}
                onTabMenuSelect={() => {}}
                size={props.size}
                tabMenuItems={props.tabMenuItems}
                tabs={props.tabs}
            />
        </div>
    );
}
function Stack(props: { children: ReactNode; rule: string }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "24px" }}>
            {props.children}
            <DimensionRule label={props.rule} />
        </div>
    );
}
export function TabsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Horizontal tab bar on a bottom hairline — leading icons, trailing count badges, and a 2px accent underline on the active tab. Three contract heights."
            title="Tabs"
        >
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen detail="32px high · 12px label" label="Small" number="T-01" stage="app">
                    <Stack rule="height 32 · pad 0 12 · gap 6">
                        <Bar active="unread" size="small" tabs={inboxTabs} width={520} />
                    </Stack>
                </Specimen>
                <Specimen detail="40px high · 13px label" label="Medium" number="T-02" stage="app">
                    <Stack rule="height 40 · pad 0 14 · gap 8">
                        <Bar active="unread" size="medium" tabs={inboxTabs} width={520} />
                    </Stack>
                </Specimen>
                <Specimen detail="48px high · 14px label" label="Large" number="T-03" stage="app">
                    <Stack rule="height 48 · pad 0 16 · gap 8">
                        <Bar active="unread" size="large" tabs={inboxTabs} width={520} />
                    </Stack>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="leading icon · trailing CountBadge · plain label"
                    label="Tab content"
                    number="T-04"
                    stage="surface"
                >
                    <Stack rule="icon 16 · label 13 · badge 18 · gap 8">
                        <Bar active="mentions" tabs={inboxTabs} />
                    </Stack>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="close control revealed on hover and on the active tab"
                    label="Closable tabs"
                    number="T-07"
                    stage="app"
                >
                    <Stack rule="close 16 · reserved box · opacity only">
                        <Bar active="unread" onClose={() => {}} tabs={inboxTabs} />
                    </Stack>
                </Specimen>
                <Specimen
                    detail="drag to rearrange · pointer at rest · grabbing after the threshold · neighbours ease aside"
                    label="Draggable tabs"
                    number="T-08"
                    stage="app"
                >
                    <Stack rule="cursor pointer → grabbing · threshold 4 · shift = dragged width · ease 140ms">
                        <Bar active="unread" onReorder={() => {}} tabs={inboxTabs} />
                    </Stack>
                </Specimen>
                <Specimen
                    detail="right-click a tab for the owner's sweeps — close it, its neighbours, or the strip"
                    label="Context menu"
                    number="T-11"
                    stage="app"
                >
                    <Stack rule="Menu width 216 · fixed · clamped to viewport">
                        <Bar
                            active="unread"
                            onClose={() => {}}
                            tabMenuItems={sweepMenu}
                            tabs={inboxTabs}
                        />
                    </Stack>
                </Specimen>
                <Specimen
                    detail="close a tab to ask about it — the card hangs below that tab, Enter archives, Escape or a press elsewhere cancels"
                    label="Close question"
                    number="T-13"
                    stage="app"
                >
                    <Stack rule="ConfirmPopover 280 · 4 below the tab · clamped 8 inside the window">
                        <QuestionBar />
                    </Stack>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="active underline sweeps · 2px accent overlapping the hairline"
                    label="Active states"
                    number="T-05"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
                            padding: "24px",
                        }}
                    >
                        <Bar active="all" tabs={inboxTabs} />
                        <Bar active="mentions" tabs={inboxTabs} />
                        <Bar active="reactions" tabs={inboxTabs} />
                        <DimensionRule label="underline 2px · accent #8b7cf7 · bottom -1" />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="2–5 tabs · count badges 4 / 12 / 128 · accent when active"
                    label="Counts and arity"
                    number="T-06"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
                            padding: "24px",
                        }}
                    >
                        <Bar
                            active="a"
                            tabs={[
                                { id: "a", label: "Overview" },
                                { id: "b", label: "Activity", badge: 9 },
                            ]}
                            width={360}
                        />
                        <Bar active="members" tabs={adminTabs} width={440} />
                        <DimensionRule label="badge tone: accent active · neutral idle" />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="the same tabs idle, working, and unread — a working title shimmers where it stands"
                    label="Leading lane holds"
                    number="T-09"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
                            padding: "24px",
                        }}
                    >
                        <Bar active="one" tabs={laneTabs({})} width={440} />
                        <Bar active="one" tabs={laneTabs({ busy: true })} width={440} />
                        <Bar active="one" tabs={laneTabs({ unread: true })} width={440} />
                        <DimensionRule label="lane 16 · held while busy and unread are reported" />
                    </div>
                </Specimen>
                <Specimen
                    detail="a generated mark fills the lane; unread rides its corner; work still wins the lane"
                    label="Generated marks"
                    number="T-10"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
                            padding: "24px",
                        }}
                    >
                        <Bar active="one" tabs={laneTabs({ avatar: true })} width={440} />
                        <Bar
                            active="one"
                            tabs={laneTabs({ avatar: true, unread: true })}
                            width={440}
                        />
                        <Bar
                            active="one"
                            tabs={laneTabs({ avatar: true, busy: true })}
                            width={440}
                        />
                        <DimensionRule label="mark 16 · the same lane the glyph and spinner use" />
                    </div>
                </Specimen>
                <Specimen
                    detail="working spins and shimmers its title · a scheduled wait and a question for the reader are still marks in the same trailing lane, and the title stays still"
                    label="Working, waiting, asking"
                    number="T-12"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
                            padding: "24px",
                        }}
                    >
                        <Bar
                            active="one"
                            tabs={laneTabs({ avatar: true, busy: true })}
                            width={440}
                        />
                        <Bar
                            active="one"
                            tabs={laneTabs({ avatar: true, waiting: true })}
                            width={440}
                        />
                        <Bar
                            active="one"
                            tabs={laneTabs({ avatar: true, awaitingInput: true })}
                            width={440}
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
