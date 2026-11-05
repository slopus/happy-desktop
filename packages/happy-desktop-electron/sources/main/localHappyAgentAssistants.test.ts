import { describe, expect, it, vi } from "vitest";
import { localRuntimeProbe, type HappyAgentProcessHost } from "./localHappyAgent";

/** A login shell that names exactly the commands in `onPath`, with HOME at /Users/alice. */
function shellHost(onPath: Partial<Record<"claude" | "codex" | "grok", string>>) {
    const host: HappyAgentProcessHost = {
        execFile: async () => ({
            stderr: "",
            stdout: [
                "__HAPPY_NODE_PATH__=/opt/homebrew/bin/node",
                "__HAPPY_NODE_VERSION__=v22.11.0",
                `__HAPPY_CLAUDE_PATH__=${onPath.claude ?? ""}`,
                `__HAPPY_CODEX_PATH__=${onPath.codex ?? ""}`,
                `__HAPPY_GROK_PATH__=${onPath.grok ?? ""}`,
                "HOME=/Users/alice",
                "PATH=/opt/homebrew/bin:/usr/bin:/bin",
                "",
            ].join("\0"),
        }),
    };
    return host;
}

const LAUNCH = { HOME: "/Users/alice", PATH: "/usr/bin:/bin", SHELL: "/bin/zsh" };

describe.skipIf(process.platform === "win32")("assistant discovery on macOS and Linux", () => {
    it("finds an assistant at its installer's location when the login PATH does not name it", async () => {
        const executable = vi.fn(async (path: string) => path === "/Users/alice/.local/bin/claude");
        const probe = await localRuntimeProbe(
            shellHost({ codex: "/opt/homebrew/bin/codex" }),
            LAUNCH,
            undefined,
            executable,
        );

        expect(probe.assistants).toEqual({
            claude: "/Users/alice/.local/bin/claude",
            codex: "/opt/homebrew/bin/codex",
        });
        expect(probe.assistantsRefreshed).toEqual(["claude"]);
        // What the shell already found is not second-guessed.
        expect(executable.mock.calls.map(([path]) => path).sort()).toEqual([
            "/Users/alice/.grok/bin/grok",
            "/Users/alice/.local/bin/claude",
        ]);
    });

    it("reports an assistant missing when nothing runnable is at its location either", async () => {
        const probe = await localRuntimeProbe(shellHost({}), LAUNCH, undefined, async () => false);

        expect(probe.assistants).toEqual({});
        expect(probe.assistantsRefreshed).toEqual([]);
    });
});
