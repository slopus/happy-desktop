import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gymElectronInvisibleAssert, gymElectronLaunch } from "./launch.js";
import { electronEntrypointResolve, workspaceRootResolve } from "./paths.js";

/**
 * Opens the released hosted renderer inside the real desktop app and checks
 * that it is the build Pages says is deployed:
 *
 *     pnpm --dir packages/happy-desktop-gym gym:electron:hosted-renderer [--out <dir>]
 *
 * It builds the host the way `build:local-shell` does (the `local-web` flavor,
 * pointed at https://local.app.happy.engineering) into its own folder, so the
 * development `dist` is untouched and nothing is shipped. The app is launched
 * hidden through `gymElectronLaunch`, with throwaway user data and home. The
 * renderer's build id is read from the bundle the window loaded, where the
 * release build embeds it, and compared with `local-web-version.json`; a
 * window that paints no text fails as blank. One screenshot is saved either way.
 */

const ORIGIN = "https://local.app.happy.engineering";
const BUILD_ID_PATTERN = /\d{4}\.\d+\.\d+(?:-preview\.\d+)?-[0-9a-f]{40}/gu;

interface Arguments {
    readonly out: string;
}

function argumentsRead(argv: readonly string[]): Arguments {
    const index = argv.indexOf("--out");
    const out = index >= 0 ? argv[index + 1] : undefined;
    return {
        out: out ?? join(workspaceRootResolve(), ".context", "gym-hosted-renderer"),
    };
}

function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv) {
    const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
    if (result.status !== 0)
        throw new Error(`${command} ${args.join(" ")} exited with ${result.status}.`);
}

/** The `build:local-shell` host, into `<electron>/release/gym-local-shell`. */
async function hostBuild(workspaceRoot: string): Promise<string> {
    const electron = join(workspaceRoot, "packages", "happy-desktop-electron");
    // Under the electron package, so the host's runtime dependencies resolve.
    const out = join(electron, "release", "gym-local-shell");
    const env = {
        ...process.env,
        HAPPY_DESKTOP_FLAVOR: "local-web",
        HAPPY_LOCAL_WEB_ORIGIN: ORIGIN,
    };
    await rm(out, { recursive: true, force: true });
    run(
        "pnpm",
        [
            "--dir",
            "../happy-desktop-ui",
            "exec",
            "vite",
            "build",
            "--config",
            "vite.artifact-code.config.ts",
            "--outDir",
            join(out, "artifact-code"),
            "--emptyOutDir",
        ],
        electron,
        env,
    );
    run(
        "pnpm",
        ["exec", "vite", "build", "--config", "vite.main.config.ts", "--outDir", out],
        electron,
        env,
    );
    run(
        "pnpm",
        ["exec", "vite", "build", "--config", "vite.preload.config.ts", "--outDir", out],
        electron,
        env,
    );
    return join(out, "main.js");
}

async function deployedBuildId(): Promise<string> {
    const response = await fetch(`${ORIGIN}/local-web-version.json?at=${Date.now()}`, {
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`local-web-version.json answered ${response.status}.`);
    const manifest = (await response.json()) as { buildId?: unknown };
    if (typeof manifest.buildId !== "string")
        throw new Error("local-web-version.json has no buildId.");
    return manifest.buildId;
}

async function main(): Promise<number> {
    const options = argumentsRead(process.argv.slice(2));
    const workspaceRoot = workspaceRootResolve();
    await mkdir(options.out, { recursive: true });
    const deployed = await deployedBuildId();
    const main = await hostBuild(workspaceRoot);
    const root = await mkdtemp(join(tmpdir(), "hdg-hosted-"));
    const home = join(root, "home");
    await mkdir(home, { recursive: true });
    const linux = process.platform === "linux";
    const app = await gymElectronLaunch({
        args: [
            `--user-data-dir=${join(root, "user-data")}`,
            // Chromium refuses to start as root without it, as on a CI runner.
            ...(linux && process.getuid?.() === 0 ? ["--no-sandbox"] : []),
            main,
        ],
        cwd: workspaceRoot,
        env: {
            HOME: home,
            HAPPY_HOME_DIR: join(home, ".happy"),
            PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
            TMPDIR: root,
            XDG_CONFIG_HOME: join(home, ".config"),
            XDG_CACHE_HOME: join(home, ".cache"),
            XDG_DATA_HOME: join(home, ".local", "share"),
            XDG_STATE_HOME: join(home, ".local", "state"),
            ...(linux
                ? Object.fromEntries(
                      ["DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR"]
                          .map((name) => [name, process.env[name] ?? ""])
                          .filter(([, value]) => value !== ""),
                  )
                : {}),
        },
        executablePath: electronEntrypointResolve(workspaceRoot).executable,
        timeout: 90_000,
    });
    try {
        const page = await app.firstWindow();
        await page.waitForLoadState("domcontentloaded");
        await gymElectronInvisibleAssert(app);
        const url = page.url();
        // The first paint of the shell, then whatever startup screen follows.
        await page
            .waitForFunction(() => (document.body?.innerText.trim().length ?? 0) > 0, undefined, {
                timeout: 60_000,
            })
            .catch(() => undefined);
        await page.waitForTimeout(3_000);
        const text = (await page.evaluate(() => document.body?.innerText ?? ""))
            .replace(/\s+/gu, " ")
            .trim();
        const screenshot = join(options.out, "hosted-renderer.png");
        await page.screenshot({ path: screenshot });
        // The release build embeds `<version>-<sha>` once in its entry module.
        const loaded = await page.evaluate(async (pattern) => {
            const script = document.querySelector<HTMLScriptElement>("script[type=module][src]");
            if (!script) return [];
            const source = await (await fetch(script.src, { cache: "force-cache" })).text();
            return [...new Set(source.match(new RegExp(pattern, "gu")) ?? [])];
        }, BUILD_ID_PATTERN.source);
        console.log(`window: ${url}`);
        console.log(`text: ${text.slice(0, 200) || "(none)"}`);
        console.log(`screenshot: ${screenshot}`);
        console.log(`buildId loaded=${loaded.join(",") || "(none)"} deployed=${deployed}`);
        if (!url.startsWith(ORIGIN)) {
            console.error(`The window loaded ${url}, not the hosted renderer.`);
            return 1;
        }
        if (text === "") {
            console.error("The window is blank.");
            return 1;
        }
        if (loaded.length !== 1 || loaded[0] !== deployed) {
            console.error("The loaded renderer is not the deployed build.");
            return 1;
        }
        return 0;
    } finally {
        await app.close().catch(() => undefined);
        await rm(root, { recursive: true, force: true });
    }
}

process.exitCode = await main();
