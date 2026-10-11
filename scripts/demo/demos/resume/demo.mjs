import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { runIdWait } from "../../scenario/runtime.mjs";
import * as world from "./world.mjs";

const execFile = promisify(execFileCallback);
const hook = (name) => `[data-happy-desktop-ui="${name}"]`;
const card = hook("agent-update-card");
export const captions = [
    "Update ready. Agent mid-task.",
    "Wrapping up the current turn, then restarting.",
    "Picks up exactly where it left off. No reload.",
];
let evidence;
async function until(demo, read, message, timeout = 45000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(message);
        if (evidence && demo.timing.frames) await sample(demo, "waiting");
        await demo.settle(undefined, { after: 100 });
    }
}
async function filmed(demo, promise, message) {
    let settled = false;
    let result;
    let failure;
    void promise.then(
        (value) => {
            result = value;
            settled = true;
        },
        (error) => {
            failure = error;
            settled = true;
        },
    );
    await until(demo, () => settled, message);
    if (failure) throw failure;
    return result;
}
function tools(run) {
    return (run?.messages ?? [])
        .flatMap((message) => message.content ?? [])
        .filter((block) => block.type === "tool_call");
}
async function capabilitiesRead(gym) {
    const health = await gym.client.getHealth();
    await gym.client.listTasks();
    let artifacts;
    try {
        await gym.client.listArtifacts({ limit: 1 });
        artifacts = "supported";
    } catch (error) {
        if (error.status !== 404) throw error;
        artifacts = "unsupported";
    }
    return { protocol: health.version.protocol, tasks: "supported", artifacts };
}
async function chromeRead(page) {
    return await page.evaluate(() => {
        const selector = (name) => `[data-happy-desktop-ui="${name}"]`;
        const controls = (node) =>
            [...(node?.querySelectorAll("button") ?? [])].map((button) => ({
                label: button.getAttribute("aria-label"),
                title: button.getAttribute("title"),
                disabled: button.disabled,
            }));
        return {
            sections: [...document.querySelectorAll(selector("sidebar-section"))].map(
                (section) => ({
                    id: section.getAttribute("data-section-id"),
                    label: section.querySelector(selector("sidebar-section-label"))?.textContent,
                    actions: controls(section.querySelector(selector("sidebar-section-actions"))),
                }),
            ),
            mainPane: {
                title: document.querySelector(selector("channel-header-title"))?.textContent,
                headerControls: controls(document.querySelector(selector("channel-header"))),
                tabs: [...document.querySelectorAll(selector("tab"))].map((tab) => ({
                    id: tab.getAttribute("data-tab-id"),
                    label: tab.querySelector(selector("tab-label"))?.textContent,
                    selected: tab.getAttribute("aria-selected"),
                })),
                tabControls: controls(document.querySelector(selector("tabbed-pane-actions"))),
            },
        };
    });
}
async function sample(demo, label) {
    const state = await demo.page.evaluate(() => {
        const q = (name) => document.querySelector(`[data-happy-desktop-ui="${name}"]`);
        const rect = (node) => {
            const r = node?.getBoundingClientRect();
            return r
                ? {
                      x: r.x,
                      y: r.y,
                      width: r.width,
                      height: r.height,
                      right: r.right,
                      bottom: r.bottom,
                  }
                : null;
        };
        const update = q("agent-update-card");
        const composer = q("composer-textarea");
        return {
            phase: update?.getAttribute("data-phase") ?? "cleared",
            cardText: update?.innerText,
            card: rect(update),
            sidebar: rect(q("sidebar")),
            composer: rect(composer),
            snail: rect(update?.querySelector(".happy-agent-update-card__scene")),
            draft: composer?.value,
            focused: document.activeElement === composer,
            sameShell: q("app-shell") === window.__resumeOpening.shell,
            sameComposer: composer === window.__resumeOpening.composer,
            errors: [
                ...document.querySelectorAll('[data-happy-desktop-ui="conversation-error-card"]'),
            ].map((node) => node.textContent),
            fullScreen: !!document.querySelector('[data-testid="agent-install-screen"]'),
            turnText: q("turn-summary-label")?.innerText,
            elapsed: q("agent-working-status-timer")?.innerText,
            working: q("agent-working-status")?.innerText,
        };
    });
    if (!state.sameShell || !state.sameComposer || state.fullScreen || state.errors.length)
        throw new Error(`App continuity failed at ${label}: ${JSON.stringify(state)}`);
    if (
        state.card &&
        (state.card.x < state.sidebar.x - 1 || state.card.right > state.sidebar.right + 1)
    )
        throw new Error("Update card leaves the sidebar");
    if (Math.abs(state.sidebar.width - 360) > 0.5)
        throw new Error("Sidebar does not occupy exactly half of the 720px app width");
    if (state.snail && Math.abs(state.snail.width - state.snail.height) > 1)
        throw new Error("Snail box is not square");
    evidence.samples.push({ label, frames: demo.timing.frames, at: Date.now(), ...state });
    return state;
}
async function runRead(gym) {
    const history = await gym.client.getMessages(evidence.agentId, { limit: 48 });
    return history.runs.find((run) => run.id === evidence.runId);
}
export default {
    id: "resume",
    title: "Same turn. New version.",
    subtitle: "A real upgrade, followed by recovery of the same turn",
    inferenceModes: ["screenplay"],
    manualOnly: true,
    rawWindow: true,
    subtitles: "below",
    captionPlacement: "strip",
    captionStripHeight: 120,
    transitions: "none",
    geometry: {
        viewport: { width: 720, height: 640 },
        deviceScaleFactor: 2,
        output: { width: 1080, height: 960 },
    },
    patches: [
        { scope: "shared", source: "browser-daemon.patch" },
        { scope: "demo", source: "../seamless-update/real-upgrade.patch" },
    ],
    world,
    async run(demo, gym) {
        if (!gym.daemonUpgrade) throw new Error("This take requires the real installer");
        const agentId = gym.world.sessions.find((session) => session.id === "waveform")?.agentId;
        if (!agentId) throw new Error("Missing waveform session");
        const { stdout } = await execFile("git", ["rev-parse", "HEAD"]);
        evidence = {
            sourceSha: stdout.trim(),
            feature: { sourceSha: "36f103e1", rendererPreviewVersion: "0.0.94-preview.9" },
            boundary:
                "Scripted inference and tool fixtures; real production release download, version selection, private daemon upgrade, durable run and tools. Browser bindings replace native IPC only.",
            agentId,
            samples: [],
            phaseStarts: [],
            clockSamples: [],
            openingUpgrade: await gym.daemonUpgrade.evidence(),
        };
        const welcome = demo.page.getByRole("button", { name: "Go Happy", exact: true });
        await demo.page.locator(hook("sidebar")).or(welcome).first().waitFor();
        if (await welcome.isVisible()) await welcome.click();
        await demo.page.locator(hook("sidebar")).waitFor();
        const { agent } = await gym.client.getAgent(agentId);
        await demo.page
            .locator(`${hook("sidebar-item")}[data-item-id="local/${agent.workspaceId}"]`)
            .click();
        await demo.page
            .locator(`${hook("tab")}[data-tab-id="${agentId}"]`)
            .first()
            .click();
        await demo.page.locator(hook("composer-textarea")).waitFor();
        const hidePanel = demo.page.getByRole("button", { name: "Hide panel", exact: true });
        if (await hidePanel.isVisible()) await hidePanel.click();
        // Use the genuine sidebar resize control, retaining the desktop minimum.
        const resize = demo.page.getByRole("separator", { name: "Resize sidebar", exact: true });
        await resize.focus();
        await demo.page.keyboard.press("Home");
        await until(
            demo,
            async () => (await resize.getAttribute("aria-valuenow")) === "220",
            "Sidebar did not reach its ordinary minimum",
        );
        const resizeBox = await resize.boundingBox();
        const resizeX = resizeBox.x + resizeBox.width / 2;
        const resizeY = resizeBox.y + resizeBox.height / 2;
        await demo.page.mouse.move(resizeX, resizeY);
        await demo.page.mouse.down();
        await demo.page.mouse.move(resizeX + 140, resizeY, { steps: 10 });
        await demo.page.mouse.up();
        await demo.page.evaluate(() => document.fonts.ready);
        await demo.page.waitForTimeout(900);
        evidence.framing = await demo.framingPrepare(hook("app-shell"), {
            rawWindow: true,
            delivery: { width: 1080, height: 960 },
        });
        const heldInference = gym.inferenceHold(agentId);
        let released = false;
        try {
            const sent = await gym.client.sendMessage(agentId, {
                delivery: "queue",
                id: `m${randomUUID().replaceAll("-", "").slice(0, 23)}`,
                text: world.prompt,
                mode: world.seedMode,
            });
            evidence.runId = await runIdWait(gym.client, agentId, sent.message.id, sent.cursor);
            await demo.page.getByText(world.firstCommand, { exact: false }).waitFor();
            await demo.page.getByText("Running tools", { exact: true }).waitFor();
            await demo.page.locator(hook("sidebar-update-action-trigger")).click();
            await demo.page.exposeFunction("resumePhaseSeen", (report) =>
                evidence.phaseStarts.push({
                    frames: demo.timing.frames,
                    at: Date.now(),
                    ...report,
                }),
            );
            await demo.page.evaluate(() => {
                const q = (name) => document.querySelector(`[data-happy-desktop-ui="${name}"]`);
                window.__resumeOpening = {
                    shell: q("app-shell"),
                    composer: q("composer-textarea"),
                };
                window.__resumeInterruptions = [];
                let previous;
                const observe = () => {
                    const phase = q("agent-update-card")?.getAttribute("data-phase") ?? "cleared";
                    if (phase !== previous) {
                        previous = phase;
                        void window.resumePhaseSeen({ phase, browserAt: performance.now() });
                    }
                    const error = q("conversation-error-card")?.textContent;
                    if (error && window.__resumeInterruptions.length < 16)
                        window.__resumeInterruptions.push(error);
                    if (
                        q("app-shell") !== window.__resumeOpening.shell &&
                        window.__resumeInterruptions.length < 16
                    )
                        window.__resumeInterruptions.push("shell replaced");
                };
                new MutationObserver(observe).observe(document.body, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ["data-phase"],
                });
            });
            evidence.before = await runRead(gym);
            evidence.beforeCapabilities = await capabilitiesRead(gym);
            evidence.beforeChrome = await chromeRead(demo.page);
            if (evidence.before.status !== "running")
                throw new Error("Opening run is not mid-turn");
            if (
                evidence.beforeCapabilities.protocol !== 26 ||
                evidence.beforeCapabilities.artifacts !== "unsupported" ||
                !evidence.beforeChrome.sections.some((section) => section.label === "Tasks")
            )
                throw new Error("Opening release lacks the expected stable capabilities");
            await sample(demo, "opening mid-turn");
            await demo.caption(captions[0]);
            await demo.hold(1300);
            await demo.click(
                demo.page
                    .locator(hook("sidebar-update-action-panel"))
                    .getByRole("menuitem", { name: "Install", exact: true }),
                { after: 0 },
            );
            await until(
                demo,
                async () => {
                    const health = await gym.daemonHealth();
                    const waiting = (health.drainWaitingFor ?? []).flatMap(
                        (entry) => entry.agents ?? [],
                    );
                    return waiting.some((entry) => entry.id === agentId && entry.stage === "tools")
                        ? health
                        : undefined;
                },
                "Installer did not drain the active tool",
            );
            await demo.settle(`${card}[data-phase="draining"]`, { after: 200 });
            await demo.caption(undefined);
            await demo.pointerVisible(false);
            await demo.hold(Math.max(0, 5000 - (demo.timing.frames / 60) * 1000));
            evidence.preRestart = await runRead(gym);
            await sample(demo, "before real restart");
            if (
                evidence.preRestart.status !== "running" ||
                tools(evidence.preRestart).some(
                    (tool) => tool.arguments?.command === world.secondCommand,
                )
            )
                throw new Error("Turn settled or tool 2 started before restart");
            await world.releaseWork(gym, agentId);
            await until(
                demo,
                () =>
                    ["stopping", "starting", "reconnecting"].includes(
                        gym.daemonUpgrade.controller.get().install.phase,
                    ),
                "Installer did not restart",
            );
            await demo.caption(captions[1]);
            await filmed(demo, gym.daemonUpgrade.installed, "Upgrade did not finish");
            evidence.upgradedHealth = await gym.daemonReconnect();
            evidence.upgrade = await gym.daemonUpgrade.evidence();
            evidence.afterCapabilities = await capabilitiesRead(gym);
            evidence.afterChrome = await chromeRead(demo.page);
            if (
                JSON.stringify(evidence.beforeCapabilities) !==
                    JSON.stringify(evidence.afterCapabilities) ||
                JSON.stringify(evidence.beforeChrome) !== JSON.stringify(evidence.afterChrome)
            )
                throw new Error("Capabilities, sidebar sections or main-pane chrome changed");
            evidence.restored = await runRead(gym);
            if (
                evidence.restored.status !== "running" ||
                tools(evidence.restored).some(
                    (tool) => tool.arguments?.command === world.secondCommand,
                )
            )
                throw new Error("Restored turn is settled or second tool already started");
            if (
                evidence.upgradedHealth.version.daemon !== world.daemonUpgrade.to ||
                evidence.openingUpgrade.pid === evidence.upgrade.pid
            )
                throw new Error("Actual version/PID did not change");
            evidence.reconnectedFrame = demo.timing.frames;
            await sample(demo, "same turn working after restart");
            await filmed(demo, heldInference, "Recovered turn did not request inference");
            gym.inferenceRelease();
            released = true;
            await demo.caption(undefined);
            await demo.settle({ text: world.resumedText }, { after: 0 });
            evidence.responseStartedFrame = demo.timing.frames;
            await demo.settle({ text: world.secondCommand }, { after: 0 });
            evidence.secondToolFrame = demo.timing.frames;
            evidence.secondToolRun = await runRead(gym);
            await sample(demo, "new tool after real upgrade");
            await until(
                demo,
                async () => {
                    const run = await runRead(gym);
                    if (["failed", "aborted"].includes(run.status))
                        throw new Error(`Run ${run.status}`);
                    return run.status === "completed" ? run : undefined;
                },
                "Same turn did not complete",
            );
            await demo.settle({ text: world.finalText }, { after: 0 });
            await demo.caption(captions[2]);
            evidence.final = await runRead(gym);
            await sample(demo, "completed original turn");
            await demo.hold(Math.max(2000, 18000 - (demo.timing.frames / 60) * 1000));
            await demo.finish();
            evidence.timing = demo.timing;
        } finally {
            if (!released) gym.inferenceRelease();
        }
    },
    async assert(page, gym) {
        if (!evidence?.final || evidence.final.status !== "completed")
            throw new Error("Missing completed original run");
        if (evidence.final.id !== evidence.runId || evidence.restored.id !== evidence.runId)
            throw new Error("Run identity changed");
        const second = tools(evidence.final).find(
            (tool) => tool.arguments?.command === world.secondCommand,
        );
        if (
            !second ||
            second.status !== "completed" ||
            !second.result?.output?.includes("Both states verified.")
        )
            throw new Error("Missing new completed streaming tool in original run");
        if (Math.abs(evidence.timing.wallMs - (evidence.timing.frames / 60) * 1000) > 100)
            throw new Error("Video time does not equal wall time");
        if ((evidence.responseStartedFrame - evidence.reconnectedFrame) / 60 > 2.5)
            throw new Error("Postrestart reply was too late");
        evidence.interruptions = await page.evaluate(() => window.__resumeInterruptions);
        if (evidence.interruptions.length) throw new Error(`Errors: ${evidence.interruptions}`);
        evidence.finalState = await sample({ page, timing: evidence.timing }, "final verification");
        if (evidence.samples.some((entry) => entry.draft !== ""))
            throw new Error("The composer must remain empty throughout the take");
        const labels = await page.locator(hook("turn-summary-label")).allTextContents();
        evidence.completedLabels = labels;
        if (!labels.some((label) => label.startsWith("Completed in")))
            throw new Error("Completed turn not visible");
        const running = evidence.samples.filter((entry) => /^\d+s$/u.test(entry.elapsed ?? ""));
        if (running.length < 3) throw new Error("Elapsed clock was not measured across restart");
        for (let index = 1; index < running.length; index++) {
            const previous = running[index - 1];
            const current = running[index];
            const delta =
                (Number.parseInt(current.elapsed, 10) - Number.parseInt(previous.elapsed, 10)) *
                1000;
            if (
                delta < 0 ||
                Math.abs(delta - ((current.frames - previous.frames) / 60) * 1000) > 1500
            )
                throw new Error("Elapsed clock reset or diverged from video time");
        }
        const completed = labels.at(-1).replaceAll("\u00a0", " ");
        const displayed = /Completed in (\d+)s/u.exec(completed);
        if (
            !displayed ||
            Math.abs(
                Number(displayed[1]) * 1000 - (evidence.final.endedAt - evidence.final.startedAt),
            ) > 1100
        )
            throw new Error("Completed clock does not span the original durable turn");
        if (evidence.finalState.card) throw new Error("Success card did not clear before ending");
        evidence.finalHealth = await gym.client.getHealth();
        evidence.finalChrome = await chromeRead(page);
        if (JSON.stringify(evidence.beforeChrome) !== JSON.stringify(evidence.finalChrome))
            throw new Error("Navigation or main-pane chrome changed at completion");
        return evidence;
    },
};
