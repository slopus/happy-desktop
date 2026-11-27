import type { HappyAgentClient, HappyIntegration } from "@slopus/happy-agent-client";
import {
    happyAgentMobileConnectorStoreNoop,
    type HappyAgentMobileConnectorStore,
} from "../happyAgent/happyAgentMobileConnectorStore.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyDesktopMobileOnboardingStoreCreate } from "./happyDesktopMobileOnboardingStore.js";

export type HappyDesktopMobileStep =
    /** The download code; confirming it is the consent that starts setup. */
    | { readonly kind: "intro" }
    /** The direct pairing code; the direct connector says how far it got. */
    | { readonly kind: "link" }
    | { readonly kind: "connected"; readonly online: boolean; readonly message?: string };

export type HappyMobileOnboardingSnapshot =
    | { readonly status: "desktop"; readonly step: HappyDesktopMobileStep }
    | { readonly status: "checking" }
    | { readonly message?: string; readonly status: "offer" }
    /** The direct pairing code is on screen; the direct connector says how far it got. */
    | { readonly status: "pairing" }
    | { readonly status: "configured" }
    | { readonly status: "skipped" };

export type HappyMobileOnboardingOutput = { readonly type: "happyMobileSkipped" };

export interface HappyMobileOnboardingStore {
    /** The same Happy Agent's direct connector. Its pairing is open while this flow shows its code. */
    readonly direct: HappyAgentMobileConnectorStore;
    get(): HappyMobileOnboardingSnapshot;
    subscribe(listener: () => void): () => void;
    happyMobileConnect(): void;
    happyMobileSkip(): void;
    [Symbol.dispose](): void;
}

export interface HappyMobileOnboardingStoreOptions {
    readonly sync: HappyAgentSync;
    readonly client: Pick<HappyAgentClient, "getHappyIntegration">;
    readonly initialSkipped?: boolean;
    /** The direct connector whose code this flow offers. */
    readonly mobileConnector?: HappyAgentMobileConnectorStore;
    /**
     * The guided flow: store code and platform pick, then the pairing code, on
     * one setup surface. The local desktop uses it; remote Happy Agents keep
     * their offer-then-pair flow.
     */
    readonly guided?: boolean;
    readonly onOutput?: (output: HappyMobileOnboardingOutput) => void;
}

const CHECKING: HappyMobileOnboardingSnapshot = { status: "checking" };
const CONFIGURED: HappyMobileOnboardingSnapshot = { status: "configured" };
const PAIRING: HappyMobileOnboardingSnapshot = { status: "pairing" };
const SKIPPED: HappyMobileOnboardingSnapshot = { status: "skipped" };

/** Whether the direct connector has just paired a phone, which finishes phone setup too. */
export function happyMobileDirectPaired(direct: HappyAgentMobileConnectorStore): boolean {
    const read = direct.get().connector;
    return read.kind === "ready" && read.connector.pairing?.status === "completed";
}

function resolved(snapshot: HappyMobileOnboardingSnapshot): boolean {
    return snapshot.status === "configured" || snapshot.status === "skipped";
}

/**
 * The optional Happy Mobile step: an offer, then the direct pairing code.
 * The Happy Agent's integration is read only to learn whether this computer
 * is already linked through the Happy server, which finishes the step; the
 * desktop never starts a relay pairing.
 *
 * The constructor opens nothing. The first subscriber takes a race-free
 * shared bootstrap or a narrow integration read and follows the connection's
 * shared journal; the last subscriber aborts its read immediately. Configured
 * and skipped are terminal for onboarding, so they stop transport even while
 * the screen that follows remains mounted.
 */
export function happyMobileOnboardingStoreCreate(
    options: HappyMobileOnboardingStoreOptions,
): HappyMobileOnboardingStore {
    if (options.guided) return happyDesktopMobileOnboardingStoreCreate(options);
    const listeners = new Set<() => void>();
    const direct = options.mobileConnector ?? happyAgentMobileConnectorStoreNoop;
    let directOpen = false;
    let snapshot: HappyMobileOnboardingSnapshot = options.initialSkipped ? SKIPPED : CHECKING;
    let version: string | undefined;
    let networkAbort: AbortController | undefined;
    let disposed = false;

    /** The direct code is offered exactly while the pairing view is on screen. */
    const directSync = (): void => {
        const wanted = !disposed && listeners.size > 0 && snapshot.status === "pairing";
        if (wanted === directOpen) return;
        directOpen = wanted;
        if (wanted) direct.pairingOpen();
        else direct.pairingClose();
    };
    const publish = (next: HappyMobileOnboardingSnapshot): void => {
        if (disposed) return;
        snapshot = next;
        directSync();
        for (const listener of listeners) listener();
    };
    const networkStop = (): void => {
        networkAbort?.abort();
        networkAbort = undefined;
    };
    /** A read that failed is no reason to hold back the direct code; the offer says why. */
    const readFailed = (error: unknown): void => {
        if (snapshot.status !== "checking" && snapshot.status !== "offer") return;
        publish({
            message: `Happy could not read Happy Mobile setup. ${happyAgentUserError(error).message}`,
            status: "offer",
        });
    };
    const integrationAdopt = (integration: HappyIntegration): void => {
        if (disposed || resolved(snapshot)) return;
        if (version !== undefined && version.localeCompare(integration.version) > 0) return;
        version = integration.version;
        if (integration.configured) {
            publish(CONFIGURED);
            networkStop();
            return;
        }
        if (snapshot.status === "checking" || snapshot.status === "offer")
            publish({ status: "offer" });
    };
    const follow = async (abort: AbortController): Promise<void> => {
        const integrationRead = () =>
            happyAgentSyncRead(
                abort.signal,
                () => options.client.getHappyIntegration({ signal: abort.signal }),
                readFailed,
            );
        for await (const input of options.sync.follow({
            signal: abort.signal,
            events: ["happy.integration.updated"],
        })) {
            try {
                if (input.kind === "error") throw input.error;
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" &&
                        input.update.kind === "connected" &&
                        snapshot.status === "offer" &&
                        snapshot.message !== undefined)
                ) {
                    const integration =
                        input.kind === "bootstrap"
                            ? input.bootstrap.happyIntegration
                            : (await integrationRead()).integration;
                    if (abort.signal.aborted) return;
                    if (input.kind === "bootstrap") version = undefined;
                    // Without a relay integration nothing is linked through it.
                    if (!integration) {
                        if (snapshot.status === "checking") publish({ status: "offer" });
                        continue;
                    }
                    integrationAdopt(integration);
                    if (abort.signal.aborted || resolved(snapshot)) return;
                    continue;
                }
                const update = input.update;
                if (update.kind === "event" && update.event.type === "happy.integration.updated") {
                    integrationAdopt(update.event.payload.integration);
                    if (abort.signal.aborted || resolved(snapshot)) return;
                }
            } catch (error) {
                if (!abort.signal.aborted) readFailed(error);
            }
        }
    };
    const networkEnsure = (): void => {
        if (disposed || listeners.size === 0 || networkAbort || resolved(snapshot)) return;
        const abort = new AbortController();
        networkAbort = abort;
        void follow(abort)
            .catch((error: unknown) => {
                if (!abort.signal.aborted) readFailed(error);
            })
            .finally(() => {
                if (networkAbort === abort) networkAbort = undefined;
            });
    };

    const store: HappyMobileOnboardingStore = {
        direct,
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (listeners.size === 1) {
                networkEnsure();
                directSync();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    directSync();
                    networkStop();
                }
            };
        },
        happyMobileConnect() {
            if (disposed) return;
            // A phone paired directly: phone setup is done.
            if (directOpen && happyMobileDirectPaired(direct)) {
                publish(CONFIGURED);
                networkStop();
                return;
            }
            if (snapshot.status === "offer") publish(PAIRING);
        },
        happyMobileSkip() {
            if (disposed || resolved(snapshot)) return;
            publish(SKIPPED);
            networkStop();
            options.onOutput?.({ type: "happyMobileSkipped" });
        },
        [Symbol.dispose]() {
            if (directOpen) direct.pairingClose();
            directOpen = false;
            disposed = true;
            networkStop();
            listeners.clear();
        },
    };
    return store;
}
