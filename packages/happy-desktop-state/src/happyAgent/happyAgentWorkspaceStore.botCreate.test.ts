import { expect, it, vi } from "vitest";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type {
    HappyAgentBotCreateInput,
    HappyAgentBotCreation,
    HappyAgentSessionListSnapshot,
} from "./happyAgentSessionListStore.js";
import type { HappyAgentBotId, HappyAgentGroupId, HappyAgentSessionId } from "./happyAgentTypes.js";
import {
    happyAgentWorkspaceStoreCreate,
    type HappyAgentWorkspaceOutput,
} from "./happyAgentWorkspaceStore.js";

/**
 * A bot is made with no picture of its own: the draft offers no face to pick,
 * and the host is asked for the bot without one, so it wears the placeholder
 * its id picks, as the phone draws it.
 */

function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) =>
            property === "then"
                ? undefined
                : property === Symbol.iterator
                  ? function* () {}
                  : inert(),
        apply: () => undefined,
    });
}

function store(botCreate: (input: HappyAgentBotCreateInput) => Promise<HappyAgentBotCreation>) {
    const list = {
        projects: { type: "ready", value: [] },
        bots: [],
        botsCreating: [],
        archivedSessions: [],
        catalogRevision: 1,
        sessionCreateFailures: new Map(),
        worktreeCreateFailures: new Map(),
        projectCreateFailures: new Map(),
        subtaskFailures: new Map(),
        tasks: [],
        taskDirectory: [],
        tasksArchived: [],
        tasksJoining: new Set(),
        taskFailures: new Map(),
    } as unknown as HappyAgentSessionListSnapshot;
    const loading = { type: "loading" } as const;
    const client = new Proxy(
        {
            models: {
                get: () => loading,
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    { get: () => list, subscribe: () => () => undefined, botCreate },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: () => new Promise(() => undefined),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const outputs: HappyAgentWorkspaceOutput[] = [];
    const workspace = happyAgentWorkspaceStoreCreate(client, {
        output: (event) => outputs.push(event),
    });
    const unsubscribe = workspace.subscribe(() => undefined);
    return { workspace, outputs, unsubscribe };
}

it("asks the host for the bot without a picture", async () => {
    const botCreate = vi.fn((_input: HappyAgentBotCreateInput) =>
        Promise.resolve({
            botId: "bot_new" as HappyAgentBotId,
            location: {
                groupId: "ws_new" as HappyAgentGroupId,
                sessionId: "ses_new" as HappyAgentSessionId,
            },
        }),
    );
    const { workspace, outputs, unsubscribe } = store(botCreate);

    workspace.botCreateOpen();
    expect(workspace.get().botCreate).toMatchObject({ name: "", submitting: false });

    workspace.botCreateNameUpdate("Release helper");
    await workspace.botCreateSubmit();

    expect(botCreate).toHaveBeenCalledTimes(1);
    expect(botCreate.mock.calls[0]![0]).toEqual({ name: "Release helper" });
    expect(botCreate.mock.calls[0]![0]).not.toHaveProperty("avatar");
    expect(outputs).toContainEqual({
        type: "conversationOpenRequested",
        location: { groupId: "ws_new", sessionId: "ses_new" },
    });
    unsubscribe();
});
