import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { IconTile } from "../../IconTile";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentServerConnectSettingsProps {
    /** Opens Enterprise login on the company's address. */
    onConnect(): void;
}

/** Enterprise login, for a computer already set up: one row that starts it. */
export function HappyAgentServerConnectSettings(props: HappyAgentServerConnectSettingsProps) {
    return (
        <HappyAgentSettingsSection>
            <FormRow
                control={
                    <Button
                        data-testid="happy-agent-server-connect"
                        onClick={props.onConnect}
                        size="small"
                        variant="secondary"
                    >
                        Enterprise login…
                    </Button>
                }
                description="Sign in to your company’s Happy by its address"
                icon={<IconTile ionicon="business-outline" tone="indigo" />}
                label="Enterprise"
            />
        </HappyAgentSettingsSection>
    );
}
