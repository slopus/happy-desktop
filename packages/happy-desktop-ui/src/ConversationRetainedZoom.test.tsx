import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { cdp, server } from "vitest/browser";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    happyAgentChatStoreCreate,
    type ChatElement,
    type ComposerSnapshot,
    type HappyAgentSessionId,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { ConversationDock } from "./ConversationDock";
import { RetainedViews } from "./RetainedViews";
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
    scopeId: "zoom",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const state: SessionState = {
    activity: { kind: "generating_message", label: "Working", since: 0 },
    status: "running",
    archived: false,
    sessionId: "a",
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

for (const mode of ["zoom", "panel"] as const) {
    // Firefox CSS zoom changes native scrollTop: happy-file://agents/ebzk9bggqj0qt6wts9jv0tgh/.context/fuzz-plainzoom24.log
    it.skipIf(server.browser === "firefox" && mode === "zoom")(
        `updates retained long-history geometry and follows in the first frames after ${mode} (seed 4093)`,
        async () => {
            const zoom = mode === "zoom" ? 2 : 1;
            const initialDpr = devicePixelRatio;
            const view = createRenderer();
            let geometryObserver: ResizeObserver | undefined;
            const chats = ["a", "b", "c"].map((id) => {
                let publish!: () => void;
                const elements: ChatElement[] = Array.from({ length: 400 }, (_, index) => ({
                    id: `${id}:${index}`,
                    groupId: `${id}:${index}`,
                    runId: `run:${id}:${index}`,
                    createdAt: 1_790_000_000_000,
                    kind: "agent_text",
                    messageId: `${id}:${index}`,
                    complete: true,
                    text: `History ${id}:${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
                }));
                const store = happyAgentChatStoreCreate(id as HappyAgentSessionId, {
                    catalog,
                    transcriptConnect: (options) => {
                        publish = () =>
                            flushSync(() =>
                                options.onChange(elements, { ...state, sessionId: id }, []),
                            );
                        return { close: () => undefined, loadMore: () => undefined };
                    },
                    connectActions: {} as never,
                    connectMutationSubscribe: () => () => undefined,
                });
                const release = store.subscribe(() => undefined);
                store.reasoningToggle();
                return { id, store, release, publish };
            });
            const listeners = new Set<() => void>();
            let geometry = { width: 820, height: 650, zoom: 1, chats: [...chats] };
            function Chat({ chat }: { chat: (typeof chats)[number] }) {
                const snapshot = useSyncExternalStore(chat.store.subscribe, chat.store.get);
                return (
                    <ConversationView
                        conversationId={chat.id}
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        motion="calm"
                        running
                        entries={[...snapshot.entries]}
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerSend={() => undefined}
                                onComposerValueChange={() => undefined}
                            />
                        }
                    />
                );
            }
            function Harness() {
                const current = useSyncExternalStore(
                    (notify) => {
                        listeners.add(notify);
                        return () => {
                            listeners.delete(notify);
                        };
                    },
                    () => geometry,
                );
                return (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            width:
                                server.browser === "chromium"
                                    ? current.width / current.zoom
                                    : current.width,
                            height:
                                server.browser === "chromium"
                                    ? current.height / current.zoom
                                    : current.height,
                            zoom: server.browser === "chromium" ? 1 : current.zoom,
                        }}
                    >
                        <RetainedViews
                            activeId="a"
                            views={current.chats.map((chat) => ({
                                id: chat.id,
                                content: <Chat chat={chat} />,
                            }))}
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
            for (const chat of chats) chat.publish();
            try {
                await view.ready();
                await frames();
                const viewport = view.container.querySelector<HTMLElement>(
                    '[data-view-id="a"] .happy-message-list__viewport',
                )!;
                // The content box is the scrollport less its native bar's lane.
                const lane = viewport.offsetWidth - viewport.clientWidth;
                const geometryObserved = new Promise<void>((resolve) => {
                    geometryObserver = new ResizeObserver((entries) => {
                        if (Math.abs(entries[0]!.contentRect.width + lane - 410) < 1) resolve();
                    });
                    geometryObserver.observe(viewport);
                });
                if (server.browser === "chromium") await metrics(zoom);
                flushSync(() => {
                    geometry = {
                        ...geometry,
                        width: mode === "panel" ? 410 : 820,
                        zoom,
                        chats: chats.map((chat) => ({ ...chat })),
                    };
                    for (const notify of listeners) notify();
                });
                // ResizeObserver's delivery is before paint; an rAF callback runs
                // before that delivery and can still see the prior native range.
                await geometryObserved;
                await frame();
                const bounds = viewport.getBoundingClientRect();
                for (let frame = 0; frame < 4; frame += 1) {
                    const latest = [
                        ...viewport.querySelectorAll<HTMLElement>(".happy-message"),
                    ].find((node) => node.textContent?.includes("History a:399."));
                    expect(latest, `latest message missing in frame ${frame}`).toBeDefined();
                    expect(
                        latest!.getBoundingClientRect().bottom,
                        `latest message below viewport in frame ${frame}`,
                    ).toBeLessThanOrEqual(viewport.getBoundingClientRect().bottom + 1);
                    expect(latest!.getBoundingClientRect().bottom).toBeGreaterThan(
                        viewport.getBoundingClientRect().top,
                    );
                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                }
                const rows = [
                    ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
                ];
                expect(
                    rows.some((row) => {
                        const rect = row.getBoundingClientRect();
                        return (
                            rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom
                        );
                    }),
                    "at least one transcript row is painted",
                ).toBe(true);
                for (const row of rows) {
                    const rect = row.getBoundingClientRect();
                    if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
                    const next = rows.find(
                        (node) => Number(node.dataset.index) === Number(row.dataset.index) + 1,
                    );
                    if (!next) continue;
                    const delta =
                        Number.parseFloat(next.style.transform.slice("translateY(".length)) -
                        Number.parseFloat(row.style.transform.slice("translateY(".length));
                    expect(
                        Math.abs(delta * (server.browser === "chromium" ? 1 : zoom) - rect.height),
                        `row${row.dataset.index} model=${delta} paint=${rect.height} width=${rect.width}`,
                    ).toBeLessThanOrEqual(1);
                }
            } finally {
                geometryObserver?.disconnect();
                view.destroy();
                for (const chat of chats) {
                    chat.release();
                    chat.store[Symbol.dispose]();
                }
                if (server.browser === "chromium") await metrics(1);
            }
        },
    );
}
