import { HappyAgentDangerSettings } from "../../src/pages/settings/HappyAgentDangerSettings";
import { HappyAgentSettingsShell } from "../../src/pages/settings/HappyAgentSettingsShell";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { HAPPY_CLOUD_OWNER_SETTINGS_CATEGORIES } from "./happyAgentSettingsFixtures";

export const componentNumber = "C-349";
const noop = () => undefined;

export function HappyAgentDangerSettingsPage() {
    const modes: readonly ThemeMode[] = ["light", "dark"];
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Settings › Danger on Happy Cloud, shown to owners: deleting the server for everyone once its name is typed."
            title="Danger settings"
        >
            {modes.map((mode, index) => (
                <FullScreenSpecimen
                    detail={`${mode} · 1100 × 760`}
                    key={mode}
                    label={`Owner · ${mode}`}
                    number={String(index + 1).padStart(2, "0")}
                    screen={`${mode}-danger-1100x760`}
                    window={{ width: 1100, height: 760 }}
                >
                    <ThemeScope mode={mode}>
                        <HappyAgentSettingsShell
                            activeCategoryId="danger"
                            categories={HAPPY_CLOUD_OWNER_SETTINGS_CATEGORIES}
                            description="Deleting this server for everyone"
                            onCategorySelect={noop}
                            onClose={noop}
                            title="Danger"
                        >
                            <HappyAgentDangerSettings
                                onDelete={() => Promise.resolve()}
                                serverName="acme"
                            />
                        </HappyAgentSettingsShell>
                    </ThemeScope>
                </FullScreenSpecimen>
            ))}
        </ComponentPage>
    );
}
