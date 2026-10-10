import type { ConversationToolCall } from "happy-desktop-state";
import { AgentActivityRow } from "../../src/AgentActivityRow";
import { ComponentPage, Specimen } from "../kit";
import { agentSpawnRows } from "./agentSpawnFixtures";
import {
    happyAgentAwaitingTool,
    happyAgentCompactionCompletedTool,
    happyAgentCompactionFailedTool,
    happyAgentCompactionRunningTool,
    happyAgentElevatedTool,
    happyAgentExecTool,
    happyAgentExplorationTool,
    happyAgentFailedTool,
    happyAgentFileDiffTool,
    happyAgentGenericTool,
    happyAgentMcpInterruptedTool,
    happyAgentMcpTool,
    happyAgentRunningTool,
    happyAgentStoppedTool,
    happyAgentTerminalTool,
} from "./happyAgentChatFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-148";

export function AgentActivityRowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One glanceable row per piece of agent activity — a tool call, a reasoning block, or a shell run — with a status dot, verb, subject, and an expandable detail body."
            title="AgentActivityRow"
        >
            <Specimen
                detail="Typed catalog names only · unresolved, running, success, failure, stopped, approval, and another provider · focused production treatment"
                label="Model-aware sub-agent spawning"
                number="spawn"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        width: "720px",
                    }}
                >
                    {agentSpawnRows.map((tool) => (
                        <AgentActivityRow
                            activity={{ kind: "tool", tool }}
                            key={tool.toolCallId}
                            motion="calm"
                            singleLine
                            treatment="focused"
                        />
                    ))}
                </div>
            </Specimen>
            <Specimen
                detail="file diff, exec command, and background terminal, expanded"
                label="Rich tool bodies"
                number="01"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        width: "720px",
                    }}
                >
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentFileDiffTool }}
                        defaultExpanded
                    />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentExecTool }}
                        defaultExpanded
                    />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentTerminalTool }}
                        defaultExpanded
                    />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentExplorationTool }}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="running, awaiting approval, elevated, failed, stopped, generic, and compaction lifecycle rows collapsed · trailing time reveals on row hover"
                label="Status treatments"
                number="02"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        width: "720px",
                    }}
                >
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentRunningTool }}
                        time="10:42 AM"
                    />
                    <AgentActivityRow activity={{ kind: "tool", tool: happyAgentAwaitingTool }} />
                    <AgentActivityRow activity={{ kind: "tool", tool: happyAgentElevatedTool }} />
                    <AgentActivityRow activity={{ kind: "tool", tool: happyAgentFailedTool }} />
                    <AgentActivityRow activity={{ kind: "tool", tool: happyAgentStoppedTool }} />
                    <AgentActivityRow activity={{ kind: "tool", tool: happyAgentGenericTool }} />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentCompactionRunningTool }}
                    />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentCompactionCompletedTool }}
                    />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentCompactionFailedTool }}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="MCP result rows and an interrupted MCP call"
                label="MCP calls"
                number="03"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        width: "720px",
                    }}
                >
                    <AgentActivityRow activity={{ kind: "tool", tool: happyAgentMcpTool }} />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: happyAgentMcpInterruptedTool }}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="reasoning collapsed and expanded, plus a finished shell run"
                label="Reasoning and shell"
                number="04"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        width: "720px",
                    }}
                >
                    <AgentActivityRow
                        activity={{
                            kind: "reasoning",
                            text: "The mutex is acquired non-atomically.\n\nA blocking lock removes the window entirely.",
                            streaming: true,
                        }}
                    />
                    <AgentActivityRow
                        activity={{
                            kind: "reasoning",
                            text: "The mutex is acquired non-atomically.\n\nA blocking lock removes the window entirely.",
                            streaming: false,
                        }}
                        defaultExpanded
                    />
                    <AgentActivityRow
                        activity={{
                            kind: "shell",
                            command: "git status --short",
                            output: " M packages/happy-desktop-ui/src/ConversationView.tsx\n",
                            exitCode: 0,
                            running: false,
                            timedOut: false,
                        }}
                    />
                    <AgentActivityRow
                        activity={{
                            kind: "shell",
                            command: "pnpm build",
                            output: "error TS2322: Type mismatch",
                            exitCode: 1,
                            running: false,
                            timedOut: false,
                        }}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="a command wider than its row scrolls sideways behind a 24px fade · detailed rows reveal copy metadata and the focused row overlays its start time without reflow"
                label="Overflowing subject"
                number="05"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        width: "420px",
                    }}
                >
                    <AgentActivityRow activity={{ kind: "tool", tool: longExecTool }} />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: longExecTool }}
                        onToolSelect={() => undefined}
                        singleLine
                    />
                    <AgentActivityRow
                        activity={{ kind: "tool", tool: longExecTool }}
                        onToolSelect={() => undefined}
                        singleLine
                        time="10:45 AM"
                        treatment="focused"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="a collaborator's message collapsed to one line, and expanded onto the message it delivered · the sender named and pictured as its own row is: a subtask's generated mark, a bot's picture, a team task's owner initials, a standalone task's glyph · a sender nobody can name falls back to the start of its agent id"
                label="Agent message"
                number="06"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        width: "720px",
                    }}
                >
                    <AgentActivityRow
                        activity={{
                            kind: "agentMessage",
                            agentId: "v2eibi1k9zgwde56wwuhrbku",
                            agentName: "Retry policy rewrite",
                            agentFace: { kind: "generated", seed: "v2eibi1k9zgwde56wwuhrbku" },
                            text: AGENT_MESSAGE_TEXT,
                        }}
                    />
                    <AgentActivityRow
                        activity={{
                            kind: "agentMessage",
                            agentId: "v2eibi1k9zgwde56wwuhrbku",
                            agentName: "Retry policy rewrite",
                            agentFace: { kind: "generated", seed: "v2eibi1k9zgwde56wwuhrbku" },
                            text: AGENT_MESSAGE_TEXT,
                        }}
                        defaultExpanded
                    />
                    <AgentActivityRow
                        activity={{
                            kind: "agentMessage",
                            agentId: "byf9avtdw66p0lmixwkcut57",
                            agentName: "Release helper",
                            agentFace: { kind: "image", url: BOT_PICTURE },
                            text: AGENT_MESSAGE_TEXT,
                        }}
                    />
                    <AgentActivityRow
                        activity={{
                            kind: "agentMessage",
                            agentId: "k3n2b8x0q1w9e7r6t5y4u3i2",
                            agentName: "Fix invoice rounding",
                            agentFace: { kind: "initials", initials: "AL" },
                            text: AGENT_MESSAGE_TEXT,
                        }}
                    />
                    <AgentActivityRow
                        activity={{
                            kind: "agentMessage",
                            agentId: "p0o9i8u7y6t5r4e3w2q1a2s3",
                            agentName: "Ship the launch checklist",
                            agentFace: { kind: "task" },
                            text: AGENT_MESSAGE_TEXT,
                        }}
                    />
                    <AgentActivityRow
                        activity={{
                            kind: "agentMessage",
                            agentId: "v2eibi1k9zgwde56wwuhrbku",
                            text: AGENT_MESSAGE_TEXT,
                        }}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}

/** A bot's own picture, small and plain, as a bot's row would carry it. */
const BOT_PICTURE = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2563eb"/><circle cx="16" cy="13" r="6" fill="#fde68a"/><rect x="8" y="22" width="16" height="6" rx="3" fill="#fde68a"/></svg>',
)}`;

/** One collaborator's delivered message, envelope and all, as Happy Agent writes it. */
const AGENT_MESSAGE_TEXT = [
    "Message from agent v2eibi1k9zgwde56wwuhrbku:",
    "",
    "Read-only findings (no edits/tests).",
    "",
    "The retry budget is spent before the first backoff, so a failed call retries",
    "immediately three times and then reports the original error.",
].join("\n");

/** A command far wider than a 420px row, so the scroll and its fade are visible. */
const longExecTool: ConversationToolCall = {
    ...happyAgentExecTool,
    toolCallId: "tool-exec-long",
    presentation: {
        type: "execCommand",
        command: "pnpm --dir packages/happy-desktop-electron build",
        output: "Built the desktop renderer.",
    },
};
