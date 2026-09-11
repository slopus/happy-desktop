import type { OnBeforeRequestListenerDetails, Session, WebContents } from "electron";
import {
    happyAgentRendererOrigin,
    happyAgentRendererProxyCreate,
    type HappyAgentRendererProxy,
} from "./happyAgentRendererProxy";
import { rendererNavigationAllowed } from "./navigation";
import { mediaPreviewAddressAllowed } from "./mediaPreviewWindow";

export interface HappyAgentRendererSession {
    readonly proxy: HappyAgentRendererProxy;
    windowRegister(
        contents: WebContents,
        document: string,
        development: boolean,
        mediaOnly?: boolean,
    ): void;
    close(): void;
}

/** The stable origin belongs only to registered app documents, never to guests or subframes. */
export async function happyAgentRendererSessionCreate(
    session: Session,
): Promise<HappyAgentRendererSession> {
    const proxy = await happyAgentRendererProxyCreate();
    const windows = new Map<
        number,
        {
            readonly contents: WebContents;
            readonly document: string;
            readonly development: boolean;
            readonly mediaOnly: boolean;
        }
    >();
    // No DNS lookup or DIRECT fallback for happy-agent. Other origins use the
    // renderer's ordinary network path; guest sessions have their own proxies.
    const pac = `function FindProxyForURL(url, host) { return host === "happy-agent" ? "PROXY 127.0.0.1:${String(proxy.port)}" : "DIRECT"; }`;
    const filter = { urls: ["*://happy-agent/*", "ws://happy-agent/*", "wss://happy-agent/*"] };
    const requestAllowed = (
        details: Pick<OnBeforeRequestListenerDetails, "url" | "webContentsId" | "frame">,
    ): boolean => {
        const window =
            details.webContentsId === undefined ? undefined : windows.get(details.webContentsId);
        const frame = details.frame;
        const url = new URL(details.url);
        return (
            window !== undefined &&
            !window.contents.isDestroyed() &&
            frame !== null &&
            frame !== undefined &&
            !frame.detached &&
            frame === window.contents.mainFrame &&
            rendererNavigationAllowed(frame.url, window.document, window.development) &&
            (url.protocol === "http:" || url.protocol === "ws:") &&
            url.port === "" &&
            (!window.mediaOnly ||
                mediaPreviewAddressAllowed(details.url, [happyAgentRendererOrigin]))
        );
    };
    session.webRequest.onBeforeRequest(filter, (details, callback) =>
        callback({ cancel: !requestAllowed(details) }),
    );
    const authorization = `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`;
    // Chromium suppresses interactive auth challenges for cross-origin images.
    // Authenticate trusted requests before sending them so the first image works
    // even if no API request has warmed the proxy's authentication cache yet.
    session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        if (!requestAllowed(details)) {
            callback({ cancel: true });
            return;
        }
        const requestHeaders = { ...details.requestHeaders };
        for (const name of Object.keys(requestHeaders))
            if (name.toLowerCase() === "proxy-authorization") delete requestHeaders[name];
        requestHeaders["Proxy-Authorization"] = authorization;
        callback({ requestHeaders });
    });
    try {
        await session.setProxy({
            mode: "pac_script",
            pacScript: `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(pac).toString("base64")}`,
        });
    } catch (error) {
        proxy.close();
        throw error;
    }
    return {
        proxy,
        windowRegister(contents, document, development, mediaOnly = false) {
            if (contents.session !== session)
                throw new Error("Happy Agent renderer session mismatch.");
            const id = contents.id;
            windows.set(id, { contents, document, development, mediaOnly });
            contents.once("destroyed", () => windows.delete(id));
            contents.on("login", (event, _details, authInfo, callback) => {
                if (
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
        close() {
            windows.clear();
            proxy.close();
        },
    };
}
