import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";
import { page, server } from "vitest/browser";
import {
    agentAuthor,
    connectHappyAgent,
    happyAgentChatStoreCreate,
    happyAgentOwnerAuthor,
    type HappyAgentConnection,
    type HappyAgentSessionId,
} from "happy-desktop-state";
import {
    fakeAgentMessage,
    fakeHappyAgentDaemonCreate,
    fakeRun,
    fakeUserMessage,
    type FakeHappyAgentDaemon,
} from "happy-desktop-state/testing";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing/index";
import { regressionFrames } from "./testing/conversationRegressionHarness";

type HistoryRuns = Awaited<ReturnType<FakeHappyAgentDaemon["client"]["getMessages"]>>["runs"];

const shots = (import.meta.env.VITE_TRANSCRIPT_SHOTS as string | undefined) ?? "";

/** `GET /v0/agents/:id/messages` as API.md specifies: whole runs, `limit` counted in messages. */
function serveHistoryPages(
    daemon: FakeHappyAgentDaemon,
    reads: { before?: string; runs: string[] }[],
) {
    const served = daemon.client.getMessages.bind(daemon.client);
    daemon.client.getMessages = (async (
        id: string,
        query: { before?: string; limit?: number } = {},
        ...rest: unknown[]
    ) => {
        const all = await served(id, {}, ...(rest as []));
        const limit = query.limit ?? 50;
        let runs = [...all.runs].sort((a, b) => a.startedAt - b.startedAt);
        if (query.before !== undefined)
            runs = runs.slice(
                0,
                runs.findIndex((run) => run.id === query.before),
            );
        const page: HistoryRuns = [];
        let total = 0;
        let hasMore = false;
        for (const run of [...runs].reverse()) {
            if (total >= limit) {
                hasMore = true;
                break;
            }
            page.unshift(run);
            total += run.messages.length;
        }
        reads.push({
            ...(query.before ? { before: query.before } : {}),
            runs: page.map((run) => run.id),
        });
        return { ...all, runs: page, hasMore };
    }) as FakeHappyAgentDaemon["client"]["getMessages"];
}

/** One turn: the question, `tools` tool calls each in its own message, then the answer. */
function turn(id: string, startedAt: number, tools: number, running = false): HistoryRuns[number] {
    const at = 1_790_000_000_000 + startedAt * 60_000;
    return fakeRun({
        id,
        status: running ? "running" : "completed",
        startedAt: at,
        endedAt: running ? null : at + 50_000,
        messages: [
            fakeUserMessage({
                id: `${id}:ask`,
                createdAt: at,
                content: [{ type: "text", text: `Question ${id}` }],
            }),
            ...Array.from({ length: tools }, (_, index) =>
                fakeAgentMessage({
                    id: `${id}:tool:${index}`,
                    createdAt: at + index + 1,
                    content: [
                        {
                            type: "tool_call",
                            id: `${id}:call:${index}`,
                            name: "Bash",
                            status: running && index === tools - 1 ? "running" : "completed",
                            arguments: { command: `grep -rn step-${index} src` },
                            ...(running && index === tools - 1 ? {} : { result: { output: "ok" } }),
                        },
                    ],
                }),
            ),
            ...(running
                ? []
                : [
                      fakeAgentMessage({
                          id: `${id}:answer`,
                          createdAt: at + tools + 1,
                          content: [{ type: "text", text: `Answer ${id}.` }],
                      }),
                  ]),
        ],
    });
}

function transcriptOpen(options: { finished: number; tools: number; running?: number }) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    const history: HistoryRuns = Array.from({ length: options.finished }, (_, index) =>
        turn(`t${String(index + 1).padStart(2, "0")}`, index, options.tools),
    );
    if (options.running !== undefined)
        history.push(turn("live", options.finished, options.running, true));
    daemon.historySet(agent.id, history);
    const reads: { before?: string; runs: string[] }[] = [];
    serveHistoryPages(daemon, reads);
    const connection: HappyAgentConnection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    const store = happyAgentChatStoreCreate(agent.id as HappyAgentSessionId, {
        catalog: {
            defaultModelId: "model",
            defaultProviderId: "provider",
            models: [],
            providers: [],
        },
        connectActions: connection,
        connectMutationSubscribe: () => () => undefined,
        transcriptConnect: (transcript) => {
            const session = connection.connectSession({
                sessionId: transcript.sessionId,
                onChange: (elements, state) =>
                    transcript.onChange(elements, state, state.answeredUserInputs),
                onError: transcript.onError,
            });
            return {
                close: () => session.close(),
                loadMore: (token) => session.loadMore(token),
                followingSet: (following) => session.followingSet?.(following),
            };
        },
    });
    const release = store.subscribe(() => undefined);
    const view = createRenderer();
    // As the app wires it (AppHappyAgentView): the list asks, the store decides.
    function Transcript() {
        const snapshot = useSyncExternalStore(store.subscribe, store.get);
        return (
            <div style={{ display: "flex", flexDirection: "column", height: 640, width: 760 }}>
                <ConversationView
                    conversationId={agent.id}
                    agentAuthor={agentAuthor}
                    viewerId={happyAgentOwnerAuthor.id}
                    entries={snapshot.entries}
                    expandedTurnIds={snapshot.expandedTurnIds}
                    onTraceToggle={store.turnTraceToggle}
                    motion="calm"
                    running={snapshot.runStatus === "running"}
                    loading={!snapshot.ready}
                    onScrollPositionChange={(position) =>
                        store.historyFollowingSet(position.type !== "row")
                    }
                    onStartReached={() => {
                        if (!snapshot.transcriptComplete) store.historyLoadMore();
                    }}
                />
            </div>
        );
    }
    view.render(Transcript, { width: 800, height: 700 });
    const viewport = () =>
        view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    const questions = () =>
        [...view.container.querySelectorAll("*")]
            .filter((node) => node.childElementCount === 0)
            .map((node) => node.textContent ?? "")
            .filter((text) => /^Question t\d+$/.test(text));
    const loadedTurns = () =>
        store
            .get()
            .entries.flatMap((entry) =>
                entry.kind === "message" && /^Question /.test(entry.message.text)
                    ? [entry.message.text.slice(9)]
                    : [],
            );
    const settle = async () => {
        for (let i = 0; i < 40; i++) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            await regressionFrames();
            if (!store.get().loadingMore && store.get().ready) {
                await new Promise((resolve) => setTimeout(resolve, 60));
                await regressionFrames();
                if (!store.get().loadingMore) return;
            }
        }
    };
    const shot = async (name: string) => {
        if (shots === "") return;
        await page
            .elementLocator(view.container)
            .screenshot({ path: `.transcript-shots/${shots}/${name}.png` });
    };
    const state = (label: string) => {
        const element = viewport();
        const report = {
            label,
            loadedTurns: loadedTurns(),
            renderedQuestions: questions(),
            complete: store.get().transcriptComplete,
            reads,
            scrollHeight: Math.round(element.scrollHeight),
            clientHeight: Math.round(element.clientHeight),
            scrollTop: Math.round(element.scrollTop),
        };
        if (shots !== "") console.log(`TRANSCRIPT ${JSON.stringify(report)}`);
        return report;
    };
    return {
        daemon,
        agentId: agent.id,
        store,
        viewport,
        settle,
        shot,
        state,
        reads,
        close() {
            view.destroy();
            release();
            store[Symbol.dispose]();
            connection.close();
        },
    };
}

async function scrollToTop(t: ReturnType<typeof transcriptOpen>) {
    for (let i = 0; i < 30; i++) {
        const element = t.viewport();
        element.dispatchEvent(new WheelEvent("wheel", { deltaY: -4000, cancelable: true }));
        element.scrollTop = 0;
        await t.settle();
        if (t.store.get().transcriptComplete && t.viewport().scrollTop === 0) return;
    }
}

it.skipIf(server.browser !== "chromium")(
    "a working session keeps the turns its reader scrolled back through when it is read again",
    async () => {
        const t = transcriptOpen({ finished: 8, tools: 60, running: 150 });
        try {
            await t.settle();
            t.state("opened");
            await t.shot("a-opened");
            await scrollToTop(t);
            const scrolled = t.state("scrolled to the top");
            await t.shot("b-scrolled-back");
            expect(scrolled.loadedTurns).toEqual([
                "t01",
                "t02",
                "t03",
                "t04",
                "t05",
                "t06",
                "t07",
                "t08",
                "live",
            ]);
            expect(scrolled.complete).toBe(true);
            const firstVisible = scrolled.renderedQuestions[0];

            // A streamed delta of the running turn is lost; the client reads the session again.
            t.daemon.eventEmit("message.delta", {
                agentId: t.agentId,
                runId: "live",
                messageId: "live:tool:0",
                blockIndex: 5,
                offset: 400,
                append: "lost",
            });
            const reads = t.reads.length;
            for (let i = 0; i < 40 && t.reads.length === reads; i++)
                await new Promise((resolve) => setTimeout(resolve, 25));
            await t.settle();
            const after = t.state("after the session was read again");
            await t.shot("c-after-reread");
            expect(t.reads.length).toBeGreaterThan(reads);
            expect(after.loadedTurns).toEqual(scrolled.loadedTurns);
            expect(after.complete).toBe(true);
            expect(after.renderedQuestions[0]).toBe(firstVisible);
            expect(after.scrollTop).toBe(scrolled.scrollTop);
        } finally {
            t.close();
        }
    },
);

it.skipIf(server.browser !== "chromium")(
    "collapsed turns of a hundred tool calls page back until the transcript fills its pane",
    async () => {
        // Idle: every turn is finished, so each folds its hundred tool calls away and a whole
        // page of 100+ messages is a question and an answer on screen.
        const t = transcriptOpen({ finished: 12, tools: 100 });
        try {
            await t.settle();
            const opened = t.state("opened idle");
            await t.shot("d-collapsed-opened");
            // Either the pane is full, or there is nothing older left to show.
            expect(opened.complete || opened.scrollHeight > opened.clientHeight + 64).toBe(true);
            await scrollToTop(t);
            const top = t.state("collapsed, scrolled to the top");
            await t.shot("e-collapsed-top");
            expect(top.loadedTurns).toEqual(
                Array.from({ length: 12 }, (_, i) => `t${String(i + 1).padStart(2, "0")}`),
            );
            expect(top.complete).toBe(true);
        } finally {
            t.close();
        }
    },
);
