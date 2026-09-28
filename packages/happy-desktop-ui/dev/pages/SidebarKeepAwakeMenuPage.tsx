import { Menu } from "../../src/Menu";
import { Sidebar } from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import {
    sidebarKeepAwakeItems,
    sidebarKeepAwakeLabel,
    type SidebarKeepAwakeMode,
} from "../../src/SidebarKeepAwakeMenu";
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
            summary="The sidebar footer's keep-awake control. A coffee cup after the appearance toggle opens the house menu above the footer: keep the computer awake always, only while an agent is working, or never. The heading carries the live state, and the card is drawn in the window's overlay lane so a narrow sidebar cannot clip it."
            title="Sidebar keep-awake menu"
        >
            <Specimen
                detail="28px ghost trigger after the appearance toggle · full ink while the machine is held awake · click the cup to open the menu, which hangs in the overlay lane and is pushed back inside the window when the sidebar is narrow"
                label="Sidebar footer"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
                        {[
                            { active: true, label: "held awake", width: 280 },
                            { active: false, label: "idle", width: 280 },
                            { active: false, label: "narrow sidebar", width: 150 },
                        ].map((state) => (
                            <div
                                key={state.label}
                                style={{
                                    border: "1px solid var(--divider)",
                                    width: `${String(state.width)}px`,
                                    overflow: "hidden",
                                }}
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
                    <DimensionRule label="sidebar footer · trigger 28 px · full ink while active, ghost tint while idle · 150 px sidebar clips nothing" />
                </div>
            </Specimen>

            <Specimen
                detail="the house menu, 260 px wide · heading with the live state · three 28px rows · check in the chosen row's 16px gutter"
                label="Menu states"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
                    {STATES.map((state) => (
                        <div
                            key={state.label}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Menu
                                items={sidebarKeepAwakeItems(state.mode)}
                                label={sidebarKeepAwakeLabel(state.mode, state.active)}
                                width={260}
                            />
                            <DimensionRule label={`${state.label} · menu 260 px wide`} />
                        </div>
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
