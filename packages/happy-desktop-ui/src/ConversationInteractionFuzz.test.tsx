import { Children, Fragment, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";
import {
    happyAgentChatStoreCreate,
    happyAgentWorkspaceStoreCreate,
    agentAuthor as agent,
    happyAgentOwnerAuthor as reader,
    type ChatElement,
    type ComposerSnapshot,
    type ConversationEntry,
    type HappyAgentSessionId,
    type HappyAgentGroupId,
    type HappyAgentSessionListSnapshot,
    type HappyAgentWorkspaceClient,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import type { MessageListScrollPosition } from "./Message";
import { RetainedViews } from "./RetainedViews";
import type {
    ConversationSwitchSource,
    ConversationSwitchTarget,
} from "./conversationSwitchTargets";
import { createRenderer, pageViewport } from "./testing";
import { testDepth } from "./testing/testDepth";
import {
    fuzzActions,
    fuzzCases,
    fuzzDeck,
    fuzzRandom as random,
    type FuzzAction as Action,
} from "./testing/conversationFuzz";

/** Replay a complete tape: VITE_CHAT_FUZZ_SEED=123 HAPPY_TEST_DEPTH=full.
 * The PRNG never reads the clock. Each failure includes the entire action tape.
 * DOM reads below are the oracle, not production scroll-path instrumentation.
 */
const override = import.meta.env.VITE_CHAT_FUZZ_SEED;
if (override !== undefined && (!/^\d+$/.test(override) || Number(override) > 0xffffffff))
    throw new Error("VITE_CHAT_FUZZ_SEED must be an unsigned 32-bit integer");
const cases =
    override === undefined
        ? fuzzCases(testDepth)
        : [{ seed: Number(override), name: "replay", short: false }];
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const pageZoom = server.browser === "chromium";
async function deviceScale(scale: number) {
    await cdp().send("Emulation.setDeviceMetricsOverride", {
        ...pageViewport(),
        deviceScaleFactor: scale,
        mobile: false,
    });
}
async function settle() {
    await frame();
    await frame();
}
const catalog = {
    defaultModelId: "model",
    defaultProviderId: "provider",
    models: [],
    providers: [],
};
const imageData = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 160;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#4678bd";
    context.fillRect(0, 0, 240, 160);
    return canvas.toDataURL("image/png").split(",")[1]!;
})();
const composer: ComposerSnapshot = {
    scopeId: "fuzz",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const failureSource: ConversationSwitchSource = {
    selection: { service: "claude", account: "claude_primary", model: "model" },
    services: [
        {
            id: "claude",
            label: "Claude",
            account: "claude_primary",
            accounts: [
                {
                    id: "claude_primary",
                    label: "Primary",
                    models: [{ id: "model", label: "Model", efforts: [] }],
                },
                {
                    id: "claude_backup",
                    label: "Backup",
                    models: [{ id: "model", label: "Model", efforts: [] }],
                },
            ],
        },
    ],
};
function session(id: string): SessionState {
    return {
        activity: { kind: "generating_message", label: "Working", since: 0 },
        status: "running",
        archived: false,
        sessionId: id,
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
        transcriptComplete: false,
        loadMoreToken: "older-page",
        loadingMore: false,
    };
}
function base(id: string, groupId = id) {
    return { id, groupId, runId: `run:${groupId}`, createdAt: 1_790_000_000_000 };
}
function answer(id: string, text: string, complete = true, groupId = id): ChatElement {
    return { ...base(id, groupId), kind: "agent_text", messageId: id, text, complete };
}
function history(prefix: string, count: number): ChatElement[] {
    return Array.from({ length: count }, (_, i) =>
        answer(
            `${prefix}:${i}`,
            `History ${prefix}:${i}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (i % 5))}`,
        ),
    );
}
function own(
    id: string,
    delivery: "sending" | "pending_steering" | "sent" | "failed",
): ConversationEntry {
    return {
        kind: "message",
        source: delivery === "sent" ? "server" : "local",
        delivery,
        sentHere: true,
        message: {
            id,
            chatId: "fuzz",
            sequence: id,
            changePts: id,
            sender: reader,
            text: `Sent ${id}`,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}
function chatCreate(id: string, count: number) {
    let change!: (elements: readonly ChatElement[], state: SessionState) => void;
    const store = happyAgentChatStoreCreate(id as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            change = (elements, state) => options.onChange(elements, state, []);
            return {
                close: () => undefined,
                loadMore: () => {
                    queueMicrotask(() => {
                        chat.state = { ...chat.state, loadingMore: true };
                        chat.publish();
                    });
                },
            };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });
    // Keep the transport leased independently of Activity's visible UI subscription.
    const release = store.subscribe(() => undefined);
    store.reasoningToggle();
    const chat = {
        release,
        id,
        store,
        elements: history(id, count),
        state: session(id),
        extras: [] as ConversationEntry[],
        steeringSendId: undefined as string | undefined,
        draft: "",
        docked: true,
        runningGroup: id,
        stopCount: 0,
        position: undefined as MessageListScrollPosition | undefined,
        cached: undefined as readonly ConversationEntry[] | undefined,
        standIn: false,
        generation: 0,
        kept: true,
        publish() {
            change(chat.elements, chat.state);
        },
    };
    return chat;
}
type Chat = ReturnType<typeof chatCreate>;

function turnStop(chat: Chat) {
    const id = `${chat.id}:stop:${chat.stopCount++}`;
    chat.elements = [
        ...chat.elements.map((entry) =>
            entry.kind === "agent_text" || entry.kind === "thinking"
                ? { ...entry, complete: true }
                : entry,
        ),
        {
            ...base(id, chat.runningGroup),
            kind: "group_end",
            outcome: "stopped",
            reason: "abort",
            startedAt: 1_790_000_000_000,
            endedAt: 1_790_000_001_000,
            elapsedMs: 1000,
            turnStartedAt: 1_790_000_000_000,
            turnElapsedMs: 1000,
            modelTurn: true,
        },
    ];
    chat.state = { ...chat.state, status: "idle" };
    chat.publish();
}

function queuedAccept(chat: Chat, groupId: string) {
    const queued = chat.extras.filter(
        (entry) => entry.kind === "message" && entry.delivery === "pending_steering",
    );
    if (queued.length === 0) return false;
    chat.elements = [
        ...chat.elements,
        ...queued.flatMap((entry): ChatElement[] =>
            entry.kind === "message"
                ? [
                      {
                          ...base(entry.message.id, groupId),
                          kind: "user_message",
                          messageId: entry.message.id,
                          authority: "server",
                          identity: null,
                          delivery: "sent",
                          text: entry.message.text,
                      },
                  ]
                : [],
        ),
    ];
    chat.extras = chat.extras.filter((entry) => !queued.includes(entry));
    chat.state = { ...chat.state, pendingSteeringMessages: [] };
    return true;
}

function harnessCreate(count = 65, namespace = "") {
    const baseScale = devicePixelRatio;
    const view = createRenderer();
    const chats = ["a", "b", "c"].map((id) =>
        chatCreate(namespace ? `${namespace}:${id}` : id, count),
    );
    let active = 0;
    let height = 650;
    let width = 820;
    let zoom = 1;
    const listeners = new Set<() => void>();
    const disclosureAnchors = new Map<
        string,
        {
            node: HTMLElement;
            offset: number;
            kind: "standard" | "explicit";
            resolve?: () => HTMLElement | undefined;
        }
    >();
    const sendHolds = new Map<string, { id: string; rows: number }>();
    const restoredPositions = new Map<
        string,
        Extract<MessageListScrollPosition, { type: "row" }>
    >();
    function rowCount() {
        const chat = chats[active]!;
        const entries =
            chat.standIn && chat.cached
                ? chat.cached
                : [...chat.store.get().entries, ...chat.extras];
        // Questions are transcript rows, with or without a dock.
        return entries.length + 1;
    }
    const shellSnapshot = () => ({
        active,
        height,
        width,
        zoom,
        chats: chats.map((chat) => ({ ...chat })),
    });
    let shell = shellSnapshot();
    function redraw() {
        flushSync(() => {
            shell = shellSnapshot();
            for (const notify of listeners) notify();
        });
    }
    function resumeFailure(chat: Chat, entryId: string, target: ConversationSwitchTarget) {
        chat.extras = chat.extras.map((entry) =>
            entry.kind === "notice" &&
            entry.variant !== "compute" &&
            entry.id === entryId &&
            entry.failure
                ? {
                      ...entry,
                      failure: {
                          ...entry.failure,
                          resolution: {
                              action: "switched",
                              at: 1_790_000_000_001,
                              providerId: target.providerId,
                              providerLabel: target.providerLabel,
                              modelId: target.modelId,
                              modelName: target.modelName,
                          },
                      },
                  }
                : entry,
        );
        chat.state = {
            ...chat.state,
            status: "running",
            providerId: target.providerId,
            modelId: target.modelId,
        };
        redraw();
    }
    function ChatView({ chat }: { chat: Chat }) {
        const snapshot = useSyncExternalStore(chat.store.subscribe, chat.store.get);
        return (
            <ConversationView
                agentAuthor={agent}
                conversationId={chat.id}
                viewerId={reader.id}
                motion="calm"
                entries={
                    chat.standIn && chat.cached
                        ? chat.cached
                        : [...snapshot.entries, ...chat.extras]
                }
                expandedTurnIds={snapshot.expandedTurnIds}
                onTracesSeen={chat.store.turnTracesSeen}
                onTraceToggle={chat.store.turnTraceToggle}
                onStartReached={chat.store.historyLoadMore}
                running={chat.state.status === "running"}
                steeringSendId={chat.steeringSendId}
                failureSwitch={failureSource}
                failureActions={{
                    onSwitch: (entryId, target) =>
                        resumeFailure(
                            chats.find((source) => source.id === chat.id)!,
                            entryId,
                            target,
                        ),
                }}
                scrollPosition={chat.position}
                onScrollPositionChange={(position) => {
                    chats.find((source) => source.id === chat.id)!.position = position;
                }}
                dock={
                    chat.docked ? (
                        <ConversationDock
                            composer={{ ...composer, text: chat.draft }}
                            onComposerValueChange={(text) => {
                                chats.find((source) => source.id === chat.id)!.draft = text;
                                redraw();
                            }}
                            onComposerSend={() => undefined}
                            running={chat.state.status === "running"}
                            onAbort={() => {
                                turnStop(chats.find((source) => source.id === chat.id)!);
                                redraw();
                            }}
                        />
                    ) : undefined
                }
            />
        );
    }
    function Harness() {
        const current = useSyncExternalStore(
            (notify) => {
                listeners.add(notify);
                return () => listeners.delete(notify);
            },
            () => shell,
        );
        return (
            <div
                data-fuzz-panel
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: pageZoom ? current.height / current.zoom : current.height,
                    width: pageZoom ? current.width / current.zoom : current.width,
                    zoom: pageZoom ? 1 : current.zoom,
                }}
            >
                <RetainedViews
                    activeId={current.chats[current.active]!.id}
                    views={current.chats
                        .filter((chat) => chat.kept)
                        .map((chat) => ({
                            id: chat.id,
                            content: <ChatView key={`${chat.id}:${chat.generation}`} chat={chat} />,
                        }))}
                />
            </div>
        );
    }
    view.render(Harness, { width: 1550, height: 1550 });
    for (const chat of chats) chat.publish();
    return {
        view,
        chats,
        redraw,
        resumeFailure,
        get heldAnchor() {
            const held = disclosureAnchors.get(chats[active]!.id);
            return held?.node.isConnected ? held.node : held?.resolve?.();
        },
        get heldPointOffset() {
            return disclosureAnchors.get(chats[active]!.id)?.offset;
        },
        get heldPointKind() {
            return disclosureAnchors.get(chats[active]!.id)?.kind ?? "standard";
        },
        anchorSet(
            node?: HTMLElement,
            resolve?: () => HTMLElement | undefined,
            offset = 0,
            kind: "standard" | "explicit" = "explicit",
        ) {
            if (node)
                disclosureAnchors.set(chats[active]!.id, {
                    node,
                    offset,
                    kind,
                    ...(resolve ? { resolve } : {}),
                });
            else disclosureAnchors.delete(chats[active]!.id);
        },
        anchorForget(index: number) {
            disclosureAnchors.delete(chats[index]!.id);
            sendHolds.delete(chats[index]!.id);
        },
        sendHold(id?: string) {
            if (id) sendHolds.set(chats[active]!.id, { id, rows: rowCount() });
            else sendHolds.delete(chats[active]!.id);
        },
        get heldSend() {
            const held = sendHolds.get(chats[active]!.id);
            if (held?.rows === rowCount()) return held.id;
            sendHolds.delete(chats[active]!.id);
            return undefined;
        },
        get active() {
            return active;
        },
        restoredPositionTake() {
            const id = chats[active]!.id;
            const position = restoredPositions.get(id);
            restoredPositions.delete(id);
            return position;
        },
        switch(index: number) {
            const incoming = chats[index]!;
            if (incoming.position?.type === "row")
                restoredPositions.set(incoming.id, incoming.position);
            else restoredPositions.delete(incoming.id);
            active = index;
            disclosureAnchors.delete(chats[index]!.id);
            chats[index]!.kept = true;
            redraw();
        },
        async resize(h: number, w: number, z: number) {
            if (!pageZoom && z !== 1)
                throw new Error(
                    "Firefox CSS zoom changes native scroll units; zoom is covered with Chromium page zoom",
                );
            if (pageZoom && zoom !== z) await deviceScale(baseScale * z);
            height = h;
            width = w;
            zoom = z;
            redraw();
        },
        get geometry() {
            return { height, width, zoom };
        },
        get scale() {
            return pageZoom ? 1 : zoom;
        },
        viewport() {
            return view.container.querySelector<HTMLElement>(
                `[data-view-id="${chats[active]!.id}"] .happy-message-list__viewport, [data-view-id="${chats[active]!.id}"] .happy-conversation__empty-viewport`,
            )!;
        },
        async close() {
            view.destroy();
            for (const chat of chats) {
                chat.release();
                chat.store[Symbol.dispose]();
            }
            if (pageZoom) await deviceScale(baseScale);
        },
    };
}
type Harness = ReturnType<typeof harnessCreate>;

/** Only the remote workspace client is inert; transcript and workspace stores
 * are real. This is the same boundary used by the state retention tests. */
function workspaceCreate(chats: readonly Chat[], cached: boolean) {
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
    const groupId = "fuzz-project" as HappyAgentGroupId;
    const list = {
        projects: {
            type: "ready",
            value: [
                {
                    id: groupId,
                    path: "/fuzz",
                    displayPath: "/fuzz",
                    name: "Fuzz",
                    orderKey: "a",
                    kind: "regular",
                    lifecycle: { phase: "ready" },
                    worktrees: [],
                    activity: "idle",
                    updatedAt: 1,
                    conversations: chats.map((chat) => ({
                        id: chat.id,
                        title: chat.id,
                        subtitle: "/fuzz",
                        updatedAt: 1,
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
    let holding = false;
    const arrivals: (() => void)[] = [];
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
            chat: (id: string) => {
                const store = chats.find((chat) => chat.id === id)!.store;
                const handle = { store, [Symbol.dispose]: () => undefined };
                return holding
                    ? new Promise((resolve) => arrivals.push(() => resolve(handle)))
                    : Promise.resolve(handle);
            },
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, {
        conversationRetention: { count: cached ? 2 : 0, size: 100_000 },
    });
    const stop = workspace.subscribe(() => undefined);
    return {
        workspace,
        async open(id: string) {
            workspace.conversationOpen(id as HappyAgentSessionId, groupId);
            await Promise.resolve();
            await Promise.resolve();
        },
        hold() {
            holding = true;
        },
        async arrive() {
            holding = false;
            for (const resolve of arrivals.splice(0)) resolve();
            await Promise.resolve();
            await Promise.resolve();
        },
        close() {
            stop();
            workspace[Symbol.dispose]();
        },
    };
}
type Row = {
    node: HTMLElement;
    top: number;
    bottom: number;
    text: string;
    index: number;
    key?: string;
};
function painted(viewport: HTMLElement, visibleOnly = true): Row[] {
    const bounds = viewport.getBoundingClientRect();
    return [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")].flatMap(
        (node) => {
            const rect = node.getBoundingClientRect();
            return rect.height > 0 &&
                (!visibleOnly || (rect.bottom > bounds.top && rect.top < bounds.bottom))
                ? [
                      {
                          node,
                          top: rect.top,
                          bottom: rect.bottom,
                          text: node.textContent ?? "",
                          index: Number(node.dataset.index),
                      },
                  ]
                : [];
        },
    );
}
function transcriptOnFloor(viewport: HTMLElement, bounds: DOMRect) {
    const virtual = viewport.querySelector<HTMLElement>(".happy-message-list__virtual");
    const contentBounds = virtual?.getBoundingClientRect();
    return (
        contentBounds !== undefined &&
        !viewport.querySelector(".happy-message-list__header") &&
        viewport.scrollTop <= 1 &&
        contentBounds.top > bounds.top + 1 &&
        Math.abs(contentBounds.bottom - bounds.bottom) <= 1
    );
}
function snapshot(harness: Harness, explicitTrim = false) {
    const viewport = harness.viewport();
    const bounds = viewport.getBoundingClientRect();
    const virtual = viewport.querySelector<HTMLElement>(".happy-message-list__virtual");
    const footer = viewport.querySelector<HTMLElement>('[data-item-id="working-status"]');
    const chat = harness.chats[harness.active]!;
    const source =
        chat.standIn && chat.cached ? chat.cached : [...chat.store.get().entries, ...chat.extras];
    let queuedFrom = source.length;
    if (chat.state.status === "running") {
        while (queuedFrom > 0) {
            const entry = source[queuedFrom - 1];
            if (entry?.kind !== "message" || entry.delivery !== "pending_steering") break;
            queuedFrom--;
        }
    }
    // Questions are transcript rows, with or without a dock.
    const transcript = source.slice(0, queuedFrom);
    const entries = [...transcript, ...source.slice(queuedFrom)];
    const keys = Children.toArray(
        entries.map((entry) => (
            <Fragment key={entry.kind === "message" ? entry.message.id : entry.id} />
        )),
    ).map((child) => (typeof child === "object" && "key" in child ? String(child.key) : undefined));
    // MessageList inserts the working footer before trailing queued messages.
    // Its virtual indexes include that slot even when the footer is empty.
    keys.splice(transcript.length, 0, "__happy_message_list_footer__");
    const allRows = painted(viewport, false).map((row) => ({ ...row, key: keys[row.index] }));
    const rows = allRows.filter((row) => row.bottom > bounds.top && row.top < bounds.bottom);
    const savedPosition = harness.chats[harness.active]!.position;
    const point = bounds.bottom - Math.min(32 * harness.scale, bounds.height);
    const candidates = rows.filter((row) => row.node.dataset.itemId !== "working-status");
    // Read persistence only when entering a chat. Later mutations follow the
    // oracle's live row-local point, including while publications lag it.
    const restored = harness.restoredPositionTake();
    const restoredCandidate = restored
        ? allRows.find((row) => row.key === restored.rowKey)
        : undefined;
    const restoredPoint =
        restoredCandidate && restored
            ? restoredCandidate.top + restored.offset * harness.scale
            : undefined;
    const restoredRow =
        restoredPoint !== undefined && restoredPoint >= bounds.top && restoredPoint <= bounds.bottom
            ? restoredCandidate
            : undefined;
    const held = restoredRow?.node ?? harness.heldAnchor;
    const heldBounds = held?.isConnected ? held.getBoundingClientRect() : undefined;
    // A selected row can straddle the viewport edge after geometry changes.
    // Keep its reading point rather than silently selecting a downstream row.
    const heldRow =
        held && heldBounds
            ? {
                  node: held,
                  top: heldBounds.top,
                  bottom: heldBounds.bottom,
                  text: held.textContent ?? "",
                  index: Number(held.dataset.index),
                  key: keys[Number(held.dataset.index)],
              }
            : undefined;
    const anchor =
        heldRow ??
        candidates.find((row) => row.top <= point && row.bottom > point) ??
        candidates.at(-1);
    // A reported position is a serialization at the standard reading point.
    // The live reader keeps its selected row as later rows arrive below it.
    // Remember that row until a new gesture or retained-view restore selects
    // another point; repeatedly recapturing would make the oracle drift.
    const readingOffset =
        restoredRow && restored
            ? restored.offset * harness.scale
            : heldRow
              ? (harness.heldPointOffset ?? 0)
              : anchor
                ? Math.max(0, Math.min(anchor.bottom - anchor.top, point - anchor.top))
                : undefined;
    const readingPoint =
        anchor && readingOffset !== undefined ? anchor.top + readingOffset : undefined;
    const pointKind = restoredRow
        ? "standard"
        : heldRow
          ? harness.heldPointKind
          : explicitTrim &&
              savedPosition?.type === "row" &&
              readingPoint !== undefined &&
              Math.abs(readingPoint - point) > 1
            ? "explicit"
            : "standard";
    if (restoredRow && anchor) harness.anchorSet(anchor.node, undefined, readingOffset, "standard");
    else if (!heldRow && anchor && savedPosition?.type === "row")
        harness.anchorSet(anchor.node, undefined, readingOffset, pointKind);
    let glyph:
        | {
              row: HTMLElement;
              range: Range;
              text: string;
              occurrence: number;
              top: number;
              distance: number;
          }
        | undefined;
    if (anchor) {
        const walker = document.createTreeWalker(anchor.node, NodeFilter.SHOW_TEXT);
        const occurrences = new Map<string, number>();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue;
            const occurrence = occurrences.get(node.textContent) ?? 0;
            occurrences.set(node.textContent, occurrence + 1);
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (rect.height === 0) continue;
            const distance = Math.max(
                rect.top - (readingPoint ?? point),
                (readingPoint ?? point) - rect.bottom,
                0,
            );
            if (glyph === undefined || distance < glyph.distance)
                glyph = {
                    row: anchor.node,
                    range,
                    text: node.textContent,
                    occurrence,
                    top: rect.top,
                    distance,
                };
        }
    }
    return {
        rows,
        allRows,
        keys,
        loadingRow: harness.chats[harness.active]!.state.loadingMore
            ? viewport.querySelector<HTMLElement>(
                  '.happy-message-list__virtual-row[data-index="0"]',
              )
            : undefined,
        anchor,
        readingOffset,
        readingPoint,
        pointKind,
        anchorMessageKeys: anchor
            ? harness.chats[harness.active]!.store.get().entries.flatMap((entry) =>
                  entry.kind === "message" && anchor.text.includes(entry.message.text.trim())
                      ? [entry.message.id]
                      : [],
              )
            : [],
        glyph,
        bounds,
        leadingGap: virtual
            ? virtual.getBoundingClientRect().top - bounds.top + viewport.scrollTop * harness.scale
            : 0,
        naturalHeight: virtual ? Number.parseFloat(virtual.style.height) * harness.scale : 0,
        anchorModelStart: anchor
            ? Number.parseFloat(anchor.node.style.transform.slice("translateY(".length)) *
              harness.scale
            : undefined,
        floorResting: transcriptOnFloor(viewport, bounds),
        endGap: virtual ? virtual.getBoundingClientRect().bottom - bounds.bottom : 0,
        footerHeight: footer?.getBoundingClientRect().height ?? 0,
        held: virtual
            ? Math.max(
                  0,
                  Number.parseFloat(virtual.style.minHeight || "0") -
                      Number.parseFloat(virtual.style.height || "0"),
              )
            : 0,
        position: harness.chats[harness.active]!.position,
        // Disclosure parks immediately; its persistence callback may wait
        // until the next native scroll or the view's hide cleanup.
        parked: savedPosition?.type === "row" || heldRow !== undefined,
        following: savedPosition?.type === "bottom" && heldRow === undefined,
        zoom: harness.scale,
    };
}
function wheel(viewport: HTMLElement, delta: number) {
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, cancelable: true }));
    viewport.scrollTop += delta;
}
function publishedPointCheck(
    before: ReturnType<typeof snapshot>,
    harness: Harness,
    chatIndex: number,
) {
    if (!before.parked || before.readingPoint === undefined) return;
    const position = harness.chats[chatIndex]!.position;
    expect(position?.type, "parked position was not published on hide").toBe("row");
    if (position?.type !== "row") return;
    const row = before.allRows.find((candidate) => candidate.key === position.rowKey);
    expect(row, "published row was not mounted before hide").toBeDefined();
    if (row) {
        const reproducedTop =
            before.bounds.bottom -
            (position.viewportInset ?? 32) * before.zoom -
            position.offset * before.zoom;
        expect(
            Math.abs(reproducedTop - row.top),
            "published position does not reproduce its live row",
        ).toBeLessThanOrEqual(1);
        if (before.anchor)
            expect(
                Math.abs(before.anchor.top + reproducedTop - row.top - before.anchor.top),
                "published position moves the live anchor",
            ).toBeLessThanOrEqual(1);
    }
}
function restoredGlyphTop(row: HTMLElement, previous: ReturnType<typeof snapshot>) {
    if (!previous.glyph) return undefined;
    const text = previous.glyph.text;
    let occurrence = 0;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent !== text) continue;
        if (occurrence++ !== previous.glyph.occurrence) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().top;
    }
    return undefined;
}
function parkedRowsCheck(before: ReturnType<typeof snapshot>, next: ReturnType<typeof snapshot>) {
    const insertedAt = next.keys.findIndex((key) => !before.keys.includes(key));
    const insertionBefore =
        insertedAt < 0
            ? undefined
            : next.keys.slice(0, insertedAt).filter((key) => before.keys.includes(key)).length;
    let upstreamDelta: number | undefined;
    for (const previous of before.rows) {
        if (
            previous.node.dataset.itemId === "working-status" ||
            !previous.node.isConnected ||
            previous.node.textContent !== previous.text
        )
            continue;
        if (insertionBefore !== undefined && previous.index > (before.anchor?.index ?? -1))
            continue;
        const delta = previous.node.getBoundingClientRect().top - previous.top;
        const upstream = insertionBefore !== undefined && previous.index < insertionBefore;
        if (upstream) upstreamDelta ??= delta;
        expect(
            Math.abs(delta - (upstream ? upstreamDelta! : 0)),
            "rows moved while recapturing a reading point",
        ).toBeLessThanOrEqual(1);
    }
}
function stable(before: ReturnType<typeof snapshot>, harness: Harness) {
    const viewport = harness.viewport();
    const row = before.anchor;
    if (!row) return;
    expect(row.node.isConnected, "visible anchor removed").toBe(true);
    const next = snapshot(harness);
    const after = next.rows;
    for (const visible of before.rows) {
        if (visible.node.dataset.itemId === "working-status") continue;
        // Completing the page removes its transient loading indicator.
        if (visible.node === before.loadingRow) continue;
        const matches = after.filter((candidate) =>
            visible.key !== undefined
                ? candidate.key === visible.key
                : candidate.text === visible.text,
        );
        if (
            matches.length !== 1 ||
            (visible.key === undefined &&
                before.rows.filter((candidate) => candidate.text === visible.text).length !== 1)
        )
            continue;
        // An insertion between this row and the anchor can carry it out of
        // view. Rows that remain visible must keep their DOM.
        expect(
            matches[0]!.node === visible.node,
            `visible row ${visible.index} replaced: ${visible.text.slice(0, 100)}`,
        ).toBe(true);
    }
    // A change inside the anchored row above its reading point can change its
    // top while preserving that point. Unchanged rows have no such exemption.
    if (row.node.textContent !== row.text) return;
    const bounds = viewport.getBoundingClientRect();
    const currentTop = row.node.getBoundingClientRect().top;
    // Absorb growth above the anchor into the old floor gap before releasing
    // the remaining gap on shrink. Only a point clipped after that release
    // needs its previous bottom inset restored through native scrolling.
    const flooredShrink =
        before.floorResting &&
        bounds.height < before.bounds.height &&
        before.readingPoint !== undefined;
    const anchorModelStart =
        Number.parseFloat(row.node.style.transform.slice("translateY(".length)) * before.zoom;
    const growthAbove = Math.max(
        0,
        anchorModelStart - (before.anchorModelStart ?? anchorModelStart),
    );
    const gapBeforeShrink = Math.max(0, before.leadingGap - growthAbove);
    const gapAfterShrink = Math.min(
        gapBeforeShrink,
        Math.max(0, bounds.height - next.naturalHeight),
    );
    let floorDelta = flooredShrink ? gapAfterShrink - gapBeforeShrink : 0;
    let expectedPoint =
        before.readingPoint === undefined ? undefined : before.readingPoint + floorDelta;
    const clippedFloorPoint =
        flooredShrink &&
        expectedPoint !== undefined &&
        (expectedPoint < bounds.top || expectedPoint > bounds.bottom);
    if (
        clippedFloorPoint &&
        before.readingPoint !== undefined &&
        expectedPoint !== undefined &&
        before.readingOffset !== undefined
    ) {
        expectedPoint = before.readingPoint + bounds.bottom - before.bounds.bottom;
        const currentPoint = currentTop + before.readingOffset;
        const nativeTop = viewport.scrollTop * before.zoom;
        const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight) * before.zoom;
        const targetTop = Math.max(0, Math.min(maxTop, nativeTop + currentPoint - expectedPoint));
        expectedPoint = currentPoint + nativeTop - targetTop;
        floorDelta = expectedPoint - before.readingPoint;
        expect(
            currentPoint,
            "floored shrink left the reading point above the viewport",
        ).toBeGreaterThanOrEqual(bounds.top - 1);
        expect(
            currentPoint,
            "floored shrink left the reading point below the viewport",
        ).toBeLessThanOrEqual(bounds.bottom + 1);
    }
    if (
        !before.floorResting &&
        bounds.height < before.bounds.height &&
        expectedPoint !== undefined &&
        (expectedPoint < bounds.top || expectedPoint > bounds.bottom)
    ) {
        parkedRowsCheck(before, next);
        expect(after.length, "viewport is blank after point recapture").toBeGreaterThan(0);
        return;
    }
    const pointShift =
        expectedPoint !== undefined && before.readingOffset !== undefined
            ? Math.abs(currentTop + before.readingOffset - expectedPoint)
            : Math.abs(currentTop - row.top - floorDelta);
    // Group chrome added above the reading point may move the row's outer
    // top while its original text remains fixed. That is the contract's
    // explicit exception for a change above the anchor inside the same row.
    const glyphHeld =
        before.glyph?.row === row.node &&
        before.glyph.range.startContainer.isConnected &&
        Math.abs(before.glyph.range.getBoundingClientRect().top - before.glyph.top - floorDelta) <=
            1;
    expect(
        glyphHeld ? 0 : pointShift,
        `anchor moved: ${row.text.slice(0, 70)}`,
    ).toBeLessThanOrEqual(1);
    const common = before.rows.filter(
        (row) => row.node.isConnected && after.some((next) => next.node === row.node),
    );
    for (let i = 1; i < common.length; i++) {
        const left = common[i - 1]!;
        const right = common[i]!;
        if (right.index - left.index !== 1) continue;
        if (
            Number(right.node.dataset.index) - Number(left.node.dataset.index) !==
            right.index - left.index
        )
            continue;
        if (left.text !== left.node.textContent || right.text !== right.node.textContent) continue;
        if (
            Math.abs(left.node.getBoundingClientRect().height - (left.bottom - left.top)) > 1 ||
            Math.abs(right.node.getBoundingClientRect().height - (right.bottom - right.top)) > 1
        )
            continue;
        const gap = right.node.getBoundingClientRect().top - left.node.getBoundingClientRect().top;
        expect(
            Math.abs(gap - (right.top - left.top)),
            "visible neighbours moved",
        ).toBeLessThanOrEqual(1);
    }
}
function geometryCheck(harness: Harness) {
    const viewport = harness.viewport();
    if (viewport.classList.contains("happy-conversation__empty-viewport")) {
        expect(viewport.textContent).toContain("Nothing here yet");
        return;
    }
    const rows = painted(viewport);
    expect(rows.length, "viewport contains only blank space").toBeGreaterThan(0);
    const zoom = harness.scale;
    // Adjacent virtual starts are the model's heights. Compare them to actual
    // painted row boxes; the final footer has no successor to compare against.
    const mounted = [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")];
    for (const row of rows) {
        const next = mounted.find((node) => Number(node.dataset.index) === row.index + 1);
        if (!next) continue;
        const start = Number.parseFloat(row.node.style.transform.slice("translateY(".length));
        const end = Number.parseFloat(next.style.transform.slice("translateY(".length));
        expect(
            Math.abs((end - start) * zoom - row.node.getBoundingClientRect().height),
            `modeled row ${row.index}: ${row.text.slice(0, 60)}; model=${(end - start) * zoom} paint=${row.node.getBoundingClientRect().height} zoom=${zoom} width=${row.node.getBoundingClientRect().width} font=${getComputedStyle(row.node).font} lineHeight=${getComputedStyle(row.node).lineHeight}`,
        ).toBeLessThanOrEqual(1);
    }
}
function followingCheck(harness: Harness) {
    const viewport = harness.viewport();
    if (viewport.classList.contains("happy-conversation__empty-viewport")) return;
    const bounds = viewport.getBoundingClientRect();
    const heldSend = harness.heldSend;
    if (heldSend) {
        const message = [...viewport.querySelectorAll<HTMLElement>(".happy-message")].find((node) =>
            node.textContent?.includes(`Sent ${heldSend}`),
        );
        expect(message, "followed send disappeared before a new row arrived").toBeDefined();
        const rect = message!.getBoundingClientRect();
        if (rect.height <= bounds.height + 1)
            expect(rect.top, "followed send clipped above").toBeGreaterThanOrEqual(bounds.top - 1);
        expect(rect.bottom, "followed send end clipped below").toBeLessThanOrEqual(
            bounds.bottom + 1,
        );
        expect(rect.bottom, "followed send end clipped above").toBeGreaterThan(bounds.top);
        return;
    }
    const content = viewport.querySelector<HTMLElement>(".happy-message-list__virtual")!;
    const held = Math.max(
        0,
        Number.parseFloat(content.style.minHeight || "0") -
            Number.parseFloat(content.style.height || "0"),
    );
    // Preserved space owns the end until the reply consumes it. Otherwise the
    // end is either the real footer or the final transcript row (an idle status
    // footer can deliberately sit below the logical end).
    if (held > 0) return;
    const last = [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")]
        .filter((node) => node.dataset.itemId !== "working-status")
        .at(-1);
    const nativeGap =
        Math.abs(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight) *
        harness.scale;
    const logicalGap = last
        ? Math.abs(bounds.bottom - last.getBoundingClientRect().bottom - 24 * harness.scale)
        : Infinity;
    const modeledGap = Math.abs(content.getBoundingClientRect().bottom - bounds.bottom);
    const footer = viewport.querySelector<HTMLElement>('[data-item-id="working-status"]');
    const footerGap = Math.abs(
        content.getBoundingClientRect().bottom -
            (footer?.getBoundingClientRect().height ?? 0) -
            bounds.bottom,
    );
    // The status footer is allowed to grow below the fold. Its withheld inset
    // accumulates height deltas, so it can be any part of the footer's height.
    const signedGap = content.getBoundingClientRect().bottom - bounds.bottom;
    const partialFooterGap = Math.max(
        0,
        -signedGap,
        signedGap - (footer?.getBoundingClientRect().height ?? 0),
    );
    expect(
        Math.min(nativeGap, logicalGap, modeledGap, footerGap, partialFooterGap),
        `follower lost the logical end: native=${nativeGap} logical=${logicalGap} modeled=${modeledGap} footer=${footerGap} signedModel=${content.getBoundingClientRect().bottom - bounds.bottom} footerHeight=${footer?.getBoundingClientRect().height} contentHeight=${content.style.height} extent=${content.style.minHeight}`,
    ).toBeLessThanOrEqual(1);
}

const ACTIONS = fuzzActions(pageZoom);
async function act(h: Harness, action: Action, pick: ReturnType<typeof random>, step: number) {
    const chat = h.chats[h.active]!;
    const id = `${chat.id}:step:${step}`;
    const b = base(id);
    let readerAction = false;
    let changesAnchor = false;
    let switched = false;
    let sent: string | undefined;
    switch (action) {
        case "runEmptyQueue":
        case "runOneQueued":
        case "runLargeQueue": {
            queuedAccept(chat, id);
            chat.docked = true;
            chat.draft = "";
            chat.runningGroup = id;
            chat.state = { ...chat.state, status: "running", pendingSteeringMessages: [] };
            chat.elements = [
                ...chat.elements,
                answer(
                    `${id}:reply`,
                    `${id}: ${"The current turn is streaming. ".repeat(8)}`,
                    false,
                    id,
                ),
            ];
            const count =
                action === "runEmptyQueue" ? 0 : action === "runOneQueued" ? 1 : 3 + pick(4);
            const queued = Array.from({ length: count }, (_, i) => {
                const message = own(`${id}:queued:${i}`, "pending_steering");
                return message.kind === "message"
                    ? {
                          ...message,
                          sentHere: false,
                          message: {
                              ...message.message,
                              text:
                                  i === count - 1 && action === "runLargeQueue"
                                      ? "A multi-screen queued message.\n".repeat(160)
                                      : `Queued follow-up ${i}`,
                          },
                      }
                    : message;
            });
            chat.extras = [
                ...chat.extras.filter(
                    (entry) => entry.kind !== "message" || entry.delivery !== "pending_steering",
                ),
                ...queued,
            ];
            chat.state = {
                ...chat.state,
                pendingSteeringMessages: queued.flatMap((entry) =>
                    entry.kind === "message"
                        ? [
                              {
                                  message: {
                                      id: entry.message.id,
                                      blocks: [{ type: "text" as const, text: entry.message.text }],
                                  },
                              },
                          ]
                        : [],
                ),
            };
            break;
        }
        case "stop": {
            const button = h
                .viewport()
                .closest(".happy-conversation")!
                .querySelector<HTMLButtonElement>('button[aria-label="Stop the agent"]');
            if (chat.state.status === "running" && chat.docked && chat.draft.trim() === "") {
                expect(button, "running turn has no Stop control").not.toBeNull();
                button!.click();
                expect(chat.state.status).toBe("idle");
            }
            break;
        }
        case "dequeue": {
            if (!queuedAccept(chat, id)) break;
            chat.runningGroup = id;
            chat.state = { ...chat.state, status: "running", pendingSteeringMessages: [] };
            break;
        }
        case "dequeuedStream":
            if (chat.state.status === "running")
                chat.elements = [
                    ...chat.elements,
                    answer(
                        id,
                        "The dequeued turn starts streaming. ".repeat(12),
                        false,
                        chat.runningGroup,
                    ),
                ];
            break;
        case "append":
            chat.elements = [
                ...chat.elements,
                answer(id, `Reply ${id}. ${"Stable text. ".repeat(12)}`),
            ];
            break;
        case "stream": {
            const previous = [...chat.elements]
                .reverse()
                .find((entry) => entry.kind === "agent_text" && !entry.complete);
            if (previous?.kind === "agent_text") {
                changesAnchor = painted(h.viewport()).some((row) =>
                    row.text.includes(previous.text),
                );
                chat.elements = chat.elements.map((entry) =>
                    entry === previous
                        ? {
                              ...previous,
                              text: previous.text + "\n\nAnother streaming paragraph. ".repeat(3),
                          }
                        : entry,
                );
            } else chat.elements = [...chat.elements, answer(id, `Streaming ${id}`, false)];
            break;
        }
        case "finish":
            chat.elements = chat.elements.map((entry) =>
                entry.kind === "agent_text" || entry.kind === "thinking"
                    ? { ...entry, complete: true }
                    : entry.kind === "compaction"
                      ? { ...entry, status: "completed" }
                      : entry,
            );
            break;
        case "send": {
            const viewport = h.viewport();
            // Sending near the tail resumes following; sending from history
            // keeps the reading point selected by the preceding gesture.
            if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 80)
                h.anchorSet();
            const count = 1 + pick(3);
            for (let i = 0; i < count; i++)
                chat.extras = [...chat.extras, own(`${id}:${i}`, "sending")];
            chat.draft = "";
            sent = `${id}:${count - 1}`;
            if (chat.state.status === "running") chat.steeringSendId = sent;
            if (chat.standIn && chat.cached) {
                // A reopened view shows its frozen snapshot until the leased
                // chat arrives. The intent is retained while that read is pending.
                expect(
                    chat.extras.some((entry) => entry.kind === "message" && entry.message.id === sent),
                ).toBe(true);
                expect(
                    chat.cached.some((entry) => entry.kind === "message" && entry.message.id === sent),
                ).toBe(false);
                chat.publish();
                h.redraw();
                await frame();
                chat.standIn = false;
            }
            changesAnchor = true;
            break;
        }
        case "delivery":
            // Once the daemon accepts steering it belongs to the ordered
            // transcript, rather than remaining an appended optimistic row.
            queuedAccept(chat, id);
            chat.extras = chat.extras.map((entry) =>
                entry.kind === "message"
                    ? {
                          ...entry,
                          delivery:
                              entry.delivery === "sending"
                                  ? "pending_steering"
                                  : entry.delivery === "pending_steering"
                                    ? "sent"
                                    : entry.delivery === "failed"
                                      ? "sending"
                                      : "sent",
                      }
                    : entry,
            );
            changesAnchor = true;
            break;
        case "sendFailed":
            chat.extras = [...chat.extras, own(id, "failed")];
            break;
        case "retry":
            chat.extras = chat.extras.map((entry) =>
                entry.kind === "message" && entry.delivery === "failed"
                    ? { ...entry, delivery: "sending" }
                    : entry,
            );
            changesAnchor = true;
            break;
        case "tool":
            chat.elements = [
                ...chat.elements,
                {
                    ...b,
                    kind: "tool_call",
                    toolCallId: id,
                    name: "exec_command",
                    arguments: { cmd: "pnpm test" },
                    argumentsComplete: true,
                    status: "running",
                    presentation: { kind: "command", command: "pnpm test" },
                },
            ];
            break;
        case "toolDone":
            chat.elements = chat.elements.map((entry) =>
                entry.kind === "tool_call"
                    ? { ...entry, status: "succeeded", result: "Build output\n".repeat(100) }
                    : entry,
            );
            changesAnchor = true;
            break;
        case "disclose": {
            const controls = [
                ...h.viewport().querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
            ];
            const button = controls.find((node) => node.getBoundingClientRect().height > 0);
            if (button) {
                const viewport = h.viewport();
                const bounds = viewport.getBoundingClientRect();
                const control = button.getBoundingClientRect();
                if (control.top < bounds.top || control.bottom > bounds.bottom) {
                    h.anchorSet();
                    wheel(viewport, (control.top - bounds.top - 20) / h.scale);
                    await settle();
                }
                // Shells arrive expanded; read the header before collapsing it.
                const nextBounds = viewport.getBoundingClientRect();
                const nextControl = button.getBoundingClientRect();
                const center = (nextControl.top + nextControl.bottom) / 2;
                if (button.isConnected && center >= nextBounds.top && center <= nextBounds.bottom) {
                    if (button.matches(".happy-agent-activity__header, .happy-agent-trace-row")) {
                        const controlRow = button.closest<HTMLElement>(
                            ".happy-message-list__virtual-row",
                        );
                        const messageFold = button.closest("[data-body-fold]") !== null;
                        const rowTop = controlRow?.getBoundingClientRect().top ?? 0;
                        if (messageFold && controlRow) {
                            const holdControl =
                                button.getAttribute("aria-expanded") === "true" &&
                                rowTop < nextBounds.top;
                            const pointBefore = holdControl ? nextControl.top : rowTop;
                            button.click();
                            await frame();
                            const pointAfter = () =>
                                (holdControl ? button : controlRow).getBoundingClientRect().top;
                            expect(
                                Math.abs(pointAfter() - pointBefore),
                                "message disclosure moved its row top or end control",
                            ).toBeLessThanOrEqual(1);
                            await settle();
                            expect(Math.abs(pointAfter() - pointBefore)).toBeLessThanOrEqual(1);
                            h.anchorSet(
                                controlRow,
                                undefined,
                                holdControl
                                    ? button.getBoundingClientRect().top -
                                          controlRow.getBoundingClientRect().top
                                    : 0,
                            );
                            readerAction = true;
                            break;
                        }
                        h.anchorSet(
                            controlRow ?? undefined,
                            () =>
                                [
                                    ...h
                                        .viewport()
                                        .querySelectorAll<HTMLButtonElement>(
                                            "button[aria-expanded]",
                                        ),
                                ][controls.indexOf(button)]?.closest<HTMLElement>(
                                    ".happy-message-list__virtual-row",
                                ) ?? undefined,
                            controlRow ? nextControl.top - rowTop : 0,
                        );
                    }
                    button.click();
                }
            }
            readerAction = true;
            break;
        }
        case "reasoning":
            chat.elements = [
                ...chat.elements,
                {
                    ...b,
                    kind: "thinking",
                    text: "Consider the geometry carefully. ".repeat(15),
                    complete: false,
                },
            ];
            break;
        case "shell":
            chat.elements = [
                ...chat.elements,
                {
                    ...b,
                    kind: "tool_call",
                    toolCallId: id,
                    name: "exec_command",
                    arguments: { cmd: "cat build.log" },
                    argumentsComplete: true,
                    status: "succeeded",
                    result: "Build passed\n".repeat(80),
                    presentation: { kind: "command", command: "cat build.log" },
                },
            ];
            break;
        case "labeled":
            chat.extras = [
                ...chat.extras,
                {
                    kind: "agentActivity",
                    id,
                    sequence: id,
                    activity: {
                        kind: "labeled",
                        label: "Read file",
                        subject: "src/Message.tsx",
                        status: "success",
                        mono: true,
                    },
                },
            ];
            break;
        case "agentMessage":
            chat.elements = [
                ...chat.elements,
                {
                    ...b,
                    kind: "inbound_agent_message",
                    messageId: id,
                    agentId: "helper",
                    relation: "other",
                    text: "The helper found a stable anchor.",
                },
            ];
            break;
        case "delegation":
            chat.extras = [
                ...chat.extras,
                {
                    kind: "delegation",
                    id,
                    sequence: id,
                    child: {
                        sessionId: id,
                        parentToolCallId: id,
                        createdAt: b.createdAt,
                        description: "Check scrolling",
                        modelId: "model",
                        status: "running",
                    },
                },
            ];
            break;
        case "notice":
            chat.elements = [
                ...chat.elements,
                { ...b, kind: "system_notice", text: "The session reconnected." },
            ];
            break;
        case "failure":
            chat.elements = [
                ...chat.elements,
                {
                    ...b,
                    kind: "failure",
                    outcome: pick(2) ? "failed" : "retried",
                    reason: "Temporary provider failure",
                    attempt: 2,
                },
            ];
            break;
        case "usageLimit":
            chat.state = { ...chat.state, status: "failed" };
            chat.extras = [
                ...chat.extras,
                {
                    kind: "notice",
                    id,
                    sequence: id,
                    variant: "notice",
                    level: "error",
                    text: "Account usage limit reached.",
                    failure: {
                        kind: "usage_limit",
                        message: "Account usage limit reached.",
                        resetsAt: null,
                        provider: {
                            id: "claude_primary",
                            type: "claude",
                            vendorName: "Claude",
                            label: "Primary",
                        },
                    },
                },
            ];
            break;
        case "switchResume": {
            const failure = [...chat.extras]
                .reverse()
                .find(
                    (entry) =>
                        entry.kind === "notice" &&
                        entry.variant !== "compute" &&
                        entry.failure?.kind === "usage_limit",
                );
            if (failure?.kind === "notice") {
                const button = h
                    .viewport()
                    .querySelector<HTMLButtonElement>(".happy-conversation-switch__main");
                if (
                    button &&
                    button.getBoundingClientRect().top >=
                        h.viewport().getBoundingClientRect().top &&
                    button.getBoundingClientRect().bottom <=
                        h.viewport().getBoundingClientRect().bottom
                )
                    button.click();
                else
                    h.resumeFailure(chat, failure.id, {
                        service: "claude",
                        serviceLabel: "Claude",
                        providerId: "claude_backup",
                        providerLabel: "Backup",
                        modelId: "model",
                        modelName: "Model",
                    });
            }
            break;
        }
        case "resumeStream": {
            const existing = chat.extras.find(
                (entry) => entry.kind === "message" && entry.message.id === `${chat.id}:resumed`,
            );
            if (existing?.kind === "message")
                chat.extras = chat.extras.map((entry) =>
                    entry === existing
                        ? {
                              ...entry,
                              message: {
                                  ...existing.message,
                                  text:
                                      existing.message.text +
                                      "\n\nThe resumed turn continues streaming. ".repeat(8),
                              },
                          }
                        : entry,
                );
            else {
                const entry = own(`${chat.id}:resumed`, "sent");
                if (entry.kind === "message")
                    chat.extras = [
                        ...chat.extras,
                        {
                            ...entry,
                            sentHere: false,
                            message: {
                                ...entry.message,
                                sender: agent,
                                text: "The resumed turn is streaming.",
                                generationStatus: "streaming",
                            },
                        },
                    ];
            }
            break;
        }
        case "resumeFinish":
            chat.extras = chat.extras.map((entry) =>
                entry.kind === "message" && entry.message.id === `${chat.id}:resumed`
                    ? { ...entry, message: { ...entry.message, generationStatus: "complete" } }
                    : entry,
            );
            break;
        case "compaction":
            chat.elements = [
                ...chat.elements,
                {
                    ...b,
                    kind: "compaction",
                    compactionId: id,
                    status: pick(2) ? "running" : "completed",
                    estimatedTokensBefore: 10000,
                    estimatedTokensAfter: 2000,
                },
            ];
            break;
        case "question":
        case "questionInline":
            chat.docked = action === "question";
            chat.extras = [
                ...chat.extras,
                {
                    kind: "request",
                    id,
                    sequence: id,
                    request: {
                        kind: "userInput",
                        requestId: id,
                        status: "pending",
                        questions: [
                            {
                                id: "choice",
                                header: "Layout",
                                question: "Keep this layout?",
                                multiSelect: false,
                                required: true,
                                options: pick(2)
                                    ? [
                                          { label: "Keep", description: "Preserve the layout" },
                                          { label: "Change", description: "Use another layout" },
                                      ]
                                    : [],
                            },
                        ],
                    },
                },
            ];
            changesAnchor = true;
            break;
        case "answer":
            chat.extras = chat.extras.map((entry) =>
                entry.kind === "request" && entry.request.kind === "userInput"
                    ? {
                          ...entry,
                          request: {
                              ...entry.request,
                              status: "answered",
                              answers: { choice: ["Keep"] },
                          },
                      }
                    : entry,
            );
            changesAnchor = true;
            break;
        case "summary":
            chat.extras = [
                ...chat.extras,
                {
                    kind: "summary",
                    id,
                    sequence: id,
                    label: "Reorganized the sidebar",
                    details: ["Moved one task", "Kept its identity"],
                },
            ];
            break;
        case "table":
            chat.elements = [
                ...chat.elements,
                answer(id, "| Item | Result |\n| --- | --- |\n" + "| Build | Passed |\n".repeat(8)),
            ];
            break;
        case "media":
            chat.elements = [
                ...chat.elements,
                answer(
                    id,
                    "![geometry](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)",
                ),
            ];
            break;
        case "mediaDimensions": {
            const message = own(id, "sent");
            if (message.kind === "message")
                chat.extras = [
                    ...chat.extras,
                    {
                        ...message,
                        sentHere: false,
                        message: {
                            ...message.message,
                            sender: agent,
                            text: "Image with declared dimensions",
                            attachments: [
                                {
                                    kind: "inlineImage",
                                    id,
                                    mediaType: "image/png",
                                    data: imageData,
                                    width: 240,
                                    height: 160,
                                },
                            ],
                        },
                    },
                ];
            break;
        }
        case "end": {
            const reason = (["completed", "steering", "error", "abort"] as const)[pick(4)]!;
            const groupId = chat.elements.at(-1)?.groupId ?? id;
            chat.elements = [
                ...chat.elements,
                {
                    ...base(id, groupId),
                    kind: "group_end",
                    outcome:
                        reason === "error" ? "error" : reason === "abort" ? "stopped" : "success",
                    reason,
                    startedAt: b.createdAt - 1000,
                    endedAt: b.createdAt,
                    elapsedMs: 1000,
                    turnStartedAt: b.createdAt - 1000,
                    turnElapsedMs: 1000,
                    modelTurn: true,
                },
            ];
            break;
        }
        case "trace": {
            readerAction = true;
            const button = [...h.viewport().querySelectorAll<HTMLButtonElement>("button")].find(
                (node) => /(?:View|Hide) traces/.test(node.textContent ?? ""),
            );
            if (button) {
                const viewport = h.viewport();
                const bounds = viewport.getBoundingClientRect();
                const control = button.getBoundingClientRect();
                if (control.top < bounds.top || control.bottom > bounds.bottom) {
                    h.anchorSet();
                    wheel(viewport, (control.top - bounds.top - 20) / h.scale);
                    await settle();
                }
                const nextBounds = viewport.getBoundingClientRect();
                const nextControl = button.getBoundingClientRect();
                const center = (nextControl.top + nextControl.bottom) / 2;
                if (!button.isConnected || center < nextBounds.top || center > nextBounds.bottom)
                    break;
                const originalRow = button.closest<HTMLElement>(".happy-message-list__virtual-row");
                const previousRow = originalRow
                    ? viewport.querySelector<HTMLElement>(
                          `.happy-message-list__virtual-row[data-index="${Number(originalRow.dataset.index) - 1}"]`,
                      )
                    : null;
                const wasExpanded = button.getAttribute("aria-expanded") === "true";
                h.anchorSet(
                    originalRow ?? undefined,
                    undefined,
                    originalRow ? nextControl.top - originalRow.getBoundingClientRect().top : 0,
                );
                button.click();
                await settle();
                // A closing trace can fold its entire row away; that action
                // holds the preceding row's lower edge. Other toggles keep
                // their own row, including a replacement collapsed control.
                const current = [
                    ...h.viewport().querySelectorAll<HTMLButtonElement>("button"),
                ].find((node) => /(?:View|Hide) traces/.test(node.textContent ?? ""));
                const nextHeldRow = originalRow?.isConnected
                    ? originalRow
                    : wasExpanded && previousRow?.isConnected
                      ? previousRow
                      : (current?.closest<HTMLElement>(".happy-message-list__virtual-row") ??
                        undefined);
                const pointControl = button.isConnected ? button : current;
                const nextPointOffset = nextHeldRow
                    ? wasExpanded && !originalRow?.isConnected && nextHeldRow === previousRow
                        ? nextHeldRow.getBoundingClientRect().height
                        : pointControl
                          ? pointControl.getBoundingClientRect().top -
                            nextHeldRow.getBoundingClientRect().top
                          : 0
                    : 0;
                h.anchorSet(
                    nextHeldRow,
                    wasExpanded && !originalRow?.isConnected
                        ? undefined
                        : () =>
                              [...h.viewport().querySelectorAll<HTMLButtonElement>("button")]
                                  .find((node) =>
                                      /(?:View|Hide) traces/.test(node.textContent ?? ""),
                                  )
                                  ?.closest<HTMLElement>(".happy-message-list__virtual-row") ??
                              undefined,
                    nextPointOffset,
                );
            }
            readerAction = true;
            break;
        }
        case "traceTurn":
            chat.elements = [
                ...chat.elements,
                {
                    ...base(`${id}:prompt`, id),
                    kind: "user_message",
                    messageId: `${id}:prompt`,
                    authority: "server",
                    identity: null,
                    delivery: "sent",
                    text: "Check the build and report back.",
                },
                {
                    ...base(`${id}:tool`, id),
                    kind: "tool_call",
                    toolCallId: `${id}:tool`,
                    name: "exec_command",
                    arguments: { cmd: "pnpm test" },
                    argumentsComplete: true,
                    status: "succeeded",
                    presentation: { kind: "command", command: "pnpm test" },
                },
                answer(`${id}:answer`, "The build passed. All geometry stayed in place.", true, id),
            ];
            break;
        case "loadStart":
            chat.state = { ...chat.state, loadingMore: true };
            break;
        case "prepend":
            chat.elements = [...history(`${id}:older`, 10 + pick(20)), ...chat.elements];
            chat.state = { ...chat.state, loadingMore: false };
            break;
        case "height": {
            const g = h.geometry;
            await h.resize([420, 550, 700, 820][pick(4)]!, g.width, g.zoom);
            break;
        }
        case "width": {
            const g = h.geometry;
            await h.resize(g.height, [360, 600, 880, 1080][pick(4)]!, g.zoom);
            changesAnchor = true;
            break;
        }
        case "zoom": {
            const g = h.geometry;
            await h.resize(g.height, g.width, [0.5, 0.67, 0.9, 1, 1.5, 2][pick(6)]!);
            changesAnchor = true;
            break;
        }
        case "draft":
            chat.draft = pick(2) ? "Draft line\n".repeat(1 + pick(5)) : "";
            changesAnchor = true;
            break;
        case "wheelUp":
            h.anchorSet();
            wheel(h.viewport(), -(4 + pick(700)));
            readerAction = true;
            break;
        case "wheelDown":
            h.anchorSet();
            wheel(h.viewport(), 4 + pick(700));
            readerAction = true;
            break;
        case "top":
            h.anchorSet();
            wheel(h.viewport(), -h.viewport().scrollHeight);
            readerAction = true;
            break;
        case "jump": {
            h.anchorSet();
            const button = h.view.container.querySelector<HTMLButtonElement>(
                `[data-view-id="${chat.id}"] .happy-message-list__jump:not([hidden]) button`,
            );
            button?.click();
            readerAction = true;
            break;
        }
        case "pageUp":
        case "endKey":
            h.anchorSet();
            h.viewport().tabIndex = 0;
            h.viewport().focus();
            await userEvent.keyboard(action === "pageUp" ? "{PageUp}" : "{End}");
            // Native keyboard scrolling animates even with scroll-behavior:auto.
            // Let that reader gesture finish before testing a later mutation.
            await new Promise<void>((resolve) => setTimeout(resolve, 450));
            readerAction = true;
            break;
        case "switch":
            h.switch((h.active + 1 + pick(2)) % 3);
            switched = true;
            break;
        case "hiddenStream": {
            const hidden = h.chats[(h.active + 1 + pick(2)) % 3]!;
            hidden.elements = [
                ...hidden.elements,
                answer(id, "Content arrived while hidden. ".repeat(12), false),
            ];
            hidden.publish();
            break;
        }
        case "evictCached":
        case "evictCold": {
            const hidden = h.chats[(h.active + 1) % 3]!;
            h.anchorForget((h.active + 1) % 3);
            hidden.cached =
                action === "evictCached"
                    ? [...hidden.store.get().entries, ...hidden.extras]
                    : undefined;
            hidden.standIn = action === "evictCached";
            if (action === "evictCold") hidden.position = undefined;
            hidden.kept = false;
            hidden.generation++;
            h.redraw();
            break;
        }
        case "replay":
            chat.elements = chat.elements.map((entry) => ({ ...entry }));
            break;
        case "hydrate":
            chat.standIn = false;
            break;
    }
    chat.publish();
    h.redraw();
    return { readerAction, changesAnchor, switched, sent };
}

it.each(cases.filter((entry) => !entry.restore || pageZoom))(
    "holds transcript geometry through seeded interactions (seed $seed): $name",
    async ({ seed, short, restore }) => {
        const pick = random(seed);
        const historyCount = [0, 2, 65, 400][pick(4)]!;
        const h = harnessCreate(historyCount, `seed:${seed}`);
        const log: string[] = [];
        let lastBefore: ReturnType<typeof snapshot> | undefined;
        try {
            await h.view.ready();
            await settle();
            const { expanded, count } = fuzzDeck(pick, pageZoom, short);
            const left = new Map<number, ReturnType<typeof snapshot>>();
            for (let step = 0; step < count; step++) {
                const action = expanded[step] ?? ACTIONS[pick(ACTIONS.length)]!;
                const before = snapshot(h);
                lastBefore = before;
                log.push(
                    `${step}: chat=${h.active} ${action} position=${JSON.stringify(before.position)} geometry=${JSON.stringify(h.geometry)}`,
                );
                const started = performance.now();
                const choices: number[] = [];
                if (seed === 305419896 && step === 86 && restore === "cold") {
                    const target = h.chats[0]!;
                    console.info(
                        "RESTORE_VARIANT_BEFORE",
                        JSON.stringify({
                            mode: "cold",
                            position: target.position,
                            remembered: left.get(0)?.readingPoint,
                        }),
                    );
                    target.kept = false;
                    target.cached = undefined;
                    target.standIn = false;
                    target.generation++;
                    h.anchorForget(0);
                    h.redraw();
                    await settle();
                }
                const result = await act(
                    h,
                    action,
                    (limit) => {
                        const value = pick(limit);
                        choices.push(value);
                        return value;
                    },
                    step,
                );
                log[log.length - 1] += ` choices=${JSON.stringify(choices)}`;
                if (result.switched) {
                    const outgoing = Number(log[log.length - 1]!.match(/chat=(\d+)/)![1]);
                    publishedPointCheck(before, h, outgoing);
                    left.set(outgoing, before);
                    // This rAF is the first paint after the flushSync switch commit.
                    await frame();
                    const first = snapshot(h);
                    const previous = left.get(h.active);
                    if (seed === 305419896 && step === 86 && restore) {
                        const restored = first.allRows.find(
                            (candidate) => candidate.key === previous?.anchor?.key,
                        );
                        console.info(
                            "RESTORE_VARIANT_AFTER",
                            JSON.stringify({
                                mode: restore,
                                previousTop: previous?.anchor?.top,
                                restoredTop: restored?.top,
                                previousGlyphTop: previous?.glyph?.top,
                                restoredGlyphTop:
                                    restored && previous
                                        ? restoredGlyphTop(restored.node, previous)
                                        : undefined,
                                livePoint: previous?.readingPoint,
                                published: first.position,
                            }),
                        );
                        expect(restored, "variant lost remembered row").toBeDefined();
                        expect(
                            Math.abs(restored!.top - previous!.anchor!.top),
                            "warm/cold return moved the reading row",
                        ).toBeLessThanOrEqual(1);
                        if (previous?.glyph) {
                            const glyphTop = restoredGlyphTop(restored!.node, previous);
                            expect(glyphTop, "variant lost remembered glyph").toBeDefined();
                            expect(
                                Math.abs(glyphTop! - previous.glyph.top),
                                "warm/cold return moved the glyph",
                            ).toBeLessThanOrEqual(1);
                        }
                    }
                    if (
                        previous &&
                        previous.zoom === first.zoom &&
                        previous.bounds.width === first.bounds.width &&
                        previous.bounds.height === first.bounds.height &&
                        previous.position?.type === "row" &&
                        h.chats[h.active]!.position?.type === "row"
                    ) {
                        const anchor = previous.anchor;
                        if (anchor) {
                            const restored = first.rows.find((row) =>
                                anchor.key !== undefined
                                    ? row.key === anchor.key
                                    : row.text === anchor.text,
                            );
                            expect(restored, "saved anchor missing on first frame").toBeDefined();
                            expect(
                                Math.abs(
                                    restored!.top -
                                        first.bounds.top -
                                        (anchor.top - previous.bounds.top),
                                ),
                                "saved anchor offset lost on first frame",
                            ).toBeLessThanOrEqual(1);
                            if (previous.glyph) {
                                const glyphTop = restoredGlyphTop(restored!.node, previous);
                                expect(
                                    glyphTop,
                                    "saved glyph missing on first frame",
                                ).toBeDefined();
                                expect(
                                    Math.abs(
                                        glyphTop! -
                                            first.bounds.top -
                                            (previous.glyph.top - previous.bounds.top),
                                    ),
                                    "saved glyph offset lost on first frame",
                                ).toBeLessThanOrEqual(1);
                            }
                        }
                    }
                    await settle();
                    stable(first, h);
                } else {
                    await frame();
                    const first = snapshot(
                        h,
                        result.readerAction && ["disclose", "trace", "send"].includes(action),
                    );
                    if (first.bounds.height < before.bounds.height - 1 || action === "zoom")
                        expect(
                            first.held * h.scale,
                            "geometry change retained too much held space on its first frame",
                        ).toBeLessThanOrEqual(first.bounds.height * 0.7 + 1);
                    await settle();
                    if (
                        before.parked &&
                        !result.readerAction &&
                        action !== "width" &&
                        action !== "zoom" &&
                        action !== "send"
                    )
                        stable(before, h);
                }
                geometryCheck(h);
                // A height change can move the old reader row entirely out
                // of view. Only then pick the new visible reading point.
                const currentBounds = h.viewport().getBoundingClientRect();
                const heightChanged = Math.abs(currentBounds.height - before.bounds.height) > 1;
                if (currentBounds.height > before.bounds.height + 1 && !before.floorResting) {
                    if (
                        before.parked &&
                        !result.readerAction &&
                        !result.switched &&
                        action !== "width" &&
                        action !== "zoom" &&
                        action !== "send"
                    )
                        parkedRowsCheck(before, snapshot(h));
                }
                if (heightChanged && before.anchor && !before.floorResting) {
                    const oldAnchorBounds = before.anchor.node.getBoundingClientRect();
                    const heldPoint = oldAnchorBounds.top + (before.readingOffset ?? 0);
                    if (heldPoint < currentBounds.top || heldPoint > currentBounds.bottom)
                        h.anchorSet();
                }
                const after = snapshot(
                    h,
                    result.readerAction && ["disclose", "trace", "send"].includes(action),
                );
                // A clipped disclosure point chooses another row, but keeps
                // its explicit lifetime until the next gesture or switch.
                if (
                    heightChanged &&
                    before.parked &&
                    before.pointKind === "explicit" &&
                    !result.readerAction &&
                    !result.switched &&
                    after.anchor &&
                    after.anchor.node !== before.anchor?.node
                )
                    h.anchorSet(after.anchor.node, undefined, after.readingOffset ?? 0, "explicit");
                if (seed === 305419896 && step === 88 && restore) {
                    const index = h.active;
                    h.switch((index + 1) % 3);
                    await settle();
                    publishedPointCheck(after, h, index);
                    if (restore === "cold") {
                        const target = h.chats[index]!;
                        target.kept = false;
                        target.cached = undefined;
                        target.standIn = false;
                        target.generation++;
                        h.anchorForget(index);
                        h.redraw();
                        await settle();
                    }
                    h.switch(index);
                    await frame();
                    const returned = snapshot(h);
                    const restored = returned.allRows.find(
                        (candidate) => candidate.key === after.anchor?.key,
                    );
                    console.info(
                        "RESTORE_VARIANT_STEP88",
                        JSON.stringify({
                            mode: restore,
                            previousTop: after.anchor?.top,
                            restoredTop: restored?.top,
                            previousGlyphTop: after.glyph?.top,
                            restoredGlyphTop: restored
                                ? restoredGlyphTop(restored.node, after)
                                : undefined,
                            position: returned.position,
                        }),
                    );
                    expect(restored, "step88 return lost its reader row").toBeDefined();
                    expect(
                        Math.abs(restored!.top - after.anchor!.top),
                        "step88 return moved its reader row",
                    ).toBeLessThanOrEqual(1);
                    if (after.glyph) {
                        const glyphTop = restoredGlyphTop(restored!.node, after);
                        expect(glyphTop, "step88 return lost its glyph").toBeDefined();
                        expect(
                            Math.abs(glyphTop! - after.glyph.top),
                            "step88 return moved its glyph",
                        ).toBeLessThanOrEqual(1);
                    }
                    await settle();
                }
                if (heightChanged && after.parked)
                    expect(
                        after.anchor &&
                            after.anchor.bottom > after.bounds.top &&
                            after.anchor.top < after.bounds.bottom,
                        "selected reader row is invisible after a height change",
                    ).toBe(true);
                if (result.readerAction) h.sendHold();
                if (result.sent && after.position?.type === "bottom") h.sendHold(result.sent);
                if (
                    action === "stream" &&
                    before.following &&
                    before.held === 0 &&
                    after.held === 0 &&
                    before.footerHeight === after.footerHeight &&
                    before.bounds.height === after.bounds.height
                ) {
                    expect(
                        Math.abs(after.endGap - before.endGap),
                        "stream changed the follower's footer inset",
                    ).toBeLessThanOrEqual(1);
                }
                if (
                    before.following &&
                    !result.readerAction &&
                    !result.switched &&
                    [
                        "append",
                        "stream",
                        "finish",
                        "notice",
                        "table",
                        "media",
                        "replay",
                        "stop",
                        "dequeue",
                        "dequeuedStream",
                    ].includes(action)
                )
                    followingCheck(h);
                if (result.sent && before.following) {
                    const message = [
                        ...h.viewport().querySelectorAll<HTMLElement>(".happy-message"),
                    ].find((node) => node.textContent?.includes(`Sent ${result.sent}`));
                    expect(message, "new send missing").toBeDefined();
                    const bounds = h.viewport().getBoundingClientRect();
                    const sent = message!.getBoundingClientRect();
                    if (sent.top < bounds.top - 1)
                        console.log(
                            "SEND_INSPECTION",
                            JSON.stringify({
                                message: message!.outerHTML,
                                rect: sent.toJSON(),
                                bounds: bounds.toJSON(),
                                body: message!
                                    .querySelector(".happy-message__body")
                                    ?.getBoundingClientRect()
                                    .toJSON(),
                            }),
                        );
                    if (sent.height <= bounds.height + 1)
                        expect(sent.top, "send clipped above").toBeGreaterThanOrEqual(
                            bounds.top - 1,
                        );
                    expect(sent.bottom, "send end clipped below").toBeLessThanOrEqual(
                        bounds.bottom + 1,
                    );
                    expect(sent.bottom, "send end clipped above").toBeGreaterThan(bounds.top);
                }
                // A generous starvation bound catches hangs without pretending a
                // shared CI browser can reliably enforce a 16ms hardware budget.
                expect(performance.now() - started, "interaction exceeded 2 seconds").toBeLessThan(
                    2000,
                );
            }
            console.info(`CHAT FUZZ passed seed=${seed} steps=${count}`);
            console.info(
                "CHAT_FUZZ_RESULT " +
                    JSON.stringify({
                        browser: server.browser,
                        seed,
                        steps: count,
                        restore,
                        short,
                        depth: testDepth,
                    }),
            );
        } catch (error) {
            const viewport = h.viewport();
            const inspection = {
                beforePosition: lastBefore?.position,
                beforeBounds: lastBefore?.bounds,
                beforeFloorResting: lastBefore?.floorResting,
                beforeZoom: lastBefore?.zoom,
                beforeReadingPoint: lastBefore?.readingPoint,
                beforePointKind: lastBefore?.pointKind,
                beforeReadingOffset: lastBefore?.readingOffset,
                beforeGlyph: lastBefore?.glyph
                    ? {
                          top: lastBefore.glyph.top,
                          currentTop: lastBefore.glyph.range.startContainer.isConnected
                              ? lastBefore.glyph.range.getBoundingClientRect().top
                              : undefined,
                          connected: lastBefore.glyph.range.startContainer.isConnected,
                          text: lastBefore.glyph.text.slice(0, 160),
                          currentText: lastBefore.glyph.range.startContainer.textContent?.slice(
                              0,
                              160,
                          ),
                      }
                    : undefined,
                beforeAnchor: lastBefore?.anchor
                    ? {
                          index: lastBefore.anchor.index,
                          messageKeys: lastBefore.anchorMessageKeys,
                          text: lastBefore.anchor.text,
                          top: lastBefore.anchor.top,
                          bottom: lastBefore.anchor.bottom,
                          connected: lastBefore.anchor.node.isConnected,
                          currentText: lastBefore.anchor.node.textContent,
                      }
                    : undefined,
                beforeRows: lastBefore?.rows.map((row) => ({
                    key: row.key,
                    index: row.index,
                    text: row.text.slice(0, 120),
                    top: row.top,
                    bottom: row.bottom,
                })),
                afterPosition: h.chats[h.active]!.position,
                scrollTop: viewport?.scrollTop,
                scrollHeight: viewport?.scrollHeight,
                bounds: viewport?.getBoundingClientRect().toJSON(),
                heldAnchor: h.heldAnchor?.textContent,
                afterRows: viewport
                    ? [
                          ...viewport.querySelectorAll<HTMLElement>(
                              ".happy-message-list__virtual-row",
                          ),
                      ].map((node) => ({
                          index: Number(node.dataset.index),
                          messageKeys: h.chats[h.active]!.store.get().entries.flatMap((entry) =>
                              entry.kind === "message" &&
                              node.textContent?.includes(entry.message.text.trim())
                                  ? [entry.message.id]
                                  : [],
                          ),
                          text: node.textContent?.slice(0, 120),
                          top: node.getBoundingClientRect().top,
                          bottom: node.getBoundingClientRect().bottom,
                          transform: node.style.transform,
                      }))
                    : [],
            };
            throw new Error(
                `CHAT FUZZ seed=${seed} initialHistory=${historyCount}\n${log.join("\n")}\nINSPECTION ${JSON.stringify(inspection)}\n${error instanceof Error ? error.stack : String(error)}`,
                { cause: error },
            );
        } finally {
            await h.close();
        }
    },
    60_000,
);

it.each([
    ["both-turns-removed", [...Array.from({ length: 10 }, (_, index) => index), 20, 21]],
    ["first-middle-removed", [...Array.from({ length: 14 }, (_, index) => index), 20, 21]],
    ["second-middle-removed", [...Array.from({ length: 10 }, (_, index) => index), 14, 15, 16, 17, 18, 20, 21]],
    ["only-replay", [...Array.from({ length: 18 }, (_, index) => index), 20, 21]],
    ["only-compaction", [...Array.from({ length: 16 }, (_, index) => index), 17, 18, 20, 21]],
])("replays reduced bottom-follow %s", async (_label, removed) => {
    const h = harnessCreate(0, "seed:1000050");
    try {
        await h.view.ready();
        await settle();
        h.switch(2);
        await settle();
        const actions: Action[] = [
            "runOneQueued", "stop", "dequeue", "dequeuedStream", "stop",
            "runEmptyQueue", "stop", "dequeue", "dequeuedStream", "stop",
            "summary", "stream", "stream", "finish", "agentMessage", "notice",
            "compaction", "disclose", "replay", "send", "delivery", "delivery", "append",
        ];
        for (const [index, action] of actions.entries()) {
            if ((removed as number[]).includes(index)) continue;
            const step = index + 21;
            await act(h, action, () => (step === 37 || step === 40 ? 1 : 0), step);
            await frame();
            await settle();
        }
        followingCheck(h);
    } finally {
        await h.close();
    }
}, 60_000);

it("keeps an expanded trace reader fixed when media arrives below it (seed 1021)", async () => {
    const h = harnessCreate(0);
    try {
        await h.view.ready();
        await settle();
        const actions: Action[] = [
            "sendFailed",
            "retry",
            "delivery",
            "delivery",
            "append",
            "failure",
            "traceTurn",
            "end",
            "trace",
        ];
        for (const [step, action] of actions.entries()) {
            await act(h, action, () => 0, step);
            await settle();
        }
        const before = snapshot(h);
        await act(h, "media", () => 0, 9);
        await settle();
        stable(before, h);
    } finally {
        await h.close();
    }
});

it.skipIf(!pageZoom).each([1, 0.67])(
    "models history prepended above sparse delegation at zoom %f (seed 7)",
    async (zoom) => {
        const h = harnessCreate(0, `sparse-prepend:${zoom}`);
        try {
            await h.view.ready();
            await settle();
            await h.resize(650, 880, zoom);
            await settle();
            for (const [step, action] of [
                [19, "delegation"],
                [21, "notice"],
                [24, "pageUp"],
                [25, "prepend"],
            ] as const) {
                await act(h, action, () => 4, step);
                await settle();
            }
            geometryCheck(h);
        } finally {
            await h.close();
        }
    },
);

it.skipIf(!pageZoom).each([0, 65, 400])(
    "models new running text after narrowing the viewport at zoom 2 with %i history (seed 101)",
    async (count) => {
        const h = harnessCreate(count, `narrow-append:${count}`);
        try {
            await h.view.ready();
            await settle();
            await h.resize(550, 360, 2);
            await settle();
            geometryCheck(h);
            await act(h, "runEmptyQueue", () => 0, 106);
            await settle();
            geometryCheck(h);
        } finally {
            await h.close();
        }
    },
);

it.skipIf(!pageZoom).each([false, true])(
    "matches painted geometry when retained long history zooms in (append=%s, seed 4093)",
    async (append) => {
        const h = harnessCreate(400);
        try {
            await h.view.ready();
            await settle();
            await h.resize(650, 820, 2);
            await settle();
            geometryCheck(h);
            if (append) {
                await act(h, "dequeuedStream", () => 0, 0);
                await settle();
                geometryCheck(h);
            }
        } finally {
            await h.close();
        }
    },
);

it.each([0, 65, 400])(
    "matches painted geometry when a multi-screen queued message starts its turn with %i history (seed 32749)",
    async (count) => {
        const h = harnessCreate(count);
        try {
            await h.view.ready();
            await settle();
            for (const [step, action] of (
                ["runLargeQueue", "stop", "dequeue"] as const
            ).entries()) {
                await act(h, action, () => 2, step);
                await settle();
                geometryCheck(h);
            }
        } finally {
            await h.close();
        }
    },
);

it("keeps an expanded shell parked when a service notice arrives before it (seed 1)", async () => {
    const h = harnessCreate();
    try {
        await h.view.ready();
        await settle();
        const pick = random(1);
        // Consume the seed's deck shuffle so parameters exactly match its tape.
        for (let i = ACTIONS.length - 1; i > 0; i--) pick(i + 1);
        pick(21);
        const tape: Action[] = [
            "labeled",
            "shell",
            "loadStart",
            "agentMessage",
            "replay",
            "end",
            "delivery",
            "trace",
            "prepend",
            "failure",
            "height",
            "append",
            "disclose",
            "hiddenStream",
            "toolDone",
        ];
        for (const [step, action] of tape.entries()) {
            await act(h, action, pick, step);
            await settle();
        }
        const before = snapshot(h);
        await act(h, "notice", pick, 15);
        await settle();
        stable(before, h);
    } finally {
        await h.close();
    }
});

it.each(pageZoom ? [0.5, 0.67, 0.9, 1.5, 2] : [1])(
    "matches visible row heights at zoom %f (seed 733)",
    async (zoom) => {
        const h = harnessCreate();
        try {
            await h.view.ready();
            await settle();
            await h.resize(650, 880, zoom);
            await settle();
            geometryCheck(h);
        } finally {
            await h.close();
        }
    },
);

it.each([true, false])(
    "restores an evicted transcript through the real workspace (cached=%s)",
    async (cached) => {
        const h = harnessCreate();
        const owner = workspaceCreate(h.chats, cached);
        try {
            await h.view.ready();
            await owner.open("a");
            await settle();
            wheel(h.viewport(), -240);
            await settle();
            const before = snapshot(h);
            expect(before.position?.type).toBe("row");
            owner.workspace.conversationScrollUpdate("a" as HappyAgentSessionId, before.position!);
            await owner.open("b");
            h.switch(1);
            await settle();
            const chat = h.chats[0]!;
            chat.kept = false;
            chat.generation++;
            h.redraw();
            await settle();
            chat.elements = [
                ...chat.elements,
                answer(
                    "hidden-workspace-stream",
                    "Content arrived while the view was evicted.",
                    false,
                ),
            ];
            chat.publish();
            owner.hold();
            await owner.open("a");
            const waiting = owner.workspace.get().conversation;
            expect(waiting.type).toBe("ready");
            if (waiting.type !== "ready") throw new Error("workspace did not open conversation");
            expect(waiting.value.standIn === true).toBe(cached);
            if (cached) {
                chat.cached = waiting.value.entries;
                chat.standIn = true;
                chat.position = waiting.value.scrollPosition;
                h.switch(0);
                await frame();
                const first = snapshot(h);
                const anchor = before.anchor!;
                const restored = first.rows.find((row) => row.text === anchor.text)!;
                expect(restored, "cached anchor missing in first frame").toBeDefined();
                expect(
                    Math.abs(restored.top - anchor.top),
                    `cached restore before=${JSON.stringify(before.position)} waiting=${JSON.stringify(waiting.value.scrollPosition)} first=${JSON.stringify(first.position)} row=${anchor.text.slice(0, 90)} top=${anchor.top} restored=${restored.top} beforeBounds=${before.bounds.top},${before.bounds.height} afterBounds=${first.bounds.top},${first.bounds.height}`,
                ).toBeLessThanOrEqual(1);
            }
            await owner.arrive();
            const current = owner.workspace.get().conversation;
            expect(current.type === "ready" && current.value.standIn).toBeFalsy();
            if (current.type !== "ready") throw new Error("workspace hydration failed");
            chat.position = current.value.scrollPosition;
            chat.standIn = false;
            h.switch(0);
            await frame();
            const first = snapshot(h);
            await settle();
            stable(first, h);
            geometryCheck(h);
            expect(
                current.value.entries.some(
                    (entry) => entry.kind === "message" && entry.message.text.includes("evicted"),
                ),
            ).toBe(true);
        } finally {
            owner.close();
            await h.close();
        }
    },
);

it("does not read row layout in the native scroll handler", async () => {
    const h = harnessCreate();
    try {
        await h.view.ready();
        await settle();
        wheel(h.viewport(), -240);
        await settle();
        const rects = vi.spyOn(Element.prototype, "getBoundingClientRect");
        const clientRects = vi.spyOn(Element.prototype, "getClientRects");
        const computed = vi.spyOn(window, "getComputedStyle");
        const metrics = [
            vi.spyOn(Element.prototype, "clientHeight", "get"),
            vi.spyOn(Element.prototype, "clientWidth", "get"),
            vi.spyOn(Element.prototype, "scrollHeight", "get"),
            vi.spyOn(Element.prototype, "scrollWidth", "get"),
            vi.spyOn(Element.prototype, "clientTop", "get"),
            vi.spyOn(Element.prototype, "clientLeft", "get"),
            vi.spyOn(HTMLElement.prototype, "offsetHeight", "get"),
            vi.spyOn(HTMLElement.prototype, "offsetWidth", "get"),
            vi.spyOn(HTMLElement.prototype, "offsetTop", "get"),
            vi.spyOn(HTMLElement.prototype, "offsetLeft", "get"),
            vi.spyOn(HTMLElement.prototype, "offsetParent", "get"),
        ];
        try {
            for (let i = 0; i < 40; i++) h.viewport().dispatchEvent(new Event("scroll"));
            expect(rects).not.toHaveBeenCalled();
            expect(clientRects).not.toHaveBeenCalled();
            for (const metric of metrics) {
                expect(
                    metric.mock.contexts.filter(
                        (node) =>
                            node instanceof Element &&
                            node.closest(".happy-message-list__virtual-row") !== null,
                    ),
                    "native scroll read a row layout metric",
                ).toEqual([]);
            }
            expect(
                computed.mock.calls.filter(
                    ([node]) => node.closest(".happy-message-list__virtual-row") !== null,
                ),
                "native scroll read a row's computed style",
            ).toEqual([]);
        } finally {
            rects.mockRestore();
            clientRects.mockRestore();
            computed.mockRestore();
            for (const metric of metrics) metric.mockRestore();
        }
    } finally {
        await h.close();
    }
});

it("keeps content in the viewport after expanding a shell output (seed 101)", async () => {
    const h = harnessCreate();
    try {
        await h.view.ready();
        await settle();
        await act(h, "shell", random(101), 0);
        await settle();
        await act(h, "disclose", random(101), 1);
        await settle();
        geometryCheck(h);
    } finally {
        await h.close();
    }
});

it.each(pageZoom ? [1, 0.67, 2] : [1])(
    "keeps a top reader's row mounted when history prepends at zoom %f (seed 8191)",
    async (zoom) => {
        const h = harnessCreate();
        try {
            await h.view.ready();
            await settle();
            await h.resize(650, 820, zoom);
            await settle();
            wheel(h.viewport(), -h.viewport().scrollHeight);
            await settle();
            const before = snapshot(h);
            await act(h, "prepend", () => 13, 0);
            await settle();
            stable(before, h);
        } finally {
            await h.close();
        }
    },
);

it("keeps a follower at the logical end through compaction completion (seed 7)", async () => {
    const h = harnessCreate();
    try {
        await h.view.ready();
        await settle();
        await act(h, "compaction", () => 1, 0);
        await settle();
        await act(h, "finish", () => 0, 1);
        await settle();
        followingCheck(h);
    } finally {
        await h.close();
    }
});

it.each([360, 820])("matches painted streaming paragraphs at width %i (seed 19)", async (width) => {
    const h = harnessCreate();
    try {
        await h.view.ready();
        await h.resize(650, width, 1);
        await settle();
        await act(h, "stream", () => 0, 0);
        await settle();
        geometryCheck(h);
        await act(h, "stream", () => 0, 1);
        await settle();
        geometryCheck(h);
    } finally {
        await h.close();
    }
});

it("shows the newest of three queued sends when a multiline draft clears (seed 42)", async () => {
    const h = harnessCreate();
    try {
        await h.view.ready();
        await settle();
        let choices = [1, 2];
        await act(h, "draft", () => choices.shift()!, 0);
        await settle();
        await act(h, "stream", () => 0, 1);
        await settle();
        await act(h, "stream", () => 0, 2);
        await settle();
        await act(h, "finish", () => 0, 3);
        await settle();
        const result = await act(h, "send", () => 2, 4);
        await settle();
        const sent = [...h.viewport().querySelectorAll<HTMLElement>(".happy-message")].find(
            (node) => node.textContent?.includes(`Sent ${result.sent}`),
        )!;
        const bounds = h.viewport().getBoundingClientRect();
        expect(sent).toBeDefined();
        expect(sent.getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.bottom + 1);
        expect(sent.getBoundingClientRect().top).toBeGreaterThanOrEqual(bounds.top - 1);
    } finally {
        await h.close();
    }
});

it.skipIf(!pageZoom).each([1, 3])(
    "keeps the newest of %i own sends visible in a 55px viewport (seed 4093)",
    async (count) => {
        const h = harnessCreate(400, "tiny-send");
        try {
            await h.view.ready();
            await settle();
            await h.resize(420, 820, 2);
            await settle();
            await act(h, "jump", () => 0, 53);
            await settle();
            expect(h.chats[h.active]!.position).toEqual({ type: "bottom" });
            const result = await act(h, "send", () => count - 1, 54);
            await settle();
            const sent = [...h.viewport().querySelectorAll<HTMLElement>(".happy-message")].find(
                (node) => node.textContent?.includes(`Sent ${result.sent}`),
            )!;
            const bounds = h.viewport().getBoundingClientRect();
            expect(sent, "newest own send missing").toBeDefined();
            const rect = sent.getBoundingClientRect();
            if (rect.height <= bounds.height + 1)
                expect(rect.top, "send clipped above").toBeGreaterThanOrEqual(bounds.top - 1);
            expect(rect.bottom, "send end clipped below").toBeLessThanOrEqual(bounds.bottom + 1);
            expect(rect.bottom, "send end clipped above").toBeGreaterThan(bounds.top);
        } finally {
            await h.close();
        }
    },
);

it.skipIf(!pageZoom)(
    "keeps a sparse parked reply fixed when a docked question follows zoom out (seed 65521)",
    async () => {
        const h = harnessCreate(0, "sparse-question");
        try {
            await h.view.ready();
            await settle();
            const chat = h.chats[0]!;
            chat.elements = [
                answer("sparse-reply", "Content arrived while hidden. ".repeat(12), false),
            ];
            chat.publish();
            h.redraw();
            await settle();
            await h.resize(420, 880, 1);
            await settle();
            await h.resize(420, 880, 0.5);
            await settle();
            const before = snapshot(h);
            expect(before.position?.type, "zoomed sparse reply is not parked").toBe("row");
            await act(h, "question", () => 0, 42);
            await settle();
            stable(before, h);
        } finally {
            await h.close();
        }
    },
);

function edgeRestoreCheck(before: ReturnType<typeof snapshot>, harness: Harness) {
    const after = snapshot(harness);
    const row = after.allRows.find((candidate) => candidate.key === before.anchor?.key);
    const glyphTop = row ? restoredGlyphTop(row.node, before) : undefined;
    console.info(
        "EDGE_RESTORE",
        JSON.stringify({
            beforeTop: before.anchor?.top,
            afterTop: row?.top,
            beforeGlyph: before.glyph?.top,
            afterGlyph: glyphTop,
            position: after.position,
            nativeTop: harness.viewport().scrollTop,
        }),
    );
    expect(row, "edge return lost its reading row").toBeDefined();
    expect(
        Math.abs(row!.top - before.anchor!.top),
        "edge return moved its reading row",
    ).toBeLessThanOrEqual(1);
    if (before.glyph) {
        expect(glyphTop, "edge return lost its reading glyph").toBeDefined();
        expect(
            Math.abs(glyphTop! - before.glyph.top),
            "edge return moved its reading glyph",
        ).toBeLessThanOrEqual(1);
    }
}

it.each(["warm", "cold"] as const)(
    "keeps the reader when a pending native resize is hidden (%s)",
    async (mode) => {
        const h = harnessCreate(65, `pending-resize:${mode}`);
        let details: unknown;
        try {
            await h.view.ready();
            await settle();
            await h.resize(
                h.geometry.height + 650 - h.viewport().getBoundingClientRect().height,
                820,
                1,
            );
            await settle();
            h.anchorSet();
            wheel(h.viewport(), -65);
            await settle();
            await h.resize(
                h.geometry.height + 800 - h.viewport().getBoundingClientRect().height,
                820,
                1,
            );
            await settle();
            const before = snapshot(h);
            const viewport = h.viewport();
            expect(before.parked, "pending resize fixture did not park the reader").toBe(true);
            const nativeBefore = viewport.scrollTop;
            const nextHeight = 1223.875;
            viewport.style.flex = "none";
            viewport.style.height = `${nextHeight}px`;
            const nativeClamped = viewport.scrollTop;
            // Hide in this task, before ResizeObserver can publish the new box.
            h.switch(1);
            details = {
                mode,
                nativeBefore,
                nativeClamped,
                beforeBounds: before.bounds.toJSON(),
                position: h.chats[0]!.position,
            };
            console.info("EDGE_PENDING_HIDE", JSON.stringify(details));
            viewport.style.removeProperty("flex");
            viewport.style.removeProperty("height");
            expect(
                nativeBefore - nativeClamped,
                "fixture did not clamp the native viewport",
            ).toBeGreaterThan(1);
            publishedPointCheck(before, h, 0);
            await h.resize(h.geometry.height + nextHeight - before.bounds.height, 820, 1);
            await settle();
            if (mode === "cold") {
                h.chats[0]!.kept = false;
                h.chats[0]!.cached = undefined;
                h.chats[0]!.standIn = false;
                h.chats[0]!.generation++;
                h.anchorForget(0);
                h.redraw();
                await settle();
            }
            h.switch(0);
            await frame();
            edgeRestoreCheck(before, h);
        } catch (error) {
            console.error(
                "EDGE_INSPECTION",
                JSON.stringify({
                    name: "pending-resize",
                    details,
                }),
            );
            throw error;
        } finally {
            await h.close();
        }
    },
);

it("publishes a reader scroll followed by a chat switch in the same task", async () => {
    const h = harnessCreate(65, "immediate-scroll-hide");
    let details: unknown;
    try {
        await h.view.ready();
        await settle();
        h.anchorSet();
        wheel(h.viewport(), -250);
        await settle();
        const previousTop = h.viewport().scrollTop;
        // The wheel can mount overscan rows above whose measured heights
        // replace their estimates, so the native offset is no measure of
        // the reader's movement. A row under the reading point is.
        const point = h.viewport().getBoundingClientRect().bottom - 32;
        const pointRow = [
            ...h.viewport().querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ].find((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top <= point && rect.bottom > point;
        })!;
        const pointRowTop = pointRow.getBoundingClientRect().top;
        h.anchorSet();
        wheel(h.viewport(), -73);
        const scrolled = snapshot(h);
        const nativeTop = h.viewport().scrollTop;
        const moved = pointRow.getBoundingClientRect().top - pointRowTop;
        h.switch(1);
        details = {
            previousTop,
            nativeTop,
            moved,
            point: scrolled.readingPoint,
            bounds: scrolled.bounds.toJSON(),
            position: h.chats[0]!.position,
        };
        console.info("EDGE_SCROLL_HIDE", JSON.stringify(details));
        expect(moved, "fixture did not move the reader").toBeGreaterThan(1);
        publishedPointCheck(scrolled, h, 0);
        await settle();
        h.switch(0);
        await frame();
        edgeRestoreCheck(scrolled, h);
    } catch (error) {
        console.error(
            "EDGE_INSPECTION",
            JSON.stringify({
                name: "immediate-scroll-hide",
                details,
            }),
        );
        throw error;
    } finally {
        await h.close();
    }
});
