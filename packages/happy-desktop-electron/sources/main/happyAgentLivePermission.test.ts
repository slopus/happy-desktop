import { EventEmitter } from "node:events";
import type { Session, UtilityProcess, WebContents } from "electron";
import { describe, expect, it } from "vitest";
import { happyAgentRendererSessionCreate } from "./happyAgentRendererSession";
import { HAPPY_AGENT_LIVE_WINDOW_HEADER } from "./happyAgentLiveRoute";
import type { RendererUtilityInput } from "../shared/happyAgentRendererUtilityContract";

async function fixture() {
    let check!: NonNullable<Parameters<Session["setPermissionCheckHandler"]>[0]>;
    let permission!: NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>;
    let headers!: (
        details: Electron.OnBeforeSendHeadersListenerDetails,
        callback: (response: Electron.BeforeSendResponse) => void,
    ) => void;
    const browserSession = {
        setProxy: async () => undefined,
        closeAllConnections: async () => undefined,
        setPermissionCheckHandler: (handler: typeof check) => {
            check = handler;
        },
        setPermissionRequestHandler: (handler: typeof permission) => {
            permission = handler;
        },
        webRequest: {
            onBeforeRequest: () => undefined,
            onBeforeSendHeaders: (_filter: unknown, handler: typeof headers) => {
                headers = handler;
            },
        },
    } as unknown as Session;
    const sent: RendererUtilityInput[] = [];
    const child = Object.assign(new EventEmitter(), {
        postMessage: (input: RendererUtilityInput) => {
            sent.push(input);
        },
        kill: () => true,
    });
    const start = happyAgentRendererSessionCreate(
        browserSession,
        () => child as unknown as UtilityProcess,
    );
    child.emit("message", {
        type: "ready",
        port: 10101,
        username: "private",
        password: "credential",
    });
    const native = await start;
    const document = "https://app.example/?desktop=1&mode=local";
    const contents = Object.assign(new EventEmitter(), {
        id: 1,
        mainFrame: { url: document, detached: false },
        session: browserSession,
        isDestroyed: () => false,
    }) as unknown as WebContents;
    native.windowRegister(contents, document, true, false, "host-window");
    const details = { isMainFrame: true, requestingUrl: document };
    const microphoneCheck = (owner: WebContents | null = contents, extra = {}) =>
        check(owner, "media", "https://app.example", { ...details, mediaType: "audio", ...extra });
    const microphoneRequest = (owner: WebContents = contents, extra = {}) => {
        let granted = false;
        permission(
            owner,
            "media",
            (value) => {
                granted = value;
            },
            { ...details, mediaTypes: ["audio"], ...extra },
        );
        return granted;
    };
    return {
        native,
        contents,
        browserSession,
        microphoneCheck,
        microphoneRequest,
        check: () => check,
        permission: () => permission,
        headers: () => headers,
        sent,
        document,
    };
}

describe("native GPT-Live microphone and window boundary", () => {
    it("requires explicit enabled Start, permits only the app main document's audio, and revokes on End", async () => {
        const f = await fixture();
        try {
            expect(f.microphoneCheck()).toBe(false);
            expect(f.microphoneRequest()).toBe(false);
            expect(() =>
                f.native.liveMicrophoneStart(f.contents, f.contents.mainFrame, { enabled: false }),
            ).toThrow();
            expect(() =>
                f.native.liveMicrophoneStart(f.contents, f.contents.mainFrame, {
                    enabled: true,
                    arbitrary: true,
                }),
            ).toThrow();
            expect(() =>
                f.native.liveMicrophoneStart(f.contents, { ...f.contents.mainFrame } as never, {
                    enabled: true,
                }),
            ).toThrow();
            f.native.liveMicrophoneStart(f.contents, f.contents.mainFrame, { enabled: true });
            expect(f.microphoneCheck()).toBe(true);
            expect(f.microphoneRequest()).toBe(true);
            expect(f.microphoneCheck(null)).toBe(false);
            expect(f.microphoneCheck(f.contents, { isMainFrame: false })).toBe(false);
            expect(f.microphoneRequest(f.contents, { isMainFrame: false })).toBe(false);
            expect(
                f.microphoneCheck(f.contents, { requestingUrl: "https://app.example/preview" }),
            ).toBe(false);
            expect(f.microphoneCheck(f.contents, { mediaType: "video" })).toBe(false);
            expect(f.microphoneCheck(f.contents, { mediaType: "unknown" })).toBe(false);
            expect(f.microphoneRequest(f.contents, { mediaTypes: ["video"] })).toBe(false);
            expect(f.microphoneRequest(f.contents, { mediaTypes: ["audio", "video"] })).toBe(false);
            const guest = { ...f.contents, id: 2 } as WebContents;
            expect(f.microphoneCheck(guest)).toBe(false);
            expect(f.microphoneRequest(guest)).toBe(false);
            f.native.liveMicrophoneRevoke(f.contents, f.contents.mainFrame);
            expect(f.microphoneCheck()).toBe(false);
            expect(f.sent).toEqual([{ type: "live-window-start", windowId: "host-window" }]);
        } finally {
            f.native.close();
        }
    });

    it("keeps prior non-media permission defaults and denies media previews", async () => {
        const f = await fixture();
        try {
            for (const permission of [
                "clipboard-read",
                "clipboard-sanitized-write",
                "fullscreen",
                "geolocation",
                "hid",
                "idle-detection",
                "mediaKeySystem",
                "midi",
                "midiSysex",
                "notifications",
                "openExternal",
                "pointerLock",
                "serial",
                "storage-access",
                "top-level-storage-access",
                "usb",
                "deprecated-sync-clipboard-read",
                "fileSystem",
            ] as const)
                expect(
                    f.check()(f.contents, permission, "https://app.example", { isMainFrame: true }),
                ).toBe(true);
            for (const permission of [
                "clipboard-read",
                "clipboard-sanitized-write",
                "display-capture",
                "fullscreen",
                "geolocation",
                "idle-detection",
                "mediaKeySystem",
                "midi",
                "midiSysex",
                "notifications",
                "pointerLock",
                "keyboardLock",
                "openExternal",
                "speaker-selection",
                "storage-access",
                "top-level-storage-access",
                "window-management",
                "unknown",
                "fileSystem",
            ] as const) {
                let granted = false;
                f.permission()(
                    f.contents,
                    permission,
                    (value) => {
                        granted = value;
                    },
                    { isMainFrame: true, requestingUrl: f.document },
                );
                expect(granted).toBe(true);
            }
            const preview = Object.assign(new EventEmitter(), {
                id: 3,
                session: f.browserSession,
                mainFrame: { url: f.document, detached: false },
                isDestroyed: () => false,
            }) as unknown as WebContents;
            f.native.windowRegister(preview, f.document, true, true, "preview-window");
            expect(() =>
                f.native.liveMicrophoneStart(preview, preview.mainFrame, { enabled: true }),
            ).toThrow();
            expect(f.microphoneCheck(preview)).toBe(false);
        } finally {
            f.native.close();
        }
    });

    it("strips all spoofed window-header cases, injects only the host ID, and closes only voice on reload/crash", async () => {
        const f = await fixture();
        try {
            f.native.liveMicrophoneStart(f.contents, f.contents.mainFrame, { enabled: true });
            let result: Record<string, string | string[]> | undefined;
            f.headers()(
                {
                    webContentsId: 1,
                    frame: f.contents.mainFrame,
                    url: "http://happy-agent/v0/live/sessions",
                    requestHeaders: {
                        "X-Happy-Live-Window-Id": "spoof-one",
                        "x-HAPPY-live-WINDOW-id": "spoof-two",
                        "Proxy-Authorization": "spoof-auth",
                    },
                } as never,
                (answer) => {
                    result = answer.requestHeaders;
                },
            );
            expect(result?.[HAPPY_AGENT_LIVE_WINDOW_HEADER]).toBe("host-window");
            expect(
                Object.keys(result ?? {}).filter(
                    (name) => name.toLowerCase() === HAPPY_AGENT_LIVE_WINDOW_HEADER,
                ),
            ).toEqual([HAPPY_AGENT_LIVE_WINDOW_HEADER]);
            expect(result?.["Proxy-Authorization"]).toBe(
                `Basic ${Buffer.from("private:credential").toString("base64")}`,
            );
            (f.contents as unknown as EventEmitter).emit("did-start-navigation", {
                isMainFrame: true,
                isSameDocument: true,
            });
            expect(f.microphoneCheck()).toBe(true);
            (f.contents as unknown as EventEmitter).emit("did-start-navigation", {
                isMainFrame: true,
                isSameDocument: false,
            });
            expect(f.microphoneCheck()).toBe(false);
            expect(f.sent.at(-1)).toEqual({ type: "live-window-close", windowId: "host-window" });
            f.native.liveMicrophoneStart(f.contents, f.contents.mainFrame, { enabled: true });
            (f.contents as unknown as EventEmitter).emit("render-process-gone");
            expect(f.microphoneCheck()).toBe(false);
            (f.contents as unknown as EventEmitter).emit("destroyed");
            expect(() =>
                f.native.liveMicrophoneStart(f.contents, f.contents.mainFrame, { enabled: true }),
            ).toThrow();
            expect(
                f.sent.every(
                    (message) =>
                        message.type === "live-window-start" ||
                        message.type === "live-window-close",
                ),
            ).toBe(true);
        } finally {
            f.native.close();
        }
    });
});
