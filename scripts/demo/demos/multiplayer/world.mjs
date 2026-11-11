// The multiplayer video's world: the team demo's Happy Core, restaged for
// three short chapters. Happy Core is a team-mode Happy Agent with four
// members. Kirill, its owner, sits at the desktop: his own computer is a
// second, standalone Happy Agent (personal.mjs) that reaches Happy Core
// through a real server connection by URL, and the window runs on it.
//
// Kirill and Steve wear the pictures the team demo gave them. Anna and Leo
// are invented teammates with generated portraits, and the four job bots
// wear generated pictures. Nothing here is read from the real Happy Core
// server, a real session, or anyone's `~/.happy`; the bots' jobs are named
// after the kind of standing work a team gives a bot, and every word they
// say is this screenplay's.
//
// The screenplay answers every inference request either daemon makes. It
// chooses the agents' words, tool calls and pace; the tools themselves are
// the daemon's. The take's own beats wait at named gates the director
// releases.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
            key: "anna",
            name: "Anna",
            email: "anna@happy.example",
            role: "Growth",
            photo: "anna.jpg",
        },
        {
            key: "leo",
            name: "Leo",
            email: "leo@happy.example",
            role: "Engineer",
            photo: "leo.jpg",
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

// ------------------------------------------------------------------ repositories

export const repository = {
    name: "happy",
    avatar: teamAsset("happy.png"),
    files: {
        "README.md": "# Happy\n\nRemote access to your coding agents.\n",
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
 * wears the generated picture named after its username.
 */
export const bots = [
    { name: "Desktop Releases", username: "desktop_releases" },
    { name: "Mobile Releases", username: "mobile_releases" },
    { name: "Alerts", username: "alerts" },
    { name: "Growth", username: "growth" },
];

// ------------------------------------------------------------------ tasks

/**
 * Earlier tasks, oldest first: each owner made it and asked for it, and where
 * it names a subtask its agent put the work there, in the named repository.
 */
export const doneTasks = [
    {
        owner: "steve",
        name: "Activity Feed Design",
        message: "Design the activity feed: what changed, who did it, grouped by day.",
        reply: "Entries group by day in inset cards, each with its subject's face and up to three people.",
    },
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
        owner: "leo",
        name: "Sync Benchmarks",
        message: "Benchmark a cold sync on a team server with ten thousand tasks.",
        reply: "A cold sync of 10k tasks takes 1.8 s; most of it is the task list query.",
    },
    {
        owner: "anna",
        name: "Onboarding Emails",
        message: "Draft the three onboarding emails for new teams.",
        reply: "Three drafts are in: welcome, your first shared task, and invite your team.",
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
                reply: "Got it. I'll size it to the mute button's height and keep it on one row.",
            },
        ],
    },
];

/** Steve's task that is working when the take opens, and stays working. */
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
 * Each stays working for as long as the take runs.
 */
export const arrivals = [
    {
        owner: "steve",
        name: "Android Push Fixes",
        message: "Pushes stop on Android after the app sits in the background. Find out why.",
    },
    {
        owner: "leo",
        name: "Docs Search",
        message: "Add search to the docs site.",
    },
];

/** Kirill's sidebar on Happy Core, top to bottom, before anyone starts anything. */
export const sidebarOrder = [
    "Voice waveform",
    "Onboarding Emails",
    "Team Servers",
    "Sync Benchmarks",
    "iOS Overlay Layout",
    "Activity Feed Design",
];
/** The task Kirill has open. */
export const openTask = "Voice waveform";

// ------------------------------------------------------------------ gates

const gates = new Map();
const reached = new Set();
export function release(name) {
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
}
/** Forgets which gates were reached, for the next take on the same world. */
export function rehearse() {
    close();
}
async function gate(name) {
    reached.add(name);
    await new Promise((settle) => gates.set(name, settle));
}

// ------------------------------------------------------------------ screenplay

const text = (value) => ({ type: "text", text: value });
const tool = (name, args) => ({ type: "toolCall", name, arguments: args });
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

/** A whole new version of a fixture file, written beside the world for an agent to copy in. */
async function staged(name, content) {
    const path = join(dirname(projectsRoot), "staged", name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return path;
}
const copyCall = (from, to) =>
    tool("Bash", { command: `cp '${from}' '${to}'`, description: `Update ${to}` });

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
        await gate("live:coordinator");
        return quick([text("The agent's sign-in is in; the desktop is next.")]);
    }
    if (turn.text.startsWith("LIVE ")) {
        if (turn.answered === 0) {
            const from = await staged("live-sign-in.txt", liveTask.subtask.change.after);
            return quick([copyCall(from, liveTask.subtask.change.path)]);
        }
        await gate("live:subtask");
        return quick([text("Done.")]);
    }
    // A finished part's report reaching the coordinator keeps it working.
    if (textOf(messages.find((message) => message.role === "user")) === liveTask.message) {
        await gate("live:coordinator:report");
        return quick([text("Noted.")]);
    }

    // What teammates start on camera: each is seen working until the take ends.
    for (const arrival of arrivals) {
        if (turn.text === arrival.message) {
            await gate(`arrival:${arrival.name}`);
            return quick([text("Stopped.")]);
        }
    }
    return undefined;
}
