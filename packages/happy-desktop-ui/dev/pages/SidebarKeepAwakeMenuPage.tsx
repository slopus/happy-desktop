import { Sidebar } from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import { SidebarKeepAwakeMenu, type SidebarKeepAwakeMode } from "../../src/SidebarKeepAwakeMenu";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-285";

const STATES: readonly {
    readonly mode: SidebarKeepAwakeMode;
    readonly active: boolean;
    readonly label: string;
}[] = [
    { mode: "on", active: true, label: "On · Active" },
    { mode: "agent", active: true, label: "Agent · Active" },
    { mode: "agent", active: false, label: "Agent · Idle" },
    { mode: "off", active: false, label: "Off" },
];

export function SidebarKeepAwakeMenuPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The sidebar footer's keep-awake control. A coffee cup after the appearance toggle opens a three-way menu above the footer: keep the computer awake always, only while an agent is working, or never. The header carries the live state."
            title="Sidebar keep-awake menu"
        >
            <Specimen
                detail="28px ghost trigger after the appearance toggle · full ink while the machine is held awake · menu hangs from the footer's right gutter"
                label="Sidebar footer"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "16px" }}>
                        {[
                            { active: true, label: "held awake" },
                            { active: false, label: "idle" },
                        ].map((state) => (
                            <div
                                key={state.label}
                                style={{ border: "1px solid var(--divider)", width: "280px" }}
                            >
                                <Sidebar
                                    activeItemId=""
                                    footer={
                                        <SidebarFooter
                                            appearance="light"
                                            keepAwake={{
                                                active: state.active,
                                                mode: "agent",
                                                onModeSelect: () => {},
                                            }}
                                            onAppearanceToggle={() => {}}
                                            onSettingsOpen={() => {}}
                                        />
                                    }
                                    onItemSelect={() => {}}
                                    sections={[]}
                                    title="Happy"
                                />
                            </div>
                        ))}
                    </div>
                    <DimensionRule label="sidebar footer · trigger 28 px · full ink while active, ghost tint while idle" />
                </div>
            </Specimen>

            <Specimen
                detail="32px header with the live state · three 48px radio rows of a 14px label over a 12px description · 6px dot in the chosen row's 16px slot"
                label="Menu states"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    {STATES.map((state) => (
                        <div
                            key={state.label}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                width: "320px",
                            }}
                        >
                            {/* The menu hangs above its footer row, so the row
                                is given the room above it that the sidebar
                                would have. */}
                            <div style={{ paddingTop: "200px" }}>
                                <div
                                    className="happy-sidebar-footer"
                                    style={{ display: "flex", justifyContent: "flex-end" }}
                                >
                                    <SidebarKeepAwakeMenu
                                        active={state.active}
                                        defaultOpen
                                        mode={state.mode}
                                        onModeSelect={() => {}}
                                    />
                                </div>
                            </div>
                            <DimensionRule label={`${state.label} · menu 320 px wide`} />
                        </div>
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
