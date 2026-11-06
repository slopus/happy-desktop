import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { HappyAgentServerPhoneDialog } from "./HappyAgentServerPhoneDialog";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** Where signing in to one team server stands. */
export type HappyAgentServerSignIn =
    | { readonly kind: "signedIn" }
    /** No sign-in yet, or it ended; `message` says which. */
    | { readonly kind: "required"; readonly message?: string }
    /** The browser is open at `host`, where the person is signing in; absent for Happy Cloud. */
    | { readonly kind: "browser"; readonly host?: string }
    | { readonly kind: "failed"; readonly message: string };

/** One team server this window is connected to. */
export interface HappyAgentServerRow {
    readonly id: string;
    readonly name: string;
    /** The address it was added by. */
    readonly address: string;
    readonly signIn: HappyAgentServerSignIn;
    /**
     * What a phone scans to add this server; absent for one a phone cannot add
     * this way, which then offers no Connect a phone.
     */
    readonly phoneCode?: string;
}

/** Where asking for a server has got to. */
export type HappyAgentServerAddPhase =
    | { readonly kind: "editing" }
    /** The request is being written into the Chief of Staff's draft. */
    | { readonly kind: "asking" };

export interface HappyAgentServerSettingsProps {
    /** The address in the field. */
    readonly url: string;
    readonly phase: HappyAgentServerAddPhase;
    /** Who adds servers: the Chief of Staff, by its own name. */
    readonly chiefOfStaffName: string;
    /** Why the address in the field was not passed on. */
    readonly urlError?: string;
    /** Why the last request did not reach the Chief of Staff. */
    readonly error?: string;
    /** Why servers cannot be asked for right now. */
    readonly unavailable?: string;
    /** The servers the host Happy Agent lists, each with its sign-in and way onto a phone. */
    readonly servers?: readonly HappyAgentServerRow[];
    onUrlChange(value: string): void;
    onAdd(): void;
    onSignIn(id: string): void;
    /** Stops a sign-in whose browser is open; absent where it cannot be stopped. */
    onSignInCancel?(id: string): void;
    onRemove(id: string): void;
}

/**
 * Team servers. The Chief of Staff adds and removes them: the person types
 * the address and the request opens in the Chief of Staff's conversation.
 * Each listed server says whether this computer is signed in to it, offers
 * the sign-in, and shows the code a phone scans to add it.
 */
export function HappyAgentServerSettings(props: HappyAgentServerSettingsProps) {
    const asking = props.phase.kind === "asking";
    const blocked = props.unavailable !== undefined;
    // Which server's phone code is open: a dialog over the page, so opening it
    // moves nothing on the page.
    const [phoneOpenId, setPhoneOpenId] = useState<string>();
    const phoneServer = props.servers?.find((server) => server.id === phoneOpenId);
    return (
        <>
            {props.servers && props.servers.length > 0 ? (
                <HappyAgentSettingsSection title="Your servers">
                    {props.servers.map((server) => (
                        <Box
                            className="happy-agent-server-settings__server"
                            data-testid="happy-agent-server-settings-server"
                            key={server.id}
                        >
                            <FormRow
                                control={
                                    <Box className="happy-agent-server-settings__actions">
                                        {server.signIn.kind === "signedIn" ? (
                                            <span className="happy-agent-server-settings__state">
                                                Signed in
                                            </span>
                                        ) : null}
                                        {server.signIn.kind === "browser" ? (
                                            <span className="happy-agent-server-settings__state">
                                                <Spinner size={12} />
                                                Signing in…
                                            </span>
                                        ) : null}
                                        {server.signIn.kind === "browser" &&
                                        props.onSignInCancel ? (
                                            <Button
                                                aria-label={`Cancel signing in to ${server.name}`}
                                                onClick={() => props.onSignInCancel?.(server.id)}
                                                size="small"
                                                variant="secondary"
                                            >
                                                Cancel
                                            </Button>
                                        ) : null}
                                        {server.signIn.kind === "required" ||
                                        server.signIn.kind === "failed" ? (
                                            <Button
                                                onClick={() => props.onSignIn(server.id)}
                                                size="small"
                                                variant="primary"
                                            >
                                                Sign in
                                            </Button>
                                        ) : null}
                                        {server.phoneCode === undefined ? null : (
                                            <Button
                                                icon="mobile"
                                                onClick={() => setPhoneOpenId(server.id)}
                                                size="small"
                                                variant="secondary"
                                            >
                                                Connect a phone
                                            </Button>
                                        )}
                                        <Button
                                            aria-label={`Remove ${server.name}`}
                                            disabled={asking || blocked}
                                            onClick={() => props.onRemove(server.id)}
                                            size="small"
                                            variant="secondary"
                                        >
                                            Remove
                                        </Button>
                                    </Box>
                                }
                                description={server.address}
                                label={server.name}
                            />
                            <HappyAgentServerSignInNote signIn={server.signIn} />
                        </Box>
                    ))}
                </HappyAgentSettingsSection>
            ) : null}
            {phoneServer?.phoneCode === undefined ? null : (
                <HappyAgentServerPhoneDialog
                    address={phoneServer.address}
                    code={phoneServer.phoneCode}
                    name={phoneServer.name}
                    onClose={() => setPhoneOpenId(undefined)}
                />
            )}
            <HappyAgentSettingsSection
                description={`${props.chiefOfStaffName} adds the Happy servers your team runs. Once a server is listed here, you sign in to it in your browser, through your organization's sign-in page.`}
                title="Add a server"
            >
                {props.unavailable ? (
                    <Banner tone="warning" title="Happy Agent unavailable">
                        {props.unavailable}
                    </Banner>
                ) : null}
                <FormRow
                    control={
                        <Box className="happy-agent-server-settings__field">
                            <TextField
                                aria-label="Server address"
                                autoComplete="url"
                                className="happy-agent-server-settings__input"
                                data-testid="happy-agent-server-settings-url"
                                disabled={asking || blocked}
                                fullWidth
                                id="happy-agent-server-settings-url"
                                onSubmit={props.onAdd}
                                onValueChange={props.onUrlChange}
                                placeholder="https://happy.example.com"
                                size="small"
                                value={props.url}
                                {...(props.urlError === undefined ? {} : { error: props.urlError })}
                            />
                            <Button
                                disabled={asking || blocked}
                                onClick={props.onAdd}
                                size="small"
                                variant="primary"
                            >
                                {`Ask ${props.chiefOfStaffName}`}
                            </Button>
                        </Box>
                    }
                    description="The https:// address your team gave you"
                    htmlFor="happy-agent-server-settings-url"
                    label="Server address"
                    layout="stacked"
                />
                {props.error ? (
                    <Banner tone="danger" title={`Couldn't ask ${props.chiefOfStaffName}`}>
                        {props.error}
                    </Banner>
                ) : null}
            </HappyAgentSettingsSection>
        </>
    );
}

/** What a server's sign-in needs said beyond its row's buttons, if anything. */
function HappyAgentServerSignInNote(props: { readonly signIn: HappyAgentServerSignIn }) {
    const { signIn } = props;
    if (signIn.kind === "browser")
        return (
            <p className="happy-agent-server-settings__note">
                {`Finish signing in${signIn.host ? ` at ${signIn.host}` : ""} in your browser.`}
            </p>
        );
    if (signIn.kind === "failed")
        return (
            <p className="happy-agent-server-settings__note" data-tone="danger">
                {signIn.message}
            </p>
        );
    if (signIn.kind === "required" && signIn.message !== undefined)
        return <p className="happy-agent-server-settings__note">{signIn.message}</p>;
    return null;
}
