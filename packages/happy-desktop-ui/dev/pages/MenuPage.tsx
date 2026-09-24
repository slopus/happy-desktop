import { useState } from "react";
import { ContextMenu } from "../../src/ContextMenu";
import { Menu, type MenuItem } from "../../src/Menu";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-027";

const messageActions: MenuItem[] = [
    { kind: "item", id: "copy", label: "Copy link", icon: "link", shortcut: "⌘C" },
    { kind: "item", id: "star", label: "Add to starred", icon: "star" },
    { kind: "item", id: "view", label: "View details", icon: "eye", shortcut: "⌘I" },
    { kind: "separator" },
    { kind: "item", id: "edit", label: "Edit message", icon: "edit", shortcut: "⌘E" },
    {
        kind: "item",
        id: "delete",
        label: "Delete message",
        icon: "close",
        danger: true,
        shortcut: "⇧⌘D",
    },
];

const grouped: MenuItem[] = [
    { kind: "label", label: "Sort by" },
    { kind: "item", id: "recent", label: "Most recent", icon: "clock" },
    { kind: "item", id: "unread", label: "Unread first", icon: "inbox" },
    { kind: "separator" },
    { kind: "label", label: "Filter" },
    { kind: "item", id: "mentions", label: "Only mentions", icon: "at" },
    { kind: "item", id: "muted", label: "Include muted", icon: "bell", disabled: true },
];

const textOnly: MenuItem[] = [
    { kind: "item", id: "rename", label: "Rename" },
    { kind: "item", id: "duplicate", label: "Duplicate", shortcut: "⌘D" },
    { kind: "item", id: "archive", label: "Archive" },
    { kind: "separator" },
    { kind: "item", id: "leave", label: "Leave channel", danger: true },
];

const states: MenuItem[] = [
    { kind: "item", id: "reply", label: "Reply", icon: "reply" },
    { kind: "item", id: "pin", label: "Pin (disabled)", icon: "star", disabled: true },
    { kind: "separator" },
    { kind: "item", id: "remove", label: "Remove", icon: "close", danger: true },
];

const HOUR = 60 * 60 * 1000;
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const removable: MenuItem[] = [
    { kind: "label", label: "Slices" },
    {
        kind: "item",
        id: "one",
        label: "File browser only",
        icon: "check",
        detail: clock.format(Date.now() - HOUR),
        action: { icon: "close", label: "Delete slice" },
    },
    {
        kind: "item",
        id: "two",
        label: "Daemon connection layer",
        detail: clock.format(Date.now() - 2 * HOUR),
        action: { icon: "close", label: "Delete slice" },
    },
    {
        kind: "item",
        id: "three",
        label: "A long title that must give way to the time and the cross",
        detail: "Sep 12",
        action: { icon: "close", label: "Delete slice" },
    },
];

const linkPlaces: MenuItem[] = [
    { kind: "item", id: "browser", label: "Open in browser", icon: "open-external" },
    { kind: "item", id: "panel", label: "Open in side panel", icon: "panel-expand" },
];

/**
 * The pointer-anchored menu, opened live: it is fixed to the window and
 * clamps to its edges, which a card on the page cannot show at rest.
 */
function ContextMenuSpecimen() {
    const [menuAt, setMenuAt] = useState<{ x: number; y: number }>();
    const [chosen, setChosen] = useState<string>();
    return (
        <div
            onContextMenu={(event) => {
                event.preventDefault();
                setMenuAt({ x: event.clientX, y: event.clientY });
            }}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "320px",
                height: "120px",
                border: "1px dashed var(--divider)",
                borderRadius: "var(--happy-radius-md)",
                color: "var(--text-secondary)",
                fontFamily: "var(--happy-font-ui)",
                fontSize: "13px",
            }}
        >
            {chosen === undefined ? "Right-click anywhere in this box" : `Chose: ${chosen}`}
            {menuAt ? (
                <ContextMenu
                    items={linkPlaces}
                    onClose={() => setMenuAt(undefined)}
                    onSelect={(id) => {
                        setMenuAt(undefined);
                        setChosen(id);
                    }}
                    x={menuAt.x}
                    y={menuAt.y}
                />
            ) : null}
        </div>
    );
}

export function MenuPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Dropdown / context-menu popover — 220px raised card, 28px item rows, icon gutter, KeyCap shortcuts, mono section labels, danger items, and 1px separators."
            title="Menu"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="220px card · 28px rows · icon gutter · ⌘ shortcuts · danger"
                    label="Context menu"
                    number="M-01"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "8px", padding: "28px" }}>
                        <div style={{ width: "220px" }}>
                            <DimensionRule label="width 220" />
                        </div>
                        <Menu items={messageActions} />
                    </div>
                </Specimen>

                <Specimen
                    detail="mono section labels · separators · disabled row"
                    label="Grouped"
                    number="M-02"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <Menu items={grouped} width={224} />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="no icons — labels sit on the 8px edge, no gutter reserved"
                    label="Text only"
                    number="M-03"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "8px", padding: "28px" }}>
                        <div style={{ width: "192px" }}>
                            <DimensionRule label="width 192" />
                        </div>
                        <Menu items={textOnly} width={192} />
                    </div>
                </Specimen>

                <Specimen
                    detail="resting · disabled (0.4 alpha) · danger row"
                    label="States"
                    number="M-04"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <Menu items={states} width={200} />
                    </div>
                </Specimen>

                <Specimen
                    detail="trailing detail · cross on hover removes the row · long label yields"
                    label="Removable rows"
                    number="M-05"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <Menu items={removable} width={260} />
                    </div>
                </Specimen>

                <Specimen
                    detail="opened at the pointer · fixed to the window · clamps to the viewport edge · Escape or a click elsewhere closes"
                    label="Context menu at the pointer"
                    number="M-06"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <ContextMenuSpecimen />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
