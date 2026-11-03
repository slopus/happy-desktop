import * as world from "./world.mjs";
import { cuid, nodeAvatarSet, personalOpen, photoSet } from "./personal.mjs";
import { phoneOpen } from "./phone.mjs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

/**
 * The whole app, as one window: the server rail, the sidebar, and the new
 * task. Recorded at HAPPY_DEMO_DEVICE_SCALE=1.6 (see README), so it is tall
 * enough for the sidebar and every frame arrives in time at 60 fps.
 */
const viewport = { width: 1000, height: 700 };

/** Kirill's computer, opened beside the gym; the window runs on it. */
let personal;
/** Steve's own client into Happy Core: everything he does off the phone goes through it. */
let steve;
let filmed = {};
let framing;
const cues = [];
/** `place` is what a captioned cut may point at: `{ rect }` in CSS pixels or `{ phoneRect }` in phone points. */
const cue = (name, demo, phone, place = {}) => {
    cues.push({ name, seconds: demo.timing.frames / demo.timing.fps, ...place });
    phone?.cue?.(name, demo);
};

async function until(demo, read, label, timeout = 30000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await Promise.resolve()
            .then(read)
            .catch(() => undefined);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Team demo: timed out waiting for ${label}.`);
        await demo.hold(200);
    }
}

/** Off-camera polling, before the take has a timeline. */
async function wait(read, label, timeout = 90000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await Promise.resolve()
            .then(read)
            .catch(() => undefined);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Team demo: timed out preparing ${label}.`);
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

const exists = (path) =>
    access(path).then(
        () => true,
        () => false,
    );

/** A member's profile on Happy Core: their name, their GitHub picture, setup done. */
async function memberPrepare(client, member) {
    const { profile } = await client.getProfile();
    if (profile.name !== member.name || profile.email === null)
        await client.updateProfile(
            { name: member.name, email: member.email, mutationId: randomUUID() },
            { ifMatch: profile.version },
        );
    await photoSet(client, member.photo);
    if (!(await client.getOnboarding()).completed) await client.completeOnboarding();
    return (await client.getProfile()).profile;
}

/** The team's bots, made once with their real IDs; faces from the real installation where they have one. */
async function botsPrepare(client) {
    for (const entry of world.bots) {
        let { bots } = await client.listBots();
        let bot = bots.find((candidate) => candidate.username === entry.username);
        if (!bot)
            ({ bot } = await client.createBot({
                id: entry.id,
                name: entry.name,
                username: entry.username,
                isAdmin: false,
            }));
        const picture = world.assetPath(`${entry.username}.png`);
        if (!bot.avatar && (await exists(picture))) {
            const { readFile } = await import("node:fs/promises");
            await client.setBotAvatar(
                bot.id,
                { contentType: "image/png", data: await readFile(picture) },
                { ifMatch: bot.version },
            );
        }
    }
    // Product Health's earlier subtask, asked once.
    const { bots } = await client.listBots();
    const health = bots.find((bot) => bot.username === world.botWork.bot);
    const history = await client.getMessages(health.agent.id, { limit: 8 });
    if (history.runs.length === 0) {
        await client.sendMessage(health.agent.id, {
            id: cuid(),
            text: world.botWork.message,
            mode: world.seedMode,
        });
        await wait(
            async () =>
                (await client.getAgent(health.agent.id)).agent.subtasks?.length > 0 &&
                (await client.getMessages(health.agent.id, { limit: 8 })).runs.every(
                    (run) => run.status !== "running",
                ),
            "Product Health's subtask",
        );
    }
}

/** A task by name, among the caller's active ones. */
async function taskFind(client, name) {
    const { tasks } = await client.listTasks();
    return tasks.find((task) => task.name === name && task.status === "active");
}

/** Earlier work, made once: each owner's task, its subtask, and the subtask's change. */
async function doneTasksPrepare(clients) {
    for (const entry of world.doneTasks) {
        const client = clients[entry.owner];
        if (await taskFind(client, entry.name)) continue;
        const { task } = await client.createTask({ name: entry.name, mutationId: randomUUID() });
        await client.sendMessage(task.agent.id, {
            id: cuid(),
            text: entry.message,
            mode: world.seedMode,
        });
        await wait(
            async () => {
                const { runs } = await client.getMessages(task.agent.id, { limit: 8 });
                if (runs.length === 0 || runs.some((run) => run.status === "running")) return false;
                if (!entry.subtask) return true;
                const { agent } = await client.getAgent(task.agent.id);
                const subtask = agent.subtasks?.[0];
                if (!subtask) return false;
                const sub = await client.getMessages(subtask.id, { limit: 8 });
                return sub.runs.length > 0 && sub.runs.every((run) => run.status !== "running");
            },
            `the earlier task ${entry.name}`,
            180000,
        );
        process.stdout.write(`    task      ${entry.name}\n`);
    }
}

/** Archives a task and every subtask under it; earlier takes leave theirs behind. */
async function taskArchive(client, task) {
    const { task: current } = await client.getTask(task.id);
    if (current.status === "archived") return;
    await client.archiveTask(current.id, { ifMatch: current.version, mutationId: randomUUID() });
}

/**
 * Steve's live task, fresh for each take: its agent starts three subtasks,
 * each reads its file and waits at its first edit for the camera.
 */
async function liveTaskPrepare(steveClient) {
    const previous = await taskFind(steveClient, world.liveTask.name);
    if (previous) await taskArchive(steveClient, previous);
    const { task } = await steveClient.createTask({
        name: world.liveTask.name,
        mutationId: randomUUID(),
    });
    await steveClient.sendMessage(task.agent.id, {
        id: cuid(),
        text: world.liveTask.message,
        mode: world.seedMode,
    });
    await wait(
        () =>
            world.hasReached("live:coordinator") &&
            ["agent", "desktop", "ios"].every((key) => world.hasReached(`live:${key}:1`)),
        "Steve's three subtasks to start",
        180000,
    );
    return task;
}

/** Earlier takes' filmed tasks leave the sidebar before the next one. */
async function rehearsalsArchive(client) {
    const keep = new Set([...world.doneTasks.map((task) => task.name), world.liveTask.name]);
    const { tasks } = await client.listTasks();
    for (const task of tasks)
        if (task.status === "active" && !keep.has(task.name)) await taskArchive(client, task);
}

/** An agent and every subtask under it, read. */
async function agentReadAll(client, agentId) {
    await client.markAgentRead(agentId, { mutationId: randomUUID() }).catch(() => undefined);
    const { agent } = await client.getAgent(agentId);
    for (const subtask of agent.subtasks ?? []) await agentReadAll(client, subtask.id);
}

/** Everyone has read everything; only the take's own changes will be new. */
async function readAll(client) {
    const { tasks } = await client.listTasks().catch(() => ({ tasks: [] }));
    for (const task of tasks) {
        if (task.status !== "active") continue;
        await client.markTaskRead(task.id, { mutationId: randomUUID() }).catch(() => undefined);
        await agentReadAll(client, task.agent.id);
    }
    const { bots } = await client.listBots();
    for (const bot of bots) await agentReadAll(client, bot.agent.id);
    await client.markFeedReadAll?.({}).catch(() => undefined);
}

/** Releases Steve's subtasks' edits one at a time, so their counts climb while the take runs. */
function liveTicker() {
    const order = ["agent", "ios", "desktop"];
    const step = { agent: 1, desktop: 1, ios: 1 };
    let turn = 0;
    let timer;
    const advance = () => {
        for (let tries = 0; tries < order.length; tries++) {
            const key = order[turn++ % order.length];
            if (step[key] > world.liveSteps) continue;
            if (!world.hasReached(`live:${key}:${step[key]}`)) continue;
            world.release(`live:${key}:${step[key]}`);
            step[key] += 1;
            return true;
        }
        return false;
    };
    return {
        step,
        advance,
        start(intervalMs) {
            timer = setInterval(advance, intervalMs);
        },
        stop() {
            clearInterval(timer);
        },
    };
}

/**
 * Where a placeholder picture is drawn, in CSS pixels: the box of the avatar
 * inside `locator` (its image or placeholder canvas, when it has one), with
 * the avatar's corner radius. A picture that holds still for the whole take
 * can be swapped in the cut without shooting it again.
 */
async function pictureRect(locator) {
    return locator.evaluate((element) => {
        const avatar = element.querySelector('[data-happy-desktop-ui="avatar"]');
        if (!avatar) return null;
        const box = (avatar.querySelector("img, canvas") ?? avatar).getBoundingClientRect();
        return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            radius: getComputedStyle(avatar).borderTopLeftRadius,
        };
    });
}

/**
 * The take has no feed beat: Kirill watches his own task and Steve opens it
 * from his sidebar, so what it posts to their feeds is read as it lands.
 */
function feedKeptRead(clients) {
    let timer;
    return {
        start() {
            timer = setInterval(() => {
                for (const client of clients)
                    void client.markFeedReadAll({}).catch(() => undefined);
            }, 100);
        },
        stop() {
            clearInterval(timer);
        },
    };
}

const sidebarRow = (page, label) =>
    page.locator('[data-happy-desktop-ui="sidebar-item"]').filter({ hasText: label }).first();

export default {
    id: "team",
    title: "Team: a new task, and Steve has it on his phone",
    subtitle: "Kirill starts a task; Steve sees it and answers",
    transitions: "none",
    rawWindow: true,
    inferenceModes: ["screenplay"],
    world,
    protocolOpen: async (gym) => {
        personal = await personalOpen(gym);
        return personal;
    },
    patches: [
        { scope: "shared", source: "browser-daemon.patch" },
        { scope: "demo", source: "patches/gym-provider.patch" },
        { scope: "demo", source: "patches/artifact-site.patch" },
        // The window reserves macOS's traffic-light lane, as the packaged app does.
        { scope: "demo", source: "patches/window-controls.patch" },
        // Kirill's sign-in to Happy Core, from the gym instead of the browser page.
        { scope: "demo", source: "patches/server-sign-in.patch" },
        // The gym's accounts have no provider to read usage from; their account
        // panel leaves the usage line out instead of showing that failed read.
        { scope: "demo", source: "patches/account-usage.patch" },
    ],
    async run(demo, gym, { output } = {}) {
        world.rehearse();
        world.projectIdsSet(gym.world.projectIds);
        world.projectsRootSet(gym.paths.projects);
        const kirill = gym.client;
        steve = await gym.memberClient(world.steveKey);
        const [kirillProfile, steveProfile] = [
            await memberPrepare(kirill, world.team.members[0]),
            await memberPrepare(steve, world.team.members[1]),
        ];
        filmed.profiles = { kirill: kirillProfile, steve: steveProfile };
        // Steve's phone, paired once with Happy Core as Steve.
        const phone =
            process.env.TEAM_PHONE === "1"
                ? await phoneOpen({ output, work: join(output, ".work", "team") })
                : undefined;
        if (phone) {
            await phone.prepare();
            filmed.phonePairing = await phone.pair(steve);
            process.stdout.write(`    phone     paired (${filmed.phonePairing.paired})\n`);
        }
        if (await exists(world.assetPath("happy-core.png")))
            await nodeAvatarSet(kirill, "happy-core.png", world.seedMode);
        await botsPrepare(kirill);
        await doneTasksPrepare({ kirill, steve });
        await rehearsalsArchive(kirill);
        const live = await liveTaskPrepare(steve);
        filmed.liveTaskId = live.id;
        // Steve's subtasks are already under way when the take opens.
        const ticker = liveTicker();
        while (Object.values(ticker.step).some((step) => step <= 2))
            if (!ticker.advance()) await new Promise((settle) => setTimeout(settle, 200));
        for (const client of [kirill, steve, personal.client]) await readAll(client);

        const page = demo.page;
        // Kirill has used this app for months: he was welcomed long ago, here
        // and on Happy Core.
        await page.context().addInitScript(
            (keys) => {
                for (const key of keys)
                    localStorage.setItem(key, JSON.stringify({ welcomeAcknowledged: true }));
            },
            ["happy.welcome.v1", `happy.welcome.v1:${world.connectionId}`],
        );
        await page.setViewportSize(viewport);
        await page.reload({ waitUntil: "domcontentloaded" });
        await mkdir(output, { recursive: true });
        const shell = page.locator('[data-happy-desktop-ui="connection-shell"]');
        await shell.waitFor({ timeout: 60000 }).catch(async (error) => {
            await page.screenshot({ path: join(output, "failed.png") });
            await writeFile(join(output, "failed.txt"), await page.locator("body").innerText());
            throw error;
        });
        // Happy Core, the team's server, is the one on screen.
        const core = page.getByRole("button", { name: new RegExp(`^${world.team.node}, `, "u") });
        await core.waitFor({ timeout: 60000 });
        await core.click();
        await sidebarRow(page, world.liveTask.name).waitFor({ timeout: 60000 });
        for (const subtask of world.liveTask.subtasks)
            await sidebarRow(page, subtask.title)
                .filter({ hasText: /\+\d/u })
                .waitFor({ timeout: 60000 });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: join(output, "prepared-sidebar.png") });

        // The new task's page, its model list opened through the real control.
        await page.getByRole("button", { name: "New task", exact: true }).first().click();
        const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
        await composer.waitFor();
        const trigger = page
            .locator('[data-happy-desktop-ui="composer-model-control-trigger"]')
            .first();
        if (!(await trigger.innerText()).includes("Terra"))
            throw new Error("New work on Happy Core does not start on GPT-6.1 Terra.");
        await page.waitForTimeout(600);
        await trigger.click();
        await page
            .locator('[data-happy-desktop-ui="composer-model-control-model-setting"]')
            .first()
            .click();
        const service = page
            .locator('[data-happy-desktop-ui="composer-model-control-account-label"]')
            .filter({ hasText: world.onCamera.service })
            .first();
        await service.waitFor();
        const choice = page
            .locator('[data-happy-desktop-ui="composer-model-control-row"]')
            .filter({ hasText: world.onCamera.model })
            .first();
        await choice.waitFor();
        await page.mouse.move(viewport.width * 0.42, 40);
        await page.waitForTimeout(500);
        // The pictures still waiting for Kirill's exports, where they sit.
        // Kirill's personal server keeps its own, hidden sidebar with a Chief of Staff too.
        const shownRow = (label) =>
            page
                .locator('[data-happy-desktop-ui="sidebar-item"]:visible')
                .filter({ hasText: label })
                .first();
        const pictures = async () => ({
            "happy-core": await pictureRect(core),
            "chief-of-staff": await pictureRect(shownRow("Chief of Staff")),
            "disk-sweeper": await pictureRect(shownRow("Disk Sweeper")),
        });
        filmed.pictures = { opening: await pictures() };
        framing = await demo.framingPrepare(composer, { rawWindow: true });
        await writeFile(join(output, "framing.json"), JSON.stringify(framing, null, 2));
        await page.screenshot({ path: join(output, "opening.png") });
        await writeFile(join(output, "opening.txt"), await page.locator("body").innerText());
        if (process.env.TEAM_DEMO_PREPARE_ONLY === "1") {
            // A capture probe: the opening shot, held, to measure frame delivery.
            ticker.start(3000);
            await demo.hold(Number(process.env.TEAM_DEMO_PROBE_SECONDS ?? 0.5) * 1000);
            ticker.stop();
            await demo.finish();
            filmed.capture = demo.captureSummary(0);
            await writeFile(join(output, "filmed.json"), JSON.stringify(filmed, null, 2));
            return;
        }
        if (phone) {
            await phone.start({
                TEAM_TASK: world.taskTitle,
                TEAM_QUESTION: "how does it look?",
                TEAM_ANSWER: world.steveFeedback,
                // The driver idles after sending until the desktop is done.
                TEAM_TAIL_SECONDS: "120",
            });
            process.stdout.write("    phone     Steve's sidebar is up\n");
        }
        // Steve's counts climb for the whole take.
        ticker.start(3000);
        const feed = feedKeptRead([kirill, steve]);
        feed.start();

        // ---- On camera: the new task, with the model list open.
        try {
            cue("open", demo, phone);
            await demo.hold(1800);
            await demo.click(service, { after: 450 });
            const account = page
                .locator('[data-happy-desktop-ui="composer-model-control-account"]')
                .filter({ hasText: world.onCamera.account })
                .first();
            await demo.click(account, { after: 350 });
            cue("provider-chosen", demo, phone);
            await demo.click(choice, { after: 250 });
            cue("model-chosen", demo, phone);
            if (!(await trigger.innerText()).includes("Opus"))
                throw new Error("The pick did not land on Opus 5.5.");
            await demo.moveTo(composer, { duration: 800 });
            await demo.hold(500);
            await demo.click(composer, { after: 150 });
            await demo.pointerVisible(false);
            cue("typing-started", demo, phone);
            await demo.type(world.prompt, { perKey: 52, after: 0 });
            await demo.hold(450);
            await demo.press("Enter", { badge: 0, before: 0, after: 150 });
            cue("sent", demo, phone);

            // The task exists only now: its row arrives, named from the message.
            const row = sidebarRow(page, world.taskTitle);
            await until(demo, () => row.isVisible(), "the new task's row", 20000);
            cue("task-created", demo, phone, { rect: await row.boundingBox() });
            await demo.hold(350);
            cue("phone-enter", demo, phone);
            await until(demo, () => world.hasReached("read-bars"), "the first read", 20000);
            await demo.hold(1400);
            world.release("read-bars");
            cue("working", demo, phone);
            await until(demo, () => world.hasReached("read-voice"), "the second read", 20000);
            await demo.hold(1500);
            world.release("read-voice");
            await until(demo, () => world.hasReached("artifact"), "the preview", 20000);
            await demo.hold(1300);
            world.release("artifact");
            await until(demo, () => world.hasReached("reply"), "the preview's page", 30000);
            cue("preview", demo, phone);
            await demo.hold(2200);
            world.release("reply");
            await until(
                demo,
                () => page.getByText(world.previewReply.slice(0, 40)).first().isVisible(),
                "the reply",
                20000,
            );
            // Steve reads it on his phone and answers there. A rehearsal without
            // the phone sends his words through his own client instead.
            if (!phone) {
                await demo.hold(4000);
                const task = await taskFind(steve, world.taskTitle);
                const { mode } = await steve.getAgentMode(task.agent.id);
                await steve.sendMessage(task.agent.id, {
                    id: cuid(),
                    text: world.steveFeedback,
                    mode,
                });
            }
            const feedback = page.getByText(world.steveFeedback, { exact: false }).first();
            await until(demo, () => feedback.isVisible(), "Steve's feedback", 240000);
            cue("steve-feedback", demo, phone, { rect: await feedback.boundingBox() });
            await demo.hold(1200);
            // The agent takes Steve's note; its answer starts as the take ends.
            world.release("feedback");
            await demo.hold(2300);
            cue("outro", demo, phone);
            await demo.hold(2500);
            // The phone stays up to the last frame.
            cue("phone-exit", demo, phone);
            filmed.pictures.closing = await pictures();
        } finally {
            ticker.stop();
            feed.stop();
            await demo.finish();
        }
        const startedAtEpochMs = performance.timeOrigin + demo.timing.startedAt;
        filmed.startedAtEpochMs = startedAtEpochMs;
        filmed.frames = demo.timing.frames;
        filmed.capture = demo.captureSummary(0);
        if (phone) {
            await phone.finish();
            filmed.phoneMarks = phone.marks.map((mark) => ({
                ...mark,
                seconds: (mark.epochMs - startedAtEpochMs) / 1000,
            }));
            const at = (name) => filmed.phoneMarks.find((mark) => mark.name === name)?.seconds;
            for (const [mark, name] of [
                ["task-arrived", "phone-task"],
                ["task-opened", "phone-open"],
                ["typing", "phone-typing"],
                ["sent", "phone-sent"],
            ])
                if (at(mark) !== undefined) cues.push({ name, seconds: at(mark) });
            // The phone's movie, on the desktop's clock, and how smoothly the
            // Simulator delivered it while the phone was moving.
            const { report } = await phone.export({
                desktopStartedAtEpochMs: startedAtEpochMs,
                fps: demo.timing.fps,
                frames: demo.timing.frames,
                windows: [
                    {
                        name: "task arrives and opens",
                        from: at("task-arrived"),
                        to: at("task-opened") + 1.5,
                    },
                    { name: "Steve types", from: at("typing"), to: at("typed") },
                    { name: "Steve sends", from: at("typed"), to: at("sent") + 1.5 },
                ].filter((window) => window.from !== undefined && window.to > window.from),
            });
            filmed.phoneCapture = report;
            process.stdout.write(
                `    phone     ${report.cadence.map((window) => `${window.name} ${window.fps.toFixed(1)} fps`).join(", ")}\n`,
            );
        }
        filmed.kirillFeed = await kirill.getFeed({ limit: 5 }).catch((error) => String(error));
        cues.sort((a, b) => a.seconds - b.seconds);
        await writeFile(join(output, "cues.json"), JSON.stringify(cues, null, 4));
        // Where the desktop capture stalled mid-motion, for the cut to drop.
        await writeFile(
            join(output, "freezes.json"),
            JSON.stringify({ fps: demo.timing.fps, freezes: demo.captureFreezes() }, null, 2),
        );
        await writeFile(join(output, "sounds.json"), JSON.stringify(demo.sounds, null, 2));
        await writeFile(join(output, "filmed.json"), JSON.stringify(filmed, null, 2));
    },
    async evidence(page, gym) {
        return {
            fixture: {
                inference: "screenplay",
            },
            viewport,
            cues,
            filmed,
            framing,
        };
    },
};
