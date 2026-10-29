import {
    happyAgentSidebarProposalsStoreNoop,
    happyAgentSpacesIn,
    happyAgentSpacesOlder,
    sidebarDocumentEdit,
    sidebarDocumentFold,
    sidebarDocumentKey,
    sidebarDocumentMove,
    sidebarDocumentSeparatorPin,
    sidebarDocumentSessionsHide,
    sidebarDocumentSessionsReveal,
    sidebarDocumentView,
    sidebarProposalChangeAccept,
    sidebarProposalChangeDecline,
    sidebarProposalDiff,
    type HappyAgentBotSubtask,
    type HappyAgentSidebarProposalsStore,
    type HappyAgentWorktreeGroup,
    type SidebarDocumentClassic,
    type SidebarDocumentItem,
    type SidebarDocumentNode,
    type SidebarDocumentSeparatorPin,
    type SidebarDocumentSession,
    type SidebarDocumentSessionTree,
    type SidebarDocumentView,
    type SidebarProposalAnchor,
    type SidebarProposalChange,
    type SidebarProposalPlace,
    type HappyAgentBot,
    type HappyAgentSidebarProposalNewRow,
    type HappyAgentSpace,
    type HappyAgentSpaceBatch,
    type HappyAgentSpaceIcon,
    type HappyAgentSpaceId,
    type HappyAgentSpaceTarget,
    type HappyAgentSpacesSnapshot,
    type HappyAgentSpacesStore,
    type HappyAgentTask,
    type ConversationNote,
    type ConversationSummary,
    type HappyAgentClockStore,
    type SidebarReadAheadRows,
    happyAgentSpaceNewWorkIs,
} from "happy-desktop-state";
import {
    clayIconMark,
    clayIconMarkLarge,
    clayIconSlugIs,
    happyIconMark,
    localAgoTime,
    localAgoTimeChangedAt,
    makeStuffIntroHeader,
    Sidebar,
    SidebarChanges,
    type ConversationLeadingHeader,
    type IconName,
    type KeyboardShortcut,
    type MakeStuffOption,
    type MenuItem,
    type SidebarItem,
    type SidebarItemChange,
    type SidebarItemStory,
    type SidebarRowsVisible,
    type StoryRingSegments,
    type TabItem,
} from "happy-desktop-ui";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
    happyAgentSpacesExampleSection,
    type HappyAgentSpacesOnboarding,
} from "./happyAgentSpacesOnboarding";
import { sidebarReadAheadRows } from "../sidebarReadAhead";

/** The places a space can open, as the window addresses them. */
export interface HappyAgentSpacesNavigation {
    onChatSelect(groupId: string, chatId: string): void;
    /** The reader closed the work in a group: the window stops going back to it. */
    onGroupClose?(groupId: string): void;
    onSurfaceOpen?(surfaceId: string): void;
}

/** The parts of one Happy Agent a space resolves against. */
export interface HappyAgentSpacesPlaces {
    readonly bots: readonly HappyAgentBot[];
    readonly tasks: readonly HappyAgentTask[];
    /** The workspace one of the reader's project chats runs in. */
    readonly chatGroupOf: (agentId: string) => string | undefined;
    /** The glyph of what a Surface is, from the catalog that lists it; absent until it does. */
    readonly surfaceIcon?: (surfaceId: string) => IconName | undefined;
}

/** What the window is showing, so the matching row is the selected one. */
export interface HappyAgentSpacesFocus {
    readonly chatId?: string;
    /** The workspace on screen, which selects a worktree row drawn under a node. */
    readonly groupId?: string;
    readonly surfaceId?: string;
    readonly artifactId?: string;
}

/** A row nested under a space: a session the document names, or a worktree the window draws. */
export type HappyAgentSpacesChild =
    | { readonly kind: "session"; readonly agentId: string }
    | { readonly kind: "worktree"; readonly worktreeId: string };

/** A conversation anywhere in a subtask tree that answers `match`. */
function subtaskWhere(
    owners: readonly { readonly subtasks: HappyAgentTask["subtasks"] }[],
    match: (subtask: HappyAgentTask["subtasks"][number]) => boolean,
): HappyAgentTask["subtasks"][number] | undefined {
    for (const owner of owners)
        for (const subtask of owner.subtasks) {
            if (match(subtask)) return subtask;
            const nested = subtaskWhere([subtask], match);
            if (nested) return nested;
        }
    return undefined;
}

/**
 * Where a nested row opens: the workspace and the session in it. A session
 * opens in the workspace it runs in, at any depth. A worktree opens where it
 * was last left, or on its newest chat; a worktree whose only conversation is a
 * task's or subtask's — which the project list does not file under it — opens
 * on that conversation, never on the bare workspace.
 */
export function happyAgentSpacesChildDestination(
    child: HappyAgentSpacesChild,
    places: HappyAgentSpacesPlaces,
    worktrees: readonly {
        readonly id: string;
        readonly conversations: readonly { readonly id: string }[];
    }[],
    resume: (worktreeId: string) => string | undefined,
): { readonly groupId: string; readonly chatId: string } | undefined {
    const owners = [...places.tasks, ...places.bots];
    if (child.kind === "session") {
        const id = child.agentId;
        const found =
            subtaskWhere(owners, (subtask) => subtask.conversation.id === id) ??
            owners.find((owner) => owner.conversation.id === id);
        if (found) return { groupId: found.workspaceId, chatId: id };
        const groupId = places.chatGroupOf(id);
        return groupId === undefined ? undefined : { groupId, chatId: id };
    }
    const id = child.worktreeId;
    const chatId =
        resume(id) ??
        worktrees.find((worktree) => worktree.id === id)?.conversations[0]?.id ??
        subtaskWhere(owners, (subtask) => subtask.workspaceId === id)?.conversation.id ??
        owners.find((owner) => owner.workspaceId === id)?.conversation.id;
    return chatId === undefined ? undefined : { groupId: id, chatId };
}

/** The system key of Happy's own bot. */
const HAPPY_BOT_KEY = "chief_of_staff";
const MENU_OPEN = "open";
const MENU_TIDY = "tidy";
const MENU_LEAVE = "leave";
const MENU_ARCHIVE = "archive";
const MENU_SIDEBAR = "sidebar";
const MENU_ASIDE = "aside";
const MENU_DISCARD = "discard";
const MENU_RENAME = "rename";
const MENU_SUBTASKS_SHOW = "subtasks-show";
const MENU_SUBTASKS_HIDE = "subtasks-hide";
const MENU_SECTION_DELETE = "section-delete";
const MENU_PIN_TOP = "pin-top";
const MENU_PIN_BOTTOM = "pin-bottom";
const MENU_UNPIN = "unpin";
/** Rows a proposal brings, drawn where they would land: their own IDs, beside the rows that stand. */
const PROPOSED_PREFIX = "proposed:";
/** Who proposes the sidebar's changes, as the bar names them. */
const PROPOSER = "Prioritizing";
/** The one list every item stands in: the sidebar has no sections of its own. */
const LIST = "spaces";
/** Rows the window draws under a node, which the document does not name. */
const WORKTREE_PREFIX = "worktree:";

/** The conversation a space opens, when it has one. */
function spaceAgentId(space: HappyAgentSpace): string | undefined {
    return space.target.agentId ?? undefined;
}

/** The workspace a conversation runs in, from the lists that name it. */
function agentGroupOf(
    agentId: string,
    places: HappyAgentSpacesPlaces,
    snapshot: HappyAgentSpacesSnapshot,
): string | undefined {
    return (
        places.tasks.find((task) => task.conversation.id === agentId)?.workspaceId ??
        places.bots.find((bot) => bot.conversation.id === agentId)?.workspaceId ??
        places.chatGroupOf(agentId) ??
        snapshot.agentWorkspaces.get(agentId)
    );
}

function targetTask(target: HappyAgentSpaceTarget, places: HappyAgentSpacesPlaces) {
    return target.kind === "task" ? places.tasks.find((task) => task.id === target.id) : undefined;
}

function targetBot(target: HappyAgentSpaceTarget, places: HappyAgentSpacesPlaces) {
    return target.kind === "bot" ? places.bots.find((bot) => bot.id === target.id) : undefined;
}

/**
 * Where a space opens: its Surface, or its conversation in the workspace that
 * runs it. Nothing for work whose conversation is not listed anywhere yet.
 */
export function happyAgentSpaceDestination(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    snapshot: HappyAgentSpacesSnapshot,
):
    | { readonly kind: "surface"; readonly surfaceId: string }
    | { readonly kind: "chat"; readonly groupId: string; readonly chatId: string }
    | undefined {
    if (space.target.kind === "surface") return { kind: "surface", surfaceId: space.target.id };
    const agentId = spaceAgentId(space);
    if (agentId === undefined) return undefined;
    const groupId = space.target.workspaceId ?? agentGroupOf(agentId, places, snapshot);
    return groupId === undefined ? undefined : { kind: "chat", groupId, chatId: agentId };
}

/** Opens what a space holds where it always opens. */
export function happyAgentSpaceOpen(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    snapshot: HappyAgentSpacesSnapshot,
    navigation: HappyAgentSpacesNavigation,
): void {
    const destination = happyAgentSpaceDestination(space, places, snapshot);
    if (destination?.kind === "surface") navigation.onSurfaceOpen?.(destination.surfaceId);
    else if (destination) navigation.onChatSelect(destination.groupId, destination.chatId);
}

/** The space the window is showing, if a row stands for it. */
export function happyAgentSpaceFocused(
    snapshot: HappyAgentSpacesSnapshot,
    focus: HappyAgentSpacesFocus,
): HappyAgentSpace | undefined {
    for (const space of snapshot.spaces.values()) {
        if (focus.surfaceId !== undefined) {
            if (space.target.kind === "surface" && space.target.id === focus.surfaceId)
                return space;
            continue;
        }
        if (focus.artifactId !== undefined) continue;
        if (focus.chatId !== undefined && spaceAgentId(space) === focus.chatId) return space;
    }
    return undefined;
}

/** Whether a space is Happy's own row: the one whose target is Happy's bot. */
export function happyAgentSpaceHappyIs(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
): boolean {
    return targetBot(space.target, places)?.systemKey === HAPPY_BOT_KEY;
}

/**
 * A picture Prioritizing chose, as a row or a tab wears it. A clay icon is
 * shaped art and stands as drawn; any other picture is somebody's face and is
 * drawn as one, by the same Avatar the classic sidebar uses.
 */
function iconMark(
    icon: HappyAgentSpaceIcon | null | undefined,
): Pick<SidebarItem & TabItem, "imageMark" | "imageUrl"> | undefined {
    if (icon?.type === "library" && clayIconSlugIs(icon.slug))
        return { imageMark: clayIconMark(icon.slug) };
    if (icon?.type === "image") return { imageUrl: icon.url };
    return undefined;
}

/**
 * The identity a space wears in a row or a tab.
 *
 * The row's own icon comes first: the stem cell while the work is still taking
 * shape, then the clay icon or picture chosen for it. Only a row with no icon
 * at all reaches for a face — its bot's avatar or its task owner's, uploaded or
 * not — drawn round as its classic row draws it. Without either, new work is the
 * stem cell and named work wears the plain glyph of what it is.
 */
export function happyAgentSpaceMark(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    stemCellAnimation: boolean,
): Pick<SidebarItem & TabItem, "icon" | "imageMark" | "imageUrl" | "stemCell" | "happyMark"> {
    // Happy wears its own mark wherever it appears: its row, its tab, the palette.
    if (happyAgentSpaceHappyIs(space, places)) return { happyMark: true };
    const icon = space.icon;
    if (icon?.type === "stem_cell") return { stemCell: { id: space.id } };
    // A clay icon is what a stem cell becomes; unless the reader turned it
    // off, a row or tab that sees the change on screen grows the cell into it.
    if (icon?.type === "library" && clayIconSlugIs(icon.slug) && stemCellAnimation)
        return { imageMark: { ...clayIconMark(icon.slug), growsFromStemCell: true } };
    const chosen = iconMark(icon);
    if (chosen) return chosen;
    const face =
        targetBot(space.target, places)?.avatar ?? targetTask(space.target, places)?.owner?.avatar;
    if (face) return { imageUrl: face.url };
    if (space.title === null) return { stemCell: { id: space.id } };
    if (space.target.kind === "surface")
        return { icon: places.surfaceIcon?.(space.target.id) ?? "doc" };
    return { icon: space.target.kind === "task" ? "tasks" : "agents" };
}

/** The picture Prioritizing chose for a session, for its row and its tab. */
export function happyAgentSessionMark(
    snapshot: HappyAgentSpacesSnapshot,
    agentId: string,
): Pick<SidebarItem & TabItem, "imageMark" | "imageUrl"> | undefined {
    return iconMark(snapshot.sidebar?.agentIcons.get(agentId));
}

/** The name a space goes by, the same in its row and in its tab. */
export function happyAgentSpaceLabel(space: HappyAgentSpace): string {
    // Work is "New" until it has a name; it does not announce what it will be.
    return space.title ?? "New";
}

/**
 * Whether Prioritizing's row says its proposal waits for an answer. Where the
 * window holds Prioritizing's conversation, its unread state decides, and
 * opening the chat reads it. Where it does not — Prioritizing is a hidden
 * subtask of Happy's bot — the proposal waits until the person has opened
 * the chat on this device at or after its latest version.
 */
export function happyAgentSpaceProposalWaits(
    space: HappyAgentSpace,
    snapshot: HappyAgentSpacesSnapshot,
    places: HappyAgentSpacesPlaces,
): boolean {
    if (space.target.kind !== "agent" || snapshot.proposal === null) return false;
    const agentId = spaceAgentId(space);
    const conversation =
        agentId === undefined
            ? undefined
            : (subtaskWhere(
                  [...places.tasks, ...places.bots],
                  (subtask) => subtask.conversation.id === agentId,
              )?.conversation ??
              places.tasks.find((task) => task.conversation.id === agentId)?.conversation);
    return conversation ? conversation.unread === true : !snapshot.proposalSeen;
}

/**
 * A space as its row: a task's row as the current sidebar draws one, with the
 * waiting and question marks, unread dot, and title shimmer. Running work
 * shimmers its title and spins only in its tab.
 */
function spaceRow(
    space: HappyAgentSpace,
    snapshot: HappyAgentSpacesSnapshot,
    places: HappyAgentSpacesPlaces,
    titleShimmerEnabled: boolean,
    stemCellAnimation: boolean,
): SidebarItem {
    const conversation = (targetTask(space.target, places) ?? targetBot(space.target, places))
        ?.conversation;
    // The conversation the window holds is live: its agent's own events end
    // its work the moment a turn settles or is stopped. The space's `working`
    // is the daemon's reading at the row's last change and is not sent again
    // when the run ends, so it is only for a row whose conversation the
    // window does not hold.
    const activity = conversation
        ? conversation.activity
        : space.working
          ? ("running" as const)
          : undefined;
    return {
        id: `space:${space.id}`,
        kind: "project",
        label: happyAgentSpaceLabel(space),
        labelShimmer: titleShimmerEnabled,
        workingIndicator: "none",
        // Happy's row wears Happy's own mark, which New divides.
        ...happyAgentSpaceMark(space, places, stemCellAnimation),
        ...(activity === "awaitingInput"
            ? { status: "awaitingInput" as const }
            : activity === "running"
              ? { status: "working" as const }
              : activity === "waiting"
                ? { status: "waiting" as const }
                : {}),
        ...(conversation?.unread || happyAgentSpaceProposalWaits(space, snapshot, places)
            ? { unread: true }
            : {}),
    };
}

const MENU_OPEN_ITEM = {
    kind: "item",
    id: MENU_OPEN,
    label: "Open",
    icon: "open-external",
} as const satisfies MenuItem;

/**
 * What a drawn row stands for. A row nested under another is one of the
 * person's spaces when it is one — attached, or a session whose conversation
 * is a space's — and is then that space in every way; otherwise a subtask with
 * no space of its own, or a worktree the window draws.
 */
export type HappyAgentSpacesRowSubject =
    | { readonly kind: "space"; readonly space: HappyAgentSpace }
    | {
          readonly kind: "subtask";
          readonly agentId: string;
          readonly subtask: HappyAgentTask["subtasks"][number];
          /** Whether the reader may archive it: a bot's, or a task's they may archive. */
          readonly archivable: boolean;
      }
    | { readonly kind: "worktree"; readonly worktreeId: string };

/** What the row drawn under `id` stands for, or nothing for a row that holds none. */
export function happyAgentSpacesRowSubject(
    id: string,
    snapshot: HappyAgentSpacesSnapshot,
    places: HappyAgentSpacesPlaces,
): HappyAgentSpacesRowSubject | undefined {
    if (id.startsWith("space:")) {
        const space = snapshot.spaces.get(id.slice("space:".length) as HappyAgentSpaceId);
        return space === undefined ? undefined : { kind: "space", space };
    }
    if (id.startsWith(WORKTREE_PREFIX))
        return { kind: "worktree", worktreeId: id.slice(WORKTREE_PREFIX.length) };
    if (!id.startsWith("session:")) return undefined;
    const agentId = id.slice("session:".length);
    for (const space of snapshot.spaces.values())
        if (spaceAgentId(space) === agentId) return { kind: "space", space };
    const match = (subtask: HappyAgentTask["subtasks"][number]) =>
        subtask.conversation.id === agentId;
    for (const task of places.tasks) {
        const subtask = subtaskWhere([task], match);
        if (subtask) return { kind: "subtask", agentId, subtask, archivable: task.canArchive };
    }
    const subtask = subtaskWhere(places.bots, match);
    return subtask ? { kind: "subtask", agentId, subtask, archivable: true } : undefined;
}

/** What a subtask's row offers. Its title is the daemon's to write, so it has no rename. */
function subtaskMenu(archivable: boolean, actions: HappyAgentSpacesActions): MenuItem[] {
    return [
        MENU_OPEN_ITEM,
        ...(archivable && actions.subtaskArchive
            ? [
                  { kind: "separator" as const },
                  {
                      kind: "item" as const,
                      id: MENU_ARCHIVE,
                      label: "Archive subtask",
                      icon: "archive" as const,
                  },
              ]
            : []),
    ];
}

/** What a worktree's row offers, as its row in the project list does. */
function worktreeMenu(actions: HappyAgentSpacesActions): MenuItem[] {
    return [
        MENU_OPEN_ITEM,
        ...(actions.worktreeRename
            ? [
                  {
                      kind: "item" as const,
                      id: MENU_RENAME,
                      label: "Rename workspace",
                      icon: "edit" as const,
                  },
              ]
            : []),
        ...(actions.worktreeArchive
            ? [
                  { kind: "separator" as const },
                  {
                      kind: "item" as const,
                      id: MENU_ARCHIVE,
                      label: "Archive workspace",
                      icon: "archive" as const,
                  },
              ]
            : []),
    ];
}

/** What a row's menu offers, by what the row holds. */
function spaceMenu(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    actions: HappyAgentSpacesActions,
): MenuItem[] {
    const open = MENU_OPEN_ITEM;
    if (happyAgentSpaceHappyIs(space, places))
        return [
            open,
            { kind: "separator" },
            { kind: "item", id: MENU_TIDY, label: "Tidy sidebar now", icon: "list" },
        ];
    switch (space.target.kind) {
        case "task": {
            const task = targetTask(space.target, places);
            // Renamed by hand from here or with Enter, as the classic sidebar did.
            const rename: MenuItem[] = actions.taskRename
                ? [{ kind: "item", id: MENU_RENAME, label: "Rename task", icon: "edit" }]
                : [];
            // New work nobody named yet closes from here and only from here.
            if (happyAgentSpaceNewWorkIs(space))
                return [
                    open,
                    ...rename,
                    { kind: "separator" },
                    { kind: "item", id: MENU_DISCARD, label: "Close new work", icon: "close" },
                ];
            return [
                open,
                ...rename,
                { kind: "separator" },
                { kind: "item", id: MENU_LEAVE, label: "Leave task", icon: "close" },
                ...(task?.canArchive
                    ? [
                          {
                              kind: "item" as const,
                              id: MENU_ARCHIVE,
                              label: "Archive task",
                              icon: "archive" as const,
                          },
                      ]
                    : []),
            ];
        }
        case "bot":
            return [
                { ...open, label: "Open bot" },
                ...(actions.botRename
                    ? [
                          {
                              kind: "item" as const,
                              id: MENU_RENAME,
                              label: "Rename bot",
                              icon: "edit" as const,
                          },
                      ]
                    : []),
                { kind: "separator" },
                { kind: "item", id: MENU_ARCHIVE, label: "Archive bot", icon: "archive" },
            ];
        case "surface":
            return [
                open,
                { kind: "separator" },
                { kind: "item", id: MENU_LEAVE, label: "Leave", icon: "close" },
            ];
        // Prioritizing's own conversation is the window's to keep.
        case "agent":
            return [open];
    }
}

/** A conversation's subtasks as the sessions the document may show under it. */
function sessionTreeOf(
    subtasks: HappyAgentTask["subtasks"],
): readonly SidebarDocumentSessionTree[] {
    return subtasks.map((subtask) => ({
        id: subtask.conversation.id,
        children: sessionTreeOf(subtask.subtasks),
    }));
}

/**
 * The acts a row's menu reaches beyond opening it. A leave or archive takes
 * its row away at once and resolves `false` when the host refused it, which
 * puts the row back.
 */
export interface HappyAgentSpacesActions {
    taskLeave(taskId: string): Promise<boolean>;
    taskArchive(taskId: string): Promise<boolean>;
    botArchive(botId: string): Promise<boolean>;
    surfaceLeave(surfaceId: string): Promise<boolean>;
    /** Archives a subtask by its conversation; its row goes at once, with everything under it. */
    subtaskArchive?(agentId: string): void;
    /** Archives a worktree drawn under a node; absent where the window cannot. */
    worktreeArchive?(worktreeId: string): void;
    /** Renames a worktree drawn under a node; its row wears the name at once. */
    worktreeRename?(worktreeId: string, name: string): void;
    /**
     * Renames a task by hand, resolving whether the host took the name;
     * absent for a Happy Agent that cannot.
     */
    taskRename?(taskId: string, name: string): Promise<boolean>;
    /** Renames a bot by hand, the same way. */
    botRename?(botId: string, name: string): Promise<boolean>;
}

/** The window's two commands, which stand in the list like any item. */
export interface HappyAgentSpacesCommand {
    readonly label: string;
    readonly shortcut?: KeyboardShortcut;
    readonly onOpen: () => void;
}

export interface HappyAgentSpacesSidebarProps {
    readonly store: HappyAgentSpacesStore;
    readonly snapshot: HappyAgentSpacesSnapshot;
    readonly places: HappyAgentSpacesPlaces;
    readonly focus: HappyAgentSpacesFocus;
    readonly navigation: HappyAgentSpacesNavigation;
    readonly actions: HappyAgentSpacesActions;
    /** Opens the window's search, from its item. */
    readonly search?: HappyAgentSpacesCommand;
    /** Makes new work, from its item. */
    readonly create?: HappyAgentSpacesCommand;
    /** Makes new work right under a section heading, from the heading's `+`; takes the section's document ID. */
    readonly onSectionCreate?: (sectionId: string) => void;
    readonly now: number;
    /** The window's clock, which each row's time counts against; without it, `now`. */
    readonly clock?: HappyAgentClockStore;
    /** Whether a working row shimmers its title, as the reader set it. */
    readonly titleShimmerEnabled: boolean;
    /** Whether a row that sees its stem cell get an icon grows it, as the reader set it. */
    readonly stemCellAnimation: boolean;
    /** Happy's membrane seed after it last divided, as this window keeps it. */
    readonly happySeed?: number;
    readonly onHappySeed?: (seed: number) => void;
    readonly brand: boolean;
    readonly footer: ReactNode;
    readonly headerAccessory?: ReactNode;
    /** A band above everything the sidebar lists, such as the stories row. */
    readonly topAccessory?: ReactNode;
    /** The wheel turned over the rows, for a top accessory that folds away. */
    readonly onBodyWheel?: (deltaY: number) => void;
    /** The conversations the rows open, top to bottom, and which are on screen, as they change. */
    readonly onConversationsVisibleChange?: (rows: SidebarReadAheadRows) => void;
    /**
     * What the reader had folded and hidden in the classic sidebar. The
     * daemon's first document mirrors that sidebar without knowing these, so
     * the store writes them into it once it arrives.
     */
    readonly classic?: SidebarDocumentClassic;
    /** A session's row, by its agent, from the window's lists; absent until they know it. */
    readonly sessionRow: (agentId: string) => SidebarItem | undefined;
    /** The worktrees an agent made, as rows; the window draws them under that agent's node. */
    readonly worktreeRows: (agentId: string) => readonly SidebarItem[];
    /** Opens a session or a worktree, which is a conversation rather than a space. */
    readonly onChildSelect: (child: HappyAgentSpacesChild) => void;
    /** Opens the sidebar document itself, from Happy's row. */
    readonly onSidebarOpen?: (artifactId: string) => void;
    /** Opens a space's conversation beside the one on screen. */
    readonly onChatAside?: (agentId: string, label: string) => void;
    /**
     * Prioritizing's proposals. While one waits for an answer, the sidebar
     * draws it on its own rows and answers it there.
     */
    readonly proposals?: HappyAgentSidebarProposalsStore;
    /**
     * Stories, while the person has them on: every conversation's row is
     * drawn two lines tall, its agent's status under its title and its story
     * ring around its picture, and the ring opens the agent's stories.
     */
    readonly stories?: HappyAgentSpacesStories;
    /** First run, while it goes on: the example, and the work Happy proposed. */
    readonly onboarding?: HappyAgentSpacesOnboarding;
}

/** What Stories add to the sidebar's rows. */
export interface HappyAgentSpacesStories {
    /** Each agent's ring, by its agent ID; an agent with no stories up has none. */
    readonly rings: ReadonlyMap<string, StoryRingSegments>;
    /**
     * Every worktree the window knows, with its live Git line totals and the
     * agent that made it, so a row can sum the lines its work changed.
     */
    readonly worktrees: readonly Pick<
        HappyAgentWorktreeGroup,
        "id" | "creatorAgentId" | "addedLines" | "deletedLines"
    >[];
    onRingOpen(agentId: string): void;
}

/**
 * The lines a task's or bot's work has added and deleted: summed over its own
 * workspace, every subtask's at any depth, and every worktree it or a subtask
 * made, each counted once. Absent for a conversation that is neither, or whose
 * workspaces changed nothing.
 */
function ownedLines(
    agentId: string,
    places: HappyAgentSpacesPlaces,
    worktrees: HappyAgentSpacesStories["worktrees"],
): { added: number; deleted: number } | undefined {
    const owner = [...places.tasks, ...places.bots].find(
        (candidate) => candidate.conversation.id === agentId,
    );
    if (owner === undefined) return undefined;
    const workspaces = new Set<string>([owner.workspaceId]);
    const agents = new Set<string>([agentId]);
    const walk = (subtasks: readonly HappyAgentBotSubtask[]) => {
        for (const subtask of subtasks) {
            workspaces.add(subtask.workspaceId);
            agents.add(subtask.conversation.id);
            walk(subtask.subtasks);
        }
    };
    walk(owner.subtasks);
    let added = 0;
    let deleted = 0;
    for (const worktree of worktrees)
        if (
            workspaces.has(worktree.id) ||
            (worktree.creatorAgentId !== null && agents.has(worktree.creatorAgentId))
        ) {
            added += worktree.addedLines ?? 0;
            deleted += worktree.deletedLines ?? 0;
        }
    return added > 0 || deleted > 0 ? { added, deleted } : undefined;
}

/** The conversation an agent's row stands for, from the window's lists. */
function conversationOf(agentId: string, places: HappyAgentSpacesPlaces) {
    return (
        places.tasks.find((task) => task.conversation.id === agentId)?.conversation ??
        places.bots.find((bot) => bot.conversation.id === agentId)?.conversation ??
        subtaskWhere(
            [...places.tasks, ...places.bots],
            (subtask) => subtask.conversation.id === agentId,
        )?.conversation
    );
}

/**
 * The name and picture an agent goes by where its stories are watched: its
 * space's, as its row wears them, else its conversation's title alone.
 */
export function happyAgentSpacesAgentIdentity(
    agentId: string,
    snapshot: HappyAgentSpacesSnapshot,
    places: HappyAgentSpacesPlaces,
):
    | {
          readonly label: string;
          readonly mark?: Pick<SidebarItem, "icon" | "imageMark" | "imageUrl" | "stemCell">;
      }
    | undefined {
    for (const space of snapshot.spaces.values())
        if (spaceAgentId(space) === agentId)
            return {
                label: happyAgentSpaceLabel(space),
                mark: happyAgentSpaceMark(space, places, false),
            };
    const conversation = conversationOf(agentId, places);
    return conversation ? { label: conversation.title } : undefined;
}

/**
 * When a conversation last did something the person would want to know about,
 * which its row's time counts from: the daemon's own last activity once the
 * conversation carries it, else the later of the agent's last status and the
 * conversation's newest content.
 */
function conversationActivityAt(conversation: ConversationSummary): number {
    return (
        conversation.lastActivityAt ??
        Math.max(conversation.statusLine?.updatedAt ?? 0, conversation.updatedAt)
    );
}

/**
 * The one signal a story row's corner shows: the chat's spinner while its
 * agent works, else a dot while it has something unread. A question waiting
 * on the person is said by its status line.
 */
function storySignal(item: SidebarItem): SidebarItemStory["signal"] {
    if (item.status === "working") return "working";
    if (item.unread) return "unread";
    return undefined;
}

/**
 * A conversation's top-level row as Stories draw it: the lines its work
 * changed and the agent's status line under the title, then the person's
 * unsent draft; how long since its last activity at the title's end; its ring;
 * and its one corner signal.
 */
function storyRow(
    item: SidebarItem,
    agentId: string,
    places: HappyAgentSpacesPlaces,
    stories: HappyAgentSpacesStories,
    time: string | undefined,
): SidebarItem {
    const conversation = conversationOf(agentId, places);
    const ring = stories.rings.get(agentId);
    const signal = storySignal(item);
    const lines = ownedLines(agentId, places, stories.worktrees);
    return {
        ...item,
        story: {
            ...(lines ? { changeStats: lines } : {}),
            ...(conversation?.statusLine ? { subtitle: conversation.statusLine.text } : {}),
            ...(conversation?.draftPreview ? { draft: conversation.draftPreview } : {}),
            ...(time === undefined ? {} : { time }),
            ...(ring ? { ring } : {}),
            ...(signal ? { signal } : {}),
        },
    };
}

/**
 * A nested row without Stories: a project with no picture is said by the
 * worktree glyph rather than its initials, beside the row's tree stem.
 */
function nestedClassicRow(item: SidebarItem): SidebarItem {
    const { contextAvatars, ...rest } = item;
    if (!contextAvatars?.length || contextAvatars.some((avatar) => avatar.imageUrl !== undefined))
        return item;
    return { ...rest, icon: "branch" };
}

/** The document as items, or nothing when there is none or it is not one the window will draw. */
function documentViewOf(html: string | undefined): SidebarDocumentView | undefined {
    if (html === undefined) return undefined;
    try {
        return sidebarDocumentView(html);
    } catch {
        return undefined;
    }
}

/**
 * The sidebar a daemon without the document keeps, read as one: Search and
 * Create, Happy and new work, each section behind its heading, and
 * folded work behind a bare, folded one. Nothing in it can be written back.
 */
function legacyViewOf(snapshot: HappyAgentSpacesSnapshot): SidebarDocumentView {
    const space = (entry: HappyAgentSpace): SidebarDocumentItem => ({
        kind: "space",
        id: entry.id,
        expanded: true,
        children: [],
    });
    const older = happyAgentSpacesOlder(snapshot.spaces);
    return {
        items: [
            { kind: "search" },
            { kind: "create" },
            ...happyAgentSpacesIn(snapshot.spaces, null).map(space),
            ...snapshot.sections.flatMap((section) => [
                {
                    kind: "section" as const,
                    id: section.id,
                    label: section.name,
                    collapsed: section.collapsed,
                },
                ...happyAgentSpacesIn(snapshot.spaces, section.id).map(space),
            ]),
            ...(older.length > 0
                ? [{ kind: "separator" as const, id: "older" }, ...older.map(space)]
                : []),
        ],
    };
}

/** The document with one section's heading renamed; labels need not be unique. */
export function sidebarDocumentRelabel(
    view: SidebarDocumentView,
    key: string,
    label: string,
): SidebarDocumentView | undefined {
    if (!view.items.some((node) => sidebarDocumentKey(node) === key && node.kind === "section"))
        return undefined;
    return {
        ...view,
        items: view.items.map((node) =>
            sidebarDocumentKey(node) === key && node.kind === "section" ? { ...node, label } : node,
        ),
    };
}

/**
 * The document without one section's heading. Its items join the block above,
 * as the daemon's own `remove` of a section leaves them.
 */
export function sidebarDocumentSectionRemove(
    view: SidebarDocumentView,
    key: string,
): SidebarDocumentView | undefined {
    if (!view.items.some((node) => sidebarDocumentKey(node) === key && node.kind === "section"))
        return undefined;
    return { ...view, items: view.items.filter((node) => sidebarDocumentKey(node) !== key) };
}

/** What the document's rows are drawn from, beside the document itself. */
export interface HappyAgentSpacesItemsInput {
    readonly view: SidebarDocumentView;
    readonly snapshot: HappyAgentSpacesSnapshot;
    readonly places: HappyAgentSpacesPlaces;
    /** Whether rows may be carried; a read-only document holds them in place. */
    readonly editable: boolean;
    readonly titleShimmerEnabled: boolean;
    readonly stemCellAnimation: boolean;
    readonly search?: HappyAgentSpacesCommand;
    readonly create?: HappyAgentSpacesCommand;
    /** Whether an open section's heading offers new work under it. */
    readonly sectionCreate?: boolean;
    readonly sessionRow: (agentId: string) => SidebarItem | undefined;
    readonly worktreeRows: (agentId: string) => readonly SidebarItem[];
    /** Whether Stories draw the rows, which name a nested row's project themselves. */
    readonly stories?: boolean;
    /** A proposal's new chats, by the space ID its document names each by. */
    readonly newRows?: ReadonlyMap<string, HappyAgentSidebarProposalNewRow>;
}

/**
 * A sidebar document as the rows the Sidebar draws, and the document node each
 * drawn row stands for (or, for a worktree, the node it follows). The window's
 * own sidebar and a proposal of one are drawn by this one function.
 */
export function happyAgentSpacesItems(input: HappyAgentSpacesItemsInput): {
    readonly items: SidebarItem[];
    readonly anchorOf: ReadonlyMap<string, string | null>;
} {
    const { view, snapshot, places, editable } = input;
    const anchorOf = new Map<string, string | null>();
    const foldReveal = (own: "hover" | "always" | undefined) =>
        (own ?? view.foldRibbon) === "always" ? { foldReveal: "always" as const } : {};
    // A node's own row, then — open or shut, the fold decides what shows —
    // its sessions and the worktrees its agent made.
    const nested = (
        agentId: string | undefined,
        sessions: readonly SidebarDocumentSession[],
        depth: number,
    ): SidebarItem[] => {
        const rows: SidebarItem[] = [];
        let last: string | null = null;
        for (const session of sessions) {
            const space = snapshot.spaces.get(session.id as HappyAgentSpaceId);
            if (space !== undefined) {
                // An attachment: the space's own row, under the same ID it has
                // at the top level, so carrying it in or out keeps the row.
                const key = sidebarDocumentKey(session);
                const id = `space:${space.id}`;
                anchorOf.set(id, key);
                last = key;
                const children = nested(spaceAgentId(space), session.children, depth + 1);
                rows.push(
                    {
                        ...spaceRow(
                            space,
                            snapshot,
                            places,
                            input.titleShimmerEnabled,
                            input.stemCellAnimation,
                        ),
                        depth,
                        ...foldReveal(session.foldRibbon),
                        ...(children.length > 0 ? { collapsed: !session.expanded } : {}),
                    },
                    ...children,
                );
                continue;
            }
            const own = input.sessionRow(session.id);
            if (own === undefined) continue;
            const row = input.stories ? own : nestedClassicRow(own);
            const key = sidebarDocumentKey(session);
            anchorOf.set(key, key);
            last = key;
            const children = nested(session.id, session.children, depth + 1);
            // A session that is a space's own conversation — a task shown under
            // the work that started it — goes by that space's name, which its
            // menu renames.
            const named = [...snapshot.spaces.values()].find(
                (candidate) => spaceAgentId(candidate) === session.id,
            );
            rows.push(
                {
                    ...row,
                    ...(named ? { label: happyAgentSpaceLabel(named) } : {}),
                    ...happyAgentSessionMark(snapshot, session.id),
                    id: key,
                    depth,
                    workingIndicator: "none",
                    ...foldReveal(session.foldRibbon),
                    ...(children.length > 0 ? { collapsed: !session.expanded } : {}),
                },
                ...children,
            );
        }
        if (agentId !== undefined)
            for (const own of input.worktreeRows(agentId)) {
                const worktree = input.stories ? own : nestedClassicRow(own);
                const id = `${WORKTREE_PREFIX}${worktree.id}`;
                anchorOf.set(id, last);
                rows.push({
                    ...worktree,
                    id,
                    depth,
                    reorderable: false,
                    workingIndicator: "none",
                });
            }
        return rows;
    };
    const items: SidebarItem[] = view.items.flatMap((item): SidebarItem[] => {
        const key = sidebarDocumentKey(item);
        anchorOf.set(key, key);
        switch (item.kind) {
            case "search":
            case "create": {
                const command = item.kind === "search" ? input.search : input.create;
                if (!command) return [];
                return [
                    {
                        id: key,
                        kind: "action",
                        icon: item.kind === "search" ? "search" : "compose",
                        label: command.label,
                        ...(command.shortcut ? { shortcut: command.shortcut } : {}),
                        ...(editable ? {} : { reorderable: false }),
                    },
                ];
            }
            case "section":
                return [
                    {
                        id: key,
                        kind: "section",
                        label: item.label,
                        collapsed: item.collapsed,
                        // A heading offers new work in its section. Desktop
                        // reveals the control on hover, including when folded.
                        ...(editable && input.sectionCreate
                            ? {
                                  action: {
                                      icon: "plus" as const,
                                      label: `New in ${item.label}`,
                                      reveal: "hover" as const,
                                  },
                              }
                            : {}),
                        ...(editable ? {} : { reorderable: false }),
                    },
                ];
            case "separator":
                return [
                    {
                        id: key,
                        kind: "separator",
                        label: "",
                        ...(item.pin ? { pin: item.pin } : {}),
                        ...(editable ? {} : { reorderable: false }),
                    },
                ];
            // Prioritizing's own markup, drawn isolated where the document puts it.
            case "widget":
                return [
                    {
                        id: key,
                        kind: "widget",
                        label: "Focus",
                        widgetHtml: item.html,
                        ...(editable ? {} : { reorderable: false }),
                    },
                ];
            case "space": {
                const space = snapshot.spaces.get(item.id as HappyAgentSpaceId);
                // A chat a proposal would start: its title and icon, marked new.
                const proposed = space === undefined ? input.newRows?.get(item.id) : undefined;
                if (proposed)
                    return [
                        {
                            id: key,
                            kind: "project",
                            label: proposed.title,
                            note: "new",
                            workingIndicator: "none",
                            ...(proposed.icon !== undefined && clayIconSlugIs(proposed.icon)
                                ? { imageMark: clayIconMark(proposed.icon) }
                                : { stemCell: { id: item.id } }),
                            ...(editable ? {} : { reorderable: false }),
                        },
                    ];
                // A space this window does not know yet draws nothing until it does.
                if (space === undefined) return [];
                const children = nested(spaceAgentId(space), item.children, 1);
                const happy = happyAgentSpaceHappyIs(space, places);
                return [
                    {
                        ...spaceRow(
                            space,
                            snapshot,
                            places,
                            input.titleShimmerEnabled,
                            input.stemCellAnimation,
                        ),
                        // A tidy's note lands in Happy, which says so until it is read.
                        ...(snapshot.noteUnread && happy ? { unread: true } : {}),
                        ...foldReveal(item.foldRibbon),
                        ...(children.length > 0 ? { collapsed: !item.expanded } : {}),
                        ...(editable ? {} : { reorderable: false }),
                    },
                    ...children,
                ];
            }
        }
    });
    return { items, anchorOf };
}

/** The person's sidebar with a proposal drawn on it. */
export interface HappyAgentSpacesProposalRows {
    readonly items: SidebarItem[];
    /** The change each marked or proposed row answers, by the row's ID. */
    readonly changeOf: ReadonlyMap<string, SidebarProposalChange>;
}

/**
 * A proposal's pending changes drawn on the rows of the sidebar as it stands:
 * a row that moves, goes or is archived wears its change where it is, and a
 * row the proposal moves or adds is drawn again where it would land, under
 * its own ID. A change to a whole section marks its heading and its rows as
 * one block. The words are the window's; where everything goes is the diff's.
 */
export function happyAgentSpacesProposalItems(
    input: HappyAgentSpacesItemsInput,
    standing: {
        readonly items: readonly SidebarItem[];
        readonly anchorOf: ReadonlyMap<string, string | null>;
    },
    proposed: SidebarDocumentView,
    /** Every change of the proposal, in the diff's order. */
    all: readonly SidebarProposalChange[],
    /** The changes the person declined one by one, which are drawn as nothing. */
    declined: ReadonlySet<string>,
): HappyAgentSpacesProposalRows {
    const current = input.view;
    const changes = all.filter((change) => !declined.has(change.id));
    /** The drawn row of each node that stands now, by key; a worktree is no node. */
    const rowOf = new Map<string, string>();
    for (const row of standing.items) {
        const key = standing.anchorOf.get(row.id);
        if (key && !row.id.startsWith(WORKTREE_PREFIX)) rowOf.set(key, row.id);
    }
    /** A heading of either document, by key. */
    const headingOf = (key: string) =>
        [...current.items, ...proposed.items].find(
            (item): item is Extract<SidebarDocumentItem, { kind: "section" | "separator" }> =>
                (item.kind === "section" || item.kind === "separator") &&
                sidebarDocumentKey(item) === key,
        );
    /** What a node goes by: a section's title, the divider, or its row's name. */
    const nameOf = (key: string): string => {
        const heading = headingOf(key);
        if (heading?.kind === "section") return heading.label;
        if (heading?.kind === "separator") return "the divider";
        const id = rowOf.get(key);
        return standing.items.find((row) => row.id === id)?.label ?? "another row";
    };
    /** A place in words: `to` is where something goes, `from` where it comes from. */
    const placeWords = (place: SidebarProposalPlace | undefined, side: "to" | "from"): string => {
        if (place?.kind === "nested") return `under ${nameOf(place.parent)}`;
        if (place === undefined || place.head === null)
            return side === "to" ? "to the top" : "from the top";
        const block =
            headingOf(place.head)?.kind === "separator" ? "below the divider" : nameOf(place.head);
        return side === "to" ? `to ${block}` : `from ${block}`;
    };
    /** What the change says on the row it changes now, and on the row it brings. */
    const words = (
        change: SidebarProposalChange,
    ): { readonly here: string; readonly there: string } => {
        const heading = headingOf(change.key);
        const name = nameOf(change.key);
        const whole = change.members.length > 0;
        switch (change.kind) {
            case "move": {
                if (heading) {
                    // A heading's place is the block it follows.
                    const after = (place: SidebarProposalPlace | undefined) =>
                        place?.kind === "top" && place.head !== null
                            ? `below ${nameOf(place.head)}`
                            : undefined;
                    const to = after(change.to);
                    const from = after(change.from);
                    return {
                        here: `Moving ${name} ${to ?? "to the top"}`,
                        there: `Moving ${name} here from ${from ?? "the top"}`,
                    };
                }
                return {
                    here: `Moving ${placeWords(change.to, "to")}`,
                    there: `Moving here ${placeWords(change.from, "from")}`,
                };
            }
            case "insert": {
                const there =
                    heading?.kind === "section"
                        ? `Adding the ${name} section`
                        : heading?.kind === "separator"
                          ? "Adding a divider"
                          : change.to?.kind === "nested"
                            ? `Showing ${placeWords(change.to, "to")}`
                            : "Adding to the sidebar";
                return { here: there, there };
            }
            case "remove": {
                const here =
                    heading?.kind === "section"
                        ? whole
                            ? `Hiding ${name} from the sidebar`
                            : `Removing the ${name} heading`
                        : heading?.kind === "separator"
                          ? "Removing the divider"
                          : "Hiding from the sidebar";
                return { here, there: here };
            }
            case "archive": {
                const here = whole ? `Archiving ${name}` : "Archiving";
                return { here, there: here };
            }
        }
    };

    const changeOf = new Map<string, SidebarProposalChange>();
    // What stands now wears what happens to it.
    const marks = new Map<string, SidebarItemChange>();
    for (const change of changes) {
        if (change.kind === "insert") continue;
        const kind = change.kind;
        const block = change.members.length > 0;
        marks.set(change.key, {
            kind,
            label: words(change).here,
            ...(block ? { block: "head" as const } : {}),
        });
        for (const member of change.members) marks.set(member, { kind, block: "member" });
    }
    const items: SidebarItem[] = standing.items.map((row) => {
        const key = row.id.startsWith(WORKTREE_PREFIX) ? undefined : standing.anchorOf.get(row.id);
        const mark = key ? marks.get(key) : undefined;
        if (!key || !mark) return row;
        const change = changes.find((entry) => entry.key === key || entry.members.includes(key));
        if (change) changeOf.set(row.id, change);
        return { ...row, change: mark };
    });

    // What a change brings is drawn where it would land.
    /** Where the rows drawn after `index` stop belonging to it, and for `block` to its block. */
    const endAfter = (index: number, end: "node" | "block"): number => {
        const depth = items[index]?.depth ?? 0;
        let at = index + 1;
        while (at < items.length && (items[at]!.depth ?? 0) > depth) at += 1;
        if (end === "block")
            while (
                at < items.length &&
                !(
                    (items[at]!.depth ?? 0) === 0 &&
                    (items[at]!.kind === "section" || items[at]!.kind === "separator")
                )
            )
                at += 1;
        return at;
    };
    const lastOf = (changeId: string): number => {
        for (let index = items.length - 1; index >= 0; index -= 1)
            if (
                items[index]!.id.startsWith(PROPOSED_PREFIX) &&
                changeOf.get(items[index]!.id)?.id === changeId
            )
                return index;
        return -1;
    };
    const slot = (anchor: SidebarProposalAnchor, parent: string | null): number | undefined => {
        switch (anchor.kind) {
            case "first": {
                if (parent === null) return 0;
                const at = items.findIndex((row) => row.id === rowOf.get(parent));
                return at < 0 ? undefined : at + 1;
            }
            case "node": {
                const at = items.findIndex((row) => row.id === rowOf.get(anchor.key));
                return at < 0 ? undefined : endAfter(at, anchor.end);
            }
            case "change": {
                const at = lastOf(anchor.change);
                if (at >= 0) return endAfter(at, anchor.end);
                // Declined or not drawn: it lands where that one would have.
                const before = all.find((entry) => entry.id === anchor.change)?.ghost?.after;
                if (before === undefined) return undefined;
                return slot(
                    before.kind === "first" ? before : { ...before, end: anchor.end },
                    parent,
                );
            }
        }
    };
    /** One node the proposal brings, as the row it would be, under `depth`. */
    const ghostRows = (nodes: readonly SidebarDocumentNode[], depth: number): SidebarItem[] =>
        nodes.flatMap((node): SidebarItem[] => {
            const own: SidebarDocumentItem =
                node.kind === "session" || node.kind === "space"
                    ? { kind: "space", id: node.id, expanded: false, children: [] }
                    : node;
            const drawn =
                node.kind === "session" && !input.snapshot.spaces.has(node.id as HappyAgentSpaceId)
                    ? (() => {
                          const own = input.sessionRow(node.id);
                          const row = own && (input.stories ? own : nestedClassicRow(own));
                          return row
                              ? [
                                    {
                                        ...row,
                                        ...happyAgentSessionMark(input.snapshot, node.id),
                                        id: sidebarDocumentKey(node),
                                        workingIndicator: "none" as const,
                                    },
                                ]
                              : [];
                      })()
                    : happyAgentSpacesItems({
                          ...input,
                          view: { ...proposed, items: [own] },
                          editable: false,
                      }).items;
            return drawn.map((row) => {
                const { collapsed: _collapsed, action: _action, ...rest } = row;
                return { ...rest, id: `${PROPOSED_PREFIX}${row.id}`, depth, reorderable: false };
            });
        });
    for (const change of changes) {
        const ghost = change.ghost;
        if (!ghost || (change.kind !== "move" && change.kind !== "insert")) continue;
        const at = slot(ghost.after, ghost.parent);
        if (at === undefined) continue;
        const parentRow =
            ghost.parent === null
                ? undefined
                : items.find((row) => row.id === rowOf.get(ghost.parent!));
        const depth = parentRow === undefined ? 0 : (parentRow.depth ?? 0) + 1;
        const rows = ghostRows(ghost.nodes, depth);
        const kind = change.kind === "move" ? ("arrive" as const) : ("insert" as const);
        const from = change.kind === "move" ? rowOf.get(change.key) : undefined;
        const block = change.members.length > 0;
        const marked = rows.map(
            (row, index): SidebarItem => ({
                ...row,
                change:
                    index === 0
                        ? {
                              kind,
                              label: words(change).there,
                              ...(block ? { block: "head" as const } : {}),
                              ...(from ? { from } : {}),
                          }
                        : { kind, block: "member" },
            }),
        );
        for (const row of marked) changeOf.set(row.id, change);
        items.splice(at, 0, ...marked);
    }
    return { items, changeOf };
}

const clockSubscribeNone = () => () => undefined;

/** A drawn row's ID and those of the rows it stands under, from its top-level row down. */
function rowPath(items: readonly SidebarItem[], id: string): string[] {
    let index = items.findIndex((item) => item.id === id);
    if (index < 0) return [];
    const path = [id];
    let depth = items[index]!.depth ?? 0;
    while (depth > 0 && --index >= 0) {
        const above = items[index]!.depth ?? 0;
        if (above >= depth) continue;
        path.unshift(items[index]!.id);
        depth = above;
    }
    return path;
}

/** The rows of Happy's own subtasks that stand in the sidebar as spaces of their own. */
function happySubtaskRows(
    happySpace: HappyAgentSpace,
    snapshot: HappyAgentSpacesSnapshot,
    places: HappyAgentSpacesPlaces,
): string[] {
    const happy = targetBot(happySpace.target, places);
    if (happy === undefined) return [];
    const own = new Set(happy.subtasks.map((subtask) => subtask.conversation.id));
    const rows: string[] = [];
    for (const space of snapshot.spaces.values()) {
        const agentId = spaceAgentId(space);
        if (space.id !== happySpace.id && agentId !== undefined && own.has(agentId))
            rows.push(`space:${space.id}`);
    }
    return rows;
}

/** The rows standing directly under Happy's own, by row ID. */
function happyChildRows(
    view: SidebarDocumentView,
    happySpaceId: string,
    attached: (id: string) => boolean,
): string[] {
    const happy = view.items.find((item) => item.kind === "space" && item.id === happySpaceId);
    if (happy?.kind !== "space") return [];
    return happy.children.map((child) =>
        attached(child.id) ? `space:${child.id}` : sidebarDocumentKey(child),
    );
}

/**
 * The spaces sidebar: the person's document drawn as it stands. Search,
 * Create, sections, separators and spaces are items of one list, and any of them can be
 * carried anywhere in it; a session moves among its own siblings. A click opens
 * what a row holds, and a section folds the run after it.
 */
export function HappyAgentSpacesSidebar(props: HappyAgentSpacesSidebarProps) {
    const { snapshot, places } = props;
    const sidebarDoc = snapshot.sidebar;
    const documentView = useMemo(() => documentViewOf(sidebarDoc?.html), [sidebarDoc?.html]);
    const view = documentView ?? legacyViewOf(snapshot);
    const editable = documentView !== undefined && sidebarDoc !== undefined;
    const focused = happyAgentSpaceFocused(snapshot, props.focus);
    /** Whether a nested ID names one of the person's spaces rather than a session. */
    const attached = (id: string): boolean => snapshot.spaces.has(id as HappyAgentSpaceId);
    const itemsInput: HappyAgentSpacesItemsInput = {
        view,
        snapshot,
        places,
        editable,
        titleShimmerEnabled: props.titleShimmerEnabled,
        stemCellAnimation: props.stemCellAnimation,
        ...(props.search ? { search: props.search } : {}),
        ...(props.create ? { create: props.create } : {}),
        ...(props.onSectionCreate ? { sectionCreate: true } : {}),
        sessionRow: props.sessionRow,
        worktreeRows: props.worktreeRows,
        stories: props.stories !== undefined,
    };
    const standing = happyAgentSpacesItems(itemsInput);
    const anchorOf = standing.anchorOf;
    const documentEdit = (
        change: (view: SidebarDocumentView) => SidebarDocumentView | undefined,
    ) => {
        if (!editable) return;
        const html = sidebarDocumentEdit(sidebarDoc.html, change);
        if (html !== undefined) props.store.sidebarWrite(html);
    };
    /**
     * Leaves or archives what a space's row stands for. The row goes in the
     * click, before the host answers, and comes back if the host refuses.
     */
    const spaceRemove = (space: HappyAgentSpace, remove: () => Promise<boolean>): void => {
        const store = props.store;
        store.spaceRemove(space.id);
        const restore = () => store.spaceRemoveWithdraw(space.id);
        void remove().then((taken) => {
            if (!taken) restore();
        }, restore);
    };
    // Prioritizing's open proposal, drawn on the sidebar it would change.
    const proposalsStore = props.proposals ?? happyAgentSidebarProposalsStoreNoop;
    const proposals = useSyncExternalStore(
        proposalsStore.subscribe,
        proposalsStore.get,
        proposalsStore.get,
    );
    const asked = editable && props.onboarding === undefined ? snapshot.proposal : null;
    // Records what is wanted; the read starts after this render.
    if (asked) proposalsStore.proposalsRequest([asked.artifactId]);
    const entry = asked ? proposals.get(asked.artifactId) : undefined;
    const proposal =
        entry?.type === "ready" && entry.proposal.status === "open" ? entry.proposal : undefined;
    const proposedView = useMemo(() => documentViewOf(proposal?.html), [proposal?.html]);
    const changes =
        documentView && proposedView ? sidebarProposalDiff(documentView, proposedView).changes : [];
    const drawn =
        proposal && proposedView && changes.length > 0
            ? happyAgentSpacesProposalItems(
                  itemsInput,
                  standing,
                  proposedView,
                  changes,
                  proposal.declined,
              )
            : { items: standing.items, changeOf: new Map<string, SidebarProposalChange>() };
    /** The conversation a drawn row opens, when it opens one. */
    const rowAgentId = (id: string): string | undefined => {
        // A task listed as a session can have no separate space of its own.
        // It still reports its conversation's status and work signal.
        if (id.startsWith("session:")) return id.slice("session:".length);
        const subject = happyAgentSpacesRowSubject(id, snapshot, places);
        return subject?.kind === "space"
            ? spaceAgentId(subject.space)
            : subject?.kind === "subtask"
              ? subject.agentId
              : undefined;
    };
    // A row shows its children once the selection has opened it: the store
    // keeps the one open tree, and nothing the document says about its folds
    // is drawn here.
    const opened = snapshot.rowsOpened?.rows;
    const openItems = drawn.items.map((item) =>
        item.collapsed === undefined || item.kind === "section"
            ? item
            : { ...item, collapsed: opened?.has(item.id) !== true },
    );
    const stories = props.stories;
    /** Each top-level conversation row's last activity, which its time counts from. */
    const activityAt = new Map<string, number>();
    if (stories)
        for (const item of openItems) {
            const agentId = (item.depth ?? 0) > 0 ? undefined : rowAgentId(item.id);
            const conversation =
                agentId === undefined ? undefined : conversationOf(agentId, places);
            if (conversation) activityAt.set(item.id, conversationActivityAt(conversation));
        }
    // The clock as the rows' times read it: it moves only when one of their
    // labels changes, so the sidebar redraws then and not on every tick.
    const clock = stories ? props.clock : undefined;
    const clockRead = () => {
        if (!clock) return props.now;
        const now = clock.get();
        let changed = Math.floor(now / 60_000) * 60_000;
        for (const at of activityAt.values())
            changed = Math.max(changed, localAgoTimeChangedAt(at, now));
        return changed;
    };
    const clockNow = useSyncExternalStore(
        clock?.subscribe ?? clockSubscribeNone,
        clockRead,
        clockRead,
    );
    // Stories draw the stem-cell sidebar, which does not nest: only top-level
    // rows are drawn, and none of them folds. Nesting stays the classic sidebar's.
    const onboarding = props.onboarding;
    const items = stories
        ? openItems
              .filter((item) => (item.depth ?? 0) === 0)
              .map((row) => {
                  if (row.kind === "separator" || row.kind === "section" || row.kind === "action")
                      return row;
                  const { collapsed: _collapsed, ...item } = row;
                  const agentId = rowAgentId(item.id);
                  const at = activityAt.get(item.id);
                  if (agentId !== undefined)
                      return storyRow(
                          item,
                          agentId,
                          places,
                          stories,
                          at === undefined ? undefined : localAgoTime(at, clockNow),
                      );
                  // A row with no conversation behind it keeps the same geometry
                  // as its siblings, and says nothing.
                  return { ...item, story: {} };
              })
        : openItems;
    const pending = changes.some((change) => !proposal?.declined.has(change.id));
    /** Takes one change, as the person's own edit; an archive archives what it names. */
    const changeAccept = (change: SidebarProposalChange) => {
        if (!proposedView) return;
        if (change.kind === "archive") {
            const rows = change.members.length > 0 ? change.members : [change.key];
            for (const key of rows) {
                const subject = happyAgentSpacesRowSubject(
                    standing.items.find((row) => anchorOf.get(row.id) === key)?.id ?? key,
                    snapshot,
                    places,
                );
                if (subject?.kind !== "space") continue;
                const { space } = subject;
                const target = space.target;
                if (target.kind === "task")
                    spaceRemove(space, () => props.actions.taskArchive(target.id));
                else if (target.kind === "bot")
                    spaceRemove(space, () => props.actions.botArchive(target.id));
            }
        }
        documentEdit((current) => sidebarProposalChangeAccept(current, proposedView, change));
    };
    /** Takes everything still shown: what was declined is first taken out of the proposal. */
    const proposalAccept = () => {
        if (!proposal || !documentView) return;
        const declined = changes.filter((change) => proposal.declined.has(change.id));
        const html =
            declined.length === 0
                ? undefined
                : sidebarDocumentEdit(proposal.html, (proposed) =>
                      declined.reduce(
                          (edited, change) =>
                              sidebarProposalChangeDecline(edited, documentView, change) ?? edited,
                          proposed,
                      ),
                  );
        proposalsStore.proposalAccept(proposal.artifactId, html);
    };
    /** Opens Prioritizing's conversation, to answer the proposal in words. */
    const proposerOpen = () => {
        const prioritizing = [...snapshot.spaces.values()].find(
            (space) => space.target.kind === "agent",
        );
        if (!prioritizing) return;
        props.store.happyFocusUpdate(false);
        happyAgentSpaceOpen(prioritizing, places, snapshot, props.navigation);
    };
    /** Pins a separator to an end, or unpins it, where the daemon keeps pins. */
    const separatorPin = (id: string, pin: SidebarDocumentSeparatorPin | null) => {
        const key = anchorOf.get(id);
        if (key) documentEdit((current) => sidebarDocumentSeparatorPin(current, key, pin));
    };
    const pinning = editable && sidebarDoc.separatorPins;
    /**
     * The node a drop lands after: the row's own, or for a row a proposal
     * brings, which stands in no document yet, the nearest standing row above it.
     */
    const standingAbove = (id: string): string | null | undefined => {
        if (anchorOf.has(id)) return anchorOf.get(id);
        for (let index = items.findIndex((row) => row.id === id) - 1; index >= 0; index -= 1)
            if (anchorOf.has(items[index]!.id)) return anchorOf.get(items[index]!.id);
        return null;
    };
    const happySpace = [...snapshot.spaces.values()].find((space) =>
        happyAgentSpaceHappyIs(space, places),
    );
    const spaceOf = (id: string) =>
        id.startsWith("space:")
            ? snapshot.spaces.get(id.slice("space:".length) as HappyAgentSpaceId)
            : undefined;
    const subjectOf = (id: string) => happyAgentSpacesRowSubject(id, snapshot, places);
    /** The sessions a row's conversation has, as its subtasks nest; a worktree has none. */
    const subtasksOf = (
        subject: HappyAgentSpacesRowSubject,
    ): readonly SidebarDocumentSessionTree[] =>
        subject.kind === "space"
            ? sessionTreeOf(
                  (
                      targetTask(subject.space.target, places) ??
                      targetBot(subject.space.target, places)
                  )?.subtasks ?? [],
              )
            : subject.kind === "subtask"
              ? sessionTreeOf(subject.subtask.subtasks)
              : [];
    /** The conversation a row opens beside the one on screen, and the name of its tab. */
    const asideOf = (
        subject: HappyAgentSpacesRowSubject,
        item: SidebarItem,
    ): { readonly agentId: string; readonly label: string } | undefined => {
        if (subject.kind === "subtask") return { agentId: subject.agentId, label: item.label };
        if (subject.kind !== "space") return undefined;
        const agentId = spaceAgentId(subject.space);
        return agentId === undefined
            ? undefined
            : { agentId, label: happyAgentSpaceLabel(subject.space) };
    };
    /** Show subtasks where some are not drawn, Hide subtasks where some are. */
    const subtasksMenu = (id: string, subject: HappyAgentSpacesRowSubject): MenuItem[] => {
        const key = anchorOf.get(id);
        if (!editable || !key || subject.kind === "worktree") return [];
        return [
            ...(sidebarDocumentSessionsReveal(view, key, subtasksOf(subject))
                ? [
                      {
                          kind: "item" as const,
                          id: MENU_SUBTASKS_SHOW,
                          label: "Show subtasks",
                          icon: "eye" as const,
                      },
                  ]
                : []),
            ...(sidebarDocumentSessionsHide(view, key, attached)
                ? [
                      {
                          kind: "item" as const,
                          id: MENU_SUBTASKS_HIDE,
                          label: "Hide subtasks",
                          icon: "eye-off" as const,
                      },
                  ]
                : []),
        ];
    };
    const open = (id: string) => {
        if (id === "search") return props.search?.onOpen();
        if (id === "create") return props.create?.onOpen();
        const space = spaceOf(id);
        if (space === undefined) {
            if (id.startsWith("session:"))
                props.onChildSelect({ kind: "session", agentId: id.slice("session:".length) });
            else if (id.startsWith(WORKTREE_PREFIX))
                props.onChildSelect({
                    kind: "worktree",
                    worktreeId: id.slice(WORKTREE_PREFIX.length),
                });
            return;
        }
        props.store.happyFocusUpdate(happyAgentSpaceHappyIs(space, places));
        // Opening a row lets nothing land: queued changes wait until the
        // pointer has left the sidebar, so no click moves or folds a row away.
        happyAgentSpaceOpen(space, places, snapshot, props.navigation);
    };
    // The row for what is on screen, most specific first: the session itself
    // at whatever depth it is drawn, then the worktree it runs in, then the
    // space it opens from.
    const shown =
        props.focus.chatId !== undefined && anchorOf.has(`session:${props.focus.chatId}`)
            ? `session:${props.focus.chatId}`
            : focused
              ? `space:${focused.id}`
              : props.focus.groupId !== undefined &&
                  anchorOf.has(`${WORKTREE_PREFIX}${props.focus.groupId}`)
                ? `${WORKTREE_PREFIX}${props.focus.groupId}`
                : "";
    // First run opens on Happy's chat: its row is the selected one from the
    // first frame, before the window has finished going there.
    const activeItemId =
        shown === "" &&
        onboarding !== undefined &&
        happySpace !== undefined &&
        props.focus.surfaceId === undefined &&
        props.focus.artifactId === undefined
            ? `space:${happySpace.id}`
            : shown;
    return (
        <Sidebar
            activeItemId={activeItemId}
            brand={props.brand}
            // New divides Happy into the row it makes, and Happy into each
            // agent of its own, such as Focus: one nested under its row, or
            // one with a row of its own.
            {...(happySpace
                ? {
                      division: {
                          from: `space:${happySpace.id}`,
                          into: [
                              ...snapshot.divisions.map((id) => `space:${id}`),
                              ...happyChildRows(view, happySpace.id, attached),
                              ...happySubtaskRows(happySpace, snapshot, places),
                          ],
                          ...(props.happySeed !== undefined ? { seed: props.happySeed } : {}),
                          ...(props.onHappySeed ? { onSeed: props.onHappySeed } : {}),
                      },
                  }
                : {})}
            // Every item but a separator is walked with the arrows and opens
            // with Enter or Space.
            keyboardNavigation
            onDragChange={props.store.sidebarDragUpdate}
            {...(proposal && pending
                ? {
                      bodyFloat: (
                          <SidebarChanges
                              {...(proposal.answering
                                  ? {
                                        answering:
                                            proposal.answering === "decline"
                                                ? ("reject" as const)
                                                : ("accept" as const),
                                    }
                                  : {})}
                              {...(proposal.error ? { notice: proposal.error.message } : {})}
                              onAccept={proposalAccept}
                              onChat={proposerOpen}
                              onReject={() => proposalsStore.proposalDecline(proposal.artifactId)}
                              proposer={PROPOSER}
                          />
                      ),
                      onItemChangeAccept: (id: string) => {
                          const change = drawn.changeOf.get(id);
                          if (change) changeAccept(change);
                      },
                      onItemChangeReject: (id: string) => {
                          const change = drawn.changeOf.get(id);
                          if (change)
                              proposalsStore.proposalChangeDecline(proposal.artifactId, change.id);
                      },
                  }
                : {})}
            footer={
                <>
                    {props.footer}
                    {focused?.target.kind === "agent" &&
                    snapshot.proposal !== null &&
                    !snapshot.proposalSeen ? (
                        // Prioritizing's chat is on screen with a proposal it
                        // has not shown here yet: the person sees it now.
                        <span
                            hidden
                            ref={(node) => {
                                if (node) props.store.proposalSeenRecord();
                            }}
                        />
                    ) : null}
                    {/* Every committed selection — a click, the keyboard, the
                        palette or a link — lands here as the row on screen, and
                        opens its tree in the store; rows that are gone leave it. */}
                    <span
                        hidden
                        ref={(node) => {
                            if (node)
                                props.store.rowsOpen(
                                    rowPath(drawn.items, activeItemId),
                                    new Set(drawn.items.map((item) => item.id)),
                                );
                        }}
                    />
                    {props.classic ? (
                        // Mounted with the sidebar and replaced when the folds
                        // change, so the store always holds the current ones.
                        <span
                            hidden
                            ref={(node) => {
                                if (node && props.classic)
                                    props.store.sidebarClassicUpdate(props.classic);
                            }}
                        />
                    ) : null}
                </>
            }
            headerAccessory={props.headerAccessory}
            {...(props.topAccessory ? { topAccessory: props.topAccessory } : {})}
            {...(props.onBodyWheel ? { onBodyWheel: props.onBodyWheel } : {})}
            {...(props.onConversationsVisibleChange
                ? {
                      onRowsVisibleChange: (rows: SidebarRowsVisible) =>
                          props.onConversationsVisibleChange?.(
                              sidebarReadAheadRows(rows, (itemId) => {
                                  if (itemId.startsWith("session:"))
                                      return itemId.slice("session:".length);
                                  const space = spaceOf(itemId);
                                  return space === undefined ? undefined : spaceAgentId(space);
                              }),
                          ),
                  }
                : {})}
            foldControlPlacement="trailing"
            foldControlReveal="hover"
            // Rows open their children as they are selected; only a section
            // heading folds by hand.
            itemFoldControls={false}
            onItemSelect={open}
            {...(stories
                ? {
                      onItemStoryOpen: (id: string) => {
                          const agentId = rowAgentId(id);
                          if (agentId !== undefined) stories.onRingOpen(agentId);
                      },
                  }
                : {})}
            onItemAction={(id) => {
                const node = view.items.find(
                    (entry) => sidebarDocumentKey(entry) === anchorOf.get(id),
                );
                if (node?.kind === "section") props.onSectionCreate?.(node.id);
            }}
            onItemCollapseToggle={(id) => {
                const key = anchorOf.get(id);
                if (key) documentEdit((current) => sidebarDocumentFold(current, key));
            }}
            itemMenuItems={(item) => {
                // A separator pins to either end, where the daemon keeps pins.
                if (item.kind === "separator")
                    return pinning && anchorOf.has(item.id)
                        ? [
                              ...(item.pin === undefined
                                  ? []
                                  : [
                                        {
                                            kind: "item" as const,
                                            id: MENU_UNPIN,
                                            label: "Unpin",
                                            icon: "close" as const,
                                        },
                                    ]),
                              ...(item.pin === "top"
                                  ? []
                                  : [
                                        {
                                            kind: "item" as const,
                                            id: MENU_PIN_TOP,
                                            label: "Pin above",
                                            icon: "arrow-up" as const,
                                        },
                                    ]),
                              ...(item.pin === "bottom"
                                  ? []
                                  : [
                                        {
                                            kind: "item" as const,
                                            id: MENU_PIN_BOTTOM,
                                            label: "Pin below",
                                            icon: "arrow-down" as const,
                                        },
                                    ]),
                          ]
                        : [];
                // A section's heading is the person's to write and to take
                // out, through the document.
                if (item.kind === "section")
                    return editable
                        ? [
                              {
                                  kind: "item",
                                  id: MENU_RENAME,
                                  label: "Rename section",
                                  icon: "edit",
                              },
                              { kind: "separator" },
                              {
                                  kind: "item",
                                  id: MENU_SECTION_DELETE,
                                  label: "Delete section",
                                  icon: "trash",
                              },
                          ]
                        : [];
                // A row at any depth offers what the row holds, as it would at
                // the top level.
                const subject = subjectOf(item.id);
                if (subject === undefined) return [];
                const own =
                    subject.kind === "space"
                        ? spaceMenu(subject.space, places, props.actions)
                        : subject.kind === "subtask"
                          ? subtaskMenu(subject.archivable, props.actions)
                          : worktreeMenu(props.actions);
                // Opening comes first, then what the row shows under it.
                const menu: MenuItem[] = [
                    ...own.slice(0, 1),
                    ...(asideOf(subject, item) !== undefined && props.onChatAside
                        ? [
                              {
                                  kind: "item" as const,
                                  id: MENU_ASIDE,
                                  label: "Open in side panel",
                                  icon: "panel-expand" as const,
                              },
                          ]
                        : []),
                    ...subtasksMenu(item.id, subject),
                    ...own.slice(1),
                ];
                // The sidebar document is Happy's to show, from Happy's row.
                return sidebarDoc &&
                    props.onSidebarOpen &&
                    subject.kind === "space" &&
                    happyAgentSpaceHappyIs(subject.space, places)
                    ? [
                          ...menu,
                          {
                              kind: "item" as const,
                              id: MENU_SIDEBAR,
                              label: "Open sidebar document",
                              icon: "doc" as const,
                          },
                      ]
                    : menu;
            }}
            itemRename={{
                actionId: MENU_RENAME,
                onSubmit: (item, name) => {
                    const label = name.trim();
                    if (!label) return;
                    if (item.kind === "section") {
                        const key = anchorOf.get(item.id);
                        if (key)
                            documentEdit((current) => sidebarDocumentRelabel(current, key, label));
                        return;
                    }
                    const subject = subjectOf(item.id);
                    if (subject?.kind === "worktree") {
                        props.actions.worktreeRename?.(subject.worktreeId, label);
                        return;
                    }
                    const space = subject?.kind === "space" ? subject.space : undefined;
                    const rename =
                        space?.target.kind === "task"
                            ? props.actions.taskRename
                            : space?.target.kind === "bot"
                              ? props.actions.botRename
                              : undefined;
                    if (space === undefined || rename === undefined) return;
                    // The row and its tab wear the name in the keystroke that
                    // saves it, not when the daemon's word comes back.
                    const store = props.store;
                    store.spaceTitleUpdate(space.id, label);
                    void rename(space.target.id, label).then((taken) => {
                        if (!taken) store.spaceTitleWithdraw(space.id, label);
                    });
                },
            }}
            onItemMenuSelect={(item, actionId) => {
                if (item.kind === "separator") {
                    if (!pinning) return;
                    if (actionId === MENU_PIN_TOP) separatorPin(item.id, "top");
                    else if (actionId === MENU_PIN_BOTTOM) separatorPin(item.id, "bottom");
                    else if (actionId === MENU_UNPIN) separatorPin(item.id, null);
                    return;
                }
                if (item.kind === "section") {
                    const key = anchorOf.get(item.id);
                    // The heading goes at once and its rows stay where they
                    // stand; a refusal puts the heading back.
                    if (actionId === MENU_SECTION_DELETE && key)
                        documentEdit((current) => sidebarDocumentSectionRemove(current, key));
                    return;
                }
                const subject = subjectOf(item.id);
                if (subject === undefined) return;
                if (actionId === MENU_OPEN) open(item.id);
                else if (actionId === MENU_SUBTASKS_SHOW) {
                    const key = anchorOf.get(item.id);
                    if (!editable || !key) return;
                    const html = sidebarDocumentEdit(sidebarDoc.html, (current) =>
                        sidebarDocumentSessionsReveal(current, key, subtasksOf(subject)),
                    );
                    // The person opened the row to show them, so its fold is
                    // theirs: the row's node, a space's or a session's.
                    if (html !== undefined)
                        props.store.sidebarSessionsRevealWrite(
                            html,
                            key.slice(key.indexOf(":") + 1),
                        );
                } else if (actionId === MENU_SUBTASKS_HIDE) {
                    const key = anchorOf.get(item.id);
                    if (key)
                        documentEdit((current) =>
                            sidebarDocumentSessionsHide(current, key, attached),
                        );
                } else if (actionId === MENU_ASIDE) {
                    const aside = asideOf(subject, item);
                    if (aside !== undefined) props.onChatAside?.(aside.agentId, aside.label);
                } else if (subject.kind === "subtask") {
                    if (actionId === MENU_ARCHIVE && subject.archivable)
                        props.actions.subtaskArchive?.(subject.agentId);
                } else if (subject.kind === "worktree") {
                    if (actionId === MENU_ARCHIVE)
                        props.actions.worktreeArchive?.(subject.worktreeId);
                } else {
                    const { space } = subject;
                    const target = space.target;
                    if (actionId === MENU_TIDY) props.store.tidyRequest();
                    else if (actionId === MENU_SIDEBAR && sidebarDoc)
                        props.onSidebarOpen?.(sidebarDoc.artifactId);
                    else if (actionId === MENU_LEAVE && target.kind === "task")
                        spaceRemove(space, () => props.actions.taskLeave(target.id));
                    else if (actionId === MENU_LEAVE && target.kind === "surface")
                        spaceRemove(space, () => props.actions.surfaceLeave(target.id));
                    else if (actionId === MENU_DISCARD) {
                        // Closing is leaving: a reader in the new work goes back
                        // to where they were before Create, at once rather than
                        // once the daemon has taken the row away.
                        if (target.workspaceId !== null)
                            props.navigation.onGroupClose?.(target.workspaceId);
                        props.store.stemCellDiscard(space.id);
                    } else if (actionId === MENU_ARCHIVE && target.kind === "task")
                        spaceRemove(space, () => props.actions.taskArchive(target.id));
                    else if (actionId === MENU_ARCHIVE && target.kind === "bot")
                        spaceRemove(space, () => props.actions.botArchive(target.id));
                }
            }}
            // A move is an edit of the document: a node after one of its own
            // siblings, or first among them. A worktree is the window's, so a
            // node landing after one lands after the session it follows. No
            // drag changes a row's level: a top-level row stays at the top
            // level, and a nested one stays under the row it stands under.
            {...(editable
                ? {
                      onItemReorder: (
                          _list: string,
                          move: { id: string; afterId: string | null },
                      ) => {
                          const key = anchorOf.get(move.id);
                          if (!key) return;
                          const afterKey =
                              move.afterId === null ? null : (standingAbove(move.afterId) ?? null);
                          documentEdit((current) => sidebarDocumentMove(current, key, afterKey));
                      },
                  }
                : {})}
            sections={[
                { id: LIST, items },
                ...(onboarding?.exampleSidebar ? [happyAgentSpacesExampleSection()] : []),
            ]}
        />
    );
}

/** Where a row stood, in words, for one side of a batch's diff. */
function positionLabel(position: HappyAgentSpaceBatch["changes"][number]["from"]): string {
    if (position.visibility === "folded") return "folded away";
    if (position.visibility === "hidden") return "hidden";
    return position.sectionName ?? "under Happy";
}

/** Each batch's note in Happy's chat, by its message, read as one row that opens onto its moves. */
export function happyAgentSpacesNotes(
    batches: readonly HappyAgentSpaceBatch[],
): ReadonlyMap<string, ConversationNote> {
    const notes = new Map<string, ConversationNote>();
    for (const batch of batches) {
        if (batch.noteMessageId === null) continue;
        notes.set(batch.noteMessageId, {
            label: batch.note,
            details: batch.changes.map((change) => {
                const from = positionLabel(change.from);
                const to = positionLabel(change.to);
                return from === to
                    ? `${change.title}: ${from}, row ${change.from.index + 1} → ${change.to.index + 1}`
                    : `${change.title}: ${from} → ${to}`;
            }),
        });
    }
    return notes;
}

/**
 * The block that opens a space's chat: its 64px mark — the stem cell while the
 * work is taking shape, then the clay icon it grows into — over the line that
 * introduces new work. Before the chat's first message the line and the kinds
 * of thing to make are shown; once it has begun they keep their place, hidden,
 * and the mark stays at the top of the chat. Spaces with any other picture,
 * or none, open their chat on its first message.
 */
export function happyAgentSpacesIntroHeader(
    space: HappyAgentSpace,
    intro: {
        readonly settled: boolean;
        readonly stemCellAnimation: boolean;
        readonly options?: readonly MakeStuffOption[];
        readonly onOptionSelect?: (id: string) => void;
    },
): ConversationLeadingHeader | undefined {
    const icon = space.icon;
    const imageMark =
        icon?.type === "library" && clayIconSlugIs(icon.slug)
            ? { ...clayIconMarkLarge(icon.slug), growsFromStemCell: intro.stemCellAnimation }
            : undefined;
    if (icon?.type !== "stem_cell" && imageMark === undefined) return undefined;
    return makeStuffIntroHeader({
        id: space.id,
        ...(imageMark ? { imageMark } : {}),
        settled: intro.settled,
        ...(intro.options ? { options: intro.options } : {}),
        ...(intro.onOptionSelect ? { onOptionSelect: intro.onOptionSelect } : {}),
    });
}
