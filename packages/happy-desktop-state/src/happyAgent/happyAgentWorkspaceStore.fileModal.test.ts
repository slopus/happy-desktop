import { expect, it, vi } from "vitest";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type {
    HappyAgentGroupId,
    HappyAgentProjectId,
    HappyAgentSessionId,
} from "./happyAgentTypes.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

/**
 * A file a message names opens over the conversation. Putting it away drops
 * it, unless something typed into it is not saved yet: then it moves into the
 * file viewer beside the conversation, where the edit stays until it is saved
 * or reverted.
 */

const GROUP = "prj_modal" as HappyAgentGroupId;

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

function store() {
    const list = {
        projects: {
            type: "ready",
            value: [
                {
                    id: GROUP as unknown as HappyAgentProjectId,
                    path: "/work/modal",
                    displayPath: "~/modal",
                    name: "modal",
                    orderKey: "a",
                    kind: "regular",
                    lifecycle: { phase: "ready" },
                    worktrees: [],
                    activity: "idle",
                    updatedAt: 1,
                    conversations: [],
                },
            ],
        },
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
            chat: () => new Promise(() => undefined),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
            workspaceFileRead: (_groupId: HappyAgentGroupId, path: string) =>
                Promise.resolve({ path, content: "# Notes\n", hash: "hash-1" }),
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, {});
    const unsubscribe = workspace.subscribe(() => undefined);
    workspace.conversationOpen("ses_a" as HappyAgentSessionId, GROUP);
    return { workspace, unsubscribe };
}

async function opened(workspace: ReturnType<typeof store>["workspace"]) {
    workspace.fileReferenceOpen(GROUP, "notes.md", "file", undefined, "modal");
    await vi.waitFor(() => {
        expect(workspace.panel.get().modal).toEqual({ kind: "file" });
        expect(workspace.get().panelFile?.document.type).toBe("ready");
    });
    return workspace.get().panelFile!;
}

it("moves a file holding an unsaved edit beside the conversation instead of dropping it", async () => {
    const { workspace, unsubscribe } = store();
    const file = await opened(workspace);
    expect(workspace.panel.get().fileViewOpen).toBe(false);

    workspace.fileDraftUpdate(file.id, "# Notes\n\nNot saved yet.\n");
    workspace.modalClose();

    expect(workspace.panel.get().modal).toBeUndefined();
    expect(workspace.panel.get()).toMatchObject({ open: true, fileViewOpen: true });
    expect(workspace.panel.get().activeViewId).toBe("file");
    expect(workspace.get().panelFile).toMatchObject({
        id: file.id,
        draft: "# Notes\n\nNot saved yet.\n",
    });
    unsubscribe();
});

it("drops a file with nothing unsaved when it is put away", async () => {
    const { workspace, unsubscribe } = store();
    await opened(workspace);

    workspace.modalClose();

    expect(workspace.panel.get().modal).toBeUndefined();
    expect(workspace.panel.get().fileViewOpen).toBe(false);
    expect(workspace.get().panelFile).toBeUndefined();
    unsubscribe();
});
