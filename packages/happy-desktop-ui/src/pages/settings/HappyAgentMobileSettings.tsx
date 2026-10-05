import { Badge, type BadgeVariant } from "../../Badge";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Box } from "../../Box";
import { CopyButton } from "../../CopyButton";
import { FormRow } from "../../FormRow";
import {
    MobileAccessConfirmation,
    MobileAccessDetail,
    type MobileAccessConfirmationState,
} from "../../MobileAccessConfirmation";
import { QRCode } from "../../QRCode";
import { Spinner } from "../../Spinner";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export type HappyAgentMobileStatus =
    | "loading"
    | "disabled"
    | "disconnected"
    | "pairing"
    | "connecting"
    | "connected"
    | "failed"
    | "unavailable";

/** The machine's global Happy CLI, read on its own; nothing here is matched to the Agent. */
export type HappyAgentMobileTerminal =
    | { readonly status: "loading" }
    | { readonly status: "not-installed" }
    | { readonly status: "unavailable"; readonly message: string; readonly cliVersion?: string }
    | {
          readonly status: "available";
          readonly cliVersion: string;
          readonly auth: "missing" | "v2" | "legacy" | "invalid";
          readonly accountKeyFingerprint?: string;
          readonly serverUrl: string;
          readonly machineId?: string;
          readonly daemon: {
              readonly state:
                  | "stopped"
                  | "online"
                  | "offline"
                  | "unavailable"
                  | "identity-mismatch"
                  | "version-mismatch";
          };
      };

export interface HappyAgentMobileSettingsProps {
    /** Undefined until Happy Agent has reported its durable configuration. */
    readonly configured?: boolean;
    readonly status: HappyAgentMobileStatus;
    /** When the integration last changed, as the Agent reports it (epoch ms). */
    readonly updatedAt?: number;
    readonly disconnecting?: boolean;
    readonly pairingStarting?: boolean;
    readonly pairingCanceling?: boolean;
    readonly pairingData?: string;
    readonly pairingExpiresAt?: number;
    /** Why the live integration state could not be read. */
    readonly error?: string;
    /** Why the last disconnect attempt was refused. */
    readonly disconnectError?: string;
    /** Why the last pairing action was refused. */
    readonly pairingError?: string;
    /** Detail Happy Agent reported for a failed or disconnected integration. */
    readonly message?: string;
    /** Why actions cannot currently reach this Happy Agent. */
    readonly unavailable?: string;
    /** The local terminal CLI; absent for a remote Agent, which has no local CLI. */
    readonly terminal?: HappyAgentMobileTerminal;
    readonly terminalSetupSupport?: "standalone" | "personal" | "unknown";
    readonly terminalReadError?: string;
    /** The open destructive confirmation, if any. */
    readonly management?: MobileAccessConfirmationState;
    /** Opens the shared Desktop mobile setup; absent for remote Agent-only pairing. */
    readonly onSetup?: () => void;
    /** Opens the terminal sign-out confirmation; absent when the host cannot reset. */
    readonly onTerminalReset?: () => void;
    /** Opens the disconnect confirmation. */
    onDisconnect(): void;
    onPair(): void;
    onPairingCancel(): void;
    onManagementCancel?(): void;
    onManagementConfirm?(): void;
    onTerminalRegistrationRemovalChange?(remove: boolean): void;
}

interface MobileState {
    readonly label: string;
    readonly variant: BadgeVariant;
    readonly description: string;
}

/** The Mobile Access category: one composed phone status, the terminal CLI, and removal. */
export function HappyAgentMobileSettings(props: HappyAgentMobileSettingsProps) {
    const mobile = mobileState(props);
    const blocked = props.unavailable !== undefined;
    const paired = props.configured === true;
    return (
        <>
            <HappyAgentSettingsSection
                description="Pairing lets Happy Mobile follow and continue the work running through this Happy Agent."
                title="Happy Mobile"
            >
                {props.unavailable ? (
                    <Banner tone="warning" title="Happy Agent unavailable">
                        {props.unavailable}
                    </Banner>
                ) : null}
                {props.error ? (
                    <Banner tone="danger" title="Happy Mobile status unavailable">
                        {props.error}
                    </Banner>
                ) : null}
                {props.disconnectError ? (
                    <Banner tone="danger" title="Pairing could not be removed">
                        {props.disconnectError}
                    </Banner>
                ) : null}
                {props.pairingError ? (
                    <Banner tone="danger" title="Pairing unavailable">
                        {props.pairingError}
                    </Banner>
                ) : null}
                <FormRow
                    control={<Badge label={mobile.label} variant={mobile.variant} />}
                    description={statusDetail(mobile.description, props)}
                    label="Status"
                />
                {props.status === "pairing" && props.pairingData ? (
                    <Box className="happy-agent-mobile-settings__pairing">
                        <QRCode
                            data={props.pairingData}
                            data-testid="happy-mobile-settings-pairing-qr"
                            label="QR code to pair Happy Mobile"
                            size={240}
                        />
                        {/* The payload is opaque: drawn as a QR code or copied as is. */}
                        <CopyButton
                            caption="Copy auth link"
                            copiedCaption="Link copied"
                            data-testid="happy-mobile-settings-pairing-copy"
                            label="Copy auth link"
                            text={props.pairingData}
                        />
                        <Box className="happy-agent-mobile-settings__waiting">
                            <Spinner label="Pairing in progress" size={16} />
                            <span>{pairingWaitingLabel(props.pairingExpiresAt)}</span>
                        </Box>
                        <Button
                            loading={props.pairingCanceling}
                            onClick={props.onPairingCancel}
                            size="small"
                            variant="ghost"
                        >
                            Cancel pairing
                        </Button>
                    </Box>
                ) : null}
                {props.configured === false &&
                (props.status === "disconnected" || props.status === "failed") ? (
                    <FormRow
                        align="start"
                        control={
                            <Button
                                disabled={blocked}
                                icon="link"
                                loading={props.pairingStarting}
                                onClick={props.onPair}
                                size="small"
                                variant="primary"
                            >
                                Connect phone
                            </Button>
                        }
                        description={
                            props.onSetup
                                ? "Get Happy on your phone and link this computer with one pairing code."
                                : "Start a secure pairing and scan the QR code with Happy Mobile."
                        }
                        label="Connect a phone"
                    />
                ) : null}
                {paired ? (
                    <FormRow
                        align="start"
                        control={
                            <ol className="happy-agent-mobile-settings__steps">
                                <li>
                                    On the new phone, install Happy and choose{" "}
                                    <strong>Restore an existing account</strong>.
                                </li>
                                <li>
                                    On a phone that is already signed in, open{" "}
                                    <strong>Settings › Account › Link New Device</strong> and scan
                                    the code the new phone shows. You can also enter your secret key
                                    from <strong>Settings › Account</strong>.
                                </li>
                            </ol>
                        }
                        description="Every phone signed in to the same Happy account sees this computer. Adding one does not need a new pairing here."
                        label="Add another phone"
                        layout="stacked"
                    />
                ) : null}
            </HappyAgentSettingsSection>
            {props.terminal ? (
                <TerminalSection
                    blocked={blocked || props.disconnecting === true}
                    paired={paired}
                    terminal={props.terminal}
                    setupSupport={props.terminalSetupSupport}
                    readError={props.terminalReadError}
                    onTerminalReset={props.onTerminalReset}
                />
            ) : null}
            {paired ? (
                <HappyAgentSettingsSection title="Remove">
                    <FormRow
                        align="start"
                        control={
                            <Button
                                disabled={blocked}
                                icon="unlink"
                                loading={props.disconnecting}
                                onClick={props.onDisconnect}
                                size="small"
                                variant="danger"
                            >
                                Disconnect
                            </Button>
                        }
                        description="Remove this Happy Agent's saved pairing with Happy Mobile. Your account, phones, session history, and the Happy CLI's sign-in stay as they are."
                        label="Disconnect this computer"
                    />
                </HappyAgentSettingsSection>
            ) : null}
            {props.management ? (
                <MobileAccessConfirmation
                    confirmation={props.management}
                    data-testid="happy-mobile-settings-confirmation"
                    onCancel={() => props.onManagementCancel?.()}
                    onConfirm={() => props.onManagementConfirm?.()}
                    onRegistrationRemovalChange={props.onTerminalRegistrationRemovalChange}
                />
            ) : null}
        </>
    );
}

function TerminalSection(props: {
    readonly blocked: boolean;
    readonly paired: boolean;
    readonly terminal: HappyAgentMobileTerminal;
    readonly onTerminalReset?: () => void;
    readonly setupSupport?: "standalone" | "personal" | "unknown";
    readonly readError?: string;
}) {
    const { terminal } = props;
    const ready =
        terminal.status === "available" &&
        (terminal.auth === "v2" || terminal.auth === "legacy") &&
        terminal.daemon.state === "online";
    return (
        <HappyAgentSettingsSection
            description="The Happy CLI on this computer runs terminal Claude Code and Codex sessions you can follow from your phone."
            title="Terminal (Happy CLI)"
        >
            {props.readError ? (
                <Banner tone="warning" title="Terminal status could not be checked">
                    {props.readError}
                </Banner>
            ) : null}
            {props.paired && props.setupSupport === "personal" ? (
                <FormRow
                    label="Personal pairing"
                    control={<Badge label="Separate sign-in" variant="neutral" />}
                    description="Happy Mobile is paired to your personal Agent account. The existing CLI sign-in below is separate and has not been matched to this pairing."
                />
            ) : props.paired && props.setupSupport === "unknown" ? (
                <FormRow
                    label="Pairing scope"
                    control={<Badge label="Unavailable" variant="neutral" />}
                    description="The Agent pairing scope could not be identified. Terminal CLI status below is read independently; your saved phone pairing remains usable."
                />
            ) : null}
            {terminal.status === "loading" ? (
                <FormRow
                    control={<Badge label="Checking…" variant="neutral" />}
                    description="Reading the Happy CLI installed on this computer."
                    label="Happy CLI"
                />
            ) : terminal.status === "not-installed" ? (
                <FormRow
                    control={<Badge label="Not installed" variant="neutral" />}
                    description="No Happy CLI is installed globally on this computer."
                    label="Happy CLI"
                />
            ) : terminal.status === "unavailable" ? (
                <FormRow
                    control={<Badge label="Unavailable" variant="warning" />}
                    description={
                        terminal.cliVersion
                            ? `Version ${terminal.cliVersion}. ${terminal.message}`
                            : terminal.message
                    }
                    label="Happy CLI"
                />
            ) : (
                <>
                    <FormRow
                        control={
                            ready ? (
                                <Badge label="Ready" variant="success" />
                            ) : (
                                <Badge label="Not ready" variant="warning" />
                            )
                        }
                        description={`Version ${terminal.cliVersion}`}
                        label="Happy CLI"
                    />
                    <FormRow
                        align="start"
                        control={<AuthBadge auth={terminal.auth} />}
                        description={authDescription(terminal.auth)}
                        label="Sign-in"
                    />
                    <Box className="happy-agent-mobile-settings__details">
                        <MobileAccessDetail label="Server" value={terminal.serverUrl} />
                        {terminal.accountKeyFingerprint ? (
                            <MobileAccessDetail
                                fingerprint
                                label="Account key"
                                value={terminal.accountKeyFingerprint}
                            />
                        ) : null}
                        {terminal.machineId ? (
                            <MobileAccessDetail label="Machine ID" value={terminal.machineId} />
                        ) : null}
                    </Box>
                    <FormRow
                        align="start"
                        control={
                            <Badge
                                label={DAEMON_LABELS[terminal.daemon.state]}
                                variant={DAEMON_VARIANTS[terminal.daemon.state]}
                            />
                        }
                        description={daemonDescription(terminal.daemon.state)}
                        label="Daemon"
                    />
                </>
            )}
            {terminal.status === "available" &&
            (terminal.auth !== "missing" || terminal.machineId !== undefined) &&
            props.onTerminalReset ? (
                <FormRow
                    align="start"
                    control={
                        <Button
                            disabled={props.blocked}
                            onClick={props.onTerminalReset}
                            size="small"
                            variant="danger"
                        >
                            Remove saved login
                        </Button>
                    }
                    description="Delete the Happy CLI's saved sign-in and stop its daemon. Running terminal sessions are kept and can stay connected until they end. You'll review the exact scope first."
                    label="Remove saved terminal login"
                />
            ) : null}
        </HappyAgentSettingsSection>
    );
}

function AuthBadge(props: { readonly auth: "missing" | "v2" | "legacy" | "invalid" }) {
    switch (props.auth) {
        case "missing":
            return <Badge label="Not signed in" variant="neutral" />;
        case "v2":
            return <Badge label="Signed in" variant="success" />;
        case "legacy":
            return <Badge label="Older sign-in" variant="warning" />;
        case "invalid":
            return <Badge label="Unreadable" variant="danger" />;
    }
}

function authDescription(auth: "missing" | "v2" | "legacy" | "invalid"): string {
    switch (auth) {
        case "missing":
            return "The Happy CLI has no saved sign-in on this computer.";
        case "v2":
            return "The Happy CLI has a saved sign-in. Whether it is the same account as this Happy Agent is not checked here.";
        case "legacy":
            return "The Happy CLI is signed in using the legacy credential format. Terminal sessions are available when its daemon is online.";
        case "invalid":
            return "The Happy CLI's saved sign-in could not be read.";
    }
}

type DaemonState = Extract<HappyAgentMobileTerminal, { status: "available" }>["daemon"]["state"];

const DAEMON_LABELS: Record<DaemonState, string> = {
    stopped: "Stopped",
    online: "Online",
    offline: "Offline",
    unavailable: "Unknown",
    "identity-mismatch": "Different identity",
    "version-mismatch": "Different version",
};

const DAEMON_VARIANTS: Record<DaemonState, BadgeVariant> = {
    stopped: "neutral",
    online: "success",
    offline: "warning",
    unavailable: "neutral",
    "identity-mismatch": "danger",
    "version-mismatch": "warning",
};

function daemonDescription(state: DaemonState): string {
    switch (state) {
        case "stopped":
            return "The Happy CLI daemon is not running.";
        case "online":
            return "The Happy CLI daemon is running and connected to its server.";
        case "offline":
            return "The Happy CLI daemon is running but not connected to its server.";
        case "unavailable":
            return "The Happy CLI daemon's status could not be read.";
        case "identity-mismatch":
            return "The running daemon reports a different machine or server than the CLI's saved sign-in.";
        case "version-mismatch":
            return "The running daemon is a different version from the installed Happy CLI.";
    }
}

function mobileState(props: HappyAgentMobileSettingsProps): MobileState {
    switch (props.status) {
        case "loading":
            return {
                label: "Checking…",
                variant: "neutral",
                description: "Reading the Happy Mobile connection from Happy Agent.",
            };
        case "unavailable":
            return {
                label: "Unavailable",
                variant: "neutral",
                description: "This Happy Agent does not report Happy Mobile integration state.",
            };
        case "disabled":
            return {
                label: "Disabled",
                variant: "neutral",
                description:
                    "Happy Mobile integration is disabled in this Happy Agent installation.",
            };
        case "pairing":
            return {
                label: "Waiting for phone",
                variant: "info",
                description: "Happy Agent is waiting for a phone to scan its pairing code.",
            };
        case "connected":
            return {
                label: "Connected",
                variant: "success",
                description: "Paired, with a live connection to Happy Mobile.",
            };
        case "connecting":
            return {
                label: "Reconnecting",
                variant: "info",
                description: "The saved pairing is connecting to Happy Mobile.",
            };
        case "disconnected":
            return props.configured === true
                ? {
                      label: "Offline — pairing saved",
                      variant: "warning",
                      description:
                          "The pairing is saved, but Happy Agent is not connected to Happy Mobile right now.",
                  }
                : props.configured === false
                  ? {
                        label: "Not set up",
                        variant: "neutral",
                        description: "No phone is paired with this Happy Agent.",
                    }
                  : {
                        label: "Checking…",
                        variant: "neutral",
                        description: "Reading whether this Happy Agent has a saved pairing.",
                    };
        case "failed":
            return props.configured === true
                ? {
                      label: "Can't connect",
                      variant: "danger",
                      description:
                          "The pairing is saved, but Happy Agent could not connect to Happy Mobile.",
                  }
                : {
                      label: "Not set up",
                      variant: "neutral",
                      description: "The last pairing attempt did not finish.",
                  };
    }
}

/** The state line, the Agent's own detail, and when the Agent last saw it change. */
function statusDetail(description: string, props: HappyAgentMobileSettingsProps): string {
    const parts = [description];
    if (props.message && (props.status === "failed" || props.status === "disconnected"))
        parts.push(props.message);
    if (props.updatedAt !== undefined)
        parts.push(
            `Last changed ${new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
            }).format(props.updatedAt)}.`,
        );
    return parts.join(" ");
}

function pairingWaitingLabel(expiresAt: number | undefined): string {
    if (expiresAt === undefined) return "Waiting for your phone…";
    const expiration = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(expiresAt);
    return `Waiting for your phone · expires ${expiration}`;
}
