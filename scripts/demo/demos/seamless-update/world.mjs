import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export const id = "seamless-update";
export const daemonUpgrade = { from: "0.4.86", to: "0.4.87-preview.7" };
export const seedMode = {
    effort: "high",
    modelId: "anthropic/fable-5-1",
    permissionMode: "workspace_write",
    providerId: "claude",
    serviceTier: null,
};
export const models = {
    claude: ["anthropic/fable-5-1", "anthropic/opus-5"],
    codex: ["openai/gpt-6-astra"],
};
export const waveformPrompt =
    "Implement speaking-state animation. Keep the waveform quiet while idle.";
export const scrollPrompt =
    "Check that incoming replies preserve the current message and scroll position.";
export const draftStart = "Also keep the waveform ";
export const draftEnd = "quiet while I am reading another session.";
export const draftDuringDrain = "quiet while I am ";
export const draftDuringDown = "reading another session.";
export const draft = draftStart + draftEnd;
export const resumedText = "The waveform is ready. Speaking animates it; silence keeps it quiet.";
export const otherResumedText =
    "Message identity stays stable. Incoming replies keep the current message and scroll position.";

const text = (value) => ({ type: "text", text: value });
const paced = (content, timing = {}) => ({
    content,
    textDeltaChunkSize: 4096,
    textDeltaDelayMs: 120,
    toolCallDeltaDelayMs: 120,
    completionDelayMs: 100,
    ...timing,
});
const artwork = (name) => `demos/core/assets/${name}.png`;
const work = `import { existsSync } from "node:fs";
const name = process.argv[2];
if (!["waveform", "scroll"].includes(name)) throw new Error("Unknown fixture task");
console.log(name === "waveform" ? "Checking speaking and idle states…" : "Checking stable message identity…");
const until = Date.now() + 90_000;
while (!existsSync(".demo/release-" + name)) {
    if (Date.now() > until) throw new Error("The recording did not release the work gate");
    await new Promise((resolve) => setTimeout(resolve, 100));
}
console.log(name === "waveform" ? "Speaking and idle checks complete." : "Message identity and scroll checks complete.");
`;

export const repository = {
    name: "happy-desktop",
    avatar: artwork("happy-desktop"),
    files: {
        "README.md": "# Happy Desktop\n\nProjects, workspaces, and conversations in one place.\n",
        "scripts/capture-work.mjs": work,
        "src/waveform.ts": "export const waveformActive = (speaking: boolean) => speaking;\n",
        "src/messages.ts":
            "export const messageIdentity = (message: { id: string }) => message.id;\n",
        ".demo/.gitkeep": "",
        ".gitignore": ".demo/release-*\n",
    },
};
export const backgroundRepositories = [
    {
        name: "happy",
        avatar: artwork("happy"),
        files: { "README.md": "# Happy\n\nRemote access to your coding agents.\n" },
    },
    {
        name: "travel-vibes",
        avatar: artwork("travel-vibes"),
        files: { "README.md": "# Travel Vibes\n\nA visual trip planner.\n" },
    },
    {
        name: "bra1nDump",
        avatar: artwork("bra1nDump"),
        files: { "README.md": "# bra1nDump\n\nNotes, projects, and things worth remembering.\n" },
    },
];
export const worktrees = ["voice-waveform", "session-scroll"];
export const sessions = [
    {
        id: "waveform",
        worktree: "voice-waveform",
        title: "Animate voice waveform",
        recap: "Speaking animates the waveform. Silence stays quiet.",
        turns: [
            {
                user: "Find the speaking-state hook for the voice waveform.",
                response: {
                    text: "The speaking state is already available. I can use it to animate the waveform and keep silence quiet.",
                },
            },
        ],
    },
    {
        id: "scroll",
        worktree: "session-scroll",
        title: "Preserve message scroll",
        recap: "Keep the same message in view as replies arrive.",
        turns: [
            {
                user: "Find what keeps the current message stable when replies arrive.",
                response: {
                    text: "Stable message IDs keep the current row in place. I will check selection and the scroll anchor while new replies arrive.",
                },
            },
        ],
    },
];

export function turnFind(input) {
    for (const session of sessions)
        for (const turn of session.turns) if (input.includes(turn.user)) return { session, turn };
    return undefined;
}

export async function releaseWork(gym, agentId, name) {
    const { agent } = await gym.client.getAgent(agentId);
    const { workspace } = await gym.client.getWorkspace(agent.workspaceId);
    // The worktree path is an authoritative daemon field, not guessed from its name.
    await writeFile(join(workspace.compute.path, ".demo", `release-${name}`), "release\n");
}

export async function reply(payload, emitted) {
    if (payload.options?.intent === "compaction") return undefined;
    const messages = payload.context?.messages ?? [];
    const input = messages
        .filter((message) => message.role === "user")
        .map((message) =>
            typeof message.content === "string"
                ? message.content
                : (message.content ?? [])
                      .filter((block) => block.type === "text")
                      .map((block) => block.text)
                      .join("\n"),
        )
        .join("\n");
    const name = input.includes(waveformPrompt)
        ? "waveform"
        : input.includes(scrollPrompt)
          ? "scroll"
          : undefined;
    if (!name) return undefined;
    const session = sessions.find((entry) => entry.id === name);
    const sessionId = payload.options?.sessionId ?? "";
    if (sessionId.endsWith(":title"))
        return paced([text(`<title>${session.title}</title>\n<recap>${session.recap}</recap>`)]);
    const key = `seamless-update:${sessionId}`;
    const step = emitted.get(key) ?? 0;
    emitted.set(key, step + 1);
    if (step === 0)
        return paced([
            text(
                name === "waveform"
                    ? "I’m checking the speaking and idle states."
                    : "I’m checking the message identity and scroll anchor.",
            ),
            {
                type: "toolCall",
                name: "Bash",
                arguments: {
                    command: `node scripts/capture-work.mjs ${name}`,
                    description:
                        name === "waveform"
                            ? "Check speaking and idle states"
                            : "Check message identity and scroll",
                    timeout: 120_000,
                },
            },
        ]);
    return paced([text(name === "waveform" ? resumedText : otherResumedText)]);
}
