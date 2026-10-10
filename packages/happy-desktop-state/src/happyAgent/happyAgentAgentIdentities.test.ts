import { expect, it, vi } from "vitest";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import type { ChatElement } from "../happyAgentConnection/index.js";
import {
    happyAgentAgentIdentitiesIndex,
    happyAgentAgentIdentitySourceCreate,
} from "./happyAgentAgentIdentities.js";
import { happyAgentConversationProject } from "./happyAgentConversationProject.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentBotSubtask,
    HappyAgentTask,
    HappyAgentTaskId,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

/* A message from another agent names its sender in the transcript the way the
 * rest of the window does — a bot by its name and picture, a task by its name
 * and its row's face, a subtask by its title — while the agent id stays in the
 * message itself for the receiving model to reply to. An agent nobody can name
 * is left to its id. */

const conversation = (id: string, title: string) => ({
    id,
    title,
    subtitle: "",
    updatedAt: 1,
    activity: "idle" as const,
    participants: [],
});

const subtask = (id: string, title: string): HappyAgentBotSubtask => ({
    workspaceId: "ws_helper" as HappyAgentWorktreeId,
    path: "/work/helper",
    conversation: conversation(id, title),
    subtasks: [],
});

const BOT: HappyAgentBot = {
    id: "bot_helper" as HappyAgentBotId,
    workspaceId: "ws_helper" as HappyAgentWorktreeId,
    conversation: conversation("agent_bot", "Helper"),
    name: "Release helper",
    username: "release-helper",
    orderKey: "a",
    path: "/work/helper",
    displayPath: "~/Bots/helper",
    avatar: { url: "http://happy-agent.test/v0/bots/bot_helper/avatar", thumbhash: "h" },
    subtasks: [subtask("agent_subtask", "Write the changelog")],
};

const task = (id: string, name: string, owner: HappyAgentTask["owner"]): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name,
    conversation: conversation(`agent_${id}`, name),
    subtasks: [],
    owner,
    path: `/tasks/${id}`,
    displayPath: `~/tasks/${id}`,
    createdAt: 1,
    archived: false,
    canArchive: false,
});

const list = (
    bots: readonly HappyAgentBot[],
    tasks: readonly HappyAgentTask[],
): HappyAgentSessionListSnapshot =>
    ({
        projects: { type: "ready", value: [] },
        bots,
        tasks,
        taskDirectory: tasks,
    }) as unknown as HappyAgentSessionListSnapshot;

it("names a bot, a task, and a subtask the way their own rows do", () => {
    const index = happyAgentAgentIdentitiesIndex(
        list(
            [
                BOT,
                {
                    ...BOT,
                    id: "bot_plain" as HappyAgentBotId,
                    conversation: conversation("agent_plain", "Plain"),
                    name: "Plain",
                    avatar: undefined,
                    subtasks: [],
                },
            ],
            [
                task("team", "Fix invoice rounding", { userId: "usr_ann", name: "Ann Lee" }),
                task("standalone", "Ship the launch", null),
            ],
        ),
    );
    expect(index.get("agent_bot")).toEqual({
        name: "Release helper",
        face: { kind: "image", url: "http://happy-agent.test/v0/bots/bot_helper/avatar" },
    });
    // A bot without a picture wears the mark generated from the bot, as its row does.
    expect(index.get("agent_plain")).toEqual({
        name: "Plain",
        face: { kind: "generated", seed: "bot_plain" },
    });
    expect(index.get("agent_team")).toEqual({
        name: "Fix invoice rounding",
        face: { kind: "initials", initials: "AL" },
    });
    // Standalone: every task is the reader's own, so it wears the tasks glyph, never a face.
    expect(index.get("agent_standalone")).toEqual({
        name: "Ship the launch",
        face: { kind: "task" },
    });
    expect(index.get("agent_subtask")).toEqual({
        name: "Write the changelog",
        face: { kind: "generated", seed: "agent_subtask" },
    });
});

it("asks the host once for an agent nothing lists, and leaves one it refuses unnamed", async () => {
    const getAgent = vi.fn((agentId: string) =>
        agentId === "agent_far"
            ? Promise.resolve({ agent: { title: "Nightly triage" } })
            : Promise.reject(new Error("Not found.")),
    );
    const source = happyAgentAgentIdentitySourceCreate({
        client: { getAgent } as never,
        list: { get: () => list([BOT], []), subscribe: () => () => undefined },
    });
    const changed = vi.fn();
    source.subscribe(changed);

    // Listed: answered at once, nothing asked.
    expect(source.lookup("agent_bot")?.name).toBe("Release helper");
    source.request("agent_bot");
    expect(getAgent).not.toHaveBeenCalled();

    source.request("agent_far");
    source.request("agent_far");
    expect(getAgent).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(source.lookup("agent_far")).toEqual({
        name: "Nightly triage",
        face: { kind: "generated", seed: "agent_far" },
    });

    source.request("agent_gone");
    source.request("agent_gone");
    await Promise.resolve();
    await Promise.resolve();
    expect(getAgent).toHaveBeenCalledTimes(2);
    expect(source.lookup("agent_gone")).toBeUndefined();
});

const envelope = (agentId: string) => `Message from agent ${agentId}:\n\nThe build is green.`;

const fromAgent = (agentId: string): ChatElement => ({
    id: `message:${agentId}`,
    groupId: "run_1",
    runId: "run_1",
    createdAt: 1,
    kind: "user_message",
    messageId: `msg_${agentId}`,
    authority: "server",
    identity: null,
    delivery: "sent",
    senderAgent: { agentId, relation: "other" },
    text: envelope(agentId),
});

function activities(
    agentIds: readonly string[],
    index: ReturnType<typeof happyAgentAgentIdentitiesIndex>,
) {
    const entries = happyAgentConversationProject({
        elements: agentIds.map(fromAgent),
        sessionId: "agent_reader",
        showReasoning: false,
        ephemeral: [],
        pendingUserInputs: [],
        answeredUserInputs: [],
        expandedGroupIds: new Set(),
        subagents: [],
        agentIdentities: index,
    });
    return entries.flatMap((entry: ConversationEntry) =>
        entry.kind === "agentActivity" && entry.activity.kind === "agentMessage"
            ? [entry.activity]
            : [],
    );
}

it("puts the sender's name and face on the row and leaves the id in the message", () => {
    const index = happyAgentAgentIdentitiesIndex(
        list([BOT], [task("standalone", "Ship the launch", null)]),
    );
    const rows = activities(
        ["agent_bot", "agent_standalone", "agent_subtask", "agent_unknown"],
        index,
    );
    expect(rows).toEqual([
        {
            kind: "agentMessage",
            agentId: "agent_bot",
            agentName: "Release helper",
            agentFace: { kind: "image", url: "http://happy-agent.test/v0/bots/bot_helper/avatar" },
            text: envelope("agent_bot"),
        },
        {
            kind: "agentMessage",
            agentId: "agent_standalone",
            agentName: "Ship the launch",
            agentFace: { kind: "task" },
            text: envelope("agent_standalone"),
        },
        {
            kind: "agentMessage",
            agentId: "agent_subtask",
            agentName: "Write the changelog",
            agentFace: { kind: "generated", seed: "agent_subtask" },
            text: envelope("agent_subtask"),
        },
        // Nobody can name it: no name and no face, so the row shows its id.
        { kind: "agentMessage", agentId: "agent_unknown", text: envelope("agent_unknown") },
    ]);
});
