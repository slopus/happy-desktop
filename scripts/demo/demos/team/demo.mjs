import * as world from "./world.mjs";
import { cuid, nodeAvatarSet, personalOpen, photoSet } from "./personal.mjs";
import { phoneOpen } from "./phone.mjs";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

/**
 * The whole app, as one window: the server rail, the sidebar, and the new
 * task, in a golden rectangle 700 px tall, so the ending keeps the first
 * preview in view above Steve's note. Recorded at HAPPY_DEMO_DEVICE_SCALE=2.
 */
const viewport = { width: 1133, height: 700 };
/** Kirill's sidebar at the app's own width; a window that kept another is dragged back to it. */
const sidebarWidth = 288;

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

async function until(demo, read, label, timeout = 30000, interval = 200) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await Promise.resolve()
            .then(read)
            .catch(() => undefined);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Team demo: timed out waiting for ${label}.`);
        await demo.hold(interval);
    }
}

/**
 * The take is shot in two passes on one timeline, so each screen keeps its
 * frame rate: the phone's, with the Simulator running, and then the
 * desktop's, without it. Every moment both screens share is a beat. The
 * phone's pass records when each beat fell; the desktop's pass waits for the
 * same instant on its own clock before acting, so the phone's movie from the
 * first pass lands on the second's frames. `late` is how far the desktop's
 * pass missed a beat it could not reach in time.
 */
function beatsCreate(demo, schedule) {
    const seconds = () => demo.timing.frames / demo.timing.fps;
    const at = {};
    const late = {};
    return {
        at,
        late,
        async beat(name) {
            if (schedule) {
                const target = schedule[name];
                if (target === undefined)
                    throw new Error(`The phone's pass has no "${name}" beat.`);
                const wait = target - seconds();
                if (wait > 0) await demo.hold(wait * 1000);
                late[name] = seconds() - target;
            }
            at[name] = seconds();
        },
        /** A beat the phone set, at the take's second it fell on. */
        record(name, value) {
            at[name] = value;
        },
    };
}

/** About how long Steve's words take from his client to Kirill's window. */
const steveTripSeconds = 0.3;

/** How many bars the live preview's page draws on the desktop, once it has loaded. */
async function previewBars(page) {
    for (const frame of page.frames()) {
        if (!frame.url().includes("/__demo_artifact/")) continue;
        const count = await frame
            .locator("#speaking i")
            .count()
            .catch(() => 0);
        if (count > 0) return count;
    }
    return 0;
}

/** Whether a preview's bars are on screen whole, under nothing of the window's. */
async function previewInView(page) {
    for (const frame of page.frames()) {
        if (!frame.url().includes("/__demo_artifact/")) continue;
        const box = await frame
            .locator("#speaking")
            .boundingBox()
            .catch(() => null);
        if (!box) continue;
        const x = box.x + box.width / 2;
        const edges = [box.y + 2, box.y + box.height - 2];
        const hits = await page.evaluate(
            ([x, edges]) => edges.map((y) => document.elementFromPoint(x, y)?.tagName),
            [x, edges],
        );
        if (hits.every((tag) => tag === "IFRAME")) return true;
    }
    return false;
}

/** The phone's movie from its own pass, at exactly the desktop pass's length. */
async function phoneConform(source, target, frames, fps) {
    await execFile("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        source,
        "-vf",
        `fps=${fps},tpad=stop_mode=clone:stop=${frames}`,
        "-frames:v",
        String(frames),
        "-an",
        "-c:v",
        "libx264",
        "-crf",
        "12",
        "-preset",
        "slow",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        target,
    ]);
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

/**
 * Every project wears its icon from the world's definition, also on a world
 * seeded before that icon changed.
 */
async function projectPicturesSet(client, projectIds) {
    for (const repository of [world.repository, ...world.backgroundRepositories]) {
        const id = projectIds[repository.name];
        const { project } = await client.getProject(id);
        await client.setProjectAvatar(
            id,
            {
                contentType: "image/png",
                data: await readFile(join(import.meta.dirname, "../..", repository.avatar)),
            },
            { ifMatch: project.version },
        );
    }
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

/**
 * Each member's sidebar as world.sidebars has it, through their own client:
 * the tasks they left, their order, and the bots they hid, with the same
 * setting the apps write when a person hides a bot. Steve's live task is new
 * each take, so the order is set again each take.
 */
async function sidebarsArrange(clients) {
    for (const [key, sidebar] of Object.entries(world.sidebars)) {
        const client = clients[key];
        const { tasks, memberships } = await client.listTasks();
        const named = (name) => {
            const task = tasks.find((entry) => entry.name === name && entry.status === "active");
            if (!task) throw new Error(`${key}'s sidebar names no active task ${name}.`);
            return task;
        };
        for (const name of sidebar.left ?? []) {
            const task = named(name);
            if (memberships.some((membership) => membership.taskId === task.id))
                await client.leaveTask(task.id, { mutationId: randomUUID() });
        }
        let afterId = null;
        for (const name of sidebar.order ?? []) {
            const task = named(name);
            await client.reorderTask(task.id, { afterId, mutationId: randomUUID() });
            afterId = task.id;
        }
        const { bots } = await client.listBots();
        for (const username of sidebar.hiddenBots ?? []) {
            const bot = bots.find((entry) => entry.username === username);
            if (!bot) throw new Error(`${key}'s sidebar hides no bot ${username}.`);
            await client.saveUserSetting(`happy-desktop.bot.${bot.id}`, {
                value: { muted: false, hidden: true },
                mutationId: randomUUID(),
            });
        }
    }
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

/**
 * Releases a subtask's next edit, if it is waiting for it. Off camera it
 * takes Steve's finished parts to their end; on camera it releases iOS
 * server codes' edits one at a time, so its counts climb while the take runs.
 */
function liveTicker() {
    const step = { agent: 1, desktop: 1, ios: 1 };
    let timer;
    const advance = (key) => {
        if (step[key] > world.liveSteps[key]) return false;
        if (!world.hasReached(`live:${key}:${step[key]}`)) return false;
        world.release(`live:${key}:${step[key]}`);
        step[key] += 1;
        return true;
    };
    return {
        step,
        advance,
        start(intervalMs) {
            timer = setInterval(() => advance("ios"), intervalMs);
        },
        stop() {
            clearInterval(timer);
        },
    };
}

/**
 * Releases the filmed task's subtask's edits one at a time, each once the
 * subtask is waiting for it, so its row's counts climb while the take runs.
 */
function voiceTicker() {
    let step = 1;
    let timer;
    return {
        start(intervalMs) {
            timer = setInterval(() => {
                if (step > world.voiceEdits.length || !world.hasReached(`voice:${step}`)) return;
                world.release(`voice:${step}`);
                step += 1;
            }, intervalMs);
        },
        stop() {
            clearInterval(timer);
        },
    };
}

/**
 * The new task's subtask row's counts each time they change, on the take's
 * clock, read off the window.
 */
function countsFollow(page, label, seconds) {
    const seen = [];
    let timer;
    return {
        seen,
        start() {
            timer = setInterval(async () => {
                const stats = await sidebarRow(page, label)
                    .locator('[data-happy-desktop-ui="sidebar-item-change-stats"]')
                    .first()
                    .textContent({ timeout: 100 })
                    .catch(() => null);
                if (stats && stats !== seen.at(-1)?.stats)
                    seen.push({ seconds: Math.round(seconds() * 1000) / 1000, stats });
            }, 400);
        },
        stop() {
            clearInterval(timer);
        },
    };
}

/**
 * Steve's parts as the take opens: the agent's and the desktop's done, every
 * edit written and their last word said, so they rest idle with their final
 * counts; iOS server codes under way and still working. Team Servers itself
 * keeps working, coordinating.
 */
async function livePartsPrepare(steveClient, task, ticker) {
    const pause = () => new Promise((settle) => setTimeout(settle, 200));
    for (const key of world.liveIdle) {
        while (ticker.step[key] <= world.liveSteps[key]) if (!ticker.advance(key)) await pause();
        await wait(() => world.hasReached(`live:${key}:done`), `${key}'s last edit`, 120000);
        world.release(`live:${key}:done`);
    }
    while (ticker.step.ios <= world.liveStepsBefore) if (!ticker.advance("ios")) await pause();
    const titles = Object.fromEntries(
        world.liveTask.subtasks.map((subtask) => [subtask.key, subtask.title]),
    );
    return wait(
        async () => {
            const { agent } = await steveClient.getAgent(task.agent.id);
            const status = (key) =>
                agent.subtasks?.find((subtask) => subtask.title === titles[key])?.status;
            const parts = Object.fromEntries(Object.keys(titles).map((key) => [key, status(key)]));
            const ready =
                agent.status !== "idle" &&
                parts.ios !== undefined &&
                parts.ios !== "idle" &&
                world.liveIdle.every((key) => parts[key] === "idle");
            return ready && { coordinator: agent.status, parts };
        },
        "Steve's finished parts to rest",
        120000,
    );
}

/**
 * Every sidebar row's name against what stands at its trailing edge: whether
 * the name is cut short, and the room between its end and the diff stats,
 * in CSS pixels. Rows scrolled out of view are measured too.
 */
async function sidebarFit(page) {
    return page.evaluate(() => {
        const rows = [];
        for (const row of document.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')) {
            if (row.getClientRects().length === 0) continue;
            const label = row.querySelector('[data-happy-desktop-ui="sidebar-item-label"]');
            if (!label) continue;
            const stats = row.querySelector('[data-happy-desktop-ui="sidebar-item-change-stats"]');
            const trailing = row.querySelector('[data-happy-desktop-ui="sidebar-item-trailing"]');
            const range = document.createRange();
            range.selectNodeContents(label);
            const ink = range.getBoundingClientRect();
            const end = Math.min(ink.right, label.getBoundingClientRect().right);
            rows.push({
                name: label.textContent,
                stats: stats?.textContent ?? null,
                activity:
                    row.querySelector('[data-happy-desktop-ui="sidebar-item-activity"]')?.dataset
                        .activity ?? null,
                truncated: label.scrollWidth > label.clientWidth + 0.5,
                room: trailing
                    ? Math.round((trailing.getBoundingClientRect().left - end) * 10) / 10
                    : null,
            });
        }
        const sidebar = [
            ...document.querySelectorAll(
                '[data-happy-desktop-ui="app-shell-resize-handle"][data-edge="right"]',
            ),
        ]
            .find((handle) => handle.getClientRects().length > 0)
            ?.getAttribute("aria-valuenow");
        return {
            sidebarWidth: Number(sidebar),
            rows,
            fits: rows.every((row) => !row.truncated && (row.room === null || row.room >= 0)),
        };
    });
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
 * from his sidebar, so what it posts to their feeds is read as it lands: the
 * moment each one's own event stream says something is unread, and every
 * tenth of a second besides. The agents `agentIds` names, the new task's
 * subtask once it has one, are kept read the same way: its report lands in
 * the task both are watching.
 */
function feedKeptRead(clients, agentIds = () => []) {
    let timer;
    const stop = new AbortController();
    const follow = async (client) => {
        while (!stop.signal.aborted) {
            try {
                for await (const frame of client.streamEvents({ signal: stop.signal })) {
                    if (
                        frame.kind === "event" &&
                        frame.event.type === "feed.unread.updated" &&
                        frame.event.payload.unread > 0
                    )
                        void client.markFeedReadAll({}).catch(() => undefined);
                }
            } catch {
                // A dropped stream is followed again; the poll covers the gap.
            }
            await new Promise((settle) => setTimeout(settle, 100));
        }
    };
    return {
        start() {
            for (const client of clients) void follow(client);
            timer = setInterval(() => {
                for (const client of clients) {
                    void client.markFeedReadAll({}).catch(() => undefined);
                    for (const agentId of agentIds())
                        void client
                            .markAgentRead(agentId, { mutationId: randomUUID() })
                            .catch(() => undefined);
                }
            }, 100);
        },
        stop() {
            clearInterval(timer);
            stop.abort();
        },
    };
}

/** The filmed task's subtask, once it exists: its agent and its worktree. */
async function voiceSubtaskFind(client) {
    const task = await taskFind(client, world.taskTitle);
    if (!task) return undefined;
    const { agent } = await client.getAgent(task.agent.id);
    const subtask = agent.subtasks?.find((entry) => entry.title === world.voiceSubtask.title);
    return subtask && { id: subtask.id, workspaceId: subtask.workspaceId };
}

/**
 * The desktop asks Happy Core to watch a new worktree's Git state the moment
 * it is announced, while it is still initializing; Happy Agent v0.4.111
 * refuses that whole request, and the desktop asks again only on its
 * two-minute renewal, so the new row would show no counts for the rest of the
 * take. Once the worktree is ready, the same request the renewal sends, every
 * active project and workspace, goes to Happy Core early, through Kirill's
 * own client. Every count after it is the daemon's own scan.
 */
async function gitWatchRenew(client) {
    const { projects, workspaces } = await client.getDesktopBootstrap();
    const active = (entry) => entry.archivedAt === null && entry.status === "active";
    const workspaceIds = [
        ...new Set([
            ...projects.filter(active).map((project) => project.id),
            ...workspaces.filter(active).map((workspace) => workspace.id),
        ]),
    ];
    const { snapshots } = await client.watchGit({ workspaceIds });
    return { workspaces: workspaceIds.length, snapshots: Object.keys(snapshots).length };
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
        // The agent mentions Steve by his own user link.
        world.steveUserIdSet(steveProfile.userId);
        await nodeAvatarSet(kirill, world.team.picture, world.seedMode);
        await projectPicturesSet(kirill, gym.world.projectIds);
        await botsPrepare(kirill);
        await doneTasksPrepare({ kirill, steve });
        await rehearsalsArchive(kirill);
        const live = await liveTaskPrepare(steve);
        filmed.liveTaskId = live.id;
        await sidebarsArrange({ kirill, steve });
        // Steve's agent and desktop parts are done; iOS server codes is
        // already under way when the take opens.
        const ticker = liveTicker();
        filmed.liveParts = await livePartsPrepare(steve, live, ticker);
        // Steve's phone, paired once with Happy Core as Steve, once his
        // sidebar has what it shows.
        const phone =
            process.env.TEAM_PHONE === "1"
                ? await phoneOpen({ output, work: join(output, ".work", "team") })
                : undefined;
        if (phone) {
            await phone.prepare();
            filmed.phonePairing = await phone.pair(steve);
            process.stdout.write(`    phone     paired (${filmed.phonePairing.paired})\n`);
        }
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
        // Kirill's sidebar at the app's width: a window an earlier take left
        // narrower is dragged back by its own handle.
        const handle = page
            .locator('[data-happy-desktop-ui="app-shell-resize-handle"][data-edge="right"]:visible')
            .first();
        const handleBox = await handle.boundingBox();
        const handleFrom = Number(await handle.getAttribute("aria-valuenow"));
        if (handleFrom !== sidebarWidth) {
            const grip = {
                x: handleBox.x + handleBox.width / 2,
                y: handleBox.y + handleBox.height / 2,
            };
            await page.mouse.move(grip.x, grip.y);
            await page.mouse.down();
            await page.mouse.move(grip.x - (handleFrom - sidebarWidth) / 2, grip.y, { steps: 4 });
            await page.mouse.move(grip.x - (handleFrom - sidebarWidth), grip.y, { steps: 4 });
            await page.mouse.up();
            await page.mouse.move(viewport.width / 2, viewport.height / 2);
        }
        if (Number(await handle.getAttribute("aria-valuenow")) !== sidebarWidth)
            throw new Error(
                `The sidebar is ${await handle.getAttribute("aria-valuenow")} px wide, not ${sidebarWidth}.`,
            );
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
        const modelSetting = page
            .locator('[data-happy-desktop-ui="composer-model-control-model-setting"]')
            .first();
        await modelSetting.click();
        const modelRow = (label) =>
            page
                .locator('[data-happy-desktop-ui="composer-model-control-row"]')
                .filter({ hasText: label })
                .first();
        const scanFrom = modelRow(world.onCamera.scanFrom);
        const choice = modelRow(world.onCamera.model);
        await scanFrom.waitFor();
        await choice.waitFor();
        // The pictures still waiting for Kirill's exports, where they sit.
        // Kirill's personal server keeps its own, hidden sidebar with a Chief of Staff too.
        const shownRow = (label) =>
            page
                .locator('[data-happy-desktop-ui="sidebar-item"]:visible')
                .filter({ hasText: label })
                .first();
        const pictures = async () => ({
            "chief-of-staff": await pictureRect(shownRow("Chief of Staff")),
            "disk-sweeper": await pictureRect(shownRow("Disk Sweeper")),
        });
        filmed.pictures = { opening: await pictures() };
        filmed.sidebarFit = { opening: await sidebarFit(page) };
        if (!filmed.sidebarFit.opening.fits)
            throw new Error(
                `A sidebar name is cut short: ${JSON.stringify(filmed.sidebarFit.opening.rows)}`,
            );
        framing = await demo.framingPrepare(composer, { rawWindow: true });
        // The hand rests where it opened the list, on the Model row.
        await demo.pointerPlace({
            ...(await modelSetting.boundingBox()),
            offset: { x: 0.3, y: 0.5 },
        });
        await page.waitForTimeout(500);
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
        // The desktop's pass follows the phone's: its beats, its phone movie
        // and its phone's cues, from the phone pass's artifacts.
        const scheduleDirectory = process.env.TEAM_SCHEDULE;
        const schedule = scheduleDirectory
            ? JSON.parse(await readFile(join(scheduleDirectory, "beats.json"), "utf8"))
            : undefined;
        if (schedule && phone) throw new Error("The desktop's pass runs without the phone.");
        const beats = beatsCreate(demo, schedule?.beats);
        if (phone) {
            await phone.start({
                TEAM_TASK: world.taskTitle,
                TEAM_QUESTION: world.previewQuestion,
                TEAM_ANSWER: world.steveFeedback,
                // The driver idles after sending until the desktop is done.
                TEAM_TAIL_SECONDS: "120",
            });
            process.stdout.write("    phone     Steve's sidebar is up\n");
        }
        // Steve's counts climb for the whole take.
        ticker.start(3000);
        const voice = voiceTicker();
        const keptRead = [];
        const feed = feedKeptRead([kirill, steve], () => keptRead);
        feed.start();
        const takeSeconds = (epochMs) =>
            (epochMs - (performance.timeOrigin + demo.timing.startedAt)) / 1000;
        const counts = countsFollow(
            page,
            world.voiceSubtask.title,
            () => demo.timing.frames / demo.timing.fps,
        );

        // ---- On camera: the new task, with the model list open. The hand
        // glides into the list at its foot and up through every provider's
        // models to Opus, and the pick closes the menu.
        const rowPoint = async (row) => ({
            ...(await row.boundingBox()),
            offset: { x: 0.3, y: 0.5 },
        });
        try {
            cue("open", demo, phone);
            await demo.hold(1000);
            await beats.beat("scan");
            await demo.moveTo(await rowPoint(scanFrom), { duration: 600 });
            await demo.hold(150);
            cue("model-scan", demo, phone);
            await demo.moveTo(await rowPoint(choice), { duration: 1500 });
            await beats.beat("model");
            await demo.click(choice, { after: 250 });
            cue("model-chosen", demo, phone);
            if (!(await trigger.innerText()).includes("Opus"))
                throw new Error("The pick did not land on Opus 5.5.");
            await beats.beat("composer");
            await demo.click(composer, { duration: 650, after: 150 });
            await demo.pointerVisible(false);
            await beats.beat("typing");
            cue("typing-started", demo, phone);
            await demo.type(world.prompt, { perKey: 52, after: 0 });
            // Steve's phone rises beside the window on his own sidebar before
            // Kirill sends, so the task is seen arriving there.
            await demo.hold(150);
            await beats.beat("phone-enter");
            cue("phone-enter", demo, phone);
            await demo.hold(900);
            await beats.beat("sent");
            await demo.press("Enter", { badge: 0, before: 0, after: 150 });
            cue("sent", demo, phone);

            // The task exists only now: its row arrives, named from the message.
            const row = sidebarRow(page, world.taskTitle);
            await until(demo, () => row.isVisible(), "the new task's row", 20000, 50);
            cue("task-created", demo, phone, { rect: await row.boundingBox() });
            await until(demo, () => world.hasReached("read-bars"), "the first read", 20000);
            await demo.hold(1400);
            await beats.beat("read-bars");
            world.release("read-bars");
            cue("working", demo, phone);
            await until(demo, () => world.hasReached("read-voice"), "the second read", 20000);
            await demo.hold(1500);
            await beats.beat("read-voice");
            world.release("read-voice");
            // The code goes to a subtask in a worktree of happy, whose row
            // counts its lines as each edit lands.
            await until(demo, () => world.hasReached("subtask"), "the subtask", 20000);
            await demo.hold(900);
            await beats.beat("subtask");
            world.release("subtask");
            cue("subtask", demo, phone);
            counts.start();
            // Its worktree is ready once it has read both files: Happy Core
            // is asked to watch it, and the edits start.
            await until(demo, () => world.hasReached("voice:1"), "the subtask's reads", 30000, 50);
            const voiceSubtask = await until(
                demo,
                () => voiceSubtaskFind(kirill),
                "the subtask's worktree",
                10000,
                100,
            );
            keptRead.push(voiceSubtask.id);
            filmed.gitWatchRenewed = {
                seconds: demo.timing.frames / demo.timing.fps,
                workspaceId: voiceSubtask.workspaceId,
                ...(await until(
                    demo,
                    () => gitWatchRenew(kirill),
                    "Happy Core's Git watch",
                    10000,
                    200,
                )),
            };
            await demo.hold(700);
            voice.start(850);
            // Its last edit in, it reports; the task then builds the preview.
            await until(demo, () => world.hasReached("voice:done"), "the subtask's code", 30000);
            await demo.hold(600);
            await beats.beat("voice-done");
            world.release("voice:done");
            await until(demo, () => world.hasReached("artifact"), "the preview", 20000);
            await demo.hold(900);
            await beats.beat("artifact");
            world.release("artifact");
            await until(demo, () => world.hasReached("reply"), "the preview's page", 30000);
            cue("preview", demo, phone);
            await demo.hold(2200);
            await beats.beat("reply");
            world.release("reply");
            await until(
                demo,
                () => page.getByText(world.previewReplyLead.slice(0, 40)).first().isVisible(),
                "the reply",
                20000,
            );
            filmed.mention = await page
                .getByText(world.previewReplyLead.slice(0, 40))
                .first()
                .evaluate((element) => {
                    const block = element.closest("p, li, div") ?? element;
                    const bold = [...block.querySelectorAll("strong, b")].map(
                        (node) => node.textContent,
                    );
                    return { text: block.textContent, bold };
                })
                .catch((error) => String(error));
            // The first version is ready and the agent asks Steve by name:
            // his phone comes forward, and only then does he open the task
            // from his sidebar, check the preview and answer there. Without
            // the phone his words go through his own client: in the desktop's
            // pass so they land when they landed in the phone's, in a
            // rehearsal about when he would have typed them.
            await demo.hold(300);
            await beats.beat("phone-forward");
            cue("phone-forward", demo, phone);
            await demo.hold(900);
            await beats.beat("steve-open");
            if (phone) await phone.signal("open");
            if (!phone) {
                if (!schedule) await demo.hold(14000);
                await beats.beat("steve-send");
                const task = await taskFind(steve, world.taskTitle);
                const { mode } = await steve.getAgentMode(task.agent.id);
                await steve.sendMessage(task.agent.id, {
                    id: cuid(),
                    text: world.steveFeedback,
                    mode,
                });
            }
            const feedback = page.getByText(world.steveFeedback, { exact: false }).first();
            await until(demo, () => feedback.isVisible(), "Steve's feedback", 240000, 50);
            cue("steve-feedback", demo, phone, { rect: await feedback.boundingBox() });
            // The desktop's pass sends his words this long before they should
            // land, about what the trip from his client to the window takes.
            if (phone) beats.record("steve-send", cues.at(-1).seconds - steveTripSeconds);
            // Steve goes back to his sidebar, and his phone tucks aside again
            // while the agent takes his note.
            if (phone) {
                await until(
                    demo,
                    () => phone.marks.some((mark) => mark.name === "home"),
                    "Steve's sidebar again",
                    30000,
                    50,
                );
                await demo.hold(500);
            } else if (!schedule) await demo.hold(1500);
            await beats.beat("phone-back");
            cue("phone-tuck", demo, phone);
            await demo.hold(300);
            // The agent takes Steve's note: it rewrites the page with five
            // bars, shows it open again under his note, and says so.
            await beats.beat("feedback");
            world.release("feedback");
            await until(demo, () => world.hasReached("five-bars"), "the five-bar page", 20000, 50);
            filmed.fiveBarsShown = await until(
                demo,
                async () =>
                    (await previewBars(page)) === world.fiveBars && (await previewInView(page)),
                "the five-bar preview",
                10000,
                50,
            ).catch(() => false);
            cue("five-bars", demo, phone);
            await demo.hold(900);
            await beats.beat("five-bars");
            world.release("five-bars");
            await until(
                demo,
                () => page.getByText(world.fiveBarsReply).first().isVisible(),
                "the last word",
                20000,
                50,
            );
            cue("outro", demo, phone);
            // The desktop's preview, five bars, still in view above the answer.
            filmed.fiveBarsInView = await previewInView(page);
            filmed.pictures.closing = await pictures();
            // The result rests; the cut's loop dissolves from here into its
            // first frame, its narration already gone and Steve's phone,
            // still tucked, fading out with it.
            await demo.hold(2400);
            cue("settled", demo, phone);
            await demo.hold(650);
            await beats.beat("end");
        } catch (error) {
            // A take that fails still stops Steve's driver and the recorder.
            await phone?.finish().catch(() => undefined);
            throw error;
        } finally {
            ticker.stop();
            voice.stop();
            counts.stop();
            feed.stop();
            await demo.finish();
        }
        filmed.voiceCounts = counts.seen;
        // The subtask's worktree as Happy Core counts it, once the take is over.
        const voiceSubtask = await voiceSubtaskFind(kirill).catch(() => undefined);
        if (voiceSubtask?.workspaceId) {
            const { git } = await kirill.getWorkspaceGit(voiceSubtask.workspaceId);
            filmed.voiceWorktree = {
                workspaceId: voiceSubtask.workspaceId,
                insertions: git?.insertions,
                deletions: git?.deletions,
            };
        }
        // The sidebar at the take's highest counts: every name still whole.
        await page.waitForTimeout(1000);
        filmed.sidebarFit.closing = await sidebarFit(page);
        await page.screenshot({ path: join(output, "closing-sidebar.png") });
        const startedAtEpochMs = performance.timeOrigin + demo.timing.startedAt;
        filmed.startedAtEpochMs = startedAtEpochMs;
        filmed.frames = demo.timing.frames;
        filmed.capture = demo.captureSummary(0);
        const phoneCues = [];
        if (phone) {
            await phone.finish();
            filmed.phoneMarks = phone.marks.map((mark) => ({
                ...mark,
                seconds: takeSeconds(mark.epochMs),
            }));
            const at = (name) => filmed.phoneMarks.find((mark) => mark.name === name)?.seconds;
            for (const [mark, name] of [
                ["task-arrived", "phone-task"],
                ["task-opened", "phone-open"],
                ["typing", "phone-typing"],
                ["sent", "phone-sent"],
                ["home", "phone-home"],
            ])
                if (at(mark) !== undefined) phoneCues.push({ name, seconds: at(mark) });
            // Once the task has arrived in Steve's sidebar, long enough to be
            // seen there, his phone tucks aside while the agent works.
            if (at("task-arrived") !== undefined)
                phoneCues.push({ name: "phone-tuck", seconds: at("task-arrived") + 1.6 });
            // The phone's movie, on the desktop's clock, and how smoothly the
            // Simulator delivered it while the phone was moving.
            const { report } = await phone.export({
                desktopStartedAtEpochMs: startedAtEpochMs,
                fps: demo.timing.fps,
                frames: demo.timing.frames,
                windows: [
                    {
                        name: "task arrives",
                        from: at("task-arrived"),
                        to: at("task-arrived") + 1.5,
                    },
                    {
                        name: "Steve opens it",
                        from: at("task-opened"),
                        to: at("task-opened") + 1.5,
                    },
                    { name: "Steve types", from: at("typing"), to: at("typed") },
                    { name: "Steve sends and goes back", from: at("typed"), to: at("home") + 1 },
                ].filter((window) => window.from !== undefined && window.to > window.from),
            });
            filmed.phoneCapture = report;
            process.stdout.write(
                `    phone     ${report.cadence.map((window) => `${window.name} ${window.fps.toFixed(1)} fps`).join(", ")}\n`,
            );
            await writeFile(
                join(output, "beats.json"),
                JSON.stringify(
                    {
                        fps: demo.timing.fps,
                        frames: demo.timing.frames,
                        beats: beats.at,
                        phoneCues,
                        steveLandedSeconds: cues.find((entry) => entry.name === "steve-feedback")
                            ?.seconds,
                    },
                    null,
                    2,
                ),
            );
        }
        if (schedule) {
            // The phone's pass's movie and cues, on this pass's frames.
            await phoneConform(
                join(scheduleDirectory, "phone-screen.mp4"),
                join(output, "phone-screen.mp4"),
                demo.timing.frames,
                demo.timing.fps,
            );
            phoneCues.push(...schedule.phoneCues);
            const late = Object.values(beats.late);
            // Where Steve's words landed in each pass: the one moment the
            // desktop's pass does not set itself.
            const landed = cues.find((entry) => entry.name === "steve-feedback")?.seconds;
            filmed.sync = {
                phonePass: scheduleDirectory,
                phonePassFrames: schedule.frames,
                late: beats.late,
                worstLateSeconds: Math.max(0, ...late),
                steveLandedSeconds: landed,
                steveLandedDifferenceSeconds: landed - schedule.steveLandedSeconds,
            };
            process.stdout.write(
                `    sync      worst beat ${(filmed.sync.worstLateSeconds * 1000).toFixed(0)} ms late of ${late.length}; Steve's words ${(filmed.sync.steveLandedDifferenceSeconds * 1000).toFixed(0)} ms from the phone pass\n`,
            );
        }
        cues.push(...phoneCues);
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
