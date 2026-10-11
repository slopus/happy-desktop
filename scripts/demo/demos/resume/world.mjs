import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { backgroundRepositories, models, seedMode } from "../seamless-update/world.mjs";

export { backgroundRepositories, models, seedMode };
export const id = "resume-portrait-upgrade";
export const daemonUpgrade = { from: "0.4.87-preview.6", to: "0.4.87-preview.7" };
export const prompt = "Check the waveform, then verify the idle state.";
export const firstCommand = "node check.mjs";
export const secondCommand = "node verify.mjs";
export const resumedText = "Speaking is checked. Verifying silence now.";
export const finalText = "The waveform moves when you speak and stays quiet when idle.";
export const worktrees = [];
export const repository = {
    name: "happy-desktop",
    avatar: "demos/core/assets/happy-desktop.png",
    files: {
        "README.md": "# Happy Desktop\n\nVoice waveform fixture.\n",
        ".gitignore": ".demo/release\n",
        ".demo/.gitkeep": "",
        "check.mjs": `import { existsSync } from "node:fs";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
console.log("Checking the speaking state…");
const until = Date.now() + 90000;
while (!existsSync(".demo/release")) {
    if (Date.now() > until) throw new Error("Recording did not release the tool");
    console.log("Speaking: waveform moves.");
    await pause(650);
}
console.log("Speaking state checked.");
`,
        "verify.mjs": `const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
console.log("Verifying the idle state…");
await pause(650);
console.log("Silence: waveform stays quiet.");
await pause(650);
console.log("Speaking: waveform moves again.");
await pause(700);
console.log("Both states verified.");
`,
    },
};
export const sessions = [
    {
        id: "waveform",
        worktree: null,
        title: "Animate waveform",
        recap: "Speaking moves the waveform. Silence stays quiet.",
        turns: [
            {
                user: "Keep the voice waveform quiet when idle.",
                response: { text: "I’ll check speaking first, then verify silence." },
            },
        ],
    },
];
export function turnFind(input) {
    const session = sessions[0];
    const turn = session.turns[0];
    return input.includes(turn.user) ? { session, turn } : undefined;
}
export async function releaseWork(gym, agentId) {
    const { agent } = await gym.client.getAgent(agentId);
    const { workspace } = await gym.client.getWorkspace(agent.workspaceId);
    await writeFile(join(workspace.compute.path, ".demo", "release"), "release\n");
}
const text = (value) => ({ type: "text", text: value });
const tool = (command, description) => ({
    type: "toolCall",
    name: "Bash",
    arguments: { command, description, timeout: 120000 },
});
export function reply(payload, emitted) {
    if (payload.options?.intent === "compaction") return undefined;
    const sessionId = payload.options?.sessionId ?? "";
    const input = (payload.context?.messages ?? [])
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
    if (!input.includes(prompt)) return undefined;
    if (sessionId.endsWith(":title"))
        return {
            content: [
                text(
                    "<title>Animate waveform</title>\n<recap>Speaking moves. Silence stays quiet.</recap>",
                ),
            ],
        };
    const key = `portrait-resume:${sessionId}`;
    const step = emitted.get(key) ?? 0;
    emitted.set(key, step + 1);
    return {
        content:
            step === 0
                ? [text("Checking the speaking state."), tool(firstCommand, "Check speaking")]
                : step === 1
                  ? [text(resumedText), tool(secondCommand, "Verify silence")]
                  : [text(finalText)],
        textDeltaChunkSize: 8,
        textDeltaDelayMs: 45,
        toolCallDeltaDelayMs: 0,
        completionDelayMs: 80,
    };
}
