import { EventEmitter } from "node:events";
import type { Session, WebContents, WebPreferences } from "electron";
import { describe, expect, it } from "vitest";
import {
    ArtifactActivation,
    ArtifactGuests,
    artifactExternalUrl,
    artifactFrameNavigationAllowed,
    artifactGuestAttach,
    artifactPageNavigationAllowed,
    artifactSessionConfigure,
    artifactWebPreferencesEnforce,
    artifactWebviewAdmitted,
} from "./artifactBrowser";
import type { ArtifactSiteHandle } from "./artifactSite";

const SITE = "k3v8w2m9q4x7z1c5b6n0p2r8-v2";
const ENTRY = `happy-artifact://${SITE}/index.html`;
const OTHER = "happy-artifact://k3v8w2m9q4x7z1c5b6n0p2r8-v1/index.html";

/** Sites that own exactly the entry and one other file of `SITE`, and the entry of version 1. */
const sites: ArtifactSiteHandle = {
    register: () => ({ open: async () => ENTRY, component: () => ENTRY }),
    owns: (url) => url === ENTRY || url === `happy-artifact://${SITE}/page.html` || url === OTHER,
    handle: async () => new Response("served"),
    close: () => undefined,
};

describe("artifact webview admission", () => {
    it("admits only the artifact partition at an address a site was opened for", () => {
        expect(artifactWebviewAdmitted({ partition: "happy-artifact", src: ENTRY }, sites)).toBe(
            true,
        );
        expect(
            artifactWebviewAdmitted(
                { partition: "happy-artifact", src: `happy-artifact://${SITE}/missing.html` },
                sites,
            ),
        ).toBe(false);
        expect(
            artifactWebviewAdmitted(
                { partition: "happy-artifact", src: "https://example.com/" },
                sites,
            ),
        ).toBe(false);
        expect(
            artifactWebviewAdmitted({ partition: "persist:happy-artifact", src: ENTRY }, sites),
        ).toBe(false);
        expect(
            artifactWebviewAdmitted({ partition: "happy-html-preview", src: ENTRY }, sites),
        ).toBe(false);
        expect(artifactWebviewAdmitted({ src: ENTRY }, sites)).toBe(false);
        expect(artifactWebviewAdmitted({ partition: "happy-artifact" }, sites)).toBe(false);
    });

    it("runs every guest isolated and sandboxed, whatever the element asked for", () => {
        const asked: WebPreferences = {
            preload: "/tmp/evil.js",
            enableBlinkFeatures: "Everything",
            contextIsolation: false,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            nodeIntegrationInWorker: true,
            sandbox: false,
            webSecurity: false,
            allowRunningInsecureContent: true,
            webviewTag: true,
            plugins: true,
            experimentalFeatures: true,
            navigateOnDragDrop: true,
            safeDialogs: false,
        };
        artifactWebPreferencesEnforce(asked);
        expect(asked).toEqual({
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            nodeIntegrationInWorker: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
            plugins: false,
            experimentalFeatures: false,
            navigateOnDragDrop: false,
            safeDialogs: true,
        });
    });
});

describe("artifact navigation policy", () => {
    it("keeps a guest's page on its one site", () => {
        expect(artifactPageNavigationAllowed(`happy-artifact://${SITE}/page.html`, SITE)).toBe(
            true,
        );
        expect(artifactPageNavigationAllowed(OTHER, SITE)).toBe(false);
        expect(artifactPageNavigationAllowed("https://example.com/", SITE)).toBe(false);
        expect(artifactPageNavigationAllowed("file:///etc/passwd", SITE)).toBe(false);
        expect(artifactPageNavigationAllowed("javascript:alert(1)", SITE)).toBe(false);
        expect(artifactPageNavigationAllowed(ENTRY, undefined)).toBe(false);
    });

    it("lets a frame show its own site, an inert document, or the web, and nothing else", () => {
        for (const url of [
            `happy-artifact://${SITE}/frame.html`,
            "about:blank",
            "about:srcdoc",
            "https://www.youtube.com/embed/x",
            "data:text/html,<p>x</p>",
        ])
            expect(artifactFrameNavigationAllowed(url, SITE), url).toBe(true);
        for (const url of [
            OTHER,
            "http://localhost:3000/",
            "http://192.168.1.1/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "chrome://settings",
        ])
            expect(artifactFrameNavigationAllowed(url, SITE), url).toBe(false);
    });

    it("hands only the web to the default browser, without credentials or private addresses", () => {
        expect(artifactExternalUrl("https://example.com/a?b#c")).toBe("https://example.com/a?b#c");
        expect(artifactExternalUrl("http://example.com")).toBe("http://example.com/");
        for (const url of [
            "https://user:secret@example.com/",
            "http://localhost:3000/",
            "http://192.168.1.1/admin",
            "http://[::1]/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "mailto:a@example.com",
            ENTRY,
            `https://example.com/${"a".repeat(8192)}`,
        ])
            expect(artifactExternalUrl(url), url.slice(0, 40)).toBeUndefined();
    });

    it("lets one input from the reader open one link, for a few seconds", () => {
        const activation = new ArtifactActivation();
        expect(activation.consume(1_000)).toBe(false);
        activation.record("mouseMove", 1_000);
        expect(activation.consume(1_000)).toBe(false);
        activation.record("mouseUp", 1_000);
        expect(activation.consume(2_000)).toBe(true);
        expect(activation.consume(2_000)).toBe(false);
        activation.record("keyDown", 10_000);
        expect(activation.consume(16_000)).toBe(false);
    });
});

/** A fake partition session that records what was installed on it. */
function sessionFake() {
    const installed: {
        proxy?: Electron.ProxyConfig;
        scheme?: string;
        handler?: (request: Request) => Response | Promise<Response>;
        permission?: Parameters<Session["setPermissionRequestHandler"]>[0];
        check?: Parameters<Session["setPermissionCheckHandler"]>[0];
        device?: Parameters<Session["setDevicePermissionHandler"]>[0];
        beforeRequest?: (
            details: Partial<Electron.OnBeforeRequestListenerDetails>,
            callback: (response: Electron.CallbackResponse) => void,
        ) => void;
        beforeSendHeaders?: (
            details: Partial<Electron.OnBeforeSendHeadersListenerDetails>,
            callback: (response: Electron.BeforeSendResponse) => void,
        ) => void;
        headersReceived?: (
            details: Partial<Electron.OnHeadersReceivedListenerDetails>,
            callback: (response: Electron.HeadersReceivedResponse) => void,
        ) => void;
    } = {};
    const events = new EventEmitter();
    const session = Object.assign(events, {
        setProxy: async (config: Electron.ProxyConfig) => {
            installed.proxy = config;
        },
        closeAllConnections: async () => undefined,
        protocol: {
            handle: (scheme: string, handler: (request: Request) => Promise<Response>) => {
                installed.scheme = scheme;
                installed.handler = handler;
            },
        },
        setPermissionRequestHandler: (handler: typeof installed.permission) => {
            installed.permission = handler;
        },
        setPermissionCheckHandler: (handler: typeof installed.check) => {
            installed.check = handler;
        },
        setDevicePermissionHandler: (handler: typeof installed.device) => {
            installed.device = handler;
        },
        webRequest: {
            onBeforeRequest: (handler: typeof installed.beforeRequest) => {
                installed.beforeRequest = handler;
            },
            onBeforeSendHeaders: (handler: typeof installed.beforeSendHeaders) => {
                installed.beforeSendHeaders = handler;
            },
            onHeadersReceived: (handler: typeof installed.headersReceived) => {
                installed.headersReceived = handler;
            },
        },
    }) as unknown as Session;
    return { session, events, installed };
}

describe("artifact partition", () => {
    it("routes only through its network proxy and answers its scheme itself", async () => {
        const { session, installed } = sessionFake();
        await artifactSessionConfigure(session, sites, new ArtifactGuests(sites), 40404);
        expect(installed.proxy).toEqual({
            mode: "fixed_servers",
            proxyBypassRules: "<-loopback>",
            proxyRules: "http://127.0.0.1:40404",
        });
        expect(installed.scheme).toBe("happy-artifact");
        expect(await (await installed.handler!(new Request(ENTRY))).text()).toBe("served");
    });

    it("has no route out at all when its proxy is unavailable", async () => {
        const { session, installed } = sessionFake();
        await artifactSessionConfigure(session, sites, new ArtifactGuests(sites), undefined);
        expect(installed.proxy?.proxyRules).toBe("http://127.0.0.1:9");
    });

    it("refuses every permission and every download", async () => {
        const { session, events, installed } = sessionFake();
        await artifactSessionConfigure(session, sites, new ArtifactGuests(sites), 40404);
        for (const permission of [
            "media",
            "geolocation",
            "notifications",
            "clipboard-read",
            "clipboard-sanitized-write",
            "display-capture",
            "midi",
            "pointerLock",
            "fullscreen",
            "openExternal",
            "fileSystem",
            "hid",
            "serial",
            "usb",
        ]) {
            let granted: boolean | undefined;
            installed.permission!(
                {} as WebContents,
                permission as never,
                (value) => (granted = value),
                {
                    requestingUrl: ENTRY,
                    isMainFrame: true,
                } as never,
            );
            expect(granted, permission).toBe(false);
            expect(
                installed.check!(
                    null,
                    permission as never,
                    `happy-artifact://${SITE}`,
                    {} as never,
                ),
                permission,
            ).toBe(false);
        }
        expect(installed.device!({} as never)).toBe(false);
        let prevented = false;
        events.emit("will-download", { preventDefault: () => (prevented = true) });
        expect(prevented).toBe(true);
    });

    it("learns each guest's site from its first page and holds every later request to it", async () => {
        const { session, installed } = sessionFake();
        const guests = new ArtifactGuests(sites);
        await artifactSessionConfigure(session, sites, guests, 40404);
        // `null` is a request no guest made.
        const cancelled = (url: string, resourceType: string, guest: number | null = 7) => {
            let answer: Electron.CallbackResponse | undefined;
            const webContentsId = guest ?? undefined;
            installed.beforeRequest!({ url, resourceType, webContentsId } as never, (response) => {
                answer = response;
            });
            return answer?.cancel;
        };
        // Before its first page, a guest may load nothing but an owned site.
        expect(cancelled(`happy-artifact://${SITE}/app.js`, "script")).toBe(true);
        expect(cancelled("https://example.com/", "mainFrame")).toBe(true);
        expect(cancelled(`happy-artifact://${SITE}/missing.html`, "mainFrame")).toBe(true);
        expect(guests.siteOf(7)).toBeUndefined();
        expect(cancelled(ENTRY, "mainFrame")).toBe(false);
        expect(guests.siteOf(7)).toBe(SITE);
        expect(cancelled(`happy-artifact://${SITE}/app.js`, "script")).toBe(false);
        expect(cancelled(OTHER, "mainFrame")).toBe(true);
        expect(cancelled(OTHER, "subFrame")).toBe(true);
        expect(cancelled(OTHER, "image")).toBe(true);
        expect(guests.siteOf(7)).toBe(SITE);
        expect(cancelled("https://cdn.example/lib.js", "script")).toBe(false);
        expect(cancelled("http://127.0.0.1:52344/x/v0/health", "xhr")).toBe(true);
        expect(cancelled("wss://example.com/socket", "webSocket")).toBe(true);
        // Another guest learns its own site, and is held to it.
        expect(cancelled(OTHER, "mainFrame", 8)).toBe(false);
        expect(cancelled(ENTRY, "image", 8)).toBe(true);
        // A request no guest made reaches no artifact.
        expect(cancelled(ENTRY, "image", null)).toBe(true);
    });

    it("strips credentials and cookies in both directions", async () => {
        const { session, installed } = sessionFake();
        await artifactSessionConfigure(session, sites, new ArtifactGuests(sites), 40404);
        let sent: Electron.BeforeSendResponse | undefined;
        installed.beforeSendHeaders!(
            { requestHeaders: { Cookie: "a=b", Authorization: "Bearer x", Accept: "*/*" } },
            (response) => (sent = response),
        );
        expect(sent).toEqual({ requestHeaders: { Accept: "*/*" } });
        let received: Electron.HeadersReceivedResponse | undefined;
        installed.headersReceived!(
            { responseHeaders: { "Set-Cookie": ["a=b"], "Content-Type": ["text/html"] } },
            (response) => (received = response),
        );
        expect(received).toEqual({ responseHeaders: { "Content-Type": ["text/html"] } });
    });
});

/** A fake attached guest that records its window-open handler. */
function guestFake(id = 7) {
    let openHandler: ((details: { url: string }) => { action: "deny" | "allow" }) | undefined;
    const guest = Object.assign(new EventEmitter(), {
        id,
        setWindowOpenHandler: (handler: typeof openHandler) => {
            openHandler = handler;
        },
    }) as unknown as WebContents & EventEmitter;
    return { guest, open: (url: string) => openHandler!({ url }) };
}

function navigation(url: string, isMainFrame = true) {
    const details = {
        url,
        isMainFrame,
        prevented: false,
        preventDefault: () => (details.prevented = true),
    };
    return details;
}

describe("artifact guest", () => {
    const attached = () => {
        const guests = new ArtifactGuests(sites);
        const { guest, open } = guestFake();
        const opened: string[] = [];
        artifactGuestAttach(guest, guests, (url) => opened.push(url));
        guest.emit("did-start-navigation", { url: ENTRY, isMainFrame: true });
        const click = () => guest.emit("input-event", {}, { type: "mouseUp" });
        return { guests, guest, open, opened, click };
    };

    it("never opens a window, and sends a clicked web link to the default browser once", () => {
        const { open, opened, click } = attached();
        expect(open("https://example.com/")).toEqual({ action: "deny" });
        expect(opened).toEqual([]);
        click();
        expect(open("https://example.com/")).toEqual({ action: "deny" });
        expect(open("https://example.com/again")).toEqual({ action: "deny" });
        expect(opened).toEqual(["https://example.com/"]);
        click();
        expect(open("http://localhost:3000/")).toEqual({ action: "deny" });
        expect(open(OTHER)).toEqual({ action: "deny" });
        expect(open("file:///etc/passwd")).toEqual({ action: "deny" });
        expect(opened).toEqual(["https://example.com/"]);
    });

    it("keeps its page on its site and sends a followed web link outside", () => {
        const { guest, opened, click } = attached();
        const inside = navigation(`happy-artifact://${SITE}/page.html`);
        guest.emit("will-frame-navigate", inside);
        expect(inside.prevented).toBe(false);

        const away = navigation(OTHER);
        guest.emit("will-frame-navigate", away);
        expect(away.prevented).toBe(true);

        const scripted = navigation("https://example.com/");
        guest.emit("will-frame-navigate", scripted);
        expect(scripted.prevented).toBe(true);
        expect(opened).toEqual([]);

        click();
        const followed = navigation("https://example.com/docs");
        guest.emit("will-frame-navigate", followed);
        expect(followed.prevented).toBe(true);
        expect(opened).toEqual(["https://example.com/docs"]);

        for (const url of ["file:///etc/passwd", "javascript:alert(1)", "chrome://settings"]) {
            click();
            const refused = navigation(url);
            guest.emit("will-frame-navigate", refused);
            expect(refused.prevented, url).toBe(true);
        }
        expect(opened).toEqual(["https://example.com/docs"]);
    });

    it("lets its frames show the web or its own site, and nothing else", () => {
        const { guest } = attached();
        for (const [url, prevented] of [
            ["https://www.youtube.com/embed/x", false],
            [`happy-artifact://${SITE}/frame.html`, false],
            ["about:blank", false],
            [OTHER, true],
            ["http://192.168.1.1/", true],
            ["file:///etc/passwd", true],
        ] as const) {
            const frame = navigation(url, false);
            guest.emit("will-frame-navigate", frame);
            expect(frame.prevented, url).toBe(prevented);
        }
        const redirect = navigation(OTHER, true);
        guest.emit("will-redirect", redirect);
        expect(redirect.prevented).toBe(true);
    });

    it("forgets its site when it is gone", () => {
        const { guests, guest } = attached();
        expect(guests.siteOf(7)).toBe(SITE);
        guest.emit("destroyed");
        expect(guests.siteOf(7)).toBeUndefined();
    });
});
