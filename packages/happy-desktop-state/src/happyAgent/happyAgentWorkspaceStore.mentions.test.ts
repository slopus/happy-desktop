import { expect, it, vi } from "vitest";
import type { HappyAgentTeammate } from "../happyAgentConnection/types.js";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type { HappyAgentFileSearchResult, HappyAgentGroupId } from "./happyAgentTypes.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

/**
 * A draft that starts something — a group's first session, a new task — names
 * people with `@` as a conversation's draft does: the teammates the token
 * matches come first, as `happy://users/` links, and a group's draft follows
 * them with the files its search answers.
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

const GROUP = "ws_alpha" as HappyAgentGroupId;

const TEAMMATES: readonly HappyAgentTeammate[] = [
    { id: "u_alice", name: "Alice Park", role: "Design" },
    { id: "u_bob", name: "Bob Martin", imageUrl: "https://example.test/bob.png" },
];

function store(
    filesSearch: (
        groupId: HappyAgentGroupId,
        query: string,
    ) => Promise<readonly HappyAgentFileSearchResult[]>,
) {
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
                    { get: () => list, subscribe: () => () => undefined },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            memory: new Proxy(
                { groupRead: () => undefined },
                {
                    get: (target, property) =>
                        property in target ? target[property as keyof typeof target] : inert(),
                },
            ),
            surfaces: () => ({ catalog: () => ({ get: () => undefined }) }),
            teammates: () => TEAMMATES,
            filesSearch: vi.fn(filesSearch),
            chat: () => new Promise(() => undefined),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
            globalSkills: () => ({
                get: () => ({ skills: [] }),
                subscribe: () => () => undefined,
            }),
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client);
    const unsubscribe = workspace.subscribe(() => undefined);
    return { workspace, client, unsubscribe };
}

it("offers teammates and then the group's files in the draft that starts its first session", async () => {
    const { workspace, client, unsubscribe } = store(() =>
        Promise.resolve([{ path: "src/alpha.ts" } as HappyAgentFileSearchResult]),
    );
    workspace.groupOpen(GROUP);
    const composer = workspace.get().groupComposer;
    expect(composer?.get().capabilities.mentions).toBe(true);

    workspace.composerTextUpdate(GROUP, "Ask @al");
    // The people answer at once, before the file search does.
    expect(composer?.get().mentionCandidates).toEqual([
        {
            id: "user:u_alice",
            label: "Alice Park",
            detail: "Design",
            subject: { kind: "person" },
            insertion: "[Alice Park](happy://users/u_alice)",
        },
    ]);
    await vi.waitFor(() =>
        expect(composer?.get().mentionCandidates.map((candidate) => candidate.id)).toEqual([
            "user:u_alice",
            "file:src/alpha.ts",
        ]),
    );
    expect(client.filesSearch).toHaveBeenCalledWith(GROUP, "al", expect.any(Number));
    unsubscribe();
});

it("drops a file search answered after the token moved on", async () => {
    const answers: ((files: readonly HappyAgentFileSearchResult[]) => void)[] = [];
    const { workspace, unsubscribe } = store(() => new Promise((resolve) => answers.push(resolve)));
    workspace.groupOpen(GROUP);
    const composer = workspace.get().groupComposer;

    workspace.composerTextUpdate(GROUP, "@b");
    workspace.composerTextUpdate(GROUP, "@bo");
    answers[1]?.([{ path: "bob.md" } as HappyAgentFileSearchResult]);
    answers[0]?.([{ path: "b.md" } as HappyAgentFileSearchResult]);
    await vi.waitFor(() =>
        expect(composer?.get().mentionCandidates.map((candidate) => candidate.id)).toEqual([
            "user:u_bob",
            "file:bob.md",
        ]),
    );
    await Promise.resolve();
    expect(composer?.get().mentionCandidates.map((candidate) => candidate.id)).toEqual([
        "user:u_bob",
        "file:bob.md",
    ]);
    unsubscribe();
});

it("offers teammates in a new task's first message, with no files to search", () => {
    const { workspace, client, unsubscribe } = store(() => Promise.resolve([]));
    workspace.taskCreateOpen();
    const composer = workspace.get().taskCreate?.composer;
    expect(composer?.get().capabilities.mentions).toBe(true);

    workspace.taskCreateMessageUpdate("Loop in @bob");
    expect(composer?.get().mentionCandidates).toEqual([
        {
            id: "user:u_bob",
            label: "Bob Martin",
            subject: { kind: "person", imageUrl: "https://example.test/bob.png" },
            insertion: "[Bob Martin](happy://users/u_bob)",
        },
    ]);
    expect(client.filesSearch).not.toHaveBeenCalled();
    unsubscribe();
});
