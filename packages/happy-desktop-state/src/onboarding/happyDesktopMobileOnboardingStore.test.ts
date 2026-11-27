import type { HappyIntegration } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import { happyMobileOnboardingStoreCreate } from "./happyMobileOnboardingStore.js";

const disabled: HappyIntegration = {
    authorization: null,
    configured: false,
    error: null,
    status: "disabled",
    updatedAt: 1,
    version: "0001",
};
const unlinked: HappyIntegration = {
    authorization: null,
    configured: false,
    error: null,
    status: "disconnected",
    updatedAt: 2,
    version: "0002",
};

/** A connection whose stream yields one bootstrap, then waits. */
function syncWith(integration: HappyIntegration): HappyAgentSync {
    return {
        async *follow({ signal }) {
            yield {
                kind: "bootstrap",
                bootstrap: { happyIntegration: integration } as never,
            } satisfies HappyAgentSyncInput;
            await new Promise((resolve) => signal.addEventListener("abort", resolve));
        },
        health: () => undefined,
    };
}

function guided(integration: HappyIntegration) {
    return happyMobileOnboardingStoreCreate({
        guided: true,
        sync: syncWith(integration),
        client: { getHappyIntegration: vi.fn() } as never,
    });
}

it("keeps offering the guided phone step when the Happy Agent turned its relay off", async () => {
    const store = guided(disabled);
    const leave = store.subscribe(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.get()).toEqual({ status: "desktop", step: { kind: "intro" } });
    store.happyMobileConnect();
    expect(store.get()).toEqual({ status: "desktop", step: { kind: "link" } });
    leave();
    store[Symbol.dispose]();
});

it("keeps offering the guided phone step while the relay is on", async () => {
    const store = guided(unlinked);
    const leave = store.subscribe(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.get()).toEqual({ status: "desktop", step: { kind: "intro" } });
    leave();
    store[Symbol.dispose]();
});
