import {
    HappyAgentApiError,
    type HappyAgentClient,
    type MobileConnector,
    type MobileConnectorResponse,
} from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/** The caller's connector socket, pairing, and paired phones, without its ordering stamp. */
export type HappyAgentMobileConnector = Pick<
    MobileConnector,
    "status" | "pairing" | "devices" | "error"
>;

/** What this Happy Agent has said about its mobile connector. */
export type HappyAgentMobileConnectorRead =
    | { readonly kind: "loading" }
    /** The daemon predates the mobile connector (protocol 27) and answered 404. */
    | { readonly kind: "unsupported" }
    | { readonly kind: "read-failed"; readonly message: string }
    | { readonly kind: "ready"; readonly connector: HappyAgentMobileConnector };

/** The open Remove confirmation for one paired phone. */
export interface HappyAgentMobileDeviceRemoval {
    readonly deviceId: string;
    readonly pending: boolean;
    readonly error?: string;
}

export interface HappyAgentMobileConnectorSnapshot {
    readonly connector: HappyAgentMobileConnectorRead;
    /** A pairing surface is open: a code is kept on screen and replaced when it expires. */
    readonly pairingOpen: boolean;
    readonly starting: boolean;
    readonly confirming: boolean;
    readonly cancelling: boolean;
    /** Why the last start, confirm, or cancel was refused. Cleared by the next one. */
    readonly actionError?: string;
    readonly removal?: HappyAgentMobileDeviceRemoval;
}

/**
 * One Happy Agent's mobile connector: the phones paired directly with it and
 * the pairing that adds one. It stays with its Happy Agent through outages and
 * reconciles when the connection returns.
 */
export interface HappyAgentMobileConnectorStore {
    get(): HappyAgentMobileConnectorSnapshot;
    subscribe(listener: () => void): () => void;
    /** A pairing surface opened: show a code now and keep one until it closes. */
    pairingOpen(): void;
    /** The pairing surface closed: a pairing still in progress is cancelled. */
    pairingClose(): void;
    /** Replaces the current pairing with a new code. */
    pairingStart(): void;
    /** The person says the emoji match. */
    pairingConfirm(): void;
    /** The person says the emoji don't match, or stops the pairing. */
    pairingReject(): void;
    deviceRemoveRequest(deviceId: string): void;
    deviceRemoveCancel(): void;
    deviceRemoveConfirm(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentMobileConnectorStoreDeps {
    readonly sync: HappyAgentSync;
    readonly client: Pick<
        HappyAgentClient,
        | "getMobileConnector"
        | "startMobilePairing"
        | "confirmMobilePairing"
        | "cancelMobilePairing"
        | "removeMobileDevice"
    >;
}

const INITIAL: HappyAgentMobileConnectorSnapshot = {
    connector: { kind: "loading" },
    pairingOpen: false,
    starting: false,
    confirming: false,
    cancelling: false,
};

/** An older daemon has no such route. */
const UNSUPPORTED = Symbol("unsupported");

function pairingActive(connector: HappyAgentMobileConnector): boolean {
    const status = connector.pairing?.status;
    return status === "waiting" || status === "verifying";
}

/**
 * Creates the mobile connector store for one Happy Agent connection.
 *
 * The constructor opens nothing. The first subscriber reads the snapshot and
 * follows `mobile_connector.updated`; every response and event is a complete
 * snapshot, and the one with the greater version wins. The last subscriber
 * leaving closes an open pairing surface, which cancels its pairing.
 */
export function happyAgentMobileConnectorStoreCreate(
    deps: HappyAgentMobileConnectorStoreDeps,
): HappyAgentMobileConnectorStore {
    const store = createStore<HappyAgentMobileConnectorSnapshot>()(() => INITIAL);
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let disposed = false;
    let version: string | undefined;
    /** The open surface still owes a code: decided once the snapshot is known. */
    let startOwed = false;
    /** Increments when a surface opens or closes, so a late start knows it is unwanted. */
    let openGeneration = 0;

    const connectorOf = (): HappyAgentMobileConnector | undefined => {
        const read = store.getState().connector;
        return read.kind === "ready" ? read.connector : undefined;
    };

    const adopt = (next: MobileConnector): void => {
        if (disposed) return;
        if (version !== undefined && version.localeCompare(next.version) >= 0) return;
        version = next.version;
        const { status, pairing, devices, error } = next;
        const current = store.getState();
        const removalGone =
            current.removal !== undefined &&
            !current.removal.pending &&
            !devices.some((device) => device.id === current.removal?.deviceId);
        const { removal: _removal, ...rest } = current;
        store.setState(
            {
                ...(removalGone ? rest : current),
                connector: { kind: "ready", connector: { status, pairing, devices, error } },
            },
            true,
        );
        refresh();
    };
    const adoptResponse = (response: MobileConnectorResponse): void =>
        adopt(response.mobileConnector);

    /**
     * Keeps a code on an open surface: the first one, and a new one when it
     * expires unused. Only while something shows the connector: a pairing
     * opened with nothing on screen (a pairing page showing Relay)
     * makes no code until a surface follows it.
     */
    function refresh(): void {
        const current = store.getState();
        const connector = connectorOf();
        if (disposed || listeners.size === 0) return;
        if (!current.pairingOpen || current.starting || !connector) return;
        if (connector.status === "disabled") {
            startOwed = false;
            return;
        }
        const pairing = connector.pairing;
        if (startOwed) {
            startOwed = false;
            // Another window's code for the same owner is still good; show it.
            if (pairingActive(connector)) return;
            start();
            return;
        }
        if (pairing?.status === "expired" && pairing.device === null) start();
    }

    function start(): void {
        const current = store.getState();
        if (disposed || current.starting) return;
        const { actionError: _cleared, ...rest } = current;
        store.setState({ ...rest, starting: true }, true);
        const generation = openGeneration;
        void deps.client.startMobilePairing().then(
            (response) => {
                if (disposed) return;
                store.setState({ starting: false });
                adoptResponse(response);
                // The surface closed while the code was on its way.
                if (generation !== openGeneration && !store.getState().pairingOpen) {
                    const pairing = response.mobileConnector.pairing;
                    if (pairing && (pairing.status === "waiting" || pairing.status === "verifying"))
                        cancel(pairing.id);
                }
            },
            (error: unknown) => {
                if (disposed) return;
                store.setState({
                    starting: false,
                    actionError: happyAgentUserError(error).message,
                });
            },
        );
    }

    function cancel(pairingId: string): void {
        store.setState({ cancelling: true });
        void deps.client.cancelMobilePairing(pairingId).then(
            (response) => {
                if (disposed) return;
                store.setState({ cancelling: false });
                adoptResponse(response);
            },
            (error: unknown) => {
                if (disposed) return;
                store.setState({
                    cancelling: false,
                    actionError: happyAgentUserError(error).message,
                });
            },
        );
    }

    const read = async (signal: AbortSignal): Promise<void> => {
        const response = await happyAgentSyncRead(
            signal,
            async () => {
                try {
                    return await deps.client.getMobileConnector({ signal });
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 404)
                        return UNSUPPORTED;
                    throw error;
                }
            },
            (error) => {
                // Keep what is already known; only a first read has nothing to show.
                if (store.getState().connector.kind !== "ready")
                    store.setState({
                        connector: {
                            kind: "read-failed",
                            message: happyAgentUserError(error).message,
                        },
                    });
            },
        );
        if (signal.aborted || disposed) return;
        if (response === UNSUPPORTED) {
            version = undefined;
            startOwed = false;
            store.setState({ connector: { kind: "unsupported" } });
            return;
        }
        adoptResponse(response);
        // A surface that just began following may be owed a code, even when
        // this read is the snapshot already held.
        refresh();
    };

    const follow = async (active: AbortController): Promise<void> => {
        for await (const input of deps.sync.follow({
            signal: active.signal,
            events: ["mobile_connector.updated"],
        })) {
            if (active.signal.aborted) return;
            try {
                if (input.kind === "error") throw input.error;
                if (input.kind === "bootstrap") {
                    // A fresh daemon bootstrap starts a new version baseline.
                    version = undefined;
                    await read(active.signal);
                } else if (input.kind === "reconcile") {
                    await read(active.signal);
                } else if (input.update.kind === "connected") {
                    await read(active.signal);
                } else if (
                    input.update.kind === "event" &&
                    input.update.event.type === "mobile_connector.updated"
                ) {
                    adopt(input.update.event.payload.mobileConnector);
                }
            } catch (error) {
                if (active.signal.aborted) return;
                if (store.getState().connector.kind !== "ready")
                    store.setState({
                        connector: {
                            kind: "read-failed",
                            message: happyAgentUserError(error).message,
                        },
                    });
            }
        }
    };

    const followEnsure = (): void => {
        if (disposed || listeners.size === 0 || controller !== undefined) return;
        const active = new AbortController();
        controller = active;
        void follow(active)
            .catch(() => undefined)
            .finally(() => {
                if (controller === active) controller = undefined;
            });
    };

    const connectorStore: HappyAgentMobileConnectorStore = {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followEnsure();
                // A snapshot already read lets a pairing opened before this
                // surface start its code now, not after the read comes back.
                refresh();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size !== 0) return;
                controller?.abort();
                controller = undefined;
                // No surface is left to show a code or the emoji.
                connectorStore.pairingClose();
                if (!store.getState().removal?.pending) {
                    const { removal: _closed, ...rest } = store.getState();
                    store.setState(rest, true);
                }
            };
        },
        pairingOpen() {
            if (disposed || store.getState().pairingOpen) return;
            openGeneration += 1;
            startOwed = true;
            const { actionError: _cleared, ...rest } = store.getState();
            // A pairing that already settled belongs to an earlier surface: this one
            // starts afresh, and nothing reads the old one as this one's result.
            const read = rest.connector;
            const connector =
                read.kind === "ready" && read.connector.pairing && !pairingActive(read.connector)
                    ? { ...read, connector: { ...read.connector, pairing: null } }
                    : read;
            store.setState({ ...rest, connector, pairingOpen: true }, true);
            refresh();
        },
        pairingClose() {
            if (disposed || !store.getState().pairingOpen) return;
            openGeneration += 1;
            startOwed = false;
            const { actionError: _cleared, ...rest } = store.getState();
            store.setState({ ...rest, pairingOpen: false }, true);
            const connector = connectorOf();
            if (connector?.pairing && pairingActive(connector)) cancel(connector.pairing.id);
        },
        pairingStart() {
            const connector = connectorOf();
            if (disposed || !connector || connector.status === "disabled") return;
            start();
        },
        pairingConfirm() {
            const current = store.getState();
            const pairing = connectorOf()?.pairing;
            if (disposed || current.confirming || pairing?.status !== "verifying") return;
            if (pairing.desktopConfirmed) return;
            const { actionError: _cleared, ...rest } = current;
            store.setState({ ...rest, confirming: true }, true);
            void deps.client.confirmMobilePairing(pairing.id).then(
                (response) => {
                    if (disposed) return;
                    store.setState({ confirming: false });
                    adoptResponse(response);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState({
                        confirming: false,
                        actionError: happyAgentUserError(error).message,
                    });
                },
            );
        },
        pairingReject() {
            const current = store.getState();
            const pairing = connectorOf()?.pairing;
            if (disposed || current.cancelling || !pairing) return;
            const { actionError: _cleared, ...rest } = current;
            store.setState(rest, true);
            cancel(pairing.id);
        },
        deviceRemoveRequest(deviceId) {
            const current = store.getState();
            if (
                disposed ||
                current.removal?.pending ||
                !connectorOf()?.devices.some((device) => device.id === deviceId)
            )
                return;
            store.setState({ removal: { deviceId, pending: false } });
        },
        deviceRemoveCancel() {
            const current = store.getState();
            if (disposed || !current.removal || current.removal.pending) return;
            const { removal: _closed, ...rest } = current;
            store.setState(rest, true);
        },
        deviceRemoveConfirm() {
            const removal = store.getState().removal;
            if (disposed || !removal || removal.pending) return;
            const { deviceId } = removal;
            store.setState({ removal: { deviceId, pending: true } });
            void deps.client.removeMobileDevice(deviceId).then(
                (response) => {
                    if (disposed) return;
                    const { removal: _closed, ...rest } = store.getState();
                    store.setState(rest, true);
                    adoptResponse(response);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState({
                        removal: {
                            deviceId,
                            pending: false,
                            error: happyAgentUserError(error).message,
                        },
                    });
                },
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            const connector = connectorOf();
            const cancelOwed =
                store.getState().pairingOpen && connector?.pairing && pairingActive(connector)
                    ? connector.pairing.id
                    : undefined;
            disposed = true;
            controller?.abort();
            controller = undefined;
            listeners.clear();
            if (cancelOwed) void deps.client.cancelMobilePairing(cancelOwed).catch(() => undefined);
        },
    };
    return connectorStore;
}

const NOOP_SNAPSHOT: HappyAgentMobileConnectorSnapshot = {
    ...INITIAL,
    connector: { kind: "unsupported" },
};

/** A settled stand-in where this window has no Happy Agent connection to ask. */
export const happyAgentMobileConnectorStoreNoop: HappyAgentMobileConnectorStore = {
    get: () => NOOP_SNAPSHOT,
    subscribe: () => () => undefined,
    pairingOpen: () => undefined,
    pairingClose: () => undefined,
    pairingStart: () => undefined,
    pairingConfirm: () => undefined,
    pairingReject: () => undefined,
    deviceRemoveRequest: () => undefined,
    deviceRemoveCancel: () => undefined,
    deviceRemoveConfirm: () => undefined,
    [Symbol.dispose]: () => undefined,
};
