// The team take's world. Happy Core is a team-mode daemon with two members,
// Kirill (its owner, at the desktop) and Steve (on his phone). It holds the
// team's bots, their projects, and their tasks: Kirill's and Steve's earlier
// work with its subtasks, and Steve's Team servers task, which is working
// across three repositories while the take runs. Kirill's own computer is a
// second, standalone daemon (personal.mjs) that reaches Happy Core through a
// real server connection by URL; the window runs on it.
//
// The screenplay answers every inference request either daemon makes. It
// chooses the words, tool calls and pace; the tools themselves are the
// daemon's. The take's own beats wait at named gates the director releases.
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const id = "team";

const demoRoot = resolve(import.meta.dirname, "../..");
const asset = (name) => `demos/team/assets/${name}`;
const coreAsset = (name) => readFile(join(demoRoot, "demos", "core", "assets", name), "utf8");
export const assetPath = (name) => join(import.meta.dirname, "assets", name);

/**
 * Happy Core's members. Their faces are their GitHub pictures. The server
 * itself wears the Happy desktop app's icon.
 */
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
    ],
};
export const kirill = "kirill";
export const steveKey = "steve";
export const personalName = "Kirill's Mac mini";
export const connectionId = "happy-core";

// The picker: Claude, Codex, Grok and Antigravity, each narrowed through the
// same per-account include_models a person sets.
export const models = {
    codex: ["openai/gpt-6.1-terra", "openai/gpt-6-astra"],
    claude: ["anthropic/opus-5-5", "anthropic/sonnet-5-5"],
    grok: ["xai/grok-4.7"],
    antigravity: ["antigravity/gemini-3.8-flash"],
};
/** What new work starts on before Kirill picks: Terra, so picking Opus is a real change. */
export const defaults = { providerId: "codex", modelId: "openai/gpt-6.1-terra", effort: "medium" };
/**
 * What the hand does on camera: into the list at its last model, then up
 * past every provider's to Opus. Each service keeps its built-in account,
 * named as the daemon names it, Current CLI; no account is picked.
 */
export const onCamera = { scanFrom: "Gemini 3.8 Flash", model: "Opus 5.5 1M" };
/** Every scripted background agent's mode. */
export const terraMode = {
    effort: "medium",
    modelId: "openai/gpt-6.1-terra",
    providerId: "codex",
    permissionMode: "auto",
    serviceTier: null,
};
/** Off camera, earlier work runs without reviews: nothing is filmed of it. */
export const seedMode = { ...terraMode, permissionMode: "full_access" };

// ------------------------------------------------------------------ code
//
// Background diffs are fixture code: plausible files nobody opens on camera,
// sized so the sidebar's live Git counts read like the team's real work.

const words = [
    "session",
    "server",
    "token",
    "voice",
    "level",
    "frame",
    "layout",
    "overlay",
    "sign",
    "connection",
    "roster",
    "composer",
    "message",
    "landing",
    "hero",
    "feed",
    "row",
    "state",
    "refresh",
    "pairing",
    "device",
    "stream",
    "audio",
    "meter",
    "theme",
    "header",
    "section",
    "inset",
    "anchor",
    "cursor",
    "reply",
    "draft",
    "send",
    "queue",
    "retry",
    "bound",
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
export function codeLines(seed, count, language = "ts") {
    const random = rng(seed);
    const lines = [];
    while (lines.length < count) {
        const name = camel(random, 3);
        const argument = camel(random, 2);
        const field = camel(random, 2);
        const block =
            language === "swift"
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
                  ];
        lines.push(...block);
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
        after: (count = added) =>
            fileOf([
                ...original.slice(0, base - deleted),
                ...codeLines(`${seed}:new`, count, language),
            ]),
    };
}

// The waveform the new task reads before it designs, where the app's
// components live at the repository's root, so its reads name short paths.
export const voicePath = "sources/components/VoiceAssistantStatusBar.tsx";
export const barsPath = "sources/components/VoiceBars.tsx";

/**
 * Steve's work: one file per repository, edited in steps. The agent's and the
 * desktop's parts finish before the take and rest idle; iOS server codes is
 * the one still editing while the take runs.
 */
export const liveChanges = {
    agent: change(
        "packages/happy-agent-modules/sources/connections/impl/ServerSignIn.ts",
        "agent-sign-in",
        { base: 120, deleted: 38, added: 412 },
    ),
    desktop: change(
        "packages/happy-desktop-electron/sources/main/serverSessions.ts",
        "desktop-sign-in",
        { base: 140, deleted: 51, added: 268 },
    ),
    ios: change(
        "packages/happy-ios/Sources/HappyCore/ServerSignIn/ServerCode.swift",
        "ios-server-codes",
        { base: 60, deleted: 12, added: 190, language: "swift" },
    ),
};
/**
 * How many steps each subtask takes to write its file, and the share each
 * step writes. iOS server codes takes one step every three seconds of the
 * take, so its counts climb from the first frame to the last.
 */
export const liveSteps = { agent: 7, desktop: 7, ios: 22 };
/** The parts that are done before the take: idle, their counts final. */
export const liveIdle = ["agent", "desktop"];
/** How far iOS server codes is when the take opens. */
export const liveStepsBefore = 4;
const liveShare = (key, step) => Math.round((step / liveSteps[key]) ** 0.85 * 1000) / 1000;

/** Earlier subtasks' finished work: one Write each, read by the sidebar as diff stats. */
const doneChanges = {
    sendFixes: change(
        "packages/happy-ios/Sources/HappyUI/Chat/ChatComposerOverlay.swift",
        "ios-send-fixes",
        { base: 240, deleted: 122, added: 921, language: "swift" },
    ),
    mobileVoice: change(
        "packages/happy-app/sources/realtime/elevenlabs/voiceSession.ts",
        "mobile-voice",
        { base: 30, deleted: 12, added: 8040 },
    ),
    landing: change("src/Landing.tsx", "landing-rebrand", { base: 300, deleted: 134, added: 1312 }),
};

// ------------------------------------------------------------------ repositories
//
// Each fixture repository wears its real project's icon: happy the Happy iOS
// app's (happy-ios's AppIcon), happy-desktop the desktop app's
// (happy-desktop-electron's app icon), happy-agent the agent's logo.

export const repository = {
    name: "happy",
    avatar: asset("happy.png"),
    files: {
        "README.md": "# Happy\n\nRemote access to your coding agents.\n",
        [voicePath]: await coreAsset("VoiceAssistantStatusBar.tsx.txt"),
        [barsPath]: await coreAsset("VoiceBars.tsx.txt"),
        [liveChanges.ios.path]: liveChanges.ios.before,
        [doneChanges.sendFixes.path]: doneChanges.sendFixes.before,
        [doneChanges.mobileVoice.path]: doneChanges.mobileVoice.before,
    },
};
export const backgroundRepositories = [
    {
        name: "happy-desktop",
        avatar: asset("happy-desktop.png"),
        files: {
            "README.md":
                "# Happy Desktop\n\nProjects, workspaces, and conversations in one place.\n",
            [liveChanges.desktop.path]: liveChanges.desktop.before,
        },
    },
    {
        name: "happy-agent",
        avatar: asset("happy-agent.png"),
        files: {
            "README.md": "# Happy Agent\n\nThe daemon behind every Happy app.\n",
            [liveChanges.agent.path]: liveChanges.agent.before,
        },
    },
    {
        name: "slopus.github.io",
        avatar: asset("slopus-github-io.png"),
        files: {
            "README.md": "# happy.engineering\n\nThe website.\n",
            [doneChanges.landing.path]: doneChanges.landing.before,
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
 * The team's bots, as on the real Happy Core. Two have no uploaded picture,
 * so they wear the seeded shader avatar their real ID draws.
 */
export const bots = [
    { id: "smvogq2ds0qwen307vijeg90", name: "Disk Sweeper", username: "disk_sweeper" },
    {
        id: "o87dour4wln3kyijy6l2as7q",
        name: "iOS Production Train",
        username: "ios_production_train",
    },
    { id: "uzqhssr8qd5j2e053jbfxieu", name: "Product Health", username: "product_health" },
];
/** Product Health's one subtask, from the real sidebar. */
export const botWork = {
    bot: "product_health",
    message: "Docs pages are getting rage clicks. Look into it.",
    subtask: "Docs rage clicks",
    reply: "Rage clicks cluster on the install tabs in the docs. Looking into it in a subtask.",
};

// ------------------------------------------------------------------ tasks

/**
 * Earlier tasks, oldest first: each owner made it and asked for it, and its
 * agent put the work in a subtask in the named project.
 */
export const doneTasks = [
    {
        owner: "kirill",
        name: "Landing Page Rebrand",
        message: "Rebrand the landing page for the 2.0 launch.",
        subtask: "Landing Rebrand",
        project: "slopus.github.io",
        workspace: "landing-rebrand",
        change: doneChanges.landing,
        reply: "The rebrand is in Landing Rebrand: new hero, the 2.0 story, and the team section.",
    },
    {
        owner: "kirill",
        name: "11labs Mobile",
        message: "Bring ElevenLabs voice to the mobile app.",
        subtask: "Mobile Voice",
        project: "happy",
        workspace: "mobile-voice",
        change: doneChanges.mobileVoice,
        reply: "Mobile Voice has the ElevenLabs session, its audio route, and the call screen.",
    },
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
        change: doneChanges.sendFixes,
        reply: "iOS Send Fixes keeps the composer's frame through the send and the keyboard's return.",
    },
    {
        owner: "steve",
        name: "Android Push Fixes",
        message: "Pushes stop on Android after the app sits in the background. Find out why.",
        reply: "Doze holds normal-priority pushes; replies now go out as high priority, so they arrive.",
    },
    {
        owner: "steve",
        name: "Sync Benchmarks",
        message: "Benchmark a cold sync on a team server with ten thousand tasks.",
        reply: "A cold sync of 10k tasks takes 1.8 s; most of it is the task list query.",
    },
];

/**
 * Each member's own sidebar on Happy Core. Everyone joins every new task, so
 * the two lists differ by what each has done with theirs: the tasks they
 * left, the order they keep, and the bots they hid. Kirill's is the one the
 * window has always shown; Steve's phone shows his.
 */
export const sidebars = {
    kirill: { left: ["Android Push Fixes", "Sync Benchmarks"] },
    steve: {
        left: ["11labs Mobile", "Landing Page Rebrand"],
        order: [
            "Android Push Fixes",
            "Activity Feed Design",
            "Team Servers",
            "iOS Overlay Layout",
            "Sync Benchmarks",
        ],
        hiddenBots: ["disk_sweeper", "product_health"],
    },
};

/** Steve's task that is working across three repositories while the take runs. */
export const liveTask = {
    owner: "steve",
    name: "Team Servers",
    message: "Sign in to team servers from the agent, the desktop and iOS.",
    plan: "Three parts, one per repository: the agent's sign-in, the desktop's sessions, and iOS server codes. Starting them now.",
    subtasks: [
        {
            key: "agent",
            title: "Agent sign-in",
            project: "happy-agent",
            workspace: "agent-sign-in",
        },
        {
            key: "desktop",
            title: "Desktop sign-in",
            project: "happy-desktop",
            workspace: "desktop-sign-in",
        },
        { key: "ios", title: "iOS server codes", project: "happy", workspace: "ios-server-codes" },
    ],
};

// ------------------------------------------------------------------ the filmed task

/** What Kirill types: short, the way new work is started. */
export const prompt = "Add an animated waveform to the voice agent.";
/** The name the task gives itself from that message. */
export const taskTitle = "Voice waveform";
export const artifactTitle = "Voice waveform";
export const previewReply =
    "Here’s the waveform: the bars move while either side is speaking and rest flat when it’s quiet. Steve, how does it look?";
/** What Steve types on his phone, word for word. */
export const steveFeedback = "Love it. Narrower though, five bars max.";
export const bars = 28;
/**
 * What the agent answers Steve with once the page has five bars. It is the
 * turn's last word, so the phone, which shows a turn by its last word, says it
 * too; nothing follows it to push the desktop's preview out of view. The
 * preview it answers under is the five-bar page shown open again in the same
 * reply, since the small window has no room for the first one above Steve's
 * note.
 */
export const fiveBarsReply = "Five bars it is.";
export const fiveBars = 5;

/** The page the agent publishes: the waveform speaking, and silent. */
export function artifactPage(count = bars) {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
:root { color-scheme: light dark; }
html, body { margin: 0; background: transparent; }
body { font-family: var(--happy-host-font, system-ui); color: var(--happy-host-text, #eee); }
.row { display: flex; align-items: center; gap: 18px; padding: 4px 0; }
.bars { --bars: ${count}; display: flex; align-items: center; gap: 4px; height: 56px; width: calc(var(--bars) * 9px - 4px); }
.bars.silent { height: 24px; }
.bars i { flex: none; width: 5px; height: 6px; border-radius: 4px; background: #f0b85a; }
.speaking i { background: linear-gradient(#f3c26b, #e07aae); animation: wave 1s ease-in-out infinite; }
@keyframes wave { 0%, 100% { height: 6px; } 50% { height: var(--h); } }
.label { font-size: 13px; line-height: 18px; }
.label span { display: block; color: var(--happy-host-muted, #999); font-family: var(--happy-host-mono, monospace); font-size: 12px; }
.silent i { opacity: 0.45; }
</style>
</head>
<body>
<div class="row"><div class="bars speaking" id="speaking"></div><div class="label">Agent speaking<span>speaking → animate</span></div></div>
<div class="row"><div class="bars silent" id="silent"></div><div class="label">Silent<span>quiet → rest</span></div></div>
<script>
for (const id of ["speaking", "silent"]) {
  const bars = document.getElementById(id);
  const count = Number(getComputedStyle(bars).getPropertyValue("--bars"));
  for (let i = 0; i < count; i++) {
    const bar = document.createElement("i");
    bar.style.setProperty("--h", Math.round(14 + 40 * Math.abs(Math.sin(i * 0.9 + 0.6) * Math.cos(i * 0.37))) + "px");
    bar.style.animationDelay = (-(i * 83) % 1000) + "ms";
    bars.append(bar);
  }
}
</script>
</body>
</html>
`;
}

// ------------------------------------------------------------------ gates

// Gates are scoped by a key the screenplay names (a conversation's opening
// words, or a subtask's key), so a stale agent from an earlier take can never
// consume the cue meant for the one being filmed.
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
    filmedArtifactId = undefined;
}
async function gate(name) {
    reached.add(name);
    await new Promise((settle) => gates.set(name, settle));
}

// ------------------------------------------------------------------ screenplay

const text = (value) => ({ type: "text", text: value });
const tool = (name, args) => ({ type: "toolCall", name, arguments: args });
const thinking = (value) => ({ type: "thinking", thinking: value });
const paced = (content, timing = {}) => ({
    content,
    textDeltaChunkSize: 4096,
    textDeltaDelayMs: 300,
    toolCallDeltaDelayMs: 350,
    completionDelayMs: 100,
    ...timing,
});
/** Off camera nothing waits: every delta at once. */
const quick = (content) =>
    paced(content, {
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

/** A tool result after the latest turn, as text. */
const resultsOf = (after) =>
    after
        .filter((message) => message.role !== "assistant")
        .map(textOf)
        .join("\n");

/** Projects by name, as the team daemon registered them; the take fills it in. */
const projectIds = new Map();
export function projectIdsSet(ids) {
    for (const [name, value] of Object.entries(ids)) projectIds.set(name, value);
}
/** Where Happy Core's fixture repositories live, for reads outside a task's own folder. */
let projectsRoot;
export function projectsRootSet(path) {
    projectsRoot = path;
}

/**
 * The background agents run on Codex, whose file tools edit by patch. A whole
 * new version of a fixture file is written beside the world instead, and the
 * agent copies it into its own checkout with an ordinary command.
 */
async function staged(name, content) {
    const path = join(dirname(projectsRoot), "staged", name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return path;
}
const copyCall = (from, to) =>
    tool("exec_command", { cmd: `cp '${from}' '${to}'`, description: `Update ${to}` });

function subtaskCall({ title, project, workspace, text: brief }) {
    return tool("create_subtask", {
        title,
        text: brief,
        model: terraMode.modelId,
        provider: terraMode.providerId,
        effort: "medium",
        workspace: { projectId: projectIds.get(project), name: workspace },
    });
}

/** How many finished parts have reported to Steve's coordinator. */
let coordinatorReports = 0;

export async function reply(payload) {
    if (payload.options?.intent === "compaction") return undefined;
    const sessionId = payload.options?.sessionId ?? "";
    const system = payload.context?.systemPrompt ?? "";
    const messages = payload.context?.messages ?? [];
    const all = messages.map(textOf).join("\n");

    // Names: a task without one names itself from its first message.
    if (sessionId.endsWith(":title") || /<title>/u.test(system)) {
        if (all.includes(prompt)) {
            return { content: [text(`<title>${taskTitle}</title>\n<recap>Designing it.</recap>`)] };
        }
        return { content: [text("<title>Working session</title>\n<recap>In progress.</recap>")] };
    }

    const turn = turnOf(messages);

    // An admin bot is asked, off camera, to wear a picture for its computer.
    const avatar = turn.text.match(/^Use (.+) as this computer's picture\.$/u);
    if (avatar) {
        if (turn.answered === 0) return quick([tool("set_node_avatar", { path: avatar[1] })]);
        return quick([text("Done.")]);
    }

    // Product Health's earlier subtask.
    if (turn.text === botWork.message) {
        if (turn.answered === 0)
            return quick([
                tool("create_subtask", {
                    title: botWork.subtask,
                    text: "Find where the docs pages get rage clicks and why.",
                    model: terraMode.modelId,
                    provider: terraMode.providerId,
                    effort: "medium",
                }),
            ]);
        return quick([text(botWork.reply)]);
    }
    if (turn.text.startsWith("Find where the docs pages get rage clicks")) {
        return quick([text("The install tabs look clickable but do nothing on mobile.")]);
    }

    // Earlier tasks: one subtask each, which writes its change and reports.
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
                const from = await staged(`${task.workspace}.txt`, task.change.after());
                return quick([copyCall(from, task.change.path)]);
            }
            return quick([text("Done.")]);
        }
    }

    // Steve's live task: its agent starts three subtasks, then waits on them.
    if (turn.text === liveTask.message) {
        if (turn.answered === 0)
            return quick([
                text(liveTask.plan),
                ...liveTask.subtasks.map((subtask) =>
                    subtaskCall({
                        title: subtask.title,
                        project: subtask.project,
                        workspace: subtask.workspace,
                        text: `LIVE:${subtask.key} ${subtask.title} for: ${liveTask.message}`,
                    }),
                ),
            ]);
        // Coordinating: it keeps working for as long as the take runs.
        await gate("live:coordinator");
        return quick([text("Two parts are in; I'll pull them together when iOS lands.")]);
    }
    // A finished part's report reaching the coordinator keeps it working on
    // the part still running.
    if (textOf(messages.find((message) => message.role === "user")) === liveTask.message) {
        coordinatorReports += 1;
        await gate(`live:coordinator:${coordinatorReports}`);
        return quick([text("Noted.")]);
    }
    const live = turn.text.match(/^LIVE:(agent|desktop|ios) /u);
    if (live) {
        const key = live[1];
        const step = turn.answered;
        const work = liveChanges[key];
        if (step === 0)
            return quick([tool("exec_command", { cmd: `sed -n '1,80p' '${work.path}'` })]);
        if (step <= liveSteps[key]) {
            // Each step waits for the director, so the counts climb on camera.
            await gate(`live:${key}:${step}`);
            const added = Math.round(liveShareAdded(key, step));
            const from = await staged(`live-${key}-${step}.txt`, work.after(added));
            return quick([copyCall(from, work.path)]);
        }
        await gate(`live:${key}:done`);
        return quick([text("Done.")]);
    }

    // The filmed task: Kirill's message, then Steve's.
    if (turn.text === prompt) return await filmedReply(turn, system);
    if (turn.text === steveFeedback) {
        // Steve's note: the agent rewrites the page with five bars, shows it
        // open again in this reply, under Steve's note, and says so.
        if (turn.answered === 0) {
            await gate("feedback");
            if (!filmedArtifactId) throw new Error("The filmed task published no preview.");
            return paced([
                tool("write_artifact_file", {
                    artifactId: filmedArtifactId,
                    path: "index.html",
                    content: artifactPage(fiveBars),
                }),
            ]);
        }
        if (turn.answered === 1)
            return paced([
                tool("update_artifact", {
                    artifactId: filmedArtifactId,
                    display: "inline_expanded",
                }),
            ]);
        await gate("five-bars");
        return paced([text(fiveBarsReply)]);
    }
    return undefined;
}

function liveShareAdded(key, step) {
    const target = { agent: 412, desktop: 268, ios: 190 }[key];
    return target * liveShare(key, step);
}

/**
 * The new task's own folder holds a checkout of the fixture happy repository
 * by the time its agent reads it: finding the repository is not this take's
 * story, and Auto mode keeps reads inside the task's folder.
 */
async function checkoutPrepare(system) {
    const folder = system.match(/Primary working directory: (.+)/u)?.[1]?.trim();
    if (!folder || !projectsRoot) throw new Error("The filmed task named no folder of its own.");
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

/** The preview the filmed task published, which it rewrites on Steve's note. */
let filmedArtifactId;

async function filmedReply(turn, system) {
    await checkoutPrepare(system);
    // Relative to the task's folder, as an agent names a file it works on.
    const files = (path) => `happy/${path}`;
    if (turn.answered === 0) {
        await gate("read-bars");
        return paced(
            [
                thinking("Check the existing voice bars and where the speaking state comes from."),
                tool("Read", { file_path: files(barsPath) }),
            ],
            { thinkingDeltaChunkSize: 4096, thinkingDeltaDelayMs: 900, toolCallDeltaDelayMs: 400 },
        );
    }
    if (turn.answered === 1) {
        await gate("read-voice");
        return paced([tool("Read", { file_path: files(voicePath) })]);
    }
    if (turn.answered === 2) {
        await gate("artifact");
        return paced([
            tool("create_artifact", {
                type: "html",
                title: artifactTitle,
                display: "inline_expanded",
            }),
        ]);
    }
    if (turn.answered === 3) {
        const found = resultsOf(turn.after).match(
            /(?:\bid |artifactId"?\s*[:=]\s*"?|happy-artifact id=")([a-z0-9]{20,32})\b/u,
        );
        if (!found) throw new Error(`create_artifact named no artifact: ${resultsOf(turn.after)}`);
        filmedArtifactId = found[1];
        return paced([
            tool("write_artifact_file", {
                artifactId: found[1],
                path: "index.html",
                content: artifactPage(),
            }),
        ]);
    }
    await gate("reply");
    return paced([text(previewReply)], { textDeltaDelayMs: 600, completionDelayMs: 400 });
}
