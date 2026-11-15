import { app, BrowserWindow, session as electronSession } from "electron";
import type { Duplex } from "node:stream";
import type { DesktopBrowserRefusal } from "../shared/desktopContract.js";
import { HappyAgentBrowser } from "../main/happyAgentBrowser.js";
import { happyCloudBrowserCreate } from "../main/happyCloudBrowser.js";
import { hiddenWindowsInstall } from "../main/hiddenWindows.js";

/**
 * A test-only Electron main process for the workspace browser's Happy Cloud
 * path. It is never shipped: the Gym bundles and launches it, hidden, and
 * drives it through `globalThis.happyCloudBrowserHarness`.
 *
 * It runs the app's own transport, profile and loopback proxy against one
 * Happy Cloud server, signed in with a bearer the Gym obtained, and shows the
 * agent's pages in a hidden window of that profile. Everything else the app
 * does around them — sign-in, the directory, the panel — is not here.
 */
export interface HappyCloudBrowserHarness {
    /** Asks the server for the agent's network and opens its profile. */
    profileOpen(): Promise<{ readonly networkId: string; readonly route: string }>;
    /** Loads one address in the page and reports how it went. */
    load(url: string): Promise<HappyCloudBrowserLoad>;
    /** Evaluates an expression in the page. */
    evaluate(expression: string): Promise<unknown>;
    /** Every compute refusal the profile has heard, oldest first. */
    refusals(): readonly HappyCloudBrowserRefusalRecord[];
    /** Tunnels asked for and opened, and the page's console lines. */
    stats(): HappyCloudBrowserStats;
}

export interface HappyCloudBrowserLoad {
    readonly ok: boolean;
    readonly url: string;
    /** The HTTP status the page was answered with. */
    readonly status?: number;
    readonly error?: string;
    readonly ms: number;
}

export interface HappyCloudBrowserRefusalRecord {
    readonly at: number;
    readonly refusal: DesktopBrowserRefusal;
    readonly message: string;
}

export interface HappyCloudBrowserStats {
    readonly tunnelsAsked: number;
    readonly tunnelsOpened: number;
    /** Tunnels open now. */
    readonly tunnelsLive: number;
    readonly tunnelFailures: readonly string[];
    readonly console: readonly string[];
}

const CONNECTION_ID = "cloud-harness";

function configRead() {
    const raw = process.env.HAPPY_CLOUD_BROWSER_HARNESS;
    if (!raw) throw new Error("HAPPY_CLOUD_BROWSER_HARNESS is not set.");
    const config = JSON.parse(raw) as {
        readonly serverUrl: string;
        readonly token: string;
        readonly workspaceId: string;
        readonly agentId: string;
    };
    return config;
}

async function harnessCreate(): Promise<HappyCloudBrowserHarness> {
    const config = configRead();
    const credential = { serverUrl: config.serverUrl, accessToken: config.token };
    const transport = happyCloudBrowserCreate({
        remote: {
            credential: (connectionId) => (connectionId === CONNECTION_ID ? credential : undefined),
            refresh: async () => undefined,
        },
    });
    const refusals: HappyCloudBrowserRefusalRecord[] = [];
    const consoleLines: string[] = [];
    const tunnelFailures: string[] = [];
    let tunnelsAsked = 0;
    let tunnelsOpened = 0;
    let tunnelsLive = 0;
    let browser: HappyAgentBrowser | undefined;
    let window: BrowserWindow | undefined;

    // As main does: only a page the profile owns receives the proxy's login.
    app.on("login", (event, contents, _details, authInfo, callback) => {
        const proxy = browser?.proxy;
        if (!authInfo.isProxy || !proxy || authInfo.port !== proxy.port) return;
        event.preventDefault();
        if (contents && browser?.owns(contents)) callback(proxy.username, proxy.password);
        else callback();
    });

    const pageRequire = (): BrowserWindow => {
        if (!window || window.isDestroyed()) throw new Error("The profile is not open.");
        return window;
    };

    return {
        async profileOpen() {
            const networkId = await transport.networkResolve(
                {
                    connectionId: CONNECTION_ID,
                    workspaceId: config.workspaceId,
                    agentId: config.agentId,
                },
                AbortSignal.timeout(15_000),
            );
            const network = { connectionId: CONNECTION_ID, networkId };
            const partition = `persist:happy-cloud-harness-${String(Date.now())}`;
            const session = electronSession.fromPartition(partition);
            browser = await HappyAgentBrowser.create(
                session,
                network,
                {
                    openHttpProxy: async (_network, signal) => {
                        tunnelsAsked += 1;
                        try {
                            const tunnel: Duplex = await transport.tunnelOpen(
                                CONNECTION_ID,
                                networkId,
                                signal ?? AbortSignal.timeout(10_000),
                            );
                            tunnelsOpened += 1;
                            tunnelsLive += 1;
                            tunnel.once("close", () => (tunnelsLive -= 1));
                            return tunnel;
                        } catch (error) {
                            tunnelFailures.push(
                                error instanceof Error ? error.message : String(error),
                            );
                            throw error;
                        }
                    },
                    browserNetworkCloud: () => true,
                    browserTunnelsReclaimRegister: (_network, reclaim) =>
                        transport.idleReclaimRegister(CONNECTION_ID, reclaim),
                },
                {
                    networkMissing: () => tunnelFailures.push("The network was not found."),
                    refused: (refusal, message) =>
                        refusals.push({ at: Date.now(), refusal, message }),
                },
            );
            window = new BrowserWindow({
                show: false,
                width: 1280,
                height: 800,
                webPreferences: {
                    partition,
                    backgroundThrottling: false,
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                },
            });
            browser.register(window.webContents);
            window.webContents.on("console-message", (details) =>
                consoleLines.push(details.message),
            );
            const route = await session.resolveProxy("http://localhost:5173/");
            return { networkId, route };
        },
        async load(url) {
            const page = pageRequire();
            const started = Date.now();
            let status: number | undefined;
            const navigated = (_event: unknown, _url: string, code: number) => (status = code);
            page.webContents.on("did-navigate", navigated);
            try {
                await page.loadURL(url);
                return {
                    ok: status === undefined || status < 400,
                    url: page.webContents.getURL(),
                    ...(status === undefined ? {} : { status }),
                    ms: Date.now() - started,
                };
            } catch (error) {
                return {
                    ok: false,
                    url,
                    error: error instanceof Error ? error.message : String(error),
                    ms: Date.now() - started,
                };
            } finally {
                page.webContents.off("did-navigate", navigated);
            }
        },
        evaluate: (expression) => pageRequire().webContents.executeJavaScript(expression),
        refusals: () => [...refusals],
        stats: () => ({
            tunnelsAsked,
            tunnelsOpened,
            tunnelsLive,
            tunnelFailures: [...tunnelFailures],
            console: [...consoleLines],
        }),
    };
}

// The app's own hidden-window mode: windows render for real and are never shown.
hiddenWindowsInstall();
void app.whenReady().then(async () => {
    (
        globalThis as { happyCloudBrowserHarness?: HappyCloudBrowserHarness }
    ).happyCloudBrowserHarness = await harnessCreate();
});
// A hidden window closing is not the end of the run; the Gym ends it.
app.on("window-all-closed", () => undefined);
