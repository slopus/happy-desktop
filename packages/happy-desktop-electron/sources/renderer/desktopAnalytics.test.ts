import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.hoisted(() => {
    const globals = globalThis as Record<string, unknown>;
    globals.__HAPPY_RENDERER_VERSION__ = "0.0.0-test";
    globals.__HAPPY_POSTHOG_API_KEY__ = null;
    globals.__HAPPY_LOCAL_WEB_BUILD_ID__ = null;
    globals.__HAPPY_LOCAL_WEB_VERSION__ = null;
});

import {
    analyticsBeforeSend,
    type AnalyticsClient,
    type AnalyticsTrackOptions,
} from "happy-desktop-analytics";
import type { HappyAgentActivity, WelcomeStore } from "happy-desktop-state";
import { desktopAnalyticsCreate, setupDownloadFailureOf, setupFailureOf } from "./desktopAnalytics";

type CaptureResult = NonNullable<Parameters<typeof analyticsBeforeSend>[0]>;

// The package index starts code-highlighting workers, which Node cannot run;
// the step mapping is all this needs from it.
vi.mock("happy-desktop-ui", () => import("../../../happy-desktop-ui/src/LocalOnboardingScreen"));
// The directory store's module brings the whole application; its id is enough.
vi.mock("./happyAgentDirectoryStore", () => ({ LOCAL_HAPPY_AGENT_ID: "local" }));
import type {
    HappyAgentDirectoryEntry,
    HappyAgentDirectorySnapshot,
    HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";
import {
    localOnboardingView,
    rendererInstallShell,
    type LocalOnboardingStore,
    type LocalOnboardingViewSnapshot,
} from "./localOnboardingStore";
import { localOnboardingInstallCommand } from "../../../happy-desktop-ui/src/LocalOnboardingScreen";
import type {
    DesktopDaemonSnapshot,
    DesktopRuntimeSnapshot,
    LocalOnboardingSnapshot,
} from "../shared/desktopContract";

/** Strings a failing machine may say about itself; none may reach an event. */
const PRIVATE = [
    "/Users/alice/Library/Application Support/Happy",
    "alice-macbook.local",
    "EADDRINUSE 127.0.0.1:4141",
    "Error: spawn EACCES\n    at ChildProcess._handle",
    "C:\\Users\\alice\\AppData",
    "claude_extra",
];
const PRIVATE_TEXT = PRIVATE.join(" ");

interface Captured {
    readonly event: string;
    readonly properties: Record<string, unknown>;
    readonly options?: AnalyticsTrackOptions;
}

function clientCreate(): AnalyticsClient & { readonly captured: Captured[] } {
    const captured: Captured[] = [];
    return {
        captured,
        preload: () => undefined,
        track(event, properties, options) {
            captured.push({
                event,
                properties: { ...properties },
                ...(options ? { options } : {}),
            });
        },
    };
}

function directoryCreate(entries: readonly Partial<HappyAgentDirectoryEntry>[] = []) {
    let snapshot: HappyAgentDirectorySnapshot = {
        happyAgents: entries as HappyAgentDirectoryEntry[],
    };
    const listeners = new Set<() => void>();
    const store: HappyAgentDirectoryStore & {
        set(next: readonly Partial<HappyAgentDirectoryEntry>[]): void;
    } = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        happyAgentActivate: () => undefined,
        happyAgentReorder: () => undefined,
        set(next) {
            snapshot = { happyAgents: next as HappyAgentDirectoryEntry[] };
            for (const listener of listeners) listener();
        },
    };
    return store;
}

function onboarding(
    stage: LocalOnboardingSnapshot["stage"],
    extra: Partial<LocalOnboardingSnapshot> = {},
): LocalOnboardingSnapshot {
    return { busy: false, freshness: "checking", stage, ...extra } as LocalOnboardingSnapshot;
}

function daemon(extra: Partial<DesktopDaemonSnapshot>): DesktopDaemonSnapshot {
    return {
        installation: "missing",
        managed: true,
        operation: "idle",
        runtime: "stopped",
        updateAvailable: false,
        versions: [],
        install: { phase: "idle" },
        ...extra,
    } as DesktopDaemonSnapshot;
}

function view(extra: Partial<LocalOnboardingViewSnapshot>): LocalOnboardingViewSnapshot {
    return {
        agentStarting: false,
        chiefOfStaffReady: false,
        pending: false,
        providerAuthentication: { complete: false },
        ...extra,
    };
}

const runtimeError = (code?: "start_timeout"): DesktopRuntimeSnapshot =>
    ({
        phase: "error",
        message: PRIVATE_TEXT,
        ...(code ? { code } : {}),
        request: { mode: "local" },
        retryable: true,
        targets: [],
        update: {},
    }) as unknown as DesktopRuntimeSnapshot;

function storageCreate(): Storage {
    const values = new Map<string, string>();
    return {
        get length() {
            return values.size;
        },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => void values.delete(key),
        setItem: (key, value) => void values.set(key, value),
    };
}

function onboardingCreate() {
    let snapshot = view({ onboarding: onboarding("checking") });
    const listeners = new Set<() => void>();
    const publish = (next: LocalOnboardingViewSnapshot) => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const store = {
        get: () => snapshot,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connectRetry: () => undefined,
        agentSetupBegin: () => undefined,
        chiefOfStaffSetup: () => undefined,
        assistantsContinue: () => undefined,
        commandCopied: () => undefined,
        stepBack: () => undefined,
        happyMobileConnect: () => undefined,
        happyMobileSkip: () => undefined,
        happyMobilePlatformSelect: () => undefined,
    } as unknown as LocalOnboardingStore;
    const welcome = {
        get: () => ({ welcomeAcknowledged: true }),
        subscribe: () => () => undefined,
        welcomeAcknowledge: () => undefined,
    } as unknown as WelcomeStore;
    return { store, welcome, publish };
}

let window: EventTarget;

beforeEach(() => {
    window = new EventTarget();
    vi.stubGlobal("window", window);
    vi.stubGlobal("localStorage", storageCreate());
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it("names each Setup failure by the step that failed, never by its message", () => {
    const failure = (cause: "stateRead" | "download" | "start" | "request") => ({
        cause,
        message: PRIVATE_TEXT,
    });
    expect(setupFailureOf(view({ onboarding: onboarding("nodeMissing") }))).toBe("node_missing");
    expect(
        setupFailureOf(view({ onboarding: onboarding("checking"), failure: failure("stateRead") })),
    ).toBe("state_unreadable");
    expect(
        setupFailureOf(
            view({ onboarding: onboarding("daemonDownload"), failure: failure("download") }),
        ),
    ).toBe("download_failed");
    expect(
        setupFailureOf(
            view({
                onboarding: onboarding("daemonDownload"),
                daemon: daemon({ error: PRIVATE_TEXT }),
            }),
        ),
    ).toBe("download_failed");
    expect(
        setupFailureOf(
            view({ onboarding: onboarding("daemonStarting"), failure: failure("start") }),
        ),
    ).toBe("start_failed");
    expect(
        setupFailureOf(
            view({
                onboarding: onboarding("daemonDownload"),
                daemon: daemon({ error: PRIVATE_TEXT, readyVersion: "1.2.3" }),
            }),
        ),
    ).toBe("start_failed");
    expect(
        setupFailureOf(
            view({
                onboarding: onboarding("daemonDownload"),
                daemon: daemon({
                    error: PRIVATE_TEXT,
                    errorCode: "start_timeout",
                    readyVersion: "1.2.3",
                }),
                failure: failure("start"),
            }),
        ),
    ).toBe("start_timeout");
    expect(
        setupFailureOf(
            view({
                onboarding: onboarding("connectFailed"),
                runtime: runtimeError("start_timeout"),
            }),
        ),
    ).toBe("start_timeout");
    expect(setupFailureOf(view({ onboarding: onboarding("connecting") }), true)).toBe(
        "version_mismatch",
    );
    expect(setupFailureOf(view({ onboarding: onboarding("connecting") }))).toBeUndefined();
    expect(setupFailureOf(view({ onboarding: onboarding("daemonDownload") }))).toBeUndefined();
});

it("falls back to the stage when an older shell sends no failure code", () => {
    expect(
        setupFailureOf(view({ onboarding: onboarding("connectFailed"), runtime: runtimeError() })),
    ).toBe("connect_failed");
    expect(
        setupFailureOf(
            view({
                onboarding: onboarding("daemonStarting"),
                daemon: daemon({ error: PRIVATE_TEXT, readyVersion: "1.2.3" }),
            }),
        ),
    ).toBe("start_failed");
});

it("sends app_opened once, as soon as the Happy Agent's version is known", () => {
    vi.useFakeTimers();
    const client = clientCreate();
    const directory = directoryCreate([{ id: "local", status: "connecting", bots: [] }]);
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directory,
        client,
    });
    analytics.appOpened();
    expect(client.captured).toEqual([]);

    directory.set([{ id: "local", status: "connected", version: "1.4.0", bots: [] }]);
    directory.set([{ id: "local", status: "connected", version: "1.4.1", bots: [] }]);
    vi.advanceTimersByTime(20_000);
    window.dispatchEvent(new Event("pagehide"));

    expect(client.captured).toHaveLength(1);
    expect(client.captured[0]).toMatchObject({
        event: "app_opened",
        properties: { launch_count: 1, happy_agent_version: "1.4.0" },
    });
    analytics.dispose();
});

it("sends app_opened without a version once the wait runs out", () => {
    vi.useFakeTimers();
    const client = clientCreate();
    const directory = directoryCreate();
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directory,
        client,
    });
    analytics.appOpened();
    vi.advanceTimersByTime(9_999);
    expect(client.captured).toEqual([]);
    vi.advanceTimersByTime(1);
    directory.set([{ id: "local", status: "connected", version: "1.4.0", bots: [] }]);
    window.dispatchEvent(new Event("pagehide"));

    expect(client.captured).toHaveLength(1);
    expect(client.captured[0]).toMatchObject({
        event: "app_opened",
        properties: { happy_agent_version: null },
    });
    expect(client.captured[0]?.options).toBeUndefined();
    analytics.dispose();
});

it("sends a pending app_opened by beacon when the window closes first", () => {
    vi.useFakeTimers();
    const client = clientCreate();
    const directory = directoryCreate();
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directory,
        client,
    });
    analytics.appOpened();
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(20_000);
    directory.set([{ id: "local", status: "connected", version: "1.4.0", bots: [] }]);
    window.dispatchEvent(new Event("pagehide"));

    expect(client.captured).toHaveLength(1);
    expect(client.captured[0]).toMatchObject({
        event: "app_opened",
        options: { beacon: true },
    });
    analytics.dispose();
});

it("drops every property the catalog does not name", () => {
    const capture = {
        uuid: "0190e0d4-0000-7000-8000-000000000000",
        event: "app_opened",
        properties: {
            token: "phc_test",
            distinct_id: "install",
            launch_count: 3,
            os_version: "15.6.0",
            arch: "arm64",
            $current_url: "file:///Users/alice/Happy.app/index.html",
            $host: "alice-macbook.local",
            $pathname: "/Users/alice",
            $referrer: "https://example.com",
            $screen_width: 3024,
            $browser: "Chrome",
            $session_id: "session",
            message: PRIVATE_TEXT,
            provider_id: "claude_extra",
        },
    } as unknown as CaptureResult;

    const sent = analyticsBeforeSend(capture);

    expect(sent?.properties).toEqual({
        token: "phc_test",
        distinct_id: "install",
        launch_count: 3,
        os_version: "15.6.0",
        arch: "arm64",
        $ip: null,
        $geoip_disable: true,
    });
});

it("never sends free text, whatever the machine says about its failures", async () => {
    const client = clientCreate();
    const directory = directoryCreate([
        {
            id: "local",
            status: "error",
            message: PRIVATE_TEXT,
            version: "1.4.0",
            bots: [],
            projectsStatus: "ready",
        },
    ]);
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directory,
        client,
        system: { osVersion: "15.6.0", arch: "arm64" },
    });
    analytics.appOpened();

    // Setup, failing every way it can with private detail in each message.
    const { store, welcome, publish } = onboardingCreate();
    const observed = analytics.onboardingObserve(store, welcome);
    const unsubscribe = observed.subscribe(() => undefined);
    publish(
        view({
            onboarding: onboarding("checking", { message: PRIVATE_TEXT }),
            failure: { cause: "stateRead", message: PRIVATE_TEXT },
        }),
    );
    publish(
        view({
            onboarding: onboarding("daemonDownload", { message: PRIVATE_TEXT }),
            daemon: daemon({
                error: PRIVATE_TEXT,
                errorCode: "filesystem_locked",
                downloadFailure: { attempts: 1, receivedBytes: 10, totalBytes: 10 },
                message: PRIVATE_TEXT,
            }),
        }),
    );
    publish(
        view({
            onboarding: onboarding("connectFailed", { message: PRIVATE_TEXT }),
            runtime: runtimeError("start_timeout"),
        }),
    );
    publish(
        view({
            onboarding: onboarding("providersMissing", {
                assistants: [
                    { id: "claude", status: "found", command: PRIVATE[0], pathRefreshed: true },
                    { id: "codex", status: "missing" },
                    { id: "grok", status: "missing" },
                ],
                installShell: "powershell",
                localApps: {
                    agyCli: true,
                    antigravityApp: null,
                    claudeDesktop: true,
                    codexDesktop: false,
                },
            }),
        }),
    );
    observed.commandCopied({ assistant: "claude", kind: "sign-in" });
    observed.commandCopied({ assistant: "custom", kind: "agent-prompt" });
    observed.assistantsContinue();

    const activities: HappyAgentActivity[] = [
        {
            kind: "messageSent",
            target: "bot",
            botSystemKey: "chief_of_staff",
            taskDepth: 1,
            source: "chat",
            model: {
                providerId: "claude_extra",
                providerType: "claude",
                modelId: "claude_extra:anthropic/opus-5",
                effort: "high",
            },
        },
        {
            kind: "conversationCreated",
            source: "workspace",
            model: { providerId: "claude_extra", providerType: "claude" },
        },
        { kind: "projectAdded", source: "open_folder", result: { ok: false, failure: "refused" } },
        { kind: "workspaceCreated", result: { ok: true } },
        { kind: "botCreated", source: "voice", result: { ok: false, failure: "offline" } },
    ];
    for (const activity of activities) analytics.activity("local", activity);
    // The account hash is a real digest, so its events arrive a moment later.
    await vi.waitFor(() =>
        expect(client.captured.map((captured) => captured.event)).toEqual(
            expect.arrayContaining(["message_sent", "conversation_created"]),
        ),
    );
    window.dispatchEvent(new Event("pagehide"));
    unsubscribe();
    analytics.dispose();

    const events = client.captured.map((captured) => captured.event);
    expect(events).toEqual(
        expect.arrayContaining([
            "app_opened",
            "onboarding_step_viewed",
            "onboarding_setup_result",
            "onboarding_command_copied",
            "onboarding_assistant_status",
            "onboarding_local_apps",
            "onboarding_subscriptions_exit",
            "message_sent",
            "conversation_created",
            "project_added",
            "workspace_created",
            "bot_created",
        ]),
    );
    expect(client.captured.filter((c) => c.event === "onboarding_subscriptions_exit")).toEqual([
        expect.objectContaining({
            properties: expect.objectContaining({
                // A daemon refusing for want of a signed-in assistant marks every card.
                claude_status: "not_signed_in",
                codex_status: "not_installed",
                grok_status: "not_installed",
                custom_status: "not_signed_in",
            }),
            options: { beacon: true },
        }),
    ]);

    const allowedString = [
        /^[a-z][a-z0-9_]*$/, // enums
        /^[0-9]+(\.[0-9]+){0,3}(-[a-z0-9.]+)?$/, // versions
        /^[0-9a-f]{12}$/, // provider account hash
        /^[a-z0-9-]+\/[a-z0-9.-]+$/, // vendor-qualified model id
    ];
    for (const captured of client.captured) {
        const sent = analyticsBeforeSend({
            uuid: "0190e0d4-0000-7000-8000-000000000000",
            event: captured.event,
            properties: captured.properties,
        } as unknown as CaptureResult);
        const serialized = JSON.stringify(sent);
        for (const secret of PRIVATE) expect(serialized).not.toContain(secret);
        expect(serialized).not.toContain("alice");
        for (const [name, value] of Object.entries(sent?.properties ?? {})) {
            if (name === "$ip") continue;
            if (value === null || typeof value === "boolean" || typeof value === "number") continue;
            expect(typeof value, `${captured.event}.${name}`).toBe("string");
            expect(
                allowedString.some((pattern) => pattern.test(value as string)),
                `${captured.event}.${name} = ${String(value)}`,
            ).toBe(true);
        }
    }
});

it("reports a Setup still running at close as failed, with the last failure it met", () => {
    const client = clientCreate();
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directoryCreate(),
        client,
    });
    const { store, welcome, publish } = onboardingCreate();
    const unsubscribe = analytics.onboardingObserve(store, welcome).subscribe(() => undefined);
    publish(
        view({ onboarding: onboarding("connectFailed"), runtime: runtimeError("start_timeout") }),
    );
    publish(view({ onboarding: onboarding("connecting") }));
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pagehide"));
    unsubscribe();
    analytics.dispose();

    const results = client.captured.filter((c) => c.event === "onboarding_setup_result");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
        properties: { result: "failed", error_code: "start_timeout" },
        options: { beacon: true },
    });
    expect(results[0]?.properties.duration_ms).toEqual(expect.any(Number));
});

it("details a download failure by the shell's code, attempts, and how much arrived", () => {
    const failed = (
        errorCode: DesktopDaemonSnapshot["errorCode"],
        downloadFailure?: DesktopDaemonSnapshot["downloadFailure"],
    ) =>
        setupDownloadFailureOf(
            view({
                onboarding: onboarding("daemonDownload"),
                daemon: daemon({
                    error: PRIVATE_TEXT,
                    ...(errorCode ? { errorCode } : {}),
                    ...(downloadFailure ? { downloadFailure } : {}),
                }),
            }),
        );
    expect(failed("release_lookup_rate_limited")).toEqual({
        error_detail: "release_lookup_rate_limited",
        attempt_count: 0,
        transfer_percent_bucket: "none",
    });
    expect(
        failed("transfer_interrupted", { attempts: 6, receivedBytes: 40, totalBytes: 100 }),
    ).toEqual({
        error_detail: "transfer_interrupted",
        attempt_count: 6,
        transfer_percent_bucket: "under_half",
    });
    expect(
        failed("transfer_timeout", { attempts: 2, receivedBytes: 50, totalBytes: 100 }),
    ).toMatchObject({ transfer_percent_bucket: "over_half" });
    expect(
        failed("filesystem_locked", { attempts: 1, receivedBytes: 100, totalBytes: 100 }),
    ).toMatchObject({ error_detail: "filesystem_locked", transfer_percent_bucket: "complete" });
    // An older shell sends no code, and a start timeout is not a download's.
    expect(failed(undefined)).toBeUndefined();
    expect(failed("start_timeout")).toBeUndefined();
    expect(
        setupDownloadFailureOf(
            view({
                onboarding: onboarding("daemonDownload"),
                daemon: daemon({ errorCode: "disk_full" }),
            }),
        ),
    ).toBeUndefined();
});

it("sends the download detail with a download failure at close, and only with one", () => {
    const client = clientCreate();
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directoryCreate(),
        client,
    });
    const { store, welcome, publish } = onboardingCreate();
    const unsubscribe = analytics.onboardingObserve(store, welcome).subscribe(() => undefined);
    publish(
        view({
            onboarding: onboarding("daemonDownload"),
            daemon: daemon({
                error: PRIVATE_TEXT,
                errorCode: "transfer_interrupted",
                downloadFailure: { attempts: 6, receivedBytes: 70, totalBytes: 100 },
            }),
        }),
    );
    // The retry clears the shell's error first; the window's own failure stays.
    publish(
        view({
            onboarding: onboarding("daemonDownload"),
            daemon: daemon({ operation: "downloading" }),
            failure: { cause: "download", message: PRIVATE_TEXT },
        }),
    );
    window.dispatchEvent(new Event("pagehide"));
    unsubscribe();
    analytics.dispose();

    const results = client.captured.filter((c) => c.event === "onboarding_setup_result");
    expect(results).toHaveLength(1);
    expect(results[0]?.properties).toMatchObject({
        result: "failed",
        error_code: "download_failed",
        error_detail: "transfer_interrupted",
        attempt_count: 6,
        transfer_percent_bucket: "over_half",
    });

    const later = clientCreate();
    const second = desktopAnalyticsCreate({
        development: false,
        happyAgents: directoryCreate(),
        client: later,
    });
    const next = onboardingCreate();
    const stop = second.onboardingObserve(next.store, next.welcome).subscribe(() => undefined);
    next.publish(
        view({
            onboarding: onboarding("daemonDownload"),
            daemon: daemon({ error: PRIVATE_TEXT, errorCode: "disk_full" }),
        }),
    );
    next.publish(
        view({ onboarding: onboarding("connectFailed"), runtime: runtimeError("start_timeout") }),
    );
    window.dispatchEvent(new Event("pagehide"));
    stop();
    second.dispose();
    const properties = later.captured.find(
        (c) => c.event === "onboarding_setup_result",
    )?.properties;
    expect(properties).toMatchObject({ error_code: "start_timeout" });
    expect(properties).not.toHaveProperty("error_detail");
    expect(properties).not.toHaveProperty("attempt_count");
});

it("shows Windows the vendors' PowerShell installers and every other OS their shell one-liners", () => {
    expect(localOnboardingInstallCommand("claude", "powershell")).toBe(
        "irm https://claude.ai/install.ps1 | iex",
    );
    expect(localOnboardingInstallCommand("grok", "powershell")).toBe(
        "irm https://x.ai/cli/install.ps1 | iex",
    );
    expect(localOnboardingInstallCommand("codex", "powershell")).toBe("npm i -g @openai/codex");
    expect(localOnboardingInstallCommand("claude", "posix")).toBe(
        "curl -fsSL https://claude.ai/install.sh | bash",
    );
    expect(localOnboardingInstallCommand("grok", "posix")).toBe(
        "curl -fsSL https://x.ai/cli/install.sh | bash",
    );
    expect(localOnboardingInstallCommand("codex", "posix")).toBe("npm i -g @openai/codex");
});

it("takes the install shell from the desktop, and from the renderer's OS only on an older shell", () => {
    const subscriptions = (extra: Partial<LocalOnboardingSnapshot>) =>
        localOnboardingView(
            view({
                onboarding: onboarding("assistantsFound", {
                    assistants: [{ id: "claude", status: "missing" }],
                    ...extra,
                }),
            }),
        );
    expect(subscriptions({ installShell: "powershell" })).toMatchObject({
        installShell: "powershell",
    });
    expect(subscriptions({ installShell: "posix" })).toMatchObject({ installShell: "posix" });
    expect(rendererInstallShell("Win32")).toBe("powershell");
    expect(rendererInstallShell("Windows")).toBe("powershell");
    expect(rendererInstallShell("MacIntel")).toBe("posix");
    expect(rendererInstallShell("macOS")).toBe("posix");
    expect(rendererInstallShell("Linux x86_64")).toBe("posix");
    vi.stubGlobal("navigator", { platform: "Win32" });
    expect(subscriptions({})).toMatchObject({ installShell: "powershell" });
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgentData: { platform: "macOS" } });
    expect(subscriptions({})).toMatchObject({ installShell: "posix" });
});

it("reports the machine's other apps once, and which installs only a refreshed PATH found", () => {
    const client = clientCreate();
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directoryCreate([{ id: "local", status: "connected", bots: [] }]),
        client,
    });
    const { store, welcome, publish } = onboardingCreate();
    const observed = analytics.onboardingObserve(store, welcome);
    const unsubscribe = observed.subscribe(() => undefined);
    const subscriptions = (localApps?: LocalOnboardingSnapshot["localApps"]) =>
        view({
            onboarding: onboarding("assistantsFound", {
                assistants: [
                    { id: "claude", status: "found", command: "C:\\x", pathRefreshed: true },
                    { id: "codex", status: "found", command: "C:\\y" },
                    { id: "grok", status: "missing" },
                ],
                installShell: "powershell",
                ...(localApps ? { localApps } : {}),
            }),
            providerAuthentication: {
                claude: "invalid",
                codex: "valid",
                complete: true,
                custom: { providers: [], result: "invalid" },
                grok: "invalid",
            },
        });
    // Still looking: nothing is sent until the answer arrives.
    publish(subscriptions());
    expect(client.captured.filter((c) => c.event === "onboarding_local_apps")).toEqual([]);
    const apps = { agyCli: false, antigravityApp: null, claudeDesktop: true, codexDesktop: false };
    publish(subscriptions(apps));
    publish(subscriptions({ ...apps, agyCli: true }));
    expect(
        client.captured.filter((c) => c.event === "onboarding_local_apps").map((c) => c.properties),
    ).toEqual([
        expect.objectContaining({
            claude_desktop_app: true,
            codex_desktop_app: false,
            antigravity_app: null,
            agy_cli: false,
        }),
    ]);

    observed.commandCopied({ assistant: "claude", kind: "sign-in" });
    observed.assistantsContinue();
    expect(
        client.captured.find((c) => c.event === "onboarding_command_copied")?.properties,
    ).toMatchObject({ assistant: "claude", kind: "sign_in", shell: "powershell" });
    expect(
        client.captured
            .filter((c) => c.event === "onboarding_assistant_status")
            .map(({ properties }) => [
                properties.assistant,
                properties.status,
                properties.path_refreshed,
            ]),
    ).toEqual([
        ["claude", "not_signed_in", true],
        ["codex", "signed_in", false],
        ["grok", "not_installed", false],
        ["custom", "not_signed_in", false],
    ]);
    unsubscribe();
    analytics.dispose();
});

it("sends unknown apps for a shell too old to look for them", () => {
    const client = clientCreate();
    const analytics = desktopAnalyticsCreate({
        development: false,
        happyAgents: directoryCreate(),
        client,
    });
    const { store, welcome, publish } = onboardingCreate();
    const unsubscribe = analytics.onboardingObserve(store, welcome).subscribe(() => undefined);
    publish(
        view({
            onboarding: onboarding("assistantsFound", {
                assistants: [{ id: "claude", status: "missing" }],
            }),
        }),
    );
    expect(
        client.captured.filter((c) => c.event === "onboarding_local_apps").map((c) => c.properties),
    ).toEqual([
        expect.objectContaining({
            claude_desktop_app: null,
            codex_desktop_app: null,
            antigravity_app: null,
            agy_cli: null,
        }),
    ]);
    unsubscribe();
    analytics.dispose();
});
