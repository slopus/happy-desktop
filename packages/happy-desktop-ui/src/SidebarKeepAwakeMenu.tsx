import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";

/** When the computer is held out of system sleep. */
export type SidebarKeepAwakeMode = "on" | "agent" | "off";

export interface SidebarKeepAwakeMenuProps {
    /** The reader's selection. */
    mode: SidebarKeepAwakeMode;
    /** Whether the computer is being held awake right now, after resolving `agent`. */
    active: boolean;
    onModeSelect: (mode: SidebarKeepAwakeMode) => void;
    /** Opens the menu on the first render, for blueprint fixtures and tests. */
    defaultOpen?: boolean;
}

interface KeepAwakeOption {
    readonly mode: SidebarKeepAwakeMode;
    readonly label: string;
    readonly description: string;
}

const OPTIONS: readonly KeepAwakeOption[] = [
    { mode: "on", label: "On", description: "Keep this computer awake continuously" },
    { mode: "agent", label: "Agent", description: "Stay awake while an agent is working" },
    { mode: "off", label: "Off", description: "Allow normal system sleep behavior" },
];

function optionOf(mode: SidebarKeepAwakeMode): KeepAwakeOption {
    return OPTIONS.find((option) => option.mode === mode) ?? OPTIONS[2]!;
}

/**
 * What the control is doing, in the two words the header has room for. `Off`
 * needs no second word; the other modes say whether the machine is being held
 * right now, which for `agent` is the whole question.
 */
function stateLabel(mode: SidebarKeepAwakeMode, active: boolean): string {
    if (mode === "off") return "Off";
    return `${optionOf(mode).label} · ${active ? "Active" : "Idle"}`;
}

/**
 * C-285 SidebarKeepAwakeMenu — the footer's keep-awake control. A coffee cup
 * beside the appearance toggle opens a small menu above the footer with the
 * three ways the computer can be kept from sleeping: always, only while an
 * agent is working, or never. The header says which is chosen and whether the
 * machine is being held right now, so the answer to "why is my laptop still
 * on" is one click away and never needs the menu to be read.
 *
 * The glyph itself carries the live state — full ink while the machine is
 * held, the footer's quiet tint otherwise — so a reader who never opens the
 * menu still sees whether it is doing anything.
 */
export function SidebarKeepAwakeMenu(props: SidebarKeepAwakeMenuProps) {
    const [open, setOpen] = useState(props.defaultOpen ?? false);
    const root = useRef<HTMLDivElement>(null);
    const state = stateLabel(props.mode, props.active);
    const triggerLabel = `Keep computer awake: ${state}`;

    // The menu's commit is the exact lifetime boundary at which its rows exist,
    // so the chosen row takes focus without depending on React's microtask order.
    const menuRef = useCallback((node: HTMLDivElement | null): void => {
        node?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    }, []);

    const items = (): HTMLElement[] =>
        root.current
            ? [...root.current.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
            : [];

    const close = (returnFocus: boolean): void => {
        setOpen(false);
        if (returnFocus) root.current?.querySelector<HTMLElement>("button")?.focus();
    };

    // eslint-disable-next-line happy-react/no-layout-effect -- an open popover owns document-level outside-pointer and Escape listeners that are attached after commit and completely removed when it closes
    useLayoutEffect(() => {
        if (!open) return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) {
                setOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        document.addEventListener("keydown", closeOnEscape, true);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            document.removeEventListener("keydown", closeOnEscape, true);
        };
    }, [open]);

    return (
        <div
            className="happy-sidebar-keep-awake"
            data-active={props.active ? "" : undefined}
            data-happy-desktop-ui="sidebar-keep-awake-menu"
            data-mode={props.mode}
            data-open={open ? "" : undefined}
            onKeyDown={(event) => {
                if (!open) return;
                const rows = items();
                if (rows.length === 0) return;
                if (event.key === "Tab") {
                    close(false);
                    return;
                }
                if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    rows[event.key === "Home" ? 0 : rows.length - 1]?.focus();
                    return;
                }
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                const active = document.activeElement as HTMLElement | null;
                const at = active ? rows.indexOf(active) : -1;
                const step = event.key === "ArrowDown" ? 1 : -1;
                const next = at < 0 ? (step > 0 ? 0 : rows.length - 1) : at + step;
                rows[(next + rows.length) % rows.length]?.focus();
            }}
            ref={root}
        >
            <Button
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={triggerLabel}
                className="happy-sidebar-keep-awake__trigger"
                data-happy-desktop-ui="sidebar-keep-awake-menu-trigger"
                icon="coffee"
                iconOnly
                onClick={() => setOpen((current) => !current)}
                size="small"
                title={triggerLabel}
                variant="ghost"
            />
            {open ? (
                <div
                    aria-label="Keep computer awake"
                    className="happy-sidebar-keep-awake__menu"
                    data-happy-desktop-ui="sidebar-keep-awake-menu-popover"
                    ref={menuRef}
                    role="menu"
                >
                    <div
                        className="happy-sidebar-keep-awake__header"
                        data-happy-desktop-ui="sidebar-keep-awake-menu-header"
                    >
                        <span className="happy-sidebar-keep-awake__title">Keep computer awake</span>
                        <span
                            className="happy-sidebar-keep-awake__state"
                            data-happy-desktop-ui="sidebar-keep-awake-menu-state"
                        >
                            {state}
                        </span>
                    </div>
                    {OPTIONS.map((option) => {
                        const checked = option.mode === props.mode;
                        return (
                            <button
                                aria-checked={checked}
                                className="happy-sidebar-keep-awake__option"
                                data-happy-desktop-ui="sidebar-keep-awake-menu-option"
                                data-mode={option.mode}
                                key={option.mode}
                                onClick={() => {
                                    close(true);
                                    props.onModeSelect(option.mode);
                                }}
                                role="menuitemradio"
                                type="button"
                            >
                                <span
                                    aria-hidden="true"
                                    className="happy-sidebar-keep-awake__mark"
                                    data-happy-desktop-ui="sidebar-keep-awake-menu-mark"
                                />
                                <span className="happy-sidebar-keep-awake__copy">
                                    <span className="happy-sidebar-keep-awake__label">
                                        {option.label}
                                    </span>
                                    <span className="happy-sidebar-keep-awake__description">
                                        {option.description}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
