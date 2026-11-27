import { expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type {
    HappyAgentSessionArchiveResult,
    HappyAgentSessionListSnapshot,
} from "./happyAgentSessionListStore.js";
import type {
    HappyAgentGroupId,
    HappyAgentProjectId,
    HappyAgentSessionId,
} from "./happyAgentTypes.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

/**
 * Closing a tab archives its conversation. The tab goes at once; a close the
 * host refuses brings the conversation back to syncing, says why on the
 * workspace, and rejects so the caller can put back what it let go of.
 */

const GROUP = "prj_close" as HappyAgentGroupId;

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
                    path: "/work/close",
                    displayPath: "~/close",
                    name: "close",
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
    let answer: (result: HappyAgentSessionArchiveResult) => void = () => undefined;
    const sessionArchive = vi.fn(
        () =>
            new Promise<HappyAgentSessionArchiveResult>((resolve) => {
                answer = resolve;
            }),
    );
    const chatArchive = vi.fn();
    const chatRestore = vi.fn();
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
                    {
                        get: () => list,
                        subscribe: () => () => undefined,
                        sessionArchive,
                    },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: () => new Promise(() => undefined),
            chatArchive,
            chatRestore,
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, {});
    const unsubscribe = workspace.subscribe(() => undefined);
    workspace.conversationOpen("ses_a" as HappyAgentSessionId, GROUP);
    return {
        workspace,
        sessionArchive,
        chatArchive,
        chatRestore,
        unsubscribe,
        hostAnswers: (result: HappyAgentSessionArchiveResult) => answer(result),
    };
}

it("brings a refused close back, says why, and rejects", async () => {
    const { workspace, chatArchive, chatRestore, unsubscribe, hostAnswers } = store();

    const closing = workspace.conversationArchive("ses_a" as HappyAgentSessionId);
    // The tab stops syncing at once, before the host answers.
    expect(chatArchive).toHaveBeenCalledWith("ses_a");
    expect(workspace.get().conversationArchiveFailure).toBeUndefined();

    hostAnswers({ type: "failed", error: new UserError("The session is busy.") });
    await expect(closing).rejects.toThrow("The session is busy.");
    expect(chatRestore).toHaveBeenCalledWith("ses_a");
    expect(workspace.get().conversationArchiveFailure).toEqual({
        groupId: GROUP,
        conversationId: "ses_a",
        message: "The session is busy.",
    });

    // Asking again puts the old reason away while the new answer is awaited.
    const again = workspace.conversationArchive("ses_a" as HappyAgentSessionId);
    expect(workspace.get().conversationArchiveFailure).toBeUndefined();
    hostAnswers({ type: "archived" });
    await again;
    expect(workspace.get().conversationArchiveFailure).toBeUndefined();
    unsubscribe();
});

it("puts the reason away when dismissed, or when the reader leaves the workspace", async () => {
    const dismissed = store();
    const first = dismissed.workspace.conversationArchive("ses_a" as HappyAgentSessionId);
    dismissed.hostAnswers({ type: "failed", error: new UserError("No.") });
    await first.catch(() => undefined);
    dismissed.workspace.conversationArchiveFailureDismiss();
    expect(dismissed.workspace.get().conversationArchiveFailure).toBeUndefined();
    dismissed.unsubscribe();

    const left = store();
    const second = left.workspace.conversationArchive("ses_a" as HappyAgentSessionId);
    left.hostAnswers({ type: "failed", error: new UserError("No.") });
    await second.catch(() => undefined);
    // Landing on another chat of the same workspace keeps it.
    left.workspace.conversationOpen("ses_b" as HappyAgentSessionId, GROUP);
    expect(left.workspace.get().conversationArchiveFailure?.conversationId).toBe("ses_a");
    left.workspace.conversationOpen(
        "ses_c" as HappyAgentSessionId,
        "prj_other" as HappyAgentGroupId,
    );
    expect(left.workspace.get().conversationArchiveFailure).toBeUndefined();
    left.unsubscribe();
});
