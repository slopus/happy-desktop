import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentAccountSettingsProps {
    readonly status: "loading" | "disconnected" | "authorizing" | "connected" | "unavailable";
    readonly authorizationCompleting?: boolean;
    readonly authorizationStarting?: boolean;
    readonly disconnecting?: boolean;
    readonly email?: string;
    readonly error?: string;
    readonly unavailable?: string;
    onConnect(): void;
    onDisconnect(): void;
}

/** The WorkOS account has only two actions: connect and disconnect. */
export function HappyAgentAccountSettings(props: HappyAgentAccountSettingsProps) {
    const connected = props.status === "connected";
    return (
        <HappyAgentSettingsSection>
            {props.unavailable ? (
                <Banner tone="warning" title="Happy Agent unavailable">
                    {props.unavailable}
                </Banner>
            ) : null}
            {props.error ? (
                <Banner tone="danger" title="Account connection failed">
                    {props.error}
                </Banner>
            ) : null}
            <FormRow
                label="Happy account"
                description={accountDescription(props)}
                control={
                    <Button
                        disabled={props.unavailable !== undefined || props.status === "unavailable"}
                        icon={connected ? "unlink" : undefined}
                        loading={
                            props.status === "loading" ||
                            props.authorizationStarting ||
                            props.authorizationCompleting ||
                            props.disconnecting
                        }
                        onClick={connected ? props.onDisconnect : props.onConnect}
                        size="small"
                        variant={connected ? "secondary" : "primary"}
                    >
                        {connected ? "Disconnect" : "Connect account"}
                    </Button>
                }
            />
        </HappyAgentSettingsSection>
    );
}

function accountDescription(props: HappyAgentAccountSettingsProps): string {
    switch (props.status) {
        case "loading":
            return "Checking account connection…";
        case "disconnected":
            return "Sign in through WorkOS in your browser";
        case "authorizing":
            return props.authorizationCompleting
                ? "Completing sign-in…"
                : "Finish signing in through your browser";
        case "connected":
            return props.email ?? "Account connected";
        case "unavailable":
            return "Account authentication is unavailable on this Happy Agent";
    }
}
