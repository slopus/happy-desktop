import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { IconTile } from "../../IconTile";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentServerConnectSettingsProps {
    /** Why this computer's Happy Agent can't add a server right now. */
    readonly unavailable?: string;
    /** Opens the "+" sheet on a server's address. */
    onConnect(): void;
}

/** A team server reached by its address: one row that starts connecting to one. */
export function HappyAgentServerConnectSettings(props: HappyAgentServerConnectSettingsProps) {
    return (
        <HappyAgentSettingsSection>
            <FormRow
                control={
                    <Button
                        data-testid="happy-agent-server-connect"
                        disabled={props.unavailable !== undefined}
                        onClick={props.onConnect}
                        size="small"
                        variant="secondary"
                    >
                        Connect to a server…
                    </Button>
                }
                description="Sign in to your organization’s Happy server by its address"
                icon={<IconTile ionicon="server-outline" tone="indigo" />}
                label="Team server"
            />
        </HappyAgentSettingsSection>
    );
}
