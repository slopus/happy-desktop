import { MenuButton } from "./MenuButton";
import type { MenuItem } from "./Menu";

/** When the computer is held out of system sleep. */
export type SidebarKeepAwakeMode = "on" | "agent" | "off";

export interface SidebarKeepAwakeMenuProps {
    /** The reader's selection. */
    mode: SidebarKeepAwakeMode;
    /** Whether the computer is being held awake right now, after resolving `agent`. */
    active: boolean;
    onModeSelect: (mode: SidebarKeepAwakeMode) => void;
}

interface KeepAwakeOption {
    readonly mode: SidebarKeepAwakeMode;
    readonly label: string;
}

const OPTIONS: readonly KeepAwakeOption[] = [
    { mode: "on", label: "Always" },
    { mode: "agent", label: "While an agent is working" },
    { mode: "off", label: "Never" },
];

function isMode(value: string): value is SidebarKeepAwakeMode {
    return OPTIONS.some((option) => option.mode === value);
}

/**
 * What the control is doing, in the few words a heading has room for. `Off`
 * needs no second word; the other modes say whether the machine is being held
 * right now, which for `agent` is the whole question.
 */
export function sidebarKeepAwakeState(mode: SidebarKeepAwakeMode, active: boolean): string {
    if (mode === "off") return "Off";
    return `${mode === "on" ? "On" : "Agent"} · ${active ? "Active" : "Idle"}`;
}

/** The menu's heading: what it is for, and what it is doing now. */
export function sidebarKeepAwakeLabel(mode: SidebarKeepAwakeMode, active: boolean): string {
    return `Keep computer awake — ${sidebarKeepAwakeState(mode, active)}`;
}

/**
 * The three ways the computer can be kept from sleeping, as menu rows. The
 * chosen one carries the check; the gutter the check sits in is reserved on
 * every row, so the labels stay aligned whichever is chosen.
 */
export function sidebarKeepAwakeItems(mode: SidebarKeepAwakeMode): MenuItem[] {
    return OPTIONS.map((option) => ({
        kind: "item",
        id: option.mode,
        label: option.label,
        ...(option.mode === mode ? { icon: "check" as const } : {}),
    }));
}

/**
 * C-285 SidebarKeepAwakeMenu — the footer's keep-awake control. A coffee cup
 * beside the appearance toggle opens the house menu above the footer with the
 * three ways the computer can be kept from sleeping: always, only while an
 * agent is working, or never. The heading says which is chosen and whether
 * the machine is being held right now, so the answer to "why is my laptop
 * still on" is one click away and never needs the rows to be read.
 *
 * The glyph itself carries the live state — full ink while the machine is
 * held, the footer's quiet tint otherwise — so a reader who never opens the
 * menu still sees whether it is doing anything.
 *
 * The card hangs off the window's overlay lane rather than off the footer:
 * the sidebar can be narrower than the card, and a popover drawn inside it
 * was clipped at the sidebar's edge or pushed off the window.
 */
export function SidebarKeepAwakeMenu(props: SidebarKeepAwakeMenuProps) {
    const state = sidebarKeepAwakeState(props.mode, props.active);
    return (
        <span
            className="happy-sidebar-keep-awake"
            data-active={props.active ? "" : undefined}
            data-happy-desktop-ui="sidebar-keep-awake-menu"
            data-mode={props.mode}
        >
            <MenuButton
                align="end"
                data-testid="sidebar-keep-awake-menu"
                icon="coffee"
                items={sidebarKeepAwakeItems(props.mode)}
                label={`Keep computer awake: ${state}`}
                menuLabel={sidebarKeepAwakeLabel(props.mode, props.active)}
                menuWidth={260}
                onSelect={(id) => {
                    if (isMode(id)) props.onModeSelect(id);
                }}
                overlay
                placement="above"
            />
        </span>
    );
}
