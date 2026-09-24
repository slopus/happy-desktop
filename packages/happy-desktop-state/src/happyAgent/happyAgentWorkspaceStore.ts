import { createStore } from "zustand/vanilla";
import { happyAgentBotSubtasks } from "./happyAgentBotSubtasks.js";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import type { ConversationSummary } from "../conversation/conversationSummary.js";
import type { Loadable } from "../conversation/loadable.js";
import type { UserError } from "../types.js";
import {
    composerStoreCreate,
    type ComposerAttachment,
    type ComposerCommand,
    type ComposerReviewComment,
    type ComposerSnapshot,
    type ComposerStore,
} from "../modules/composer/composerState.js";
import type {
    HappyAgentChatHandle,
    HappyAgentWorkspaceClient,
    HappyAgentWorkspaceFilesChanged,
} from "./happyAgentClient.js";
import type { HappyAgentRecentTabMemory } from "./happyAgentWorkspaceMemory.js";
import {
    HAPPY_AGENT_VIEW_PREFERENCES_EMPTY,
    happyAgentViewPreferencesParse,
    happyAgentViewPreferencesUpdate,
    type HappyAgentGroupViewPreferences,
    type HappyAgentViewPreferencesDocument,
    type HappyAgentViewPreferencesPersistence,
} from "./happyAgentViewPreferences.js";
import type { HappyAgentHost } from "./happyAgentHost.js";
import type {
    HappyAgentChatSnapshot,
    HappyAgentChatStore,
    HappyAgentOpenImage,
    HappyAgentWorkingWait,
} from "./happyAgentChatStore.js";
import {
    happyAgentAttachmentTextAppend,
    happyAgentCommentsTextAppend,
    happyAgentComposerAttachmentCreate,
    happyAgentComposerAttachmentPreviewRelease,
    happyAgentComposerAttachmentsValidate,
    happyAgentImageInputsOf,
    happyAgentWorkspaceAttachmentData,
} from "./happyAgentComposerAttachment.js";
import {
    happyAgentPanelStoreCreate,
    type HappyAgentPanelStore,
    type HappyAgentViewPlacement,
} from "./happyAgentPanelStore.js";
import {
    happyAgentSessionDraftStoreOwnedCreate,
    type HappyAgentSessionDraftSnapshot,
    type HappyAgentSessionDraftStore,
    type HappyAgentSessionDraftWriter,
} from "./happyAgentSessionDraftStore.js";
import {
    happyAgentGroupAccessOf,
    happyAgentGroupAccessRefused,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    type HappyAgentGroupAccess,
} from "./happyAgentGroupAccess.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import { orderKeyAfter } from "../utils/orderKeyAfter.js";
import { orderKeySequence } from "../utils/orderKeySequence.js";
import type {
    HappyAgentBotCreation,
    HappyAgentProjectArchiveResult,
    HappyAgentWorktreeArchiveResult,
    HappyAgentSessionListSnapshot,
    HappyAgentSessionListStore,
    HappyAgentSessionLocation,
} from "./happyAgentSessionListStore.js";
import type {
    HappyAgentAvatarImage,
    HappyAgentBackgroundProcess,
    HappyAgentChangedFileDocument,
    HappyAgentFileSearchResult,
    HappyAgentBotId,
    HappyAgentGitChangedFile,
    HappyAgentGoal,
    HappyAgentGroupId,
    HappyAgentMenusSnapshot,
    HappyAgentModelSelection,
    HappyAgentPermissionMode,
    HappyAgentProjectCompute,
    HappyAgentProjectComputeState,
    HappyAgentProjectId,
    HappyAgentQueuedMessage,
    HappyAgentContextGauge,
    HappyAgentOpenInTarget,
    HappyAgentWorkspaceFiles,
    HappyAgentWorkspaceFileTreeDirectory,
    HappyAgentWorkspaceFileBytes,
    HappyAgentWorkspaceFileDocument,
    HappyAgentScrollPosition,
    HappyAgentSelection,
    HappyAgentServiceTier,
    HappyAgentSession,
    HappyAgentSessionCreateInput,
    HappyAgentSessionId,
    HappyAgentSessionUsage,
    HappyAgentSlice,
    HappyAgentSliceId,
    SubagentSummary,
    HappyAgentTask,
    HappyAgentThinkingLevel,
    HappyAgentUserInputAnswers,
    HappyAgentWorkingPhase,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

/** Desktop-owned commands appended after the selected agent's ordered catalog. */
export const happyAgentComposerCommands: readonly ComposerCommand[] = [
    {
        id: "usage",
        label: "/usage",
        description: "Token usage for the session.",
        hasArguments: false,
    },
    {
        id: "tasks",
        label: "/tasks",
        description: "Show the session task list.",
        hasArguments: false,
    },
    {
        id: "agents",
        label: "/agents",
        description: "Monitor delegated subagents.",
        hasArguments: false,
    },
    {
        id: "goal",
        label: "/goal",
        description: "Show the session goal.",
        hasArguments: false,
    },
    {
        id: "ps",
        label: "/ps",
        description: "List background terminals.",
        hasArguments: false,
    },
    {
        id: "abort",
        label: "/abort",
        description: "Stop the current run.",
        hasArguments: false,
    },
];

/** Groups commands ahead of skills while preserving the daemon's order within each group. */
function composerCommandsProject(
    commands: HappyAgentChatSnapshot["slashCommands"],
): readonly ComposerCommand[] {
    const provided = commands.map((command) => ({
        id: command.name,
        label: `/${command.name}`,
        description: command.description,
        hasArguments: command.hasArguments,
        ...(command.kind === undefined ? {} : { kind: command.kind }),
    }));
    const providedIds = new Set(provided.map((command) => command.id));
    const commandsProvided = provided.filter((command) => command.kind !== "skill");
    const skillsProvided = provided.filter((command) => command.kind === "skill");
    return [
        ...commandsProvided,
        ...happyAgentComposerCommands.filter((command) => !providedIds.has(command.id)),
        ...skillsProvided,
    ];
}

/** Number of `@`-mention candidates a local composer asks the workspace for. */
const MENTION_LIMIT = 8;

/**
 * How far back one group's tab history is kept. It exists to answer "what was
 * behind the tab I just closed", which a few dozen entries answer completely.
 */
const TAB_HISTORY_LIMIT = 50;

/** One open file's tab id: the file itself, inside the group it was opened from. */
function fileTabIdOf(groupId: HappyAgentGroupId, path: string): string {
    return `${groupId}\u0000${path}`;
}

/**
 * The open conversation: its shared entries plus run lifecycle, queued
 * steering, tasks and subagents, background processes, usage, and the
 * model/effort/permission pickers. Loading uses the shared `Loadable` vocabulary.
 */
export interface HappyAgentConversationSnapshot {
    readonly conversationId: HappyAgentSessionId;
    readonly ready: boolean;
    readonly session: Loadable<HappyAgentSession>;
    readonly title?: string;
    readonly subtitle?: string;
    readonly entries: readonly ConversationEntry[];
    readonly composer: ComposerSnapshot;
    readonly running: boolean;
    readonly workingPhase: HappyAgentWorkingPhase;
    /** Display-ready activity text from the agent, when it describes its work. */
    readonly workingLabel?: string;
    /** The scheduled wait the agent is inside, so a surface can count it down. */
    readonly workingWait?: HappyAgentWorkingWait;
    readonly runStartedAt?: number;
    readonly turnElapsedMs?: number;
    readonly transcriptComplete: boolean;
    readonly loadingMore: boolean;
    readonly loadMoreError?: string;
    readonly queuedMessages: readonly HappyAgentQueuedMessage[];
    readonly requestSubmissions: HappyAgentChatSnapshot["requestSubmissions"];
    readonly requestSelections: HappyAgentChatSnapshot["requestSelections"];
    readonly tasks: readonly HappyAgentTask[];
    readonly goal?: HappyAgentGoal;
    readonly subagents: readonly SubagentSummary[];
    readonly backgroundProcesses: readonly HappyAgentBackgroundProcess[];
    /** Running terminal ids classified from the live transcript/process projection. */
    readonly detachedBackgroundProcessIds: ReadonlySet<number>;
    /** Whether the conversation has activity the panel can show, including settled history. */
    readonly activityAvailable: boolean;
    readonly showReasoning: boolean;
    /** Finished turns the reader expanded, so their trace entries stay listed. */
    readonly expandedTurnIds: ReadonlySet<string>;
    readonly usage?: HappyAgentSessionUsage;
    readonly usageLoading: boolean;
    readonly usageError?: string;
    /** Room left in the context window, when the model declares one. */
    readonly contextGauge?: HappyAgentContextGauge;
    readonly activityPanelOpen: boolean;
    /** The transcript image opened full size, if any. */
    readonly openImage?: HappyAgentOpenImage;
    readonly menus?: HappyAgentMenusSnapshot;
    /**
     * Whether the model can still be changed. The daemon refuses one while a run
     * is active or work is queued behind it, so the picker says so rather than
     * letting a choice be made that the next message would fail to apply.
     */
    readonly modelLocked: boolean;
    /**
     * Where this conversation was last being read, when it has been read before.
     * Absent opens at the newest message.
     */
    readonly scrollPosition?: HappyAgentScrollPosition;
}

/**
 * What a workspace tab shows: the file's text, its working-tree diff, or the
 * file itself rendered. `media` is what a picture, a video, or anything else
 * with no useful text opens as — its bytes reach the viewer whole rather than
 * being refused by a read that only knows how to return a string. `document` is
 * a file that is both: an HTML page is text one edits and a page one looks at,
 * so such a tab carries the file's text and an address the page loads from.
 */
export type HappyAgentFileTabKind = "file" | "diff" | "media" | "document";

/**
 * A run of lines in one file, counted from 1 and including both ends — the way
 * every editor, every review, and every agent writing `Store.ts:120-148` counts
 * them. A single line is a range whose ends are equal, so nothing downstream
 * has to tell one line apart from several.
 */
export interface HappyAgentFileLineRange {
    readonly startLine: number;
    readonly endLine: number;
}

/**
 * A region of an open file that something asked to be shown, and which asking
 * it was.
 *
 * The region alone cannot say "show me this again": clicking the same reference
 * twice, or following it back after scrolling away, hands the viewer the lines
 * it is already holding and nothing happens. `requestId` is what makes each ask
 * a distinct event, so the viewer scrolls every time it is asked to and never
 * between times.
 */
export interface HappyAgentFileReveal extends HappyAgentFileLineRange {
    readonly requestId: number;
}

/** One workspace text file opened as a main-content document tab. */
export interface HappyAgentFileTabSnapshot {
    readonly id: string;
    /**
     * The project or worktree the file lives in. That is the whole of its
     * address: a file belongs to a checkout, not to whichever conversation was
     * open when it was clicked, so a tab outlives every session in its group.
     */
    readonly groupId: HappyAgentGroupId;
    readonly path: string;
    /** Viewer selected from file type and the live in-memory Git snapshot. */
    readonly kind: HappyAgentFileTabKind;
    /**
     * Which of the workspace's two strips is drawing this file — the main
     * content, or the panel beside the conversation. It is the only difference
     * between a file opened from the Files listing and the same file opened out
     * of a transcript: one file, one read, one editor, drawn in one of two
     * places.
     */
    readonly placement: HappyAgentViewPlacement;
    /**
     * A single-click preview may be replaced by the next file previewed in this
     * group. Opening it permanently or editing it clears this flag.
     */
    readonly preview: boolean;
    /**
     * The region this tab was last asked to show, for a file reached through a
     * reference that named one. Absent for a file opened whole, which is every
     * file opened from the listing.
     */
    readonly reveal?: HappyAgentFileReveal;
    readonly revision: string;
    readonly document: Loadable<
        | HappyAgentWorkspaceFileDocument
        | HappyAgentChangedFileDocument
        | HappyAgentWorkspaceFileBytes
    >;
    /**
     * Identity of this authoritative read/render attempt. It changes before
     * every read and is committed only after the corresponding body is ready,
     * so late renderer completions cannot reveal newer or older bytes.
     */
    readonly presentationId: string;
    /** The last presentation this tab committed to the main-content body. */
    readonly displayedPresentationId?: string;
    /** The viewer kind that committed `displayedDocument`. */
    readonly displayedKind?: HappyAgentFileTabKind;
    /** The path whose pixels are retained in `displayedDocument`. */
    readonly displayedPath?: string;
    /** The exact ready document behind `displayedPresentationId`. */
    readonly displayedDocument?: HappyAgentFileDocument;
    /** True only while no ready document is available for this tab. */
    readonly loading: boolean;
    /**
     * True while a ready document remains visible and the requested
     * authoritative revision is being read again.
     */
    readonly revalidating: boolean;
    /**
     * Unsaved edit to this file's working-tree text. Present only once it has
     * been typed in, so an untouched tab shows what was read rather than a copy
     * of it that reloading would silently discard.
     */
    readonly draft?: string;
    /** True while this tab's edit is being written back. */
    readonly saving: boolean;
    /**
     * Where this file is served as a page, for a `document` tab whose address
     * has been resolved. Absent for every other kind, and until the host has
     * answered — a page has nowhere to load from until then.
     */
    readonly previewUrl?: string;
    /**
     * Why this document has no address, when asking for one failed. The file
     * itself is unaffected and still reads as source; this is what stops the
     * rendered face from waiting on an answer that is never coming.
     */
    readonly previewError?: string;
    /**
     * A background read failed while this tab still had ready bytes. The bytes
     * remain usable, but this explains that they may not match the requested
     * revision.
     */
    readonly revalidationError?: UserError;
    /**
     * Why the last attempt to write this tab's edit back failed. The draft is
     * still here and still the only copy of what was typed; this is what says
     * so, because a save that reports nothing is indistinguishable from one
     * that worked.
     */
    readonly saveError?: UserError;
}

type HappyAgentFileDocument =
    | HappyAgentWorkspaceFileDocument
    | HappyAgentChangedFileDocument
    | HappyAgentWorkspaceFileBytes;

type HappyAgentDocumentCacheIdentity = {
    readonly baseKey: string;
    readonly hash?: string;
};

type HappyAgentReadyDocumentCacheEntry = {
    readonly addressKey: string;
    readonly baseKey: string;
    readonly identity: HappyAgentDocumentCacheIdentity;
    readonly document: HappyAgentFileDocument;
    readonly weight: number;
};

type HappyAgentFileLoadRequest = {
    readonly controller: AbortController;
    readonly consumers: Set<string>;
    readonly promise: Promise<HappyAgentFileDocument>;
};

type HappyAgentWorkspaceFileTreeLoadRequest = {
    readonly cursor?: string;
    readonly generation: number;
    readonly groupId: HappyAgentGroupId;
    readonly path: string;
};

type HappyAgentFilePreprocessRequest = {
    readonly cacheBaseKey: string;
    readonly change?: HappyAgentGitChangedFile;
    readonly generation: number;
    readonly groupId: HappyAgentGroupId;
    readonly kind: HappyAgentFileTabKind;
    readonly path: string;
    readonly revision: string;
};

/** Bounds decoded source text retained between preview/tab lifetimes. */
const HAPPY_AGENT_READY_DOCUMENT_CACHE_MAX_ENTRIES = 48;
const HAPPY_AGENT_READY_DOCUMENT_CACHE_MAX_WEIGHT = 16 * 1024 * 1024;
/** Bounds speculative and reader-requested directory reads across the all-files tree. */
const HAPPY_AGENT_WORKSPACE_FILE_TREE_MAX_CONCURRENT_LOADS = 3;
/** Bounds speculative file reads started by pointer and keyboard intent. */
const HAPPY_AGENT_FILE_PREPROCESS_MAX_CONCURRENT_LOADS = 2;
/**
 * How often a workspace that stays on screen asks the host again which
 * applications a project can be opened in. Installing or removing one is rare
 * and nothing announces it, so this is slow enough to be free and quick enough
 * that an editor installed this morning is in the menu this afternoon.
 */
const OPEN_IN_TARGETS_REFRESH_MS = 60 * 60 * 1_000;
/**
 * The renderer/UI uses the same ceiling when deciding whether to retain a
 * Pierre AST. A changed document at or above it must already carry the
 * daemon's authoritative base hash; it is never scanned just to make a cache
 * key.
 */
const HAPPY_AGENT_CHANGED_DOCUMENT_HASH_FALLBACK_MAX_TEXT_LENGTH = 512 * 1024;

/**
 * Produces a compact deterministic identity for small changed documents whose
 * revision response omitted `oldHash`. Two independent 32-bit lanes avoid
 * wide-integer allocations.
 */
function happyAgentCompactContentHash(content: string): string {
    // Include the UTF-16 length before scanning the small local value, so
    // equal prefixes of different lengths cannot share the same hash state
    // without bringing back the wide-integer work that made large reads costly.
    let left = Math.imul(0x811c9dc5 ^ content.length, 0x01000193);
    let right = Math.imul(0x9e3779b9 ^ content.length, 0x85ebca6b);
    for (let index = 0; index < content.length; index += 1) {
        const code = content.charCodeAt(index);
        left = Math.imul(left ^ code, 0x01000193);
        right = Math.imul(right ^ (code + (index & 0xffff)), 0x85ebca6b);
    }
    return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0)
        .toString(16)
        .padStart(8, "0")}`;
}

function happyAgentChangedDocumentFallbackHashAllowed(
    document: HappyAgentChangedFileDocument,
): boolean {
    return (
        document.oldContent.length < HAPPY_AGENT_CHANGED_DOCUMENT_HASH_FALLBACK_MAX_TEXT_LENGTH &&
        document.newContent.length < HAPPY_AGENT_CHANGED_DOCUMENT_HASH_FALLBACK_MAX_TEXT_LENGTH
    );
}

function happyAgentFileDocumentCanonical(document: HappyAgentFileDocument): HappyAgentFileDocument {
    if (
        "oldContent" in document &&
        document.oldHash === undefined &&
        happyAgentChangedDocumentFallbackHashAllowed(document)
    )
        return { ...document, oldHash: happyAgentCompactContentHash(document.oldContent) };
    return document;
}

/**
 * The same document, as an accepted write leaves it: the bytes that were
 * written and the identity the checkout gave them.
 *
 * A write is first-hand knowledge of what a file says, so the tab that made it
 * is told directly rather than shown the bytes read before it while a reload
 * catches up. A document of a kind a write cannot describe — a picture, a
 * recording — is left exactly as it was.
 */
function fileDocumentSaved(
    document: Loadable<HappyAgentFileDocument>,
    content: string,
    hash: string,
): Loadable<HappyAgentFileDocument> {
    if (document.type !== "ready") return document;
    const value = document.value;
    if ("oldContent" in value)
        return { type: "ready", value: { ...value, newContent: content, hash } };
    if ("content" in value) return { type: "ready", value: { ...value, content, hash } };
    return document;
}

function happyAgentReadyDocumentCacheBaseKey(
    groupId: HappyAgentGroupId,
    path: string,
    kind: HappyAgentFileTabKind,
    revision: string,
): string {
    return `${groupId}\u0000${path}\u0000${kind}\u0000${revision}`;
}

function happyAgentReadyDocumentCacheAddressKey(baseKey: string): string {
    return baseKey.slice(0, baseKey.lastIndexOf("\u0000"));
}

function happyAgentReadyDocumentCacheKey(
    baseKey: string,
    document: HappyAgentFileDocument,
): { readonly key: string; readonly identity: HappyAgentDocumentCacheIdentity } {
    const hash =
        "oldContent" in document
            ? `${document.hash ?? ""}:${document.oldHash ?? ""}`
            : "hash" in document
              ? document.hash
              : undefined;
    const identity = { baseKey, ...(hash ? { hash } : {}) };
    return { key: `${baseKey}\u0000${hash ?? ""}`, identity };
}

function happyAgentReadyDocumentWeight(document: HappyAgentFileDocument): number {
    if ("content" in document) return Math.max(1, document.content.length * 2);
    if ("oldContent" in document)
        return Math.max(1, (document.oldContent.length + document.newContent.length) * 2);
    return 1024;
}

/**
 * Combined, immutable projection of the whole local workspace: the conversation
 * list plus the open conversation. A single subscription fans out both, so a
 * React surface reads the entire workspace through one `useSyncExternalStore`
 * without joining independent stores in the view.
 */
/**
 * What this workspace is addressing, as navigation last set it: the project or
 * worktree on screen, and the conversation inside it when one is open. A group
 * route carries a group and no conversation; the Happy Agent's own root carries
 * neither.
 *
 * It is published rather than left inside the store because it is the only
 * synchronous authority on where the reader actually is. A surface that has to
 * decide something at the moment a person acts — whether an agent's
 * contribution may still be performed here, for instance — cannot ask the route
 * that drew it, because that render may no longer be the one on screen.
 */
export interface HappyAgentWorkspaceAddress {
    readonly groupId?: HappyAgentGroupId;
    readonly conversationId?: HappyAgentSessionId;
}

/**
 * What a workspace nobody is looking at is addressing: nowhere. A stopped or
 * disposed store publishes this, so a control retained from a surface that has
 * since gone away cannot read a place out of it and act there.
 */
const ADDRESS_NOWHERE: HappyAgentWorkspaceAddress = {};

export interface HappyAgentWorkspaceSnapshot {
    /** Where the reader is, whether or not a conversation is materialized. */
    readonly address: HappyAgentWorkspaceAddress;
    readonly list: HappyAgentSessionListSnapshot;
    /**
     * What may be done in the addressed project or worktree: whether a chat can
     * be started or written there, whether the checkout itself can be written
     * to, whether work already running can be stopped, and why each of those is
     * refused when it is. Every surface that offers a control with a side effect
     * there reads this, so a control that is not offered and an action that is
     * refused always give the same reason.
     */
    readonly groupAccess: HappyAgentGroupAccess;
    /**
     * Whether the addressed conversation belongs to another session rather than
     * to the addressed group's list. A delegated chat is readable but its runner
     * owns its input and configuration.
     *
     * Stated here rather than left to be worked out from the tab strip: a
     * session is addressed the instant it is named, which is before the list
     * carries it, and a surface reading its absence as delegation would lock the
     * reader out of the session they have just made.
     */
    readonly conversationDelegated: boolean;
    /** Materialization state for the open conversation; unloaded means none is open. */
    readonly conversation: Loadable<HappyAgentConversationSnapshot>;
    readonly fileTabs: readonly HappyAgentFileTabSnapshot[];
    /** Local session and file destinations, newest first, retained after their tabs close. */
    readonly recentTabs: readonly HappyAgentRecentTabMemory[];
    /**
     * The addressed group's tab strip, by tab id, in the order it is shown. It
     * covers everything the strip holds — sessions and files alike — because the
     * reader arranges one strip, not one order per kind of thing in it. Empty
     * while no group is addressed.
     */
    readonly tabOrder: readonly string[];
    /**
     * What the main content is showing instead of the addressed conversation: an
     * open file tab, or a panel tab the reader moved into the main content.
     * Absent means the conversation itself is on screen.
     *
     * One field rather than one per kind of view, because the main content shows
     * exactly one thing at a time and two fields could disagree about which.
     */
    readonly activeMainViewId?: string;
    /**
     * What the main-content body has actually committed to showing. It normally
     * matches `activeMainViewId`; while a newly selected file is still being
     * read or highlighted it deliberately names the previous body instead.
     * Absent means the addressed conversation is still visible.
     */
    readonly displayedMainViewId?: string;
    /**
     * The file the panel's viewer is on, if any: the one member of `fileTabs`
     * placed in the panel. It is the identical object, offered here so the
     * panel does not scan the strip for it.
     */
    readonly panelFile?: HappyAgentFileTabSnapshot;
    /**
     * The session focusing each project or worktree should land on: the tab it
     * was left on, or the one behind that in its tab history when the reader has
     * since closed it. A group whose remembered tabs are all gone is absent, and
     * the surface falls back to the group's first session.
     */
    readonly groupResume: ReadonlyMap<HappyAgentGroupId, HappyAgentSessionId>;
    /**
     * The composer of an addressed group that holds no conversation yet. Sending
     * into it is what starts the group's first conversation, so a project or a
     * worktree can be opened and typed into before anything exists in it.
     */
    readonly groupComposer?: ComposerSnapshot;
    /**
     * How that first conversation will be configured — model, effort, access
     * mode, tier — and the picker options behind those choices. Present only
     * once the model catalog has been read, so the composer never waits on it.
     */
    readonly groupSessionDraft?: HappyAgentSessionDraftSnapshot;
    /**
     * Applications the host can open the addressed group's directory in, read
     * once per workspace and empty until then. Empty is also the honest answer
     * on a host that offers none, and the surface shows no menu rather than an
     * empty one.
     */
    readonly openInTargets: readonly HappyAgentOpenInTarget[];
    /**
     * The application this machine opened a project in most recently, so the
     * control can offer it directly instead of making the reader find it in the
     * menu again. Undefined until something has been opened.
     *
     * It is whole rather than an id into `openInTargets`, and does not have to
     * be listed there: the host remembers the reader's choice across a reload,
     * while the list is a detection that has not finished yet for the first
     * moments of one.
     */
    readonly openInRecent?: HappyAgentOpenInTarget;
    /** The rename in progress, if any: what is being renamed and the draft name. */
    readonly rename?: HappyAgentRenameSnapshot;
    /** The project archive that has been asked for and not yet carried out, if any. */
    readonly projectArchive?: HappyAgentProjectArchiveSnapshot;
    /** The empty workspace/project Cmd-W has offered to archive, if any. */
    readonly groupArchive?: HappyAgentGroupArchiveSnapshot;
    /**
     * Where the project whose settings are open runs its sessions. Present only
     * while a project's settings are open — a worktree has no compute of its own
     * — and it goes when they close.
     */
    readonly projectCompute?: HappyAgentProjectComputeSnapshot;
    /**
     * How changed files are being read. One preference for the workspace rather
     * than one per tab: it is how this reader likes to look at diffs, and
     * having it reset on every file they open would make it not a preference.
     */
    readonly fileViewMode: HappyAgentFileViewMode;
    /**
     * Whether long diff lines wrap to the pane or scroll out of it. One
     * preference for the workspace, like the mode: it is how this reader reads
     * long lines, not a fact about any one file.
     */
    readonly fileViewWrap: boolean;
    /** Whether the panel lists changed files, every file in the checkout, or a slice of it. */
    readonly fileScope: HappyAgentFileScope;
    /**
     * The slices agents have built over the addressed checkout, newest first.
     * Empty until they are known and empty when there are none: the panel
     * offers the slice scope only while this holds something.
     */
    readonly slices: readonly HappyAgentSlice[];
    /**
     * The slice the panel lists under the slice scope: the one the reader last
     * chose in this checkout, or the newest when they never chose or their
     * choice has since been dropped. Absent exactly when `slices` is empty.
     */
    readonly slice?: HappyAgentSlice;
    /** Whether Changes nests paths into folders or lists them whole. All Files is always lazy. */
    readonly fileLayout: HappyAgentFileLayout;
    /** What the reader is looking for in the file listing, and what was found. */
    readonly fileSearch: HappyAgentFileSearch;
    /** Review notes left on this checkout's files, and the one being written. */
    readonly fileComments: HappyAgentFileComments;
    /**
     * The open review streams, by the group whose changes each is. One per
     * checkout, because a review is about a working tree rather than about a
     * session, and it stays open across the sessions read beside it.
     */
    readonly reviews: ReadonlyMap<HappyAgentGroupId, HappyAgentReview>;
    /**
     * How wide the right panel is in the addressed checkout, in CSS pixels, or
     * nothing where this reader has never sized it and the product's own default
     * applies. Absent rather than pre-filled, because a remembered width and a
     * width nobody chose are different things and only the first should survive
     * a change to the default.
     */
    readonly panelWidth?: number;
    /**
     * Directories the reader opened in the tree, by full path.
     *
     * What is recorded is the decision, not the shape it produced: the tree
     * stands part way open on its own, so "absent from this set" has to mean
     * "nothing was said about it" rather than "closed" — otherwise every
     * listing that redrew would reopen the directories the reader deliberately
     * shut.
     */
    readonly fileTreeExpanded: ReadonlySet<string>;
    /** Directories the reader closed, including ones that open on their own. */
    readonly fileTreeCollapsed: ReadonlySet<string>;
    /** The lazily materialized directories of the open group's all-files tree. */
    readonly workspaceFiles?: HappyAgentWorkspaceFiles;
    /** True while the all-files root directory is being read. */
    readonly workspaceFilesLoading: boolean;
    /** The bot being made, while that surface is open. */
    readonly botCreate?: HappyAgentBotCreateSnapshot;
    /** Where adding a folder to this machine as a project stands. */
    readonly projectAdd: HappyAgentProjectAddSnapshot;
    /** GitHub project being cloned onto a peer Happy Agent, while its dialog is open. */
    readonly projectClone?: HappyAgentProjectCloneSnapshot;
}

/**
 * Adding a folder on this machine as a project: whether one is being added right
 * now, and why the last attempt was refused.
 *
 * Both halves exist because the act spans a native dialog and a daemon round
 * trip, which is long enough for the reader to press the control again — and a
 * refusal has no row of its own to be reported on, since the project it would
 * have been never came into being.
 */
export interface HappyAgentProjectAddSnapshot {
    /**
     * True from the moment the folder picker is asked for until the project has
     * been registered or the attempt has ended. It is what makes a second press
     * do nothing rather than open a second picker.
     */
    readonly pending: boolean;
    /**
     * Why the last attempt was refused, in the reader's terms. Starting another
     * attempt clears it: the refusal described a folder the reader has already
     * gone back to the picker over. Cancelling that attempt reports nothing of
     * its own, since choosing nothing is a complete act with nothing to say.
     */
    readonly error?: string;
}

/** Controlled draft for creating one managed project on another Happy Agent. */
export interface HappyAgentProjectCloneSnapshot {
    readonly repository: string;
    readonly submitting: boolean;
    readonly error?: string;
}

/**
 * The id the panel's file viewer is drawn under. It is the panel's own tab id
 * rather than the file's, because the viewer is one slot that shows whichever
 * file was last pointed at.
 */
export const HAPPY_AGENT_PANEL_FILE_VIEW_ID = "file";

/** One of the four faces offered for a new bot, by position. */
export type HappyAgentBotFaceSlot = 0 | 1 | 2 | 3;

/**
 * The four faces rolled together for a new bot. Each is a seed: the picture is
 * a pure function of it, drawn wherever it is shown, so the draft carries no
 * pixels and a face survives a reload as eight characters.
 */
export type HappyAgentBotFaceSeeds = readonly [string, string, string, string];

/**
 * A bot being made.
 *
 * A bot is a colleague that does not end: one permanent conversation with a
 * folder of its own. Nothing here is required. A face is always chosen, because
 * four are rolled and one is picked from the start; a name left blank is given
 * by the host from the first message; and the first message is what most of a
 * bot's making is, so it is written here and sent the moment the bot exists.
 */
export interface HappyAgentBotCreateSnapshot {
    /** The chosen display name. Blank, the host names the bot from its first message. */
    readonly name: string;
    /** The four faces on offer; `faceSlot` says which one the bot gets. */
    readonly faces: HappyAgentBotFaceSeeds;
    /** The picked position. It is the position that is kept when the four are re-rolled. */
    readonly faceSlot: HappyAgentBotFaceSlot;
    /**
     * The composer the first message is written in. It is the same composer the
     * bot's conversation will have, standing where that one will stand: sending
     * from it makes the bot and says the first thing to it in one act, and
     * making the bot without sending carries its text into the conversation as
     * the draft, so nothing the reader wrote moves or disappears.
     */
    readonly composer: ComposerSnapshot;
    /**
     * The model, effort, access mode, and speed the bot's conversation will
     * start with, and the options behind those choices — the same pickers the
     * conversation's composer carries, over a draft instead of a live session,
     * so the bot runs the way its composer said it would. Absent until the
     * model catalog has been read, which is what keeps the composer from
     * waiting on it.
     */
    readonly menus?: HappyAgentMenusSnapshot;
    /** True while the bot is being made; the surface stays up and inert. */
    readonly submitting: boolean;
    /** A refused creation, said on the surface rather than thrown away. */
    readonly error?: string;
}

/**
 * Paints the chosen face as the raster the host stores. The seed is product
 * state and the drawing is a pure function of it, but the drawing needs a
 * canvas, which the store does not have; the caller that does lends it here,
 * and the store decides when it is used.
 */
export type HappyAgentBotFacePaint = (seed: string) => Promise<HappyAgentAvatarImage>;

/**
 * Which files the panel lists: the checkout's changes, every file in it, or
 * one slice an agent built over it. A slice is offered only while the
 * checkout has one, and a remembered slice scope over a checkout that has
 * none reads as changes rather than as an empty listing.
 */
export type HappyAgentFileScope = "changed" | "all" | "slice";

/**
 * How the panel arranges them. Flat suits a handful of changed files, where a
 * folder per file is only indentation; tree suits a whole repository, where the
 * shape is the point.
 */
export type HappyAgentFileLayout = "tree" | "flat";

/**
 * How Changes arranges itself before the reader says otherwise.
 *
 * A tree, because a change is read as "what did this touch", and the folders
 * are the answer's shape: a flat run of paths makes the reader rebuild that
 * shape by comparing prefixes down the column. Someone working through a
 * handful of files can still ask for the list, and that choice is remembered
 * per checkout.
 */
const HAPPY_AGENT_FILE_LAYOUT_DEFAULT: HappyAgentFileLayout = "tree";

/**
 * What the reader typed into the file listing, and what the checkout answered.
 *
 * The two scopes answer it from different places, which is why the results are
 * optional rather than always present. Changes is already complete in memory,
 * so a query there is filtered where the rows are built and needs nothing from
 * the daemon. All Files is a lazy directory tree, so filtering the part of it
 * that happens to be loaded would quietly hide most of the checkout; the daemon
 * ranks the whole thing instead, and `results` is its answer.
 */
export interface HappyAgentFileSearch {
    readonly query: string;
    /** Ranked whole-checkout matches, absent until the daemon has answered one. */
    readonly results?: readonly HappyAgentFileSearchResult[];
    /** True while an answer for the current query is still outstanding. */
    readonly searching: boolean;
}

/**
 * Which column of a diff a comment is attached to. The same line number means
 * two different lines on the two sides, so the side is part of the address
 * rather than a detail of how it is drawn.
 */
export type HappyAgentCommentSide = "deletions" | "additions";

export type HappyAgentCommentId = string & { readonly __brand: "HappyAgentCommentId" };

/**
 * Where a comment is attached, and to which text.
 *
 * The hash is what makes the anchor honest. A line number alone is a claim
 * about a file that an agent may already have rewritten: it would still point
 * somewhere, just not at the line that was being talked about. Recording the
 * content the comment was written against lets the surface say "this was left
 * on an older version of this file" instead of silently pointing at whatever
 * now occupies that row.
 *
 * `lineNumber: 0` addresses the file rather than a line in it, which is the
 * renderer's own convention for a file-level annotation.
 */
export interface HappyAgentCommentAnchor {
    readonly path: string;
    readonly lineNumber: number;
    readonly side: HappyAgentCommentSide;
    /** The file's content hash when the comment was written, when one was known. */
    readonly hash?: string;
}

export interface HappyAgentFileComment {
    readonly id: HappyAgentCommentId;
    readonly anchor: HappyAgentCommentAnchor;
    readonly text: string;
    /**
     * The file has changed since this was written, so the anchor no longer
     * describes the text on screen. Stated rather than repaired: guessing where
     * the line went is exactly the kind of reconstruction that produces a
     * comment confidently attached to the wrong code.
     */
    readonly stale: boolean;
}

/** A comment being written, before it becomes one. */
export interface HappyAgentCommentDraft {
    readonly anchor: HappyAgentCommentAnchor;
    readonly text: string;
}

/**
 * The review notes left on this checkout's changed files.
 *
 * Memory-only and deliberately so: a note here exists to become a request to
 * the agent, and it is spent when it does. Nothing about it is worth surviving
 * a restart, and persisting it would make an unsent remark look like a record.
 */
export interface HappyAgentFileComments {
    readonly comments: readonly HappyAgentFileComment[];
    readonly draft?: HappyAgentCommentDraft;
}

const FILE_COMMENTS_IDLE: HappyAgentFileComments = { comments: [] };

/** One changed file in the review stream: its address and both of its sides. */
export interface HappyAgentReviewFile {
    readonly path: string;
    /** The path before a rename, when Git reports one. */
    readonly oldPath?: string;
    readonly status: HappyAgentGitChangedFile["status"];
    /** Disk identity the loaded document answers for, so a stale read is known. */
    readonly revision: string;
    readonly document: Loadable<HappyAgentChangedFileDocument>;
    /**
     * True when this file's bytes have moved since the document here was read
     * and a fresh read is due. The document it replaces stays until the new one
     * lands: taking the file out of the stream while it is re-read moves every
     * line below it, and the agent writes while the reader is reading.
     */
    readonly stale?: boolean;
}

/**
 * How a change is shown: as one scroll, or one file at a time.
 *
 * Reading a change is reading it in order, so a change that can be drawn at
 * once is drawn at once. A change that cannot — hundreds of files, or hundreds
 * of thousands of lines — is not made readable by arriving in pieces while the
 * reader scrolls: the ground moves under them and every address they were
 * travelling to moves with it. Such a change is read a file at a time instead,
 * which is a whole file with a next and a previous rather than a moving floor.
 */
export type HappyAgentReviewPresentation = "stream" | "one-file";

/**
 * Every changed file in one checkout, read in the order they will be read in.
 *
 * A change is rarely about one file, so the review is the unit: this exists
 * while the reader has the stream open. Everything it will draw is read before
 * it is drawn — the stream's height, its file order, and the addresses its
 * steps travel to are all settled from the first frame — and a change too large
 * for that is shown one file at a time, where the same is true of the file on
 * screen.
 *
 * It is memory-only — it is a read of the working tree, and the working tree is
 * the durable thing.
 */
export interface HappyAgentReview {
    readonly id: string;
    readonly groupId: HappyAgentGroupId;
    readonly files: readonly HappyAgentReviewFile[];
    /** Whether this change is drawn as one scroll or a file at a time. */
    readonly presentation: HappyAgentReviewPresentation;
    /**
     * Which file is on screen while the change is read one file at a time.
     * A stream has every file on screen and names none of them here.
     */
    readonly activePath?: string;
    /**
     * Files shown as a header only, by path. A reviewer closes a file they have
     * finished with so the ones they have not stay together.
     */
    readonly collapsed: ReadonlySet<string>;
    /**
     * Files the reviewer has said they are done with, by path. Marking one
     * closes it; unmarking only takes the mark off, because a reviewer who
     * changes their mind about a file is not asking to read it again this
     * second.
     */
    readonly viewed: ReadonlySet<string>;
    /** True while a file this review is meant to be showing has no document. */
    readonly loading: boolean;
    /**
     * True once everything the review was showing had been read at the same
     * time — the change has been drawn whole at least once.
     *
     * Until then the surface waits rather than drawing a stream that grows
     * under the reader. After it, a file the agent has just added arrives on
     * its own when it is read, which moves one file's worth of the stream
     * instead of taking the whole change off the screen and putting it back.
     */
    readonly drawn: boolean;
}

/** The strip id a checkout's review stream occupies. */
const reviewIdOf = (groupId: HappyAgentGroupId): string => `review:${groupId}`;

/**
 * How much change one scroll holds.
 *
 * Both limits are about the same thing from two directions: a stream is read
 * whole, so everything in it is read before any of it is drawn. Beyond this the
 * wait to open it stops being a wait and the change is shown a file at a time
 * instead. Git already counts the lines for every changed file, so which it is
 * is known before a single file has been read.
 */
const REVIEW_STREAM_FILE_LIMIT = 40;
const REVIEW_STREAM_LINE_LIMIT = 20000;

/** Which of the two ways this change is read, from the counts Git gives us. */
const reviewPresentationOf = (
    changes: readonly HappyAgentGitChangedFile[],
): HappyAgentReviewPresentation => {
    if (changes.length > REVIEW_STREAM_FILE_LIMIT) return "one-file";
    const lines = changes.reduce(
        (sum, change) => sum + (change.addedLines ?? 0) + (change.deletedLines ?? 0),
        0,
    );
    return lines > REVIEW_STREAM_LINE_LIMIT ? "one-file" : "stream";
};

/** The files on screen: all of them in a stream, the current one otherwise. */
const reviewShown = (review: HappyAgentReview): readonly HappyAgentReviewFile[] => {
    if (review.presentation === "stream") return review.files;
    const at = review.files.findIndex((file) => file.path === review.activePath);
    return at < 0 ? review.files.slice(0, 1) : review.files.slice(at, at + 1);
};

/**
 * The files a review reads, which is what it shows plus, one file at a time,
 * the files either side of it — so stepping through a change is a step rather
 * than a round trip at every step.
 */
const reviewRead = (review: HappyAgentReview): readonly HappyAgentReviewFile[] => {
    if (review.presentation === "stream") return review.files;
    const at = review.files.findIndex((file) => file.path === review.activePath);
    if (at < 0) return review.files.slice(0, 1);
    return review.files.slice(Math.max(at - 1, 0), at + 2);
};

/**
 * Whether a review is still waiting for something it is meant to be showing.
 * A file read ahead of the reader is not one of those, and a file that failed
 * has an answer — the wrong one, which the stream says out loud.
 */
const reviewWaiting = (review: HappyAgentReview): boolean =>
    reviewShown(review).some(
        (file) => file.document.type === "loading" || file.document.type === "unloaded",
    );

/**
 * The same review, saying what it is waiting for and whether it has ever been
 * whole. Every write to a review goes through this, so those two answers are
 * never something a caller can forget to keep true.
 */
const reviewSettle = (review: HappyAgentReview): HappyAgentReview => {
    const waiting = reviewWaiting(review);
    return { ...review, loading: waiting, drawn: review.drawn || !waiting };
};

/**
 * The one attachment a draft carries its review notes in. Fixed rather than
 * minted, so notes added while the chip is already waiting rewrite that chip
 * in place instead of stacking a second one beside it.
 */
const HAPPY_AGENT_REVIEW_COMMENTS_ATTACHMENT_ID = "review-comments";

/** The notes a draft carries, flattened out of their anchors for the composer. */
function happyAgentCommentsAttach(
    comments: readonly HappyAgentFileComment[],
): readonly ComposerReviewComment[] {
    return comments.map((comment) => ({
        path: comment.anchor.path,
        lineNumber: comment.anchor.lineNumber,
        side: comment.anchor.side,
        text: comment.text,
        stale: comment.stale,
    }));
}

/** How many ranked matches the file listing asks the daemon for. */
const FILE_SEARCH_LIMIT = 50;

/** Nothing typed, nothing found — the listing's resting state. */
const FILE_SEARCH_IDLE: HappyAgentFileSearch = { query: "", searching: false };

/**
 * How a changed file is displayed. Mirrors the UI's `ChangedFileDiffMode`.
 *
 * `file` is the file itself rather than the change to it — read or written, one
 * face. Reading a file and writing it are not two places to be.
 */
export type HappyAgentFileViewMode = "file" | "unified" | "split";

/**
 * A rename the reader has opened but not committed. The draft lives here rather
 * than in the field so the surface stays a pure function of this snapshot, and
 * so an in-flight rename survives the row list being republished underneath it.
 */
export type HappyAgentRenameSnapshot = {
    /** What it is called now, for the dialog's title. */
    readonly currentName: string;
    readonly draft: string;
    /** True while the host is being told; the dialog stays up and inert. */
    readonly submitting: boolean;
} & (
    | { readonly kind: "bot"; readonly botId: string }
    | { readonly kind: "project"; readonly projectId: HappyAgentProjectId }
    | {
          readonly kind: "workspace";
          readonly projectId: HappyAgentProjectId;
          readonly worktreeId: HappyAgentWorktreeId;
      }
);

/**
 * A project archive the reader has asked for and has not yet gone through with.
 * Archiving takes the project's conversations and every worktree checkout under
 * it, so it is confirmed against the name it is about to remove rather than
 * carried out on the click that asked for it.
 *
 * Kept beside the rename it is reached from, so the settings surface reads one
 * snapshot for what it is showing and what it is in the middle of.
 */
export interface HappyAgentProjectArchiveSnapshot {
    readonly projectId: HappyAgentProjectId;
    /** What the project is called, for the sentence the confirmation states. */
    readonly name: string;
    /** True while the host is being told; the confirmation stays up and inert. */
    readonly submitting: boolean;
    /**
     * Why the last attempt did not archive it, in the reader's words. Present
     * only after the list reconciled the project back, which is what makes a
     * failure a failure rather than a slow success.
     */
    readonly error?: string;
}

/**
 * The project or worktree an empty main pane has offered to archive. This is a
 * separate confirmation from project settings: Cmd-W names the open group
 * directly and must never perform the destructive act on the keystroke itself.
 */
export type HappyAgentGroupArchiveSnapshot =
    | {
          readonly kind: "project";
          readonly projectId: HappyAgentProjectId;
          readonly name: string;
          readonly submitting: boolean;
          readonly error?: string;
      }
    | {
          readonly kind: "worktree";
          readonly projectId: HappyAgentProjectId;
          readonly worktreeId: HappyAgentWorktreeId;
          readonly name: string;
          readonly submitting: boolean;
          readonly error?: string;
      };

/** Which of the three things a project can say about where its sessions run. */
export type HappyAgentProjectComputeMode = "default" | "local" | "docker";

/**
 * Where the project whose settings are open runs its sessions: what the host
 * holds, and what the reader is in the middle of choosing instead.
 *
 * It lives beside the rename it is shown with rather than in a store of its own
 * because the dialog goes inert as a whole — one request in flight disables the
 * name, the compute controls, and the commit together — and a surface cannot
 * make that decision from two snapshots that notify independently.
 *
 * The setting is not part of the project row: the host's live catalog does not
 * describe it, so it is read for the project this dialog names and re-read
 * whenever the host says a project changed.
 */
export interface HappyAgentProjectComputeSnapshot {
    readonly projectId: HappyAgentProjectId;
    /**
     * Whether the host's own answer is in hand yet. Until it is `ready` nothing
     * here states what the project is set to, and the controls have nothing
     * truthful to show as chosen.
     */
    readonly status: "loading" | "ready" | "error";
    /** What the host holds, once `status` is `ready`. Absent means the project states nothing. */
    readonly current?: HappyAgentProjectCompute;
    /**
     * How many times the host has recorded a change to this project's choice. It
     * names the containers the choice builds, so a reader can see that changing
     * the setting starts a new one rather than reusing what is there.
     */
    readonly generation: number;
    /** The choice being made. Seeded from `current` when the host's answer arrives. */
    readonly mode: HappyAgentProjectComputeMode;
    /**
     * The image being typed. Kept across a switch away from Docker and back, so
     * looking at another option does not throw away what was written — and kept
     * verbatim, because an image name with a space in it is wrong rather than
     * one space shorter.
     */
    readonly image: string;
    /** True while the host is being told; the whole dialog stays up and inert. */
    readonly submitting: boolean;
    /** Why the last submission did not save, in the reader's words. */
    readonly error?: string;
    /** Why the setting could not be read, when `status` is `error`. */
    readonly readError?: string;
}

/**
 * What the workspace asks its owner to navigate to. The store never decides
 * which conversation is open — it reports that a conversation it just created
 * through the compose action is the one to address next, and the
 * router turns that into a URL.
 */
export type HappyAgentWorkspaceOutput =
    | {
          readonly type: "conversationOpenRequested";
          readonly location: HappyAgentSessionLocation;
      }
    /** A group to address before it holds a conversation, such as a new worktree. */
    | { readonly type: "groupOpenRequested"; readonly groupId: HappyAgentGroupId }
    /**
     * The addressed group is gone from the host's own catalog: the project was
     * archived, here or from another window or another machine's Happy, and its
     * worktrees went with it. The URL now names nothing, so the owner replaces
     * the address with this Happy Agent's list rather than leaving a route pointing at a
     * row that no longer exists.
     *
     * Project and workspace removal is emitted only after an authoritative
     * catalog read. Folder-owned groups follow Happy Agent Connect's visible
     * prediction; if that queued mutation is rejected, the exact address this
     * event replaced is requested again once the folder view rolls back.
     */
    | { readonly type: "addressedGroupRemoved"; readonly groupId: HappyAgentGroupId };

export interface HappyAgentWorkspaceDeps {
    readonly output?: (event: HappyAgentWorkspaceOutput) => void;
    /**
     * The window this workspace is shown in, for the one act that needs it:
     * choosing a folder is something only the application window can ask, and
     * the answer is a path this store then hands to Happy Agent. Absent leaves the
     * workspace unable to add a project, which is the honest state of a host
     * with no folder picker — Blueprint and tests included.
     */
    readonly host?: HappyAgentHost;
    /**
     * Where this window keeps how each checkout is arranged — panel width, and
     * how its files are listed. Omitted, the arrangements last as long as the
     * window and no longer, which is what Blueprint and tests want.
     */
    readonly viewPreferences?: HappyAgentViewPreferencesPersistence;
}

export interface HappyAgentWorkspaceNewChatInput {
    readonly projectId?: HappyAgentProjectId;
    readonly workspaceId?: HappyAgentWorktreeId;
    readonly model?: string;
    readonly effort?: HappyAgentThinkingLevel;
    readonly prompt?: string;
}

export interface HappyAgentWorkspaceStore {
    get(): HappyAgentWorkspaceSnapshot;
    subscribe(listener: () => void): () => void;

    /**
     * The workspace's right-hand tool panel. It is a store of its own, not part of
     * the snapshot above, because a terminal in it repaints far faster than the
     * conversation does and must not drag the whole workspace through a render to
     * do it. The workspace keeps it pointed at the addressed group.
     */
    readonly panel: HappyAgentPanelStore;

    // Navigation-applied conversation lifetime. These are not user selection:
    // the router applies them from the addressed URL.
    /**
     * Materializes the addressed conversation, releasing any previously open
     * one. The group comes from the URL when available so group-scoped surfaces
     * can follow navigation without deriving identity from an asynchronous
     * conversation read.
     */
    conversationOpen(conversationId: HappyAgentSessionId, groupId?: HappyAgentGroupId): void;
    /**
     * Applies an addressed group that holds no conversation, giving it a composer
     * whose first submission starts one. Releases any open conversation, since
     * the URL now names a group rather than a conversation.
     */
    groupOpen(groupId: HappyAgentGroupId): void;
    /** Releases the open conversation; the workspace is addressing no conversation. */
    conversationClose(): void;
    /** Retries a failed authoritative conversation-list read. */
    conversationListRetry(): void;
    /**
     * Where one session lives, for a surface that knows only its id — the
     * machine's inbox names the session that asked a question and nothing else,
     * and only its group makes it addressable. Resolves with `undefined` when
     * there is nowhere to send a reader.
     */
    sessionLocationRead(
        sessionId: HappyAgentSessionId,
    ): Promise<HappyAgentSessionLocation | undefined>;
    /** Retries a failed acquisition for the currently open conversation. */
    conversationRetry(): void;
    /** Sends agent-authored slot text to the conversation currently addressed. */
    messageSendCurrent(message: string): Promise<void>;
    /** Sends agent-authored slot text to one explicitly addressed conversation. */
    messageSend(sessionId: HappyAgentSessionId, message: string): Promise<void>;
    /** Replaces one explicitly addressed conversation's composer draft. */
    draftUpdate(sessionId: HappyAgentSessionId, message: string): Promise<void>;
    /** Adds an unsent suggestion without replacing an existing draft or duplicating an unchanged retry. */
    draftAppend(sessionId: HappyAgentSessionId, message: string): Promise<void>;
    /** Starts the new conversation described by a slot action and optionally submits its prompt. */
    chatStart(input: HappyAgentWorkspaceNewChatInput): Promise<void>;
    /**
     * Starts a conversation in the named group. The group is named rather than
     * inferred: `input.worktreeId` is absent for a project-root session, and an
     * absent id identifies nothing, so it can neither be checked nor refused.
     */
    conversationCreate(
        groupId: HappyAgentGroupId,
        input: HappyAgentSessionCreateInput,
    ): Promise<void>;
    /**
     * Closes a conversation: it leaves the list durably without ending the
     * session. The caller addresses somewhere else first when the closed
     * conversation is the open one; this store does not navigate.
     */
    conversationArchive(conversationId: HappyAgentSessionId): Promise<void>;
    /** Returns an archived conversation to its workspace strip. Navigation remains the caller's. */
    conversationRestore(conversationId: HappyAgentSessionId): Promise<void>;
    /**
     * Moves one tab of the addressed group directly after `afterId`, or to the
     * front of the strip when null. The order is this client's own and takes
     * effect at once: nothing is asked of the daemon, which orders sessions but
     * cannot order a strip that also holds files.
     */
    tabReorder(tabId: string, afterId: string | null): void;
    /**
     * Adds a folder on this machine to the list as a project: asks the host for
     * one, registers it with Happy Agent, and addresses it.
     *
     * Returns immediately and reports through the snapshot, because the act
     * spans a native dialog the reader may take any amount of time over. Exactly
     * one is ever in flight: asking again while one is pending does nothing at
     * all, so a second press cannot open a second picker or register a second
     * time. Cancelling the picker ends the act silently.
     *
     * Nothing is started in the project. The new project is addressed the way a
     * new worktree already is — as a group holding no conversation, whose
     * composer starts the first one when something is sent into it — so adding a
     * project never leaves an unwanted session behind.
     */
    projectAdd(): void;
    /** Opens the GitHub project dialog for the addressed peer Happy Agent. */
    projectCloneOpen(): void;
    projectRepositoryUpdate(value: string): void;
    projectCloneCancel(): void;
    projectCloneSubmit(): void;
    /** Moves one project after `afterId`, or to the front of the list when null. */
    projectReorder(
        projectId: HappyAgentProjectId,
        afterId: HappyAgentProjectId | null,
    ): Promise<void>;
    /** Archives a bot, preserving its dedicated folder for a later restore. */
    botArchive(botId: HappyAgentBotId): Promise<void>;
    /** Moves one bot after `afterId`, or to the front of the bot list when null. */
    botReorder(botId: HappyAgentBotId, afterId: HappyAgentBotId | null): Promise<void>;
    /**
     * Archives a project, taking its conversations and its worktrees' checkouts
     * with it, and resolves with the verified outcome. The caller does not
     * navigate off the result: an addressed group that the host's catalog no
     * longer holds is reported through `addressedGroupRemoved`, which covers the
     * archive another window or another machine performed just the same.
     */
    projectArchive(projectId: HappyAgentProjectId): Promise<HappyAgentProjectArchiveResult>;
    /**
     * Adds a worktree to the project and opens a first conversation in it once
     * the host has prepared its checkout.
     */
    worktreeCreate(projectId: HappyAgentProjectId): Promise<void>;
    /** Archives a worktree, removing it and its checkout. */
    worktreeArchive(
        projectId: HappyAgentProjectId,
        worktreeId: HappyAgentWorktreeId,
    ): Promise<HappyAgentWorktreeArchiveResult>;
    /** Moves one worktree after `afterId` within its project, or to the front when null. */
    worktreeReorder(
        projectId: HappyAgentProjectId,
        worktreeId: HappyAgentWorktreeId,
        afterId: HappyAgentWorktreeId | null,
    ): Promise<void>;

    /**
     * Previews one workspace file in the main-content tab strip. A new preview
     * replaces this group's previous preview without disturbing permanent tabs.
     */
    filePreview(groupId: HappyAgentGroupId, path: string, kind: HappyAgentFileTabKind): void;
    /**
     * Opens one workspace file permanently, promoting its preview when present.
     *
     * `selection` is the region a reference named — the lines behind a
     * `Store.ts:120-148` in a message. The tab scrolls to them and marks them;
     * opening the same file with no region named puts the mark away.
     */
    fileOpen(
        groupId: HappyAgentGroupId,
        path: string,
        kind: HappyAgentFileTabKind,
        selection?: HappyAgentFileLineRange,
    ): void;
    /** Warms one file after pointer or keyboard intent without opening a tab. */
    filePreprocess(groupId: HappyAgentGroupId, path: string, kind: HappyAgentFileTabKind): void;
    /**
     * Opens an attachment the agent produced on the host as a file of the
     * checkout it lives in, reported by whether it could.
     *
     * An attachment names an absolute path on the machine Happy Agent runs on, and a
     * path inside a checkout this workspace already reads is a file like any
     * other: it opens in a tab, and a document opens as a rendered page rather
     * than as bytes to save. Anything outside every checkout — generated media,
     * a file elsewhere on that machine — is not something this store can read,
     * and saying so is what lets the surface fall back to downloading it.
     */
    attachmentFileOpen(source: string, kind: HappyAgentFileTabKind): boolean;
    /**
     * Opens one workspace file in the panel's viewer, beside the conversation
     * that named it. This is what a link in a message and the file a tool call
     * worked on resolve to: the file is read for showing, the panel's viewer tab
     * appears immediately with that read's loading state, and the main content
     * — the transcript the reader is following — is left exactly as it was.
     *
     * It is `fileOpen` with the other placement, and opens the same tab, read
     * the same way, into the same editor. The panel holds one file at a time,
     * so this replaces whichever file was in it.
     */
    filePanelOpen(
        groupId: HappyAgentGroupId,
        path: string,
        kind: HappyAgentFileTabKind,
        selection?: HappyAgentFileLineRange,
    ): void;
    /** Closes the panel's file viewer and stops its pending read. */
    filePanelClose(): void;
    /**
     * Moves one view to the other side of the workspace: the panel's file viewer
     * into a main-content tab, a file tab into the panel's viewer, or a live
     * terminal or browser page between the two strips.
     *
     * This is a change of placement and nothing else. A file keeps its identity,
     * its read, and anything typed into it and not yet saved, because moving it
     * writes one field on the tab it already was; a terminal keeps its process
     * and a page keeps its address. The conversation has only one home and says
     * so by refusing: it belongs to the address bar rather than to a strip.
     *
     * `viewId` is a file tab id, a panel tab id, or `"file"` for the panel's
     * file viewer — the same ids the two strips are drawn from.
     */
    viewPlacementUpdate(viewId: string, placement: HappyAgentViewPlacement): void;
    /**
     * Puts one main-content view on screen — an open file tab or a tool tab
     * moved into the main content — or clears it so the addressed conversation
     * is what the main content shows.
     */
    mainViewSelect(viewId: string | undefined): void;
    /**
     * Commits the selected main-content view after its renderer says it is
     * complete. A stale completion is ignored when another tab was selected in
     * the meantime.
     */
    mainViewDisplay(presentationId: string): void;
    fileClose(tabId: string): void;
    fileRetry(tabId: string): void;
    /**
     * Opens the checkout's whole change as one stream, in the main content.
     *
     * One per checkout, and selecting it again brings the one already open
     * forward rather than starting a second read of the same working tree.
     */
    reviewOpen(groupId: HappyAgentGroupId): void;
    reviewClose(groupId: HappyAgentGroupId): void;
    /**
     * Shows the next or the previous file of a change being read one file at a
     * time. Saying it about a stream, or past either end of the change, does
     * nothing.
     */
    reviewFileNext(groupId: HappyAgentGroupId): void;
    reviewFilePrevious(groupId: HappyAgentGroupId): void;
    /** Reads the files in a review whose last read failed, again. */
    reviewRetry(groupId: HappyAgentGroupId): void;
    /** Shows one file in a review as a header only, or opens it again. */
    reviewFileCollapsedToggle(groupId: HappyAgentGroupId, path: string): void;
    /** Shows every file in a review as a header only, or opens them all. */
    reviewFilesCollapsedSet(groupId: HappyAgentGroupId, collapsed: boolean): void;
    /**
     * Marks one file in a review as reviewed, or takes the mark off. Marking
     * closes the file; unmarking leaves it as it is.
     */
    reviewFileViewedToggle(groupId: HappyAgentGroupId, path: string): void;
    /** Chooses how changed files are displayed, for every tab. */
    fileViewModeUpdate(mode: HappyAgentFileViewMode): void;
    /** Chooses whether long diff lines wrap or scroll, for every tab. */
    fileViewWrapUpdate(wrap: boolean): void;
    /**
     * Chooses whether the panel lists changed files or all of them. Asking for
     * all of them is what reads the checkout's listing, so it is never read for
     * a reader who only ever looks at their own changes.
     */
    fileScopeUpdate(groupId: HappyAgentGroupId, scope: HappyAgentFileScope): void;
    /**
     * Looks through one slice of a checkout: makes it the slice the panel
     * lists by and puts the panel's listing under the slice scope. The choice
     * is remembered per checkout, like the scope itself.
     */
    sliceSelect(groupId: HappyAgentGroupId, sliceId: HappyAgentSliceId): void;
    /**
     * Opens one slice from where it was named — the card in a transcript —
     * bringing the panel to its file listing under that slice. It is the one
     * act that moves the panel's own tab: the reader asked to see the slice,
     * and the slice is shown in exactly one place.
     */
    sliceOpen(groupId: HappyAgentGroupId, sliceId: HappyAgentSliceId): void;
    /**
     * Removes one slice the reader no longer needs. It leaves the listing at
     * once; if it was the slice being listed by, the panel moves to the newest
     * remaining one, or back to the changed files when none remain.
     */
    sliceDelete(groupId: HappyAgentGroupId, sliceId: HappyAgentSliceId): void;
    /** Chooses whether the panel nests paths into folders, for this checkout. */
    fileLayoutUpdate(groupId: HappyAgentGroupId, layout: HappyAgentFileLayout): void;
    /**
     * Records what the reader is looking for in the file listing. Under All
     * Files this asks the daemon to rank the whole checkout, because the tree
     * on screen is only the part of it that has been opened.
     */
    fileSearchUpdate(query: string): void;
    /**
     * Starts a review note on one line of a file, or on the file itself with
     * `lineNumber: 0`. One note is written at a time, so opening a second
     * replaces an untouched first rather than leaving two composers open.
     */
    commentDraftOpen(anchor: HappyAgentCommentAnchor): void;
    commentDraftUpdate(text: string): void;
    commentDraftCancel(): void;
    /** Keeps the written note. An empty one is a cancel, not an empty comment. */
    commentDraftSubmit(): void;
    commentRemove(commentId: HappyAgentCommentId): void;
    /** Records how wide the reader left the right panel in this checkout. */
    panelWidthUpdate(groupId: HappyAgentGroupId, width: number): void;
    /**
     * Records that the reader wants one directory open or closed.
     *
     * The wanted state is passed rather than derived, because whether a
     * directory was open is a question about the drawn tree — where depth
     * decides what has not been spoken for — and the store does not build one.
     */
    fileTreeExpandedUpdate(path: string, expanded: boolean): void;
    /** Warms one all-files directory after pointer or keyboard interest. */
    fileTreeDirectoryPrefetch(path: string): void;
    /** Reads the next page of one already expanded all-files directory. */
    fileTreeLoadMore(path: string): void;
    /** Records an unsaved edit to one file's working-tree text. */
    fileDraftUpdate(tabId: string, draft: string): void;
    /** Discards one file's unsaved edit and returns to its last loaded text. */
    fileDraftRevert(tabId: string): void;
    /** Writes one file's pending edit back to the checkout. */
    fileDraftSave(tabId: string): Promise<void>;

    // Composer actions for the open conversation (no draft lives in React).
    composerTextUpdate(text: string): void;
    composerFocusUpdate(focused: boolean): void;
    composerTextSubmit(): void;
    composerCommandInvoke(commandId: string): void;
    /**
     * Attaches picked, pasted, or dropped files to the addressed draft. Small
     * images are prepared inline; larger media and ordinary files retain their
     * browser `File` until send so selection itself never serializes a video.
     */
    composerAttachmentsAdd(files: readonly File[]): void;
    /** Removes one attachment from the addressed draft. */
    composerAttachmentRemove(attachmentId: string): void;

    /*
     * How the next turn will be configured. Picking states an intent and sending
     * is what applies it, whether or not a session exists yet: for an addressed
     * group with nothing in it the choice configures the session the first
     * message creates, and for an open conversation it is applied to that
     * session just before the message it was chosen for. One act, one meaning,
     * either side of a session's existence.
     *
     * They are local and synchronous, so choosing is instant and cannot fail.
     */
    sessionModelUpdate(input: HappyAgentModelSelection): void;
    sessionEffortUpdate(effort?: HappyAgentThinkingLevel): void;
    sessionPermissionModeUpdate(permissionMode: HappyAgentPermissionMode): void;
    sessionServiceTierUpdate(serviceTier?: HappyAgentServiceTier): void;

    // Conversation actions (forwarded to the currently open chat store).
    runAbort(): Promise<void>;
    answerInput(input: HappyAgentUserInputAnswers): Promise<void>;
    /**
     * Records the options ticked into the open conversation's pending question
     * before it is submitted, so a message sent instead of pressing Submit still
     * carries them.
     */
    requestSelectionUpdate(
        requestId: string,
        answers: Readonly<Record<string, readonly string[]>>,
    ): void;
    compact(): Promise<void>;
    /** Loads the next page before the active conversation's current window. */
    historyLoadMore(): void;
    /** Requests termination of one background terminal in the active session (`/stop`). */
    backgroundProcessStop(processId: number): Promise<void>;
    /** Reads the active session's token/cost usage snapshot for the `/usage` panel. */
    usageGet(): Promise<HappyAgentSessionUsage>;
    usagePanelOpen(): void;
    usagePanelClose(): void;
    /** Opens the right-side Activity tab for the current conversation. */
    activityPanelOpen(): void;
    activityPanelToggle(): void;
    activityPanelClose(): void;
    reasoningToggle(): void;
    /** Opens one transcript image of the open conversation full size. */
    imageOpen(messageId: string, attachmentId: string): void;
    /** Shows the conversation's next image, wrapping past the last one. */
    imageNext(): void;
    /** Shows the conversation's previous image, wrapping past the first one. */
    imagePrevious(): void;
    /** Closes the full-size image viewer. */
    imageClose(): void;
    /**
     * Opens one project or worktree root in one of `openInTargets`. The group is
     * named, not the directory: the host resolves the path from its own catalog.
     * The whole target is passed because it also becomes `openInRecent`, which
     * the host remembers across a reload and a control draws before detection
     * has answered.
     */
    openIn(groupId: HappyAgentGroupId, target: HappyAgentOpenInTarget): Promise<void>;
    /**
     * Materializes the surface for a new bot, with four faces rolled and the
     * first of them picked. A draft from a previous visit is offered back:
     * leaving the surface is how a draft is put down, not how it is thrown
     * away, and only the bot actually being made clears it.
     *
     * The painter turns the picked seed into the raster the host stores. It is
     * lent here because a canvas lives with the caller, and kept for the whole
     * visit because both ways of making the bot need it.
     */
    botCreateOpen(paint: HappyAgentBotFacePaint): void;
    /** Edits the name of the bot being made. */
    botCreateNameUpdate(name: string): void;
    /** Picks one of the four faces by position. */
    botCreateFacePick(slot: HappyAgentBotFaceSlot): void;
    /** Rolls four new faces. The picked position stays picked, now wearing its new face. */
    botCreateFacesRoll(): void;
    /** Edits the first message, in the composer that will become the conversation's. */
    botCreateTaskUpdate(text: string): void;
    /** Whether that composer's text control owns focus. */
    botCreateTaskFocusUpdate(focused: boolean): void;
    /**
     * Attaches picked, pasted, or dropped files to the first message, exactly
     * as `composerAttachmentsAdd` does for a conversation's: the composer here
     * is the one the conversation will have, and takes the same things.
     */
    botCreateAttachmentsAdd(files: readonly File[]): void;
    /** Removes one attachment from the first message. */
    botCreateAttachmentRemove(attachmentId: string): void;
    /** Chooses the model the bot's conversation starts on; effort and speed follow it. */
    botCreateModelUpdate(input: HappyAgentModelSelection): void;
    botCreateEffortUpdate(effort?: HappyAgentThinkingLevel): void;
    botCreatePermissionModeUpdate(permissionMode: HappyAgentPermissionMode): void;
    botCreateServiceTierUpdate(serviceTier?: HappyAgentServiceTier): void;
    /**
     * Sends the first message, which makes the bot on the way: the bot's row
     * stands in the list before the host is asked, the message is said to the
     * bot the moment the host holds it — its images inline and its files
     * placed in the bot's workspace, as any conversation's are — which is also
     * what names an unnamed bot, and its one conversation is reported through
     * `conversationOpenRequested` with that message already in it. A creation
     * the host refuses is reported as an unsent message, with the host's
     * reason, and can be retried from the composer.
     */
    botCreateTaskSend(): void;
    /**
     * Makes the bot without saying anything to it. The composer's text and
     * attachments follow the reader into the conversation as its draft, in the
     * same composer in the same place, so making the bot changes nothing about
     * what they were writing. A refused creation is reported on the surface.
     */
    botCreateSubmit(): Promise<void>;
    /** Starts renaming a project, or one of its worktrees, from its current name. */
    renameOpen(projectId: HappyAgentProjectId, worktreeId: HappyAgentWorktreeId | undefined): void;
    /** Opens the same name dialog for a bot's persistent identity. */
    botRenameOpen(botId: string): void;
    /** Edits the pending name. */
    renameDraftUpdate(draft: string): void;
    /** Abandons the rename. */
    renameCancel(): void;
    /** Commits the pending name; a blank one is not a rename and closes instead. */
    renameSubmit(): Promise<void>;
    /** Offers to archive the open empty project or worktree; it archives nothing yet. */
    groupArchiveOpen(groupId: HappyAgentGroupId): void;
    /** Dismisses the empty-group archive confirmation. */
    groupArchiveCancel(): void;
    /** Confirms the pending empty-group archive. */
    groupArchiveSubmit(): Promise<void>;
    /**
     * Asks to archive a project, which puts the confirmation in front of the
     * reader rather than archiving anything. A project the list no longer holds
     * is not asked about.
     */
    projectArchiveOpen(projectId: HappyAgentProjectId): void;
    /** Abandons the pending archive, leaving the project where it is. */
    projectArchiveCancel(): void;
    /**
     * Goes through with the pending archive. Resolves once the list has
     * reconciled: gone means archived — here, or already archived elsewhere —
     * and the confirmation and the settings dialog over it both close; still
     * listed means the host refused, and the reason stays on the confirmation
     * for another attempt.
     */
    projectArchiveSubmit(): Promise<void>;
    /**
     * Chooses what the open project should say about where its sessions run.
     * Local and nothing at all commit on their own; Docker needs an image, so it
     * only moves the choice and waits for the reader to write one.
     */
    projectComputeModeUpdate(mode: HappyAgentProjectComputeMode): void;
    /** Edits the Docker image being chosen. */
    projectComputeImageUpdate(image: string): void;
    /**
     * Saves the chosen setting on the open project, and resolves once the host
     * has answered with what it holds. A choice equal to what the host already
     * holds is not a change and is not sent.
     *
     * The submission carries one identity for its whole life, so a repeat of a
     * request whose answer was lost cannot apply it twice; changing the choice
     * makes it a different submission with a different identity. Nothing is
     * shown as saved until the host's own read-back says so, and a project that
     * is renamed, archived, or navigated away from while this is in flight can
     * never have another project's answer applied to it.
     */
    projectComputeSubmit(): Promise<void>;
    /** Shows or hides one finished turn's intermediate entries in the transcript. */
    turnTraceToggle(turnId: string): void;
    /**
     * Records where one conversation is being read, so returning to it resumes
     * there rather than at the newest message. Kept for the workspace's lifetime
     * and never persisted: a reading position is worth restoring while switching
     * between sessions, not weeks later on another machine.
     */
    conversationScrollUpdate(
        conversationId: HappyAgentSessionId,
        position: HappyAgentScrollPosition,
    ): void;
    [Symbol.dispose](): void;
}

function noOpenConversation(): Promise<never> {
    return Promise.reject(new Error("No local conversation is open."));
}

/** Nothing is being added and nothing was refused: one shared idle value. */
const PROJECT_ADD_IDLE: HappyAgentProjectAddSnapshot = { pending: false };

/** No slices known, or none built: one shared value so the snapshot keeps its identity. */
const SLICES_NONE: readonly HappyAgentSlice[] = [];

/**
 * The slice the panel lists by: the remembered one while it still exists, and
 * otherwise the newest. Retention drops old slices on the daemon, so a choice
 * made weeks ago can name a slice that is gone; the newest is what the reader
 * would have reached for anyway.
 */
function sliceResolve(
    slices: readonly HappyAgentSlice[],
    sliceId: string | undefined,
): HappyAgentSlice | undefined {
    if (sliceId !== undefined) {
        const chosen = slices.find((slice) => slice.id === sliceId);
        if (chosen !== undefined) return chosen;
    }
    return slices[0];
}

function githubRepositoryParse(
    value: string,
): { readonly repository: string; readonly name: string } | undefined {
    const match =
        /^(?:(?:https?:\/\/)?github\.com\/|git@github\.com:)?([^/\s]+)\/([^/?#\s]+?)(?:\.git)?\/?$/iu.exec(
            value.trim(),
        );
    if (!match) return undefined;
    const owner = match[1];
    const name = match[2];
    if (!owner || !name) return undefined;
    return { repository: `${owner}/${name}`, name };
}

/**
 * The creation fields one selection names. Absent optionals are left out rather
 * than sent as undefined, so a create request carries only what was chosen and
 * the daemon still supplies its own default for the rest.
 */
function selectionCreateFields(
    selection: HappyAgentSelection,
): Partial<HappyAgentSessionCreateInput> {
    return {
        providerId: selection.providerId,
        modelId: selection.modelId,
        ...(selection.effort !== undefined ? { effort: selection.effort } : {}),
        ...(selection.serviceTier !== undefined ? { serviceTier: selection.serviceTier } : {}),
        permissionMode: selection.permissionMode,
    };
}

/**
 * Owns the join between the conversation list and the open conversation for one
 * connected `HappyAgentWorkspaceClient`. Which conversation is open is decided by the URL and
 * applied here through `conversationOpen`/`conversationClose`; each time it
 * changes this store acquires (ref-counted) the matching chat handle from the
 * client, materializes a composer for it, and disposes the previous pair — all
 * outside React, so the app layer never manages this lifetime in an effect.
 *
 * The composer is the shared composer store: its `textSubmitted`,
 * `shellCommandSubmitted`, `commandInvoked`, and `mentionQueryUpdated` output is
 * what drives the daemon, so no draft, mention query, or command palette state
 * lives in a React component.
 *
 * The connection/daemon health surface is deliberately not part of this store: it
 * is owned by the host (the desktop connection loader) and read separately, so
 * this framework-free product store depends only on the injected `HappyAgentWorkspaceClient`.
 */
/**
 * Four fresh face seeds. A seed is any short string; eight base-36 characters
 * is far more faces than there are bots, and short enough to read in a debug
 * snapshot.
 */
/** The composer scope of a bot being made; one per workspace, so one id. */
const BOT_CREATE_COMPOSER_SCOPE = "bot-create";

function botFaceSeedsRoll(): HappyAgentBotFaceSeeds {
    const one = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    return [one(), one(), one(), one()];
}

export function happyAgentWorkspaceStoreCreate(
    client: HappyAgentWorkspaceClient,
    deps: HappyAgentWorkspaceDeps = {},
): HappyAgentWorkspaceStore {
    const list: HappyAgentSessionListStore = client.sessionList();
    const output = deps.output ?? (() => undefined);
    const draftOrigin = `happy_${Math.random().toString(36).slice(2)}`;
    let draftUpdatedAt = 0;
    const nextDraftUpdatedAt = (): number => {
        draftUpdatedAt = Math.max(Date.now(), draftUpdatedAt + 1);
        return draftUpdatedAt;
    };
    const panel: HappyAgentPanelStore = happyAgentPanelStoreCreate({
        terminalOpen: (sessionId) => client.terminalOpen(sessionId),
        memoryRead: (groupId) => client.memory.groupRead(groupId)?.panel,
        memoryWrite: (groupId, memory) => client.memory.groupPanelWrite(groupId, memory),
    });

    const listeners = new Set<() => void>();
    let active = false;
    let disposed = false;
    let unsubscribeList: (() => void) | undefined;
    let unsubscribeWorkspaceFiles: (() => void) | undefined;
    let unsubscribeModels: (() => void) | undefined;
    /** True while the drafts re-derive from a catalog the daemon changed, which nobody chose. */
    let draftsCatalogApplying = false;
    /** Ready bytes may have changed while this store had no live file-hint subscription. */
    let fileDocumentsReconcileOnStart = false;
    /**
     * The addressed checkout's slices, as last reported, and which checkout
     * they are of. Absent until the first report, so a checkout whose slices
     * have not arrived is not mistaken for one that has none.
     */
    let slices: readonly HappyAgentSlice[] | undefined;
    let slicesGroupId: HappyAgentGroupId | undefined;
    let unsubscribeSlices: (() => void) | undefined;

    // Open conversation lease. `acquisitionGeneration` invalidates an in-flight
    // acquisition when the addressed conversation changes or the store stops.
    // `mentionGeneration` rejects both ABA query responses and responses for a
    // composer whose conversation lease has already been released.
    let openId: HappyAgentSessionId | undefined;
    let acquiringId: HappyAgentSessionId | undefined;
    let handle: HappyAgentChatHandle | undefined;
    let chatStore: HappyAgentChatStore | undefined;
    let unsubscribeChat: (() => void) | undefined;
    let composer: ComposerStore | undefined;
    let unsubscribeComposer: (() => void) | undefined;
    // The chat store of the open conversation once it is acquired. Composer
    // output that lands before then waits on this rather than being dropped.
    let chatArrival: Promise<HappyAgentChatStore> | undefined;
    let acquisitionGeneration = 0;
    let mentionGeneration = 0;
    // Names one attached file within its draft; the daemon never sees this id.
    let attachmentSequence = 0;

    let conversation: Loadable<HappyAgentConversationSnapshot> = { type: "unloaded" };
    // An addressed group with nothing in it yet: its composer is live, and the
    // first thing sent into it is what creates the conversation.
    let openGroupId: HappyAgentGroupId | undefined;
    /* Read while a surface is on screen. Detecting installed applications costs
       a process launch or several, so it is not read at construction; but which
       applications exist changes whenever the reader installs or removes one,
       and nothing announces that, so it is re-read on a slow cadence rather
       than remembered for the life of the window. */
    let openInTargets: readonly HappyAgentOpenInTarget[] = [];
    let openInRecent: HappyAgentOpenInTarget | undefined;
    let openInTargetsReading = false;
    let openInTargetsTimer: ReturnType<typeof setInterval> | undefined;
    let rename: HappyAgentRenameSnapshot | undefined;
    let projectArchive: HappyAgentProjectArchiveSnapshot | undefined;
    let groupArchive: HappyAgentGroupArchiveSnapshot | undefined;
    /** Which submission owns the empty-group confirmation. */
    let groupArchiveSubmission = 0;
    /** Which submission the pending archive belongs to, so a superseded one's answer is dropped. */
    let projectArchiveSubmission = 0;
    let projectCompute: HappyAgentProjectComputeSnapshot | undefined;
    /**
     * Which read of the compute setting is the current one. Every read takes a
     * token when it is issued, and only the newest may write, so a slow read
     * cannot put an older value back over a newer one — including the read that
     * was in flight when the reader opened another project's settings.
     */
    let projectComputeReadToken = 0;
    /** Which submission owns the compute block, so a superseded one's answer is dropped. */
    let projectComputeSubmission = 0;
    /**
     * The identity of the submission the reader is on, and the choice it belongs
     * to. Sending the same choice again — after a failure, or after a lost answer
     * — reuses the identity, so the host can recognize the repeat; choosing
     * something else makes it a different submission and mints a new one.
     */
    let projectComputeMutationId: string | undefined;
    let projectComputeMutationChoice: string | undefined;
    /** The host's "a project changed" feed, open only while a project's settings are. */
    let unsubscribeProjectsChanged: (() => void) | undefined;

    /**
     * One submission's identity. The host adopts it only to recognize a repeat of
     * a request it has already applied, so it has no format to satisfy beyond
     * being different every time.
     */
    const computeMutationIdCreate = (): string =>
        `compute_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    /**
     * The last authoritative catalog read this workspace acted on. The list
     * publishes optimistically too, so this is what makes "the host says the row
     * is gone" a different event from "the row is not in the snapshot".
     */
    let catalogRevisionSeen = -1;
    /** The addressed group as of the last authoritative read that still held it. */
    let addressedGroupSeen: HappyAgentGroupId | undefined;
    /** Every group id the last authoritative read listed: projects and their worktrees. */
    let authoritativeGroupIds: ReadonlySet<string> = new Set();
    let fileViewMode: HappyAgentFileViewMode = "unified";
    let fileViewWrap = false;
    /**
     * Looking for a file is not a preference, so it is neither written to the
     * view preferences nor carried to the next checkout: it is what this reader
     * is doing right now, and moving to another project ends it.
     */
    let fileSearch: HappyAgentFileSearch = FILE_SEARCH_IDLE;
    /** Which search request is still wanted; a later query retires an earlier one. */
    let fileSearchGeneration = 0;
    /**
     * Review notes on this checkout. Like the search, this is what the reader is
     * doing rather than how they like things, so it is neither persisted nor
     * carried to another checkout.
     */
    let fileComments: HappyAgentFileComments = FILE_COMMENTS_IDLE;
    let reviews: ReadonlyMap<HappyAgentGroupId, HappyAgentReview> = new Map();
    /** Retires reads belonging to a review that has since been rebuilt or closed. */
    const reviewGenerations = new Map<string, number>();
    let commentSequence = 0;
    /** True while the chip is being written from the notes; see `commentsWrite`. */
    let commentsProjecting = false;
    /**
     * How each checkout this window has arranged is arranged, read once here.
     *
     * Per checkout rather than per workspace: how someone wants to look at a
     * project is a fact about that project's work — a repository whose diffs are
     * wide wants a wide panel, one with three changed files wants a flat list —
     * and imposing one checkout's arrangement on the next is a setting rather
     * than a memory of what they did.
     */
    let viewPreferences: HappyAgentViewPreferencesDocument = (() => {
        try {
            return (
                happyAgentViewPreferencesParse(deps.viewPreferences?.read()) ??
                HAPPY_AGENT_VIEW_PREFERENCES_EMPTY
            );
        } catch {
            // Storage the host refused is a window that remembers nothing, which
            // is the same as one nobody has arranged yet.
            return HAPPY_AGENT_VIEW_PREFERENCES_EMPTY;
        }
    })();
    /**
     * What the addressed checkout says about itself, or nothing where it has
     * never been arranged. Changed and flat are the defaults it falls back to:
     * the panel opens on the work in progress, which is short and reads better
     * as a list than as a tree of one-file folders.
     */
    const groupView = (groupId: HappyAgentGroupId | undefined): HappyAgentGroupViewPreferences =>
        groupId === undefined ? {} : (viewPreferences.groups[groupId] ?? {});
    const fileScopeOf = (groupId: HappyAgentGroupId | undefined): HappyAgentFileScope =>
        groupView(groupId).fileScope ?? "changed";
    const viewPreferencesWrite = (
        groupId: HappyAgentGroupId,
        change: HappyAgentGroupViewPreferences,
    ): void => {
        viewPreferences = happyAgentViewPreferencesUpdate(viewPreferences, groupId, change);
        try {
            deps.viewPreferences?.write(viewPreferences);
        } catch {
            // A storage-denied window still keeps the arrangement on screen for
            // as long as it stays open.
        }
    };
    let fileTreeExpanded: ReadonlySet<string> = new Set();
    let fileTreeCollapsed: ReadonlySet<string> = new Set();
    /** Counts the asks to show a region, so each one is its own event. */
    let fileRevealRequests = 0;
    /** The parts of a new bot the store holds itself; the composer is a store of its own. */
    interface BotCreateDraft {
        readonly name: string;
        readonly faces: HappyAgentBotFaceSeeds;
        readonly faceSlot: HappyAgentBotFaceSlot;
        readonly submitting: boolean;
        readonly error?: string;
    }
    let botCreateDraft: BotCreateDraft | undefined;
    let botCreateComposer: ComposerStore | undefined;
    let unsubscribeBotCreateComposer: (() => void) | undefined;
    /**
     * How the bot's conversation will be configured, materialized from the
     * model catalog once it has been read — the same draft a group with no
     * conversation carries, so the pickers under the first message are the
     * ones every composer has.
     */
    let botCreateSessionDraft: HappyAgentSessionDraftStore | undefined;
    let botCreateSessionDraftWriter: HappyAgentSessionDraftWriter | undefined;
    let unsubscribeBotCreateSessionDraft: (() => void) | undefined;
    /** Invalidates a catalog read still in flight once the draft it was for is put down. */
    let botCreateSessionDraftGeneration = 0;
    let botCreatePaint: HappyAgentBotFacePaint | undefined;
    /** The parts composed for the snapshot, rebuilt only when one has changed. */
    let botCreate: HappyAgentBotCreateSnapshot | undefined;
    let botCreateComposedFrom:
        | {
              readonly draft: BotCreateDraft;
              readonly composer: ComposerSnapshot;
              readonly session: HappyAgentSessionDraftSnapshot | undefined;
          }
        | undefined;
    /**
     * Where adding a folder as a project stands. One value for the workspace
     * rather than one per attempt, because exactly one add is ever in flight —
     * which is the thing `pending` both reports and enforces.
     */
    let projectAdd: HappyAgentProjectAddSnapshot = PROJECT_ADD_IDLE;
    let projectClone: HappyAgentProjectCloneSnapshot | undefined;
    /** Clone requests awaiting either a durable lifecycle or a mutation refusal. */
    const pendingProjectClones = new Map<
        HappyAgentProjectId,
        { readonly generation: number; readonly repository: string }
    >();
    let projectCloneGeneration = 0;
    let workspaceFiles: HappyAgentWorkspaceFiles | undefined;
    let workspaceFilesLoading = false;
    let workspaceFilesGroupId: HappyAgentGroupId | undefined;
    let workspaceFilesGeneration = 0;
    /** Most-recent intent first; a repeated hover moves its pending read back to the front. */
    let workspaceFileTreeLoadQueue: HappyAgentWorkspaceFileTreeLoadRequest[] = [];
    let workspaceFileTreeLoadsActive = 0;
    let groupComposer: ComposerStore | undefined;
    let unsubscribeGroupComposer: (() => void) | undefined;
    /** How the addressed group's first session will be configured. */
    let groupDraft: HappyAgentSessionDraftStore | undefined;
    let groupDraftWriter: HappyAgentSessionDraftWriter | undefined;
    let unsubscribeGroupDraft: (() => void) | undefined;
    let groupDraftGeneration = 0;
    /**
     * Where each conversation was last being read, by conversation id. Switching
     * sessions disposes the transcript that held the position, so it is kept
     * here — outside any component's lifetime — and handed back when that
     * conversation is opened again.
     */
    let scrollPositions: ReadonlyMap<HappyAgentSessionId, HappyAgentScrollPosition> = new Map();
    let fileTabs: readonly HappyAgentFileTabSnapshot[] = [];
    let activeMainViewId: string | undefined;
    /** The selected view whose complete pixels are currently on screen. */
    let displayedMainViewId: string | undefined;
    /**
     * The group the main content's tool view belongs to, when it is one. A tool
     * tab is the panel's, and the panel shows one group at a time, so knowing
     * whose it is separates "this tab has ended" from "we are looking at another
     * project just now". Undefined whenever the main view is a file tab, which
     * carries its own group already.
     */
    let activeMainViewGroupId: HappyAgentGroupId | undefined;
    /** The addressed group's tab strip, in the order the reader arranged it. */
    let tabOrder: readonly string[] = [];
    const fileLoadGenerations = new Map<string, number>();
    let filePresentationId = 0;
    const filePresentationIdNext = (): string =>
        `file-presentation:${String((filePresentationId += 1))}`;
    const readyDocumentCache = new Map<string, HappyAgentReadyDocumentCacheEntry>();
    let readyDocumentCacheWeight = 0;
    const fileLoadRequests = new Map<string, HappyAgentFileLoadRequest>();
    const fileLoadOwnerKeys = new Map<string, string>();
    const fileLoadOwnerRequests = new Map<string, HappyAgentFileLoadRequest>();
    const fileTabLoadedIdentities = new Map<string, HappyAgentDocumentCacheIdentity>();
    const fileTabRevalidations = new Map<string, { readonly revision: string }>();
    /** Most-recent file intent first; completed documents remain in the bounded LRU. */
    let filePreprocessQueue: HappyAgentFilePreprocessRequest[] = [];
    let filePreprocessLoadsActive = 0;
    let filePreprocessGeneration = 0;

    const readyDocumentCacheRead = (
        baseKey: string,
        allowPreviousRevision = false,
    ): HappyAgentReadyDocumentCacheEntry | undefined => {
        const addressKey = happyAgentReadyDocumentCacheAddressKey(baseKey);
        let exact: [string, HappyAgentReadyDocumentCacheEntry] | undefined;
        let previous: [string, HappyAgentReadyDocumentCacheEntry] | undefined;
        for (const [key, entry] of readyDocumentCache) {
            if (entry.baseKey === baseKey) exact = [key, entry];
            else if (allowPreviousRevision && entry.addressKey === addressKey)
                previous = [key, entry];
        }
        const found = exact ?? previous;
        if (found === undefined) return undefined;
        const [foundKey, entry] = found;
        readyDocumentCache.delete(foundKey);
        readyDocumentCache.set(foundKey, entry);
        return entry;
    };

    const readyDocumentCacheWrite = (
        baseKey: string,
        document: HappyAgentFileDocument,
        expectedHash?: string,
    ): HappyAgentDocumentCacheIdentity | undefined => {
        const cachedDocument = happyAgentFileDocumentCanonical(document);
        if ("oldContent" in cachedDocument && cachedDocument.oldHash === undefined)
            return undefined;
        const identity = happyAgentReadyDocumentCacheKey(baseKey, cachedDocument);
        const addressKey = happyAgentReadyDocumentCacheAddressKey(baseKey);
        if (expectedHash !== undefined && identity.identity.hash !== expectedHash) return undefined;
        const weight = happyAgentReadyDocumentWeight(cachedDocument);
        // A single giant document must remain owned by its open surface, never
        // by this auxiliary cache. The LRU byte budget below bounds aggregate
        // retained text; this guard also avoids briefly inserting an entry that
        // can only be evicted immediately.
        if (weight > HAPPY_AGENT_READY_DOCUMENT_CACHE_MAX_WEIGHT) return undefined;
        for (const [key, entry] of readyDocumentCache) {
            if (entry.addressKey !== addressKey) continue;
            readyDocumentCache.delete(key);
            readyDocumentCacheWeight -= entry.weight;
        }
        readyDocumentCache.set(identity.key, {
            addressKey,
            baseKey,
            identity: identity.identity,
            document: cachedDocument,
            weight,
        });
        readyDocumentCacheWeight += weight;
        while (
            readyDocumentCache.size > HAPPY_AGENT_READY_DOCUMENT_CACHE_MAX_ENTRIES ||
            readyDocumentCacheWeight > HAPPY_AGENT_READY_DOCUMENT_CACHE_MAX_WEIGHT
        ) {
            const oldest = readyDocumentCache.entries().next().value as
                | [string, HappyAgentReadyDocumentCacheEntry]
                | undefined;
            if (oldest === undefined) break;
            readyDocumentCache.delete(oldest[0]);
            readyDocumentCacheWeight -= oldest[1].weight;
        }
        return identity.identity;
    };

    const fileLoadRequestRelease = (
        owner: string,
        expectedRequest?: HappyAgentFileLoadRequest,
    ): void => {
        const key = fileLoadOwnerKeys.get(owner);
        if (key === undefined) return;
        const request = fileLoadOwnerRequests.get(owner) ?? fileLoadRequests.get(key);
        if (expectedRequest !== undefined && request !== expectedRequest) return;
        fileLoadOwnerKeys.delete(owner);
        fileLoadOwnerRequests.delete(owner);
        if (request === undefined) return;
        if (fileLoadRequests.get(key) !== request) return;
        request.consumers.delete(owner);
        if (request.consumers.size > 0) return;
        request.controller.abort();
        fileLoadRequests.delete(key);
    };

    const fileLoadRequestOwns = (owner: string, request: HappyAgentFileLoadRequest): boolean =>
        fileLoadOwnerRequests.get(owner) === request;

    /** Retires cached and pending reads covered by one filesystem hint. */
    const fileAddressesInvalidate = (
        groupId: HappyAgentGroupId,
        paths: readonly string[] | null,
    ): void => {
        const changedPaths = paths === null ? undefined : new Set(paths);
        const affected = (baseKey: string): boolean => {
            const [candidateGroupId, path] = baseKey.split("\u0000");
            return (
                candidateGroupId === groupId &&
                path !== undefined &&
                (changedPaths === undefined || changedPaths.has(path))
            );
        };
        for (const [key, entry] of readyDocumentCache) {
            if (!affected(entry.baseKey)) continue;
            readyDocumentCache.delete(key);
            readyDocumentCacheWeight -= entry.weight;
        }
        for (const [key, request] of fileLoadRequests) {
            if (!affected(key)) continue;
            fileLoadRequests.delete(key);
            request.controller.abort();
            for (const owner of request.consumers) {
                if (fileLoadOwnerRequests.get(owner) !== request) continue;
                fileLoadOwnerKeys.delete(owner);
                fileLoadOwnerRequests.delete(owner);
            }
        }
        filePreprocessQueue = filePreprocessQueue.filter(
            (request) =>
                request.groupId !== groupId ||
                (changedPaths !== undefined && !changedPaths.has(request.path)),
        );
    };

    const fileLoadRequestAcquire = (
        owner: string,
        key: string,
        read: (signal: AbortSignal) => Promise<HappyAgentFileDocument>,
    ): HappyAgentFileLoadRequest => {
        fileLoadRequestRelease(owner);
        let request = fileLoadRequests.get(key);
        if (request === undefined) {
            const controller = new AbortController();
            const promise = read(controller.signal);
            request = {
                controller,
                consumers: new Set(),
                promise,
            };
            fileLoadRequests.set(key, request);
            const settle = (): void => {
                if (fileLoadRequests.get(key) === request) fileLoadRequests.delete(key);
            };
            void promise.then(settle, settle);
        }
        request.consumers.add(owner);
        fileLoadOwnerKeys.set(owner, key);
        fileLoadOwnerRequests.set(owner, request);
        return request;
    };
    /** The group the URL currently names, so tab memory knows what it describes. */
    let addressedGroupId: HappyAgentGroupId | undefined;
    /**
     * The published address. It is kept beside `addressedGroupId` rather than
     * derived from it because the two answer different questions: that one is
     * how long a group's tabs, files, and panel scope are held, and this one is
     * only where navigation last pointed. Closing a conversation to sit on the
     * Happy Agent's own root leaves the former alone and empties this.
     */
    let address: HappyAgentWorkspaceAddress = ADDRESS_NOWHERE;
    /**
     * The address as the outside is allowed to act on it. Navigation is kept
     * privately across a remount, because the URL still names the same place
     * and `start` re-acquires it; but while no surface is running there is
     * nowhere to act, and a stale handler asking must be told so.
     */
    const addressPublic = (): HappyAgentWorkspaceAddress =>
        active && !disposed ? address : ADDRESS_NOWHERE;
    /** Groups whose remembered file tabs have already been reopened in this run. */
    const restoredGroupIds = new Set<HappyAgentGroupId>();
    /** True while reopening remembered tabs, so the reopening is not itself remembered. */
    let restoring = false;
    let groupResume: ReadonlyMap<HappyAgentGroupId, HappyAgentSessionId> = new Map();
    // What `groupResume` was last resolved against. A transcript frame does not
    // change where a group resumes, and resolving every group's history on every
    // one of them would spend the whole list's projection to learn nothing.
    let groupResumeList: HappyAgentSessionListSnapshot | undefined;
    let groupResumeRevision = -1;
    let memoryRevision = 0;
    const snapshotStore = createStore<HappyAgentWorkspaceSnapshot>()(() => ({
        address: addressPublic(),
        list: list.get(),
        conversation,
        conversationDelegated: false,
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
        fileTabs,
        recentTabs: client.memory.recentTabsRead(),
        tabOrder,
        groupResume,
        openInTargets,
        fileViewMode,
        fileViewWrap,
        fileScope: "changed",
        slices: SLICES_NONE,
        fileLayout: HAPPY_AGENT_FILE_LAYOUT_DEFAULT,
        fileSearch: FILE_SEARCH_IDLE,
        fileComments: FILE_COMMENTS_IDLE,
        reviews: new Map(),
        fileTreeExpanded,
        fileTreeCollapsed,
        workspaceFilesLoading,
        projectAdd,
        ...(projectClone ? { projectClone } : {}),
    }));

    const notify = (): void => {
        for (const listener of listeners) listener();
    };
    /**
     * True while the snapshot is being replaced without an announcement.
     * Stopping rebuilds the published snapshot for a surface that is no longer
     * watching, and disposal can run while subscribers still exist; neither has
     * ever notified, so the store's own subscription is gated rather than the
     * behavior changed.
     */
    let snapshotSilent = false;
    const unsubscribeSnapshot = snapshotStore.subscribe(() => {
        if (!snapshotSilent) notify();
    });

    /**
     * Depth of a change made of several steps. Moving a file across the window
     * is one act built from two — opened on the far side, closed on this one —
     * and a subscriber that saw the middle of it would see the file in both
     * places at once, or in neither. So the steps are taken with the store
     * silent and one snapshot is published when they are all done.
     */
    let composing = 0;
    const compose = (act: () => void): void => {
        composing += 1;
        try {
            act();
        } finally {
            composing -= 1;
        }
        recompute();
    };

    const conversationProject = (
        chat: HappyAgentChatSnapshot,
        draft: ComposerSnapshot,
        /** Stands in only until this session states its own; see `recompute`. */
        pendingMenus: HappyAgentMenusSnapshot | undefined,
    ): HappyAgentConversationSnapshot => {
        const activityAvailable =
            chat.goal !== undefined ||
            chat.tasks.length > 0 ||
            chat.subagents.length > 0 ||
            chat.detachedBackgroundProcessIds.size > 0;
        return {
            conversationId: chat.sessionId,
            ready: chat.ready,
            session: chat.session,
            ...(chat.title ? { title: chat.title } : {}),
            ...(chat.cwd ? { subtitle: chat.cwd } : {}),
            entries: chat.entries,
            composer: draft,
            running: chat.runStatus === "running",
            workingPhase: chat.workingPhase,
            ...(chat.workingLabel !== undefined ? { workingLabel: chat.workingLabel } : {}),
            ...(chat.workingWait !== undefined ? { workingWait: chat.workingWait } : {}),
            ...(chat.runStartedAt !== undefined ? { runStartedAt: chat.runStartedAt } : {}),
            ...(chat.turnElapsedMs !== undefined ? { turnElapsedMs: chat.turnElapsedMs } : {}),
            transcriptComplete: chat.transcriptComplete,
            loadingMore: chat.loadingMore,
            ...(chat.loadMoreError ? { loadMoreError: chat.loadMoreError } : {}),
            queuedMessages: chat.queuedMessages,
            requestSubmissions: chat.requestSubmissions,
            requestSelections: chat.requestSelections,
            tasks: chat.tasks,
            ...(chat.goal ? { goal: chat.goal } : {}),
            subagents: chat.subagents,
            backgroundProcesses: chat.backgroundProcesses,
            detachedBackgroundProcessIds: chat.detachedBackgroundProcessIds,
            activityAvailable,
            showReasoning: chat.showReasoning,
            expandedTurnIds: chat.expandedTurnIds,
            ...(chat.usage ? { usage: chat.usage } : {}),
            usageLoading: chat.usageLoading,
            ...(chat.usageError !== undefined ? { usageError: chat.usageError } : {}),
            ...(chat.contextGauge ? { contextGauge: chat.contextGauge } : {}),
            activityPanelOpen: chat.activityPanelOpen,
            ...(chat.openImage ? { openImage: chat.openImage } : {}),
            ...(chat.menus ? { menus: chat.menus } : pendingMenus ? { menus: pendingMenus } : {}),
            modelLocked: chat.modelLocked,
            ...(scrollPositions.has(chat.sessionId)
                ? { scrollPosition: scrollPositions.get(chat.sessionId)! }
                : {}),
        };
    };

    /** The sessions a group holds right now, in list order, or none while it is not ready. */
    const groupConversationIdList = (groupId: HappyAgentGroupId): readonly string[] => {
        const projects = list.get().projects;
        if (projects.type !== "ready") return [];
        for (const project of projects.value) {
            if (project.id === groupId) return project.conversations.map((summary) => summary.id);
            const worktree = project.worktrees.find((candidate) => candidate.id === groupId);
            if (worktree) return worktree.conversations.map((summary) => summary.id);
        }
        return [];
    };

    /** The sessions a group holds right now, or none while the list is not ready. */
    const groupConversationIds = (groupId: HappyAgentGroupId): ReadonlySet<string> =>
        new Set(groupConversationIdList(groupId));

    /**
     * One group's tab strip in the order it is shown. Tabs the reader has
     * dragged carry a fractional order key and sort by it; everything else
     * follows in the order it arrived, which is what puts a newly opened tab
     * last without anything having to be written down for it.
     *
     * The keys are this client's own. The daemon orders sessions, but the strip
     * holds sessions and files together and will hold more than that, so an
     * order it can only see part of could never be the one on screen.
     */
    const groupTabOrderCompute = (groupId: HappyAgentGroupId | undefined): readonly string[] => {
        if (groupId === undefined) return [];
        const arrival = [
            ...groupConversationIdList(groupId),
            // The whole change, where it is open. It belongs to the checkout the
            // same way a file of it does, so it is arranged in the same strip.
            ...(reviews.has(groupId) ? [reviewIdOf(groupId)] : []),
            ...fileTabs
                .filter((tab) => tab.groupId === groupId && tab.placement === "main")
                .map((tab) => tab.id),
            // A terminal or a page the reader moved out of the panel is in this
            // strip too, and is arranged in it like everything else. The panel
            // lists only the addressed group's tabs, so it can answer for that
            // group and no other.
            ...(groupId === addressedGroupId
                ? panel
                      .get()
                      .tabs.filter((tab) => tab.placement === "main")
                      .map((tab) => tab.id)
                : []),
        ];
        const order = client.memory.groupRead(groupId)?.order;
        if (!order) return arrival;
        const keyed = arrival.filter((id) => order[id] !== undefined);
        keyed.sort((left, right) => {
            const leftKey = order[left]!;
            const rightKey = order[right]!;
            if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
            return left < right ? -1 : 1;
        });
        return [...keyed, ...arrival.filter((id) => order[id] === undefined)];
    };

    /**
     * Resolves each group's remembered tabs against the sessions it still has,
     * answering with the session focusing that group should open. A file tab
     * resolves to the session it was read in, which is the session its content
     * belongs to; opening that group reopens the file over it.
     */
    const groupResumeCompute = (): ReadonlyMap<HappyAgentGroupId, HappyAgentSessionId> => {
        const listSnapshot = list.get();
        if (groupResumeList === listSnapshot && groupResumeRevision === memoryRevision)
            return groupResume;
        groupResumeList = listSnapshot;
        groupResumeRevision = memoryRevision;
        const projects = listSnapshot.projects;
        const next = new Map<HappyAgentGroupId, HappyAgentSessionId>();
        const resolve = (
            groupId: HappyAgentGroupId,
            conversationIds: ReadonlySet<string>,
        ): void => {
            const memory = client.memory.groupRead(groupId);
            if (!memory) return;
            // Only sessions answer this question. A file tab is reopened by
            // `groupRestore` and shown over whatever conversation the group
            // resumes on, so it is passed over here rather than standing in for
            // a session it no longer belongs to.
            for (const tabId of memory.history)
                if (conversationIds.has(tabId)) {
                    next.set(groupId, tabId as HappyAgentSessionId);
                    return;
                }
        };
        if (projects.type === "ready") {
            for (const project of projects.value) {
                resolve(project.id, new Set(project.conversations.map((summary) => summary.id)));
                for (const worktree of project.worktrees)
                    resolve(
                        worktree.id,
                        new Set(worktree.conversations.map((summary) => summary.id)),
                    );
            }
        }
        if (
            next.size === groupResume.size &&
            [...next].every(([groupId, sessionId]) => groupResume.get(groupId) === sessionId)
        )
            return groupResume;
        return next;
    };

    // Rebuilds the combined snapshot only when a component snapshot actually
    // changed, so `get()` stays referentially stable across no-op ticks.
    const recompute = (): void => {
        if (composing > 0) return;
        const listSnapshot = list.get();
        groupResume = groupResumeCompute();
        const nextTabOrder = groupTabOrderCompute(addressedGroupId);
        // The strip keeps its identity across ticks that did not move anything,
        // so a transcript frame does not re-render every tab in it.
        if (
            nextTabOrder.length !== tabOrder.length ||
            nextTabOrder.some((id, index) => tabOrder[index] !== id)
        )
            tabOrder = nextTabOrder;
        const chat = chatStore?.get();
        const draft = composer?.getState();
        const conversationDelegated = openId !== undefined && list.sessionDelegated(openId);
        // A failed acquisition stays failed until something retries it; the
        // composer must not paint over the error the reader has to act on.
        if (draft && openId && conversation.type !== "error") {
            const models = client.models.get();
            /* Until a session states its own selection, the machine's default
               stands in for it — which is honest for a conversation this reader
               writes into, because it is what a message sent right now would
               use, and false for a delegated one. That chat's model, reasoning,
               access mode, and speed belong to the runner that started it, so it
               shows nothing rather than another session's model until its own
               arrives. */
            const pendingMenus =
                conversationDelegated || models.type !== "ready" ? undefined : models.menus;
            const next = chat
                ? conversationProject(chat, draft, pendingMenus)
                : conversationAcquiring(
                      openId,
                      draft,
                      conversationSummaryFind(openId),
                      pendingMenus,
                  );
            if (conversation.type !== "ready" || !conversationEqual(conversation.value, next)) {
                conversation = { type: "ready", value: next };
            }
        }
        const groupComposerDraft = groupComposer?.getState();
        const groupSessionDraft = groupDraft?.get();
        botCreateCompose();
        const nextAddress = addressPublic();
        const recentTabs = client.memory.recentTabsRead();
        // How this checkout is arranged travels with the address: moving to
        // another project shows that project the way it was left, rather than
        // carrying the last one's panel width and listing across to it.
        const nextView = groupView(nextAddress.groupId);
        const nextSlices = slices ?? SLICES_NONE;
        const nextSlice = sliceResolve(nextSlices, nextView.sliceId);
        // A remembered slice scope over a checkout with nothing to slice by
        // shows the changes: an empty listing would say the checkout is clean.
        const preferredScope = nextView.fileScope ?? "changed";
        const nextFileScope =
            preferredScope === "slice" && nextSlice === undefined ? "changed" : preferredScope;
        // The daemon's all-files contract is a lazy directory tree. Flattening
        // it would require recursively opening every directory before the first
        // row could be truthful, which turns one panel open into a request storm.
        const nextFileLayout =
            nextFileScope === "all"
                ? "tree"
                : (nextView.fileLayout ?? HAPPY_AGENT_FILE_LAYOUT_DEFAULT);
        const nextPanelWidth = nextView.panelWidth;
        // Recomputed here rather than remembered: it is derived from the same
        // list snapshot this projection is built from, so it cannot lag behind
        // the rows it describes. The panel is told too, since a shell is started
        // from there and the checkout may have gone away while it was open.
        const groupAccess = happyAgentGroupAccessOf(
            openGroupWorkRefusal(),
            openGroupConversationRefusal(),
        );
        if (groupAccess.writeRefusal !== panel.get().terminalRefusal)
            panel.scopeApply(addressedGroupId, openId, groupAccess.writeRefusal);
        // The panel's file is not a second thing to keep in step: it is the one
        // member of the strip placed there, found rather than mirrored.
        const panelFile = fileTabs.find((tab) => tab.placement === "panel");
        // Returning the previous snapshot keeps its identity and announces
        // nothing; a changed one replaces it wholesale and the store's own
        // subscription is what notifies.
        snapshotStore.setState(
            (snapshot) =>
                snapshot.address === nextAddress &&
                snapshot.groupAccess.writeRefusal === groupAccess.writeRefusal &&
                snapshot.groupAccess.conversationRefusal === groupAccess.conversationRefusal &&
                snapshot.list === listSnapshot &&
                snapshot.conversationDelegated === conversationDelegated &&
                snapshot.conversation === conversation &&
                snapshot.groupComposer === groupComposerDraft &&
                snapshot.groupSessionDraft === groupSessionDraft &&
                snapshot.fileTabs === fileTabs &&
                snapshot.recentTabs === recentTabs &&
                snapshot.tabOrder === tabOrder &&
                snapshot.activeMainViewId === activeMainViewId &&
                snapshot.displayedMainViewId === displayedMainViewId &&
                snapshot.panelFile === panelFile &&
                snapshot.groupResume === groupResume &&
                snapshot.openInTargets === openInTargets &&
                snapshot.openInRecent === openInRecent &&
                snapshot.rename === rename &&
                snapshot.projectArchive === projectArchive &&
                snapshot.groupArchive === groupArchive &&
                snapshot.projectCompute === projectCompute &&
                snapshot.fileViewMode === fileViewMode &&
                snapshot.fileViewWrap === fileViewWrap &&
                snapshot.fileScope === nextFileScope &&
                snapshot.slices === nextSlices &&
                snapshot.slice === nextSlice &&
                snapshot.fileLayout === nextFileLayout &&
                snapshot.fileSearch === fileSearch &&
                snapshot.fileComments === fileComments &&
                snapshot.reviews === reviews &&
                snapshot.panelWidth === nextPanelWidth &&
                snapshot.fileTreeExpanded === fileTreeExpanded &&
                snapshot.fileTreeCollapsed === fileTreeCollapsed &&
                snapshot.workspaceFiles === workspaceFiles &&
                snapshot.workspaceFilesLoading === workspaceFilesLoading &&
                snapshot.botCreate === botCreate &&
                snapshot.projectAdd === projectAdd &&
                snapshot.projectClone === projectClone
                    ? snapshot
                    : {
                          address: nextAddress,
                          list: listSnapshot,
                          conversation,
                          conversationDelegated,
                          groupAccess,
                          fileTabs,
                          recentTabs,
                          tabOrder,
                          groupResume,
                          openInTargets,
                          fileViewMode,
                          fileViewWrap,
                          fileScope: nextFileScope,
                          slices: nextSlices,
                          ...(nextSlice === undefined ? {} : { slice: nextSlice }),
                          fileLayout: nextFileLayout,
                          fileSearch,
                          fileComments,
                          reviews,
                          ...(nextPanelWidth === undefined ? {} : { panelWidth: nextPanelWidth }),
                          fileTreeExpanded,
                          fileTreeCollapsed,
                          ...(workspaceFiles ? { workspaceFiles } : {}),
                          ...(openInRecent ? { openInRecent } : {}),
                          workspaceFilesLoading,
                          projectAdd,
                          ...(projectClone ? { projectClone } : {}),
                          ...(botCreate ? { botCreate } : {}),
                          ...(activeMainViewId ? { activeMainViewId } : {}),
                          ...(displayedMainViewId ? { displayedMainViewId } : {}),
                          ...(panelFile ? { panelFile } : {}),
                          ...(groupComposerDraft ? { groupComposer: groupComposerDraft } : {}),
                          ...(groupSessionDraft ? { groupSessionDraft } : {}),
                          ...(rename ? { rename } : {}),
                          ...(projectArchive ? { projectArchive } : {}),
                          ...(groupArchive ? { groupArchive } : {}),
                          ...(projectCompute ? { projectCompute } : {}),
                      },
            true,
        );
    };

    /** Commits already-ready bytes in the same state action that selects their tab. */
    const fileReadyDisplay = (tabId: string): void => {
        const file = fileTabs.find((tab) => tab.id === tabId);
        if (
            file === undefined ||
            file.placement !== "main" ||
            activeMainViewId !== tabId ||
            file.document.type !== "ready"
        )
            return;
        const document = file.document.value;
        displayedMainViewId = tabId;
        if (
            file.displayedPresentationId === file.presentationId &&
            file.displayedDocument === document &&
            file.displayedKind === file.kind &&
            file.displayedPath === file.path
        )
            return;
        fileTabs = fileTabs.map((tab) =>
            tab.id === tabId
                ? {
                      ...tab,
                      displayedDocument: document,
                      displayedKind: file.kind,
                      displayedPath: file.path,
                      displayedPresentationId: file.presentationId,
                  }
                : tab,
        );
    };

    /**
     * The strip holds tabs the panel owns, so what the panel does to one reaches
     * this snapshot: a page moved into the main content joins the order, and one
     * closed there leaves it. The panel notifies on its own changes only, so
     * this cannot loop back into it.
     */
    const unsubscribePanel = panel.subscribe(() => {
        if (disposed) return;
        // A tool tab the main content was showing can end from the panel's own
        // side — its shell exits, or it is closed — and the main content must
        // not go on naming a view that is gone.
        //
        // Only while its own group is the addressed one, though. The panel lists
        // one group at a time, so a tool belonging to a project the reader has
        // navigated away from is absent rather than ended, and clearing then
        // would mean coming back to that project no longer showed what was left
        // on screen in it. A file tab is this store's own and carries its own
        // group, so it is never in question here.
        if (
            activeMainViewId !== undefined &&
            activeMainViewGroupId !== undefined &&
            activeMainViewGroupId === addressedGroupId &&
            !fileTabs.some((tab) => tab.id === activeMainViewId && tab.placement === "main") &&
            !panel.get().tabs.some((tab) => tab.id === activeMainViewId && tab.placement === "main")
        ) {
            if (displayedMainViewId === activeMainViewId) displayedMainViewId = undefined;
            activeMainViewId = undefined;
            activeMainViewGroupId = undefined;
            groupTabRemember(addressedGroupId, openId);
        }
        recompute();
    });

    /**
     * Loads the directories this checkout was left with, forgetting the last
     * one's entirely. These are remembered by path for the same reason a
     * selection is, and a path stops meaning anything at the checkout boundary:
     * `src` in one repository is not `src` in the next, so carrying the sets
     * across would not merely open the wrong folders — a directory closed here
     * would arrive in another repository already closed, and the listing there
     * would open half shut for no stated reason.
     */
    const fileTreeExpansionLoad = (groupId: HappyAgentGroupId | undefined): void => {
        const view = groupView(groupId);
        fileTreeExpanded = new Set(view.fileTreeOpened ?? []);
        fileTreeCollapsed = new Set(view.fileTreeClosed ?? []);
    };

    /**
     * Ends the search when the listing stops being about the same checkout. A
     * query is about the files in front of the reader, and carrying it to
     * another project would filter that project by what was wanted from this
     * one. Any answer still in flight is retired with it.
     */
    const fileSearchReset = (): void => {
        fileSearchGeneration += 1;
        fileSearch = FILE_SEARCH_IDLE;
    };

    /** Review notes belong to the checkout they were written about. */
    const fileCommentsReset = (): void => {
        fileComments = FILE_COMMENTS_IDLE;
        fileCommentsProject();
    };

    /** Whether two projections of the notes say the same thing in the same order. */
    const commentsSame = (
        left: readonly ComposerReviewComment[],
        right: readonly ComposerReviewComment[],
    ): boolean =>
        left.length === right.length &&
        left.every((comment, index) => {
            const other = right[index];
            return (
                other !== undefined &&
                comment.path === other.path &&
                comment.lineNumber === other.lineNumber &&
                comment.side === other.side &&
                comment.text === other.text &&
                comment.stale === other.stale
            );
        });

    /** The notes as the one chip a draft carries them in, or nothing to carry. */
    const fileCommentsAttachments = (): readonly ComposerAttachment[] =>
        fileComments.comments.length === 0
            ? []
            : [
                  {
                      kind: "reviewComments",
                      id: HAPPY_AGENT_REVIEW_COMMENTS_ATTACHMENT_ID,
                      comments: happyAgentCommentsAttach(fileComments.comments),
                  },
              ];

    /**
     * Keeps the draft's chip saying what the notes say.
     *
     * The notes live here, with the change they are about, because that is what
     * the diff draws them under. The chip is how the same notes appear where
     * they are going to be sent from, so it is written from them every time
     * they change rather than kept alongside them.
     */
    const fileCommentsProject = (): void => {
        const target = groupComposer ?? composer;
        if (target === undefined) return;
        const waiting = target
            .getState()
            .attachments.find(
                (attachment) => attachment.id === HAPPY_AGENT_REVIEW_COMMENTS_ATTACHMENT_ID,
            );
        const next = fileCommentsAttachments()[0];
        if (next === undefined) {
            if (waiting) commentsWrite(() => target.getState().attachmentRemove(waiting.id));
            return;
        }
        if (
            waiting?.kind === "reviewComments" &&
            next.kind === "reviewComments" &&
            commentsSame(waiting.comments, next.comments)
        )
            return;
        commentsWrite(() => {
            if (waiting) target.getState().attachmentRemove(waiting.id);
            target.getState().attachmentAdd(next);
        });
    };

    /**
     * Runs one write of the chip without hearing it back as the reader dropping
     * it. Replacing the chip removes the old one first, and that removal is this
     * store's own doing rather than the reader saying they are done with the
     * notes — which is what dropping the chip means, and what it still means
     * whenever this is not running.
     */
    const commentsWrite = (write: () => void): void => {
        commentsProjecting = true;
        try {
            write();
        } finally {
            commentsProjecting = false;
        }
    };

    /**
     * The reader dropped the chip, so the notes are dropped with it. A note
     * exists to become a request; taking the request out of the draft is saying
     * that request is not going, and leaving the notes drawn on the diff would
     * make that a lie the next send would tell.
     */
    const fileCommentsDrop = (attachmentId: string): void => {
        if (commentsProjecting || attachmentId !== HAPPY_AGENT_REVIEW_COMMENTS_ATTACHMENT_ID)
            return;
        if (fileComments.comments.length === 0) return;
        fileComments = { ...fileComments, comments: [] };
        recompute();
    };

    /**
     * The notes went with a message that was sent, so they are spent.
     *
     * The draft that carried them clears itself on confirmation, but a send
     * from a group opens the conversation it created before it returns, and
     * that new draft was built while the notes were still waiting. Projecting
     * again is what takes the spent chip back out of it.
     */
    const fileCommentsSpend = (attachments: readonly ComposerAttachment[]): void => {
        if (!attachments.some((attachment) => attachment.kind === "reviewComments")) return;
        if (fileComments.comments.length === 0) return;
        fileComments = { ...fileComments, comments: [] };
        fileCommentsProject();
        recompute();
    };

    /**
     * Marks the notes on changed paths as written against older text.
     *
     * Deliberately a statement and not a repair. Once the bytes move, where a
     * commented line went is a question only a diff of the two versions could
     * answer, and answering it by guessing is how a note ends up confidently
     * attached to code nobody meant. A note that knows it is stale can still be
     * sent — it carries the caveat with it.
     */
    const fileCommentsStale = (paths: readonly string[] | null): void => {
        if (fileComments.comments.length === 0) return;
        const changed = paths === null ? undefined : new Set(paths);
        const affected = (path: string): boolean => changed === undefined || changed.has(path);
        let touched = false;
        const comments = fileComments.comments.map((comment) => {
            if (comment.stale || !affected(comment.anchor.path)) return comment;
            touched = true;
            return { ...comment, stale: true };
        });
        if (!touched) return;
        fileComments = { ...fileComments, comments };
        // The caveat travels with the note, so the chip is rewritten for it.
        fileCommentsProject();
    };

    /**
     * Sets what is being looked for and, where the answer has to come from the
     * daemon, asks for it. Only All Files does: Changes is already whole in
     * memory and is filtered where its rows are built, so a query there is
     * recorded and nothing is fetched for it.
     *
     * Does not `recompute` — the caller publishes, because switching scope
     * changes more than the search and should announce once.
     */
    const fileSearchApply = (query: string): void => {
        // A later query retires whatever an earlier one is still waiting for,
        // so a slow answer to an abandoned prefix cannot land on a newer one.
        const generation = ++fileSearchGeneration;
        const groupId = addressedGroupId;
        const ask = query !== "" && groupId !== undefined && fileScopeOf(groupId) === "all";
        fileSearch = { query, searching: ask };
        if (!ask || groupId === undefined) return;
        void client.filesSearch(groupId, query, FILE_SEARCH_LIMIT).then(
            (results) => {
                if (generation !== fileSearchGeneration) return;
                fileSearch = { query, results, searching: false };
                recompute();
            },
            () => {
                // A refused search leaves the query showing with no claim about
                // what it matched, which is the honest answer: an empty result
                // list would say the checkout holds nothing by that name.
                if (generation !== fileSearchGeneration) return;
                fileSearch = { query, searching: false };
                recompute();
            },
        );
    };

    const fileChangeFind = (
        groupId: HappyAgentGroupId,
        path: string,
    ): HappyAgentGitChangedFile | undefined => {
        const projects = list.get().projects;
        if (projects.type !== "ready") return undefined;
        for (const project of projects.value) {
            if (project.id === groupId)
                return project.changes?.find((change) => change.path === path);
            const worktree = project.worktrees.find((candidate) => candidate.id === groupId);
            if (worktree) return worktree.changes?.find((change) => change.path === path);
        }
        return undefined;
    };

    /** Every changed file in one checkout, as the live Git snapshot has them. */
    const groupChangesRead = (
        groupId: HappyAgentGroupId,
    ): readonly HappyAgentGitChangedFile[] | undefined => {
        const projects = list.get().projects;
        if (projects.type !== "ready") return undefined;
        for (const project of projects.value) {
            if (project.id === groupId) return project.changes;
            const worktree = project.worktrees.find((candidate) => candidate.id === groupId);
            if (worktree) return worktree.changes;
        }
        return undefined;
    };

    /**
     * Resolves every ordinary source-file intent from the live catalog only.
     * A missing Git snapshot and an unchanged path both deliberately resolve to
     * the raw file; neither starts a Git read to discover a different answer.
     */
    const fileKindResolve = (
        groupId: HappyAgentGroupId,
        path: string,
        requestedKind: HappyAgentFileTabKind,
    ): HappyAgentFileTabKind => {
        if (requestedKind === "media" || requestedKind === "document") return requestedKind;
        return fileChangeFind(groupId, path) === undefined ? "file" : "diff";
    };

    const fileDocumentRead = (
        groupId: HappyAgentGroupId,
        path: string,
        kind: HappyAgentFileTabKind,
        change?: HappyAgentGitChangedFile,
    ): ((signal: AbortSignal) => Promise<HappyAgentFileDocument>) => {
        if (kind === "file" || kind === "document")
            return (signal) => client.workspaceFileRead(groupId, path, signal);
        if (kind === "media")
            return (signal) => client.workspaceFileBytesRead(groupId, path, signal);
        return (signal) =>
            change === undefined
                ? Promise.reject(new Error("That file is no longer changed."))
                : client.changedFileRead(groupId, path, change, signal);
    };

    const filePreprocessLoadPump = (): void => {
        while (
            active &&
            filePreprocessLoadsActive < HAPPY_AGENT_FILE_PREPROCESS_MAX_CONCURRENT_LOADS &&
            filePreprocessQueue.length > 0
        ) {
            const warm = filePreprocessQueue.shift()!;
            filePreprocessLoadsActive += 1;
            const owner = `file-preprocess\u0000${warm.cacheBaseKey}`;
            const request = fileLoadRequestAcquire(
                owner,
                warm.cacheBaseKey,
                fileDocumentRead(warm.groupId, warm.path, warm.kind, warm.change),
            );
            const finish = (): void => {
                fileLoadRequestRelease(owner, request);
                if (warm.generation !== filePreprocessGeneration) return;
                filePreprocessLoadsActive = Math.max(0, filePreprocessLoadsActive - 1);
                filePreprocessLoadPump();
            };
            void request.promise.then((document) => {
                const currentKind = fileKindResolve(warm.groupId, warm.path, warm.kind);
                const currentRevision = fileChangeFind(warm.groupId, warm.path)?.revision ?? "";
                if (
                    warm.generation === filePreprocessGeneration &&
                    currentKind === warm.kind &&
                    currentRevision === warm.revision
                )
                    readyDocumentCacheWrite(warm.cacheBaseKey, document);
                finish();
            }, finish);
        }
    };

    const filePreprocessEnqueue = (
        groupId: HappyAgentGroupId,
        path: string,
        requestedKind: HappyAgentFileTabKind,
    ): void => {
        if (!active || disposed) return;
        const kind = fileKindResolve(groupId, path, requestedKind);
        const change = kind === "diff" ? fileChangeFind(groupId, path) : undefined;
        const revision = change?.revision ?? "";
        const cacheBaseKey = happyAgentReadyDocumentCacheBaseKey(groupId, path, kind, revision);
        if (readyDocumentCacheRead(cacheBaseKey) !== undefined) return;
        if (fileLoadRequests.has(cacheBaseKey)) return;
        const queued = filePreprocessQueue.findIndex(
            (candidate) => candidate.cacheBaseKey === cacheBaseKey,
        );
        if (queued >= 0) filePreprocessQueue.splice(queued, 1);
        filePreprocessQueue.unshift({
            cacheBaseKey,
            ...(change === undefined ? {} : { change }),
            generation: filePreprocessGeneration,
            groupId,
            kind,
            path,
            revision,
        });
        filePreprocessLoadPump();
    };

    /** Drops warmed diffs as soon as their in-memory Git identity moves on. */
    const readyDocumentCacheReconcileGit = (): void => {
        for (const [key, entry] of readyDocumentCache) {
            const [groupIdValue, path, kind] = entry.baseKey.split("\u0000");
            if (groupIdValue === undefined || path === undefined || kind !== "diff") continue;
            const groupId = groupIdValue as HappyAgentGroupId;
            const change = fileChangeFind(groupId, path);
            const currentBaseKey =
                change === undefined
                    ? undefined
                    : happyAgentReadyDocumentCacheBaseKey(groupId, path, "diff", change.revision);
            if (entry.baseKey === currentBaseKey) continue;
            readyDocumentCache.delete(key);
            readyDocumentCacheWeight -= entry.weight;
        }
        filePreprocessQueue = filePreprocessQueue.filter((warm) => {
            const currentKind = fileKindResolve(warm.groupId, warm.path, warm.kind);
            const currentRevision = fileChangeFind(warm.groupId, warm.path)?.revision ?? "";
            return currentKind === warm.kind && currentRevision === warm.revision;
        });
    };

    /**
     * Writes one group's tab memory: the tab now being read moves to the front
     * of its history, and the group's open files are recorded as they stand.
     * Entries for sessions the group no longer has are dropped once the list is
     * ready to say so, so a closed session falls out of the memory instead of
     * shadowing the tab behind it forever.
     */
    const groupTabRemember = (groupId: HappyAgentGroupId, tabId: string | undefined): void => {
        if (restoring) return;
        memoryRevision += 1;
        const previous = client.memory.groupRead(groupId);
        // A preview is remembered like any other tab: closing the window is not
        // a decision to throw the file away, and it comes back as the preview it
        // was rather than as a tab the reader never asked to keep.
        const files = fileTabs
            .filter((tab) => tab.groupId === groupId && tab.placement === "main")
            .map((tab) => ({
                path: tab.path,
                kind: tab.kind,
                ...(tab.preview ? { preview: true } : {}),
            }));
        const conversationIds = groupConversationIds(groupId);
        const fileTabIds = new Set(files.map((file) => fileTabIdOf(groupId, file.path)));
        const known = (id: string): boolean =>
            conversationIds.size === 0 || conversationIds.has(id) || fileTabIds.has(id);
        const history = [
            ...(tabId === undefined ? [] : [tabId]),
            ...(previous?.history ?? []).filter((id) => id !== tabId && known(id)),
        ].slice(0, TAB_HISTORY_LIMIT);
        const activeTabId = tabId ?? previous?.activeTabId;
        // An unsent draft is remembered on its own account: a group with no tabs
        // and no files is still worth remembering when somebody has typed into
        // it and not sent it.
        client.memory.groupTabsWrite(groupId, {
            ...(activeTabId ? { activeTabId } : {}),
            history,
            files,
        });
    };

    /** Drops one tab from a group's memory, for a tab that has just been closed. */
    const groupTabForget = (groupId: HappyAgentGroupId, tabId: string): void => {
        memoryRevision += 1;
        const previous = client.memory.groupRead(groupId);
        if (!previous) return;
        const history = previous.history.filter((id) => id !== tabId);
        const files = previous.files.filter((file) => fileTabIdOf(groupId, file.path) !== tabId);
        client.memory.groupTabsWrite(groupId, {
            ...(previous.activeTabId && previous.activeTabId !== tabId
                ? { activeTabId: previous.activeTabId }
                : {}),
            history,
            files,
        });
    };

    /**
     * Reopens the files a group was left with, the first time that group is
     * addressed in this run, and selects the tab it was left on when that tab was
     * one of them. It waits for the session list, since a file belongs to a
     * session and a group whose sessions are unknown cannot say which of its
     * remembered files still have one.
     */
    const groupRestore = (groupId: HappyAgentGroupId): void => {
        if (restoredGroupIds.has(groupId)) return;
        const conversationIds = groupConversationIds(groupId);
        if (conversationIds.size === 0) return;
        restoredGroupIds.add(groupId);
        const memory = client.memory.groupRead(groupId);
        if (!memory || memory.files.length === 0) return;
        const activeBeforeRestore = activeMainViewId;
        const activeGroupBeforeRestore = activeMainViewGroupId;
        const displayedBeforeRestore = displayedMainViewId;
        restoring = true;
        try {
            for (const file of memory.files) {
                if (fileTabs.some((tab) => tab.id === fileTabIdOf(groupId, file.path))) continue;
                fileTabOpen(groupId, file.path, file.kind, file.preview === true);
            }
        } finally {
            restoring = false;
        }
        // Reopening moved the selection through every restored file. It may
        // choose the remembered one only while navigation has not already
        // named a session or file. A deep link can arrive before the catalog;
        // its delayed restore must not cover that explicit destination later.
        if (openId === undefined && activeBeforeRestore === undefined) {
            activeMainViewId =
                memory.activeTabId && fileTabs.some((tab) => tab.id === memory.activeTabId)
                    ? memory.activeTabId
                    : undefined;
            activeMainViewGroupId = undefined;
        } else {
            activeMainViewId = activeBeforeRestore;
            activeMainViewGroupId = activeGroupBeforeRestore;
            displayedMainViewId = displayedBeforeRestore;
        }
    };

    const fileTabCacheStore = (tab: HappyAgentFileTabSnapshot): void => {
        if (
            tab.draft !== undefined ||
            tab.document.type !== "ready" ||
            tab.revalidating ||
            tab.revalidationError !== undefined
        )
            return;
        const identity = fileTabLoadedIdentities.get(tab.id);
        if (identity === undefined) return;
        readyDocumentCacheWrite(
            identity.baseKey,
            happyAgentFileDocumentCanonical(tab.document.value),
            identity.hash,
        );
    };

    /** Stops pending work for a file tab that is being closed or replaced. */
    const fileTabRelease = (tabId: string): void => {
        fileLoadGenerations.delete(tabId);
        fileTabLoadedIdentities.delete(tabId);
        fileTabRevalidations.delete(tabId);
        fileLoadRequestRelease(tabId);
    };

    /**
     * Asks the host where one HTML file is served as a page and puts that
     * address on its tab.
     *
     * It is a separate request from reading the file because the two answer
     * different questions: the text is what the reader edits, the address is
     * where the rendered page loads from, and the source view must not wait on
     * the page. A failure is kept on the tab rather than dropped, because a tab
     * with neither an address nor a reason is a rendered face that waits for
     * ever; the source view is unaffected either way.
     */
    const filePreviewAddressResolve = (
        tabId: string,
        generation: number,
        tab: HappyAgentFileTabSnapshot,
    ): void => {
        const settle = (resolved: { url: string } | { error: string }): void => {
            if (disposed || fileLoadGenerations.get(tabId) !== generation) return;
            fileTabs = fileTabs.map((candidate) =>
                candidate.id === tabId
                    ? "url" in resolved
                        ? { ...candidate, previewUrl: resolved.url, previewError: undefined }
                        : { ...candidate, previewUrl: undefined, previewError: resolved.error }
                    : candidate,
            );
            recompute();
        };
        void client.htmlPreviewOpen(tab.groupId, tab.path).then(
            (url) => settle({ url }),
            // The reader still has the file; only its rendered face is
            // unavailable, and the surface says why without a failed tab.
            (error: unknown) => settle({ error: happyAgentUserError(error).message }),
        );
    };

    const fileLoad = (
        tabId: string,
        revision: string,
        presentationId = filePresentationIdNext(),
    ): void => {
        const before = fileTabs.find((tab) => tab.id === tabId);
        if (!before) return;
        const generation = (fileLoadGenerations.get(tabId) ?? 0) + 1;
        fileLoadGenerations.set(tabId, generation);
        const cacheBaseKey = happyAgentReadyDocumentCacheBaseKey(
            before.groupId,
            before.path,
            before.kind,
            revision,
        );
        const cachedEntry = readyDocumentCacheRead(cacheBaseKey);
        const cached = cachedEntry?.document;
        if (cachedEntry) {
            fileTabLoadedIdentities.set(tabId, cachedEntry.identity);
        } else if (fileTabLoadedIdentities.get(tabId)?.baseKey !== cacheBaseKey) {
            fileTabLoadedIdentities.delete(tabId);
        }
        const existingReady =
            before.document.type === "ready" &&
            (before.kind === "media"
                ? "contentType" in before.document.value
                : before.kind === "file" || before.kind === "document"
                  ? "content" in before.document.value
                  : "oldContent" in before.document.value);
        const document = cached
            ? { type: "ready" as const, value: cached }
            : existingReady
              ? before.document
              : { type: "loading" as const };
        const loading = document.type !== "ready";
        const revalidating = cachedEntry === undefined && document.type === "ready";
        if (revalidating) fileTabRevalidations.set(tabId, { revision });
        else fileTabRevalidations.delete(tabId);
        const documentSame =
            document.type === "ready"
                ? before.document.type === "ready" && before.document.value === document.value
                : before.document.type === "loading";
        const displayReady =
            document.type === "ready" && before.placement === "main" && activeMainViewId === tabId;
        if (displayReady) displayedMainViewId = tabId;
        if (
            before.revision !== revision ||
            before.loading !== loading ||
            before.revalidating !== revalidating ||
            before.revalidationError !== undefined ||
            !documentSame
        ) {
            fileTabs = fileTabs.map((tab) =>
                tab.id === tabId
                    ? {
                          ...tab,
                          revision,
                          document,
                          presentationId,
                          loading,
                          revalidating,
                          revalidationError: undefined,
                          ...(displayReady && document.type === "ready"
                              ? {
                                    displayedDocument: document.value,
                                    displayedKind: before.kind,
                                    displayedPath: before.path,
                                    displayedPresentationId: presentationId,
                                }
                              : {}),
                      }
                    : tab,
            );
            recompute();
        }
        if (cachedEntry !== undefined) {
            fileLoadRequestRelease(tabId);
            if (before.kind === "document") filePreviewAddressResolve(tabId, generation, before);
            return;
        }
        const change =
            before.kind === "diff" ? fileChangeFind(before.groupId, before.path) : undefined;
        const read = fileDocumentRead(before.groupId, before.path, before.kind, change);
        const request = fileLoadRequestAcquire(tabId, cacheBaseKey, read);
        if (before.kind === "document") filePreviewAddressResolve(tabId, generation, before);
        void request.promise.then(
            (document) => {
                const valid =
                    !disposed &&
                    fileLoadRequestOwns(tabId, request) &&
                    fileLoadGenerations.get(tabId) === generation &&
                    fileTabs.some((tab) => tab.id === tabId);
                if (!valid) {
                    fileLoadRequestRelease(tabId, request);
                    return;
                }
                const loaded = happyAgentFileDocumentCanonical(document);
                const current = fileTabs.find((tab) => tab.id === tabId);
                const settledPresentationId =
                    current?.document.type === "ready" &&
                    happyAgentReadyDocumentCacheKey(cacheBaseKey, current.document.value).key !==
                        happyAgentReadyDocumentCacheKey(cacheBaseKey, loaded).key
                        ? filePresentationIdNext()
                        : (current?.presentationId ?? presentationId);
                const identity = readyDocumentCacheWrite(cacheBaseKey, loaded);
                if (identity) fileTabLoadedIdentities.set(tabId, identity);
                else fileTabLoadedIdentities.delete(tabId);
                fileTabRevalidations.delete(tabId);
                fileLoadRequestRelease(tabId, request);
                const displayLoaded = current?.placement === "main" && activeMainViewId === tabId;
                if (displayLoaded) displayedMainViewId = tabId;
                fileTabs = fileTabs.map((tab) =>
                    tab.id === tabId
                        ? {
                              ...tab,
                              document: { type: "ready" as const, value: loaded },
                              presentationId: settledPresentationId,
                              loading: false,
                              revalidating: false,
                              revalidationError: undefined,
                              ...(displayLoaded
                                  ? {
                                        displayedDocument: loaded,
                                        displayedKind: tab.kind,
                                        displayedPath: tab.path,
                                        displayedPresentationId: settledPresentationId,
                                    }
                                  : {}),
                          }
                        : tab,
                );
                recompute();
            },
            (error: unknown) => {
                const valid =
                    !disposed &&
                    fileLoadRequestOwns(tabId, request) &&
                    fileLoadGenerations.get(tabId) === generation &&
                    fileTabs.some((tab) => tab.id === tabId);
                if (!valid) {
                    fileLoadRequestRelease(tabId, request);
                    return;
                }
                const current = fileTabs.find((tab) => tab.id === tabId);
                const currentReady = current?.document.type === "ready";
                const failure = happyAgentUserError(error);
                const identity = fileTabLoadedIdentities.get(tabId);
                if (identity?.baseKey === cacheBaseKey) fileTabLoadedIdentities.delete(tabId);
                fileTabRevalidations.delete(tabId);
                fileLoadRequestRelease(tabId, request);
                fileTabs = fileTabs.map((tab) =>
                    tab.id === tabId
                        ? currentReady
                            ? {
                                  ...tab,
                                  loading: false,
                                  revalidating: false,
                                  revalidationError: failure,
                              }
                            : {
                                  ...tab,
                                  document: { type: "error" as const, error: failure },
                                  loading: false,
                                  revalidating: false,
                                  revalidationError: undefined,
                              }
                        : tab,
                );
                recompute();
            },
        );
    };

    /**
     * Rebuilds an open review against the checkout's current changes, keeping
     * every document already read for a file whose bytes have not moved.
     *
     * The set of changed files is itself a moving thing: the agent adds one,
     * the reader reverts another. So the stream is recomputed from the live Git
     * snapshot rather than from what it held when it opened, and a file that
     * stopped being changed leaves it.
     */
    const reviewReconcile = (groupId: HappyAgentGroupId, moved: readonly string[] | null): void => {
        const open = reviews.get(groupId);
        if (open === undefined) return;
        // A rebuild is a different review from the one whose reads are in
        // flight: they answer for files at addresses that may no longer exist.
        reviewGenerations.set(
            reviewIdOf(groupId),
            (reviewGenerations.get(reviewIdOf(groupId)) ?? 0) + 1,
        );
        const changes = groupChangesRead(groupId) ?? [];
        const held = new Map(open.files.map((file) => [file.path, file]));
        const stale = (path: string): boolean => moved === null || moved.includes(path);
        const files = changes.map<HappyAgentReviewFile>((change) => {
            const previous = held.get(change.path);
            const read = previous?.document.type === "ready";
            const current = read && previous.revision === change.revision && !stale(change.path);
            return {
                path: change.path,
                ...(change.previousPath === undefined ? {} : { oldPath: change.previousPath }),
                status: change.status,
                revision: change.revision,
                // A file already read keeps what was read for it even when its
                // bytes have moved on: it is replaced when the new read lands,
                // rather than leaving a hole in the stream until then.
                document: read ? previous.document : { type: "unloaded" },
                ...(read && !current ? { stale: true as const } : {}),
            };
        });
        // What was said about a file belongs to that file. A file that has left
        // the change takes its mark with it, so a path that comes back is not
        // met by a decision made about an older version of it.
        const present = new Set(files.map((file) => file.path));
        const kept = (paths: ReadonlySet<string>): ReadonlySet<string> =>
            [...paths].every((path) => present.has(path))
                ? paths
                : new Set([...paths].filter((path) => present.has(path)));
        const presentation = reviewPresentationOf(changes);
        // A change read one file at a time keeps the reader where they were.
        // Where they were is a path, and a path that has left the change leaves
        // them at the file that took its place in the order.
        const was = open.files.findIndex((file) => file.path === open.activePath);
        const activePath =
            presentation === "stream"
                ? undefined
                : open.activePath !== undefined && present.has(open.activePath)
                  ? open.activePath
                  : (files[Math.min(Math.max(was, 0), Math.max(files.length - 1, 0))]?.path ??
                    files[0]?.path);
        // Written out rather than spread over the review it replaces: the file
        // on screen is named only while the change is read one file at a time,
        // and a stream that inherited a name would go on claiming one.
        const next: HappyAgentReview = {
            id: open.id,
            groupId: open.groupId,
            // A change that has grown past what one scroll holds, or shrunk
            // back inside it, is drawn a different way: what was on screen is
            // not what is going on screen, so it is waited for whole again.
            drawn: open.drawn && presentation === open.presentation,
            files,
            presentation,
            ...(activePath === undefined ? {} : { activePath }),
            collapsed: kept(open.collapsed),
            viewed: kept(open.viewed),
            loading: false,
        };
        reviews = new Map(reviews).set(groupId, reviewSettle(next));
        reviewLoad(groupId);
    };

    /**
     * Moves to the file before or after the one on screen, in a change being
     * read one file at a time.
     *
     * Said freely: a stream has no such step, and neither end of the change has
     * one past it.
     */
    const reviewFileStep = (groupId: HappyAgentGroupId, direction: -1 | 1): void => {
        const open = reviews.get(groupId);
        if (open === undefined || open.presentation !== "one-file") return;
        const at = open.files.findIndex((file) => file.path === open.activePath);
        const activePath = open.files[Math.max(at, 0) + direction]?.path;
        if (activePath === undefined) return;
        const next: HappyAgentReview = { ...open, activePath, loading: false };
        reviews = new Map(reviews).set(groupId, reviewSettle(next));
        reviewLoad(groupId);
        recompute();
    };

    /**
     * Closes every file in the review, or opens every one.
     *
     * Which it is, is the reader's to say rather than a guess from the current
     * mix: a review half closed has both answers, and only one of them is the
     * one being asked for.
     */
    const reviewFilesCollapsedSet = (groupId: HappyAgentGroupId, collapsedAll: boolean): void => {
        const open = reviews.get(groupId);
        if (open === undefined) return;
        reviews = new Map(reviews).set(groupId, {
            ...open,
            collapsed: collapsedAll ? new Set(open.files.map((file) => file.path)) : new Set(),
        });
        recompute();
    };

    /** Opens a closed file in the review, or closes an open one. */
    const reviewFileCollapsedToggle = (groupId: HappyAgentGroupId, path: string): void => {
        const open = reviews.get(groupId);
        if (open === undefined) return;
        const collapsed = new Set(open.collapsed);
        if (!collapsed.delete(path)) collapsed.add(path);
        reviews = new Map(reviews).set(groupId, { ...open, collapsed });
        recompute();
    };

    /**
     * Says a file has been reviewed, or takes that back.
     *
     * Marking one closes it, because saying "done with this" and still looking
     * at it is two different answers. Taking the mark off does not reopen it: a
     * reviewer correcting the record is not asking to read the file again, and
     * a file that sprang open under the pointer would move everything below it.
     */
    const reviewFileViewedToggle = (groupId: HappyAgentGroupId, path: string): void => {
        const open = reviews.get(groupId);
        if (open === undefined) return;
        const viewed = new Set(open.viewed);
        const marking = !viewed.delete(path);
        if (marking) viewed.add(path);
        const collapsed = marking ? new Set(open.collapsed).add(path) : open.collapsed;
        reviews = new Map(reviews).set(groupId, { ...open, viewed, collapsed });
        recompute();
    };

    /**
     * Reads again the files whose last read failed.
     *
     * A read that fails leaves its file with no diff to draw, and the stream
     * says so rather than quietly showing a change short of a file. This is what
     * saying "try again" there does.
     */
    const reviewRetry = (groupId: HappyAgentGroupId): void => {
        const open = reviews.get(groupId);
        if (open === undefined) return;
        if (!open.files.some((file) => file.document.type === "error")) return;
        const next: HappyAgentReview = {
            ...open,
            files: open.files.map((file) =>
                file.document.type === "error"
                    ? { ...file, document: { type: "unloaded" as const } }
                    : file,
            ),
            loading: false,
        };
        // A file nothing is going to draw is not something the review is
        // waiting for, so asking again does not leave it saying it is loading.
        reviews = new Map(reviews).set(groupId, reviewSettle(next));
        reviewLoad(groupId);
        recompute();
    };

    /**
     * Reads the files this review is going to draw and has not read yet.
     *
     * Only the ones nobody has asked about: a file already being read stays
     * being read, so stepping to it adds no second request. A read that lands
     * after the review it belonged to was rebuilt is dropped rather than
     * written into whatever the stream holds now.
     */
    const reviewLoad = (groupId: HappyAgentGroupId): void => {
        const id = reviewIdOf(groupId);
        const generation = reviewGenerations.get(id) ?? 0;
        const open = reviews.get(groupId);
        if (open === undefined) return;
        // Never read, or read before its bytes moved. A file already in flight
        // is neither, so stepping to it adds no second request.
        const asked = reviewRead(open).filter(
            (file) => file.document.type === "unloaded" || file.stale === true,
        );
        if (asked.length === 0) return;
        const reading = new Set(asked.map((file) => file.path));
        reviews = new Map(reviews).set(groupId, {
            ...open,
            files: open.files.map((file) => {
                if (!reading.has(file.path)) return file;
                // A file with something to show goes on showing it while it is
                // read again; only a file with nothing says it is loading.
                const { stale: _asked, ...rest } = file;
                return file.document.type === "ready"
                    ? rest
                    : { ...rest, document: { type: "loading" as const } };
            }),
        });
        for (const file of asked) {
            const change = fileChangeFind(groupId, file.path);
            const settle = (document: Loadable<HappyAgentChangedFileDocument>): void => {
                if (reviewGenerations.get(id) !== generation) return;
                const current = reviews.get(groupId);
                if (current === undefined) return;
                const files = current.files.map((candidate) => {
                    if (candidate.path !== file.path || candidate.revision !== file.revision)
                        return candidate;
                    const { stale: _answered, ...rest } = candidate;
                    return { ...rest, document };
                });
                reviews = new Map(reviews).set(groupId, reviewSettle({ ...current, files }));
                recompute();
            };
            // Each file answers for itself. Whatever one of them does — refused
            // by the checkout, or refusing even to start — the others are still
            // asked for, and the one that failed says so rather than staying
            // open forever as a file the review is silently short of.
            if (change === undefined) {
                settle({
                    type: "error",
                    error: happyAgentUserError(
                        new Error(`${file.path} is no longer among this checkout's changes.`),
                    ),
                });
                continue;
            }
            try {
                void client
                    .changedFileRead(groupId, file.path, change)
                    .then((value) => {
                        settle({ type: "ready", value });
                    })
                    .catch((error: unknown) => {
                        settle({ type: "error", error: happyAgentUserError(error) });
                    });
            } catch (error: unknown) {
                settle({ type: "error", error: happyAgentUserError(error) });
            }
        }
    };

    /**
     * Takes one report of the addressed checkout's slices. A slice built while
     * the reader is already looking through slices is the one they were waiting
     * for, so it becomes the listed one; built while they are reading changes
     * or a file, it waits in the picker rather than taking the screen.
     */
    const slicesReceive = (groupId: HappyAgentGroupId, next: readonly HappyAgentSlice[]): void => {
        if (slicesGroupId !== groupId) return;
        const previous = slices;
        slices = next;
        if (previous !== undefined && fileScopeOf(groupId) === "slice") {
            const known = new Set(previous.map((slice) => slice.id));
            const built = next.find((slice) => !known.has(slice.id));
            if (built !== undefined) viewPreferencesWrite(groupId, { sliceId: built.id });
        }
        recompute();
    };

    /**
     * Removes one slice. The listing drops it before the daemon answers, so the
     * hand that clicked sees the row go; the daemon's confirmation and the
     * event behind it find nothing left to remove. A refusal is reported as a
     * mutation failure and the next slice read puts the row back.
     */
    const sliceDelete = (groupId: HappyAgentGroupId, sliceId: HappyAgentSliceId): void => {
        if (slicesGroupId === groupId && slices?.some((slice) => slice.id === sliceId)) {
            slices = slices.filter((slice) => slice.id !== sliceId);
            recompute();
        }
        client.sliceDelete(groupId, sliceId);
    };

    /** Lists the panel by one slice; shared by the picker and the transcript card. */
    const sliceSelect = (groupId: HappyAgentGroupId, sliceId: HappyAgentSliceId): void => {
        const view = groupView(groupId);
        if (view.fileScope === "slice" && view.sliceId === sliceId) return;
        viewPreferencesWrite(groupId, { fileScope: "slice", sliceId });
        // The query survives the switch, asked again against the slice.
        if (fileSearch.query !== "") fileSearchApply(fileSearch.query);
        recompute();
    };

    /**
     * Keeps the slice subscription on the addressed checkout, and only while a
     * surface is running: slices are read for the checkout on screen, not for
     * every checkout the reader has ever opened.
     */
    const slicesFollow = (): void => {
        const groupId = active ? addressedGroupId : undefined;
        if (slicesGroupId === groupId) return;
        unsubscribeSlices?.();
        unsubscribeSlices = undefined;
        slicesGroupId = groupId;
        slices = undefined;
        if (groupId === undefined) return;
        unsubscribeSlices = client.workspaceSlicesSubscribe(groupId, (next) =>
            slicesReceive(groupId, next),
        );
    };

    /** Reconciles durable bytes once a filesystem change is known — reported by
     *  the daemon's watcher, or done by a write of our own. */
    const workspaceFilesChanged = (change: HappyAgentWorkspaceFilesChanged): void => {
        const affected = (path: string): boolean =>
            change.paths === null || change.paths.includes(path);
        fileAddressesInvalidate(change.groupId, change.paths);
        fileCommentsStale(change.paths);
        reviewReconcile(change.groupId, change.paths);
        for (const tab of fileTabs) {
            if (tab.groupId !== change.groupId || !affected(tab.path)) continue;
            fileTabLoadedIdentities.delete(tab.id);
            fileLoad(tab.id, fileChangeFind(tab.groupId, tab.path)?.revision ?? tab.revision);
        }
    };

    /**
     * Opens a file with preview or permanent lifetime. Each group has at most
     * one preview; permanent tabs and previews in other groups keep their place.
     */
    const fileTabOpen = (
        groupId: HappyAgentGroupId,
        path: string,
        requestedKind: HappyAgentFileTabKind,
        preview: boolean,
        placement: HappyAgentViewPlacement = "main",
        selection?: HappyAgentFileLineRange,
    ): void => {
        const kind = fileKindResolve(groupId, path, requestedKind);
        // A fresh ask every time, so following the same reference twice scrolls
        // back to it twice. Opening the file with no region named clears the
        // last one rather than leaving a band marking lines nobody asked about.
        const reveal =
            selection === undefined
                ? undefined
                : { ...selection, requestId: (fileRevealRequests += 1) };
        const revealApply = (tab: HappyAgentFileTabSnapshot): HappyAgentFileTabSnapshot => {
            if (reveal !== undefined) return { ...tab, reveal };
            // A preview is not a second decision about the file: it is what a
            // click in the listing and the file's own address both resolve to,
            // and the address is re-applied moments after a reference opens the
            // file. Clearing here would take the region away from the reader
            // who just asked for it. Opening the file outright does clear it.
            if (tab.reveal === undefined || preview) return tab;
            const { reveal: _cleared, ...rest } = tab;
            return rest;
        };
        if (!restoring)
            client.memory.recentTabRemember({ type: "file", groupId, path, fileKind: kind });
        const id = fileTabIdOf(groupId, path);
        const existing = fileTabs.find((tab) => tab.id === id);
        // Only the main content selects what it is showing. A file opening in
        // the panel is read beside the conversation, which stays on screen.
        if (placement === "main") {
            activeMainViewId = id;
            activeMainViewGroupId = undefined;
        } else if (activeMainViewId === id) {
            // The reader asked for this file beside the transcript, and it was
            // the main content's tab. It is one file, so it moves rather than
            // being copied, and the main content uncovers what it was over.
            activeMainViewId = undefined;
            displayedMainViewId = undefined;
        }
        // Whatever the panel was holding steps aside: the viewer is one slot.
        if (placement === "panel") panelFileTabClose(id);
        if (existing) {
            fileTabs = fileTabs.map((tab) => (tab.id === id ? revealApply(tab) : tab));
            if (existing.placement !== placement)
                fileTabs = fileTabs.map((tab) => (tab.id === id ? { ...tab, placement } : tab));
            const change = fileChangeFind(groupId, path);
            const revision = change?.revision ?? "";
            if (existing.kind !== kind) {
                fileTabs = fileTabs.map((tab) =>
                    tab.id === id
                        ? {
                              ...tab,
                              kind,
                              revision,
                              preview: preview && tab.preview,
                          }
                        : tab,
                );
                groupTabRemember(groupId, id);
                fileLoad(id, revision);
                return;
            }
            if (!preview && existing.preview)
                fileTabs = fileTabs.map((tab) =>
                    tab.id === id ? { ...tab, preview: false } : tab,
                );
            groupTabRemember(groupId, id);
            if (change && change.revision !== existing.revision) fileLoad(id, change.revision);
            else {
                fileReadyDisplay(id);
                recompute();
            }
            return;
        }

        const revision = fileChangeFind(groupId, path)?.revision ?? "";
        const presentationId = filePresentationIdNext();
        const cacheBaseKey = happyAgentReadyDocumentCacheBaseKey(groupId, path, kind, revision);
        const cached = readyDocumentCacheRead(cacheBaseKey)?.document;
        let tab: HappyAgentFileTabSnapshot = {
            id,
            groupId,
            path,
            kind,
            placement,
            preview,
            ...(reveal === undefined ? {} : { reveal }),
            revision,
            presentationId,
            saving: false,
            document: cached ? { type: "ready", value: cached } : { type: "loading" },
            loading: cached === undefined,
            revalidating: false,
        };
        const replacedIndex =
            preview && placement === "main"
                ? fileTabs.findIndex(
                      (candidate) =>
                          candidate.groupId === groupId &&
                          candidate.preview &&
                          candidate.placement === "main",
                  )
                : -1;
        if (replacedIndex >= 0) {
            const replaced = fileTabs[replacedIndex]!;
            fileTabCacheStore(replaced);
            fileTabRelease(replaced.id);
            if (displayedMainViewId === replaced.id) {
                if (
                    replaced.displayedPresentationId !== undefined &&
                    replaced.displayedDocument !== undefined
                ) {
                    tab = {
                        ...tab,
                        displayedDocument: replaced.displayedDocument,
                        ...(replaced.displayedKind === undefined
                            ? {}
                            : { displayedKind: replaced.displayedKind }),
                        displayedPath: replaced.displayedPath ?? replaced.path,
                        displayedPresentationId: replaced.displayedPresentationId,
                    };
                    displayedMainViewId = tab.id;
                } else {
                    displayedMainViewId = undefined;
                }
            }
            fileTabs = fileTabs.map((candidate, index) =>
                index === replacedIndex ? tab : candidate,
            );
        } else {
            fileTabs = [...fileTabs, tab];
        }
        fileReadyDisplay(id);
        groupTabRemember(groupId, id);
        recompute();
        fileLoad(id, revision, presentationId);
    };

    /**
     * Closes one file tab: its pending read is dropped, the strip forgets it,
     * and the group is left reading whatever the tab was covering — the next
     * file open in it, or the conversation behind them all.
     */
    /**
     * Empties the panel's viewer slot, keeping `except` if that is what is
     * already in it. The file's read stops and its parsed text goes to the
     * shared cache, so reopening it is immediate.
     */
    const panelFileTabClose = (except?: string): void => {
        const held = fileTabs.find((tab) => tab.placement === "panel" && tab.id !== except);
        if (!held) return;
        fileTabCacheStore(held);
        fileTabRelease(held.id);
        fileTabs = fileTabs.filter((tab) => tab.id !== held.id);
    };

    /**
     * Opens the whole change as one stream and selects it.
     *
     * The stream is built from the checkout's current changes and then read, so
     * selecting it a second time is only a selection — the files it already
     * holds are not read again.
     */
    const reviewTabOpen = (groupId: HappyAgentGroupId): void => {
        const id = reviewIdOf(groupId);
        activeMainViewId = id;
        activeMainViewGroupId = undefined;
        if (reviews.has(groupId)) {
            groupTabRemember(groupId, id);
            recompute();
            return;
        }
        reviews = new Map(reviews).set(groupId, {
            id,
            groupId,
            files: [],
            // What it is, is settled the moment the change's own counts are
            // read, which is the next thing that happens.
            presentation: "stream",
            drawn: false,
            collapsed: new Set(),
            viewed: new Set(),
            loading: true,
        });
        groupTabRemember(groupId, id);
        reviewReconcile(groupId, null);
        recompute();
    };

    const reviewTabClose = (groupId: HappyAgentGroupId): void => {
        const id = reviewIdOf(groupId);
        if (!reviews.has(groupId)) return;
        // Whatever is still in flight for it belongs to nothing now.
        reviewGenerations.set(id, (reviewGenerations.get(id) ?? 0) + 1);
        const next = new Map(reviews);
        next.delete(groupId);
        reviews = next;
        if (activeMainViewId === id) activeMainViewId = undefined;
        if (displayedMainViewId === id) displayedMainViewId = undefined;
        recompute();
    };

    const fileTabClose = (tabId: string): void => {
        const closing = fileTabs.find((tab) => tab.id === tabId);
        if (!closing) return;
        fileTabCacheStore(closing);
        fileTabRelease(tabId);
        // The neighbours a closed tab can uncover are the ones beside it in its
        // own strip. Indexing the whole list would hand the main content a file
        // from another checkout, which the strip on screen does not even draw.
        const siblings = fileTabs.filter(
            (tab) => tab.groupId === closing.groupId && tab.id !== tabId,
        );
        const among = fileTabs
            .filter((tab) => tab.groupId === closing.groupId)
            .findIndex((tab) => tab.id === tabId);
        const next = siblings[Math.min(among, siblings.length - 1)];
        fileTabs = fileTabs.filter((tab) => tab.id !== tabId);
        if (activeMainViewId === tabId) activeMainViewId = next?.id;
        if (displayedMainViewId === tabId) {
            displayedMainViewId = next?.id;
            if (
                next !== undefined &&
                next.displayedDocument === undefined &&
                closing.displayedPresentationId !== undefined &&
                closing.displayedDocument !== undefined
            )
                fileTabs = fileTabs.map((tab) =>
                    tab.id === next.id
                        ? {
                              ...tab,
                              displayedDocument: closing.displayedDocument,
                              ...(closing.displayedKind === undefined
                                  ? {}
                                  : { displayedKind: closing.displayedKind }),
                              displayedPath: closing.displayedPath ?? closing.path,
                              displayedPresentationId: closing.displayedPresentationId,
                          }
                        : tab,
                );
        }
        activeMainViewGroupId = undefined;
        groupTabForget(closing.groupId, tabId);
        // What the closed tab uncovered in its own group: the next file
        // there, or the conversation behind it when the group is addressed.
        const uncovered =
            fileTabs.find((tab) => tab.id === activeMainViewId && tab.groupId === closing.groupId)
                ?.id ?? (closing.groupId === addressedGroupId ? openId : undefined);
        groupTabRemember(closing.groupId, uncovered);
        recompute();
    };

    const fileTabsReconcile = (): void => {
        readyDocumentCacheReconcileGit();
        for (const tab of fileTabs) {
            const kind = fileKindResolve(tab.groupId, tab.path, tab.kind);
            const change = fileChangeFind(tab.groupId, tab.path);
            const revision = change?.revision ?? "";
            if (kind !== tab.kind) {
                fileTabs = fileTabs.map((candidate) =>
                    candidate.id === tab.id ? { ...candidate, kind, revision } : candidate,
                );
                fileLoad(tab.id, revision);
            } else if (revision !== tab.revision) {
                fileLoad(tab.id, revision);
            }
        }
    };

    /**
     * Runs an action against the open conversation's chat store, waiting for
     * acquisition when the reader got there first. Only the composer needs this:
     * it is on screen before the handle exists.
     */
    const withChatStore = <T>(run: (store: HappyAgentChatStore) => Promise<T>): Promise<T> => {
        if (chatStore) return run(chatStore);
        return chatArrival ? chatArrival.then(run) : noOpenConversation();
    };

    const releaseConversation = (): void => {
        mentionGeneration += 1;
        unsubscribeComposer?.();
        unsubscribeComposer = undefined;
        composer = undefined;
        unsubscribeChat?.();
        unsubscribeChat = undefined;
        chatStore = undefined;
        chatArrival = undefined;
        handle?.[Symbol.dispose]();
        handle = undefined;
    };

    /**
     * Runs one composer submission and reports its outcome back to the composer
     * that produced it. The target is passed in rather than read from the
     * current one: the group composer and the conversation composer both submit,
     * and the group's first message creates and opens a session, so by the time
     * it settles the composer it came from is no longer the current one.
     */
    const submitting = (
        target: ComposerStore | undefined,
        revision: number,
        run: () => Promise<void>,
        submittedAttachments: readonly ComposerAttachment[] = [],
    ): void => {
        void run().then(
            () => {
                target?.getState().composerInput({ type: "submissionConfirmed", revision });
                const retained = new Set(
                    target?.getState().attachments.map((attachment) => attachment.id) ?? [],
                );
                for (const attachment of submittedAttachments)
                    if (!retained.has(attachment.id))
                        happyAgentComposerAttachmentPreviewRelease(attachment);
            },
            (error: unknown) =>
                target?.getState().composerInput({
                    type: "submissionFailed",
                    revision,
                    error: happyAgentUserError(error),
                }),
        );
    };

    const commandRun = (
        target: ComposerStore,
        commandId: string,
        argumentsValue: string | undefined,
        revision: number | undefined,
    ): void => {
        const run = () =>
            withChatStore((store) => {
                const provided = store
                    .get()
                    .slashCommands.find((command) => command.name === commandId);
                if (provided !== undefined) {
                    if (argumentsValue !== undefined && !provided.hasArguments)
                        return Promise.reject(
                            new Error(`/${commandId} does not accept arguments.`),
                        );
                    return writeGuard(openGroupConversationRefusal(), () =>
                        store.slashCommandInvoke(commandId, argumentsValue),
                    );
                }
                if (argumentsValue !== undefined)
                    return Promise.reject(new Error(`/${commandId} does not accept arguments.`));
                switch (commandId) {
                    case "abort":
                        return store.runAbort();
                    case "usage":
                        panel.usageSelect();
                        return Promise.resolve();
                    case "tasks":
                    case "agents":
                    case "goal":
                    case "ps":
                        store.activityPanelShow();
                        panel.activitySelect();
                        return Promise.resolve();
                    default:
                        return Promise.reject(new Error(`/${commandId} is no longer available.`));
                }
            });
        if (revision === undefined) void run().catch(() => undefined);
        else submitting(target, revision, run);
    };

    /**
     * Answers how the turn should name one attachment, placing it first only
     * when it has to be placed at all.
     *
     * A file the agent can already open is named where it lies. Nothing is read,
     * encoded, or written, so its size stops being a question and the checkout
     * stays as the reader left it — a video dropped on a chat does not become an
     * untracked file at the top of their repository.
     *
     * Only a file that exists nowhere but the browser, or work happening
     * somewhere the reader's disk is not, falls back to carrying the bytes into
     * the checkout. That route keeps its own ceiling, because it is the route
     * the ceiling was always about.
     */
    const attachmentReferenceOf = async (
        groupId: HappyAgentGroupId,
        attachment: Extract<ComposerAttachment, { kind: "workspaceFile" }>,
    ): Promise<string> => {
        if (
            attachment.sourcePath !== undefined &&
            (await client.attachmentSourceReachable(groupId, attachment.sourcePath))
        )
            return attachment.sourcePath;
        const data = await happyAgentWorkspaceAttachmentData(attachment);
        return `./${(await client.attachmentWrite(groupId, attachment.name, data)).path}`;
    };

    /**
     * Names a draft's non-image attachments for the turn, placing the ones that
     * need placing. They are handled one at a time: their order in the draft is
     * the order they take names in, and two copies racing for the same name in
     * the checkout would settle it by luck. A failure fails the send, which is
     * the only place a reader is looking.
     */
    const attachmentsPlace = async (
        groupId: HappyAgentGroupId,
        text: string,
        attachments: readonly ComposerAttachment[],
    ): Promise<string> => {
        happyAgentComposerAttachmentsValidate(attachments);
        const paths: string[] = [];
        for (const attachment of attachments) {
            if (attachment.kind !== "workspaceFile") continue;
            // A file copied beside the message lands on disk, which the message
            // itself does not: a workspace whose checkout is still being
            // prepared takes the sentence but has nowhere to put the file. The
            // refusal is raised here rather than swallowed so the composer keeps
            // the draft and its attachments for another attempt.
            const refusal = groupWorkRefusalFind(groupId);
            if (refusal) throw new Error(refusal);
            paths.push(await attachmentReferenceOf(groupId, attachment));
        }
        return happyAgentAttachmentTextAppend(
            happyAgentCommentsTextAppend(text, attachments),
            paths,
        );
    };

    /**
     * What is attached to each group's unsent draft. Unlike the text it is not
     * written to the host's storage: the bytes of a screenshot are not something
     * to keep on disk on the chance that somebody comes back to the sentence
     * they were writing. It outlives the composer rather than the window, so
     * looking at another project and returning finds the draft as it was left.
     */
    const groupAttachments = new Map<HappyAgentGroupId, readonly ComposerAttachment[]>();

    /** The same, for a conversation whose composer is rebuilt when it is reopened. */
    const conversationAttachments = new Map<HappyAgentSessionId, readonly ComposerAttachment[]>();

    /**
     * Words carried into a conversation this window has not opened yet, for
     * the composer it will be given on arrival. The host is told the same
     * words, and its copy is what every later visit reads; this one is read
     * exactly once, by the first composer, so that composer opens holding
     * them rather than empty until the host's copy arrives.
     */
    const conversationDraftTexts = new Map<HappyAgentSessionId, string>();

    const attachmentsRemember = <Key>(
        held: Map<Key, readonly ComposerAttachment[]>,
        key: Key,
        target: ComposerStore,
    ): void => {
        // The notes are not held here. They belong to the checkout's review and
        // are written into whichever draft is addressing it, so keeping a copy
        // per conversation would hand the same notes to two drafts at once.
        const attachments = target
            .getState()
            .attachments.filter((attachment) => attachment.kind !== "reviewComments");
        if (attachments.length === 0) held.delete(key);
        else held.set(key, attachments);
    };

    /**
     * Attaches picked, dropped, or pasted files to one composer's draft. Every
     * composer here takes files the same way, whichever conversation — or
     * conversation to be — it writes into.
     */
    const attachmentsAddTo = (target: ComposerStore, files: readonly File[]): void => {
        for (const file of files) {
            const id = `attachment:${++attachmentSequence}`;
            // Asked for now, while the browser still has the object the host
            // can answer about, and kept with the draft: the send that needs
            // it may be minutes later and in another surface.
            const sourcePath = client.attachmentSourcePath(file);
            target
                .getState()
                .attachmentAdd(happyAgentComposerAttachmentCreate(id, file, sourcePath));
        }
    };

    /** Takes one attachment out of a composer's draft, letting go of its preview. */
    const attachmentRemoveFrom = (target: ComposerStore, attachmentId: string): void => {
        const attachment = target
            .getState()
            .attachments.find((candidate) => candidate.id === attachmentId);
        target.getState().attachmentRemove(attachmentId);
        if (attachment) happyAgentComposerAttachmentPreviewRelease(attachment);
    };

    /**
     * Puts attachments into a conversation's draft: into its composer when that
     * is live, otherwise held for the composer built when it is opened. The
     * open case adds rather than replaces, so what the reader has attached
     * since is kept beside what arrives.
     */
    const conversationAttachmentsCarry = (
        conversationId: HappyAgentSessionId,
        attachments: readonly ComposerAttachment[],
    ): void => {
        if (attachments.length === 0) return;
        if (conversationId === openId && composer) {
            for (const attachment of attachments) composer.getState().attachmentAdd(attachment);
            return;
        }
        conversationAttachments.set(conversationId, [
            ...(conversationAttachments.get(conversationId) ?? []),
            ...attachments,
        ]);
    };

    /**
     * The checkout one conversation runs in. Attachments land there and mentions
     * are searched there, and both are properties of the directory rather than
     * of the agent: a subagent addressed on its own still belongs to the project
     * it was delegated inside, which is the group the reader has open.
     */
    const conversationGroupId = (
        conversationId: HappyAgentSessionId,
    ): HappyAgentGroupId | undefined => {
        const snapshot = list.get();
        const bot = snapshot.bots.find((entry) => entry.conversation.id === conversationId);
        if (bot) return bot.workspaceId;
        const subtask = happyAgentBotSubtasks(snapshot.bots).find(
            (task) => task.conversation.id === conversationId,
        );
        if (subtask) return subtask.workspaceId;
        const projects = snapshot.projects;
        if (projects.type === "ready")
            for (const project of projects.value) {
                if (project.conversations.some((summary) => summary.id === conversationId))
                    return project.id;
                for (const worktree of project.worktrees)
                    if (worktree.conversations.some((summary) => summary.id === conversationId))
                        return worktree.id;
            }
        return addressedGroupId;
    };

    const conversationSummaryFind = (
        conversationId: HappyAgentSessionId,
    ): ConversationSummary | undefined => {
        const listSnapshot = list.get();
        // A bot's one conversation is listed on the bot rather than under a
        // project, so it is looked for there first — it is the only row a bot's
        // chat could be, and the loop below would never reach it.
        const bot = listSnapshot.bots.find((entry) => entry.conversation.id === conversationId);
        if (bot) return bot.conversation;
        const subtask = happyAgentBotSubtasks(listSnapshot.bots).find(
            (task) => task.conversation.id === conversationId,
        );
        if (subtask) return subtask.conversation;
        const projects = listSnapshot.projects;
        if (projects.type !== "ready") return undefined;
        for (const project of projects.value) {
            const direct = project.conversations.find((summary) => summary.id === conversationId);
            if (direct) return direct;
            for (const worktree of project.worktrees) {
                const found = worktree.conversations.find(
                    (summary) => summary.id === conversationId,
                );
                if (found) return found;
            }
        }
        return undefined;
    };

    const composerCreate = (conversationId: HappyAgentSessionId): ComposerStore => {
        const carriedText = conversationDraftTexts.get(conversationId);
        conversationDraftTexts.delete(conversationId);
        const created: ComposerStore = composerStoreCreate(conversationId, {
            capabilities: {
                shellMode: false,
                commands: happyAgentComposerCommands,
                mentions: true,
            },
            ...(carriedText === undefined ? {} : { text: carriedText }),
            attachments: [
                ...(conversationAttachments.get(conversationId) ?? []),
                ...fileCommentsAttachments(),
            ],
            output: (event) => {
                switch (event.type) {
                    case "attachmentRemoved":
                        fileCommentsDrop(event.attachmentId);
                        attachmentsRemember(conversationAttachments, conversationId, created);
                        return;
                    case "attachmentAdded":
                        attachmentsRemember(conversationAttachments, conversationId, created);
                        return;
                    case "textUpdated":
                        void withChatStore((store) =>
                            store.draftSet(event.text, nextDraftUpdatedAt(), draftOrigin),
                        ).catch(() => undefined);
                        return;
                    case "textSubmitted":
                        void withChatStore((store) =>
                            store.draftSet("", nextDraftUpdatedAt(), draftOrigin),
                        ).catch(() => undefined);
                        submitting(
                            created,
                            event.revision,
                            async () => {
                                const group = conversationGroupId(conversationId);
                                if (!group)
                                    throw new Error("That conversation is no longer in a project.");
                                const refusal = groupConversationRefusalFind(group);
                                if (refusal) throw new Error(refusal);
                                const images = await happyAgentImageInputsOf(event.attachments);
                                const text = await attachmentsPlace(
                                    group,
                                    event.text,
                                    event.attachments,
                                );
                                await withChatStore((store) => store.messageSend(text, images));
                                conversationAttachments.delete(conversationId);
                                fileCommentsSpend(event.attachments);
                            },
                            event.attachments,
                        );
                        return;
                    case "commandInvoked":
                        if (event.revision !== undefined)
                            void withChatStore((store) =>
                                store.draftSet("", nextDraftUpdatedAt(), draftOrigin),
                            ).catch(() => undefined);
                        commandRun(created, event.commandId, event.arguments, event.revision);
                        return;
                    case "mentionQueryUpdated": {
                        const requestGeneration = ++mentionGeneration;
                        const query = event.query;
                        if (query === undefined) return;
                        const target = composer;
                        const group = conversationGroupId(conversationId);
                        if (!group) return;
                        void client.filesSearch(group, query, MENTION_LIMIT).then(
                            (files: readonly HappyAgentFileSearchResult[]) => {
                                if (
                                    requestGeneration !== mentionGeneration ||
                                    target === undefined ||
                                    composer !== target
                                )
                                    return;
                                target.getState().composerInput({
                                    type: "mentionCandidatesReconciled",
                                    query,
                                    candidates: files.map((file) => ({
                                        id: file.path,
                                        label: file.path,
                                    })),
                                });
                            },
                            () => undefined,
                        );
                        return;
                    }
                    default:
                        return;
                }
            },
        });
        return created;
    };

    /**
     * Acquires the chat handle behind an already visible conversation. The
     * composer exists before this runs, so nothing the reader can see waits on
     * it: only the transcript, header, and menus arrive here.
     */
    const acquireConversation = (conversationId: HappyAgentSessionId): void => {
        if (disposed || !active || openId !== conversationId || acquiringId === conversationId)
            return;
        const createFailure = list.get().sessionCreateFailures.get(conversationId);
        if (createFailure) {
            acquiringId = undefined;
            conversation = { type: "error", error: createFailure };
            recompute();
            return;
        }
        const current = ++acquisitionGeneration;
        acquiringId = conversationId;
        // The composer is local: it is created and published in this same call
        // stack, so addressing a conversation puts a usable, focusable input on
        // screen immediately and the transcript fills in behind it. Anything
        // typed before the chat handle arrives is submitted once it does. A
        // retry after a failure starts from the same live composer.
        if (!composer) {
            composer = composerCreate(conversationId);
            unsubscribeComposer = composer.subscribe(recompute);
        }
        if (conversation.type === "error") conversation = { type: "loading" };
        recompute();
        const acquisition = client.chat(conversationId);
        // What a message typed before the handle arrives is sent through. It is
        // resolved with the store rather than the handle so a submission never
        // has to know whether acquisition is still in flight.
        chatArrival = acquisition.then((acquired) => acquired.store);
        // The transcript may fail to acquire before anything has tried to send
        // through this promise. Mark that rejection handled here while keeping
        // the rejected promise for a later submission to observe.
        void chatArrival.catch(() => undefined);
        void acquisition.then(
            (acquired) => {
                if (
                    disposed ||
                    !active ||
                    openId !== conversationId ||
                    current !== acquisitionGeneration
                ) {
                    acquired[Symbol.dispose]();
                    return;
                }
                acquiringId = undefined;
                handle = acquired;
                chatStore = acquired.store;
                const reconcileComposer = (): void => {
                    const state = acquired.store.get();
                    const currentComposer = composer;
                    if (!currentComposer) return;
                    currentComposer.getState().composerInput({
                        type: "commandsReconciled",
                        commands: composerCommandsProject(state.slashCommands),
                    });
                    if (!state.ready) return;
                    // A send in flight has already cleared the stored draft, and
                    // that empty draft arrives back here while the message is
                    // still going out. Reconciling it would count as a new
                    // revision of the composer, and the confirmation that
                    // follows — the thing that drops the text and its
                    // attachments together — is refused for a revision that has
                    // moved on. The send clears this composer itself.
                    if (currentComposer.getState().submission.status === "pending") return;
                    const remoteUpdatedAt = state.draftUpdatedAt ?? 0;
                    const localUpdatedAt = currentComposer.getState().textUpdatedAt ?? 0;
                    if (remoteUpdatedAt < localUpdatedAt) return;
                    const remote = state.draft ?? "";
                    if (currentComposer.getState().text !== remote)
                        currentComposer
                            .getState()
                            .composerInput({ type: "textReconciled", text: remote });
                };
                reconcileComposer();
                unsubscribeChat = acquired.store.subscribe(() => {
                    reconcileComposer();
                    recompute();
                });
                recompute();
            },
            (error: unknown) => {
                if (
                    disposed ||
                    !active ||
                    openId !== conversationId ||
                    current !== acquisitionGeneration
                )
                    return;
                acquiringId = undefined;
                conversation = { type: "error", error: happyAgentUserError(error) };
                recompute();
            },
        );
    };

    /** Records where navigation has just pointed this workspace. */
    const addressApply = (
        groupId: HappyAgentGroupId | undefined,
        conversationId: HappyAgentSessionId | undefined,
    ): void => {
        if (address.groupId === groupId && address.conversationId === conversationId) return;
        address =
            groupId === undefined && conversationId === undefined
                ? ADDRESS_NOWHERE
                : {
                      ...(groupId === undefined ? {} : { groupId }),
                      ...(conversationId === undefined ? {} : { conversationId }),
                  };
    };

    /** Applies the addressed conversation, releasing whichever one was open. */
    const openConversation = (conversationId: HappyAgentSessionId | undefined): void => {
        // The panel shows the addressed conversation's tabs, so it learns the new
        // address in this same call stack — before the chat handle is acquired, so
        // a terminal is never briefly attributed to the conversation just left.
        panel.scopeApply(addressedGroupId, conversationId, openGroupWorkRefusal());
        // The panel's viewer showed a file out of the conversation being left,
        // named by a path that only means anything in that session's checkout.
        if (conversationId !== openId) panelFileTabClose();
        if (conversationId === openId) {
            // Re-addressing the same conversation is how a failed acquisition is
            // retried, which is what a repeated navigation to it should do.
            if (conversationId && conversation.type === "error")
                acquireConversation(conversationId);
            else recompute();
            return;
        }
        acquisitionGeneration += 1;
        acquiringId = undefined;
        openId = conversationId;
        releaseConversation();
        if (!conversationId) {
            conversation = { type: "unloaded" };
            recompute();
            return;
        }
        acquireConversation(conversationId);
    };

    /** What starting a conversation in an addressed group takes, from the list. */
    /**
     * Why this group cannot take new work, in the phase's own words, or
     * `undefined` when it can. Only a worktree can refuse: a project's directory
     * is the one Happy was pointed at, while a worktree's checkout may still be
     * being prepared, may have failed to be prepared, or may have been removed
     * from disk since. Every route that starts a session asks this first, so a
     * shortcut, a tab button, a composer, and a plugin all refuse for the same
     * reason rather than each starting a session that would fail on its first
     * command.
     */
    /*
       Asked of the raw catalog record, never of the rows: a checkout being
       removed is deliberately left out of the rows, and if permission were read
       from them its absence would look exactly like permission.
    */
    const groupWorkRefusalFind = (groupId: HappyAgentGroupId | undefined): string | undefined =>
        groupId === undefined
            ? HAPPY_AGENT_GROUP_UNLISTED_REFUSAL
            : list.groupWriteRefusal(groupId);

    /**
     * The same question for a conversation rather than for the directory: why a
     * chat cannot be started here or sent to.
     *
     * It is a second question rather than a looser reading of the first because
     * a workspace Happy Agent is still preparing genuinely answers them differently. Its
     * directory is not there, so nothing may be saved into it or run in it —
     * but Happy Agent has already said where it will be and holds a session's work until
     * it exists, so a chat started in it is a chat that will run. Asking one
     * question for both would either lock the reader out of a workspace they
     * just made or let a file be written to a folder that is not there.
     */
    const groupConversationRefusalFind = (
        groupId: HappyAgentGroupId | undefined,
    ): string | undefined => {
        if (groupId === undefined) return HAPPY_AGENT_GROUP_UNLISTED_REFUSAL;
        return list.groupConversationRefusal(groupId);
    };

    /**
     * Why an operation naming one session rather than a place is refused: it is
     * checked against the checkout that session runs in, which is where its side
     * effect would land. A detached subagent resolves to the addressed group,
     * since that is the checkout it runs in too.
     */
    /** The same, for an operation that speaks to one session rather than its checkout. */
    const sessionConversationRefusal = (sessionId: HappyAgentSessionId): string | undefined =>
        groupConversationRefusalFind(conversationGroupId(sessionId));

    /** The group an operation on the open conversation would act in. */
    const openGroupWorkRefusal = (): string | undefined =>
        groupWorkRefusalFind((addressedGroupId ?? openGroupId) as HappyAgentGroupId | undefined);

    /** The same, for an operation that speaks to the open conversation. */
    const openGroupConversationRefusal = (): string | undefined =>
        groupConversationRefusalFind(
            (addressedGroupId ?? openGroupId) as HappyAgentGroupId | undefined,
        );

    /**
     * Runs `work` only if the checkout it would act in can take it, and rejects
     * with that checkout's own reason otherwise.
     *
     * Every operation with a side effect in a checkout goes through one of these
     * two, so there is a single place that decides and a single sentence that
     * explains. Reading, stopping, and navigating deliberately do not: a
     * workspace that has gone away must still be readable, and work already
     * running in it must still be stoppable.
     */
    const writeGuard = <T>(refusal: string | undefined, work: () => Promise<T>): Promise<T> =>
        refusal === undefined ? work() : Promise.reject(new Error(refusal));

    /** The synchronous form: a local action that would write is simply not performed. */
    const writeAllowed = (refusal: string | undefined): boolean => refusal === undefined;

    /**
     * Where a session started in this group would run, and whether it is a
     * worktree. A worktree's `cwd` here is only what the row says right now: a
     * workspace Happy Agent has not answered for yet has no path at all, and the
     * worktree route replaces it with the one the host names before creating
     * anything, so this value is never the address a session is actually made
     * against.
     */
    const groupStartFind = (
        groupId: HappyAgentGroupId,
    ):
        | {
              readonly create: HappyAgentSessionCreateInput;
              readonly worktreeId?: HappyAgentWorktreeId;
          }
        | undefined => {
        const projects = list.get().projects;
        if (projects.type !== "ready") return undefined;
        for (const project of projects.value) {
            if (project.id === groupId) return { create: { cwd: project.path } };
            for (const worktree of project.worktrees)
                if (worktree.id === groupId)
                    return {
                        create: { cwd: worktree.path, worktreeId: worktree.id },
                        worktreeId: worktree.id,
                    };
        }
        return undefined;
    };

    /**
     * The group one absolute host path lies in, and the path relative to it.
     *
     * The deepest checkout containing the path wins, because a worktree made
     * inside its project is contained by both and only the worktree is the
     * checkout the file is actually being read in.
     */
    const groupPathResolve = (
        source: string,
    ): { readonly groupId: HappyAgentGroupId; readonly path: string } | undefined => {
        const projects = list.get().projects;
        if (projects.type !== "ready") return undefined;
        const normalized = source.replaceAll("\\", "/");
        let best: { groupId: HappyAgentGroupId; path: string; rootLength: number } | undefined;
        const consider = (groupId: HappyAgentGroupId, root: string): void => {
            const prefix = `${root.replaceAll("\\", "/").replace(/\/+$/u, "")}/`;
            if (!normalized.startsWith(prefix)) return;
            if (best !== undefined && prefix.length <= best.rootLength) return;
            best = {
                groupId,
                path: normalized.slice(prefix.length),
                rootLength: prefix.length,
            };
        };
        for (const project of projects.value) {
            consider(project.id, project.path);
            for (const worktree of project.worktrees) consider(worktree.id, worktree.path);
        }
        return best === undefined ? undefined : { groupId: best.groupId, path: best.path };
    };

    /**
     * This group's worktree id, or `undefined` when it is a project. It decides
     * which route a session start takes, and a project has no directory to wait
     * for: Happy was pointed at it.
     */
    const worktreeGroupIdOf = (groupId: HappyAgentGroupId): HappyAgentWorktreeId | undefined =>
        groupStartFind(groupId)?.worktreeId;

    /**
     * Starts the addressed group's first conversation and sends `text` into it.
     * A worktree the host has only just been asked for has no directory named
     * yet, so that path waits for the host to name one; a project is ready by
     * definition. The address is reported before the message is delivered, so
     * the reader lands in the new conversation while it is being sent rather
     * than after.
     *
     * The wait is over the canonical path and not over the checkout being
     * prepared, so typing into a workspace the moment it is made is an ordinary
     * thing to do: the session is created against the directory Happy Agent named, and
     * Happy Agent releases its work when the checkout arrives. The composer holds one
     * submission pending for the whole of that wait, so a second Enter cannot
     * start a second session against the same new workspace.
     */
    const groupSubmit = (
        groupId: HappyAgentGroupId,
        text: string,
        attachments: readonly ComposerAttachment[],
        selection: HappyAgentSelection | undefined,
    ): Promise<HappyAgentSessionLocation> => {
        const refusal = groupConversationRefusalFind(groupId);
        if (refusal) return Promise.reject(new Error(refusal));
        try {
            happyAgentComposerAttachmentsValidate(attachments);
        } catch (error) {
            return Promise.reject(error);
        }
        // A file attached to this first message has to land in the checkout, and
        // that is asked for before anything is created rather than after: a
        // refusal discovered once the session exists would leave an empty
        // conversation behind that nobody asked for.
        if (attachments.some((attachment) => attachment.kind === "workspaceFile")) {
            const writeRefusal = groupWorkRefusalFind(groupId);
            if (writeRefusal) return Promise.reject(new Error(writeRefusal));
        }
        const start = groupStartFind(groupId);
        if (!start) return Promise.reject(new Error("That group is no longer listed."));
        const create = selection
            ? { ...start.create, ...selectionCreateFields(selection) }
            : start.create;
        // A workspace's own first conversation is started synchronously with
        // the workspace itself, so by the time anything can be typed at this
        // group that conversation already has its tab and its own composer.
        // A group submit therefore always means a further conversation here.
        return happyAgentImageInputsOf(attachments).then((images) => {
            const started = start.worktreeId
                ? Promise.resolve(list.worktreeSessionStart(start.worktreeId, create))
                : list.sessionCreate(create);
            return started.then(async (location) => {
                if (!location) throw new Error("The conversation could not be started.");
                output({ type: "conversationOpenRequested", location });
                const placed = await attachmentsPlace(location.groupId, text, attachments);
                const acquired = await client.chat(location.sessionId);
                try {
                    await acquired.store.messageSend(placed, images);
                } finally {
                    acquired[Symbol.dispose]();
                }
                return location;
            });
        });
    };

    /** Composes the published draft from its parts, keeping identity while none moved. */
    const botCreateCompose = (): void => {
        const composerState = botCreateComposer?.getState();
        if (botCreateDraft === undefined || composerState === undefined) {
            botCreate = undefined;
            botCreateComposedFrom = undefined;
            return;
        }
        const session = botCreateSessionDraft?.get();
        if (
            botCreateComposedFrom?.draft === botCreateDraft &&
            botCreateComposedFrom.composer === composerState &&
            botCreateComposedFrom.session === session
        )
            return;
        botCreateComposedFrom = { draft: botCreateDraft, composer: composerState, session };
        botCreate = {
            ...botCreateDraft,
            composer: composerState,
            ...(session === undefined ? {} : { menus: session.menus }),
        };
    };

    /**
     * Materializes the pickers' draft from the model catalog, opened on the
     * connection's most recent selection so a bot starts configured the way
     * the last conversation was. Every change is remembered as the most recent
     * selection, exactly as a group's draft remembers it.
     */
    const botCreateSessionDraftEnsure = (): void => {
        const current = ++botCreateSessionDraftGeneration;
        void client.models.load().then(
            (loaded) => {
                if (disposed || botCreateSessionDraftGeneration !== current || !botCreateDraft)
                    return;
                // The catalog may have moved on since this load answered.
                const latest = client.models.get();
                const models = latest.type === "ready" ? latest : loaded;
                const owned = happyAgentSessionDraftStoreOwnedCreate({
                    catalog: models.catalog,
                    selection: models.lastUsedSelection,
                    modelSelect: (current, input) => client.models.modelSelect(current, input),
                    effortRemembered: (providerId, modelId) =>
                        client.models.effortRemembered(providerId, modelId),
                });
                botCreateSessionDraft = owned.store;
                botCreateSessionDraftWriter = owned.writer;
                unsubscribeBotCreateSessionDraft = botCreateSessionDraft.subscribe(() => {
                    const selection = botCreateSessionDraft?.get().selection;
                    if (selection && !draftsCatalogApplying) client.models.selectionUsed(selection);
                    recompute();
                });
                recompute();
            },
            () => undefined,
        );
    };

    /**
     * Puts the whole draft down: the next arrival meets four new faces and an
     * empty composer. The composer's attachments go on living where the bot
     * was made — in its first message or its conversation's draft — so their
     * previews are let go of only when the draft is dropped unsent.
     */
    const botCreateRelease = (dropped: boolean): void => {
        if (dropped)
            for (const attachment of botCreateComposer?.getState().attachments ?? [])
                happyAgentComposerAttachmentPreviewRelease(attachment);
        unsubscribeBotCreateComposer?.();
        unsubscribeBotCreateComposer = undefined;
        botCreateComposer = undefined;
        unsubscribeBotCreateSessionDraft?.();
        unsubscribeBotCreateSessionDraft = undefined;
        botCreateSessionDraft = undefined;
        botCreateSessionDraftWriter = undefined;
        botCreateSessionDraftGeneration += 1;
        botCreateDraft = undefined;
    };

    /** A first message as the composer hands it over: the words and what is attached to them. */
    interface BotCreateMessage {
        readonly text: string;
        readonly attachments: readonly ComposerAttachment[];
    }

    /**
     * Puts a whole draft, words and files, into a conversation ahead of the
     * reader. The words are seeded into the composer that conversation will
     * open with as well as saved to the host: the composer is made locally
     * the moment the conversation is addressed and only later hears what the
     * host holds, and words that vanished for that moment and came back would
     * not read as the same composer standing still.
     */
    const conversationDraftCarry = async (
        conversationId: HappyAgentSessionId,
        draft: BotCreateMessage,
    ): Promise<void> => {
        conversationAttachmentsCarry(conversationId, draft.attachments);
        if (draft.text.trim().length === 0) return;
        conversationDraftTexts.set(conversationId, draft.text);
        await withAddressedChat(conversationId, (store) =>
            store.draftSet(draft.text, nextDraftUpdatedAt(), draftOrigin),
        );
    };

    /**
     * Makes the bot from the draft. Its row stands in the list before the host
     * is asked, so nothing the reader can see waits on the host.
     *
     * With a `message`, that is said to the bot as its first message the
     * moment the host holds it — its images inline, its files placed in the
     * bot's workspace, as a conversation's send does — and the window turns to
     * the conversation with the message already in it, the way a send in any
     * conversation moves the words from the composer into the transcript.
     * Without one, whatever the composer holds, text and attachments alike,
     * follows the reader into the conversation as its draft. Rejects with the
     * host's reason when the bot could not be made, having put the draft back
     * the way it was so the reader can try again rather than retype.
     */
    const botCreateRun = async (message: BotCreateMessage | undefined): Promise<void> => {
        const pending = botCreateDraft;
        const paint = botCreatePaint;
        // Thrown rather than returned: a send that resolved here would be
        // taken by its composer as confirmed, and clear the words it holds.
        if (!pending || paint === undefined) throw new Error("No bot is being made.");
        if (pending.submitting) throw new Error("The bot is already being made.");
        // Judged before anything is made, as a group's first message is: a
        // file too large to carry, found out once the bot exists, would leave
        // a bot behind that nobody asked for.
        if (message !== undefined) happyAgentComposerAttachmentsValidate(message.attachments);
        const name = pending.name.trim();
        const seed = pending.faces[pending.faceSlot];
        const selection = botCreateSessionDraft?.get().selection;
        botCreateDraft = { ...pending, submitting: true, error: undefined };
        recompute();
        // The face is painted before anything is asked of the host. It is a
        // few milliseconds of local work, and having the bytes in hand is
        // what lets the new row wear its face from its first frame. A face
        // that cannot be painted is the one thing here allowed to fail
        // quietly: it leaves a working bot.
        let avatar: HappyAgentAvatarImage | undefined;
        try {
            avatar = await paint(seed);
        } catch {
            avatar = undefined;
        }
        if (disposed) return;
        let created: HappyAgentBotCreation;
        try {
            // Blank is left out, not sent: an absent name is what asks the
            // host to name the bot from its first message.
            created = await list.botCreate({
                ...(name.length === 0 ? {} : { name }),
                ...(avatar === undefined ? {} : { avatar }),
                ...(selection === undefined ? {} : { selection }),
            });
        } catch (error) {
            if (disposed) return;
            botCreateDraft = { ...pending, submitting: false };
            recompute();
            throw happyAgentUserError(error);
        }
        if (disposed) return;
        const { location } = created;
        // The surface stays up, composer and all, until the window turns to
        // the conversation. Everything between here and there is a wait on the
        // host, and a content region that went blank for it would be the one
        // thing on the screen that moved.
        const turn = (): void => {
            // Put down rather than kept. The window follows the bot that was
            // just made, and the next arrival here should meet four new faces
            // rather than the ones already given away.
            botCreateRelease(false);
            recompute();
            output({ type: "conversationOpenRequested", location });
        };
        if (
            message === undefined ||
            (message.text.trim().length === 0 && message.attachments.length === 0)
        ) {
            // Read now rather than when the host was asked: the composer
            // stayed live while the host answered, and what was typed
            // meanwhile is part of the draft that follows the reader. Carried
            // before the window turns, so the conversation's composer opens
            // holding it: same text, same files, same place, still waiting to
            // be sent.
            const composerState = botCreateComposer?.getState();
            await conversationDraftCarry(location.sessionId, {
                text: composerState?.text ?? "",
                attachments: composerState?.attachments ?? [],
            });
            if (disposed) return;
            turn();
            return;
        }
        // The first message goes before the window turns, so the conversation
        // opens with it already in the transcript rather than with an empty
        // one the message arrives into a moment later — the way a send in any
        // conversation moves the words from the composer into the transcript.
        // It is also the thing that cannot be undone: it is what the host
        // names an unnamed bot from.
        try {
            const images = await happyAgentImageInputsOf(message.attachments);
            const text = await attachmentsPlace(
                location.groupId,
                message.text,
                message.attachments,
            );
            await withAddressedChat(location.sessionId, (store) => store.messageSend(text, images));
        } catch (error) {
            // The bot exists but its first message did not go. It cannot be
            // retried from here — a second attempt would ask for a second bot
            // — so the message is put down in the conversation, the one place
            // the reader is about to look, for them to send again, and the
            // refusal is still reported as an unsent message.
            if (!disposed) {
                await conversationDraftCarry(location.sessionId, message);
                if (!disposed) turn();
            }
            throw error;
        }
        if (disposed) return;
        turn();
    };

    const releaseGroup = (): void => {
        unsubscribeGroupComposer?.();
        unsubscribeGroupComposer = undefined;
        groupComposer = undefined;
        unsubscribeGroupDraft?.();
        unsubscribeGroupDraft = undefined;
        groupDraft = undefined;
        groupDraftWriter = undefined;
        // Invalidates a catalog read still in flight, so its draft cannot attach
        // itself to a group that has since been left.
        groupDraftGeneration += 1;
        openGroupId = undefined;
    };

    /**
     * Materializes the addressed group's session draft from the global model
     * store, seeded from the daemon connection's most recent selection.
     */
    const groupDraftEnsure = (groupId: HappyAgentGroupId): void => {
        const current = ++groupDraftGeneration;
        void client.models.load().then(
            (loaded) => {
                if (disposed || groupDraftGeneration !== current || openGroupId !== groupId) return;
                // The catalog may have moved on since this load answered.
                const latest = client.models.get();
                const models = latest.type === "ready" ? latest : loaded;
                const owned = happyAgentSessionDraftStoreOwnedCreate({
                    catalog: models.catalog,
                    selection: models.lastUsedSelection,
                    modelSelect: (current, input) => client.models.modelSelect(current, input),
                    effortRemembered: (providerId, modelId) =>
                        client.models.effortRemembered(providerId, modelId),
                });
                groupDraft = owned.store;
                groupDraftWriter = owned.writer;
                unsubscribeGroupDraft = groupDraft.subscribe(() => {
                    const selection = groupDraft?.get().selection;
                    if (selection && !draftsCatalogApplying) client.models.selectionUsed(selection);
                    recompute();
                });
                recompute();
            },
            () => undefined,
        );
    };

    /** Reports a newly created conversation so the router can address it. */
    const openRequest = (location: HappyAgentSessionLocation | undefined): void => {
        if (location) output({ type: "conversationOpenRequested", location });
    };

    /**
     * Starts the conversation a newly created workspace comes with, and
     * addresses it.
     *
     * The configuration is the connection's last selection, exactly as a new tab
     * in an existing workspace takes it: this is that same act, performed for
     * the reader because asking for a workspace is asking to work in one.
     *
     * It is synchronous: the conversation is named in the same call stack that
     * named the workspace, which is before the checkout exists, so the reader
     * lands on a workspace that already has its tab and writes into that
     * session's own composer from the first frame. Only the daemon's side of
     * the creation waits for the directory.
     */
    const worktreeFirstConversationStart = (worktreeId: HappyAgentWorktreeId): void => {
        const models = client.models.get();
        const selection = models.type === "ready" ? models.lastUsedSelection : undefined;
        const create: HappyAgentSessionCreateInput = {
            cwd: "",
            worktreeId,
            ...(selection ? selectionCreateFields(selection) : {}),
        };
        openRequest(list.worktreeSessionStart(worktreeId, create));
    };

    /**
     * Reads which applications this host can open a project in. Detecting them
     * costs process launches, so only one read is ever in flight; a failure
     * simply clears that flag, and the next start or tick asks again.
     */
    const openInTargetsRefresh = (): void => {
        if (openInTargetsReading) return;
        openInTargetsReading = true;
        void client.openInTargetsRead().then(
            (result) => {
                openInTargetsReading = false;
                if (disposed) return;
                openInTargets = result.targets;
                // What was opened last is the host's memory of this reader's
                // choice, so it stands even when detection did not list it;
                // anything already chosen in this run is newer and stands over
                // it. Detection does get the last word on how that application
                // looks, since a reinstall can change its icon or its name.
                const remembered = openInRecent ?? result.recent;
                openInRecent =
                    openInTargets.find((target) => target.id === remembered?.id) ?? remembered;
                recompute();
            },
            () => {
                openInTargetsReading = false;
            },
        );
    };

    const workspaceFilesDirectorySet = (
        path: string,
        directory: HappyAgentWorkspaceFileTreeDirectory,
    ): void => {
        const directories = new Map(workspaceFiles?.directories ?? []);
        directories.set(path, directory);
        workspaceFiles = { directories };
    };

    /**
     * Starts one queued directory read. The root follows all of its pages because
     * it has no parent row on which to place a "Show more" affordance; every
     * child reads exactly one page and exposes the rest explicitly.
     */
    function workspaceFilesDirectoryLoadStart(
        request: HappyAgentWorkspaceFileTreeLoadRequest,
    ): void {
        if (
            workspaceFilesGroupId !== request.groupId ||
            workspaceFilesGeneration !== request.generation
        )
            return;
        const previous = workspaceFiles?.directories.get(request.path);
        if (previous?.loading) return;
        workspaceFileTreeLoadsActive += 1;
        let entries = [...(previous?.entries ?? [])];
        let nextCursor = request.cursor;
        workspaceFilesDirectorySet(request.path, {
            entries,
            loading: true,
            ...(request.cursor === undefined ? {} : { nextCursor: request.cursor }),
        });
        if (request.path === "") workspaceFilesLoading = true;
        recompute();

        const finish = (failed: boolean): void => {
            workspaceFileTreeLoadsActive -= 1;
            if (
                !disposed &&
                request.generation === workspaceFilesGeneration &&
                request.groupId === workspaceFilesGroupId
            ) {
                workspaceFilesDirectorySet(request.path, {
                    entries,
                    ...(failed ? { error: true } : {}),
                    loading: false,
                    ...(nextCursor === undefined ? {} : { nextCursor }),
                });
                if (request.path === "") workspaceFilesLoading = false;
                recompute();
            }
            workspaceFilesDirectoryLoadPump();
        };

        void (async () => {
            do {
                const page = await client.workspaceFileTreeRead(
                    request.groupId,
                    request.path,
                    nextCursor,
                );
                entries = [...entries, ...page.entries];
                nextCursor = page.nextCursor;
            } while (request.path === "" && nextCursor !== undefined);
        })().then(
            () => finish(false),
            () => finish(true),
        );
    }

    /** Fills the three transport slots from the most-recent-intent end of the queue. */
    function workspaceFilesDirectoryLoadPump(): void {
        if (!active || disposed) return;
        while (
            workspaceFileTreeLoadsActive < HAPPY_AGENT_WORKSPACE_FILE_TREE_MAX_CONCURRENT_LOADS &&
            workspaceFileTreeLoadQueue.length > 0
        ) {
            const request = workspaceFileTreeLoadQueue.shift()!;
            if (
                request.generation !== workspaceFilesGeneration ||
                request.groupId !== workspaceFilesGroupId ||
                workspaceFiles?.directories.get(request.path)?.loading
            )
                continue;
            workspaceFilesDirectoryLoadStart(request);
        }
    }

    /** Adds or promotes one directory request, so the latest intent runs next. */
    const workspaceFilesDirectoryLoadSchedule = (
        groupId: HappyAgentGroupId,
        path: string,
        cursor?: string,
    ): void => {
        if (disposed || workspaceFilesGroupId !== groupId) return;
        if (workspaceFiles?.directories.get(path)?.loading) return;
        const queued = workspaceFileTreeLoadQueue.findIndex(
            (request) =>
                request.generation === workspaceFilesGeneration &&
                request.groupId === groupId &&
                request.path === path,
        );
        if (queued >= 0) workspaceFileTreeLoadQueue.splice(queued, 1);
        workspaceFileTreeLoadQueue.unshift({
            ...(cursor === undefined ? {} : { cursor }),
            generation: workspaceFilesGeneration,
            groupId,
            path,
        });
        if (path === "" && !workspaceFilesLoading) {
            workspaceFilesLoading = true;
            recompute();
        }
        workspaceFilesDirectoryLoadPump();
    };

    /** Loads a directory once, or retries the page that most recently failed. */
    const workspaceFilesDirectoryEnsure = (groupId: HappyAgentGroupId, path: string): void => {
        const directory = workspaceFiles?.directories.get(path);
        if (directory !== undefined && directory.error !== true) return;
        workspaceFilesDirectoryLoadSchedule(groupId, path, directory?.nextCursor);
    };

    /**
     * Opens the all-files tree at its root once per group. Switching sessions in
     * one checkout reuses every branch already materialized; switching checkouts
     * retires in-flight pages and starts with one root read.
     */
    const workspaceFilesEnsure = (groupId: HappyAgentGroupId): void => {
        const root = workspaceFiles?.directories.get("");
        if (workspaceFilesGroupId === groupId && root !== undefined && root.error !== true) return;
        if (workspaceFilesGroupId !== groupId) {
            workspaceFilesGroupId = groupId;
            workspaceFiles = { directories: new Map() };
            workspaceFileTreeLoadQueue = [];
            workspaceFilesGeneration += 1;
        }
        workspaceFilesDirectoryEnsure(groupId, "");
    };

    /**
     * Records whether the group now addressed is one the host has actually
     * listed. Addressing something the catalog already described is what makes a
     * later absence a removal; addressing a worktree this client has only just
     * reserved leaves it unconfirmed until a read says otherwise, so the reader
     * is never moved off work they are in the middle of starting.
     */
    const addressedGroupSeenUpdate = (): void => {
        addressedGroupSeen =
            addressedGroupId !== undefined && authoritativeGroupIds.has(addressedGroupId)
                ? addressedGroupId
                : undefined;
    };

    /**
     * What the host's own answer means for this workspace's addressing and for a
     * destructive intent the reader is holding. It runs only when the list
     * reports a newly applied authoritative read, so nothing here can be
     * triggered by an optimistic row change or by a request still in flight.
     *
     * Two things are settled from it. A project or worktree group the catalog no
     * longer holds is no longer addressable, however it went — archived here,
     * from another window, or on the machine itself — so its removal is reported
     * once for the owner to re-address. And a pending archive is checked against
     * the entity it names: gone means the outcome the reader asked for already
     * holds, and a renamed project means the sentence they are being asked to
     * confirm is about to stop matching, so the confirmation is restarted on the
     * new name rather than left standing over a stale copy.
     */
    const catalogAuthoritativeApply = (): void => {
        const listSnapshot = list.get();
        if (listSnapshot.catalogRevision === catalogRevisionSeen) return;
        catalogRevisionSeen = listSnapshot.catalogRevision;
        const projects = listSnapshot.projects;
        if (projects.type !== "ready") return;
        const listedIds = new Set<string>();
        for (const project of projects.value) {
            listedIds.add(project.id);
            for (const worktree of project.worktrees) listedIds.add(worktree.id);
        }
        // A bot is addressed through its own workspace, which hangs off no
        // project. It is listed here so an open bot counts as confirmed rather
        // than as an address the host has never answered for, and so archiving
        // one moves the reader off it the way archiving a project does.
        for (const bot of listSnapshot.bots) listedIds.add(bot.workspaceId);
        for (const subtask of happyAgentBotSubtasks(listSnapshot.bots))
            listedIds.add(subtask.workspaceId);
        authoritativeGroupIds = listedIds;
        if (addressedGroupId !== undefined) {
            const listed = listedIds.has(addressedGroupId);
            // Removed means it was here and is not any more. A group the host
            // has never confirmed is a group still arriving — a worktree just
            // reserved, a URL opened before the first read landed — and moving
            // the reader off one of those would be ejecting them from work they
            // are in the middle of starting.
            if (listed) addressedGroupSeen = addressedGroupId;
            else if (addressedGroupSeen === addressedGroupId) {
                // Forgotten as it is reported, so a second read of the same
                // absence does not ask the owner to navigate twice. The address
                // itself is left alone: replacing it is the owner's answer to
                // this, and the surfaces below still describe where the reader
                // was until that lands.
                addressedGroupSeen = undefined;
                output({ type: "addressedGroupRemoved", groupId: addressedGroupId });
            }
        }
        if (groupArchive && !groupArchive.submitting) {
            const pendingArchive = groupArchive;
            const project = projects.value.find(
                (candidate) => candidate.id === pendingArchive.projectId,
            );
            const currentName =
                pendingArchive.kind === "project"
                    ? project?.name
                    : project?.worktrees.find(
                          (candidate) => candidate.id === pendingArchive.worktreeId,
                      )?.name;
            if (currentName === undefined) groupArchive = undefined;
            else if (currentName !== pendingArchive.name)
                groupArchive = { ...pendingArchive, name: currentName, error: undefined };
        }
        // A submission owns its own confirmation until it settles; the read that
        // proves it archived is the one that closes it, from `projectArchiveSubmit`.
        if (!projectArchive || projectArchive.submitting) return;
        const project = projects.value.find(
            (candidate) => candidate.id === projectArchive?.projectId,
        );
        if (!project) {
            projectArchive = undefined;
            return;
        }
        if (project.name === projectArchive.name) return;
        projectArchive = {
            projectId: projectArchive.projectId,
            name: project.name,
            submitting: false,
        };
    };

    const pendingProjectClonesApply = (): void => {
        if (pendingProjectClones.size === 0) return;
        const listSnapshot = list.get();
        const projects =
            listSnapshot.projects.type === "ready" ? listSnapshot.projects.value : undefined;
        for (const [projectId, pending] of pendingProjectClones) {
            const failure = listSnapshot.projectCreateFailures.get(projectId);
            if (failure) {
                pendingProjectClones.delete(projectId);
                if (pending.generation === projectCloneGeneration && projectClone === undefined) {
                    projectClone = {
                        repository: pending.repository,
                        submitting: false,
                        error: failure.message,
                    };
                }
                continue;
            }
            const project = projects?.find((candidate) => candidate.id === projectId);
            if (project && project.lifecycle.phase !== "creating") {
                pendingProjectClones.delete(projectId);
            }
        }
    };

    const sessionCreateFailureApply = (): void => {
        if (openId === undefined) return;
        const failure = list.get().sessionCreateFailures.get(openId);
        if (
            failure === undefined ||
            (conversation.type === "error" && conversation.error === failure)
        )
            return;
        acquisitionGeneration += 1;
        acquiringId = undefined;
        releaseConversation();
        conversation = { type: "error", error: failure };
    };

    /**
     * Hands the connection's current catalog to the open drafts, so their
     * pickers list what the daemon offers now rather than what it offered when
     * they were opened. The reader's selection stays as they left it.
     */
    const draftsCatalogApply = (): void => {
        const models = client.models.get();
        if (models.type !== "ready") return;
        draftsCatalogApplying = true;
        try {
            groupDraftWriter?.catalogChanged(models.catalog);
            botCreateSessionDraftWriter?.catalogChanged(models.catalog);
        } finally {
            draftsCatalogApplying = false;
        }
    };

    const start = (): void => {
        active = true;
        const reconcileFileDocuments = fileDocumentsReconcileOnStart;
        fileDocumentsReconcileOnStart = false;
        if (reconcileFileDocuments) {
            readyDocumentCache.clear();
            readyDocumentCacheWeight = 0;
            fileTabLoadedIdentities.clear();
        }
        workspaceFilesDirectoryLoadPump();
        filePreprocessLoadPump();
        unsubscribeList = list.subscribe(() => {
            if (openId) list.sessionRead(openId);
            // A group addressed before its sessions arrived could not have its
            // remembered files reopened yet; the list saying which sessions it
            // has is what makes that possible.
            if (addressedGroupId !== undefined) groupRestore(addressedGroupId);
            fileTabsReconcile();
            pendingProjectClonesApply();
            sessionCreateFailureApply();
            catalogAuthoritativeApply();
            recompute();
        });
        unsubscribeWorkspaceFiles = client.workspaceFilesSubscribe(workspaceFilesChanged);
        slicesFollow();
        // The addressed conversation survives losing every subscriber (the URL
        // still names it), so remounting re-acquires it rather than opening
        // nothing.
        if (openId) acquireConversation(openId);
        for (const tab of fileTabs) {
            const revalidation = fileTabRevalidations.get(tab.id);
            if (reconcileFileDocuments || tab.loading || revalidation !== undefined)
                fileLoad(tab.id, revalidation?.revision ?? tab.revision);
        }
        // Which applications exist is a property of the host, not of anything
        // being opened, so it is read once the workspace is actually on screen
        // rather than when it is constructed — and read again on every start,
        // because an application installed since the last one belongs in the
        // menu. There is no channel that announces an install, so a surface
        // left open all day polls for it; the cadence is hours rather than
        // seconds because that is how often the answer can change.
        openInTargetsRefresh();
        openInTargetsTimer ??= setInterval(openInTargetsRefresh, OPEN_IN_TARGETS_REFRESH_MS);
        // The daemon can change what it offers at any time — a provider
        // switched on, or a restart onto another configuration — and the open
        // drafts and a conversation still showing the machine's defaults list
        // exactly that. A catalog that moved while nobody watched lands now.
        unsubscribeModels = client.models.subscribe(() => {
            draftsCatalogApply();
            recompute();
        });
        draftsCatalogApply();
        recompute();
    };

    const stop = (): void => {
        active = false;
        acquisitionGeneration += 1;
        acquiringId = undefined;
        unsubscribeList?.();
        unsubscribeList = undefined;
        unsubscribeWorkspaceFiles?.();
        unsubscribeWorkspaceFiles = undefined;
        slicesFollow();
        unsubscribeModels?.();
        unsubscribeModels = undefined;
        fileDocumentsReconcileOnStart = true;
        // A workspace nobody is looking at does not go asking the host what is
        // installed; the next start reads it fresh anyway.
        if (openInTargetsTimer !== undefined) {
            clearInterval(openInTargetsTimer);
            openInTargetsTimer = undefined;
        }
        // The catalog is no longer being watched, so what was last known about
        // it is no longer a basis for reporting anything. Confirmation is
        // rebuilt from the reads taken after this store is on screen again,
        // which is what keeps a removal that happened while nobody was looking
        // from being announced as if the reader had just watched it.
        addressedGroupSeen = undefined;
        authoritativeGroupIds = new Set();
        catalogRevisionSeen = -1;
        for (const tab of fileTabs) fileTabCacheStore(tab);
        for (const request of fileLoadRequests.values()) request.controller.abort();
        fileLoadRequests.clear();
        fileLoadOwnerKeys.clear();
        fileLoadOwnerRequests.clear();
        filePreprocessGeneration += 1;
        filePreprocessQueue = [];
        filePreprocessLoadsActive = 0;
        for (const tab of fileTabs)
            fileLoadGenerations.set(tab.id, (fileLoadGenerations.get(tab.id) ?? 0) + 1);
        // A stopped surface has no in-flight authoritative read. Keep ready
        // bytes visible, but do not expose the old request as revalidating
        // until start() resumes it.
        fileTabs = fileTabs.map((tab) =>
            tab.revalidating ? { ...tab, revalidating: false } : tab,
        );
        releaseGroup();
        releaseConversation();
        conversation = { type: "unloaded" };
        // Replaced without an announcement: a stopped surface has nobody left
        // to tell, and stopping has never notified.
        snapshotSilent = true;
        try {
            snapshotStore.setState(
                {
                    // Where navigation last pointed outlives the subscription privately,
                    // because the URL still names it and starting again re-acquires it.
                    // Publicly there is nowhere to act until that happens.
                    address: addressPublic(),
                    list: list.get(),
                    conversation,
                    conversationDelegated: false,
                    groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
                    fileTabs,
                    recentTabs: client.memory.recentTabsRead(),
                    tabOrder,
                    groupResume,
                    openInTargets,
                    fileViewMode,
                    fileViewWrap,
                    // Nothing is addressed here, so there is no checkout whose
                    // arrangement this could be: the defaults stand in.
                    fileScope: "changed",
                    slices: SLICES_NONE,
                    fileLayout: HAPPY_AGENT_FILE_LAYOUT_DEFAULT,
                    fileSearch,
                    fileComments,
                    reviews,
                    fileTreeExpanded,
                    fileTreeCollapsed,
                    ...(workspaceFiles ? { workspaceFiles } : {}),
                    ...(openInRecent ? { openInRecent } : {}),
                    workspaceFilesLoading,
                    projectAdd,
                    ...(projectClone ? { projectClone } : {}),
                    ...(botCreate ? { botCreate } : {}),
                    ...(activeMainViewId ? { activeMainViewId } : {}),
                    ...(displayedMainViewId ? { displayedMainViewId } : {}),
                },
                true,
            );
        } finally {
            snapshotSilent = false;
        }
    };

    const withChat = <T>(run: (store: HappyAgentChatStore) => Promise<T>): Promise<T> =>
        chatStore ? run(chatStore) : noOpenConversation();

    const withAddressedChat = async <T>(
        sessionId: HappyAgentSessionId,
        run: (store: HappyAgentChatStore) => Promise<T>,
    ): Promise<T> => {
        if (sessionId === openId && chatStore) return run(chatStore);
        const acquired = await client.chat(sessionId);
        try {
            return await run(acquired.store);
        } finally {
            acquired[Symbol.dispose]();
        }
    };

    const slotGroupFind = (
        input: HappyAgentWorkspaceNewChatInput,
    ): HappyAgentGroupId | undefined => {
        const projects = list.get().projects;
        if (projects.type !== "ready")
            return (addressedGroupId ?? openGroupId) as HappyAgentGroupId | undefined;
        if (input.workspaceId) {
            for (const project of projects.value) {
                if (input.projectId && project.id !== input.projectId) continue;
                const worktree = project.worktrees.find(
                    (candidate) => candidate.id === input.workspaceId,
                );
                if (worktree) return worktree.id;
            }
            return undefined;
        }
        if (input.projectId) {
            return projects.value.some((project) => project.id === input.projectId)
                ? (input.projectId as HappyAgentProjectId)
                : undefined;
        }
        return addressedGroupId ?? openGroupId;
    };

    /**
     * One choice written as a value that can be compared. Two choices are the
     * same choice when this is the same string, which is what decides whether a
     * submission is a repeat of the one before it and whether the reader has
     * diverged from what the host holds.
     */
    const computeKey = (compute: HappyAgentProjectCompute | undefined): string =>
        compute === undefined
            ? "default"
            : compute.type === "local"
              ? "local"
              : `docker:${compute.image}`;

    /** The choice the compute block currently expresses, or `undefined` for stating nothing. */
    const computeOfDraft = (
        pending: HappyAgentProjectComputeSnapshot,
    ): HappyAgentProjectCompute | undefined =>
        pending.mode === "default"
            ? undefined
            : pending.mode === "local"
              ? { type: "local" }
              : { type: "docker", image: pending.image.trim() };

    /**
     * Applies the host's answer to the open compute block.
     *
     * The reader's own choice survives it. A read only reseeds the controls while
     * they still express what the host last said — which is the case before the
     * reader has touched them, and stops being the case the moment they choose
     * something else. That is what lets another window's change show up here
     * without taking a half-made decision away from the person making it.
     */
    const projectComputeApply = (state: HappyAgentProjectComputeState): void => {
        const pending = projectCompute;
        if (!pending || pending.projectId !== state.projectId) return;
        const untouched =
            pending.status !== "ready" ||
            computeKey(computeOfDraft(pending)) === computeKey(pending.current);
        const seeded: Pick<HappyAgentProjectComputeSnapshot, "image" | "mode"> = untouched
            ? {
                  mode: state.compute === undefined ? "default" : state.compute.type,
                  // An image the reader typed is kept when the host states none,
                  // so switching to Docker to look at it and back does not lose
                  // it; the host's own image replaces it when there is one.
                  image: state.compute?.type === "docker" ? state.compute.image : pending.image,
              }
            : { mode: pending.mode, image: pending.image };
        projectCompute = {
            projectId: pending.projectId,
            status: "ready",
            generation: state.generation,
            ...(state.compute === undefined ? {} : { current: state.compute }),
            ...seeded,
            submitting: pending.submitting,
            ...(pending.error === undefined ? {} : { error: pending.error }),
        };
    };

    /**
     * Reads the open project's compute setting from the host.
     *
     * Every read takes a token when it is issued, and only the newest one may
     * write. That is what keeps the answer for one project from landing on
     * another: opening a second project's settings — or closing these — issues a
     * newer token (or none at all), and the earlier read simply has nothing left
     * to say. The block's own project is checked as well, so an answer can never
     * be applied to a project it was not asked about.
     */
    const projectComputeLoad = (projectId: HappyAgentProjectId): void => {
        const token = ++projectComputeReadToken;
        void list.projectComputeRead(projectId).then(
            (state) => {
                if (disposed || token !== projectComputeReadToken) return;
                if (projectCompute?.projectId !== projectId) return;
                projectComputeApply(state);
                recompute();
            },
            (error) => {
                if (disposed || token !== projectComputeReadToken) return;
                const pending = projectCompute;
                if (pending?.projectId !== projectId) return;
                // A read that failed after one succeeded keeps what is on screen:
                // the reader is looking at the host's last answer, which is more
                // than this failure can replace it with.
                if (pending.status === "ready") return;
                projectCompute = {
                    ...pending,
                    status: "error",
                    readError: happyAgentUserError(error).message,
                };
                recompute();
            },
        );
    };

    /**
     * Opens the compute block on one project and starts following it.
     *
     * The subscription is the host's own "a project changed" feed rather than the
     * grouped list: the setting is not in that list, so a change to it alone
     * leaves every row identical and the list announces nothing. It is opened
     * with the block and closed with it, so a dialog nobody has open follows
     * nothing.
     */
    const projectComputeOpen = (projectId: HappyAgentProjectId): void => {
        projectComputeClose();
        projectCompute = {
            projectId,
            status: "loading",
            generation: 0,
            mode: "default",
            image: "",
            submitting: false,
        };
        unsubscribeProjectsChanged = list.projectsChangedSubscribe(() => {
            if (disposed || projectCompute?.projectId !== projectId) return;
            // Never while the host is being told: that request's own answer is
            // the read-back, and a read racing it could show the value from
            // before the write as though it were the result of it.
            if (projectCompute.submitting) return;
            projectComputeLoad(projectId);
        });
        projectComputeLoad(projectId);
    };

    /** Closes the compute block and retires every read still on its way back to it. */
    const projectComputeClose = (): void => {
        unsubscribeProjectsChanged?.();
        unsubscribeProjectsChanged = undefined;
        // Retires the reads in flight rather than merely dropping the block: a
        // token taken after this is newer than all of them, so none of their
        // answers may write, whatever they were asked about.
        projectComputeReadToken += 1;
        projectComputeSubmission += 1;
        projectComputeMutationId = undefined;
        projectComputeMutationChoice = undefined;
        projectCompute = undefined;
    };

    /**
     * Puts the open conversation back on screen: no file tab, no tool tab.
     *
     * Selecting nothing is what "the conversation" means here, and the tab the
     * group is then being read on is remembered as such.
     */
    const mainViewClear = (): void => {
        activeMainViewId = undefined;
        displayedMainViewId = undefined;
        activeMainViewGroupId = undefined;
        if (addressedGroupId !== undefined && openId !== undefined)
            groupTabRemember(addressedGroupId, openId);
    };

    return {
        get: () => snapshotStore.getState(),
        panel,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1 && !disposed) start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },

        conversationOpen: (conversationId, groupId) => {
            addressApply(groupId, conversationId);
            if (groupId !== addressedGroupId) {
                fileTreeExpansionLoad(groupId);
                fileSearchReset();
                fileCommentsReset();
            }
            releaseGroup();
            if (groupId !== undefined && fileScopeOf(groupId) === "all")
                workspaceFilesEnsure(groupId);
            if (groupId !== undefined) {
                client.memory.recentTabRemember({
                    type: "session",
                    groupId,
                    sessionId: conversationId,
                });
                addressedGroupId = groupId;
                addressedGroupSeenUpdate();
                slicesFollow();
                groupRestore(groupId);
                // Restoration reopens the group's tabs, but this address names
                // the session. A file address applies this action first and
                // explicitly selects its file immediately afterward; an
                // ordinary Back/Forward step therefore cannot be covered by a
                // remembered file or leave the wrong tab highlighted.
                activeMainViewId = undefined;
                activeMainViewGroupId = undefined;
                displayedMainViewId = undefined;
                groupTabRemember(groupId, conversationId);
            }
            list.sessionRead(conversationId, conversationSummaryFind(conversationId)?.unread);
            openConversation(conversationId);
        },
        groupOpen: (groupId) => {
            addressApply(groupId, undefined);
            if (groupId !== addressedGroupId) {
                displayedMainViewId = undefined;
                fileTreeExpansionLoad(groupId);
                fileSearchReset();
                fileCommentsReset();
            }
            // The panel belongs to this group, so it learns the address before
            // the conversation is released rather than after.
            addressedGroupId = groupId;
            addressedGroupSeenUpdate();
            slicesFollow();
            openConversation(undefined);
            groupRestore(groupId);
            // The scope belongs to this checkout, so a group left listing every
            // file opens on every file. Applied even when this group already
            // owns the empty-session composer.
            if (fileScopeOf(groupId) === "all") workspaceFilesEnsure(groupId);
            if (openGroupId === groupId) return;
            releaseGroup();
            openGroupId = groupId;
            const created: ComposerStore = composerStoreCreate(groupId, {
                capabilities: { shellMode: false, commands: [], mentions: false },
                text: client.memory.groupRead(groupId)?.draft ?? "",
                attachments: [
                    ...(groupAttachments.get(groupId) ?? []),
                    ...fileCommentsAttachments(),
                ],
                output: (event) => {
                    switch (event.type) {
                        case "textUpdated":
                            client.memory.groupDraftWrite(groupId, event.text);
                            return;
                        case "attachmentRemoved":
                            fileCommentsDrop(event.attachmentId);
                            attachmentsRemember(groupAttachments, groupId, created);
                            return;
                        case "attachmentAdded":
                            attachmentsRemember(groupAttachments, groupId, created);
                            return;
                        case "textSubmitted": {
                            // The configuration is read now, not after the
                            // session has been created: creation navigates,
                            // which releases this group and its draft with it.
                            const selection = groupDraft?.get().selection;
                            submitting(
                                created,
                                event.revision,
                                async () => {
                                    await groupSubmit(
                                        groupId,
                                        event.text,
                                        event.attachments,
                                        selection,
                                    );
                                    // Sent, so there is nothing left to come back
                                    // to. Navigation releases this composer before
                                    // it can clear itself, which is why the group's
                                    // own record of the draft is cleared here.
                                    client.memory.groupDraftWrite(groupId, "");
                                    groupAttachments.delete(groupId);
                                    fileCommentsSpend(event.attachments);
                                },
                                event.attachments,
                            );
                            return;
                        }
                        default:
                            return;
                    }
                },
            });
            groupComposer = created;
            unsubscribeGroupComposer = created.subscribe(recompute);
            groupDraftEnsure(groupId);
            recompute();
        },
        conversationClose: () => {
            addressApply(undefined, undefined);
            releaseGroup();
            // Addressing the Happy Agent's list addresses no group, so the identity a
            // removal would be reported against is put down with the group
            // itself. Without this, a project archived long after the reader
            // left it — or archived, restored, and archived again — would still
            // ask the owner to navigate away from a list it is already on.
            addressedGroupId = undefined;
            addressedGroupSeen = undefined;
            slicesFollow();
            displayedMainViewId = undefined;
            fileTreeExpansionLoad(undefined);
            fileSearchReset();
            fileCommentsReset();
            openConversation(undefined);
        },
        conversationListRetry: () => {
            void list.sessionsRefresh();
        },
        sessionLocationRead: (sessionId) => list.sessionLocationRead(sessionId),
        conversationRetry() {
            if (openId && conversation.type === "error") {
                acquireConversation(openId);
                return;
            }
            if (conversation.type === "ready" && conversation.value.session.type === "error")
                chatStore?.sessionRetry();
        },
        messageSendCurrent: (message) =>
            writeGuard(openGroupConversationRefusal(), () =>
                withChat((store) => store.messageSend(message, [])),
            ),
        messageSend: (sessionId, message) =>
            writeGuard(sessionConversationRefusal(sessionId), () =>
                withAddressedChat(sessionId, (store) => store.messageSend(message, [])),
            ),
        draftUpdate: (sessionId, message) =>
            writeGuard(sessionConversationRefusal(sessionId), () =>
                withAddressedChat(sessionId, (store) =>
                    store.draftSet(message, nextDraftUpdatedAt(), draftOrigin),
                ),
            ),
        draftAppend: (sessionId, message) =>
            writeGuard(sessionConversationRefusal(sessionId), () =>
                withAddressedChat(sessionId, async (store) => {
                    // Read the existing draft before adding anything. Acquiring a
                    // chat starts its projection, but does not wait for its data.
                    await new Promise<void>((resolve, reject) => {
                        let unsubscribe = () => {};
                        let settled = false;
                        const finish = (error?: Error) => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timeout);
                            unsubscribe();
                            if (error) reject(error);
                            else resolve();
                        };
                        const timeout = setTimeout(
                            () =>
                                finish(new Error("The conversation is still loading. Try again.")),
                            15_000,
                        );
                        const check = () => {
                            if (disposed) {
                                finish(new Error("This workspace is no longer open."));
                                return;
                            }
                            const session = store.get().session;
                            if (session.type === "error") finish(session.error);
                            else if (session.type === "ready") finish();
                        };
                        unsubscribe = store.subscribe(check);
                        if (settled) unsubscribe();
                        else check();
                    });
                    if (disposed) throw new Error("This workspace is no longer open.");
                    const existing = store.get().draft ?? "";
                    if (existing === message || existing.endsWith(`\n\n${message}`)) return;
                    await store.draftSet(
                        existing ? `${existing}\n\n${message}` : message,
                        nextDraftUpdatedAt(),
                        draftOrigin,
                    );
                }),
            ),
        async chatStart(input) {
            const groupId = slotGroupFind(input);
            if (!groupId) throw new Error("That project or workspace is no longer listed.");
            const refusal = groupConversationRefusalFind(groupId);
            if (refusal) throw new Error(refusal);
            const start = groupStartFind(groupId);
            if (!start) throw new Error("That project or workspace is not ready.");
            const create: HappyAgentSessionCreateInput = {
                ...start.create,
                ...(input.model ? { modelId: input.model } : {}),
                ...(input.effort ? { effort: input.effort } : {}),
            };
            const location = start.worktreeId
                ? list.worktreeSessionStart(start.worktreeId, create)
                : await list.sessionCreate(create);
            if (!location) throw new Error("The conversation could not be started.");
            output({ type: "conversationOpenRequested", location });
            if (input.prompt?.trim()) {
                await withAddressedChat(location.sessionId, (store) =>
                    store.messageSend(input.prompt!, []),
                );
            }
        },
        // Anything the caller names wins over the connection's last selection.
        conversationCreate: (groupId, input) => {
            const refusal = groupConversationRefusalFind(groupId);
            if (refusal) return Promise.reject(new Error(refusal));
            const models = client.models.get();
            const selection = models.type === "ready" ? models.lastUsedSelection : undefined;
            const create = selection ? { ...selectionCreateFields(selection), ...input } : input;
            // A worktree goes through the route that waits for the host to name
            // its directory, whatever the caller passed as `cwd`. The caller
            // reads that from the row it drew, and a workspace the host has not
            // answered for yet has no directory on its row to read.
            const worktreeId = worktreeGroupIdOf(groupId);
            if (worktreeId !== undefined) {
                openRequest(list.worktreeSessionStart(worktreeId, create));
                return Promise.resolve();
            }
            return list.sessionCreate(create).then(openRequest);
        },
        conversationArchive: async (conversationId) => {
            await list.sessionArchive(conversationId);
            client.chatArchive(conversationId);
        },
        conversationRestore: async (conversationId) => {
            const result = await list.sessionRestore(conversationId);
            if (result.type === "failed") throw result.error;
            client.chatRestore(conversationId);
        },
        tabReorder(tabId, afterId) {
            if (disposed || addressedGroupId === undefined) return;
            const groupId = addressedGroupId;
            if (!tabOrder.includes(tabId)) return;
            if (afterId !== null && !tabOrder.includes(afterId)) return;
            const stored = client.memory.groupRead(groupId)?.order ?? {};
            // A tab can only be placed between two keys, so the strip as it
            // stands is written down first: the tabs that already have keys keep
            // them, and the ones that arrived since sort after the last of them
            // exactly where they are already showing.
            const keyed = tabOrder.filter((id) => stored[id] !== undefined);
            const unkeyed = tabOrder.filter((id) => stored[id] === undefined);
            const minted = orderKeySequence(
                unkeyed.length,
                keyed.length > 0 ? stored[keyed[keyed.length - 1]!]! : null,
            );
            const order: Record<string, string> = {};
            for (const id of keyed) order[id] = stored[id]!;
            unkeyed.forEach((id, index) => {
                order[id] = minted[index]!;
            });
            order[tabId] = orderKeyAfter(
                tabOrder.map((id) => ({ id, orderKey: order[id]! })),
                tabId,
                afterId,
            );
            client.memory.groupOrderWrite(groupId, order);
            memoryRevision += 1;
            recompute();
        },
        projectAdd() {
            if (disposed || projectAdd.pending) return;
            const host = deps.host;
            if (host?.projectSource === "repository") {
                if (projectClone?.submitting) return;
                projectCloneGeneration += 1;
                projectClone = { repository: "", submitting: false };
                recompute();
                return;
            }
            if (!host) {
                projectAdd = { pending: false, error: "This window cannot choose a folder." };
                recompute();
                return;
            }
            // Pending from before the dialog opens, not from when the daemon is
            // asked: the picker is the slow part, and a control that stayed
            // pressable across it would open a second one over the first.
            projectAdd = { pending: true };
            recompute();
            void (async () => {
                try {
                    const path = await host.directoryPick();
                    if (disposed) return;
                    // Choosing nothing is a finished act with nothing to say, so
                    // it says nothing. Any earlier refusal went away when this
                    // act started: it described a folder this reader has already
                    // moved on from.
                    if (path === undefined) {
                        projectAdd = PROJECT_ADD_IDLE;
                        recompute();
                        return;
                    }
                    const projectId = await client.projectAdd(path);
                    if (disposed) return;
                    projectAdd = PROJECT_ADD_IDLE;
                    recompute();
                    // The row itself arrives through the catalog stream, which
                    // is what carries a project created by anything on this
                    // machine. Addressing it is this store's part: the reader
                    // asked for this project, so the window goes to it — empty,
                    // as a new worktree does, so nothing is started in it.
                    output({ type: "groupOpenRequested", groupId: projectId });
                } catch (error) {
                    if (disposed) return;
                    projectAdd = { pending: false, error: happyAgentUserError(error).message };
                    recompute();
                }
            })();
        },
        projectCloneOpen() {
            if (disposed || projectClone?.submitting) return;
            projectCloneGeneration += 1;
            projectClone = { repository: "", submitting: false };
            recompute();
        },
        projectRepositoryUpdate(value) {
            if (!projectClone || projectClone.submitting) return;
            projectClone = { repository: value, submitting: false };
            recompute();
        },
        projectCloneCancel() {
            if (!projectClone || projectClone.submitting) return;
            projectClone = undefined;
            recompute();
        },
        projectCloneSubmit() {
            const editor = projectClone;
            if (!editor || editor.submitting) return;
            const source = githubRepositoryParse(editor.repository);
            if (!source) {
                projectClone = {
                    ...editor,
                    error: "Enter a GitHub repository as owner/repository or a GitHub URL.",
                };
                recompute();
                return;
            }
            projectClone = { ...editor, submitting: true };
            recompute();
            try {
                const projectId = list.projectCloneGithub(source.repository, source.name);
                pendingProjectClones.set(projectId, {
                    generation: projectCloneGeneration,
                    repository: editor.repository,
                });
                projectClone = undefined;
                recompute();
                // The mutation identity is the optimistic project's id, so the
                // route can address its cloning row before the peer answers.
                output({ type: "groupOpenRequested", groupId: projectId });
            } catch (error) {
                if (disposed) return;
                projectClone = {
                    ...editor,
                    submitting: false,
                    error: happyAgentUserError(error).message,
                };
                recompute();
            }
        },
        projectReorder: (projectId, afterId) => list.projectReorder(projectId, afterId),
        botArchive: (botId) => list.botArchive(botId),
        botReorder: (botId, afterId) => list.botReorder(botId, afterId),
        projectArchive: (projectId) => list.projectArchive(projectId),
        async worktreeCreate(projectId) {
            // The new checkout is forked from the project's own folder, so a
            // project whose folder has gone cannot produce one.
            const refusal = groupWorkRefusalFind(projectId);
            if (refusal) throw new Error(refusal);
            // One synchronous act names the workspace, addresses it, and names
            // its first conversation, so the very first frame the reader sees
            // already has the tab and its composer in it. A workspace is
            // somewhere to work, not somewhere to look at, so it arrives the way
            // a new tab does — as a chat, with the checkout's own progress shown
            // in it — instead of as an empty place the reader has to open a chat
            // in themselves.
            const worktreeId = list.worktreeCreate(projectId);
            if (worktreeId === undefined) return;
            output({ type: "groupOpenRequested", groupId: worktreeId });
            worktreeFirstConversationStart(worktreeId);
        },
        worktreeArchive: (projectId, worktreeId) => list.worktreeArchive(projectId, worktreeId),
        worktreeReorder: (projectId, worktreeId, afterId) =>
            list.worktreeReorder(projectId, worktreeId, afterId),

        filePanelOpen(groupId, path, kind, selection) {
            if (disposed) return;
            fileTabOpen(groupId, path, kind, false, "panel", selection);
            panel.fileViewOpen();
        },
        filePanelClose() {
            if (disposed) return;
            panelFileTabClose();
            panel.fileViewClose();
            recompute();
        },
        filePreview: (groupId, path, kind) => fileTabOpen(groupId, path, kind, true),
        fileOpen: (groupId, path, kind, selection) =>
            fileTabOpen(groupId, path, kind, false, "main", selection),
        filePreprocess: (groupId, path, kind) => filePreprocessEnqueue(groupId, path, kind),
        attachmentFileOpen: (source, kind) => {
            const resolved = groupPathResolve(source);
            if (!resolved) return false;
            fileTabOpen(resolved.groupId, resolved.path, kind, false);
            return true;
        },
        viewPlacementUpdate(viewId, placement) {
            if (disposed) return;
            // A live tool tab changes strips and nothing else: the shell keeps
            // running and the page keeps its address, because the tab is drawn
            // somewhere else rather than closed and reopened.
            const tool = panel.get().tabs.find((tab) => tab.id === viewId);
            if (tool) {
                if (tool.placement === placement) return;
                panel.tabPlacementUpdate(tool.id, placement);
                if (placement === "main") {
                    activeMainViewId = tool.id;
                    displayedMainViewId = tool.id;
                    activeMainViewGroupId = addressedGroupId;
                    if (addressedGroupId !== undefined) groupTabRemember(addressedGroupId, tool.id);
                } else if (activeMainViewId === tool.id) {
                    // The main content uncovers whatever it was showing before
                    // this tab arrived: the conversation the address names.
                    activeMainViewId = undefined;
                    displayedMainViewId = undefined;
                    activeMainViewGroupId = undefined;
                    if (addressedGroupId !== undefined && openId !== undefined)
                        groupTabRemember(addressedGroupId, openId);
                }
                recompute();
                return;
            }
            // A file moves by changing the one field that says where it is
            // drawn. Its read, its parsed text, and anything typed into it and
            // not yet saved come along because it is the same tab throughout.
            const file =
                viewId === HAPPY_AGENT_PANEL_FILE_VIEW_ID
                    ? fileTabs.find((tab) => tab.placement === "panel")
                    : fileTabs.find((tab) => tab.id === viewId);
            if (!file || file.placement === placement) return;
            compose(() => {
                if (placement === "panel") {
                    // The viewer is one slot, so whatever was in it steps aside.
                    panelFileTabClose(file.id);
                    if (activeMainViewId === file.id) {
                        activeMainViewId = undefined;
                        displayedMainViewId = undefined;
                    }
                    panel.fileViewOpen();
                } else {
                    panel.fileViewClose();
                    // A glance the reader settled on is a document they keep,
                    // not another replaceable preview.
                    activeMainViewId = file.id;
                    activeMainViewGroupId = undefined;
                }
                fileTabs = fileTabs.map((tab) =>
                    tab.id === file.id
                        ? { ...tab, placement, ...(placement === "main" ? { preview: false } : {}) }
                        : tab,
                );
                if (placement === "main") {
                    client.memory.recentTabRemember({
                        type: "file",
                        groupId: file.groupId,
                        path: file.path,
                        fileKind: file.kind,
                    });
                    groupTabRemember(file.groupId, file.id);
                }
                recompute();
            });
        },
        mainViewSelect(viewId) {
            if (disposed) return;
            if (viewId === undefined) {
                mainViewClear();
                recompute();
                return;
            }
            const file =
                viewId !== undefined ? fileTabs.find((tab) => tab.id === viewId) : undefined;
            const tool =
                file || viewId === undefined
                    ? undefined
                    : panel.get().tabs.find((tab) => tab.id === viewId && tab.placement === "main");
            activeMainViewId = file?.id ?? tool?.id;
            // Ready files commit in this selection action. An unread file keeps
            // the current body until its bytes arrive, so selection never
            // exposes an empty frame.
            if (file) fileReadyDisplay(file.id);
            else displayedMainViewId = tool?.id;
            activeMainViewGroupId = tool ? addressedGroupId : undefined;
            if (file) {
                client.memory.recentTabRemember({
                    type: "file",
                    groupId: file.groupId,
                    path: file.path,
                    fileKind: file.kind,
                });
                groupTabRemember(file.groupId, file.id);
            } else if (addressedGroupId !== undefined) {
                // Selecting nothing puts the open conversation back on screen,
                // which is then the tab this group is being read on.
                const remembered = tool?.id ?? openId;
                if (remembered !== undefined) groupTabRemember(addressedGroupId, remembered);
            }
            recompute();
        },
        mainViewDisplay(presentationId) {
            if (disposed) return;
            const file = fileTabs.find(
                (tab) => tab.id === activeMainViewId && tab.presentationId === presentationId,
            );
            if (!file) return;
            if (displayedMainViewId === file.id && file.displayedPresentationId === presentationId)
                return;
            displayedMainViewId = file.id;
            fileTabs = fileTabs.map((tab) =>
                tab.id === file.id
                    ? {
                          ...tab,
                          displayedKind: file.kind,
                          displayedPath: file.path,
                          displayedPresentationId: presentationId,
                          displayedDocument:
                              file.document.type === "ready" ? file.document.value : undefined,
                      }
                    : tab,
            );
            recompute();
        },
        fileClose: (tabId) => fileTabClose(tabId),
        reviewOpen: (groupId) => reviewTabOpen(groupId),
        reviewClose: (groupId) => reviewTabClose(groupId),
        reviewFileNext: (groupId) => reviewFileStep(groupId, 1),
        reviewFilePrevious: (groupId) => reviewFileStep(groupId, -1),
        reviewRetry: (groupId) => reviewRetry(groupId),
        reviewFileCollapsedToggle: (groupId, path) => reviewFileCollapsedToggle(groupId, path),
        reviewFilesCollapsedSet: (groupId, collapsed) =>
            reviewFilesCollapsedSet(groupId, collapsed),
        reviewFileViewedToggle: (groupId, path) => reviewFileViewedToggle(groupId, path),
        fileRetry(tabId) {
            const tab = fileTabs.find((candidate) => candidate.id === tabId);
            if (tab)
                fileLoad(tabId, fileChangeFind(tab.groupId, tab.path)?.revision ?? tab.revision);
        },
        fileViewModeUpdate(mode) {
            if (fileViewMode === mode) return;
            fileViewMode = mode;
            recompute();
        },
        fileViewWrapUpdate(wrap) {
            if (fileViewWrap === wrap) return;
            fileViewWrap = wrap;
            recompute();
        },
        fileScopeUpdate(groupId, scope) {
            // Even the root directory belongs to the checkout being viewed, so
            // it is read when first wanted rather than for every addressed group.
            if (scope === "all") workspaceFilesEnsure(groupId);
            if (fileScopeOf(groupId) === scope) return;
            viewPreferencesWrite(groupId, { fileScope: scope });
            // The query survives the switch — the reader is still looking for
            // the same thing — but the two scopes answer it from different
            // places, so it is asked again against the one now showing.
            if (fileSearch.query !== "") fileSearchApply(fileSearch.query);
            recompute();
        },
        sliceSelect,
        sliceDelete,
        sliceOpen(groupId, sliceId) {
            panel.filesSelect();
            sliceSelect(groupId, sliceId);
        },
        fileLayoutUpdate(groupId, layout) {
            if (fileScopeOf(groupId) === "all") return;
            if ((groupView(groupId).fileLayout ?? HAPPY_AGENT_FILE_LAYOUT_DEFAULT) === layout)
                return;
            viewPreferencesWrite(groupId, { fileLayout: layout });
            recompute();
        },
        fileSearchUpdate(query) {
            if (fileSearch.query === query) return;
            fileSearchApply(query);
            recompute();
        },
        commentDraftOpen(anchor) {
            fileComments = { ...fileComments, draft: { anchor, text: "" } };
            recompute();
        },
        commentDraftUpdate(text) {
            if (fileComments.draft === undefined) return;
            fileComments = { ...fileComments, draft: { ...fileComments.draft, text } };
            recompute();
        },
        commentDraftCancel() {
            if (fileComments.draft === undefined) return;
            fileComments = { comments: fileComments.comments };
            recompute();
        },
        commentDraftSubmit() {
            const draft = fileComments.draft;
            if (draft === undefined) return;
            const text = draft.text.trim();
            // Nothing was written, so there is nothing to keep. Closing the
            // composer is the whole of what was asked for.
            if (text === "") {
                fileComments = { comments: fileComments.comments };
                recompute();
                return;
            }
            const comment: HappyAgentFileComment = {
                id: `comment:${String(++commentSequence)}` as HappyAgentCommentId,
                anchor: draft.anchor,
                text,
                stale: false,
            };
            fileComments = { comments: [...fileComments.comments, comment] };
            // A written note is already part of what the reader is asking for,
            // so it joins the draft here rather than waiting behind a button
            // that only repeats what writing it down already said.
            fileCommentsProject();
            recompute();
        },
        commentRemove(commentId) {
            const remaining = fileComments.comments.filter(
                (candidate) => candidate.id !== commentId,
            );
            if (remaining.length === fileComments.comments.length) return;
            fileComments = { ...fileComments, comments: remaining };
            fileCommentsProject();
            recompute();
        },
        panelWidthUpdate(groupId, width) {
            const next = Math.round(width);
            if (!Number.isFinite(next) || groupView(groupId).panelWidth === next) return;
            viewPreferencesWrite(groupId, { panelWidth: next });
            recompute();
        },
        fileTreeExpandedUpdate(path, expanded) {
            // Asking for what has already been decided is not a change, and
            // publishing a snapshot for it redraws the workspace over nothing.
            if (expanded ? fileTreeExpanded.has(path) : fileTreeCollapsed.has(path)) return;
            // Both sets are rewritten, because a decision replaces the opposite
            // one: a directory the reader reopens is no longer one they closed.
            const opened = new Set(fileTreeExpanded);
            const closed = new Set(fileTreeCollapsed);
            if (expanded) {
                opened.add(path);
                closed.delete(path);
            } else {
                opened.delete(path);
                closed.add(path);
            }
            fileTreeExpanded = opened;
            fileTreeCollapsed = closed;
            const groupId = addressedGroupId;
            // How this checkout's listing stands is part of how it is being
            // looked at, so it is kept beside the panel width and the layout
            // and comes back the way it was left.
            if (groupId !== undefined)
                viewPreferencesWrite(groupId, {
                    fileTreeOpened: [...opened],
                    fileTreeClosed: [...closed],
                });
            if (expanded && groupId !== undefined && fileScopeOf(groupId) === "all")
                workspaceFilesDirectoryEnsure(groupId, path);
            recompute();
        },
        fileTreeDirectoryPrefetch(path) {
            const groupId = addressedGroupId;
            if (groupId === undefined || fileScopeOf(groupId) !== "all") return;
            workspaceFilesDirectoryEnsure(groupId, path);
        },
        fileTreeLoadMore(path) {
            const groupId = addressedGroupId;
            if (groupId === undefined || fileScopeOf(groupId) !== "all") return;
            const directory = workspaceFiles?.directories.get(path);
            if (directory?.nextCursor === undefined || directory.loading) return;
            workspaceFilesDirectoryLoadSchedule(groupId, path, directory.nextCursor);
        },
        fileDraftUpdate(tabId, draft) {
            // An edit that could never be saved is not an edit; the editor is
            // read-only while the checkout cannot take a write.
            const tab = fileTabs.find((candidate) => candidate.id === tabId);
            if (!tab || !writeAllowed(groupWorkRefusalFind(tab.groupId))) return;
            fileTabs = fileTabs.map((candidate) =>
                candidate.id === tabId && !candidate.saving
                    ? { ...candidate, draft, preview: false }
                    : candidate,
            );
            // Typing in the file moves its lines just as surely as the agent
            // rewriting it does, so notes left on it stop describing where they
            // were left. That the reader did it themselves changes nothing about
            // whether the recorded line numbers still hold.
            fileCommentsStale([tab.path]);
            recompute();
        },
        fileDraftRevert(tabId) {
            // Reverting leaves nothing to write back, so the reason the last
            // write failed is about text that no longer exists.
            fileTabs = fileTabs.map((tab) =>
                tab.id === tabId && !tab.saving && tab.draft !== undefined
                    ? { ...tab, draft: undefined, saveError: undefined }
                    : tab,
            );
            recompute();
        },
        async fileDraftSave(tabId) {
            const tab = fileTabs.find((candidate) => candidate.id === tabId);
            if (!tab || tab.saving || tab.draft === undefined) return;
            const refusal = groupWorkRefusalFind(tab.groupId);
            if (refusal) throw new Error(refusal);
            const draft = tab.draft;
            fileTabs = fileTabs.map((candidate) =>
                candidate.id === tabId
                    ? { ...candidate, saving: true, saveError: undefined }
                    : candidate,
            );
            recompute();
            try {
                const expectedHash =
                    tab.document.type === "ready" ? (tab.document.value.hash ?? null) : null;
                const written = await client.workspaceFileWrite(
                    tab.groupId,
                    tab.path,
                    draft,
                    expectedHash,
                );
                // An accepted write says what the file now contains and what its
                // identity now is, so the tab is told both at once rather than
                // dropping the draft and showing the bytes read before it until
                // a reload answers. That gap was visible: the editor was handed
                // the old text, replaced what was on screen, and the caret and
                // scroll the person was holding went with it.
                fileTabs = fileTabs.map((candidate) =>
                    candidate.groupId === tab.groupId && candidate.path === tab.path
                        ? {
                              ...candidate,
                              document: fileDocumentSaved(candidate.document, draft, written.hash),
                              ...(candidate.id === tabId
                                  ? {
                                        draft: undefined,
                                        saving: false,
                                        saveError: undefined,
                                    }
                                  : {}),
                          }
                        : candidate,
                );
                recompute();
                // An accepted write is first-hand knowledge that the bytes on
                // disk changed, so it reconciles on its own rather than waiting
                // for the watcher to mention what we already did. A write to the
                // working tree moves no revision, so the cached document cannot
                // be told apart from the one read before it: reloading without
                // retiring it scores a hit on the pre-save text and the tab
                // silently reverts what was just saved. Every tab on the path
                // reconciles, not only the one saved from, because one file
                // opened twice is still one file.
                workspaceFilesChanged({ groupId: tab.groupId, paths: [tab.path] });
            } catch (error) {
                // The draft survives a failed write. It is the only copy of what
                // was typed, and throwing it away to report an error would cost
                // more than the error is worth. The reason is kept beside it,
                // because the tab is the only place the reader is looking and a
                // rejected promise alone shows them nothing.
                const failure = happyAgentUserError(error);
                fileTabs = fileTabs.map((candidate) =>
                    candidate.id === tabId
                        ? { ...candidate, saving: false, saveError: failure }
                        : candidate,
                );
                recompute();
                throw failure;
            }
        },

        composerTextUpdate: (text) => (groupComposer ?? composer)?.getState().textUpdate(text),
        composerFocusUpdate: (focused) =>
            (groupComposer ?? composer)?.getState().focusUpdate(focused),
        composerTextSubmit: () => (groupComposer ?? composer)?.getState().textSubmit(),
        composerCommandInvoke: (commandId) => composer?.getState().commandInvoke(commandId),
        composerAttachmentsAdd(files) {
            const target = groupComposer ?? composer;
            if (target) attachmentsAddTo(target, files);
        },
        composerAttachmentRemove(attachmentId) {
            const target = groupComposer ?? composer;
            if (target) attachmentRemoveFrom(target, attachmentId);
        },

        sessionModelUpdate(input) {
            if (groupDraft) groupDraft.modelUpdate(input);
            else chatStore?.modelUpdate(input);
        },
        sessionEffortUpdate(effort) {
            if (groupDraft) groupDraft.effortUpdate(effort);
            else chatStore?.effortUpdate(effort);
        },
        sessionPermissionModeUpdate(permissionMode) {
            if (groupDraft) groupDraft.permissionModeUpdate(permissionMode);
            else chatStore?.permissionModeUpdate(permissionMode);
        },
        sessionServiceTierUpdate(serviceTier) {
            if (groupDraft) groupDraft.serviceTierUpdate(serviceTier);
            else chatStore?.serviceTierUpdate(serviceTier);
        },

        // Stopping is deliberately not guarded. Work already running in a
        // checkout that has gone away is still running, and the reader has to be
        // able to end it; refusing here would leave them watching something they
        // can neither write to nor stop.
        runAbort: () => withChat((store) => store.runAbort()),
        // Ticking an option is not yet an answer, so it is not a write into the
        // checkout and is not guarded like one: nothing leaves this machine until
        // the reader submits.
        requestSelectionUpdate: (requestId, answers) => {
            chatStore?.requestSelectionUpdate(requestId, answers);
        },
        backgroundProcessStop: (processId) =>
            withChat((store) => store.backgroundProcessStop(processId)),
        // These four speak to the session rather than to the directory: the host
        // takes them, orders them behind whatever else that session has pending,
        // and runs them when it can. So they are refused only where a chat is
        // refused, and a workspace whose checkout is still being prepared takes
        // them the same way it takes a message.
        answerInput: (input) =>
            writeGuard(openGroupConversationRefusal(), () =>
                withChat((store) => store.answerInput(input)),
            ),
        compact: () =>
            writeGuard(openGroupConversationRefusal(), () => withChat((store) => store.compact())),
        historyLoadMore: () => chatStore?.historyLoadMore(),
        usageGet: () => withChat((store) => store.usageGet()),
        usagePanelOpen: () => panel.usageSelect(),
        usagePanelClose: () => panel.usageClose(),
        activityPanelOpen: () => {
            chatStore?.activityPanelShow();
            panel.activitySelect();
        },
        activityPanelToggle: () => chatStore?.activityPanelToggle(),
        activityPanelClose: () => {
            chatStore?.activityPanelClose();
            panel.activityClose();
        },
        reasoningToggle: () => chatStore?.reasoningToggle(),
        imageOpen: (messageId, attachmentId) => chatStore?.imageOpen(messageId, attachmentId),
        imageNext: () => chatStore?.imageNext(),
        imagePrevious: () => chatStore?.imagePrevious(),
        imageClose: () => chatStore?.imageClose(),
        openIn: (groupId, target) => {
            // The choice is the reader's, so the control wears it immediately;
            // the host records the same thing durably for the next launch.
            if (openInRecent?.id !== target.id) {
                openInRecent = target;
                recompute();
            }
            return client.openIn(groupId, target);
        },
        botCreateOpen(paint) {
            if (disposed) return;
            botCreatePaint = paint;
            // Asking for the surface while it is already materialized — coming
            // back to it, or the heading action behind it — must not throw away
            // what is being written into it.
            if (botCreateDraft) return;
            botCreateDraft = {
                name: "",
                faces: botFaceSeedsRoll(),
                faceSlot: 0,
                submitting: false,
            };
            const created: ComposerStore = composerStoreCreate(BOT_CREATE_COMPOSER_SCOPE, {
                capabilities: { shellMode: false, commands: [], mentions: false },
                output: (event) => {
                    if (event.type !== "textSubmitted") return;
                    // The composer's own submission lifecycle carries the
                    // whole act: pending while the bot is made and the message
                    // sent, and failed — with the host's reason and a retry —
                    // when the bot could not be made.
                    submitting(
                        created,
                        event.revision,
                        () => botCreateRun({ text: event.text, attachments: event.attachments }),
                        event.attachments,
                    );
                },
            });
            botCreateComposer = created;
            unsubscribeBotCreateComposer = created.subscribe(recompute);
            botCreateSessionDraftEnsure();
            recompute();
        },
        botCreateModelUpdate: (input) => botCreateSessionDraft?.modelUpdate(input),
        botCreateEffortUpdate: (effort) => botCreateSessionDraft?.effortUpdate(effort),
        botCreatePermissionModeUpdate: (mode) => botCreateSessionDraft?.permissionModeUpdate(mode),
        botCreateServiceTierUpdate: (tier) => botCreateSessionDraft?.serviceTierUpdate(tier),
        botCreateNameUpdate(name) {
            if (!botCreateDraft || botCreateDraft.submitting) return;
            botCreateDraft = { ...botCreateDraft, name };
            recompute();
        },
        botCreateFacePick(slot) {
            if (!botCreateDraft || botCreateDraft.submitting || botCreateDraft.faceSlot === slot)
                return;
            botCreateDraft = { ...botCreateDraft, faceSlot: slot };
            recompute();
        },
        botCreateFacesRoll() {
            if (!botCreateDraft || botCreateDraft.submitting) return;
            botCreateDraft = { ...botCreateDraft, faces: botFaceSeedsRoll() };
            recompute();
        },
        botCreateTaskUpdate: (text) => botCreateComposer?.getState().textUpdate(text),
        botCreateTaskFocusUpdate: (focused) => botCreateComposer?.getState().focusUpdate(focused),
        botCreateAttachmentsAdd(files) {
            if (botCreateComposer && !botCreateDraft?.submitting)
                attachmentsAddTo(botCreateComposer, files);
        },
        botCreateAttachmentRemove(attachmentId) {
            if (botCreateComposer && !botCreateDraft?.submitting)
                attachmentRemoveFrom(botCreateComposer, attachmentId);
        },
        botCreateTaskSend: () => {
            if (botCreateDraft?.submitting) return;
            botCreateComposer?.getState().textSubmit();
        },
        async botCreateSubmit() {
            try {
                await botCreateRun(undefined);
            } catch (error) {
                // The surface stays up holding what was typed. It is the only
                // copy of it, and something that failed to be made is something
                // the reader will want to try again rather than retype.
                if (disposed || !botCreateDraft) return;
                botCreateDraft = { ...botCreateDraft, error: happyAgentUserError(error).message };
                recompute();
            }
        },
        botRenameOpen(botId) {
            if (projectArchive?.submitting) return;
            const bot = list.get().bots.find((candidate) => candidate.id === botId);
            if (!bot) return;
            rename = {
                kind: "bot",
                botId,
                currentName: bot.name,
                draft: bot.name,
                submitting: false,
            };
            projectComputeClose();
            recompute();
        },
        renameOpen(projectId, worktreeId) {
            // The settings dialog is where a submitting archive is being shown.
            // Opening another row's settings over it would hide a destructive
            // request the reader is waiting on, so the cog does nothing until
            // that request has an answer.
            if (projectArchive?.submitting) return;
            const projects = list.get().projects;
            if (projects.type !== "ready") return;
            const project = projects.value.find((candidate) => candidate.id === projectId);
            if (!project) return;
            const currentName = worktreeId
                ? project.worktrees.find((worktree) => worktree.id === worktreeId)?.name
                : project.name;
            if (currentName === undefined) return;
            // Seeded with the current name because renaming is usually editing
            // rather than replacing, and an empty field would throw away the
            // thing most renames start from.
            rename = {
                ...(worktreeId
                    ? { kind: "workspace" as const, projectId, worktreeId }
                    : { kind: "project" as const, projectId }),
                currentName,
                draft: currentName,
                submitting: false,
            };
            // Only a project runs sessions; a worktree inherits its project's
            // choice and has nothing of its own to set, so its dialog opens no
            // compute block and follows nothing on the host's behalf.
            if (worktreeId) projectComputeClose();
            else projectComputeOpen(projectId);
            recompute();
        },
        renameDraftUpdate(draft) {
            if (!rename || rename.submitting) return;
            rename = { ...rename, draft };
            recompute();
        },
        renameCancel() {
            if (!rename) return;
            // The confirmation is reached from inside this dialog, so it is put
            // down with it. Never while the host is being told: that request is
            // already gone and still has an answer to report.
            if (
                rename.kind !== "bot" &&
                projectArchive?.projectId === rename.projectId &&
                !projectArchive.submitting
            )
                projectArchive = undefined;
            rename = undefined;
            // The compute block belongs to this dialog and goes with it, which
            // is also what stops following the project and retires every read
            // still on its way back.
            projectComputeClose();
            recompute();
        },
        async renameSubmit() {
            const pending = rename;
            if (!pending || pending.submitting) return;
            const name = pending.draft.trim();
            // Explicitly saving a bot name, even its current placeholder, ends
            // auto-naming eligibility on the daemon.
            if (name.length === 0 || (pending.kind !== "bot" && name === pending.currentName)) {
                rename = undefined;
                recompute();
                return;
            }
            const submitting = { ...pending, submitting: true };
            rename = submitting;
            recompute();
            try {
                await (pending.kind === "bot"
                    ? list.botRename(pending.botId, name)
                    : pending.kind === "workspace"
                      ? list.worktreeRename(pending.projectId, pending.worktreeId, name)
                      : list.projectRename(pending.projectId, name));
            } finally {
                // Closed either way: the list store reports a failed rename by
                // reconciling the old name back, which says more than a dialog
                // stuck open over a row that already shows the answer.
                if (rename === submitting) {
                    rename = undefined;
                    projectComputeClose();
                }
                recompute();
            }
        },
        groupArchiveOpen(groupId) {
            if (groupArchive?.submitting) return;
            const projects = list.get().projects;
            if (projects.type !== "ready") return;
            for (const project of projects.value) {
                if (project.id === groupId) {
                    // The home project is the machine's permanent catch-all;
                    // taking it out only makes it return on the next session.
                    if (project.kind === "home") return;
                    groupArchive = {
                        kind: "project",
                        projectId: project.id,
                        name: project.name,
                        submitting: false,
                    };
                    recompute();
                    return;
                }
                const worktree = project.worktrees.find((candidate) => candidate.id === groupId);
                if (!worktree) continue;
                groupArchive = {
                    kind: "worktree",
                    projectId: project.id,
                    worktreeId: worktree.id,
                    name: worktree.name,
                    submitting: false,
                };
                recompute();
                return;
            }
        },
        groupArchiveCancel() {
            if (!groupArchive || groupArchive.submitting) return;
            groupArchive = undefined;
            recompute();
        },
        async groupArchiveSubmit() {
            const pending = groupArchive;
            if (!pending || pending.submitting) return;
            const submission = ++groupArchiveSubmission;
            groupArchive = { ...pending, submitting: true, error: undefined };
            recompute();
            if (pending.kind === "worktree") {
                const result = await list.worktreeArchive(pending.projectId, pending.worktreeId);
                if (disposed || submission !== groupArchiveSubmission) return;
                groupArchive =
                    result.type === "archived"
                        ? undefined
                        : {
                              ...pending,
                              submitting: false,
                              error: result.error.message,
                          };
                recompute();
                return;
            }
            const result = await list.projectArchive(pending.projectId);
            if (disposed || submission !== groupArchiveSubmission) return;
            groupArchive =
                result.type === "archived"
                    ? undefined
                    : {
                          ...pending,
                          submitting: false,
                          error: result.error.message,
                      };
            recompute();
        },
        projectArchiveOpen(projectId) {
            // An archive already with the host owns this slot until it answers;
            // replacing it here would throw away the pending state of a request
            // that is still going to come back.
            if (projectArchive?.submitting) return;
            const projects = list.get().projects;
            if (projects.type !== "ready") return;
            const project = projects.value.find((candidate) => candidate.id === projectId);
            // Nothing to confirm about a project the list no longer holds: it was
            // archived from somewhere else while this surface was open, and the
            // outcome the reader asked for already holds.
            if (!project) return;
            projectArchive = { projectId, name: project.name, submitting: false };
            recompute();
        },
        projectArchiveCancel() {
            // Not while the host is being told: the request cannot be recalled,
            // and a confirmation that vanished mid-flight would leave the reader
            // guessing at what it did. It resolves on its own, either way.
            if (!projectArchive || projectArchive.submitting) return;
            projectArchive = undefined;
            recompute();
        },
        async projectArchiveSubmit() {
            const pending = projectArchive;
            if (!pending || pending.submitting) return;
            const submission = ++projectArchiveSubmission;
            projectArchive = { projectId: pending.projectId, name: pending.name, submitting: true };
            recompute();
            // The one answer this reads. It is the list store's verified result,
            // not the shape of the catalog afterwards and not a shared error
            // slot: a concurrent mutation can neither clear it nor stand in for
            // it, and an absent row on its own never counts as success.
            const result = await list.projectArchive(pending.projectId);
            // Superseded or gone: a later submission owns the confirmation now,
            // and a disposed workspace has no reader left to tell.
            if (disposed || submission !== projectArchiveSubmission) return;
            if (result.type === "archived") {
                // The host's own catalog no longer holds it — archived here, or
                // already archived when this asked. The settings dialog above
                // this confirmation is describing a project that no longer
                // exists, so it closes with it.
                projectArchive = undefined;
                if (rename && rename.kind !== "bot" && rename.projectId === pending.projectId) {
                    rename = undefined;
                    projectComputeClose();
                }
                recompute();
                return;
            }
            // Refused, unreadable, or still listed. Nothing was navigated away
            // from and nothing was taken out of the list, so the reader is left
            // with the project, the reason, and the same button.
            projectArchive = {
                projectId: pending.projectId,
                name: pending.name,
                submitting: false,
                error: result.error.message,
            };
            recompute();
        },
        projectComputeModeUpdate(mode) {
            const pending = projectCompute;
            // Nothing to choose between until the host has answered, and nothing
            // to change while it is being told.
            if (!pending || pending.status !== "ready" || pending.submitting) return;
            if (pending.mode === mode) return;
            // The reason a previous attempt failed described the choice it was
            // made about; choosing again is not that attempt.
            projectCompute = { ...pending, mode, error: undefined };
            recompute();
        },
        projectComputeImageUpdate(image) {
            const pending = projectCompute;
            if (!pending || pending.status !== "ready" || pending.submitting) return;
            if (pending.image === image) return;
            projectCompute = { ...pending, image, error: undefined };
            recompute();
        },
        async projectComputeSubmit() {
            const pending = projectCompute;
            if (!pending || pending.status !== "ready" || pending.submitting) return;
            const chosen = computeOfDraft(pending);
            // Checked before anything goes out, because the reader is better told
            // what is wrong with what they typed than shown the host's answer
            // about it. Not trimmed into validity: an image with a space in the
            // middle of it is wrong rather than one space shorter.
            if (pending.mode === "docker") {
                const image = pending.image.trim();
                if (image.length === 0) {
                    projectCompute = { ...pending, error: "Name the Docker image to run in." };
                    recompute();
                    return;
                }
                if (/\s/u.test(image)) {
                    projectCompute = {
                        ...pending,
                        error: "A Docker image name cannot contain spaces.",
                    };
                    recompute();
                    return;
                }
            }
            // Already what the host holds. Saying so again would ask the host to
            // answer for nothing, and — because the host counts changes to this
            // setting — would be indistinguishable to it from a change if it did
            // not compare them itself.
            const key = computeKey(chosen);
            if (key === computeKey(pending.current)) {
                projectCompute = { ...pending, error: undefined };
                recompute();
                return;
            }
            // One identity for one choice. Sending the same choice again after a
            // failure — including one where the answer was simply lost — is the
            // same submission and reuses it, so the host recognizes the repeat;
            // choosing something else is a different submission and mints a new
            // one.
            if (projectComputeMutationChoice !== key || projectComputeMutationId === undefined) {
                projectComputeMutationChoice = key;
                projectComputeMutationId = computeMutationIdCreate();
            }
            const mutationId = projectComputeMutationId;
            const projectId = pending.projectId;
            const submission = ++projectComputeSubmission;
            projectCompute = { ...pending, submitting: true, error: undefined };
            recompute();
            const result = await list.projectComputeUpdate(projectId, chosen, mutationId);
            // Superseded, closed, or reopened on another project: a later
            // submission owns this block now, or nothing does. Either way this
            // answer has nowhere to go, and applying it would be applying one
            // project's result to whatever is on screen instead.
            if (disposed || submission !== projectComputeSubmission) return;
            const open = projectCompute;
            if (!open || open.projectId !== projectId) return;
            if (result.type === "failed") {
                // The setting is whatever the host says it is, which this
                // failure does not establish; the block keeps showing the last
                // answer it had, with the reason and the same commit.
                projectCompute = { ...open, submitting: false, error: result.error.message };
                recompute();
                return;
            }
            // Saved, as the host's own read-back of the project describes it —
            // not as it was asked for. The controls are set from that read-back
            // rather than left on the request, so a write that raced another
            // window shows the choice that actually won instead of claiming the
            // one this reader made.
            projectCompute = {
                projectId,
                status: "ready",
                generation: result.state.generation,
                ...(result.state.compute === undefined ? {} : { current: result.state.compute }),
                mode: result.state.compute === undefined ? "default" : result.state.compute.type,
                image:
                    result.state.compute?.type === "docker"
                        ? result.state.compute.image
                        : open.image,
                submitting: false,
            };
            // The submission is done with; the next one starts its own identity
            // even if it makes the same choice again.
            projectComputeMutationId = undefined;
            projectComputeMutationChoice = undefined;
            recompute();
        },
        turnTraceToggle: (turnId) => chatStore?.turnTraceToggle(turnId),
        conversationScrollUpdate(conversationId, position) {
            // Deliberately no `recompute()`. The transcript is the one thing
            // that already knows this position — it just reported it — and
            // feeding it back through the snapshot would re-anchor a list the
            // reader is in the middle of scrolling. It is read once, on mount.
            scrollPositions = new Map(scrollPositions).set(conversationId, position);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            botCreateRelease(true);
            const released = new Set<string>();
            for (const attachments of [
                ...groupAttachments.values(),
                ...conversationAttachments.values(),
            ])
                for (const attachment of attachments) {
                    if (released.has(attachment.id)) continue;
                    released.add(attachment.id);
                    happyAgentComposerAttachmentPreviewRelease(attachment);
                }
            groupAttachments.clear();
            conversationAttachments.clear();
            conversationDraftTexts.clear();
            // Disposing the panel stops every terminal it opened: this connection is
            // going away, and a shell nobody can reach again is an orphan.
            unsubscribePanel();
            panel[Symbol.dispose]();
            unsubscribeSnapshot();
            listeners.clear();
        },
    };
}

/**
 * Whether a freshly projected conversation is indistinguishable from the current
 * one, so the existing object — and every React subtree bound to it — is kept.
 */
/* Stable empties, so an acquiring snapshot recomputed twice stays equal to
   itself and the surface is not notified for nothing. */
const NO_ENTRIES: readonly ConversationEntry[] = [];
const NO_QUEUED: readonly HappyAgentQueuedMessage[] = [];
const NO_SUBMISSIONS: HappyAgentChatSnapshot["requestSubmissions"] = [];
const NO_SELECTIONS: HappyAgentChatSnapshot["requestSelections"] = new Map();
const NO_TASKS: readonly HappyAgentTask[] = [];
const NO_SUBAGENTS: readonly SubagentSummary[] = [];
const NO_PROCESSES: readonly HappyAgentBackgroundProcess[] = [];
const NO_PROCESS_IDS: ReadonlySet<number> = new Set();
const NO_TURNS: ReadonlySet<string> = new Set();

/**
 * The conversation as it reads between being addressed and its chat handle
 * arriving: a live composer, the header the list already knows, and a session
 * that states it is loading. It exists so addressing a conversation never
 * unmounts the input — the reader can type into the new conversation before its
 * transcript has been read.
 */
function conversationAcquiring(
    conversationId: HappyAgentSessionId,
    composer: ComposerSnapshot,
    summary: ConversationSummary | undefined,
    menus?: HappyAgentMenusSnapshot,
): HappyAgentConversationSnapshot {
    return {
        conversationId,
        ready: false,
        session: { type: "loading" },
        ...(summary?.title ? { title: summary.title } : {}),
        ...(summary?.subtitle ? { subtitle: summary.subtitle } : {}),
        entries: NO_ENTRIES,
        composer,
        running: false,
        workingPhase: "working",
        transcriptComplete: true,
        loadingMore: false,
        queuedMessages: NO_QUEUED,
        requestSubmissions: NO_SUBMISSIONS,
        requestSelections: NO_SELECTIONS,
        tasks: NO_TASKS,
        subagents: NO_SUBAGENTS,
        backgroundProcesses: NO_PROCESSES,
        detachedBackgroundProcessIds: NO_PROCESS_IDS,
        activityAvailable: false,
        showReasoning: false,
        expandedTurnIds: NO_TURNS,
        usageLoading: false,
        activityPanelOpen: false,
        ...(menus ? { menus } : {}),
        modelLocked: false,
    };
}

function conversationEqual(
    left: HappyAgentConversationSnapshot,
    right: HappyAgentConversationSnapshot,
): boolean {
    const keys = Object.keys(left) as (keyof HappyAgentConversationSnapshot)[];
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every((key) => left[key] === right[key]);
}
