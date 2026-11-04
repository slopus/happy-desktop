import { useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { cdp, server, userEvent } from "vitest/browser";
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
import { createRenderer, pageViewport } from "./testing";
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
    scopeId: "sparse-prepend",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
it.skipIf(server.browser !== "chromium").each([
    { zoom: 0.67, historyCount: 0, pointSide: "above" },
    { zoom: 0.67, historyCount: 2, pointSide: "above" },
    { zoom: 0.67, historyCount: 5, pointSide: "below" },
    { zoom: 1, historyCount: 0, pointSide: "below" },
    { zoom: 1, historyCount: 5, pointSide: "above" },
] as const)(
    "models cold history prepended above a sparse delegation at page zoom $zoom (seed7; history $historyCount, point $pointSide)",
    async ({ zoom, historyCount, pointSide }) => {
        const initialDpr = devicePixelRatio;
        const view = createRenderer();
        let state: SessionState = {
            activity: { kind: "generating_message", label: "Working", since: 0 },
            status: "running",
            archived: false,
            sessionId: "sparse-prepend",
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
        let elements: ChatElement[] = Array.from({ length: historyCount }, (_, index) => ({
            id: `initial:${index}`,
            groupId: `initial:${index}`,
            runId: `run:initial:${index}`,
            createdAt: 1_790_000_000_000,
            kind: "agent_text" as const,
            messageId: `initial:${index}`,
            complete: true,
            text: `History seed:7:c:${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
        }));
        let publish!: () => void;
        let delegate!: () => void;
        const store = happyAgentChatStoreCreate("sparse-prepend" as HappyAgentSessionId, {
            catalog,
            transcriptConnect: (options) => {
                publish = () => flushSync(() => options.onChange(elements, state, []));
                return {
                    close: () => undefined,
                    loadMore: () =>
                        queueMicrotask(() => {
                            state = { ...state, loadingMore: true };
                            publish();
                        }),
                };
            },
            connectActions: {} as never,
            connectMutationSubscribe: () => () => undefined,
        });
        const release = store.subscribe(() => undefined);
        store.reasoningToggle();
        function Harness() {
            const snapshot = useSyncExternalStore(store.subscribe, store.get);
            const [extras, setExtras] = useState<readonly ConversationEntry[]>([]);
            delegate = () =>
                flushSync(() =>
                    setExtras([
                        {
                            kind: "delegation",
                            id: "delegation",
                            sequence: "delegation",
                            child: {
                                sessionId: "child",
                                parentToolCallId: "delegation",
                                createdAt: 1_790_000_000_000,
                                description: "Check scrolling",
                                modelId: "model",
                                status: "running",
                            },
                        },
                    ]),
                );
            return (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        height: 650 / zoom,
                        width: 880 / zoom,
                    }}
                >
                    <ConversationView
                        conversationId="sparse-prepend"
                        entries={[...snapshot.entries, ...extras]}
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        running
                        motion="calm"
                        onStartReached={store.historyLoadMore}
                        dock={
                            <ConversationDock
                                composer={composer}
                                running
                                onAbort={() => undefined}
                                onComposerSend={() => undefined}
                                onComposerValueChange={() => undefined}
                            />
                        }
                    />
                </div>
            );
        }
        const metrics = (scale: number) =>
            cdp().send("Emulation.setDeviceMetricsOverride", {
                ...pageViewport(),
                deviceScaleFactor: initialDpr * scale,
                mobile: false,
            });
        view.render(Harness, { width: 1550, height: 1550 });
        publish();
        try {
            await view.ready();
            await metrics(zoom);
            await frames();
            delegate();
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 633, cancelable: true }));
            viewport.scrollTop += 633;
            await frames();
            elements = [
                ...elements,
                {
                    id: "notice",
                    groupId: "notice",
                    runId: "run:notice",
                    createdAt: 1_790_000_000_000,
                    kind: "system_notice",
                    text: "The session reconnected.",
                },
            ];
            publish();
            await frames();
            viewport.tabIndex = 0;
            viewport.focus();
            await userEvent.keyboard("{PageUp}");
            await new Promise<void>((resolve) => setTimeout(resolve, 450));
            await frames();
            const held = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ].find((row) => row.textContent?.includes("Check scrolling"))!;
            const heldTop = held.getBoundingClientRect().top;
            const heldText = held.textContent;
            elements = [
                ...Array.from(
                    { length: 14 },
                    (_, index): ChatElement => ({
                        id: `older:${index}`,
                        groupId: `older:${index}`,
                        runId: `run:older:${index}`,
                        createdAt: 1_790_000_000_000,
                        kind: "agent_text",
                        messageId: `older:${index}`,
                        complete: true,
                        text: `History sparse-prepend:0.67:a:step:25:older:${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
                    }),
                ),
                ...elements,
            ];
            state = { ...state, loadingMore: false };
            publish();
            await frames();
            expect(held.isConnected, "parked delegation row remounted").toBe(true);
            expect(held.textContent, "parked row was reused for a different entry").toBe(heldText);
            expect(
                Math.abs(held.getBoundingClientRect().top - heldTop),
                "parked delegation moved on prepend",
            ).toBeLessThanOrEqual(1);
            const bounds = viewport.getBoundingClientRect();
            const rows = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ];
            let visible = 0;
            for (const row of rows) {
                const rect = row.getBoundingClientRect();
                if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
                visible++;
                const next = rows.find(
                    (node) => Number(node.dataset.index) === Number(row.dataset.index) + 1,
                );
                if (!next) continue;
                const delta =
                    Number.parseFloat(next.style.transform.slice("translateY(".length)) -
                    Number.parseFloat(row.style.transform.slice("translateY(".length));
                expect(
                    Math.abs(delta - rect.height),
                    `row${row.dataset.index} model=${delta} paint=${rect.height};scrollTop=${viewport.scrollTop}`,
                ).toBeLessThanOrEqual(1);
            }
            expect(visible).toBeGreaterThan(0);
            // The reader's saved point sits 32px above the viewport's bottom
            // edge. The summary enters below the notice and above the
            // delegation, so the point is on one side of the insertion or the
            // other; each case keeps it on a known side. A point in the live
            // status footer is held by the end of the row above it.
            const point = bounds.top + viewport.clientHeight - 32;
            const pointRow = rows.find((row) => {
                const rect = row.getBoundingClientRect();
                return rect.top <= point && rect.bottom > point;
            });
            expect(pointRow, "no row under the reading point").toBeDefined();
            const pointHeld =
                pointRow === held ||
                Number(pointRow!.dataset.index) === Number(held.dataset.index) + 1;
            expect(
                pointHeld ? "below" : "above",
                `reading point side of the insertion (row ${pointRow!.dataset.index})`,
            ).toBe(pointSide);
            const summaryAnchor = pointHeld ? held : pointRow!;
            const summaryAnchorTop = summaryAnchor.getBoundingClientRect().top;
            // When the point is above the insertion, visible rows above it
            // also stay fixed. A point below it instead carries those rows up.
            const aboveInsertion = rows
                .filter((row) => {
                    const rect = row.getBoundingClientRect();
                    return (
                        Number(row.dataset.index) < Number(held.dataset.index) &&
                        !pointHeld &&
                        rect.bottom > bounds.top &&
                        rect.top < bounds.bottom
                    );
                })
                .map((row) => ({ row, top: row.getBoundingClientRect().top }));
            elements = [
                ...elements,
                {
                    id: "summary",
                    groupId: "summary",
                    runId: "run:summary",
                    createdAt: 1_790_000_000_000,
                    kind: "agent_text",
                    messageId: "summary",
                    complete: true,
                    text: "A compact summary of the work so far.",
                },
            ];
            publish();
            await frames();
            expect(summaryAnchor.isConnected).toBe(true);
            expect(
                Math.abs(summaryAnchor.getBoundingClientRect().top - summaryAnchorTop),
                "parked reading point moved on summary after prepend",
            ).toBeLessThanOrEqual(1);
            for (const { row, top } of aboveInsertion) {
                expect(row.isConnected).toBe(true);
                expect(Math.abs(row.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
            }
        } finally {
            view.destroy();
            release();
            store[Symbol.dispose]();
            await metrics(1);
        }
    },
);
