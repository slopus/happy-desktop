import { execFile as execFileCallback, spawn } from "node:child_process";
import { copyFile, mkdir, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { deviceScaleFactor, viewport } from "./scene.mjs";
import { demoDaemonBaseline, overlayInstall, overlayOptions } from "./overlay.mjs";

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
            { cwd: mirror, env: { ...process.env, TMPDIR: temporary } },
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
    const child = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1"], {
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
            ...process.env,
            FORCE_COLOR: "0",
            // Names one exact daemon — the gym's — so the dev bridge can
            // never fall back to the user's own Happy Agent.
            ...options.environment,
            // The mirror links to the workspace's existing pnpm install.
            // Its literal Vite patch admits exactly that dependency root
            // while keeping the rest of Vite's filesystem guard enabled.
            HAPPY_DEMO_DEPENDENCY_ROOT: join(workspace, "node_modules"),
            VITE_HAPPY_BROWSER_LOCAL: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const log = [];
    const url = await new Promise((settle, fail) => {
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
        child.once("exit", (code) => {
            clearTimeout(timer);
            fail(new Error(`Vite exited with ${code} before serving.\n${log.join("")}`));
        });
    });
    return { child, url };
}

function processTreeSignal(child, signal) {
    try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
    } catch (error) {
        if (error?.code !== "ESRCH") throw error;
    }
}

/**
 * Boots the app and hands back the page a director can drive.
 *
 * One stage serves consecutive demos with the same literal patch set. The
 * recorder closes it and materializes a new app when that set changes, so no
 * take inherits another take's source even when `--all` records one session.
 */
export async function stageOpen(options) {
    const { chromium } = gymRequire("playwright");
    const source = options.url
        ? workspace
        : await patchedSourcePrepare(options.patches ?? [], options.assets ?? []);
    const vite = options.url ? undefined : await viteStart({ ...options, source });
    const url = options.url ?? vite.url;

    const browser = await chromium.launch({
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
    const context = await browser.newContext({
        colorScheme: options.appearance,
        deviceScaleFactor,
        locale: "en-US",
        reducedMotion: "no-preference",
        timezoneId: "America/Los_Angeles",
        viewport,
    });
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
            await context.close().catch(() => undefined);
            await browser.close().catch(() => undefined);
            if (vite) {
                processTreeSignal(vite.child, "SIGTERM");
                await new Promise((settle) => {
                    const timer = setTimeout(() => {
                        processTreeSignal(vite.child, "SIGKILL");
                        settle();
                    }, 4000);
                    vite.child.once("exit", () => {
                        clearTimeout(timer);
                        settle();
                    });
                });
            }
        },
        /** Returns the page to a known state between demos in one session. */
        async reset() {
            await page.evaluate(() => {
                window.location.hash = "#/";
            });
            await page.waitForTimeout(400);
        },
    };
}
