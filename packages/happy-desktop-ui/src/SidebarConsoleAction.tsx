import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** Where one watched console entry came from, as the watcher observed it. */
export type ConsoleWatchSource = "console" | "uncaught" | "rejection" | "request" | "resource";

/** One error or warning the renderer saw; repeats of the newest entry fold into `count`. */
export interface ConsoleWatchEntry {
    readonly id: number;
    readonly level: "error" | "warning";
    readonly source: ConsoleWatchSource;
    readonly text: string;
    /** How many times in a row this same entry arrived. */
    readonly count: number;
}

/** What the watcher holds: the setting, the totals since the last clear, and the newest entries. */
export interface ConsoleWatchSnapshot {
    readonly enabled: boolean;
    readonly errorCount: number;
    readonly warningCount: number;
    /** Newest first, capped by the watcher. */
    readonly entries: readonly ConsoleWatchEntry[];
}

/**
 * A lifecycle-bound source for renderer console diagnostics, offered only by
 * builds that are not production. It observes nothing while disabled.
 */
export interface ConsoleWatchStore {
    get(): ConsoleWatchSnapshot;
    subscribe(listener: () => void): () => void;
    enabledUpdate(enabled: boolean): void;
    entriesClear(): void;
}

const consoleWatchDisabled: ConsoleWatchSnapshot = {
    enabled: false,
    entries: [],
    errorCount: 0,
    warningCount: 0,
};

/** The source a build without the console mark renders from: off, and it stays off. */
export const consoleWatchStoreNoop: ConsoleWatchStore = {
    enabledUpdate: () => undefined,
    entriesClear: () => undefined,
    get: () => consoleWatchDisabled,
    subscribe: () => () => undefined,
};

export interface SidebarConsoleActionProps {
    readonly errorCount: number;
    readonly warningCount: number;
    /** Newest first. */
    readonly entries: readonly ConsoleWatchEntry[];
    readonly onClear: () => void;
    readonly defaultOpen?: boolean;
}

const SOURCE_LABELS: Record<ConsoleWatchSource, string> = {
    console: "Console",
    rejection: "Unhandled rejection",
    request: "Request",
    resource: "Resource",
    uncaught: "Uncaught",
};

function countLabel(errors: number, warnings: number): string {
    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} ${errors === 1 ? "error" : "errors"}`);
    if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`);
    return parts.join(", ");
}

/**
 * SidebarConsoleAction — a preview-build footer mark that says how many errors
 * and warnings reached the console, and lists the newest in the footer marks'
 * card. It is absent while the console is clean, so the mark itself is the
 * signal that something seeped through.
 */
export function SidebarConsoleAction(props: SidebarConsoleActionProps) {
    const [open, setOpen] = useState(props.defaultOpen ?? false);
    const root = useRef<HTMLDivElement>(null);
    const total = props.errorCount + props.warningCount;
    // eslint-disable-next-line happy-react/no-layout-effect -- the open popover owns document-level outside-pointer and Escape listeners, with complete cleanup
    useLayoutEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target))
                setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("keydown", escape, true);
        return () => {
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("keydown", escape, true);
        };
    }, [open]);

    if (total === 0) return null;
    const label = countLabel(props.errorCount, props.warningCount);
    return (
        <div
            className="happy-sidebar-update happy-sidebar-console-action"
            data-happy-desktop-ui="sidebar-console-action"
            data-level={props.errorCount > 0 ? "error" : "warning"}
            data-open={open ? "" : undefined}
            ref={root}
        >
            <button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={`Console — ${label}`}
                aria-pressed={open}
                className="happy-sidebar-update__trigger happy-sidebar-console-action__trigger"
                onClick={() => setOpen((current) => !current)}
                type="button"
            >
                <Ionicon name="terminal-outline" size={16} />
                <span className="happy-sidebar-console-action__count">
                    {total > 999 ? "999+" : total}
                </span>
            </button>
            {open ? (
                <div
                    aria-label="Console errors and warnings"
                    className="happy-sidebar-update__panel happy-sidebar-console-action__panel"
                    role="dialog"
                >
                    <div className="happy-sidebar-console-action__head">
                        <span className="happy-sidebar-update__state">{label}</span>
                        <Button onClick={props.onClear} size="small" variant="secondary">
                            Clear
                        </Button>
                    </div>
                    <ol className="happy-sidebar-console-action__list">
                        {props.entries.map((entry) => (
                            <li
                                className="happy-sidebar-console-action__entry"
                                data-level={entry.level}
                                key={entry.id}
                            >
                                <span className="happy-sidebar-console-action__source">
                                    {SOURCE_LABELS[entry.source]}
                                    {entry.count > 1 ? ` × ${entry.count}` : ""}
                                </span>
                                <span className="happy-sidebar-console-action__text">
                                    {entry.text}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : null}
        </div>
    );
}
