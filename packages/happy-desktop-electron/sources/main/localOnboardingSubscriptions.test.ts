import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    DesktopDaemonSnapshot,
    DesktopRuntimeSnapshot,
    LocalOnboardingSnapshot,
} from "../shared/desktopContract";
import { LocalOnboarding, type LocalHappyAgentOnboardingState } from "./localOnboarding";
import type { LocalAssistantCommands } from "./localHappyAgent";

const directories: string[] = [];
const onboardings: LocalOnboarding[] = [];
afterEach(async () => {
    for (const onboarding of onboardings.splice(0)) onboarding[Symbol.dispose]();
    vi.useRealTimers();
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

/**
 * A new machine at Subscriptions: the agent is connected and fresh, and what
 * the login shell finds and what Happy Agent says are whatever the test sets.
 */
async function onboardingCreate(machine: {
    assistants: LocalAssistantCommands;
    onboarding: LocalHappyAgentOnboardingState;
}) {
    const root = await mkdtemp(join(tmpdir(), "happy-onboarding-subscriptions-"));
    directories.push(root);
    const resolve = vi.fn(async () => machine.onboarding);
    const onboarding = await LocalOnboarding.create({
        daemon: { get: () => DAEMON, subscribe: () => () => undefined },
        directoryPick: async () => undefined,
        // The shell answers at once, so it always lands before Happy Agent does.
        probe: async () => ({
            assistants: { ...machine.assistants },
            assistantsRefreshed: [],
            environment: { PATH: "/usr/bin" },
            shell: "/bin/zsh",
        }),
        recordPath: join(root, "local-onboarding.json"),
        runtime: {
            get: () => RUNTIME,
            subscribe: () => () => undefined,
            retry: async () => undefined,
            localOnboardingResolve: resolve,
            localOnboardingFreshness: async () => "fresh",
            localOnboardingProjectAdd: async (_connection, path) => ({ path }),
        },
    });
    onboardings.push(onboarding);
    const stages: LocalOnboardingSnapshot["stage"][] = [];
    onboarding.subscribe((snapshot) => stages.push(snapshot.stage));
    return { onboarding, resolve, stages };
}

function codexOf(snapshot: LocalOnboardingSnapshot) {
    return snapshot.assistants?.find((assistant) => assistant.id === "codex");
}

describe("first-run setup at Subscriptions", () => {
    it("sees an assistant installed and signed in while the step is on screen", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
        const machine = {
            assistants: { claude: "/opt/homebrew/bin/claude" } as LocalAssistantCommands,
            onboarding: { state: "provider_setup" } as LocalHappyAgentOnboardingState,
        };
        const { onboarding, resolve, stages } = await onboardingCreate(machine);
        await vi.waitFor(() => expect(onboarding.get().stage).toBe("providersMissing"));
        expect(codexOf(onboarding.get())).toEqual({ id: "codex", status: "missing" });
        stages.length = 0;

        // `npm i -g @openai/codex` in a terminal.
        machine.assistants = { ...machine.assistants, codex: "/opt/homebrew/bin/codex" };
        await vi.advanceTimersByTimeAsync(3_000);
        await vi.waitFor(() =>
            expect(codexOf(onboarding.get())).toEqual({
                command: "/opt/homebrew/bin/codex",
                id: "codex",
                status: "found",
            }),
        );

        // Asking Happy Agent again every tick keeps its last answer on screen
        // meanwhile: the step is never swapped for "examining" and back.
        await vi.advanceTimersByTimeAsync(3_000);
        await vi.advanceTimersByTimeAsync(3_000);
        await vi.waitFor(() => expect(resolve.mock.calls.length).toBeGreaterThanOrEqual(4));
        expect(new Set(stages)).toEqual(new Set(["providersMissing"]));

        // `codex login`: Happy Agent now has a provider, and setup moves on.
        machine.onboarding = { state: "complete" };
        await vi.advanceTimersByTimeAsync(3_000);
        await vi.waitFor(() => expect(onboarding.get().stage).toBe("assistantsFound"));
        expect(stages).not.toContain("examining");
    });

    it("keeps re-examining the machine on the report of what it has", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
        const machine = {
            assistants: { claude: "/opt/homebrew/bin/claude" } as LocalAssistantCommands,
            onboarding: { state: "complete" } as LocalHappyAgentOnboardingState,
        };
        const { onboarding } = await onboardingCreate(machine);
        await vi.waitFor(() => expect(onboarding.get().stage).toBe("assistantsFound"));
        expect(codexOf(onboarding.get())?.status).toBe("missing");

        machine.assistants = { ...machine.assistants, codex: "/opt/homebrew/bin/codex" };
        await vi.advanceTimersByTimeAsync(3_000);
        await vi.waitFor(() => expect(codexOf(onboarding.get())?.status).toBe("found"));

        // Past the report there is nothing to watch for, so the poll stops.
        onboarding.assistantsContinue();
        expect(onboarding.get().stage).not.toBe("assistantsFound");
        expect(vi.getTimerCount()).toBe(0);
    });
});
