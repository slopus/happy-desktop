import { expect, it, vi } from "vitest";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserProfileStoreCreate } from "./happyAgentUserProfileStore.js";

const counts = (input: number, output: number) => ({
    input,
    output,
    // Already inside input and output; counting them again would double them.
    cacheRead: 1_000_000,
    cacheWrite: 1_000_000,
    reasoning: 1_000_000,
});

it("counts each window's tokens as input plus output, over every provider and model", async () => {
    const request = vi.fn<HappyCloudRequest>(async (_method, path) =>
        path === "v0/roles"
            ? { roles: [] }
            : {
                  user: {
                      id: "usr_maya",
                      name: "Maya",
                      photo: null,
                      role: null,
                      teamRole: "member",
                  },
                  stats: {
                      tasks: { total: 3, active: 1 },
                      lastActivityAt: null,
                      activeDays: 2,
                      usage: {
                          hour: {},
                          day: { anthropic: { opus: counts(100, 20) } },
                          week: {
                              anthropic: { opus: counts(1_000, 200), sonnet: counts(50, 5) },
                              openai: { gpt: counts(300, 30) },
                          },
                          month: { anthropic: { opus: counts(2_000, 400) } },
                      },
                  },
                  recentTasks: [],
              },
    );
    const store = happyAgentUserProfileStoreCreate({
        userId: "usr_maya",
        request,
        endpoint: "https://cloud.example/",
    });
    const unsubscribe = store.subscribe(() => undefined);
    await vi.waitFor(() => expect(store.get().loading).toBe(false));
    expect(store.get().profile?.tokens).toEqual({
        hour: 0,
        day: 120,
        week: 1_585,
        month: 2_400,
    });
    unsubscribe();
    store[Symbol.dispose]();
});

it("has no tokens when the reader's role may not see another member's usage", async () => {
    const request = vi.fn<HappyCloudRequest>(async (_method, path) =>
        path === "v0/roles"
            ? { roles: [] }
            : {
                  user: {
                      id: "usr_maya",
                      name: "Maya",
                      photo: null,
                      role: null,
                      teamRole: "member",
                  },
                  stats: {
                      tasks: { total: 1, active: 1 },
                      lastActivityAt: 1_000,
                      activeDays: 1,
                      usage: null,
                  },
                  recentTasks: [],
              },
    );
    const store = happyAgentUserProfileStoreCreate({
        userId: "usr_maya",
        request,
        endpoint: "https://cloud.example/",
    });
    const unsubscribe = store.subscribe(() => undefined);
    await vi.waitFor(() => expect(store.get().loading).toBe(false));
    expect(store.get().profile?.tokens).toBeNull();
    expect(store.get().profile?.tasks).toEqual({ total: 1, active: 1 });
    expect(store.get().profile?.activeDays).toBe(1);
    unsubscribe();
    store[Symbol.dispose]();
});
