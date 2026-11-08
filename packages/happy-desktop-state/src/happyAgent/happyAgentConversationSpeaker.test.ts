import { expect, it } from "vitest";
import { happyAgentAgentIdentitiesIndex } from "./happyAgentAgentIdentities.js";
import { happyAgentConversationSpeaker } from "./happyAgentConversationSpeaker.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentTask,
    HappyAgentTaskId,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

/* A team's Welcome task is its Chief of Staff to the teammate it welcomes: the
 * server says so with `speaksAs`, and the window shows that bot's live name and
 * picture as the author of the task's messages and in its header, wherever it
 * names the task's agent. A task that says nothing, or names a bot this window
 * doesn't list, speaks as itself. */

const conversation = (id: string, title: string) => ({
    id,
    title,
    subtitle: "",
    updatedAt: 1,
    activity: "idle" as const,
    participants: [],
});

const CHIEF: HappyAgentBot = {
    id: "bot_chief" as HappyAgentBotId,
    workspaceId: "ws_chief" as HappyAgentWorktreeId,
    conversation: conversation("agent_chief", "Juno"),
    name: "Juno",
    username: "chief_of_staff",
    systemKey: "chief_of_staff",
    orderKey: "a",
    path: "/bots/chief",
    displayPath: "~/Bots/chief",
    avatar: { url: "http://acme.test/v0/bots/bot_chief/avatar", thumbhash: "h" },
    subtasks: [],
};

const HELPER: HappyAgentBot = {
    ...CHIEF,
    id: "bot_helper" as HappyAgentBotId,
    conversation: conversation("agent_helper", "Helper"),
    name: "Release helper",
    username: "release_helper",
    systemKey: null,
    avatar: undefined,
};

const task = (id: string, name: string, speaksAs?: string): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name,
    conversation: conversation(`agent_${id}`, name),
    subtasks: [],
    owner: { userId: "usr_olga", name: "Olga Petrova" },
    ...(speaksAs === undefined ? {} : { speaksAs: { systemKey: speaksAs } }),
    path: `/tasks/${id}`,
    displayPath: `~/tasks/${id}`,
    createdAt: 1,
    archived: false,
    canArchive: false,
});

const WELCOME = task("welcome", "Welcome to @acme", "chief_of_staff");
const PLAIN = task("plain", "Fix flaky sign-in test");

it("speaks as the bot a Welcome task names, and as a bot in its own conversation", () => {
    const listed = { bots: [CHIEF, HELPER], tasks: [WELCOME, PLAIN] };
    expect(happyAgentConversationSpeaker(listed, "agent_welcome")).toBe(CHIEF);
    expect(happyAgentConversationSpeaker(listed, "agent_chief")).toBe(CHIEF);
    expect(happyAgentConversationSpeaker(listed, "agent_helper")).toBe(HELPER);
    // A task that says nothing speaks as itself, and so does an unknown agent.
    expect(happyAgentConversationSpeaker(listed, "agent_plain")).toBeUndefined();
    expect(happyAgentConversationSpeaker(listed, "agent_unknown")).toBeUndefined();
});

it("follows the bot's live name and picture, and speaks as itself while the bot isn't listed", () => {
    const renamed: HappyAgentBot = {
        ...CHIEF,
        name: "Atlas",
        avatar: { url: "http://acme.test/v0/bots/bot_chief/avatar?v=2" },
    };
    expect(
        happyAgentConversationSpeaker({ bots: [renamed], tasks: [WELCOME] }, "agent_welcome"),
    ).toMatchObject({ name: "Atlas", avatar: { url: renamed.avatar?.url } });
    expect(
        happyAgentConversationSpeaker({ bots: [HELPER], tasks: [WELCOME] }, "agent_welcome"),
    ).toBeUndefined();
    // A system key no listed bot has is not matched to an ordinary bot.
    expect(
        happyAgentConversationSpeaker(
            { bots: [CHIEF, HELPER], tasks: [task("other", "Other", "release_bot")] },
            "agent_other",
        ),
    ).toBeUndefined();
});

it("names a Welcome task's agent as its bot in other transcripts too", () => {
    const index = happyAgentAgentIdentitiesIndex({
        projects: { type: "ready", value: [] },
        bots: [CHIEF],
        tasks: [WELCOME, PLAIN],
        taskDirectory: [WELCOME, PLAIN],
    } as unknown as HappyAgentSessionListSnapshot);
    expect(index.get("agent_welcome")).toEqual({
        name: "Juno",
        face: { kind: "image", url: CHIEF.avatar?.url },
    });
    expect(index.get("agent_plain")).toEqual({
        name: "Fix flaky sign-in test",
        face: { kind: "placeholder", seed: "usr_olga" },
    });
});
