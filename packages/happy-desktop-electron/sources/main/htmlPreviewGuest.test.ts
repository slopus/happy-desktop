import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { describe, expect, it } from "vitest";
import { happyLinkUrl } from "./happyLink";
import { htmlPreviewGuestAttach } from "./htmlPreviewGuest";

const PREVIEW = "http://docs-1a2b.localhost/index.html";

/** A fake attached preview guest that records its window-open handler. */
function attached() {
    let openHandler: ((details: { url: string }) => { action: "deny" | "allow" }) | undefined;
    const guest = Object.assign(new EventEmitter(), {
        id: 9,
        setWindowOpenHandler: (handler: typeof openHandler) => {
            openHandler = handler;
        },
    }) as unknown as WebContents & EventEmitter;
    const browser: string[] = [];
    const happy: string[] = [];
    htmlPreviewGuestAttach(
        guest,
        (url) => browser.push(url),
        (url) => happy.push(url),
    );
    const navigate = (name: "will-navigate" | "will-redirect", url: string) => {
        const event = { prevented: false, preventDefault: () => (event.prevented = true) };
        guest.emit(name, event, url);
        return event.prevented;
    };
    return {
        browser,
        happy,
        navigate,
        open: (url: string) => openHandler!({ url }),
        click: () => guest.emit("input-event", {}, { type: "mouseDown" }),
    };
}

describe("HTML preview guest", () => {
    it("stays on its document and hands a web link to the browser tab", () => {
        const { browser, happy, navigate, open } = attached();
        expect(navigate("will-navigate", "http://docs-1a2b.localhost/other.html")).toBe(false);
        expect(navigate("will-navigate", "https://example.com/")).toBe(true);
        expect(navigate("will-redirect", "https://example.com/")).toBe(true);
        expect(open("https://example.com/")).toEqual({ action: "deny" });
        expect(browser).toEqual(["https://example.com/"]);
        expect(happy).toEqual([]);
    });

    it("sends a clicked Happy link to the app once, and never to the browser", () => {
        const { browser, happy, navigate, open, click } = attached();
        expect(navigate("will-navigate", "happy://artifacts/a1")).toBe(true);
        expect(open("happy://agents/a1")).toEqual({ action: "deny" });
        expect(happy).toEqual([]);

        click();
        expect(navigate("will-navigate", "happy://agents/a1/files/src/F.ts#L3")).toBe(true);
        expect(navigate("will-navigate", "happy://agents/a2")).toBe(true);
        click();
        expect(open("happy-file://workspaces/w1/a.md")).toEqual({ action: "deny" });
        expect(happy).toEqual([
            "happy://agents/a1/files/src/F.ts#L3",
            "happy-file://workspaces/w1/a.md",
        ]);
        expect(browser).toEqual([]);
        expect(navigate("will-navigate", PREVIEW)).toBe(false);
    });
});

describe("Happy link addresses", () => {
    it("recognizes only the happy and happy-file schemes, at a bounded length", () => {
        for (const url of [
            "happy://artifacts/a1",
            "HAPPY://agents/a1",
            "happy-file://agents/a1/src/F.ts#L3",
            // The window, not the host, decides a malformed one opens nothing.
            "happy://session/s1",
        ])
            expect(happyLinkUrl(url), url).toBe(url);
        for (const url of [
            "happy:artifacts/a1",
            "happy-reference-x:artifact/a1",
            "https://happy.engineering/",
            "file:///etc/passwd",
            `happy://artifacts/${"a".repeat(4096)}`,
        ])
            expect(happyLinkUrl(url), url).toBeUndefined();
    });
});
