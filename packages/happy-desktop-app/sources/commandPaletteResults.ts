import type {
    HappyAgentArtifact,
    HappyAgentArtifactType,
    HappyAgentBot,
    HappyAgentBotSubtask,
    HappyAgentRecentTabMemory,
    HappyAgentFileTabKind,
    HappyAgentProjectGroup,
    HappyAgentSessionSummary,
    HappyAgentSurface,
    HappyAgentSurfaceActiveTodo,
    HappyAgentSurfaceId,
    HappyAgentTask,
    HappyAgentWorktreeGroup,
    HappyAgentLinkOpenPlacement,
    HappyAgentSearchHit,
    ScrollbarVisibility,
    ThemeMode,
} from "happy-desktop-state";
import {
    HAPPY_AGENT_UNTITLED_SESSION_TITLE,
    happyAgentArtifactTypeLabel,
    happyAgentSessionGroupIdOf,
    happyAgentVaultNameShown,
    happyAgentVaultPathShown,
    searchFuse,
    type SearchEntry,
    type SearchRemoteEntry,
} from "happy-desktop-state";
import {
    commandShortcut,
    surfaceTypeIcon,
    surfaceTypeLabel,
    type CommandPaletteRowEmphasis,
    type CommandShortcut,
    type IconName,
} from "happy-desktop-ui";
import { APP_SHORTCUTS } from "./appShortcuts";
import { happyAgentSettingsCategoryAvailable } from "./happyAgentSettingsCategoryAvailable";

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
 * than a hook, keeping its answers independent of the UI rendering them.
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
     * picture, else its glyph, else the live placeholder its seed picks, else
     * its initials.
     */
    | {
          readonly kind: "avatar";
          readonly initials: string;
          readonly imageUrl?: string;
          readonly icon?: IconName;
          readonly placeholderSeed?: string;
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
    /** A bot the reader hid: put back in the sidebar, and then opened on its conversation. */
    | {
          readonly kind: "hiddenBotOpen";
          readonly happyAgentId: string;
          readonly botId: HappyAgentBot["id"];
          readonly groupId: string;
          readonly chatId: string;
      }
    | { readonly kind: "workspaceOpen"; readonly happyAgentId: string; readonly groupId: string }
    | { readonly kind: "surfaceOpen"; readonly happyAgentId: string; readonly surfaceId: string }
    | { readonly kind: "artifactOpen"; readonly happyAgentId: string; readonly artifactId: string }
    /** A person's profile on a Happy Cloud server. */
    | { readonly kind: "userProfileOpen"; readonly happyAgentId: string; readonly userId: string }
    /** A folder or file in a vault, opened in its vault as its own row there would open it. */
    | {
          readonly kind: "vaultItemOpen";
          readonly happyAgentId: string;
          readonly surfaceId: string;
          readonly itemId: string;
      }
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
    /** What a typed query finds, this window's answer and the Happy Agent's fused into one list. */
    | "results"
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
    /**
     * Where the found rows are in the flat list and the search key of
     * each, in order: what the palette records as the rows the reader has
     * passed when the highlight moves, so they keep their places when the
     * Happy Agent's answer arrives.
     */
    readonly found: { readonly start: number; readonly keys: readonly string[] };
}

/**
 * The search keys of the found rows the reader has passed, from the top
 * through the highlighted row at `index`.
 */
export function commandPaletteHeld(results: CommandPaletteResults, index: number): string[] {
    const { start, keys } = results.found;
    if (index < start) return [];
    return keys.slice(0, Math.min(keys.length, index - start + 1));
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
 * It is stated apart from the query and settings values so the available
 * actions depend only on the addressed workspace and machine.
 */
export interface CommandPaletteContext {
    readonly happyCloud?: boolean;
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

/**
 * The machine's Surfaces as its catalog last read them: what a typed query
 * finds among documents, todo lists and their open todos, and the other
 * shared Surfaces. Absent on a machine that has no Surfaces.
 */
export interface CommandPaletteSurfaceSources {
    /** Every Surface on the machine, joined or not. */
    readonly surfaces: readonly HappyAgentSurface[];
    /** The ones in the reader's sidebar. */
    readonly joined: ReadonlySet<HappyAgentSurfaceId>;
    /** The open todos of each joined todo list that has been read. */
    readonly activeTodos: ReadonlyMap<HappyAgentSurfaceId, readonly HappyAgentSurfaceActiveTodo[]>;
}

export interface CommandPaletteInput extends CommandPaletteContext {
    readonly query: string;
    /**
     * What the Happy Agent's search found for this same query, once it
     * has answered. Absent, the palette's own answer stands alone.
     */
    readonly remote?: readonly HappyAgentSearchHit[];
    /**
     * The found rows the reader has passed, by key, as the palette recorded
     * them. Absent until the reader moves the highlight after typing.
     */
    readonly held?: readonly string[];
    readonly surfaces?: CommandPaletteSurfaceSources;
    /** The artifacts the palette's own catalog has read, newest first. */
    readonly artifacts?: readonly HappyAgentArtifact[];
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
        title: "Settings › Notifications",
        section: "sharing",
        sectionLabel: "Notifications",
        icon: "bell",
        keywords: "notifications sharing join tasks shared docs todo lists calendars autojoin",
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
        keywords: "inbox experimental features",
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
        title: "Settings › Inference",
        section: "providers",
        sectionLabel: "Inference",
        icon: "globe",
        keywords: "providers ai models accounts keys subscriptions",
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
    /**
     * The thing's search key, `<type>:<id>`, for a row a typed query
     * finds: the key the Happy Agent's answer names the same thing by.
     */
    readonly key?: string;
    readonly rank: number;
    /** Among equal matches, lower first: a Surface the reader joined before one they did not. */
    readonly tier?: number;
    /** Epoch milliseconds of last activity, for the entities that have one. */
    readonly updatedAt: number;
    /** How long ago the reader last opened it, for work: 0 for the last thing opened. */
    readonly visit?: number;
}

/**
 * Ranked rows in the order the palette lists them: best match first, most
 * recently active first among equals, and otherwise exactly the order they were
 * offered in — `sort` is stable, so nothing shuffles between keystrokes.
 */
function rankedOf(rows: readonly Ranked[], limit: number): Ranked[] {
    return [...rows]
        .sort(
            (left, right) =>
                left.rank - right.rank ||
                (left.tier ?? 0) - (right.tier ?? 0) ||
                right.updatedAt - left.updatedAt,
        )
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
 * A task's face, as its sidebar row wears it: in a team the owner's photo,
 * else the owner's placeholder; a task nobody owns, or any task on a
 * standalone machine, the placeholder its own id picks.
 */
function taskGlyph(task: HappyAgentTask): CommandPaletteGlyph {
    const owner = task.owner;
    return {
        kind: "avatar",
        initials: owner?.name === undefined ? "" : initialsOf(owner.name),
        ...(owner?.avatar
            ? { imageUrl: owner.avatar.url }
            : { placeholderSeed: owner?.userId ?? task.id }),
    };
}

/**
 * A bot's face, as its sidebar row wears it: its picture, else the placeholder
 * its id picks; the Chief of Staff never wears one.
 */
function botGlyph(bot: HappyAgentBot): CommandPaletteGlyph {
    return {
        kind: "avatar",
        initials: initialsOf(bot.name),
        ...(bot.avatar
            ? { imageUrl: bot.avatar.url }
            : bot.systemKey === "chief_of_staff"
              ? {}
              : { placeholderSeed: bot.id }),
    };
}

/**
 * A project's face, as its sidebar row wears it: the picture derived from its
 * remote, else the placeholder its id picks. The catch-all project has no
 * remote and a placeholder would read as one more repository, so it wears a
 * house.
 */
function projectGlyph(project: HappyAgentProjectGroup): CommandPaletteGlyph {
    return {
        kind: "avatar",
        initials: project.name.slice(0, 1).toUpperCase(),
        placeholderSeed: project.id,
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
    /** Its search key: `agent:` and the conversation for a chat, a task, or a bot. */
    readonly key: string;
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
            key: `agent:${task.conversation.id}`,
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
            key: `agent:${bot.conversation.id}`,
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
                command: listed
                    ? chatOpen(bot.workspaceId, bot.conversation.id)
                    : {
                          kind: "hiddenBotOpen",
                          happyAgentId,
                          botId: bot.id,
                          groupId: bot.workspaceId,
                          chatId: bot.conversation.id,
                      },
            },
        });
    }
    const projectsListed = !listing.projectsHidden;
    for (const project of context.projects) {
        push({
            key: `project:${project.id}`,
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
                key: `workspace:${worktree.id}`,
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
                    key: `agent:${summary.id}`,
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
            key: `agent:${session.id}`,
            tier: 2,
            sessions: new Set([session.id]),
            groups: NONE,
            keywords: [],
            updatedAt: session.lastMessageAt ?? session.updatedAt,
            row: {
                kind: "command",
                id: `chat:${session.id}`,
                title: session.title?.trim() || HAPPY_AGENT_UNTITLED_SESSION_TITLE,
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
            key: entry.offer.key,
            tier: entry.offer.tier,
            visit: entry.visit,
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
            key: `tab:${tab.id}`,
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

/**
 * The glyph an artifact wears for its type, from the house set: the palette's
 * lane holds one curated glyph, so the Artifacts page's own type glyphs are
 * matched to their nearest house name.
 */
function artifactGlyph(type: HappyAgentArtifactType): IconName {
    switch (type) {
        case "markdown":
            return "doc";
        case "html":
            return "globe";
        case "image":
        case "image_series":
            return "image";
        case "video":
            return "play";
        case "document":
            return "files";
        case "gen_ui":
            return "braces";
        case "unknown":
            return "package";
    }
}

/** A Surface's mark, as its sidebar row wears it: its picture, else its type's glyph. */
function surfaceGlyph(surface: HappyAgentSurface): CommandPaletteGlyph {
    return surface.image
        ? {
              kind: "avatar",
              initials: initialsOf(surface.name).slice(0, 1),
              imageUrl: surface.image.url,
          }
        : { kind: "icon", name: surfaceTypeIcon(surface.type) };
}

/**
 * What a typed query finds among the machine's Surfaces, by the section each
 * belongs in: documents; todo lists and the open todos in the joined ones; and
 * every other Surface that has a page of its own — calendars, chats, monitors.
 *
 * A Surface that only points at an artifact, a bot, or a task is left out: the
 * thing itself is already found under its own name. So is one this build
 * cannot show. A Surface the reader has not joined is found too, below the
 * joined ones it matches as well as.
 */
function surfaceRows(input: CommandPaletteInput): {
    readonly documents: Ranked[];
    readonly todos: Ranked[];
    readonly shared: Ranked[];
} {
    const query = input.query.trim().toLowerCase();
    const documents: Ranked[] = [];
    const todos: Ranked[] = [];
    const shared: Ranked[] = [];
    const sources = input.surfaces;
    if (sources === undefined) return { documents, todos, shared };
    const surfaceOpen = (surface: HappyAgentSurface): CommandPaletteCommand => ({
        kind: "surfaceOpen",
        happyAgentId: input.happyAgentId,
        surfaceId: surface.id,
    });
    for (const surface of sources.surfaces) {
        const kind = surface.type.kind;
        if (kind === "artifact" || kind === "bot" || kind === "task" || kind === "unsupported")
            continue;
        const joined = sources.joined.has(surface.id);
        const type = surfaceTypeLabel(surface.type);
        const rank = rowRank(query, surface.name, type);
        if (rank === undefined) continue;
        const open = kind === "todo" ? sources.activeTodos.get(surface.id)?.length : undefined;
        const meta = [
            type,
            open === undefined ? undefined : `${String(open)} open`,
            joined ? undefined : "not joined",
        ]
            .filter((part) => part !== undefined)
            .join(" · ");
        const entry: Ranked = {
            rank,
            key: kind === "document" ? `document:${surface.id}` : `surface:${surface.id}`,
            tier: joined ? 0 : 1,
            updatedAt: surface.updatedAt,
            row: {
                kind: "command",
                id: `surface:${surface.id}`,
                title: surface.name,
                meta,
                glyph: surfaceGlyph(surface),
                command: surfaceOpen(surface),
            },
        };
        (kind === "document" ? documents : kind === "todo" ? todos : shared).push(entry);
    }
    // A todo is found by what it says, never by the list it is in: a list's
    // name already finds the list.
    for (const surface of sources.surfaces) {
        const listed = sources.activeTodos.get(surface.id);
        if (listed === undefined) continue;
        for (const todo of listed) {
            const rank = rowRank(query, todo.text);
            if (rank === undefined) continue;
            todos.push({
                rank,
                key: `todo:${todo.id}`,
                // The list itself outranks its todos when both match equally.
                tier: 2,
                updatedAt: todo.updatedAt,
                row: {
                    kind: "command",
                    id: `todo:${todo.id}`,
                    title: todo.text,
                    meta: surface.name,
                    glyph: { kind: "icon", name: "check" },
                    command: surfaceOpen(surface),
                },
            });
        }
    }
    return { documents, todos, shared };
}

/** What a typed query finds among the artifacts the palette has read, by title. */
function artifactRows(input: CommandPaletteInput): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const rows: Ranked[] = [];
    for (const artifact of input.artifacts ?? []) {
        if (artifact.status !== "active") continue;
        const type = happyAgentArtifactTypeLabel(artifact.type);
        const rank = rowRank(query, artifact.title, type);
        if (rank === undefined) continue;
        rows.push({
            rank,
            key: `artifact:${artifact.id}`,
            updatedAt: artifact.updatedAt,
            row: {
                kind: "command",
                id: `artifact:${artifact.id}`,
                title: artifact.title,
                meta: type,
                glyph: { kind: "icon", name: artifactGlyph(artifact.type) },
                command: {
                    kind: "artifactOpen",
                    happyAgentId: input.happyAgentId,
                    artifactId: artifact.id,
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
        if (!happyAgentSettingsCategoryAvailable(jump.section, input.happyCloud === true)) continue;
        // The section the row leads to is searchable too: "general" has to
        // reach the rows that live under General, not only the page itself.
        const keywords =
            input.happyCloud && jump.section === "account"
                ? "profile name email photo happy account"
                : jump.keywords;
        const rank = rowRank(query, jump.title, jump.sectionLabel, keywords);
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
 * The update joins them only under a typed query:
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

/** How many found rows the palette's own answer offers to the fusion, and how many it shows. */
const FOUND_LIMIT = 12;

/**
 * What a typed query finds among the snapshots this window holds, best first:
 * live work, the open workspace's files, documents, todos, artifacts, and
 * other shared Surfaces, each with its search key. The better match
 * comes first whatever it is; among equals, what the sidebar lists or the
 * reader joined, then what they opened last, then what changed last.
 */
function localFound(input: CommandPaletteInput, offers: readonly WorkOffer[]): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const surfaces = surfaceRows(input);
    const work = workRanked(
        offers.filter((offer) => offer.tier < 2),
        input,
        (offer) => rowRank(query, offer.row.title, ...offer.keywords),
        Infinity,
    );
    return [
        ...work,
        ...tabRows(input),
        ...surfaces.documents,
        ...surfaces.todos,
        ...artifactRows(input),
        ...surfaces.shared,
    ]
        .sort(
            (left, right) =>
                left.rank - right.rank ||
                (left.tier ?? 0) - (right.tier ?? 0) ||
                (left.visit ?? Infinity) - (right.visit ?? Infinity) ||
                right.updatedAt - left.updatedAt,
        )
        .slice(0, FOUND_LIMIT);
}

/**
 * A found row, with the text a content match was found in when the Happy
 * Agent says, which is then the row's second line.
 */
interface FoundRow {
    readonly row: CommandPaletteCommandRow;
    readonly snippet?: string;
}

/** A row the Happy Agent found by its text, saying the words where its second line was. */
function snippetShown(found: FoundRow): FoundRow {
    return found.snippet === undefined
        ? found
        : { ...found, row: { ...found.row, meta: found.snippet } };
}

const ARTIFACT_TYPES: ReadonlySet<string> = new Set<HappyAgentArtifactType>([
    "markdown",
    "html",
    "image",
    "image_series",
    "video",
    "document",
    "gen_ui",
    "unknown",
]);

/** The artifact type the Happy Agent named, or `unknown` for one this build does not know. */
function artifactTypeOf(type: string): HappyAgentArtifactType {
    return ARTIFACT_TYPES.has(type) ? (type as HappyAgentArtifactType) : "unknown";
}

/** A calendar event's next day, as a row's second line says it. */
function eventDayText(start: number, allDay: boolean): string {
    const date = new Date(start);
    return allDay
        ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : date.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
          });
}

/** What a chat, task, subtask, or bot the Happy Agent found is, as its row says. */
const AGENT_KIND_LABEL = {
    chat: "Chat",
    task: "Task",
    subtask: "Subtask",
    bot: "Bot",
} as const;

/**
 * One thing the Happy Agent found, as the row that opens it here. Work this
 * window holds is its own row; other work opens in the workspace the Happy
 * Agent names, and is left out when it names none, as a message is. Anything
 * archived, which the palette lists apart, is left out too, and so is what
 * the desktop has nowhere to open: a skill, or a person outside Happy Cloud.
 */
function remoteRow(
    hit: HappyAgentSearchHit,
    input: CommandPaletteInput,
    work: ReadonlyMap<string, WorkOffer>,
): FoundRow | undefined {
    const happyAgentId = input.happyAgentId;
    const surfaceOf = (surfaceId: string) =>
        input.surfaces?.surfaces.find((surface) => surface.id === surfaceId);
    const surfaceOpen = (surfaceId: string): CommandPaletteCommand => ({
        kind: "surfaceOpen",
        happyAgentId,
        surfaceId,
    });
    const snippet = (text: string | null) => (text === null ? {} : { snippet: text });
    switch (hit.type) {
        case "vault_file":
        case "vault_folder": {
            const vault = surfaceOf(hit.surfaceId)?.name;
            const path = happyAgentVaultPathShown(hit.path);
            const where = vault === undefined ? path : `${vault} · ${path}`;
            const itemId = hit.type === "vault_file" ? hit.fileId : hit.folderId;
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: happyAgentVaultNameShown(hit.name),
                    meta: where,
                    glyph: {
                        kind: "icon",
                        name:
                            hit.type === "vault_folder"
                                ? "files"
                                : hit.kind === "artifact"
                                  ? "globe"
                                  : "doc",
                    },
                    command: {
                        kind: "vaultItemOpen",
                        happyAgentId,
                        surfaceId: hit.surfaceId,
                        itemId,
                    },
                },
                ...(hit.type === "vault_file" && hit.match === "content"
                    ? snippet(hit.snippet)
                    : {}),
            };
        }
        case "document": {
            const surface = surfaceOf(hit.surfaceId);
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: hit.name,
                    meta: "Document",
                    glyph: surface ? surfaceGlyph(surface) : { kind: "icon", name: "doc" },
                    command: surfaceOpen(hit.surfaceId),
                },
                ...(hit.match === "content" ? snippet(hit.snippet) : {}),
            };
        }
        case "todo": {
            const list = surfaceOf(hit.surfaceId)?.name;
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: hit.text,
                    meta: [hit.status === "completed" ? "Done" : undefined, list]
                        .filter((part) => part !== undefined)
                        .join(" · "),
                    glyph: { kind: "icon", name: "check" },
                    command: surfaceOpen(hit.surfaceId),
                },
            };
        }
        case "calendar_event": {
            const calendar = surfaceOf(hit.surfaceId)?.name;
            const day = eventDayText(hit.start, hit.allDay);
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: hit.title,
                    meta: calendar === undefined ? day : `${calendar} · ${day}`,
                    glyph: { kind: "icon", name: "calendar" },
                    command: surfaceOpen(hit.surfaceId),
                },
                ...(hit.match === "content" ? snippet(hit.snippet) : {}),
            };
        }
        case "message": {
            // A message opens its conversation, where the conversation is known.
            if (hit.workspaceId === null) return undefined;
            const conversation = work.get(`agent:${hit.agentId}`)?.row.title;
            const day = new Date(hit.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
            });
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: hit.snippet,
                    meta: [conversation ?? "Chat", hit.role === "agent" ? "Agent" : undefined, day]
                        .filter((part) => part !== undefined)
                        .join(" · "),
                    glyph: { kind: "icon", name: "chat" },
                    command: {
                        kind: "chatOpen",
                        happyAgentId,
                        groupId: hit.workspaceId,
                        chatId: hit.agentId,
                        archived: false,
                    },
                },
            };
        }
        // A person opens their profile, which only Happy Cloud has.
        case "user":
            if (!input.happyCloud) return undefined;
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: hit.name,
                    meta: "Person",
                    glyph: {
                        kind: "avatar",
                        initials: initialsOf(hit.name),
                        ...(hit.imageUrl === undefined
                            ? { placeholderSeed: hit.userId }
                            : { imageUrl: hit.imageUrl }),
                    },
                    command: { kind: "userProfileOpen", happyAgentId, userId: hit.userId },
                },
            };
        // The desktop has no page of its own for a skill, so none is offered.
        case "skill":
            return undefined;
        case "artifact": {
            const type = artifactTypeOf(hit.artifactType);
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: hit.title,
                    meta: happyAgentArtifactTypeLabel(type),
                    glyph: { kind: "icon", name: artifactGlyph(type) },
                    command: { kind: "artifactOpen", happyAgentId, artifactId: hit.artifactId },
                },
                ...(hit.match === "content" ? snippet(hit.snippet) : {}),
            };
        }
        case "surface": {
            const surface = surfaceOf(hit.surfaceId);
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: hit.name,
                    meta: surface ? surfaceTypeLabel(surface.type) : "Shared",
                    glyph: surface ? surfaceGlyph(surface) : { kind: "icon", name: "list" },
                    command: surfaceOpen(hit.surfaceId),
                },
            };
        }
        case "agent":
        case "project":
        case "workspace": {
            if (hit.archived) return undefined;
            const offer = work.get(hit.key);
            if (offer !== undefined) return offer.tier < 2 ? { row: offer.row } : undefined;
            if (hit.type === "agent") {
                if (hit.workspaceId === null) return undefined;
                const project =
                    hit.projectId === null
                        ? undefined
                        : input.projects.find((group) => group.id === hit.projectId);
                return {
                    row: {
                        kind: "command",
                        id: hit.key,
                        title: hit.title,
                        meta:
                            project === undefined
                                ? AGENT_KIND_LABEL[hit.kind]
                                : `${AGENT_KIND_LABEL[hit.kind]} · ${project.name}`,
                        glyph: { kind: "icon", name: "chat" },
                        command: {
                            kind: "chatOpen",
                            happyAgentId,
                            groupId: hit.workspaceId,
                            chatId: hit.agentId,
                            archived: false,
                        },
                    },
                };
            }
            const groupId = hit.type === "project" ? hit.projectId : hit.workspaceId;
            const project =
                hit.type === "workspace"
                    ? input.projects.find((group) => group.id === hit.projectId)
                    : undefined;
            return {
                row: {
                    kind: "command",
                    id: hit.key,
                    title: hit.name,
                    ...(project === undefined ? {} : { meta: project.name }),
                    glyph: { kind: "icon", name: hit.type === "project" ? "files" : "branch" },
                    command: { kind: "workspaceOpen", happyAgentId, groupId },
                },
            };
        }
    }
}

/**
 * The rows a typed query finds: this window's answer, fused with the Happy
 * Agent's once it arrives, with the rows the reader has already passed kept
 * where they were. A thing both found keeps this window's row, and its
 * identity, saying where a content match was found when the Happy Agent says.
 */
function foundRows(
    input: CommandPaletteInput,
    offers: readonly WorkOffer[],
): { readonly rows: CommandPaletteCommandRow[]; readonly keys: string[]; readonly best: number } {
    const local = localFound(input, offers);
    const localEntries: SearchEntry<FoundRow>[] = local.flatMap((entry) =>
        entry.key === undefined || entry.row.kind !== "command"
            ? []
            : [{ key: entry.key, row: { row: entry.row } }],
    );
    let remote: SearchRemoteEntry<FoundRow>[] | undefined;
    if (input.remote !== undefined) {
        const work = new Map(offers.map((offer) => [offer.key, offer]));
        remote = input.remote.flatMap((hit) => {
            const row = remoteRow(hit, input, work);
            return row === undefined
                ? []
                : [{ key: hit.key, rank: hit.rank, row: snippetShown(row) }];
        });
    }
    const fused = searchFuse<FoundRow>({
        local: localEntries,
        ...(remote === undefined ? {} : { remote }),
        ...(input.held === undefined ? {} : { held: input.held }),
        merge: (mine, theirs) =>
            snippetShown({
                row: mine.row,
                ...(theirs.snippet === undefined ? {} : { snippet: theirs.snippet }),
            }),
    }).slice(0, Math.max(FOUND_LIMIT, input.held?.length ?? 0));
    return {
        rows: fused.map((entry) => entry.row.row),
        keys: fused.map((entry) => entry.key),
        best:
            // Until the reader moves the highlight, nothing they chose can move, so the
            // Happy Agent's answer puts the list first. Once they have, only this
            // window's own matches place it, so the answer arriving never moves it.
            input.held === undefined && remote !== undefined && remote.length > 0
                ? -Infinity
                : local.length > 0
                  ? Math.min(...local.map((entry) => entry.rank))
                  : Infinity,
    };
}

/**
 * Everything the palette is currently offering, as the flat list its highlight
 * addresses and as the sections it draws.
 *
 * An empty query answers with what the reader is likely to open next. Anything
 * typed searches the whole machine: one list of what it finds — its work, the
 * open workspace's files, documents, todos, artifacts, shared Surfaces, and
 * whatever the Happy Agent's search adds, vault files and calendar
 * events among them — then the window's acts and its settings. Those three
 * are listed by their best answer, so a typed act ("fold sidebar") is not left
 * under work that merely contains one of its words. Work that is over comes
 * last.
 */
export function commandPaletteResults(input: CommandPaletteInput): CommandPaletteResults {
    const query = input.query.trim().toLowerCase();
    const sections: CommandPaletteSection[] = [];
    let found: readonly string[] = [];
    if (query.length === 0) {
        for (const section of commandPaletteSuggestionSections(input))
            if (section.rows.length > 0) sections.push(section);
    } else {
        const offers = workOffers(input);
        const results = foundRows(input, offers);
        found = results.keys;
        const workRank = (offer: WorkOffer) => rowRank(query, offer.row.title, ...offer.keywords);
        const offered: readonly {
            readonly id: CommandPaletteSectionId;
            readonly label: string;
            readonly rows: readonly CommandPaletteRow[];
            readonly best: number;
        }[] = [
            { id: "results", label: "Results", rows: results.rows, best: results.best },
            ...[
                {
                    id: "actions" as const,
                    label: "Actions",
                    rows: rankedOf(
                        actionOffers(input, updateRow(input)).flatMap((offer) => {
                            const rank = rowRank(
                                query,
                                offer.row.title,
                                offer.row.meta,
                                offer.keywords,
                            );
                            return rank === undefined
                                ? []
                                : [{ rank, updatedAt: 0, row: offer.row }];
                        }),
                        SECTION_LIMIT,
                    ),
                },
                {
                    id: "settings" as const,
                    label: "Settings",
                    rows: rankedOf(settingsSectionRows(input), SECTION_LIMIT),
                },
            ].map((section) => ({
                id: section.id,
                label: section.label,
                rows: section.rows.map((entry) => entry.row),
                best: Math.min(...section.rows.map((entry) => entry.rank)),
            })),
        ];
        for (const section of offered
            .filter((candidate) => candidate.rows.length > 0)
            .sort((left, right) => left.best - right.best))
            sections.push({ id: section.id, label: section.label, rows: section.rows });
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
    return numberedResults(sections, found);
}

/** The sections whose rows go somewhere, and so are numbered for ⌘1…⌘9. */
const NUMBERED_SECTIONS: ReadonlySet<CommandPaletteSectionId> = new Set([
    "recent",
    "results",
    "archived",
]);

const NUMBER_SHORTCUTS = Array.from({ length: 9 }, (_, index) =>
    commandShortcut(String(index + 1)),
);

/**
 * The flat result list, with the first nine rows that open something wearing
 * the ⌘-number that opens them, counted down the list as the reader sees it.
 */
function numberedResults(
    sections: readonly CommandPaletteSection[],
    found: readonly string[],
): CommandPaletteResults {
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
    let start = 0;
    for (const section of shown) {
        if (section.id === "results") break;
        start += section.rows.length;
    }
    return {
        sections: shown,
        rows: shown.flatMap((section) => section.rows),
        numbered,
        found: { start, keys: found },
    };
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
