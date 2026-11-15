import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication, Page } from "playwright";
import { createServer as viteServerCreate, type Plugin, type ViteDevServer } from "vite";
import { happyAgentRuntimeCreate, type StartedHappyAgentRuntime } from "./happyAgentRuntime.js";
import { gymInferenceServerCreate } from "./inferenceServer.js";
import { gymElectronInvisibleAssert, gymElectronLaunch } from "./launch.js";
import { gymManifestRead } from "./manifest.js";
import { electronEntrypointResolve, gymRunPathsCreate } from "./paths.js";

const exec = promisify(execFile);

/** How a workspace browser profile reaches its pages. */
export type GymBrowserRoute = "direct" | "proxy";

export interface GymBrowserPreviewCheck {
    readonly ok: boolean;
    readonly detail: string;
}

export interface GymBrowserPreviewResult {
    readonly status: "passed" | "failed";
    readonly root: string;
    readonly expectedRoute: GymBrowserRoute;
    /** What Chromium resolves a page of the agent's profile through. */
    readonly route?: string;
    readonly networkId?: string;
    readonly checks: Readonly<Record<string, GymBrowserPreviewCheck>>;
    readonly failures: readonly string[];
}

/**
 * The part of the desktop bridge this lane drives; the gym does not depend on
 * the desktop package, so it names only what it calls.
 */
interface GymPreviewBridge {
    runtimeGet(): Promise<{ readonly phase: string }>;
    runtimeStart(request: { readonly mode: "local" }): Promise<void>;
    browserNetworkResolve?(target: {
        readonly connectionId: null;
        readonly workspaceId: string;
        readonly agentId: string;
    }): Promise<string>;
    browserNetworkProfileOpen?(network: {
        readonly connectionId: null;
        readonly networkId: string;
    }): Promise<string>;
    browserNetworkCommand?(
        partition: string,
        guestId: number,
        command: { readonly action: "load"; readonly url: string },
    ): Promise<void>;
}

type GymPreviewWindow = Window & { readonly happyDesktop?: GymPreviewBridge };

/** Modules the preview app imports, so a cold load is a real module graph. */
const PREVIEW_MODULES = 200;

/**
 * The workspace browser against the local Happy Agent, end to end: the real
 * app's renderer resolves the agent's network, opens its profile and attaches
 * a guest exactly as a browser tab does, and loads a real Vite dev server —
 * a module graph, a root-relative and an absolute asset, a cookie, a redirect
 * to a non-root path, and hot module replacement over its WebSocket. Then the
 * daemon stops under the open page and the page is reloaded.
 *
 * `expectedRoute` says how the agent's profile should reach the page: through
 * the agent's proxy, or directly, for an agent on this computer's own network.
 * A direct page must keep working while the daemon is down; a proxied one
 * cannot, and the lane records that it does not.
 */
export async function gymBrowserPreviewRun(options: {
    readonly expectedRoute: GymBrowserRoute;
    readonly artifactDirectory?: string;
}): Promise<GymBrowserPreviewResult> {
    const { paths } = await gymRunPathsCreate("smoke", undefined, options.artifactDirectory);
    const manifest = gymManifestRead("smoke");
    const inference = gymInferenceServerCreate(manifest, paths.inferenceLog);
    const checks: Record<string, GymBrowserPreviewCheck> = {};
    const check = (name: string, ok: boolean, detail: unknown) => {
        checks[name] = { ok, detail: typeof detail === "string" ? detail : JSON.stringify(detail) };
    };
    let runtime: StartedHappyAgentRuntime | undefined;
    let vite: ViteDevServer | undefined;
    let app: ElectronApplication | undefined;
    let route: string | undefined;
    let networkId: string | undefined;
    try {
        await inference.start();
        runtime = await happyAgentRuntimeCreate(paths, inference);
        const target = await agentCreate(runtime, join(paths.projects, "Browser Preview"));
        const site = join(paths.root, "preview-site");
        vite = await previewSiteStart(site);
        const base = viteBase(vite);

        const entrypoint = electronEntrypointResolve(paths.workspaceRoot);
        app = await gymElectronLaunch({
            args: [
                `--user-data-dir=${paths.electronUserData}`,
                ...linuxHeadlessArguments(),
                entrypoint.main,
            ],
            cwd: paths.workspaceRoot,
            env: { ...runtime.environment, ...linuxDisplayEnvironment() },
            executablePath: entrypoint.executable,
            timeout: 60_000,
        });
        const page = await app.firstWindow();
        await page.waitForFunction(
            () => (window as GymPreviewWindow).happyDesktop !== undefined,
            null,
            {
                timeout: 30_000,
            },
        );
        await localRuntimeReady(page);

        const opened = await guestOpen(page, target);
        networkId = opened.networkId;
        route = await routeRead(app, opened.partition, base);
        check(
            "route",
            routeOf(route) === options.expectedRoute,
            `${route} (expected ${options.expectedRoute})`,
        );

        const loaded = await guestLoad(
            page,
            base,
            `new Promise((resolve) => { const started = Date.now(); const tick = () =>
                window.__sum !== undefined && window.__cookie !== undefined
                    ? Promise.resolve(window.__cookie).then((cookie) => resolve({ sum: window.__sum, absolute: getComputedStyle(document.body).getPropertyValue("--absolute").trim(), cookie, elapsed: Date.now() - started }))
                    : Date.now() - started > 30000 ? resolve({ timeout: true }) : setTimeout(tick, 20);
                tick(); })`,
        );
        const root = loaded.probe as {
            sum?: number;
            absolute?: string;
            cookie?: string;
        };
        check("moduleGraph", root.sum === (PREVIEW_MODULES * (PREVIEW_MODULES - 1)) / 2, {
            ...loaded,
            probe: { sum: root.sum },
        });
        check("absoluteAsset", root.absolute === "1", root.absolute ?? loaded);
        check(
            "cookie",
            typeof root.cookie === "string" && root.cookie.includes("preview_session=abc123"),
            root.cookie ?? loaded,
        );

        const hot = await hmrApply(page, site);
        check("hotModuleReplacement", hot.ok === true, hot);

        const redirected = await guestLoad(
            page,
            new URL("r", base).href,
            `({ relative: window.__relative === true, href: location.href })`,
        );
        const redirect = redirected.probe as { relative?: boolean; href?: string };
        check(
            "redirectToNonRootPath",
            redirect.relative === true &&
                redirect.href === new URL("deep/page.html?from=redirect", base).href,
            redirect,
        );

        await page
            .screenshot({ path: join(paths.artifacts, "browser-preview-loaded.png") })
            .catch(() => undefined);

        // The daemon goes away under the open page; the dev server does not.
        await runtime.stop();
        runtime = undefined;
        const down = await guestLoad(
            page,
            new URL("deep/page.html?daemon=down", base).href,
            `({ relative: window.__relative === true })`,
        );
        const survived = (down.probe as { relative?: boolean } | undefined)?.relative === true;
        check(
            "daemonDown",
            options.expectedRoute === "direct" ? survived : !survived,
            options.expectedRoute === "direct"
                ? { survived, down }
                : { survived, expected: "a proxied page cannot load without its daemon", down },
        );

        await page
            .screenshot({ path: join(paths.artifacts, "browser-preview-daemon-down.png") })
            .catch(() => undefined);
        await gymElectronInvisibleAssert(app);
    } catch (error) {
        check("run", false, error instanceof Error ? (error.stack ?? error.message) : error);
    } finally {
        await app?.close().catch(() => undefined);
        await vite?.close().catch(() => undefined);
        await runtime?.stop().catch(() => undefined);
        await inference.stop().catch(() => undefined);
    }
    const failures = Object.entries(checks)
        .filter(([, result]) => !result.ok)
        .map(([name]) => name);
    const result: GymBrowserPreviewResult = {
        status: failures.length === 0 ? "passed" : "failed",
        root: paths.root,
        expectedRoute: options.expectedRoute,
        ...(route === undefined ? {} : { route }),
        ...(networkId === undefined ? {} : { networkId }),
        checks,
        failures,
    };
    await writeFile(
        join(paths.artifacts, "browser-preview.json"),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    return result;
}

interface PreviewTarget {
    readonly workspaceId: string;
    readonly agentId: string;
}

/** A project, a workspace in it, and an agent there, through the real APIs. */
async function agentCreate(
    runtime: StartedHappyAgentRuntime,
    repository: string,
): Promise<PreviewTarget> {
    await mkdir(repository, { recursive: true });
    await writeFile(join(repository, "README.md"), "# Browser Preview\n");
    const git = (...args: string[]) =>
        exec("git", ["-c", "user.email=gym@happy.invalid", "-c", "user.name=Gym", ...args], {
            cwd: repository,
        });
    await git("init", "-q", "-b", "main");
    await git("add", "README.md");
    await git("commit", "-qm", "Start");
    const { project } = await runtime.client.registerProject(repository);
    // A project and its workspace finish preparing after they are created.
    const workspace = await retry(
        async () => (await runtime.client.createWorkspace(project.id, "preview")).workspace,
    );
    const agent = await retry(async () => (await runtime.client.createAgent(workspace.id)).agent);
    return { workspaceId: workspace.id, agentId: agent.id };
}

async function retry<T>(attempt: () => Promise<T>, timeoutMs = 60_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            return await attempt();
        } catch (error) {
            if (Date.now() > deadline) throw error;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
}

/**
 * The page a person previews: a Vite dev server on this computer's loopback,
 * reached as `localhost`, with a real module graph and HMR, a cookie, a
 * redirect into a nested page, and a stylesheet named by absolute address.
 */
export async function previewSiteStart(site: string): Promise<ViteDevServer> {
    await mkdir(join(site, "src"), { recursive: true });
    await mkdir(join(site, "deep"), { recursive: true });
    await Promise.all(
        Array.from({ length: PREVIEW_MODULES }, (_, index) =>
            writeFile(
                join(site, "src", `m${String(index)}.js`),
                `export default ${String(index)};\n`,
            ),
        ),
    );
    await writeFile(
        join(site, "src", "main.js"),
        [
            ...Array.from(
                { length: PREVIEW_MODULES },
                (_, index) => `import m${String(index)} from "./m${String(index)}.js";`,
            ),
            `import { label } from "./hot.js";`,
            `window.__labels = [label];`,
            `window.__cookie = fetch("/api/whoami").then((response) => response.text());`,
            `window.__sum = ${Array.from({ length: PREVIEW_MODULES }, (_, index) => `m${String(index)}`).join(" + ")};`,
            `document.getElementById("app").textContent = "sum " + window.__sum;`,
            `if (import.meta.hot) import.meta.hot.accept("./hot.js", (next) => window.__labels.push(next.label));`,
            ``,
        ].join("\n"),
    );
    await writeFile(join(site, "src", "hot.js"), `export const label = "first";\n`);
    await writeFile(
        join(site, "deep", "page.html"),
        `<!doctype html><title>Nested</title><script src="./relative.js"></script><p>nested</p>\n`,
    );
    await writeFile(join(site, "deep", "relative.js"), `window.__relative = true;\n`);
    const routes: Plugin = {
        name: "gym-browser-preview-routes",
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const url = new URL(request.url ?? "/", "http://site");
                if (url.pathname === "/") {
                    response.setHeader(
                        "set-cookie",
                        "preview_session=abc123; Path=/; HttpOnly; SameSite=Lax",
                    );
                } else if (url.pathname === "/r") {
                    response.writeHead(302, { location: "/deep/page.html?from=redirect" }).end();
                    return;
                } else if (url.pathname === "/api/whoami") {
                    response
                        .writeHead(200, { "content-type": "text/plain" })
                        .end(`cookie=${request.headers.cookie ?? ""}`);
                    return;
                } else if (url.pathname === "/absolute.css") {
                    response
                        .writeHead(200, { "content-type": "text/css" })
                        .end("body { --absolute: 1; }");
                    return;
                }
                next();
            });
        },
        transformIndexHtml(html, context) {
            const address = context.server?.resolvedUrls?.local[0];
            return address
                ? html.replace(
                      "</head>",
                      `<link rel="stylesheet" href="${new URL("absolute.css", address).href}"></head>`,
                  )
                : html;
        },
    };
    await writeFile(
        join(site, "index.html"),
        `<!doctype html><html><head><title>Preview</title></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>\n`,
    );
    const server = await viteServerCreate({
        root: site,
        configFile: false,
        logLevel: "silent",
        plugins: [routes],
        // `localhost` is what a person types; the server answers on loopback.
        server: { host: "localhost", port: 0, strictPort: false },
    });
    await server.listen();
    return server;
}

export function viteBase(server: ViteDevServer): string {
    const local = server.resolvedUrls?.local[0];
    if (!local) throw new Error("The preview site has no local address.");
    return local;
}

/** Starts the local Happy Agent mode the way setup does, and waits for it. */
async function localRuntimeReady(page: Page): Promise<void> {
    const phases = await page.evaluate(async () => {
        const desktop = (window as GymPreviewWindow).happyDesktop!;
        const seen: string[] = [];
        const deadline = Date.now() + 60_000;
        let asked = false;
        while (Date.now() < deadline) {
            const snapshot = await desktop.runtimeGet();
            if (seen.at(-1) !== snapshot.phase) seen.push(snapshot.phase);
            if (snapshot.phase === "ready") return { ready: true, seen };
            if ((snapshot.phase === "off" || snapshot.phase === "choosing") && !asked) {
                asked = true;
                await desktop.runtimeStart({ mode: "local" });
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return { ready: false, seen };
    });
    if (!phases.ready)
        throw new Error(`The local Happy Agent never became ready: ${phases.seen.join(" → ")}.`);
}

/**
 * Resolves the agent's network, opens its profile, and attaches one guest to
 * it, as `DesktopBrowserGuest` does for a browser tab. The guest stays in the
 * window for every later load.
 */
async function guestOpen(
    page: Page,
    target: PreviewTarget,
): Promise<{ readonly networkId: string; readonly partition: string }> {
    return await page.evaluate(async (target) => {
        const desktop = (window as GymPreviewWindow).happyDesktop!;
        const networkId = await desktop.browserNetworkResolve!({ connectionId: null, ...target });
        const partition = await desktop.browserNetworkProfileOpen!({
            connectionId: null,
            networkId,
        });
        const view = document.createElement("webview");
        view.setAttribute("partition", partition);
        view.setAttribute("src", "about:blank");
        view.setAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no,sandbox=yes");
        view.style.cssText = "position:fixed;inset:0;width:800px;height:600px;z-index:9999";
        const ready = new Promise((resolve) =>
            view.addEventListener("dom-ready", () => resolve(undefined)),
        );
        document.body.append(view);
        await ready;
        (window as unknown as { __gymPreview: unknown }).__gymPreview = { view, partition };
        return { networkId, partition };
    }, target);
}

/** Loads one address in the guest through the browser command and probes the page. */
async function guestLoad(
    page: Page,
    url: string,
    probe: string,
): Promise<{ readonly finalUrl?: string; readonly loadError?: string; readonly probe?: unknown }> {
    return await page.evaluate(
        async ({ url, probe }) => {
            const preview = (
                window as unknown as {
                    __gymPreview: {
                        view: HTMLElement & {
                            getWebContentsId(): number;
                            getURL(): string;
                            executeJavaScript(code: string): Promise<unknown>;
                        };
                        partition: string;
                    };
                }
            ).__gymPreview;
            let loadError: string | undefined;
            await (window as GymPreviewWindow).happyDesktop!.browserNetworkCommand!(
                preview.partition,
                preview.view.getWebContentsId(),
                { action: "load", url },
            ).catch((error: Error) => (loadError = error.message));
            const result = await preview.view
                .executeJavaScript(probe)
                .catch((error: Error) => `probe failed: ${error.message}`);
            return {
                finalUrl: preview.view.getURL(),
                ...(loadError === undefined ? {} : { loadError }),
                probe: result,
            };
        },
        { url, probe },
    );
}

/** Edits a module once the page's HMR socket is connected and waits for the update. */
async function hmrApply(page: Page, site: string): Promise<Record<string, unknown>> {
    const connected = await page.evaluate(async () => {
        const preview = (
            window as unknown as {
                __gymPreview: { view: { executeJavaScript(code: string): Promise<unknown> } };
            }
        ).__gymPreview;
        // Vite logs "[vite] connected." once its socket is open; the page's
        // own `import.meta.hot` client is what is waited on here instead.
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            const ready = await preview.view
                .executeJavaScript(
                    `performance.getEntriesByType("resource").some((entry) => entry.name.includes("/@vite/client"))`,
                )
                .catch(() => false);
            if (ready) return true;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return false;
    });
    // The client opens its socket right after it loads; give it a moment.
    await page.waitForTimeout(1_000);
    const started = Date.now();
    await writeFile(join(site, "src", "hot.js"), `export const label = "second";\n`);
    const applied = await page.evaluate(async () => {
        const preview = (
            window as unknown as {
                __gymPreview: { view: { executeJavaScript(code: string): Promise<unknown> } };
            }
        ).__gymPreview;
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            const labels = (await preview.view
                .executeJavaScript("window.__labels")
                .catch(() => [])) as string[];
            if (labels.includes("second")) return { ok: true, labels };
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return {
            ok: false,
            labels: await preview.view.executeJavaScript("window.__labels").catch(() => []),
        };
    });
    return { ...applied, clientLoaded: connected, ms: Date.now() - started };
}

/** What Chromium resolves a page of the profile through: `DIRECT` or `PROXY host:port`. */
async function routeRead(
    app: ElectronApplication,
    partition: string,
    base: string,
): Promise<string> {
    return await app.evaluate(
        ({ session }, { partition, base }) => session.fromPartition(partition).resolveProxy(base),
        { partition, base },
    );
}

function routeOf(resolved: string): GymBrowserRoute | undefined {
    if (resolved === "DIRECT") return "direct";
    if (resolved.startsWith("PROXY ")) return "proxy";
    return undefined;
}

/**
 * A Linux host with no display server runs Chromium's headless platform, and
 * Chromium refuses to run as root inside its own sandbox.
 */
export function linuxHeadlessArguments(): string[] {
    if (process.platform !== "linux") return [];
    return [
        ...(process.env.DISPLAY || process.env.WAYLAND_DISPLAY
            ? []
            : ["--ozone-platform=headless", "--disable-gpu"]),
        ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
    ];
}

export function linuxDisplayEnvironment(): Record<string, string> {
    if (process.platform !== "linux") return {};
    const passthrough: Record<string, string> = {};
    for (const name of ["DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR"]) {
        const value = process.env[name];
        if (value) passthrough[name] = value;
    }
    return passthrough;
}
