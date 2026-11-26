import { useReducer, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import {
    happyAgentChatStoreCreate,
    happyAgentWorkspaceStoreCreate,
    type ChatElement,
    type ConversationAuthor,
    type HappyAgentSessionId,
    type HappyAgentSessionListSnapshot,
    type HappyAgentWorkspaceClient,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { RetainedViews } from "./RetainedViews";
import { messageListEndOffset } from "./testing/messageListEnd";
import { createRenderer } from "./testing";

const agent: ConversationAuthor = {
    id: "reentry-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const catalog = {
    defaultModelId: "model",
    defaultProviderId: "provider",
    models: [],
    providers: [],
};
const session = (running: boolean): SessionState => ({
    activity: running
        ? { kind: "executing_tool_call", label: "Working", since: 0 }
        : { kind: "idle", label: "Idle", since: 0 },
    status: running ? "running" : "idle",
    archived: false,
    sessionId: "reentry-agent",
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

let clock = 1_000;
function prompt(groupId: string, text: string): ChatElement {
    clock += 1;
    return {
        id: `${groupId}:user`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "user_message",
        messageId: `${groupId}:user`,
        authority: "server",
        identity: null,
        delivery: "sent",
        text,
    };
}
/** A shell call with a script long enough to fill much of the pane when shown. */
function step(groupId: string, index: number): ChatElement {
    clock += 1;
    const command = Array.from(
        { length: 8 },
        (_, line) => `printf '${groupId} step ${String(index)} line ${String(line)}\\n'`,
    ).join("\n");
    return {
        id: `${groupId}:tool-${String(index)}`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "tool_call",
        toolCallId: `${groupId}:call-${String(index)}`,
        name: "exec_command",
        arguments: { cmd: command },
        argumentsComplete: true,
        status: "succeeded",
        result: Array.from({ length: 6 }, (_, line) => `${groupId} output ${String(line)}`).join(
            "\n",
        ),
        presentation: { kind: "command", command },
    } as ChatElement;
}
function note(groupId: string, index: number): ChatElement {
    clock += 1;
    return {
        id: `${groupId}:note-${String(index)}`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "agent_text",
        messageId: `${groupId}:note-${String(index)}`,
        text: `Note ${groupId} ${String(index)}.\n\n| Tool | Policy |\n| --- | --- |\n| save_${groupId} | Reviewed write |\n| query_${groupId} | Read |`,
        complete: true,
    };
}
function answer(groupId: string, text: string): ChatElement {
    clock += 1;
    return {
        id: `${groupId}:answer`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "agent_text",
        messageId: `${groupId}:answer`,
        text,
        complete: true,
    };
}
function end(groupId: string): ChatElement {
    clock += 1;
    return {
        id: `group-end:${groupId}`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "group_end",
        outcome: "success",
        reason: "completed",
        startedAt: clock - 500,
        endedAt: clock,
        elapsedMs: 500,
        turnStartedAt: clock - 500,
        turnElapsedMs: 500,
        modelTurn: true,
    };
}
/** A turn's work: shell calls with a note and its table between them. */
function work(groupId: string, steps: number): ChatElement[] {
    return Array.from({ length: steps }, (_, index) =>
        index % 3 === 2 ? [note(groupId, index), step(groupId, index)] : [step(groupId, index)],
    ).flat();
}
function turn(groupId: string, steps: number): ChatElement[] {
    return [
        prompt(groupId, `Prompt ${groupId}: check the build and report back.`),
        ...work(groupId, steps),
        answer(groupId, `Answer ${groupId}. ${"The build is green and nothing moved. ".repeat(4)}`),
        end(groupId),
    ];
}

function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) => (property === "then" ? undefined : inert()),
        apply: () => undefined,
    });
}
const frames = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

/* How many more times the window renders the conversation again in the
 * commit that drew it, once it is on screen. The app does, several times,
 * while the views around it settle, and hands it new handlers each time. */
let echoes = 0;

/* Leaving a conversation at its end after watching a turn work, then coming
 * back once another turn has arrived out of sight, folds the watched work
 * away and draws the new turn in the same return. Every frame of that return
 * is sampled just after it is painted: no row may draw over another, and the
 * reader, who left at the end, is at the end in each of them, the first
 * included, however often the window renders the conversation as it shows it. */
it.each([
    { name: "read at once", returnMs: 0 },
    { name: "read after the hold", returnMs: 500 },
])("draws a conversation returned to laid out in every frame: $name", async ({ returnMs }) => {
    let change!: (elements: readonly ChatElement[], running: boolean) => void;
    let elements: readonly ChatElement[] = [
        ...Array.from({ length: 10 }, (_, index) => turn(`history-${String(index)}`, 2)).flat(),
        prompt("watched", "Watch this turn work."),
        ...work("watched", 9),
    ];
    const chat = happyAgentChatStoreCreate("a" as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            change = (next, running) => options.onChange(next, session(running), []);
            change(elements, elements.at(-1)?.kind !== "group_end");
            return { close() {}, loadMore() {} };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });
    const other = happyAgentChatStoreCreate("b" as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            options.onChange(turn("other", 0), session(false), []);
            return { close() {}, loadMore() {} };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });
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
                    conversations: ["a", "b"].map((id) => ({
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
    let acquisitions = 0;
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
            chat: async (id: string) => {
                if (id === "a" && ++acquisitions > 1 && returnMs > 0)
                    await new Promise((resolve) => setTimeout(resolve, returnMs));
                return { store: id === "a" ? chat : other, [Symbol.dispose]() {} };
            },
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, {
        conversationRetention: { count: 2, size: 100_000 },
    });
    const view = createRenderer();
    const release = workspace.subscribe(() => undefined);
    const open = (id: string) =>
        flushSync(() => workspace.conversationOpen(id as HappyAgentSessionId));
    function Harness() {
        // Rendered as the window renders it: nothing it hands down is kept.
        "use no memo";
        const [, rerender] = useReducer((count: number) => count + 1, 0);
        const snapshot = useSyncExternalStore(workspace.subscribe, workspace.get);
        const kept = useSyncExternalStore(
            workspace.conversationsRetained.subscribe,
            workspace.conversationsRetained.get,
        );
        const current =
            snapshot.conversation.type === "ready" ? snapshot.conversation.value : undefined;
        const shown = current?.conversationId === "a" && current.ready && current.standIn !== true;
        const views = [
            ...(current
                ? [
                      {
                          id: current.conversationId,
                          content: (
                              <ConversationView
                                  agentAuthor={agent}
                                  conversationId={current.conversationId}
                                  entries={current.entries}
                                  loading={!current.ready}
                                  expandedTurnIds={current.expandedTurnIds}
                                  motion="calm"
                                  scrollPosition={current.scrollPosition}
                                  running={current.running}
                                  onTraceToggle={workspace.turnTraceToggle}
                                  onTracesSeen={workspace.turnTracesSeen}
                                  onScrollPositionChange={(next) => {
                                      workspace.conversationScrollUpdate(
                                          current.conversationId,
                                          next,
                                      );
                                  }}
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
            <div style={{ display: "flex", height: 700, width: 880 }}>
                <RetainedViews
                    {...(current ? { activeId: current.conversationId } : {})}
                    views={views}
                    onViewHide={(id, size) =>
                        workspace.conversationViewSizeUpdate(id as HappyAgentSessionId, size)
                    }
                />
                <div
                    ref={(element) => {
                        // Attached in each commit that renders the window, after the views.
                        if (!element || !shown || echoes === 0) return;
                        echoes -= 1;
                        rerender();
                    }}
                />
            </div>
        );
    }
    view.render(Harness, { height: 900, width: 1000 });
    /* The visible frame's rows, top to bottom, each by its own box and by
       the lowest thing it draws, which can reach past that box. */
    const drawn = () => {
        const shown = [
            ...view.container.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="retained-view"]',
            ),
        ].filter((element) => element.getClientRects().length > 0);
        if (shown.length !== 1 || shown[0]!.dataset.viewId !== "a") return undefined;
        const viewport = shown[0]!.querySelector<HTMLElement>(".happy-message-list__viewport");
        if (!viewport) return undefined;
        const bounds = viewport.getBoundingClientRect();
        const rows = [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")]
            .map((row) => {
                const box = row.getBoundingClientRect();
                let bottom = box.bottom;
                for (const child of row.querySelectorAll("*"))
                    bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
                return { label: row.textContent?.slice(0, 40) ?? "", top: box.top, bottom };
            })
            .filter((row) => row.bottom > bounds.top && row.top < bounds.bottom)
            .sort((left, right) => left.top - right.top);
        const overlaps = rows.flatMap((row, index) => {
            const next = rows[index + 1];
            return next && row.bottom > next.top + 1
                ? [`${row.label} [${String(row.bottom)}] over ${next.label} [${String(next.top)}]`]
                : [];
        });
        return { overlaps, end: messageListEndOffset(viewport), text: viewport.textContent ?? "" };
    };
    try {
        open("a");
        await view.ready();
        await frames();
        // The reader watched the turn finish; its work stays open until they leave.
        flushSync(() => {
            elements = [
                ...elements,
                answer("watched", "The watched turn is done."),
                end("watched"),
            ];
            change(elements, false);
        });
        await frames();
        expect(chat.get().expandedTurnIds.has("watched")).toBe(true);
        expect(drawn()!.text).toContain("watched step 8 line 7");
        open("b");
        await frames();
        // Another turn arrives while the reader is elsewhere.
        flushSync(() => {
            elements = [...elements, ...turn("away", 6)];
            change(elements, false);
        });
        await frames();
        const samples: NonNullable<ReturnType<typeof drawn>>[] = [];
        let sampling = true;
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
            const sample = drawn();
            if (sample) samples.push(sample);
            if (sampling) requestAnimationFrame(() => channel.port2.postMessage(null));
        };
        requestAnimationFrame(() => channel.port2.postMessage(null));
        echoes = 4;
        open("a");
        await vi.waitFor(() => {
            const current = workspace.get().conversation;
            expect(
                current.type === "ready" && current.value.ready && current.value.standIn !== true,
            ).toBe(true);
        });
        await frames();
        await frames();
        sampling = false;
        expect(samples.length).toBeGreaterThan(0);
        expect(samples.at(-1)!.text).toContain("Answer away.");
        expect(samples.flatMap((sample) => sample.overlaps)).toEqual([]);
        expect(samples.map((sample) => Math.round(sample.end))).toEqual(samples.map(() => 0));
        expect(echoes).toBe(0);
    } finally {
        view.destroy();
        release();
        workspace[Symbol.dispose]();
        chat[Symbol.dispose]();
        other[Symbol.dispose]();
    }
});
