import type { ReactNode } from "react";
import type { BadgeVariant } from "../../Badge";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Box } from "../../Box";
import { FormRow } from "../../FormRow";
import {
    MobileAccessConfirmation,
    type MobileAccessConfirmationState,
} from "../../MobileAccessConfirmation";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";
import { HappyAgentSettingsStatus } from "./HappyAgentSettingsStatus";

export type HappyAgentMobileStatus =
    | "loading"
    | "disabled"
    | "disconnected"
    | "pairing"
    | "connecting"
    | "connected"
    | "failed"
    | "unavailable";

export interface HappyAgentMobileSettingsProps {
    /** Undefined until Happy Agent has reported its durable configuration. */
    readonly configured?: boolean;
    readonly status: HappyAgentMobileStatus;
    /** When the integration last changed, as the Agent reports it (epoch ms). */
    readonly updatedAt?: number;
    readonly disconnecting?: boolean;
    /** True while Happy Agent is asked to connect a saved pairing again. */
    readonly pairingStarting?: boolean;
    /** Why the live integration state could not be read. */
    readonly error?: string;
    /** Why the last disconnect attempt was refused. */
    readonly disconnectError?: string;
    /** Detail Happy Agent reported for a failed or disconnected integration. */
    readonly message?: string;
    /**
     * Whether Disconnect deletes this computer, and the chats it published,
     * from the Happy account. Older Happy Agents only forget their pairing.
     */
    readonly removesComputer?: boolean;
    /**
     * This window asked to remove the computer and Happy could not confirm it.
     * The pairing stays saved and closed until the removal is retried or
     * abandoned; `message` carries the Agent's reason.
     */
    readonly removalIncomplete?: boolean;
    /** Why actions cannot currently reach this Happy Agent. */
    readonly unavailable?: string;
    /** The open destructive confirmation, if any. */
    readonly management?: MobileAccessConfirmationState;
    /** Opens the disconnect confirmation. */
    onDisconnect(): void;
    /** Retries a refused removal without asking again; the person already confirmed. */
    onRemovalRetry?(): void;
    /** Keeps a saved pairing and connects it again. */
    onReconnect?(): void;
    onManagementCancel?(): void;
    onManagementConfirm?(): void;
    /** Opens pairing: Relay or Direct, or only Direct with `pairingDirectOnly`. */
    onPairingOptionsOpen(): void;
    /**
     * This computer is already linked through the Happy server, so phones on
     * the account already see it: connecting offers only the direct code, and
     * the link stays as it is.
     */
    readonly pairingDirectOnly?: boolean;
    /**
     * This Happy Agent reports every way of pairing a phone this window offers
     * turned off, so Connect a phone is left out.
     */
    readonly pairingOff?: boolean;
    /**
     * The open pairing (MobilePairingOptions in its `dialog` layout), shown in
     * a dialog over the page, so the page stays one flat list of rows.
     */
    readonly pairingOptions?: ReactNode;
    /** Closes the pairing dialog, by its close button, the dim, or Escape. */
    onPairingOptionsClose?(): void;
    /**
     * The direct connection's section body (MobileDirectConnectionSection);
     * absent leaves the section out.
     */
    readonly direct?: ReactNode;
}

interface MobileState {
    readonly label: string;
    readonly variant: BadgeVariant;
    readonly description: string;
}

/**
 * The Mobile Access category: connecting a phone, then only what is linked — the
 * relay when it is, each directly paired phone — and any error; and removal.
 */
export function HappyAgentMobileSettings(props: HappyAgentMobileSettingsProps) {
    const mobile = mobileState(props);
    const blocked = props.unavailable !== undefined;
    const paired = props.configured === true;
    const pairingTitle = props.pairingDirectOnly ? "Connect a phone directly" : "Connect a phone";
    return (
        <>
            <HappyAgentSettingsSection>
                {props.unavailable ? (
                    <Banner tone="warning" title="Happy Agent unavailable">
                        {props.unavailable}
                    </Banner>
                ) : null}
                {props.pairingOff ? (
                    <p
                        className="happy-agent-mobile-settings__off"
                        data-testid="happy-mobile-settings-pairing-off"
                    >
                        Phone pairing is turned off on this Happy Agent.
                    </p>
                ) : (
                    <FormRow
                        align="start"
                        control={
                            <Button
                                disabled={blocked}
                                icon={props.pairingDirectOnly ? "mobile" : "link"}
                                onClick={props.onPairingOptionsOpen}
                                size="small"
                                variant="primary"
                            >
                                {props.pairingDirectOnly ? "Show QR code" : "Connect phone"}
                            </Button>
                        }
                        description={
                            props.pairingDirectOnly
                                ? "For the latest Happy phone app. Your Happy server link stays."
                                : "Scan a code with Happy on your phone"
                        }
                        label={pairingTitle}
                    />
                )}
                {props.error ? (
                    <Banner tone="danger" title="Happy Mobile status unavailable">
                        {props.error}
                    </Banner>
                ) : null}
                {props.removalIncomplete ? (
                    <Box
                        className="happy-agent-mobile-settings__removal"
                        data-testid="happy-mobile-settings-removal-incomplete"
                    >
                        <Banner tone="danger" title="Couldn't remove this computer from your phone">
                            {props.message ?? props.disconnectError}
                        </Banner>
                        <Box className="happy-agent-mobile-settings__removal-actions">
                            <Button
                                disabled={blocked || props.pairingStarting === true}
                                onClick={() => props.onReconnect?.()}
                                size="small"
                                variant="ghost"
                            >
                                Keep linked
                            </Button>
                            <Button
                                disabled={blocked || props.pairingStarting === true}
                                loading={props.disconnecting}
                                onClick={() => props.onRemovalRetry?.()}
                                size="small"
                                variant="primary"
                            >
                                Try again
                            </Button>
                        </Box>
                    </Box>
                ) : props.disconnectError ? (
                    <Banner tone="danger" title="Pairing could not be removed">
                        {props.disconnectError}
                    </Banner>
                ) : null}
                {relayShown(props) ? (
                    <FormRow
                        control={
                            <HappyAgentSettingsStatus
                                label={mobile.label}
                                variant={mobile.variant}
                            />
                        }
                        description={
                            props.status === "connected"
                                ? "Phones on your Happy account reach this computer from anywhere"
                                : statusDetail(mobile.description, props)
                        }
                        label="Happy server"
                    />
                ) : null}
                {props.direct}
            </HappyAgentSettingsSection>
            {paired ? (
                <HappyAgentSettingsSection>
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
                        description={
                            props.removesComputer
                                ? "Removes this computer and its chats from the Happy server. History on this computer stays."
                                : "Forgets this computer's pairing. Your account, phones and history stay."
                        }
                        label="Disconnect this computer"
                    />
                </HappyAgentSettingsSection>
            ) : null}
            {props.pairingOptions && !props.pairingOff ? (
                <ModalOverlay onDismiss={() => props.onPairingOptionsClose?.()}>
                    <Modal
                        className="happy-agent-mobile-settings__pairing"
                        data-testid="happy-mobile-settings-pairing"
                        onClose={() => props.onPairingOptionsClose?.()}
                        size="medium"
                        title={pairingTitle}
                    >
                        {props.pairingOptions}
                    </Modal>
                </ModalOverlay>
            ) : null}
            {props.management ? (
                <MobileAccessConfirmation
                    confirmation={props.management}
                    data-testid="happy-mobile-settings-confirmation"
                    removesComputer={props.removesComputer === true}
                    onCancel={() => props.onManagementCancel?.()}
                    onConfirm={() => props.onManagementConfirm?.()}
                />
            ) : null}
        </>
    );
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
                description: "Waiting for a phone to scan the code.",
            };
        case "connected":
            return {
                label: "Connected",
                variant: "success",
                description: "Live with Happy Mobile.",
            };
        case "connecting":
            return {
                label: "Reconnecting",
                variant: "info",
                description: "Connecting the saved pairing.",
            };
        case "disconnected":
            return props.configured === true
                ? {
                      label: "Offline — pairing saved",
                      variant: "warning",
                      description: "Paired, but not connected right now.",
                  }
                : props.configured === false
                  ? {
                        label: "Not set up",
                        variant: "neutral",
                        description: "No phone is paired yet.",
                    }
                  : {
                        label: "Checking…",
                        variant: "neutral",
                        description: "Reading whether this Happy Agent has a saved pairing.",
                    };
        case "failed":
            if (props.configured === true && props.removalIncomplete)
                return {
                    label: "Removal incomplete",
                    variant: "warning",
                    description:
                        "This computer is still linked but not connected while the removal is unfinished.",
                };
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

/**
 * Whether the relay has anything to say: it is linked, or it is in a state worth
 * knowing about. An unlinked relay that is merely idle, or turned off, is left out.
 */
function relayShown(props: HappyAgentMobileSettingsProps): boolean {
    if (props.configured === true) return true;
    // A relay the Happy Agent turned off is not offered, so it is not shown.
    return (
        props.status !== "loading" && props.status !== "disconnected" && props.status !== "disabled"
    );
}

/** The state line, the Agent's own detail, and when the Agent last saw it change. */
function statusDetail(description: string, props: HappyAgentMobileSettingsProps): string {
    const parts = [description];
    // The removal banner already says it; the status line does not repeat it.
    if (
        props.message &&
        !props.removalIncomplete &&
        (props.status === "failed" || props.status === "disconnected")
    )
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
