import { Sidebar } from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import { SidebarSetupAction } from "../../src/SidebarSetupAction";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-355";
const noop = () => undefined;

function SetupSidebar(props: { readonly mode: "light" | "dark"; readonly open: boolean }) {
    return (
        <ThemeScope mode={props.mode}>
            <div style={{ display: "flex", flexDirection: "column", width: 288, height: 320 }}>
                <Sidebar
                    activeItemId=""
                    footer={
                        <SidebarFooter
                            actions={
                                <SidebarSetupAction
                                    defaultOpen={props.open}
                                    location="Acme"
                                    onResume={noop}
                                    stepsLeft={3}
                                />
                            }
                            onSettingsOpen={noop}
                            theme={{ mode: props.mode, appearance: props.mode, onModeSelect: noop }}
                        />
                    }
                    onItemSelect={noop}
                    sections={[]}
                    style={{ height: "100%", width: "100%" }}
                    title="Acme"
                />
            </div>
        </ThemeScope>
    );
}

export function SidebarSetupActionPage() {
    const modes = ["light", "dark"] as const;
    return (
        <ComponentPage
            number={componentNumber}
            title="Sidebar setup action"
            summary="Setup left for later with only optional steps open: a quiet flag on the footer row whose card says how many steps are left and offers Finish setup. It opens by itself the moment the reader leaves setup."
        >
            {modes.map((mode, index) => (
                <Specimen
                    detail="Closed, and open as it is just after Save and exit."
                    key={mode}
                    label={mode === "light" ? "Light" : "Dark"}
                    number={`0${String(index + 1)}`}
                    stage="surface"
                >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                        <SetupSidebar mode={mode} open={false} />
                        <SetupSidebar mode={mode} open />
                    </div>
                </Specimen>
            ))}
        </ComponentPage>
    );
}
