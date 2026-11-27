import { useSyncExternalStore } from "react";
import type {
    HappyAgentClockStore,
    HappyAgentMobileConnectorRead,
    HappyAgentMobileConnectorSnapshot,
    HappyAgentMobileConnectorStore,
} from "happy-desktop-state";
import {
    MobileDirectConnectionSection,
    MobilePairingOptions,
    mobileDirectPairingEngaged,
    type DesktopMobilePairingOptions,
    type MobilePairingOptionsLayout,
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

export interface AppMobilePairingProps {
    readonly layout: MobilePairingOptionsLayout;
    readonly direct: HappyAgentMobileConnectorStore;
    readonly clock: HappyAgentClockStore;
    /** Why actions cannot currently reach this Happy Agent. */
    readonly unavailable?: string;
    /** Read when an action fires, so a stale render cannot act on a lost connection. */
    online(): boolean;
}

/**
 * The direct pairing code for one Happy Agent, with what the page around it
 * needs to know: whether the emoji step leads and whether a phone paired.
 * `snapshot` is the caller's one subscription to the direct connector. A
 * Happy Agent that reports direct off shows that in the code's place.
 */
export function appMobilePairingOptions(
    props: AppMobilePairingProps & { readonly snapshot: HappyAgentMobileConnectorSnapshot },
): DesktopMobilePairingOptions {
    const { connector } = props.snapshot;
    return {
        view: <AppMobilePairingOptions {...props} />,
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

/** Owns the countdown's clock subscription, so only the code repaints every second. */
function AppMobilePairingOptions(
    props: AppMobilePairingProps & { readonly snapshot: HappyAgentMobileConnectorSnapshot },
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
            direct={snapshot.connector}
            directStarting={snapshot.starting}
            directConfirming={snapshot.confirming}
            directCancelling={snapshot.cancelling}
            {...(snapshot.actionError ? { directActionError: snapshot.actionError } : {})}
            onDirectStart={guarded(props.direct.pairingStart)}
            onDirectConfirm={guarded(props.direct.pairingConfirm)}
            onDirectReject={guarded(props.direct.pairingReject)}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
        />
    );
}
