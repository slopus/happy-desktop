import type { ConversationToolCall } from "happy-desktop-state";

const grok = { modelId: "xai/grok-4.6", providerId: "grok", name: "Grok 4.6" };

export const agentSpawnRunning: ConversationToolCall = {
    toolCallId: "spawn-running",
    toolName: "create_agent",
    arguments: { name: "Review the change", model: "xai/grok-4.6", provider: "grok" },
    status: "running",
    failed: false,
    presentation: { type: "agentSpawn", model: grok },
};

export const agentSpawnCompleted: ConversationToolCall = {
    ...agentSpawnRunning,
    toolCallId: "spawn-completed",
    status: "success",
    presentation: {
        type: "agentSpawn",
        model: grok,
        agentId: "gkq8eh6n4j3pz2t9yd7w5cxa",
    },
    display: "Sub-agent created and initial message delivered.",
};

export const agentSpawnUnresolved: ConversationToolCall = {
    ...agentSpawnRunning,
    toolCallId: "spawn-unresolved",
    presentation: { type: "agentSpawn" },
};

export const agentSpawnFailed: ConversationToolCall = {
    ...agentSpawnRunning,
    toolCallId: "spawn-failed",
    status: "failed",
    failed: true,
    failure: { kind: "execution_failed", message: "The provider is unavailable." },
};

export const agentSpawnStopped: ConversationToolCall = {
    ...agentSpawnRunning,
    toolCallId: "spawn-stopped",
    status: "stopped",
    failure: { kind: "interrupted", message: "Stopped before creating the sub-agent." },
};

export const agentSpawnRows: readonly ConversationToolCall[] = [
    agentSpawnUnresolved,
    agentSpawnRunning,
    agentSpawnCompleted,
    agentSpawnFailed,
    agentSpawnStopped,
    {
        ...agentSpawnFailed,
        toolCallId: "spawn-unresolved-failed",
        presentation: { type: "agentSpawn" },
        failure: { kind: "invalid_arguments", message: "No matching model is available." },
    },
    {
        ...agentSpawnRunning,
        toolCallId: "spawn-awaiting-approval",
        status: "awaitingApproval",
    },
    {
        ...agentSpawnCompleted,
        toolCallId: "spawn-other-model",
        presentation: {
            type: "agentSpawn",
            model: { modelId: "anthropic/opus-5", providerId: "claude_extra", name: "Opus 5 1M" },
            agentId: "pz8b5nk3s7dr2j4qx6hv9cwa",
        },
    },
];

const sol = { modelId: "openai/gpt-6.1-sol", providerId: "codex", name: "GPT-6.1 Sol" };

/** A spawn whose agent the window knows: its task's title and the tasks glyph. */
export const agentSpawnNamedTask: ConversationToolCall = {
    toolCallId: "spawn-named-task",
    toolName: "create_agent",
    arguments: { title: "Organize Ada's work from the places above, most important first." },
    status: "success",
    failed: false,
    summary: "Organize Ada's work from the places above, most important first.",
    presentation: {
        type: "agentSpawn",
        model: sol,
        agentId: "fcs8eh6n4j3pz2t9yd7w5cxa",
        agent: { name: "Organize Ada's work", face: { kind: "task" } },
    },
    display: "Created collaborator fcs8eh6n4j3pz2t9yd7w5cxa and sent it the task.",
};

/** An agent with no sidebar row: its title and the mark from its initials. */
export const agentSpawnNamedInitials: ConversationToolCall = {
    ...agentSpawnNamedTask,
    toolCallId: "spawn-named-initials",
    summary: "Read the release logs",
    presentation: {
        type: "agentSpawn",
        model: grok,
        agentId: "rsc8eh6n4j3pz2t9yd7w5cxa",
        agent: { name: "Release research", face: { kind: "initials", initials: "RR" } },
    },
};

export const agentSpawnNamedRows: readonly ConversationToolCall[] = [
    agentSpawnNamedTask,
    agentSpawnNamedInitials,
];
