import { useSyncExternalStore } from "react";
import type {
    HappyAgentClockStore,
    HappyAgentIntegrationSnapshot,
    HappyAgentMobileConnectorRead,
    HappyAgentMobileConnectorSnapshot,
    HappyAgentMobileConnectorStore,
    HappyMobileLinkPhase,
    HappyMobileOnboardingSnapshot,
} from "happy-desktop-state";
import {
    MobileDirectConnectionSection,
    MobilePairingOptions,
    mobileDirectPairingEngaged,
    type DesktopMobilePairingOptions,
    type MobilePairingMethod,
    type MobilePairingOptionsLayout,
    type MobileRelayPairingState,
} from "happy-desktop-ui";

/**
 * Whether this Happy Agent reports direct pairing off: its connector says
 * `disabled`, or it predates the connector and answered 404. Only a connector
 * being followed can say so; one not followed yet is not off.
 */
export function appMobileDirectOff(connector: HappyAgentMobileConnectorRead): boolean {
    return (
        connector.kind === "unsupported" ||
        (connector.kind === "ready" && connector.connector.status === "disabled")
    );
}

/** The guided setup's link step, as the relay slot shows it. */
export function appMobileRelayFromLink(phase: HappyMobileLinkPhase): MobileRelayPairingState {
    switch (phase.kind) {
        case "checking":
            return { kind: "starting" };
        case "pairing":
            return { kind: "waiting", data: phase.data, expiresAt: phase.expiresAt };
        case "failed":
            return { kind: "failed", message: phase.message };
    }
}

/** A remote Happy Agent's onboarding pairing, as the relay slot shows it. */
export function appMobileRelayFromOnboarding(
    snapshot: HappyMobileOnboardingSnapshot,
): MobileRelayPairingState {
    switch (snapshot.status) {
        case "pairing":
            return { kind: "waiting", data: snapshot.data, expiresAt: snapshot.expiresAt };
        case "failed":
            return snapshot.pending
                ? { kind: "starting" }
                : { kind: "failed", message: snapshot.message };
        case "configured":
            return { kind: "connected" };
        case "disabled":
            return { kind: "disabled" };
        default:
            return { kind: "starting" };
    }
}

/** The Happy Mobile integration in Settings, as the relay slot shows it. */
export function appMobileRelayFromIntegration(
    snapshot: HappyAgentIntegrationSnapshot,
): MobileRelayPairingState {
    if (snapshot.pairingError) return { kind: "failed", message: snapshot.pairingError.message };
    if (snapshot.configured === true) return { kind: "connected" };
    switch (snapshot.status) {
        case "pairing":
            return snapshot.pairing
                ? {
                      kind: "waiting",
                      data: snapshot.pairing.data,
                      expiresAt: snapshot.pairing.expiresAt,
                  }
                : { kind: "starting" };
        case "disabled":
            return { kind: "disabled" };
        case "unavailable":
            return { kind: "unavailable" };
        case "failed":
            return snapshot.pairingStarting
                ? { kind: "starting" }
                : {
                      kind: "failed",
                      message: snapshot.message ?? "The last pairing attempt did not finish.",
                  };
        case "disconnected":
            return snapshot.pairingStarting
                ? { kind: "starting" }
                : {
                      kind: "failed",
                      message:
                          snapshot.message ??
                          "The pairing code was cancelled. Try again for a new code.",
                  };
        default:
            return { kind: "starting" };
    }
}

export interface AppMobilePairingProps {
    readonly layout: MobilePairingOptionsLayout;
    /**
     * The method shown under the Relay | Direct control: the person's choice,
     * else the rollout's default. With Relay shown the direct connector is not
     * followed. Phones already paired directly keep working either way.
     */
    readonly method: MobilePairingMethod;
    /** The computer is already linked through the Happy server: only the direct code is offered. */
    readonly directOnly?: boolean;
    onMethodSelect(method: MobilePairingMethod): void;
    readonly relay: MobileRelayPairingState;
    readonly relayStarting?: boolean;
    onRelayRetry?(): void;
    readonly direct: HappyAgentMobileConnectorStore;
    readonly clock: HappyAgentClockStore;
    /** Why actions cannot currently reach this Happy Agent. */
    readonly unavailable?: string;
    /** Read when an action fires, so a stale render cannot act on a lost connection. */
    online(): boolean;
    onClose?(): void;
}

/**
 * The pairing methods for one Happy Agent, with what the page around them
 * needs to know: whether the emoji step leads and whether a phone paired.
 * With Relay shown the direct connection is not followed.
 * `snapshot` is the caller's one subscription to the direct connector.
 *
 * A method the Happy Agent reports off is never offered: the other one shows
 * alone, without the Relay | Direct control.
 */
export function appMobilePairingOptions(
    props: AppMobilePairingProps & { readonly snapshot: HappyAgentMobileConnectorSnapshot },
): DesktopMobilePairingOptions {
    const { connector } = props.snapshot;
    const relayOff = props.relay.kind === "disabled";
    const directOff = appMobileDirectOff(connector);
    const method: MobilePairingMethod =
        relayOff || props.directOnly ? "direct" : directOff ? "relay" : props.method;
    const shown = {
        ...props,
        method,
        methodFixed: relayOff || directOff || props.directOnly === true,
    };
    if (method === "relay")
        return {
            view: <AppMobilePairingOptions {...shown} />,
            verifying: false,
            completed: false,
            method: "relay",
        };
    return {
        view: <AppMobilePairingOptions {...shown} />,
        method: "direct",
        verifying: mobileDirectPairingEngaged(connector),
        completed:
            connector.kind === "ready" && connector.connector.pairing?.status === "completed",
    };
}

/** `appMobilePairingOptions` for a caller with no other use for the direct connector. */
export function useAppMobilePairingOptions(
    props: AppMobilePairingProps,
): DesktopMobilePairingOptions {
    const snapshot = useSyncExternalStore(
        props.direct.subscribe,
        props.direct.get,
        props.direct.get,
    );
    return appMobilePairingOptions({ ...props, snapshot });
}

/** The direct connection's status and paired phones, with its own clock for "last seen". */
export function AppMobileDirectSection(props: {
    readonly direct: HappyAgentMobileConnectorStore;
    readonly snapshot: HappyAgentMobileConnectorSnapshot;
    readonly clock: HappyAgentClockStore;
    readonly unavailable?: string;
    online(): boolean;
}) {
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const { direct, snapshot } = props;
    return (
        <MobileDirectConnectionSection
            connector={snapshot.connector}
            now={now}
            {...(snapshot.removal ? { removal: snapshot.removal } : {})}
            onDeviceRemoveRequest={direct.deviceRemoveRequest}
            onDeviceRemoveCancel={direct.deviceRemoveCancel}
            onDeviceRemoveConfirm={() => {
                if (props.online()) direct.deviceRemoveConfirm();
            }}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
        />
    );
}

/** Owns the countdown's clock subscription, so only the codes repaint every second. */
function AppMobilePairingOptions(
    props: AppMobilePairingProps & {
        readonly snapshot: HappyAgentMobileConnectorSnapshot;
        readonly methodFixed: boolean;
    },
) {
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const { snapshot } = props;
    const guarded = (action: () => void) => () => {
        if (props.online()) action();
    };
    return (
        <MobilePairingOptions
            layout={props.layout}
            now={now}
            method={props.method}
            onMethodSelect={props.onMethodSelect}
            methodFixed={props.methodFixed}
            relay={props.relay}
            {...(props.relayStarting === undefined ? {} : { relayStarting: props.relayStarting })}
            {...(props.onRelayRetry ? { onRelayRetry: guarded(props.onRelayRetry) } : {})}
            direct={snapshot.connector}
            directStarting={snapshot.starting}
            directConfirming={snapshot.confirming}
            directCancelling={snapshot.cancelling}
            {...(snapshot.actionError ? { directActionError: snapshot.actionError } : {})}
            onDirectStart={guarded(props.direct.pairingStart)}
            onDirectConfirm={guarded(props.direct.pairingConfirm)}
            onDirectReject={guarded(props.direct.pairingReject)}
            {...(props.onClose ? { onClose: props.onClose } : {})}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
        />
    );
}
