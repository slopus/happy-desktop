// Throwaway diagnostics for the Windows update repro (diag/windows-update-repro).
// Launches an installed Happy hidden, with its loopback CDP opt-in, walks the
// welcome deck the way a person would, and records every change to the
// onboarding, daemon and runtime snapshots.
//
// node drive.mjs <label> <exe> <outDir> <minutes>
//   DIAG_CDP_PORT   renderer CDP port for this launch
//   DIAG_PREVIEW    keep | on (at once) | on-after-ready (as a person would, once set up)
//   DIAG_UNTIL      ready             stop 15 s after the Agent is ready
//                   deadline          watch until <minutes> runs out
//                   update-downloaded after ready, wait for the Desktop update and install it
//                   agent-downloading after ready, return once an Agent download is under way
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [label, exe, outDir, minutesText] = process.argv.slice(2);
const minutes = Number(minutesText);
const previewUpdates = process.env.DIAG_PREVIEW ?? "keep";
const until = process.env.DIAG_UNTIL ?? "ready";
mkdirSync(outDir, { recursive: true });
// A port of its own per launch: a port an earlier launch used may still be held.
const port = Number(process.env.DIAG_CDP_PORT ?? 9333);
const started = Date.now();
const stamp = () => `+${((Date.now() - started) / 1000).toFixed(1)}s`;
const summaryPath = process.env.GITHUB_STEP_SUMMARY ?? join(outDir, "summary.md");
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
log(`launched ${exe} pid=${child.pid} preview=${previewUpdates} until=${until}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
for (let attempt = 0; attempt < 60 && !browser; attempt += 1) {
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
        const update = runtime?.update && {
            status: runtime.update.status,
            availableVersion: runtime.update.availableVersion,
            message: runtime.update.message?.slice(0, 80),
        };
        return {
            onboarding: onboarding && {
                stage: onboarding.stage,
                busy: onboarding.busy,
                message: onboarding.message,
                reachedStage: onboarding.reachedStage,
            },
            daemon: daemonShort,
            runtime: runtime && {
                phase: runtime.phase,
                message: runtime.message,
                code: runtime.code,
                retrying: runtime.retrying,
                agent: runtime.activeTarget?.happyAgentVersion,
                update,
            },
            previewUpdatesEnabled: config?.previewUpdatesEnabled,
        };
    })();

// Download progress changes every chunk; compare without it.
const comparable = (snapshot) =>
    JSON.stringify(snapshot, (key, value) =>
        key === "download" && value && typeof value === "object"
            ? `${Math.floor((value.receivedBytes / Math.max(1, value.totalBytes)) * 10) * 10}%`
            : value,
    );

async function previewSet(page, enabled) {
    const result = await page
        .evaluate(async (want) => {
            const current = await window.happyDesktop.desktopConfigGet();
            return window.happyDesktop.desktopConfigUpdate(current, {
                ...current,
                previewUpdatesEnabled: want,
            });
        }, enabled)
        .then(
            () => "ok",
            (error) => `failed: ${error.message}`,
        );
    log(`set previewUpdatesEnabled=${enabled}: ${result}`);
}

let page;
let last = "";
let readyAt;
let previewDone = previewUpdates === "keep";
let outcome = "deadline";
const deadline = started + minutes * 60_000;
while (Date.now() < deadline) {
    page = page && !page.isClosed() ? page : await mainPage();
    if (!page) {
        await sleep(1_000);
        continue;
    }
    if (!previewDone && previewUpdates === "on") {
        await previewSet(page, true);
        previewDone = true;
    }
    const welcome = page
        .locator('[data-happy-desktop-ui="welcome-screen"] .happy-welcome-screen__action')
        .first();
    if ((await welcome.count().catch(() => 0)) > 0 && (await welcome.isVisible().catch(() => false))) {
        const text = (await welcome.innerText().catch(() => "")).trim();
        await welcome.click({ timeout: 3_000 }).catch(() => welcome.evaluate((el) => el.click()));
        log(`clicked welcome action "${text}"`);
    }
    const snapshot = await page.evaluate(read).catch((error) => ({ evaluateFailed: error.message }));
    const json = comparable(snapshot);
    if (json !== last) {
        last = json;
        log(JSON.stringify(snapshot));
    }
    const ready =
        snapshot.daemon?.installation === "installed" &&
        (snapshot.daemon?.runtime === "ready" || snapshot.runtime?.phase === "ready");
    if (ready && readyAt === undefined) {
        readyAt = Date.now();
        log("AGENT READY");
    }
    if (readyAt !== undefined && !previewDone && previewUpdates === "on-after-ready") {
        await sleep(5_000);
        await previewSet(page, true);
        previewDone = true;
    }
    if (readyAt !== undefined && until === "ready" && Date.now() - readyAt > 15_000) {
        outcome = "ready";
        break;
    }
    if (readyAt !== undefined && previewDone && until === "agent-downloading") {
        if (snapshot.daemon?.operation === "downloading" && snapshot.daemon?.download?.receivedBytes > 0) {
            log("AGENT DOWNLOAD UNDER WAY");
            outcome = "agent-downloading";
            break;
        }
    }
    if (readyAt !== undefined && previewDone && until === "update-downloaded") {
        if (snapshot.runtime?.update?.status === "downloaded") {
            log(`Desktop update ${snapshot.runtime.update.availableVersion} downloaded; installing`);
            await page.evaluate(() => window.happyDesktop.updateInstall()).catch((error) =>
                log(`updateInstall: ${error.message}`),
            );
            log("UPDATE INSTALL REQUESTED");
            outcome = "update-installing";
            break;
        }
    }
    await sleep(1_000);
}
if (readyAt === undefined) log(`NOT READY after ${minutes} min`);
let final;
if (outcome !== "update-installing" && page) {
    await page
        .screenshot({ path: join(outDir, `screen-${label}.png`) })
        .catch((error) => log(`screenshot failed: ${error.message}`));
    final = await page.evaluate(read).catch(() => undefined);
    writeFileSync(join(outDir, `final-${label}.json`), JSON.stringify(final, null, 2));
}
const summary = {
    label,
    outcome,
    ready: readyAt !== undefined,
    stage: final?.onboarding?.stage,
    installation: final?.daemon?.installation,
    installedVersion: final?.daemon?.installedVersion,
    readyVersion: final?.daemon?.readyVersion,
    operation: final?.daemon?.operation,
    error: final?.daemon?.error,
    errorCode: final?.daemon?.errorCode,
    downloadFailure: final?.daemon?.downloadFailure,
    runtime: final?.runtime && { phase: final.runtime.phase, agent: final.runtime.agent },
};
log(`SUMMARY ${JSON.stringify(summary)}`);
appendFileSync(summaryPath, `\n### ${label}\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
await browser.close().catch(() => undefined);
process.exit(outcome === "deadline" && until !== "deadline" ? 3 : 0);
