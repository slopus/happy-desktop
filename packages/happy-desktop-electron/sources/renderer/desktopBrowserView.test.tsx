// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { BrowserContentProps } from "happy-desktop-ui";
import type { DesktopBrowserTunnelFailure } from "../shared/desktopContract";
import { DesktopBrowserGuest } from "./desktopBrowserView";

const GUEST_ID = 7;
/** The native guest's own method, on the element jsdom makes for `webview`. */
const guestElement = HTMLElement.prototype as HTMLElement & { getWebContentsId?: () => number };

afterEach(() => {
    delete guestElement.getWebContentsId;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

/**
 * Mounts one artifact page's guest against a stub bridge, with the native
 * guest element standing in as jsdom's unknown `webview` element, and boots
 * it as Electron does with its first `dom-ready`.
 */
async function guestMount(props: Partial<BrowserContentProps>) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let tunnelFailed: ((failure: DesktopBrowserTunnelFailure) => void) | undefined;
    vi.stubGlobal("happyDesktop", {
        browserNetworkResolve: vi.fn(),
        browserNetworkProfileOpen: vi.fn(() => Promise.resolve("persist:happy-browser-test")),
        browserNetworkCommand: vi.fn(() => Promise.resolve()),
        browserNetworkPopupSubscribe: () => () => undefined,
        browserNetworkMissingSubscribe: () => () => undefined,
        browserStatusSubscribe: () => () => undefined,
        browserTunnelFailureSubscribe: (
            listener: (failure: DesktopBrowserTunnelFailure) => void,
        ) => {
            tunnelFailed = listener;
            return () => undefined;
        },
    });
    guestElement.getWebContentsId = () => GUEST_ID;
    const browserFailed = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(
            <DesktopBrowserGuest
                browserControllerReady={() => undefined}
                browserFailed={browserFailed}
                browserLoadingChanged={() => undefined}
                browserLocationChanged={() => undefined}
                browserTitleChanged={() => undefined}
                source="about:blank"
                target={{
                    connectionId: "cloud-test",
                    artifactId: "art_live",
                    networkId: "net_agent",
                }}
                {...props}
            />,
        );
    });
    const view = host.querySelector("webview");
    if (!view) throw new Error("The guest never opened its profile.");
    await act(async () => view.dispatchEvent(new Event("dom-ready")));
    return {
        browserFailed,
        tunnelFail: (failure: Omit<DesktopBrowserTunnelFailure, "guestId">) =>
            act(() => tunnelFailed?.({ guestId: GUEST_ID, ...failure })),
        unmount: () => act(() => root.unmount()),
    };
}

it("hands a refused tunnel to the tab instead of showing a failed page", async () => {
    const browserRefused = vi.fn();
    const guest = await guestMount({ browserRefused });

    await guest.tunnelFail({
        url: "http://localhost:5173/",
        message: "This agent's compute is offline.",
        refusal: "computeOffline",
    });
    expect(browserRefused).toHaveBeenCalledWith("computeOffline");
    expect(guest.browserFailed).not.toHaveBeenCalled();

    // Any other tunnel failure is the page's to show.
    await guest.tunnelFail({ url: "http://localhost:5173/", message: "Connection refused." });
    expect(browserRefused).toHaveBeenCalledTimes(1);
    expect(guest.browserFailed).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Connection refused." }),
    );
    await guest.unmount();
});

it("shows a refused tunnel as a failed page where nothing can close the tab", async () => {
    const guest = await guestMount({});
    await guest.tunnelFail({
        url: "http://localhost:5173/",
        message: "This agent has no compute.",
        refusal: "computeDetached",
    });
    expect(guest.browserFailed).toHaveBeenCalledWith(
        expect.objectContaining({ message: "This agent has no compute." }),
    );
    await guest.unmount();
});
