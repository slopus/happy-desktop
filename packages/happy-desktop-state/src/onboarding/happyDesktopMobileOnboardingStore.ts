import type { HappyIntegration } from "@slopus/happy-agent-client";
import { happyAgentMobileConnectorStoreNoop } from "../happyAgent/happyAgentMobileConnectorStore.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import {
    happyMobileDirectPaired,
    type HappyDesktopMobileStep,
    type HappyMobileOnboardingSnapshot,
    type HappyMobileOnboardingStore,
    type HappyMobileOnboardingStoreOptions,
} from "./happyMobileOnboardingStore.js";

/**
 * The guided phone setup: the store code first, then the direct pairing code.
 * The phone reaches this computer through Happy Agent alone, so nothing is
 * installed on the computer for it. The Happy Agent's integration is read only
 * to learn whether this computer is already linked through the Happy server;
 * the desktop never starts a relay pairing.
 */
export function happyDesktopMobileOnboardingStoreCreate(
    options: HappyMobileOnboardingStoreOptions,
): HappyMobileOnboardingStore {
    const listeners = new Set<() => void>();
    const direct = options.mobileConnector ?? happyAgentMobileConnectorStoreNoop;
    let directOpen = false;
    let snapshot: HappyMobileOnboardingSnapshot = options.initialSkipped
        ? { status: "skipped" }
        : { status: "desktop", step: { kind: "intro" } };
    let consented = false;
    let skipped = options.initialSkipped === true;
    let continued = false;
    let disposed = false;
    let integration: HappyIntegration | undefined;
    let network: AbortController | undefined;
    let networkError: string | undefined;
    let transportOnline = false;

    const active = () => !disposed && !skipped && !continued && listeners.size > 0;
    const errorMessage = (error: unknown) => happyAgentUserError(error).message;
    const step = (): HappyDesktopMobileStep => {
        // A saved pairing is the finished state, whether it was made just now
        // or on an earlier run: there is nothing left to ask for.
        if (integration?.configured) {
            const online = integration.status === "connected" && transportOnline && !networkError;
            return {
                kind: "connected",
                online,
                ...(!online
                    ? {
                          message:
                              networkError ??
                              "Your pairing is saved. Remote control resumes when this computer is online.",
                      }
                    : {}),
            };
        }
        return consented ? { kind: "link" } : { kind: "intro" };
    };
    /** The direct code is offered exactly while the link step is on screen. */
    const directSync = () => {
        const wanted = active() && snapshot.status === "desktop" && snapshot.step.kind === "link";
        if (wanted === directOpen) return;
        directOpen = wanted;
        if (wanted) direct.pairingOpen();
        else direct.pairingClose();
    };
    const publish = () => {
        if (disposed) return;
        snapshot = skipped
            ? { status: "skipped" }
            : continued
              ? { status: "configured" }
              : { status: "desktop", step: step() };
        directSync();
        for (const listener of listeners) listener();
    };
    const stop = () => {
        network?.abort();
        network = undefined;
        transportOnline = false;
    };
    function adopt(next: HappyIntegration, authoritative = false): void {
        if (!active()) return;
        if (!authoritative && integration && integration.version.localeCompare(next.version) > 0)
            return;
        integration = next;
        networkError = undefined;
        publish();
    }
    async function read(signal: AbortSignal): Promise<void> {
        const response = await options.client.getHappyIntegration({ signal });
        if (!signal.aborted) {
            transportOnline = true;
            adopt(response.integration);
        }
    }
    async function follow(abort: AbortController): Promise<void> {
        for await (const input of options.sync.follow({
            signal: abort.signal,
            events: ["happy.integration.updated"],
        })) {
            if (abort.signal.aborted) return;
            try {
                if (input.kind === "error") throw input.error;
                if (input.kind === "bootstrap") {
                    transportOnline = true;
                    // Without a relay integration nothing is linked through it.
                    if (!input.bootstrap.happyIntegration) continue;
                    // A fresh daemon bootstrap establishes a new version baseline.
                    adopt(input.bootstrap.happyIntegration, true);
                } else if (
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected")
                ) {
                    await read(abort.signal);
                } else if (
                    input.kind === "update" &&
                    (input.update.kind === "disconnected" || input.update.kind === "draining")
                ) {
                    transportOnline = false;
                    networkError =
                        "Happy cannot reach the local Happy Agent. Reconnect and try again.";
                    publish();
                } else if (
                    input.kind === "update" &&
                    input.update.kind === "event" &&
                    input.update.event.type === "happy.integration.updated"
                ) {
                    adopt(input.update.event.payload.integration);
                }
            } catch (error) {
                if (abort.signal.aborted) return;
                transportOnline = false;
                networkError = errorMessage(error);
                publish();
            }
        }
    }
    function start(): void {
        if (!active() || network) return;
        const abort = new AbortController();
        network = abort;
        void follow(abort)
            .catch((error: unknown) => {
                if (abort.signal.aborted) return;
                transportOnline = false;
                networkError = errorMessage(error);
                publish();
            })
            .finally(() => {
                if (network === abort) {
                    network = undefined;
                    transportOnline = false;
                    publish();
                }
            });
    }
    return {
        direct,
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            directSync();
            return () => {
                listeners.delete(listener);
                if (listeners.size) return;
                stop();
                publish();
            };
        },
        happyMobileConnect() {
            if (!active() || snapshot.status !== "desktop") return;
            // A phone paired directly: phone setup is done.
            const directPaired =
                snapshot.step.kind === "link" && directOpen && happyMobileDirectPaired(direct);
            if (snapshot.step.kind === "connected" || directPaired) {
                continued = true;
                publish();
                stop();
                return;
            }
            // The first screen shows the store code, so confirming it is both
            // the consent and the person saying the app is installed.
            consented = true;
            publish();
        },
        happyMobileSkip() {
            if (!active()) return;
            skipped = true;
            stop();
            publish();
            options.onOutput?.({ type: "happyMobileSkipped" });
        },
        [Symbol.dispose]() {
            if (disposed) return;
            if (directOpen) direct.pairingClose();
            directOpen = false;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
