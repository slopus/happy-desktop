import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ElectronApplication, Page } from "playwright";
import { build as viteBuild, type ViteDevServer } from "vite";
import {
    fakeHappyCloudStart,
    type FakeHappyCloud,
} from "../../../happy-desktop-electron/sources/testing/fakeHappyCloud.js";
import {
    linuxDisplayEnvironment,
    linuxHeadlessArguments,
    previewSiteStart,
    viteBase,
} from "./browserPreview.js";
import { gymElectronInvisibleAssert, gymElectronLaunch } from "./launch.js";
import { electronEntrypointResolve, gymRunPathsCreate } from "./paths.js";

/**
 * The workspace browser's Happy Cloud path against a real Happy Cloud server,
 * or against the fake one: the app's own transport, profile and loopback
 * proxy, in a hidden test-only Electron process, load the agent's dev server
 * through the server's tunnels. Then the agent's computer goes offline and
 * comes back, and, when asked, its compute is released and attached again.
 *
 * The app's sign-in, directory and panel are not part of it; a bearer for the
 * server is supplied by the person running it, or obtained from the accounts
 * service the way the app does.
 */
export interface GymCloudBrowserOptions {
    /** Runs against the fake Happy Cloud and a local dev server instead. */
    readonly fake?: boolean;
    readonly serverUrl?: string;
    readonly workspaceId?: string;
    readonly agentId?: string;
    /** The dev server as the agent's computer reaches it, e.g. `http://localhost:5173/`. */
    readonly pageUrl?: string;
    /** A command printing the server's bearer, when `HAPPY_GYM_CLOUD_TOKEN` is not set. */
    readonly tokenCommand?: string;
    /**
     * An accounts service to sign in to as the app does, with
     * `HAPPY_GYM_CLOUD_LOGIN` and `HAPPY_GYM_CLOUD_PASSWORD`, for a token to
     * the server named `serverName`.
     */
    readonly accountsUrl?: string;
    readonly serverName?: string;
    /** Shell commands that take the agent's computer offline and back. */
    readonly computeOffline?: string;
    readonly computeOnline?: string;
    /** Shell commands that release the agent's compute and attach it again. */
    readonly computeRelease?: string;
    readonly computeAttach?: string;
    readonly artifactDirectory?: string;
}

export interface GymCloudBrowserCheck {
    readonly ok: boolean;
    readonly detail: string;
}

export interface GymCloudBrowserResult {
    readonly status: "passed" | "failed";
    readonly root: string;
    readonly fake: boolean;
    readonly networkId?: string;
    readonly checks: Readonly<Record<string, GymCloudBrowserCheck>>;
    readonly failures: readonly string[];
    readonly refusals: readonly HappyCloudBrowserRefusalRecord[];
    readonly stats?: HappyCloudBrowserStats;
}

/**
 * The harness as the lane drives it, from `cloudBrowserHarness.ts` in the
 * desktop package. The Gym does not compile the app's modules, so it names
 * only what it calls.
 */
interface HappyCloudBrowserHarness {
    profileOpen(): Promise<{ readonly networkId: string; readonly route: string }>;
    load(url: string): Promise<HappyCloudBrowserLoad>;
    evaluate(expression: string): Promise<unknown>;
    refusals(): readonly HappyCloudBrowserRefusalRecord[];
    stats(): HappyCloudBrowserStats;
}

interface HappyCloudBrowserLoad {
    readonly ok: boolean;
    readonly url: string;
    readonly status?: number;
    readonly error?: string;
    readonly ms: number;
}

interface HappyCloudBrowserRefusalRecord {
    readonly at: number;
    readonly refusal: "computeDetached" | "computeOffline";
    readonly message: string;
}

interface HappyCloudBrowserStats {
    readonly tunnelsAsked: number;
    readonly tunnelsOpened: number;
    readonly tunnelFailures: readonly string[];
    readonly console: readonly string[];
}

/** How long the computer may take to be seen going away, and coming back. */
const OFFLINE_WAIT_MS = 120_000;
const ONLINE_WAIT_MS = 240_000;

export async function gymCloudBrowserRun(
    options: GymCloudBrowserOptions,
): Promise<GymCloudBrowserResult> {
    const { paths } = await gymRunPathsCreate("smoke", undefined, options.artifactDirectory);
    const checks: Record<string, GymCloudBrowserCheck> = {};
    const check = (name: string, ok: boolean, detail: unknown) => {
        checks[name] = { ok, detail: typeof detail === "string" ? detail : JSON.stringify(detail) };
    };
    let fake: FakeHappyCloud | undefined;
    let site: ViteDevServer | undefined;
    let app: ElectronApplication | undefined;
    let networkId: string | undefined;
    let refusals: readonly HappyCloudBrowserRefusalRecord[] = [];
    let stats: HappyCloudBrowserStats | undefined;
    try {
        let target: CloudTarget;
        let compute: ComputeControl;
        if (options.fake) {
            fake = await fakeHappyCloudStart();
            site = await previewSiteStart(join(paths.root, "preview-site"));
            const cloud = fake;
            target = {
                serverUrl: cloud.url,
                token: cloud.token,
                workspaceId: "w-fake",
                agentId: "a-fake",
                pageUrl: viteBase(site),
            };
            compute = {
                offline: async () => cloud.computeOffline(),
                online: async () => cloud.computeAttach(),
                release: async () => cloud.computeRelease(),
                attach: async () => cloud.computeAttach(),
            };
        } else {
            target = await cloudTargetRead(options);
            compute = {
                ...(options.computeOffline
                    ? { offline: () => shell(options.computeOffline!) }
                    : {}),
                ...(options.computeOnline ? { online: () => shell(options.computeOnline!) } : {}),
                ...(options.computeRelease
                    ? { release: () => shell(options.computeRelease!) }
                    : {}),
                ...(options.computeAttach ? { attach: () => shell(options.computeAttach!) } : {}),
            };
        }

        const bundle = await harnessBundle(join(paths.root, "cloud-harness"));
        const entrypoint = electronEntrypointResolve(paths.workspaceRoot);
        app = await gymElectronLaunch({
            args: [
                `--user-data-dir=${paths.electronUserData}`,
                ...linuxHeadlessArguments(),
                bundle,
            ],
            cwd: paths.root,
            env: {
                PATH: process.env.PATH ?? "/usr/bin:/bin",
                HOME: paths.root,
                TMPDIR: process.env.TMPDIR ?? "/tmp",
                ...linuxDisplayEnvironment(),
                HAPPY_CLOUD_BROWSER_HARNESS: JSON.stringify({
                    serverUrl: target.serverUrl,
                    token: target.token,
                    workspaceId: target.workspaceId,
                    agentId: target.agentId,
                }),
            },
            executablePath: entrypoint.executable,
            timeout: 60_000,
        });
        const harness = harnessHandle(app);
        await harness.ready();

        const opened = await harness.call("profileOpen");
        networkId = opened.networkId;
        check("networkResolve", true, opened);
        check("route", opened.route.startsWith("PROXY 127.0.0.1:"), opened.route);

        const first = await pageLoad(harness, target.pageUrl);
        check("pageLoad", first.loaded, first);
        check("hotModuleReplacement", first.hmr, first.console);
        const afterLoad = await harness.call("stats");
        // A page loads over a few kept tunnels plus its WebSocket's, far
        // within the server's eight a person may have open.
        check("tunnelsWithinLimits", afterLoad.tunnelsOpened <= 8, afterLoad);
        await screenshot(app, join(paths.artifacts, "cloud-page.png"));

        if (compute.offline && compute.online) {
            const before = (await harness.call("refusals")).length;
            const wentAt = Date.now();
            await compute.offline();
            const heard = await refusalAwait(harness, before, "computeOffline", OFFLINE_WAIT_MS);
            check("offlineHeard", heard !== undefined, {
                after: heard ? heard.at - wentAt : undefined,
                refusal: heard,
            });
            // Asked for while away, the page is refused, and the refusal says why.
            const heardBefore = (await harness.call("refusals")).length;
            const away = await harness.call("load", target.pageUrl);
            const awayHeard = (await harness.call("refusals"))
                .slice(heardBefore)
                .find((record) => record.refusal === "computeOffline");
            check("offlinePageRefused", !away.ok && awayHeard !== undefined, {
                load: away,
                refusal: awayHeard,
            });

            const backAt = Date.now();
            await compute.online();
            const back = await loadUntil(harness, target.pageUrl, ONLINE_WAIT_MS);
            check("onlineReloaded", back.loaded, { ...back, after: Date.now() - backAt });
            check("onlineHotModuleReplacement", back.hmr, back.console);
        } else check("offlineHeard", true, "skipped: no offline/online commands");

        if (compute.release && compute.attach) {
            const before = (await harness.call("refusals")).length;
            await compute.release();
            const away = await loadUntilRefused(
                harness,
                target.pageUrl,
                before,
                "computeDetached",
                OFFLINE_WAIT_MS,
            );
            check("releasedHeard", away !== undefined, away ?? "no computeDetached refusal");
            await compute.attach();
            const back = await loadUntil(harness, target.pageUrl, ONLINE_WAIT_MS);
            check("attachedReloaded", back.loaded, back);
        }

        refusals = await harness.call("refusals");
        stats = await harness.call("stats");
        await gymElectronInvisibleAssert(app);
    } catch (error) {
        check("run", false, error instanceof Error ? (error.stack ?? error.message) : error);
    } finally {
        await app?.close().catch(() => undefined);
        await site?.close().catch(() => undefined);
        await fake?.close().catch(() => undefined);
    }
    const failures = Object.entries(checks)
        .filter(([, result]) => !result.ok)
        .map(([name]) => name);
    const result: GymCloudBrowserResult = {
        status: failures.length === 0 ? "passed" : "failed",
        root: paths.root,
        fake: options.fake === true,
        ...(networkId === undefined ? {} : { networkId }),
        checks,
        failures,
        refusals,
        ...(stats === undefined ? {} : { stats }),
    };
    await writeFile(
        join(paths.artifacts, "cloud-browser.json"),
        `${JSON.stringify(result, null, 2)}\n`,
    );
    return result;
}

interface CloudTarget {
    readonly serverUrl: string;
    readonly token: string;
    readonly workspaceId: string;
    readonly agentId: string;
    readonly pageUrl: string;
}

interface ComputeControl {
    readonly offline?: () => Promise<void>;
    readonly online?: () => Promise<void>;
    readonly release?: () => Promise<void>;
    readonly attach?: () => Promise<void>;
}

async function cloudTargetRead(options: GymCloudBrowserOptions): Promise<CloudTarget> {
    const missing = (["serverUrl", "workspaceId", "agentId", "pageUrl"] as const).filter(
        (name) => !options[name],
    );
    if (missing.length > 0) throw new Error(`Missing ${missing.join(", ")} for a real server.`);
    const serverUrl = new URL(options.serverUrl!).href;
    return {
        serverUrl,
        token: await tokenRead(options, serverUrl),
        workspaceId: options.workspaceId!,
        agentId: options.agentId!,
        pageUrl: options.pageUrl!,
    };
}

/**
 * The server's bearer: given outright, printed by a command, or issued by an
 * accounts service for the named server, as the app is issued one.
 */
async function tokenRead(options: GymCloudBrowserOptions, serverUrl: string): Promise<string> {
    const given = process.env.HAPPY_GYM_CLOUD_TOKEN?.trim();
    if (given) return given;
    if (options.tokenCommand) {
        const printed = (await shell(options.tokenCommand, true)).trim();
        if (!printed) throw new Error("The token command printed nothing.");
        return printed;
    }
    if (options.accountsUrl && options.serverName) {
        const login = process.env.HAPPY_GYM_CLOUD_LOGIN;
        const password = process.env.HAPPY_GYM_CLOUD_PASSWORD;
        if (!login || !password)
            throw new Error("HAPPY_GYM_CLOUD_LOGIN and HAPPY_GYM_CLOUD_PASSWORD are required.");
        const accounts = new URL(options.accountsUrl);
        const call = async (path: string, init: RequestInit) => {
            const response = await fetch(new URL(path, accounts), { ...init, redirect: "error" });
            const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
            if (!response.ok)
                throw new Error(
                    `The accounts service refused ${path} (${String(response.status)}).`,
                );
            return json;
        };
        const signedIn = await call("v1/auth/password", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ login, password }),
        });
        const account = signedIn.access_token;
        if (typeof account !== "string") throw new Error("The accounts service issued no token.");
        const authorization = { authorization: `Bearer ${account}`, accept: "application/json" };
        const listed = await call("v1/servers", { headers: authorization });
        const servers = Array.isArray(listed.servers) ? listed.servers : [];
        const server = servers.find(
            (each): each is { id: string } =>
                typeof each === "object" &&
                each !== null &&
                (each as { name?: unknown }).name === options.serverName &&
                typeof (each as { id?: unknown }).id === "string",
        );
        if (!server) throw new Error(`The account has no server named ${options.serverName}.`);
        const issued = await call(`v1/servers/${encodeURIComponent(server.id)}/token`, {
            method: "POST",
            headers: authorization,
        });
        if (typeof issued.access_token !== "string")
            throw new Error(`The accounts service issued no token for ${serverUrl}.`);
        return issued.access_token;
    }
    throw new Error(
        "No bearer: set HAPPY_GYM_CLOUD_TOKEN, --token-command, or --accounts-url with --server-name.",
    );
}

/** Runs one shell command, failing on a non-zero exit; resolves with what it printed. */
function shell(command: string, capture: true): Promise<string>;
function shell(command: string): Promise<void>;
function shell(command: string, capture = false): Promise<string | void> {
    return new Promise((resolvePromise, reject) => {
        const child = spawn("sh", ["-c", command], {
            stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
        });
        let printed = "";
        child.stdout?.on("data", (chunk: Buffer) => (printed += String(chunk)));
        child.once("error", reject);
        child.once("exit", (code) =>
            code === 0
                ? resolvePromise(capture ? printed : undefined)
                : reject(new Error(`\`${command}\` exited with ${String(code)}.`)),
        );
    });
}

/** Bundles the test-only harness with the app's own modules for Electron's main process. */
async function harnessBundle(outDir: string): Promise<string> {
    const electronPackage = resolve(import.meta.dirname, "../../../happy-desktop-electron");
    await mkdir(outDir, { recursive: true });
    await viteBuild({
        configFile: false,
        root: electronPackage,
        logLevel: "warn",
        publicDir: false,
        ssr: { noExternal: true },
        build: {
            ssr: join(electronPackage, "sources/testing/cloudBrowserHarness.ts"),
            outDir,
            emptyOutDir: true,
            minify: false,
            rollupOptions: {
                external: ["electron", "bufferutil", "utf-8-validate"],
                output: { format: "esm", entryFileNames: "harness.mjs" },
            },
        },
    });
    return join(outDir, "harness.mjs");
}

interface HarnessHandle {
    ready(): Promise<void>;
    call<K extends keyof HappyCloudBrowserHarness>(
        name: K,
        ...args: Parameters<HappyCloudBrowserHarness[K]>
    ): Promise<Awaited<ReturnType<HappyCloudBrowserHarness[K]>>>;
}

function harnessHandle(app: ElectronApplication): HarnessHandle {
    return {
        async ready() {
            const deadline = Date.now() + 30_000;
            while (Date.now() < deadline) {
                const ready = await app.evaluate(
                    () =>
                        (globalThis as { happyCloudBrowserHarness?: unknown })
                            .happyCloudBrowserHarness !== undefined,
                );
                if (ready) return;
                await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
            }
            throw new Error("The cloud browser harness never started.");
        },
        call: (name, ...args) =>
            app.evaluate(
                (_electron, [method, parameters]) => {
                    const harness = (
                        globalThis as unknown as {
                            happyCloudBrowserHarness: Record<
                                string,
                                (...values: unknown[]) => unknown
                            >;
                        }
                    ).happyCloudBrowserHarness;
                    return harness[method]!(...parameters);
                },
                [name, args] as [string, unknown[]],
            ) as never,
    };
}

interface PageLoaded {
    readonly loaded: boolean;
    readonly hmr: boolean;
    readonly load: HappyCloudBrowserLoad;
    readonly title?: unknown;
    readonly console: readonly string[];
}

/**
 * Loads the dev server's page and waits for its client to connect for hot
 * updates, which Vite reports in the console.
 */
async function pageLoad(harness: HarnessHandle, url: string): Promise<PageLoaded> {
    const before = (await harness.call("stats")).console.length;
    const load = await harness.call("load", url);
    if (!load.ok) return { loaded: false, hmr: false, load, console: [] };
    const deadline = Date.now() + 20_000;
    let lines: readonly string[] = [];
    while (Date.now() < deadline) {
        lines = (await harness.call("stats")).console.slice(before);
        if (lines.some((line) => line.includes("[vite] connected"))) break;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    const title = await harness.call("evaluate", "document.title").catch(() => undefined);
    const filled = await harness
        .call("evaluate", "document.body !== null && document.body.innerHTML.trim().length > 0")
        .catch(() => false);
    return {
        loaded: filled === true,
        hmr: lines.some((line) => line.includes("[vite] connected")),
        load,
        title,
        console: lines,
    };
}

async function loadUntil(harness: HarnessHandle, url: string, waitMs: number) {
    const deadline = Date.now() + waitMs;
    let last: PageLoaded | undefined;
    let attempts = 0;
    while (Date.now() < deadline) {
        attempts += 1;
        last = await pageLoad(harness, url);
        if (last.loaded) return { ...last, attempts };
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    }
    return { ...(last ?? { loaded: false, hmr: false, console: [] }), attempts };
}

async function refusalAwait(
    harness: HarnessHandle,
    before: number,
    refusal: HappyCloudBrowserRefusalRecord["refusal"],
    waitMs: number,
): Promise<HappyCloudBrowserRefusalRecord | undefined> {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
        const heard = (await harness.call("refusals"))
            .slice(before)
            .find((record) => record.refusal === refusal);
        if (heard) return heard;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
    return undefined;
}

/** Asks for the page until the server refuses it for compute, as a reader reloading would. */
async function loadUntilRefused(
    harness: HarnessHandle,
    url: string,
    before: number,
    refusal: HappyCloudBrowserRefusalRecord["refusal"],
    waitMs: number,
): Promise<HappyCloudBrowserRefusalRecord | undefined> {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
        await harness.call("load", url);
        const heard = (await harness.call("refusals"))
            .slice(before)
            .find((record) => record.refusal === refusal);
        if (heard) return heard;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
    }
    return undefined;
}

async function screenshot(app: ElectronApplication, path: string): Promise<void> {
    const page: Page | undefined = app.windows()[0];
    await page?.screenshot({ path }).catch(() => undefined);
}
