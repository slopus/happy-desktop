import { useState } from "react";
import { SegmentedControl } from "../../src/SegmentedControl";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { StoriesRow, type StoriesRowItem } from "../../src/StoriesRow";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    SidebarPins,
    type SidebarPin,
    type SidebarPinKind,
    type SidebarPinsLayout,
} from "./sidebarPins/SidebarPins";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-335";

/*
 * Prototype. The pinned area is a second way into destinations the list below
 * also draws, so selection belongs to the destination, not to a row: the open
 * target lights every pin and every row that names it.
 */

const ICONS: Record<SidebarPinKind, string> = {
    artifact: new URL("../assets/sidebar-pins/artifact.png", import.meta.url).href,
    bot: new URL("../assets/sidebar-pins/bot.png", import.meta.url).href,
    calendar: new URL("../assets/sidebar-pins/calendar.png", import.meta.url).href,
    chat: new URL("../assets/sidebar-pins/chat.png", import.meta.url).href,
    conversation: new URL("../assets/sidebar-pins/conversation.png", import.meta.url).href,
    document: new URL("../assets/sidebar-pins/document.png", import.meta.url).href,
    subtask: new URL("../assets/sidebar-pins/subtask.png", import.meta.url).href,
    "todo-list": new URL("../assets/sidebar-pins/todo-list.png", import.meta.url).href,
};

function pin(id: string, kind: SidebarPinKind, title: string, targetId: string): SidebarPin {
    return { iconUrl: ICONS[kind], id, kind, targetId, title };
}

const PINS: readonly SidebarPin[] = [
    pin("pin-happy", "conversation", "Happy", "bot:happy"),
    pin("pin-subtask", "subtask", "Pinned header prototype", "task:pins"),
    pin("pin-todos", "todo-list", "Release checklist", "surface:checklist"),
    pin("pin-roadmap", "document", "Q4 roadmap", "surface:roadmap"),
    pin("pin-calendar", "calendar", "Team calendar", "surface:calendar"),
    pin("pin-chat", "chat", "#desktop", "surface:desktop"),
    pin("pin-dashboard", "artifact", "Usage dashboard for the desktop beta", "surface:dashboard"),
    pin("pin-release-bot", "bot", "Release bot", "bot:release"),
];

/** Every list row, by its own ID, and the destination it opens. */
const ROW_TARGETS: Record<string, string> = {
    "bots/happy": "bot:happy",
    "bots/release": "bot:release",
    "bots/release/pins": "task:pins",
    "bots/release/changelog": "task:changelog",
    "tasks/pins": "task:pins",
    "tasks/onboarding": "task:onboarding",
    "tasks/docs": "task:docs",
    "surfaces/checklist": "surface:checklist",
    "surfaces/roadmap": "surface:roadmap",
    "surfaces/calendar": "surface:calendar",
    "surfaces/desktop": "surface:desktop",
    "surfaces/dashboard": "surface:dashboard",
};

const SECTIONS: SidebarSection[] = [
    {
        id: "bots",
        label: "Bots",
        items: [
            { id: "bots/happy", initials: "H", kind: "agent", label: "Happy", tone: "ocean" },
            {
                id: "bots/release",
                initials: "RB",
                kind: "agent",
                label: "Release bot",
                tone: "violet",
            },
            {
                depth: 1,
                id: "bots/release/pins",
                kind: "workspace",
                label: "Pinned header prototype",
                status: "working",
            },
            {
                depth: 1,
                id: "bots/release/changelog",
                kind: "workspace",
                label: "Changelog draft",
            },
        ],
    },
    {
        id: "tasks",
        label: "Tasks",
        items: [
            {
                id: "tasks/pins",
                initials: "PH",
                kind: "project",
                label: "Pinned header prototype",
                status: "working",
            },
            {
                id: "tasks/onboarding",
                initials: "KD",
                kind: "project",
                label: "Desktop onboarding",
            },
            { id: "tasks/docs", initials: "AD", kind: "project", label: "API docs" },
        ],
    },
    {
        id: "surfaces",
        label: "Surfaces",
        items: [
            {
                icon: "check-circle",
                id: "surfaces/checklist",
                kind: "view",
                label: "Release checklist",
            },
            { icon: "doc", id: "surfaces/roadmap", kind: "view", label: "Q4 roadmap" },
            { icon: "calendar", id: "surfaces/calendar", kind: "view", label: "Team calendar" },
            { id: "surfaces/desktop", kind: "channel", label: "desktop" },
            { icon: "spark", id: "surfaces/dashboard", kind: "view", label: "Usage dashboard" },
        ],
    },
];

const STORIES: readonly StoriesRowItem[] = [
    {
        face: { initials: "KD", type: "agent" },
        id: "onboarding",
        name: "Onboarding",
        state: "unseen",
    },
    { face: { initials: "K", tone: "ocean" }, id: "kirill", name: "Kirill", state: "unseen" },
    { face: { initials: "RB", type: "agent" }, id: "release", name: "Release bot", state: "seen" },
];

interface PinsState {
    readonly order: readonly string[];
    readonly target: string;
}

function PinnedSidebar(props: {
    readonly layout: SidebarPinsLayout;
    readonly mode: "light" | "dark";
    readonly state: PinsState;
    readonly onState: (state: PinsState) => void;
    readonly width: number;
    readonly height: number;
}) {
    const pins = props.state.order.map((id) => PINS.find((entry) => entry.id === id)!);
    const rows = Object.keys(ROW_TARGETS).filter((id) => ROW_TARGETS[id] === props.state.target);
    const open = (target: string) => props.onState({ ...props.state, target });
    return (
        <ThemeScope mode={props.mode}>
            <div
                style={{
                    background: "var(--groupped-background)",
                    border: "1px solid var(--divider)",
                    display: "flex",
                    height: props.height,
                    overflow: "hidden",
                    width: props.width,
                }}
            >
                <Sidebar
                    activeItemId={rows[0] ?? ""}
                    activeItemIds={rows}
                    bodyLeading={
                        <>
                            <StoriesRow items={STORIES} onOpen={() => undefined} />
                            <SidebarPins
                                activeTargetId={props.state.target}
                                layout={props.layout}
                                onOpen={open}
                                onReorder={(order) => props.onState({ ...props.state, order })}
                                pins={pins}
                            />
                        </>
                    }
                    onCompose={() => undefined}
                    onItemSelect={(id) => open(ROW_TARGETS[id] ?? "")}
                    searchRow={{ label: "Search", onOpen: () => undefined }}
                    sections={SECTIONS}
                    style={{ width: "100%" }}
                />
            </div>
        </ThemeScope>
    );
}

const LAYOUTS: readonly { value: SidebarPinsLayout; label: string; detail: string }[] = [
    {
        value: "stacked",
        label: "Centered",
        detail: "a) Icon over a one-line title, both centred · 56px tiles, three across from a 260px column",
    },
    {
        value: "inline",
        label: "Icon left",
        detail: "b) Icon before a one-line title · 36px tiles, 8px from every edge, two across",
    },
    {
        value: "wrap",
        label: "Two lines",
        detail: "c) Icon before a title that wraps to two lines and clamps · every tile 46px",
    },
];

export function SidebarPinsPage() {
    const [state, stateSet] = useState<PinsState>({
        order: PINS.map((entry) => entry.id),
        target: "task:pins",
    });
    const [layout, layoutSet] = useState<SidebarPinsLayout>("stacked");
    const [width, widthSet] = useState("260");
    return (
        <ComponentPage
            number={componentNumber}
            summary="Prototype. Arc-style pinned destinations between the stories row and the list: conversations, subtasks, todo lists, documents, calendars, chats, artifacts and bots as rectangular tiles tinted from the night-sky palette. Selection belongs to the destination, so an open target lights its pin and every list row that names it. Drag a tile, or press Option-arrow on it, to rearrange the pins among themselves."
            title="Sidebar pins"
            width={1540}
        >
            <Specimen
                detail="Live · light and dark share one state · drag to reorder · click a pin or a row"
                label="Playground"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ alignItems: "center", display: "flex", gap: "16px" }}>
                        <SegmentedControl
                            onChange={(value) => layoutSet(value as SidebarPinsLayout)}
                            segments={LAYOUTS.map((entry) => ({
                                label: entry.label,
                                value: entry.value,
                            }))}
                            size="small"
                            value={layout}
                        />
                        <SegmentedControl
                            onChange={widthSet}
                            segments={[
                                { label: "220px", value: "220" },
                                { label: "260px", value: "260" },
                                { label: "320px", value: "320" },
                            ]}
                            size="small"
                            value={width}
                        />
                    </div>
                    <div data-screen="01-playground" style={{ display: "flex", gap: "24px" }}>
                        {(["light", "dark"] as const).map((mode) => (
                            <PinnedSidebar
                                height={1010}
                                key={mode}
                                layout={layout}
                                mode={mode}
                                onState={stateSet}
                                state={state}
                                width={Number(width)}
                            />
                        ))}
                    </div>
                </div>
            </Specimen>
            {LAYOUTS.map((entry, index) => (
                <Specimen
                    detail={entry.detail}
                    key={entry.value}
                    label={`Variation — ${entry.label.toLowerCase()}`}
                    number={String(index + 2).padStart(2, "0")}
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div
                            data-screen={`0${String(index + 2)}-${entry.value}`}
                            style={{ display: "flex", gap: "24px" }}
                        >
                            {(["light", "dark"] as const).map((mode) => (
                                <PinnedSidebar
                                    height={1010}
                                    key={mode}
                                    layout={entry.value}
                                    mode={mode}
                                    onState={stateSet}
                                    state={state}
                                    width={260}
                                />
                            ))}
                        </div>
                        <DimensionRule label="260 px column · subtask open: its pin, its row under Release bot, and its task row all selected" />
                    </div>
                </Specimen>
            ))}
        </ComponentPage>
    );
}
