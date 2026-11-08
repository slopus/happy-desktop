import type { OnboardingFlow, OnboardingState } from "@slopus/happy-agent-client";
import { describe, expect, it, vi } from "vitest";
import type {
    HappyAgentHealth,
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentChatOnboardingStoreCreate,
    type HappyAgentChatOnboardingStoreDeps,
} from "./happyAgentChatOnboardingStore.js";

const WELCOME_TASK = "welcome-task-viewer";

function flowOf(overrides: Partial<OnboardingFlow>): OnboardingFlow {
    return {
        version: "0190a000-0000-7000-8000-000000000001",
        recipe: "viewer",
        status: "not_started",
        step: null,
        agentId: null,
        composer: "enabled",
        composerPlaceholder: null,
        restartRequired: false,
        onboardingVersion: 1,
        completedVersion: null,
        ...overrides,
    };
}

/**
 * A team server that runs onboarding as a conversation. `read` is what it
 * answers now; `reconcile` tells the store to read it again.
 */
function serverOf(options: { read: OnboardingFlow; started?: OnboardingFlow }) {
    const queue: HappyAgentSyncInput[] = [];
    let wake: (() => void) | undefined;
    const sync: HappyAgentSync = {
        async *follow({ signal }) {
            while (!signal.aborted) {
                const next = queue.shift();
                if (next) {
                    yield next;
                    continue;
                }
                await new Promise<void>((resume) => {
                    wake = resume;
                    signal.addEventListener("abort", () => resume(), { once: true });
                });
            }
        },
        health: () => ({ capabilities: { chatOnboarding: true } }) as HappyAgentHealth,
    };
    const startOnboardingFlow = vi.fn(async () => ({
        flow: options.started ?? options.read,
    }));
    const conversationOpen = vi.fn<(agentId: string) => void>();
    const deps: HappyAgentChatOnboardingStoreDeps = {
        client: {
            getOnboardingFlow: async () => ({ flow: options.read }),
            getOnboarding: async () =>
                ({ completed: options.read.status === "finished" }) as OnboardingState,
            startOnboardingFlow,
        },
        sync,
        conversationOpen,
    };
    const reconcile = (): void => {
        queue.push({ kind: "reconcile" });
        wake?.();
    };
    return { deps, startOnboardingFlow, conversationOpen, options, reconcile };
}

describe("happyAgentChatOnboardingStore", () => {
    it("opens a viewer's Welcome when their start answers with a flow already finished", async () => {
        const server = serverOf({
            read: flowOf({ status: "not_started" }),
            started: flowOf({
                version: "0190a000-0000-7000-8000-000000000002",
                status: "finished",
                agentId: WELCOME_TASK,
                completedVersion: 1,
            }),
        });
        const store = happyAgentChatOnboardingStoreCreate(server.deps);
        const stop = store.subscribe(() => undefined);
        store.begin();

        await vi.waitFor(() => expect(server.conversationOpen).toHaveBeenCalledWith(WELCOME_TASK));
        expect(server.startOnboardingFlow).toHaveBeenCalledTimes(1);
        expect(store.get().flow?.status).toBe("finished");

        // Reading the same finished flow again opens nothing more.
        store.begin();
        stop();
        const again = store.subscribe(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(server.conversationOpen).toHaveBeenCalledTimes(1);
        again();
        store[Symbol.dispose]();
    });

    it("opens nothing for a flow that was already finished when read", async () => {
        const server = serverOf({
            read: flowOf({ status: "finished", agentId: WELCOME_TASK, completedVersion: 1 }),
        });
        const store = happyAgentChatOnboardingStoreCreate(server.deps);
        const stop = store.subscribe(() => undefined);
        store.begin();

        await vi.waitFor(() => expect(store.get().flow?.status).toBe("finished"));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(server.startOnboardingFlow).not.toHaveBeenCalled();
        expect(server.conversationOpen).not.toHaveBeenCalled();
        stop();
        store[Symbol.dispose]();
    });

    it("takes a flow of another recipe that replaces the one it had, though its version starts over", async () => {
        const team = flowOf({
            version: "0190a000-0000-7000-8000-000000000009",
            recipe: "teamOwner",
            status: "running",
            agentId: "chief-of-staff",
        });
        const server = serverOf({ read: team });
        const store = happyAgentChatOnboardingStoreCreate(server.deps);
        const stop = store.subscribe(() => undefined);
        store.begin();
        await vi.waitFor(() =>
            expect(server.conversationOpen).toHaveBeenCalledWith("chief-of-staff"),
        );

        // The member can no longer run the team's setup: their own Welcome replaces it.
        server.options.read = flowOf({
            version: "00000000-0000-7000-8000-000000000000",
            recipe: "teammate",
            status: "not_started",
        });
        server.options.started = flowOf({
            version: "0190a000-0000-7000-8000-000000000003",
            recipe: "teammate",
            status: "running",
            agentId: WELCOME_TASK,
        });
        server.reconcile();

        await vi.waitFor(() => expect(server.conversationOpen).toHaveBeenCalledWith(WELCOME_TASK));
        expect(store.get().flow?.recipe).toBe("teammate");
        expect(server.startOnboardingFlow).toHaveBeenCalledTimes(1);
        stop();
        store[Symbol.dispose]();
    });

    it("keeps the greater version of one flow when an older answer arrives late", async () => {
        const newer = flowOf({
            version: "0190a000-0000-7000-8000-000000000005",
            recipe: "teamOwner",
            status: "running",
            agentId: "chief-of-staff",
            step: "invite",
        });
        const server = serverOf({ read: newer });
        const store = happyAgentChatOnboardingStoreCreate(server.deps);
        const stop = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().flow?.step).toBe("invite"));

        server.options.read = flowOf({
            version: "0190a000-0000-7000-8000-000000000004",
            recipe: "teamOwner",
            status: "running",
            agentId: "chief-of-staff",
            step: "name",
        });
        server.reconcile();
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(store.get().flow?.step).toBe("invite");
        stop();
        store[Symbol.dispose]();
    });

    it("tells flows apart by id where the server sends one, whatever their recipe", async () => {
        const first = flowOf({
            id: "flow-1",
            version: "0190a000-0000-7000-8000-000000000009",
            recipe: "team-owner",
            status: "running",
            agentId: "chief-of-staff",
            step: "invite",
        });
        const server = serverOf({ read: first });
        const store = happyAgentChatOnboardingStoreCreate(server.deps);
        const stop = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().flow?.step).toBe("invite"));

        // An older answer about the same flow changes nothing.
        server.options.read = {
            ...first,
            version: "0190a000-0000-7000-8000-000000000001",
            step: "name",
        };
        server.reconcile();
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(store.get().flow?.step).toBe("invite");

        // Another flow of the same recipe replaces it, though its version is lower.
        server.options.read = {
            ...first,
            id: "flow-2",
            version: "0190a000-0000-7000-8000-000000000002",
            step: "welcome",
        };
        server.reconcile();
        await vi.waitFor(() => expect(store.get().flow?.id).toBe("flow-2"));
        expect(store.get().flow?.step).toBe("welcome");
        stop();
        store[Symbol.dispose]();
    });
});
