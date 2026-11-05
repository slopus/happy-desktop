import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
    happyAgentChatStoreCreate,
    type ChatElement,
    type ComposerSnapshot,
    type ConversationAuthor,
    type HappyAgentSessionId,
    type SessionState,
} from "happy-desktop-state";
import { commands } from "vitest/browser";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";

declare module "vitest/browser" {
    interface BrowserCommands {
        scrollReproWheel: (deltaY: number, count: number) => Promise<void>;
    }
}
const author: ConversationAuthor = {
    id: "fold-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "parked-fold",
    submission: { status: "idle" },
    text: "",
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
    sessionId: "parked-fold",
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
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const base = (id: string, groupId: string) => ({
    id,
    groupId,
    runId: `run-${groupId}`,
    createdAt: 1790000000000,
});
function prompt(group: string): ChatElement {
    return {
        ...base(`${group}-prompt`, group),
        kind: "user_message",
        messageId: `${group}-prompt`,
        authority: "server",
        identity: null,
        delivery: "sent",
        text: `PROMPT ${group}`,
    };
}
function tool(group: string, index: number): ChatElement {
    return {
        ...base(`${group}-tool-${index}`, group),
        kind: "tool_call",
        toolCallId: `${group}-call-${index}`,
        name: "exec_command",
        arguments: { cmd: `echo ${group}-step-${index}` },
        argumentsComplete: true,
        status: "succeeded",
        presentation: { kind: "command", command: `echo ${group}-step-${index}` },
    } as ChatElement;
}
function answer(group: string, complete: boolean): ChatElement {
    return {
        ...base(`${group}-answer`, group),
        kind: "agent_text",
        messageId: `${group}-answer`,
        text: `ANSWER ${group}. ${"A stable summary follows. ".repeat(8)}`,
        complete,
    };
}
function end(group: string): ChatElement {
    return {
        ...base(`${group}-end`, group),
        kind: "group_end",
        outcome: "success",
        reason: "completed",
        startedAt: 1790000000000,
        endedAt: 1790000005000,
        elapsedMs: 5000,
        turnStartedAt: 1790000000000,
        turnElapsedMs: 5000,
        modelTurn: true,
    };
}
it("records parked rows as an on-screen live turn finishes", async () => {
    let publish!: (elements: readonly ChatElement[], running: boolean) => void;
    const store = happyAgentChatStoreCreate("parked-fold" as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            publish = (elements, running) => options.onChange(elements, session(running), []);
            return { close: () => {}, loadMore: () => {} };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => {},
    });
    const history = Array.from({ length: 8 }, (_, i) => [
        prompt(`history-${i}`),
        answer(`history-${i}`, true),
        end(`history-${i}`),
    ]).flat();
    const live = [
        prompt("live"),
        ...Array.from({ length: 6 }, (_, i) => tool("live", i)),
        answer("live", false),
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    function Harness() {
        const snapshot = useSyncExternalStore(store.subscribe, store.get);
        return (
            <div className="happy-theme-dark" style={{ width: 700, height: 600 }}>
                <ConversationView
                    agentAuthor={author}
                    conversationId="parked-fold"
                    entries={snapshot.entries}
                    expandedTurnIds={snapshot.expandedTurnIds}
                    motion="calm"
                    onTracesSeen={store.turnTracesSeen}
                    onTraceToggle={store.turnTraceToggle}
                    running={snapshot.runStatus === "running"}
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerSend={() => {}}
                            onComposerValueChange={() => {}}
                            running={snapshot.runStatus === "running"}
                        />
                    }
                />
            </div>
        );
    }
    let animation = 0;
    try {
        flushSync(() => root.render(<Harness />));
        await delay(100);
        flushSync(() => publish([...history, ...live], true));
        await document.fonts.ready;
        await delay(200);
        const viewport = container.querySelector<HTMLElement>("[data-scrollbar-viewport]");
        if (!viewport) throw new Error("Missing transcript viewport");
        viewport.scrollTop = viewport.scrollHeight;
        await delay(200);
        await commands.scrollReproWheel(-100 * devicePixelRatio, 2);
        await delay(450);
        const selector = ".happy-message-list__virtual-row[data-index]";
        const findTool = () =>
            [...viewport.querySelectorAll<HTMLElement>(selector)].find((row) =>
                row.textContent?.includes("live-step-"),
            );
        const visibleTool = findTool();
        expect(visibleTool, "live work must be mounted while finishing").toBeDefined();
        const toolBounds = visibleTool!.getBoundingClientRect();
        const viewportBounds = viewport.getBoundingClientRect();
        expect(toolBounds.bottom).toBeGreaterThan(viewportBounds.top);
        expect(toolBounds.top).toBeLessThan(viewportBounds.bottom);
        const samples: object[] = [];
        const capture = () => {
            const view = viewport.getBoundingClientRect();
            const rows = [...viewport.querySelectorAll<HTMLElement>(selector)]
                .map((row) => {
                    const box = row.getBoundingClientRect();
                    const label =
                        row.textContent?.match(
                            /live-step-\d+|PROMPT live|ANSWER live|history-\d+/,
                        )?.[0] ??
                        row.dataset.itemId ??
                        "row";
                    return {
                        key: `${label}:${row.dataset.index}`,
                        text: row.textContent?.slice(0, 100),
                        top: box.top - view.top,
                        bottom: box.bottom - view.top,
                    };
                })
                .filter((row) => row.bottom > 0 && row.top < view.height);
            const points = [view.height / 4, view.height / 2, view.height - 32].map((y) => ({
                y,
                row: rows.find((row) => row.top <= y && row.bottom > y) ?? null,
            }));
            samples.push({
                time: performance.now(),
                scrollTop: viewport.scrollTop,
                scrollHeight: viewport.scrollHeight,
                viewportHeight: viewport.clientHeight,
                rows,
                points,
                viewTraces: viewport.textContent?.includes("View traces") ?? false,
                hideTraces: viewport.textContent?.includes("Hide traces") ?? false,
            });
            animation = requestAnimationFrame(capture);
        };
        animation = requestAnimationFrame(capture);
        await delay(100);
        flushSync(() =>
            publish([...history, ...live.slice(0, -1), answer("live", true), end("live")], false),
        );
        await delay(500);
        console.log("PARKED_FOLD_TRACE " + JSON.stringify({ dpr: devicePixelRatio, samples }));
        expect(samples.length).toBeGreaterThan(2);
    } finally {
        cancelAnimationFrame(animation);
        root.unmount();
        container.remove();
    }
}, 90_000);
