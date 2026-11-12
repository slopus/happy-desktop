import { expect, it, vi } from "vitest";
import { happyCloudRequestCreate } from "./happyAgentProviderCredentials.js";
import { happyAgentPreviewsStoreCreate } from "./happyAgentPreviewsStore.js";

it("mints every open through the actual v0 HTTP routes and keeps launch credentials out of snapshots", async () => {
    const tokens = ["a".repeat(43), "b".repeat(43)];
    let launches = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (init?.method === "GET" && url.pathname === "/v0/previews/preview-one/status")
            return Response.json({ previewId: "preview-one", status: "ready" });
        if (init?.method === "POST" && url.pathname === "/v0/previews/preview-one/launch")
            return Response.json({
                id: "preview-one",
                url: "https://signed.happy.glass/",
                launchToken: tokens[launches++],
            });
        return Response.json({ code: "not_found", error: "No such route." }, { status: 404 });
    });
    const store = happyAgentPreviewsStoreCreate({
        request: happyCloudRequestCreate({ endpoint: "https://cloud.test", token: "test", fetch }),
    });
    const snapshots: string[] = [];
    const unsubscribe = store.subscribe(() => snapshots.push(JSON.stringify([...store.get()])));
    try {
        const first = await store.previewLaunch("preview-one");
        const second = await store.previewLaunch("preview-one");
        expect(first).toBe(`https://signed.happy.glass/_happy/launch#${tokens[0]}`);
        expect(second).toBe(`https://signed.happy.glass/_happy/launch#${tokens[1]}`);
        expect(second).not.toBe(first);
        expect(launches).toBe(2);
        expect(fetch.mock.calls.map(([url, init]) => [init?.method, url])).toEqual([
            ["GET", "https://cloud.test/v0/previews/preview-one/status"],
            ["POST", "https://cloud.test/v0/previews/preview-one/launch"],
            ["GET", "https://cloud.test/v0/previews/preview-one/status"],
            ["POST", "https://cloud.test/v0/previews/preview-one/launch"],
        ]);
        expect(snapshots.length).toBeGreaterThan(0);
        for (const snapshot of [...snapshots, JSON.stringify([...store.get()])]) {
            expect(snapshot).not.toContain("launchToken");
            expect(snapshot).not.toContain("happy.glass");
            for (const token of tokens) expect(snapshot).not.toContain(token);
        }
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
    }
});
