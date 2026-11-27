import { FormRow } from "../../FormRow";
import { Switch } from "../../Switch";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentConsoleWatchSettingsProps {
    readonly enabled: boolean;
    readonly onEnabledChange: (enabled: boolean) => void;
}

const CONTROL_ID = "happy-agent-settings-console-watch";

/**
 * The preview-build switch for the status bar's console mark. Off, nothing in
 * the window is observed; on, console errors and warnings are counted there.
 */
export function HappyAgentConsoleWatchSettings(props: HappyAgentConsoleWatchSettingsProps) {
    return (
        <HappyAgentSettingsSection
            description="Preview builds only. Off, nothing is observed."
            title="Console"
        >
            <FormRow
                control={
                    <Switch
                        aria-label="Show console errors in the status bar"
                        checked={props.enabled}
                        id={CONTROL_ID}
                        onChange={props.onEnabledChange}
                        size="small"
                    />
                }
                description="Counts console errors, warnings, uncaught errors and failed requests in this window"
                htmlFor={CONTROL_ID}
                label="Show console errors in the status bar"
            />
        </HappyAgentSettingsSection>
    );
}
