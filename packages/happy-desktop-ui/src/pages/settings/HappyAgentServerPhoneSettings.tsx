import { Box } from "../../Box";
import { QRCode } from "../../QRCode";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentServerPhoneSettingsProps {
    /** The server as it is listed: its host, unless it was given a name. */
    readonly serverName: string;
    /**
     * The server code, `happy://<instanceId>/server?url=…`. Absent until the
     * server has said which installation it is, which it does once signed in.
     */
    readonly code?: string;
    /** Why there is no code yet, in place of it. */
    readonly waiting?: string;
}

/**
 * C-353 HappyAgentServerPhoneSettings — a team server added by its address,
 * offered to a phone: the server's code to scan with Happy on the phone, which
 * then signs in to that server on its own. The code carries only the server's
 * address and installation, never a sign-in.
 */
export function HappyAgentServerPhoneSettings(props: HappyAgentServerPhoneSettingsProps) {
    return (
        <HappyAgentSettingsSection rows="cards" title="Connect your phone">
            <Box
                className="happy-server-phone"
                data-happy-desktop-ui="happy-agent-server-phone"
                data-testid="happy-agent-server-phone"
            >
                {props.code ? (
                    <QRCode
                        className="happy-server-phone__code"
                        data={props.code}
                        data-testid="happy-agent-server-phone-qr"
                        label={`Server code for ${props.serverName}`}
                        mark="link"
                        size={176}
                    />
                ) : (
                    <span aria-hidden className="happy-server-phone__placeholder" />
                )}
                <Box className="happy-server-phone__text">
                    <span className="happy-server-phone__title">
                        {props.code ? `Scan to add ${props.serverName}` : props.serverName}
                    </span>
                    {props.code ? (
                        <ol className="happy-server-phone__steps">
                            <li>Open Happy on your phone.</li>
                            <li>Add a server, and scan this code with Happy’s own scanner.</li>
                            <li>Sign in with your organization’s account on the phone.</li>
                        </ol>
                    ) : (
                        <span className="happy-server-phone__detail" role="status">
                            {props.waiting}
                        </span>
                    )}
                    <span className="happy-server-phone__detail">
                        The code holds this server’s address, never your sign-in.
                    </span>
                </Box>
            </Box>
        </HappyAgentSettingsSection>
    );
}
