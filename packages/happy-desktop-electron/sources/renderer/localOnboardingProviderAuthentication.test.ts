// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The package index starts code-highlighting workers, which Node cannot run;
// the onboarding screen and its view types are all this needs from it.
vi.mock("happy-desktop-ui", () => import("../../../happy-desktop-ui/src/LocalOnboardingScreen"));
vi.mock("./happyAgentDirectoryStore", () => ({ LOCAL_HAPPY_AGENT_ID: "local" }));

/** The daemon setup talks to, one fake shared by every client the store opens. */
const daemon = {
    getConfig: vi.fn(),
    scanProviders: vi.fn(),
    verifyProvider: vi.fn(),
};
vi.mock("happy-desktop-state", () => ({
    HappyAgentClient: class {
        getConfig = (...args: unknown[]) => daemon.getConfig(...args);
        scanProviders = (...args: unknown[]) => daemon.scanProviders(...args);
        verifyProvider = (...args: unknown[]) => daemon.verifyProvider(...args);
    },
    happyAgentMobileConnectorStoreNoop: {},
}));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocalOnboardingScreen, type LocalOnboardingView } from "happy-desktop-ui";
import { localOnboardingStoreCreate, localOnboardingView } from "./localOnboardingStore";
import type {
    DesktopRuntimeSnapshot,
    HappyDesktopBridge,
    LocalOnboardingSnapshot,
} from "../shared/desktopContract";

const unsubscribes: (() => void)[] = [];
/** Hands the window a new first-run snapshot, as the shell does on every change. */
let onboardingPush: (next: LocalOnboardingSnapshot) => void = () => undefined;

beforeEach(() => {
    for (const method of Object.values(daemon)) method.mockReset();
    daemon.scanProviders.mockResolvedValue({
        providers: [{ credentials: "available", providerId: "claude" }],
    });
    daemonConfigSet("https://llm-proxy.internal");
});

afterEach(() => {
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

/** A Claude-type provider in `happy.toml` routed through a custom base URL. */
function daemonConfigSet(baseUrl: string) {
    daemon.getConfig.mockResolvedValue({
        config: {
            providers: {
                "work-proxy": {
                    base_url: baseUrl,
                    enabled: true,
                    models: [{ enabled: true, id: "sonnet" }],
                    type: "claude",
                },
            },
        },
    });
}

/** The subscriptions step's snapshot, Claude Code found and the others missing. */
function subscriptionsStep(): LocalOnboardingSnapshot {
    return {
        assistants: [
            { command: "/opt/homebrew/bin/claude", id: "claude", status: "found" },
            { id: "codex", status: "missing" },
            { id: "grok", status: "missing" },
        ],
        busy: false,
        freshness: "fresh",
        installShell: "posix",
        stage: "assistantsFound",
    } as LocalOnboardingSnapshot;
}

/** Claude Code installed and signed in to something, at the subscriptions step. */
function storeOpen() {
    const onboarding = subscriptionsStep();
    const runtime = {
        activeTarget: { happyAgentHttpUrl: "http://happy-agent.test", mode: "local" },
        activeTargetId: "local",
        connectionId: 1,
        mode: "local",
        phase: "ready",
        targets: [],
        update: { status: "idle" },
    } as unknown as DesktopRuntimeSnapshot;
    const bridge = {
        daemonGet: () => new Promise(() => undefined),
        daemonSubscribe: () => () => undefined,
        onboardingGet: async () => onboarding,
        onboardingSubscribe: (listener: (next: LocalOnboardingSnapshot) => void) => {
            onboardingPush = listener;
            return () => undefined;
        },
        runtimeGet: async () => runtime,
        subscribe: () => () => undefined,
    } as unknown as HappyDesktopBridge;
    const store = localOnboardingStoreCreate(bridge, {
        chiefOfStaff: { get: () => undefined, subscribe: () => () => undefined },
        chiefOfStaffPrepare: () => new Promise(() => undefined),
        localConnected: { get: () => true, subscribe: () => () => undefined },
        happyMobile: { get: () => undefined, subscribe: () => () => undefined },
    });
    unsubscribes.push(store.subscribe(() => undefined));
    return store;
}

/** Which providers had a paid inference check, in no particular order. */
function verifiedIds(): readonly string[] {
    return daemon.verifyProvider.mock.calls.map(([id]) => String(id)).sort();
}

it("settles a check that never answers as couldn't verify", async () => {
    // The request bound fires when the test says so rather than after a minute.
    const bounds: AbortController[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
        const bound = new AbortController();
        bounds.push(bound);
        return bound.signal;
    });
    // A base URL that accepts the connection and never replies.
    daemon.verifyProvider.mockImplementation(
        (_id: string, _request: unknown, options: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
                options.signal.addEventListener("abort", () => reject(options.signal.reason));
            }),
    );
    const store = storeOpen();

    await vi.waitFor(() => expect(verifiedIds()).toEqual(["claude", "work-proxy"]));
    expect(localOnboardingView(store.get())).toMatchObject({
        assistants: [{ authentication: "checking", id: "claude" }, {}, {}],
        custom: { authentication: "checking" },
    });

    for (const bound of bounds) bound.abort();

    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            assistants: [
                { authentication: "error", id: "claude" },
                { authentication: "unavailable", id: "codex" },
                { authentication: "unavailable", id: "grok" },
            ],
            custom: { authentication: "error", providers: ["Claude"] },
            kind: "provider-authentication",
        }),
    );
    expect(store.get().providerAuthentication.complete).toBe(true);
});

it("re-verifies a changed custom configuration without waiting out the failure", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    daemon.verifyProvider.mockResolvedValue({
        performedLevel: "inference",
        requestedLevel: "inference",
        status: "failed",
    });
    const store = storeOpen();

    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            custom: { authentication: "error" },
        }),
    );
    await vi.waitFor(() => expect(store.get().providerAuthentication.complete).toBe(true));
    expect(verifiedIds()).toEqual(["claude", "work-proxy"]);

    // The same configuration on the next poll is still backing off: no paid call.
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(daemon.getConfig).toHaveBeenCalledTimes(2));
    expect(verifiedIds()).toEqual(["claude", "work-proxy"]);

    // Somebody's agent fixed the base URL: the next poll checks it at once.
    daemonConfigSet("https://llm-proxy.internal/v1");
    daemon.verifyProvider.mockResolvedValue({
        performedLevel: "inference",
        requestedLevel: "inference",
        status: "passed",
    });
    await vi.advanceTimersByTimeAsync(2_000);

    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            custom: { authentication: "valid", providers: ["Claude"] },
        }),
    );
    expect(verifiedIds()).toEqual(["claude", "work-proxy", "work-proxy"]);
});

it("checks a sign-in again at once when the check was cut short rather than answered", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    daemon.getConfig.mockResolvedValue({ config: { providers: {} } });
    // The first check is still running when the screen goes away; the next one passes.
    daemon.verifyProvider
        .mockImplementationOnce(
            (_id: string, _request: unknown, options: { signal: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    options.signal.addEventListener("abort", () => reject(options.signal.reason));
                }),
        )
        .mockResolvedValue({
            performedLevel: "inference",
            requestedLevel: "inference",
            status: "passed",
        });
    const store = storeOpen();
    await vi.waitFor(() => expect(verifiedIds()).toEqual(["claude"]));

    // The step leaves the screen and comes back, abandoning that check.
    onboardingPush({ ...subscriptionsStep(), stage: "examining" } as LocalOnboardingSnapshot);
    onboardingPush(subscriptionsStep());
    await vi.advanceTimersByTimeAsync(2_000);

    // An abandoned check is not a failed one: the next poll checks again
    // instead of reporting "Couldn't verify" for the next thirty seconds.
    await vi.waitFor(() => expect(verifiedIds()).toEqual(["claude", "claude"]));
    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            assistants: [{ authentication: "valid", id: "claude" }, {}, {}],
        }),
    );
});

/** The settled screen as it is drawn, with the custom column's prompts open. */
function screenRender(view: LocalOnboardingView): HTMLElement {
    const noop = () => undefined;
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
        createElement(LocalOnboardingScreen, {
            agentPromptsOpen: true,
            appearance: "dark",
            happyMobilePairingOptions: { completed: false, verifying: false, view: null },
            onAssistantsContinue: noop,
            onConnectRetry: noop,
            onHappyMobileConnect: noop,
            onHappyMobileSkip: noop,
            view,
        }),
    );
    return root;
}

function cardFind(root: HTMLElement, name: string): Element | undefined {
    return [...root.querySelectorAll('[data-happy-desktop-ui="setup-assistants-item"]')].find(
        (item) =>
            item.querySelector('[data-happy-desktop-ui="setup-assistants-name"]')?.textContent ===
            name,
    );
}

it.each(["error", "invalid"] as const)(
    "keeps sign-in on a failed CLI and the custom endpoint on the custom card (%s)",
    (custom) => {
        const root = screenRender({
            assistants: [
                {
                    authentication: "error",
                    command: "/opt/homebrew/bin/claude",
                    id: "claude",
                    status: "found",
                },
                { authentication: "unavailable", id: "codex", status: "missing" },
                { authentication: "unavailable", id: "grok", status: "missing" },
            ],
            custom: { authentication: custom, providers: custom === "error" ? ["Claude"] : [] },
            kind: "provider-authentication",
            installShell: "posix",
        });

        expect(root.textContent).toContain("Couldn't verify a subscription");
        expect(root.textContent).toContain(
            "Sign in again, or set up a custom endpoint with your agent.",
        );
        // Signing in is the main way in, so a failed CLI still offers it, and
        // only it.
        const claude = cardFind(root, "Claude Code");
        expect(
            claude?.querySelector('[data-happy-desktop-ui="setup-assistants-detail"]')?.textContent,
        ).toBe("Couldn't verify. Sign in:");
        expect(claude?.textContent).toContain("claude auth login");
        expect(claude?.querySelector(".happy-setup-assistants__prompts")).toBeNull();
        // A custom endpoint or proxy belongs to the custom card, custom setup first.
        const prompts = [
            ...(cardFind(root, "Custom configuration")?.querySelectorAll(
                ".happy-setup-assistants__prompt",
            ) ?? []),
        ].map((prompt) => prompt.textContent);
        expect(prompts).toHaveLength(2);
        expect(prompts[0]).toContain("My setup is custom");
        expect(prompts[0]).toContain("~/.claude/settings.json");
        expect(prompts[1]).toContain("Sign me in");
        // Nothing on the settled screen says it is still busy.
        expect(root.textContent).not.toContain("retrying");
        expect(root.textContent).not.toContain("Checking");
    },
);
