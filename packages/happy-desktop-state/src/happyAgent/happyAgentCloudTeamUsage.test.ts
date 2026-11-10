import { expect, it, vi } from "vitest";
import { happyAgentCloudTeamUsageAllowed } from "./happyAgentCloudTeamUsage.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import {
    happyAgentProviderUsageStoreCreate,
    type HappyAgentProviderUsageSource,
} from "./happyAgentProviderUsageStore.js";

/* Happy Cloud's team usage needs `usage.view_team`. A role without it is told
 * so and its usage is never read; a server that predates the permission, or a
 * permission read that fails, reads the usage as before. */

const REGISTRY = [
    { id: "providers.manage", description: "" },
    { id: "usage.view_team", description: "See the team's usage and spend, and each member's." },
];

const permissions = (answer: unknown): HappyCloudRequest => vi.fn(async () => answer);

it("allows team usage only where the server lists the permission and grants it", async () => {
    expect(
        await happyAgentCloudTeamUsageAllowed(
            permissions({ permissions: REGISTRY, granted: ["usage.view_team"] }),
        ),
    ).toBe(true);
    expect(
        await happyAgentCloudTeamUsageAllowed(
            permissions({ permissions: REGISTRY, granted: ["providers.manage"] }),
        ),
    ).toBe(false);
    // A server before the permission grants nobody a key it doesn't have.
    expect(
        await happyAgentCloudTeamUsageAllowed(
            permissions({ permissions: [REGISTRY[0]], granted: [] }),
        ),
    ).toBe(true);
});

function sourceCreate() {
    const subscribe = vi.fn<HappyAgentProviderUsageSource["subscribe"]>((listener) => {
        listener({ providers: [{ providerId: "claude" }], loading: false, loadedAt: 1 });
        return () => undefined;
    });
    const refresh = vi.fn();
    const source: HappyAgentProviderUsageSource = {
        subscribe,
        refresh,
        tokensFollow: () => () => undefined,
    };
    return { source, subscribe, refresh };
}

it("never reads usage the reader's role may not see, and says so", async () => {
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({
        source: fake.source,
        allowed: async () => false,
    });
    store.subscribe(() => undefined);
    await vi.waitFor(() => expect(store.get().forbidden).toBe(true));
    expect(store.get()).toEqual({ providers: [], loading: false, forbidden: true });
    store.usageRefresh();
    store.subscribe(() => undefined);
    expect(fake.subscribe).not.toHaveBeenCalled();
    expect(fake.refresh).not.toHaveBeenCalled();
    store[Symbol.dispose]();
});

it("reads usage once allowed, and when the permission read fails", async () => {
    for (const allowed of [async () => true, async () => Promise.reject(new Error("offline"))]) {
        const fake = sourceCreate();
        const store = happyAgentProviderUsageStoreCreate({ source: fake.source, allowed });
        expect(store.get().loading).toBe(true);
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().providers).toEqual([{ providerId: "claude" }]));
        expect(store.get().forbidden).toBeUndefined();
        expect(fake.subscribe).toHaveBeenCalledTimes(1);
        store[Symbol.dispose]();
    }
});
