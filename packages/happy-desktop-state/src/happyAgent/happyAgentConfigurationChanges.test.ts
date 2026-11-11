import { expect, it } from "vitest";
import type {
    ConfigurationBlock,
    Message,
    MessageError,
    MessageMode,
    Run,
} from "@slopus/happy-agent-client";
import { happyAgentConfigurationChanges } from "./happyAgentConfigurationChanges.js";
import { happyAgentConversationProject } from "./happyAgentConversationProject.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import { projectElements } from "../happyAgentConnection/projection.js";
import { entryEquivalent } from "../conversation/conversationEntries.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";

const mode: MessageMode = {
    providerId: "claude",
    providerType: "claude",
    account: null,
    modelId: "opus",
    effort: "high",
    serviceTier: null,
    permissionMode: "auto",
};
const change = (before: MessageMode | null, after: MessageMode): ConfigurationBlock => ({
    type: "configuration",
    before,
    after,
    beforeMessageId: null,
});

it("hides the initial baseline, exact no-ops, label changes and identity enrichment", () => {
    for (const block of [
        change(null, mode),
        change(mode, mode),
        change(mode, { ...mode, account: { id: "a", label: "New" } }),
        change({ ...mode, account: { id: "a", label: "Known" } }, { ...mode, account: null }),
        change(
            { ...mode, account: { id: "a", label: "Old" } },
            { ...mode, account: { id: "a", label: "New" } },
        ),
    ])
        expect(happyAgentConfigurationChanges(block, [])).toEqual([]);
});

it("shows a same-family account switch from durable IDs, not labels or model prefixes", () => {
    const before = { ...mode, account: { id: "a", label: "Work" } };
    const after = { ...mode, providerId: "claude_extra", account: { id: "b", label: "Personal" } };
    expect(happyAgentConfigurationChanges(change(before, after), [])).toEqual([
        { field: "account", text: "Account Work → Personal" },
    ]);
    expect(
        happyAgentConfigurationChanges(change(before, { ...after, account: { id: "b" } }), []),
    ).toEqual([{ field: "account", text: "Account changed" }]);
    expect(
        happyAgentConfigurationChanges(
            change({ ...before, providerType: undefined }, { ...after, providerType: undefined }),
            [],
        ),
    ).toEqual([{ field: "provider", text: "Provider selection changed: claude → claude_extra" }]);
    expect(
        happyAgentConfigurationChanges(
            change(before, { ...after, providerType: "bedrock", providerId: "aws" }),
            [],
        ),
    ).toEqual([{ field: "provider", text: "Provider selection changed: claude → aws" }]);
});

it("shows real route, model, effort, permission and speed changes without blank rows", () => {
    const result = happyAgentConfigurationChanges(
        change(mode, {
            ...mode,
            providerId: "claude_extra",
            modelId: "sonnet",
            effort: "low",
            permissionMode: "read_only",
            serviceTier: "fast",
        }),
        [],
    );
    expect(result).toEqual([
        { field: "model", text: "Model opus → sonnet" },
        { field: "provider", text: "Provider selection changed: claude → claude_extra" },
        { field: "effort", text: "Effort High → Low" },
        { field: "permissions", text: "Permissions Auto → Read only" },
        { field: "speed", text: "Speed Default → Fast" },
    ]);
});

it("projects wire configuration and error data into stable, visible rows and preserves error text", () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed();
    const agent = daemon.agentSeed(project.id);
    const error: MessageError = {
        code: "authentication_failed",
        mode,
        credentialSource: null,
        recovery: { steps: ["Retry first."], actions: ["ask_chief", "unknown_action"] },
    };
    const messages: Message[] = [
        {
            id: "baseline",
            role: "service",
            createdAt: 1,
            metadata: {},
            content: [change(null, mode)],
        },
        {
            id: "change",
            role: "service",
            createdAt: 2,
            metadata: {},
            content: [change(mode, { ...mode, providerId: "claude_extra" })],
        },
        {
            id: "durable-error",
            role: "service",
            createdAt: 3,
            metadata: {},
            content: [{ type: "text", text: "Failed\n\n  original details" }],
            error,
        },
    ];
    const run: Run = {
        id: "r",
        startedAt: 1,
        endedAt: 4,
        status: "failed",
        reason: "error",
        costUsd: null,
        usage: {},
    };
    const elements = projectElements({
        agent,
        config: daemon.configGet(),
        connection: "live",
        endpoint: "http://fake.test",
        mediaUrl: () => "",
        hasMore: false,
        messages: messages.map((message) => ({ message, runId: run.id })),
        runs: [run],
        answeredQuestions: [],
        slashCommands: [],
    });
    const rows = happyAgentConversationProject({
        elements,
        sessionId: agent.id,
        models: [
            {
                ...happyAgentModelCatalogProject(daemon.configGet()).models[0]!,
                id: "opus",
                name: "Opus 5.5",
            },
        ],
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [],
        answeredUserInputs: [],
        expandedGroupIds: new Set(),
        subagents: [],
    });
    expect(rows.some((row) => row.kind === "notice" && row.id.includes("baseline"))).toBe(false);
    expect(
        rows.find((row) => row.kind === "notice" && row.variant === "configuration"),
    ).toMatchObject({
        id: "message:change:0:change:provider",
        text: "Provider selection changed: claude → claude_extra",
    });
    const failure = rows.find(
        (row) => row.kind === "notice" && row.variant === "notice" && row.level === "error",
    );
    expect(failure).toMatchObject({
        source: { messageId: "durable-error", runId: "r" },
        text: "Failed\n\n  original details",
        error: { ...error, modelName: "Opus 5.5" },
    });
    if (failure?.kind !== "notice" || failure.variant !== "notice")
        throw new Error("Missing error row");
    expect(entryEquivalent(failure, { ...failure, error: structuredClone(failure.error) })).toBe(
        true,
    );
    expect(
        entryEquivalent(failure, { ...failure, error: { ...error, modelName: "Renamed model" } }),
    ).toBe(false);
    expect(
        entryEquivalent(failure, {
            ...failure,
            error: {
                ...error,
                modelName: "Opus 5.5",
                credentialSource: {
                    kind: "environment",
                    location: "Explicit credentials",
                    host: null,
                },
            },
        }),
    ).toBe(false);
});

it("uses catalog display names only for presentation, including provider-defined speed labels", () => {
    const base = {
        thinkingLevels: [],
        defaultThinkingLevel: "high" as const,
        serviceTierOptions: [
            { id: null, label: "Regular" },
            { id: "priority" as const, label: "Fast" },
        ],
    };
    expect(
        happyAgentConfigurationChanges(
            change(mode, { ...mode, modelId: "sonnet", serviceTier: "priority" }),
            [
                { ...base, id: "opus", name: "Opus 5.5" },
                { ...base, id: "sonnet", name: "Sonnet 5.5" },
            ],
        ),
    ).toEqual([
        { field: "model", text: "Model Opus 5.5 → Sonnet 5.5" },
        { field: "speed", text: "Speed Regular → Fast" },
    ]);
});

it("shows only the model change when the model and known provider family both change", () => {
    const before = { ...mode, account: { id: "native-a" } };
    const after: MessageMode = {
        ...mode,
        providerId: "codex_extra",
        providerType: "codex",
        modelId: "gpt",
        account: { id: "native-b" },
    };
    expect(happyAgentConfigurationChanges(change(before, after), [])).toEqual([
        { field: "model", text: "Model opus → gpt" },
    ]);
});

it("keeps the provider fallback on a model change when either provider family is unknown", () => {
    const after: MessageMode = {
        ...mode,
        providerId: "codex_extra",
        providerType: "codex",
        modelId: "gpt",
    };
    for (const block of [
        change({ ...mode, providerType: undefined }, after),
        change(mode, { ...after, providerType: undefined }),
    ])
        expect(happyAgentConfigurationChanges(block, [])).toEqual([
            { field: "model", text: "Model opus → gpt" },
            { field: "provider", text: "Provider selection changed: claude → codex_extra" },
        ]);
});
