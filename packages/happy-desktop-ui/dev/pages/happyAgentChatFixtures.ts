import type {
    ConversationEntry,
    ConversationMessageEntry,
    ConversationRequest,
    ConversationSummary,
    ConversationToolCall,
    HappyAgentMenusSnapshot,
} from "happy-desktop-state";

/** One local message projection, with the collaborative fields left empty. */
function message(
    id: string,
    author: "you" | "agent",
    text: string,
    generationStatus?: "streaming" | "complete",
): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "fixture-session",
            sequence: id,
            changePts: id,
            sender:
                author === "you"
                    ? {
                          id: "happy-agent:owner",
                          displayName: "You",
                          username: "you",
                          kind: "human",
                      }
                    : {
                          id: "happy-agent:agent",
                          displayName: "Happy",
                          username: "happy",
                          kind: "agent",
                          agentRole: "default",
                      },
            text,
            ...(generationStatus ? { generationStatus } : {}),
            attachments: [],
            reactions: [],
            createdAt: "2026-07-25T09:41:00.000Z",
        },
    };
}

export const happyAgentFileDiffTool: ConversationToolCall = {
    toolCallId: "tool-diff",
    toolName: "edit",
    arguments: { path: "src/auth/refresh.ts" },
    status: "success",
    failed: false,
    display: "Edited src/auth/refresh.ts",
    presentation: {
        type: "fileDiff",
        files: [
            {
                path: "src/auth/refresh.ts",
                kind: "update",
                added: 2,
                deleted: 1,
                omittedLines: 4,
                hunks: [
                    {
                        oldStart: 41,
                        newStart: 41,
                        lines: [
                            { kind: "context", text: "async refresh(token: Token) {" },
                            { kind: "delete", text: "  const lock = await mutex.tryLock()" },
                            {
                                kind: "add",
                                text: "  const lock = await mutex.lock({ timeout: 5_000 })",
                            },
                            { kind: "add", text: "  if (!lock) return queue.enqueue(token)" },
                            { kind: "context", text: "  try {" },
                        ],
                    },
                ],
            },
        ],
        omittedFiles: 2,
    },
};

export const happyAgentSliceTool: ConversationToolCall = {
    toolCallId: "tool-slice",
    toolName: "create_slice",
    arguments: { request: "show the API schema changes" },
    status: "success",
    failed: false,
    display: "Created slice “API schema changes” over 4 files",
    presentation: {
        type: "slice",
        sliceId: "slice-api-schema",
        title: "API schema changes",
        fileCount: 4,
    },
};

export const happyAgentExecTool: ConversationToolCall = {
    toolCallId: "tool-exec",
    toolName: "bash",
    arguments: { command: "pnpm test" },
    status: "success",
    failed: false,
    display: "Ran pnpm test",
    presentation: {
        type: "execCommand",
        command: "pnpm test",
        output: Array.from({ length: 18 }, (_, index) => `line ${index + 1} of test output`).join(
            "\n",
        ),
    },
};

export const happyAgentTerminalTool: ConversationToolCall = {
    toolCallId: "tool-terminal",
    toolName: "TaskOutput",
    arguments: null,
    status: "running",
    failed: false,
    presentation: {
        type: "backgroundTerminalInteraction",
        command: "npm run dev",
        input: "rs\ny",
    },
};

export const happyAgentGenericTool: ConversationToolCall = {
    toolCallId: "tool-generic",
    toolName: "TaskList",
    arguments: { filter: "in_progress", limit: 20 },
    status: "success",
    failed: false,
    display: "3 tasks in progress",
};

export const happyAgentCompactionRunningTool: ConversationToolCall = {
    toolCallId: "tool-compaction-running",
    toolName: "compact",
    arguments: { trigger: "manual", replacedMessages: 18 },
    status: "running",
    failed: false,
    presentation: {
        type: "compaction",
        trigger: "manual",
        tokensBefore: 249_234,
    },
};

export const happyAgentCompactionCompletedTool: ConversationToolCall = {
    ...happyAgentCompactionRunningTool,
    toolCallId: "tool-compaction-completed",
    status: "success",
    presentation: {
        type: "compaction",
        trigger: "manual",
        tokensBefore: 249_234,
        tokensAfter: 5_330,
    },
};

export const happyAgentCompactionFailedTool: ConversationToolCall = {
    ...happyAgentCompactionRunningTool,
    toolCallId: "tool-compaction-failed",
    status: "failed",
    failed: true,
    presentation: {
        type: "compaction",
        trigger: "automatic",
        tokensBefore: 249_234,
        failureReason: "The provider could not compact the context.",
    },
};

export const happyAgentRunningTool: ConversationToolCall = {
    toolCallId: "tool-running",
    toolName: "grep",
    arguments: { pattern: "TODO" },
    status: "running",
    failed: false,
    display: "Searching…",
};

export const happyAgentExplorationTool: ConversationToolCall = {
    toolCallId: "tool-exploration",
    toolName: "exploration",
    arguments: null,
    status: "success",
    failed: false,
    presentation: {
        type: "exploration",
        operations: [
            { kind: "read", name: "AgentActivityRow.tsx" },
            { kind: "read", name: "happyAgentConversationProject.ts" },
            { kind: "search", command: "ToolCallPresentation", query: "ToolCallPresentation" },
        ],
    },
};

export const happyAgentAwaitingTool: ConversationToolCall = {
    toolCallId: "tool-await",
    toolName: "write",
    arguments: { path: "config/releases.json" },
    status: "awaitingApproval",
    failed: false,
    review: {
        action: "write config/releases.json",
        reason: "This file is outside the workspace write allowlist.",
        decision: "ask",
        risk: "high",
        userAuthorization: "low",
    },
};

/** A reviewed call that was let out of the sandbox: the whole line turns amber. */
export const happyAgentElevatedTool: ConversationToolCall = {
    toolCallId: "tool-elevated",
    toolName: "bash",
    arguments: { command: "docker compose up -d", dangerouslyDisableSandbox: true },
    status: "success",
    failed: false,
    elevated: true,
    display: "Ran docker compose up -d",
    presentation: {
        type: "execCommand",
        command: "docker compose up -d",
        output: "Container happy-db  Started\nContainer happy-api  Started",
    },
};

export const happyAgentFailedTool: ConversationToolCall = {
    toolCallId: "tool-failed",
    toolName: "bash",
    arguments: { command: "pnpm build" },
    status: "failed",
    failed: true,
    failure: { kind: "execution_failed", message: "exit code 1" },
    display: "Command failed with exit code 1",
    presentation: {
        type: "execCommand",
        command: "pnpm build",
        output: "error TS2322: Type mismatch\n  at src/index.ts:12",
    },
};

export const happyAgentStoppedTool: ConversationToolCall = {
    toolCallId: "tool-stopped",
    toolName: "bash",
    arguments: { command: "sleep 100" },
    status: "stopped",
    failed: false,
    display: "Stopped by user",
};

export const happyAgentMcpTool: ConversationToolCall = {
    toolCallId: "tool-mcp",
    toolName: "mcp__linear__create_issue",
    arguments: { title: "Fix token rotation race", team: "core", priority: 2 },
    status: "success",
    failed: false,
    display: [
        "Created issue CORE-4821",
        "Title: Fix token rotation race",
        "Assignee: unassigned",
        "URL: https://linear.app/core/issue/CORE-4821",
        "State: Todo",
        "Labels: bug, backend",
        "Estimate: 3",
    ].join("\n"),
};

export const happyAgentMcpInterruptedTool: ConversationToolCall = {
    toolCallId: "tool-mcp-interrupted",
    toolName: "mcp__github__search_code",
    arguments: { query: "withTransaction retry" },
    status: "stopped",
    failed: true,
    failure: { kind: "interrupted" },
};

export const conversationEntries: readonly ConversationEntry[] = [
    message("u1", "you", "Refresh the token rotation to avoid the race condition."),
    {
        kind: "agentActivity",
        id: "think-1",
        sequence: "2",
        activity: {
            kind: "reasoning",
            text: "The mutex is being acquired non-atomically.\n\nA blocking lock removes the window entirely.",
            streaming: false,
        },
    },
    message(
        "a1",
        "agent",
        "I'll switch to a blocking lock and enqueue on contention.\n\n```ts\nawait mutex.lock()\n```",
        "complete",
    ),
    {
        kind: "agentActivity",
        id: happyAgentFileDiffTool.toolCallId,
        sequence: "4",
        activity: { kind: "tool", tool: happyAgentFileDiffTool },
    },
    {
        kind: "agentActivity",
        id: happyAgentExecTool.toolCallId,
        sequence: "5",
        activity: { kind: "tool", tool: happyAgentExecTool },
    },
    {
        kind: "agentActivity",
        id: happyAgentGenericTool.toolCallId,
        sequence: "6",
        activity: { kind: "tool", tool: happyAgentGenericTool },
    },
    {
        kind: "notice",
        id: "sys1",
        sequence: "7",
        variant: "notice",
        level: "info",
        title: "System",
        text: "Context reset for this session.",
    },
    {
        kind: "notice",
        id: "n1",
        sequence: "8",
        variant: "notice",
        level: "warning",
        title: "Retrying",
        text: "Attempt 2/3 (connection lost).",
    },
    {
        kind: "agentActivity",
        id: "shell:c1",
        sequence: "10",
        activity: {
            kind: "shell",
            command: "git status --short",
            output: " M packages/happy-desktop-state/src/happyAgent/happyAgentChatStore.ts\n M packages/happy-desktop-ui/src/ConversationView.tsx\n",
            exitCode: 0,
            running: false,
            timedOut: false,
        },
    },
    message("a2", "agent", "The change is applied and tests pass.", "streaming"),
];

const happyAgentModelEfforts = [
    { level: "low", label: "Low" },
    { level: "medium", label: "Medium" },
    { level: "high", label: "High" },
] as const;

export const happyAgentMenus: HappyAgentMenusSnapshot = {
    modelOptions: [
        {
            providerId: "codex",
            providerType: "codex",
            modelId: "gpt-5.6-sol",
            name: "GPT-5.6 Sol",
            disabled: false,
            current: true,
            efforts: happyAgentModelEfforts,
            defaultEffort: "medium",
        },
        {
            providerId: "codex",
            providerType: "codex",
            modelId: "gpt-5.6-terra",
            name: "GPT-5.6 Terra",
            disabled: false,
            current: false,
            efforts: happyAgentModelEfforts,
            defaultEffort: "medium",
        },
        {
            providerId: "claude",
            providerType: "claude",
            modelId: "opus-4-8",
            name: "Opus 4.8",
            disabled: false,
            current: false,
            efforts: happyAgentModelEfforts,
            defaultEffort: "medium",
        },
        {
            providerId: "grok",
            providerType: "grok",
            modelId: "grok-4.5",
            name: "Grok 4.5",
            disabled: true,
            current: false,
            efforts: happyAgentModelEfforts,
            defaultEffort: "medium",
        },
    ],
    effortOptions: [
        { level: "low", label: "Low", current: false, isDefault: false },
        { level: "medium", label: "Medium", current: true, isDefault: true },
        { level: "high", label: "High", current: false, isDefault: false },
    ],
    permissionModeOptions: [
        { mode: "auto", label: "Auto", current: true },
        { mode: "workspace_write", label: "Workspace write", current: false },
        { mode: "read_only", label: "Read only", current: false },
        { mode: "full_access", label: "Full access", current: false },
    ],
    serviceTierOptions: [
        { tier: null, label: "Regular", current: true },
        { tier: "fast", label: "Fast", current: false },
    ],
    currentProviderId: "codex",
    currentModelId: "gpt-5.6-sol",
    currentEffort: "medium",
    currentPermissionMode: "auto",
    currentServiceTier: undefined,
};

export const happyAgentUserInput: Extract<ConversationRequest, { kind: "userInput" }> = {
    kind: "userInput",
    requestId: "req-1",
    status: "pending",
    questions: [
        {
            id: "approach",
            header: "Approach",
            question: "How should the migration run?",
            multiSelect: false,
            required: true,
            options: [
                { label: "In one transaction", description: "Atomic but locks the table longer." },
                { label: "In batches", description: "Lower lock contention, slower overall." },
            ],
        },
        {
            id: "notify",
            header: "Notify",
            question: "Who should be notified when it completes?",
            multiSelect: true,
            required: false,
            options: [
                { label: "On-call", description: "Page the current on-call engineer." },
                { label: "Channel", description: "Post to the team channel." },
            ],
        },
    ],
};

const now = 1_700_000_000_000;

export const conversationSummaries: readonly ConversationSummary[] = [
    {
        id: "ses_alpha01234567",
        title: "Fix token rotation race",
        subtitle: "~/happy",
        activity: "running",
        updatedAt: now - 30_000,
        participants: [],
    },
    {
        id: "ses_beta012345678",
        title: "Added the sessions gym coverage.",
        subtitle: "~/happy-desktop",
        activity: "idle",
        updatedAt: now - 3_600_000,
        participants: [],
    },
    {
        id: "ses_gamma01234567",
        title: "Session ses_gamm",
        subtitle: "~/scratch",
        activity: "idle",
        updatedAt: now - 90_000_000,
        participants: [],
    },
];

export const conversationNow = now;
