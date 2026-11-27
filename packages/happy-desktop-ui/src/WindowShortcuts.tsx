import { useEffectEvent, useLayoutEffect } from "react";
import {
    commandShortcutMatches,
    windowShortcutBlocked,
    type CommandShortcut,
} from "./keyboardShortcut";

export interface WindowShortcutAction {
    readonly run: () => void;
    readonly shortcut: CommandShortcut;
}

/**
 * One lifecycle-owned dispatcher for context-sensitive window commands. The
 * caller supplies only commands that are currently actionable.
 */
export function WindowShortcuts(props: { readonly actions: readonly WindowShortcutAction[] }) {
    const shortcutRun = useEffectEvent((event: KeyboardEvent) => {
        const action = props.actions.find((candidate) =>
            commandShortcutMatches(event, candidate.shortcut),
        );
        if (!action || windowShortcutBlocked()) return;
        event.preventDefault();
        action.run();
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- a window command must work regardless of which descendant owns focus
    useLayoutEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => shortcutRun(event);
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
    return null;
}

/**
 * Escape as the way out of a page that takes the whole window, such as
 * Settings. It answers last: anything nearer the focus that handles Escape —
 * a menu, a dialog, a popover, a field being typed in — keeps it, so the key
 * only leaves the page when nothing on it wanted the key for itself.
 */
export function WindowEscape(props: { readonly onEscape: () => void }) {
    const escapeRun = useEffectEvent((event: KeyboardEvent) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        const target = event.target instanceof Element ? event.target : null;
        if (
            target?.closest(
                "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
            )
        )
            return;
        if (windowShortcutBlocked()) return;
        event.preventDefault();
        props.onEscape();
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- the page's way out must work wherever focus is, including on the document body
    useLayoutEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => escapeRun(event);
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
    return null;
}
