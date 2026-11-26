import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import {
    happyAgentChatStoreCreate,
    happyAgentWorkspaceStoreCreate,
    type ChatElement,
    type HappyAgentChatStore,
    type HappyAgentSessionId,
    type HappyAgentSessionListSnapshot,
    type HappyAgentWorkspaceClient,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { RetainedViews } from "./RetainedViews";
import { createRenderer } from "./testing";

/* A switch to a conversation not read yet keeps the one on screen until the
 * next is read, whether or not the workspace keeps the one left: here it keeps
 * none, so the view left is let go as the switch begins. The real workspace
 * and chat stores drive the real views, wired as the window wires them. */

const catalog = {
    defaultModelId: "model",
    defaultProviderId: "provider",
    models: [],
    providers: [],
};
const session = (sessionId: string): SessionState => ({
    activity: { kind: "idle", label: "Idle", since: 0 },
    status: "idle",
    archived: false,
    sessionId,
    ownerInstanceId: "instance",
    scope: { kind: "unsorted" },
    cwd: "",
    modelId: "model",
    providerId: "provider",
    titleStatus: "idle",
    permissionMode: "auto",
    modelLocked: false,
    modelCatalog: catalog,
    models: [],
    pendingUserInputs: [],
    answeredUserInputs: [],
    pendingSteeringMessages: [],
    slashCommands: [],
    tasks: [],
    subagents: [],
    subagentsRunning: false,
    backgroundProcesses: [],
    connection: "live",
    transcriptComplete: true,
    loadingMore: false,
});

function history(id: string): ChatElement[] {
    return Array.from({ length: 20 }, (_, index) => ({
        id: `${id}:${String(index)}`,
        groupId: `${id}:${String(index)}`,
        runId: `run-${id}-${String(index)}`,
        createdAt: 1_000 + index,
        kind: "agent_text",
        messageId: `${id}:${String(index)}`,
        text: `${id} answer ${String(index)}. ${"Long enough to wrap onto a second line. ".repeat(3)}`,
        complete: true,
    }));
}

function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) => (property === "then" ? undefined : inert()),
        apply: () => undefined,
    });
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it("holds the conversation left while the next is read, though the workspace keeps none", async () => {
    /* How long each conversation's transcript takes to read, from its open. */
    const readMs: Record<string, number> = { a: 0, b: 600, c: 120 };
    const chats = new Map<string, HappyAgentChatStore>();
    for (const id of Object.keys(readMs))
        chats.set(
            id,
            happyAgentChatStoreCreate(id as HappyAgentSessionId, {
                catalog,
                transcriptConnect: (options) => {
                    const timer = setTimeout(
                        () => options.onChange(history(id), session(id), []),
                        readMs[id],
                    );
                    return { close: () => clearTimeout(timer), loadMore() {} };
                },
                connectActions: {} as never,
                connectMutationSubscribe: () => () => undefined,
            }),
        );
    const list = {
        projects: {
            type: "ready",
            value: [
                {
                    id: "group",
                    path: "/work",
                    name: "Work",
                    kind: "regular",
                    lifecycle: { phase: "ready" },
                    worktrees: [],
                    conversations: Object.keys(readMs).map((id) => ({
                        id,
                        title: id,
                        activity: "idle",
                        participants: [],
                    })),
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
    const client = new Proxy(
        {
            models: {
                get: () => ({ type: "loading" }),
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    { get: () => list, subscribe: () => () => undefined },
                    {
                        get: (target, key) =>
                            key in target ? target[key as keyof typeof target] : inert(),
                    },
                ),
            chat: async (id: string) => ({ store: chats.get(id)!, [Symbol.dispose]() {} }),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, {
        conversationRetention: { count: 0, size: 0 },
    });
    const release = workspace.subscribe(() => undefined);
    function Harness() {
        const snapshot = useSyncExternalStore(workspace.subscribe, workspace.get);
        const kept = useSyncExternalStore(
            workspace.conversationsRetained.subscribe,
            workspace.conversationsRetained.get,
        );
        const current =
            snapshot.conversation.type === "ready" ? snapshot.conversation.value : undefined;
        // As the window lists them: the open conversation, then the ones kept.
        const views = [
            ...(current
                ? [
                      {
                          id: current.conversationId,
                          content: (
                              <ConversationView
                                  conversationId={current.conversationId}
                                  entries={current.entries}
                                  loading={!current.ready}
                              />
                          ),
                          ready: current.ready && current.standIn !== true,
                      },
                  ]
                : []),
            ...kept.conversationIds
                .filter((id) => id !== current?.conversationId)
                .map((id) => ({ id })),
        ];
        return (
            <div style={{ display: "flex", flexDirection: "column", height: 600, width: 720 }}>
                <RetainedViews
                    {...(current ? { activeId: current.conversationId } : {})}
                    views={views}
                />
            </div>
        );
    }
    const view = createRenderer();
    view.render(Harness, { height: 600, width: 720 });
    const open = (id: string) =>
        flushSync(() => workspace.conversationOpen(id as HappyAgentSessionId));
    /* What the pane shows: which view, its first transcript line, and whether
       a view still being read shows the snail. */
    const shown = () => {
        const frames = [
            ...view.container.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="retained-view"]',
            ),
        ].filter((element) => getComputedStyle(element).display !== "none");
        expect(frames.length).toBe(1);
        const on = frames[0]!;
        expect(on.querySelector('[data-happy-desktop-ui="conversation-empty"]')).toBeNull();
        const snail = on.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="conversation-loading"] [data-happy-desktop-ui="empty-state"]',
        );
        return {
            id: on.dataset.viewId,
            text: on.querySelector(".happy-message-list__virtual-row")?.textContent ?? "",
            snail: snail !== null && getComputedStyle(snail).visibility === "visible",
        };
    };
    const sample = async (until: () => boolean, ms: number) => {
        const samples: (ReturnType<typeof shown> & { at: number })[] = [];
        const start = performance.now();
        while (performance.now() - start < ms && !until()) {
            await frame();
            samples.push({ ...shown(), at: performance.now() - start });
        }
        return samples;
    };
    try {
        open("a");
        await view.ready();
        await sample(() => shown().text.includes("a answer"), 2_000);

        // B takes longer to read than the hold: A stays, then B's snail, then B.
        open("b");
        // The workspace keeps nothing, so A has already left the views listed.
        expect(workspace.conversationsRetained.get().conversationIds).toEqual([]);
        const slow = await sample(() => shown().text.includes("b answer"), 2_000);
        const held = slow.filter((entry) => entry.id === "a");
        expect(held.length).toBeGreaterThan(0);
        expect(held.every((entry) => entry.text.includes("a answer"))).toBe(true);
        expect(held.at(-1)!.at).toBeGreaterThanOrEqual(200);
        const reading = slow.slice(held.length);
        expect(reading.every((entry) => entry.id === "b")).toBe(true);
        expect(reading.every((entry) => entry.snail || entry.text.includes("b answer"))).toBe(true);
        expect(reading.some((entry) => entry.snail)).toBe(true);
        expect(
            view.container.querySelector(
                '[data-happy-desktop-ui="retained-view"][data-view-id="a"]',
            ),
        ).toBeNull();

        // C is read within the hold: B stays until C is drawn, never a snail.
        open("c");
        const quick = await sample(() => shown().text.includes("c answer"), 2_000);
        expect(quick.at(-1)!.text).toContain("c answer");
        expect(quick.every((entry) => entry.id === "b" || entry.text.includes("c answer"))).toBe(
            true,
        );
        expect(quick.some((entry) => entry.snail)).toBe(false);
    } finally {
        view.destroy();
        release();
        workspace[Symbol.dispose]();
        for (const chat of chats.values()) chat[Symbol.dispose]();
    }
});
