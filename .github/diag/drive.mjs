// Throwaway diagnostics for the Windows update repro (diag/windows-update-repro).
// Launches an installed Happy hidden, with its loopback CDP opt-in, walks the
// welcome deck the way a person would, and records every change to the
// onboarding, daemon and runtime snapshots until the Agent is ready or time runs out.
//
// node drive.mjs <label> <exe> <outDir> <minutes> [previewUpdates=on|off|keep]
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [label, exe, outDir, minutesText, previewUpdates = "keep"] = process.argv.slice(2);
const minutes = Number(minutesText);
mkdirSync(outDir, { recursive: true });
// A port of its own per launch: a port an earlier launch used may still be held.
const port = Number(process.env.DIAG_CDP_PORT ?? 9333);
const started = Date.now();
const stamp = () => `+${((Date.now() - started) / 1000).toFixed(1)}s`;
const log = (line) => {
    const text = `[${label} ${stamp()}] ${line}`;
    console.log(text);
    appendFileSync(join(outDir, `timeline-${label}.log`), `${text}\n`);
};

// A file rather than a pipe: the app outlives this driver and keeps writing.
const appLog = openSync(join(outDir, `app-${label}.log`), "a");
// `--debug` rather than HAPPY_DESKTOP_DEBUG, so the opt-in is not inherited
// by the Agent daemon Happy starts.
const child = spawn(exe, ["--debug"], {
    env: {
        ...process.env,
        DO_NOT_TRACK: "1",
        HAPPY_DEBUG_RENDERER_PORT: String(port),
        HAPPY_DESKTOP_WINDOWS_HIDDEN: "1",
    },
    stdio: ["ignore", appLog, appLog],
    detached: true,
});
child.unref();
child.on("exit", (code, signal) => log(`app exited code=${code} signal=${signal}`));
writeFileSync(join(outDir, `app-${label}.pid`), String(child.pid));
log(`launched ${exe} pid=${child.pid}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
for (let attempt = 0; attempt < 90 && !browser; attempt += 1) {
    try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5_000 });
    } catch {
        await sleep(1_000);
    }
}
if (!browser) {
    log("could not attach to the renderer CDP");
    process.exit(2);
}
log("attached to renderer CDP");

async function mainPage() {
    for (const context of browser.contexts())
        for (const page of context.pages()) {
            const ok = await page
                .evaluate(() => typeof window.happyDesktop === "object")
                .catch(() => false);
            if (ok) return page;
        }
    return undefined;
}

const read = () =>
    (async () => {
        const bridge = window.happyDesktop;
        const settle = (promise) =>
            promise.then(
                (value) => value,
                (error) => ({ readFailed: String(error?.message ?? error) }),
            );
        const [onboarding, daemon, runtime, config] = await Promise.all([
            settle(bridge.onboardingGet()),
            settle(bridge.daemonGet()),
            settle(bridge.runtimeGet()),
            settle(bridge.desktopConfigGet()),
        ]);
        const { versions: _versions, ...daemonShort } = daemon ?? {};
        return {
            onboarding: onboarding && {
                stage: onboarding.stage,
                busy: onboarding.busy,
                message: onboarding.message,
                download: onboarding.download,
            },
            daemon: daemonShort,
            runtime: runtime && {
                phase: runtime.phase,
                message: runtime.message,
                code: runtime.code,
                retrying: runtime.retrying,
                agent: runtime.activeTarget?.happyAgentVersion,
                update: runtime.update,
            },
            previewUpdatesEnabled: config?.previewUpdatesEnabled,
        };
    })();

let page;
let last = "";
let readyAt;
let previewSet = previewUpdates === "keep";
const deadline = started + minutes * 60_000;
while (Date.now() < deadline) {
    page = page && !page.isClosed() ? page : await mainPage();
    if (!page) {
        await sleep(1_000);
        continue;
    }
    if (!previewSet) {
        const want = previewUpdates === "on";
        const result = await page
            .evaluate(async (enabled) => {
                const current = await window.happyDesktop.desktopConfigGet();
                return window.happyDesktop.desktopConfigUpdate(current, {
                    ...current,
                    previewUpdatesEnabled: enabled,
                });
            }, want)
            .then(
                () => "ok",
                (error) => `failed: ${error.message}`,
            );
        log(`set previewUpdatesEnabled=${want}: ${result}`);
        previewSet = true;
    }
    for (const selector of [
        '[data-happy-desktop-ui="welcome-screen"] .happy-welcome-screen__action',
    ]) {
        const target = page.locator(selector).first();
        if ((await target.count().catch(() => 0)) > 0 && (await target.isVisible().catch(() => false))) {
            const text = (await target.innerText().catch(() => "")).trim();
            await target.click({ timeout: 3_000 }).catch(() => target.evaluate((el) => el.click()));
            log(`clicked welcome action "${text}"`);
        }
    }
    const snapshot = await page.evaluate(read).catch((error) => ({ evaluateFailed: error.message }));
    const json = JSON.stringify(snapshot);
    if (json !== last) {
        last = json;
        log(json);
    }
    const ready =
        snapshot.daemon?.installation === "installed" &&
        (snapshot.daemon?.runtime === "ready" || snapshot.runtime?.phase === "ready");
    if (ready && readyAt === undefined) {
        readyAt = Date.now();
        log("AGENT READY");
    }
    if (readyAt !== undefined && installUpdate === "1") {
        if (snapshot.runtime?.update?.status === "downloaded") {
            log(`Desktop update ${snapshot.runtime.update.availableVersion} downloaded; installing`);
            await page.screenshot({ path: join(outDir, `screen-${label}.png`) }).catch(() => undefined);
            await page.evaluate(() => window.happyDesktop.updateInstall()).catch((error) =>
                log(`updateInstall: ${error.message}`),
            );
            log("UPDATE INSTALL REQUESTED");
            appendFileSync(
                process.env.GITHUB_STEP_SUMMARY ?? join(outDir, "summary.md"),
                `\n### ${label}\nAgent ready, Desktop update installed through the updater.\n`,
            );
            process.exit(0);
        }
    } else if (readyAt !== undefined && Date.now() - readyAt > 15_000) break;
    await sleep(1_000);
}
if (readyAt === undefined) log(`NOT READY after ${minutes} min`);
if (page)
    await page
        .screenshot({ path: join(outDir, `screen-${label}.png` ) })
        .catch((error) => log(`screenshot failed: ${error.message}`));
const final = page ? await page.evaluate(read).catch(() => undefined) : undefined;
writeFileSync(join(outDir, `final-${label}.json`), JSON.stringify(final, null, 2));
const summary = {
    label,
    ready: readyAt !== undefined,
    stage: final?.onboarding?.stage,
    installation: final?.daemon?.installation,
    installedVersion: final?.daemon?.installedVersion,
    error: final?.daemon?.error,
    errorCode: final?.daemon?.errorCode,
    downloadFailure: final?.daemon?.downloadFailure,
    runtime: final?.runtime,
};
log(`SUMMARY ${JSON.stringify(summary)}`);
appendFileSync(process.env.GITHUB_STEP_SUMMARY ?? join(outDir, "summary.md"), `\n### ${label}\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
await browser.close().catch(() => undefined);
process.exit(0);
