import { HappyAgentApiError as Refusal } from "@slopus/happy-agent-client";
import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import * as fake from "../testing/index.js";
import { happyAgentChatStoreCreate } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* A press is the person's action message under one id; a recorded choice reads back on load. */

const closes: (() => void)[] = [];
afterEach(() => closes.splice(0).forEach((close) => close()));
const MENU = `<menu><button data-action="reply">Go</button><button data-action="reply" data-text="Wait a bit">Wait</button></menu>`;
const text = (value: string) => ({ type: "text", text: value }) as never;

it("numbers menus across text blocks, reads choices, presses under one id, and answers questions", async () => {
    const daemon = fake.fakeHappyAgentDaemonCreate();
    daemon.agentSeed(daemon.projectSeed({ id: "p" }).id, { id: "a", pendingQuestionId: "q1" });
    const metadata = { senderAgentId: "agent_far" };
    const inbound = fake.fakeUserMessage({ id: "m0", status: "accepted", metadata });
    const choice = { "2": { kind: "button", index: 1 } } as const;
    daemon.historySet("a", [
        fake.fakeRun({
            id: "run-1",
            messages: [
                { ...inbound, content: [text(`Pick:\n\n${MENU}`)] },
                fake.fakeAgentMessage({
                    id: "m1",
                    content: [text(`One:\n\n${MENU}`), text(`Two:\n\n${MENU}\n\n${MENU}`)],
                    actionChoices: choice,
                }),
            ],
        }),
    ]);
    daemon.questionSet("a", { id: "q1", agentId: "a", status: "pending", questions: [] } as never);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });
    const store = happyAgentChatStoreCreate("a" as HappyAgentSessionId, {
        catalog: happyAgentModelCatalogProject(daemon.configGet()),
        transcriptConnect: (options) =>
            connection.connectSession({
                ...options,
                onChange: (elements, state) => options.onChange(elements, state, []),
            }),
        connectActions: connection,
        connectMutationSubscribe: () => () => undefined,
    });
    closes.push(
        store.subscribe(() => undefined),
        () => connection.close(),
    );

    const entries = () => store.get().entries;
    const actions = () =>
        entries().flatMap((entry) =>
            entry.kind === "message" ? (entry.message.actions ?? []) : [],
        );
    await vi.waitFor(() => expect(actions().map((each) => each.blockStart)).toEqual([0, 1]));
    expect(actions()[1]!.choices).toEqual(choice);
    // Another agent's message, drawn as a one-line activity, carries no menu.
    expect(entries().find((entry) => entry.kind === "agentActivity")).toMatchObject({
        activity: { text: "Pick:" },
    });

    const press = { messageId: "m1", blockIndex: 0, controlIndex: 1, actionId: "reply" as const };
    daemon.failOnce("sendMessage", new Refusal(500, "Again.", "internal", null));
    await store.actionPress({ ...press, params: { text: "Wait a bit" } });
    const [first, second] = daemon.calls
        .filter((call) => call.method === "sendMessage")
        .map((call) => call.args[1] as Record<string, unknown>);
    expect(second).toEqual({
        id: first!.id,
        content: [{ type: "action", ...press, params: { text: "Wait a bit" } }],
        delivery: "steer",
        mode: expect.anything(),
    });

    // 409: another choice holds the block; the message says which. 404: shown, and unlocked.
    daemon.failOnce("sendMessage", new Refusal(409, "Taken.", "conflict", null));
    await expect(store.actionPress({ ...press, params: {} })).resolves.toBeUndefined();
    daemon.failOnce("sendMessage", new Refusal(404, "No such message.", "not_found", null));
    await expect(store.actionPress({ ...press, params: {} })).rejects.toThrow("No such message.");
    expect(entries()[0]).toMatchObject({ kind: "notice", text: "No such message." });

    await store.answerInput({ requestId: "q1", answers: { pick: ["Go"] } });
    await vi.waitFor(() => expect(daemon.callCount("answerQuestion")).toBe(1));
    expect(daemon.calls.at(-1)!.args.slice(0, 3)).toEqual([
        "a",
        "q1",
        expect.objectContaining({ answers: { pick: ["Go"] } }),
    ]);
});
