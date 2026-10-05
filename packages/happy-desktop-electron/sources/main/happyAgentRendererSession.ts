import type {
    OnBeforeRequestListenerDetails,
    Session,
    UtilityProcess,
    WebContents,
    WebFrameMain,
} from "electron";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { happyAgentRendererOrigin, type HappyAgentRendererProxy } from "./happyAgentRendererProxy";
import { happyAgentRendererUtilityProxyCreate } from "./happyAgentRendererUtilityProxy";
import { rendererNavigationAllowed } from "./navigation";
import { mediaPreviewAddressAllowed } from "./mediaPreviewWindow";
import { HAPPY_AGENT_LIVE_WINDOW_HEADER, happyAgentLiveRoute } from "./happyAgentLiveRoute";

export interface HappyAgentRendererSession {
    readonly proxy: HappyAgentRendererProxy;
    windowRegister(
        contents: WebContents,
        document: string,
        development: boolean,
        mediaOnly?: boolean,
        liveWindowId?: string,
    ): void;
    liveMicrophoneStart(contents: WebContents, frame: WebFrameMain | null, input: unknown): void;
    liveMicrophoneRevoke(contents: WebContents, frame: WebFrameMain | null): void;
    close(): void;
}

/** The stable origin belongs only to registered app documents, never to guests or subframes. */
export async function happyAgentRendererSessionCreate(
    session: Session,
    fork: () => UtilityProcess,
    debug?: (message: string) => void,
): Promise<HappyAgentRendererSession> {
    let active = false;
    let closed = false;
    let proxyOperation = Promise.resolve();
    const configure = (port: number) => {
        // Never allow a direct connection to the virtual origin, even if the
        // utility is restarting or the proxy configuration fails to install.
        const pac = `function FindProxyForURL(url, host) { return host === "happy-agent" ? "PROXY 127.0.0.1:${String(port)}" : "DIRECT"; }`;
        proxyOperation = proxyOperation
            .catch(() => undefined)
            .then(async () => {
                await session.setProxy({
                    mode: "pac_script",
                    pacScript: `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(pac).toString("base64")}`,
                });
                // Chromium may reuse sockets opened under the previous PAC route.
                // Cut them before the new utility is made available to the frame gate.
                await session.closeAllConnections();
            });
        return proxyOperation;
    };
    const proxy = await happyAgentRendererUtilityProxyCreate({
        fork,
        ready: async ({ port }) => {
            await configure(port);
            if (!closed) active = true;
        },
        offline: () => {
            active = false;
            if (!closed) void configure(9).catch(() => undefined);
        },
        ...(debug ? { debug } : {}),
    });
    const windows = new Map<
        number,
        {
            readonly contents: WebContents;
            readonly document: string;
            readonly development: boolean;
            readonly mediaOnly: boolean;
            readonly liveWindowId?: string;
            microphoneFrame?: WebFrameMain;
        }
    >();
    const liveWindowRequire = (contents: WebContents, frame: WebFrameMain | null) => {
        const window = windows.get(contents.id);
        if (
            !window ||
            window.mediaOnly ||
            !window.liveWindowId ||
            contents.isDestroyed() ||
            frame === null ||
            frame.detached ||
            frame !== contents.mainFrame ||
            !liveDocumentAllowed(frame.url, window.document)
        )
            throw new Error("This document cannot start GPT-Live audio.");
        return window;
    };
    const microphoneAllowed = (
        contents: WebContents | null,
        details: { readonly isMainFrame: boolean; readonly requestingUrl?: string },
    ) => {
        if (!contents || !details.isMainFrame || contents.isDestroyed()) return false;
        const window = windows.get(contents.id);
        return (
            window !== undefined &&
            !window.mediaOnly &&
            window.liveWindowId !== undefined &&
            window.microphoneFrame === contents.mainFrame &&
            !contents.mainFrame.detached &&
            details.requestingUrl !== undefined &&
            liveDocumentAllowed(details.requestingUrl, window.document) &&
            liveDocumentAllowed(contents.mainFrame.url, window.document)
        );
    };
    // The default session previously used Electron's default grant behavior.
    // Change only media capture; browser and HTML-preview profiles keep their own handlers.
    session.setPermissionCheckHandler(
        (contents, permission, _origin, details) =>
            permission !== "media" ||
            (details.mediaType === "audio" && microphoneAllowed(contents, details)),
    );
    session.setPermissionRequestHandler((contents, permission, callback, details) => {
        if (permission !== "media") {
            callback(true);
            return;
        }
        const media = details as Electron.MediaAccessPermissionRequest;
        callback(
            media.mediaTypes?.length === 1 &&
                media.mediaTypes[0] === "audio" &&
                microphoneAllowed(contents, details),
        );
    });
    // No DNS lookup or DIRECT fallback for happy-agent. Other origins use the
    // renderer's ordinary network path; guest sessions have their own proxies.
    const filter = { urls: ["*://happy-agent/*", "ws://happy-agent/*", "wss://happy-agent/*"] };
    const requestAllowed = (
        details: Pick<OnBeforeRequestListenerDetails, "url" | "webContentsId" | "frame">,
    ): boolean => {
        const window =
            details.webContentsId === undefined ? undefined : windows.get(details.webContentsId);
        const frame = details.frame;
        const url = new URL(details.url);
        const live = happyAgentLiveRoute(url.pathname);
        return (
            active &&
            window !== undefined &&
            !window.contents.isDestroyed() &&
            frame !== null &&
            frame !== undefined &&
            !frame.detached &&
            frame === window.contents.mainFrame &&
            rendererNavigationAllowed(frame.url, window.document, window.development) &&
            (url.protocol === "http:" || url.protocol === "ws:") &&
            url.port === "" &&
            (!(live?.action === "create" || live?.action === "control") ||
                (window.liveWindowId !== undefined && window.microphoneFrame === frame)) &&
            (!window.mediaOnly ||
                mediaPreviewAddressAllowed(details.url, [happyAgentRendererOrigin]))
        );
    };
    const gateTiming = (started: number, name: string) => {
        const elapsed = performance.now() - started;
        if (elapsed >= 20) debug?.(`Happy Agent main ${name} gate=${elapsed.toFixed(0)}ms`);
    };
    session.webRequest.onBeforeRequest(filter, (details, callback) => {
        const started = performance.now();
        callback({ cancel: !requestAllowed(details) });
        gateTiming(started, "request");
    });
    // Chromium suppresses interactive auth challenges for cross-origin images.
    // Authenticate trusted requests before sending them so the first image works
    // even if no API request has warmed the proxy's authentication cache yet.
    session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        const started = performance.now();
        if (!requestAllowed(details)) {
            callback({ cancel: true });
            gateTiming(started, "headers");
            return;
        }
        const requestHeaders = { ...details.requestHeaders };
        for (const name of Object.keys(requestHeaders))
            if (
                name.toLowerCase() === "proxy-authorization" ||
                name.toLowerCase() === HAPPY_AGENT_LIVE_WINDOW_HEADER
            )
                delete requestHeaders[name];
        const window =
            details.webContentsId === undefined ? undefined : windows.get(details.webContentsId);
        if (window?.liveWindowId && !window.mediaOnly)
            requestHeaders[HAPPY_AGENT_LIVE_WINDOW_HEADER] = window.liveWindowId;
        requestHeaders["Proxy-Authorization"] =
            `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`;
        callback({ requestHeaders });
        gateTiming(started, "headers");
    });
    const eventLoop = debug ? monitorEventLoopDelay({ resolution: 10 }) : undefined;
    eventLoop?.enable();
    const interval =
        eventLoop &&
        setInterval(() => {
            const maximumMs = eventLoop.max / 1e6;
            if (maximumMs >= 100)
                debug?.(`Happy Agent main event-loop stall max=${maximumMs.toFixed(0)}ms`);
            eventLoop.reset();
        }, 10_000);
    interval?.unref();
    return {
        proxy,
        windowRegister(contents, document, development, mediaOnly = false, liveWindowId) {
            if (contents.session !== session)
                throw new Error("Happy Agent renderer session mismatch.");
            const id = contents.id;
            const window = {
                contents,
                document,
                development,
                mediaOnly,
                ...(liveWindowId ? { liveWindowId } : {}),
                microphoneFrame: undefined as WebFrameMain | undefined,
            };
            windows.set(id, window);
            const liveDispose = () => {
                window.microphoneFrame = undefined;
                if (window.liveWindowId) proxy.liveWindowClose?.(window.liveWindowId);
            };
            contents.on("did-start-navigation", (details) => {
                if (details.isMainFrame && !details.isSameDocument) liveDispose();
            });
            contents.on("render-process-gone", liveDispose);
            contents.once("destroyed", () => {
                liveDispose();
                windows.delete(id);
            });
            contents.on("login", (event, _details, authInfo, callback) => {
                if (
                    !active ||
                    !authInfo.isProxy ||
                    authInfo.host !== "127.0.0.1" ||
                    authInfo.port !== proxy.port
                )
                    return;
                event.preventDefault();
                // The request gate runs even after Chromium caches credentials.
                callback(proxy.username, proxy.password);
            });
        },
        liveMicrophoneStart(contents, frame, input) {
            const window = liveWindowRequire(contents, frame);
            if (
                !input ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length !== 1 ||
                !("enabled" in input) ||
                input.enabled !== true
            )
                throw new Error("Enable GPT-Live and choose Start before capturing audio.");
            window.microphoneFrame = contents.mainFrame;
            proxy.liveWindowStart?.(window.liveWindowId!);
        },
        liveMicrophoneRevoke(contents, frame) {
            liveWindowRequire(contents, frame).microphoneFrame = undefined;
        },
        close() {
            closed = true;
            active = false;
            if (interval) clearInterval(interval);
            eventLoop?.disable();
            for (const window of windows.values()) {
                window.microphoneFrame = undefined;
                if (window.liveWindowId) proxy.liveWindowClose?.(window.liveWindowId);
            }
            windows.clear();
            session.setPermissionCheckHandler(null);
            session.setPermissionRequestHandler(null);
            proxy.close();
        },
    };
}

/** Permission belongs to the registered app document, including in development. */
function liveDocumentAllowed(candidateValue: string, documentValue: string): boolean {
    try {
        const candidate = new URL(candidateValue);
        const document = new URL(documentValue);
        return (
            candidate.protocol === document.protocol &&
            candidate.host === document.host &&
            candidate.pathname === document.pathname &&
            candidate.search === document.search
        );
    } catch {
        return false;
    }
}
