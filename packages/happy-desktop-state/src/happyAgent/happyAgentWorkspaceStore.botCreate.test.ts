import { expect, it, vi } from "vitest";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type {
    HappyAgentBotCreateInput,
    HappyAgentBotCreation,
    HappyAgentSessionListSnapshot,
} from "./happyAgentSessionListStore.js";
import type { HappyAgentGroupId, HappyAgentSessionId } from "./happyAgentTypes.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

/**
 * The bot draft carries whether the bot is made an admin bot. It is off until
 * the reader turns it on, and only then is it asked of the host.
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
    const workspace = happyAgentWorkspaceStoreCreate(client, { output: () => undefined });
    const unsubscribe = workspace.subscribe(() => undefined);
    return { workspace, unsubscribe };
}

const created = (): Promise<HappyAgentBotCreation> =>
    Promise.resolve({
        location: {
            groupId: "ws_new" as HappyAgentGroupId,
            sessionId: "ses_new" as HappyAgentSessionId,
        },
    } as HappyAgentBotCreation);

const paint = () => Promise.reject(new Error("no canvas in this test"));

it("makes a non-admin bot unless admin is turned on", async () => {
    const botCreate = vi.fn(created);
    const { workspace, unsubscribe } = store(botCreate);

    workspace.botCreateOpen(paint);
    expect(workspace.get().botCreate).toMatchObject({ isAdmin: false });
    workspace.botCreateNameUpdate("Janitor");
    await workspace.botCreateSubmit();

    expect(botCreate).toHaveBeenCalledTimes(1);
    expect(botCreate.mock.calls[0]![0]).not.toHaveProperty("isAdmin");
    unsubscribe();
});

it("asks the host for an admin bot when admin is turned on", async () => {
    const botCreate = vi.fn(created);
    const { workspace, unsubscribe } = store(botCreate);

    workspace.botCreateOpen(paint);
    workspace.botCreateAdminUpdate(true);
    expect(workspace.get().botCreate).toMatchObject({ isAdmin: true });
    workspace.botCreateNameUpdate("Janitor");
    await workspace.botCreateSubmit();

    expect(botCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Janitor", isAdmin: true }),
    );
    unsubscribe();
});
