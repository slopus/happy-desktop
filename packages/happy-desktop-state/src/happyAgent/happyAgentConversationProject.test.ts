import type {
    ChatElement,
    CompactionElement,
    ToolCallElement,
} from "../happyAgentConnection/index.js";
import { expect, it } from "vitest";
import { entryEquivalent } from "../conversation/conversationEntries.js";
import { happyAgentConversationProject } from "./happyAgentConversationProject.js";
import type { MessageBlock } from "@slopus/happy-agent-client";
import { projectElements } from "../happyAgentConnection/projection.js";
import {
    fakeAgentMessage,
    fakeHappyAgentDaemonCreate,
    fakeRun,
} from "../testing/fakeHappyAgentDaemon.js";

function historicalElements(content: MessageBlock[]) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-history" });
    const agent = daemon.agentSeed(project.id, { id: "agent-history" });
    const run = fakeRun({ id: "run-history", status: "completed", endedAt: 2 });
    return projectElements({
        agent,
        config: daemon.configGet(),
        connection: "live",
        endpoint: "http://fake.test",
        mediaUrl: (agentId, toolCallId, index) =>
            `http://fake.test/${agentId}/${toolCallId}/${String(index)}`,
        hasMore: false,
        messages: [
            { message: fakeAgentMessage({ id: "message-history", content }), runId: run.id },
        ],
        runs: [run],
        answeredQuestions: [],
        slashCommands: [],
    });
}

it("projects completed historical show_ui and suggest_replies calls as generic tool rows", () => {
    const elements = historicalElements([
        { type: "text", text: "Choose the next step." },
        {
            type: "tool_call",
            id: "old-ui",
            name: "show_ui",
            status: "completed",
            arguments: { title: "Old controls" },
            result: { shown: true },
            presentation: {
                type: "ui",
                ui: {
                    id: "old-document",
                    components: [
                        { id: "choice", type: "unknown", fallback: "Old control", props: {} },
                    ],
                },
                items: [],
            },
        },
        {
            type: "tool_call",
            id: "old-replies",
            name: "suggest_replies",
            status: "completed",
            arguments: { options: ["Continue", "Stop"] },
            result: { suggested: true },
            presentation: { type: "quick_replies", options: ["Continue", "Stop"] },
        },
    ]);
    const tools = elements.filter((element) => element.kind === "tool_call");
    expect(tools).toHaveLength(2);
    expect(tools.map((tool) => [tool.toolCallId, tool.name, tool.status])).toEqual([
        ["old-ui", "show_ui", "succeeded"],
        ["old-replies", "suggest_replies", "succeeded"],
    ]);
    expect(tools.map((tool) => tool.arguments)).toEqual([
        { title: "Old controls" },
        { options: ["Continue", "Stop"] },
    ]);
    expect(tools.map((tool) => tool.result)).toEqual([
        JSON.stringify({ shown: true }),
        JSON.stringify({ suggested: true }),
    ]);
    expect(tools.every((tool) => !("presentation" in tool))).toBe(true);
    expect(elements.map((element) => element.kind)).toEqual([
        "agent_text",
        "tool_call",
        "tool_call",
        "group_end",
    ]);

    const rows = happyAgentConversationProject({
        elements,
        sessionId: "agent-history",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [],
        answeredUserInputs: [],
        expandedGroupIds: new Set(["run-history"]),
        subagents: [],
    });
    const activities = rows.filter((row) => row.kind === "agentActivity");
    expect(activities).toHaveLength(2);
    expect(activities.map((row) => row.activity)).toEqual([
        expect.objectContaining({
            kind: "tool",
            tool: expect.objectContaining({ toolName: "show_ui" }),
        }),
        expect.objectContaining({
            kind: "tool",
            tool: expect.objectContaining({ toolName: "suggest_replies" }),
        }),
    ]);
});

it("preserves ordinary media presentations and byte routes in historical tool calls", () => {
    const image = {
        kind: "image" as const,
        name: "capture.png",
        mimeType: "image/png",
        size: 512,
        width: 800,
        height: 600,
        scale: 2,
        thumbhash: "placeholder",
        source: { path: "capture.png", absolutePath: "/tmp/capture.png" },
    };
    const elements = historicalElements([
        {
            type: "tool_call",
            id: "media-call",
            name: "present_files",
            status: "completed",
            arguments: { files: ["capture.png"] },
            presentation: {
                type: "media",
                items: [image],
                layout: { type: "columns", columns: 1 },
            },
        },
    ]);
    const tool = elements.find((element) => element.kind === "tool_call");
    expect(tool?.presentation).toEqual({
        kind: "media",
        items: [{ ...image, url: "http://fake.test/agent-history/media-call/0" }],
        layout: { type: "columns", columns: 1 },
    });
});

const running: CompactionElement = {
    id: "compaction:c1",
    groupId: "g1",
    runId: "r1",
    createdAt: 1_000,
    kind: "compaction",
    compactionId: "c1",
    status: "running",
    estimatedTokensBefore: 249_234,
};

function compactionProject(element: CompactionElement) {
    const [entry] = happyAgentConversationProject({
        elements: [element],
        sessionId: "s1",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [],
        answeredUserInputs: [],
        expandedGroupIds: new Set(),
        subagents: [],
    });
    if (entry?.kind !== "agentActivity" || entry.activity.kind !== "labeled")
        throw new Error("Compaction did not project to labeled activity.");
    return entry.activity;
}

it("projects humanized token subjects throughout compaction", () => {
    expect(compactionProject(running)).toEqual({
        kind: "labeled",
        label: "Compacting context",
        subject: "from 249k tokens",
        status: "running",
        mono: false,
    });

    expect(
        compactionProject({
            ...running,
            status: "completed",
            estimatedTokensAfter: 5_330,
        }),
    ).toEqual({
        kind: "labeled",
        label: "Compacted context",
        subject: "249k → 5.3k tokens",
        status: "success",
        mono: false,
    });
});

it("keeps a standalone manual compaction activity and completion time", () => {
    const completed: CompactionElement = {
        ...running,
        status: "completed",
        estimatedTokensAfter: 5_330,
    };
    const groupEnd: Extract<ChatElement, { kind: "group_end" }> = {
        id: "group-end:g1",
        groupId: "g1",
        runId: "r1",
        createdAt: 32_000,
        kind: "group_end",
        turnKind: "compaction",
        outcome: "success",
        reason: "completed",
        startedAt: 1_000,
        endedAt: 32_000,
        elapsedMs: 31_000,
        turnStartedAt: 1_000,
        turnElapsedMs: 31_000,
        modelTurn: true,
    };

    const projected = happyAgentConversationProject({
        elements: [completed, groupEnd],
        sessionId: "s1",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [],
        answeredUserInputs: [],
        expandedGroupIds: new Set(),
        subagents: [],
    });

    expect(projected).toHaveLength(2);
    expect(projected[0]).toMatchObject({
        kind: "agentActivity",
        activity: {
            kind: "labeled",
            label: "Compacted context",
            subject: "249k → 5.3k tokens",
            status: "success",
        },
    });
    expect(projected[1]).toMatchObject({
        kind: "turnStatus",
        status: "complete",
        durationMs: 31_000,
    });
});

const askTool: ToolCallElement = {
    id: "tool:ask-1",
    groupId: "g1",
    runId: "r1",
    createdAt: 2_000,
    kind: "tool_call",
    toolCallId: "ask-1",
    name: "AskUserQuestion",
    arguments: {},
    argumentsComplete: true,
    status: "succeeded",
};

const questions = [
    {
        id: "choice",
        header: "Choose",
        question: "Which direction?",
        multiSelect: false,
        required: true,
        options: [{ label: "Native", description: "Keep it quiet." }],
    },
] as const;

it("keeps a pending Ask User request inside its turn, replacing the tool row", () => {
    const entries = happyAgentConversationProject({
        elements: [askTool],
        sessionId: "s1",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [{ requestId: "ask-1", questions }],
        answeredUserInputs: [],
        expandedGroupIds: new Set(),
        subagents: [],
    });

    expect(entries).toEqual([
        {
            kind: "request",
            id: "request:ask-1",
            sequence: "00000001",
            traceFoldTargetId: "g1",
            // The reply's first row opens its author line.
            opensGroup: true,
            request: {
                kind: "userInput",
                requestId: "ask-1",
                questions,
                status: "pending",
            },
        },
    ]);
});

it("keeps an answered Ask User request once and prefers it over a stale pending copy", () => {
    const entries = happyAgentConversationProject({
        elements: [askTool],
        sessionId: "s1",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [{ requestId: "ask-1", questions }],
        answeredUserInputs: [
            {
                requestId: "ask-1",
                questions,
                answers: { choice: ["Native"] },
                createdAt: 1_900,
                resolvedAt: 2_100,
            },
        ],
        expandedGroupIds: new Set(),
        subagents: [],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
        kind: "request",
        id: "request:ask-1",
        sequence: "00000001",
        request: {
            kind: "userInput",
            requestId: "ask-1",
            status: "answered",
            answers: { choice: ["Native"] },
            createdAt: 1_900,
            resolvedAt: 2_100,
        },
    });
});

it("appends a pending request with no element of its own and drops an answered one", () => {
    const base = {
        elements: [],
        sessionId: "s1",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [{ requestId: "ask-1", questions }],
        expandedGroupIds: new Set<string>(),
        subagents: [],
    } as const;

    expect(
        happyAgentConversationProject({
            ...base,
            answeredUserInputs: [],
        }),
    ).toHaveLength(1);
    expect(
        happyAgentConversationProject({
            ...base,
            pendingUserInputs: [],
            answeredUserInputs: [
                {
                    requestId: "ask-1",
                    questions,
                    answers: { choice: ["Native"] },
                    createdAt: 1_900,
                    resolvedAt: 2_100,
                },
            ],
        }),
    ).toEqual([]);
});

it("keeps a completed file edit visible while command traces are folded", () => {
    const base = { groupId: "edit-turn", runId: "edit-run", createdAt: 1000 };
    const elements: ChatElement[] = [
        {
            ...base,
            id: "command",
            kind: "tool_call",
            toolCallId: "command",
            name: "exec_command",
            arguments: {},
            argumentsComplete: true,
            status: "succeeded",
            presentation: { kind: "command", command: "git status", output: "" },
        },
        {
            ...base,
            id: "edit",
            kind: "tool_call",
            toolCallId: "edit",
            name: "apply_patch",
            arguments: {},
            argumentsComplete: true,
            status: "succeeded",
            presentation: {
                kind: "file_edit",
                files: [
                    {
                        path: "lol.txt",
                        kind: "add",
                        added: 1,
                        deleted: 0,
                        hunks: [
                            {
                                oldStart: 0,
                                newStart: 1,
                                lines: [{ kind: "add", text: "Hello : D" }],
                            },
                        ],
                    },
                ],
            },
        },
        {
            ...base,
            id: "answer",
            kind: "agent_text",
            messageId: "answer",
            text: "Created lol.txt.",
            complete: true,
        },
        {
            ...base,
            id: "end",
            kind: "group_end",
            outcome: "success",
            reason: "completed",
            startedAt: 1000,
            endedAt: 2000,
            elapsedMs: 1000,
            turnStartedAt: 1000,
            turnElapsedMs: 1000,
            modelTurn: true,
        },
    ];
    const input = {
        elements,
        sessionId: "s1",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [],
        answeredUserInputs: [],
        subagents: [],
    };
    const collapsed = happyAgentConversationProject({ ...input, expandedGroupIds: new Set() });
    const expanded = happyAgentConversationProject({
        ...input,
        expandedGroupIds: new Set(["edit-turn"]),
    });
    const edits = (entries: typeof collapsed) =>
        entries.filter(
            (entry): entry is Extract<(typeof collapsed)[number], { kind: "agentActivity" }> =>
                entry.kind === "agentActivity" &&
                entry.activity.kind === "tool" &&
                entry.activity.tool.presentation?.type === "fileDiff",
        );
    expect(edits(collapsed)).toHaveLength(1);
    expect(edits(expanded)).toHaveLength(1);
    expect(edits(collapsed)[0]).toMatchObject({
        id: edits(expanded)[0]!.id,
        activity: { tool: { presentation: { files: [{ path: "lol.txt", added: 1 }] } } },
    });
    expect(
        collapsed.some(
            (entry) =>
                entry.kind === "agentActivity" &&
                entry.activity.kind === "tool" &&
                entry.activity.tool.presentation?.type === "execCommand",
        ),
    ).toBe(false);
    expect(
        expanded.some(
            (entry) =>
                entry.kind === "agentActivity" &&
                entry.activity.kind === "tool" &&
                entry.activity.tool.presentation?.type === "execCommand",
        ),
    ).toBe(true);
});

it("carries the words a call gave about itself as a compact single-line summary", () => {
    const call = (name: string, input: unknown, id = name): ChatElement => ({
        id,
        groupId: "g1",
        runId: "r1",
        createdAt: 1_000,
        kind: "tool_call",
        toolCallId: id,
        name,
        arguments: input,
        argumentsComplete: true,
        status: "running",
    });
    const entries = happyAgentConversationProject({
        elements: [
            call("exec_command", { cmd: "pnpm test", description: "  Run the UI tests " }),
            call("Bash", { command: "ls", description: "List files\nand more" }),
            call("create_subtask", { title: "Fix trace folding", prompt: "…" }),
            call("send_agent_message", {
                toAgentId: "a",
                text: "…",
                explanation: "Asks for the diff",
            }),
            call("create_task", { name: "Nightly triage", description: "Triage the night's bugs" }),
            call("exec_command", { cmd: "ls", description: "x".repeat(121) }, "long"),
            call("python", { code: "print(1)", description: "  Inspect\u0085the\u2003data  " }),
            call("apply_patch", { patch: "...", description: "Update both parsers" }),
            call("write_stdin", { chars: "y", description: "Confirm the prompt" }),
            call("kill_session", { session_id: 1, description: "Stop the build" }),
            call("update_artifact", { title: "Report", description: "Publish corrected totals" }),
            call("create_task", { description: "Investigate the regression" }, "unnamed-task"),
            call("create_task", { description: "\u0085  ", name: "Nightly triage" }, "blank-task"),
            call("create_bot", { description: "Watch the release", name: "Watcher" }),
            call("web_fetch", { url: "https://example.com/docs" }),
            call("lookup_secret", { name: "PRIVATE_KEY" }),
            call("mcp__docs__exec_command_0123456789abcdef", { description: "Semantic input" }),
            call("exec_command", { description: "😀".repeat(121) }, "unicode-long"),
            call("move_vault_file", { path: "notes/old.md", toPath: "notes/new.md" }),
            call("request_user_input", {
                questions: [{ question: "Which account?" }, { question: "Which region?" }],
            }),
        ],
        sessionId: "s1",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [],
        answeredUserInputs: [],
        expandedGroupIds: new Set(),
        subagents: [],
    });
    expect(
        entries.map((entry) =>
            entry.kind === "agentActivity" && entry.activity.kind === "tool"
                ? entry.activity.tool.summary
                : entry.kind,
        ),
    ).toEqual([
        "Run the UI tests",
        "List files and more",
        "Fix trace folding",
        "Asks for the diff",
        "Triage the night's bugs",
        `${"x".repeat(119)}…`,
        "Inspect the data",
        "Update both parsers",
        "Confirm the prompt",
        "Stop the build",
        "Publish corrected totals",
        "Investigate the regression",
        "Nightly triage",
        "Watch the release",
        "https://example.com/docs",
        undefined,
        undefined,
        `${"😀".repeat(119)}…`,
        "notes/old.md → notes/new.md",
        "Which account? · Which region?",
    ]);
    const tools = entries.flatMap((entry) =>
        entry.kind === "agentActivity" && entry.activity.kind === "tool"
            ? [entry.activity.tool]
            : [],
    );
    expect(tools.find((tool) => tool.toolCallId === "create_task")?.summaryKind).toBe(
        "description",
    );
    expect(tools.find((tool) => tool.toolCallId === "blank-task")?.summaryKind).toBe("subject");
    expect(tools.find((tool) => tool.toolCallId === "unicode-long")?.arguments).toEqual({
        description: "😀".repeat(121),
    });
    const described = entries[0]!;
    if (described.kind !== "agentActivity" || described.activity.kind !== "tool") {
        throw new Error("Expected the described tool row");
    }
    expect(
        entryEquivalent(described, {
            ...described,
            activity: {
                ...described.activity,
                tool: { ...described.activity.tool, summaryKind: "subject" },
            },
        }),
    ).toBe(false);
});
