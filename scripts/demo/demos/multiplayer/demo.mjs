import * as world from "./world.mjs";
import { cuid, nodeAvatarSet, personalOpen, photoSet } from "./personal.mjs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

/**
 * The whole app as one window, the team demo's 1133×700, dark. Recorded at 2×
 * (`HAPPY_DEMO_DEVICE_SCALE=2`); the `multiplayer` composition shows the
 * window whole, so nothing is enlarged past what was captured.
 */
const requestedViewport = /^(\d+)x(\d+)$/u.exec(process.env.MULTIPLAYER_VIEWPORT ?? "");
const viewport = requestedViewport
    ? { width: Number(requestedViewport[1]), height: Number(requestedViewport[2]) }
    : { width: 1133, height: 700 };

/**
 * Which chapter this run films: `aware`, `bots` or `step-in`. `explore`
 * writes stills of the world instead.
 */
const shot = process.env.MULTIPLAYER_SHOT ?? "aware";

/** Kirill's own computer, opened beside the gym; the window runs on it. */
let personal;
let filmed = {};
let framing;
const cues = [];
/** `place` is what the composition may point at: `{ rect }` in CSS pixels of the window. */
const cue = (name, demo, place = {}) => {
    cues.push({ name, seconds: demo.timing.frames / demo.timing.fps, ...place });
};

/** A wait on camera: the take keeps rolling. */
async function until(demo, read, label, timeout = 30000, interval = 50) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await Promise.resolve()
            .then(read)
            .catch(() => undefined);
        if (value) return value;
        if (Date.now() > deadline)
            throw new Error(`Multiplayer demo: timed out waiting for ${label}.`);
        await demo.hold(interval);
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
        if (Date.now() > deadline)
            throw new Error(`Multiplayer demo: timed out preparing ${label}.`);
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

const exists = (path) =>
    access(path).then(
        () => true,
        () => false,
    );

/** A member's profile on Happy Core: their name, their picture, setup done. */
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

/** Every project wears its icon from the world's definition. */
async function projectPicturesSet(client, projectIds) {
    for (const repository of [world.repository, ...world.backgroundRepositories]) {
        const projectId = projectIds[repository.name];
        const { project } = await client.getProject(projectId);
        if (project.avatar) continue;
        await client.setProjectAvatar(
            projectId,
            {
                contentType: "image/png",
                data: await readFile(join(import.meta.dirname, "../..", repository.avatar)),
            },
            { ifMatch: project.version },
        );
    }
}

/** The team's bots, made once, each with its picture. */
async function botsPrepare(client) {
    for (const entry of world.bots) {
        const { bots } = await client.listBots();
        let bot = bots.find((candidate) => candidate.username === entry.username);
        if (!bot)
            ({ bot } = await client.createBot({
                name: entry.name,
                username: entry.username,
                isAdmin: false,
            }));
        const picture = world.assetPath(`${entry.username}.png`);
        if (!bot.avatar && (await exists(picture)))
            await client.setBotAvatar(
                bot.id,
                { contentType: "image/png", data: await readFile(picture) },
                { ifMatch: bot.version },
            );
    }
}

/** A bot by username, as the caller's own sign-in lists it. */
async function botFind(client, username) {
    const { bots } = await client.listBots();
    return bots.find((bot) => bot.username === username && bot.status === "active");
}

/**
 * What a bot is to the members of a team server, asked of the daemon itself
 * before anything is filmed: who lists which bots, and whether a member who
 * is not the owner may make one. The probe's bot is archived at once.
 */
async function botFacts(clients) {
    const facts = { listed: {}, memberCreate: undefined };
    for (const [key, client] of Object.entries(clients)) {
        const { bots } = await client.listBots();
        facts.listed[key] = bots
            .filter((bot) => bot.status === "active")
            .map((bot) => bot.name)
            .sort();
    }
    try {
        const { bot } = await clients.anna.createBot({
            name: "Probe",
            username: "probe_bot",
            isAdmin: false,
        });
        facts.memberCreate = { allowed: true };
        const seenByOwner = Boolean(await botFind(clients[world.owner], "probe_bot"));
        facts.memberCreate.listedForOwner = seenByOwner;
        await clients.anna.archiveBot(bot.id, { ifMatch: bot.version, mutationId: randomUUID() });
    } catch (error) {
        facts.memberCreate = { allowed: false, error: String(error?.message ?? error) };
    }
    return facts;
}

/**
 * Desktop Releases' conversation, made once per world: Steve asks and is
 * answered; Anna asks, and the bot's answer to her waits for the camera in
 * chapter 2, or is given at once and the bot waits on its build.
 */
async function botJobPrepare(clients) {
    const job = world.releaseBot;
    const owner = clients[world.owner];
    const bot = await botFind(owner, job.username);
    const agentId = bot.agent.id;
    if ((await owner.getMessages(agentId, { limit: 4 })).runs.length > 0) return bot;
    const [asked, follow] = job.turns;
    const theirs = async (key) => (await botFind(clients[key], job.username)).agent.id;
    await clients[asked.from].sendMessage(await theirs(asked.from), {
        id: cuid(),
        text: asked.text,
        mode: world.agentMode,
    });
    await wait(() => settled(owner, agentId), "Desktop Releases' first answer");
    await clients[follow.from].sendMessage(await theirs(follow.from), {
        id: cuid(),
        text: follow.text,
        mode: world.agentMode,
    });
    await wait(
        () => world.hasReached(shot === "bots" ? "bots:report" : "bots:reported"),
        "Desktop Releases to be at work",
    );
    return bot;
}

/** A task by name, among the caller's active ones. */
async function taskFind(client, name) {
    const { tasks } = await client.listTasks();
    return tasks.find((task) => task.name === name && task.status === "active");
}

/** Whether every run of an agent, and of each of its subtasks, has finished. */
async function settled(client, agentId, { subtask = false } = {}) {
    const { runs } = await client.getMessages(agentId, { limit: 16 });
    if (runs.length === 0 || runs.some((run) => run.status === "running")) return false;
    if (!subtask) return true;
    const { agent } = await client.getAgent(agentId);
    const child = agent.subtasks?.[0];
    if (!child) return false;
    const sub = await client.getMessages(child.id, { limit: 16 });
    return sub.runs.length > 0 && sub.runs.every((run) => run.status !== "running");
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
            // The task Kirill has open shows its mode under the composer.
            mode: entry.name === world.openTask ? world.agentMode : world.seedMode,
        });
        await wait(
            () => settled(client, task.agent.id, { subtask: Boolean(entry.subtask) }),
            `the earlier task ${entry.name}`,
            180000,
        );
        for (const more of entry.more ?? []) {
            const before = (await client.getMessages(task.agent.id, { limit: 16 })).runs.length;
            await client.sendMessage(task.agent.id, {
                id: cuid(),
                text: more.message,
                mode: world.agentMode,
            });
            const held = shot === "step-in" && entry.name === world.openTask;
            await wait(
                async () =>
                    held
                        ? world.hasReached("step:ask")
                        : (await client.getMessages(task.agent.id, { limit: 16 })).runs.length >
                              before && (await settled(client, task.agent.id)),
                `${entry.name}'s next turn`,
            );
        }
        process.stdout.write(`    task      ${entry.name}\n`);
    }
}

/** Archives a task and every subtask under it. */
async function taskArchive(client, task) {
    const { task: current } = await client.getTask(task.id);
    if (current.status === "archived") return;
    await client.archiveTask(current.id, { ifMatch: current.version, mutationId: randomUUID() });
}

/** What an earlier take's teammates started leaves the sidebar before the next take. */
async function rehearsalsArchive(client) {
    const keep = new Set(world.doneTasks.map((task) => task.name));
    const { tasks } = await client.listTasks();
    for (const task of tasks)
        if (task.status === "active" && !keep.has(task.name)) await taskArchive(client, task);
}

/**
 * Steve's live task, fresh for each take: its agent starts one subtask, which
 * writes its change, and both are still working when the take opens.
 */
async function liveTaskPrepare(client) {
    const { task } = await client.createTask({
        name: world.liveTask.name,
        mutationId: randomUUID(),
    });
    await client.sendMessage(task.agent.id, {
        id: cuid(),
        text: world.liveTask.message,
        mode: world.seedMode,
    });
    await wait(
        () => world.hasReached("live:coordinator") && world.hasReached("live:subtask"),
        "Steve's live task to be working",
        180000,
    );
    return task;
}

/** Kirill's sidebar in the world's order, through his own client. */
async function sidebarArrange(client) {
    const { tasks } = await client.listTasks();
    let afterId = null;
    for (const name of world.sidebarOrder) {
        const task = tasks.find((entry) => entry.name === name && entry.status === "active");
        if (!task) throw new Error(`Kirill's sidebar names no active task ${name}.`);
        await client.reorderTask(task.id, { afterId, mutationId: randomUUID() });
        afterId = task.id;
    }
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

/**
 * The take has no Activity beat, so what teammates' new tasks post to Kirill's
 * Activity is read as it lands: the moment his own event stream says something
 * is unread, and every tenth of a second besides. One thing moves per shot.
 */
function activityKeptRead(client) {
    let timer;
    const stop = new AbortController();
    const read = () => void client.markFeedReadAll({}).catch(() => undefined);
    const follow = async () => {
        while (!stop.signal.aborted) {
            try {
                for await (const frame of client.streamEvents({ signal: stop.signal }))
                    if (
                        frame.kind === "event" &&
                        frame.event.type === "feed.unread.updated" &&
                        frame.event.payload.unread > 0
                    )
                        read();
            } catch {
                // A dropped stream is followed again; the poll covers the gap.
            }
            await new Promise((settle) => setTimeout(settle, 100));
        }
    };
    return {
        start() {
            void follow();
            timer = setInterval(read, 100);
        },
        stop() {
            clearInterval(timer);
            stop.abort();
        },
    };
}

const sidebarRow = (page, label) =>
    page
        .locator('[data-happy-desktop-ui="sidebar-item"]:visible')
        .filter({ hasText: label })
        .first();

/** A sidebar row's box in CSS pixels of the window. */
async function rowRect(page, label) {
    const box = await sidebarRow(page, label).boundingBox();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined;
}

/** A teammate starts a task through their own sign-in; it is not awaited on camera. */
function arrivalStart(clients, arrival) {
    const client = clients[arrival.owner];
    return client
        .createTask({ name: arrival.name, mutationId: randomUUID() })
        .then(({ task }) =>
            client.sendMessage(task.agent.id, {
                id: cuid(),
                text: arrival.message,
                mode: world.seedMode,
            }),
        );
}

export default {
    id: "multiplayer",
    title: "Multiplayer: see who's working on what",
    subtitle: "A team, their agents and their bots on their own server",
    transitions: "none",
    rawWindow: true,
    // Its own composition stages it; it is not part of the changelog run.
    manualOnly: true,
    inferenceModes: ["screenplay"],
    world,
    protocolOpen: async (gym) => {
        personal = await personalOpen(gym);
        return personal;
    },
    patches: [
        { scope: "shared", source: "browser-daemon.patch" },
        // The gym's own provider is not one a person has; the picker leaves it out.
        { scope: "demo", source: "../team/patches/gym-provider.patch" },
        // The window reserves macOS's traffic-light lane, as the packaged app does.
        { scope: "demo", source: "../team/patches/window-controls.patch" },
        // Kirill's sign-in to Happy Core, from the gym instead of the browser page.
        { scope: "demo", source: "../team/patches/server-sign-in.patch" },
        // The gym's accounts have no provider to read usage from.
        { scope: "demo", source: "../team/patches/account-usage.patch" },
    ],
    async run(demo, gym, { output } = {}) {
        world.rehearse();
        world.shotSet(shot);
        world.projectIdsSet(gym.world.projectIds);
        world.projectsRootSet(gym.paths.projects);
        const clients = { [world.owner]: gym.client };
        for (const member of world.team.members)
            if (!member.owner) clients[member.key] = await gym.memberClient(member.key);
        const kirill = clients[world.owner];
        filmed.shot = shot;
        filmed.profiles = {};
        for (const member of world.team.members) {
            const profile = await memberPrepare(clients[member.key], member);
            filmed.profiles[member.key] = { userId: profile.userId, name: profile.name };
            world.userIdSet(member.name, profile.userId);
        }
        await nodeAvatarSet(kirill, world.team.picture, world.seedMode);
        await projectPicturesSet(kirill, gym.world.projectIds);
        await botsPrepare(kirill);
        if (shot !== "aware") {
            filmed.botFacts = await botFacts(clients);
            process.stdout.write(`    bots      ${JSON.stringify(filmed.botFacts)}\n`);
        }
        await doneTasksPrepare(clients);
        await rehearsalsArchive(kirill);
        const live = await liveTaskPrepare(clients[world.liveTask.owner]);
        filmed.liveTaskId = live.id;
        await sidebarArrange(kirill);
        const pending = [];
        if (shot !== "aware") {
            // After chapter 1: its two tasks are already in the sidebar,
            // working, and Desktop Releases is in the middle of its job.
            for (const arrival of world.arrivals) {
                pending.push(arrivalStart(clients, arrival));
                await wait(
                    () => world.hasReached(`arrival:${arrival.name}`),
                    `${arrival.name} to be working`,
                );
            }
            const bot = await botJobPrepare(clients);
            filmed.botAgentId = bot.agent.id;
        }
        for (const client of [...Object.values(clients), personal.client]) await readAll(client);

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
        const server = page.getByRole("button", {
            name: new RegExp(`^${world.team.node}, `, "u"),
        });
        await server.waitFor({ timeout: 60000 });
        await server.click();
        await sidebarRow(page, world.liveTask.subtask.title)
            .filter({ hasText: /\+\d/u })
            .waitFor({ timeout: 60000 });
        // Kirill is in his own task.
        await sidebarRow(page, world.openTask).click();
        const opened = world.doneTasks.find((task) => task.name === world.openTask);
        await page
            .getByText((opened.more?.at(-1) ?? opened).reply)
            .first()
            .waitFor({ timeout: 30000 });
        // His hand is off the window and off the keyboard: no caret blinks in the composer.
        await page.mouse.move(viewport.width - 2, viewport.height - 2);
        await page.evaluate(() => document.activeElement?.blur?.());
        await page.waitForTimeout(1500);
        for (const client of [...Object.values(clients), personal.client]) await readAll(client);
        await page.waitForTimeout(800);

        const still = async (name) => {
            await page.waitForTimeout(1200);
            await page.screenshot({ path: join(output, `still-${name}.png`) });
            await writeFile(
                join(output, `still-${name}.txt`),
                await page.locator("body").innerText(),
            );
        };
        const finish = async () => {
            cue("end", demo);
            await demo.finish();
            // The still after the take: the hand off the window, no hover left behind.
            await page.evaluate(() => window.__happyDemo?.pointer(0, 0, 0, false));
            await page.mouse.move(viewport.width - 2, viewport.height - 2);
            await page.waitForTimeout(400);
            await page.screenshot({ path: join(output, "ending.png") });
            await writeFile(join(output, "ending.txt"), await page.locator("body").innerText());
            await writeFile(join(output, "filmed.json"), JSON.stringify(filmed, null, 2));
            await writeFile(join(output, "cues.json"), JSON.stringify(cues, null, 2));
        };

        if (shot === "explore") {
            await still("team");
            for (const bot of ["Chief of Staff", ...world.bots.map((entry) => entry.name)]) {
                await sidebarRow(page, bot).click();
                await still(`bot-${bot.toLowerCase().replaceAll(" ", "-")}`);
            }
            await sidebarRow(page, "Activity").click();
            await still("activity");
            await sidebarRow(page, world.openTask).click();
            framing = await demo.framingPrepare(page.locator("body"), { rawWindow: true });
            await demo.hold(300);
            await demo.finish();
            await writeFile(join(output, "filmed.json"), JSON.stringify(filmed, null, 2));
            return;
        }

        // A row's or a message's arrival is filmed in slow motion: while it
        // comes in, the browser plays the page's own animations at `slow` of
        // their speed (the DevTools animation-speed control), so the camera
        // gets the app's 160 ms glide in more frames than it gives at 60 a
        // second. Nothing is redrawn, and the rate is back to 1 once the
        // arrival rests. Nothing that is not an arrival is slowed.
        const slow = Number(process.env.MULTIPLAYER_SLOW ?? 0.33);
        const slowHold = Number(process.env.MULTIPLAYER_SLOW_HOLD_MS ?? 560);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Animation.enable");
        const rate = (playbackRate) => cdp.send("Animation.setPlaybackRate", { playbackRate });
        filmed.slowMotion = { rate: slow, holdMs: slowHold, arrivals: [] };
        const arrivalFilm = async (name, start, arrived) => {
            if (slow !== 1) await rate(slow);
            await start();
            cue(`${name}-sent`, demo);
            await until(demo, arrived, name, 30000, 16);
            cue(name, demo);
            if (slow !== 1) {
                await demo.hold(slowHold);
                await rate(1);
            }
            filmed.slowMotion.arrivals.push(name);
        };
        const activity = activityKeptRead(kirill);
        framing = await demo.framingPrepare(page.locator("body"), { rawWindow: true });
        await writeFile(join(output, "framing.json"), JSON.stringify(framing, null, 2));

        if (shot === "aware") {
            // Chapter 1, "See who's working on what": Kirill is in his own task
            // and touches nothing. Steve, then Leo, start tasks from their own
            // sign-ins, and each one is in Kirill's sidebar as it starts.
            await demo.pointerVisible(false);
            await page.screenshot({ path: join(output, "opening.png") });
            cue("open", demo);
            const lead = Number(process.env.MULTIPLAYER_LEAD_MS ?? 450);
            const beat = Number(process.env.MULTIPLAYER_BEAT_MS ?? 800);
            const tail = Number(process.env.MULTIPLAYER_TAIL_MS ?? 2200);
            activity.start();
            await demo.hold(lead);
            for (const [index, arrival] of world.arrivals.entries()) {
                await arrivalFilm(
                    `arrival:${arrival.name}`,
                    async () => void pending.push(arrivalStart(clients, arrival)),
                    () => sidebarRow(page, arrival.name).count(),
                );
                cue(`arrival-settled:${arrival.name}`, demo, {
                    rect: await rowRect(page, arrival.name),
                });
                await demo.hold(index === world.arrivals.length - 1 ? tail : beat);
            }
        }

        if (shot === "bots") {
            // Chapter 2, "Shared bots for the standing jobs": Kirill opens
            // Desktop Releases. Steve and Anna have both written in it, and it
            // answers Anna while he looks.
            const job = world.releaseBot;
            // His hand rests on the empty top of the pane, over no message.
            await demo.pointerPlace({ x: 452, y: 168 });
            await page.screenshot({ path: join(output, "opening.png") });
            cue("open", demo);
            activity.start();
            await demo.hold(450);
            await demo.click(sidebarRow(page, job.name), { after: 0 });
            cue("bot-opened", demo);
            await until(
                demo,
                () => page.getByText(job.turns[1].text).first().isVisible(),
                "Desktop Releases' conversation",
            );
            await demo.hold(120);
            world.release("bots:report");
            cue("report-released", demo);
            await until(
                demo,
                () => page.getByText("Windows is still building.").first().isVisible(),
                "Desktop Releases' report",
            );
            cue("report", demo);
            await demo.hold(2600);
        }

        if (shot === "step-in") {
            // Chapter 3, "Step in when it's your call": the agent in Kirill's
            // task asks Steve by name; Steve answers from his own sign-in, and
            // his words land under his name and face.
            const step = world.stepIn;
            await demo.pointerVisible(false);
            await page.screenshot({ path: join(output, "opening.png") });
            cue("open", demo);
            activity.start();
            await demo.hold(600);
            world.release("step:ask");
            await until(
                demo,
                () => page.getByText(step.askTail).first().isVisible(),
                "the agent's question",
            );
            cue("ask", demo);
            await demo.hold(1300);
            const steve = clients[step.from];
            const task = await taskFind(steve, world.openTask);
            await arrivalFilm(
                "answer",
                async () =>
                    void pending.push(
                        steve.sendMessage(task.agent.id, {
                            id: cuid(),
                            text: step.answer,
                            mode: world.agentMode,
                        }),
                    ),
                () => page.getByText(step.answer).first().isVisible(),
            );
            await until(
                demo,
                () => page.getByText(step.reply).first().isVisible(),
                "the agent's reply",
            );
            cue("reply", demo);
            await demo.hold(1800);
        }

        await finish();
        activity.stop();
        await cdp.detach().catch(() => undefined);
        await Promise.all(pending.map((promise) => promise.catch(() => undefined)));
    },
    async evidence() {
        return { fixture: { inference: "screenplay" }, viewport, cues, filmed, framing };
    },
};
