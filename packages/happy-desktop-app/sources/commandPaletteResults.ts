import type {
    HappyAgentFileTabKind,
    HappyAgentProjectGroup,
    HappyAgentSessionSummary,
    HappyAgentWorktreeGroup,
    ScrollbarVisibility,
    ThemeMode,
} from "happy-desktop-state";
import { happyAgentSessionGroupIdOf } from "happy-desktop-state";
import type { CommandPaletteRowEmphasis, CommandShortcut, IconName } from "happy-desktop-ui";
import { APP_SHORTCUTS } from "./appShortcuts";

/**
 * What the command palette offers, derived from the snapshots the window is
 * already reading.
 *
 * Nothing here is stored. The palette holds a query and a highlight; every row
 * under them is recomputed from live state at render time, so a session that
 * finishes, a checkout that appears, or a setting changed from the row itself
 * is reflected without the palette asking anyone for fresh data.
 *
 * The transform is deliberately a plain function over explicit inputs rather
 * than a hook: the same rows fill the palette and the held-Command preview, and
 * neither of those two surfaces should be able to offer something the other
 * does not.
 */

/**
 * The leading mark on a row: a chosen glyph, the thing's own picture, or the
 * product's own mark for the kind of news the row is.
 *
 * One lane with one occupant, decided here rather than by whichever of several
 * optional fields happened to be set. An update wears the orange arrow because
 * it is an update, not because a row somewhere named that glyph.
 */
export type CommandPaletteGlyph =
    | { readonly kind: "icon"; readonly name: IconName }
    | { readonly kind: "avatar"; readonly initials: string; readonly imageUrl?: string }
    | { readonly kind: "emphasis"; readonly emphasis: CommandPaletteRowEmphasis };

/**
 * What committing a row does. It is data rather than a callback because the
 * surface that owns navigation, the workspace stores, and the update is the one
 * that must perform it; this module decides what is offered, not what happens.
 */
export type CommandPaletteCommand =
    | {
          readonly kind: "chatOpen";
          readonly happyAgentId: string;
          readonly groupId: string;
          readonly chatId: string;
          /** A closed session has to be restored before it can be addressed. */
          readonly archived: boolean;
      }
    | { readonly kind: "workspaceOpen"; readonly happyAgentId: string; readonly groupId: string }
    | {
          readonly kind: "fileOpen";
          readonly happyAgentId: string;
          readonly groupId: string;
          readonly path: string;
          readonly fileKind: HappyAgentFileTabKind;
      }
    | { readonly kind: "sessionCreate" }
    | { readonly kind: "workspaceCreate" }
    | { readonly kind: "settingsOpen" }
    | { readonly kind: "settingsSectionOpen"; readonly section: string }
    | { readonly kind: "updateApply" };

/** A row that goes somewhere or does something, and then closes the palette. */
export interface CommandPaletteCommandRow {
    readonly kind: "command";
    readonly id: string;
    readonly title: string;
    /** The quiet second line: where a chat lives, what a file's path is. */
    readonly meta?: string;
    readonly glyph: CommandPaletteGlyph;
    /** The chord that does the same thing outside the palette, shown as a cap. */
    readonly shortcut?: CommandShortcut;
    readonly command: CommandPaletteCommand;
}

/**
 * A setting the reader can change without leaving the palette. The row carries
 * the setting's current value and the value committing it would move to, so the
 * surface renders the real control and dispatches one typed action rather than
 * deciding what "next" means for each kind of control.
 */
export type CommandPaletteSettingRow =
    | (CommandPaletteSettingRowBase & {
          readonly setting: "themeMode";
          readonly control: {
              readonly kind: "segmented";
              readonly value: ThemeMode;
              readonly segments: readonly { readonly value: ThemeMode; readonly label: string }[];
              readonly next: ThemeMode;
          };
      })
    | (CommandPaletteSettingRowBase & {
          readonly setting: "scrollbarVisibility";
          readonly control: {
              readonly kind: "segmented";
              readonly value: ScrollbarVisibility;
              readonly segments: readonly {
                  readonly value: ScrollbarVisibility;
                  readonly label: string;
              }[];
              readonly next: ScrollbarVisibility;
          };
      })
    | (CommandPaletteSettingRowBase & {
          readonly setting: "titleShimmer";
          readonly control: {
              readonly kind: "switch";
              readonly checked: boolean;
              readonly next: boolean;
          };
      })
    | (CommandPaletteSettingRowBase & {
          readonly setting: "experimentalFeatures";
          readonly control: {
              readonly kind: "switch";
              readonly checked: boolean;
              readonly next: boolean;
          };
      });

export interface CommandPaletteSettingRowBase {
    readonly kind: "setting";
    readonly id: string;
    /** The settings surface's own wording, so the palette row is that row. */
    readonly label: string;
    readonly description: string;
    /** The control's DOM id, which the row's label points at. */
    readonly controlId: string;
}

export type CommandPaletteRow = CommandPaletteCommandRow | CommandPaletteSettingRow;

/** The sections a typed query offers, in the fixed order the palette lists them. */
export type CommandPaletteSectionId =
    | "suggestions"
    | "chats"
    | "workspaces"
    | "tabs"
    | "actions"
    | "settings";

export interface CommandPaletteSection {
    readonly id: CommandPaletteSectionId;
    readonly label: string;
    readonly rows: readonly CommandPaletteRow[];
}

export interface CommandPaletteResults {
    readonly sections: readonly CommandPaletteSection[];
    /**
     * Every offered row, in the order the sections show them. This is the index
     * space the palette's highlight addresses: the reader arrows through one
     * list, not through sections.
     */
    readonly rows: readonly CommandPaletteRow[];
}

/** One tab of the open workspace, as the surface that owns the strip states it. */
export type CommandPaletteTab =
    | { readonly kind: "session"; readonly id: string; readonly title: string }
    | {
          readonly kind: "file";
          readonly id: string;
          readonly path: string;
          readonly fileKind: HappyAgentFileTabKind;
          /** The glyph the strip gave this file, derived from its type. */
          readonly icon: IconName;
      };

/**
 * Where the reader is and what they could do from there.
 *
 * It is stated apart from the query and the settings values because the
 * held-Command preview offers the same suggestions without either: it is not a
 * search, and it changes nothing, so it must not have to read the theme to say
 * what a reader could do next.
 */
export interface CommandPaletteContext {
    /** The machine whose work the palette lists: the one the address names. */
    readonly happyAgentId: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    /** The addressed project or worktree, when the address names one. */
    readonly groupId?: string;
    /** Sessions the host still holds after taking them out of their strips. */
    readonly archivedSessions: readonly HappyAgentSessionSummary[];
    /** The open workspace's tabs, in the order its strip shows them. */
    readonly tabs: readonly CommandPaletteTab[];
    /**
     * The update this window can apply right now. Supplied only once it is
     * downloaded and there is something to apply it with, because a row that
     * offers to update and then does nothing is worse than no row.
     */
    readonly updateReady?: { readonly action: "refresh" | "restart"; readonly version?: string };
    /** Whether a new chat can be started where the reader currently is. */
    readonly sessionCreateAvailable: boolean;
    /** Whether a new workspace can be made in the addressed project. */
    readonly workspaceCreateAvailable: boolean;
}

export interface CommandPaletteInput extends CommandPaletteContext {
    readonly query: string;
    readonly themeMode: ThemeMode;
    readonly scrollbarVisibility: ScrollbarVisibility;
    readonly titleShimmerEnabled: boolean;
    readonly experimentalFeaturesEnabled: boolean;
}

/** How many rows a typed query's section shows before it stops. */
const SECTION_LIMIT = 6;
/** How many recent chats the empty palette suggests. */
const RECENT_LIMIT = 5;
/** How many suggestions the held-Command preview shows without a query. */
export const COMMAND_PALETTE_PREVIEW_LIMIT = 6;

const THEME_SEGMENTS: readonly { readonly value: ThemeMode; readonly label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
];

const SCROLLBAR_SEGMENTS: readonly {
    readonly value: ScrollbarVisibility;
    readonly label: string;
}[] = [
    { value: "automatic", label: "Automatic" },
    { value: "always", label: "Always visible" },
];

/**
 * The settings destinations the palette can only send the reader to.
 *
 * The four switchable settings above are absent here: they are answered in the
 * palette itself. These are the ones whose control needs a catalog, an account,
 * or a whole page behind it, so the honest offer is the page. Their section ids
 * are the ones `HAPPY_AGENT_SETTINGS_CATEGORIES` addresses.
 */
const SETTINGS_JUMPS: readonly {
    readonly id: string;
    readonly title: string;
    readonly section: string;
    /** The category as the settings window names it, so it can be searched for. */
    readonly sectionLabel: string;
    readonly icon: IconName;
    /** Extra words this row answers to, beyond its own title. */
    readonly keywords: string;
}[] = [
    {
        id: "settings:general",
        title: "Settings › General",
        section: "general",
        sectionLabel: "General",
        icon: "settings",
        keywords: "appearance theme scrollbars new sessions experimental",
    },
    {
        id: "settings:account",
        title: "Settings › Account",
        section: "account",
        sectionLabel: "Account",
        icon: "users",
        keywords: "profile name email photo happy account connect disconnect workos",
    },
    {
        id: "settings:instructions",
        title: "Settings › Instructions",
        section: "instructions",
        sectionLabel: "Instructions",
        icon: "doc",
        keywords: "agents.md security.md",
    },
    {
        id: "settings:secrets",
        title: "Settings › Secrets",
        section: "secrets",
        sectionLabel: "Secrets",
        icon: "lock",
        keywords: "environment variables credentials tokens api keys",
    },
    {
        id: "settings:providers",
        title: "Settings › Providers",
        section: "providers",
        sectionLabel: "Providers",
        icon: "globe",
        keywords: "models accounts keys",
    },
    {
        id: "settings:usage",
        title: "Settings › Usage",
        section: "usage",
        sectionLabel: "Usage",
        icon: "zap",
        keywords: "spend limits plan",
    },
    {
        id: "settings:mobile-access",
        title: "Settings › Mobile Access",
        section: "mobile-access",
        sectionLabel: "Mobile Access",
        icon: "mobile",
        keywords: "phone pairing happy mobile",
    },
    {
        id: "settings:debug",
        title: "Settings › Dev Tools",
        section: "debug",
        sectionLabel: "Dev Tools",
        icon: "code",
        keywords: "inspector profiler debug log",
    },
    {
        id: "settings:default-model",
        title: "Default model",
        section: "general",
        sectionLabel: "General",
        icon: "settings",
        keywords: "chosen from the models the enabled providers offer new sessions",
    },
    {
        id: "settings:effort",
        title: "Reasoning effort",
        section: "general",
        sectionLabel: "General",
        icon: "settings",
        keywords: "how much the model is asked to think before it answers thinking",
    },
    {
        id: "settings:permission-mode",
        title: "Default access mode",
        section: "general",
        sectionLabel: "General",
        icon: "settings",
        keywords: "how much of the machine a new session may touch without asking permissions",
    },
];

/** The second line under a chat: the workspace it belongs to. */
function groupMeta(project: HappyAgentProjectGroup, worktree?: HappyAgentWorktreeGroup): string {
    return worktree ? `${project.name} / ${worktree.name}` : project.name;
}

/**
 * The project a group id belongs to, and the worktree when the id is one.
 *
 * The window has the same lookup for its sidebar; this module keeps its own so
 * it stays a plain transform of its inputs and can be read on its own.
 */
function groupFind(
    projects: readonly HappyAgentProjectGroup[],
    groupId: string | undefined,
):
    | { readonly project: HappyAgentProjectGroup; readonly worktree?: HappyAgentWorktreeGroup }
    | undefined {
    if (groupId === undefined) return undefined;
    for (const project of projects) {
        if (project.id === groupId) return { project };
        for (const worktree of project.worktrees)
            if (worktree.id === groupId) return { project, worktree };
    }
    return undefined;
}

/**
 * How well a piece of text answers the query, lower being better, `undefined`
 * being not at all.
 *
 * Three ranks and no scoring library: a title that starts with what was typed,
 * a word inside it that does, and finally the text merely containing it. That
 * ordering is the whole of what a reader expects from a palette, and anything
 * cleverer would have to explain itself every time it was wrong.
 */
function textRank(text: string, query: string): number | undefined {
    const haystack = text.toLowerCase();
    if (haystack.startsWith(query)) return 0;
    let index = haystack.indexOf(query);
    while (index > 0) {
        if (!/[a-z0-9]/.test(haystack[index - 1])) return 1;
        index = haystack.indexOf(query, index + 1);
    }
    return haystack.includes(query) ? 2 : undefined;
}

/**
 * A row's rank over its title and its supporting text. Anything that is not the
 * title is demoted below every title match, so a chat whose name contains the
 * query is never pushed under one whose folder happens to.
 */
const SECONDARY_PENALTY = 3;

function rowRank(
    query: string,
    title: string,
    ...secondary: (string | undefined)[]
): number | undefined {
    const primary = textRank(title, query);
    if (primary === 0) return 0;
    let best = primary;
    for (const text of secondary) {
        if (text === undefined) continue;
        const rank = textRank(text, query);
        if (rank === undefined) continue;
        const demoted = rank + SECONDARY_PENALTY;
        if (best === undefined || demoted < best) best = demoted;
    }
    return best;
}

/** A row offered by a match, carried with what orders it against its peers. */
interface Ranked {
    readonly row: CommandPaletteRow;
    readonly rank: number;
    /** Epoch milliseconds of last activity, for the entities that have one. */
    readonly updatedAt: number;
}

/**
 * Ranked rows in the order the palette lists them: best match first, most
 * recently active first among equals, and otherwise exactly the order they were
 * offered in — `sort` is stable, so nothing shuffles between keystrokes.
 */
function ranked(rows: readonly Ranked[], limit: number): CommandPaletteRow[] {
    return [...rows]
        .sort((left, right) => left.rank - right.rank || right.updatedAt - left.updatedAt)
        .slice(0, limit)
        .map((entry) => entry.row);
}

/** Every session of every workspace on this machine, open ones and closed ones. */
function chatRows(input: CommandPaletteInput): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const rows: Ranked[] = [];
    const openIds = new Set<string>();
    const push = (
        project: HappyAgentProjectGroup,
        worktree: HappyAgentWorktreeGroup | undefined,
        summary: { readonly id: string; readonly title: string; readonly updatedAt: number },
    ) => {
        const meta = groupMeta(project, worktree);
        const rank = rowRank(query, summary.title, meta);
        if (rank === undefined) return;
        rows.push({
            rank,
            updatedAt: summary.updatedAt,
            row: {
                kind: "command",
                id: `chat:${summary.id}`,
                title: summary.title,
                meta,
                glyph: { kind: "icon", name: "chat" },
                command: {
                    kind: "chatOpen",
                    happyAgentId: input.happyAgentId,
                    groupId: worktree ? worktree.id : project.id,
                    chatId: summary.id,
                    archived: false,
                },
            },
        });
    };
    for (const project of input.projects) {
        for (const summary of project.conversations) {
            openIds.add(summary.id);
            push(project, undefined, summary);
        }
        for (const worktree of project.worktrees)
            for (const summary of worktree.conversations) {
                openIds.add(summary.id);
                push(project, worktree, summary);
            }
    }
    for (const session of input.archivedSessions) {
        // A delegated chat has no row of its own anywhere else in the product;
        // it is opened by the session that runs it, so it is not offered here.
        if (session.parentSessionId !== undefined || openIds.has(session.id)) continue;
        const owner = groupFind(input.projects, happyAgentSessionGroupIdOf(session));
        if (!owner) continue;
        const title = session.title?.trim() || `Session ${session.id.slice(0, 8)}`;
        const meta = groupMeta(owner.project, owner.worktree);
        const rank = rowRank(query, title, meta);
        if (rank === undefined) continue;
        rows.push({
            rank,
            updatedAt: session.lastMessageAt ?? session.updatedAt,
            row: {
                kind: "command",
                id: `chat:${session.id}`,
                title,
                meta,
                // Closed sessions wear the recents glyph, exactly as the
                // workspace's own history menu marks them.
                glyph: { kind: "icon", name: "history" },
                command: {
                    kind: "chatOpen",
                    happyAgentId: input.happyAgentId,
                    groupId: happyAgentSessionGroupIdOf(session),
                    chatId: session.id,
                    archived: true,
                },
            },
        });
    }
    return rows;
}

/** Every project and worktree, named the way the sidebar names them. */
function workspaceRows(input: CommandPaletteInput): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const rows: Ranked[] = [];
    for (const project of input.projects) {
        const rank = rowRank(query, project.name);
        if (rank !== undefined)
            rows.push({
                rank,
                updatedAt: project.updatedAt,
                row: {
                    kind: "command",
                    id: `workspace:${project.id}`,
                    title: project.name,
                    glyph:
                        // The catch-all project has no remote to draw a picture
                        // from and an "H" plaque would read as one more
                        // repository, so it wears a house — as in the sidebar.
                        project.kind === "home"
                            ? { kind: "icon", name: "home" }
                            : {
                                  kind: "avatar",
                                  initials: project.name.slice(0, 1).toUpperCase(),
                                  ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
                              },
                    command: {
                        kind: "workspaceOpen",
                        happyAgentId: input.happyAgentId,
                        groupId: project.id,
                    },
                },
            });
        for (const worktree of project.worktrees) {
            const worktreeRank = rowRank(query, worktree.name, project.name);
            if (worktreeRank === undefined) continue;
            rows.push({
                rank: worktreeRank,
                updatedAt: worktree.updatedAt,
                row: {
                    kind: "command",
                    id: `workspace:${worktree.id}`,
                    title: worktree.name,
                    meta: project.name,
                    glyph: { kind: "icon", name: "branch" },
                    command: {
                        kind: "workspaceOpen",
                        happyAgentId: input.happyAgentId,
                        groupId: worktree.id,
                    },
                },
            });
        }
    }
    return rows;
}

/** The open workspace's own strip, so a tab already open is one keystroke away. */
function tabRows(input: CommandPaletteInput): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const groupId = input.groupId;
    if (groupId === undefined) return [];
    const rows: Ranked[] = [];
    for (const tab of input.tabs) {
        if (tab.kind === "session") {
            const rank = rowRank(query, tab.title);
            if (rank === undefined) continue;
            rows.push({
                rank,
                updatedAt: 0,
                row: {
                    kind: "command",
                    id: `tab:${tab.id}`,
                    title: tab.title,
                    glyph: { kind: "icon", name: "chat" },
                    command: {
                        kind: "chatOpen",
                        happyAgentId: input.happyAgentId,
                        groupId,
                        chatId: tab.id,
                        archived: false,
                    },
                },
            });
            continue;
        }
        const name = tab.path.split("/").at(-1) ?? tab.path;
        const rank = rowRank(query, name, tab.path);
        if (rank === undefined) continue;
        rows.push({
            rank,
            updatedAt: 0,
            row: {
                kind: "command",
                id: `tab:${tab.id}`,
                title: name,
                meta: tab.path,
                glyph: { kind: "icon", name: tab.icon },
                command: {
                    kind: "fileOpen",
                    happyAgentId: input.happyAgentId,
                    groupId,
                    path: tab.path,
                    fileKind: tab.fileKind,
                },
            },
        });
    }
    return rows;
}

/** The four settings the palette answers in place, as their own settings rows. */
function settingRows(input: CommandPaletteInput): CommandPaletteSettingRow[] {
    const themeIndex = THEME_SEGMENTS.findIndex((segment) => segment.value === input.themeMode);
    const scrollbarIndex = SCROLLBAR_SEGMENTS.findIndex(
        (segment) => segment.value === input.scrollbarVisibility,
    );
    return [
        {
            kind: "setting",
            setting: "themeMode",
            id: "setting:theme",
            label: "Theme",
            description: "Applies to this window immediately",
            controlId: "happy-agent-palette-theme",
            control: {
                kind: "segmented",
                value: input.themeMode,
                segments: THEME_SEGMENTS,
                next: THEME_SEGMENTS[(themeIndex + 1) % THEME_SEGMENTS.length].value,
            },
        },
        {
            kind: "setting",
            setting: "scrollbarVisibility",
            id: "setting:scrollbars",
            label: "Scrollbars",
            description: "Automatic hides two seconds after user scrolling stops",
            controlId: "happy-agent-palette-scrollbars",
            control: {
                kind: "segmented",
                value: input.scrollbarVisibility,
                segments: SCROLLBAR_SEGMENTS,
                next: SCROLLBAR_SEGMENTS[(scrollbarIndex + 1) % SCROLLBAR_SEGMENTS.length].value,
            },
        },
        {
            kind: "setting",
            setting: "titleShimmer",
            id: "setting:title-shimmer",
            label: "Shimmer active titles",
            description: "Animates running session, project, and workspace names",
            controlId: "happy-agent-palette-title-shimmer",
            control: {
                kind: "switch",
                checked: input.titleShimmerEnabled,
                next: !input.titleShimmerEnabled,
            },
        },
        {
            kind: "setting",
            setting: "experimentalFeatures",
            id: "setting:experimental-features",
            label: "Enable experimental features",
            description: "Shows Inbox and Folders in the sidebar. Kept on this machine only.",
            controlId: "happy-agent-palette-experimental-features",
            control: {
                kind: "switch",
                checked: input.experimentalFeaturesEnabled,
                next: !input.experimentalFeaturesEnabled,
            },
        },
    ];
}

/**
 * Where in the settings window each of the four answerable settings is found.
 *
 * A reader looking for the theme may well type the section they remember it
 * being under rather than its name, so every settings row answers to its own
 * section as well — behind its label and description, which is why the words
 * are stated here rather than folded into either.
 */
const SETTINGS_INLINE_SECTIONS: Record<CommandPaletteSettingRow["setting"], string> = {
    experimentalFeatures: "Settings General Experimental features",
    scrollbarVisibility: "Settings General Appearance",
    themeMode: "Settings General Appearance",
    titleShimmer: "Settings General Appearance",
};

/** Settings the palette can change in place, then the pages it can only open. */
function settingsSectionRows(input: CommandPaletteInput): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const rows: Ranked[] = [];
    for (const row of settingRows(input)) {
        const rank = rowRank(
            query,
            row.label,
            row.description,
            SETTINGS_INLINE_SECTIONS[row.setting],
        );
        if (rank === undefined) continue;
        rows.push({ rank, updatedAt: 0, row });
    }
    for (const jump of SETTINGS_JUMPS) {
        // The section the row leads to is searchable too: "general" has to
        // reach the rows that live under General, not only the page itself.
        const rank = rowRank(query, jump.title, jump.sectionLabel, jump.keywords);
        if (rank === undefined) continue;
        rows.push({
            rank,
            updatedAt: 0,
            row: {
                kind: "command",
                id: jump.id,
                title: jump.title,
                glyph: { kind: "icon", name: jump.icon },
                command: { kind: "settingsSectionOpen", section: jump.section },
            },
        });
    }
    return rows;
}

/** The row that applies a downloaded update, offered only when one is waiting. */
function updateRow(context: CommandPaletteContext): CommandPaletteCommandRow | undefined {
    const update = context.updateReady;
    if (!update) return undefined;
    return {
        kind: "command",
        id: "action:update",
        title: "Update Happy",
        meta: update.version
            ? `Version ${update.version}`
            : update.action === "restart"
              ? "Restart to finish"
              : "Reload to finish",
        // The same mark the sidebar footer gives a waiting update, so the news
        // reads the same wherever this window offers it.
        glyph: { kind: "emphasis", emphasis: "update" },
        command: { kind: "updateApply" },
    };
}

/**
 * The things the window can do from anywhere, each with its own chord. The
 * update joins them only under a typed query: without one it already has the
 * top row, and offering it twice would be the palette shouting.
 */
function actionRows(
    context: CommandPaletteContext,
    update?: CommandPaletteCommandRow,
): CommandPaletteCommandRow[] {
    return [
        ...(context.sessionCreateAvailable
            ? [
                  {
                      kind: "command" as const,
                      id: "action:session-create",
                      title: "New chat",
                      glyph: { kind: "icon" as const, name: "plus" as const },
                      shortcut: APP_SHORTCUTS.sessionCreate,
                      command: { kind: "sessionCreate" as const },
                  },
              ]
            : []),
        ...(context.workspaceCreateAvailable
            ? [
                  {
                      kind: "command" as const,
                      id: "action:workspace-create",
                      title: "New workspace",
                      glyph: { kind: "icon" as const, name: "branch" as const },
                      shortcut: APP_SHORTCUTS.workspaceCreate,
                      command: { kind: "workspaceCreate" as const },
                  },
              ]
            : []),
        {
            kind: "command" as const,
            id: "action:settings",
            title: "Open settings",
            glyph: { kind: "icon" as const, name: "settings" as const },
            command: { kind: "settingsOpen" as const },
        },
        ...(update ? [update] : []),
    ];
}

/**
 * What the palette offers before anything is typed, and what the held-Command
 * preview shows: the update if one is waiting, the chats this workspace was
 * last working on, and the things the window can always do.
 *
 * Recency is `updatedAt` rather than a record of local clicks, so the palette
 * and the workspace's own history menu answer "what was I just working on here"
 * with the same list in the same order.
 */
export function commandPaletteSuggestionRows(context: CommandPaletteContext): CommandPaletteRow[] {
    const groupId = context.groupId;
    const owner = groupFind(context.projects, groupId);
    const recent: Ranked[] = [];
    if (owner && groupId !== undefined) {
        const conversations = owner.worktree
            ? owner.worktree.conversations
            : owner.project.conversations;
        const openIds = new Set(conversations.map((summary) => summary.id));
        for (const summary of conversations)
            recent.push({
                rank: 0,
                updatedAt: summary.updatedAt,
                row: {
                    kind: "command",
                    id: `chat:${summary.id}`,
                    title: summary.title,
                    meta: groupMeta(owner.project, owner.worktree),
                    glyph: { kind: "icon", name: "chat" },
                    command: {
                        kind: "chatOpen",
                        happyAgentId: context.happyAgentId,
                        groupId,
                        chatId: summary.id,
                        archived: false,
                    },
                },
            });
        for (const session of context.archivedSessions) {
            if (
                session.parentSessionId !== undefined ||
                happyAgentSessionGroupIdOf(session) !== context.groupId ||
                openIds.has(session.id)
            )
                continue;
            recent.push({
                rank: 0,
                updatedAt: session.lastMessageAt ?? session.updatedAt,
                row: {
                    kind: "command",
                    id: `chat:${session.id}`,
                    title: session.title?.trim() || `Session ${session.id.slice(0, 8)}`,
                    meta: groupMeta(owner.project, owner.worktree),
                    glyph: { kind: "icon", name: "history" },
                    command: {
                        kind: "chatOpen",
                        happyAgentId: context.happyAgentId,
                        groupId,
                        chatId: session.id,
                        archived: true,
                    },
                },
            });
        }
    }
    const update = updateRow(context);
    return [...(update ? [update] : []), ...ranked(recent, RECENT_LIMIT), ...actionRows(context)];
}

/**
 * Everything the palette is currently offering, as the flat list its highlight
 * addresses and as the sections it draws.
 *
 * An empty query answers with suggestions; anything typed searches the whole
 * machine, because the moment a reader types they are looking for something
 * they know the name of rather than something near where they are standing.
 */
export function commandPaletteResults(input: CommandPaletteInput): CommandPaletteResults {
    const query = input.query.trim().toLowerCase();
    const sections: CommandPaletteSection[] = [];
    if (query.length === 0) {
        const rows = commandPaletteSuggestionRows(input);
        if (rows.length > 0) sections.push({ id: "suggestions", label: "Suggestions", rows });
    } else {
        const offered: readonly {
            readonly id: CommandPaletteSectionId;
            readonly label: string;
            readonly rows: readonly Ranked[];
        }[] = [
            { id: "chats", label: "Chats", rows: chatRows(input) },
            { id: "workspaces", label: "Workspaces", rows: workspaceRows(input) },
            { id: "tabs", label: "Tabs", rows: tabRows(input) },
            // Actions come before settings because they are few and each one is
            // something a reader meant to do, while settings are the long tail:
            // typing "new" is someone asking for a new chat, not for the page
            // where the model a new session starts with is chosen.
            {
                id: "actions",
                label: "Actions",
                rows: actionRows(input, updateRow(input)).flatMap((row) => {
                    const rank = rowRank(query, row.title, row.meta);
                    return rank === undefined ? [] : [{ rank, updatedAt: 0, row }];
                }),
            },
            { id: "settings", label: "Settings", rows: settingsSectionRows(input) },
        ];
        for (const section of offered) {
            const rows = ranked(section.rows, SECTION_LIMIT);
            if (rows.length > 0) sections.push({ id: section.id, label: section.label, rows });
        }
    }
    return { sections, rows: sections.flatMap((section) => section.rows) };
}

/**
 * Where the highlight lands after an arrow key. It wraps, because a list this
 * short is a ring: pressing Down at the bottom is a reader asking for the top.
 */
export function commandPaletteIndexMove(
    current: number,
    direction: 1 | -1,
    length: number,
): number {
    if (length === 0) return 0;
    const clamped = Math.min(Math.max(current, 0), length - 1);
    return (clamped + direction + length) % length;
}

/**
 * The row a highlight names. The index is clamped rather than trusted, because
 * the list narrows under it as the query is typed.
 */
export function commandPaletteRowAt(
    results: CommandPaletteResults,
    index: number,
): CommandPaletteRow | undefined {
    if (results.rows.length === 0) return undefined;
    return results.rows[Math.min(Math.max(index, 0), results.rows.length - 1)];
}
