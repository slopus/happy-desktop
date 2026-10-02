import { commandShortcut, type ShortcutSheetSection } from "happy-desktop-ui";

/**
 * The window's Command chords, in one place because two surfaces read them: the
 * dispatchers that run them, and the command palette, which shows the same cap
 * beside the row that does the same thing. A chord written down twice would
 * eventually promise one key and run another.
 */
export const APP_SHORTCUTS = {
    /** Opens the command palette. Closing it again is the palette's own key. */
    paletteOpen: commandShortcut("k"),
    panelToggle: commandShortcut("j"),
    panelToggleAlternate: commandShortcut("b", { alt: true }),
    sessionCreate: commandShortcut("t"),
    tabClose: commandShortcut("w"),
    /**
     * The neighbouring tab in whichever strip the keyboard is in, the way a
     * browser steps through its tabs. Command-number is already the sidebar's,
     * jumping between projects, so the strip takes the bracket chords instead.
     */
    tabNext: commandShortcut("]", { shift: true }),
    tabPrevious: commandShortcut("[", { shift: true }),
    /** Brings back the tab closed most recently, the way a browser's does. */
    tabReopen: commandShortcut("t", { shift: true }),
    /**
     * Every tab of the open workspace's strip, the way its context menu offers.
     * Option-Command-W is what macOS itself means by "Close All"; Shift-W was
     * found bound elsewhere on a reader's machine before the window saw it.
     */
    tabsCloseAll: commandShortcut("w", { alt: true }),
    /**
     * The active tab to the other side of the window, from anywhere. The arrow
     * points at the destination, as it does on a focused tab with Option alone;
     * Command makes it a window chord so it works while the composer or a
     * terminal holds the keyboard.
     */
    tabMoveToPanel: commandShortcut("ArrowRight", { alt: true }),
    tabMoveToMain: commandShortcut("ArrowLeft", { alt: true }),
    /** The sheet listing every chord, since the held-Command card shows only a few. */
    shortcutsShow: commandShortcut("/"),
    workspaceCreate: commandShortcut("n"),
} as const;

/**
 * Every chord the window answers, for the sheet. Chords owned by one component
 * rather than the window — the sidebar's numbers, the editor's save, the
 * shell's history keys — are stated here as well, because the sheet exists to
 * answer "what can I press" in one place.
 */
export const APP_SHORTCUT_SECTIONS: readonly ShortcutSheetSection[] = [
    {
        id: "window",
        title: "Window",
        items: [
            { id: "palette", title: "Command palette", shortcut: APP_SHORTCUTS.paletteOpen },
            { id: "shortcuts", title: "Keyboard shortcuts", shortcut: APP_SHORTCUTS.shortcutsShow },
            {
                id: "panel",
                title: "Show or hide the side panel",
                shortcut: APP_SHORTCUTS.panelToggle,
            },
            { id: "sidebar", title: "Show or hide the sidebar", shortcut: commandShortcut("b") },
            { id: "back", title: "Back", shortcut: commandShortcut("[") },
            { id: "forward", title: "Forward", shortcut: commandShortcut("]") },
            {
                id: "project",
                title: "Jump to a project by number",
                shortcut: { aria: "Meta+1 through Meta+9", caps: "⌘1–9" },
            },
        ],
    },
    {
        id: "tabs",
        title: "Tabs",
        items: [
            { id: "chat-new", title: "New chat", shortcut: APP_SHORTCUTS.sessionCreate },
            {
                id: "workspace-new",
                title: "New workspace",
                shortcut: APP_SHORTCUTS.workspaceCreate,
            },
            { id: "tab-close", title: "Close tab", shortcut: APP_SHORTCUTS.tabClose },
            { id: "tabs-close-all", title: "Close all tabs", shortcut: APP_SHORTCUTS.tabsCloseAll },
            { id: "tab-reopen", title: "Reopen closed tab", shortcut: APP_SHORTCUTS.tabReopen },
            { id: "tab-next", title: "Next tab", shortcut: APP_SHORTCUTS.tabNext },
            { id: "tab-previous", title: "Previous tab", shortcut: APP_SHORTCUTS.tabPrevious },
            {
                id: "tab-to-panel",
                title: "Move tab to the side panel",
                shortcut: APP_SHORTCUTS.tabMoveToPanel,
            },
            {
                id: "tab-to-main",
                title: "Move tab to the main content",
                shortcut: APP_SHORTCUTS.tabMoveToMain,
            },
        ],
    },
    {
        id: "files",
        title: "Files",
        items: [{ id: "file-save", title: "Save file", shortcut: commandShortcut("s") }],
    },
];
