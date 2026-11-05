import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopDaemonSnapshot, DesktopRuntimeSnapshot } from "../shared/desktopContract";
import { LocalOnboarding, type LocalOnboardingWindowsSandbox } from "./localOnboarding";
import type { WindowsSandboxSnapshot } from "./windowsSandbox";

const directories: string[] = [];
const onboardings: LocalOnboarding[] = [];
afterEach(async () => {
    for (const onboarding of onboardings.splice(0)) onboarding[Symbol.dispose]();
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
});

const RUNTIME = {
    phase: "ready",
    activeTarget: {
        authentication: "happyAgent",
        happyAgentHttpUrl: "http://happy-agent",
        happyAgentVersion: "0.4.120",
        detail: "",
        id: "local",
        kind: "local",
        label: "This computer",
        mode: "local",
    },
    activeTargetId: "local",
    connectionId: 1,
    mode: "local",
    targets: [],
    update: { status: "idle" },
} as const satisfies DesktopRuntimeSnapshot;

const DAEMON: DesktopDaemonSnapshot = {
    install: { phase: "idle" },
    installation: "installed",
    installedVersion: "0.4.120",
    managed: true,
    operation: "idle",
    runtime: "ready",
    updateAvailable: false,
    versions: [],
};

/** A sandbox that answers what each test says, and records presses of its button. */
function sandboxFake(initial: WindowsSandboxSnapshot) {
    let snapshot = initial;
    const listeners = new Set<(snapshot: WindowsSandboxSnapshot) => void>();
    const set = (next: WindowsSandboxSnapshot) => {
        snapshot = next;
        for (const listener of listeners) listener(next);
    };
    const setup = vi.fn(async () => set({ state: "settingUp" }));
    const sandbox: LocalOnboardingWindowsSandbox = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setup,
    };
    return { sandbox, set, setup };
}

/** A returning machine: the agent is installed, connected, and already used. */
async function onboardingCreate(sandbox: LocalOnboardingWindowsSandbox) {
    const root = await mkdtemp(join(tmpdir(), "happy-onboarding-sandbox-"));
    directories.push(root);
    const onboarding = await LocalOnboarding.create({
        daemon: { get: () => DAEMON, subscribe: () => () => undefined },
        directoryPick: async () => undefined,
        probe: async () => ({
            assistants: {},
            assistantsRefreshed: [],
            environment: {},
            shell: "powershell",
        }),
        recordPath: join(root, "local-onboarding.json"),
        runtime: {
            get: () => RUNTIME,
            subscribe: () => () => undefined,
            retry: async () => undefined,
            localOnboardingResolve: async () => ({ state: "complete" }),
            localOnboardingFreshness: async () => "used",
            localOnboardingProjectAdd: async (_connection, path) => ({ path }),
        },
        sandbox,
    });
    onboardings.push(onboarding);
    // The connected Agent has said it is already used: setup's own question is answered.
    await vi.waitFor(() => expect(onboarding.get().freshness).toBe("used"));
    return onboarding;
}

describe("first-run setup with a Windows sandbox", () => {
    it("holds even a finished machine on the sandbox step until it is set up", async () => {
        const { sandbox, set, setup } = sandboxFake({ state: "required" });
        const onboarding = await onboardingCreate(sandbox);
        expect(onboarding.get()).toMatchObject({
            stage: "sandbox",
            sandbox: { settingUp: false },
            sandboxStep: true,
        });
        // Nothing reaches Windows until the button is pressed.
        expect(setup).not.toHaveBeenCalled();

        await onboarding.sandboxSetup();
        expect(setup).toHaveBeenCalledOnce();
        expect(onboarding.get()).toMatchObject({ stage: "sandbox", sandbox: { settingUp: true } });

        set({ state: "required", previousAttempt: "cancelled" });
        expect(onboarding.get()).toMatchObject({
            stage: "sandbox",
            sandbox: { settingUp: false, previousAttempt: "cancelled" },
        });

        set({ state: "ready" });
        // The step stays on the bar once it is done; the sequence moves on.
        expect(onboarding.get()).toMatchObject({ stage: "complete", sandboxStep: true });
        expect(onboarding.get().sandbox).toBeUndefined();
        expect(() => onboarding.sandboxSetup()).toThrow("not the current one");
    });

    it("waits for the Agent's answer instead of opening the workspace early", async () => {
        const { sandbox, set } = sandboxFake({ state: "checking" });
        const onboarding = await onboardingCreate(sandbox);
        expect(onboarding.get()).toMatchObject({ stage: "examining", sandboxStep: true });
        set({ state: "required" });
        expect(onboarding.get().stage).toBe("sandbox");
    });

    it("stays out of the way of a ready sandbox and an older Agent", async () => {
        for (const state of ["ready", "unsupported", "notApplicable"] as const) {
            const { sandbox } = sandboxFake({ state });
            const onboarding = await onboardingCreate(sandbox);
            expect(onboarding.get().stage).toBe("complete");
            expect(onboarding.get().sandboxStep).toBeUndefined();
        }
    });
});
