import { Box } from "../../Box";
import { QRCode } from "../../QRCode";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentServerPhoneSettingsProps {
    /** The server as it is listed: its host, or `@name` in a cloud. */
    readonly serverName: string;
    /**
     * The server code, `happy://<instanceId>/server?url=…`. Absent until the
     * server has said which installation it is, which it does once signed in.
     */
    readonly code?: string;
    /** Why there is no code yet, in place of it. */
    readonly waiting?: string;
    /**
     * The enterprise cloud the server belongs to, with its own code,
     * `happy://cloud?url=…`, which adds every server of the cloud at once.
     */
    readonly cloud?: { readonly name: string; readonly code: string };
}

function PhoneCode(props: {
    readonly name: string;
    readonly label: string;
    readonly code?: string;
    readonly waiting?: string;
    readonly holds: string;
    readonly signedIn?: string;
}) {
    return (
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
                    label={props.label}
                    mark="link"
                    size={176}
                />
            ) : (
                <span aria-hidden className="happy-server-phone__placeholder" />
            )}
            <Box className="happy-server-phone__text">
                <span className="happy-server-phone__title">
                    {props.code ? `Scan to add ${props.name}` : props.name}
                </span>
                {props.code ? (
                    <ol className="happy-server-phone__steps">
                        <li>Open Happy on your phone.</li>
                        <li>Add a server, and scan this code with Happy’s own scanner.</li>
                        <li>Sign in with your company’s account on the phone.</li>
                        {props.signedIn ? <li>{props.signedIn}</li> : null}
                    </ol>
                ) : (
                    <span className="happy-server-phone__detail" role="status">
                        {props.waiting}
                    </span>
                )}
                <span className="happy-server-phone__detail">{props.holds}</span>
            </Box>
        </Box>
    );
}

/**
 * C-353 HappyAgentServerPhoneSettings — an enterprise server offered to a
 * phone: the server's code to scan with Happy on the phone, which then signs
 * in to that server on its own, and for a server of an enterprise cloud the
 * cloud's code too. A code carries only addresses, never a sign-in.
 */
export function HappyAgentServerPhoneSettings(props: HappyAgentServerPhoneSettingsProps) {
    return (
        <>
            <HappyAgentSettingsSection rows="cards" title="Connect your phone">
                <PhoneCode
                    holds="The code holds this server’s address, never your sign-in."
                    label={`Server code for ${props.serverName}`}
                    name={props.serverName}
                    {...(props.code === undefined ? {} : { code: props.code })}
                    {...(props.waiting === undefined ? {} : { waiting: props.waiting })}
                />
            </HappyAgentSettingsSection>
            {props.cloud ? (
                <HappyAgentSettingsSection rows="cards" title={`All of ${props.cloud.name}`}>
                    <PhoneCode
                        code={props.cloud.code}
                        holds={`The code holds ${props.cloud.name}’s address, never your sign-in.`}
                        label={`Code for ${props.cloud.name}`}
                        name={props.cloud.name}
                        signedIn="Your servers there appear, ready to join."
                    />
                </HappyAgentSettingsSection>
            ) : null}
        </>
    );
}
