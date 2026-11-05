import { expect, it } from "vitest";
import type {
    HappyAgentArtifact,
    HappyAgentArtifactId,
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentGroupId,
    HappyAgentProjectGroup,
    HappyAgentProjectId,
    HappyAgentQuickSearchHit,
    HappyAgentRecentTabMemory,
    HappyAgentSessionId,
    HappyAgentSurface,
    HappyAgentSurfaceActiveTodo,
    HappyAgentSurfaceId,
    HappyAgentSurfaceTodoId,
    HappyAgentTask,
    HappyAgentTaskId,
    HappyAgentVaultItemId,
    HappyAgentWorktreeGroup,
    HappyAgentWorktreeId,
} from "happy-desktop-state";
import { commandShortcut } from "happy-desktop-ui";
import { APP_SHORTCUTS } from "../sources/appShortcuts";
import {
    commandPaletteHeld,
    commandPaletteResults,
    type CommandPaletteInput,
} from "../sources/commandPaletteResults";
import { happyAgentSettingsCategoryExists } from "../sources/views/AppHappyAgentSettingsView";

const NOW = 1_764_000_000_000;
const MINUTE = 60_000;
const PHOTO = "data:image/png;base64,iVBORw0KGgo=";

const conversation = (id: string, title: string, minutesAgo: number) => ({
    id,
    title,
    subtitle: "",
    updatedAt: NOW - minutesAgo * MINUTE,
    activity: "idle" as const,
    participants: [],
});

const task = (
    id: string,
    name: string,
    minutesAgo: number,
    options: { subtasks?: HappyAgentTask["subtasks"]; archived?: boolean } = {},
): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name,
    conversation: conversation(`ses_${id}`, name, minutesAgo),
    subtasks: options.subtasks ?? [],
    owner: null,
    path: `/Users/happy/Tasks/${id}`,
    displayPath: `~/Tasks/${id}`,
    createdAt: 1,
    archived: options.archived === true,
    canArchive: true,
    membership: { orderKey: id },
});

const NOTES = {
    workspaceId: "ws_release" as HappyAgentWorktreeId,
    path: "/Users/happy/Tasks/release",
    // The subtask changed last of everything here.
    conversation: conversation("ses_notes", "Write the changelog", 1),
    subtasks: [],
};

const TASKS: readonly HappyAgentTask[] = [
    task("cmdk", "Fix Cmd K search", 5),
    task("release", "Release desktop", 40, { subtasks: [NOTES] }),
];

// Archived, never joined: found by name, but only below every live answer —
// even one that matches worse.
const OLD_TASK = task("search_old", "Search experiment, take one", 2, { archived: true });

const BOTS: readonly HappyAgentBot[] = [
    {
        id: "bot_happy" as HappyAgentBotId,
        workspaceId: "ws_happy" as HappyAgentWorktreeId,
        conversation: conversation("ses_happy", "Happy", 120),
        name: "Happy",
        username: "happy",
        orderKey: "a",
        path: "/Users/happy/Bots/happy",
        displayPath: "~/Bots/happy",
        avatar: { url: PHOTO, thumbhash: "h" },
        subtasks: [],
    },
];

// A project whose folder name contains "search", holding a chat whose title does not.
const PROJECTS = [
    {
        id: "prj_infra" as HappyAgentProjectId,
        path: "/Users/happy/search-infra",
        displayPath: "~/search-infra",
        name: "search-infra",
        orderKey: "a",
        kind: "regular",
        lifecycle: { phase: "ready" },
        activity: "idle",
        updatedAt: NOW - 10 * MINUTE,
        avatar: { url: PHOTO },
        conversations: [conversation("ses_index", "Index rebuild", 10)],
        worktrees: [] as HappyAgentWorktreeGroup[],
    },
] as unknown as readonly HappyAgentProjectGroup[];

const visit = (groupId: string, sessionId: string): HappyAgentRecentTabMemory => ({
    type: "session",
    groupId: groupId as HappyAgentGroupId,
    sessionId: sessionId as HappyAgentSessionId,
});

const input = (overrides: Partial<CommandPaletteInput> = {}): CommandPaletteInput => ({
    happyAgentId: "local",
    projects: PROJECTS,
    bots: BOTS,
    tasks: TASKS,
    taskDirectory: [...TASKS, OLD_TASK],
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
    ...overrides,
});

const ids = (result: ReturnType<typeof commandPaletteResults>) => result.rows.map((row) => row.id);

it("opens on the sidebar's work, last opened first, then other work; never a subtask or archived work", () => {
    const result = commandPaletteResults(
        input({
            chatId: "ses_cmdk",
            // The reader went to Happy, then to the project, then back to the task.
            visits: [
                visit("ws_cmdk", "ses_cmdk"),
                visit("prj_infra", "ses_index"),
                visit("ws_happy", "ses_happy"),
            ],
        }),
    );
    expect(result.sections.map((section) => section.id)).toEqual(["recent"]);
    expect(ids(result)).toEqual([
        // The sidebar's rows: the task on screen is left out, the visited ones
        // lead in the order they were visited, the rest follow by last change.
        "workspace:prj_infra",
        "bot:bot_happy",
        "task:release",
        // Other work: the project chat the reader opened.
        "chat:ses_index",
    ]);
    expect(ids(result)).not.toContain("chat:ses_notes");
    // The archived task changed more recently than anything here, but it is over.
    expect(ids(result)).not.toContain("task:search_old");
});

it("offers archived work in the empty palette only when nothing live is left", () => {
    const result = commandPaletteResults(
        input({ bots: [], projects: [], tasks: [], taskDirectory: [OLD_TASK] }),
    );
    expect(result.sections.map((section) => section.id)).toEqual(["recent"]);
    expect(ids(result)).toEqual(["task:search_old"]);
});

it("puts the sidebar first: a hidden bot or a project left out of the sidebar sinks", () => {
    const result = commandPaletteResults(
        input({
            sidebarListing: {
                botsHidden: new Set(["bot_happy"]),
                projectsHidden: true,
            },
            visits: [visit("ws_happy", "ses_happy"), visit("prj_infra", "ses_index")],
        }),
    );
    expect(ids(result).slice(0, 2)).toEqual(["task:cmdk", "task:release"]);
    expect(result.rows.find((row) => row.id === "bot:bot_happy")).toMatchObject({
        meta: "Hidden bot",
    });
});

it("wears the sidebar's marks: pictures in rounded tiles, else the placeholder its id picks", () => {
    const rows = commandPaletteResults(input()).rows;
    expect(rows.find((row) => row.id === "bot:bot_happy")).toMatchObject({
        glyph: { kind: "avatar", initials: "H", imageUrl: PHOTO },
    });
    expect(rows.find((row) => row.id === "workspace:prj_infra")).toMatchObject({
        glyph: { kind: "avatar", initials: "S", imageUrl: PHOTO },
    });
    expect(rows.find((row) => row.id === "task:cmdk")).toMatchObject({
        glyph: { kind: "avatar", placeholderSeed: "cmdk" },
    });
});

it("searches titles only, sidebar work first, and lets a subtask's title find its parent", () => {
    const result = commandPaletteResults(input({ query: "search" }));
    expect(result.sections.map((section) => section.id)).toEqual(["results", "archived"]);
    expect(ids(result)).toEqual([
        "workspace:prj_infra",
        "task:cmdk",
        // Its title starts with the query, which "Fix Cmd K search" does not,
        // but it is archived, so it answers last.
        "task:search_old",
    ]);
    // The project's chat lives in a "search" folder but is not called that.
    expect(ids(result)).not.toContain("chat:ses_index");

    const parent = commandPaletteResults(input({ query: "changelog" }));
    expect(ids(parent)).toEqual(["task:release"]);
});

it("ranks a recently opened match above an older one of the same quality", () => {
    const result = commandPaletteResults(
        input({ query: "e", visits: [visit("ws_release", "ses_notes")] }),
    );
    const work = result.sections.find((section) => section.id === "results");
    expect(work?.rows[0]?.id).toBe("task:release");
});

it("answers “fold sidebar” with the sidebar's own action and chord", () => {
    const result = commandPaletteResults(
        input({ query: "fold sidebar", sidebar: { hidden: false }, panel: { open: false } }),
    );
    expect(ids(result)).toEqual(["action:sidebar-toggle"]);
    expect(result.rows[0]).toMatchObject({
        title: "Hide sidebar",
        shortcut: { caps: APP_SHORTCUTS.sidebarToggle.caps },
        command: { kind: "sidebarHiddenUpdate", hidden: true },
    });
    const shown = commandPaletteResults(input({ query: "sidebar", sidebar: { hidden: true } }));
    expect(shown.rows[0]).toMatchObject({
        title: "Show sidebar",
        command: { kind: "sidebarHiddenUpdate", hidden: false },
    });
    // A window that keeps no fold of its own offers none.
    expect(commandPaletteResults(input({ query: "fold sidebar" })).rows).toEqual([]);
});

it("lists a section with a better answer first", () => {
    // "Hide sidebar" starts with what was typed; the task only contains it.
    const result = commandPaletteResults(
        input({
            query: "hide",
            tasks: [...TASKS, task("hidden", "Why tasks hide on reload", 1)],
            sidebar: { hidden: false },
        }),
    );
    expect(result.sections.map((section) => section.id)).toEqual([
        "actions",
        "results",
        "settings",
    ]);
});

it.each([false, true])(
    "searching voice opens the Voice settings route (experimental opt-in: %s)",
    (experimentalFeaturesEnabled) => {
        const result = commandPaletteResults(input({ projects: [], query: "voice" }));
        const voice = result.rows.find(
            (row) => row.kind === "command" && row.id === "settings:voice",
        );
        expect(voice).toMatchObject({
            title: "Settings › Voice",
            glyph: { kind: "icon", name: "call" },
            command: { kind: "settingsSectionOpen", section: "voice" },
        });
        expect(happyAgentSettingsCategoryExists("voice")).toBe(true);
        expect(
            result.rows.some((row) => row.kind === "command" && row.id === "settings:experimental"),
        ).toBe(false);
        void experimentalFeaturesEnabled;
    },
);

it("numbers the first nine rows that open something for ⌘1…⌘9, never an action or a setting", () => {
    const numberOf = (result: ReturnType<typeof commandPaletteResults>) =>
        result.rows.map((row) =>
            row.kind === "command" && result.numbered.includes(result.rows.indexOf(row))
                ? row.shortcut?.caps
                : undefined,
        );

    const empty = commandPaletteResults(input());
    expect(empty.numbered).toEqual(empty.rows.map((_, index) => index));
    expect(numberOf(empty)).toEqual(
        empty.rows.map((_, index) => commandShortcut(String(index + 1)).caps),
    );

    // Actions keep their own chords and settings their controls; the work and
    // the archived work below them are counted on in the order shown.
    const typed = commandPaletteResults(
        input({
            query: "hide",
            tasks: [...TASKS, task("hidden", "Why tasks hide on reload", 1)],
            taskDirectory: [
                ...TASKS,
                task("hidden_old", "Hide the old banner", 1, { archived: true }),
            ],
            sidebar: { hidden: false },
        }),
    );
    expect(typed.sections.map((section) => section.id)).toEqual([
        "actions",
        "results",
        "settings",
        "archived",
    ]);
    expect(typed.numbered.map((index) => typed.rows[index]!.id)).toEqual([
        "task:hidden",
        "task:hidden_old",
    ]);
    expect(typed.rows.find((row) => row.id === "action:sidebar-toggle")).toMatchObject({
        shortcut: { caps: APP_SHORTCUTS.sidebarToggle.caps },
    });
    expect(typed.rows.find((row) => row.id === "task:hidden")).toMatchObject({
        shortcut: { caps: commandShortcut("1").caps },
    });
    expect(typed.rows.find((row) => row.id === "task:hidden_old")).toMatchObject({
        shortcut: { caps: commandShortcut("2").caps },
    });

    // Only nine chords exist.
    const many = commandPaletteResults(
        input({
            query: "task",
            tasks: Array.from({ length: 12 }, (_, index) =>
                task(`t${index}`, `Task ${index}`, index),
            ),
        }),
    );
    expect(many.numbered.length).toBeLessThanOrEqual(9);
});

const surface = (
    id: string,
    name: string,
    type: HappyAgentSurface["type"],
    minutesAgo: number,
): HappyAgentSurface => ({
    id: id as HappyAgentSurfaceId,
    type,
    name,
    image: null,
    members: [],
    creatorUserId: null,
    chatAgentId: null,
    version: "1",
    updatedAt: NOW - minutesAgo * MINUTE,
});

const SPEC = surface("srf_spec", "Search ranking spec", { kind: "document" }, 30);
const NOTES_DOC = surface("srf_notes", "Search notes from the offsite", { kind: "document" }, 5);
const LAUNCH = surface("srf_launch", "Launch checklist", { kind: "todo" }, 20);
const ROADMAP = surface("srf_roadmap", "Search roadmap", { kind: "calendar" }, 15);
// Points at an artifact, which is found under its own title instead.
const KEPT = surface("srf_kept", "Search hero image", { kind: "artifact" }, 1);

const todo = (id: string, text: string, orderKey: string): HappyAgentSurfaceActiveTodo => ({
    id: id as HappyAgentSurfaceTodoId,
    surfaceId: LAUNCH.id,
    text,
    authorUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    version: "1",
    status: "active",
    orderKey,
    completedAt: null,
    deletedAt: null,
});

const artifact = (
    id: string,
    title: string,
    type: HappyAgentArtifact["type"],
    status: HappyAgentArtifact["status"] = "active",
): HappyAgentArtifact =>
    ({
        id: id as HappyAgentArtifactId,
        type,
        title,
        status,
        updatedAt: NOW,
    }) as HappyAgentArtifact;

const SOURCES = {
    surfaces: [SPEC, NOTES_DOC, LAUNCH, ROADMAP, KEPT],
    // The reader joined the spec and the checklist, not the offsite notes.
    joined: new Set([SPEC.id, LAUNCH.id, ROADMAP.id]),
    activeTodos: new Map([
        [
            LAUNCH.id,
            [todo("todo_copy", "Search copy review", "a"), todo("todo_ship", "Ship it", "b")],
        ],
    ]),
};

const ARTIFACTS = [
    artifact("art_deck", "Search launch deck", "html"),
    artifact("art_shot", "Search results screenshot", "image"),
    artifact("art_gone", "Search draft", "markdown", "deleted"),
];

it("finds documents, open todos, artifacts, and other shared Surfaces by name", () => {
    const result = commandPaletteResults(
        input({ query: "search", surfaces: SOURCES, artifacts: ARTIFACTS }),
    );
    expect(result.sections.map((section) => section.id)).toEqual(["results", "archived"]);
    // One list, the better match first whatever it is: every title here starts with
    // the query but the task's. Among equals, what the reader joined or the sidebar
    // lists comes first, then what changed last.
    expect(ids(result)).toEqual([
        "artifact:art_deck",
        "artifact:art_shot",
        "workspace:prj_infra",
        "surface:srf_roadmap",
        "surface:srf_spec",
        // A joined document before one the reader has not joined, however recent.
        "surface:srf_notes",
        // A todo is found by what it says, never by its list's name, and below the
        // lists themselves.
        "todo:todo_copy",
        "task:cmdk",
        "task:search_old",
    ]);
    // A deleted artifact is not offered; a calendar is another shared Surface; a
    // Surface that only points at an artifact is found under the artifact's own title.
    expect(ids(result)).not.toContain("artifact:art_gone");
    expect(ids(result)).not.toContain("surface:srf_kept");

    expect(result.rows.find((row) => row.id === "surface:srf_notes")).toMatchObject({
        meta: "Document · not joined",
        glyph: { kind: "icon", name: "doc" },
        command: { kind: "surfaceOpen", happyAgentId: "local", surfaceId: "srf_notes" },
    });
    expect(result.rows.find((row) => row.id === "todo:todo_copy")).toMatchObject({
        title: "Search copy review",
        meta: "Launch checklist",
        command: { kind: "surfaceOpen", happyAgentId: "local", surfaceId: "srf_launch" },
    });
    expect(result.rows.find((row) => row.id === "artifact:art_deck")).toMatchObject({
        meta: "Web page",
        glyph: { kind: "icon", name: "globe" },
        command: { kind: "artifactOpen", happyAgentId: "local", artifactId: "art_deck" },
    });
});

it("finds a todo list by its name and says how much is left in it", () => {
    const result = commandPaletteResults(input({ query: "launch", surfaces: SOURCES }));
    expect(result.sections.map((section) => section.id)).toEqual(["results"]);
    expect(result.rows[0]).toMatchObject({
        id: "surface:srf_launch",
        meta: "Todo list · 2 open",
        glyph: { kind: "icon", name: "tasks" },
    });
    // Numbered like the work: these rows go somewhere.
    expect(result.numbered).toEqual([0]);
});

it("offers no documents, todos, or artifacts on an empty palette", () => {
    const result = commandPaletteResults(input({ surfaces: SOURCES, artifacts: ARTIFACTS }));
    expect(result.sections.map((section) => section.id)).toEqual(["recent"]);
});

const VAULT = surface("srf_vault", "Team vault", { kind: "vault" }, 50);

const REMOTE: readonly HappyAgentQuickSearchHit[] = [
    {
        type: "vault_file",
        key: "vault_file:vf_budget",
        rank: 1,
        surfaceId: VAULT.id,
        fileId: "vf_budget" as HappyAgentVaultItemId,
        name: "budget.md",
        path: "/Reports/budget.md",
        kind: "file",
        match: "content",
        innerPath: null,
        line: 3,
        snippet: "the search budget for Q3",
    },
    {
        type: "document",
        key: "document:srf_spec",
        rank: 2,
        surfaceId: SPEC.id,
        name: "Search ranking spec",
        match: "content",
        line: 12,
        snippet: "…ranking search results by…",
    },
    // Archived work is listed apart, and work in no known workspace cannot be opened.
    {
        type: "agent",
        key: "agent:ses_search_old",
        rank: 3,
        agentId: "ses_search_old" as HappyAgentSessionId,
        title: "Search experiment, take one",
        kind: "task",
        archived: true,
        workspaceId: "ws_search_old" as HappyAgentWorktreeId,
        projectId: null,
    },
    {
        type: "agent",
        key: "agent:ses_nowhere",
        rank: 4,
        agentId: "ses_nowhere" as HappyAgentSessionId,
        title: "Search nowhere",
        kind: "subtask",
        archived: false,
        workspaceId: null,
        projectId: null,
    },
    // A chat this window does not hold opens in the workspace the Happy Agent names.
    {
        type: "agent",
        key: "agent:ses_elsewhere",
        rank: 5,
        agentId: "ses_elsewhere" as HappyAgentSessionId,
        title: "Search elsewhere",
        kind: "chat",
        archived: false,
        workspaceId: "prj_infra" as HappyAgentProjectId,
        projectId: "prj_infra" as HappyAgentProjectId,
    },
];

it("fuses the Happy Agent's answer into the found rows, keeping the top row and every local row's identity", () => {
    const base = input({
        query: "search",
        surfaces: { ...SOURCES, surfaces: [...SOURCES.surfaces, VAULT] },
    });
    const before = commandPaletteResults(base);
    const after = commandPaletteResults({ ...base, remote: REMOTE });
    const found = (result: ReturnType<typeof commandPaletteResults>) =>
        result.sections.find((section) => section.id === "results")!.rows;
    // The row the reader was looking at stays at the top; the vault file the Happy
    // Agent ranked first, and the spec it found by its text too, come next.
    expect(
        found(after)
            .map((row) => row.id)
            .slice(0, 3),
    ).toEqual([found(before)[0]!.id, "surface:srf_spec", "vault_file:vf_budget"]);
    // A document both found is one row, keeping this window's id, saying where the words are.
    expect(found(after).filter((row) => row.id === "surface:srf_spec")).toHaveLength(1);
    expect(after.rows.find((row) => row.id === "surface:srf_spec")).toMatchObject({
        meta: "…ranking search results by…",
        command: { kind: "surfaceOpen", surfaceId: "srf_spec" },
    });
    expect(after.rows.find((row) => row.id === "vault_file:vf_budget")).toMatchObject({
        title: "budget.md",
        meta: "the search budget for Q3",
        glyph: { kind: "icon", name: "doc" },
        command: {
            kind: "vaultItemOpen",
            happyAgentId: "local",
            surfaceId: "srf_vault",
            itemId: "vf_budget",
        },
    });
    expect(ids(after)).not.toContain("agent:ses_nowhere");
    expect(after.rows.find((row) => row.id === "agent:ses_elsewhere")).toMatchObject({
        meta: "Chat · search-infra",
        command: {
            kind: "chatOpen",
            happyAgentId: "local",
            groupId: "prj_infra",
            chatId: "ses_elsewhere",
            archived: false,
        },
    });
    expect(ids(after).filter((id) => id === "task:search_old")).toHaveLength(1);
    expect(after.found.keys[0]).toBe(before.found.keys[0]);
});

it("keeps the rows the reader has passed where they were when the Happy Agent answers", () => {
    const base = input({ query: "search", surfaces: SOURCES, artifacts: ARTIFACTS });
    const before = commandPaletteResults(base);
    // The reader arrowed down to the third row before the answer arrived.
    const held = commandPaletteHeld(before, 2);
    expect(held).toEqual(before.found.keys.slice(0, 3));
    const after = commandPaletteResults({ ...base, remote: REMOTE, held });
    expect(after.rows.slice(0, 3).map((row) => row.id)).toEqual(
        before.rows.slice(0, 3).map((row) => row.id),
    );
    expect(ids(after)).toContain("vault_file:vf_budget");
    // Arrowing on through what is shown now holds what is shown now.
    const further = commandPaletteResults({
        ...base,
        remote: REMOTE,
        held: commandPaletteHeld(after, 4),
    });
    expect(ids(further)).toEqual(ids(after));
});
