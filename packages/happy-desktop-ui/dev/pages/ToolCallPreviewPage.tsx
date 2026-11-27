import type { ConversationToolCall } from "happy-desktop-state";
import { ToolCallPreview } from "../../src/ToolCallPreview";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    agentSpawnCompleted,
    agentSpawnFailed,
    agentSpawnStopped,
    agentSpawnUnresolved,
} from "./agentSpawnFixtures";
import { happyAgentFileCreateTool } from "./happyAgentChatFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-165";

const runningCommand: ConversationToolCall = {
    toolCallId: "tool-preview-running",
    toolName: "exec_command",
    arguments: {
        cmd: "pnpm --dir packages/happy-desktop-electron typecheck --pretty false",
    },
    status: "running",
    failed: false,
    presentation: {
        type: "execCommand",
        command:
            "pnpm --dir packages/happy-desktop-electron typecheck --pretty false && rg --hidden --glob '!node_modules' extraordinarily_long_generated_identifier packages/happy-desktop-electron/sources",
        output:
            "Checking packages/happy-desktop-electron/sources/main/happyAgentProjection.ts\n" +
            "extraordinarily_long_generated_identifier_without_natural_break_points_stays_inside_the_sidebar",
    },
};

const completedCommand: ConversationToolCall = {
    ...runningCommand,
    toolCallId: "tool-preview-completed",
    status: "success",
    display: "Command completed successfully",
    presentation: {
        type: "execCommand",
        command: "pnpm --dir packages/happy-desktop-electron typecheck",
        output: "TypeScript found no errors.\nFinished in 1.1s.",
    },
};

/* A patch longer and wider than the panel: the inspector has to scroll down to
   its result, and every diff line has to stay readable at 250px. */
const patch: ConversationToolCall = {
    toolCallId: "tool-preview-patch",
    toolName: "apply_patch",
    arguments: { path: "README.md" },
    status: "success",
    failed: false,
    display: "Applied patch",
    presentation: {
        type: "fileDiff",
        files: [
            {
                path: "/Users/steve/Developer/murmur/README.md",
                kind: "update",
                added: 14,
                deleted: 14,
                hunks: [
                    {
                        oldStart: 1,
                        newStart: 1,
                        lines: [
                            ...Array.from({ length: 14 }, (_unused, index) => ({
                                kind: "delete" as const,
                                text: `**Offline-First** — agents do not need to be online at the same time, line ${String(index + 1)}`,
                            })),
                            ...Array.from({ length: 14 }, (_unused, index) => ({
                                kind: "add" as const,
                                text: `Murmur ships as one public library for browsers and Node.js, line ${String(index + 1)}`,
                            })),
                        ],
                    },
                ],
            },
        ],
    },
};

/* Calls with no presentation, as Happy Cloud records them: the inspector
   reads each known tool's own arguments and structured result. */
const cloudBash: ConversationToolCall = {
    toolCallId: "tool-preview-cloud-bash",
    toolName: "Bash",
    arguments: {
        command:
            "cd happy-cluster && ls crates/hc-store/src | tr '\\n' ' '; echo; grep -rn \"pub async fn join\" crates --include=*.rs | head",
        description: "Explore compute model in cluster",
    },
    status: "success",
    failed: false,
    summary: "Explore compute model in cluster",
    summaryKind: "description",
    result: {
        command: "cd happy-cluster && ls crates/hc-store/src",
        stdout: "agents.rs archive.rs artifact_data.rs artifacts.rs attachments.rs blobs.rs\nbot_replies.rs bots.rs calendar.rs catalog.rs checkouts.rs compute.rs\ncrates/hc-api/src/routes/pools.rs:41:pub async fn join_computer(",
        stderr: "",
        exitCode: 0,
        truncated: false,
        wallTimeSeconds: 0.412,
    },
};

const cloudBashFailed: ConversationToolCall = {
    toolCallId: "tool-preview-cloud-bash-failed",
    toolName: "Bash",
    arguments: { command: "pnpm typecheck", description: "Typecheck the workspace" },
    status: "failed",
    failed: true,
    summary: "Typecheck the workspace",
    summaryKind: "description",
    result: {
        command: "pnpm typecheck",
        stdout: "> tsc --project tsconfig.json",
        stderr: "src/App.tsx(12,7): error TS2322: Type 'string' is not assignable to type 'number'.",
        exitCode: 2,
        truncated: false,
        wallTimeSeconds: 6.8,
    },
};

const cloudRead: ConversationToolCall = {
    toolCallId: "tool-preview-cloud-read",
    toolName: "Read",
    arguments: {
        file_path: "happy-desktop/packages/happy-desktop-ui/src/Icon.tsx",
        offset: 7,
        limit: 4,
    },
    status: "success",
    failed: false,
    result: {
        outcome: "text",
        path: "/work/happy-desktop/packages/happy-desktop-ui/src/Icon.tsx",
        content: '7\texport type IconName =\n8\t    | "home"\n9\t    | "inbox"\n10\t    | "chat"',
        start_line: 7,
        returned_lines: 4,
        total_lines: 420,
        truncated: true,
    },
};

const cloudEdit: ConversationToolCall = {
    toolCallId: "tool-preview-cloud-edit",
    toolName: "Edit",
    arguments: {
        file_path: "happy-desktop/packages/happy-desktop-state/src/happyAgentConnection/types.ts",
        old_string: "    result?: string;\n    presentation?: ToolPresentation;",
        new_string:
            "    result?: string;\n    resultValue?: unknown;\n    presentation?: ToolPresentation;",
    },
    status: "success",
    failed: false,
    result: {
        path: "/work/happy-desktop/packages/happy-desktop-state/src/happyAgentConnection/types.ts",
        replacements: 1,
    },
};

const cloudGrep: ConversationToolCall = {
    toolCallId: "tool-preview-cloud-grep",
    toolName: "Grep",
    arguments: {
        pattern: "ToolCallPreview",
        path: "packages",
        glob: "*.tsx",
        output_mode: "files_with_matches",
    },
    status: "success",
    failed: false,
    result: {
        text: "packages/happy-desktop-ui/src/ToolCallPreview.tsx\npackages/happy-desktop-app/sources/AppHappyAgentView.tsx",
        matched_files: 2,
        match_count: 2,
        truncated: false,
    },
};

const cloudPython: ConversationToolCall = {
    toolCallId: "tool-preview-cloud-python",
    toolName: "python",
    arguments: {
        code: "from pathlib import Path\nprint(len(list(Path('/local').iterdir())))",
        description: "Count local files",
    },
    status: "success",
    failed: false,
    summary: "Count local files",
    summaryKind: "description",
    result: { output: "12\n", error: null },
};

const cloudGeneric: ConversationToolCall = {
    toolCallId: "tool-preview-cloud-generic",
    toolName: "attach_repository",
    arguments: { repository: "happy-desktop", description: "Check out happy-desktop" },
    status: "success",
    failed: false,
    summary: "Check out happy-desktop",
    summaryKind: "description",
    result: "happy-desktop is checked out at `happy-desktop` in the workspace on branch happy/kmwzeddd.",
};

function Preview(props: { tool: ConversationToolCall; width: number }) {
    return (
        <div
            style={{
                border: "1px solid var(--divider)",
                display: "flex",
                height: "420px",
                width: `${String(props.width)}px`,
            }}
        >
            <ToolCallPreview tool={props.tool} />
        </div>
    );
}

export function ToolCallPreviewPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A read-only inspector for one tool call, with its command available immediately and result output added as execution progresses."
            title="Tool call preview"
        >
            <div className="specimen-grid">
                {[
                    agentSpawnCompleted,
                    agentSpawnUnresolved,
                    agentSpawnFailed,
                    agentSpawnStopped,
                ].map((tool) => (
                    <Specimen
                        detail="Authoritative catalog identity and successful child ID only · raw arguments and result stay inspectable"
                        key={tool.toolCallId}
                        label={`Sub-agent · ${tool.status}${tool.presentation?.type === "agentSpawn" && !tool.presentation.model ? " · unresolved" : ""}`}
                        number={tool.toolCallId}
                        stage="app"
                    >
                        <div style={{ padding: "24px" }}>
                            <Preview tool={tool} width={250} />
                            <DimensionRule label="250px · exact model and provider IDs" />
                        </div>
                    </Specimen>
                ))}
                <Specimen
                    detail="250px inspector minimum · long command and output wrap inside the panel"
                    label="Running Bash call"
                    number="T-01"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Preview tool={runningCommand} width={250} />
                        <DimensionRule label="250px · wrapped mono content" />
                    </div>
                </Specimen>
                <Specimen
                    detail="360px inspector maximum · completed output enriches the initial command preview"
                    label="Completed Bash call"
                    number="T-02"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Preview tool={completedCommand} width={360} />
                        <DimensionRule label="360px · completed result" />
                    </div>
                </Specimen>
                <Specimen
                    detail="250px inspector · a patch taller and wider than the panel scrolls down to its result, with every diff line wrapped in place"
                    label="File edit"
                    number="T-03"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Preview tool={patch} width={250} />
                        <DimensionRule label="250px · wrapped diff lines" />
                    </div>
                </Specimen>
                <Specimen
                    detail="250px inspector · a created file reads as its highlighted source, wrapped"
                    label="File created"
                    number="T-04"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Preview tool={happyAgentFileCreateTool} width={250} />
                        <DimensionRule label="250px · highlighted file lines" />
                    </div>
                </Specimen>
                {(
                    [
                        ["T-05", "Cloud Bash call", cloudBash],
                        ["T-06", "Cloud Bash call · nonzero exit", cloudBashFailed],
                        ["T-07", "Read", cloudRead],
                        ["T-08", "Edit", cloudEdit],
                        ["T-09", "Grep", cloudGrep],
                        ["T-10", "Python", cloudPython],
                        ["T-11", "Unknown tool", cloudGeneric],
                    ] as const
                ).map(([number, label, tool]) => (
                    <Specimen
                        detail="300px inspector · a call with no presentation reads its known tool's arguments and structured result instead of JSON"
                        key={number}
                        label={label}
                        number={number}
                        stage="app"
                    >
                        <div style={{ padding: "24px" }}>
                            <Preview tool={tool} width={300} />
                            <DimensionRule label="300px · known tool body" />
                        </div>
                    </Specimen>
                ))}
            </div>
        </ComponentPage>
    );
}
