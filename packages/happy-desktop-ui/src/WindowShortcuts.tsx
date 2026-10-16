import { useContext, useEffectEvent, useLayoutEffect } from "react";
import { ChatPaneFocusContext } from "./ChatPaneFocus";
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
    const paneActive = useContext(ChatPaneFocusContext);
    const shortcutRun = useEffectEvent((event: KeyboardEvent) => {
        const action = props.actions.find((candidate) =>
            commandShortcutMatches(event, candidate.shortcut),
        );
        if (!paneActive || !action || windowShortcutBlocked()) return;
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
