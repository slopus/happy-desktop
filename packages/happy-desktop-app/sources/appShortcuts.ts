import { APP_SHELL_SIDEBAR_SHORTCUT, CLOSE_SHORTCUT, commandShortcut } from "happy-desktop-ui";

/**
 * The window's Command chords, in one place because two surfaces read them: the
 * dispatchers that run them, and the command palette, which shows the same cap
 * beside the row that does the same thing. A chord written down twice would
 * eventually promise one key and run another.
 */
export const APP_SHORTCUTS = {
    /** Opens the command palette. Closing it again is the palette's own key. */
    /**
     * Brings back the chat most recently closed in the open workspace, as a
     * browser reopens its last closed tab. It is what makes closing a chat
     * with the close chord something the reader can take back.
     */
    chatReopen: commandShortcut("t", { shift: true }),
    paletteOpen: commandShortcut("k"),
    panelToggle: commandShortcut("j"),
    panelToggleAlternate: commandShortcut("b", { alt: true }),
    sessionCreate: commandShortcut("t"),
    /**
     * Folds the window's sidebar away and brings it back. The shell binds it
     * itself; it is named here so the palette's row wears the shell's own cap.
     */
    sidebarToggle: APP_SHELL_SIDEBAR_SHORTCUT,
    /**
     * Closes what the reader is on: a tab, a view beside the chat, or a page.
     * It is the shared close chord, which an overlay answers before the window does.
     */
    tabClose: CLOSE_SHORTCUT,
    /** Opens the new-task surface on the active Happy Agent, as its Tasks heading's + does. */
    taskCreate: commandShortcut("n"),
} as const;
