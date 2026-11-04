import type {
    AnalyticsEvents,
    AnalyticsMobilePairingMethod,
    AnalyticsMobilePairingSurface,
} from "happy-desktop-analytics";
import type {
    HappyAgentIntegrationSnapshot,
    HappyAgentIntegrationStore,
    HappyAgentMobileConnectorSnapshot,
    HappyAgentMobileConnectorStore,
    HappyDesktopMobileStep,
    HappyMobileOnboardingSnapshot,
    HappyMobileOnboardingStore,
    MobilePairingMethodOutput,
    MobilePairingMethodStore,
} from "happy-desktop-state";

/** The pairing events, each carrying only methods and pages: never a code, address, emoji, or name. */
export type MobilePairingEventName =
    | "mobile_pairing_options_shown"
    | "mobile_pairing_option_selected"
    | "mobile_pairing_completed"
    | "mobile_pairing_failed"
    | "mobile_pairing_cancelled";

/** The method a pairing page shows. */
export type MobilePairingMethods = Pick<MobilePairingMethodStore, "get" | "subscribe">;

export type MobilePairingReport = <E extends MobilePairingEventName>(
    event: E,
    properties: AnalyticsEvents[E],
) => void;

/**
 * Wraps one Happy Agent's phone pairing stores so their pairings are observed
 * exactly while a pairing page is subscribed to them. Observing on its own
 * would subscribe them, and subscribing is what starts their pairing work.
 */
export interface HappyAgentMobilePairingObserve {
    /** The direct connector, shared by onboarding and Settings. */
    connector(store: HappyAgentMobileConnectorStore): HappyAgentMobileConnectorStore;
    /** First-run onboarding's relay pairing. */
    onboarding(store: HappyMobileOnboardingStore): HappyMobileOnboardingStore;
    /** Settings → Mobile Access's relay pairing. */
    integration(store: HappyAgentIntegrationStore): HappyAgentIntegrationStore;
}

/** What a pairing page shows: whether its methods are on screen, and how far its relay code got. */
interface RelayPage {
    readonly shown: boolean;
    readonly phase: "idle" | "waiting" | "completed" | "failed";
}

const RELAY_CLOSED: RelayPage = { shown: false, phase: "idle" };

function relayPageOfStep(step: HappyDesktopMobileStep): RelayPage {
    switch (step.kind) {
        case "intro":
            return RELAY_CLOSED;
        case "link":
            return {
                shown: true,
                phase:
                    step.phase.kind === "pairing"
                        ? "waiting"
                        : step.phase.kind === "failed"
                          ? "failed"
                          : "idle",
            };
        case "connected":
            return { shown: false, phase: "completed" };
    }
}

/** Onboarding's mobile step, local and guided or remote and in place. */
export function relayPageOfOnboarding(snapshot: HappyMobileOnboardingSnapshot): RelayPage {
    switch (snapshot.status) {
        case "desktop":
            return relayPageOfStep(snapshot.step);
        case "pairing":
            return { shown: true, phase: "waiting" };
        // A pending failure is a new code on its way.
        case "failed":
            return { shown: true, phase: snapshot.pending ? "idle" : "failed" };
        case "configured":
            return { shown: false, phase: "completed" };
        default:
            return RELAY_CLOSED;
    }
}

/** Mobile Access: the local desktop's guided setup, or a remote Happy Agent's pairing card. */
export function relayPageOfIntegration(snapshot: HappyAgentIntegrationSnapshot): RelayPage {
    if (snapshot.setup) return relayPageOfStep(snapshot.setup);
    if (!snapshot.pairingOpen) return RELAY_CLOSED;
    // As the card's relay slot reads it: a refused start, or a pairing that
    // stopped or was cancelled, unless a new code is already on its way.
    if (snapshot.pairingError) return { shown: true, phase: "failed" };
    if (snapshot.configured === true) return { shown: true, phase: "completed" };
    switch (snapshot.status) {
        case "pairing":
            return { shown: true, phase: snapshot.pairing ? "waiting" : "idle" };
        case "failed":
        case "disconnected":
            return { shown: true, phase: snapshot.pairingStarting ? "idle" : "failed" };
        default:
            return { shown: true, phase: "idle" };
    }
}

/**
 * One pairing page's relay: reports the page showing its choice, and how a
 * relay code shown on it ended. A code kept behind Direct is not the person's
 * attempt, so it neither fails nor completes for them; choosing Direct while
 * one is on screen leaves it.
 */
function relayFollow(
    surface: AnalyticsMobilePairingSurface,
    method: () => AnalyticsMobilePairingMethod,
    report: MobilePairingReport,
): (page: RelayPage) => void {
    let current = RELAY_CLOSED;
    /** A relay code was on screen since the page showed or the last outcome. */
    let attempted = false;
    let failureQueued = false;
    return (page) => {
        const previous = current;
        current = page;
        if (page.shown && !previous.shown) {
            attempted = false;
            report("mobile_pairing_options_shown", {
                options: "relay_direct",
                default_method: method(),
                surface,
            });
        }
        if (!previous.shown && !page.shown) return;
        if (method() !== "relay") {
            if (attempted) report("mobile_pairing_cancelled", { method: "relay" });
            attempted = false;
            return;
        }
        if (page.phase === "waiting") attempted = true;
        if (page.phase === "completed" && previous.phase !== "completed") {
            if (attempted) report("mobile_pairing_completed", { method: "relay" });
            attempted = false;
            return;
        }
        if (page.phase === "failed" && previous.phase !== "failed") {
            // A store passes through a failure on its way to a new code, as an
            // unused code expires or a page opens on a stopped integration;
            // only a failure still standing once that call is done is one.
            if (!failureQueued) {
                failureQueued = true;
                queueMicrotask(() => {
                    failureQueued = false;
                    if (!current.shown || current.phase !== "failed" || method() !== "relay")
                        return;
                    report("mobile_pairing_failed", { method: "relay" });
                    attempted = false;
                });
            }
            return;
        }
        if (!page.shown && attempted) {
            report("mobile_pairing_cancelled", { method: "relay" });
            attempted = false;
        }
    };
}

/**
 * The direct connector: how each pairing seen in progress on an open page
 * ended, and an open page that could not get a code at all. One that expires
 * before a phone connects is replaced by a new code, not ended.
 */
function directFollow(
    report: MobilePairingReport,
): (snapshot: HappyAgentMobileConnectorSnapshot) => void {
    const inProgress = new Set<string>();
    let noCode = false;
    return (snapshot) => {
        const read = snapshot.connector;
        const pairing = read.kind === "ready" ? read.connector.pairing : null;
        const failing =
            snapshot.pairingOpen &&
            pairing === null &&
            (read.kind === "read-failed" ||
                (read.kind === "ready" && read.connector.status === "failed") ||
                snapshot.actionError !== undefined);
        if (failing && !noCode) report("mobile_pairing_failed", { method: "direct" });
        noCode = failing;
        if (!pairing) return;
        if (pairing.status === "waiting" || pairing.status === "verifying") {
            if (snapshot.pairingOpen) inProgress.add(pairing.id);
            // The page closed, or the person chose Relay: the pairing is cancelled.
            else if (inProgress.delete(pairing.id))
                report("mobile_pairing_cancelled", { method: "direct" });
            return;
        }
        if (!inProgress.has(pairing.id)) return;
        // An unused code expiring is replaced; one a phone was checking timed out.
        if (pairing.status === "expired" && pairing.device === null) {
            inProgress.delete(pairing.id);
            return;
        }
        inProgress.delete(pairing.id);
        switch (pairing.status) {
            case "completed":
                report("mobile_pairing_completed", { method: "direct" });
                return;
            case "failed":
            case "rejected":
            case "expired":
                report("mobile_pairing_failed", { method: "direct" });
                return;
            case "cancelled":
                report("mobile_pairing_cancelled", { method: "direct" });
                return;
        }
    };
}

/**
 * The store, with every snapshot its subscribers see observed, again whenever
 * the chosen method changes, and once more as the last of them leaves, which
 * closes the page: `open` is false then.
 */
function observed<S extends { get(): unknown; subscribe(listener: () => void): () => void }>(
    store: S,
    methods: MobilePairingMethods,
    observe: (snapshot: ReturnType<S["get"]>, open: boolean) => void,
): S {
    const read = () => store.get() as ReturnType<S["get"]>;
    let subscribers = 0;
    let methodUnsubscribe: (() => void) | undefined;
    return {
        ...store,
        subscribe(listener: () => void) {
            subscribers += 1;
            const unsubscribe = store.subscribe(() => {
                observe(read(), true);
                listener();
            });
            methodUnsubscribe ??= methods.subscribe(() => observe(read(), true));
            observe(read(), true);
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                subscribers -= 1;
                if (subscribers > 0) return;
                methodUnsubscribe?.();
                methodUnsubscribe = undefined;
                observe(read(), false);
            };
        },
    };
}

/** The pairing observers for one Happy Agent, with the method each page shows. */
export function mobilePairingObserveCreate(
    methods: MobilePairingMethods,
    report: MobilePairingReport,
): HappyAgentMobilePairingObserve {
    const method = (): AnalyticsMobilePairingMethod => methods.get().method;
    return {
        connector: (store) => observed(store, methods, directFollow(report)),
        onboarding: (store) => {
            const follow = relayFollow("onboarding", method, report);
            return observed(store, methods, (snapshot, open) =>
                follow(open ? relayPageOfOnboarding(snapshot) : RELAY_CLOSED),
            );
        },
        integration: (store) => {
            const follow = relayFollow("mobile_access", method, report);
            return observed(store, methods, (snapshot, open) =>
                follow(open ? relayPageOfIntegration(snapshot) : RELAY_CLOSED),
            );
        },
    };
}

/** The person picked a method on a pairing page's Relay | Direct choice. */
export function mobilePairingMethodReport(
    output: MobilePairingMethodOutput,
    report: MobilePairingReport,
): void {
    report("mobile_pairing_option_selected", {
        from: output.from,
        to: output.to,
        surface: output.surface,
    });
}
