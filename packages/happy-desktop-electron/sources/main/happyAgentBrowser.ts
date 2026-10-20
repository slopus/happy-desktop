import { createHash } from "node:crypto";
import type { Session, WebContents } from "electron";
import type { DesktopBrowserCommand, DesktopBrowserNetwork } from "../shared/desktopContract";
import {
    happyAgentBrowserProxyCreate,
    type HappyAgentBrowserProxyHandle,
} from "./happyAgentBrowserProxy";
import type { DesktopRuntime } from "./desktopRuntime";
import { HappyAgentDaemonHttpError } from "./happyAgentDaemonClient";

/**
 * Chromium stays local; all network traffic exits through one compute network.
 * Every tab bound to that network shares the profile's cookies and storage.
 */
export class HappyAgentBrowser {
    readonly #guests = new Map<number, WebContents>();
    #closed = false;

    /**
     * A tab's profile is kept on disk and shared by every tab on its network. An
     * inline page's is kept only in memory and is its own: no `persist:` prefix,
     * and the page's name is part of its identity.
     */
    static partition(network: DesktopBrowserNetwork): string {
        if (network.page !== undefined) {
            const identity = createHash("sha256")
                .update(JSON.stringify([network.connectionId, network.networkId, network.page]))
                .digest("hex");
            return `${HappyAgentBrowser.inlinePagePrefix}${identity}`;
        }
        const identity = createHash("sha256")
            .update(JSON.stringify([network.connectionId, network.networkId]))
            .digest("hex");
        return `persist:happy-browser-${identity}`;
    }

    static readonly inlinePagePrefix = "happy-inline-page-";

    static inlinePage(partition: string): boolean {
        return partition.startsWith(HappyAgentBrowser.inlinePagePrefix);
    }

    static async create(
        session: Session,
        network: DesktopBrowserNetwork,
        runtime: DesktopRuntime,
        /** Happy Agent does not know the network (404); its tabs may ask their agent again. */
        networkMissing: () => void,
    ): Promise<HappyAgentBrowser> {
        const proxy = await happyAgentBrowserProxyCreate({
            // Resolve the current connection on each request so reconnecting does
            // not replace the profile or its guests. An ended network rejects.
            openHttpProxy: (signal) =>
                runtime.openHttpProxy(network, signal).catch((error: unknown) => {
                    // Every refusal is reported; each tab asks at most once per
                    // navigation, however many of its tunnels were refused.
                    if (error instanceof HappyAgentDaemonHttpError && error.statusCode === 404)
                        networkMissing();
                    throw error;
                }),
        });
        const browser = new HappyAgentBrowser(session, proxy);
        try {
            session.webRequest.onBeforeRequest((details, callback) => {
                const protocol = new URL(details.url).protocol;
                callback({
                    cancel:
                        browser.#closed ||
                        !["http:", "https:", "ws:", "wss:", "about:", "data:", "blob:"].includes(
                            protocol,
                        ),
                });
            });
            const route = `PROXY 127.0.0.1:${proxy.port}`;
            await session.setProxy({
                mode: "fixed_servers",
                proxyRules: `http://127.0.0.1:${proxy.port}`,
                // Chromium otherwise sends loopback directly to the desktop.
                proxyBypassRules: "<-loopback>",
            });
            await session.closeAllConnections();
            const routes = await Promise.all(
                ["http://localhost:3000/", "https://example.com/", "ws://127.0.0.1:3000/"].map(
                    (address) => session.resolveProxy(address),
                ),
            );
            if (routes.some((resolved) => resolved !== route))
                throw new Error("Chromium could not establish the workspace browser route.");
            return browser;
        } catch (error) {
            browser.close();
            throw error;
        }
    }

    private constructor(
        readonly session: Session,
        readonly proxy: HappyAgentBrowserProxyHandle,
    ) {}

    register(guest: WebContents): void {
        if (this.#closed || guest.session !== this.session)
            throw new Error("Invalid workspace browser profile.");
        this.#guests.set(guest.id, guest);
        guest.once("destroyed", () => this.#guests.delete(guest.id));
    }

    owns(guest: WebContents): boolean {
        return this.#guests.get(guest.id) === guest;
    }

    popupAllowed(guest: WebContents, candidate: string): boolean {
        return !this.#closed && this.owns(guest) && browserAddress(candidate) !== undefined;
    }

    async command(contents: WebContents, command: DesktopBrowserCommand): Promise<void> {
        if (this.#closed || !this.owns(contents) || contents.isDestroyed())
            throw new Error("The browser tab is unavailable.");
        if (command.action === "stop") contents.stop();
        else if (command.action === "reload") contents.reload();
        else if (command.action === "load") {
            const address = browserAddress(command.url);
            if (!address) throw new Error("The browser address is invalid.");
            await contents.loadURL(address);
        } else {
            const history = contents.navigationHistory;
            const offset = command.action === "back" ? -1 : 1;
            if (history.canGoToOffset(offset)) history.goToOffset(offset);
        }
    }

    connectionsClose(): void {
        this.proxy.connectionsClose();
    }

    close(): void {
        this.#closed = true;
        this.proxy.close();
        this.#guests.clear();
        // Keep the request guard installed: retired profiles must stay closed.
    }
}

function browserAddress(candidate: string): string | undefined {
    if (candidate === "about:blank") return candidate;
    try {
        const address = new URL(candidate);
        if (
            !["http:", "https:"].includes(address.protocol) ||
            address.username ||
            address.password ||
            candidate.length > 65536
        )
            return undefined;
        return address.href;
    } catch {
        return undefined;
    }
}
