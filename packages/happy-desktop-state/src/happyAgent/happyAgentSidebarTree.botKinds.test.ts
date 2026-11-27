import { expect, it } from "vitest";
import { happyAgentSidebarTree } from "./happyAgentSidebarTree.js";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentBotKind,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

/*
 * Happy Cloud places each bot by its kind: a shared bot is a destination of
 * the sidebar's first group and is not listed under Bots, a personal bot is.
 * A Happy Agent daemon sends no kind, and its bots are listed as they always
 * were. Placement follows the kind alone, whatever else the bot is.
 */

function bot(id: string, kind?: HappyAgentBotKind, systemKey?: string): HappyAgentBot {
    return {
        id: id as HappyAgentBotId,
        workspaceId: `ws_${id}` as HappyAgentWorktreeId,
        conversation: {
            id: `ses_${id}`,
            title: id,
            subtitle: "",
            updatedAt: 1,
            activity: "idle",
            participants: [],
        },
        subtasks: [],
        name: id,
        username: id,
        orderKey: id,
        path: `/bots/${id}`,
        displayPath: `/bots/${id}`,
        ...(kind === undefined ? {} : { kind }),
        ...(systemKey === undefined ? {} : { systemKey }),
    };
}

it("lists an owner's shared bot apart from the Bots section", () => {
    const chief = bot("chief", "shared", "chief_of_staff");
    const writer = bot("writer", "personal");
    const tree = happyAgentSidebarTree({ bots: [chief, writer], projects: [] });
    expect(tree.sharedBots).toEqual([chief]);
    expect(tree.bots).toEqual([writer]);
});

it("lists a member's personal bots under Bots and nothing in the first group", () => {
    const writer = bot("writer", "personal");
    const reviewer = bot("reviewer", "personal");
    const tree = happyAgentSidebarTree({ bots: [writer, reviewer], projects: [] });
    expect(tree.sharedBots).toEqual([]);
    expect(tree.bots).toEqual([writer, reviewer]);
});

it("places by kind alone: a personal Chief of Staff stays under Bots, a shared ordinary bot leaves", () => {
    const chief = bot("chief", "personal", "chief_of_staff");
    const lobby = bot("lobby", "shared");
    const tree = happyAgentSidebarTree({ bots: [chief, lobby], projects: [] });
    expect(tree.sharedBots).toEqual([lobby]);
    expect(tree.bots).toEqual([chief]);
});

it("leaves a daemon's bots, which carry no kind, exactly where they were", () => {
    const bots = [bot("chief", undefined, "chief_of_staff"), bot("helper")];
    const tree = happyAgentSidebarTree({ bots, projects: [] });
    expect(tree.sharedBots).toEqual([]);
    // The very array it was given, so nothing under Bots re-renders.
    expect(tree.bots).toBe(bots);
});
