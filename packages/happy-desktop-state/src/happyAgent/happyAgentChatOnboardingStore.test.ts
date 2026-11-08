import type { OnboardingFlow, OnboardingState } from "@slopus/happy-agent-client";
import { describe, expect, it, vi } from "vitest";
import type { HappyAgentHealth, HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
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

/** A team server that runs onboarding as a conversation, with nothing on its stream. */
function serverOf(options: { readonly read: OnboardingFlow; readonly started?: OnboardingFlow }) {
    const sync: HappyAgentSync = {
        async *follow({ signal }) {
            await new Promise<void>((resume) =>
                signal.addEventListener("abort", () => resume(), { once: true }),
            );
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
    return { deps, startOnboardingFlow, conversationOpen };
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
});
