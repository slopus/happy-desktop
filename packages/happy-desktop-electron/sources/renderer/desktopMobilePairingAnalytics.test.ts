import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
    const globals = globalThis as Record<string, unknown>;
    globals.__HAPPY_RENDERER_VERSION__ = "0.0.0-test";
    globals.__HAPPY_POSTHOG_API_KEY__ = null;
    globals.__HAPPY_POSTHOG_HOST__ = null;
    globals.__HAPPY_LOCAL_WEB_BUILD_ID__ = null;
    globals.__HAPPY_LOCAL_WEB_VERSION__ = null;
});

import {
    analyticsEnvelope,
    analyticsRuleOf,
    type AnalyticsClient,
    type AnalyticsMobilePairingMethod,
} from "happy-desktop-analytics";
import {
    mobilePairingMethodStoreCreate,
    type HappyAgentIntegrationSnapshot,
    type HappyAgentIntegrationStore,
    type HappyAgentMobileConnectorSnapshot,
    type HappyAgentMobileConnectorStore,
    type HappyMobileOnboardingSnapshot,
    type HappyMobileOnboardingStore,
} from "happy-desktop-state";
import {
    desktopAnalyticsCreate,
    mobilePairingObserveCreate,
    type MobilePairingReport,
} from "./desktopAnalytics";

// The package index starts code-highlighting workers, which Node cannot run;
// the step mapping is all analytics needs from it.
vi.mock("happy-desktop-ui", () => import("../../../happy-desktop-ui/src/LocalOnboardingScreen"));
// The directory store's module brings the whole application; its id is enough.
vi.mock("./happyAgentDirectoryStore", () => ({ LOCAL_HAPPY_AGENT_ID: "local" }));

/** What a pairing shows or is told; none of it may reach an event. */
const RELAY_CODE = "happy://relay?secret=relay-authorization";
const DIRECT_CODE = "tailcat://100.64.0.7:4141?key=direct-secret";
const EMOJI = ["🦊", "🌵", "🎈", "🧲"];
const DEVICE = "Alice's iPhone";
const SECRETS = [RELAY_CODE, DIRECT_CODE, "100.64.0.7", "direct-secret", DEVICE, ...EMOJI];

interface Fake<T> {
    get(): T;
    subscribe(listener: () => void): () => void;
    set(next: T): void;
}

function fakeCreate<T>(initial: T): Fake<T> {
    let snapshot = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set(next) {
            snapshot = next;
            for (const listener of listeners) listener();
        },
    };
}

type Reported = { readonly event: string; readonly properties: Record<string, unknown> };

/** The observers, with the method each page shows. */
function observeCreate(method: AnalyticsMobilePairingMethod = "relay") {
    const reported: Reported[] = [];
    const report: MobilePairingReport = (event, properties) =>
        reported.push({ event, properties: { ...properties } });
    const methods = mobilePairingMethodStoreCreate({ defaultMethod: method });
    const choose = (next: AnalyticsMobilePairingMethod) =>
        methods.methodSelect(next, "mobile_access");
    return { reported, choose, observe: mobilePairingObserveCreate(methods, report) };
}

/** Lets a failure queued behind its store's call stand or pass. */
const settle = () => Promise.resolve();

const integration = (
    extra: Partial<HappyAgentIntegrationSnapshot>,
): HappyAgentIntegrationSnapshot => ({
    disconnecting: false,
    pairingCanceling: false,
    pairingOpen: false,
    pairingStarting: false,
    status: "disconnected",
    ...extra,
});

const relayPairing = { data: RELAY_CODE, expiresAt: 300_000 };

function directPairing(
    status: "waiting" | "verifying" | "completed" | "rejected" | "expired" | "cancelled" | "failed",
    id = "pairing-1",
    /** A phone connected to it; by default every pairing past waiting has one. */
    phone = status !== "waiting",
) {
    return {
        id,
        status,
        qr: DIRECT_CODE,
        expiresAt: 300_000,
        device: phone ? { id: "device-1", name: DEVICE, platform: "ios" } : null,
        emoji: phone ? EMOJI : null,
        desktopConfirmed: false,
        mobileConfirmed: false,
        error: null,
    };
}

function connector(
    pairing: ReturnType<typeof directPairing> | null,
    pairingOpen = true,
    extra: Partial<HappyAgentMobileConnectorSnapshot> = {},
): HappyAgentMobileConnectorSnapshot {
    return {
        connector: {
            kind: "ready",
            connector: { status: "open", pairing, devices: [], error: null },
        },
        pairingOpen,
        starting: false,
        confirming: false,
        cancelling: false,
        ...extra,
    } as unknown as HappyAgentMobileConnectorSnapshot;
}

const shown = (default_method: AnalyticsMobilePairingMethod, surface: string) => ({
    event: "mobile_pairing_options_shown",
    properties: { options: "relay_direct", default_method, surface },
});

beforeEach(() => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("localStorage", {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

it("reports onboarding's choice showing once, and a relay code that linked a phone", () => {
    const { reported, observe } = observeCreate();
    const source = fakeCreate<HappyMobileOnboardingSnapshot>({
        status: "desktop",
        step: { kind: "intro" },
    });
    const store = observe.onboarding(source as unknown as HappyMobileOnboardingStore);
    const leave = store.subscribe(() => undefined);
    // The store code is not the pairing page.
    expect(reported).toEqual([]);
    source.set({ status: "desktop", step: { kind: "link", phase: { kind: "checking" } } });
    source.set({
        status: "desktop",
        step: { kind: "link", phase: { kind: "pairing", ...relayPairing } },
    });
    // A second subscriber sees the same page, not a second showing.
    const second = store.subscribe(() => undefined);
    source.set({ status: "desktop", step: { kind: "connected", online: true } });
    second();
    leave();
    expect(reported).toEqual([
        shown("relay", "onboarding"),
        { event: "mobile_pairing_completed", properties: { method: "relay" } },
    ]);
});

it("reports a relay code that failed, and one left by skipping", async () => {
    const { reported, observe } = observeCreate();
    const source = fakeCreate<HappyMobileOnboardingSnapshot>({ status: "checking" });
    const store = observe.onboarding(source as unknown as HappyMobileOnboardingStore);
    const leave = store.subscribe(() => undefined);
    source.set({ status: "pairing", ...relayPairing });
    source.set({ status: "failed", message: "Relay refused the code", pending: false });
    await settle();
    // Try again: a new code is on its way, then shown, then skipped.
    source.set({ status: "failed", message: "Relay refused the code", pending: true });
    source.set({ status: "pairing", ...relayPairing });
    source.set({ status: "skipped" });
    leave();
    await settle();
    expect(reported).toEqual([
        shown("relay", "onboarding"),
        { event: "mobile_pairing_failed", properties: { method: "relay", error_code: "unknown" } },
        { event: "mobile_pairing_cancelled", properties: { method: "relay" } },
    ]);
});

it("does not count a failure a store passes through on its way to a new code", async () => {
    const { reported, observe } = observeCreate();
    const source = fakeCreate(integration({}));
    const store = observe.integration(source as unknown as HappyAgentIntegrationStore);
    const leave = store.subscribe(() => undefined);
    // Opening on a stopped integration: open first, then the start, in one call.
    source.set(integration({ pairingOpen: true, status: "disconnected" }));
    source.set(integration({ pairingOpen: true, status: "disconnected", pairingStarting: true }));
    source.set(integration({ pairingOpen: true, status: "pairing", pairing: relayPairing }));
    // An unused code expiring: failed, then its replacement asked for, in one call.
    source.set(integration({ pairingOpen: true, status: "failed" }));
    source.set(integration({ pairingOpen: true, status: "failed", pairingStarting: true }));
    await settle();
    source.set(integration({ pairingOpen: true, status: "pairing", pairing: relayPairing }));
    leave();
    expect(reported).toEqual([
        shown("relay", "mobile_access"),
        { event: "mobile_pairing_cancelled", properties: { method: "relay" } },
    ]);
});

it("reports a relay code left by choosing Direct, and never a Direct pairing as the relay's", () => {
    const { reported, observe, choose } = observeCreate();
    const source = fakeCreate<HappyMobileOnboardingSnapshot>({
        status: "pairing",
        ...relayPairing,
    });
    const store = observe.onboarding(source as unknown as HappyMobileOnboardingStore);
    const leave = store.subscribe(() => undefined);
    choose("direct");
    // The phone paired directly; onboarding then reads the relay as configured.
    source.set({ status: "configured" });
    leave();
    expect(reported).toEqual([
        shown("relay", "onboarding"),
        { event: "mobile_pairing_cancelled", properties: { method: "relay" } },
    ]);
});

it("reports the page left when onboarding stops showing it without a skip, and its next showing", () => {
    const { reported, observe } = observeCreate();
    const source = fakeCreate<HappyMobileOnboardingSnapshot>({
        status: "pairing",
        ...relayPairing,
    });
    const store = observe.onboarding(source as unknown as HappyMobileOnboardingStore);
    store.subscribe(() => undefined)();
    // The store still says pairing; the page is gone all the same.
    store.subscribe(() => undefined)();
    expect(reported).toEqual([
        shown("relay", "onboarding"),
        { event: "mobile_pairing_cancelled", properties: { method: "relay" } },
        shown("relay", "onboarding"),
        { event: "mobile_pairing_cancelled", properties: { method: "relay" } },
    ]);
});

it("does not end a relay code on the person's behalf while Direct is chosen", () => {
    const { reported, observe, choose } = observeCreate("direct");
    const source = fakeCreate(integration({}));
    const store = observe.integration(source as unknown as HappyAgentIntegrationStore);
    const leave = store.subscribe(() => undefined);
    source.set(integration({ pairingOpen: true, status: "pairing", pairing: relayPairing }));
    source.set(integration({ pairingOpen: false, status: "disconnected" }));
    // Relay chosen on the next showing: its close cancels the relay code.
    choose("relay");
    source.set(integration({ pairingOpen: true, status: "pairing", pairing: relayPairing }));
    source.set(integration({ pairingOpen: false, status: "disconnected" }));
    leave();
    expect(reported).toEqual([
        shown("direct", "mobile_access"),
        shown("relay", "mobile_access"),
        { event: "mobile_pairing_cancelled", properties: { method: "relay" } },
    ]);
});

it("reports how each direct pairing seen in progress ended", () => {
    const { reported, observe } = observeCreate("direct");
    const source = fakeCreate(connector(null));
    const store = observe.connector(source as unknown as HappyAgentMobileConnectorStore);
    const leave = store.subscribe(() => undefined);
    source.set(connector(directPairing("waiting")));
    source.set(connector(directPairing("verifying")));
    source.set(connector(directPairing("completed")));
    // The same settled pairing seen again is not a second outcome.
    source.set(connector(directPairing("completed")));
    source.set(connector(directPairing("waiting", "pairing-2")));
    source.set(connector(directPairing("rejected", "pairing-2")));
    // An unused code that expires is replaced, not ended…
    source.set(connector(directPairing("waiting", "pairing-3")));
    source.set(connector(directPairing("expired", "pairing-3", false)));
    // …but one a phone was checking timed out.
    source.set(connector(directPairing("waiting", "pairing-4")));
    source.set(connector(directPairing("verifying", "pairing-4")));
    source.set(connector(directPairing("expired", "pairing-4")));
    source.set(connector(directPairing("waiting", "pairing-5")));
    source.set(connector(directPairing("failed", "pairing-5")));
    // A pairing that settled before this window saw it in progress is not news.
    source.set(connector(directPairing("cancelled", "pairing-0")));
    leave();
    expect(reported).toEqual([
        { event: "mobile_pairing_completed", properties: { method: "direct" } },
        {
            event: "mobile_pairing_failed",
            properties: { method: "direct", error_code: "rejected" },
        },
        { event: "mobile_pairing_failed", properties: { method: "direct", error_code: "expired" } },
        { event: "mobile_pairing_failed", properties: { method: "direct", error_code: "unknown" } },
    ]);
});

it("reports a direct page that could not get a code, once", () => {
    const { reported, observe } = observeCreate("direct");
    const source = fakeCreate(connector(null));
    const store = observe.connector(source as unknown as HappyAgentMobileConnectorStore);
    const leave = store.subscribe(() => undefined);
    source.set(connector(null, true, { actionError: "Tailcat could not start." }));
    source.set(connector(null, true, { actionError: "Tailcat could not start." }));
    source.set(connector(null, true, { starting: true }));
    source.set(connector(directPairing("waiting")));
    leave();
    expect(reported).toEqual([
        {
            event: "mobile_pairing_failed",
            properties: { method: "direct", error_code: "unavailable" },
        },
    ]);
});

it("reports a direct pairing cancelled when its page closes or Relay is chosen", () => {
    const { reported, observe } = observeCreate("direct");
    const source = fakeCreate(connector(null));
    // The real store closes its pairing when its last subscriber leaves.
    const real = {
        ...source,
        subscribe(listener: () => void) {
            const unsubscribe = source.subscribe(listener);
            return () => {
                unsubscribe();
                const pairing = source.get().connector;
                if (pairing.kind === "ready" && pairing.connector.pairing)
                    source.set(connector(pairing.connector.pairing as never, false));
            };
        },
    };
    const store = observe.connector(real as unknown as HappyAgentMobileConnectorStore);
    const leave = store.subscribe(() => undefined);
    source.set(connector(directPairing("waiting")));
    leave();
    // The daemon's own word that it was cancelled arrives with no page left.
    source.set(connector(directPairing("cancelled"), false));
    expect(reported).toEqual([
        { event: "mobile_pairing_cancelled", properties: { method: "direct" } },
    ]);
});

it("reports a pairing page's choice of method", () => {
    const captured: { event: string; properties: Record<string, unknown> }[] = [];
    const client: AnalyticsClient = {
        track: (event, properties) => void captured.push({ event, properties: { ...properties } }),
    };
    const directory = {
        get: () => ({
            activeHappyAgentId: "local",
            happyAgents: [{ id: "local", status: "connected", version: "1.4.0", bots: [] }],
        }),
        subscribe: () => () => undefined,
    };
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directory as never,
        client,
    });
    const methods = mobilePairingMethodStoreCreate({
        defaultMethod: "relay",
        onOutput: analytics.mobilePairingMethodSelected,
    });
    methods.methodSelect("direct", "onboarding");
    methods.methodSelect("relay", "mobile_access");
    // Choosing what is already chosen is no choice.
    methods.methodSelect("relay", "mobile_access");
    expect(captured.map(({ event, properties }) => ({ event, properties }))).toMatchObject([
        {
            event: "mobile_pairing_option_selected",
            properties: { from: "relay", to: "direct", surface: "onboarding" },
        },
        {
            event: "mobile_pairing_option_selected",
            properties: { from: "direct", to: "relay", surface: "mobile_access" },
        },
    ]);
    expect(captured).toHaveLength(2);
    analytics.dispose();
});

it("sends pairing events with catalog fields only: no code, address, emoji, or device name", () => {
    const captured: { event: string; properties: Record<string, unknown> }[] = [];
    const client: AnalyticsClient = {
        track: (event, properties) => void captured.push({ event, properties: { ...properties } }),
    };
    const directory = {
        get: () => ({
            activeHappyAgentId: "remote",
            happyAgents: [{ id: "remote", status: "connected", version: "1.4.0", bots: [] }],
        }),
        subscribe: () => () => undefined,
    };
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directory as never,
        client,
    });
    const methods = mobilePairingMethodStoreCreate({ defaultMethod: "direct" });
    const observe = analytics.mobilePairingObserve("remote", methods);
    const relay = fakeCreate(integration({}));
    const direct = fakeCreate(connector(null));
    const relayStore = observe.integration(relay as unknown as HappyAgentIntegrationStore);
    const directStore = observe.connector(direct as unknown as HappyAgentMobileConnectorStore);
    const leaveRelay = relayStore.subscribe(() => undefined);
    const leaveDirect = directStore.subscribe(() => undefined);
    relay.set(integration({ pairingOpen: true, status: "pairing", pairing: relayPairing }));
    direct.set(connector(directPairing("waiting")));
    direct.set(connector(directPairing("verifying")));
    direct.set(connector(directPairing("completed")));
    leaveDirect();
    leaveRelay();
    analytics.dispose();

    expect(captured.map((item) => item.event)).toEqual([
        "mobile_pairing_options_shown",
        "mobile_pairing_completed",
    ]);
    for (const item of captured) {
        for (const name of Object.keys(item.properties))
            expect(analyticsRuleOf(item.event, name), `${item.event}.${name}`).toBeDefined();
        const sent = analyticsEnvelope(item.event, item.properties, {
            distinctId: "install",
            insertId: "0190e0d4-0000-7000-8000-000000000000",
            timestamp: "2026-01-01T00:00:00.000Z",
        });
        const serialized = JSON.stringify(sent);
        for (const secret of SECRETS) expect(serialized).not.toContain(secret);
        expect(sent?.properties).toMatchObject({
            agent_location: "remote",
            happy_agent_version: "1.4.0",
        });
    }
});
