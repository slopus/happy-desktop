import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** Where adding a server has got to. */
export type HappyAgentServerAddPhase =
    | { readonly kind: "editing" }
    | { readonly kind: "adding" }
    /** The browser is open at `host`, where the person is signing in. */
    | { readonly kind: "signingIn"; readonly host: string };

export interface HappyAgentServerSettingsProps {
    /** The address in the field. */
    readonly url: string;
    readonly phase: HappyAgentServerAddPhase;
    /** Why the address in the field was not tried. */
    readonly urlError?: string;
    /** Why the last attempt failed. */
    readonly error?: string;
    /**
     * The organization fixed the server: the field shows its address and cannot
     * be edited, and adding it is still the person's act.
     */
    readonly locked?: boolean;
    /** The organization allows adding no server at all; the form is left out. */
    readonly refused?: boolean;
    /** Why the host cannot add servers right now. */
    readonly unavailable?: string;
    onUrlChange(value: string): void;
    onAdd(): void;
    onCancel(): void;
}

/**
 * Adding a team server by its HTTPS address. The person types the address and
 * signs in in their browser; this row says where that has got to and offers
 * the one way out of a sign-in that is taking too long.
 */
export function HappyAgentServerSettings(props: HappyAgentServerSettingsProps) {
    const running = props.phase.kind !== "editing";
    const blocked = props.unavailable !== undefined;
    return (
        <HappyAgentSettingsSection
            description="Connect to a Happy server your team runs. You sign in in your browser, through your organization's sign-in page."
            title="Add a server"
        >
            {props.unavailable ? (
                <Banner tone="warning" title="Happy Agent unavailable">
                    {props.unavailable}
                </Banner>
            ) : null}
            {props.refused ? (
                <Banner tone="neutral" title="Managed by your organization">
                    Your organization doesn&rsquo;t allow adding servers.
                </Banner>
            ) : (
                <FormRow
                    control={
                        <Box className="happy-agent-server-settings__field">
                            <TextField
                                aria-label="Server address"
                                autoComplete="url"
                                className="happy-agent-server-settings__input"
                                data-testid="happy-agent-server-settings-url"
                                disabled={props.locked === true || running || blocked}
                                fullWidth
                                id="happy-agent-server-settings-url"
                                onSubmit={props.onAdd}
                                onValueChange={props.onUrlChange}
                                placeholder="https://happy.example.com"
                                size="small"
                                value={props.url}
                                {...(props.urlError === undefined ? {} : { error: props.urlError })}
                            />
                            {running ? (
                                <Button onClick={props.onCancel} size="small" variant="secondary">
                                    Cancel
                                </Button>
                            ) : (
                                <Button
                                    disabled={blocked}
                                    onClick={props.onAdd}
                                    size="small"
                                    variant="primary"
                                >
                                    Add server
                                </Button>
                            )}
                        </Box>
                    }
                    description={
                        props.locked
                            ? "Your organization set this server."
                            : "The https:// address your team gave you"
                    }
                    htmlFor="happy-agent-server-settings-url"
                    label="Server address"
                    layout="stacked"
                />
            )}
            {props.phase.kind === "editing" ? null : (
                <Box
                    className="happy-agent-settings__pending"
                    data-testid="happy-agent-server-settings-progress"
                >
                    <Spinner size={16} />
                    {props.phase.kind === "adding"
                        ? "Contacting the server…"
                        : `Finish signing in at ${props.phase.host} in your browser.`}
                </Box>
            )}
            {props.error ? (
                <Banner tone="danger" title="Couldn't add the server">
                    {props.error}
                </Banner>
            ) : null}
        </HappyAgentSettingsSection>
    );
}
