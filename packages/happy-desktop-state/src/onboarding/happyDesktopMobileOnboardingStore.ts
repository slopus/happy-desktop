import type { HappyIntegration } from "@slopus/happy-agent-client";
import { happyAgentMobileConnectorStoreNoop } from "../happyAgent/happyAgentMobileConnectorStore.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import {
    HAPPY_MOBILE_CODE_EXPIRED,
    happyMobileDirectPaired,
    type HappyDesktopMobileStep,
    type HappyMobileOnboardingSnapshot,
    type HappyMobileOnboardingStore,
    type HappyMobileOnboardingStoreOptions,
} from "./happyMobileOnboardingStore.js";

/**
 * The shortest time the code's placeholder stays up. A code that arrives
 * sooner waits out the rest, so the placeholder never flashes for a frame.
 */
const CODE_PLACEHOLDER_MINIMUM_MS = 1_000;

/**
 * The guided phone setup: the store code first, then the pairing codes for
 * Happy Agent, relay and direct side by side. The phone reaches this computer
 * through Happy Agent alone, so nothing is installed on the computer for it.
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
    let generation = 0;
    let integration: HappyIntegration | undefined;
    let network: AbortController | undefined;
    let networkError: string | undefined;
    let reading = false;
    let transportOnline = false;
    let pairing = false;
    let pairingError: string | undefined;
    /** Until when a code that has already arrived is still held back. */
    let codeHeldUntil = 0;
    let codeTimer: ReturnType<typeof setTimeout> | undefined;

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
        if (!consented) return { kind: "intro" };
        // An unsuccessful read is not evidence that there is no saved pairing.
        if (!integration || networkError || reading)
            return {
                kind: "link",
                phase:
                    networkError && !reading
                        ? { kind: "failed", message: networkError }
                        : { kind: "checking" },
            };
        if (pairingError) return { kind: "link", phase: { kind: "failed", message: pairingError } };
        if (integration.status === "pairing" && Date.now() < codeHeldUntil)
            return { kind: "link", phase: { kind: "checking" } };
        if (integration.status === "pairing")
            return {
                kind: "link",
                phase: {
                    kind: "pairing",
                    data: integration.authorization.data,
                    expiresAt: integration.authorization.expiresAt,
                },
            };
        if (integration.status === "failed")
            return { kind: "link", phase: { kind: "failed", message: integration.error.message } };
        return {
            kind: "link",
            phase: pairing
                ? { kind: "checking" }
                : {
                      kind: "failed",
                      message:
                          "The pairing code expired or was cancelled. Try again for a new code.",
                  },
        };
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
        // A relay this Happy Agent turned off is not offered: the phone step
        // is over, as it is for a remote Happy Agent's onboarding.
        const relayOff =
            integration !== undefined &&
            !integration.configured &&
            integration.status === "disabled";
        snapshot = skipped
            ? { status: "skipped" }
            : continued
              ? { status: "configured" }
              : relayOff
                ? { status: "disabled" }
                : { status: "desktop", step: step() };
        directSync();
        for (const listener of listeners) listener();
    };
    const stop = () => {
        network?.abort();
        network = undefined;
        transportOnline = false;
        clearTimeout(codeTimer);
        codeTimer = undefined;
    };
    const currentFor = (request: number) => () => active() && request === generation;
    function adopt(next: HappyIntegration, authoritative = false): void {
        if (!active()) return;
        if (!authoritative && integration && integration.version.localeCompare(next.version) > 0)
            return;
        const expired =
            integration?.status === "pairing" &&
            next.status === "failed" &&
            !next.configured &&
            next.error.code === HAPPY_MOBILE_CODE_EXPIRED;
        integration = next;
        networkError = undefined;
        // A code that ran out unused while on screen is replaced, not reported.
        if (expired && consented && !pairing && !pairingError && !happyMobileDirectPaired(direct)) {
            pair();
            return;
        }
        publish();
    }
    /** Shows a held code once its placeholder has been up for the minimum. */
    function codeRelease(): void {
        const remaining = codeHeldUntil - Date.now();
        if (remaining <= 0 || codeTimer) return;
        codeTimer = setTimeout(() => {
            codeTimer = undefined;
            publish();
        }, remaining);
    }
    function pair(): void {
        if (!active() || !consented || pairing) return;
        pairing = true;
        pairingError = undefined;
        networkError = undefined;
        codeHeldUntil = Date.now() + CODE_PLACEHOLDER_MINIMUM_MS;
        const current = currentFor(generation);
        publish();
        void (async () => {
            // Recheck saved authorization so a second window/phone cannot force a rescan.
            const saved = await options.client.getHappyIntegration();
            if (!current()) return;
            if (
                saved.integration.configured ||
                saved.integration.status === "pairing" ||
                saved.integration.status === "disabled"
            ) {
                pairing = false;
                adopt(saved.integration);
                codeRelease();
                return;
            }
            const response = await options.client.startHappyIntegration();
            if (!current()) {
                if (!disposed && skipped && response.integration.status === "pairing")
                    void options.client.cancelHappyIntegration().catch(() => undefined);
                return;
            }
            pairing = false;
            adopt(response.integration);
            codeRelease();
        })().catch((error: unknown) => {
            if (!current()) return;
            pairing = false;
            pairingError = errorMessage(error);
            publish();
        });
    }
    async function read(signal: AbortSignal): Promise<void> {
        const response = await options.client.getHappyIntegration({ signal });
        if (!signal.aborted) {
            transportOnline = true;
            adopt(response.integration);
        }
    }
    function retryRead(): void {
        if (!active() || reading) return;
        start();
        const signal = network?.signal;
        if (!signal) return;
        reading = true;
        const current = currentFor(generation);
        publish();
        void read(signal)
            .catch((error: unknown) => {
                if (!current() || signal.aborted) return;
                transportOnline = false;
                networkError = errorMessage(error);
            })
            .finally(() => {
                if (!current()) return;
                reading = false;
                publish();
                // The read was only ever in the way of the code someone asked for.
                if (!networkError) pair();
            });
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
                    if (!input.bootstrap.happyIntegration)
                        throw new Error("This Happy Agent does not support Happy Mobile pairing.");
                    transportOnline = true;
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
            // A screen that comes back within the hold still gets its code.
            codeRelease();
            return () => {
                listeners.delete(listener);
                if (listeners.size) return;
                generation += 1;
                reading = false;
                stop();
                if (pairing) {
                    pairing = false;
                    pairingError = "Setup paused. Try again to connect your phone.";
                }
                publish();
            };
        },
        happyMobileConnect() {
            if (!active() || snapshot.status !== "desktop") return;
            // A phone paired directly: phone setup is done whatever the relay says.
            const directPaired =
                snapshot.step.kind === "link" && directOpen && happyMobileDirectPaired(direct);
            if (snapshot.step.kind === "connected" || directPaired) {
                const cancel = directPaired && integration?.status === "pairing";
                continued = true;
                publish();
                stop();
                if (cancel) void options.client.cancelHappyIntegration().catch(() => undefined);
                return;
            }
            // The first screen shows the store code, so confirming it is both
            // the consent and the person saying the app is installed.
            consented = true;
            if (!integration || networkError) {
                retryRead();
                return;
            }
            pair();
        },
        happyMobileSkip() {
            if (!active()) return;
            const cancel = consented && integration?.status === "pairing";
            skipped = true;
            generation += 1;
            stop();
            publish();
            options.onOutput?.({ type: "happyMobileSkipped" });
            if (cancel) void options.client.cancelHappyIntegration().catch(() => undefined);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            const cancel = !skipped && !continued && consented && integration?.status === "pairing";
            if (directOpen) direct.pairingClose();
            directOpen = false;
            disposed = true;
            generation += 1;
            stop();
            listeners.clear();
            // Nothing is shown any more, so nothing is held back either.
            codeHeldUntil = 0;
            if (cancel) void options.client.cancelHappyIntegration().catch(() => undefined);
        },
    };
}
