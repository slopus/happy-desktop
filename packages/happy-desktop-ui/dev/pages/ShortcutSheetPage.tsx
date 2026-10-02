import { commandShortcut } from "../../src/keyboardShortcut";
import { ShortcutSheet, type ShortcutSheetSection } from "../../src/ShortcutSheet";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-284";

const sections: ShortcutSheetSection[] = [
    {
        id: "window",
        title: "Window",
        items: [
            { id: "palette", title: "Command palette", shortcut: commandShortcut("k") },
            { id: "shortcuts", title: "Keyboard shortcuts", shortcut: commandShortcut("/") },
            { id: "panel", title: "Show or hide the side panel", shortcut: commandShortcut("j") },
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
            { id: "chat-new", title: "New chat", shortcut: commandShortcut("t") },
            { id: "tab-close", title: "Close tab", shortcut: commandShortcut("w") },
            {
                id: "tab-reopen",
                title: "Reopen closed tab",
                shortcut: commandShortcut("t", { shift: true }),
            },
            { id: "tab-next", title: "Next tab", shortcut: commandShortcut("]", { shift: true }) },
            {
                id: "tab-to-panel",
                title: "Move tab to the side panel",
                shortcut: commandShortcut("ArrowRight", { alt: true }),
            },
        ],
    },
    {
        id: "files",
        title: "Files",
        items: [{ id: "file-save", title: "Save file", shortcut: commandShortcut("s") }],
    },
];

export function ShortcutSheetPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Every chord the window answers, in one Modal: sections of reading rows, each a title with its cap at the trailing edge."
            title="Shortcut sheet"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="large Modal · 32px rows · caps in one trailing column · Cmd-/ closes it again"
                    label="Sheet"
                    number="S-01"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <ShortcutSheet onClose={() => {}} sections={sections} />
                        <DimensionRule label="row 32 · pad 0 10 · gap 12 · section gap 20 · heading caption 11/16" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
