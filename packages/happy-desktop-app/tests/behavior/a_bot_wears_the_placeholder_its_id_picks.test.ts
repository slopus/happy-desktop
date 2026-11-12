import { expect, it } from "vitest";
import type {
    HappyAgentBot,
    HappyAgentBotCreating,
    HappyAgentBotId,
    HappyAgentWorktreeId,
} from "happy-desktop-state";
import { commandPaletteResults } from "../../sources/commandPaletteResults";
import { botCreatingSidebarItem, botSidebarItem } from "../../sources/AppHappyAgentView";

/* A bot with no picture wears the placeholder its own id picks, as the phone
 * draws it, and wears that same one wherever the window shows it: its row
 * while it is being made, its row once it exists, and its command palette
 * result. Its conversation has an id of its own, and a face picked by that
 * would be a different one, so the bot would seem to change face the moment it
 * is opened. The transcript names it by the same seed
 * (`happyAgentAgentIdentities.test.ts`). */

const BOT: HappyAgentBot = {
    id: "bot_rex" as HappyAgentBotId,
    workspaceId: "ws_rex" as HappyAgentWorktreeId,
    conversation: {
        id: "ses_rex",
        title: "Rex",
        subtitle: "",
        updatedAt: 1,
        activity: "idle",
        participants: [],
    },
    subtasks: [],
    name: "Rex",
    username: "rex",
    orderKey: "a",
    path: "/Users/happy/Bots/rex",
    displayPath: "~/Bots/rex",
};

const CREATING: HappyAgentBotCreating = {
    id: BOT.id,
    workspaceId: BOT.workspaceId,
    name: BOT.name,
};

it("wears its id's placeholder on its row, while it is made, and in the palette", () => {
    const row = botSidebarItem(BOT, false, false);
    const creatingRow = botCreatingSidebarItem(CREATING, false);
    const result = commandPaletteResults({
        happyAgentId: "local",
        projects: [],
        bots: [BOT],
        tasks: [],
        taskDirectory: [],
        sidebarListing: { botsHidden: new Set(), projectsHidden: false },
        visits: [],
        archivedSessions: [],
        tabs: [],
        sessionCreateAvailable: false,
        workspaceCreateAvailable: false,
        taskCreateAvailable: false,
        query: "",
        themeMode: "system",
        scrollbarVisibility: "automatic",
        linkOpenPlacement: "panel",
        titleShimmerEnabled: false,
    });
    const paletteRow = result.rows.find((entry) => entry.id === `bot:${BOT.id}`);

    expect(row).toMatchObject({ placeholderSeed: BOT.id });
    expect(row.imageUrl).toBeUndefined();
    expect(creatingRow).toMatchObject({ placeholderSeed: BOT.id });
    expect(creatingRow.imageUrl).toBeUndefined();
    expect(paletteRow).toMatchObject({
        glyph: { kind: "avatar", initials: "R", placeholderSeed: BOT.id },
    });
    expect(paletteRow).not.toHaveProperty("glyph.imageUrl");
});
