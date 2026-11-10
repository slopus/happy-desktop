import type { Message, UiDocument } from "@slopus/happy-agent-client";
import { expect, it } from "vitest";
import {
    chatUiConversation,
    chatUiDocumentsOf,
    chatUiEqual,
    chatUiQuickReplies,
    chatUiTranscriptRead,
    quickRepliesOf,
} from "./chatUiTranscript.js";

const document: UiDocument = {
    id: "ui1",
    components: [
        { id: "tree", type: "file_tree", fallback: "src/app.ts", props: { paths: ["src/app.ts"] } },
        { id: "model", type: "default_model", fallback: "The default model", props: {} },
    ],
};

const offered: Message = {
    id: "m1",
    role: "agent",
    createdAt: 1,
    metadata: {},
    content: [
        { type: "text", text: "Here." },
        { type: "ui", ui: document },
    ],
};

function record(id: string, status: "pending" | "accepted" | "rejected", reason?: string): Message {
    return {
        id,
        role: "service",
        createdAt: 2,
        metadata: {},
        content: [
            {
                type: "action",
                messageId: "m1",
                uiId: "ui1",
                componentId: "model",
                action: {
                    type: "default_model.set",
                    payload: { providerId: "claude", modelId: "opus", effort: "high" },
                },
                outcome: { status, ...(reason ? { reason } : {}) },
            },
        ],
    };
}

function suggestion(id: string, options: string[], toolCallId?: string): Message {
    return {
        id,
        role: "agent",
        createdAt: 3,
        metadata: {},
        content: [
            toolCallId === undefined
                ? { type: "quick_replies", options }
                : {
                      type: "tool_call",
                      id: toolCallId,
                      name: "suggest_replies",
                      status: "completed",
                      arguments: { options },
                      presentation: { type: "quick_replies", options },
                  },
        ],
    };
}

function said(id: string, quickReply?: { messageId: string; toolCallId?: string; index: number }) {
    return {
        id,
        role: "user",
        createdAt: 4,
        metadata: {},
        content: [{ type: "text", text: "ok" }],
        status: "accepted",
        delivery: "queue",
        runId: null,
        ...(quickReply ? { quickReply } : {}),
    } as Message;
}

it("finds a document in a ui block and in a show_ui call's presentation", () => {
    expect(chatUiDocumentsOf(offered)).toEqual([document]);
    const shown: Message = {
        id: "m2",
        role: "agent",
        createdAt: 1,
        metadata: {},
        content: [
            {
                type: "tool_call",
                id: "call1",
                name: "show_ui",
                status: "completed",
                arguments: {},
                presentation: { type: "ui", ui: document, items: [] },
            },
        ],
    };
    expect(chatUiDocumentsOf(shown)).toEqual([document]);
    expect(chatUiDocumentsOf(said("u1"))).toEqual([]);
});

it("shows a component its last recorded attempt and leaves the others without one", () => {
    const transcript = chatUiTranscriptRead([
        offered,
        record("a1", "rejected", "Not allowed."),
        record("a2", "accepted"),
    ]);
    const ui = chatUiConversation(transcript, "m1", document, []);
    expect(ui.offer).toEqual({ messageId: "m1", uiId: "ui1" });
    expect(ui.attempts.get("model")?.outcome).toEqual({ status: "accepted" });
    expect(ui.attempts.has("tree")).toBe(false);
});

it("tells two projections of a document apart by what its attempts say", () => {
    const before = chatUiConversation(
        chatUiTranscriptRead([offered, record("a1", "pending")]),
        "m1",
        document,
        [],
    );
    const same = chatUiConversation(
        chatUiTranscriptRead([offered, record("a1", "pending")]),
        "m1",
        document,
        [],
    );
    const after = chatUiConversation(
        chatUiTranscriptRead([offered, record("a1", "rejected", "No.")]),
        "m1",
        document,
        [],
    );
    // A record read again is a new object carrying the same action.
    expect(chatUiEqual(before, before)).toBe(true);
    expect(chatUiEqual(before, same)).toBe(false);
    expect(chatUiEqual(before, after)).toBe(false);
    expect(chatUiEqual(undefined, undefined)).toBe(true);
    expect(chatUiEqual(before, undefined)).toBe(false);
});

it("keeps only the newest suggestion live, until a person's message follows it", () => {
    const first = suggestion("s1", ["Yes", "No"]);
    const second = suggestion("s2", ["Merge it", "Not now"], "call7");
    const [older] = quickRepliesOf(first);
    const [newer] = quickRepliesOf(second);
    expect(newer).toEqual({
        messageId: "s2",
        toolCallId: "call7",
        options: ["Merge it", "Not now"],
        live: false,
    });

    const open = chatUiTranscriptRead([first, second]);
    expect(chatUiQuickReplies(open, older!).live).toBe(false);
    expect(chatUiQuickReplies(open, newer!).live).toBe(true);

    const answered = chatUiTranscriptRead([first, second, said("u1")]);
    expect(chatUiQuickReplies(answered, newer!).live).toBe(false);
    expect(chatUiQuickReplies(answered, newer!).chosen).toBeUndefined();
});

it("reads the option a person's message sent back from its quickReply", () => {
    const first = suggestion("s1", ["Yes", "No"]);
    const second = suggestion("s2", ["Merge it", "Not now"], "call7");
    const transcript = chatUiTranscriptRead([
        first,
        said("u1", { messageId: "s1", index: 1 }),
        second,
        said("u2", { messageId: "s2", toolCallId: "call7", index: 0 }),
    ]);
    expect(chatUiQuickReplies(transcript, quickRepliesOf(first)[0]!)).toMatchObject({
        chosen: 1,
        live: false,
    });
    expect(chatUiQuickReplies(transcript, quickRepliesOf(second)[0]!)).toMatchObject({
        chosen: 0,
        live: false,
    });
    // An index past the options names nothing.
    const stray = chatUiTranscriptRead([first, said("u3", { messageId: "s1", index: 5 })]);
    expect(chatUiQuickReplies(stray, quickRepliesOf(first)[0]!).chosen).toBeUndefined();
});
