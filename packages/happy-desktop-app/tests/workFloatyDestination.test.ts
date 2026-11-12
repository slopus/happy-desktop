import { expect, it } from "vitest";
import type { HappyAgentBotSubtask } from "happy-desktop-state";
import { workFloatyDestination } from "../sources/workFloatyDestination";

/* The work floaty's rows go where their sidebar rows go, never into a side
 * chat or onto a workspace with no conversation picked. */

const SUBTASK = {
    workspaceId: "ws_sub",
    conversation: { id: "ses_sub" },
} as unknown as HappyAgentBotSubtask;

const card = (rowId: string) =>
    workFloatyDestination({
        rowId,
        places: [
            { rowId: "place:own" },
            { rowId: "place:ws_sub", workspaceId: "ws_sub" },
            {
                rowId: "place:ws_free",
                workspaceId: "ws_free",
            },
        ],
        agentIds: ["ses_sub", "ses_helper"],
        subtasks: [SUBTASK],
        groupId: "ws_task",
    });

it("opens a subtask's workspace as that subtask's conversation", () => {
    expect(card("place:ws_sub")).toEqual({ kind: "chat", groupId: "ws_sub", chatId: "ses_sub" });
});

it("opens the subtask itself in its own workspace, in the main area", () => {
    expect(card("ses_sub")).toEqual({ kind: "chat", groupId: "ws_sub", chatId: "ses_sub" });
});

it("opens any other agent in the card's own workspace", () => {
    expect(card("ses_helper")).toEqual({ kind: "chat", groupId: "ws_task", chatId: "ses_helper" });
});

it("opens a workspace no subtask works in where it was left", () => {
    expect(card("place:ws_free")).toEqual({ kind: "workspace", groupId: "ws_free" });
});

it("lists this chat's own changes beside it, and opens an artifact's page", () => {
    expect(card("place:own")).toEqual({ kind: "changes" });
    expect(card("artifact:art_1")).toEqual({ kind: "artifact", artifactId: "art_1" });
});

it("goes nowhere for a row it does not know", () => {
    expect(card("ses_gone")).toBeUndefined();
});
