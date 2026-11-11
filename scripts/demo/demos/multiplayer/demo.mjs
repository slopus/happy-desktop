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
const viewport = { width: 1133, height: 700 };

/** Which chapter this run films; `explore` writes stills of the world instead. */
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
            await wait(
                async () =>
                    (await client.getMessages(task.agent.id, { limit: 16 })).runs.length > before &&
                    (await settled(client, task.agent.id)),
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
        world.projectIdsSet(gym.world.projectIds);
        world.projectsRootSet(gym.paths.projects);
        const clients = { [world.owner]: gym.client };
        for (const member of world.team.members)
            if (!member.owner) clients[member.key] = await gym.memberClient(member.key);
        const kirill = clients[world.owner];
        filmed.profiles = {};
        for (const member of world.team.members) {
            const profile = await memberPrepare(clients[member.key], member);
            filmed.profiles[member.key] = { userId: profile.userId, name: profile.name };
        }
        await nodeAvatarSet(kirill, world.team.picture, world.seedMode);
        await projectPicturesSet(kirill, gym.world.projectIds);
        await botsPrepare(kirill);
        await doneTasksPrepare(clients);
        await rehearsalsArchive(kirill);
        const live = await liveTaskPrepare(clients[world.liveTask.owner]);
        filmed.liveTaskId = live.id;
        await sidebarArrange(kirill);
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

        // Chapter 1, "See who's working on what": Kirill is in his own task and
        // touches nothing. Steve, then Leo, start tasks from their own
        // sign-ins, and each one is in Kirill's sidebar as it starts.
        await demo.pointerVisible(false);
        framing = await demo.framingPrepare(page.locator("body"), { rawWindow: true });
        await writeFile(join(output, "framing.json"), JSON.stringify(framing, null, 2));
        await page.screenshot({ path: join(output, "opening.png") });
        filmed.rows = { opening: {} };
        for (const name of world.sidebarOrder)
            filmed.rows.opening[name] = await rowRect(page, name);
        const sidebar = page.locator('[data-happy-desktop-ui="sidebar-item"]:visible').first();
        filmed.sidebar = await sidebar.evaluate((row) => {
            const pane = row.closest('[data-happy-desktop-ui="sidebar"]') ?? row.parentElement;
            const box = pane.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height };
        });
        cue("open", demo);
        const lead = Number(process.env.MULTIPLAYER_LEAD_MS ?? 450);
        const beat = Number(process.env.MULTIPLAYER_BEAT_MS ?? 1900);
        const tail = Number(process.env.MULTIPLAYER_TAIL_MS ?? 2600);
        await demo.hold(lead);
        const pending = [];
        for (const [index, arrival] of world.arrivals.entries()) {
            pending.push(arrivalStart(clients, arrival));
            cue(`arrival-sent:${arrival.name}`, demo);
            await until(
                demo,
                () => sidebarRow(page, arrival.name).isVisible(),
                `${arrival.name} in Kirill's sidebar`,
            );
            cue(`arrival:${arrival.name}`, demo, { rect: await rowRect(page, arrival.name) });
            await demo.hold(index === world.arrivals.length - 1 ? tail : beat);
        }
        cue("end", demo);
        await demo.finish();
        await Promise.all(pending);
        await page.screenshot({ path: join(output, "ending.png") });
        await writeFile(join(output, "ending.txt"), await page.locator("body").innerText());
        await writeFile(join(output, "filmed.json"), JSON.stringify(filmed, null, 2));
        await writeFile(join(output, "cues.json"), JSON.stringify(cues, null, 2));
    },
    async evidence() {
        return { fixture: { inference: "screenplay" }, viewport, cues, filmed, framing };
    },
};
