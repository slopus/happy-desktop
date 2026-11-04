import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import {
    testDepthBrowsers,
    testDepthRead,
} from "../packages/happy-desktop-gym/sources/testDepth.ts";
import { runInteractionFuzzStress } from "./run-interaction-fuzz-stress.mjs";

if (process.env.CI) {
    console.log("Skipping UI alignment tests in remote CI.");
    process.exit(0);
}

const depthFlags = process.argv.slice(2).filter((arg) => arg.startsWith("--depth="));
if (depthFlags.length > 1) throw new Error("Pass --depth only once.");
const depth = testDepthRead(depthFlags[0]?.slice(8) ?? process.env.HAPPY_TEST_DEPTH);
process.env.HAPPY_TEST_DEPTH = depth;
const browsers = testDepthBrowsers(depth);

function assertBrowserLaunchAllowed() {
    if (process.platform !== "darwin") {
        return;
    }

    // Playwright's browsers must register with macOS launchd and WindowServer.
    // A process launched under Seatbelt passes that sandbox to every child, and
    // the denied Mach registrations make Chromium, Firefox, and WebKit abort.
    // macOS then presents each abort as an "application quit unexpectedly"
    // dialog. Applying a harmless nested profile succeeds outside Seatbelt and
    // is rejected inside it, so use that as a no-browser preflight.
    const result = spawnSync(
        "/usr/bin/sandbox-exec",
        ["-p", "(version 1) (allow default)", "/usr/bin/true"],
        { stdio: "ignore" },
    );
    if (result.error?.code === "ENOENT" || (!result.error && result.status === 0)) {
        return;
    }

    console.error(`Refusing to launch Playwright browsers from inside a macOS sandbox.

Chromium, Firefox, and WebKit need Mach service access that an inherited
sandbox denies. Launching them here would make the browser processes abort and
macOS display native crash dialogs.

Rerun this command with unsandboxed/full-access execution. In Happy Agent, request
reviewed Full-access execution for the browser test command.`);
    process.exit(1);
}

function run(command, args) {
    if (process.platform === "win32" && command === "pnpm") {
        if (!process.env.npm_execpath) throw new Error("Run UI checks through pnpm.");
        args = [process.env.npm_execpath, ...args];
        command = process.execPath;
    }
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

assertBrowserLaunchAllowed();

const vitestArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--depth="));
const watchIndex = vitestArgs.indexOf("--watch");
const vitestMode = watchIndex === -1 ? ["run"] : ["--watch"];
if (watchIndex !== -1) {
    vitestArgs.splice(watchIndex, 1);
}

run("pnpm", ["exec", "playwright", "install", ...browsers]);
run("pnpm", ["exec", "vitest", ...vitestMode, ...vitestArgs]);

// Targeted unrelated files and watch mode do not start a twenty-round stress run.
const files = vitestArgs.filter((arg) => /\.(?:test\.)?[cm]?[jt]sx?$/.test(arg));
const includesFuzz =
    files.length === 0 || files.some((arg) => arg.includes("ConversationInteractionFuzz"));
if (
    depth === "full" &&
    watchIndex === -1 &&
    !vitestArgs.some((arg) => arg.startsWith("--testNamePattern=")) &&
    basename(process.cwd()) === "happy-desktop-ui" &&
    includesFuzz
) {
    const projects = vitestArgs.flatMap((arg, index) =>
        arg === "--project"
            ? [vitestArgs[index + 1]]
            : arg.startsWith("--project=")
              ? [arg.slice(10)]
              : [],
    );
    const selected = projects.length
        ? browsers.filter((browser) => projects.includes(browser))
        : browsers;
    const windows = process.platform === "win32";
    await runInteractionFuzzStress(
        windows ? process.execPath : "pnpm",
        windows ? [process.env.npm_execpath] : [],
        selected,
    );
}
