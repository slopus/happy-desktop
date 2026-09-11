import { type ReactNode } from "react";
import { AppShell } from "../../src/AppShell";
import { Button } from "../../src/Button";
import { Sidebar } from "../../src/Sidebar";
import { commandShortcut } from "../../src/keyboardShortcut";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-010";
const panelShortcut = commandShortcut("b", { alt: true });
/*
 * Slot placeholders: the shell composes TitleBar, Rail, Sidebar, and content
 * built elsewhere, so the blueprint marks each region with a dashed slot and
 * its contract dimension instead of duplicating those components.
 */
function Slot(props: { height?: string; label: string; note?: string; width?: string }) {
    return (
        <div
            style={{
                alignItems: "center",
                borderRadius: "6px",
                boxSizing: "border-box",
                color: "var(--input-placeholder)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                height: props.height ?? "100%",
                justifyContent: "center",
                margin: "6px",
                outline: "1px dashed var(--surface-selected)",
                outlineOffset: "-6px",
                width: props.width ?? "auto",
            }}
        >
            <span
                style={{
                    color: "var(--text-secondary)",
                    font: "700 11px var(--happy-font-mono)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                }}
            >
                {props.label}
            </span>
            {props.note ? (
                <span style={{ font: "500 10px var(--happy-font-mono)", letterSpacing: "0.04em" }}>
                    {props.note}
                </span>
            ) : null}
        </div>
    );
}
const titleBarSlot = () => (
    <div style={{ boxSizing: "border-box", height: "38px", display: "flex" }}>
        <Slot height="auto" label="titleBar" note="38px" width="100%" />
    </div>
);
const railSlot = () => <Slot label="rail" note="76px" width="76px" />;
const sidebarSlot = () => <Slot label="sidebar" note="288px" width="288px" />;
function window1024(children: ReactNode) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "1024px" }}>
            <div style={{ height: "704px", width: "1024px" }}>{children}</div>
            <DimensionRule label="1024px × 704px — a representative window" />
        </div>
    );
}

/*
 * The narrowest window the shell admits: Happy's 720px desktop minimum leaves
 * a 140px workspace after the 64px rail and two 250px side lanes.
 */
const LANE_MIN = 250;
const WORKSPACE_MIN = 140;
const WINDOW_MIN = 64 + LANE_MIN * 2 + WORKSPACE_MIN;

function windowAtMinimum(children: ReactNode) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                width: `${String(WINDOW_MIN)}px`,
            }}
        >
            <div style={{ height: "480px", width: `${String(WINDOW_MIN)}px` }}>{children}</div>
            <DimensionRule
                label={`${String(WINDOW_MIN)}px × 480px — 64 rail + ${String(LANE_MIN)} + ${String(WORKSPACE_MIN)} + ${String(LANE_MIN)}`}
            />
        </div>
    );
}

function shortcutShell(revealed: boolean) {
    return window1024(
        <div
            data-shortcut-hints={revealed ? "" : undefined}
            style={{ display: "flex", height: "100%", width: "100%" }}
        >
            <AppShell
                shortcutHints="display"
                sidebar={<Slot label="sidebar" note="resizable · 288px" />}
                sidebarCollapsible
                titleBar={titleBarSlot()}
            >
                <div
                    style={{
                        alignItems: "flex-start",
                        display: "flex",
                        height: "100%",
                        justifyContent: "flex-end",
                        padding: "14px 20px",
                    }}
                >
                    <Button
                        aria-label="Show panel"
                        icon="panel-expand"
                        iconOnly
                        shortcut={panelShortcut}
                        size="small"
                        variant="ghost"
                    />
                </div>
            </AppShell>
        </div>,
    );
}

export function AppShellPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Window composition: chrome base, 38px title bar row, rail | main card with no top/left inset, an 8px right/bottom inset, a macOS-matched 8px radius, and a darker sidebar lane separated by an inset hairline."
            title="AppShell"
        >
            <Specimen
                detail="rail 76px · no top/left inset · 8px right/bottom + panel gap · radius 8px · darker sidebar + inset separator share the card with workspace"
                label="Full composition with panel"
                number="01"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={<Slot label="panel" note="340px · agent desk" />}
                        rail={railSlot()}
                        sidebar={sidebarSlot()}
                        titleBar={titleBarSlot()}
                    >
                        <Slot
                            label="children"
                            note="main workspace · --colors-groupped-background"
                        />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="no panel — sidebar and workspace share one card, flush to rail/title with 8px right/bottom clearance"
                label="Rail + sidebar, no panel"
                number="02"
                stage="chrome"
            >
                {window1024(
                    <AppShell rail={railSlot()} sidebar={sidebarSlot()} titleBar={titleBarSlot()}>
                        <Slot label="children" note="workspace beside the 288px sidebar" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="sidebar omitted · panelWidth 300 — the panel keeps its explicit width, the main card takes the rest"
                label="Rail only, custom panel width"
                number="03"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={<Slot label="panel" note="panelWidth 300" />}
                        panelWidth={300}
                        rail={railSlot()}
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="main workspace" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="sidebarCollapsible + panelResizable: an 8px drag separator (role=separator) sits on each inner edge, and the sidebar carries a collapse control"
                label="Resizable sidebar + inspector"
                number="04"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={<Slot label="panel" note="resizable · 340px" />}
                        panelResizable
                        rail={railSlot()}
                        sidebar={<Slot label="sidebar" note="resizable · 288px" />}
                        sidebarCollapsible
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="main workspace" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="collapsed sidebar: the sidebar DOM stays mounted but hidden, replaced by a 48px reveal lane whose button restores it"
                label="Sidebar collapsed"
                number="05"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        rail={railSlot()}
                        sidebar={<Slot label="sidebar" note="hidden while collapsed" />}
                        sidebarCollapsible
                        sidebarDefaultCollapsed
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="workspace spans the freed space" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="The collapse control keeps its header lane when Bots is first, leaving the section's create action clear. A leading Create row can share the compact fullscreen lane."
                label="Fullscreen sidebar actions"
                number="05b"
                stage="chrome"
            >
                {[false, true].map((compose) => (
                    <div key={String(compose)}>
                        {window1024(
                            <AppShell
                                connectionRail
                                rail={railSlot()}
                                sidebar={
                                    <Sidebar
                                        activeItemId=""
                                        onCompose={compose ? () => {} : undefined}
                                        onItemSelect={() => {}}
                                        onSectionAction={() => {}}
                                        sections={[
                                            {
                                                action: { icon: "plus", label: "Create bot" },
                                                id: "bots",
                                                label: "Bots",
                                                items: [
                                                    {
                                                        id: "chief-of-staff",
                                                        kind: "agent",
                                                        label: "Chief of Staff",
                                                        icon: "chat",
                                                    },
                                                ],
                                            },
                                        ]}
                                    />
                                }
                                sidebarCollapsible
                                windowControls
                                windowFullScreen
                            >
                                <Slot label="workspace" />
                            </AppShell>,
                        )}
                    </div>
                ))}
            </Specimen>

            <Specimen
                detail="trace + input: the panel body (live trace) fills the column while a panelFooter keeps the composer pinned at the bottom; the panel body identity is unaffected as the footer mounts"
                label="Trace with composer footer"
                number="06"
                stage="chrome"
            >
                {window1024(
                    <AppShell
                        panel={
                            <Slot label="panel body" note="AgentTracePanel · ongoing inference" />
                        }
                        panelFooter={
                            <div
                                style={{ boxSizing: "border-box", height: "96px", display: "flex" }}
                            >
                                <Slot
                                    height="auto"
                                    label="panelFooter"
                                    note="composer dock"
                                    width="100%"
                                />
                            </div>
                        }
                        panelResizable
                        rail={railSlot()}
                        sidebar={<Slot label="sidebar" note="resizable · 288px" />}
                        sidebarCollapsible
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note="main workspace" />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="default state: shortcut KeyCaps stay in the DOM but paint nothing and leave both 28px controls unchanged"
                label="Command shortcuts · rest"
                number="07"
                stage="chrome"
            >
                {shortcutShell(false)}
            </Specimen>

            <Specimen
                detail="deterministic held-Command state after the 500ms discovery delay: the sidebar toggle and descendant panel control reveal out-of-flow KeyCaps without changing either hit box"
                label="Command shortcuts · held"
                number="08"
                stage="chrome"
            >
                {shortcutShell(true)}
            </Specimen>

            <Specimen
                detail="Happy's 720×480 desktop minimum. The two side lanes shrink to their 250px floors and the workspace keeps the remaining 140px after the 64px rail. Drag the blueprint narrower and the shell stops here and the page scrolls instead, matching the native window contract."
                label="Every lane at its minimum"
                number="10"
                stage="chrome"
            >
                {windowAtMinimum(
                    <AppShell
                        panel={
                            <Slot
                                label="panel"
                                note={`shrunk to its ${String(LANE_MIN)}px floor`}
                            />
                        }
                        rail={railSlot()}
                        sidebar={
                            <Slot
                                label="sidebar"
                                note={`shrunk to its ${String(LANE_MIN)}px floor`}
                            />
                        }
                        titleBar={titleBarSlot()}
                    >
                        <Slot
                            label="children"
                            note={`holding the remaining ${String(WORKSPACE_MIN)}px`}
                        />
                    </AppShell>,
                )}
            </Specimen>

            <Specimen
                detail="Both lanes resizable in the narrowest window, which is where a lane's own cap stops being the whole answer. Drag either handle outward: it stops as soon as the workspace is down to its floor, because a lane is bounded by the room the rail, the lane opposite, and that floor leave it — not by the window alone. Two lanes each inside their own cap could otherwise ask for more than the window had between them, and since the content region clips, the far lane was cut off by the window edge rather than the middle refusing to give."
                label="Neither lane may take the middle's floor"
                number="11"
                stage="chrome"
            >
                {windowAtMinimum(
                    <AppShell
                        panel={<Slot label="panel" note="resizable · capped by what is left" />}
                        panelResizable
                        rail={railSlot()}
                        sidebar={<Slot label="sidebar" note="resizable · capped by what is left" />}
                        sidebarCollapsible
                        titleBar={titleBarSlot()}
                    >
                        <Slot label="children" note={`never below ${String(WORKSPACE_MIN)}px`} />
                    </AppShell>,
                )}
            </Specimen>
        </ComponentPage>
    );
}
