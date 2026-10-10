import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { runIdWait } from "../../scenario/runtime.mjs";
import * as world from "./world.mjs";

const execFile = promisify(execFileCallback);
const hook = (name) => `[data-happy-desktop-ui="${name}"]`;
const card = hook("agent-update-card");
let evidence;

async function until(demo, read, label, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(label);
        await demo.settle(undefined, { after: 180 });
    }
}

async function promiseFilm(demo, promise, label, timeout = 45_000) {
    let settled = false;
    let failure;
    let result;
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
    await until(demo, () => settled, label, timeout);
    if (failure) throw failure;
    return result;
}

async function sample(demo, phase, allowSessionNavigation = false) {
    const state = await demo.page.evaluate((cardHook) => {
        const card = document.querySelector(cardHook);
        const composer = document.querySelector('[data-happy-desktop-ui="composer-textarea"]');
        const shell = document.querySelector('[data-happy-desktop-ui="app-shell"]');
        const original = window.__seamlessUpdateOpening;
        const rect = card?.getBoundingClientRect();
        const sidebarRect = document
            .querySelector('[data-happy-desktop-ui="sidebar"]')
            ?.getBoundingClientRect();
        const composerRect = composer?.getBoundingClientRect();
        return {
            cardText: card?.textContent,
            cardRect: rect
                ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                : null,
            sidebarWidth: sidebarRect?.width,
            cardComposerOverlap:
                rect && composerRect
                    ? {
                          width: Math.max(
                              0,
                              Math.min(rect.right, composerRect.right) -
                                  Math.max(rect.left, composerRect.left),
                          ),
                          height: Math.max(
                              0,
                              Math.min(rect.bottom, composerRect.bottom) -
                                  Math.max(rect.top, composerRect.top),
                          ),
                      }
                    : null,
            conversationErrors: Array.from(
                document.querySelectorAll('[data-happy-desktop-ui="conversation-error-card"]'),
                (element) => element.textContent,
            ),
            draft: composer?.value,
            focused: document.activeElement === composer,
            sameShell: shell === original?.shell,
            sameComposer: original?.composer ? composer === original.composer : null,
            selection: composer ? [composer.selectionStart, composer.selectionEnd] : null,
            fullScreenInstall:
                document.querySelector('[data-testid="agent-install-screen"]') !== null,
        };
    }, card);
    if (
        !state.sameShell ||
        (!allowSessionNavigation && state.sameComposer === false) ||
        state.fullScreenInstall
    )
        throw new Error(`The app was replaced by the update during ${phase}.`);
    if (state.conversationErrors.length)
        throw new Error(
            `A conversation error appeared during ${phase}: ${state.conversationErrors}`,
        );
    if (state.cardComposerOverlap?.width > 0 && state.cardComposerOverlap.height > 0)
        throw new Error(`The update card covered the composer during ${phase}.`);
    evidence.phases.push({
        phase,
        frames: demo.timing.frames,
        at: Date.now(),
        allowSessionNavigation,
        ...state,
    });
    return state;
}

export default {
    id: "seamless-update",
    title: "Seamless Happy Agent updates",
    subtitle: "Keep working while Happy Agent updates",
    inferenceModes: ["screenplay"],
    manualOnly: true,
    rawWindow: true,
    subtitles: "below",
    transitions: "none",
    patches: [
        { scope: "shared", source: "browser-daemon.patch" },
        { scope: "demo", source: "real-upgrade.patch" },
    ],
    world,

    async run(demo, gym) {
        const mainId = gym.world.sessions.find((session) => session.id === "waveform")?.agentId;
        const otherId = gym.world.sessions.find((session) => session.id === "scroll")?.agentId;
        if (!mainId || !otherId) throw new Error("The two demo sessions were not seeded.");
        if (!gym.daemonUpgrade) throw new Error("This story requires the real private installer.");
        const version = (await gym.client.getHealth()).version.daemon;
        if (version !== world.daemonUpgrade.from)
            throw new Error("The private world started on the wrong release.");
        const { stdout } = await execFile("git", ["rev-parse", "HEAD"]);
        evidence = {
            sourceSha: stdout.trim(),
            feature: {
                sourceSha: "21139b0e0883b274d845fa0750cf93276f3f390d",
                rendererPreviewVersion: "0.0.94-preview.8",
                rendererPreviewRun:
                    "https://github.com/slopus/happy-desktop/actions/runs/38100166448",
            },
            agentVersion: version,
            boundary:
                "Scripted inference; real released-version upgrade through the production downloader, selection and restart controller in a private world. Browser bindings replace only native IPC; progress and connection/catalog readiness come from production code.",
            agentIds: [mainId, otherId],
            runs: {},
            phases: [],
            phaseStarts: [],
            downTyping: [],
            openingUpgrade: await gym.daemonUpgrade.evidence(),
        };
        // This is the real, built-in bot. No replacement avatar or identity.
        const { bots } = await gym.client.listBots();
        const chief = bots.find((bot) => bot.systemKey === "chief_of_staff");
        if (!chief) throw new Error("The private daemon has no built-in Chief of Staff.");
        evidence.chiefOfStaff = { id: chief.id, name: chief.name, systemKey: chief.systemKey };

        await demo.page.setViewportSize({ width: 1120, height: 640 });
        const welcome = demo.page.getByRole("button", { name: "Go Happy", exact: true });
        await demo.page.locator(hook("sidebar")).or(welcome).first().waitFor();
        const welcomeShown = await welcome.isVisible();
        if (welcomeShown) await welcome.click();
        await demo.page.locator(hook("sidebar")).waitFor();
        await demo.page.getByText(chief.name, { exact: true }).first().waitFor();
        evidence.preparation = {
            welcomeShown,
            welcomeAcknowledged: await demo.page.evaluate(
                () =>
                    JSON.parse(localStorage.getItem("happy.welcome.v1") ?? "null")
                        ?.welcomeAcknowledged === true,
            ),
            daemonOnboarding: await gym.client.getOnboarding(),
            profile: (await gym.client.getProfile()).profile,
        };
        if (
            !evidence.preparation.welcomeAcknowledged ||
            !evidence.preparation.daemonOnboarding.completed
        )
            throw new Error("First-run preparation did not complete before filming.");
        const { agent } = await gym.client.getAgent(mainId);
        const { agent: otherAgent } = await gym.client.getAgent(otherId);
        evidence.sessions = [
            { agentId: mainId, workspaceId: agent.workspaceId, title: "Animate voice waveform" },
            {
                agentId: otherId,
                workspaceId: otherAgent.workspaceId,
                title: "Preserve message scroll",
            },
        ];
        // Connections own memory routers. Use the ordinary sidebar and tab
        // controls for preparation rather than changing the browser hash.
        const projectRow = demo.page.locator(
            `${hook("sidebar-item")}[data-item-id="local/${gym.world.projectId}"]`,
        );
        if ((await projectRow.getAttribute("aria-expanded")) === "false")
            await projectRow.locator(hook("sidebar-item-fold")).click();
        await projectRow.click();
        await demo.page
            .locator(`${hook("sidebar-item")}[data-item-id="local/${agent.workspaceId}"]`)
            .click();
        await demo.page
            .locator(`${hook("tab")}[data-tab-id="${mainId}"]`)
            .first()
            .click();
        await demo.page.locator(hook("composer-textarea")).first().waitFor();
        const hidePanel = demo.page.getByRole("button", { name: "Hide panel", exact: true });
        if (await hidePanel.isVisible()) await hidePanel.click();
        await demo.page.evaluate(() => document.fonts.ready);
        await demo.page.waitForTimeout(1200);
        evidence.framing = await demo.framingPrepare(hook("app-shell"), { rawWindow: true });
        await demo.page.exposeFunction("seamlessUpdatePhaseSeen", (report) => {
            evidence.phaseStarts.push({ frames: demo.timing.frames, at: Date.now(), ...report });
        });
        await demo.page.evaluate(() => {
            window.__seamlessUpdateOpening = {
                shell: document.querySelector('[data-happy-desktop-ui="app-shell"]'),
            };
            const observed = { failures: [] };
            window.__seamlessUpdateObserved = observed;
            let previousPhase;
            const observe = () => {
                const shell = document.querySelector('[data-happy-desktop-ui="app-shell"]');
                const fullScreen = document.querySelector('[data-testid="agent-install-screen"]');
                const status = document.querySelector(
                    '[data-happy-desktop-ui="happy-agent-connection-status-label"]',
                )?.textContent;
                const conversationError = document.querySelector(
                    '[data-happy-desktop-ui="conversation-error-card"]',
                )?.textContent;
                const failure =
                    shell !== window.__seamlessUpdateOpening.shell
                        ? "app-shell replaced"
                        : fullScreen
                          ? "full-screen install appeared"
                          : status && /Disconnected|Not reachable/u.test(status)
                            ? status
                            : conversationError
                              ? `Conversation error: ${conversationError}`
                              : undefined;
                if (failure && observed.failures.length < 16)
                    observed.failures.push({ failure, at: performance.now() });
                const card = document.querySelector('[data-happy-desktop-ui="agent-update-card"]');
                const phase = card?.getAttribute("data-phase") ?? "cleared";
                if (phase !== previousPhase) {
                    previousPhase = phase;
                    void window.seamlessUpdatePhaseSeen({
                        phase,
                        browserAt: performance.now(),
                        text: card?.textContent ?? null,
                    });
                }
            };
            observed.observer = new MutationObserver(observe);
            observed.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        });

        const resumedInference = Promise.all([
            gym.inferenceHold(mainId),
            gym.inferenceHold(otherId),
        ]);
        let released = false;
        try {
            for (const [name, id, prompt] of [
                ["waveform", mainId, world.waveformPrompt],
                ["scroll", otherId, world.scrollPrompt],
            ]) {
                const sent = await gym.client.sendMessage(id, {
                    delivery: "queue",
                    id: `m${randomUUID().replaceAll("-", "").slice(0, 23)}`,
                    text: prompt,
                    mode: world.seedMode,
                });
                evidence.runs[name] = await runIdWait(gym.client, id, sent.message.id, sent.cursor);
            }
            await demo.page
                .getByText("node scripts/capture-work.mjs waveform", { exact: false })
                .waitFor();
            // The opening already has a genuine unsent draft. Spend the first
            // filmed second on the real Install decision.
            await demo.page.locator(hook("composer-textarea")).first().fill(world.draftStart);
            await demo.page.locator(hook("sidebar-update-action-trigger")).click();
            await demo.caption("Updates without losing your place.");
            await demo.click(
                demo.page
                    .locator(hook("sidebar-update-action-panel"))
                    .getByRole("menuitem", { name: "Install", exact: true }),
                { after: 0 },
            );

            const health = await until(
                demo,
                async () => {
                    const health = await gym.daemonHealth();
                    const ids = (health.drainWaitingFor ?? [])
                        .flatMap((entry) => entry.agents ?? [])
                        .map((agent) => agent.id);
                    return ids.includes(mainId) && ids.includes(otherId) ? health : undefined;
                },
                "Both real agents were not visible in the drain.",
            );
            evidence.drainingHealth = health;
            await demo.settle(`${card}[data-phase="draining"]`, { after: 1100 });
            await demo.caption("Your agents finish. You keep working.");
            await sample(demo, "Finishing work");
            // The card itself supplies these real chat links.
            await demo.click(
                demo.page
                    .locator(card)
                    .locator(hook("agent-update-card-agent"))
                    .filter({ hasText: "Preserve message scroll" }),
                { after: 800 },
            );
            await demo.click(
                demo.page
                    .locator(card)
                    .locator(hook("agent-update-card-agent"))
                    .filter({ hasText: "Animate voice waveform" }),
                { after: 400 },
            );
            await demo.click(hook("composer-textarea"), { after: 80 });
            await demo.pointerVisible(false);
            await demo.type(world.draftDuringDrain, { perKey: 70, after: 300 });
            await demo.page.evaluate(() => {
                window.__seamlessUpdateOpening.composer = document.querySelector(
                    '[data-happy-desktop-ui="composer-textarea"]',
                );
            });
            const typing = await sample(demo, "Typing during drain");
            if (typing.draft !== world.draftStart + world.draftDuringDrain || !typing.focused)
                throw new Error("The draft could not be typed during the update.");
            evidence.beforeRestart = await Promise.all(
                evidence.agentIds.map(async (id, index) => {
                    const history = await gym.client.getMessages(id, { limit: 48 });
                    const runId = index === 0 ? evidence.runs.waveform : evidence.runs.scroll;
                    const run = history.runs.find((run) => run.id === runId);
                    if (!run || ["completed", "failed", "aborted"].includes(run.status))
                        throw new Error("A filmed run settled before the restart boundary.");
                    return { agentId: id, run };
                }),
            );
            await world.releaseWork(gym, mainId, "waveform");
            await world.releaseWork(gym, otherId, "scroll");
            await until(
                demo,
                async () => {
                    if (gym.daemonUpgrade.installationError)
                        throw gym.daemonUpgrade.installationError;
                    const phase = await demo.page.locator(card).getAttribute("data-phase");
                    return ["stopping", "starting", "reconnecting"].includes(phase);
                },
                "The production installer did not reach its down interval.",
            );
            await demo.caption("No reload. Same sessions. Same draft.");
            await demo.type(world.draftDuringDown, {
                perKey: 35,
                after: 0,
                afterCharacter: async (characters) => {
                    const state = await demo.page.evaluate(() => ({
                        phase: document
                            .querySelector('[data-happy-desktop-ui="agent-update-card"]')
                            ?.getAttribute("data-phase"),
                        draft: document.querySelector('[data-happy-desktop-ui="composer-textarea"]')
                            ?.value,
                    }));
                    evidence.downTyping.push({
                        characters,
                        frames: demo.timing.frames,
                        at: Date.now(),
                        installerPhase: gym.daemonUpgrade.controller.get().install.phase,
                        ...state,
                    });
                },
            });
            if (
                !evidence.downTyping.some(
                    (entry) =>
                        ["stopping", "starting"].includes(entry.phase) &&
                        ["stopping", "starting"].includes(entry.installerPhase),
                )
            )
                throw new Error("No draft keystroke was filmed during the real restart interval.");
            await sample(demo, "Draft typed through restart");
            await promiseFilm(
                demo,
                gym.daemonUpgrade.installed,
                "The real released-version upgrade did not finish.",
            );
            evidence.upgradedHealth = await gym.daemonReconnect();
            evidence.upgrade = await gym.daemonUpgrade.evidence();
            evidence.restart = {
                previousPid: evidence.openingUpgrade.pid,
                currentPid: evidence.upgrade.pid,
                previousVersion: version,
                currentVersion: evidence.upgradedHealth.version.daemon,
            };
            if (evidence.restart.currentVersion !== world.daemonUpgrade.to)
                throw new Error(
                    "The private daemon did not actually upgrade to the target release.",
                );
            await demo.settle(`${card}[data-phase="done"]`, { after: 0 });
            await demo.caption("Updated. Right where you left off.");
            const updated = await sample(demo, "Updated");
            if (!updated.cardText?.includes("Took "))
                throw new Error("The success card did not show the real measured update duration.");
            evidence.afterRestartBeforeRelease = await Promise.all(
                evidence.agentIds.map(async (id, index) => {
                    const history = await gym.client.getMessages(id, { limit: 48 });
                    const runId = index === 0 ? evidence.runs.waveform : evidence.runs.scroll;
                    const run = history.runs.find((run) => run.id === runId);
                    if (!run || ["completed", "failed", "aborted"].includes(run.status))
                        throw new Error(
                            "The new daemon did not restore the original unsettled run.",
                        );
                    return { agentId: id, run };
                }),
            );
            await promiseFilm(
                demo,
                resumedInference,
                "The same session did not resume its post-tool inference.",
            );
            gym.inferenceRelease();
            released = true;
            await demo.settle({ text: world.resumedText, exact: false }, { after: 0 });
            await demo.hold(3200);
            const final = await sample(demo, "Done cleared");
            if (final.draft !== world.draft)
                throw new Error("The draft was lost across the daemon restart.");
            evidence.visiblyCompletedSessions = [];
            for (const session of [...evidence.sessions].reverse()) {
                await demo.click(
                    `${hook("sidebar-item")}[data-item-id="local/${session.workspaceId}"]`,
                    { after: 250 },
                );
                await demo.click(`${hook("tab")}[data-tab-id="${session.agentId}"]`, {
                    after: 100,
                });
                const reply =
                    session.agentId === mainId ? world.resumedText : world.otherResumedText;
                await demo.settle({ text: reply, exact: false }, { after: 1100 });
                evidence.visiblyCompletedSessions.push({
                    ...session,
                    frames: demo.timing.frames,
                    text: await demo.page.locator(hook("message-list")).innerText(),
                });
            }
            await sample(demo, "Final draft after visiting both completed sessions", true);
            await demo.caption(undefined);
            await demo.pointerVisible(false);
            await demo.hold(Math.max(3000, 22_000 - (demo.timing.frames / demo.timing.fps) * 1000));
            await demo.finish();
            evidence.timing = demo.timing;
        } finally {
            if (!released) gym.inferenceRelease();
        }
    },

    async evidence(page, gym) {
        // This inspection is after the filmed finish. Scroll both real
        // transcripts so virtualization cannot hide an error outside the view.
        const transcriptInspection = [];
        for (const session of [...evidence.sessions].reverse()) {
            await page
                .locator(`${hook("sidebar-item")}[data-item-id="local/${session.workspaceId}"]`)
                .click();
            await page
                .locator(`${hook("tab")}[data-tab-id="${session.agentId}"]`)
                .first()
                .click();
            const viewport = page.locator(".happy-message-list__viewport").first();
            await viewport.waitFor();
            const errors = new Set();
            let position = 0;
            for (;;) {
                const { maximum, step } = await viewport.evaluate((element, top) => {
                    element.scrollTop = top;
                    return {
                        maximum: element.scrollHeight - element.clientHeight,
                        step: Math.max(1, element.clientHeight / 2),
                    };
                }, position);
                await page.waitForTimeout(120);
                for (const error of await page
                    .locator(hook("conversation-error-card"))
                    .allTextContents())
                    errors.add(error);
                if (position >= maximum) break;
                position = Math.min(maximum, position + step);
            }
            transcriptInspection.push({ ...session, conversationErrors: [...errors] });
            if (errors.size)
                throw new Error(
                    `The ${session.title} transcript contains an error: ${[...errors]}`,
                );
        }
        const health = await gym.client.getHealth();
        const history = await gym.client.getMessages(evidence.agentIds[0], { limit: 48 });
        const run = history.runs.find((run) => run.id === evidence.runs.waveform);
        const otherHistory = await gym.client.getMessages(evidence.agentIds[1], { limit: 48 });
        const otherRun = otherHistory.runs.find((run) => run.id === evidence.runs.scroll);
        const observed = await page.evaluate(() => {
            window.__seamlessUpdateObserved.observer.disconnect();
            return window.__seamlessUpdateObserved.failures;
        });
        if (observed.length)
            throw new Error(`The capture showed an interruption: ${JSON.stringify(observed)}.`);
        if (!health.ready || health.draining) throw new Error("The restarted daemon is not ready.");
        if (run?.status !== "completed")
            throw new Error("The original durable run did not complete after restart.");
        if (otherRun?.status !== "completed")
            throw new Error("The second durable run did not complete after restart.");
        for (const [name, durable] of [
            ["waveform", history],
            ["scroll", otherHistory],
        ]) {
            if (!JSON.stringify(durable).includes(`node scripts/capture-work.mjs ${name}`))
                throw new Error(`The durable ${name} run is missing its real tool call.`);
        }
        if (evidence.restart.previousPid === evidence.restart.currentPid)
            throw new Error("The daemon PID did not change.");
        if (await page.locator(card).isVisible())
            throw new Error("The success card did not disappear after its hold.");
        if (await page.locator(hook("sidebar-agent-update")).isVisible())
            throw new Error("The footer update icon remained after the update completed.");
        return {
            ...evidence,
            interruptions: observed,
            transcriptInspection,
            finalHealth: health,
            resumedRuns: [run, otherRun],
        };
    },
};
