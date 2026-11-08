import { EventEmitter } from "node:events";
import type { Session, WebContents } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBrowserNetwork } from "../shared/desktopContract";
import type { DesktopRuntime } from "./desktopRuntime";
import { HappyAgentBrowser } from "./happyAgentBrowser";
import { desktopBrowserCommandValidate } from "./happyAgentIpcValidation";

const NETWORK = "net_0123456789abcdefghijklmn";

/** A profile session that routes every address through the proxy it was given. */
function profileSession(): Session {
    let rules = "";
    return {
        webRequest: { onBeforeRequest: () => undefined },
        setProxy: async (config: { proxyRules: string }) => {
            rules = config.proxyRules;
        },
        closeAllConnections: async () => undefined,
        resolveProxy: async () => `PROXY ${rules.replace("http://", "")}`,
    } as unknown as Session;
}

/** A page's or window's contents, recording whether its developer tools were opened. */
function contents(id: number, session: Session) {
    const opened: unknown[] = [];
    const page = Object.assign(new EventEmitter(), {
        id,
        session,
        isDestroyed: () => false,
        openDevTools: (options: unknown) => opened.push(options),
    }) as unknown as WebContents;
    return { page, opened };
}

const runtime = {
    openHttpProxy: () => Promise.reject(new Error("No tunnel in this test.")),
} as unknown as DesktopRuntime;

describe("developer tools for a browser page", () => {
    const browsers: HappyAgentBrowser[] = [];
    afterEach(() => {
        for (const browser of browsers.splice(0)) browser.close();
    });

    async function profile(network: DesktopBrowserNetwork) {
        const session = profileSession();
        const browser = await HappyAgentBrowser.create(session, network, runtime, vi.fn());
        browsers.push(browser);
        return { browser, session };
    }

    it("is a command of its own, with nothing else in it", () => {
        expect(desktopBrowserCommandValidate({ action: "devtools" })).toEqual({
            action: "devtools",
        });
        expect(() => desktopBrowserCommandValidate({ action: "devtools", mode: "docked" })).toThrow(
            "Invalid browser command.",
        );
        expect(() => desktopBrowserCommandValidate({ action: "devtools", url: "x" })).toThrow(
            "Invalid browser command.",
        );
        expect(() => desktopBrowserCommandValidate({ action: "inspect" })).toThrow(
            "Invalid browser command.",
        );
    });

    it("opens, detached, for a live artifact page this profile owns", async () => {
        const { browser, session } = await profile({
            connectionId: null,
            networkId: NETWORK,
            artifactId: "art_one",
        });
        const guest = contents(41, session);
        browser.register(guest.page);
        await browser.command(guest.page, { action: "devtools" });
        expect(guest.opened).toEqual([{ mode: "detach" }]);
    });

    it("never opens for Happy's own window or another profile's page", async () => {
        const { browser, session } = await profile({
            connectionId: null,
            networkId: NETWORK,
            artifactId: "art_one",
        });
        // The app's renderer is never registered as a guest of any profile.
        const window = contents(1, profileSession());
        await expect(browser.command(window.page, { action: "devtools" })).rejects.toThrow(
            "The browser tab is unavailable.",
        );
        expect(() => browser.register(window.page)).toThrow("Invalid workspace browser profile.");
        // Nor a page that only shares its id with one this profile owns.
        browser.register(contents(42, session).page);
        const impostor = contents(42, session);
        await expect(browser.command(impostor.page, { action: "devtools" })).rejects.toThrow(
            "The browser tab is unavailable.",
        );
        expect(window.opened).toEqual([]);
        expect(impostor.opened).toEqual([]);
    });

    it("is refused for a workspace tab, whose page is not a live artifact", async () => {
        const { browser, session } = await profile({ connectionId: null, networkId: NETWORK });
        const guest = contents(43, session);
        browser.register(guest.page);
        await expect(browser.command(guest.page, { action: "devtools" })).rejects.toThrow(
            "Only a live artifact's page can be inspected.",
        );
        expect(guest.opened).toEqual([]);
    });

    it("is refused once the profile has closed", async () => {
        const { browser, session } = await profile({
            connectionId: null,
            networkId: NETWORK,
            artifactId: "art_one",
        });
        const guest = contents(44, session);
        browser.register(guest.page);
        browser.close();
        await expect(browser.command(guest.page, { action: "devtools" })).rejects.toThrow(
            "The browser tab is unavailable.",
        );
        expect(guest.opened).toEqual([]);
    });
});
