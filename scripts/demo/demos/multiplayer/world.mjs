// The multiplayer video's world: the team demo's Happy Core, restaged for
// two short chapters. Happy Core is a team-mode Happy Agent with three
// members. Kirill, its owner, sits at the desktop: his own computer is a
// second, standalone Happy Agent (personal.mjs) that reaches Happy Core
// through a real server connection by URL, and the window runs on it.
//
// The cast is three real people wearing their public GitHub pictures at
// Kirill's request: Kirill (bra1ndump), Steve (ex3ndr) and Scoteezy. Every
// exchange on camera is between Kirill and Steve; Scoteezy owns tasks that
// arrive and show as faces in Activity. Their work is the screenplay's. The
// job bots wear the app's placeholder pictures.
//
// What teammates' agents publish is the daemon's own `create_artifact` and
// `update_artifact`, each agent on its own artifacts, in full access inside
// this isolated gym (Kirill's authorization, 2026-11-12); the pages and
// covers are `artifacts/covers.mjs`'s look-alikes. Nothing here is read from the real Happy Core
// server, a real session, or anyone's `~/.happy`; the bots' jobs are named
// after the kind of standing work a team gives a bot, and every word they
// say is this screenplay's.
//
// The screenplay answers every inference request either daemon makes. It
// chooses the agents' words, tool calls and pace; the tools themselves are
// the daemon's. The take's own beats wait at named gates the director
// releases.
import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { coverFile, covers, coverPage } from "./artifacts/covers.mjs";

const execFile = promisify(execFileCallback);

export const id = "multiplayer";

const teamAsset = (name) => `demos/team/assets/${name}`;
/** A fixture picture: this demo's own, or one the team demo already has. */
export const assetPath = (name) => {
    const own = join(import.meta.dirname, "assets", name);
    return existsSync(own) ? own : join(import.meta.dirname, "../team/assets", name);
};

// ------------------------------------------------------------------ people

/** Happy Core's members, keyed by the subject their sign-in token names. */
export const team = {
    node: "Happy Core",
    picture: "happy-desktop.png",
    members: [
        {
            key: "kirill",
            owner: true,
            name: "Kirill",
            email: "kirill@happy.example",
            role: "Founder",
            photo: "kirill.jpg",
        },
        {
            key: "steve",
            name: "Steve",
            email: "steve@happy.example",
            role: "Founder",
            photo: "steve.jpg",
        },
        {
            key: "scoteezy",
            name: "Scoteezy",
            email: "scoteezy@happy.example",
            role: "Engineer",
            photo: "scoteezy.jpg",
        },
    ],
};
export const owner = "kirill";
export const personalName = "Kirill's Mac mini";
export const connectionId = "happy-core";

// The picker lists what a real installation with these subscriptions lists.
export const models = {
    codex: ["openai/gpt-6.1-terra", "openai/gpt-6-astra"],
    claude: ["anthropic/opus-5-5", "anthropic/sonnet-5-5"],
    grok: ["xai/grok-4.7"],
};
/** What new work starts on. */
export const defaults = { providerId: "claude", modelId: "anthropic/opus-5-5", effort: "medium" };
/** Every scripted agent's mode. */
export const agentMode = {
    effort: "medium",
    modelId: "anthropic/opus-5-5",
    providerId: "claude",
    permissionMode: "auto",
    serviceTier: null,
};
/** Off camera, earlier work runs without reviews: nothing is filmed of it. */
export const seedMode = { ...agentMode, permissionMode: "full_access" };

// ------------------------------------------------------------------ code
//
// Background diffs are fixture code: plausible files nobody opens on camera,
// sized so the sidebar's live Git counts read like a team's real work.

const words = [
    "session",
    "server",
    "token",
    "voice",
    "frame",
    "layout",
    "overlay",
    "roster",
    "composer",
    "message",
    "feed",
    "row",
    "state",
    "pairing",
    "device",
    "stream",
    "theme",
    "header",
    "anchor",
    "reply",
    "draft",
    "queue",
    "retry",
];
function rng(seed) {
    let state = 2166136261;
    for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    return () => {
        state = Math.imul(state ^ (state >>> 15), 2246822507);
        state = Math.imul(state ^ (state >>> 13), 3266489909);
        state ^= state >>> 16;
        return (state >>> 0) / 4294967296;
    };
}
const pick = (random, list) => list[Math.floor(random() * list.length)];
const camel = (random, count) =>
    Array.from({ length: count }, (_, index) => {
        const word = pick(random, words);
        return index === 0 ? word : word[0].toUpperCase() + word.slice(1);
    }).join("");

/** `count` lines of TypeScript or Swift, deterministic for `seed`. */
function codeLines(seed, count, language = "ts") {
    const random = rng(seed);
    const lines = [];
    while (lines.length < count) {
        const name = camel(random, 3);
        const argument = camel(random, 2);
        const field = camel(random, 2);
        lines.push(
            ...(language === "swift"
                ? [
                      `    func ${name}(_ ${argument}: ${pick(random, ["Int", "String", "Bool", "CGFloat"])}) -> Bool {`,
                      `        guard ${argument} != ${field}.${camel(random, 1)} else { return false }`,
                      `        ${field}.${camel(random, 2)} = ${argument}`,
                      `        return ${field}.${camel(random, 1)}(${argument})`,
                      "    }",
                      "",
                  ]
                : [
                      `export function ${name}(${argument}: ${pick(random, ["string", "number", "boolean"])}): boolean {`,
                      `    if (${argument} === ${field}.${camel(random, 1)}) return false;`,
                      `    ${field}.${camel(random, 2)} = ${argument};`,
                      `    return ${field}.${camel(random, 1)}(${argument});`,
                      "}",
                      "",
                  ]),
        );
    }
    return lines.slice(0, count);
}
const fileOf = (lines) => `${lines.join("\n")}\n`;

/**
 * One file's change: `base` lines in the fixture repository, of which the
 * subtask keeps all but `deleted`, then adds `added` new lines.
 */
function change(path, seed, { base, deleted, added, language }) {
    const original = codeLines(`${seed}:base`, base, language);
    return {
        path,
        before: fileOf(original),
        after: fileOf([
            ...original.slice(0, base - deleted),
            ...codeLines(`${seed}:new`, added, language),
        ]),
    };
}

const changes = {
    sendFixes: change(
        "packages/happy-ios/Sources/HappyUI/Chat/ChatComposerOverlay.swift",
        "ios-send-fixes",
        { base: 240, deleted: 80, added: 879, language: "swift" },
    ),
    signIn: change(
        "packages/happy-agent-modules/sources/connections/impl/ServerSignIn.ts",
        "agent-sign-in",
        { base: 120, deleted: 24, added: 398 },
    ),
};

/** The component the open task reads, as the core demo's fixture has it. */
export const barsPath = "sources/components/VoiceBars.tsx";
const barsSource = await readFile(
    join(import.meta.dirname, "../core/assets/VoiceBars.tsx.txt"),
    "utf8",
);

// ------------------------------------------------------------------ repositories

export const repository = {
    name: "happy",
    avatar: teamAsset("happy.png"),
    files: {
        "README.md": "# Happy\n\nRemote access to your coding agents.\n",
        [barsPath]: barsSource,
        [changes.sendFixes.path]: changes.sendFixes.before,
    },
};
export const backgroundRepositories = [
    {
        name: "happy-desktop",
        avatar: teamAsset("happy-desktop.png"),
        files: {
            "README.md":
                "# Happy Desktop\n\nProjects, workspaces, and conversations in one place.\n",
        },
    },
    {
        name: "happy-agent",
        avatar: teamAsset("happy-agent.png"),
        files: {
            "README.md": "# Happy Agent\n\nThe daemon behind every Happy app.\n",
            [changes.signIn.path]: changes.signIn.before,
        },
    },
];
// Work happens in tasks and their subtasks, not in project sessions.
export const worktrees = [];
export const sessions = [];
export function turnFind() {
    return undefined;
}

// ------------------------------------------------------------------ bots

/**
 * The team's bots beside its Chief of Staff: one per standing job. Each
 * wears one of the app's own placeholder pictures, the one numbered here. The
 * app would pick one by a hash of the bot's ID, which is new in every take,
 * so the take sets it and the bots look the same in every chapter.
 */
export const bots = [
    { name: "Desktop Releases", username: "desktop_releases", placeholder: 12 },
    { name: "Mobile Releases", username: "mobile_releases", placeholder: 3 },
    { name: "Alerts", username: "alerts", placeholder: 17 },
    { name: "Growth", username: "growth", placeholder: 20 },
    { name: "Product Health", username: "product_health", placeholder: 7 },
];

/**
 * Desktop Releases' conversation: Kirill and Steve wrote in it, each through
 * their own sign-in, and it is in the middle of the job when the take opens.
 * `report` is what it says on camera, to whoever the take names.
 */
export const releaseBot = {
    username: "desktop_releases",
    name: "Desktop Releases",
    turns: [
        {
            from: "kirill",
            text: "Cut a preview once main is green.",
            reply: "Main is green. Cutting the preview now: macOS first, then Windows.",
        },
        {
            from: "steve",
            text: "Tell me when it's out and I'll post the changelog.",
            report: (mention) =>
                `${mention}, will do. macOS is signed and notarized. Windows is still building.`,
        },
    ],
};

// ------------------------------------------------------------------ tasks

/**
 * Earlier tasks, oldest first, in the order they are made: Activity lists
 * them newest first, below everything published after them. Each owner made
 * it and asked for it, and where it names a subtask its agent put the work
 * there, in the named repository. The two working tasks, Task List Speed and
 * Team Servers (`speedTask`, `liveTask`), are made after them.
 */
export const doneTasks = [
    {
        owner: "kirill",
        name: "iOS Overlay Layout",
        message: "The composer overlay jumps on send on iOS. Fix the layout.",
        subtask: "iOS Send Fixes",
        project: "happy",
        workspace: "ios-send-fixes",
        change: changes.sendFixes,
        reply: "iOS Send Fixes keeps the composer's frame through the send and the keyboard's return.",
    },
    {
        owner: "kirill",
        name: "Voice waveform",
        message: "Add an animated waveform to the voice agent.",
        reply: "On it. I'm reading the voice bar components first, then I'll put the waveform in.",
        // What he adds, and what it answers: plain words, so the pane he has open holds still.
        more: [
            {
                message: "Keep it small. It sits next to the mute button.",
                reply: "Noted: one row, at the mute button's height.",
            },
        ],
    },
    {
        owner: "scoteezy",
        name: "Sidebar Unread Dots",
        message: "A row's unread dot pushes long task names around. Keep the name still.",
        reply: "The dot sits on the row's picture now, so the name never moves.",
    },
    {
        owner: "steve",
        name: "Bot Permissions",
        message: "Draft who can read, write to and change a team bot.",
        reply: "Members read and write by default; settings sit behind an owner's switch.",
    },
    {
        owner: "steve",
        name: "Message Retry Queue",
        message: "Review the message retry queue before it merges.",
        reply: "It passes with one medium finding: a send cut off mid-upload can be retried twice.",
    },
];

/**
 * Scoteezy's task that is working when the take opens: its subtask, List
 * cache, writes the cache and holds its report until chapter 2 releases it;
 * the parent then publishes its report and ends.
 */
export const speedTask = {
    owner: "scoteezy",
    name: "Task List Speed",
    message: "Make the sidebar's task list paint faster with 10,000 tasks.",
    plan: "The list query runs on every paint. Caching it in a subtask.",
    subtask: { title: "List cache", project: "happy", workspace: "list-cache" },
    cachePath: "sources/components/taskListCache.ts",
    report: "List cache is in: first paint drops from 420 ms to 140 ms.",
    published: "Published: Task list, 3× faster.",
};

/**
 * What teammates' agents publish, oldest first, between the earlier work and
 * chapter 1's arrivals: each an agent's own artifacts, published from the task
 * or bot named, each followed by its later versions. `from` is who asks.
 */
export const publications = [
    {
        bot: "mobile_releases",
        from: "steve",
        text: "Track the mobile preview and post where it stands.",
        artifacts: [{ cover: "mobile", versions: 14 }],
        reply: "iOS is in TestFlight review and Android is on the internal track. I'll look again in 20 minutes.",
        waits: true,
    },
    {
        task: "Bot Permissions",
        from: "steve",
        text: "Post the draft for the team.",
        artifacts: [{ cover: "design", versions: 5 }],
        reply: "The draft is posted.",
    },
    { checklist: true },
    {
        task: "Sidebar Unread Dots",
        from: "scoteezy",
        text: "Post a screenshot of the rows.",
        artifacts: [{ cover: "screenshot", versions: 1 }],
        reply: "Posted, with the rows read and unread.",
    },
    {
        bot: "desktop_releases",
        from: "kirill",
        text: "Run QA on the desktop preview and post the receipt.",
        artifacts: [
            { utility: "qaSteps", versions: 1 },
            { cover: "qa", versions: 0 },
        ],
        reply: "Preview QA passes on macOS, Windows and Linux.",
    },
    { live: true, artifacts: [{ cover: "progress", versions: 8 }] },
    {
        task: "Message Retry Queue",
        from: "steve",
        text: "Post the review.",
        artifacts: [{ cover: "review", versions: 2 }],
        reply: "The review is posted.",
    },
];

/** A utility artifact: a Markdown page and its summary, with no cover. */
export const utilities = {
    qaSteps: {
        title: "Utility: preview QA steps",
        summary: "The steps the QA receipt runs, one per line, for the next preview.",
        page: "# Preview QA steps\n\n1. Install the preview over the last stable.\n2. Sign in to a team server.\n3. Open a teammate's task and read it.\n4. Update to the next preview from the menu.\n",
    },
};

/**
 * The team's shared todo list: Steve makes it, and he and Scoteezy add todos
 * through their own sign-ins, so its Activity entry carries both their faces.
 */
export const checklist = {
    name: "Launch checklist",
    owner: "steve",
    todos: [
        { from: "steve", text: "Cut the 2026.11 preview" },
        { from: "scoteezy", text: "Ship the task list cache" },
        { from: "steve", text: "Review the retry queue fix" },
        { from: "scoteezy", text: "Re-run QA on Windows" },
        { from: "steve", text: "Update the team server docs" },
        { from: "scoteezy", text: "Post the preview changelog" },
    ],
};

/**
 * Steve's task that is working when the take opens, and stays working: its
 * agent starts one subtask, then publishes its progress report when the take
 * asks it to, and keeps working.
 */
export const liveTask = {
    owner: "steve",
    name: "Team Servers",
    message: "Sign in to team servers from the agent, the desktop and iOS.",
    plan: "Three parts, one per repository: the agent's sign-in, the desktop's sessions, and iOS server codes. Starting with the agent.",
    subtask: {
        title: "Agent sign-in",
        project: "happy-agent",
        workspace: "agent-sign-in",
        change: changes.signIn,
    },
};

/**
 * What teammates start on camera, through their own sign-ins, in this order.
 * Each stays working for as long as the take runs. `plan` is the agent's first
 * word, where Kirill opens the task to read it.
 */
export const arrivals = [
    {
        owner: "scoteezy",
        name: "Android Push Fixes",
        message: "Pushes stop on Android after the app sits in the background. Find out why.",
    },
    {
        owner: "steve",
        name: "Offline Drafts",
        message: "Keep composer drafts when the app goes offline, on desktop and on phones.",
        plan: "Drafts will save on the device first and sync when the server is back. I'm reading the composer's state and the sync queue before I change anything.",
    },
];

/**
 * Chapter 3, in the task Kirill has open: its agent asks Steve by name, Steve
 * answers through his own sign-in, and the agent takes his answer.
 */
export const stepIn = {
    /** The task Kirill has open in chapter 5: Steve's, still working. */
    task: "Team Servers",
    // One line in the wide take's pane, so nothing above it moves while it streams.
    ask: (mention) =>
        `${mention}, should team servers use the same account as the desktop, or their own?`,
    /** The words of the question a take can wait for: the mention is drawn by the app. */
    askTail: "or their own?",
    /** What the agent said when it handed the first part to its subtask. */
    waiting: "Waiting on the agent's sign-in.",
    from: "kirill",
    answer: "Same account.",
    reply: "Same account it is. Wiring the desktop's sign-in into it now.",
};

/** Kirill's sidebar on Happy Core, top to bottom, before anyone starts anything. */
export const sidebarOrder = [
    "Task List Speed",
    "Voice waveform",
    "Team Servers",
    "Message Retry Queue",
    "Bot Permissions",
    "Sidebar Unread Dots",
    "iOS Overlay Layout",
];
/** The task Kirill has open. */
export const openTask = "Voice waveform";

// ------------------------------------------------------------------ gates

const gates = new Map();
const reached = new Set();
/** Gates opened before anything reached them: whatever reaches one later goes straight through. */
const opened = new Set();
export function release(name) {
    if (!gates.has(name)) opened.add(name);
    gates.get(name)?.();
    gates.delete(name);
}
export function hasReached(name) {
    return reached.has(name);
}
/** Every gate opens: a take that ends lets held requests finish. */
export function close() {
    for (const resolveGate of gates.values()) resolveGate();
    gates.clear();
    reached.clear();
    opened.clear();
}
/** Forgets which gates were reached, for the next take on the same world. */
export function rehearse() {
    close();
}
async function gate(name) {
    reached.add(name);
    if (opened.delete(name)) return;
    await new Promise((settle) => gates.set(name, settle));
}

/**
 * Which chapter is being filmed. Off camera every reply is immediate; the
 * chapter's own replies wait at its gates.
 */
let shot = "aware";
export function shotSet(value) {
    shot = value;
}

// ------------------------------------------------------------------ screenplay

const text = (value) => ({ type: "text", text: value });
const tool = (name, args) => ({ type: "toolCall", name, arguments: args });
/** A reply on camera, at a pace a viewer reads: about a word every 0.1 s. */
const streamed = (content, timing = {}) => ({
    content,
    textDeltaChunkSize: 6,
    textDeltaDelayMs: 100,
    toolCallDeltaDelayMs: 120,
    completionDelayMs: 60,
    ...timing,
});
/**
 * A reply that opens with a mention. The app shows a link's opening bracket
 * until its `](` arrives, so the first delta must carry `[Name](` whole; the
 * link's address then streams unseen while the reply still reads "Working".
 */
const addressed = (content) => streamed(content, { textDeltaChunkSize: 9, textDeltaDelayMs: 170 });
/** Off camera nothing waits: every delta at once. */
const quick = (content) => ({
    content,
    textDeltaChunkSize: 4096,
    textDeltaDelayMs: 0,
    toolCallDeltaDelayMs: 0,
    thinkingDeltaDelayMs: 0,
    completionDelayMs: 0,
});

const textOf = (message) =>
    typeof message?.content === "string"
        ? message.content
        : (message?.content ?? [])
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n");

/**
 * The conversation's latest person or agent turn, and how many replies came
 * after it. A coordinator's message reaches its subtask as an `agent` turn
 * that names the sender first.
 */
function turnOf(messages) {
    const at = messages.findLastIndex(
        (message) => message.role === "user" || message.role === "agent",
    );
    return {
        text: textOf(messages[at]).replace(/^Message from agent \w+:\n\n/u, ""),
        answered: messages.slice(at + 1).filter((message) => message.role === "assistant").length,
        after: messages.slice(at + 1),
    };
}

/** Projects by name, as the team daemon registered them; the take fills it in. */
const projectIds = new Map();
export function projectIdsSet(ids) {
    for (const [name, value] of Object.entries(ids)) projectIds.set(name, value);
}
/** Where Happy Core's fixture repositories live. */
let projectsRoot;
export function projectsRootSet(path) {
    projectsRoot = path;
}

/** Members' user IDs on Happy Core by name, for an agent to mention them by; the take fills it in. */
const userIds = new Map();
export function userIdSet(name, userId) {
    userIds.set(name, userId);
}
/** The app's own mention of a member: a link to their user. */
function mention(name) {
    const userId = userIds.get(name);
    if (!userId) throw new Error(`The take named no user for ${name}.`);
    return `[${name}](happy://users/${userId})`;
}

/**
 * The open task's own folder holds a checkout of the fixture happy repository
 * by the time its agent reads it: finding the repository is not this take's
 * story, and Auto mode keeps reads inside the task's folder.
 */
async function checkoutPrepare(system) {
    const folder = system.match(/Primary working directory: (.+)/u)?.[1]?.trim();
    if (!folder || !projectsRoot) throw new Error("The open task named no folder of its own.");
    const checkout = join(folder, "happy");
    const present = await access(checkout).then(
        () => true,
        () => false,
    );
    if (!present)
        await execFile("git", ["clone", "--quiet", join(projectsRoot, "happy"), checkout], {
            env: {
                PATH: "/usr/bin:/bin:/opt/homebrew/bin",
                GIT_CONFIG_NOSYSTEM: "1",
                HOME: folder,
            },
        });
    return checkout;
}

/** A whole new version of a fixture file, written beside the world for an agent to copy in. */
async function staged(name, content) {
    const path = join(dirname(projectsRoot), "staged", name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return path;
}
const copyCall = (from, to) =>
    tool("Bash", { command: `cp '${from}' '${to}'`, description: `Update ${to}` });

/** An artifact's ID, as the daemon's answer to `create_artifact` names it. */
function artifactIdOf(result) {
    const found = result.match(
        /(?:\bid |artifactId"?\s*[:=]\s*"?|happy-artifact id="|happy:\/\/artifacts\/)([a-z0-9]{20,32})\b/u,
    );
    if (!found) throw new Error(`create_artifact named no artifact: ${result}`);
    return found[1];
}

/**
 * The calls one agent makes to publish its artifacts: each one's
 * `create_artifact`, then one `update_artifact` per later version, each a new
 * copy of its page. `results` are the daemon's answers to the calls so far.
 */
async function publishCall(artifacts, index, results) {
    const calls = artifacts.flatMap((artifact, at) => [
        { artifact, at, version: 0 },
        ...Array.from({ length: artifact.versions }, (_, step) => ({
            artifact,
            at,
            version: step + 1,
        })),
    ]);
    const call = calls[index];
    if (!call) return undefined;
    const { artifact, version } = call;
    const utility = artifact.utility ? utilities[artifact.utility] : undefined;
    const name = artifact.cover ?? artifact.utility;
    const entry = utility ? "index.md" : "index.html";
    const body = utility ? utility.page : coverPage(artifact.cover);
    const page = await staged(
        `artifacts/${name}-${version}.${utility ? "md" : "html"}`,
        version === 0 ? body : `${body}\n${utility ? "" : `<!-- ${version} -->`}\n`,
    );
    if (version > 0) {
        const created = calls.findIndex((entry) => entry.at === call.at && entry.version === 0);
        return tool("update_artifact", {
            artifactId: artifactIdOf(results[created]),
            files: [{ fromPath: page, path: entry }],
        });
    }
    if (utility)
        return tool("create_artifact", {
            type: "markdown",
            title: utility.title,
            summary: utility.summary,
            files: [{ fromPath: page, path: entry }],
        });
    const cover = await staged(`artifacts/${name}.webp`, await readFile(coverFile(name)));
    return tool("create_artifact", {
        type: "html",
        title: covers[name].title,
        summary: covers[name].summary,
        files: [
            { fromPath: page, path: entry },
            { fromPath: cover, path: "cover.webp" },
        ],
        cover: "cover.webp",
    });
}

/** The daemon's answers to an agent's calls in this turn, in order. */
const resultsOf = (turn) =>
    turn.after.filter((message) => message.role !== "assistant").map(textOf);

function subtaskCall({ title, project, workspace, text: brief }) {
    return tool("create_subtask", {
        title,
        text: brief,
        model: agentMode.modelId,
        provider: agentMode.providerId,
        effort: "medium",
        workspace: { projectId: projectIds.get(project), name: workspace },
    });
}

const publishCount = (artifacts) =>
    artifacts.reduce((count, artifact) => count + 1 + artifact.versions, 0);

export async function reply(payload) {
    if (payload.options?.intent === "compaction") return undefined;
    const sessionId = payload.options?.sessionId ?? "";
    const system = payload.context?.systemPrompt ?? "";
    const messages = payload.context?.messages ?? [];

    // Names: every task here is made with its name, so this is only a fallback.
    if (sessionId.endsWith(":title") || /<title>/u.test(system))
        return { content: [text("<title>Working session</title>\n<recap>In progress.</recap>")] };

    const turn = turnOf(messages);

    // An admin bot is asked, off camera, to wear a picture for its computer.
    const avatar = turn.text.match(/^Use (.+) as this computer's picture\.$/u);
    if (avatar) {
        if (turn.answered === 0) return quick([tool("set_node_avatar", { path: avatar[1] })]);
        return quick([text("Done.")]);
    }

    // Teammates' agents publish when asked: each artifact, then its versions.
    for (const job of publications) {
        if (!job.text || turn.text !== job.text) continue;
        const call = await publishCall(job.artifacts, turn.answered, resultsOf(turn));
        if (call) return quick([call]);
        if (job.waits) {
            if (turn.answered === publishCount(job.artifacts)) {
                reached.add(`publish:${job.bot}`);
                return quick([text(job.reply), tool("wait", { duration: "3h" })]);
            }
            await gate("bots:after");
            return quick([text("Stopped.")]);
        }
        return quick([text(job.reply)]);
    }

    // Scoteezy's Task List Speed: one subtask, held until chapter 2 releases it.
    if (turn.text === speedTask.message) {
        if (turn.answered === 0)
            return quick([
                text(speedTask.plan),
                subtaskCall({
                    ...speedTask.subtask,
                    text: `SPEED ${speedTask.subtask.title} for: ${speedTask.message}`,
                }),
            ]);
        // It waits on List cache with the daemon's own `wait`, which the
        // subtask's report ends early, so its turn ends only once, at the end.
        reached.add("speed:parent");
        await gate("speed:parent");
        return quick([tool("wait", { duration: "1h" })]);
    }
    if (turn.text.startsWith("SPEED ")) {
        if (turn.answered === 0) {
            const from = await staged("list-cache.ts", codeLines("list-cache", 290).join("\n"));
            return quick([copyCall(from, speedTask.cachePath)]);
        }
        reached.add("speed:subtask");
        await gate("speed:subtask");
        return quick([text(speedTask.report)]);
    }
    // List cache's report reaches the parent, which publishes and ends.
    if (textOf(messages.find((message) => message.role === "user")) === speedTask.message) {
        const artifacts = [{ cover: "perf", versions: 0 }];
        if (turn.answered === 0) await gate("speed:publish");
        const call = await publishCall(artifacts, turn.answered, resultsOf(turn));
        if (call) return quick([call]);
        reached.add("speed:published");
        return quick([text(speedTask.published)]);
    }

    // Earlier tasks: at most one subtask each, which writes its change and reports.
    for (const task of doneTasks) {
        if (turn.text === task.message) {
            if (task.subtask && turn.answered === 0)
                return quick([
                    subtaskCall({
                        title: task.subtask,
                        project: task.project,
                        workspace: task.workspace,
                        text: `${task.message} Work in this workspace.`,
                    }),
                ]);
            return quick([text(task.reply)]);
        }
        if (task.subtask && turn.text === `${task.message} Work in this workspace.`) {
            if (turn.answered === 0) {
                const from = await staged(`${task.workspace}.txt`, task.change.after);
                return quick([copyCall(from, task.change.path)]);
            }
            return quick([text("Done.")]);
        }
    }

    for (const task of doneTasks)
        for (const turnMore of task.more ?? [])
            if (turn.text === turnMore.message) return quick([text(turnMore.reply)]);
    // Kirill's answer is taken at once, its words streamed over about 0.4 s.
    if (turn.text === stepIn.answer) return streamed([text(stepIn.reply)]);

    // Desktop Releases: Kirill's request is answered at once. Steve's is
    // answered on camera in chapter 2, and after that the bot waits on the
    // Windows build with the daemon's own `wait`.
    const [asked, follow] = releaseBot.turns;
    if (turn.text === asked.text) return quick([text(asked.reply)]);
    if (turn.text === follow.text) {
        if (turn.answered === 0) {
            const content = [
                text(follow.report(mention("Steve"))),
                tool("wait", { duration: "20m" }),
            ];
            // Off camera the bot is at work once it has answered and started waiting.
            reached.add("bots:reported");
            return shot === "bots" ? addressed(content) : quick(content);
        }
        await gate("bots:after");
        return quick([text("Stopped.")]);
    }

    // Steve's live task: its agent starts one subtask and keeps working.
    if (turn.text === liveTask.message) {
        if (turn.answered === 0)
            return quick([
                text(liveTask.plan),
                subtaskCall({
                    title: liveTask.subtask.title,
                    project: liveTask.subtask.project,
                    workspace: liveTask.subtask.workspace,
                    text: `LIVE ${liveTask.subtask.title} for: ${liveTask.message}`,
                }),
            ]);
        // Chapter 5 is filmed in this task: its agent waits for the subtask.
        if (shot === "step-in") {
            reached.add("live:coordinator");
            return quick([text(stepIn.waiting)]);
        }
        // Its progress report is published when the world's order reaches it.
        if (turn.answered === 1) {
            reached.add("live:publish");
            await gate("live:publish");
        }
        const job = publications.find((entry) => entry.live);
        const call = await publishCall(job.artifacts, turn.answered - 1, resultsOf(turn).slice(1));
        if (call) return quick([call]);
        await gate("live:coordinator");
        return quick([text("The agent's sign-in is in; the desktop is next.")]);
    }
    if (turn.text.startsWith("LIVE ")) {
        if (turn.answered === 0) {
            const from = await staged("live-sign-in.txt", liveTask.subtask.change.after);
            return quick([copyCall(from, liveTask.subtask.change.path)]);
        }
        // In chapter 5 the subtask finishes on camera, and its report brings
        // the agent to Kirill (below).
        reached.add("live:subtask");
        if (shot === "step-in") await gate("step:ask");
        else await gate("live:subtask");
        return quick([text("Done.")]);
    }
    // A finished part's report reaching the coordinator keeps it working.
    if (textOf(messages.find((message) => message.role === "user")) === liveTask.message) {
        // Chapter 5: the subtask's report is in, and the agent's next word is
        // to Kirill. Its turn ends on the question, so it is seen waiting on him.
        if (shot === "step-in" && !reached.has("step:asked")) {
            reached.add("step:asked");
            return addressed([text(stepIn.ask(mention("Kirill")))]);
        }
        await gate("live:coordinator:report");
        return quick([text("Noted.")]);
    }

    // What teammates start on camera: each is seen working until the take ends.
    for (const arrival of arrivals) {
        if (turn.text === arrival.message) {
            if (arrival.plan && turn.answered === 0)
                return quick([
                    text(arrival.plan),
                    tool("Bash", { command: "ls", description: "Read the composer's state" }),
                ]);
            await gate(`arrival:${arrival.name}`);
            return quick([text("Stopped.")]);
        }
    }
    return undefined;
}
