import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import {
    happyAgentChatStoreCreate,
    happyAgentWorkspaceStoreCreate,
    type ChatElement,
    type ConversationAuthor,
    type HappyAgentSessionId,
    type SessionState,
    type HappyAgentSessionListSnapshot,
    type HappyAgentWorkspaceClient,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { RetainedViews } from "./RetainedViews";
import { createRenderer } from "./testing";

/* A finished turn folds its work away only once none of it is on screen: the
 * reader never watches rows they are reading disappear, not when the turn
 * ends, not when they steer it, and not when it scrolls out of view. The real
 * chat store drives the real view here, so the store's bookkeeping and the
 * view's report of what is on screen are tested together. */

const agent: ConversationAuthor = {
    id: "trace-agent",
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
    sessionId: "trace-agent",
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
function step(groupId: string, index: number): ChatElement {
    clock += 1;
    return {
        id: `${groupId}:tool-${String(index)}`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "tool_call",
        toolCallId: `${groupId}:call-${String(index)}`,
        name: "exec_command",
        arguments: { cmd: `pnpm test --filter ${groupId}-step-${String(index)}` },
        argumentsComplete: true,
        status: "succeeded",
        presentation: {
            kind: "command",
            command: `pnpm test --filter ${groupId}-step-${String(index)}`,
        },
    } as ChatElement;
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
function end(
    groupId: string,
    reason: "completed" | "steering" = "completed",
): Extract<ChatElement, { kind: "group_end" }> {
    clock += 1;
    return {
        id: `group-end:${groupId}`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: clock,
        kind: "group_end",
        outcome: "success",
        reason,
        startedAt: clock - 500,
        endedAt: clock,
        elapsedMs: 500,
        turnStartedAt: clock - 500,
        turnElapsedMs: 500,
        modelTurn: true,
    };
}
/** A finished turn: prompt, `steps` tool calls, and an answer. */
function turn(groupId: string, steps: number): ChatElement[] {
    return [
        prompt(groupId, `Prompt ${groupId}: check the build and report back.`),
        ...Array.from({ length: steps }, (_, index) => step(groupId, index)),
        answer(groupId, `Answer ${groupId}. ${"The build is green and nothing moved. ".repeat(4)}`),
        end(groupId),
    ];
}

function renderChat(history: readonly ChatElement[]) {
    let change!: (elements: readonly ChatElement[], running: boolean) => void;
    const store = happyAgentChatStoreCreate("trace-agent" as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            change = (elements, running) => options.onChange(elements, session(running), []);
            return { close: () => undefined, loadMore: () => undefined };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });
    let elements = history;
    let running = false;
    function Harness() {
        const snapshot = useSyncExternalStore(store.subscribe, store.get);
        return (
            <div style={{ height: 700, width: 880 }}>
                <ConversationView
                    agentAuthor={agent}
                    conversationId="trace-folding"
                    entries={snapshot.entries}
                    expandedTurnIds={snapshot.expandedTurnIds}
                    motion="calm"
                    onTracesSeen={store.turnTracesSeen}
                    onTraceToggle={store.turnTraceToggle}
                    running={snapshot.runStatus === "running"}
                />
            </div>
        );
    }
    const view = createRenderer();
    view.render(Harness, { height: 900, width: 1000 });
    flushSync(() => change(elements, running));
    return {
        view,
        store,
        /** Appends elements as one transcript read. */
        push(...next: ChatElement[]) {
            elements = [...elements, ...next];
            running = next.at(-1)?.kind !== "group_end";
            flushSync(() => change(elements, running));
        },
    };
}

const frames = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
function viewportOf(view: ReturnType<typeof createRenderer>) {
    return view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
}
function rowsOf(viewport: HTMLElement) {
    return [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")];
}
function rowWith(viewport: HTMLElement, text: string) {
    return rowsOf(viewport).find((row) => row.textContent?.includes(text));
}
/**
 * Where a row's content starts: its first glyph, and what that glyph begins.
 * A row that gains a header, or remounts its body somewhere else, moves this
 * even when the row's own box stays put.
 */
function rowContent(row: HTMLElement): string {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        return `${text.slice(0, 12)}@${String(Math.round(range.getBoundingClientRect().top))}`;
    }
    return "";
}
/** Every row at least partly on screen, each a row React keeps by key, with its top edge. */
function visibleRows(viewport: HTMLElement): Map<HTMLElement, number> {
    const bounds = viewport.getBoundingClientRect();
    const rows = new Map<HTMLElement, number>();
    for (const row of rowsOf(viewport)) {
        const rect = row.getBoundingClientRect();
        if (rect.bottom <= bounds.top || rect.top >= bounds.bottom || rect.height === 0) continue;
        rows.set(row, rect.top);
    }
    return rows;
}
/** The content of every row on screen, as `rowContent` reads it. */
function visibleContent(viewport: HTMLElement): Map<HTMLElement, string> {
    return new Map([...visibleRows(viewport).keys()].map((row) => [row, rowContent(row)]));
}
const label = (row: HTMLElement) => row.textContent?.slice(0, 60);

function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) => (property === "then" ? undefined : inert()),
        apply: () => undefined,
    });
}

it.each(
    [false, true].flatMap((cached) =>
        ["bottom", "surviving", "trace", "hidden-finish", "slow-return"].map((position) => ({
            cached,
            position,
        })),
    ),
)("folds every completed turn before returning to a chat: %j", async ({ cached, position }) => {
    let change!: (elements: readonly ChatElement[], running: boolean) => void;
    let elements = [
        ...Array.from({ length: 16 }, (_, index) => turn(`history-${index}`, 1)).flat(),
        ...turn("manual", 5),
        prompt("watched", "Watch this turn finish."),
        ...Array.from({ length: 7 }, (_, index) => step("watched", index)),
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
    const loading = { type: "loading" } as const;
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
                get: () => loading,
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
                if (id === "a" && ++acquisitions > 1 && position === "slow-return")
                    await new Promise((resolve) => setTimeout(resolve, 500));
                return { store: id === "a" ? chat : other, [Symbol.dispose]() {} };
            },
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, {
        conversationRetention: { count: cached ? 2 : 0, size: 100_000 },
    });
    const view = createRenderer();
    const release = workspace.subscribe(() => undefined);
    const contents = new Map<string, React.ReactNode>();
    const open = (id: string) =>
        flushSync(() => workspace.conversationOpen(id as HappyAgentSessionId));
    function Harness() {
        const snapshot = useSyncExternalStore(workspace.subscribe, workspace.get);
        const kept = useSyncExternalStore(
            workspace.conversationsRetained.subscribe,
            workspace.conversationsRetained.get,
        );
        const current =
            snapshot.conversation.type === "ready" ? snapshot.conversation.value : undefined;
        if (current)
            contents.set(
                current.conversationId,
                <ConversationView
                    agentAuthor={agent}
                    conversationId={current.conversationId}
                    leadingHeader={
                        position === "trace" ||
                        position === "hidden-finish" ||
                        position === "slow-return"
                            ? {
                                  content: <div style={{ height: 48 }}>Chat header</div>,
                                  height: () => 48,
                                  lift: () => 0,
                              }
                            : undefined
                    }
                    entries={current.entries}
                    loading={!current.ready}
                    expandedTurnIds={current.expandedTurnIds}
                    motion="calm"
                    scrollPosition={current.scrollPosition}
                    running={current.running}
                    onTraceToggle={workspace.turnTraceToggle}
                    onTracesSeen={workspace.turnTracesSeen}
                    onScrollPositionChange={(next) => {
                        workspace.conversationScrollUpdate(current.conversationId, next);
                    }}
                />,
            );
        const ids = new Set([
            ...kept.conversationIds,
            ...(current ? [current.conversationId] : []),
        ]);
        return (
            <div style={{ display: "flex", height: 700, width: 880 }}>
                <RetainedViews
                    activeId={current?.conversationId}
                    views={[...ids].map((id) => ({
                        id,
                        content: contents.get(id),
                        ready: id !== current?.conversationId || current.standIn !== true,
                    }))}
                    onViewHide={(id, size) =>
                        workspace.conversationViewSizeUpdate(id as HappyAgentSessionId, size)
                    }
                />
            </div>
        );
    }
    view.render(Harness, { height: 900, width: 1000 });
    const viewport = () =>
        view.container.querySelector<HTMLElement>(
            '[data-view-id="a"] .happy-message-list__viewport',
        )!;
    try {
        open("a");
        await view.ready();
        await frames();
        flushSync(() => {
            elements = [
                ...elements,
                answer("watched", "The watched turn is finished."),
                end("watched"),
            ];
            change(elements, false);
        });
        await frames();
        expect(chat.get().expandedTurnIds.has("watched")).toBe(true);
        // Older history arrives after the tail's completion cache is warm.
        flushSync(() => {
            elements = [...turn("older-loaded", 2), ...elements];
            change(elements, false);
            chat.turnTraceToggle("older-loaded");
        });
        expect(chat.get().expandedTurnIds.has("older-loaded")).toBe(true);
        flushSync(() => chat.turnTraceToggle("manual"));
        await frames();
        expect(chat.get().expandedTurnIds.has("manual")).toBe(true);
        // Opening and closing in this visit retains the existing control behavior.
        flushSync(() => chat.turnTraceToggle("manual"));
        expect(chat.get().expandedTurnIds.has("manual")).toBe(false);
        flushSync(() => chat.turnTraceToggle("manual"));
        flushSync(() => {
            elements = [...elements, prompt("live", "Still running"), step("live", 0)];
            change(elements, true);
        });
        await frames();
        const original = viewport();
        const targetText =
            position === "hidden-finish"
                ? "live-step-0"
                : position === "trace" || position === "slow-return"
                  ? "manual-step-4"
                  : "Prompt manual:";
        let top = 0;
        if (position !== "bottom") {
            viewport().dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
            for (let index = 0; index < 12 && !rowWith(viewport(), targetText); index += 1) {
                viewport().scrollTop -= 300;
                viewport().dispatchEvent(new Event("scroll"));
                await frames();
            }
            const row = rowWith(viewport(), targetText)!;
            expect(row).toBeDefined();
            viewport().scrollTop +=
                row.getBoundingClientRect().top - (viewport().getBoundingClientRect().bottom - 40);
            viewport().dispatchEvent(new Event("scroll"));
            await frames();
            top = row.getBoundingClientRect().top;
        }
        open("b");
        await frames();
        if (position === "hidden-finish")
            elements = [
                ...elements,
                answer("live", "Answer live after finishing while hidden."),
                end("live"),
            ];
        const samples: { top: number; bottom: number; folded: boolean }[] = [];
        let sampling = true;
        const sample = () => {
            const element = viewport();
            if (element && element.getClientRects().length > 0) {
                const row = rowWith(
                    element,
                    position === "hidden-finish"
                        ? "Answer live"
                        : position === "trace" || position === "slow-return"
                          ? "Answer manual."
                          : targetText,
                );
                const current = workspace.get().conversation;
                const expanded =
                    current.type === "ready" ? current.value.expandedTurnIds : new Set<string>();
                samples.push({
                    top: row?.getBoundingClientRect().top ?? 0,
                    bottom: element.scrollHeight - element.clientHeight - element.scrollTop,
                    folded:
                        !expanded.has("manual") &&
                        !expanded.has("watched") &&
                        !expanded.has("older-loaded") &&
                        !element.textContent?.includes("manual-step-") &&
                        !element.textContent?.includes("watched-step-"),
                });
            }
            if (sampling) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
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
        expect(viewport() === original).toBe(cached);
        expect(samples.length).toBeGreaterThan(0);
        for (const sample of samples) {
            expect(sample.folded).toBe(true);
            if (position === "bottom") expect(Math.abs(sample.bottom)).toBeLessThanOrEqual(1);
            else expect(Math.abs(sample.top - top)).toBeLessThanOrEqual(1);
        }
        expect(
            chat
                .get()
                .entries.some(
                    (entry) => entry.kind === "agentActivity" && entry.id.includes("live"),
                ),
        ).toBe(position !== "hidden-finish");
    } finally {
        view.destroy();
        release();
        workspace[Symbol.dispose]();
        chat[Symbol.dispose]();
        other[Symbol.dispose]();
    }
});

it("keeps every row of a steered turn where it was until all of it scrolls away", async () => {
    const { view, store, push } = renderChat([...turn("a", 6), ...turn("b", 6)]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    // History arrives folded.
    expect(store.get().expandedTurnIds.size).toBe(0);
    expect(rowWith(viewport, "a-step-0")).toBeUndefined();

    // A turn runs while the reader watches it, then they steer it.
    push(prompt("live", "Prompt live: run every step."));
    for (let index = 0; index < 8; index += 1) push(step("live", index));
    await frames();
    // Parked a little above the bottom, so every row keeps its exact place.
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
    viewport.scrollTop -= 120;
    await frames();
    const watched = visibleRows(viewport);
    const watchedContent = visibleContent(viewport);
    expect([...watched.keys()].some((row) => row.textContent?.includes("live-step-0"))).toBe(true);

    push(end("live", "steering"), prompt("steer", "Actually, stop after the tests."));
    await frames();
    expect(store.get().expandedTurnIds).toEqual(new Set(["live"]));
    const after = visibleRows(viewport);
    for (const [row, top] of watched)
        expect([label(row), row.isConnected, after.get(row)]).toEqual([label(row), true, top]);
    // Nor does anything inside them: no row gains a header for the turn ending.
    const afterContent = visibleContent(viewport);
    for (const [row, content] of watchedContent)
        expect([label(row), afterContent.get(row)]).toEqual([label(row), content]);

    // The steered work goes on below; the reader follows it down. Step by
    // step nothing on screen jumps, and the turn folds once it is all gone.
    push(...Array.from({ length: 60 }, (_, index) => step("steer", index)));
    await frames();
    for (let guard = 0; guard < 80 && store.get().expandedTurnIds.size > 0; guard += 1) {
        const before = visibleRows(viewport);
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 90 }));
        viewport.scrollTop += 90;
        await frames();
        const now = visibleRows(viewport);
        /* Every row still on screen moved by the same distance, the distance
           scrolled: folding the turn above took nothing out from under them. */
        const moves = [...now]
            .filter(([row]) => before.has(row))
            .map(([row, top]) => [label(row), Math.round(before.get(row)! - top)] as const);
        const moved = moves[0]?.[1] ?? 0;
        expect(moves).toEqual(moves.map(([row]) => [row, moved]));
        expect(moved).toBeLessThanOrEqual(90);
        if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1) break;
    }
    expect(store.get().expandedTurnIds.size).toBe(0);
    // Folded off screen: its steps are gone when the reader goes back to it.
    viewport.scrollTop = 0;
    await frames();
    for (let guard = 0; guard < 40 && !rowWith(viewport, "Prompt live"); guard += 1) {
        viewport.scrollTop += 300;
        await frames();
    }
    expect(rowWith(viewport, "Prompt live")).toBeDefined();
    // A turn the steer cut short has no answer, so its last step stays standing for it.
    expect(rowWith(viewport, "live-step-0")).toBeUndefined();
    expect(rowWith(viewport, "live-step-7")?.textContent).toContain("View traces");
});

it("changes nothing on screen when a watched turn finishes with an answer", async () => {
    const { view, store, push } = renderChat([...turn("a", 6), ...turn("b", 6)]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    push(prompt("live", "Prompt live: run every step."));
    for (let index = 0; index < 6; index += 1) push(step("live", index));
    push(answer("live", `Answer live. ${"Every step passed and nothing moved. ".repeat(4)}`));
    await frames();
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -60 }));
    viewport.scrollTop -= 60;
    await frames();
    const watched = visibleContent(viewport);
    expect([...watched.keys()].some((row) => row.textContent?.includes("Answer live"))).toBe(true);

    push(end("live"));
    await frames();
    expect(store.get().expandedTurnIds).toEqual(new Set(["live"]));
    const after = visibleContent(viewport);
    for (const [row, content] of watched)
        expect([label(row), row.isConnected, after.get(row)]).toEqual([label(row), true, content]);
    // The footer the end brought offers to hide the steps.
    // Laid out once idle time reaches it, like any row arriving below the reader.
    viewport.scrollTop = viewport.scrollHeight;
    await vi.waitFor(() =>
        expect(
            rowsOf(viewport)
                .reverse()
                .find((row) => row.textContent?.includes("Completed"))?.textContent,
        ).toContain("Hide traces"),
    );
    const footer = rowsOf(viewport)
        .reverse()
        .find((row) => row.textContent?.includes("Completed"))!;
    footer.querySelector<HTMLButtonElement>("button[aria-expanded]")!.click();
    await frames();
    expect(store.get().expandedTurnIds.size).toBe(0);
    expect(rowWith(viewport, "live-step-0")).toBeUndefined();
});

it("keeps the rows of a turn steered at the bottom on screen while it follows", async () => {
    const { view, store, push } = renderChat([...turn("a", 6)]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    push(prompt("live", "Prompt live: run every step."));
    for (let index = 0; index < 14; index += 1) {
        push(step("live", index));
        await frames();
    }
    const watched = visibleRows(viewport);
    expect([...watched.keys()].some((row) => row.textContent?.includes("live-step-13"))).toBe(true);

    push(end("live", "steering"), prompt("steer", "Actually, stop after the tests."));
    await frames();
    push(step("steer", 0));
    await frames();
    expect(store.get().expandedTurnIds).toEqual(new Set(["live"]));
    // Following carries everything up together; nothing on screen leaves it
    // early or moves against its neighbours.
    const now = visibleRows(viewport);
    const moves = [...watched]
        .filter(([row]) => now.has(row))
        .map(([row, top]) => [label(row), Math.round(top - now.get(row)!)] as const);
    expect(moves.length).toBeGreaterThan(watched.size / 2);
    expect(moves).toEqual(moves.map(([row]) => [row, moves[0]![1]]));
    expect(rowWith(viewport, "live-step-13")).toBeDefined();
});

it("keeps the final answer as the fold anchor without a second trace control", async () => {
    const { view, store } = renderChat([
        ...turn("a", 6),
        ...turn("b", 6),
        ...turn("c", 6),
        ...turn("d", 6),
        ...turn("e", 6),
    ]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    // Park with this turn's prompt above its answer, away from the live edge.
    const offset =
        rowWith(viewport, "Prompt c:")!.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        80;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: offset }));
    viewport.scrollTop += offset;
    await frames();
    const control = (label: string) =>
        [...viewport.querySelectorAll<HTMLElement>("button")].find(
            (button) =>
                button.textContent?.includes(label) &&
                button
                    .closest(".happy-message-list__virtual-row")
                    ?.textContent?.includes("Answer c"),
        );
    const view0 = control("View traces")!;
    expect(view0).toBeDefined();
    view0.click();
    await frames();
    expect(store.get().expandedTurnIds).toEqual(new Set(["c"]));
    expect(rowWith(viewport, "c-step-5")).toBeDefined();
    const final = store
        .get()
        .entries.find((entry) => entry.kind === "message" && entry.message.id === "c:answer");
    expect(final?.traceFoldAnchorId).toBe("c");
    expect(final?.kind === "message" && final.message.agentTrace).toBeUndefined();
    expect(control("Hide traces")).toBeUndefined();
    store.turnTraceToggle("c");
    await frames();
    expect(store.get().expandedTurnIds.size).toBe(0);
    expect(control("View traces")).toBeDefined();
});

it("renders one author header across inference messages and tools, expanded or collapsed", async () => {
    const opening = {
        ...answer("a", "I will inspect the repo."),
        id: "a:opening",
        messageId: "a:opening",
    };
    const middle = {
        ...answer("a", "Now checking the result."),
        id: "a:middle",
        messageId: "a:middle",
    };
    const { view, store } = renderChat([
        prompt("a", "Inspect the repo and summarize the result."),
        opening,
        step("a", 0),
        middle,
        step("a", 1),
        answer("a", "Everything is ready."),
        { ...end("a"), elapsedMs: 15_000 },
    ]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    const assertTurn = () => {
        expect(
            [...viewport.querySelectorAll(".happy-message__author")].filter(
                (node) => node.textContent === "Happy",
            ),
        ).toHaveLength(1);
        const final = store
            .get()
            .entries.find((entry) => entry.kind === "message" && entry.message.id === "a:answer");
        expect(final?.traceFoldAnchorId).toBe("a");
        const status = store.get().entries.filter((entry) => entry.kind === "turnStatus");
        expect(status).toHaveLength(1);
        expect(status[0]).toMatchObject({
            durationMs: 15_000,
            copyText: "Everything is ready.",
            tools: 2,
        });
        expect(viewport.querySelectorAll('[data-happy-desktop-ui="turn-summary"]')).toHaveLength(1);
        expect(
            viewport.querySelector('[data-happy-desktop-ui="turn-summary-label"]')?.textContent,
        ).toMatch(/Completed in\s+15s/);
    };
    assertTurn();
    store.turnTraceToggle("a");
    await frames();
    expect(rowWith(viewport, "I will inspect the repo.")).toBeDefined();
    expect(rowWith(viewport, "Now checking the result.")).toBeDefined();
    expect(
        [...viewport.querySelectorAll("button")].filter((node) =>
            node.textContent?.includes("Hide traces"),
        ),
    ).toHaveLength(1);
    assertTurn();
    store.turnTraceToggle("a");
    await frames();
    assertTurn();
});

it("folds from the top control without moving what is above it", async () => {
    const { view, store } = renderChat([...turn("a", 6), ...turn("b", 20), ...turn("c", 3)]);
    await view.ready();
    await frames();
    const viewport = viewportOf(view);
    store.turnTraceToggle("b");
    await frames();
    // Bring the top of the open turn into view, its prompt just inside the top edge.
    const offset =
        rowWith(viewport, "Prompt b:")!.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        40;
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: offset }));
    viewport.scrollTop += offset;
    await frames();
    const top = [...viewport.querySelectorAll<HTMLElement>("button")].find(
        (button) =>
            button.textContent?.includes("Hide traces") &&
            button.closest(".happy-message-list__virtual-row")?.textContent?.includes("b-step-0"),
    )!;
    expect(top).toBeDefined();
    const promptRow = rowWith(viewport, "Prompt b:")!;
    const promptTop = promptRow.getBoundingClientRect().top;
    expect(promptTop).toBeGreaterThanOrEqual(viewport.getBoundingClientRect().top);
    top.click();
    await frames();
    expect(store.get().expandedTurnIds.has("b")).toBe(false);
    expect(promptRow.isConnected).toBe(true);
    expect(promptRow.getBoundingClientRect().top).toBe(promptTop);
});
