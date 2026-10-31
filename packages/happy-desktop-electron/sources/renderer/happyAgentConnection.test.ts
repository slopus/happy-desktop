// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import type {
    DesktopRuntimeSnapshot,
    HappyDesktopBridge,
    LocalOnboardingSnapshot,
} from "../shared/desktopContract";
import { happyAgentConnectionOpen, type HappyAgentConnectionHandle } from "./happyAgentConnection";
import { localOnboardingStoreCreate, localOnboardingView } from "./localOnboardingStore";

// The app package brings the whole renderer UI with it; this connection only
// hands its terminal driver on, and no terminal is opened here.
vi.mock("happy-desktop-app", () => ({ terminalDriverCreate: () => undefined }));

const handles: HappyAgentConnectionHandle[] = [];
const unsubscribes: (() => void)[] = [];

/**
 * A fresh device for every test: hints one test leaves behind must not decide
 * what the next one reads, and jsdom's own storage is missing under some Node
 * versions, which would silently drop every hint.
 */
function memoryStorageCreate(): Storage {
    const values = new Map<string, string>();
    return {
        get length() {
            return values.size;
        },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => void values.delete(key),
        setItem: (key, value) => void values.set(key, String(value)),
    };
}

beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorageCreate());
});

afterEach(() => {
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    for (const handle of handles.splice(0)) handle.dispose();
    vi.unstubAllGlobals();
});

function connectionOpen(
    daemon: ReturnType<typeof fakeHappyAgentDaemonCreate>,
    options: { readonly local: boolean },
): HappyAgentConnectionHandle {
    const handle = happyAgentConnectionOpen({
        client: daemon.client,
        cloudHost: {
            cloudAuthCallbackSubscribe: () => () => undefined,
            cloudAuthCallbackTake: async () => undefined,
            cloudAuthConfigurationGet: () => new Promise(() => undefined),
            cloudAuthOpen: async () => undefined,
        },
        deps: {
            changed: () => undefined,
            conversationOpen: () => undefined,
            groupForget: () => undefined,
            subtasksForget: () => undefined,
            groupOpen: () => undefined,
        },
        guidedMobileSetup: options.local,
        happyAgentHttpUrl: "http://happy-agent.test",
        happyAgentId: options.local ? "local" : "remote",
        host: { applicationMenuOpen: () => undefined, directoryPick: async () => undefined },
        memberProfileRequired: !options.local,
        modelPreferencePersistence: { read: () => undefined, write: () => undefined },
        terminalColorScheme: () => "light",
    });
    handles.push(handle);
    return handle;
}

/** What a machine that has never had Happy reports before its first project. */
const freshMachineOnboarding = {
    completed: false,
    steps: {
        profile: { done: false },
        project: { done: false },
        providers: { done: true, signedIn: ["claude"] },
    },
};

it("loads the local workspace on a fresh machine that has no profile", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.onboardingSet(freshMachineOnboarding);
    const handle = connectionOpen(daemon, { local: true });

    await vi.waitFor(() => expect(handle.get()).toBeDefined());
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(handle.failure()).toBeUndefined();
});

it("keeps a remote member without a profile out of the workspace", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.onboardingSet(freshMachineOnboarding);
    const handle = connectionOpen(daemon, { local: false });

    // Startup state arrives, so the member can be asked for a profile...
    await vi.waitFor(() => expect(handle.setup?.onboarding.get().available).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // ...but nothing that needs one is kept. The one bootstrap tried beside the feed said a
    // profile is still owed, so it was set aside and the feed opened beside it closed.
    expect(handle.get()).toBeUndefined();
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(daemon.streamLiveCount()).toBe(0);
});

it("loads the workspace without reading health, onboarding, profile, or config apart", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const handle = connectionOpen(daemon, { local: true });

    await vi.waitFor(() => expect(handle.get()).toBeDefined());
    // The bootstrap carried all of them, and the model catalog came from its configuration.
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(daemon.callCount("getHealth")).toBe(0);
    expect(daemon.callCount("getOnboarding")).toBe(0);
    expect(daemon.callCount("getProfile")).toBe(0);
    expect(daemon.callCount("getConfig")).toBe(0);
});

it("offers mobile setup on a fresh machine's project stage", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.onboardingSet(freshMachineOnboarding);
    const handle = connectionOpen(daemon, { local: true });
    const onboarding: LocalOnboardingSnapshot = {
        busy: false,
        freshness: "fresh",
        stage: "project",
    };
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
        onboardingSubscribe: () => () => undefined,
        runtimeGet: async () => runtime,
        subscribe: () => () => undefined,
    } as unknown as HappyDesktopBridge;
    const store = localOnboardingStoreCreate(bridge, {
        chiefOfStaff: { get: () => handle.get()?.workspace, subscribe: () => () => undefined },
        chiefOfStaffPrepare: () => new Promise(() => undefined),
        localConnected: { get: () => true, subscribe: () => () => undefined },
        happyMobile: {
            get: () => handle.setup?.onboarding.mobile,
            subscribe: () => () => undefined,
        },
    });
    unsubscribes.push(store.subscribe(() => undefined));

    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toEqual({
            kind: "happy-mobile-desktop",
            step: { kind: "intro", platform: "ios" },
        }),
    );
    // The first conversation after mobile setup needs the workspace as well.
    await vi.waitFor(() => expect(handle.get()?.workspace).toBeDefined());
});

it("lets mobile setup be skipped before the local connection offers it", async () => {
    const onboarding: LocalOnboardingSnapshot = {
        busy: false,
        freshness: "fresh",
        stage: "project",
    };
    const bridge = {
        daemonGet: () => new Promise(() => undefined),
        daemonSubscribe: () => () => undefined,
        onboardingGet: async () => onboarding,
        onboardingSubscribe: () => () => undefined,
        runtimeGet: async () =>
            ({
                activeTarget: { happyAgentHttpUrl: "http://happy-agent.test", mode: "local" },
                activeTargetId: "local",
                connectionId: 1,
                mode: "local",
                phase: "ready",
                targets: [],
                update: { status: "idle" },
            }) as unknown as DesktopRuntimeSnapshot,
        subscribe: () => () => undefined,
    } as unknown as HappyDesktopBridge;
    const store = localOnboardingStoreCreate(bridge, {
        chiefOfStaff: { get: () => undefined, subscribe: () => () => undefined },
        chiefOfStaffPrepare: () => new Promise(() => undefined),
        localConnected: { get: () => true, subscribe: () => () => undefined },
        happyMobile: { get: () => undefined, subscribe: () => () => undefined },
    });
    unsubscribes.push(store.subscribe(() => undefined));
    await vi.waitFor(() =>
        expect(localOnboardingView(store.get())).toEqual({ kind: "happy-mobile-checking" }),
    );

    store.happyMobileSkip();
    expect(localOnboardingView(store.get())).toMatchObject({ kind: "finishing" });
});

it("follows a daemon restarted behind the same endpoint onto its version and models", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ daemon: "0.4.73-preview.4" });
    const changed = vi.fn();
    const modelIds = (): readonly string[] => {
        const models = handle.get()?.models.get();
        return models?.type === "ready"
            ? models.catalog.providers.flatMap((provider) =>
                  provider.models.map((model) => `${provider.id}/${model.id}`),
              )
            : [];
    };
    const handle = happyAgentConnectionOpen({
        client: daemon.client,
        cloudHost: {
            cloudAuthCallbackSubscribe: () => () => undefined,
            cloudAuthCallbackTake: async () => undefined,
            cloudAuthConfigurationGet: () => new Promise(() => undefined),
            cloudAuthOpen: async () => undefined,
        },
        deps: {
            changed,
            conversationOpen: () => undefined,
            groupForget: () => undefined,
            subtasksForget: () => undefined,
            groupOpen: () => undefined,
        },
        happyAgentHttpUrl: "http://happy-agent.test",
        happyAgentId: "local",
        host: { applicationMenuOpen: () => undefined, directoryPick: async () => undefined },
        memberProfileRequired: false,
        modelPreferencePersistence: {
            read: () => undefined,
            write: () => undefined,
        },
        terminalColorScheme: () => "light",
    });
    handles.push(handle);
    await vi.waitFor(() => expect(handle.get()).toBeDefined());
    const session = handle.get()!;
    await vi.waitFor(() =>
        expect(session.connection.get()).toMatchObject({
            connection: "connected",
            version: "0.4.73-preview.4",
        }),
    );

    expect(modelIds()).toEqual(["test-provider/test-model"]);

    // The restarted daemon also came back with a provider switched on, and it
    // never announces that: it has no idea what the previous process offered.
    const config = daemon.configGet();
    daemon.configSet({
        ...config,
        models: { ...config.models, "grok-4.7": { ...config.models["test-model"]!, name: "Grok" } },
        providers: {
            ...config.providers,
            grok: { enabled: true, models: [{ enabled: true, id: "grok-4.7" }], type: "grok" },
        },
    });
    // Until the replacement's own health admits it, nothing of it is taken:
    // the last confirmed version and models stay while the window reconnects.
    const healthRelease = daemon.pause("getHealth");
    daemon.daemonReplace({ version: "0.4.75" });
    await vi.waitFor(() => expect(session.connection.get().connection).toBe("disconnected"));
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(session.connection.get().version).toBe("0.4.73-preview.4");
    expect(modelIds()).toEqual(["test-provider/test-model"]);

    healthRelease();
    await vi.waitFor(() =>
        expect(session.connection.get()).toMatchObject({
            connection: "connected",
            version: "0.4.75",
        }),
    );
    await vi.waitFor(() =>
        expect(modelIds()).toEqual(["test-provider/test-model", "grok/grok-4.7"]),
    );
    // Reconciled in place: the same session and stores, never a new one.
    expect(handle.get()).toBe(session);
});
