import { commandShortcut } from "../../src/keyboardShortcut";
import { QuickActionsCard, type QuickActionsCardItem } from "../../src/QuickActionsCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-274";

const items: QuickActionsCardItem[] = [
    { id: "update", emphasis: "update", title: "Update Happy" },
    { id: "chat-new", icon: "plus", shortcut: commandShortcut("t"), title: "New chat" },
    {
        id: "workspace-new",
        icon: "branch",
        shortcut: commandShortcut("n", { shift: true }),
        title: "New workspace",
    },
    { id: "tab-close", icon: "close", shortcut: commandShortcut("w"), title: "Close tab" },
    {
        id: "panel-toggle",
        icon: "panel-collapse",
        shortcut: commandShortcut("j"),
        title: "Toggle panel",
    },
    {
        id: "sidebar-toggle",
        icon: "sidebar-collapse",
        shortcut: commandShortcut("b"),
        title: "Toggle sidebar",
    },
    { id: "settings-open", icon: "settings", title: "Open settings" },
];

/*
 * The window this card is drawn over, at the Electron minimum. The gutter is
 * the same declaration AppShell's hint lane and ModalOverlay's `top` placement
 * both use, restated here only so the fixture can show the real placement
 * without holding Command for 500ms.
 */
const WINDOW_WIDTH = 720;
const WINDOW_HEIGHT = 640;

export function QuickActionsCardPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="What holding Command puts in the middle of the window: the palette's own card frame over six glanceable rows wearing their chords — a waiting update wearing the sidebar's own orange mark — and a footer saying ⌘K opens the rest. aria-hidden and pointer-transparent: anything modal here would switch off the gesture that shows it."
            title="Quick actions card"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="a waiting update over five chorded rows and the footer hint · 640px palette frame, content height"
                    label="Held Command"
                    number="QA-01"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="640px wide · 44px rows · 8px inset · 44px footer" />
                        <QuickActionsCard items={items.slice(0, 6)} />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="three rows · the card is as tall as what it has to say"
                    label="Short list"
                    number="QA-02"
                    stage="app"
                >
                    <QuickActionsCard footerLabel="Everything else" items={items.slice(0, 3)} />
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="720 × 640 Electron minimum · the ModalOverlay top gutter the palette will occupy"
                    label="Window placement"
                    number="QA-03"
                    stage="chrome"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="min(128px, max(24px, 100cqh − 485px)) top gutter · 24px sides" />
                        <div
                            style={{
                                containerType: "size",
                                display: "flex",
                                height: `${WINDOW_HEIGHT}px`,
                                width: `${WINDOW_WIDTH}px`,
                            }}
                        >
                            <div
                                style={{
                                    alignItems: "flex-start",
                                    boxSizing: "border-box",
                                    display: "flex",
                                    height: "100%",
                                    justifyContent: "center",
                                    paddingBottom: "24px",
                                    paddingLeft: "24px",
                                    paddingRight: "24px",
                                    paddingTop: "min(128px, max(24px, calc(100cqh - 485px)))",
                                    width: "100%",
                                }}
                            >
                                <QuickActionsCard items={items.slice(0, 4)} />
                            </div>
                        </div>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
