import { useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    happyAgentChatStoreCreate,
    type ChatElement,
    type ComposerSnapshot,
    type ConversationEntry,
    type HappyAgentSessionId,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { ConversationDock } from "./ConversationDock";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}
const catalog = {
    defaultModelId: "model",
    defaultProviderId: "provider",
    models: [],
    providers: [],
};
const composer: ComposerSnapshot = {
    scopeId: "shell-queue",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const base = (id: string, groupId = id) => ({
    id,
    groupId,
    runId: `run:${groupId}`,
    createdAt: 1_790_000_000_000,
});
function own(
    id: string,
    delivery: "sending" | "pending_steering" | "sent",
    text = `Sent ${id}`,
): ConversationEntry {
    return {
        kind: "message",
        source: "local",
        delivery,
        sentHere: delivery !== "pending_steering",
        message: {
            id,
            chatId: "shell-queue",
            sequence: id,
            changePts: id,
            sender: happyAgentOwnerAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}

it("retains a parked shell node when queued messages are accepted atomically (seed 2027)", async () => {
    const view = createRenderer();
    let state: SessionState = {
        activity: { kind: "generating_message", label: "Working", since: 0 },
        status: "running",
        archived: false,
        sessionId: "shell-queue",
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
    let elements: ChatElement[] = Array.from({ length: 65 }, (_, i) => ({
        ...base(`history:${i}`),
        kind: "agent_text",
        messageId: `history:${i}`,
        complete: true,
        text: `History queue-shell:a:${i}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (i % 5))}`,
    }));
    let extras: ConversationEntry[] = [];
    let publish!: () => void;
    let redraw!: () => void;
    const store = happyAgentChatStoreCreate("shell-queue" as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            publish = () => options.onChange(elements, state, []);
            return { close: () => undefined, loadMore: () => undefined };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });
    const release = store.subscribe(() => undefined);
    store.reasoningToggle();
    function stop(groupId: string) {
        elements = [
            ...elements.map((entry) =>
                entry.kind === "agent_text" ? { ...entry, complete: true } : entry,
            ),
            {
                ...base(`stop:${elements.length}`, groupId),
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
        state = { ...state, status: "idle" };
        publish();
        redraw();
    }
    function Harness() {
        const snapshot = useSyncExternalStore(store.subscribe, store.get);
        const [, setVersion] = useState(0);
        redraw = () => flushSync(() => setVersion((value) => value + 1));
        return (
            <div style={{ display: "flex", flexDirection: "column", height: 650, width: 820 }}>
                <ConversationView
                    conversationId="shell-queue"
                    entries={[...snapshot.entries, ...extras]}
                    agentAuthor={agentAuthor}
                    viewerId={happyAgentOwnerAuthor.id}
                    motion="calm"
                    running={state.status === "running"}
                    expandedTurnIds={snapshot.expandedTurnIds}
                    onTraceToggle={store.turnTraceToggle}
                    dock={
                        <ConversationDock
                            composer={composer}
                            running={state.status === "running"}
                            onAbort={() => stop("running")}
                            onComposerSend={() => undefined}
                            onComposerValueChange={() => undefined}
                        />
                    }
                />
            </div>
        );
    }
    view.render(Harness, { width: 1550, height: 1550 });
    publish();
    try {
        await view.ready();
        await frames();
        extras = [
            {
                kind: "agentActivity",
                id: "shell",
                sequence: "shell",
                activity: {
                    kind: "shell",
                    command: "cat build.log",
                    output: "Build passed\n".repeat(80),
                    exitCode: 0,
                    running: false,
                    timedOut: false,
                },
            },
        ];
        publish();
        redraw();
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const control = viewport.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
        const bounds = viewport.getBoundingClientRect();
        const rect = control.getBoundingClientRect();
        viewport.dispatchEvent(
            new WheelEvent("wheel", { deltaY: rect.top - bounds.top - 20, cancelable: true }),
        );
        viewport.scrollTop += rect.top - bounds.top - 20;
        await frames();
        control.click();
        await frames();
        extras = [...extras, ...Array.from({ length: 3 }, (_, i) => own(`send:${i}`, "sending"))];
        publish();
        redraw();
        await frames();
        for (const delivery of ["pending_steering", "sent"] as const) {
            extras = extras.map((entry) =>
                entry.kind === "message" ? { ...entry, delivery } : entry,
            );
            publish();
            redraw();
            await frames();
        }
        // Folding the output shortened the transcript's end, which came down
        // to the lower edge with nothing blank held under it. Park the reader
        // above that end with the shell row still in view.
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -60, cancelable: true }));
        viewport.scrollTop -= 60;
        await frames();
        elements = [
            ...elements,
            {
                ...base("end"),
                kind: "group_end",
                outcome: "success",
                reason: "steering",
                startedAt: 1_790_000_000_000,
                endedAt: 1_790_000_001_000,
                elapsedMs: 1000,
                turnStartedAt: 1_790_000_000_000,
                turnElapsedMs: 1000,
                modelTurn: true,
            },
        ];
        publish();
        redraw();
        await frames();
        elements = [
            ...elements,
            {
                ...base("reply", "running"),
                kind: "agent_text",
                messageId: "reply",
                complete: false,
                text: "The current turn is streaming. ".repeat(8),
            },
        ];
        const queued = Array.from({ length: 4 }, (_, i) =>
            own(
                `queued:${i}`,
                "pending_steering",
                i === 3 ? "A multi-screen queued message.\n".repeat(160) : `Queued follow-up ${i}`,
            ),
        );
        extras = [...extras, ...queued];
        state = {
            ...state,
            status: "running",
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
        publish();
        redraw();
        await frames();
        view.container
            .querySelector<HTMLButtonElement>('button[aria-label="Stop the agent"]')!
            .click();
        await frames();
        const held = [
            ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ].find((node) => node.textContent?.includes("cat build.log"))!;
        expect(held).toBeDefined();
        const top = held.getBoundingClientRect().top;
        expect(held.getBoundingClientRect().bottom).toBeGreaterThan(
            viewport.getBoundingClientRect().top,
        );
        expect(top).toBeLessThan(viewport.getBoundingClientRect().bottom);
        elements = [
            ...elements,
            ...queued.flatMap((entry): ChatElement[] =>
                entry.kind === "message"
                    ? [
                          {
                              ...base(entry.message.id, "dequeued"),
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
        extras = extras.filter((entry) => !queued.includes(entry));
        state = { ...state, status: "running", pendingSteeringMessages: [] };
        publish();
        redraw();
        await frames();
        expect(held.isConnected, "parked shell DOM was removed during queue acceptance").toBe(true);
        expect(Math.abs(held.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    } finally {
        view.destroy();
        release();
        store[Symbol.dispose]();
    }
});
