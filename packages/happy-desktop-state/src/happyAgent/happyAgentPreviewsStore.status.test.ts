import { expect, it, vi } from "vitest";
import { happyCloudRequestCreate } from "./happyAgentProviderCredentials.js";
import { happyAgentPreviewsStoreCreate } from "./happyAgentPreviewsStore.js";

it.each(["ready", "node_offline", "node_upgrade_required", "no_compute"] as const)(
    "maps server status %s and only launches a ready preview",
    async (status) => {
        const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) =>
            Response.json(
                init?.method === "GET"
                    ? { previewId: "preview", status }
                    : {
                          id: "preview",
                          url: "https://signed.happy.glass/",
                          launchToken: "a".repeat(43),
                      },
            ),
        );
        const store = happyAgentPreviewsStoreCreate({
            request: happyCloudRequestCreate({
                endpoint: "https://cloud.test",
                token: "test",
                fetch,
            }),
        });
        try {
            const target = { open: vi.fn<(url: string) => void>() };
            if (status === "ready")
                await expect(store.previewLaunch("preview", target)).resolves.toBeUndefined();
            else
                await expect(store.previewLaunch("preview", target)).rejects.toMatchObject({
                    code: status,
                });
            expect(target.open).toHaveBeenCalledTimes(status === "ready" ? 1 : 0);
            expect(store.get().get("preview")).toEqual({ type: "available", status });
            expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(
                status === "ready" ? 1 : 0,
            );
        } finally {
            store[Symbol.dispose]();
        }
    },
);

it("maps an authenticated 404 to gone without claiming whether it was deleted or access was removed", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ code: "not_found", error: "No such preview or agent." }, { status: 404 }),
    );
    const store = happyAgentPreviewsStoreCreate({
        request: happyCloudRequestCreate({ endpoint: "https://cloud.test", token: "test", fetch }),
    });
    try {
        const target = { open: vi.fn<(url: string) => void>() };
        await expect(store.previewLaunch("gone", target)).rejects.toMatchObject({
            code: "not_found",
        });
        expect(target.open).not.toHaveBeenCalled();
        expect(store.get().get("gone")).toEqual({ type: "missing" });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0]?.[1]?.method).toBe("GET");
    } finally {
        store[Symbol.dispose]();
    }
});
