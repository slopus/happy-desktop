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
/** What the shell answers the window's first read with, when a test says otherwise. */
let onboardingInitial: LocalOnboardingSnapshot | undefined;
/** Opens the next store on `snapshot` instead of the default subscriptions step. */
function onboardingGetSet(snapshot: LocalOnboardingSnapshot) {
    onboardingInitial = snapshot;
}

beforeEach(() => {
    for (const method of Object.values(daemon)) method.mockReset();
    daemon.scanProviders.mockResolvedValue({
        providers: [{ credentials: "available", providerId: "claude" }],
    });
    daemonConfigSet("https://llm-proxy.internal");
});

afterEach(() => {
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    onboardingInitial = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    const onboarding = onboardingInitial ?? subscriptionsStep();
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

it.each([
    [
        404,
        "not_found",
        "Route not found.",
        "This version of Happy Agent can't take a setup token yet. Update Happy Agent, then try again.",
    ],
    [404, "not_found", "Provider account not found.", "Provider account not found."],
    [400, "invalid_request", "The setup token is invalid.", "The setup token is invalid."],
    [501, "unsupported", "Unavailable in team mode.", "Unavailable in team mode."],
])("shows the correct setup-token failure for %s: %s", async (status, code, error, expected) => {
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockImplementation(async (url: string) =>
                url.endsWith("/setup-token")
                    ? Response.json({ code, error }, { status })
                    : Response.json({ providerClis: [] }),
            ),
    );
    const store = storeOpen();
    await vi.waitFor(() => expect(store.get().runtime?.phase).toBe("ready"));
    store.claudeSetupTokenSave("sk-ant-oat01-example");
    await vi.waitFor(() =>
        expect(store.get().claudeToken).toEqual({ phase: "failed", error: expected }),
    );
});

/**
 * Which providers had a paid inference check, in no particular order. The
 * free authentication check a failed inference falls back to is not one.
 */
function verifiedIds(): readonly string[] {
    return daemon.verifyProvider.mock.calls
        .filter(([, request]) => (request as { level: string }).level === "inference")
        .map(([id]) => String(id))
        .sort();
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

    // Each says the check ran out of time, not that its credentials are wrong.
    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            assistants: [
                { authentication: "error", id: "claude", message: "Timed out after 60s" },
                { authentication: "unavailable", id: "codex" },
                { authentication: "unavailable", id: "grok" },
            ],
            custom: {
                authentication: "error",
                providers: [
                    {
                        authentication: "error",
                        id: "work-proxy",
                        kind: "Claude",
                        message: "Timed out after 60s",
                        name: "Claude · work-proxy",
                    },
                ],
            },
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
            custom: {
                authentication: "valid",
                providers: [{ authentication: "valid", id: "work-proxy" }],
            },
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

it("asks for the install, not a sign-in, when an assistant that is not here fails its check", async () => {
    daemon.getConfig.mockResolvedValue({ config: { providers: {} } });
    // A sign-in left behind by a Claude Code that has since been removed.
    daemon.verifyProvider.mockResolvedValue({
        performedLevel: "inference",
        requestedLevel: "inference",
        status: "failed",
    });
    const missing = subscriptionsStep();
    onboardingGetSet({
        ...missing,
        assistants: [
            { id: "claude", status: "missing" },
            { id: "codex", status: "missing" },
            { id: "grok", status: "missing" },
        ],
    } as LocalOnboardingSnapshot);
    const store = storeOpen();

    await vi.waitFor(() => expect(store.get().providerAuthentication.complete).toBe(true));
    const view = localOnboardingView(store.get());
    expect(view).toMatchObject({
        assistants: [{ authentication: "unavailable", id: "claude", status: "missing" }, {}, {}],
    });
    const claude = cardFind(screenRender(view as LocalOnboardingView), "Claude Code");
    // Claude's one button opens the dialog that installs it first; the card
    // itself never shows a command.
    expect(claude?.querySelector("button")?.textContent).toBe("Connect");
    expect(claude?.textContent).not.toContain("curl");
    expect(claude?.textContent).not.toContain("claude auth login");
});

it("counts a sign-in that works as Ready even without the command", async () => {
    daemon.getConfig.mockResolvedValue({ config: { providers: {} } });
    daemon.verifyProvider.mockResolvedValue({
        performedLevel: "inference",
        requestedLevel: "inference",
        status: "passed",
    });
    onboardingGetSet({
        ...subscriptionsStep(),
        assistants: [
            { id: "claude", status: "missing" },
            { id: "codex", status: "missing" },
            { id: "grok", status: "missing" },
        ],
    } as LocalOnboardingSnapshot);
    const store = storeOpen();

    // Happy Agent brings its own Claude Code, so only the sign-in matters.
    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            assistants: [{ authentication: "valid", id: "claude" }, {}, {}],
        }),
    );
});

/** The settled screen as it is drawn, with the custom column's prompts open. */
function screenRender(view: LocalOnboardingView, claudeDialogOpen = false): HTMLElement {
    const noop = () => undefined;
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
        createElement(LocalOnboardingScreen, {
            agentPromptsOpen: true,
            appearance: "dark",
            claudeDialogOpen,
            happyMobilePairingOptions: { completed: false, verifying: false, view: null },
            onAssistantsContinue: noop,
            onClaudeTokenSubmit: noop,
            onConnectRetry: noop,
            onHappyMobileConnect: noop,
            onHappyMobileSkip: noop,
            view,
        }),
    );
    return root;
}

it.each(["powershell", "posix"] as const)(
    "passes the %s shell and installer into the Claude token dialog",
    (installShell) => {
        const root = screenRender(
            {
                kind: "provider-authentication",
                assistants: [
                    {
                        id: "claude",
                        status: "missing",
                        authentication: "invalid",
                        connect: { installed: false, installable: true },
                    },
                ],
                custom: { authentication: "invalid", providers: [] },
                installShell,
            },
            true,
        );
        const dialog = root.querySelector('[data-testid="claude-setup-token-dialog"]');
        const terminal = installShell === "powershell" ? "PowerShell" : "Terminal";
        const command =
            installShell === "powershell"
                ? "irm https://claude.ai/install.ps1 | iex"
                : "curl -fsSL https://claude.ai/install.sh | bash";
        expect(dialog?.textContent).toContain(`Install Claude Code. In ${terminal}, run:`);
        expect(
            dialog?.querySelector('[aria-label="Claude Code install command"]')?.textContent,
        ).toBe(command);
    },
);

function cardFind(root: HTMLElement, name: string): Element | undefined {
    return [...root.querySelectorAll('[data-happy-desktop-ui="setup-assistants-item"]')].find(
        (item) =>
            item.querySelector('[data-happy-desktop-ui="setup-assistants-name"]')?.textContent ===
            name,
    );
}

it.each(["error", "invalid"] as const)(
    "keeps sign-in on a failed CLI and the custom endpoint on the custom line (%s)",
    (custom) => {
        const root = screenRender({
            assistants: [
                {
                    connect: { installable: true, installed: true },
                    authentication: "error",
                    command: "/opt/homebrew/bin/claude",
                    id: "claude",
                    status: "found",
                },
                {
                    connect: { installable: true, installed: false },
                    authentication: "unavailable",
                    id: "codex",
                    status: "missing",
                },
                {
                    connect: { installable: true, installed: false },
                    authentication: "unavailable",
                    id: "grok",
                    status: "missing",
                },
            ],
            custom: {
                authentication: custom,
                providers:
                    custom === "error"
                        ? [
                              {
                                  authentication: "error",
                                  id: "work-proxy",
                                  kind: "Claude",
                                  name: "Claude · work-proxy",
                              },
                          ]
                        : [],
            },
            kind: "provider-authentication",
            installShell: "posix",
        });

        // The words above the cards hold still: the cards say how each went.
        expect(root.textContent).toContain("Connect your AI");
        expect(root.textContent).toContain(
            "Sign in to one you already use to get started. You can add more later.",
        );
        // Connecting is the main way in, so a failed CLI still offers it, as
        // its one button and never as a command to run.
        const claude = cardFind(root, "Claude Code");
        expect(claude?.querySelector("button")?.textContent).toBe("Connect again");
        expect(
            claude?.querySelector('[data-happy-desktop-ui="setup-assistants-detail"]'),
        ).toBeNull();
        expect(root.querySelector('[data-happy-desktop-ui="setup-command"]')).toBeNull();
        expect(root.textContent).not.toContain("claude auth login");
        expect(root.textContent).not.toContain("curl");
        expect(claude?.querySelector(".happy-setup-assistants__prompts")).toBeNull();
        // A custom endpoint or proxy belongs to the custom line under the
        // cards, custom setup first.
        const aside = root.querySelector('[data-happy-desktop-ui="setup-assistants-aside"]');
        expect(
            aside?.querySelector('[data-happy-desktop-ui="setup-assistants-link"]')?.textContent,
        ).toBe(custom === "error" ? "Fix with your agent" : "Use an API key or another provider");
        const prompts = [...(aside?.querySelectorAll(".happy-setup-assistants__prompt") ?? [])].map(
            (prompt) => prompt.textContent,
        );
        expect(prompts).toHaveLength(2);
        expect(prompts[0]).toContain("My setup is custom");
        expect(prompts[0]).toContain("~/.claude/settings.json");
        expect(prompts[1]).toContain("Sign me in");
        // Nothing on the settled screen says it is still busy.
        expect(root.textContent).not.toContain("retrying");
        expect(root.textContent).not.toContain("Checking");
    },
);

/** A daemon answer to one check: passed, or failed with the reason it gave, if any. */
function verification(passed: boolean, failure?: { kind: string; message: string }) {
    return {
        performedLevel: "inference",
        requestedLevel: "inference",
        status: passed ? "passed" : "failed",
        ...(failure ? { failure } : {}),
    };
}

it("checks each custom provider on its own and says why each one failed", async () => {
    daemon.getConfig.mockResolvedValue({
        config: {
            providers: {
                claude: {
                    enabled: true,
                    models: [{ enabled: true, id: "sonnet" }],
                    type: "claude",
                },
                "corp-sso": {
                    enabled: true,
                    models: [{ enabled: true, id: "opus" }],
                    type: "bedrock",
                },
                gateway: {
                    enabled: true,
                    models: [{ enabled: true, id: "llama" }],
                    name: "Internal gateway",
                    type: "openai_compatible",
                },
                "anthropic-key": {
                    enabled: true,
                    models: [{ enabled: true, id: "sonnet" }],
                    name: "Claude API key",
                    type: "claude",
                },
                legacy: { enabled: true, models: [{ enabled: true, id: "gpt" }], type: "openai" },
                empty: { enabled: true, models: [{ enabled: false, id: "gpt" }], type: "openai" },
                off: { enabled: false, models: [{ enabled: true, id: "gpt" }], type: "openai" },
                pool: { enabled: true, models: [{ enabled: true, id: "sonnet" }], type: "smart" },
            },
        },
    });
    // Each answer is held until the test lets it go, to see the rows mid-check.
    const answers = new Map<string, (answer: unknown) => void>();
    daemon.verifyProvider.mockImplementation(
        (id: string) =>
            new Promise((resolve) => {
                answers.set(id, resolve);
            }),
    );
    const store = storeOpen();

    await vi.waitFor(() =>
        expect(verifiedIds()).toEqual(["anthropic-key", "claude", "corp-sso", "gateway", "legacy"]),
    );
    // Every provider is its own row from the moment the configuration is
    // read, named by its display name or by its kind and ID. One with nothing
    // to check with has its answer already.
    expect(localOnboardingView(store.get())).toMatchObject({
        custom: {
            authentication: "checking",
            providers: [
                {
                    authentication: "checking",
                    id: "corp-sso",
                    kind: "Bedrock",
                    name: "Bedrock · corp-sso",
                },
                {
                    authentication: "checking",
                    id: "gateway",
                    kind: "OpenAI-compatible",
                    name: "Internal gateway",
                },
                { authentication: "checking", id: "anthropic-key", name: "Claude API key" },
                { authentication: "checking", id: "legacy", name: "OpenAI · legacy" },
                {
                    authentication: "error",
                    id: "empty",
                    message: "No models are enabled",
                    name: "OpenAI · empty",
                },
            ],
        },
    });
    const checking = screenRender(localOnboardingView(store.get()) as LocalOnboardingView);
    expect(providerRows(checking)).toEqual([
        "Bedrock · corp-sso|Checking Bedrock…",
        "Internal gateway|Checking OpenAI-compatible…",
        "Claude API key|Checking Claude…",
        "OpenAI · legacy|Checking OpenAI…",
        "OpenAI · empty|No models are enabled",
    ]);

    const credentials =
        "No AWS credentials found for profile `corp-sso`. Run `aws sso login --profile corp-sso` or add credentials for that profile, then try again.";
    answers.get("corp-sso")?.(
        verification(false, { kind: "credentials_missing", message: credentials }),
    );
    // A kind this screen has never heard of still says what happened.
    answers.get("gateway")?.(
        verification(false, { kind: "something_new", message: "The gateway refused the model." }),
    );
    // An older daemon says only that it failed.
    answers.get("legacy")?.(verification(false));
    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            custom: {
                authentication: "checking",
                providers: [
                    { authentication: "error", id: "corp-sso", message: credentials },
                    {
                        authentication: "error",
                        id: "gateway",
                        message: "The gateway refused the model.",
                    },
                    { authentication: "checking", id: "anthropic-key" },
                    { authentication: "error", id: "legacy", message: "The test request failed" },
                    { authentication: "error", id: "empty" },
                ],
            },
        }),
    );

    answers.get("anthropic-key")?.(verification(true));
    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            custom: {
                authentication: "valid",
                providers: [{}, {}, { authentication: "valid", id: "anthropic-key" }, {}, {}],
            },
        }),
    );
    const settled = screenRender(localOnboardingView(store.get()) as LocalOnboardingView);
    expect(providerRows(settled)).toEqual([
        `Bedrock · corp-sso|${credentials.replaceAll("`", "")}`,
        "Internal gateway|The gateway refused the model.",
        "Claude API key|Ready",
        "OpenAI · legacy|The test request failed",
        "OpenAI · empty|No models are enabled",
    ]);
    // The commands and the profile it names are set as code.
    expect(
        [...settled.querySelectorAll(".happy-setup-assistants__code-span")].map(
            (code) => code.textContent,
        ),
    ).toEqual(["corp-sso", "aws sso login --profile corp-sso"]);
    // One provider that works is enough to go on; the failed ones keep their fix.
    expect(continueButton(settled)?.hasAttribute("disabled")).toBe(false);
    expect(
        settled.querySelector(
            '[data-happy-desktop-ui="setup-assistants-aside"] [data-happy-desktop-ui="setup-assistants-link"]',
        )?.textContent,
    ).toBe("Fix with your agent");
});

it("says why a sign-in could not be verified under its button", async () => {
    daemon.getConfig.mockResolvedValue({ config: { providers: {} } });
    daemon.verifyProvider.mockImplementation((_id: string, request: { level: string }) =>
        Promise.resolve(
            request.level === "inference"
                ? verification(false, {
                      kind: "authentication",
                      message: "Claude rejected the saved sign-in: OAuth token has expired.",
                  })
                : { ...verification(false), performedLevel: "authentication" },
        ),
    );
    const store = storeOpen();

    // The account check that follows had nothing more to say, so the
    // inference's own reason stands.
    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            assistants: [
                {
                    authentication: "error",
                    id: "claude",
                    message: "Claude rejected the saved sign-in: OAuth token has expired.",
                },
                {},
                {},
            ],
        }),
    );
    const claude = cardFind(
        screenRender(localOnboardingView(store.get()) as LocalOnboardingView),
        "Claude Code",
    );
    expect(claude?.querySelector("button")?.textContent).toBe("Connect again");
    expect(
        claude?.querySelector('[data-happy-desktop-ui="setup-assistants-reason"]')?.textContent,
    ).toBe("Claude rejected the saved sign-in: OAuth token has expired.");
});

it("says the configuration could not be read when Happy Agent does not give it", async () => {
    daemon.getConfig.mockRejectedValue(new TypeError("Failed to fetch"));
    daemon.verifyProvider.mockResolvedValue(verification(true));
    const store = storeOpen();

    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            custom: {
                authentication: "error",
                message: "Couldn't read your provider configuration: Couldn't reach Happy Agent",
                providers: [],
            },
        }),
    );
    const aside = screenRender(
        localOnboardingView(store.get()) as LocalOnboardingView,
    ).querySelector('[data-happy-desktop-ui="setup-assistants-aside"]');
    expect(aside?.textContent).toContain(
        "Couldn't read your provider configuration: Couldn't reach Happy Agent",
    );
});

/** Each custom provider row as `name|detail`, in order. */
function providerRows(root: HTMLElement): readonly string[] {
    return [...root.querySelectorAll('[data-happy-desktop-ui="setup-assistants-provider"]')].map(
        (row) =>
            `${row.querySelector('[data-happy-desktop-ui="setup-assistants-provider-name"]')?.textContent}|${row.querySelector('[data-happy-desktop-ui="setup-assistants-provider-detail"]')?.textContent}`,
    );
}

function continueButton(root: HTMLElement): Element | undefined {
    return [...root.querySelectorAll("button")].find((button) => button.textContent === "Continue");
}

it("draws Subscriptions only once every row it will hold is known", async () => {
    // The configuration is still on its way: rows arriving under cards
    // already drawn would move them, so the setup page stays.
    let configAnswer: (config: unknown) => void = () => undefined;
    daemon.getConfig.mockImplementation(
        () =>
            new Promise((resolve) => {
                configAnswer = resolve;
            }),
    );
    daemon.verifyProvider.mockImplementation(() => new Promise(() => undefined));
    const store = storeOpen();
    await vi.waitFor(() => expect(daemon.getConfig).toHaveBeenCalled());
    expect(localOnboardingView(store.get())).toEqual({ kind: "connecting" });

    configAnswer({
        config: {
            providers: {
                "corp-sso": {
                    enabled: true,
                    models: [{ enabled: true, id: "opus" }],
                    type: "bedrock",
                },
            },
        },
    });
    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toMatchObject({
            custom: { providers: [{ authentication: "checking", id: "corp-sso" }] },
            kind: "provider-authentication",
        }),
    );
});
