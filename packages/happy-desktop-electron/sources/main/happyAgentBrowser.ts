import { createHash } from "node:crypto";
import type { Session, WebContents } from "electron";
import type {
    DesktopBrowserCommand,
    DesktopBrowserNetwork,
    DesktopBrowserRefusal,
} from "../shared/desktopContract";
import {
    happyAgentBrowserProxyCreate,
    type HappyAgentBrowserProxyHandle,
} from "./happyAgentBrowserProxy";
import type { DesktopRuntime } from "./desktopRuntime";
import { HappyAgentDaemonHttpError } from "./happyAgentDaemonClient";
import { HappyCloudBrowserError } from "./happyCloudBrowser";

export interface HappyAgentBrowserEvents {
    /** Happy Agent does not know the network (404); its tabs may ask their agent again. */
    readonly networkMissing: () => void;
    /** The network's server refused it because the agent's compute is away. */
    readonly refused?: (refusal: DesktopBrowserRefusal, message: string) => void;
    /** The network is this computer's own: pages load without a proxy. */
    readonly direct?: boolean;
}

/**
 * Chromium stays local; all network traffic exits through one compute network.
 * Every tab bound to that network shares the profile's cookies and storage.
 * When that network is this computer's own, the profile loads its pages
 * directly and has no proxy.
 */
export class HappyAgentBrowser {
    readonly #guests = new Map<number, WebContents>();
    #closed = false;
    #reclaimEnd?: () => void;

    /**
     * A tab's profile is kept on disk and shared by every tab on its network. An
     * inline page's is kept only in memory and is its own: no `persist:` prefix,
     * and the page's name is part of its identity.
     */
    static partition(network: DesktopBrowserNetwork, direct = false): string {
        // A live artifact's profile is the artifact's: its network is fixed when
        // the artifact is made, so the artifact alone names it.
        if (network.artifactId !== undefined) {
            const identity = createHash("sha256")
                .update(JSON.stringify(["artifact", network.connectionId, network.artifactId]))
                .digest("hex");
            return `persist:happy-artifact-live-${identity}`;
        }
        // A direct profile is its own, so no page sees cookies from both the
        // direct route and the tunnel to the same network.
        if (direct) {
            const identity = createHash("sha256")
                .update(JSON.stringify(["direct", network.networkId]))
                .digest("hex");
            return `persist:happy-browser-direct-${identity}`;
        }
        const identity = createHash("sha256")
            .update(JSON.stringify([network.connectionId, network.networkId]))
            .digest("hex");
        return `persist:happy-browser-${identity}`;
    }

    static async create(
        session: Session,
        network: DesktopBrowserNetwork,
        runtime: Pick<
            DesktopRuntime,
            "openHttpProxy" | "browserNetworkCloud" | "browserTunnelsReclaimRegister"
        >,
        events: HappyAgentBrowserEvents,
    ): Promise<HappyAgentBrowser> {
        const direct = events.direct === true;
        // A refusal for compute closes every page on the network, whether it
        // came while opening a tunnel or ended one already open.
        const refusalNotice = (error: unknown) => {
            if (error instanceof HappyCloudBrowserError && error.refusal !== undefined)
                events.refused?.(error.refusal, error.message);
        };
        if (direct) {
            if (network.connectionId !== null || network.artifactId !== undefined)
                throw new Error("Only this computer's own network is reached directly.");
            const browser = new HappyAgentBrowser(session, undefined, false);
            try {
                browser.requestGuardInstall();
                await session.setProxy({ mode: "direct" });
                await session.closeAllConnections();
                const routes = await Promise.all(
                    ["http://localhost:3000/", "https://example.com/"].map((address) =>
                        session.resolveProxy(address),
                    ),
                );
                if (routes.some((resolved) => resolved !== "DIRECT"))
                    throw new Error("Chromium could not establish the workspace browser route.");
                return browser;
            } catch (error) {
                browser.close();
                throw error;
            }
        }
        const proxy = await happyAgentBrowserProxyCreate({
            // Resolve the current connection on each request so reconnecting does
            // not replace the profile or its guests. An ended network rejects.
            openHttpProxy: (signal) =>
                runtime.openHttpProxy(network, signal).then(
                    (tunnel) => {
                        tunnel.once("error", refusalNotice);
                        return tunnel;
                    },
                    (error: unknown) => {
                        // Every refusal is reported; each tab asks at most once per
                        // navigation, however many of its tunnels were refused.
                        if (error instanceof HappyAgentDaemonHttpError && error.statusCode === 404)
                            events.networkMissing();
                        refusalNotice(error);
                        throw error;
                    },
                ),
            pooled: runtime.browserNetworkCloud(network.connectionId),
        });
        const browser = new HappyAgentBrowser(session, proxy, network.artifactId !== undefined);
        browser.#reclaimEnd = runtime.browserTunnelsReclaimRegister(network, () =>
            proxy.idleClose(),
        );
        try {
            browser.requestGuardInstall();
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
        /** The loopback proxy into the network; absent when pages load directly. */
        readonly proxy: HappyAgentBrowserProxyHandle | undefined,
        /** A live artifact's profile, whose pages are the artifact's author's to inspect. */
        readonly artifact: boolean,
    ) {}

    /** Only web addresses load, and nothing at all once the profile is closed. */
    private requestGuardInstall(): void {
        this.session.webRequest.onBeforeRequest((details, callback) => {
            const protocol = new URL(details.url).protocol;
            callback({
                cancel:
                    this.#closed ||
                    !["http:", "https:", "ws:", "wss:", "about:", "data:", "blob:"].includes(
                        protocol,
                    ),
            });
        });
    }

    register(guest: WebContents): void {
        if (this.#closed || guest.session !== this.session)
            throw new Error("Invalid workspace browser profile.");
        this.#guests.set(guest.id, guest);
        guest.once("destroyed", () => this.#guests.delete(guest.id));
    }

    /** The pages this profile shows now. */
    guests(): readonly WebContents[] {
        return [...this.#guests.values()].filter((guest) => !guest.isDestroyed());
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
        if (command.action === "devtools") {
            // Only the page: a guest this profile registered, never the window
            // that embeds it, and only a live artifact's.
            if (!this.artifact) throw new Error("Only a live artifact's page can be inspected.");
            contents.openDevTools({ mode: "detach" });
        } else if (command.action === "stop") contents.stop();
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
        this.proxy?.connectionsClose();
    }

    close(): void {
        this.#closed = true;
        this.#reclaimEnd?.();
        this.proxy?.close();
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
