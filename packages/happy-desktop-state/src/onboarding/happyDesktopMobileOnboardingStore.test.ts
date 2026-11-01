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
        client: {
            cancelHappyIntegration: vi.fn(),
            getHappyIntegration: vi.fn(),
            startHappyIntegration: vi.fn(),
        } as never,
    });
}

it("ends the guided phone step when the Happy Agent turned its relay off", async () => {
    const store = guided(disabled);
    const statuses: string[] = [];
    const leave = store.subscribe(() => statuses.push(store.get().status));
    await vi.waitFor(() => expect(store.get().status).toBe("disabled"));
    // Nothing on the way offered a code for a relay that is off.
    expect(statuses).not.toContain("pairing");
    leave();
    store[Symbol.dispose]();
});

it("keeps offering the guided phone step while the relay is on", async () => {
    const store = guided(unlinked);
    const leave = store.subscribe(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.get()).toEqual({ status: "desktop", step: { kind: "intro", platform: "ios" } });
    leave();
    store[Symbol.dispose]();
});
