import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyCloudWebSettingsProps {
    /** The server this page belongs to, shown as `@name`. */
    readonly serverName: string;
    onServerSwitch(): void;
    onSignOut(): void;
}

/** The web app's Happy Cloud session: go to another server, or sign out. */
export function HappyCloudWebSettings(props: HappyCloudWebSettingsProps) {
    return (
        <HappyAgentSettingsSection title="Happy Cloud">
            <FormRow
                control={
                    <Button onClick={props.onServerSwitch} size="small" variant="secondary">
                        Switch server
                    </Button>
                }
                description="Pick another of your servers."
                label={`@${props.serverName}`}
            />
            <FormRow
                control={
                    <Button onClick={props.onSignOut} size="small" variant="secondary">
                        Sign out
                    </Button>
                }
                description="Sign out of Happy Cloud in this browser."
                label="Sign out"
            />
        </HappyAgentSettingsSection>
    );
}
