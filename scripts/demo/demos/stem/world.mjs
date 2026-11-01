// The stem-cell take reuses the core demo's fixtures: the waveform code and
// the offline shipping screenplay. Its opening is new work in the Spaces
// sidebar: the first message names it, Focus (the daemon's sidebar helper)
// gives it an icon from the clay library and files it into its section. The
// work publishes a small inline artifact, and the agent loops in the teammate
// who follows voice work. That teammate is a real second member of a team
// daemon, with their own Focus, sidebar, and paired phone.
export * from "../core/world.mjs";
import * as core from "../core/world.mjs";
import { shipCommand } from "../core/shipping.mjs";

export const id = "stem";

// Today's picker, trimmed so one family per account fits the open list
// without scrolling, through the same per-account include_models a person
// sets in happy.toml. Gemini comes through the Antigravity harness.
export const models = {
    codex: ["openai/gpt-6.1-sol", "openai/gpt-6-astra"],
    claude: ["anthropic/opus-5-5", "anthropic/sonnet-5-5"],
    grok: ["xai/grok-4.7"],
    antigravity: ["antigravity/gemini-4-argon", "antigravity/gemini-3.8-flash"],
};

// Stem cells are not project sessions, so the classic world's worktree
// sessions would never reach this sidebar. The background rows are new work
// of their own, made off camera through the same API the Create row uses.
export const sessions = [];
export const worktrees = [];

/**
 * A team daemon with two members, seeded by its machine configuration. The
 * owner is the person at the desktop; Steve is a designer who follows voice
 * work and joins only what his Focus adds him to.
 */
export const team = {
    members: [
        { key: "owner", owner: true, name: "Alex", role: "Founder", autoJoinTasks: false },
        {
            key: "steve",
            name: "Steve",
            role: "Designer",
            follows: "Every voice feature",
            autoJoinTasks: false,
        },
    ],
};
export const steveKey = "steve";
export const steveName = "Steve";

/** What the person types: short, the way new work is usually started. */
export const prompt = "Add an animated waveform to the voice agent.";
/** A subject title: what the sidebar row is called once it is named. */
export const sessionTitle = "Voice waveform";
/** The clay icon Focus gives the row; `waveform` needs a daemon whose slug list has it. */
export const icon = process.env.STEM_DEMO_ICON ?? "new-feature";
/**
 * What the daemon starts new work on: the model picked on camera. A stem cell
 * the daemon makes itself, like the one Create makes at the end, opens on it.
 */
export const defaults = { providerId: "claude", modelId: "anthropic/opus-5-5", effort: "medium" };
/** The model picked on camera, and the mode later messages keep. */
export const opusMode = {
    ...core.seedMode,
    effort: "medium",
    modelId: "anthropic/opus-5-5",
    providerId: "claude",
};
export const artifactTitle = "Voice waveform";

/** What Steve types on his phone, word for word: one review, one go-ahead. */
export const steveFeedback = "Make it a bit narrower and ship it.";
/** How many bars the waveform draws, before and after Steve's review. */
export const barsBefore = 28;
export const barsAfter = 16;

/** The teammate's Happy user ID, read from the daemon before the take. */
let steveUserId;
export function steveUserIdSet(value) {
    steveUserId = value;
}
const steveMention = () => `<happy-user id="${steveUserId}"/>`;

/** The agent's reply once the preview is up: the result, then whom it looped in. */
export const loopInLead = "Done. The waveform animates while either side is speaking.";
export const loopInLine = "Looping in";
export const loopInText = () =>
    `${loopInLead}\n\n${loopInLine} ${steveMention()}, our design expert.`;
export const loopInReason =
    "The voice waveform is ready for a design review: it animates while either side speaks.";
export const shippedText = "Shipped.";

/** The page the agent publishes: the waveform itself, speaking and silent. */
export function artifactPage() {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
:root { color-scheme: light dark; }
html, body { margin: 0; background: transparent; }
body { font-family: var(--happy-host-font, system-ui); color: var(--happy-host-text, #eee); }
.row { display: flex; align-items: center; gap: 18px; padding: 6px 0; }
.bars { --bars: ${barsBefore}; display: flex; align-items: center; gap: 4px; height: 56px; width: calc(var(--bars) * 9px - 4px); transition: width 0.4s ease; }
.bars i { flex: none; width: 5px; height: 6px; border-radius: 4px; background: #f0b85a; }
.speaking i { background: linear-gradient(#f3c26b, #e07aae); animation: wave 1s ease-in-out infinite; }
@keyframes wave { 0%, 100% { height: 6px; } 50% { height: var(--h); } }
.label { font-size: 13px; line-height: 18px; }
.label span { display: block; color: var(--happy-host-muted, #999); font-family: var(--happy-host-mono, monospace); font-size: 12px; }
.silent i { opacity: 0.45; }
</style>
</head>
<body>
<div class="row"><div class="bars speaking" id="speaking"></div><div class="label">Agent speaking<span>waveformActive → true</span></div></div>
<div class="row"><div class="bars silent" id="silent"></div><div class="label">Silent<span>waveformActive → false</span></div></div>
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

/** Sections the person made, top to bottom, under their Bots. */
export const sections = [
    { id: "voice", label: "Voice" },
    { id: "bug-fixes", label: "Bug fixes" },
];
/** Where Focus files the filmed request. */
export const section = "voice";

/** Earlier new work, each filed by Focus from its first message. */
export const seeds = [
    {
        message: "Check how voice follows the session I’m looking at.",
        title: "Voice routing",
        icon: "navigation",
        section: "voice",
        reply: "Voice tools use the active session ID. Opening another session updates that same routing state, so the next voice action follows the conversation you’re looking at.",
    },
    {
        message: "Pull the next useful step out of my voice-interface notes.",
        title: "Voice notes",
        icon: "notes",
        section: "voice",
        reply: "Make the speaking state visible without interrupting the conversation. Reuse the existing voice bars and leave the call timer and tap-to-end action alone.",
    },
    {
        message: "The message list jumps when a reply arrives while I’m scrolled up. Fix it.",
        title: "Message scroll jump",
        icon: "debugging",
        section: "bug-fixes",
        reply: "The list re-anchored to the bottom on every new reply. It now keeps the message you were reading in place unless you were already at the bottom.",
    },
    {
        message: "The unread badge stays on after I’ve read the session on my phone.",
        title: "Stale unread badge",
        icon: "notifications",
        section: "bug-fixes",
        reply: "The badge only cleared on a desktop read. A read from any device now clears it, and the sidebar updates live.",
    },
];

/** Steve's own sidebar: a designer's few rows, nothing like the owner's. */
export const steveSections = [{ id: "design", label: "Design" }];
export const steveSeeds = [
    {
        message: "Sketch three directions for the onboarding illustrations.",
        title: "Onboarding art",
        icon: "design",
        section: "design",
        reply: "Three directions: soft clay shapes, a single line drawing, and flat cut paper. Clay fits the app icons best.",
    },
    {
        message: "Tighten the pricing page layout on narrow screens.",
        title: "Pricing layout",
        icon: "pricing",
        section: "design",
        reply: "Stack the plans, keep the price and the button above the fold, and move the comparison table behind a toggle.",
    },
];

const text = (value) => ({ type: "text", text: value });
const tool = (name, args) => ({ type: "toolCall", name, arguments: args });
const textOf = (message) =>
    typeof message.content === "string"
        ? message.content
        : (message.content ?? [])
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n");

// Focus's filmed beats. A seed's placement runs ungated, off camera.
const focusGates = new Map();
const focusReached = new Set();
export function focusRelease(name) {
    focusGates.get(name)?.();
    focusGates.delete(name);
}
export function focusHasReached(name) {
    return focusReached.has(name);
}
function focusGate(name) {
    focusReached.add(name);
    return new Promise((resolve) => focusGates.set(name, resolve));
}
/** The filmed row has been filed once; another Focus seeing it only reads it. */
let filmedFiled = false;
export function close() {
    for (const resolve of focusGates.values()) resolve();
    focusGates.clear();
    core.close();
}

const focusPaced = (content, timing = {}) => ({
    content,
    textDeltaChunkSize: 4096,
    textDeltaDelayMs: 200,
    toolCallDeltaDelayMs: 200,
    completionDelayMs: 100,
    ...timing,
});

/**
 * A person's Focus. Its tools are the daemon's own: list_sidebar reads the
 * document, set_space_icon applies at once, edit_sidebar's move is queued until
 * the turn ends, join_task adds its person to work a teammate's agent mentioned
 * them in, and archive_shipped_task takes shipped work out of the sidebar.
 */
async function focusReply(payload) {
    const messages = payload.context?.messages ?? [];
    const briefAt = messages.findLastIndex(
        (message) => message.role === "user" || message.role === "agent",
    );
    const brief = textOf(messages[briefAt] ?? {});
    const answered = messages
        .slice(briefAt + 1)
        .filter((message) => message.role === "assistant").length;

    // Steve's Focus: a teammate's agent mentioned him in the voice work he follows.
    const mentioned = brief.match(/mentioned the person in task (\w+)/u);
    if (mentioned) {
        if (answered === 0) {
            await focusGate("join");
            return focusPaced([
                tool("join_task", {
                    taskId: mentioned[1],
                    note: "Alex's agent wants a design review of the voice waveform.",
                }),
            ]);
        }
        return focusPaced([text("Added Voice waveform for your review.")]);
    }

    // The owner's Focus: the teammate answered in the owner's own work. Approval
    // is not shipping, so it reads the conversation, and archives only once that
    // reading says the work shipped.
    const teammate = brief.match(/Conversation in (\w+): their teammate Steve wrote in/u);
    if (teammate) {
        if (!brief.includes(`Steve: ${steveFeedback}`))
            return focusPaced([text("Steve is reviewing Voice waveform.")]);
        if (answered === 0) {
            await focusGate("read");
            return focusPaced([tool("read_conversations", { ids: [teammate[1]], turns: 2 })]);
        }
        if (answered === 1) {
            const read = textOf(
                messages.slice(briefAt + 1).findLast((message) => message.role !== "assistant") ??
                    {},
            );
            if (!read.includes(shippedText))
                return focusPaced([text("Steve approved Voice waveform; it has not shipped yet.")]);
            await focusGate("archive");
            return focusPaced([
                tool("archive_shipped_task", {
                    spaceId: teammate[1],
                    shipped: "The voice waveform is live on main.",
                }),
            ]);
        }
        return focusPaced([text("Archived Voice waveform: it shipped.")]);
    }

    const placing = [...brief.matchAll(/New work started in row (\w+)\. Its first message:/gu)]
        .map((match) => {
            const after = brief.slice(match.index);
            const filmed = after.includes(prompt);
            if (filmed)
                return filmedFiled ? undefined : { spaceId: match[1], icon, section, filmed };
            const seed = [...seeds, ...steveSeeds].find((candidate) =>
                after.includes(candidate.message),
            );
            return seed ? { spaceId: match[1], icon: seed.icon, section: seed.section } : undefined;
        })
        .filter((entry) => entry !== undefined);
    const filmed = placing.some((entry) => entry.filmed);
    if (answered === 0) return focusPaced([tool("list_sidebar", {})]);
    if (answered === 1) {
        const listed = messages.slice(briefAt + 1).find((message) => message.role !== "assistant");
        const sidebar = JSON.parse(textOf(listed ?? {}) || "{}");
        const html = sidebar.html ?? "";
        const own = (sidebar.spaces ?? []).find(
            (space) => space.role === "focus" || space.role === "prioritizing",
        );
        const edits = [];
        // Its own row sits right after Happy, as its instructions ask.
        if (own && !html.includes(`<happy-space id="${own.id}"`)) {
            const happy = html.match(/ *<happy-space id="\w+"\/>\n/u)?.[0];
            if (happy)
                edits.push({
                    oldText: happy,
                    newText: `${happy}  <happy-space id="${own.id}"/>\n`,
                });
        }
        for (const entry of placing) {
            const row = `  <happy-space id="${entry.spaceId}"/>\n`;
            const heading = html.match(
                new RegExp(` *<happy-section id="${entry.section}"[^>]*/>\n`, "u"),
            )?.[0];
            if (!html.includes(row) || !heading) continue;
            edits.push({ oldText: row, newText: "" });
            edits.push({ oldText: heading, newText: `${heading}${row}` });
        }
        if (filmed) await focusGate("icon");
        return focusPaced([
            ...placing.map((entry) =>
                tool("set_space_icon", { spaceId: entry.spaceId, slug: entry.icon }),
            ),
            ...(edits.length > 0
                ? [tool("edit_sidebar", { baseVersion: sidebar.version, edits })]
                : []),
        ]);
    }
    if (filmed) {
        await focusGate("file");
        filmedFiled = true;
    }
    const labels = placing
        .map(
            (entry) =>
                [...sections, ...steveSections].find((candidate) => candidate.id === entry.section)
                    ?.label,
        )
        .filter(Boolean);
    return focusPaced([
        text(labels.length > 0 ? `Filed new work under ${labels.join(" and ")}.` : "Ready."),
    ]);
}

export async function reply(payload, emitted) {
    const system = payload.context?.systemPrompt ?? "";
    if (payload.options?.intent === "compaction") return undefined;
    // Focus's helper prompt; releases before 0.4.110 still call it Prioritizing.
    if (system.includes("You are Focus") || system.includes("You are Prioritizing"))
        return await focusReply(payload);
    const sessionId = payload.options?.sessionId ?? "";
    const messages = payload.context?.messages ?? [];
    const input = messages.map(textOf).join("\n");
    if (sessionId.endsWith(":title")) {
        if (input.includes(prompt)) {
            // The sent message settles before the row takes its name.
            await focusGate("name");
            return { content: [text(`<title>${sessionTitle}</title>`)] };
        }
        const seed = [...seeds, ...steveSeeds].find((candidate) =>
            input.includes(candidate.message),
        );
        if (seed) return { content: [text(`<title>${seed.title}</title>`)] };
        return undefined;
    }
    const last = textOf(messages.findLast((message) => message.role === "user") ?? {}).trim();
    const seed = [...seeds, ...steveSeeds].find((candidate) => input.includes(candidate.message));
    if (seed && !input.includes(prompt)) {
        return focusPaced([text(seed.reply)], { textDeltaDelayMs: 0, completionDelayMs: 0 });
    }
    if (!input.includes(prompt)) return undefined;
    if (last === steveFeedback) return await feedbackReply(payload, emitted);
    return await workReply(payload, emitted);
}

/** The artifact the agent made last, as its create_artifact result names it. */
function artifactIdRead(messages) {
    const call = messages.findLastIndex(
        (message) =>
            message.role === "assistant" &&
            Array.isArray(message.content) &&
            message.content.some(
                (block) =>
                    (block.type === "toolCall" || block.type === "tool_call") &&
                    block.name === "create_artifact",
            ),
    );
    const result = messages
        .slice(call + 1)
        .find((message) => message.role === "tool" || message.role === "toolResult");
    const found = textOf(result ?? {}).match(
        /(?:\bid |artifactId"?\s*[:=]\s*"?|happy-artifact id=")([a-z0-9]{20,32})\b/u,
    );
    if (call < 0 || !found)
        throw new Error(`create_artifact named no artifact: ${JSON.stringify(result)}`);
    return found[1];
}

/**
 * The filmed work. Read, Edit, create_artifact, write_artifact_file,
 * list_teammates and notify_teammate are the daemon's own tools; the
 * screenplay chooses them.
 */
async function workReply(payload, emitted) {
    const sessionId = payload.options?.sessionId ?? "";
    const messages = payload.context?.messages ?? [];
    const key = `stem:${sessionId}`;
    const step = emitted.get(key) ?? 0;
    emitted.set(key, step + 1);
    // The work starts once its row has its icon, so naming and filing read as
    // their own beat before the first tool row arrives.
    if (step === 0) {
        await focusGate("work");
        return core.paced(
            [
                { type: "thinking", thinking: "Checking the existing waveform and voice state." },
                tool("Read", { file_path: core.voicePath }),
            ],
            { thinkingDeltaChunkSize: 4096, thinkingDeltaDelayMs: 2500, toolCallDeltaDelayMs: 600 },
        );
    }
    if (step === 1) {
        await core.gate(sessionId, "reading");
        return core.paced([tool("Read", { file_path: core.logicPath })]);
    }
    if (step === 2) {
        await core.gate(sessionId, "implementation");
        return core.paced(
            [
                tool("Edit", {
                    file_path: core.logicPath,
                    old_string: "    return false;",
                    new_string:
                        "    return connected && (\n        agentSpeaking || userSpeaking\n    );",
                }),
            ],
            { toolCallDeltaDelayMs: 350 },
        );
    }
    if (step === 3) {
        await core.gate(sessionId, "artifact");
        return core.paced([
            tool("create_artifact", {
                type: "html",
                title: artifactTitle,
                display: "inline_expanded",
            }),
        ]);
    }
    if (step === 4)
        return core.paced([
            tool("write_artifact_file", {
                artifactId: artifactIdRead(messages),
                path: "index.html",
                content: artifactPage(),
            }),
        ]);
    if (step === 5) {
        await core.gate(sessionId, "teammates");
        return core.paced([tool("list_teammates", {})]);
    }
    if (step === 6) {
        await core.gate(sessionId, "notify");
        return core.paced([tool("notify_teammate", { userId: steveUserId, reason: loopInReason })]);
    }
    await core.gate(sessionId, "loop-in");
    return core.paced([text(loopInText())], { textDeltaDelayMs: 900, completionDelayMs: 600 });
}

/** Steve's one message from his phone: narrow the waveform, then ship it, and say so. */
async function feedbackReply(payload, emitted) {
    const sessionId = payload.options?.sessionId ?? "";
    const messages = payload.context?.messages ?? [];
    const key = `feedback:${sessionId}`;
    const step = emitted.get(key) ?? 0;
    emitted.set(key, step + 1);
    if (step === 0) {
        await core.gate(sessionId, "narrow");
        return core.paced(
            [
                tool("edit_artifact_file", {
                    artifactId: artifactIdRead(messages),
                    path: "index.html",
                    old_string: `--bars: ${barsBefore};`,
                    new_string: `--bars: ${barsAfter};`,
                }),
            ],
            { toolCallDeltaDelayMs: 400 },
        );
    }
    if (step === 1) {
        await core.gate(sessionId, "ship");
        return core.paced(
            [
                tool("Bash", {
                    command: shipCommand,
                    description: "Ship to production",
                    timeout: 120000,
                }),
            ],
            { toolCallDeltaDelayMs: 400 },
        );
    }
    // The screenplay only claims a deploy the daemon actually reported.
    if (core.shipCommandFailed(messages))
        return core.paced([text(core.shipFailure)], { completionDelayMs: 800 });
    await core.gate(sessionId, "shipped");
    return core.paced([text(shippedText)], { textDeltaDelayMs: 500, completionDelayMs: 600 });
}
