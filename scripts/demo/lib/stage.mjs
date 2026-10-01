import { execFile as execFileCallback, spawn } from "node:child_process";
import { chmod, copyFile, mkdir, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { deviceScaleFactor, viewport } from "./scene.mjs";
import { demoDaemonBaseline, overlayInstall, overlayOptions } from "./overlay.mjs";
import { offlineStageInstall } from "./offline-stage.mjs";

/*
 * Where the demo actually runs.
 *
 * The renderer is the one the Electron window loads, served by Vite in
 * browser-local mode so its dev bridge proxies to a real Happy Agent over that
 * agent's Unix socket. The browser holding it is headless: no window, no dock
 * tile, nothing the macOS window server knows about. That is the whole reason
 * this pipeline can run while someone is working — there is no screen capture
 * anywhere in it, so there is no screen to fight over.
 */

const workspace = resolve(import.meta.dirname, "../../..");
const execFile = promisify(execFileCallback);
const demoRoot = join(workspace, "scripts", "demo");

function pathWithin(parent, candidate) {
    const value = relative(resolve(parent), resolve(candidate));
    return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

/**
 * Materializes the full app under `.context`, then applies this take's literal
 * source patches there. Product source stays untouched: the mirror contains
 * the real workspace packages and uses the real dependency installation, but
 * it can replace any owned layer for one artifact without adding a permanent
 * demo branch to that layer.
 */
async function patchedSourcePrepare(patches, assets) {
    if (patches.length === 0 && assets.length === 0) return workspace;

    const mirror = join(workspace, ".context", "demo-app");
    const temporary = join(mirror, ".tmp");
    await mkdir(join(mirror, "packages"), { recursive: true });
    await mkdir(temporary, { recursive: true });
    for (const file of [
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "tsconfig.base.json",
        "tsconfig.json",
    ]) {
        await copyFile(join(workspace, file), join(mirror, file));
    }
    for (const name of [
        "happy-desktop-app",
        "happy-desktop-electron",
        "happy-desktop-gym",
        "happy-desktop-state",
        "happy-desktop-ui",
    ]) {
        const target = join(mirror, "packages", name);
        await mkdir(target, { recursive: true });
        await execFile(
            "/usr/bin/rsync",
            [
                "-a",
                "--delete",
                "--exclude",
                "coverage",
                "--exclude",
                "dist",
                "--exclude",
                "release",
                `${join(workspace, "packages", name)}/`,
                `${target}/`,
            ],
            { cwd: workspace },
        );
    }

    // Package-local pnpm links remain relative to the mirror. Their external
    // leaves resolve through this one read-only link to the real pnpm store.
    const modules = join(mirror, "node_modules");
    await rm(modules, { force: true, recursive: true });
    await symlink(join(workspace, "node_modules"), modules, "dir");

    for (const resource of patches) {
        const patch = resolve(resource.source);
        if (!pathWithin(demoRoot, patch))
            throw new Error(`A demo patch escapes scripts/demo: ${resource.label}`);
        await execFile(
            "/usr/bin/patch",
            ["--batch", "--forward", "--input", patch, "--strip", "1"],
            {
                cwd: mirror,
                env: {
                    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
                    TMPDIR: temporary,
                },
            },
        );
    }
    for (const asset of assets) {
        const source = resolve(asset.source);
        const target = resolve(mirror, asset.target);
        if (!pathWithin(demoRoot, source))
            throw new Error(`A demo asset escapes scripts/demo: ${asset.label}`);
        if (!pathWithin(mirror, target))
            throw new Error(`A demo asset target escapes the app mirror: ${asset.target}`);
        await mkdir(resolve(target, ".."), { recursive: true });
        await copyFile(source, target);
    }
    return mirror;
}

// Playwright belongs to the gym package, which is the only place in this
// workspace that drives a browser. Resolving it from there keeps the recorder a
// script rather than a reason to add a browser to the root install.
const gymRequire = createRequire(resolve(workspace, "packages/happy-desktop-gym/package.json"));

/** Starts Vite in browser-local mode and resolves once it has told us its URL. */
async function viteStart(options) {
    const renderer = join(options.source, "packages", "happy-desktop-electron");
    const processHome = join(workspace, ".context", "demo-vite-home");
    const processTemp = join(workspace, ".context", "demo-vite-tmp");
    await mkdir(processHome, { recursive: true, mode: 0o700 });
    await mkdir(processTemp, { recursive: true, mode: 0o700 });
    await chmod(processHome, 0o700);
    await chmod(processTemp, 0o700);
    const allowedDaemonKeys = [
        "HAPPY_HOME_DIR",
        "HAPPY_AGENT_SERVER_SOCKET_PATH",
        "HAPPY_AGENT_SERVER_TOKEN_PATH",
    ];
    const daemonEnvironment = Object.fromEntries(
        allowedDaemonKeys.flatMap((key) =>
            options.environment?.[key] === undefined ? [] : [[key, options.environment[key]]],
        ),
    );
    const unsupportedDaemonKeys = Object.keys(options.environment ?? {}).filter(
        (key) => !allowedDaemonKeys.includes(key),
    );
    if (unsupportedDaemonKeys.length > 0) {
        throw new Error(
            `Demo Vite environment contains unsupported keys: ${unsupportedDaemonKeys.join(", ")}`,
        );
    }
    // Resolve the installed tool directly. A package-manager shim can try to
    // bootstrap itself recursively when HOME is deliberately isolated.
    const rendererRequire = createRequire(join(renderer, "package.json"));
    const viteEntry = join(dirname(rendererRequire.resolve("vite/package.json")), "bin/vite.js");
    const child = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1"], {
        // Vite resolves absolute entry URLs such as
        // `/sources/renderer/renderer.tsx` against process.cwd(). Keep
        // that root explicit when the package lives in a disposable
        // mirror instead of relying on pnpm's project-selection flags.
        cwd: renderer,
        // Give this recorder-owned process tree its own group. Stopping a
        // take can then stop Vite and pnpm together instead of leaving the
        // grandchild holding the output pipes and loopback port open.
        detached: process.platform !== "win32",
        env: {
            // The Vite process serves a disposable recording mirror. Keep
            // ambient cloud, Git, SSH, and package credentials out of it;
            // only the exact daemon variables supplied by the gym/protocol
            // cross this boundary.
            PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
            HOME: processHome,
            TMPDIR: processTemp,
            LANG: process.env.LANG,
            LC_ALL: process.env.LC_ALL,
            TERM: process.env.TERM,
            CI: process.env.CI,
            FORCE_COLOR: "0",
            // Names one exact daemon — the gym's — so the dev bridge can
            // never fall back to the user's own Happy Agent.
            ...daemonEnvironment,
            // The mirror links to the workspace's existing pnpm install.
            // Its literal Vite patch admits exactly that dependency root
            // while keeping the rest of Vite's filesystem guard enabled.
            HAPPY_DEMO_DEPENDENCY_ROOT: join(workspace, "node_modules"),
            VITE_HAPPY_BROWSER_LOCAL: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const log = [];
    let url;
    try {
        url = await new Promise((settle, fail) => {
            const timer = setTimeout(
                () => fail(new Error(`Vite did not come up in time.\n${log.join("")}`)),
                240_000,
            );
            const read = (chunk) => {
                const text = String(chunk);
                log.push(text);
                if (options.verbose) process.stderr.write(text);
                // Vite colours its own banner regardless of FORCE_COLOR, and it puts
                // the escape codes *inside* the URL, around the port.
                // oxlint-disable-next-line no-control-regex -- ANSI SGR starts with the ESC control character.
                const plain = text.replace(/\u001B\[[0-9;]*m/gu, "");
                const found = /(http:\/\/127\.0\.0\.1:\d+)\//u.exec(plain);
                if (!found) return;
                clearTimeout(timer);
                settle(found[1]);
            };
            child.stdout.on("data", read);
            child.stderr.on("data", read);
            child.once("error", (error) => {
                clearTimeout(timer);
                fail(error);
            });
            child.once("exit", (code) => {
                clearTimeout(timer);
                fail(new Error(`Vite exited with ${code} before serving.\n${log.join("")}`));
            });
        });
    } catch (error) {
        // A failed startup has no stage handle whose close() could own cleanup.
        await processTreeStop(child);
        throw error;
    }
    return { child, url };
}

function processTreeSignal(child, signal) {
    if (child.pid === undefined) return;
    try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
    } catch (error) {
        if (error?.code !== "ESRCH") throw error;
    }
}

async function processTreeStop(child) {
    // Never signal a numeric group from an already-exited child handle.
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((settle) => {
        const timer = setTimeout(() => processTreeSignal(child, "SIGKILL"), 4000);
        child.once("exit", () => {
            clearTimeout(timer);
            settle();
        });
        processTreeSignal(child, "SIGTERM");
    });
}

/**
 * Boots the app and hands back the page a director can drive.
 *
 * One stage serves consecutive demos with the same literal patch set. The
 * recorder closes it and materializes a new app when that set changes, so no
 * take inherits another take's source even when `--all` records one session.
 */
export async function stageOpen(options) {
    if (
        options.staticDirectory &&
        ((options.patches?.length ?? 0) || (options.assets?.length ?? 0))
    )
        throw new Error(
            "A built-product take cannot apply recording-only source patches or replacement assets.",
        );
    const { chromium } = gymRequire("playwright");
    const source =
        options.url || options.staticDirectory
            ? workspace
            : await patchedSourcePrepare(options.patches ?? [], options.assets ?? []);
    const vite =
        options.url || options.staticDirectory
            ? undefined
            : await viteStart({ ...options, source });
    let url = options.url ?? vite?.url;

    let browser;
    let context;
    let offline;
    try {
        browser = await chromium.launch({
            args: [
                // Native Metal keeps the recorder's Lottie/WebGL motion fluid on
                // macOS. Other hosts retain the working software WebGL backend.
                ...(process.platform === "darwin"
                    ? ["--use-gl=angle", "--use-angle=metal"]
                    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
                // Set the compositor's physical scale as well as the context DPR;
                // otherwise CDP screencasting silently emits CSS-sized frames.
                `--force-device-scale-factor=${deviceScaleFactor}`,
                "--hide-scrollbars",
                "--mute-audio",
                "--force-color-profile=srgb",
                "--font-render-hinting=none",
                // Deterministic frames matter more than throughput here: without
                // this the compositor can hand back a frame that the last DOM write
                // has not landed in yet.
                "--disable-lcd-text",
            ],
            headless: true,
        });
        context = await browser.newContext({
            colorScheme: options.appearance,
            deviceScaleFactor,
            locale: "en-US",
            reducedMotion: "no-preference",
            timezoneId: "America/Los_Angeles",
            viewport,
            ...(options.staticDirectory ? { offline: true, serviceWorkers: "block" } : {}),
        });
        if (options.staticDirectory) {
            if (!options.gym)
                throw new Error("A full-product offline stage needs its isolated native gym.");
            const effort = options.gym.nativeEffort;
            if (!effort)
                throw new Error("The native stage needs the scenario's explicit reasoning effort.");
            offline = await offlineStageInstall({
                context,
                directory: options.staticDirectory,
                socketPath: options.gym.paths.socketPath,
                tokenPath: options.gym.paths.tokenPath,
                healthRead: () => options.gym.client.getHealth(),
                desktopConfig: {
                    appearance: options.appearance,
                    defaultEffort: effort,
                    defaultPermissionMode: "auto",
                    defaultModel: {
                        providerId: "codex",
                        modelId: "openai/gpt-6-astra",
                        effort,
                    },
                    lastPickedModel: { providerId: "codex", modelId: "openai/gpt-6-astra" },
                    modelPreferences: [
                        {
                            providerId: "codex",
                            modelId: "openai/gpt-6-astra",
                            lastEffort: effort,
                            lastSpeed: "standard",
                        },
                    ],
                    scrollbarVisibility: "automatic",
                    version: 1,
                },
            });
            url = offline.url;
        }
        await context.addInitScript(overlayInstall, {
            ...overlayOptions(options.appearance),
            daemon: demoDaemonBaseline,
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => {
            if (options.verbose) process.stderr.write(`  page error: ${error.message}\n`);
        });
        await page.goto(url, { timeout: 180_000, waitUntil: "domcontentloaded" });

        return {
            page,
            source,
            url,
            async close() {
                offline?.close();
                await context.close().catch(() => undefined);
                await browser.close().catch(() => undefined);
                if (vite) await processTreeStop(vite.child);
            },
            /** Returns the page to a known state between demos in one session. */
            async reset() {
                await page.evaluate(() => {
                    window.location.hash = "#/";
                });
                await page.waitForTimeout(400);
            },
        };
    } catch (error) {
        offline?.close();
        await context?.close().catch(() => undefined);
        await browser?.close().catch(() => undefined);
        if (vite) await processTreeStop(vite.child);
        throw error;
    }
}
