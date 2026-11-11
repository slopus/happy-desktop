import * as world from "./world.mjs";
import { cuid, nodeAvatarSet, personalOpen, photoSet } from "./personal.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";

const sharp = createRequire(import.meta.url)("sharp");

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
 * Which chapter this run films: `aware`, `activity`, `bots`, `artifacts` or
 * `step-in`. `explore` writes stills of the world instead.
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
/** The still of the app's placeholder picture `index`, from the app being filmed. */
function placeholderPath(index) {
    const app = process.env.HAPPY_DEMO_APP_SOURCE ?? join(import.meta.dirname, "../../../..");
    return join(
        app,
        "packages/happy-desktop-ui/src/assets/avatar-placeholders",
        `avatar-placeholder-${String(index).padStart(3, "0")}.webp`,
    );
}

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
        if (!bot.avatar)
            await client.setBotAvatar(
                bot.id,
                {
                    contentType: "image/png",
                    data: await sharp(placeholderPath(entry.placeholder)).png().toBuffer(),
                },
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
        const { bot } = await clients.andrew.createBot({
            name: "Probe",
            username: "probe_bot",
            isAdmin: false,
        });
        facts.memberCreate = { allowed: true };
        const seenByOwner = Boolean(await botFind(clients[world.owner], "probe_bot"));
        facts.memberCreate.listedForOwner = seenByOwner;
        await clients.andrew.archiveBot(bot.id, { ifMatch: bot.version, mutationId: randomUUID() });
    } catch (error) {
        facts.memberCreate = { allowed: false, error: String(error?.message ?? error) };
    }
    return facts;
}

/**
 * Desktop Releases' conversation, made once per world: Steve asks and is
 * answered; Andrew asks, and the bot's answer to him waits for the camera in
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
    // Up to chapter 3, Andrew has not written yet: he does on camera.
    if (shot === "activity" || shot === "bots") return bot;
    await clients[follow.from].sendMessage(await theirs(follow.from), {
        id: cuid(),
        text: follow.text,
        mode: world.agentMode,
    });
    await wait(() => world.hasReached("bots:reported"), "Desktop Releases to be at work");
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
        // The owner's own follow-ups; a teammate's come later (`followUpsPrepare`).
        for (const more of entry.more ?? []) if (!more.from) await turnSend(clients, task, entry, more);
        process.stdout.write(`    task      ${entry.name}\n`);
    }
}

/** One more message in an earlier task, and its agent's whole answer. */
async function turnSend(clients, task, entry, more) {
    const client = clients[entry.owner];
    const before = (await client.getMessages(task.agent.id, { limit: 16 })).runs.length;
    await clients[more.from ?? entry.owner].sendMessage(task.agent.id, {
        id: cuid(),
        text: more.message,
        mode: world.agentMode,
    });
    await wait(
        async () =>
            (await client.getMessages(task.agent.id, { limit: 16 })).runs.length > before &&
            (await settled(client, task.agent.id)),
        `${entry.name}'s next turn`,
    );
}

/**
 * Teammates writing in each other's earlier tasks, through their own sign-ins:
 * Steve asks Leeroy's benchmark for the 50k run, and its agent publishes the
 * artifact's next version. In chapter 2 this is the newest thing in Activity.
 */
async function followUpsPrepare(clients) {
    for (const entry of world.doneTasks)
        for (const more of entry.more ?? []) {
            if (!more.from) continue;
            const task = await taskFind(clients[entry.owner], entry.name);
            await turnSend(clients, task, entry, more);
            process.stdout.write(`    follow    ${entry.name}: ${more.from}\n`);
        }
}

/** The shared todo list, and every teammate's todo in it, each through their own sign-in. */
async function checklistPrepare(clients) {
    const list = world.checklist;
    const { surface } = await clients[list.owner].createSurface({
        type: "todo",
        name: list.name,
        mutationId: randomUUID(),
    });
    for (const todo of list.todos) {
        const client = clients[todo.from];
        await client.joinSurface(surface.id, { mutationId: randomUUID() }).catch(() => undefined);
        await client.createTodo(surface.id, { text: todo.text, mutationId: randomUUID() });
    }
    process.stdout.write(`    surface   ${list.name}\n`);
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
        // Chapter 5 shows this task's composer, and its mode under it.
        mode: shot === "step-in" ? world.agentMode : world.seedMode,
    });
    await wait(
        () =>
            world.hasReached("live:coordinator") &&
            world.hasReached("live:subtask") &&
            (shot !== "step-in" || world.hasReached("step:ask")),
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
    return client.createTask({ name: arrival.name, mutationId: randomUUID() }).then(({ task }) =>
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
        // The window reserves macOS's traffic-light lane, as the packaged app
        // does: the team demo's patch, re-cut for the Desktop preview this films.
        { scope: "demo", source: "patches/window-controls.patch" },
        // Kirill's sign-in to Happy Core, from the gym instead of the browser page.
        { scope: "demo", source: "../team/patches/server-sign-in.patch" },
        // The gym's accounts have no provider to read usage from.
        { scope: "demo", source: "../team/patches/account-usage.patch" },
        // The recorder's browser reads an artifact's pages through the daemon,
        // as the desktop's artifact scheme does.
        { scope: "demo", source: "../team/patches/artifact-site.patch" },
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
        const pending = [];
        // From chapter 2 on, chapter 1's three tasks are working.
        const arrivalsSettle = async () => {
            for (const arrival of world.arrivals) {
                pending.push(arrivalStart(clients, arrival));
                await wait(
                    () => world.hasReached(`arrival:${arrival.name}`),
                    `${arrival.name} to be working`,
                );
            }
        };
        // Chapter 2 is about what was made: there chapter 1's tasks are older
        // than the artifacts, and the newest thing is the team's checklist.
        await rehearsalsArchive(kirill);
        if (shot === "activity") await arrivalsSettle();
        const live = await liveTaskPrepare(clients[world.liveTask.owner]);
        filmed.liveTaskId = live.id;
        await doneTasksPrepare(clients);
        await followUpsPrepare(clients);
        if (shot !== "activity") await checklistPrepare(clients);
        await sidebarArrange(kirill);
        if (shot !== "aware") {
            if (shot !== "activity") await arrivalsSettle();
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
        // The window's clock reads late morning: the take is shot with
        // HAPPY_DEMO_LOCAL_HOUR=10.5, which sets the browser's time zone.
        filmed.timezone = await page.evaluate(
            () => Intl.DateTimeFormat().resolvedOptions().timeZone,
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
        // Where each chapter finds Kirill: where the one before left him.
        const opening = {
            aware: world.openTask,
            activity: world.openTask,
            bots: "Activity",
            artifacts: world.releaseBot.name,
            "step-in": world.stepIn.task,
            explore: world.openTask,
        }[shot];
        await sidebarRow(page, opening).click();
        if (opening === world.openTask) {
            const opened = world.doneTasks.find((task) => task.name === world.openTask);
            await page
                .getByText((opened.more?.at(-1) ?? opened).reply)
                .first()
                .waitFor({ timeout: 30000 });
        }
        // His hand is off the window and off the keyboard: no caret blinks in the composer.
        await page.mouse.move(viewport.width - 2, viewport.height - 2);
        await page.evaluate(() => document.activeElement?.blur?.());
        await page.waitForTimeout(1500);
        for (const client of [...Object.values(clients), personal.client]) await readAll(client);
        // Chapter 2: the team fills the checklist after Kirill last looked.
        if (shot === "activity") {
            await checklistPrepare(clients);
            await sidebarRow(page, world.checklist.name).waitFor({ timeout: 30000 });
        }
        // Chapter 4 opens the benchmark on camera; it was opened once before, so
        // it draws at once instead of loading.
        if (shot === "artifacts") {
            await sidebarRow(page, "Artifacts").click();
            await page.getByText(world.artifacts[1].title).first().click();
            await page.getByText("History").first().waitFor({ timeout: 30000 });
            await page.waitForTimeout(1500);
            await sidebarRow(page, opening).click();
            await page.mouse.move(viewport.width - 2, viewport.height - 2);
        }
        await page.waitForTimeout(1500);

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
            await sidebarRow(page, "Artifacts").click();
            await still("artifacts");
            await page.getByText(world.artifacts[0].title).first().click();
            await still("artifact-open");
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
        // Activity is the subject of chapters 1 and 2; after them it stays read.
        if (shot !== "aware" && shot !== "activity") activity.start();
        framing = await demo.framingPrepare(page.locator("body"), { rawWindow: true });
        await writeFile(join(output, "framing.json"), JSON.stringify(framing, null, 2));
        /** Where a thing is on screen now, in CSS pixels, for the cut's camera. */
        const place = async (locator) => {
            const box = await locator.boundingBox().catch(() => null);
            return box ? { rect: box } : {};
        };
        // The hand, where a chapter has one, rests on the empty middle of the pane.
        const rest = { x: Math.round(viewport.width * 0.62), y: Math.round(viewport.height * 0.2) };
        // Where the hand goes once it is done: the empty top-left corner of the
        // title bar, where it hovers nothing, out of every pushed-in view.
        const away = { x: 40, y: 14 };
        /** The hand glides to a target, dwells a quarter second, and clicks it. */
        const choose = async (target, name) => {
            await demo.moveTo(target);
            await demo.hold(250);
            cue(`${name}-click`, demo);
            await demo.click(target, { after: 0 });
        };

        if (shot === "aware") {
            // Chapter 1, "See who's working on what": Kirill is in his own task
            // and touches nothing. Scoteezy, Leeroy and Xander start tasks from their
            // own sign-ins, and each one is in Kirill's sidebar as it starts;
            // his Activity counts them.
            await demo.pointerVisible(false);
            await page.screenshot({ path: join(output, "opening.png") });
            cue("open", demo);
            const beats = [1900, 1900, 2600];
            await demo.hold(Number(process.env.MULTIPLAYER_LEAD_MS ?? 300));
            for (const [index, arrival] of world.arrivals.entries()) {
                await arrivalFilm(
                    `arrival:${arrival.name}`,
                    async () => void pending.push(arrivalStart(clients, arrival)),
                    () => sidebarRow(page, arrival.name).count(),
                );
                cue(`arrival-settled:${arrival.name}`, demo, {
                    rect: await rowRect(page, arrival.name),
                });
                await demo.hold(beats[index]);
            }
        }

        if (shot === "activity") {
            // Chapter 2, "Catch up on what shipped": Kirill opens Activity. On top
            // is the checklist his teammates filled in, then the benchmark Leeroy's
            // agent published, as a post with its summary and cover.
            const row = sidebarRow(page, "Activity");
            await demo.pointerPlace(rest);
            await page.screenshot({ path: join(output, "opening.png") });
            cue("open", demo, await place(row));
            await demo.hold(700);
            await choose(row, "activity");
            await until(
                demo,
                () => page.getByText(world.artifacts[1].summary).first().isVisible(),
                "the Activity page",
            );
            cue("activity-open", demo, await place(page.getByText(world.checklist.name).nth(1)));
            await demo.hold(500);
            await demo.moveTo(away);
            cue("pointer-away", demo);
            await demo.hold(4400);
        }

        if (shot === "bots") {
            // Chapter 3, "Shared bots for the standing jobs": Kirill opens
            // Desktop Releases, where Steve's request is already answered. Andrew
            // writes in it from his own sign-in, and it answers him.
            const job = world.releaseBot;
            const [, follow] = job.turns;
            await demo.pointerPlace(rest);
            await page.screenshot({ path: join(output, "opening.png") });
            cue("open", demo);
            await demo.hold(700);
            await choose(sidebarRow(page, job.name), "bot");
            await until(
                demo,
                () => page.getByText(job.turns[0].reply).first().isVisible(),
                "Desktop Releases' conversation",
            );
            cue("bot-opened", demo);
            await demo.moveTo(away);
            // Steve's request and its answer stand a while before Andrew writes.
            await demo.hold(2000);
            const andrew = clients[follow.from];
            const theirs = (await botFind(andrew, job.username)).agent.id;
            await arrivalFilm(
                "message",
                async () =>
                    void pending.push(
                        andrew.sendMessage(theirs, {
                            id: cuid(),
                            text: follow.text,
                            mode: world.agentMode,
                        }),
                    ),
                () => page.getByText(follow.text).first().isVisible(),
            );
            await until(
                demo,
                () => page.getByText("Windows is still building.").first().isVisible(),
                "Desktop Releases' answer",
            );
            cue("report", demo);
            await demo.hold(3200);
        }

        if (shot === "artifacts") {
            // Chapter 4, "Share what your agents make": Kirill opens Artifacts,
            // where his teammates' agents' pages are, each under the task it
            // came from, and opens one.
            const artifact = world.artifacts.find((entry) => entry.task === "Sync Benchmarks");
            await demo.pointerPlace(rest);
            await page.screenshot({ path: join(output, "opening.png") });
            cue("open", demo);
            await demo.hold(700);
            await choose(sidebarRow(page, "Artifacts"), "artifacts");
            const entry = page.getByText(artifact.title).first();
            await until(demo, () => entry.isVisible(), "the Artifacts page");
            cue("artifacts-open", demo);
            await demo.hold(2600);
            await choose(entry, "artifact");
            await until(
                demo,
                () => page.getByText("History").first().isVisible(),
                "the artifact's page",
            );
            cue("artifact-open", demo);
            // The hand leaves the page before the camera reads it.
            await demo.hold(300);
            await demo.moveTo(away);
            cue("pointer-away", demo);
            await demo.hold(3600);
        }

        if (shot === "step-in") {
            // Chapter 5, "Step in when it's your call": Kirill is in Steve's
            // task. Its agent asks him by name; he answers, and it takes his answer.
            const step = world.stepIn;
            const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
            // The hand waits just above the composer, clear of the question, so
            // its glide to the composer is short.
            const box = await composer.boundingBox();
            await demo.pointerPlace({
                x: Math.round(box.x + box.width * 0.62),
                y: Math.round(box.y - 30),
            });
            await page.screenshot({ path: join(output, "opening.png") });
            cue("open", demo, await place(composer));
            await demo.hold(Number(process.env.MULTIPLAYER_ASK_AT_MS ?? 2300));
            world.release("step:ask");
            cue("ask-released", demo);
            await until(
                demo,
                () => page.getByText(step.askTail).first().isVisible(),
                "the agent's question",
            );
            // Where the question stands once asked, for the cut.
            cue("ask", demo, await place(page.getByText(step.askTail).first()));
            await demo.hold(600);
            await demo.click({ ...box, offset: { x: 0.5, y: 0.5 } });
            cue("typing", demo);
            await demo.type(step.answer, { perKey: 80 });
            await arrivalFilm(
                "answer",
                () => page.keyboard.press("Enter"),
                () => page.getByText(step.answer).first().isVisible(),
            );
            // Sent, the hand leaves the composer and the camera's frame.
            await demo.moveTo(away);
            await until(
                demo,
                () => page.getByText(step.reply).first().isVisible(),
                "the agent's reply",
            );
            cue("reply", demo);
            await demo.hold(3000);
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
