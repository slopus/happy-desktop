import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * The flagship update story.
 *
 * The updater envelope is scripted because a browser has no Electron updater.
 * Everything below it is live: a real multi-tool turn, a real sticky daemon
 * drain, a real stop/start under a new PID, durable continuation after reconnect,
 * and the actual sticker attachment supplied by this demo's literal renderer
 * patch.
 */

const prompt =
    "Do it — add the rocket-dino sticker to What’s New, wire the real image, and show me what you picked.";
const firstToolCommand = "node scripts/inspect-whats-new.mjs";
const secondToolCommand = "node scripts/install-whats-new-sticker.mjs";
const version = "0.4.63";
const openingOne = "F***. My agent stopped because of a Claude update.";
const openingTwo = "Never with Happy.";
const closingCard = "Updates don't phase your agent — if it's Happy.";

let evidence;

function daemonSnapshot(overrides = {}) {
    return {
        install: { phase: "idle" },
        installation: "installed",
        installedVersion: "0.4.62",
        managed: true,
        operation: "idle",
        runtime: "ready",
        updateAvailable: false,
        versions: [],
        ...overrides,
    };
}

function waitingCount(waitingFor) {
    return waitingFor.reduce((total, component) => total + component.count, 0);
}

function agentStage(health, agentId) {
    for (const component of health.drainWaitingFor ?? []) {
        const found = component.agents?.find((agent) => agent.id === agentId);
        if (found) return found.stage;
    }
    return undefined;
}

function installSnapshot(health, waitingPeak) {
    const waitingFor = health.drainWaitingFor ?? [];
    return daemonSnapshot({
        availableVersion: version,
        install: {
            killable: false,
            phase: "draining",
            reason: "install",
            version,
            waitingFor,
            waitingPeak: Math.max(waitingPeak, waitingCount(waitingFor)),
        },
        operation: "upgrading",
        readyVersion: version,
        updateAvailable: true,
    });
}

/** Polls a live fact while the director films the wall-clock wait around it. */
async function liveUntil(demo, read, timeoutMs, message, after = 320) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() >= deadline) throw new Error(message);
        await demo.settle(undefined, { after, timeout: Math.max(1_000, deadline - Date.now()) });
    }
}

/** Waits on a real daemon/reconnect promise without dropping its elapsed video time. */
async function livePromiseWait(demo, promise, timeoutMs, message) {
    let state = "pending";
    let failure;
    void promise.then(
        () => {
            state = "fulfilled";
        },
        (error) => {
            failure = error;
            state = "rejected";
        },
    );
    const deadline = Date.now() + timeoutMs;
    while (state === "pending") {
        if (Date.now() >= deadline) throw new Error(message);
        await demo.settle(undefined, {
            after: 320,
            timeout: Math.max(1_000, deadline - Date.now()),
        });
    }
    if (state === "rejected") throw failure;
    return await promise;
}

async function liveRunIdWait(demo, client, agentId, knownIds, timeoutMs = 30_000) {
    return await liveUntil(
        demo,
        async () => {
            const history = await client.getMessages(agentId, { limit: 48 });
            return history.runs.find((run) => !knownIds.has(run.id))?.id;
        },
        timeoutMs,
        "The What’s New turn never appeared in the live session.",
        260,
    );
}

async function liveRunComplete(demo, client, agentId, runId, timeoutMs = 45_000) {
    return await liveUntil(
        demo,
        async () => {
            const history = await client.getMessages(agentId, { limit: 48 });
            const run = history.runs.find((candidate) => candidate.id === runId);
            if (run?.status === "failed" || run?.status === "aborted") {
                throw new Error(`The What’s New run ended ${run.status}.`);
            }
            return run?.status === "completed" ? history : undefined;
        },
        timeoutMs,
        "The What’s New run did not settle after the daemon restart.",
        340,
    );
}

function durationRead(label) {
    const match = /(?:(\d+)h\s*)?(?:(\d+)m\s*)?(\d+)s/u.exec(label);
    if (!match) return undefined;
    return (
        (Number(match[1] ?? 0) * 60 * 60 + Number(match[2] ?? 0) * 60 + Number(match[3])) * 1_000
    );
}

function clockRead(page) {
    return page.evaluate(() => window.__happyDemo.clockSnapshot());
}

export default {
    assets: [
        {
            source: "assets/rocket-dino.png",
            target: "packages/happy-desktop-electron/public/__happy_demo/rocket-dino.png",
        },
    ],
    id: "resume",
    patches: [
        { scope: "shared", source: "browser-daemon.patch" },
        { scope: "demo", source: "patches/sticker.patch" },
    ],
    subtitle: "The update waits while the same turn keeps using tools",
    title: "Update without stopping the work",

    async run(demo, gym) {
        const agentId = gym.world.sessions.find(
            (session) => session.id === "whats-new-sticker",
        )?.agentId;
        if (!agentId) throw new Error("The demo gym has no What’s New sticker session.");

        evidence = {
            agentId,
            clockSamples: [],
            drainStages: new Set(),
            installSurfaceSeen: false,
            restart: undefined,
            runId: undefined,
            waitingPeak: 0,
        };
        let inferenceReleased = false;

        const sampleClock = async (label) => {
            const clock = await clockRead(demo.page);
            evidence.clockSamples.push({
                frames: demo.timing.frames,
                label,
                ...clock,
            });
        };

        try {
            // Navigate before the first captured frame. The cards are followed
            // by a real selected conversation inside the fully dressed project
            // tree, not a title over a blank browser page.
            await demo.settle('[data-happy-desktop-ui="sidebar"]', { after: 2_200 });
            await demo.page.getByText("happy-desktop", { exact: true }).first().click();
            await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 1_300 });
            await demo.page
                .getByText("Add a sticker to What’s New", { exact: true })
                .first()
                .click();
            await demo.settle(undefined, { after: 1_100 });

            await demo.card(openingOne, { hold: 3_100 });
            await demo.card(openingTwo, { hold: 2_700 });
            await demo.card(undefined);
            await demo.settle(undefined, { after: 900 });
            // The conversation establishes the context. No caption explaining
            // our fixture dressing to the audience, and no detour into sidebar
            // details before the viewer has seen the work they care about.
            await demo.hold(1_100);

            const before = await gym.client.getMessages(agentId, { limit: 48 });
            const knownRunIds = new Set(before.runs.map((run) => run.id));
            // This gate stays armed through the drain, process stop, and cold
            // boot. The post-tool inference is the durable edge the new daemon
            // will resume; releasing it before restart would falsify the story.
            const postToolInference = gym.inferenceHold(agentId);

            await demo.zoomTo('[data-happy-desktop-ui="composer"]', {
                level: 1.34,
                duration: 780,
            });
            await demo.click('[data-happy-desktop-ui="composer-textarea"]', { after: 220 });
            await demo.pointerVisible(false);
            evidence.typingStartedFrame = demo.timing.frames;
            await demo.type(prompt.slice(0, 8), { perKey: 104, after: 0 });
            evidence.fastTypingStartedFrame = demo.timing.frames;
            await demo.type(prompt.slice(8), { perKey: 104, speed: 3, after: 0 });
            evidence.fastTypingEndedFrame = demo.timing.frames;
            // The 3× badge is gone before this reading beat. Pull back while
            // the completed prompt is still unsent, then film all inference live.
            await demo.hold(1_250);
            await demo.zoomOut({ duration: 760 });
            await demo.hold(300);
            evidence.promptSentFrame = demo.timing.frames;
            demo.sound("chime");
            await demo.press("Enter", { before: 0, after: 0 });

            await demo.settle({ text: "Thinking", exact: true }, { after: 400, timeout: 15_000 });
            evidence.thinkingVisibleFrame = demo.timing.frames;

            evidence.runId = await liveRunIdWait(demo, gym.client, agentId, knownRunIds);
            const firstTool = demo.page.getByText(firstToolCommand, { exact: false });
            await demo.settle(firstTool, { after: 650, timeout: 30_000 });
            evidence.firstToolVisible = true;

            // The update arrives while the first real fixture script is still
            // sleeping. The ready panel is opened and its real Install button
            // is clicked before the daemon drain begins.
            await demo.daemonPublish(
                daemonSnapshot({
                    availableVersion: version,
                    download: { receivedBytes: 2_100_000, totalBytes: 12_800_000 },
                    message: "Downloading · 2.1 of 12.8 MB",
                    operation: "downloading",
                    updateAvailable: true,
                }),
            );
            await demo.caption("Of course. An update, right in the middle of this.");
            await demo.zoomTo('[data-happy-desktop-ui="sidebar-update-action-trigger"]', {
                level: 1.5,
                duration: 920,
            });
            await demo.hold(720);
            await demo.click('[data-happy-desktop-ui="sidebar-update-action-trigger"]', {
                after: 220,
            });
            await demo.zoomTo('[data-happy-desktop-ui="sidebar-update-action-panel"]', {
                level: 1.3,
                duration: 780,
            });
            await demo.hold(950);
            await demo.daemonPublish(
                daemonSnapshot({
                    availableVersion: version,
                    readyVersion: version,
                    updateAvailable: true,
                }),
            );
            await demo.caption("Go ahead. Your work is safe.");
            const install = demo.page
                .locator('[data-happy-desktop-ui="sidebar-update-action-panel"]')
                .getByRole("menuitem", { name: "Install" });
            await demo.settle(install, { after: 520, timeout: 30_000 });
            // Install replaces the small menu with a full-window scene. Pull
            // back BEFORE that transition so the slug is never cropped, even
            // on its first frame. Keep this full-window shot through reconnect.
            await demo.zoomOut({ duration: 760 });
            await demo.click(install, { after: 180 });
            await demo.pointerVisible(false);
            evidence.installClickedAt = Date.now();

            // This is the actual sticky daemon drain. Do not release the model
            // gate: after Tool 1 commits, AgentBase sees the drain and stops at
            // that safe durable edge instead of starting Tool 2.
            const drainStarted = gym.daemonDrainBegin();
            const drainingHealth = await liveUntil(
                demo,
                async () => {
                    const health = await gym.daemonHealth();
                    return agentStage(health, agentId) === "tools" ? health : undefined;
                },
                20_000,
                "The real daemon did not report the first tool during the install drain.",
                260,
            );
            evidence.installClickedWhileTool = true;
            await demo.daemonPublish(installSnapshot(drainingHealth, evidence.waitingPeak));
            await demo.settle('[data-testid="agent-install-screen"]', {
                after: 650,
                timeout: 30_000,
            });
            evidence.installSurfaceSeen = true;
            await demo.caption("It waits for your tool to finish.");
            // Lottie renders on its own worker clock, not the page's rAF clock.
            // Film this wait in wall time so the full play is never accelerated
            // by the cost of capturing individual frames.
            const slugStart = demo.timing.frames;
            await demo.settle(undefined, { after: 3_600 });
            evidence.slugCapture = demo.captureSummary(slugStart);
            await writeFile(
                join(gym.paths.projects, "happy-desktop", ".demo", "inspect-release"),
                "release\n",
                "utf8",
            );

            let lastStage;
            const drainDeadline = Date.now() + 45_000;
            for (;;) {
                const health = await gym.daemonHealth();
                const waitingFor = health.drainWaitingFor ?? [];
                evidence.waitingPeak = Math.max(evidence.waitingPeak, waitingCount(waitingFor));
                const stage = agentStage(health, agentId);
                if (stage) evidence.drainStages.add(stage);
                if (stage !== lastStage) {
                    lastStage = stage;
                    await demo.daemonPublish(installSnapshot(health, evidence.waitingPeak));
                    if (stage === "tools") {
                        await demo.caption("It waits for your tool to finish.");
                    } else if (stage === undefined && evidence.drainStages.has("tools")) {
                        await demo.caption("Then takes care of the restart.");
                    }
                }
                if (waitingFor.length === 0 && evidence.drainStages.has("tools")) break;
                if (Date.now() >= drainDeadline)
                    throw new Error("The real daemon drain did not reach its durable edge.");
                await demo.settle(undefined, {
                    after: stage === "tools" ? 620 : 360,
                    timeout: Math.max(1_000, drainDeadline - Date.now()),
                });
            }
            await drainStarted;
            evidence.drainCompleted = true;
            const beforeRestart = await gym.client.getMessages(agentId, { limit: 48 });
            const beforeRestartRun = beforeRestart.runs.find((run) => run.id === evidence.runId);
            evidence.preRestartRunStatus = beforeRestartRun?.status;
            evidence.preRestartSecondTool =
                JSON.stringify(beforeRestart).includes(secondToolCommand);
            if (evidence.preRestartRunStatus === "completed")
                throw new Error("The run settled before the daemon restarted.");
            if (evidence.preRestartSecondTool)
                throw new Error("Tool 2 started before the daemon restart.");

            await demo.daemonPublish(
                installSnapshot({ drainWaitingFor: [] }, evidence.waitingPeak),
            );
            await demo.caption("Then takes care of the restart.");
            await demo.settle(undefined, { after: 650 });

            await demo.daemonPublish(
                daemonSnapshot({
                    availableVersion: version,
                    install: {
                        killed: false,
                        phase: "stopping",
                        reason: "install",
                        version,
                    },
                    operation: "upgrading",
                    readyVersion: version,
                    runtime: "stopped",
                    updateAvailable: true,
                }),
            );
            const restarting = gym.daemonRestart();
            await demo.settle(undefined, { after: 1_350 });
            await demo.daemonPublish(
                daemonSnapshot({
                    availableVersion: version,
                    install: { phase: "starting", reason: "install", version },
                    operation: "upgrading",
                    readyVersion: version,
                    runtime: "starting",
                    updateAvailable: true,
                }),
            );
            evidence.restart = await livePromiseWait(
                demo,
                restarting,
                45_000,
                "The real Happy Agent did not restart in time.",
            );
            evidence.restartCompletedAt = Date.now();
            await demo.daemonPublish(
                daemonSnapshot({
                    install: { phase: "reconnecting", reason: "install", version },
                    installedVersion: version,
                    operation: "upgrading",
                    runtime: "ready",
                }),
            );
            await demo.caption(undefined);
            await demo.settle(undefined, { after: 700 });

            // Current Happy retains the app during a local restart and reveals
            // it once its connection has reconciled. Film that production path;
            // do not force the old cold-boot behavior into the latest renderer.
            await demo.daemonPublish(
                daemonSnapshot({ installedVersion: version, runtime: "ready" }),
            );
            await demo.settle('[data-happy-desktop-ui="app-shell"]', {
                after: 0,
                timeout: 60_000,
            });
            await demo.settle('[data-happy-desktop-ui="conversation-view"]', {
                after: 0,
                timeout: 60_000,
            });
            evidence.reconnectedFrame = demo.timing.frames;
            await demo.settle({ text: prompt }, { after: 0, timeout: 30_000 });
            const coldBootHistory = await gym.client.getMessages(agentId, { limit: 48 });
            const coldBootRun = coldBootHistory.runs.find((run) => run.id === evidence.runId);
            evidence.coldBootRunStatus = coldBootRun?.status;
            evidence.coldBootRunId = coldBootRun?.id;
            evidence.coldBootSecondTool =
                JSON.stringify(coldBootHistory).includes(secondToolCommand);
            evidence.coldBootUnsettled =
                coldBootRun?.status !== "completed" && !evidence.coldBootSecondTool;
            await sampleClock("cold boot, before the held inference is released");
            if (!evidence.coldBootUnsettled)
                throw new Error("The cold-booted run was already settled or had started Tool 2.");

            // The post-tool inference is now visibly held by the new daemon.
            // Only this release lets the same durable run ask for and execute
            // its second tool.
            await livePromiseWait(
                demo,
                postToolInference,
                20_000,
                "The restarted daemon never resumed the held post-tool inference.",
            );
            evidence.postRestartInferenceHeld = true;
            gym.inferenceRelease();
            inferenceReleased = true;
            await demo.caption("And picks up right where it left off.");

            // The payoff begins immediately: fresh answer text grows on screen,
            // then the short second tool and final result. No held blank Working
            // state, no long scripted copy wait after the restart.
            await demo.settle({ text: "The rocket dino fits" }, { after: 0, timeout: 20_000 });
            evidence.responseStartedFrame = demo.timing.frames;

            const secondTool = demo.page.getByText(secondToolCommand, { exact: false });
            await demo.settle(secondTool, { after: 700, timeout: 30_000 });
            evidence.secondToolVisibleAfterRestart = true;
            evidence.secondToolVisibleAt = Date.now();
            await sampleClock("second tool visible after restart");
            const finalText = demo.page.getByText("All code is done", { exact: false }).last();
            await demo.settle(finalText, { after: 900, timeout: 45_000 });
            const completedHistory = await liveRunComplete(
                demo,
                gym.client,
                agentId,
                evidence.runId,
            );
            evidence.finalRunStatus = completedHistory.runs.find(
                (run) => run.id === evidence.runId,
            )?.status;

            const image = demo.page.locator('[data-happy-desktop-ui="message-media-image"]').last();
            await demo.settle(image, { after: 750, timeout: 30_000 });
            demo.sound("arrive");
            await demo.caption("No lost work. No need to say ‘continue’.");
            await demo.zoomTo('[data-happy-desktop-ui="conversation-view"]', {
                level: 1.2,
                duration: 860,
            });
            await demo.hold(1_100);
            await demo.zoomTo('[data-happy-desktop-ui="message-media-image"]', {
                level: 1.38,
                duration: 920,
            });
            await demo.hold(3_500);
            await demo.zoomOut({ duration: 760 });
            await demo.caption(undefined);
            await demo.hold(850);
            await demo.card(closingCard, { hold: 4_500 });
            await demo.finish();
            evidence.timing = demo.timing;
            evidence.typingCapture = demo.captureSummary(
                evidence.typingStartedFrame,
                evidence.fastTypingEndedFrame,
            );
            evidence.preSendCapture = demo.captureSummary(
                evidence.fastTypingEndedFrame,
                evidence.promptSentFrame,
            );
            await sampleClock("end of take");
        } finally {
            if (!inferenceReleased) gym.inferenceRelease();
        }
    },

    /** The take is also the integration proof for every claim it makes. */
    async assert(page, gym) {
        if (!evidence?.installSurfaceSeen)
            throw new Error("The production install surface never appeared in the take.");
        const installAsked = await page.evaluate(() => window.__happyDemoDaemon.installAsked());
        if (!installAsked) throw new Error("The update's real Install action was never invoked.");
        if (!evidence.installClickedWhileTool)
            throw new Error("Install was not clicked while the real first tool was draining.");
        if (!evidence.drainCompleted || !evidence.drainStages.has("tools"))
            throw new Error("The real daemon drain did not show the running tool reach its edge.");
        if (!evidence.coldBootUnsettled)
            throw new Error("assert(): the restored run was not unsettled before release.");
        if (!evidence.postRestartInferenceHeld || !evidence.secondToolVisibleAfterRestart)
            throw new Error("assert(): Tool 2 did not wait for and follow the daemon restart.");
        if (evidence.secondToolVisibleAt < evidence.restartCompletedAt)
            throw new Error("assert(): Tool 2 became visible before the new daemon was ready.");
        if (!evidence.restart || evidence.restart.previousPid === evidence.restart.currentPid)
            throw new Error("The isolated Happy Agent did not restart under a new PID.");

        const health = await gym.client.getHealth();
        if (!health.ready || health.draining === true)
            throw new Error("The new daemon is not ready after restart.");

        const history = await gym.client.getMessages(evidence.agentId, { limit: 48 });
        const run = history.runs.find((candidate) => candidate.id === evidence.runId);
        if (evidence.preRestartRunStatus === "completed")
            throw new Error("assert(): the run settled before the restart boundary.");
        if (evidence.coldBootRunId !== evidence.runId)
            throw new Error("assert(): cold boot did not restore the same durable run.");
        if (run?.status !== "completed")
            throw new Error(`The restarted run did not complete: ${run?.status ?? "missing"}.`);
        const durableHistory = JSON.stringify(history);
        for (const command of [firstToolCommand, secondToolCommand]) {
            if (!durableHistory.includes(command))
                throw new Error(`The durable run is missing ${JSON.stringify(command)}.`);
        }

        const transcript = await page
            .locator('[data-happy-desktop-ui="conversation-view"]')
            .first()
            .innerText();
        for (const expected of [prompt, "All code is done", "Everything is in place"]) {
            if (!transcript.includes(expected))
                throw new Error(`The restored transcript is missing ${JSON.stringify(expected)}.`);
        }
        const settledLabel = (
            await page.locator('[data-happy-desktop-ui="turn-summary-label"]').last().innerText()
        ).replaceAll("\u00a0", " ");
        if (!settledLabel.startsWith("Completed in "))
            throw new Error(`The restored turn exposes the wrong status: ${settledLabel}.`);
        const displayedDuration = durationRead(settledLabel);
        const clock = await clockRead(page);
        const timing = evidence.timing;
        if (!timing || timing.frames < 1)
            throw new Error("The take did not record a director timeline.");
        const frameMs = 1_000 / timing.fps;
        if (
            !Number.isFinite(displayedDuration) ||
            !Number.isFinite(clock.lastTurnElapsed) ||
            !Number.isFinite(clock.settledAtVideo) ||
            !Number.isFinite(clock.settledTurnElapsed) ||
            !Number.isFinite(clock.turnStartVideo)
        )
            throw new Error(`The settled turn has no measurable clock: ${settledLabel}.`);
        const displayedSettledClock = Math.floor(clock.settledTurnElapsed / 1_000) * 1_000;
        if (displayedDuration !== displayedSettledClock)
            throw new Error("The settled Completed-in clock does not match the live turn clock.");
        const lastDisplayedRunningClock = Math.floor(clock.lastTurnElapsed / 1_000) * 1_000;
        if (displayedDuration < lastDisplayedRunningClock)
            throw new Error(
                "The settled Completed-in clock went backwards from the running clock.",
            );
        const settledVideoSpan = clock.settledAtVideo - clock.turnStartVideo;
        // This now observes the real product/server duration rather than
        // replacing it with video time. Allow one UI clock tick for delivery
        // and projection; the independent wall-time assertion below is tighter.
        if (Math.abs(clock.settledTurnElapsed - settledVideoSpan) > 1_000)
            throw new Error("The settled Completed-in clock does not span the filmed live turn.");

        const runningSamples = evidence.clockSamples.filter(
            (sample) =>
                sample.settledTurnElapsed === undefined && Number.isFinite(sample.lastTurnElapsed),
        );
        for (let index = 1; index < runningSamples.length; index += 1) {
            const previous = runningSamples[index - 1];
            const current = runningSamples[index];
            const videoDelta = (current.frames - previous.frames) * frameMs;
            const clockDelta = current.lastTurnElapsed - previous.lastTurnElapsed;
            if (Math.abs(clockDelta - videoDelta) > 1_500)
                throw new Error("assert(): the visible running clock was not 1:1 with video time.");
        }
        const clockFrameMs = Math.abs(clock.videoNow - timing.frames * frameMs);
        if (clockFrameMs > frameMs * 1.5)
            throw new Error("assert(): the page clock drifted away from the captured frame clock.");
        if (Math.abs(timing.wallMs - timing.frames * frameMs) > 100)
            throw new Error(
                "assert(): the complete take is not wall-time, including initial inference.",
            );
        if (timing.maxFrameLatenessMs > 150)
            throw new Error(
                `assert(): capture stalled for ${timing.maxFrameLatenessMs.toFixed(1)}ms.`,
            );
        if (!evidence.thinkingVisibleFrame)
            throw new Error("assert(): the initial thinking beat was not shown.");
        const preSendMs = (evidence.promptSentFrame - evidence.fastTypingEndedFrame) * frameMs;
        if (preSendMs < 1_000 || evidence.preSendCapture.speedBadgeFrames !== 0)
            throw new Error(
                "assert(): the speed badge did not clear for a readable pre-send pause.",
            );
        if (evidence.typingCapture.speedBadgeFrames === 0)
            throw new Error("assert(): accelerated typing was not labelled 3×.");
        for (const wait of timing.liveWaits) {
            if (Math.abs(wait.frames * frameMs - wait.wallMs) > 250)
                throw new Error("assert(): a live wait was time-compressed in the take.");
        }
        const takeSeconds = timing.frames / timing.fps + 1.8;
        if (takeSeconds < 50 || takeSeconds > 85)
            throw new Error(`The take is ${takeSeconds.toFixed(1)}s; expected 50–85s.`);
        const responseDelay = (evidence.responseStartedFrame - evidence.reconnectedFrame) * frameMs;
        if (!Number.isFinite(responseDelay) || responseDelay > 2_500)
            throw new Error(`The response waited ${responseDelay}ms after reconnect.`);

        const image = page.locator('[data-happy-desktop-ui="message-media-image"]').last();
        if ((await image.count()) === 0)
            throw new Error("The agent's sticker image is not inline.");
        const loaded = await image.evaluate(
            (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
        );
        if (!loaded)
            throw new Error("The inline sticker exists but its real image bytes did not load.");

        const project = join(gym.paths.projects, "happy-desktop");
        const sticker = join(project, "packages/happy-desktop-ui/public/whats-new/rocket-dino.png");
        await access(sticker);
        const component = await readFile(
            join(project, "packages/happy-desktop-ui/src/WhatsNew.tsx"),
            "utf8",
        );
        if (!component.includes('sticker: "/whats-new/rocket-dino.png"'))
            throw new Error("The real What’s New fixture code does not reference the sticker.");

        const shell = await page.locator('[data-happy-desktop-ui="app-shell"]').first().innerText();
        for (const projectName of ["travel-vibes", "happy", "happy-desktop", "bra1hndump"]) {
            if (!shell.includes(projectName))
                throw new Error(`The dressed sidebar is missing ${projectName}.`);
        }
        if (shell.includes("Full access"))
            throw new Error('The demo still exposes the "Full access" permission label.');
        if (await page.locator('[data-happy-desktop-ui="sidebar-update-action"]').count())
            throw new Error("The installed update is still offered after the cold boot.");

        return {
            ...evidence,
            drainStages: [...evidence.drainStages],
            agentVersion: health.version,
            responseDelayMs: responseDelay,
            settledLabel,
            takeSeconds,
        };
    },
};
