import { describe, expect, it } from "vitest";
import { happyAgentPreviewResultRead } from "./happyAgentPreviewsStore.js";

const result = {
    type: "preview",
    previewId: "preview-one",
    agentId: "agent-one",
    port: 3000,
    url: "https://signed.happy.glass/",
    launchUrl: "https://signed.happy.glass/_happy/launch#historical-secret",
};

describe("the named open_preview result boundary", () => {
    it("recognizes a valid result only for open_preview", () => {
        expect(happyAgentPreviewResultRead("open_preview", result)).toEqual({
            previewId: "preview-one",
            agentId: "agent-one",
            port: 3000,
            url: "https://signed.happy.glass/",
        });
        expect(happyAgentPreviewResultRead("another_tool", result)).toBeUndefined();
    });

    it.each([
        null,
        [],
        { ...result, type: "page" },
        { ...result, previewId: "" },
        { ...result, agentId: 12 },
        { ...result, port: 0 },
        { ...result, port: 65536 },
        { ...result, port: 3000.5 },
        { ...result, port: "3000" },
        { ...result, url: "http://signed.happy.glass/" },
        { ...result, url: "https://signed.happy.glass.attacker.test/" },
        { ...result, url: "https://user:password@signed.happy.glass/" },
        { ...result, url: "https://signed.happy.glass/_happy/launch#secret" },
        { ...result, launchUrl: null },
    ])("rejects a malformed or unsafe result %#", (malformed) => {
        expect(happyAgentPreviewResultRead("open_preview", malformed)).toBeUndefined();
    });

    it("discards historical launch URLs, including ones that are already expired", () => {
        const first = happyAgentPreviewResultRead("open_preview", result);
        const second = happyAgentPreviewResultRead("open_preview", {
            ...result,
            launchUrl: "https://unrelated.invalid/expired-secret",
        });
        expect(first).toEqual(second);
        expect(first).not.toHaveProperty("launchUrl");
        expect(JSON.stringify(first)).not.toContain("secret");
    });
});
