import type {
    HappyAgentBot,
    HappyAgentBotSubtask,
    HappyAgentRecentTabMemory,
    HappyAgentFileTabKind,
    HappyAgentProjectGroup,
    HappyAgentSessionSummary,
    HappyAgentTask,
    HappyAgentWorktreeGroup,
    HappyAgentLinkOpenPlacement,
    ScrollbarVisibility,
    ThemeMode,
} from "happy-desktop-state";
import { happyAgentSessionGroupIdOf } from "happy-desktop-state";
import {
    commandShortcut,
    type CommandPaletteRowEmphasis,
    type CommandShortcut,
    type IconName,
} from "happy-desktop-ui";
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
 * than a hook: the same action rows fill the palette's answers and the
 * held-Command preview, and neither of those two surfaces should be able to
 * offer an act the other does not.
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
    /**
     * The rounded tile the sidebar gives a bot, a task, or a project: its
     * picture, else its glyph, else its initials.
     */
    | {
          readonly kind: "avatar";
          readonly initials: string;
          readonly imageUrl?: string;
          readonly icon?: IconName;
      }
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
    | { readonly kind: "surfaceOpen"; readonly happyAgentId: string; readonly surfaceId: string }
    | {
          readonly kind: "fileOpen";
          readonly happyAgentId: string;
          readonly groupId: string;
          readonly path: string;
          readonly fileKind: HappyAgentFileTabKind;
      }
    | { readonly kind: "sessionCreate" }
    | { readonly kind: "workspaceCreate" }
    | { readonly kind: "taskCreate" }
    | { readonly kind: "settingsOpen" }
    | { readonly kind: "settingsSectionOpen"; readonly section: string }
    | { readonly kind: "updateApply" }
    /** Folds the window's sidebar away or brings it back, to the state the row names. */
    | { readonly kind: "sidebarHiddenUpdate"; readonly hidden: boolean }
    | { readonly kind: "panelToggle" };

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
          readonly setting: "linkOpenPlacement";
          readonly control: {
              readonly kind: "segmented";
              readonly value: HappyAgentLinkOpenPlacement;
              readonly segments: readonly {
                  readonly value: HappyAgentLinkOpenPlacement;
                  readonly label: string;
              }[];
              readonly next: HappyAgentLinkOpenPlacement;
          };
      })
    | (CommandPaletteSettingRowBase & {
          readonly setting: "titleShimmer";
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
    /** The glyph in the row's leading lane, beside every other row's. */
    readonly icon: IconName;
    readonly description: string;
    /** The control's DOM id, which the row's label points at. */
    readonly controlId: string;
}

export type CommandPaletteRow = CommandPaletteCommandRow | CommandPaletteSettingRow;

/** The sections the palette offers. */
export type CommandPaletteSectionId =
    | "update"
    | "recent"
    | "work"
    | "tabs"
    | "actions"
    | "settings"
    | "archived";

export interface CommandPaletteSection {
    readonly id: CommandPaletteSectionId;
    /** The caption over the rows; absent for a section that is one piece of news. */
    readonly label?: string;
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
    /**
     * The flat indexes of the rows ⌘1…⌘9 open, in that order: the rows that
     * go somewhere — work and files — and never an action or a setting, whose
     * own chords or controls already say what they do.
     */
    readonly numbered: readonly number[];
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
 * held-Command preview offers the same actions without either: it is not a
 * search, and it changes nothing, so it must not have to read the theme to say
 * what a reader could do next.
 */
export interface CommandPaletteContext {
    /** The machine whose work the palette lists: the one the address names. */
    readonly happyAgentId: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    /** The machine's bots, the hidden ones included: those are found, not suggested. */
    readonly bots: readonly HappyAgentBot[];
    /** The tasks the reader has joined, in their own order: the sidebar's Tasks. */
    readonly tasks: readonly HappyAgentTask[];
    /**
     * Every task the machine lists, joined or not, archived or not — what the
     * task browser offers. Absent where the workspace has not been read.
     */
    readonly taskDirectory?: readonly HappyAgentTask[];
    /**
     * What the sidebar on screen lists at its top level: the joined tasks, the
     * bots the reader has not hidden, and the projects with their worktrees
     * unless Projects is switched off.
     */
    readonly sidebarListing: {
        readonly botsHidden: ReadonlySet<string>;
        readonly projectsHidden: boolean;
    };
    /**
     * The sessions this window has opened, most recently first, as the
     * workspace remembers them across launches. It is the one record of the
     * reader's own switching: a visit is what puts a row near the top.
     */
    readonly visits: readonly HappyAgentRecentTabMemory[];
    /** The addressed project or worktree, when the address names one. */
    readonly groupId?: string;
    /**
     * The chat on screen. It is the one chat a reader never needs offered back
     * to them, so the empty palette leaves it out of what was worked on last.
     */
    readonly chatId?: string;
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
    /** Whether a new task can be made on the addressed Happy Agent. */
    readonly taskCreateAvailable: boolean;
    /**
     * The window's fold of its left side, when this window owns one. Absent,
     * nothing outside the shell can fold it, so no row offers to.
     */
    readonly sidebar?: { readonly hidden: boolean };
    /**
     * The open workspace's secondary pane, when it has one to show: a checkout
     * still being prepared has nothing to put in it.
     */
    readonly panel?: { readonly open: boolean };
}

export interface CommandPaletteInput extends CommandPaletteContext {
    readonly query: string;
    readonly themeMode: ThemeMode;
    readonly themeModes?: readonly ThemeMode[];
    readonly scrollbarVisibility: ScrollbarVisibility;
    readonly linkOpenPlacement: HappyAgentLinkOpenPlacement;
    readonly titleShimmerEnabled: boolean;
}

/** How many rows a typed query's section shows before it stops. */
const SECTION_LIMIT = 6;
/** How many recent chats the empty palette suggests. */
const RECENT_LIMIT = 8;
/** How many actions the held-Command preview shows. */
export const COMMAND_PALETTE_PREVIEW_LIMIT = 6;

const THEME_SEGMENTS: readonly { readonly value: ThemeMode; readonly label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "midnight", label: "Midnight" },
    { value: "custom", label: "Custom" },
];

const SCROLLBAR_SEGMENTS: readonly {
    readonly value: ScrollbarVisibility;
    readonly label: string;
}[] = [
    { value: "automatic", label: "Automatic" },
    { value: "always", label: "Always visible" },
];

const LINK_OPEN_SEGMENTS: readonly {
    readonly value: HappyAgentLinkOpenPlacement;
    readonly label: string;
}[] = [
    { value: "panel", label: "Side panel" },
    { value: "browser", label: "Browser" },
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
        keywords: "appearance theme scrollbars new sessions",
    },
    {
        id: "settings:sharing",
        title: "Settings › Sharing",
        section: "sharing",
        sectionLabel: "Sharing",
        icon: "files",
        keywords: "join tasks shared docs todo lists calendars autojoin",
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
        id: "settings:experimental",
        title: "Settings › Experimental",
        section: "experimental",
        sectionLabel: "Experimental",
        icon: "zap",
        keywords: "inbox direct phone connection experimental features",
    },
    {
        id: "settings:file-tiers",
        title: "Settings › File tiers",
        section: "file-tiers",
        sectionLabel: "File tiers",
        icon: "file-diff",
        keywords: "changes tiers tests glob patterns secondary files groups",
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
        title: "Settings › Mobile access",
        section: "mobile-access",
        sectionLabel: "Mobile access",
        icon: "mobile",
        keywords: "phone pairing happy mobile",
    },
    {
        id: "settings:debug",
        title: "Settings › Dev tools",
        section: "debug",
        sectionLabel: "Dev tools",
        icon: "code",
        keywords: "inspector profiler debug log",
    },
    {
        id: "settings:voice",
        title: "Settings › Voice",
        section: "voice",
        sectionLabel: "Voice",
        icon: "call",
        keywords: "voice gpt-live call controller model prompt",
    },
    {
        id: "settings:default-model",
        title: "Default model",
        section: "general",
        sectionLabel: "General",
        icon: "settings",
        keywords:
            "chosen from the models the enabled providers offer new sessions reasoning effort thinking",
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
 * How well text answers a query of several words typed in any order: each word
 * has to be found in it, and the text ranks as its weakest word does — never as
 * a prefix, which only the whole query in its own order can be.
 */
function wordsRank(text: string, words: readonly string[]): number | undefined {
    if (words.length < 2) return undefined;
    let worst = 1;
    for (const word of words) {
        const rank = textRank(text, word);
        if (rank === undefined) return undefined;
        worst = Math.max(worst, rank);
    }
    return worst;
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
    const words = query.split(/\s+/u).filter((word) => word.length > 0);
    const primary = textRank(title, query) ?? wordsRank(title, words);
    if (primary === 0) return 0;
    let best = primary;
    const demote = (rank: number | undefined) => {
        if (rank === undefined) return;
        const demoted = rank + SECONDARY_PENALTY;
        if (best === undefined || demoted < best) best = demoted;
    };
    const supporting = secondary.filter((text): text is string => text !== undefined);
    for (const text of supporting) demote(textRank(text, query));
    // The words of one query may be split between the title and what the row
    // answers to: "fold sidebar" is one keyword of Hide sidebar and one word of
    // its title.
    if (supporting.length > 0) demote(wordsRank([title, ...supporting].join(" "), words));
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
function rankedOf(rows: readonly Ranked[], limit: number): Ranked[] {
    return [...rows]
        .sort((left, right) => left.rank - right.rank || right.updatedAt - left.updatedAt)
        .slice(0, limit);
}

/** Up to two initials from a name, the way the sidebar marks a face without a picture. */
function initialsOf(name: string): string {
    return name
        .trim()
        .split(/\s+/u)
        .filter((word) => word.length > 0)
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join("");
}

/**
 * A task's face, as its sidebar row wears it: the owner's photo, then their
 * initials, and the tasks glyph in the same tile where there is neither — or
 * where there is no owner at all, on a standalone machine.
 */
function taskGlyph(task: HappyAgentTask): CommandPaletteGlyph {
    const owner = task.owner;
    const initials = owner?.name === undefined ? "" : initialsOf(owner.name);
    return {
        kind: "avatar",
        initials,
        ...(owner?.avatar ? { imageUrl: owner.avatar.url } : {}),
        ...(owner === null || (initials === "" && owner.avatar === undefined)
            ? { icon: "tasks" as const }
            : {}),
    };
}

/** A bot's face, as its sidebar row wears it: its picture, else its initials. */
function botGlyph(bot: HappyAgentBot): CommandPaletteGlyph {
    return {
        kind: "avatar",
        initials: initialsOf(bot.name),
        ...(bot.avatar ? { imageUrl: bot.avatar.url } : {}),
    };
}

/**
 * A project's face, as its sidebar row wears it: the picture derived from its
 * remote, else its initial. The catch-all project has no remote and an "H"
 * plaque would read as one more repository, so it wears a house.
 */
function projectGlyph(project: HappyAgentProjectGroup): CommandPaletteGlyph {
    return {
        kind: "avatar",
        initials: project.name.slice(0, 1).toUpperCase(),
        ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
        ...(project.kind === "home" ? { icon: "home" as const } : {}),
    };
}

/** Every subtask under some work, at any depth. */
function subtasksOf(subtasks: readonly HappyAgentBotSubtask[]): HappyAgentBotSubtask[] {
    return subtasks.flatMap((subtask) => [subtask, ...subtasksOf(subtask.subtasks)]);
}

/**
 * One piece of top-level work the palette can open — a task, a bot, a project
 * or one of its worktrees, a project's chat, a closed session — with
 * what orders it against the rest.
 *
 * Subtasks are never work of their own here. They are opened from the work
 * that started them, rarely on their own, so a row each would bury the work
 * the reader is about to open under work it delegated. Their titles still
 * answer a search, ranked below the parent's own name, and opening one counts
 * as a visit to the parent.
 */
interface WorkOffer {
    readonly row: CommandPaletteCommandRow;
    /**
     * 0 for a top-level row of the sidebar on screen, 1 for any other live
     * work, 2 for work that is over — an archived task, a closed session —
     * which sinks below every live answer however well it matches.
     */
    readonly tier: 0 | 1 | 2;
    /** Sessions whose visit is a visit to this work: its own and its subtasks'. */
    readonly sessions: ReadonlySet<string>;
    /** Workspaces whose every visit counts: a project's or worktree's own. */
    readonly groups: ReadonlySet<string>;
    /** Words it answers to below its title: its subtasks' titles. */
    readonly keywords: readonly string[];
    /** Epoch milliseconds of its newest content, the tiebreak among the unvisited. */
    readonly updatedAt: number;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * Everything the reader could open on this machine, each once, as the sidebar
 * on screen would place it.
 *
 * The sidebar's top level is the joined tasks, the bots not hidden, and the
 * projects with their worktrees unless Projects is switched off. Everything else — tasks not joined or
 * archived, hidden bots, a project's chats, sessions the host has closed — is
 * still found, below.
 */
function workOffers(context: CommandPaletteContext): WorkOffer[] {
    const happyAgentId = context.happyAgentId;
    const listing = context.sidebarListing;
    const offers: WorkOffer[] = [];
    const offered = new Set<string>();
    const push = (offer: WorkOffer) => {
        if (offered.has(offer.row.id)) return;
        offered.add(offer.row.id);
        offers.push(offer);
    };
    const chatOpen = (groupId: string, chatId: string, archived = false) => ({
        kind: "chatOpen" as const,
        happyAgentId,
        groupId,
        chatId,
        archived,
    });
    // The checkouts a subtask works in are that subtask's, not rows of their own.
    const subtaskWorkspaces = new Set<string>();

    const joined = new Set(context.tasks.map((task) => task.id as string));
    const tasks = [
        ...context.tasks,
        ...(context.taskDirectory ?? []).filter((task) => !joined.has(task.id)),
    ];
    for (const task of tasks) {
        const subtasks = subtasksOf(task.subtasks);
        for (const subtask of subtasks) subtaskWorkspaces.add(subtask.workspaceId);
        const listed = joined.has(task.id) && !task.archived;
        push({
            tier: task.archived ? 2 : listed ? 0 : 1,
            sessions: new Set([
                task.conversation.id,
                ...subtasks.map((sub) => sub.conversation.id),
            ]),
            groups: NONE,
            keywords: subtasks.map((subtask) => subtask.conversation.title),
            updatedAt: task.conversation.updatedAt,
            row: {
                kind: "command",
                id: `task:${task.id}`,
                title: task.name,
                meta: task.archived
                    ? "Archived task"
                    : !joined.has(task.id)
                      ? "Task you have not joined"
                      : task.owner?.name
                        ? `Task · ${task.owner.name}`
                        : "Task",
                glyph: taskGlyph(task),
                command: chatOpen(task.workspaceId, task.conversation.id),
            },
        });
    }
    for (const bot of context.bots) {
        const subtasks = subtasksOf(bot.subtasks);
        for (const subtask of subtasks) subtaskWorkspaces.add(subtask.workspaceId);
        const listed = !listing.botsHidden.has(bot.id);
        push({
            tier: listed ? 0 : 1,
            sessions: new Set([bot.conversation.id, ...subtasks.map((sub) => sub.conversation.id)]),
            groups: NONE,
            keywords: subtasks.map((subtask) => subtask.conversation.title),
            updatedAt: bot.conversation.updatedAt,
            row: {
                kind: "command",
                id: `bot:${bot.id}`,
                title: bot.name,
                meta: listed ? "Bot" : "Hidden bot",
                glyph: botGlyph(bot),
                command: chatOpen(bot.workspaceId, bot.conversation.id),
            },
        });
    }
    const projectsListed = !listing.projectsHidden;
    for (const project of context.projects) {
        push({
            tier: projectsListed ? 0 : 1,
            sessions: NONE,
            groups: new Set([project.id]),
            keywords: [],
            updatedAt: project.updatedAt,
            row: {
                kind: "command",
                id: `workspace:${project.id}`,
                title: project.name,
                meta: project.displayPath,
                glyph: projectGlyph(project),
                command: { kind: "workspaceOpen", happyAgentId, groupId: project.id },
            },
        });
        for (const worktree of project.worktrees) {
            if (subtaskWorkspaces.has(worktree.id)) continue;
            push({
                tier: projectsListed ? 0 : 1,
                sessions: NONE,
                groups: new Set([worktree.id]),
                keywords: [],
                updatedAt: worktree.updatedAt,
                row: {
                    kind: "command",
                    id: `workspace:${worktree.id}`,
                    title: worktree.name,
                    meta: project.name,
                    glyph: { kind: "icon", name: "branch" },
                    command: { kind: "workspaceOpen", happyAgentId, groupId: worktree.id },
                },
            });
        }
    }
    // A project's chats are its tabs, not sidebar rows.
    for (const project of context.projects) {
        const groups = [
            { worktree: undefined, conversations: project.conversations },
            ...project.worktrees.map((worktree) => ({
                worktree,
                conversations: worktree.conversations,
            })),
        ];
        for (const { worktree, conversations } of groups)
            for (const summary of conversations)
                push({
                    tier: 1,
                    sessions: new Set([summary.id]),
                    groups: NONE,
                    keywords: [],
                    updatedAt: summary.updatedAt,
                    row: {
                        kind: "command",
                        id: `chat:${summary.id}`,
                        title: summary.title,
                        meta: groupMeta(project, worktree),
                        glyph: { kind: "icon", name: "chat" },
                        command: chatOpen(worktree?.id ?? project.id, summary.id),
                    },
                });
    }
    for (const session of context.archivedSessions) {
        // A delegated chat is opened by the session that runs it, never alone.
        if (session.parentSessionId !== undefined) continue;
        const groupId = happyAgentSessionGroupIdOf(session);
        const owner = groupFind(context.projects, groupId);
        if (!owner) continue;
        push({
            tier: 2,
            sessions: new Set([session.id]),
            groups: NONE,
            keywords: [],
            updatedAt: session.lastMessageAt ?? session.updatedAt,
            row: {
                kind: "command",
                id: `chat:${session.id}`,
                title: session.title?.trim() || `Session ${session.id.slice(0, 8)}`,
                meta: `Closed · ${groupMeta(owner.project, owner.worktree)}`,
                // Closed sessions wear the recents glyph, exactly as the
                // workspace's own history menu marks them.
                glyph: { kind: "icon", name: "history" },
                command: chatOpen(groupId, session.id, true),
            },
        });
    }
    return offers;
}

/**
 * How recently the reader opened each piece of work: 0 for the last thing
 * opened, larger for longer ago, `Infinity` for never on this machine.
 *
 * The visits are the workspace's own record of switching — every session the
 * window opened, newest first — so the work the reader keeps coming back to is
 * the work at the top, and what they never open (a subagent, a folder they
 * added once) sinks without any rule naming it.
 */
function visitOrder(
    offers: readonly WorkOffer[],
    visits: readonly HappyAgentRecentTabMemory[],
): Map<WorkOffer, number> {
    const bySession = new Map<string, number>();
    const byGroup = new Map<string, number>();
    visits.forEach((visit, index) => {
        if (visit.type !== "session") return;
        if (!bySession.has(visit.sessionId)) bySession.set(visit.sessionId, index);
        if (!byGroup.has(visit.groupId)) byGroup.set(visit.groupId, index);
    });
    const order = new Map<WorkOffer, number>();
    for (const offer of offers) {
        let best = Infinity;
        for (const session of offer.sessions) best = Math.min(best, bySession.get(session) ?? best);
        for (const group of offer.groups) best = Math.min(best, byGroup.get(group) ?? best);
        order.set(offer, best);
    }
    return order;
}

/** Whether a piece of work is what the window is already showing. */
function workHere(offer: WorkOffer, context: CommandPaletteContext): boolean {
    return (
        (context.chatId !== undefined && offer.sessions.has(context.chatId)) ||
        (context.groupId !== undefined && offer.groups.has(context.groupId))
    );
}

/**
 * Work in the order the reader is most likely to open it: what the sidebar
 * on screen lists before anything it does not, then — for a typed query — the
 * better match, then what was opened most recently, then what changed last.
 */
function workRanked(
    offers: readonly WorkOffer[],
    context: CommandPaletteContext,
    rank: (offer: WorkOffer) => number | undefined,
    limit: number,
): Ranked[] {
    const visits = visitOrder(offers, context.visits);
    return offers
        .flatMap((offer) => {
            const match = rank(offer);
            return match === undefined ? [] : [{ offer, match, visit: visits.get(offer)! }];
        })
        .sort(
            (left, right) =>
                left.offer.tier - right.offer.tier ||
                left.match - right.match ||
                left.visit - right.visit ||
                right.offer.updatedAt - left.offer.updatedAt,
        )
        .slice(0, limit)
        .map((entry) => ({
            rank: entry.match,
            updatedAt: entry.offer.updatedAt,
            row: entry.offer.row,
        }));
}

/**
 * The open workspace's files, so a file already open is one keystroke away.
 * Its chat tabs are work the palette already offers by name.
 */
function tabRows(input: CommandPaletteInput): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const groupId = input.groupId;
    if (groupId === undefined) return [];
    const rows: Ranked[] = [];
    for (const tab of input.tabs) {
        if (tab.kind === "session") continue;
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
    const themeSegments = THEME_SEGMENTS.filter(
        (segment) => input.themeModes?.includes(segment.value) ?? true,
    );
    const themeIndex = themeSegments.findIndex((segment) => segment.value === input.themeMode);
    const scrollbarIndex = SCROLLBAR_SEGMENTS.findIndex(
        (segment) => segment.value === input.scrollbarVisibility,
    );
    const linkOpenIndex = LINK_OPEN_SEGMENTS.findIndex(
        (segment) => segment.value === input.linkOpenPlacement,
    );
    return [
        {
            kind: "setting",
            setting: "themeMode",
            id: "setting:theme",
            icon: "sun",
            label: "Theme",
            description: "Applies to this window immediately",
            controlId: "happy-agent-palette-theme",
            control: {
                kind: "segmented",
                value: input.themeMode,
                segments: themeSegments,
                next: themeSegments[(themeIndex + 1) % themeSegments.length].value,
            },
        },
        {
            kind: "setting",
            setting: "scrollbarVisibility",
            id: "setting:scrollbars",
            icon: "settings",
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
            setting: "linkOpenPlacement",
            id: "setting:link-open",
            icon: "globe",
            label: "Open links in",
            description:
                "Side panel keeps the page beside the conversation; Browser hands it to the machine's own",
            controlId: "happy-agent-palette-link-open",
            control: {
                kind: "segmented",
                value: input.linkOpenPlacement,
                segments: LINK_OPEN_SEGMENTS,
                next: LINK_OPEN_SEGMENTS[(linkOpenIndex + 1) % LINK_OPEN_SEGMENTS.length].value,
            },
        },
        {
            kind: "setting",
            setting: "titleShimmer",
            id: "setting:title-shimmer",
            icon: "zap",
            label: "Shimmer active titles",
            description: "Animates running session, project, and workspace names",
            controlId: "happy-agent-palette-title-shimmer",
            control: {
                kind: "switch",
                checked: input.titleShimmerEnabled,
                next: !input.titleShimmerEnabled,
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
    linkOpenPlacement: "Settings General Links",
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

/** One thing the window can do, with the words it answers to beyond its title. */
interface ActionOffer {
    readonly row: CommandPaletteCommandRow;
    /** What a reader might call the act instead: "fold" for hiding the sidebar. */
    readonly keywords?: string;
}

/**
 * The things the window can do from anywhere, each with the chord that does
 * the same outside the palette. They are found by typing rather than listed on
 * an empty palette: the palette is a search, and its actions are answers to it.
 * The update joins them only under a typed query or on the held-Command card:
 * the empty palette already gives it the top row, and offering it twice would
 * be the palette shouting.
 */
function actionOffers(
    context: CommandPaletteContext,
    update?: CommandPaletteCommandRow,
): ActionOffer[] {
    const offers: ActionOffer[] = [];
    if (context.sessionCreateAvailable)
        offers.push({
            row: {
                kind: "command",
                id: "action:session-create",
                title: "New chat",
                glyph: { kind: "icon", name: "plus" },
                shortcut: APP_SHORTCUTS.sessionCreate,
                command: { kind: "sessionCreate" },
            },
            keywords: "session conversation start",
        });
    if (context.taskCreateAvailable)
        offers.push({
            row: {
                kind: "command",
                id: "action:task-create",
                title: "New task",
                glyph: { kind: "icon", name: "tasks" },
                shortcut: APP_SHORTCUTS.taskCreate,
                command: { kind: "taskCreate" },
            },
            keywords: "create start work",
        });
    if (context.workspaceCreateAvailable)
        offers.push({
            row: {
                kind: "command",
                id: "action:workspace-create",
                title: "New workspace",
                glyph: { kind: "icon", name: "branch" },
                command: { kind: "workspaceCreate" },
            },
            keywords: "worktree branch checkout",
        });
    // The shell's own words for its toggles, so the row reads as the button.
    const sidebar = context.sidebar;
    if (sidebar)
        offers.push({
            row: {
                kind: "command",
                id: "action:sidebar-toggle",
                title: sidebar.hidden ? "Show sidebar" : "Hide sidebar",
                glyph: {
                    kind: "icon",
                    name: sidebar.hidden ? "sidebar-expand" : "sidebar-collapse",
                },
                shortcut: APP_SHORTCUTS.sidebarToggle,
                command: { kind: "sidebarHiddenUpdate", hidden: !sidebar.hidden },
            },
            keywords: "fold unfold collapse expand toggle navigation left",
        });
    const panel = context.panel;
    if (panel)
        offers.push({
            row: {
                kind: "command",
                id: "action:panel-toggle",
                title: panel.open ? "Hide secondary pane" : "Show secondary pane",
                glyph: { kind: "icon", name: panel.open ? "panel-collapse" : "panel-expand" },
                shortcut: APP_SHORTCUTS.panelToggle,
                command: { kind: "panelToggle" },
            },
            keywords: "fold unfold collapse expand toggle side panel right files terminal changes",
        });
    offers.push({
        row: {
            kind: "command",
            id: "action:settings",
            title: "Open settings",
            glyph: { kind: "icon", name: "settings" },
            command: { kind: "settingsOpen" },
        },
        keywords: "preferences",
    });
    if (update) offers.push({ row: update, keywords: "upgrade restart reload version" });
    return offers;
}

/**
 * What the empty palette offers: the update if one is waiting, then the work
 * the reader is most likely to open next — the sidebar's own rows first, the
 * one opened most recently on top, then other work they could return to. What
 * the window is already showing is left out: the row Enter would run should go
 * somewhere. Archived tasks and closed sessions are offered only when there is
 * no live work at all.
 *
 * A machine with nothing to open yet would leave the palette blank, so it
 * offers the window's actions instead.
 */
export function commandPaletteSuggestionSections(
    context: CommandPaletteContext,
): CommandPaletteSection[] {
    const offers = workOffers(context).filter((offer) => !workHere(offer, context));
    const live = offers.filter((offer) => offer.tier < 2);
    const recent = workRanked(live.length > 0 ? live : offers, context, () => 0, RECENT_LIMIT).map(
        (entry) => entry.row,
    );
    const update = updateRow(context);
    return [
        ...(update ? [{ id: "update" as const, rows: [update] }] : []),
        recent.length > 0
            ? { id: "recent" as const, label: "Recent", rows: recent }
            : {
                  id: "actions" as const,
                  label: "Actions",
                  rows: actionOffers(context).map((offer) => offer.row),
              },
    ];
}

/**
 * What holding Command shows: the waiting update and the window's actions,
 * each wearing the chord that runs it. Discovering chords is that card's whole
 * purpose, so it offers the same acts a typed query finds, in the same words,
 * and none of the work, which has no chord to teach.
 */
export function commandPaletteQuickActionRows(
    context: CommandPaletteContext,
): CommandPaletteCommandRow[] {
    const update = updateRow(context);
    return [...(update ? [update] : []), ...actionOffers(context).map((offer) => offer.row)];
}

/**
 * Everything the palette is currently offering, as the flat list its highlight
 * addresses and as the sections it draws.
 *
 * An empty query answers with what the reader is likely to open next; anything
 * typed searches the whole machine. The sections a query finds are listed by
 * their best answer, so a typed act ("fold sidebar") is not left under work
 * that merely contains one of its words, while equal answers keep the order
 * work, files, actions, settings.
 */
export function commandPaletteResults(input: CommandPaletteInput): CommandPaletteResults {
    const query = input.query.trim().toLowerCase();
    const sections: CommandPaletteSection[] = [];
    if (query.length === 0) {
        for (const section of commandPaletteSuggestionSections(input))
            if (section.rows.length > 0) sections.push(section);
    } else {
        const offers = workOffers(input);
        const workRank = (offer: WorkOffer) => rowRank(query, offer.row.title, ...offer.keywords);
        const offered: readonly {
            readonly id: CommandPaletteSectionId;
            readonly label: string;
            readonly rows: readonly Ranked[];
        }[] = [
            {
                id: "work",
                label: "Work",
                rows: workRanked(
                    offers.filter((offer) => offer.tier < 2),
                    input,
                    workRank,
                    SECTION_LIMIT,
                ),
            },
            { id: "tabs", label: "Files", rows: rankedOf(tabRows(input), SECTION_LIMIT) },
            {
                id: "actions",
                label: "Actions",
                rows: rankedOf(
                    actionOffers(input, updateRow(input)).flatMap((offer) => {
                        const rank = rowRank(
                            query,
                            offer.row.title,
                            offer.row.meta,
                            offer.keywords,
                        );
                        return rank === undefined ? [] : [{ rank, updatedAt: 0, row: offer.row }];
                    }),
                    SECTION_LIMIT,
                ),
            },
            {
                id: "settings",
                label: "Settings",
                rows: rankedOf(settingsSectionRows(input), SECTION_LIMIT),
            },
        ];
        const best = (rows: readonly Ranked[]) => Math.min(...rows.map((row) => row.rank));
        for (const section of offered
            .filter((candidate) => candidate.rows.length > 0)
            .sort((left, right) => best(left.rows) - best(right.rows)))
            sections.push({
                id: section.id,
                label: section.label,
                rows: section.rows.map((entry) => entry.row),
            });
        // Work that is over answers last, below every live answer, however
        // well its title matches.
        const archived = workRanked(
            offers.filter((offer) => offer.tier === 2),
            input,
            workRank,
            SECTION_LIMIT,
        ).map((entry) => entry.row);
        if (archived.length > 0)
            sections.push({ id: "archived", label: "Archived", rows: archived });
    }
    return numberedResults(sections);
}

/** The sections whose rows go somewhere, and so are numbered for ⌘1…⌘9. */
const NUMBERED_SECTIONS: ReadonlySet<CommandPaletteSectionId> = new Set([
    "recent",
    "work",
    "tabs",
    "archived",
]);

const NUMBER_SHORTCUTS = Array.from({ length: 9 }, (_, index) =>
    commandShortcut(String(index + 1)),
);

/**
 * The flat result list, with the first nine rows that open something wearing
 * the ⌘-number that opens them, counted down the list as the reader sees it.
 */
function numberedResults(sections: readonly CommandPaletteSection[]): CommandPaletteResults {
    const numbered: number[] = [];
    let index = 0;
    const shown = sections.map((section) => ({
        ...section,
        rows: section.rows.map((row) => {
            const flat = index++;
            if (
                row.kind !== "command" ||
                !NUMBERED_SECTIONS.has(section.id) ||
                numbered.length === NUMBER_SHORTCUTS.length
            )
                return row;
            const shortcut = NUMBER_SHORTCUTS[numbered.length]!;
            numbered.push(flat);
            return { ...row, shortcut };
        }),
    }));
    return { sections: shown, rows: shown.flatMap((section) => section.rows), numbered };
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
