import { Sidebar } from "../../src/Sidebar";
import { SidebarBugReport } from "../../src/SidebarBugReport";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-341";

const LINKS = {
    discordUrl: "https://discord.gg/fX9WBAhyfD",
    onLinkOpen: () => undefined,
    xPostUrl: "https://x.com/intent/post?text=%40happy__eng",
} as const;

const STATES = [
    { label: "light", mode: "light", unavailable: undefined },
    { label: "dark", mode: "dark", unavailable: undefined },
    {
        label: "no Happy Agent",
        mode: "light",
        unavailable: "Connect a Happy Agent to report from here.",
    },
] as const;

export function SidebarBugReportPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The bug glyph in the sidebar footer, just before the theme menu, and the card it opens above the footer where a Happy Agent update's card stands: the crow, one button that starts a new task with the bug-report template as its unsent first message, and links to X and Discord."
            title="Sidebar bug report"
        >
            <Specimen
                detail="28px ghost trigger, pressed while open · card as wide as the footer row, 8px above the divider · crow 56px · one secondary button, visible on both appearances"
                label="Open card"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {STATES.map((state) => (
                        <div
                            data-sidebar-bug-report-state={state.label}
                            key={state.label}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <ThemeScope mode={state.mode}>
                                <div
                                    style={{
                                        border: "1px solid var(--divider)",
                                        display: "flex",
                                        height: "360px",
                                        overflow: "hidden",
                                        width: "280px",
                                    }}
                                >
                                    <Sidebar
                                        activeItemId=""
                                        footer={
                                            <SidebarFooter
                                                bugReport={
                                                    <SidebarBugReport
                                                        {...LINKS}
                                                        defaultOpen
                                                        onReport={() => Promise.resolve()}
                                                        {...(state.unavailable === undefined
                                                            ? {}
                                                            : {
                                                                  reportUnavailable:
                                                                      state.unavailable,
                                                              })}
                                                    />
                                                }
                                                onSettingsOpen={() => {}}
                                                theme={{
                                                    appearance: state.mode,
                                                    mode: state.mode,
                                                    onModeSelect: () => {},
                                                }}
                                            />
                                        }
                                        onItemSelect={() => {}}
                                        sections={[]}
                                        style={{ width: "100%" }}
                                        title="Happy"
                                    />
                                </div>
                            </ThemeScope>
                            <DimensionRule label={state.label} />
                        </div>
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
