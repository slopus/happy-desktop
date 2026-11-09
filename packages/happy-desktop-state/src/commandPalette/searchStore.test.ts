import { expect, it, vi } from "vitest";
import type { HappyAgentClient, HealthResponse } from "@slopus/happy-agent-client";
import { happyAgentSearchStoreCreate } from "./searchStore.js";

it("gives a person found the photo the team already holds, and asks for nothing else", async () => {
    vi.useFakeTimers();
    try {
        const search = vi.fn<HappyAgentClient["search"]>(async () => ({
            results: [
                { type: "user", key: "user:usr_maya", rank: 1, userId: "usr_maya", name: "Maya" },
                { type: "user", key: "user:usr_theo", rank: 2, userId: "usr_theo", name: "Theo" },
            ],
            truncated: false,
            partial: false,
        }));
        const store = happyAgentSearchStoreCreate({
            client: { search },
            sync: {
                health: () => ({ capabilities: { search: true } }) as unknown as HealthResponse,
            },
            team: () => ({
                members: [
                    {
                        id: "usr_maya",
                        name: "Maya",
                        imageUrl: "https://cloud/v0/users/usr_maya/photo",
                    },
                    { id: "usr_theo", name: "Theo" },
                ],
            }),
        });
        const unsubscribe = store.subscribe(() => undefined);
        store.queryUpdate("ma");
        await vi.runAllTimersAsync();
        const snapshot = store.get();
        expect(snapshot.status).toBe("ready");
        expect(snapshot.status === "ready" ? snapshot.hits : []).toEqual([
            {
                type: "user",
                key: "user:usr_maya",
                rank: 1,
                userId: "usr_maya",
                name: "Maya",
                imageUrl: "https://cloud/v0/users/usr_maya/photo",
            },
            { type: "user", key: "user:usr_theo", rank: 2, userId: "usr_theo", name: "Theo" },
        ]);
        // One search; no per-person profile or photo request.
        expect(search).toHaveBeenCalledTimes(1);
        unsubscribe();
    } finally {
        vi.useRealTimers();
    }
});
