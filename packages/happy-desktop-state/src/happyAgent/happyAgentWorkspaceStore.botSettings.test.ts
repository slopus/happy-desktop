import { expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type {
    HappyAgentBotUpdate,
    HappyAgentSessionListSnapshot,
} from "./happyAgentSessionListStore.js";
import type {
    HappyAgentAvatarImage,
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

/*
 * A Happy Cloud personal bot the reader may edit opens its settings with its
 * name and instructions as drafts. Saving sends only what changed and closes;
 * a refusal keeps the drafts open with the reason. A shared bot, or a personal
 * bot the reader may not edit, opens nothing.
 */

function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) =>
            property === "then"
                ? undefined
                : property === Symbol.iterator
                  ? function* () {}
                  : inert(),
        apply: () => undefined,
    });
}

function bot(id: string, fields: Partial<HappyAgentBot>): HappyAgentBot {
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
        ...fields,
    };
}

const WRITER = bot("writer", {
    name: "Writer",
    kind: "personal",
    editable: true,
    instructions: "Write release notes.",
    revision: 3,
});
const LOCKED = bot("locked", { name: "Locked", kind: "personal", editable: false });
const CHIEF = bot("chief", { name: "Chief of Staff", kind: "shared", editable: false });

function store(
    botUpdate: (botId: HappyAgentBotId, update: HappyAgentBotUpdate) => Promise<void>,
    botAvatarUpdate: (botId: HappyAgentBotId, image: HappyAgentAvatarImage) => void = () =>
        undefined,
) {
    const list = {
        projects: { type: "ready", value: [] },
        bots: [WRITER, LOCKED, CHIEF],
        botsCreating: [],
        archivedSessions: [],
        catalogRevision: 1,
        sessionCreateFailures: new Map(),
        worktreeCreateFailures: new Map(),
        projectCreateFailures: new Map(),
        subtaskFailures: new Map(),
        tasks: [],
        taskDirectory: [],
        tasksArchived: [],
        tasksJoining: new Set(),
        taskFailures: new Map(),
    } as unknown as HappyAgentSessionListSnapshot;
    const loading = { type: "loading" } as const;
    const client = new Proxy(
        {
            models: {
                get: () => loading,
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    {
                        get: () => list,
                        subscribe: () => () => undefined,
                        botUpdate,
                        botAvatarUpdate,
                    },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: () => new Promise(() => undefined),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, {});
    const unsubscribe = workspace.subscribe(() => undefined);
    return { workspace, unsubscribe };
}

it("opens an editable personal bot's settings with its name and instructions", () => {
    const { workspace, unsubscribe } = store(() => Promise.resolve());
    workspace.botSettingsOpen(WRITER.id);
    expect(workspace.get().botSettings).toEqual({
        botId: "writer",
        name: "Writer",
        instructions: "Write release notes.",
        submitting: false,
    });
    unsubscribe();
});

it("opens nothing for a shared bot or a personal bot the reader may not edit", () => {
    const { workspace, unsubscribe } = store(() => Promise.resolve());
    workspace.botSettingsOpen(CHIEF.id);
    expect(workspace.get().botSettings).toBeUndefined();
    workspace.botSettingsOpen(LOCKED.id);
    expect(workspace.get().botSettings).toBeUndefined();
    unsubscribe();
});

it("saves only the instructions when only they changed, and closes", async () => {
    const botUpdate = vi.fn((_botId: HappyAgentBotId, _update: HappyAgentBotUpdate) =>
        Promise.resolve(),
    );
    const { workspace, unsubscribe } = store(botUpdate);
    workspace.botSettingsOpen(WRITER.id);
    workspace.botSettingsInstructionsUpdate("Write release notes.\nKeep them short.");
    await workspace.botSettingsSubmit();
    expect(botUpdate).toHaveBeenCalledExactlyOnceWith("writer", {
        instructions: "Write release notes.\nKeep them short.",
    });
    expect(workspace.get().botSettings).toBeUndefined();
    unsubscribe();
});

it("saves a trimmed new name and the instructions together", async () => {
    const botUpdate = vi.fn((_botId: HappyAgentBotId, _update: HappyAgentBotUpdate) =>
        Promise.resolve(),
    );
    const { workspace, unsubscribe } = store(botUpdate);
    workspace.botSettingsOpen(WRITER.id);
    workspace.botSettingsNameUpdate("  Release writer ");
    workspace.botSettingsInstructionsUpdate("");
    await workspace.botSettingsSubmit();
    expect(botUpdate).toHaveBeenCalledExactlyOnceWith("writer", {
        name: "Release writer",
        instructions: "",
    });
    unsubscribe();
});

it("closes without asking the host when nothing changed", async () => {
    const botUpdate = vi.fn(() => Promise.resolve());
    const { workspace, unsubscribe } = store(botUpdate);
    workspace.botSettingsOpen(WRITER.id);
    await workspace.botSettingsSubmit();
    expect(botUpdate).not.toHaveBeenCalled();
    expect(workspace.get().botSettings).toBeUndefined();
    unsubscribe();
});

it("keeps the drafts open with the host's reason when it refuses", async () => {
    const { workspace, unsubscribe } = store(() =>
        Promise.reject(new UserError("The bot changed somewhere else. Try again.")),
    );
    workspace.botSettingsOpen(WRITER.id);
    workspace.botSettingsInstructionsUpdate("New instructions");
    const saving = workspace.botSettingsSubmit();
    expect(workspace.get().botSettings?.submitting).toBe(true);
    await saving;
    expect(workspace.get().botSettings).toEqual({
        botId: "writer",
        name: "Writer",
        instructions: "New instructions",
        submitting: false,
        error: "The bot changed somewhere else. Try again.",
    });
    unsubscribe();
});

it("refuses a blank name and oversized instructions before asking the host", async () => {
    const botUpdate = vi.fn(() => Promise.resolve());
    const { workspace, unsubscribe } = store(botUpdate);
    workspace.botSettingsOpen(WRITER.id);
    workspace.botSettingsNameUpdate("   ");
    await workspace.botSettingsSubmit();
    expect(workspace.get().botSettings?.error).toBe("A bot needs a name.");

    workspace.botSettingsNameUpdate("Writer");
    workspace.botSettingsInstructionsUpdate("x".repeat(32 * 1024 + 1));
    await workspace.botSettingsSubmit();
    expect(workspace.get().botSettings?.error).toBe("Instructions can be at most 32 KB.");
    expect(botUpdate).not.toHaveBeenCalled();
    unsubscribe();
});

it("sends a chosen picture at once and refuses one that is not an image", async () => {
    const botAvatarUpdate = vi.fn();
    const { workspace, unsubscribe } = store(() => Promise.resolve(), botAvatarUpdate);
    workspace.botSettingsOpen(WRITER.id);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    await workspace.botSettingsAvatarChoose(new Blob([png]));
    expect(botAvatarUpdate).toHaveBeenCalledOnce();
    expect(botAvatarUpdate.mock.calls[0]![0]).toBe("writer");
    expect(botAvatarUpdate.mock.calls[0]![1]).toMatchObject({ contentType: "image/png" });

    await workspace.botSettingsAvatarChoose(new Blob(["not a picture"]));
    expect(botAvatarUpdate).toHaveBeenCalledOnce();
    expect(workspace.get().botSettings?.error).toBe(
        "The picture must be a PNG, JPEG, or WebP image, up to 8 MiB and 25 megapixels.",
    );
    unsubscribe();
});
