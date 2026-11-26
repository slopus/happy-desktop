import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "./connectHappyAgent.js";
import type { ChatElement, HappyAgentConnection, SessionState } from "./types.js";
import {
    fakeAgentMessage,
    fakeHappyAgentDaemonCreate,
    fakeRun,
    fakeUserMessage,
} from "../testing/fakeHappyAgentDaemon.js";

const open: HappyAgentConnection[] = [];
afterEach(() => {
    for (const connection of open.splice(0)) connection.close();
});

type Runs = Awaited<
    ReturnType<ReturnType<typeof fakeHappyAgentDaemonCreate>["client"]["getMessages"]>
>["runs"];

/* `GET /v0/agents/:id/messages` as API.md specifies it, and as both the local
   daemon and hc-api implement it: newest runs first, whole runs only, `limit`
   counted in messages and only stopping the next run from starting. */
function pageOf(all: Runs, query: { before?: string; limit?: number }) {
    const limit = query.limit ?? 50;
    let runs = [...all].sort((a, b) => a.startedAt - b.startedAt);
    if (query.before !== undefined)
        runs = runs.slice(
            0,
            runs.findIndex((r) => r.id === query.before),
        );
    const page: Runs = [];
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
    return { runs: page, hasMore };
}

for (const trigger of ["journal gap", "dropped streaming delta"] as const)
    it(`loses the older pages a reader loaded when the open session is read again (${trigger})`, async () => {
        const daemon = fakeHappyAgentDaemonCreate();
        const project = daemon.projectSeed({ id: "project-a" });
        const agent = daemon.agentSeed(project.id, { id: "agent-a" });

        // Ten finished turns of 21 messages, then the turn on screen: still running,
        // 150 messages (a long agent turn full of tool calls).
        const runs: Runs = [];
        for (let turn = 0; turn < 10; turn += 1) {
            runs.push(
                fakeRun({
                    id: `r${turn}`,
                    status: "completed",
                    startedAt: turn + 1,
                    endedAt: turn + 1,
                    messages: [
                        fakeUserMessage({
                            id: `u${turn}`,
                            content: [{ type: "text", text: `ask ${turn}` }],
                        }),
                        ...Array.from({ length: 20 }, (_, i) =>
                            fakeAgentMessage({
                                id: `a${turn}-${i}`,
                                content: [{ type: "text", text: `turn ${turn} step ${i}` }],
                            }),
                        ),
                    ],
                }),
            );
        }
        runs.push(
            fakeRun({
                id: "live",
                status: "running",
                startedAt: 100,
                messages: Array.from({ length: 150 }, (_, i) =>
                    fakeAgentMessage({
                        id: `live-${i}`,
                        content: [{ type: "text", text: `live ${i}` }],
                    }),
                ),
            }),
        );
        daemon.historySet(agent.id, runs);
        const served = daemon.client.getMessages.bind(daemon.client);
        daemon.client.getMessages = (async (
            id: string,
            query: { before?: string; limit?: number } = {},
            ...rest: unknown[]
        ) => {
            const all = await served(id, {}, ...(rest as []));
            const { runs: page, hasMore } = pageOf(all.runs, query);
            return { ...all, runs: page, hasMore };
        }) as typeof daemon.client.getMessages;

        const connection = connectHappyAgent({
            endpoint: "http://happy-agent.test/",
            token: "token",
            client: daemon.client,
            wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
            now: () => 1_000,
        });
        open.push(connection);

        let elements: readonly ChatElement[] = [];
        let session: SessionState | undefined;
        const reader = connection.connectSession({
            sessionId: agent.id,
            onChange(next, state) {
                elements = next;
                session = state;
            },
        });
        reader.followingSet?.(true);
        const asks = () =>
            elements
                .filter((e) => e.kind === "user_message")
                .map((e) => (e as { text: string }).text);

        // Opening: the first page is the running turn alone.
        await vi.waitFor(() => expect(session?.historyLoading).not.toBe(true));
        await vi.waitFor(() => expect(session?.loadMoreToken).toBe("live"));
        expect(asks()).toEqual([]);

        // The reader scrolls up: the page before it lands.
        reader.loadMore("live");
        await vi.waitFor(() => expect(asks().length).toBeGreaterThan(0));
        await vi.waitFor(() => expect(session?.loadingMore).not.toBe(true));
        const before = asks();
        expect(before).toEqual(["ask 5", "ask 6", "ask 7", "ask 8", "ask 9"]);

        // The journal reports a gap (a dropped stream the server could not resume),
        // so the open session is read again.
        const reads = daemon.callCount("getMessages");
        if (trigger === "journal gap") {
            daemon.cursorNext();
            daemon.gapOnNextStream();
            daemon.streamDropAll();
        } else {
            // One delta of the running turn never arrived (the cloud's live buffer is
            // best effort); the next one starts past the text the client holds.
            daemon.eventEmit("message.delta", {
                agentId: agent.id,
                runId: "live",
                messageId: "live-149",
                blockIndex: 0,
                offset: 40,
                append: " more",
            });
        }
        await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBeGreaterThan(reads));
        await new Promise((resolve) => setTimeout(resolve, 50));

        // What a reader expects: the turns they had scrolled back to are still there.
        expect(asks()).toEqual(before);
    });

it("keeps nothing older when the page read again no longer reaches the turns held (a hole)", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    const turnOf = (turn: number, size: number) =>
        fakeRun({
            id: `r${turn}`,
            status: "completed",
            startedAt: turn + 1,
            endedAt: turn + 1,
            messages: [
                fakeUserMessage({
                    id: `u${turn}`,
                    content: [{ type: "text", text: `ask ${turn}` }],
                }),
                ...Array.from({ length: size }, (_, i) =>
                    fakeAgentMessage({
                        id: `a${turn}-${i}`,
                        content: [{ type: "text", text: `t${turn} ${i}` }],
                    }),
                ),
            ],
        });
    const runs: Runs = Array.from({ length: 6 }, (_, turn) => turnOf(turn, 59));
    daemon.historySet(agent.id, runs);
    const served = daemon.client.getMessages.bind(daemon.client);
    daemon.client.getMessages = (async (
        id: string,
        query: { before?: string; limit?: number } = {},
        ...rest: unknown[]
    ) => {
        const all = await served(id, {}, ...(rest as []));
        const { runs: page, hasMore } = pageOf(all.runs, query);
        return { ...all, runs: page, hasMore };
    }) as typeof daemon.client.getMessages;
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    open.push(connection);
    let elements: readonly ChatElement[] = [];
    let session: SessionState | undefined;
    const reader = connection.connectSession({
        sessionId: agent.id,
        onChange(next, state) {
            elements = next;
            session = state;
        },
    });
    const asks = () =>
        elements.filter((e) => e.kind === "user_message").map((e) => (e as { text: string }).text);
    await vi.waitFor(() => expect(asks()).toEqual(["ask 4", "ask 5"]));
    reader.loadMore("r4");
    await vi.waitFor(() => expect(asks()).toEqual(["ask 2", "ask 3", "ask 4", "ask 5"]));

    // While the stream was down, three more turns finished: the newest page is r7, r8.
    daemon.historySet(agent.id, [...runs, turnOf(6, 59), turnOf(7, 59), turnOf(8, 59)]);
    daemon.cursorNext();
    daemon.gapOnNextStream();
    daemon.streamDropAll();
    await vi.waitFor(() => expect(asks()).toEqual(["ask 7", "ask 8"]));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Not ["ask 2" … "ask 5", "ask 7", "ask 8"]: turn 6 would be missing between them.
    expect(asks()).toEqual(["ask 7", "ask 8"]);
    expect(session?.transcriptComplete).toBe(false);
    expect(session?.loadMoreToken).toBe("r7");
    reader.loadMore("r7");
    await vi.waitFor(() => expect(asks()).toEqual(["ask 5", "ask 6", "ask 7", "ask 8"]));
});
