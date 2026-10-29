import { agentTreeFind, agentTreeUpdate } from "./agentSubtasks.js";
import {
    applyMessageDelta,
    HappyAgentClient,
    HappyAgentApiError,
    type Agent,
    type AgentActivityResponse,
    type AgentContextUsage,
    type AgentDraftSnapshot,
    type Bot,
    type BackgroundProcess,
    type DaemonConfig,
    type DaemonDrain,
    type FailureResolutionResponse,
    type HappyAgentEvent,
    type HappyAgentUpdate,
    type Message,
    type MessageBlock,
    type MessageMode,
    type Profile,
    type Project,
    type Question,
    type Run,
    type SendMessageRequest,
    type SendMessageResponse,
    type SlashCommand,
    type Task,
    type TaskMembership,
    type UsageBreakdown,
    type Workspace,
} from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import { happyAgentServiceTierToWire } from "../happyAgentServiceTier.js";
import { ChatStore } from "./ChatStore.js";
import { userProfilesCreate } from "./userProfiles.js";
import { happyAgentSyncCreate, type HappyAgentHealth } from "./happyAgentSync.js";
import { happyAgentSyncRead } from "./happyAgentSyncRead.js";
import { gitSnapshotStateUpdate, type GitSnapshotState } from "./gitSnapshotState.js";
import { CHECKING_SERVER_COMPATIBILITY, serverCompatibility } from "./compatibility.js";
import { MessageRefusedError, projectRegistrationError } from "./errors.js";
import { deepEqual } from "../happyAgent/happyAgentSupport.js";
import { happyAgentDraftAppended } from "../happyAgent/happyAgentChatDraftAppend.js";
import type { HappyAgentDebugLogInput } from "../happyAgent/happyAgentDebugLogStore.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import {
    agentWorkRunning,
    applyChanges,
    archivedAgentsMerge,
    defaultMode,
    elementsReuse,
    draftPreviewOf,
    modeOf,
    ownerResourceReplace,
    projectElements,
    projectBots,
    projectGroups,
    projectNumericIdentity,
    projectSession,
    projectTasks,
    replaceResource,
    type SessionProjectionInput,
    type TranscriptMessage,
} from "./projection.js";
import type {
    ConnectHappyAgentOptions,
    CreateSessionInput,
    DraftUpdate,
    GroupDelta,
    GroupTarget,
    GroupsState,
    MutationAction,
    MutationRejectedDelta,
    HappyAgentConnection,
    HappyAgentDrain,
    HappyAgentGroupsSubscriptionOptions,
    HappyAgentSessionSubscriptionOptions,
    ServerCompatibility,
    TaskOwner,
} from "./types.js";
import { sidebarReadAheadOrder, type SidebarReadAheadRows } from "./types.js";

const INITIAL_RECONNECT_MS = 250;
const MAXIMUM_RECONNECT_MS = 5_000;
/**
 * How long after a daemon announces it is draining a replacement is expected. Reconnection keeps
 * its first interval meanwhile, so the window is back within moments of the new process.
 */
const REPLACEMENT_RECONNECT_WINDOW_MS = 2 * 60_000;
const DEFAULT_HISTORY_LIMIT = 100;
/** Sessions loaded ahead of an open and never opened that stay cached; older ones are dropped. */
const PREFETCHED_SESSION_LIMIT = 6;
/** Sessions a reader opened and then left that stay cached for a quick return; older ones are dropped. */
const RELEASED_SESSION_LIMIT = 16;
/** How long after a snapshot lands the read-ahead waits, so the first paint and opens come first. */
const PRELOAD_DELAY_MS = 1_500;
/** How often the read-ahead looks again while another session is loading. */
const PRELOAD_BUSY_WAIT_MS = 100;
const GIT_WATCH_RENEW_MS = 2 * 60 * 1000;
const RECENT_EVENT_RETENTION_MS = 60_000;
const SNAPSHOT_RESPONSE_TIMEOUT_MS = 60_000;
/** How long a timestamp-only agent version may wait before it is announced. */
const QUIET_AGENT_PUBLISH_MS = 1_000;

/**
 * The desktop bootstrap as a current daemon serves it: beside the owners and their active
 * agents, the most recently archived agents of those owners, newest first, as full agent
 * objects, and exactly what its health route answers. The published client this package pins
 * does not describe those additive fields yet; this widening goes away with the client release
 * that does. A daemon too old to carry `health` has its health read on its own route.
 */
type DesktopBootstrapCurrent = Awaited<ReturnType<HappyAgentClient["getDesktopBootstrap"]>> & {
    readonly archivedAgents?: readonly Agent[];
    readonly health?: HappyAgentHealth;
};

/**
 * How many updates the feed opened beside the bootstrap may hold while that bootstrap is
 * still out. Past it the read-ahead is dropped and the feed is opened again from the
 * bootstrap's cursor instead, so a slow snapshot cannot pile up a journal in memory.
 */
const FEED_READ_AHEAD_LIMIT = 1_000;
/*
 * Deadline for mutations the daemon answers without doing model work. A
 * create, send, or abort whose response never arrives would otherwise pend
 * forever: the optimistic user message stays beside the copy the event stream
 * delivers, and the per-agent mutation lane stays wedged behind the hung
 * request. Long operations such as compaction are exempt.
 */
const MUTATION_RESPONSE_TIMEOUT_MS = 60_000;
const SEND_ATTEMPTS = 3;
const INITIAL_SEND_RETRY_MS = 250;
/**
 * Draft text is optimistic, so it is projected immediately while persistence
 * waits for a short pause in typing. Emptying a draft is persisted immediately,
 * but message delivery never waits for draft persistence.
 */
const DRAFT_SAVE_DEBOUNCE_MS = 300;
/** How long typing pauses before a row's draft preview follows the composer. */
const DRAFT_PREVIEW_PUBLISH_MS = 1_000;

function debugDetail(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

/** The drain with the process that reported it, when that is known. */
function drainTag(drain: DaemonDrain, daemonId: string | undefined): HappyAgentDrain {
    return daemonId === undefined ? drain : { ...drain, daemonId };
}

/** Every reconnect re-reads the drain; the same one is not announced again. */
function drainSame(left: DaemonDrain | undefined, right: DaemonDrain | undefined): boolean {
    return (
        left === right ||
        (left !== undefined &&
            right !== undefined &&
            left.intent === right.intent &&
            left.cause === right.cause &&
            left.currentVersion === right.currentVersion &&
            left.targetVersion === right.targetVersion &&
            left.startedAt === right.startedAt)
    );
}

function errorDetail(error: unknown): string {
    return error instanceof Error ? (error.stack ?? error.message) : debugDetail(error);
}

interface SessionSubscriber extends HappyAgentSessionSubscriptionOptions {
    closed: boolean;
    following: boolean;
}

interface SessionEntry {
    id: string;
    store: ChatStore;
    subscribers: Set<SessionSubscriber>;
    messages: Map<string, TranscriptMessage>;
    userIds: Set<string>;
    /** Cumulative block offset of the provider segment currently streaming per agent message. */
    messageBlockOffsets: Map<string, number>;
    runs: Map<string, Run>;
    /** `runs` in transcript order, rebuilt only when a run is added or replaced. */
    runsOrdered?: readonly Run[];
    /** Context measurement preserved at each observed terminal run boundary. */
    runFinalContextTokens: Map<string, number>;
    hasMore: boolean;
    loading: Promise<void> | undefined;
    loadRequestedRevision: number;
    loadCompletedRevision: number;
    historyLoaded: boolean;
    loadRetry: Promise<void> | undefined;
    loadRetryMs: number;
    loadingMore: boolean;
    loadMoreError?: string;
    hydrating: boolean;
    /**
     * A question or process update was applied while this session loaded with nobody reading it,
     * so its snapshot may predate it.
     */
    broadcastMissed: boolean;
    bufferedEvents: HappyAgentEvent[];
    activityLoading: Promise<void> | undefined;
    activityRevision: number;
    /** A journal gap made this cached session incomplete; reconcile when it is next observed. */
    reconcileRequired: boolean;
    /** Deltas ignored until a complete message snapshot repairs their message. */
    corruptedMessageIds: Set<string>;
    questionRecovery: Promise<void> | undefined;
    agent?: Agent;
    workspace?: Workspace;
    activity?: AgentActivityResponse;
    question?: Question | null;
    /** Every question seen answered while this connection followed the session, oldest first. */
    answeredQuestions: readonly Question[];
    usage?: UsageBreakdown;
    context?: AgentContextUsage | null;
    draft?: AgentDraftSnapshot;
    mode?: MessageMode | null;
    slashCommands: readonly SlashCommand[];
}

interface GroupsSubscriber extends HappyAgentGroupsSubscriptionOptions {
    closed: boolean;
}

interface RecentEvent {
    event: HappyAgentEvent;
    receivedAt: number;
}

interface DraftSave {
    readonly confirmation?: { readonly finish: (error?: Error) => void };
    readonly draft: AgentDraftSnapshot;
    readonly mutationId: string;
    readonly previousDraft: AgentDraftSnapshot;
    readonly revision: number;
    readonly updatedAt: number;
}

interface PendingDraftSave extends DraftSave {
    readonly timer: ReturnType<typeof setTimeout>;
}

export function connectHappyAgent(options: ConnectHappyAgentOptions): HappyAgentConnection {
    const sync = happyAgentSyncCreate();
    const client = options.client ?? new HappyAgentClient(options);
    const endpoint = options.endpoint.toString();
    const rootController = new AbortController();
    const wait = options.wait ?? abortableWait;
    const now = options.now ?? Date.now;
    const reportDebug = (entry: HappyAgentDebugLogInput): void => options.onDebugEntry?.(entry);
    const nextId = cuid2Create(now);
    const sessions = new Map<string, SessionEntry>();
    const userSessions = new Map<string, Set<SessionEntry>>();
    const users = userProfilesCreate({
        client,
        signal: rootController.signal,
        changed: (id) => {
            // Version/timestamp-only changes never reach here. Only conversations
            // referencing this identity need their denormalized rows reconciled.
            for (const entry of userSessions.get(id) ?? []) {
                if (!entry.hydrating) publishSession(entry, true);
            }
            // A task row wears its owner's face, so the catalog is published
            // again when the person who owns one changes.
            if (groupsStore.getState().tasks.some((task) => task.ownerUserId === id))
                publishGroups();
        },
    });
    const ensureMessageUsers = (messages: readonly Message[]): Promise<void> =>
        users.ensure(
            messages.flatMap((message) =>
                message.role === "user" && message.metadata.userId !== undefined
                    ? [message.metadata.userId]
                    : [],
            ),
        );
    const indexMessageUser = (entry: SessionEntry, message: Message): void => {
        if (message.role !== "user" || message.metadata.userId === undefined) return;
        const id = message.metadata.userId;
        entry.userIds.add(id);
        let references = userSessions.get(id);
        if (!references) userSessions.set(id, (references = new Set()));
        references.add(entry);
    };
    const clearUserIndex = (entry: SessionEntry): void => {
        for (const id of entry.userIds) {
            const references = userSessions.get(id);
            references?.delete(entry);
            if (references?.size === 0) userSessions.delete(id);
        }
        entry.userIds.clear();
    };
    const ingestSessionHistory = (
        entry: SessionEntry,
        runs: readonly (Run & { messages: Message[] })[],
        pending: readonly Message[],
    ): void => {
        ingestHistory(entry, runs, pending);
        for (const run of runs)
            for (const message of run.messages) {
                if (message.role === "user") rememberUserMessageId(message.id);
                indexMessageUser(entry, message);
            }
        for (const message of pending) {
            if (message.role === "user") rememberUserMessageId(message.id);
            indexMessageUser(entry, message);
        }
    };
    const groupSubscribers = new Set<GroupsSubscriber>();
    const intendedModes = new Map<string, MessageMode>();
    const agentDrafts = new Map<string, AgentDraftSnapshot>();
    const agentModes = new Map<string, MessageMode | null>();
    const modeRevisions = new Map<string, number>();
    const pendingSwitchRevisions = new Map<string, number>();
    const adoptedSwitchMessages = new Set<string>();
    const rememberAdoptedSwitchMessage = (key: string): void => {
        adoptedSwitchMessages.delete(key);
        adoptedSwitchMessages.add(key);
        while (adoptedSwitchMessages.size > 1024) {
            adoptedSwitchMessages.delete(adoptedSwitchMessages.values().next().value!);
        }
    };
    const knownUserMessageIds = new Set<string>();
    const rememberUserMessageId = (messageId: string): void => {
        knownUserMessageIds.delete(messageId);
        knownUserMessageIds.add(messageId);
        while (knownUserMessageIds.size > 1024) {
            knownUserMessageIds.delete(knownUserMessageIds.values().next().value!);
        }
    };
    const draftRevisions = new Map<string, number>();
    const unhydratedDraftModes = new Set<string>();
    const unhydratedDraftSaves = new Map<string, DraftSave>();
    const pendingDraftSaves = new Map<string, PendingDraftSave>();
    /*
     * Routine writes the window makes while someone simply reads and types —
     * saving a draft, marking a conversation read — are held while the daemon
     * cannot take them: while it drains for an update, and while the
     * connection is down. Only the latest of each per session is kept, and it
     * is sent once a daemon that admits work is live again. Nothing about a
     * held write is reported, because nothing has gone wrong: the draft is
     * still on screen and will be saved.
     */
    const heldDraftSaves = new Map<string, DraftSave>();
    const heldReads = new Set<string>();
    // Whether the daemon answering admits mutations. A daemon's drain is
    // sticky, so this only becomes true again for a replacement process.
    let admitting = true;
    // What the daemon said of its drain when it began, kept while it admits nothing,
    // with the process that said it when the feed named one.
    let drain: HappyAgentDrain | undefined;
    // Counts the drains recorded. A health read issued before the current one was
    // recorded answered for a moment before the drain, so it neither clears it nor
    // admits the process: a drain is sticky, and only a later read can say otherwise.
    let drainEpoch = 0;
    const draftSaveCancel = (sessionId: string): void => {
        heldDraftSaves.delete(sessionId);
        unhydratedDraftSaves.delete(sessionId);
        const pending = pendingDraftSaves.get(sessionId);
        if (pending === undefined) return;
        clearTimeout(pending.timer);
        pendingDraftSaves.delete(sessionId);
    };
    /**
     * Agents named here and not yet created on the daemon. Opening one is an
     * ordinary thing to do — a workspace hands the reader its first session
     * before its checkout exists — and the daemon has nothing to answer about
     * it, so the transcript is served from what is already known here until the
     * creation lands.
     */
    const unannouncedAgents = new Set<string>();
    const sendConfirmations = new Map<string, () => void>();
    const sessionCreationOutcomes = new Map<string, Promise<void>>();
    const workspaceCreationOutcomes = new Map<string, Promise<void>>();
    const sendAcceptance = new Map<string, Promise<void>>();
    const modeSaveOutcomes = new Map<string, Promise<void>>();
    const renameOutcomes = new Map<string, Promise<void>>();
    const sendAcceptanceCreate = (id: string) => {
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<void>((accepted, refused) => {
            resolve = accepted;
            reject = refused;
        });
        // The ordinary optimistic send has no promise consumer.
        void promise.catch(() => undefined);
        sendAcceptance.set(id, promise);
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            rootController.signal.removeEventListener("abort", aborted);
            if (error) reject(error);
            else resolve();
            queueMicrotask(() => sendAcceptance.delete(id));
        };
        const aborted = () =>
            finish(new Error("The connection ended before message acceptance was confirmed."));
        rootController.signal.addEventListener("abort", aborted, { once: true });
        return { accept: () => finish(), reject: (error: Error) => finish(error) };
    };
    const mutationQueues = new Map<string, Promise<void>>();
    const sessionCreations = new Map<string, Promise<void>>();
    /** Tasks behind new work this connection listed before the daemon made them. */
    const stemCellTasks = new Set<string>();
    const sessionMutationCounts = new Map<string, number>();
    const gitStates = new Map<string, GitSnapshotState>();
    const processOwners = new Map<string, string>();
    let config: DaemonConfig | undefined;
    let currentUserId: string | undefined;
    let viewerProfileLoading: Promise<void> | undefined;
    let cursor: string | undefined;
    let resyncTask: Promise<void> | undefined;
    const resyncBufferedEvents: HappyAgentEvent[] = [];
    const hydrationBroadcastEvents: HappyAgentEvent[] = [];
    const recentEvents: RecentEvent[] = [];
    let compatibility: ServerCompatibility = CHECKING_SERVER_COMPATIBILITY;
    let closed = false;
    let updatesAttemptController: AbortController | undefined;
    let retryRequested = false;
    let retryWake: (() => void) | undefined;

    /** The group/catalog pipeline state this connection reconciles and publishes. */
    interface GroupsStoreState {
        readonly projects: readonly Project[];
        readonly workspaces: readonly Workspace[];
        readonly bots: readonly Bot[];
        /** Every task the host holds, archived ones included. */
        readonly tasks: readonly Task[];
        /** The caller's own memberships; order is by `orderKey`, not array position. */
        readonly taskMemberships: readonly TaskMembership[];
        readonly connection: GroupsState["connection"];
        /** The published group projection, rebuilt by `publishGroups`. */
        readonly groups: ReturnType<typeof projectGroups>;
        /** The published bot projection, rebuilt beside `groups`. */
        readonly botGroups: ReturnType<typeof projectBots>;
        /** The published task projection, rebuilt beside `groups`. */
        readonly taskGroups: ReturnType<typeof projectTasks>;
    }

    const groupsStore = createStore<GroupsStoreState>()(() => ({
        botGroups: [],
        bots: [],
        connection: "connecting",
        groups: [],
        projects: [],
        taskGroups: [],
        taskMemberships: [],
        tasks: [],
        workspaces: [],
    }));

    reportDebug({
        detail: debugDetail({ endpoint }),
        level: "info",
        message: "Happy Agent connection created",
        source: "connection",
    });

    const reportCompatibility = (next: ServerCompatibility): void => {
        compatibility = next;
        options.onCompatibilityChange?.(next);
    };

    // The daemon process the managed feed last named. It outlives any one
    // `updates()` iterator, so a replacement that happened while the feed was
    // being reopened is still recognized as one.
    let daemonId: string | undefined;
    // Set when the process answering may no longer be the one whose health
    // admitted this connection. Until its own health is read and found
    // compatible and ready, nothing is taken from it: no bootstrap, no feed.
    let daemonVerify = false;
    // Until when a drained daemon's replacement is expected; see REPLACEMENT_RECONNECT_WINDOW_MS.
    let replacementExpectedUntil = 0;

    const reportMutationFailure = (
        action: MutationAction,
        mutationId: string,
        error: unknown,
        sessionId?: string,
    ): void => {
        reportDebug({
            detail: debugDetail({
                action,
                error: errorDetail(error),
                mutationId,
                ...(sessionId === undefined ? {} : { sessionId }),
            }),
            level: "error",
            message: `Mutation failed: ${action}`,
            source: "mutation",
        });
        const rejection: MutationRejectedDelta = {
            action,
            message: error instanceof Error ? error.message : String(error),
            mutationId,
            type: "mutation_rejected",
        };
        options.onMutationRejected?.(rejection);
        for (const subscriber of groupSubscribers) subscriber.onDelta?.(rejection);
        const session = sessionId === undefined ? undefined : sessions.get(sessionId);
        if (session !== undefined) {
            for (const subscriber of session.subscribers) subscriber.onDelta?.(rejection);
        }
    };

    const reportBackgroundError = (error: unknown): void => {
        if (rootController.signal.aborted) return;
        reportDebug({
            detail: errorDetail(error),
            level: "error",
            message: "Background state task failed",
            source: "sync",
        });
        for (const subscriber of groupSubscribers) subscriber.onError?.(error);
        for (const entry of sessions.values()) {
            for (const subscriber of entry.subscribers) subscriber.onError?.(error);
        }
    };

    const background = (task: Promise<unknown>): void => {
        void task.catch(reportBackgroundError);
    };

    /** Created at each request so queued work receives its full response window. */
    const deadlineSignal = (timeoutMs = MUTATION_RESPONSE_TIMEOUT_MS): AbortSignal =>
        AbortSignal.any([rootController.signal, AbortSignal.timeout(timeoutMs)]);

    const groupState = (): GroupsState => ({
        connection: groupsStore.getState().connection,
        sessionsComplete: config !== undefined,
        ...(admitting ? {} : { admitting: false as const }),
        ...(drain === undefined ? {} : { drain }),
    });

    /**
     * The person a task belongs to, as this connection can name them.
     *
     * A team task names its owner, who is resolved through the user directory
     * like any other identity this connection renders. A team task that names
     * nobody is left without a face rather than given the viewer's, because in
     * a team the viewer is not everybody. A standalone daemon has one person,
     * every task is theirs, and so it shows no owner at all: `null`.
     */
    const taskOwnerOf = (task: Task): TaskOwner | null => {
        const base = endpoint.replace(/\/$/, "");
        if (task.ownerUserId !== null) {
            const profile = users.profiles.get(task.ownerUserId);
            return {
                userId: task.ownerUserId,
                ...(profile === undefined || profile.name === "DELETED"
                    ? {}
                    : { name: profile.name }),
                ...(profile?.avatar
                    ? {
                          avatar: {
                              url: `${base}/v0/users/${encodeURIComponent(task.ownerUserId)}/photo`,
                              thumbhash: profile.avatar.thumbhash,
                          },
                      }
                    : {}),
            };
        }
        return currentUserId === undefined ? null : {};
    };

    /** Reads the people who own tasks, so their rows can wear their faces. */
    const taskOwnersEnsure = (tasks: readonly Task[]): void => {
        const ids = [
            ...new Set(
                tasks.flatMap((task) => (task.ownerUserId === null ? [] : [task.ownerUserId])),
            ),
        ].filter((id) => !users.profiles.has(id));
        if (ids.length > 0) background(users.ensure(ids));
    };

    const publishGroupDeltas = (deltas: readonly GroupDelta[]): void => {
        for (const subscriber of groupSubscribers) {
            if (subscriber.closed) continue;
            for (const delta of deltas) subscriber.onDelta?.(delta);
        }
    };

    const publishGroups = (deltas: readonly GroupDelta[] = []): void => {
        if (config !== undefined) {
            const daemonConfig = config;
            groupsStore.setState((current) => ({
                groups: projectGroups(
                    current.projects,
                    current.workspaces,
                    endpoint,
                    daemonConfig,
                    gitStates,
                    agentDrafts,
                    agentModes,
                ),
                botGroups: projectBots(
                    current.bots,
                    current.workspaces,
                    endpoint,
                    daemonConfig,
                    agentDrafts,
                    agentModes,
                ),
                taskGroups: projectTasks(
                    current.tasks,
                    current.taskMemberships,
                    current.workspaces,
                    endpoint,
                    daemonConfig,
                    taskOwnerOf,
                    agentDrafts,
                    agentModes,
                ),
            }));
        }
        const state = groupState();
        const { botGroups, groups, taskGroups } = groupsStore.getState();
        for (const subscriber of groupSubscribers) {
            if (subscriber.closed) continue;
            subscriber.onChange(groups, state, botGroups, taskGroups);
            for (const delta of deltas) subscriber.onDelta?.(delta);
        }
    };

    /**
     * The session's runs in transcript order. Ordering them is the one part of
     * building a projection input that is not a pointer copy, and a run only
     * changes when a turn starts or ends — never on the stream of updates inside
     * one — so the order is kept until something actually replaces a run.
     */
    const runsOrderedOf = (entry: SessionEntry): readonly Run[] => {
        const cached = entry.runsOrdered;
        if (cached !== undefined) return cached;
        const ordered = [...entry.runs.values()].sort(runCompare);
        entry.runsOrdered = ordered;
        return ordered;
    };

    const toolCallMediaUrl = (agentId: string, toolCallId: string, index: number): string =>
        client.toolCallMediaUrl(agentId, toolCallId, index);

    const projectionOf = (entry: SessionEntry): SessionProjectionInput | undefined => {
        if (entry.agent === undefined || config === undefined) return undefined;
        return {
            agent: entry.agent,
            config,
            connection: groupsStore.getState().connection,
            endpoint,
            mediaUrl: toolCallMediaUrl,
            hasMore: entry.hasMore,
            messages: [...entry.messages.values()],
            userProfiles: users.profiles,
            currentUserId,
            intendedMode: intendedModes.get(entry.id),
            ...(entry.mode === undefined ? {} : { mode: entry.mode }),
            ...(entry.draft === undefined ? {} : { draft: entry.draft }),
            ...(entry.context === undefined ? {} : { context: entry.context }),
            ...(entry.activity === undefined ? {} : { activity: entry.activity }),
            ...(entry.question === undefined ? {} : { question: entry.question }),
            answeredQuestions: entry.answeredQuestions,
            slashCommands: entry.slashCommands,
            runs: runsOrderedOf(entry),
            runFinalContextTokens: entry.runFinalContextTokens,
            ...(entry.usage === undefined ? {} : { usage: entry.usage }),
            workspace: entry.workspace ?? workspaceOf(entry.agent.workspaceId),
        };
    };

    /**
     * Keeps a question the daemon reports answered. Its pending question is the
     * only one the agent API names, and the next one replaces it, so this is
     * what lets an answered question keep its place in the transcript.
     */
    const answeredQuestionRecord = (entry: SessionEntry): void => {
        const question = entry.question;
        if (question === undefined || question === null || question.status !== "answered") return;
        const at = entry.answeredQuestions.findIndex((known) => known.id === question.id);
        if (at < 0) entry.answeredQuestions = [...entry.answeredQuestions, question];
        else if (entry.answeredQuestions[at] !== question)
            entry.answeredQuestions = entry.answeredQuestions.map((known, index) =>
                index === at ? question : known,
            );
    };

    const publishSession = (entry: SessionEntry, force = false): void => {
        answeredQuestionRecord(entry);
        // The connection-wide cache still owns inactive sessions, but there is
        // nobody to consume a projected ChatStore snapshot while a session is
        // not subscribed. In particular, do not parse/project the whole
        // transcript for every token in a background run. Authoritative loads
        // pass `force` so a later acquisition sees the complete cached state.
        if (!force && entry.subscribers.size === 0) return;
        const projection = projectionOf(entry);
        if (projection === undefined) return;
        let session = projectSession(projection);
        if (!entry.historyLoaded) session = { ...session, historyLoading: true };
        if (entry.loadingMore) session = { ...session, loadingMore: true };
        if (entry.loadMoreError !== undefined) {
            session = { ...session, loadMoreError: entry.loadMoreError };
        }
        // An event that changed nothing in the transcript still rebuilds this
        // array, out of the same row objects. Handing back the previous array
        // lets every reader downstream settle it with one comparison.
        const elements = elementsReuse(entry.store.elements(), projectElements(projection));
        const deltas = entry.store.replace(elements, session);
        for (const subscriber of entry.subscribers) {
            if (subscriber.closed) continue;
            subscriber.onChange(elements, session);
            for (const delta of deltas) subscriber.onDelta?.(delta);
        }
    };

    /** Ownership is scoped to this authenticated connection, never the host's account. */
    const viewerIdentityUpdate = (profile: Profile): void => {
        const next = profile.userId ?? undefined;
        // Whether there is a viewer user at all decides whether this is a team,
        // and so whether task rows show an owner.
        const taskOwnersChanged = next !== currentUserId;
        if (next !== currentUserId) {
            const previous = currentUserId;
            currentUserId = next;
            const affected = new Set<SessionEntry>();
            for (const id of [previous, next]) {
                if (id === undefined) continue;
                for (const entry of userSessions.get(id) ?? []) affected.add(entry);
            }
            for (const entry of affected) {
                if (!entry.hydrating) publishSession(entry, true);
            }
        }
        if (taskOwnersChanged && config !== undefined && groupsStore.getState().tasks.length > 0)
            publishGroups();
    };

    const reloadViewerProfile = (): Promise<void> => {
        if (viewerProfileLoading !== undefined) return viewerProfileLoading;
        const loading = happyAgentSyncRead(
            rootController.signal,
            () => client.getProfile({ signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS) }),
            (error) =>
                reportDebug({
                    detail: errorDetail(error),
                    level: "warning",
                    message: "Current user profile read failed; retrying",
                    source: "sync",
                }),
        )
            .then(({ profile }) => {
                if (!closed) viewerIdentityUpdate(profile);
            })
            .finally(() => {
                if (viewerProfileLoading === loading) viewerProfileLoading = undefined;
            });
        viewerProfileLoading = loading;
        return loading;
    };

    /** Preserve the context measurement that belongs to a concrete settled run. */
    const captureRunFinalContext = (entry: SessionEntry, run: Run): void => {
        const contextTokens = entry.context?.contextTokens;
        if (
            run.status === "running" ||
            contextTokens === undefined ||
            !Number.isFinite(contextTokens)
        )
            return;
        entry.runFinalContextTokens.set(run.id, Math.max(0, Math.round(contextTokens)));
    };

    /** A context update after the terminal event still belongs to the newest idle run. */
    const captureLatestIdleRunFinalContext = (entry: SessionEntry): void => {
        const runs = runsOrderedOf(entry);
        if (runs.some((run) => run.status === "running")) return;
        const latest = runs.at(-1);
        if (latest !== undefined) captureRunFinalContext(entry, latest);
    };

    const publishConnection = (next: GroupsState["connection"]): void => {
        const previous = groupsStore.getState().connection;
        if (previous === next) return;
        groupsStore.setState({ connection: next });
        reportDebug({
            detail: debugDetail({ previous, next }),
            level: next === "reconnecting" ? "warning" : "info",
            message: `Connection state changed: ${previous} → ${next}`,
            source: "connection",
        });
        publishGroups([{ type: "groups_state_changed", state: groupState() }]);
        for (const entry of sessions.values()) publishSession(entry);
    };

    /**
     * Records whether the daemon answering admits new work, and tells the
     * window when that changes: it is what says the agent is restarting, from
     * the drain until a replacement process admits work again.
     */
    const admittingSet = (
        next: boolean,
        reported?: DaemonDrain | null,
        reporter?: string,
    ): void => {
        // The drain is sticky and the daemon names it once. A report that does
        // not carry it, such as a refused write, keeps what was already said.
        // Only the managed feed names the process; a health read keeps the
        // name already given to the same drain, and never guesses one.
        const nextDrain: HappyAgentDrain | undefined = next
            ? undefined
            : !reported
              ? drain
              : reporter !== undefined
                ? drainTag(reported, reporter)
                : drain !== undefined && drainSame(drain, reported)
                  ? drain
                  : reported;
        if (nextDrain !== undefined && !drainSame(drain, nextDrain)) drainEpoch += 1;
        if (
            admitting === next &&
            drainSame(drain, nextDrain) &&
            drain?.daemonId === nextDrain?.daemonId
        )
            return;
        const changed = admitting !== next;
        admitting = next;
        drain = nextDrain;
        if (!changed) {
            publishGroups([{ type: "groups_state_changed", state: groupState() }]);
            return;
        }
        reportDebug({
            detail: debugDetail({ admitting: next, ...(nextDrain ? { drain: nextDrain } : {}) }),
            level: "info",
            message: next
                ? "Happy Agent admits new work"
                : "Happy Agent stopped admitting new work",
            source: "connection",
        });
        publishGroups([{ type: "groups_state_changed", state: groupState() }]);
    };

    const workspaceOf = (workspaceId: string): Workspace | undefined =>
        groupsStore.getState().workspaces.find((candidate) => candidate.id === workspaceId);

    const botOf = (botId: string): Bot | undefined =>
        groupsStore.getState().bots.find((candidate) => candidate.id === botId);

    const taskOf = (taskId: string): Task | undefined =>
        groupsStore.getState().tasks.find((candidate) => candidate.id === taskId);

    const agentOf = (agentId: string): Agent | undefined => {
        const { bots, projects, tasks, workspaces } = groupsStore.getState();
        for (const bot of bots) {
            const agent = agentTreeFind(bot.agent, agentId);
            if (agent !== undefined) return agent;
        }
        for (const task of tasks) {
            const agent = agentTreeFind(task.agent, agentId);
            if (agent !== undefined) return agent;
        }
        for (const workspace of workspaces) {
            for (const root of workspace.agents) {
                const agent = agentTreeFind(root, agentId);
                if (agent !== undefined) return agent;
            }
        }
        for (const project of projects) {
            for (const root of project.agents) {
                const agent = agentTreeFind(root, agentId);
                if (agent !== undefined) return agent;
            }
        }
        const materialized = sessions.get(agentId)?.agent;
        if (materialized !== undefined) return materialized;
        for (const entry of sessions.values()) {
            const agent = entry.activity?.subagents.find((candidate) => candidate.id === agentId);
            if (agent !== undefined) return agent;
        }
        return undefined;
    };

    const shouldAdoptVersion = (
        current: { id: string; version: string } | undefined,
        updated: { id: string; version: string },
    ): boolean =>
        current === undefined ||
        current.version === current.id ||
        current.version.localeCompare(updated.version) <= 0;

    const ownerAgentReplace = <Owner extends { readonly id: string; readonly agents: Agent[] }>(
        owner: Owner,
        agent: Agent,
    ): Owner => {
        // A child may work in another workspace. Its event must still replace
        // the embedded ancestry used by the original workspace's live marker.
        const updated = owner.agents.map((root) => agentTreeUpdate(root, agent));
        const agents =
            owner.id === agent.workspaceId || updated.some((root) => root.id === agent.id)
                ? (replaceResource(updated, agent) as Agent[])
                : updated;
        return agents.length === owner.agents.length &&
            agents.every((root, index) => root === owner.agents[index])
            ? owner
            : { ...owner, agents };
    };

    const replaceAgent = (agent: Agent): void => {
        storeAgent(agent);
        announceAgent(agent);
        publishGroups();
    };

    /** Keeps one agent version everywhere this connection holds it, without telling anyone. */
    const storeAgent = (agent: Agent): void => {
        groupsStore.setState((current) => ({
            workspaces: current.workspaces.map((workspace) => ownerAgentReplace(workspace, agent)),
            projects: current.projects.map((project) => ownerAgentReplace(project, agent)),
            // A bot's row is drawn from the agent embedded in the bot, so the
            // same versioned agent event has to reach that copy too — otherwise
            // the bot keeps reporting the status it was created with.
            bots: current.bots.map((bot) => {
                const next = agentTreeUpdate(bot.agent, agent);
                return next === bot.agent ? bot : { ...bot, agent: next };
            }),
            // A task's row is drawn from its embedded agent the same way.
            tasks: current.tasks.map((task) => {
                const next = agentTreeUpdate(task.agent, agent);
                return next === task.agent ? task : { ...task, agent: next };
            }),
        }));
        const entry = sessions.get(agent.id);
        if (entry !== undefined) {
            entry.agent = agent;
            entry.workspace = workspaceOf(agent.workspaceId);
        }
    };

    /** Publishes the stored agent to its own session and to every parent that lists it. */
    const announceAgent = (agent: Agent): void => {
        const entry = sessions.get(agent.id);
        if (entry !== undefined) publishSession(entry);
        // Activity is a one-time snapshot followed by the same versioned agent
        // events as the catalog. Keep parent views current from that stream
        // instead of re-reading the entire activity endpoint after child work.
        for (const parent of sessions.values()) {
            const activity = parent.activity;
            if (activity === undefined) continue;
            const previous = activity.subagents.find((candidate) => candidate.id === agent.id);
            if (previous === undefined && agent.parentAgentId !== parent.id) continue;
            // An agent event does not carry the activity's token total, so the one
            // already known stays; a child that has just finished is read again for
            // the total its last run recorded. The field is additive over published
            // client 0.0.98, hence the reads through `unknown`.
            const known = (previous as { totalTokens?: unknown } | undefined)?.totalTokens;
            setActivity(parent, {
                ...activity,
                subagents: [
                    ...replaceResource(
                        activity.subagents,
                        typeof known === "number" ? { ...agent, totalTokens: known } : agent,
                    ),
                ],
            });
            publishSession(parent);
            if (previous !== undefined && previous.status !== "idle" && agent.status === "idle")
                recoverActivity(parent);
        }
    };

    /**
     * Agents stored since their last publication with nothing changed but `updatedAt`.
     *
     * While a provider streams, the daemon versions the agent once per delta and the only
     * field that moves is its timestamp. Each such version is stored at once, so the version
     * chain and every read stay exact, and the session itself, when someone has it open, shows
     * it at once. Announcing it to the catalog would re-project and re-render every session row,
     * so the catalog and parents hear of it together, at most once a second; any other change
     * to the agent announces it everywhere immediately.
     */
    const quietAgentIds = new Set<string>();
    let quietPublishTimer: ReturnType<typeof setTimeout> | undefined;

    const quietAgentStore = (agent: Agent): void => {
        storeAgent(agent);
        const entry = sessions.get(agent.id);
        if (entry !== undefined) publishSession(entry);
        quietAgentIds.add(agent.id);
        quietPublishTimer ??= setTimeout(quietAgentsPublish, QUIET_AGENT_PUBLISH_MS);
    };

    const quietAgentsPublish = (): void => {
        quietPublishTimer = undefined;
        if (closed) return;
        const ids = [...quietAgentIds];
        quietAgentIds.clear();
        for (const id of ids) {
            const agent = agentOf(id);
            if (agent !== undefined) announceAgent(agent);
        }
        if (ids.length > 0) publishGroups();
    };

    const adoptAgent = (agent: Agent): boolean => {
        if (!shouldAdoptVersion(agentOf(agent.id), agent)) return false;
        replaceAgent(agent);
        return true;
    };

    /**
     * The stamp for an edit made over `previous`. The host keeps whichever save
     * is stamped later, and the draft it holds may have been stamped by another
     * device whose clock runs ahead of this one; an edit stamped by this clock
     * alone would be refused as stale and the stored text handed back over what
     * was just typed. So an edit is always stamped after the draft it replaces.
     */
    const draftStampAfter = (previous: AgentDraftSnapshot, at: number): number =>
        Math.max(at, (previous.updatedAt ?? 0) + 1);

    const draftHoldsText = (draft: AgentDraftSnapshot | undefined): boolean =>
        (draft?.value?.text ?? "") !== "";

    const replaceDraft = (agentId: string, draft: AgentDraftSnapshot): void => {
        const previous = agentDrafts.get(agentId);
        agentDrafts.set(agentId, draft);
        const entry = sessions.get(agentId);
        if (entry !== undefined) {
            entry.draft = draft;
            publishSession(entry);
        }
        // A row shows the mode a draft picks at once. The start of its text
        // follows a second after typing pauses, or at once when it empties,
        // so typing does not redraw every list on each keystroke.
        if (
            config !== undefined &&
            draftHoldsText(previous) === draftHoldsText(draft) &&
            deepEqual(
                modeOf(config, previous, agentModes.get(agentId)),
                modeOf(config, draft, agentModes.get(agentId)),
            )
        ) {
            const preview = draftPreviewOf(draft);
            if (preview === draftPreviewOf(previous)) return;
            if (preview === undefined) draftPreviewPublish();
            else draftPreviewSchedule();
            return;
        }
        publishGroups();
    };

    let draftPreviewTimer: ReturnType<typeof setTimeout> | undefined;
    const draftPreviewPublish = (): void => {
        clearTimeout(draftPreviewTimer);
        draftPreviewTimer = undefined;
        if (!rootController.signal.aborted) publishGroups();
    };
    const draftPreviewSchedule = (): void => {
        clearTimeout(draftPreviewTimer);
        draftPreviewTimer = setTimeout(draftPreviewPublish, DRAFT_PREVIEW_PUBLISH_MS);
    };
    rootController.signal.addEventListener("abort", () => clearTimeout(draftPreviewTimer));

    const adoptDraft = (agentId: string, draft: AgentDraftSnapshot): boolean => {
        const current = agentDrafts.get(agentId);
        if (
            current?.updatedAt !== null &&
            current?.updatedAt !== undefined &&
            (draft.updatedAt === null || draft.updatedAt < current.updatedAt)
        ) {
            return false;
        }
        const pending = pendingDraftSaves.get(agentId);
        if (
            pending !== undefined &&
            draft.updatedAt !== null &&
            draft.updatedAt >= pending.updatedAt
        ) {
            draftSaveCancel(agentId);
            if (draftRevisions.get(agentId) === pending.revision) draftRevisions.delete(agentId);
        }
        const held = heldDraftSaves.get(agentId);
        if (held !== undefined && draft.updatedAt !== null && draft.updatedAt >= held.updatedAt) {
            heldDraftSaves.delete(agentId);
            if (draftRevisions.get(agentId) === held.revision) draftRevisions.delete(agentId);
        }
        const unhydrated = unhydratedDraftSaves.get(agentId);
        if (
            unhydrated !== undefined &&
            draft.updatedAt !== null &&
            draft.updatedAt >= unhydrated.updatedAt
        ) {
            unhydratedDraftSaves.delete(agentId);
            if (draftRevisions.get(agentId) === unhydrated.revision) draftRevisions.delete(agentId);
        }
        unhydratedDraftModes.delete(agentId);
        replaceDraft(agentId, draft);
        const entry = sessions.get(agentId);
        if (entry !== undefined) settleSessionIfIdle(entry);
        return true;
    };

    const adoptProject = (project: Project, deltas: readonly GroupDelta[] = []): boolean => {
        const current = groupsStore
            .getState()
            .projects.find((candidate) => candidate.id === project.id);
        if (!shouldAdoptVersion(current, project)) return false;
        groupsStore.setState((state) => ({
            projects: ownerResourceReplace(state.projects, project),
        }));
        publishGroups(deltas);
        return true;
    };

    const adoptWorkspace = (workspace: Workspace, deltas: readonly GroupDelta[] = []): boolean => {
        if (!shouldAdoptVersion(workspaceOf(workspace.id), workspace)) return false;
        groupsStore.setState((state) => ({
            workspaces: ownerResourceReplace(state.workspaces, workspace),
        }));
        publishGroups(deltas);
        return true;
    };

    const setActivity = (entry: SessionEntry, activity: AgentActivityResponse): void => {
        for (const [processId, agentId] of processOwners) {
            if (agentId === entry.id) processOwners.delete(processId);
        }
        for (const process of activity.processes) {
            if (process.status === "running") processOwners.set(process.id, entry.id);
        }
        entry.activity = activity;
        entry.activityRevision += 1;
    };

    /**
     * Releases transient mutation bookkeeping while retaining the hydrated
     * session itself. One Happy Agent-wide managed update feed keeps that cached entry
     * current, so closing and reopening a view never needs another bootstrap
     * read.
     */
    const settleSessionIfIdle = (entry: SessionEntry): void => {
        if (
            !closed &&
            !rootController.signal.aborted &&
            entry.subscribers.size === 0 &&
            entry.loading === undefined
        ) {
            // Flushing on view close sends the default mode, matching base behavior.
            if (unhydratedDraftModes.has(entry.id)) draftSaveFlush(entry.id);
            unhydratedDraftSaveFlush(entry.id);
        }
        if (
            entry.subscribers.size > 0 ||
            entry.loading !== undefined ||
            entry.questionRecovery !== undefined ||
            (sessionMutationCounts.get(entry.id) ?? 0) > 0 ||
            pendingDraftSaves.has(entry.id) ||
            heldDraftSaves.has(entry.id) ||
            unhydratedDraftSaves.has(entry.id)
        ) {
            return;
        }
        if (sessions.get(entry.id) !== entry) return;
        draftRevisions.delete(entry.id);
        const intended = intendedModes.get(entry.id);
        const agent = agentOf(entry.id);
        if (
            intended !== undefined &&
            agent !== undefined &&
            config !== undefined &&
            modesEqual(
                modeOf(config, agentDrafts.get(entry.id), agentModes.get(entry.id)),
                intended,
            )
        ) {
            intendedModes.delete(entry.id);
        }
    };

    /**
     * Question and process updates name no session, so they wait while a session someone reads
     * is loading. One loading with nobody reading it, read ahead or prefetched, holds no one
     * else's updates back; it reconciles once it lands instead.
     */
    const broadcastHeld = (): boolean =>
        [...sessions.values()].some((entry) => entry.hydrating && entry.subscribers.size > 0);

    const drainHydrationBroadcastEvents = (): void => {
        if (broadcastHeld()) return;
        const buffered = hydrationBroadcastEvents.splice(0);
        for (const event of buffered) applyEvent(event);
    };

    const rememberEvent = (event: HappyAgentEvent): void => {
        const receivedAt = now();
        recentEvents.push({ event, receivedAt });
        const cutoff = receivedAt - RECENT_EVENT_RETENTION_MS;
        let expired = 0;
        while (recentEvents[expired]?.receivedAt < cutoff) expired += 1;
        if (expired > 0) recentEvents.splice(0, expired);
    };

    const eventsForSessionAfter = (
        entry: SessionEntry,
        after: string,
        buffered: readonly HappyAgentEvent[],
    ): HappyAgentEvent[] => {
        const events = new Map<string, HappyAgentEvent>();
        if (resyncTask === undefined) {
            for (const candidate of recentEvents) {
                const event = candidate.event;
                if (event.cursor.localeCompare(after) > 0 && agentIdOfEvent(event) === entry.id) {
                    events.set(event.cursor, event);
                }
            }
        }
        // A connection-wide resync replays the journal it buffered itself.
        // Replaying the rolling window here as well would apply the same
        // non-idempotent message delta twice.
        // A hydration can outlive the rolling window. Its direct buffer keeps
        // every event needed by that in-flight read until the snapshot lands.
        for (const event of buffered) {
            if (event.cursor.localeCompare(after) > 0) events.set(event.cursor, event);
        }
        return [...events.values()].sort((left, right) => left.cursor.localeCompare(right.cursor));
    };

    const scheduleSessionLoadRetry = (entry: SessionEntry, error: unknown): void => {
        if (
            closed ||
            rootController.signal.aborted ||
            entry.loadCompletedRevision >= entry.loadRequestedRevision ||
            entry.subscribers.size === 0 ||
            entry.loadRetry !== undefined
        ) {
            return;
        }
        const delayMs = entry.loadRetryMs;
        entry.loadRetryMs = Math.min(delayMs * 2, MAXIMUM_RECONNECT_MS);
        reportDebug({
            detail: debugDetail({
                delayMs,
                error: errorDetail(error),
                sessionId: entry.id,
            }),
            level: "warning",
            message: "Session history load failed; retrying",
            source: "sync",
        });
        const retry: Promise<void> = wait(delayMs, rootController.signal)
            .then(() => {
                if (entry.loadRetry === retry) entry.loadRetry = undefined;
                if (
                    closed ||
                    rootController.signal.aborted ||
                    entry.loadCompletedRevision >= entry.loadRequestedRevision ||
                    entry.subscribers.size === 0 ||
                    sessions.get(entry.id) !== entry
                ) {
                    return;
                }
                void loadSession(entry);
            })
            .catch(() => undefined);
        entry.loadRetry = retry;
    };

    const reconcileUnhydratedDraftMode = (agentId: string, mode: MessageMode): void => {
        const current = agentDrafts.get(agentId);
        if (current === undefined) return;
        const reconciled: AgentDraftSnapshot = {
            value: current.value === null ? null : { ...mode, text: current.value.text },
            updatedAt: current.updatedAt,
        };
        const pending = pendingDraftSaves.get(agentId);
        if (pending !== undefined) {
            pendingDraftSaves.set(agentId, { ...pending, draft: reconciled });
        }
        const held = heldDraftSaves.get(agentId);
        if (held !== undefined) {
            heldDraftSaves.set(agentId, { ...held, draft: reconciled });
        }
        const unhydrated = unhydratedDraftSaves.get(agentId);
        if (unhydrated !== undefined) {
            unhydratedDraftSaves.set(agentId, { ...unhydrated, draft: reconciled });
        }
        replaceDraft(agentId, reconciled);
    };

    const reconcileSwitchedDraftMode = (agentId: string, mode: MessageMode): void => {
        const current = agentDrafts.get(agentId);
        if (current === undefined) return;
        if (
            pendingDraftSaves.has(agentId) ||
            heldDraftSaves.has(agentId) ||
            unhydratedDraftSaves.has(agentId) ||
            unhydratedDraftModes.has(agentId) ||
            current.value === null
        ) {
            reconcileUnhydratedDraftMode(agentId, mode);
            return;
        }
        if (modesEqual(current.value, mode)) return;
        const updatedAt = Math.max(now(), current.updatedAt ?? 0);
        const reconciled: AgentDraftSnapshot = {
            value: { ...mode, text: current.value.text },
            updatedAt,
        };
        const revision = (draftRevisions.get(agentId) ?? 0) + 1;
        draftRevisions.set(agentId, revision);
        replaceDraft(agentId, reconciled);
        draftSave(agentId, {
            draft: reconciled,
            mutationId: nextId(),
            previousDraft: current,
            revision,
            updatedAt,
        });
    };

    const unhydratedDraftSaveFlush = (sessionId: string): void => {
        const held = unhydratedDraftSaves.get(sessionId);
        if (held === undefined) return;
        unhydratedDraftSaves.delete(sessionId);
        if (pendingDraftSaves.has(sessionId)) return;
        draftSave(sessionId, held);
    };

    const reconcileLoadedSelection = (
        entry: SessionEntry,
        draftRevision: number | undefined,
        modeRevision: number | undefined,
        bootstrapDraft: AgentDraftSnapshot,
        storedMode: MessageMode | null,
    ): void => {
        if (
            modeRevisions.get(entry.id) === modeRevision ||
            (storedMode !== null && agentModes.get(entry.id) == null)
        ) {
            modeRevisions.set(entry.id, (modeRevisions.get(entry.id) ?? 0) + 1);
            agentModes.set(entry.id, storedMode);
            entry.mode = storedMode;
        }
        const effectiveMode = agentModes.get(entry.id) ?? null;
        if (unhydratedDraftModes.has(entry.id) && !intendedModes.has(entry.id)) {
            unhydratedDraftModes.delete(entry.id);
            const current = agentDrafts.get(entry.id);
            if (
                current?.updatedAt !== null &&
                current?.updatedAt !== undefined &&
                (bootstrapDraft.updatedAt === null || bootstrapDraft.updatedAt < current.updatedAt)
            ) {
                const reconciledMode =
                    config !== undefined
                        ? modeOf(config, bootstrapDraft, effectiveMode)
                        : bootstrapDraft.value !== null
                          ? {
                                effort: bootstrapDraft.value.effort,
                                modelId: bootstrapDraft.value.modelId,
                                permissionMode: bootstrapDraft.value.permissionMode,
                                providerId: bootstrapDraft.value.providerId,
                                serviceTier: bootstrapDraft.value.serviceTier,
                            }
                          : effectiveMode;
                if (reconciledMode !== null) {
                    reconcileUnhydratedDraftMode(entry.id, reconciledMode);
                }
                unhydratedDraftSaveFlush(entry.id);
            } else {
                unhydratedDraftSaves.delete(entry.id);
                adoptDraft(entry.id, bootstrapDraft);
            }
        } else if (draftRevisions.get(entry.id) === draftRevision && !intendedModes.has(entry.id)) {
            unhydratedDraftSaves.delete(entry.id);
            adoptDraft(entry.id, bootstrapDraft);
        }
        entry.draft = agentDrafts.get(entry.id);
    };

    const loadSession = (entry: SessionEntry): Promise<void> => {
        if (entry.loading !== undefined) return entry.loading;
        // An agent this connection has named but not yet created has no history
        // anywhere to read, and asking the daemon for one would answer "no such
        // agent" and put a retrying error in front of a session the reader is
        // already writing into. It opens empty, which is exactly what it is; the
        // creation asks for the real thing the moment it lands.
        if (unannouncedAgents.has(entry.id)) {
            entry.hydrating = false;
            entry.historyLoaded = true;
            entry.reconcileRequired = false;
            entry.loadCompletedRevision = entry.loadRequestedRevision;
            publishSession(entry, true);
            return Promise.resolve();
        }
        entry.hydrating = true;
        const revision = entry.loadRequestedRevision;
        const draftRevision = draftRevisions.get(entry.id);
        const modeRevision = modeRevisions.get(entry.id);
        const signal = deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS);
        const loading = Promise.all([
            client.getMessages(
                entry.id,
                { limit: DEFAULT_HISTORY_LIMIT, omitToolData: false },
                { signal },
            ),
            client.getAgentBootstrap(entry.id, { signal }).then((bootstrap) => {
                if (closed || entry.loading !== loading || sessions.get(entry.id) !== entry)
                    return bootstrap;
                // The controls need the session's own selection, not its history.
                // Keep local draft edits made while this snapshot was in flight.
                entry.agent = bootstrap.agent;
                entry.workspace = workspaceOf(bootstrap.agent.workspaceId);
                reconcileLoadedSelection(
                    entry,
                    draftRevision,
                    modeRevision,
                    bootstrap.draft,
                    bootstrap.mode,
                );
                publishGroups();
                publishSession(entry, true);
                return bootstrap;
            }),
            optional(() => client.getAgentActivity(entry.id, { signal })),
            optional(() => client.getPendingQuestion(entry.id, { signal })),
        ])
            .then(async ([history, bootstrap, activity, question]) => {
                await ensureMessageUsers([
                    ...history.runs.flatMap((run) => run.messages),
                    ...bootstrap.pending,
                ]);
                if (closed) return;
                entry.agent = bootstrap.agent;
                entry.workspace = workspaceOf(bootstrap.agent.workspaceId);
                entry.context = bootstrap.context;
                entry.draft = agentDrafts.get(entry.id);
                entry.mode = agentModes.get(entry.id);
                entry.slashCommands = bootstrap.slashCommands;
                entry.usage = bootstrap.usage;
                const pendingSends = [...entry.messages.values()].filter(
                    (message) => message.pendingSend,
                );
                entry.messages.clear();
                clearUserIndex(entry);
                entry.messageBlockOffsets.clear();
                entry.runs.clear();
                entry.runsOrdered = undefined;
                entry.corruptedMessageIds.clear();
                ingestSessionHistory(entry, history.runs, bootstrap.pending);
                captureLatestIdleRunFinalContext(entry);
                for (const message of pendingSends) {
                    if (entry.messages.has(message.message.id)) {
                        sendConfirmations.get(message.message.id)?.();
                    } else {
                        entry.messages.set(message.message.id, message);
                        indexMessageUser(entry, message.message);
                    }
                }
                entry.hasMore = history.hasMore;
                if (activity !== undefined) setActivity(entry, activity);
                if (question !== undefined) entry.question = question.question;
                entry.historyLoaded = true;
                entry.reconcileRequired = false;
                if (entry.broadcastMissed) {
                    // Read again behind the transcript already on screen: now if someone has
                    // opened it since, otherwise when it is next opened.
                    entry.broadcastMissed = false;
                    if (entry.subscribers.size > 0) entry.loadRequestedRevision += 1;
                    else entry.reconcileRequired = true;
                }
                entry.loadCompletedRevision = Math.max(entry.loadCompletedRevision, revision);
                entry.loadRetryMs = INITIAL_RECONNECT_MS;
                entry.hydrating = false;
                // History and bootstrap are independent snapshots. Rebase from
                // the earlier boundary so neither accepted history nor pending
                // work can fall between its read and the global stream.
                const snapshotCursor =
                    history.cursor.localeCompare(bootstrap.cursor) <= 0
                        ? history.cursor
                        : bootstrap.cursor;
                const buffered = eventsForSessionAfter(
                    entry,
                    snapshotCursor,
                    entry.bufferedEvents.splice(0),
                );
                replaceAgent(bootstrap.agent);
                publishSession(entry, true);
                for (const event of buffered) applyEventNow(event);
                drainHydrationBroadcastEvents();
                if (
                    question === undefined &&
                    bootstrap.agent.pendingQuestionId !== null &&
                    entry.subscribers.size > 0
                ) {
                    recoverQuestion(entry);
                }
            })
            .catch((error: unknown) => {
                if (rootController.signal.aborted) return;
                entry.hydrating = false;
                entry.broadcastMissed = false;
                const buffered = entry.bufferedEvents.splice(0);
                for (const event of buffered) applyEvent(event);
                drainHydrationBroadcastEvents();
                for (const subscriber of entry.subscribers) subscriber.onError?.(error);
                scheduleSessionLoadRetry(entry, error);
            })
            .finally(() => {
                if (entry.loading === loading) {
                    entry.loading = undefined;
                    if (
                        entry.loadRequestedRevision > revision &&
                        !closed &&
                        !rootController.signal.aborted &&
                        sessions.get(entry.id) === entry
                    ) {
                        background(loadSession(entry));
                    } else if (
                        !closed &&
                        !rootController.signal.aborted &&
                        (entry.subscribers.size === 0 || entry.loadRetry === undefined)
                    ) {
                        // While the view stays open and loadRetry keeps retrying, the unhydrated draft stays in
                        // memory until hydration succeeds or the view closes (closing the connection discards it,
                        // matching base for pending debounced saves). When no retry will run, flushing sends the
                        // default mode, also matching base.
                        unhydratedDraftSaveFlush(entry.id);
                    }
                }
                settleSessionIfIdle(entry);
            });
        entry.loading = loading;
        return loading;
    };

    const requestSessionLoad = (entry: SessionEntry): Promise<void> => {
        entry.loadRequestedRevision += 1;
        return loadSession(entry);
    };

    const ensureSessionLoaded = (entry: SessionEntry): Promise<void> => {
        if (entry.loading !== undefined) return entry.loading;
        if (entry.historyLoaded && !entry.reconcileRequired) return Promise.resolve();
        return requestSessionLoad(entry);
    };

    /** Sessions loaded ahead of an open by `prefetchSession` and not opened since, oldest first. */
    const prefetchedSessions = new Set<string>();

    /**
     * Keep only the newest few prefetched sessions that were never opened. One still loading,
     * and `keep`, stay until their reads land rather than being read twice.
     */
    const trimPrefetchedSessions = (keep?: string): void => {
        for (const oldest of prefetchedSessions) {
            if (prefetchedSessions.size <= PREFETCHED_SESSION_LIMIT) break;
            if (oldest === keep) continue;
            const stale = sessions.get(oldest);
            if (stale !== undefined && stale.loading !== undefined) continue;
            prefetchedSessions.delete(oldest);
            if (stale !== undefined && stale.subscribers.size === 0) {
                clearUserIndex(stale);
                sessions.delete(oldest);
            }
        }
    };

    /** Sessions a reader opened and has since left, least recently left first. */
    const releasedSessions = new Set<string>();

    /**
     * A session someone left keeps only its newest page, as one nobody opened does, and only the
     * last few left stay cached at all, so a long day of switching holds a bounded set rather
     * than everything ever opened and scrolled through. One still loading, being changed, or among
     * the sessions the read-ahead keeps warm stays until a later sweep.
     */
    const releaseSession = (entry: SessionEntry): void => {
        trimHistory(entry.id);
        releasedSessions.delete(entry.id);
        releasedSessions.add(entry.id);
        if (releasedSessions.size <= RELEASED_SESSION_LIMIT) return;
        const warm = new Set(recentAgents(options.preloadedSessions ?? 0).map((agent) => agent.id));
        for (const id of releasedSessions) {
            if (releasedSessions.size <= RELEASED_SESSION_LIMIT) break;
            const stale = sessions.get(id);
            if (stale === undefined) {
                releasedSessions.delete(id);
                continue;
            }
            if (
                warm.has(id) ||
                stale.subscribers.size > 0 ||
                stale.loading !== undefined ||
                stale.loadingMore ||
                stale.questionRecovery !== undefined ||
                (sessionMutationCounts.get(id) ?? 0) > 0
            ) {
                continue;
            }
            releasedSessions.delete(id);
            clearUserIndex(stale);
            sessions.delete(id);
        }
    };

    /** Sessions read ahead by `preloadRecentSessions` and not opened since. */
    const preloadedSessions = new Set<string>();
    let preloading = false;

    /** The sidebar's conversations as it last reported them; none until it has. */
    let sidebarRows: SidebarReadAheadRows | undefined;
    /** Whether the read-ahead may run: the first snapshot has landed and its delay passed. */
    let preloadReady = false;
    /** A new ranking arrived while a pass was running, which starts over once it is done. */
    let preloadAgain = false;

    /**
     * The sessions a reader most likely opens next: the conversations whose rows are on screen in
     * the sidebar, top to bottom, then the nearest ones off it. Only active agents count.
     */
    const recentAgents = (limit: number): Agent[] => {
        if (sidebarRows === undefined || limit <= 0) return [];
        const { bots, projects, tasks, workspaces } = groupsStore.getState();
        // A workspace's agents are listed under its project too.
        const found = new Map<string, Agent>();
        const visit = (agent: Agent): void => {
            if (agent.archivedAt === null) found.set(agent.id, agent);
            for (const child of agent.subtasks ?? []) visit(child);
        };
        for (const bot of bots) visit(bot.agent);
        for (const task of tasks) visit(task.agent);
        for (const owner of [...workspaces, ...projects])
            for (const root of owner.agents) visit(root);
        const ranked: Agent[] = [];
        for (const id of sidebarReadAheadOrder(sidebarRows)) {
            const agent = found.get(id);
            if (agent === undefined) continue;
            ranked.push(agent);
            if (ranked.length === limit) break;
        }
        return ranked;
    };

    /**
     * Reads ahead, one at a time, the newest page of the sessions a reader most likely opens,
     * once nothing else is loading: an open or a prefetch always goes first. A session read this
     * way is an ordinary cached one, which the update feed keeps current; one that drops out of
     * the recent set and is not open is let go. Nothing is read until the sidebar has said what
     * it shows, and a new report during a pass starts it over after the load in flight.
     */
    const preloadRecentSessions = async (): Promise<void> => {
        const limit = options.preloadedSessions ?? 0;
        if (limit <= 0 || !preloadReady || sidebarRows === undefined) return;
        if (preloading) {
            preloadAgain = true;
            return;
        }
        preloading = true;
        preloadAgain = false;
        try {
            const recent = recentAgents(limit);
            const wanted = new Set(recent.map((agent) => agent.id));
            for (const id of preloadedSessions) {
                if (wanted.has(id)) continue;
                const stale = sessions.get(id);
                // One still loading stays tracked, and goes on a later sweep.
                if (stale?.loading !== undefined) continue;
                preloadedSessions.delete(id);
                if (stale !== undefined && stale.subscribers.size === 0) {
                    clearUserIndex(stale);
                    sessions.delete(id);
                }
            }
            for (const agent of recent) {
                if (preloadAgain) break;
                for (;;) {
                    if (closed || rootController.signal.aborted) return;
                    if (![...sessions.values()].some((entry) => entry.loading !== undefined)) break;
                    await wait(PRELOAD_BUSY_WAIT_MS, rootController.signal);
                }
                const known = sessions.get(agent.id);
                if (known !== undefined && known.historyLoaded && !known.reconcileRequired)
                    continue;
                const entry = known ?? sessionEntryCreate(agent.id);
                if (known === undefined) preloadedSessions.add(agent.id);
                await ensureSessionLoaded(entry);
            }
        } finally {
            preloading = false;
        }
        if (preloadAgain && !closed) await preloadRecentSessions();
    };

    const sessionEntryCreate = (sessionId: string): SessionEntry => {
        const entry: SessionEntry = {
            id: sessionId,
            store: new ChatStore(sessionId),
            subscribers: new Set(),
            messages: new Map(),
            userIds: new Set(),
            messageBlockOffsets: new Map(),
            runs: new Map(),
            runFinalContextTokens: new Map(),
            hasMore: false,
            loading: undefined,
            historyLoaded: false,
            loadRequestedRevision: 0,
            loadCompletedRevision: 0,
            loadRetry: undefined,
            loadRetryMs: INITIAL_RECONNECT_MS,
            loadingMore: false,
            hydrating: false,
            broadcastMissed: false,
            bufferedEvents: [],
            activityLoading: undefined,
            activityRevision: 0,
            reconcileRequired: false,
            corruptedMessageIds: new Set(),
            questionRecovery: undefined,
            answeredQuestions: [],
            slashCommands: [],
        };
        const known = agentOf(sessionId);
        if (known !== undefined) {
            entry.agent = known;
            entry.workspace = workspaceOf(known.workspaceId);
            entry.draft = agentDrafts.get(sessionId);
            entry.mode = agentModes.get(sessionId);
        }
        sessions.set(sessionId, entry);
        return entry;
    };

    /**
     * Applies a desktop bootstrap: the one read here, or one already read beside the update
     * feed (`read`).
     */
    const resync = (reconcileSessions: boolean, read?: DesktopBootstrapCurrent): Promise<void> => {
        if (resyncTask !== undefined) return resyncTask;
        reportDebug({
            detail: debugDetail({ after: cursor ?? null, reconcileSessions }),
            level: "info",
            message: "State reconciliation started",
            source: "sync",
        });
        const running = (async (): Promise<void> => {
            const bootstrap: DesktopBootstrapCurrent =
                read ??
                (await client.getDesktopBootstrap({
                    signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS),
                }));
            if (rootController.signal.aborted) return;
            // A current daemon's bootstrap is its health as well, and the freshest one.
            if (bootstrap.health !== undefined) sync.writer.healthReceived(bootstrap.health);
            viewerIdentityUpdate(bootstrap.profile);
            if (reconcileSessions) await users.refresh();
            config = bootstrap.config;
            sync.writer.bootstrapReceived(bootstrap);
            // The daemon lists a project's or workspace's active agents on the owner and its
            // most recently archived ones apart, in `archivedAgents`; a daemon too old to carry
            // that field remembers no archived agent for this connection at all.
            const owners = archivedAgentsMerge(
                bootstrap.projects,
                bootstrap.workspaces,
                bootstrap.archivedAgents ?? [],
            );
            groupsStore.setState({
                // A daemon too old to know about bots omits the field entirely,
                // which is an empty catalog rather than an unknown one.
                bots: bootstrap.bots ?? [],
                projects: owners.projects,
                // The same for tasks: absent together on a daemon that predates them.
                // New work still being made is not listed yet, and stays.
                taskMemberships: [
                    ...(bootstrap.taskMemberships ?? []),
                    ...groupsStore
                        .getState()
                        .taskMemberships.filter(
                            (membership) =>
                                stemCellTasks.has(membership.taskId) &&
                                !(bootstrap.taskMemberships ?? []).some(
                                    (listed) => listed.taskId === membership.taskId,
                                ),
                        ),
                ],
                tasks: [
                    ...(bootstrap.tasks ?? []),
                    ...groupsStore
                        .getState()
                        .tasks.filter(
                            (task) =>
                                stemCellTasks.has(task.id) &&
                                !(bootstrap.tasks ?? []).some((listed) => listed.id === task.id),
                        ),
                ],
                workspaces: owners.workspaces,
            });
            taskOwnersEnsure(bootstrap.tasks ?? []);
            const gitWorkspaceIds = new Set(
                activeGitWorkspaceIds(bootstrap.projects, bootstrap.workspaces),
            );
            for (const workspaceId of gitStates.keys()) {
                if (!gitWorkspaceIds.has(workspaceId)) gitStates.delete(workspaceId);
            }
            // Neither the first paint nor the update feed waits for the watch: its scans land
            // whenever they do, and anything it notices later arrives as `git.updated`.
            gitWatchStart([...gitWorkspaceIds]);
            advanceCursor(bootstrap.cursor);
            // After a lost journal or a replaced process, the events remembered
            // so far belong to an interval this snapshot supersedes, and their
            // cursors need not even be comparable with the new ones. A session
            // read again below must not replay them on top of its snapshot.
            if (reconcileSessions) recentEvents.length = 0;
            for (const entry of sessions.values()) {
                const known = agentOf(entry.id);
                if (known !== undefined) {
                    entry.agent = known;
                    entry.workspace = workspaceOf(known.workspaceId);
                }
            }
            const projectedProjects = projectGroups(
                owners.projects,
                owners.workspaces,
                endpoint,
                config,
                gitStates,
                agentDrafts,
                agentModes,
            );
            publishGroups([
                { type: "projects_changed", projects: projectedProjects },
                ...(reconcileSessions
                    ? activeGitWorkspaceIds(bootstrap.projects, bootstrap.workspaces).map(
                          (workspaceId): GroupDelta => ({
                              type: "files_changed",
                              workspaceId,
                              paths: null,
                          }),
                      )
                    : []),
            ]);
            // Startup has no missing journal interval: a session that was
            // materialized concurrently owns its own cursor-bounded snapshot.
            // Only a server-confirmed journal gap invalidates session caches.
            // Inactive caches are marked and reconciled lazily when reopened so
            // one lost cursor does not fan out across every chat ever viewed.
            // An open one is read again now, but the feed does not wait for
            // it: from here it is an ordinary session load, which holds its
            // own session's events until its snapshot lands and replays only
            // the ones after it.
            let reconciledSessions = 0;
            for (const entry of sessions.values()) {
                publishSession(entry);
                if (!reconcileSessions) continue;
                entry.reconcileRequired = true;
                if (entry.subscribers.size > 0) {
                    reconciledSessions += 1;
                    background(requestSessionLoad(entry));
                }
            }
            const buffered = resyncBufferedEvents.splice(0);
            // The bootstrap snapshot already contains every change at or before
            // its cursor, and the buffer may hold redeliveries; replay only
            // strictly newer events, each at most once.
            let replayed = bootstrap.cursor;
            for (const event of buffered) {
                if (event.cursor.localeCompare(replayed) <= 0) continue;
                replayed = event.cursor;
                // A session reloaded during this resync covers its own events
                // up to its agent's lastCursor, which may lie past the
                // bootstrap cursor; replaying one of those would duplicate a
                // streaming segment the reloaded history already contains.
                const agentId = agentIdOfEvent(event);
                const boundary =
                    agentId === undefined ? undefined : sessions.get(agentId)?.agent?.lastCursor;
                if (boundary !== undefined && event.cursor.localeCompare(boundary) <= 0) continue;
                applyEventNow(event);
            }
            reportDebug({
                detail: debugDetail({
                    cursor: bootstrap.cursor,
                    reconciledSessions,
                    projects: bootstrap.projects.length,
                    sessions: bootstrap.projects.reduce(
                        (count, project) => count + project.agents.length,
                        bootstrap.workspaces.reduce(
                            (count, workspace) => count + workspace.agents.length,
                            0,
                        ),
                    ),
                    workspaces: bootstrap.workspaces.length,
                }),
                level: "info",
                message: "State reconciliation completed",
                source: "sync",
            });
            if ((options.preloadedSessions ?? 0) > 0) {
                background(
                    wait(PRELOAD_DELAY_MS, rootController.signal).then(() => {
                        preloadReady = true;
                        return preloadRecentSessions();
                    }),
                );
            }
        })();
        const tracked = running.finally(() => {
            if (resyncTask === tracked) resyncTask = undefined;
        });
        resyncTask = tracked;
        return tracked;
    };

    // Only the watch sent for the newest bootstrap may land.
    let gitWatchGeneration = 0;

    /**
     * Registers the bootstrap's workspaces with the daemon's git watcher and adopts the scans
     * it already holds. A state that moved on while the watch was out (a newer
     * `git.updated`, a workspace gone) is not set back by it.
     */
    const gitWatchStart = (workspaceIds: readonly string[]): void => {
        const generation = ++gitWatchGeneration;
        const sent = new Map(gitStates);
        background(
            (async () => {
                const watched = await optional(() =>
                    client.watchGit(
                        { workspaceIds: [...workspaceIds] },
                        { signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS) },
                    ),
                );
                if (rootController.signal.aborted || generation !== gitWatchGeneration) return;
                const { projects, workspaces } = groupsStore.getState();
                const active = new Set(activeGitWorkspaceIds(projects, workspaces));
                let changed = false;
                for (const workspaceId of workspaceIds) {
                    if (!active.has(workspaceId)) continue;
                    const current = gitStates.get(workspaceId);
                    const git = watched?.snapshots[workspaceId];
                    if (git !== undefined) {
                        const next = gitSnapshotStateUpdate(current, git);
                        if (next === current) continue;
                        gitStates.set(workspaceId, next);
                        changed = true;
                    } else if (current !== undefined && current === sent.get(workspaceId)) {
                        // A reconnecting watch can fail before the daemon has a fresh scan.
                        gitStates.set(workspaceId, { ...current, invalidated: true });
                        changed = true;
                    }
                }
                reportDebug({
                    detail: debugDetail({
                        watchedGit: Object.keys(watched?.snapshots ?? {}).length,
                        workspaces: workspaceIds.length,
                    }),
                    level: watched === undefined ? "warning" : "info",
                    message: watched === undefined ? "Git watch failed" : "Git watch registered",
                    source: "sync",
                });
                if (changed) publishGroups();
            })(),
        );
    };

    const renewGitWatch = async (): Promise<void> => {
        if (config === undefined) return;
        const watched = groupsStore.getState();
        const watchedGit = await optional(() =>
            client.watchGit(
                { workspaceIds: activeGitWorkspaceIds(watched.projects, watched.workspaces) },
                {
                    signal: AbortSignal.any([
                        rootController.signal,
                        AbortSignal.timeout(MUTATION_RESPONSE_TIMEOUT_MS),
                    ]),
                },
            ),
        );
        if (watchedGit === undefined || rootController.signal.aborted) return;
        let changed = false;
        for (const [workspaceId, git] of Object.entries(watchedGit.snapshots)) {
            const current = gitStates.get(workspaceId);
            if (
                current !== undefined &&
                !current.invalidated &&
                current.current.scannedAt >= git.scannedAt
            )
                continue;
            gitStates.set(workspaceId, gitSnapshotStateUpdate(gitStates.get(workspaceId), git));
            groupsStore.setState((state) => ({
                workspaces: state.workspaces.map((workspace) =>
                    workspace.id === workspaceId ? { ...workspace, git: git.facts } : workspace,
                ),
                projects: state.projects.map((project) =>
                    project.id === workspaceId ? { ...project, git: git.facts } : project,
                ),
            }));
            changed = true;
        }
        if (changed) publishGroups();
    };

    const runGitWatchRenewal = async (): Promise<void> => {
        while (!rootController.signal.aborted) {
            await abortableWait(GIT_WATCH_RENEW_MS, rootController.signal);
            await renewGitWatch();
        }
    };

    const applyEvent = (event: HappyAgentEvent): void => {
        if (resyncTask !== undefined) {
            resyncBufferedEvents.push(event);
            return;
        }
        if (
            event.type === "question.updated" ||
            event.type === "process.updated" ||
            event.type === "process.exited"
        ) {
            if (broadcastHeld()) {
                hydrationBroadcastEvents.push(event);
                return;
            }
            for (const entry of sessions.values())
                if (entry.hydrating) entry.broadcastMissed = true;
        }
        applyEventNow(event);
    };

    const advanceCursor = (next: string): void => {
        if (cursor === undefined || cursor.localeCompare(next) < 0) cursor = next;
    };

    // A broken resource version chain is local to that resource. Its focused
    // endpoint repairs it; a failed focused read must not amplify into desktop
    // bootstrap plus every materialized conversation snapshot.
    const refetchResource = (refetch: Promise<void>): void => background(refetch);

    // A busy agent emits a steady stream of versioned updates, and every one of
    // them misses while its repair read is outstanding. Keep one read per agent
    // in flight and follow it with exactly one more when events arrived
    // meanwhile, so a slow connection cannot pile up a request per event.
    const agentRefetches = new Map<string, { again: boolean }>();
    // Agents whose full read found nowhere to land: no loaded workspace,
    // project, bot, or open session carries them. Reading them again on every
    // update would never change that, so their updates are ignored until
    // something that does carry them (a snapshot, a session, a parent's
    // activity) makes them known again.
    const untrackedAgents = new Set<string>();

    const refetchAgent = (agentId: string): void => {
        const running = agentRefetches.get(agentId);
        if (running !== undefined) {
            running.again = true;
            return;
        }
        const refetch = { again: false };
        agentRefetches.set(agentId, refetch);
        const read = async (): Promise<void> => {
            do {
                refetch.again = false;
                const { agent } = await client.getAgent(agentId, {
                    signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS),
                });
                const latest = agentOf(agent.id);
                if (latest === undefined || latest.version.localeCompare(agent.version) <= 0) {
                    replaceAgent(agent);
                }
                if (agentOf(agent.id) === undefined) {
                    untrackedAgents.add(agent.id);
                    return;
                }
            } while (refetch.again);
        };
        refetchResource(read().finally(() => agentRefetches.delete(agentId)));
    };

    /**
     * Reads one task whole and adopts it with the caller's membership. It is
     * how a task known only from an event learns whether the caller may
     * archive it, and how a broken version chain is repaired.
     */
    const taskRefetch = (taskId: string): void =>
        refetchResource(
            client
                .getTask(taskId, { signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS) })
                .then(taskResponseAdopt),
        );

    /** Adopts a task route's answer: the task, and the caller's place in it or none. */
    const taskResponseAdopt = ({
        task,
        membership,
    }: {
        readonly task: Task;
        readonly membership: TaskMembership | null;
    }): void => {
        const latest = taskOf(task.id);
        const adoptTask =
            latest === undefined ||
            latest.version === latest.id ||
            latest.version.localeCompare(task.version) <= 0 ||
            (latest.canArchive === undefined && task.canArchive !== undefined);
        groupsStore.setState((state) => ({
            ...(adoptTask ? { tasks: replaceResource(state.tasks, task) } : {}),
            taskMemberships:
                membership === null
                    ? state.taskMemberships.filter((entry) => entry.taskId !== task.id)
                    : taskMembershipsReplace(state.taskMemberships, membership),
        }));
        taskOwnersEnsure([task]);
        publishGroups();
    };

    const taskMembershipAdopt = (membership: TaskMembership): void => {
        groupsStore.setState((state) => ({
            taskMemberships: taskMembershipsReplace(state.taskMemberships, membership),
        }));
        publishGroups();
    };

    const taskMembershipRemove = (taskId: string): void => {
        if (!groupsStore.getState().taskMemberships.some((entry) => entry.taskId === taskId))
            return;
        groupsStore.setState((state) => ({
            taskMemberships: state.taskMemberships.filter((entry) => entry.taskId !== taskId),
        }));
        publishGroups();
    };

    // Reads of a changed configuration still out; until they land `config` is not current.
    let configReloads = 0;

    const reloadConfig = async (): Promise<void> => {
        configReloads += 1;
        try {
            const response = await client.getConfig({
                signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS),
            });
            config = response.config;
        } finally {
            configReloads -= 1;
        }
        publishGroups();
        for (const entry of sessions.values()) publishSession(entry);
    };

    const applyEventNow = (event: HappyAgentEvent): void => {
        const eventAgentId = agentIdOfEvent(event);
        const hydratingEntry = eventAgentId === undefined ? undefined : sessions.get(eventAgentId);
        if (hydratingEntry?.hydrating === true) {
            hydratingEntry.bufferedEvents.push(event);
            // The sidebar row shows the agent itself, so it moves on now. Replayed after the
            // load, the same version is a no-op unless the snapshot put back an older one.
            if (event.type !== "agent.updated") return;
        }
        switch (event.type) {
            case "project.created":
                groupsStore.setState((state) => ({
                    projects: replaceResource(state.projects, event.payload.project),
                }));
                publishGroups([{ type: "project_added", projectId: event.payload.project.id }]);
                background(renewGitWatch());
                return;
            case "project.updated": {
                const current = groupsStore
                    .getState()
                    .projects.find((project) => project.id === event.payload.projectId);
                if (current === undefined) {
                    refetchResource(
                        client
                            .getProject(event.payload.projectId, {
                                signal: rootController.signal,
                            })
                            .then(({ project }) => {
                                groupsStore.setState((state) => ({
                                    projects: ownerResourceReplace(state.projects, project),
                                }));
                                publishGroups();
                            }),
                    );
                    return;
                }
                if (current.version !== event.payload.previousVersion) {
                    refetchResource(
                        client
                            .getProject(event.payload.projectId, {
                                signal: rootController.signal,
                            })
                            .then(({ project }) => {
                                const latest = groupsStore
                                    .getState()
                                    .projects.find((candidate) => candidate.id === project.id);
                                if (
                                    latest === undefined ||
                                    latest.version.localeCompare(project.version) <= 0
                                ) {
                                    groupsStore.setState((state) => ({
                                        projects: ownerResourceReplace(state.projects, project),
                                    }));
                                    publishGroups();
                                }
                            }),
                    );
                    return;
                }
                groupsStore.setState((state) => ({
                    projects: ownerResourceReplace(state.projects, {
                        ...applyChanges(current, event.payload.changes),
                        version: event.payload.version,
                    }),
                }));
                publishGroups();
                return;
            }
            case "workspace.created": {
                const created = event.payload.workspace;
                groupsStore.setState((state) => ({
                    workspaces: replaceResource(state.workspaces, created),
                }));
                // A bot's workspace is announced by `bot.created`, which carries
                // the bot the row is actually made of. There is no project for
                // this delta to name, so none is published.
                publishGroups(
                    created.projectId === null
                        ? []
                        : [
                              {
                                  type: "workspace_added",
                                  projectId: created.projectId,
                                  workspaceId: created.id,
                              },
                          ],
                );
                background(renewGitWatch());
                return;
            }
            case "bot.created":
                groupsStore.setState((state) => ({
                    bots: replaceResource(state.bots, event.payload.bot),
                }));
                publishGroups([
                    {
                        type: "bot_added",
                        botId: event.payload.bot.id,
                        workspaceId: event.payload.bot.workspaceId,
                    },
                ]);
                return;
            case "bot.updated": {
                const current = botOf(event.payload.botId);
                // The bot is not held yet, so there is no version chain to
                // extend: ask for it whole, exactly as a workspace does.
                if (current === undefined) {
                    refetchResource(
                        client
                            .getBot(event.payload.botId, { signal: rootController.signal })
                            .then(({ bot }) => {
                                groupsStore.setState((state) => ({
                                    bots: replaceResource(state.bots, bot),
                                }));
                                publishGroups();
                            }),
                    );
                    return;
                }
                groupsStore.setState((state) => ({
                    bots: replaceResource(state.bots, {
                        ...applyChanges(current, event.payload.changes),
                        version: event.payload.version,
                    }),
                }));
                publishGroups();
                return;
            }
            case "task.created":
                // The event carries no `canArchive`: that answer is the caller's
                // own and only the task route states it. The task is listed at
                // once and read whole for the rest.
                groupsStore.setState((state) => {
                    const known = state.tasks.find(
                        (candidate) => candidate.id === event.payload.task.id,
                    )?.canArchive;
                    return {
                        tasks: replaceResource(
                            state.tasks,
                            known === undefined
                                ? event.payload.task
                                : { ...event.payload.task, canArchive: known },
                        ),
                    };
                });
                taskOwnersEnsure([event.payload.task]);
                publishGroups();
                taskRefetch(event.payload.task.id);
                return;
            case "task.updated": {
                const current = taskOf(event.payload.taskId);
                if (current === undefined || current.version !== event.payload.previousVersion) {
                    taskRefetch(event.payload.taskId);
                    return;
                }
                const updated: Task = {
                    ...applyChanges(current, event.payload.changes),
                    version: event.payload.version,
                };
                groupsStore.setState((state) => ({ tasks: replaceResource(state.tasks, updated) }));
                taskOwnersEnsure([updated]);
                publishGroups();
                return;
            }
            case "task.joined":
            case "task.reordered":
                taskMembershipAdopt(event.payload.membership);
                if (taskOf(event.payload.membership.taskId) === undefined)
                    taskRefetch(event.payload.membership.taskId);
                return;
            case "task.left":
                taskMembershipRemove(event.payload.membership.taskId);
                return;
            case "workspace.updated": {
                const current = workspaceOf(event.payload.workspaceId);
                if (current === undefined) {
                    refetchResource(
                        client
                            .getWorkspace(event.payload.workspaceId, {
                                signal: rootController.signal,
                            })
                            .then(({ workspace }) => {
                                groupsStore.setState((state) => ({
                                    workspaces: ownerResourceReplace(state.workspaces, workspace),
                                }));
                                publishGroups();
                            }),
                    );
                    return;
                }
                if (current.version !== event.payload.previousVersion) {
                    refetchResource(
                        client
                            .getWorkspace(event.payload.workspaceId, {
                                signal: rootController.signal,
                            })
                            .then(({ workspace }) => {
                                const latest = workspaceOf(workspace.id);
                                if (
                                    latest === undefined ||
                                    latest.version.localeCompare(workspace.version) <= 0
                                ) {
                                    groupsStore.setState((state) => ({
                                        workspaces: ownerResourceReplace(
                                            state.workspaces,
                                            workspace,
                                        ),
                                    }));
                                    publishGroups();
                                }
                            }),
                    );
                    return;
                }
                groupsStore.setState((state) => ({
                    workspaces: ownerResourceReplace(state.workspaces, {
                        ...applyChanges(current, event.payload.changes),
                        version: event.payload.version,
                    }),
                }));
                publishGroups();
                return;
            }
            case "agent.created":
                replaceAgent(event.payload.agent);
                publishGroups([{ type: "session_added", sessionId: event.payload.agent.id }]);
                return;
            case "agent.updated": {
                const current = agentOf(event.payload.agentId);
                if (current === undefined) {
                    if (!untrackedAgents.has(event.payload.agentId)) {
                        refetchAgent(event.payload.agentId);
                    }
                    return;
                }
                untrackedAgents.delete(event.payload.agentId);
                // A redelivery of the version already held, often the one a mutation response
                // adopted first, is no gap.
                if (current.version === event.payload.version) return;
                if (current.version !== event.payload.previousVersion) {
                    refetchAgent(event.payload.agentId);
                    return;
                }
                const next = {
                    ...applyChanges(current, event.payload.changes),
                    version: event.payload.version,
                };
                if (agentChangesOnlyTimestamp(current, event.payload.changes)) {
                    quietAgentStore(next);
                    return;
                }
                replaceAgent(next);
                return;
            }
            case "agent.context.updated": {
                const entry = sessions.get(event.payload.agentId);
                if (entry !== undefined) {
                    entry.context = event.payload.context;
                    captureLatestIdleRunFinalContext(entry);
                    publishSession(entry);
                }
                return;
            }
            case "agent.draft.updated":
                adoptDraft(event.payload.agentId, event.payload.draft);
                return;
            case "agent.slash_commands.updated": {
                const entry = sessions.get(event.payload.agentId);
                if (entry !== undefined) {
                    entry.slashCommands = event.payload.slashCommands;
                    publishSession(entry);
                }
                return;
            }
            case "run.started":
                acceptMessages(
                    event.payload.agentId,
                    event.payload.acceptedMessageIds,
                    event.payload.run.id,
                );
                updateRun(event.payload.agentId, event.payload.run);
                return;
            case "run.boundary":
                updateRun(event.payload.agentId, event.payload.finishedRun, false);
                acceptMessages(
                    event.payload.agentId,
                    event.payload.acceptedMessageIds,
                    event.payload.startedRun.id,
                );
                updateRun(event.payload.agentId, event.payload.startedRun);
                recoverCorruptedMessages(event.payload.agentId);
                return;
            case "run.finished":
                updateRun(event.payload.agentId, event.payload.run);
                recoverCorruptedMessages(event.payload.agentId);
                trimHistory(event.payload.agentId);
                if (agentOf(event.payload.agentId)?.parentAgentId === null) {
                    options.onTopLevelSessionFinished?.(event.payload.agentId);
                }
                return;
            case "message.created":
                createMessage(event.payload.agentId, event.payload.message, event.payload.runId);
                return;
            case "message.updated":
                updateMessageSnapshot(
                    event.payload.agentId,
                    event.payload.message,
                    event.payload.runId,
                );
                return;
            case "message.delta":
                appendMessageDelta(event.payload);
                return;
            case "message.deleted": {
                knownUserMessageIds.delete(event.payload.messageId);
                const entry = sessions.get(event.payload.agentId);
                entry?.messages.delete(event.payload.messageId);
                if (entry !== undefined) {
                    clearUserIndex(entry);
                    for (const message of entry.messages.values())
                        indexMessageUser(entry, message.message);
                }
                entry?.messageBlockOffsets.delete(event.payload.messageId);
                entry?.corruptedMessageIds.delete(event.payload.messageId);
                if (entry !== undefined) publishSession(entry);
                return;
            }
            case "question.created":
                updateQuestion(event.payload.question.agentId, event.payload.question);
                return;
            case "question.updated":
                for (const entry of sessions.values()) {
                    if (
                        entry.question?.id === event.payload.questionId ||
                        entry.agent?.pendingQuestionId === event.payload.questionId
                    ) {
                        if (
                            entry.question === undefined ||
                            entry.question === null ||
                            entry.question.version !== event.payload.previousVersion
                        ) {
                            refetchResource(
                                client
                                    .getPendingQuestion(entry.id, {
                                        signal: rootController.signal,
                                    })
                                    .then(({ question }) => {
                                        if (
                                            question === null ||
                                            entry.question === undefined ||
                                            entry.question === null ||
                                            shouldAdoptVersion(entry.question, question)
                                        ) {
                                            entry.question = question;
                                            publishSession(entry);
                                        }
                                    }),
                            );
                            continue;
                        }
                        entry.question = {
                            ...applyChanges(entry.question, event.payload.changes),
                            version: event.payload.version,
                        };
                        publishSession(entry);
                    }
                }
                return;
            case "process.started":
                {
                    const entry = sessions.get(event.payload.process.agentId);
                    if (entry !== undefined) updateActivityProcess(entry, event.payload.process);
                }
                return;
            case "process.updated":
            case "process.exited": {
                const entry = sessionOwningProcess(event.payload.processId);
                if (entry !== undefined) patchActivityProcess(entry, event.payload);
                return;
            }
            case "config.updated":
                background(reloadConfig());
                return;
            case "git.updated": {
                const { git, workspaceId } = event.payload;
                const current = gitStates.get(workspaceId);
                if (current && !current.invalidated && current.current.scannedAt >= git.scannedAt)
                    return;
                gitStates.set(workspaceId, gitSnapshotStateUpdate(gitStates.get(workspaceId), git));
                groupsStore.setState((state) => ({
                    workspaces: state.workspaces.map((workspace) =>
                        workspace.id === workspaceId ? { ...workspace, git: git.facts } : workspace,
                    ),
                    projects: state.projects.map((project) =>
                        project.id === workspaceId ? { ...project, git: git.facts } : project,
                    ),
                }));
                publishGroups();
                return;
            }
            case "files.updated": {
                const delta: GroupDelta = {
                    type: "files_changed",
                    workspaceId: event.payload.workspaceId,
                    paths: event.payload.paths,
                };
                publishGroupDeltas([delta]);
                return;
            }
            case "profile.updated":
                if (event.payload.userId !== undefined) {
                    background(users.refresh([event.payload.userId]));
                    if (currentUserId === undefined || event.payload.userId === currentUserId) {
                        background(reloadViewerProfile());
                    }
                } else {
                    background(reloadViewerProfile());
                }
                return;
            case "secret.created":
            case "secret.updated":
            case "secret.attached":
            case "secret.detached":
            case "secret.removed":
            case "terminal.created":
            case "terminal.updated":
                return;
        }
    };

    const updateRun = (agentId: string, run: Run, publish = true): void => {
        const entry = sessions.get(agentId);
        if (entry === undefined) return;
        const current = entry.runs.get(run.id);
        if (current !== undefined && current.status !== "running" && run.status === "running") {
            return;
        }
        entry.runs.set(run.id, run);
        entry.runsOrdered = undefined;
        captureRunFinalContext(entry, run);
        if (publish) publishSession(entry);
    };

    /**
     * A session follows its stream whether or not anyone reads it, so its runs would pile up for
     * as long as it works. Past a page, the oldest go, and are read again only if someone scrolls
     * back to them. A session on screen keeps up to two pages, and lets go only while every
     * reader is at its newest content and no older page is on its way, so nothing a reader is
     * looking at, or is about to be shown, disappears.
     */
    const trimHistory = (agentId: string): void => {
        const entry = sessions.get(agentId);
        if (entry === undefined || entry.loadingMore) return;
        const watched = entry.subscribers.size > 0;
        if (watched && [...entry.subscribers].some((subscriber) => !subscriber.following)) return;
        const ordered = runsOrderedOf(entry);
        if (ordered.length <= DEFAULT_HISTORY_LIMIT * (watched ? 2 : 1)) return;
        const dropped = new Set(
            ordered.slice(0, ordered.length - DEFAULT_HISTORY_LIMIT).map((run) => run.id),
        );
        for (const id of dropped) {
            entry.runs.delete(id);
            entry.runFinalContextTokens.delete(id);
        }
        for (const [id, message] of entry.messages) {
            if (message.runId === null || !dropped.has(message.runId)) continue;
            entry.messages.delete(id);
            knownUserMessageIds.delete(id);
            entry.messageBlockOffsets.delete(id);
            entry.corruptedMessageIds.delete(id);
        }
        entry.runsOrdered = undefined;
        entry.hasMore = true;
        clearUserIndex(entry);
        for (const { message } of entry.messages.values()) indexMessageUser(entry, message);
        if (watched) publishSession(entry);
    };

    interface ModeRefetchOptions {
        readonly expectedRoute?: {
            readonly providerId: string;
            readonly modelId: string;
        };
        readonly modeRevision?: number;
        readonly reconcileDraft?: boolean;
    }

    const modeRefetches = new Map<string, { again: boolean; options?: ModeRefetchOptions }>();

    const adoptMessageMode = (agentId: string, mode: MessageMode | null): void => {
        const entry = sessions.get(agentId);
        if (entry === undefined && agentOf(agentId) === undefined) return;
        modeRevisions.set(agentId, (modeRevisions.get(agentId) ?? 0) + 1);
        if (entry !== undefined) entry.mode = mode;
        agentModes.set(agentId, mode);
        if (mode !== null) {
            if (unhydratedDraftModes.has(agentId) && !intendedModes.has(agentId)) {
                unhydratedDraftModes.delete(agentId);
                reconcileUnhydratedDraftMode(
                    agentId,
                    config !== undefined ? modeOf(config, agentDrafts.get(agentId), mode) : mode,
                );
                unhydratedDraftSaveFlush(agentId);
            } else {
                unhydratedDraftModes.delete(agentId);
            }
            const intended = intendedModes.get(agentId);
            if (intended !== undefined && modesEqual(intended, mode)) {
                intendedModes.delete(agentId);
            }
        }
        if (entry !== undefined) publishSession(entry);
        publishGroups();
    };

    // Accepting a non-user message or resolving a failure card with a route switch costs one
    // GET /v0/agents/:id/mode read (coalesced per agent) because run.started, run.boundary,
    // and switchAndContinue do not inline the resulting stored mode.
    const refetchAgentMode = (agentId: string, options?: ModeRefetchOptions): void => {
        const active = modeRefetches.get(agentId);
        if (active !== undefined) {
            active.again = true;
            if (options !== undefined) {
                active.options = {
                    ...options,
                    modeRevision: options.modeRevision ?? modeRevisions.get(agentId),
                };
            }
            return;
        }
        const state: { again: boolean; options?: ModeRefetchOptions } = { again: false };
        modeRefetches.set(agentId, state);
        const modeRevision = options?.modeRevision ?? modeRevisions.get(agentId);
        background(
            client
                .getAgentMode(agentId, { signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS) })
                .then(({ mode }) => {
                    if (closed || rootController.signal.aborted) return;
                    // An older daemon that has not picked up the switchAndContinue
                    // lastMode fix still answers GET /v0/agents/:id/mode with the
                    // pre-switch route; keep the client's computed switched mode
                    // until every supported daemon writes lastMode on switch.
                    if (
                        options?.expectedRoute !== undefined &&
                        (mode === null ||
                            mode.providerId !== options.expectedRoute.providerId ||
                            mode.modelId !== options.expectedRoute.modelId)
                    ) {
                        return;
                    }
                    if (
                        modeRevisions.get(agentId) === modeRevision ||
                        (mode !== null && agentModes.get(agentId) == null)
                    ) {
                        adoptMessageMode(agentId, mode);
                        if (
                            options?.reconcileDraft === true &&
                            mode !== null &&
                            !intendedModes.has(agentId)
                        ) {
                            reconcileSwitchedDraftMode(agentId, mode);
                            const entry = sessions.get(agentId);
                            if (entry !== undefined) publishSession(entry);
                            publishGroups();
                        }
                    }
                })
                .finally(() => {
                    if (modeRefetches.get(agentId) === state) {
                        modeRefetches.delete(agentId);
                        if (state.again && !closed && !rootController.signal.aborted) {
                            refetchAgentMode(agentId, state.options);
                        }
                    }
                }),
        );
    };

    const switchedModeOf = (
        agentId: string,
        message: Message,
        runId: string | null,
        providerId: string,
        modelId: string,
    ): MessageMode | undefined => {
        const entry = sessions.get(agentId);
        let base: MessageMode | undefined;
        let latestCreatedAt = -Infinity;
        if (entry !== undefined) {
            for (const candidate of entry.messages.values()) {
                if (
                    candidate.message.role === "user" &&
                    (runId === null || candidate.runId === runId) &&
                    candidate.message.createdAt <= message.createdAt &&
                    candidate.message.createdAt >= latestCreatedAt
                ) {
                    latestCreatedAt = candidate.message.createdAt;
                    base = candidate.message.mode;
                }
            }
        }
        base ??=
            agentModes.get(agentId) ??
            agentDrafts.get(agentId)?.value ??
            (config !== undefined ? defaultMode(config) : undefined);
        if (base === undefined) return undefined;
        const reference = config?.providers[providerId]?.models.find(
            (candidate) => candidate.id === modelId,
        );
        const definition = config?.models[modelId];
        const efforts = reference?.efforts ?? definition?.efforts;
        const defaultEffort = reference?.defaultEffort ?? definition?.defaultEffort;
        const effort =
            efforts !== undefined && efforts.includes(base.effort)
                ? base.effort
                : (defaultEffort ?? base.effort);
        const tierSupported =
            base.serviceTier !== null &&
            (reference?.serviceTierOptions !== undefined
                ? reference.serviceTierOptions.some((option) => option.id === base.serviceTier)
                : definition?.serviceTierOptions !== undefined
                  ? definition.serviceTierOptions.some((option) => option.id === base.serviceTier)
                  : (definition?.serviceTiers ?? []).includes(base.serviceTier));
        return {
            effort,
            modelId,
            permissionMode: base.permissionMode,
            providerId,
            serviceTier: tierSupported ? base.serviceTier : null,
        };
    };

    const adoptFailureSwitch = (
        agentId: string,
        message: Message,
        runId: string | null,
        wasUnresolvedFailure: boolean,
    ): void => {
        if (message.role !== "service") return;
        const resolution = message.failure?.resolution;
        if (
            resolution?.action !== "switched" ||
            !("providerId" in resolution) ||
            !("modelId" in resolution)
        ) {
            return;
        }
        const switchKey = `${agentId}:${message.id}`;
        if (adoptedSwitchMessages.has(switchKey)) return;
        const switchRevision = pendingSwitchRevisions.get(switchKey);
        if (switchRevision === undefined && !wasUnresolvedFailure) {
            return;
        }
        pendingSwitchRevisions.delete(switchKey);
        rememberAdoptedSwitchMessage(switchKey);
        if (
            (switchRevision !== undefined &&
                (modeRevisions.get(agentId) ?? 0) !== switchRevision) ||
            intendedModes.has(agentId)
        ) {
            return;
        }
        intendedModes.delete(agentId);
        const switched = switchedModeOf(
            agentId,
            message,
            runId,
            resolution.providerId,
            resolution.modelId,
        );
        if (switched !== undefined) {
            adoptMessageMode(agentId, switched);
            reconcileSwitchedDraftMode(agentId, switched);
            const entry = sessions.get(agentId);
            if (entry !== undefined) publishSession(entry);
            publishGroups();
        }
        refetchAgentMode(agentId, {
            expectedRoute: {
                providerId: resolution.providerId,
                modelId: resolution.modelId,
            },
            modeRevision: modeRevisions.get(agentId),
            reconcileDraft: true,
        });
    };

    const updateMessage = (agentId: string, message: Message, runId: string | null): void => {
        if (message.role === "user") sendConfirmations.get(message.id)?.();
        const entry = sessions.get(agentId);
        const current = entry?.messages.get(message.id)?.message;
        const wasUnresolvedFailure =
            current?.role === "service" &&
            current.failure !== undefined &&
            current.failure.resolution === undefined;
        // HTTP replies and stream events can arrive independently. Acceptance
        // is final for a message ID: a late send reply must not put it back in
        // the pending tail after run.started or run.boundary already took it.
        if (
            current?.role === "user" &&
            current.status === "accepted" &&
            message.role === "user" &&
            message.status === "pending"
        ) {
            return;
        }
        if (message.role === "user") {
            rememberUserMessageId(message.id);
            adoptMessageMode(agentId, message.mode);
        } else if (
            message.role === "service" &&
            message.failure?.resolution?.action === "switched"
        ) {
            adoptFailureSwitch(agentId, message, runId, wasUnresolvedFailure);
        } else if (
            message.role === "agent" &&
            message.metadata.senderAgentId !== undefined &&
            runId !== null &&
            agentModes.get(agentId) == null
        ) {
            refetchAgentMode(agentId);
        }
        if (entry === undefined) return;
        entry.messages.set(message.id, { message, runId });
        indexMessageUser(entry, message);
        publishSession(entry);
    };

    // The failed message comes back carrying its resolution; it keeps the run
    // it already belongs to, and the continued run arrives through events.
    const failureResolutionAdopt = (
        agentId: string,
        { agent, message }: FailureResolutionResponse,
    ): void => {
        adoptAgent(agent);
        const entry = sessions.get(agentId);
        if (entry === undefined) {
            adoptFailureSwitch(agentId, message, null, false);
            return;
        }
        updateMessage(agentId, message, entry.messages.get(message.id)?.runId ?? null);
    };

    const updateMessageSnapshot = (agentId: string, message: Message, runId: string): void => {
        const entry = sessions.get(agentId);
        const current = entry?.messages.get(message.id);
        if (
            current?.message.role === "agent" &&
            message.role === "agent" &&
            message.content.length === 0
        ) {
            return;
        }
        // A message no provider produced, such as Happy's scripted onboarding
        // messages, has no provider segments: its snapshot is the whole message,
        // even when the daemon rewrote it in place.
        if (
            entry === undefined ||
            current?.message.role !== "agent" ||
            message.role !== "agent" ||
            message.metadata.providerId === undefined
        ) {
            if (entry !== undefined) {
                entry.messageBlockOffsets.delete(message.id);
                entry.corruptedMessageIds.delete(message.id);
            }
            updateMessage(agentId, message, runId);
            return;
        }
        /*
         * The API gives every provider segment in a run one assistant-message
         * identity. A live `message.updated` snapshot contains the current
         * segment, while history contains their cumulative content. Replace
         * the matching live suffix when this segment evolved; append it when
         * the model moved on to a new segment after a tool result.
         */
        const merged = liveMessageContentMerge(current.message.content, message.content);
        entry.messageBlockOffsets.set(message.id, merged.offset);
        entry.corruptedMessageIds.delete(message.id);
        updateMessage(agentId, { ...message, content: merged.content }, runId);
    };

    const createMessage = (agentId: string, message: Message, runId: string | null): void => {
        const entry = sessions.get(agentId);
        const current = entry?.messages.get(message.id);
        if (current !== undefined) {
            /*
             * Happy Agent reuses one assistant-message identity across its
             * provider segments, and hydration can replay a creation already
             * represented by newer history. Only a locally pending user send
             * needs the durable creation to replace it.
             */
            if (current.pendingSend && message.role === "user") {
                updateMessage(agentId, message, runId);
            } else if (message.role === "user") {
                rememberUserMessageId(message.id);
                sendConfirmations.get(message.id)?.();
            }
            return;
        }
        if (entry !== undefined) entry.messageBlockOffsets.set(message.id, 0);
        updateMessage(agentId, message, runId);
    };

    const acceptMessages = (
        agentId: string,
        messageIds: readonly string[],
        runId: string,
    ): void => {
        if (messageIds.length === 0) return;
        const entry = sessions.get(agentId);
        let nonUserAccepted = false;
        for (const messageId of messageIds) {
            const current = entry?.messages.get(messageId);
            if (current?.message.role === "user") {
                entry!.messages.set(messageId, {
                    message: {
                        ...current.message,
                        status: "accepted",
                        runId,
                    },
                    runId,
                });
                continue;
            }
            if (!knownUserMessageIds.has(messageId)) nonUserAccepted = true;
        }
        if (nonUserAccepted) refetchAgentMode(agentId);
        // The event handler installs the run that accepted these messages
        // before publishing. Until then they have no projectable run.
    };

    const appendMessageDelta = (
        payload: Extract<HappyAgentEvent, { type: "message.delta" }>["payload"],
    ): void => {
        const entry = sessions.get(payload.agentId);
        if (entry === undefined) return;
        // A session nobody watches still follows its stream: applying a delta to
        // the cached message is cheap, and only projection, which publishSession
        // skips for it, is costly. Reopening it then shows the live transcript
        // at once instead of waiting on a full history read.
        if (entry.corruptedMessageIds.has(payload.messageId)) return;
        const current = entry?.messages.get(payload.messageId);
        const blockIndex =
            (entry.messageBlockOffsets.get(payload.messageId) ?? 0) + payload.blockIndex;
        const applied = applyMessageDelta(current?.message, { ...payload, blockIndex });
        if (applied.kind === "replayed") return;
        if (applied.kind === "reconcile") {
            reportDebug({
                detail: debugDetail({
                    blockIndex,
                    messageId: payload.messageId,
                    offset: payload.offset,
                    sessionId: payload.agentId,
                }),
                level: "warning",
                message: "Message delta did not match local state; awaiting a complete snapshot",
                source: "sync",
            });
            // The protocol promises a complete `message.updated` snapshot after
            // streaming deltas. Ignore this message's remaining deltas until it
            // arrives; only a run boundary with no repair falls back to history.
            entry.corruptedMessageIds.add(payload.messageId);
            return;
        }
        if (current === undefined) return;
        entry.messages.set(payload.messageId, {
            ...current,
            message: applied.message,
        });
        publishSession(entry);
    };

    const recoverCorruptedMessages = (agentId: string): void => {
        const entry = sessions.get(agentId);
        if (entry === undefined || entry.corruptedMessageIds.size === 0) return;
        entry.reconcileRequired = true;
        if (entry.subscribers.size === 0) return;
        background(requestSessionLoad(entry));
    };

    const updateQuestion = (agentId: string, question: Question): void => {
        const entry = sessions.get(agentId);
        if (entry === undefined) return;
        if (
            entry.question !== undefined &&
            entry.question !== null &&
            !shouldAdoptVersion(entry.question, question)
        ) {
            return;
        }
        entry.question = question;
        publishSession(entry);
    };

    const loadActivity = (entry: SessionEntry): Promise<void> => {
        if (entry.activityLoading !== undefined) return entry.activityLoading;
        const revision = entry.activityRevision;
        const running = client
            .getAgentActivity(entry.id, {
                signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS),
            })
            .then((activity) => {
                if (sessions.get(entry.id) !== entry || entry.activityRevision !== revision) return;
                setActivity(entry, activity);
                publishSession(entry);
            })
            .catch((error: unknown) => {
                if (!rootController.signal.aborted) {
                    for (const subscriber of entry.subscribers) subscriber.onError?.(error);
                }
            });
        const tracked = running.finally(() => {
            if (entry.activityLoading === tracked) entry.activityLoading = undefined;
        });
        entry.activityLoading = tracked;
        return tracked;
    };

    const recoverActivity = (entry: SessionEntry): void => {
        if (entry.subscribers.size > 0) background(loadActivity(entry));
        else entry.reconcileRequired = true;
    };

    const updateActivityProcess = (entry: SessionEntry, process: BackgroundProcess): void => {
        const activity = entry.activity;
        if (activity === undefined) {
            recoverActivity(entry);
            return;
        }
        const current = activity.processes.find((candidate) => candidate.id === process.id);
        if (!shouldAdoptVersion(current, process)) return;
        setActivity(entry, {
            ...activity,
            processes: [...replaceResource(activity.processes, process)],
        });
        publishSession(entry);
    };

    const sessionOwningProcess = (processId: string): SessionEntry | undefined => {
        const agentId = processOwners.get(processId);
        if (agentId !== undefined) {
            const entry = sessions.get(agentId);
            if (entry !== undefined) return entry;
        }
        for (const entry of sessions.values()) {
            if (entry.activity?.processes.some((process) => process.id === processId)) return entry;
        }
        return undefined;
    };

    const patchActivityProcess = (
        entry: SessionEntry,
        payload: Extract<HappyAgentEvent, { type: "process.updated" }>["payload"],
    ): void => {
        const current = entry.activity?.processes.find(
            (process) => process.id === payload.processId,
        );
        if (current === undefined || current.version !== payload.previousVersion) {
            recoverActivity(entry);
            return;
        }
        updateActivityProcess(entry, {
            ...applyChanges(current, payload.changes),
            version: payload.version,
        });
    };

    const recoverQuestion = (entry: SessionEntry): void => {
        if (entry.questionRecovery !== undefined) return;
        const running = (async (): Promise<void> => {
            let retryMs = INITIAL_RECONNECT_MS;
            let lastError: unknown;
            for (let attempt = 0; attempt < 5; attempt += 1) {
                if (
                    rootController.signal.aborted ||
                    sessions.get(entry.id) !== entry ||
                    entry.subscribers.size === 0 ||
                    entry.question !== undefined ||
                    entry.agent?.pendingQuestionId === null
                ) {
                    return;
                }
                try {
                    const response = await client.getPendingQuestion(entry.id, {
                        signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS),
                    });
                    if (sessions.get(entry.id) !== entry) return;
                    if (
                        (response.question === null &&
                            (entry.question === undefined || entry.question === null)) ||
                        (response.question !== null &&
                            (entry.question === undefined ||
                                entry.question === null ||
                                shouldAdoptVersion(entry.question, response.question)))
                    ) {
                        entry.question = response.question;
                        publishSession(entry);
                    }
                    return;
                } catch (error) {
                    if (rootController.signal.aborted) return;
                    lastError = error;
                }
                await wait(retryMs, rootController.signal).catch(() => undefined);
                retryMs = Math.min(retryMs * 2, MAXIMUM_RECONNECT_MS);
            }
            if (lastError !== undefined) {
                for (const subscriber of entry.subscribers) subscriber.onError?.(lastError);
            }
        })();
        const tracked = running.finally(() => {
            if (entry.questionRecovery === tracked) entry.questionRecovery = undefined;
            settleSessionIfIdle(entry);
        });
        entry.questionRecovery = tracked;
    };

    const retryUpdates = (): void => {
        if (closed || rootController.signal.aborted) return;
        retryRequested = true;
        updatesAttemptController?.abort();
        retryWake?.();
        retryWake = undefined;
    };

    const reconnectPause = async (milliseconds: number): Promise<void> => {
        if (retryRequested) {
            retryRequested = false;
            return;
        }
        let wake!: () => void;
        const requested = new Promise<void>((resolve) => {
            wake = resolve;
            retryWake = resolve;
        });
        try {
            await Promise.race([wait(milliseconds, rootController.signal), requested]);
        } finally {
            if (retryWake === wake) retryWake = undefined;
            retryRequested = false;
        }
    };

    /**
     * What a daemon's health admits: whether it is ready, and speaks a protocol this client
     * does. Health is read for every new process, so this is also where a replacement that
     * admits work again is first known.
     */
    const healthAdmit = (health: HappyAgentHealth, issuedEpoch: number): boolean => {
        reportDebug({
            detail: debugDetail(health),
            level: health.ready ? "info" : "warning",
            message: health.ready ? "Happy Agent health check passed" : "Happy Agent is not ready",
            source: "connection",
        });
        sync.writer.healthReceived(health);
        // Health is read for every new process, so this is where a
        // replacement that admits work again is first known.
        // A read sent before the drain now known answered for the moment before it.
        if (drain === undefined || issuedEpoch === drainEpoch)
            admittingSet(health.draining !== true && health.shuttingDown !== true, health.drain);
        const nextCompatibility = serverCompatibility(health.version);
        reportCompatibility(nextCompatibility);
        return nextCompatibility.status === "compatible" && health.ready;
    };

    /**
     * Starts a connection in one round trip: the desktop bootstrap is read and the update feed
     * opened right behind it, with no health check in front of either. A current daemon's
     * bootstrap carries its health; an older one's is read after it. Updates that arrive
     * before the bootstrap are held, and handed on only after it has been applied.
     *
     * Takes nothing when the step-by-step start would have stopped before the bootstrap, and
     * says which way the caller goes instead, where every such case is explained and waited out
     * exactly as it always was: `unanswered` when the bootstrap failed, which health, read
     * next, explains (a daemon still starting, a member not let in yet); `gated` when the
     * daemon speaks a protocol this client does not, or a member still owes a profile, which
     * the step-by-step start keeps checking from then on.
     */
    const bootstrapBesideFeed = async (
        attemptSignal: AbortSignal,
    ): Promise<
        | {
              /** The feed opened beside the bootstrap, or none when its read-ahead was dropped. */
              readonly feed: AsyncIterable<HappyAgentUpdate> | undefined;
              /** The bootstrap's cursor: everything at or before it is already applied. */
              readonly floor: string;
          }
        | "unanswered"
        | "gated"
    > => {
        const issuedEpoch = drainEpoch;
        reportDebug({
            level: "info",
            message: "Reading desktop bootstrap beside the managed update feed",
            source: "sync",
        });
        // The bootstrap is asked first and the feed opened only after it. Every connection of
        // a window shares one proxy origin and the browser's few HTTP/1.1 connections to it,
        // which take requests in the order they were sent; a feed holds its connection for
        // good, so feeds sent ahead of the bootstraps could take them all and leave a
        // bootstrap waiting behind them. Sent behind its own bootstrap, a feed only ever
        // waits for one, as it did when it opened after the bootstrap had answered. A client
        // with a fixed token, as every desktop connection's is, sends each request the moment
        // it is called.
        const reading: Promise<
            { readonly bootstrap: DesktopBootstrapCurrent } | { readonly error: unknown }
        > = client
            .getDesktopBootstrap({
                signal: AbortSignal.any([
                    attemptSignal,
                    AbortSignal.timeout(SNAPSHOT_RESPONSE_TIMEOUT_MS),
                ]),
            })
            .then(
                (bootstrap: DesktopBootstrapCurrent) => ({ bootstrap }),
                (error: unknown) => ({ error }),
            );
        const feedController = new AbortController();
        const iterator = client
            .updates({ signal: AbortSignal.any([attemptSignal, feedController.signal]) })
            [Symbol.asyncIterator]();
        const early: HappyAgentUpdate[] = [];
        let next: Promise<IteratorResult<HappyAgentUpdate>> | undefined = iterator.next();
        let feedOpen = true;
        const feedClose = (): void => {
            feedOpen = false;
            feedController.abort();
            void next?.catch(() => undefined);
            next = undefined;
            early.length = 0;
            // Ends the feed even where it rests on an update nobody will ask past.
            void iterator.return?.(undefined).catch(() => undefined);
        };
        let read: Awaited<typeof reading>;
        for (;;) {
            const pending = next;
            const step =
                pending === undefined
                    ? await reading
                    : await Promise.race([
                          reading,
                          pending.then(
                              (result) => ({ result }),
                              () => ({ result: undefined }),
                          ),
                      ]);
            if (!("result" in step)) {
                read = step;
                break;
            }
            if (step.result === undefined || step.result.done === true) {
                next = undefined;
                continue;
            }
            early.push(step.result.value);
            if (early.length >= FEED_READ_AHEAD_LIMIT) {
                reportDebug({
                    detail: debugDetail({ held: early.length }),
                    level: "warning",
                    message: "Update feed read ahead too far; reopening it after the bootstrap",
                    source: "sse",
                });
                feedClose();
                continue;
            }
            next = iterator.next();
        }
        try {
            if ("error" in read) {
                // An abandoned attempt is not the daemon's answer; the loop retries it.
                if (attemptSignal.aborted) throw read.error;
                reportDebug({
                    detail: errorDetail(read.error),
                    level: "warning",
                    message: "Desktop bootstrap failed; asking Happy Agent health why",
                    source: "sync",
                });
                feedClose();
                return "unanswered";
            }
            const { bootstrap } = read;
            // A daemon too old to carry its health in the bootstrap is asked for it apart.
            const health =
                bootstrap.health ??
                (await client.getHealth({
                    signal: AbortSignal.any([
                        attemptSignal,
                        AbortSignal.timeout(SNAPSHOT_RESPONSE_TIMEOUT_MS),
                    ]),
                }));
            if (!healthAdmit(health, issuedEpoch)) {
                feedClose();
                return "gated";
            }
            if (
                options.memberProfileRequired !== false &&
                !bootstrap.onboarding.completed &&
                !bootstrap.onboarding.steps.profile.done
            ) {
                feedClose();
                return "gated";
            }
            await resync(false, bootstrap);
            if (rootController.signal.aborted || !feedOpen) {
                feedClose();
                return { feed: undefined, floor: bootstrap.cursor };
            }
            const held = early.splice(0);
            let pending = next;
            next = undefined;
            // The held updates first, then the read already out, then the feed itself, handed
            // through directly so a live update reaches the loop as promptly as a plain feed's.
            const feed: AsyncIterable<HappyAgentUpdate> = {
                [Symbol.asyncIterator]: () => ({
                    next: (): Promise<IteratorResult<HappyAgentUpdate>> => {
                        const value = held.shift();
                        if (value !== undefined) return Promise.resolve({ done: false, value });
                        const taken = pending;
                        pending = undefined;
                        return taken ?? iterator.next();
                    },
                    return: (): Promise<IteratorResult<HappyAgentUpdate>> => {
                        held.length = 0;
                        feedController.abort();
                        void pending?.catch(() => undefined);
                        pending = undefined;
                        void iterator.return?.(undefined).catch(() => undefined);
                        return Promise.resolve({ done: true, value: undefined });
                    },
                }),
            };
            return { feed, floor: bootstrap.cursor };
        } catch (error) {
            feedClose();
            throw error;
        }
    };

    const runUpdates = async (): Promise<void> => {
        let reconnectMs = INITIAL_RECONNECT_MS;
        // Startup reads the bootstrap beside the feed until the daemon turns out to need the
        // step-by-step start: it speaks another protocol, or a member owes a profile. From
        // then on startup gates on health and onboarding, as it always did.
        let bootstrapOptimistic = true;
        while (!rootController.signal.aborted) {
            const attemptController = new AbortController();
            updatesAttemptController = attemptController;
            const attemptSignal = AbortSignal.any([
                rootController.signal,
                attemptController.signal,
            ]);
            try {
                // The feed this attempt follows when it was opened beside the bootstrap, and
                // that bootstrap's cursor: the feed's events at or before it are in the
                // snapshot already, and a feed that opened past it missed the ones between.
                let besideFeed: AsyncIterable<HappyAgentUpdate> | undefined;
                let feedFloor: string | undefined;
                if (config === undefined && !daemonVerify && bootstrapOptimistic) {
                    const started = await bootstrapBesideFeed(attemptSignal);
                    if (started === "gated") bootstrapOptimistic = false;
                    else if (started !== "unanswered") {
                        besideFeed = started.feed;
                        feedFloor = started.floor;
                    }
                }
                // Health gates every other start because it is the only route guaranteed
                // while the daemon is booting. Once the first bootstrap lands, the client's
                // managed update feed owns reachability and reconnection — until a different
                // process may be answering it, which passes the same gate before anything of
                // its is used.
                if (feedFloor === undefined && (config === undefined || daemonVerify)) {
                    reportDebug({
                        level: "info",
                        message: "Checking Happy Agent health before managed updates",
                        source: "connection",
                    });
                    const issuedEpoch = drainEpoch;
                    const health = await client.getHealth({
                        signal: AbortSignal.any([
                            attemptSignal,
                            AbortSignal.timeout(SNAPSHOT_RESPONSE_TIMEOUT_MS),
                        ]),
                    });
                    if (!healthAdmit(health, issuedEpoch)) {
                        if (config === undefined) sync.writer.onboardingUnavailable();
                        publishConnection(config === undefined ? "connecting" : "reconnecting");
                        reportDebug({
                            detail: debugDetail({ delayMs: reconnectMs }),
                            level: "warning",
                            message: "Waiting before the next connection attempt",
                            source: "connection",
                        });
                        // The replacement of a daemon that just drained answers while it is
                        // still starting and is ready in moments, so it is asked again at the
                        // first interval, but only within that window.
                        const starting =
                            compatibility.status === "compatible" &&
                            now() < replacementExpectedUntil;
                        await reconnectPause(starting ? INITIAL_RECONNECT_MS : reconnectMs);
                        if (!starting)
                            reconnectMs = Math.min(reconnectMs * 2, MAXIMUM_RECONNECT_MS);
                        continue;
                    }
                }
                if (feedFloor === undefined && config === undefined) {
                    // Team members without a profile can read these endpoints,
                    // but cannot read config/bootstrap or open the event stream.
                    // Keep that authorization boundary identical for every route.
                    // A solo Happy Agent has no such boundary: it reports a
                    // missing profile too, but authorizes bootstrap regardless.
                    const signal = AbortSignal.any([
                        attemptSignal,
                        AbortSignal.timeout(SNAPSHOT_RESPONSE_TIMEOUT_MS),
                    ]);
                    const [onboarding, profile] = await Promise.all([
                        client.getOnboarding({ signal }),
                        client.getProfile({ signal }),
                    ]);
                    if (attemptSignal.aborted) continue;
                    sync.writer.onboardingReceived({ onboarding, profile: profile.profile });
                    if (
                        options.memberProfileRequired !== false &&
                        !onboarding.completed &&
                        !onboarding.steps.profile.done
                    ) {
                        // There is no authorized SSE channel yet. Reconcile
                        // narrow startup state until this member can bootstrap.
                        reconnectMs = INITIAL_RECONNECT_MS;
                        await reconnectPause(2_000);
                        continue;
                    }
                }
                if (feedFloor !== undefined) {
                    // Already applied beside the feed.
                } else if (config === undefined) await resync(false);
                else if (daemonVerify) {
                    // A replacement carries none of the previous process's
                    // journal, so everything applied so far is only as good as
                    // a snapshot taken again. Cleared only once that snapshot
                    // lands; a failure goes back through the gate on the
                    // ordinary reconnect backoff.
                    await resync(true);
                    daemonVerify = false;
                }
                let reopen = false;
                // A fresh stream's hello names the journal's head when it opened. Only the
                // first one of a feed opened beside the bootstrap needs comparing with it.
                let floorHelloPending = besideFeed !== undefined;
                reportDebug({
                    detail: debugDetail({
                        after: cursor ?? null,
                        beside: besideFeed !== undefined,
                    }),
                    level: "info",
                    message: "Opening managed update feed",
                    source: "sse",
                });
                for await (const update of besideFeed ??
                    client.updates({
                        after: cursor,
                        signal: attemptSignal,
                    })) {
                    if (floorHelloPending && update.kind === "connected") {
                        floorHelloPending = false;
                        if (feedFloor !== undefined && update.cursor.localeCompare(feedFloor) > 0) {
                            // The feed opened after the bootstrap's cursor, so the events
                            // between the two are in neither. Follow from the bootstrap's
                            // cursor instead, which replays exactly those.
                            reportDebug({
                                detail: debugDetail({ bootstrap: feedFloor, feed: update.cursor }),
                                level: "info",
                                message: "Update feed opened past the bootstrap; reopening from it",
                                source: "sse",
                            });
                            reopen = true;
                            break;
                        }
                    }
                    // Already part of the bootstrap snapshot; applying it again could repeat a
                    // non-idempotent change.
                    if (
                        update.kind === "event" &&
                        feedFloor !== undefined &&
                        update.cursor.localeCompare(feedFloor) <= 0
                    )
                        continue;
                    if (
                        update.kind === "event" &&
                        (update.event.type === "message.created" ||
                            update.event.type === "message.updated")
                    ) {
                        await ensureMessageUsers([update.event.payload.message]);
                    }
                    if (rootController.signal.aborted) return;
                    sync.writer.updateReceived(update);
                    if (update.kind === "connected") {
                        // A forwarding hop can refuse work while it drains even
                        // though the remote daemon never drained. Its feed then
                        // reconnects with the same daemon ID, so verify admission
                        // without waiting for a replacement-process signal.
                        if (!admitting) {
                            const issuedEpoch = drainEpoch;
                            const health = await client.getHealth({
                                signal: AbortSignal.any([
                                    attemptSignal,
                                    AbortSignal.timeout(SNAPSHOT_RESPONSE_TIMEOUT_MS),
                                ]),
                            });
                            if (attemptSignal.aborted) break;
                            if (!healthAdmit(health, issuedEpoch)) {
                                daemonVerify = true;
                                reopen = true;
                                break;
                            }
                        }
                        reportDebug({
                            detail: debugDetail({ cursor: update.cursor }),
                            level: "info",
                            message: "Managed update feed connected",
                            source: "sse",
                        });
                        publishConnection("live");
                        heldWritesFlush();
                        reconnectMs = INITIAL_RECONNECT_MS;
                    } else if (update.kind === "state_lost") {
                        reportDebug({
                            detail: debugDetail({ cursor: update.cursor }),
                            level: "warning",
                            message: "Managed update feed reported a journal gap",
                            source: "sse",
                        });
                        publishConnection("reconnecting");
                        // A lost journal is also how a replacement that does
                        // not name its process shows itself, so the process is
                        // verified before it is reconciled.
                        daemonVerify = true;
                        reopen = true;
                        break;
                    } else if (update.kind === "daemon_started") {
                        // Each `updates()` iterator only compares against the
                        // processes it saw itself; the connection remembers
                        // across the reopen that follows a failed attempt.
                        const replaced =
                            update.replaced ||
                            (daemonId !== undefined && daemonId !== update.daemonId);
                        daemonId = update.daemonId;
                        reportDebug({
                            detail: debugDetail({
                                cursor: update.cursor,
                                daemonId: update.daemonId,
                                replaced,
                            }),
                            level: replaced ? "warning" : "info",
                            message: replaced
                                ? "A different Happy Agent process is answering; reconciling"
                                : "Managed update feed named its Happy Agent process",
                            source: "sse",
                        });
                        // Nothing from a replacement is used until its own
                        // health admits it; the gate at the top of the loop
                        // reads that and then reconciles.
                        if (replaced) {
                            publishConnection("reconnecting");
                            daemonVerify = true;
                            reopen = true;
                            break;
                        }
                    } else if (update.kind === "draining") {
                        // A draining agent still answers and still streams, and
                        // the feed says so itself when it finally stops. It no
                        // longer admits writes, so routine ones are held.
                        admittingSet(false, update.drain, update.daemonId);
                        replacementExpectedUntil = now() + REPLACEMENT_RECONNECT_WINDOW_MS;
                        reportDebug({
                            detail: debugDetail({
                                cursor: update.cursor,
                                daemonId: update.daemonId ?? null,
                            }),
                            level: "info",
                            message: "Happy Agent stopped admitting new work",
                            source: "sse",
                        });
                    } else if (update.kind === "disconnected") {
                        reportDebug({
                            detail: debugDetail({ cursor: update.cursor ?? null }),
                            level: "warning",
                            message: "Managed update feed disconnected; client reconnecting",
                            source: "sse",
                        });
                        publishConnection("reconnecting");
                    } else if (update.kind === "document") {
                        // A live document frame carries someone's typing to
                        // the document stores following it; it has no cursor
                        // and is never journaled, so nothing here moves.
                    } else {
                        reportDebug({
                            detail: debugDetail(update.event),
                            level: "info",
                            message: `SSE event arrived: ${update.event.type}`,
                            source: "sse",
                        });
                        // `updates()` has already rejected duplicate and older
                        // cursors. Keep Happy's cursor only as the durable
                        // snapshot boundary used by hydration and gap recovery.
                        rememberEvent(update.event);
                        applyEvent(update.event);
                        advanceCursor(update.cursor);
                    }
                }
                if (reopen) {
                    retryRequested = false;
                    continue;
                }
                if (!rootController.signal.aborted) {
                    reportDebug({
                        level: retryRequested ? "info" : "warning",
                        message: retryRequested
                            ? "Managed update feed restart requested"
                            : "Managed update feed ended",
                        source: "sse",
                    });
                    publishConnection("reconnecting");
                }
            } catch (error) {
                if (rootController.signal.aborted) break;
                publishConnection(config === undefined ? "connecting" : "reconnecting");
                if (!retryRequested) {
                    // An intentional restart (including a just-saved profile)
                    // is not a failed request to display on the setup form.
                    sync.writer.errorReceived(error);
                    reportDebug({
                        detail: errorDetail(error),
                        level: "error",
                        message: "Connection or update reconciliation failed",
                        source: "connection",
                    });
                    for (const subscriber of groupSubscribers) subscriber.onError?.(error);
                    for (const entry of sessions.values()) {
                        for (const subscriber of entry.subscribers) subscriber.onError?.(error);
                    }
                }
            } finally {
                if (updatesAttemptController === attemptController) {
                    updatesAttemptController = undefined;
                }
            }
            if (!rootController.signal.aborted) {
                const immediate = retryRequested;
                if (!immediate) {
                    reportDebug({
                        detail: debugDetail({ delayMs: reconnectMs }),
                        level: "info",
                        message: "Reconnect scheduled",
                        source: "connection",
                    });
                }
                await reconnectPause(immediate ? 0 : reconnectMs);
                reconnectMs =
                    immediate || now() < replacementExpectedUntil
                        ? INITIAL_RECONNECT_MS
                        : Math.min(reconnectMs * 2, MAXIMUM_RECONNECT_MS);
            }
        }
    };

    const sendMessageWithRetry = async (
        sessionId: string,
        request: SendMessageRequest,
        confirmed: Promise<void>,
    ): Promise<SendMessageResponse | undefined> => {
        let retryMs = INITIAL_SEND_RETRY_MS;
        for (let attempt = 1; ; attempt += 1) {
            try {
                return await Promise.race([
                    client.sendMessage(sessionId, request, { signal: deadlineSignal() }),
                    confirmed.then(() => undefined),
                ]);
            } catch (error) {
                // A draining daemon has said it takes nothing new until it is
                // replaced, which takes far longer than any retry here waits.
                // The send fails now, so its words go back to the composer.
                if (drainingRefusal(error)) {
                    admittingSet(false);
                    throw error;
                }
                const retryable =
                    !(error instanceof HappyAgentApiError) ||
                    error.status === 408 ||
                    error.status === 429 ||
                    error.status >= 500;
                if (rootController.signal.aborted || !retryable || attempt >= SEND_ATTEMPTS) {
                    throw error;
                }
                await wait(retryMs, rootController.signal);
                retryMs = Math.min(retryMs * 2, MAXIMUM_RECONNECT_MS);
            }
        }
    };

    const mutation = <T>(
        action: MutationAction,
        mutationId: string,
        request: () => Promise<T>,
        applied?: (value: T) => void,
        rejected?: (error: unknown) => boolean | void,
        sessionId?: string,
        queueKey = mutationId,
    ): string => {
        const queued = (mutationQueues.get(queueKey) ?? Promise.resolve()).then(request);
        const settled = queued.then(
            () => undefined,
            () => undefined,
        );
        mutationQueues.set(queueKey, settled);
        if (sessionId !== undefined) {
            sessionMutationCounts.set(sessionId, (sessionMutationCounts.get(sessionId) ?? 0) + 1);
        }
        const completed = queued.then((value) => {
            if (!closed) applied?.(value);
        });
        if (
            action === "switch_model" ||
            action === "set_effort" ||
            action === "set_service_tier" ||
            action === "set_permission_mode"
        ) {
            modeSaveOutcomes.set(mutationId, completed);
            void completed.catch(() => undefined);
            while (modeSaveOutcomes.size > 256)
                modeSaveOutcomes.delete(modeSaveOutcomes.keys().next().value!);
        }
        if (action === "rename_task" || action === "rename_group") {
            renameOutcomes.set(mutationId, completed);
            void completed.catch(() => undefined);
            while (renameOutcomes.size > 256)
                renameOutcomes.delete(renameOutcomes.keys().next().value!);
        }
        const creationOutcomes =
            action === "create_session"
                ? sessionCreationOutcomes
                : action === "create_workspace"
                  ? workspaceCreationOutcomes
                  : undefined;
        if (creationOutcomes) {
            creationOutcomes.set(
                mutationId,
                completed.then(() => undefined),
            );
            void creationOutcomes.get(mutationId)!.catch(() => undefined);
            while (creationOutcomes.size > 256)
                creationOutcomes.delete(creationOutcomes.keys().next().value!);
        }
        // An optimistic conversation can accept input before its backend resource
        // exists. Sends wait for this dependency only, not the agent's work queue.
        if (action === "create_session" && sessionId !== undefined) {
            sessionCreations.set(sessionId, completed);
        }
        void completed
            .catch((error: unknown) => {
                if (!rootController.signal.aborted) {
                    const shouldReport = rejected?.(error) !== false;
                    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
                    if (shouldReport) {
                        reportMutationFailure(
                            action,
                            mutationId,
                            timedOut ? new Error("The agent did not answer in time.") : error,
                            sessionId,
                        );
                    }
                }
            })
            .finally(() => {
                if (mutationQueues.get(queueKey) === settled) mutationQueues.delete(queueKey);
                if (sessionId !== undefined) {
                    if (sessionCreations.get(sessionId) === completed) {
                        sessionCreations.delete(sessionId);
                    }
                    const pending = (sessionMutationCounts.get(sessionId) ?? 1) - 1;
                    if (pending === 0) sessionMutationCounts.delete(sessionId);
                    else sessionMutationCounts.set(sessionId, pending);
                    const entry = sessions.get(sessionId);
                    if (entry !== undefined) settleSessionIfIdle(entry);
                }
            });
        return mutationId;
    };

    /**
     * Archives or unarchives a task for everyone, guarded by the version this
     * connection holds. The host refuses a caller it does not let archive the
     * task, and a version someone else has already moved past; both refusals
     * are reworded here because the host's own message names neither the task
     * nor what to do next.
     */
    const taskArchivalSet = (taskId: string, archived: boolean): string => {
        const mutationId = nextId();
        const action = archived ? "archive_task" : "unarchive_task";
        const verb = archived ? "archive" : "unarchive";
        return mutation(
            action,
            mutationId,
            async () => {
                const task = taskOf(taskId);
                if (task === undefined) throw new Error("The task is not loaded.");
                const options = { ifMatch: task.version, mutationId, signal: deadlineSignal() };
                try {
                    return await (archived
                        ? client.archiveTask(taskId, options)
                        : client.unarchiveTask(taskId, options));
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 403)
                        throw new Error(
                            `You can’t ${verb} “${task.name}”. Only its owner or the team owner can.`,
                        );
                    if (error instanceof HappyAgentApiError && error.status === 409) {
                        // The version moved under us; read the task again so a
                        // second try is made against what the host now holds.
                        taskRefetch(taskId);
                        throw new Error(
                            `“${task.name}” changed while you were looking at it. Try again.`,
                        );
                    }
                    throw error;
                }
            },
            taskResponseAdopt,
            undefined,
            undefined,
            `task:${taskId}`,
        );
    };

    const writesHeld = (): boolean => !admitting || groupsStore.getState().connection !== "live";

    /** The daemon's own refusal of a mutation because it is draining. */
    const drainingRefusal = (error: unknown): boolean =>
        error instanceof HappyAgentApiError && error.code === "draining";

    const draftSave = (sessionId: string, save: DraftSave): string => {
        if (writesHeld()) {
            if (save.confirmation) {
                save.confirmation.finish(
                    new Error(
                        "This Happy Agent is offline or updating. Try again when it is available.",
                    ),
                );
                return save.mutationId;
            }
            heldDraftSaves.set(sessionId, save);
            return save.mutationId;
        }
        return mutation(
            "set_draft",
            save.mutationId,
            async () => {
                const request = {
                    draft: save.draft.value,
                    mutationId: save.mutationId,
                    updatedAt: save.updatedAt,
                };
                for (let attempt = 1; ; attempt += 1) {
                    try {
                        return await client.saveAgentDraft(sessionId, request, {
                            signal: deadlineSignal(),
                        });
                    } catch (error) {
                        if (drainingRefusal(error)) {
                            admittingSet(false);
                            if (save.confirmation) throw error;
                            if (!heldDraftSaves.has(sessionId)) heldDraftSaves.set(sessionId, save);
                            return undefined;
                        }
                        const retryable =
                            !(error instanceof HappyAgentApiError) ||
                            error.status === 408 ||
                            error.status === 429 ||
                            error.status >= 500;
                        if (
                            !save.confirmation ||
                            rootController.signal.aborted ||
                            !retryable ||
                            attempt >= SEND_ATTEMPTS
                        )
                            throw error;
                        await wait(
                            INITIAL_SEND_RETRY_MS * 2 ** (attempt - 1),
                            rootController.signal,
                        );
                    }
                }
            },
            (response) => {
                if (response === undefined) return;
                const saved = response.draft;
                if (draftRevisions.get(sessionId) !== save.revision) {
                    save.confirmation?.finish(new Error("The draft changed. Try again."));
                    return;
                }
                draftRevisions.delete(sessionId);
                // A newer remote draft may arrive while this response is in
                // flight. An old acknowledgement must not replace that draft
                // or claim that the diagnostic is still prepared.
                if (
                    save.confirmation &&
                    (agentDrafts.get(sessionId)?.updatedAt ?? 0) > save.updatedAt
                ) {
                    save.confirmation.finish(new Error("The draft changed. Try again."));
                    return;
                }
                replaceDraft(sessionId, saved);
                save.confirmation?.finish(
                    deepEqual(saved, save.draft)
                        ? undefined
                        : new Error("The draft changed. Try again."),
                );
            },
            (error) => {
                save.confirmation?.finish(
                    error instanceof Error
                        ? error
                        : new Error("The draft could not be saved. Try again."),
                );
                if (draftRevisions.get(sessionId) !== save.revision) return;
                draftRevisions.delete(sessionId);
                if (
                    save.confirmation &&
                    (agentDrafts.get(sessionId)?.updatedAt ?? 0) > save.updatedAt
                )
                    return;
                replaceDraft(sessionId, save.previousDraft);
            },
            sessionId,
            `agent:${sessionId}`,
        );
    };

    const sessionReadMark = (sessionId: string): string => {
        const mutationId = nextId();
        if (writesHeld()) {
            heldReads.add(sessionId);
            return mutationId;
        }
        return mutation(
            "mark_session_read",
            mutationId,
            async () => {
                try {
                    return await client.markAgentRead(
                        sessionId,
                        { mutationId },
                        { signal: deadlineSignal() },
                    );
                } catch (error) {
                    if (!drainingRefusal(error)) throw error;
                    admittingSet(false);
                    heldReads.add(sessionId);
                    return undefined;
                }
            },
            (response) => {
                if (response !== undefined) adoptAgent(response.agent);
            },
            undefined,
            sessionId,
            `agent:${sessionId}`,
        );
    };

    /** Sends what was held, once a daemon that admits work is live again. */
    const heldWritesFlush = (): void => {
        if (closed || writesHeld()) return;
        for (const [sessionId, save] of [...heldDraftSaves]) {
            heldDraftSaves.delete(sessionId);
            // A newer edit is already scheduled and supersedes this one.
            if (pendingDraftSaves.has(sessionId)) continue;
            draftSave(sessionId, save);
        }
        for (const sessionId of [...heldReads]) {
            heldReads.delete(sessionId);
            sessionReadMark(sessionId);
        }
    };

    const draftSaveSchedule = (sessionId: string, save: DraftSave): void => {
        draftSaveCancel(sessionId);
        const timer = setTimeout(() => {
            const pending = pendingDraftSaves.get(sessionId);
            if (pending?.mutationId !== save.mutationId) return;
            pendingDraftSaves.delete(sessionId);
            const entry = sessions.get(sessionId);
            if (
                unhydratedDraftModes.has(sessionId) &&
                (entry?.loading !== undefined || entry?.loadRetry !== undefined)
            ) {
                unhydratedDraftSaves.set(sessionId, pending);
                return;
            }
            draftSave(sessionId, pending);
        }, DRAFT_SAVE_DEBOUNCE_MS);
        pendingDraftSaves.set(sessionId, { ...save, timer });
    };

    const draftSaveFlush = (sessionId: string): void => {
        const pending = pendingDraftSaves.get(sessionId);
        if (pending === undefined) return;
        draftSaveCancel(sessionId);
        draftSave(sessionId, pending);
    };

    const saveMode = (
        sessionId: string,
        action: Extract<
            MutationAction,
            "switch_model" | "set_effort" | "set_service_tier" | "set_permission_mode"
        >,
        change: (mode: MessageMode) => MessageMode,
    ): string => {
        const mutationId = nextId();
        const agent = sessions.get(sessionId)?.agent ?? agentOf(sessionId);
        if (agent === undefined || config === undefined) {
            reportMutationFailure(action, mutationId, new Error("The agent is not loaded."));
            return mutationId;
        }
        // Preserve the agent lane's existing text-then-mode ordering when a
        // selection changes during the debounce window.
        if (unhydratedDraftModes.has(sessionId)) {
            draftSaveCancel(sessionId);
        } else {
            draftSaveFlush(sessionId);
        }
        const previousMode = intendedModes.get(sessionId);
        const previousDraft =
            agentDrafts.get(sessionId) ?? ({ value: null, updatedAt: null } as const);
        const mode = change(modeOf(config, previousDraft, agentModes.get(sessionId), previousMode));
        const updatedAt = draftStampAfter(previousDraft, now());
        const draft: AgentDraftSnapshot = {
            value: { ...mode, text: previousDraft.value?.text ?? "" },
            updatedAt,
        };
        modeRevisions.set(sessionId, (modeRevisions.get(sessionId) ?? 0) + 1);
        intendedModes.set(sessionId, mode);
        unhydratedDraftModes.delete(sessionId);
        const revision = (draftRevisions.get(sessionId) ?? 0) + 1;
        draftRevisions.set(sessionId, revision);
        replaceDraft(sessionId, draft);
        return mutation(
            action,
            mutationId,
            () =>
                client.saveAgentDraft(
                    sessionId,
                    {
                        draft: draft.value,
                        mutationId,
                        updatedAt,
                    },
                    { signal: deadlineSignal() },
                ),
            ({ draft: saved }) => {
                if (draftRevisions.get(sessionId) !== revision) return;
                draftRevisions.delete(sessionId);
                intendedModes.delete(sessionId);
                replaceDraft(sessionId, saved);
            },
            () => {
                if (draftRevisions.get(sessionId) !== revision) return;
                draftRevisions.delete(sessionId);
                if (previousMode === undefined) intendedModes.delete(sessionId);
                else intendedModes.set(sessionId, previousMode);
                replaceDraft(sessionId, previousDraft);
            },
            sessionId,
            `agent:${sessionId}`,
        );
    };

    background(runUpdates());
    background(runGitWatchRenewal());

    return {
        compatibility: () => compatibility,
        config: () => (configReloads === 0 ? config : undefined),
        sync: sync.source,
        retry: retryUpdates,
        connectGroups(subscription) {
            if (closed) throw new Error("This Happy Agent connection is closed.");
            const subscriber: GroupsSubscriber = { ...subscription, closed: false };
            groupSubscribers.add(subscriber);
            subscriber.onChange(
                groupsStore.getState().groups,
                groupState(),
                groupsStore.getState().botGroups,
                groupsStore.getState().taskGroups,
            );
            return {
                projects: () => groupsStore.getState().groups,
                bots: () => groupsStore.getState().botGroups,
                tasks: () => groupsStore.getState().taskGroups,
                state: groupState,
                close: () => {
                    subscriber.closed = true;
                    groupSubscribers.delete(subscriber);
                },
            };
        },
        prefetchSession(sessionId) {
            if (closed) return;
            const known = sessions.get(sessionId);
            if (known !== undefined) {
                // Already cached: only a cache a lost cursor made stale is read again.
                void ensureSessionLoaded(known);
                return;
            }
            const entry = sessionEntryCreate(sessionId);
            prefetchedSessions.add(sessionId);
            trimPrefetchedSessions(sessionId);
            // A read that lands lets go of the ones kept while they loaded.
            const trim = (): void => trimPrefetchedSessions();
            ensureSessionLoaded(entry).then(trim, trim);
        },
        sidebarRowsUpdate(rows) {
            if (closed) return;
            const limit = options.preloadedSessions ?? 0;
            const reported = sidebarRows !== undefined;
            const before = recentAgents(limit).map((agent) => agent.id);
            sidebarRows = rows;
            // Only a change to what would be read ahead is worth a pass.
            if (
                reported &&
                deepEqual(
                    before,
                    recentAgents(limit).map((agent) => agent.id),
                )
            )
                return;
            background(preloadRecentSessions());
        },
        connectSession(subscription) {
            if (closed) throw new Error("This Happy Agent connection is closed.");
            prefetchedSessions.delete(subscription.sessionId);
            preloadedSessions.delete(subscription.sessionId);
            releasedSessions.delete(subscription.sessionId);
            const entry =
                sessions.get(subscription.sessionId) ?? sessionEntryCreate(subscription.sessionId);
            const wasInactive = entry.subscribers.size === 0;
            const subscriber: SessionSubscriber = {
                ...subscription,
                closed: false,
                following: false,
            };
            entry.subscribers.add(subscriber);
            if (
                wasInactive &&
                !entry.reconcileRequired &&
                entry.agent !== undefined &&
                config !== undefined
            ) {
                // Metadata can change while the session has no subscribers, so
                // the retained store may be older even when no transcript
                // reload is required. Re-project once on reactivation before
                // handing the snapshot to the new reader.
                publishSession(entry, true);
            } else {
                subscriber.onChange(entry.store.elements(), entry.store.session());
            }
            void ensureSessionLoaded(entry);
            const connectedEntry = entry;
            return {
                elements: () => connectedEntry.store.elements(),
                session: () => connectedEntry.store.session(),
                loadMore: (token) => {
                    void loadEarlier(connectedEntry, token);
                },
                followingSet: (following) => {
                    subscriber.following = following;
                },
                close: () => {
                    subscriber.closed = true;
                    connectedEntry.subscribers.delete(subscriber);
                    // A load nobody reads any more holds no one else's updates back; whatever it
                    // held is applied now and marks it to reconcile once it lands.
                    if (connectedEntry.hydrating) drainHydrationBroadcastEvents();
                    settleSessionIfIdle(connectedEntry);
                    if (
                        connectedEntry.subscribers.size === 0 &&
                        sessions.get(connectedEntry.id) === connectedEntry
                    ) {
                        releaseSession(connectedEntry);
                    }
                },
            };
        },
        projects: {
            async add(path, addOptions = {}) {
                try {
                    const response = await client.registerProject(
                        {
                            path,
                            ...(addOptions.projectId === undefined
                                ? {}
                                : { projectId: addOptions.projectId }),
                        },
                        { signal: addOptions.signal ?? rootController.signal },
                    );
                    adoptProject(response.project, [
                        { type: "project_added", projectId: response.project.id },
                    ]);
                    return response.project;
                } catch (error) {
                    throw projectRegistrationError(error);
                }
            },
            archive(projectId) {
                const mutationId = nextId();
                const project = groupsStore
                    .getState()
                    .projects.find((candidate) => candidate.id === projectId);
                if (project === undefined) {
                    return mutation(
                        "archive_project",
                        mutationId,
                        () => Promise.reject(new Error("The project is not loaded.")),
                        undefined,
                        undefined,
                        undefined,
                        `project:${projectId}`,
                    );
                }
                return mutation(
                    "archive_project",
                    mutationId,
                    () =>
                        client.archiveProject(projectId, {
                            ifMatch:
                                groupsStore
                                    .getState()
                                    .projects.find((candidate) => candidate.id === projectId)
                                    ?.version ?? project.version,
                            mutationId,
                            signal: rootController.signal,
                        }),
                    ({ project: updated }) => {
                        adoptProject(updated);
                    },
                    undefined,
                    undefined,
                    `project:${projectId}`,
                );
            },
            clone(input) {
                const projectId = input.projectId ?? nextId();
                return mutation(
                    "create_project",
                    projectId,
                    () =>
                        client.cloneProject(
                            {
                                name: input.name,
                                projectId,
                                source: input.source,
                            },
                            { signal: rootController.signal },
                        ),
                    ({ project }) =>
                        adoptProject(project, [{ type: "project_added", projectId: project.id }]),
                );
            },
        },
        createWorkspace(input) {
            const workspaceId = nextId();
            const project = groupsStore
                .getState()
                .projects.find((candidate) => candidate.id === input.projectId);
            const parent = workspaceOf(input.projectId);
            const createdAt = now();
            if (project !== undefined && parent !== undefined) {
                const optimistic: Workspace = {
                    agents: [],
                    archivedAt: null,
                    base: {
                        commit: project.git?.head ?? "",
                        ref: input.baseRef ?? project.defaultBranch ?? "HEAD",
                    },
                    compute: parent.compute,
                    createdAt,
                    creatorAgentId: null,
                    git: project.git,
                    id: workspaceId,
                    initialization: { attempt: 0, error: null, status: "initializing" },
                    kind: project.worktreeSupport === "supported" ? "worktree" : "copy",
                    name: input.name,
                    nameSource: "generated",
                    orderKey: workspaceId,
                    parentId: input.projectId,
                    projectId: input.projectId,
                    status: "active",
                    updatedAt: createdAt,
                    version: workspaceId,
                };
                groupsStore.setState((state) => ({
                    workspaces: replaceResource(state.workspaces, optimistic),
                }));
                publishGroups([
                    {
                        type: "workspace_added",
                        projectId: input.projectId,
                        workspaceId: optimistic.id,
                    },
                ]);
            }
            return mutation(
                "create_workspace",
                workspaceId,
                () =>
                    client.createWorkspace(
                        {
                            id: workspaceId,
                            mutationId: workspaceId,
                            name: input.name,
                            // Desktop-created workspaces begin with a placeholder
                            // name so the first chat can give the workspace its
                            // durable generated name.
                            nameConfigured: false,
                            parentId: input.projectId,
                            ...(input.baseRef === undefined ? {} : { baseRef: input.baseRef }),
                        },
                        { signal: rootController.signal },
                    ),
                ({ workspace }) =>
                    // This route only ever makes a workspace inside a project,
                    // so the delta names the project that was asked for rather
                    // than the response field a bot's workspace leaves null.
                    adoptWorkspace(workspace, [
                        {
                            type: "workspace_added",
                            projectId: input.projectId,
                            workspaceId: workspace.id,
                        },
                    ]),
                () => {
                    groupsStore.setState((state) => ({
                        workspaces: state.workspaces.filter(
                            (workspace) =>
                                workspace.id !== workspaceId || workspace.version !== workspaceId,
                        ),
                    }));
                    publishGroups();
                },
                undefined,
                `workspace:${workspaceId}`,
            );
        },
        archiveWorkspace(_projectId, workspaceId) {
            const mutationId = nextId();
            const workspace = workspaceOf(workspaceId);
            if (workspace === undefined) {
                return mutation(
                    "archive_workspace",
                    mutationId,
                    () => Promise.reject(new Error("The workspace is not loaded.")),
                    undefined,
                    undefined,
                    undefined,
                    `workspace:${workspaceId}`,
                );
            }
            return mutation(
                "archive_workspace",
                mutationId,
                () =>
                    client.archiveWorkspace(workspaceId, {
                        ifMatch: workspaceOf(workspaceId)?.version ?? workspace.version,
                        mutationId,
                        signal: rootController.signal,
                    }),
                ({ workspace: updated }) => adoptWorkspace(updated),
                undefined,
                undefined,
                `workspace:${workspaceId}`,
            );
        },
        createSession(input, checkoutReady) {
            const sessionId = nextId();
            const workspaceId = resolveWorkspaceId(input, groupsStore.getState().workspaces);
            if (workspaceId === undefined) {
                return mutation(
                    "create_session",
                    sessionId,
                    () => Promise.reject(new Error("No workspace matches this agent.")),
                    undefined,
                    undefined,
                    sessionId,
                    `agent:${sessionId}`,
                );
            }
            if (config !== undefined) {
                const mode = modeFromInput(input, config);
                intendedModes.set(sessionId, mode);
                agentModes.set(sessionId, mode);
            }
            unannouncedAgents.add(sessionId);
            const workspace = workspaceOf(workspaceId);
            const createdAt = now();
            if (workspace !== undefined) {
                const optimistic: Agent = {
                    id: sessionId,
                    workspaceId,
                    parentAgentId: null,
                    title: null,
                    titleStatus: "idle",
                    status: "idle",
                    subagents: { total: 0, running: 0 },
                    processes: { running: 0 },
                    pendingQuestionId: null,
                    unread: null,
                    orderKey: sessionId,
                    lastCursor: cursor ?? "",
                    version: sessionId,
                    createdAt,
                    updatedAt: createdAt,
                    archivedAt: null,
                };
                replaceAgent(optimistic);
                publishGroups([{ type: "session_added", sessionId }]);
            }
            return mutation(
                "create_session",
                sessionId,
                async () => {
                    // The name above is already out in the world; only the
                    // request waits. A workspace still being prepared settles
                    // this first, and its failure is this creation's failure.
                    if (checkoutReady !== undefined) await checkoutReady;
                    try {
                        return await client.createAgent(
                            {
                                id: sessionId,
                                mutationId: sessionId,
                                workspaceId,
                            },
                            { signal: deadlineSignal() },
                        );
                    } catch (error) {
                        if (
                            rootController.signal.aborted ||
                            (error instanceof HappyAgentApiError && error.status < 500)
                        ) {
                            throw error;
                        }
                        // The daemon may have committed the chosen agent ID and
                        // only lost the HTTP response. Read that exact resource
                        // back before declaring creation failed and releasing
                        // the first queued send.
                        try {
                            return await client.getAgent(sessionId, { signal: deadlineSignal() });
                        } catch {
                            throw error;
                        }
                    }
                },
                ({ agent }) => {
                    unannouncedAgents.delete(sessionId);
                    if (adoptAgent(agent)) {
                        publishGroups([{ type: "session_added", sessionId: agent.id }]);
                    }
                    // The daemon can answer for this agent now. A reader who has
                    // been sitting in it since before it existed gets its real
                    // transcript without having asked for one.
                    const entry = sessions.get(sessionId);
                    if (entry !== undefined) background(requestSessionLoad(entry));
                },
                () => {
                    unannouncedAgents.delete(sessionId);
                    const authoritative = agentOf(sessionId);
                    if (authoritative !== undefined && authoritative.version !== sessionId) {
                        return false;
                    }
                    intendedModes.delete(sessionId);
                    agentModes.delete(sessionId);
                    agentDrafts.delete(sessionId);
                    draftRevisions.delete(sessionId);
                    draftSaveCancel(sessionId);
                    groupsStore.setState((state) => ({
                        workspaces: state.workspaces.map((candidate) =>
                            candidate.id === workspaceId
                                ? {
                                      ...candidate,
                                      agents: candidate.agents.filter(
                                          (agent) =>
                                              agent.id !== sessionId || agent.version !== sessionId,
                                      ),
                                  }
                                : candidate,
                        ),
                        projects: state.projects.map((candidate) =>
                            candidate.id === workspaceId
                                ? {
                                      ...candidate,
                                      agents: candidate.agents.filter(
                                          (agent) =>
                                              agent.id !== sessionId || agent.version !== sessionId,
                                      ),
                                  }
                                : candidate,
                        ),
                    }));
                    publishGroups([{ type: "session_removed", sessionId }]);
                    return true;
                },
                sessionId,
                `agent:${sessionId}`,
            );
        },
        markSessionRead(sessionId) {
            return sessionReadMark(sessionId);
        },
        sendMessage(sessionId, message) {
            const mutationId = nextId();
            const acceptance = sendAcceptanceCreate(mutationId);
            const created = sessionCreations.get(sessionId);
            const agent = sessions.get(sessionId)?.agent ?? agentOf(sessionId);
            if (agent === undefined || config === undefined) {
                acceptance.reject(new Error("The agent is not loaded."));
                reportMutationFailure(
                    "send_message",
                    mutationId,
                    new Error("The agent is not loaded."),
                );
                return mutationId;
            }
            const input = typeof message === "string" ? { text: message } : message;
            const mode = modeOf(
                config,
                agentDrafts.get(sessionId),
                agentModes.get(sessionId),
                intendedModes.get(sessionId),
            );
            const content = input.content?.map((block) =>
                block.type === "image"
                    ? {
                          type: "image" as const,
                          mimeType: block.mediaType,
                          data: block.data,
                      }
                    : block,
            ) ?? [{ type: "text" as const, text: input.text }];
            const richContent = content.filter((block) => block.type !== "text");
            // The composer deliberately permits an image-only turn, while the
            // daemon's send contract requires non-empty display text. Happy Agent uses
            // the image media types as the canonical display fallback; a tool
            // request names the tool it asks for.
            const requestText =
                input.text.trim().length > 0
                    ? input.text
                    : richContent
                          .map((block) =>
                              block.type === "image"
                                  ? `[image:${block.mimeType}]`
                                  : `[tool:${block.name}]`,
                          )
                          .join("");
            // Always steer: a message sent mid-run interrupts the run rather
            // than waiting behind it, and on an idle agent the daemon treats
            // steer and queue identically.
            const delivery = "steer" as const;
            let confirmSend!: () => void;
            const confirmed = new Promise<void>((resolve) => {
                confirmSend = resolve;
            });
            sendConfirmations.set(mutationId, confirmSend);
            rememberUserMessageId(mutationId);
            const entry = sessions.get(sessionId);
            if (entry !== undefined) {
                entry.messages.set(mutationId, {
                    message: {
                        id: mutationId,
                        role: "user",
                        createdAt: now(),
                        content,
                        metadata: {},
                        status: "pending",
                        delivery,
                        mode,
                        runId: null,
                    },
                    runId: null,
                    pendingSend: true,
                });
                publishSession(entry);
            }
            return mutation(
                "send_message",
                mutationId,
                async () => {
                    if (created !== undefined) await created;
                    rootController.signal.throwIfAborted();
                    const response = await sendMessageWithRetry(
                        sessionId,
                        {
                            id: mutationId,
                            text: requestText,
                            ...(richContent.length === 0 ? {} : { content: richContent }),
                            delivery,
                            mode,
                        },
                        confirmed,
                    );
                    if (response !== undefined) await ensureMessageUsers([response.message]);
                    return response;
                },
                (response) => {
                    sendConfirmations.delete(mutationId);
                    if (response !== undefined) {
                        updateMessage(sessionId, response.message, response.message.runId);
                    }
                    acceptance.accept();
                },
                () => {
                    sendConfirmations.delete(mutationId);
                    const current = sessions.get(sessionId);
                    const message = current?.messages.get(mutationId);
                    if (current !== undefined && message?.pendingSend) {
                        current.messages.delete(mutationId);
                        publishSession(current);
                        acceptance.reject(
                            new MessageRefusedError(
                                "The message was not accepted. Your local draft is retained.",
                            ),
                        );
                        return true;
                    }
                    // The event stream or bootstrap already confirmed this ID;
                    // a lost HTTP response must not turn a delivered message
                    // into a visible failure.
                    if (message === undefined)
                        acceptance.reject(
                            new Error(
                                "Message acceptance could not be confirmed. Check the conversation before retrying.",
                            ),
                        );
                    else acceptance.accept();
                    return message === undefined;
                },
                sessionId,
                // Each send starts independently, including while another send
                // retries. Its mode is captured above and retries reuse its ID.
            );
        },
        sendMessageConfirmed(sessionId, message) {
            const id = this.sendMessage(sessionId, message);
            return this.sendAcceptanceWait(id);
        },
        sendAcceptanceWait(mutationId) {
            return (
                sendAcceptance.get(mutationId) ??
                Promise.reject(new Error("Message acceptance is unavailable."))
            );
        },
        sessionCreationWait(sessionId) {
            return (
                sessionCreationOutcomes.get(sessionId) ??
                Promise.reject(new Error("This session creation is no longer tracked."))
            );
        },
        sessionModeSaveWait(mutationId) {
            const outcome = modeSaveOutcomes.get(mutationId);
            modeSaveOutcomes.delete(mutationId);
            return outcome ?? Promise.reject(new Error("This model save is no longer tracked."));
        },
        renameWait(mutationId) {
            const outcome = renameOutcomes.get(mutationId);
            renameOutcomes.delete(mutationId);
            return outcome ?? Promise.reject(new Error("This rename is no longer tracked."));
        },
        workspaceCreationWait(workspaceId) {
            return (
                workspaceCreationOutcomes.get(workspaceId) ??
                Promise.reject(new Error("This workspace creation is no longer tracked."))
            );
        },
        invokeSlashCommand(sessionId, name, argumentsValue) {
            const mutationId = nextId();
            const agent = sessions.get(sessionId)?.agent ?? agentOf(sessionId);
            if (agent === undefined || config === undefined) {
                reportMutationFailure(
                    "invoke_slash_command",
                    mutationId,
                    new Error("The agent is not loaded."),
                    sessionId,
                );
                return mutationId;
            }
            const mode = modeOf(
                config,
                agentDrafts.get(sessionId),
                agentModes.get(sessionId),
                intendedModes.get(sessionId),
            );
            return mutation(
                "invoke_slash_command",
                mutationId,
                () =>
                    client.invokeSlashCommand(
                        sessionId,
                        name,
                        {
                            ...(argumentsValue === undefined ? {} : { arguments: argumentsValue }),
                            mode,
                            mutationId,
                        },
                        { signal: deadlineSignal() },
                    ),
                ({ agent: updated }) => adoptAgent(updated),
                undefined,
                sessionId,
                `agent:${sessionId}`,
            );
        },
        stopBackgroundProcess(sessionId, projectedProcessId) {
            const mutationId = nextId();
            const entry = sessions.get(sessionId);
            const matches =
                entry?.activity?.processes.filter(
                    (process) =>
                        process.status === "running" &&
                        projectNumericIdentity(process.id) === projectedProcessId,
                ) ?? [];
            const process = matches.length === 1 ? matches[0] : undefined;
            if (process === undefined) {
                reportMutationFailure(
                    "stop_background_process",
                    mutationId,
                    new Error(
                        matches.length === 0
                            ? "The background process is not loaded or is no longer running."
                            : "The background process identity is ambiguous.",
                    ),
                    sessionId,
                );
                return mutationId;
            }
            return mutation(
                "stop_background_process",
                mutationId,
                () =>
                    client.stopProcess(sessionId, process.id, {
                        signal: rootController.signal,
                    }),
                ({ process: stopped }) => {
                    const current = sessions.get(sessionId);
                    if (current !== undefined) updateActivityProcess(current, stopped);
                },
                undefined,
                sessionId,
                `process:${process.id}`,
            );
        },
        stopRun(sessionId) {
            const mutationId = nextId();
            return mutation(
                "stop_run",
                mutationId,
                () => client.abortAgent(sessionId, { mutationId }, { signal: deadlineSignal() }),
                ({ agent }) => adoptAgent(agent),
                undefined,
                sessionId,
                `agent:${sessionId}`,
            );
        },
        stopSubagents(sessionId) {
            const mutationId = nextId();
            return mutation(
                "stop_subagents",
                mutationId,
                async () => {
                    // What is working is read again rather than taken from the copy on
                    // screen, so a child that started since is stopped too. Each child is
                    // aborted on its own: the host stops its whole subtree, while the
                    // session's own run and background processes stay as they are.
                    const activity = await client.getAgentActivity(sessionId, {
                        signal: deadlineSignal(),
                    });
                    const entry = sessions.get(sessionId);
                    if (entry !== undefined && !closed) {
                        setActivity(entry, activity);
                        publishSession(entry);
                    }
                    const working = activity.subagents.filter(
                        (child) => child.archivedAt === null && agentWorkRunning(child),
                    );
                    const outcomes = await Promise.allSettled(
                        working.map((child) =>
                            client.abortAgent(
                                child.id,
                                { mutationId: nextId() },
                                { signal: deadlineSignal() },
                            ),
                        ),
                    );
                    for (const outcome of outcomes) {
                        if (outcome.status === "fulfilled" && !closed)
                            adoptAgent(outcome.value.agent);
                    }
                    const refused = outcomes.find((outcome) => outcome.status === "rejected");
                    if (refused !== undefined) throw refused.reason;
                },
                undefined,
                undefined,
                sessionId,
                `agent:${sessionId}`,
            );
        },
        compactSession(sessionId) {
            const mutationId = nextId();
            return mutation(
                "compact_session",
                mutationId,
                async () => {
                    const response = await client.compactAgent(
                        sessionId,
                        { mutationId },
                        { signal: rootController.signal },
                    );
                    await ensureMessageUsers([response.message]);
                    return response;
                },
                ({ agent, message, run }) => {
                    adoptAgent(agent);
                    const entry = sessions.get(sessionId);
                    if (entry === undefined) return;
                    if (!entry.runs.has(run.id)) updateRun(sessionId, run);
                    if (!entry.messages.has(message.id)) updateMessage(sessionId, message, run.id);
                },
                undefined,
                sessionId,
                `agent:${sessionId}`,
            );
        },
        retryFailedTurn(sessionId, messageId) {
            const mutationId = nextId();
            return mutation(
                "retry_failed_turn",
                mutationId,
                async () => {
                    const response = await client.retryFailedTurn(
                        sessionId,
                        messageId,
                        { mutationId },
                        { signal: deadlineSignal() },
                    );
                    await ensureMessageUsers([response.message]);
                    return response;
                },
                (response) => failureResolutionAdopt(sessionId, response),
                undefined,
                sessionId,
                `agent:${sessionId}`,
            );
        },
        switchAndContinue(sessionId, messageId, target) {
            const mutationId = nextId();
            const switchKey = `${sessionId}:${messageId}`;
            const previousIntended = intendedModes.get(sessionId);
            const previousRevision = modeRevisions.get(sessionId);
            intendedModes.delete(sessionId);
            const switchRevision = (previousRevision ?? 0) + 1;
            modeRevisions.set(sessionId, switchRevision);
            pendingSwitchRevisions.set(switchKey, switchRevision);
            return mutation(
                "switch_and_continue",
                mutationId,
                async () => {
                    const response = await client.switchAndContinue(
                        sessionId,
                        messageId,
                        { providerId: target.providerId, modelId: target.modelId, mutationId },
                        { signal: deadlineSignal() },
                    );
                    await ensureMessageUsers([response.message]);
                    return response;
                },
                (response) => failureResolutionAdopt(sessionId, response),
                () => {
                    pendingSwitchRevisions.delete(switchKey);
                    if (modeRevisions.get(sessionId) === switchRevision) {
                        if (previousRevision === undefined) modeRevisions.delete(sessionId);
                        else modeRevisions.set(sessionId, previousRevision);
                        if (previousIntended !== undefined && !intendedModes.has(sessionId)) {
                            intendedModes.set(sessionId, previousIntended);
                            const entry = sessions.get(sessionId);
                            if (entry !== undefined) {
                                publishSession(entry);
                                settleSessionIfIdle(entry);
                            }
                            publishGroups();
                        }
                    }
                },
                sessionId,
                `agent:${sessionId}`,
            );
        },
        setDraft(sessionId, update) {
            const mutationId = nextId();
            const agent = sessions.get(sessionId)?.agent ?? agentOf(sessionId);
            if (agent === undefined || config === undefined) {
                reportMutationFailure(
                    "set_draft",
                    mutationId,
                    new Error("The agent is not loaded."),
                );
                return mutationId;
            }
            const value: DraftUpdate = typeof update === "string" ? { draft: update } : update;
            const modeKnown =
                unannouncedAgents.has(sessionId) ||
                intendedModes.has(sessionId) ||
                agentModes.has(sessionId) ||
                (agentDrafts.has(sessionId) && !unhydratedDraftModes.has(sessionId));
            if (!modeKnown) unhydratedDraftModes.add(sessionId);
            const mode = modeOf(
                config,
                agentDrafts.get(sessionId),
                agentModes.get(sessionId),
                intendedModes.get(sessionId),
            );
            const previousDraft =
                agentDrafts.get(sessionId) ?? ({ value: null, updatedAt: null } as const);
            const updatedAt = draftStampAfter(previousDraft, value.updatedAt ?? now());
            const draft: AgentDraftSnapshot = {
                value: value.draft === null ? null : { ...mode, text: value.draft },
                updatedAt,
            };
            const revision = (draftRevisions.get(sessionId) ?? 0) + 1;
            draftRevisions.set(sessionId, revision);
            replaceDraft(sessionId, draft);
            const save = { draft, mutationId, previousDraft, revision, updatedAt };
            if (value.draft !== null && value.draft.length > 0) {
                draftSaveSchedule(sessionId, save);
                return mutationId;
            }
            draftSaveCancel(sessionId);
            const entry = sessions.get(sessionId);
            if (
                unhydratedDraftModes.has(sessionId) &&
                (entry?.loading !== undefined || entry?.loadRetry !== undefined)
            ) {
                unhydratedDraftSaves.set(sessionId, save);
                return mutationId;
            }
            return draftSave(sessionId, save);
        },
        async draftAppendConfirmed(sessionId, text, updatedAt) {
            if (writesHeld())
                throw new Error(
                    "This Happy Agent is offline or updating. Try again when it is available.",
                );
            if (draftRevisions.has(sessionId))
                throw new Error("Happy's draft is still saving. Try again.");
            const previous = agentDrafts.get(sessionId);
            const bootstrap = await client.getAgentBootstrap(sessionId, {
                signal: deadlineSignal(),
            });
            if (closed || writesHeld()) throw new Error("This Happy Agent is no longer available.");
            if (bootstrap.agent.archivedAt !== null) throw new Error("Happy is archived.");
            // A local edit during the read must never be replaced by its answer.
            if (draftRevisions.has(sessionId) || agentDrafts.get(sessionId) !== previous)
                throw new Error("The draft changed. Try again.");
            const previousDraft = bootstrap.draft;
            replaceDraft(sessionId, previousDraft);
            const existing = previousDraft.value?.text ?? "";
            // The complete deterministic evidence block is the dedupe value,
            // even when the reader typed directly beside it after a reload.
            if (existing.includes(text)) return;
            const next = happyAgentDraftAppended(existing, text);
            if (next === undefined) return;
            if (config === undefined) throw new Error("The agent is not loaded.");
            const mode = previousDraft.value ?? bootstrap.mode ?? defaultMode(config);
            const timestamp = draftStampAfter(previousDraft, updatedAt);
            const draft: AgentDraftSnapshot = {
                value: {
                    providerId: mode.providerId,
                    modelId: mode.modelId,
                    effort: mode.effort,
                    serviceTier: mode.serviceTier,
                    permissionMode: mode.permissionMode,
                    text: next,
                },
                updatedAt: timestamp,
            };
            // The value, timestamp and mutation ID are captured once. Retries do
            // not re-append, adopt the failed agent's mode, or advance this stamp.
            const mutationId = nextId();
            const revision = (draftRevisions.get(sessionId) ?? 0) + 1;
            draftRevisions.set(sessionId, revision);
            replaceDraft(sessionId, draft);
            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const finish = (error?: Error) => {
                    if (settled) return;
                    settled = true;
                    rootController.signal.removeEventListener("abort", aborted);
                    if (error) reject(error);
                    else resolve();
                };
                const aborted = () =>
                    finish(new Error("The connection ended before the draft save was confirmed."));
                rootController.signal.addEventListener("abort", aborted, { once: true });
                draftSave(sessionId, {
                    draft,
                    previousDraft,
                    updatedAt: timestamp,
                    mutationId,
                    revision,
                    confirmation: { finish },
                });
            });
        },
        switchModel(sessionId, selection) {
            const value = typeof selection === "string" ? { modelId: selection } : selection;
            return saveMode(sessionId, "switch_model", (mode) => ({
                ...mode,
                modelId: value.modelId,
                ...(value.providerId === undefined ? {} : { providerId: value.providerId }),
            }));
        },
        setEffort(sessionId, effort) {
            return saveMode(sessionId, "set_effort", (mode) => ({
                ...mode,
                effort: effort ?? mode.effort,
            }));
        },
        setServiceTier(sessionId, serviceTier) {
            return saveMode(sessionId, "set_service_tier", (mode) => ({
                ...mode,
                serviceTier: happyAgentServiceTierToWire(serviceTier),
            }));
        },
        setPermissionMode(sessionId, permissionMode) {
            return saveMode(sessionId, "set_permission_mode", (mode) => ({
                ...mode,
                permissionMode: permissionMode as MessageMode["permissionMode"],
            }));
        },
        answerUserInput(sessionId, requestId, response) {
            const mutationId = nextId();
            return mutation(
                "answer_user_input",
                mutationId,
                () =>
                    client.answerQuestion(
                        sessionId,
                        requestId,
                        {
                            answers: Object.fromEntries(
                                Object.entries(response.answers).map(([key, values]) => [
                                    key,
                                    [...values],
                                ]),
                            ),
                            mutationId,
                        },
                        { signal: deadlineSignal() },
                    ),
                ({ question }) => updateQuestion(sessionId, question),
                undefined,
                sessionId,
                // A human answer must not wait behind unrelated agent work.
            );
        },
        setSessionArchived(sessionId, archived) {
            const mutationId = nextId();
            const request = () =>
                archived
                    ? client.archiveAgent(
                          sessionId,
                          { mutationId },
                          { signal: rootController.signal },
                      )
                    : client.unarchiveAgent(
                          sessionId,
                          { mutationId },
                          { signal: rootController.signal },
                      );
            return mutation(
                "set_session_archived",
                mutationId,
                request,
                ({ agent }) => {
                    adoptAgent(agent);
                    if (archived) {
                        intendedModes.delete(sessionId);
                        draftRevisions.delete(sessionId);
                    }
                    publishGroups([
                        archived
                            ? { type: "session_removed", sessionId }
                            : { type: "session_added", sessionId },
                    ]);
                },
                undefined,
                sessionId,
                `agent:${sessionId}`,
            );
        },
        renameGroup(target, name) {
            return renameGroup(target, name);
        },
        createBot(name) {
            // All three identities are named here and handed to the daemon,
            // which takes them as the bot's own. The bot id doubles as the
            // mutation key, so a request repeated after a dropped answer
            // settles on the bot that was already made rather than a second.
            const botId = nextId();
            const workspaceId = nextId();
            const agentId = nextId();
            const bot = (async () => {
                const { bot } = await client.createBot(
                    {
                        agentId,
                        id: botId,
                        mutationId: botId,
                        // Left out rather than sent blank: the daemon reads an
                        // absent name as "name it from the first message", and
                        // an empty string as a name it must refuse.
                        ...(name === undefined ? {} : { name }),
                        workspaceId,
                    },
                    { signal: rootController.signal },
                );
                groupsStore.setState((state) => ({ bots: replaceResource(state.bots, bot) }));
                // The same delta `bot.created` publishes. The event will arrive
                // too and land on the identical record; announcing it here is
                // what puts the bot in the catalog for the caller that is about
                // to open it.
                publishGroups([{ type: "bot_added", botId: bot.id, workspaceId: bot.workspaceId }]);
                return bot;
            })();
            return { agentId, bot, botId, workspaceId };
        },
        setBotAvatar(botId, image) {
            const mutationId = nextId();
            const bot = botOf(botId);
            if (bot === undefined) {
                return mutation(
                    "set_bot_avatar",
                    mutationId,
                    () => Promise.reject(new Error("The bot is not loaded.")),
                    undefined,
                    undefined,
                    undefined,
                    `bot:${botId}`,
                );
            }
            return mutation(
                "set_bot_avatar",
                mutationId,
                () =>
                    client.setBotAvatar(
                        botId,
                        { contentType: image.contentType, data: image.data },
                        {
                            ifMatch: botOf(botId)?.version ?? bot.version,
                            signal: rootController.signal,
                        },
                    ),
                ({ bot: updated }) => {
                    groupsStore.setState((state) => ({
                        bots: replaceResource(state.bots, updated),
                    }));
                    publishGroups();
                },
                undefined,
                undefined,
                `bot:${botId}`,
            );
        },
        archiveBot(botId) {
            const mutationId = nextId();
            const bot = botOf(botId);
            if (bot === undefined) {
                return mutation(
                    "archive_bot",
                    mutationId,
                    () => Promise.reject(new Error("The bot is not loaded.")),
                    undefined,
                    undefined,
                    undefined,
                    `bot:${botId}`,
                );
            }
            return mutation(
                "archive_bot",
                mutationId,
                () =>
                    client.archiveBot(botId, {
                        ifMatch: botOf(botId)?.version ?? bot.version,
                        mutationId,
                        signal: rootController.signal,
                    }),
                ({ bot: updated }) => {
                    groupsStore.setState((state) => ({
                        bots: replaceResource(state.bots, updated),
                    }));
                    publishGroups();
                },
                undefined,
                undefined,
                `bot:${botId}`,
            );
        },
        reorderBot(botId, afterId) {
            const mutationId = nextId();
            const bot = botOf(botId);
            if (bot === undefined) {
                return mutation(
                    "reorder_bot",
                    mutationId,
                    () => Promise.reject(new Error("The bot is not loaded.")),
                    undefined,
                    undefined,
                    undefined,
                    `bot:${botId}`,
                );
            }
            return mutation(
                "reorder_bot",
                mutationId,
                () =>
                    client.reorderBot(
                        botId,
                        { afterId, mutationId },
                        {
                            ifMatch: botOf(botId)?.version ?? bot.version,
                            signal: rootController.signal,
                        },
                    ),
                ({ bot: updated }) => {
                    groupsStore.setState((state) => ({
                        bots: replaceResource(state.bots, updated),
                    }));
                    publishGroups();
                },
                undefined,
                undefined,
                `bot:${botId}`,
            );
        },
        joinTask(taskId) {
            const mutationId = nextId();
            return mutation(
                "join_task",
                mutationId,
                () =>
                    client.joinTask(taskId, {
                        mutationId,
                        signal: deadlineSignal(),
                    }),
                taskResponseAdopt,
                undefined,
                undefined,
                `task:${taskId}`,
            );
        },
        leaveTask(taskId) {
            const mutationId = nextId();
            return mutation(
                "leave_task",
                mutationId,
                () =>
                    client.leaveTask(taskId, {
                        mutationId,
                        signal: deadlineSignal(),
                    }),
                taskResponseAdopt,
                undefined,
                undefined,
                `task:${taskId}`,
            );
        },
        reorderTask(taskId, afterId) {
            const mutationId = nextId();
            return mutation(
                "reorder_task",
                mutationId,
                () =>
                    client.reorderTask(
                        taskId,
                        { afterId, mutationId },
                        { signal: deadlineSignal() },
                    ),
                taskResponseAdopt,
                undefined,
                undefined,
                `task:${taskId}`,
            );
        },
        archiveTask(taskId) {
            return taskArchivalSet(taskId, true);
        },
        unarchiveTask(taskId) {
            return taskArchivalSet(taskId, false);
        },
        createTask(name) {
            // As with a bot, all three identities are named here, and the task
            // id doubles as the mutation key so a request repeated after a
            // dropped answer settles on the task already made.
            const taskId = nextId();
            const workspaceId = nextId();
            const agentId = nextId();
            const task = (async () => {
                const response = await client.createTask(
                    {
                        agentId,
                        id: taskId,
                        mutationId: taskId,
                        // Left out rather than sent blank: an absent name is
                        // what asks the host to name it from the first message.
                        ...(name === undefined ? {} : { name }),
                        workspaceId,
                    },
                    { signal: rootController.signal },
                );
                // The task and the caller's place at the top of their list,
                // adopted now so the caller about to open it finds it listed.
                taskResponseAdopt(response);
                return response.task;
            })();
            return { agentId, task, taskId, workspaceId };
        },
        beginStemCellTask({ taskId, workspaceId, agentId }, created) {
            // Written the way a conversation named here is: version equal to
            // its id, so anything the daemon says replaces it, and its agent
            // unannounced, so opening it reads no history that is not there.
            const createdAt = now();
            const agent: Agent = {
                id: agentId,
                workspaceId,
                parentAgentId: null,
                title: null,
                titleStatus: "idle",
                status: "idle",
                subagents: { total: 0, running: 0 },
                processes: { running: 0 },
                pendingQuestionId: null,
                unread: null,
                orderKey: agentId,
                lastCursor: cursor ?? "",
                version: agentId,
                createdAt,
                updatedAt: createdAt,
                archivedAt: null,
            };
            const task: Task = {
                id: taskId,
                workspaceId,
                name: "",
                agent,
                archivedAt: null,
                compute: { type: "host", path: "" },
                createdAt,
                creatorAgentId: null,
                folderName: "",
                ownerUserId: null,
                status: "active",
                updatedAt: createdAt,
                version: taskId,
            };
            unannouncedAgents.add(agentId);
            stemCellTasks.add(taskId);
            // Joined at the top of the reader's list, where the daemon puts it:
            // the empty key sorts before every key the daemon mints, until the
            // daemon's own membership replaces it.
            groupsStore.setState((state) => ({
                tasks: replaceResource(state.tasks, task),
                taskMemberships: taskMembershipsReplace(state.taskMemberships, {
                    joinedAt: createdAt,
                    orderKey: "",
                    taskId,
                    userId: currentUserId ?? null,
                }),
            }));
            publishGroups([{ type: "session_added", sessionId: agentId }]);
            // The first message waits for this, not for the work queue.
            const settled = created.then(
                (answer) => {
                    stemCellTasks.delete(taskId);
                    unannouncedAgents.delete(agentId);
                    if (closed) return;
                    adoptAgent(answer.agent);
                    // Read whole: the task's folder, owner and membership are
                    // the daemon's to say.
                    taskRefetch(taskId);
                    const entry = sessions.get(agentId);
                    if (entry !== undefined) background(requestSessionLoad(entry));
                },
                (error: unknown) => {
                    stemCellTasks.delete(taskId);
                    unannouncedAgents.delete(agentId);
                    if (!closed && taskOf(taskId)?.version === taskId) {
                        groupsStore.setState((state) => ({
                            tasks: state.tasks.filter((candidate) => candidate.id !== taskId),
                            taskMemberships: state.taskMemberships.filter(
                                (membership) => membership.taskId !== taskId,
                            ),
                        }));
                        publishGroups([{ type: "session_removed", sessionId: agentId }]);
                    }
                    throw error;
                },
            );
            sessionCreations.set(agentId, settled);
            void settled
                .catch(() => undefined)
                .finally(() => {
                    if (sessionCreations.get(agentId) === settled) sessionCreations.delete(agentId);
                });
        },
        renameTask(taskId, name) {
            const mutationId = nextId();
            return mutation(
                "rename_task",
                mutationId,
                async () => {
                    const task = taskOf(taskId);
                    if (task === undefined) throw new Error("The task is not loaded.");
                    try {
                        return await client.renameTask(
                            taskId,
                            { mutationId, name },
                            { ifMatch: task.version, signal: deadlineSignal() },
                        );
                    } catch (error) {
                        if (error instanceof HappyAgentApiError && error.status === 409) {
                            taskRefetch(taskId);
                            throw new Error(
                                `“${task.name}” changed while you were renaming it. Try again.`,
                            );
                        }
                        throw error;
                    }
                },
                taskResponseAdopt,
                undefined,
                undefined,
                `task:${taskId}`,
            );
        },
        reorderProject(projectId, afterId) {
            const mutationId = nextId();
            const project = groupsStore
                .getState()
                .projects.find((candidate) => candidate.id === projectId);
            if (project === undefined) {
                return mutation(
                    "reorder_group",
                    mutationId,
                    () => Promise.reject(new Error("The project is not loaded.")),
                    undefined,
                    undefined,
                    undefined,
                    `project:${projectId}`,
                );
            }
            return mutation(
                "reorder_group",
                mutationId,
                () =>
                    client.reorderProject(
                        projectId,
                        { afterId, mutationId },
                        {
                            ifMatch:
                                groupsStore
                                    .getState()
                                    .projects.find((candidate) => candidate.id === projectId)
                                    ?.version ?? project.version,
                            signal: rootController.signal,
                        },
                    ),
                ({ project: updated }) => adoptProject(updated),
                undefined,
                undefined,
                `project:${projectId}`,
            );
        },
        reorderWorkspace(workspaceId, afterId) {
            const mutationId = nextId();
            const workspace = workspaceOf(workspaceId);
            if (workspace === undefined) {
                return mutation(
                    "reorder_group",
                    mutationId,
                    () => Promise.reject(new Error("The workspace is not loaded.")),
                    undefined,
                    undefined,
                    undefined,
                    `workspace:${workspaceId}`,
                );
            }
            return mutation(
                "reorder_group",
                mutationId,
                () =>
                    client.reorderWorkspace(
                        workspaceId,
                        { afterId, mutationId },
                        {
                            ifMatch: workspaceOf(workspaceId)?.version ?? workspace.version,
                            signal: rootController.signal,
                        },
                    ),
                ({ workspace: updated }) => adoptWorkspace(updated),
                undefined,
                undefined,
                `workspace:${workspaceId}`,
            );
        },
        reorderSession(sessionId, afterId) {
            const mutationId = nextId();
            return mutation(
                "reorder_session",
                mutationId,
                () =>
                    client.reorderAgent(
                        sessionId,
                        { afterId, mutationId },
                        { signal: rootController.signal },
                    ),
                ({ agent }) => adoptAgent(agent),
                undefined,
                sessionId,
                `agent:${sessionId}`,
            );
        },
        reorderSubtask(sessionId, afterId) {
            const mutationId = nextId();
            return mutation(
                "reorder_subtask",
                mutationId,
                () =>
                    client.reorderSubtask(
                        sessionId,
                        { afterId, mutationId },
                        { signal: rootController.signal },
                    ),
                ({ agent }) => adoptAgent(agent),
                undefined,
                sessionId,
                `agent:${sessionId}`,
            );
        },
        close() {
            if (closed) return;
            closed = true;
            reportDebug({
                level: "info",
                message: "Happy Agent connection closed",
                source: "connection",
            });
            rootController.abort();
            sync.writer.close();
            updatesAttemptController?.abort();
            retryWake?.();
            retryWake = undefined;
            for (const pending of pendingDraftSaves.values()) clearTimeout(pending.timer);
            pendingDraftSaves.clear();
            heldDraftSaves.clear();
            unhydratedDraftSaves.clear();
            unhydratedDraftModes.clear();
            if (quietPublishTimer !== undefined) clearTimeout(quietPublishTimer);
            publishConnection("closed");
            groupSubscribers.clear();
            for (const entry of sessions.values()) entry.subscribers.clear();
            sessions.clear();
            userSessions.clear();
            intendedModes.clear();
            agentModes.clear();
            modeRevisions.clear();
            pendingSwitchRevisions.clear();
            adoptedSwitchMessages.clear();
            modeRefetches.clear();
            knownUserMessageIds.clear();
            agentDrafts.clear();
            sendConfirmations.clear();
            draftRevisions.clear();
            mutationQueues.clear();
            modeSaveOutcomes.clear();
            renameOutcomes.clear();
            sessionCreations.clear();
            sessionMutationCounts.clear();
            processOwners.clear();
            hydrationBroadcastEvents.length = 0;
            recentEvents.length = 0;
            resyncBufferedEvents.length = 0;
        },
    };

    async function loadEarlier(entry: SessionEntry, token: string): Promise<void> {
        if (entry.loadingMore || !entry.hasMore) return;
        const oldest = runsOrderedOf(entry)[0];
        if (oldest === undefined || oldest.id !== token) return;
        entry.loadingMore = true;
        entry.loadMoreError = undefined;
        publishSession(entry);
        try {
            const page = await client.getMessages(
                entry.id,
                { before: token, limit: DEFAULT_HISTORY_LIMIT, omitToolData: false },
                { signal: deadlineSignal(SNAPSHOT_RESPONSE_TIMEOUT_MS) },
            );
            await ensureMessageUsers(page.runs.flatMap((run) => run.messages));
            if (closed) return;
            ingestSessionHistory(entry, page.runs, []);
            entry.hasMore = page.hasMore;
        } catch (error) {
            entry.loadMoreError = error instanceof Error ? error.message : String(error);
        } finally {
            entry.loadingMore = false;
            publishSession(entry);
            // A page that lands after its reader left is let go again with the rest.
            if (entry.subscribers.size === 0) trimHistory(entry.id);
        }
    }

    function renameGroup(target: GroupTarget, name: string): string {
        const mutationId = nextId();
        if (target.kind === "bot") {
            return mutation(
                "rename_group",
                mutationId,
                () => {
                    const bot = botOf(target.botId);
                    if (bot === undefined) throw new Error("The bot is not loaded.");
                    return client.renameBot(
                        bot.id,
                        { name, mutationId },
                        { ifMatch: bot.version, signal: rootController.signal },
                    );
                },
                ({ bot }) => {
                    groupsStore.setState((state) => ({ bots: replaceResource(state.bots, bot) }));
                    adoptAgent(bot.agent);
                    publishGroups();
                },
                undefined,
                undefined,
                `bot:${target.botId}`,
            );
        }
        if (target.kind === "project") {
            const project = groupsStore
                .getState()
                .projects.find((candidate) => candidate.id === target.projectId);
            if (project === undefined) {
                return mutation(
                    "rename_group",
                    mutationId,
                    () => Promise.reject(new Error("The project is not loaded.")),
                    undefined,
                    undefined,
                    undefined,
                    `project:${target.projectId}`,
                );
            }
            return mutation(
                "rename_group",
                mutationId,
                () =>
                    client.renameProject(
                        project.id,
                        { name, mutationId },
                        {
                            ifMatch:
                                groupsStore
                                    .getState()
                                    .projects.find((candidate) => candidate.id === project.id)
                                    ?.version ?? project.version,
                            signal: rootController.signal,
                        },
                    ),
                ({ project: updated }) => adoptProject(updated),
                undefined,
                undefined,
                `project:${project.id}`,
            );
        }
        const workspace = workspaceOf(target.workspaceId);
        if (workspace === undefined) {
            return mutation(
                "rename_group",
                mutationId,
                () => Promise.reject(new Error("The workspace is not loaded.")),
                undefined,
                undefined,
                undefined,
                `workspace:${target.workspaceId}`,
            );
        }
        return mutation(
            "rename_group",
            mutationId,
            () =>
                client.renameWorkspace(
                    workspace.id,
                    { name, mutationId },
                    {
                        ifMatch: workspaceOf(workspace.id)?.version ?? workspace.version,
                        signal: rootController.signal,
                    },
                ),
            ({ workspace: updated }) => adoptWorkspace(updated),
            undefined,
            undefined,
            `workspace:${workspace.id}`,
        );
    }
}

function liveMessageContentMerge(
    current: readonly MessageBlock[],
    snapshot: readonly MessageBlock[],
): { content: MessageBlock[]; offset: number } {
    // Align the snapshot against the current tail by block identity, tolerant
    // in both directions: the snapshot may be ahead of the assembled content
    // (arguments and text still streaming) or behind it (a stale in-flight
    // snapshot, or one whose reasoning text the provider trimmed). Demanding
    // that the snapshot strictly extend the current blocks made every stale or
    // trimmed snapshot fail alignment and fall through to the append below,
    // which is what duplicated whole segments — the appended copies then never
    // finished, because later snapshots kept aligning with the newest copy.
    const maximumOverlap = Math.min(current.length, snapshot.length);
    for (let overlap = maximumOverlap; overlap > 0; overlap -= 1) {
        const offset = current.length - overlap;
        let matches = true;
        for (let index = 0; index < overlap; index += 1) {
            if (!messageBlockSame(current[offset + index]!, snapshot[index]!)) {
                matches = false;
                break;
            }
        }
        if (!matches) continue;
        const content = current.slice(0, offset);
        for (let index = 0; index < overlap; index += 1) {
            content.push(messageBlockMerge(current[offset + index]!, snapshot[index]!));
        }
        content.push(...snapshot.slice(overlap));
        return { content, offset };
    }
    return { content: [...current, ...snapshot], offset: current.length };
}

/** Whether two live projections describe the same provider block. */
function messageBlockSame(previous: MessageBlock, next: MessageBlock): boolean {
    if (previous.type !== next.type) return false;
    switch (previous.type) {
        case "text":
            return (
                next.type === "text" &&
                (next.text.startsWith(previous.text) || previous.text.startsWith(next.text))
            );
        case "reasoning":
            return (
                next.type === "reasoning" &&
                (next.text.startsWith(previous.text) || previous.text.startsWith(next.text))
            );
        case "image":
            return (
                next.type === "image" &&
                previous.mimeType === next.mimeType &&
                previous.data === next.data
            );
        case "tool_call":
            return next.type === "tool_call" && previous.id === next.id;
        case "tool_call_request":
            return (
                next.type === "tool_call_request" &&
                previous.name === next.name &&
                deepEqual(previous.arguments, next.arguments)
            );
        case "compaction":
            return (
                next.type === "compaction" &&
                previous.startedAt === next.startedAt &&
                previous.trigger === next.trigger
            );
        case "configuration":
            return (
                next.type === "configuration" &&
                previous.beforeMessageId === next.beforeMessageId &&
                deepEqual(previous.before, next.before) &&
                deepEqual(previous.after, next.after)
            );
    }
}

/** The richer of two projections of one block; a stale side never wins. */
function messageBlockMerge(previous: MessageBlock, next: MessageBlock): MessageBlock {
    if (previous.type === "text" && next.type === "text") {
        return next.text.startsWith(previous.text) ? next : previous;
    }
    if (previous.type === "reasoning" && next.type === "reasoning") {
        return next.text.startsWith(previous.text) ? next : previous;
    }
    if (previous.type === "tool_call" && next.type === "tool_call") {
        // A finished call never goes back to running, and a result already
        // received never disappears.
        if (previous.status !== "running" && next.status === "running") return previous;
        if (
            previous.status !== "running" &&
            next.status !== "running" &&
            next.result === undefined &&
            previous.result !== undefined
        ) {
            return previous;
        }
        return next;
    }
    return next;
}

/** Mechanical migration name for the former package entry point. */

function ingestHistory(
    entry: SessionEntry,
    runs: readonly (Run & { messages: Message[] })[],
    pending: readonly Message[],
): void {
    for (const run of runs) {
        entry.runs.set(run.id, run);
        for (const message of run.messages)
            entry.messages.set(message.id, { message, runId: run.id });
    }
    entry.runsOrdered = undefined;
    // History and pending bootstrap are independent snapshots. A message
    // already present in accepted history cannot become pending again.
    for (const message of pending) {
        if (!entry.messages.has(message.id))
            entry.messages.set(message.id, { message, runId: null });
    }
}

function resolveWorkspaceId(
    input: CreateSessionInput,
    workspaces: readonly Workspace[],
): string | undefined {
    if (input.workspaceId !== undefined) return input.workspaceId;
    if (input.projectId !== undefined) return input.projectId;
    return workspaces.find(
        (workspace) => workspace.compute.type === "host" && workspace.compute.path === input.cwd,
    )?.id;
}

function modeFromInput(input: CreateSessionInput, config: DaemonConfig): MessageMode {
    const defaults = defaultMode(config);
    return {
        effort: input.effort ?? defaults.effort,
        modelId: input.modelId ?? defaults.modelId,
        permissionMode:
            (input.permissionMode as MessageMode["permissionMode"] | undefined) ??
            defaults.permissionMode,
        providerId: input.providerId ?? defaults.providerId,
        serviceTier:
            input.serviceTier === undefined
                ? defaults.serviceTier
                : happyAgentServiceTierToWire(input.serviceTier),
    };
}

function modesEqual(left: MessageMode, right: MessageMode): boolean {
    return (
        left.effort === right.effort &&
        left.modelId === right.modelId &&
        left.permissionMode === right.permissionMode &&
        left.providerId === right.providerId &&
        left.serviceTier === right.serviceTier
    );
}

function runCompare(left: Run, right: Run): number {
    // Stable sort preserves history/event insertion order when timestamps tie;
    // opaque CUID2 identities carry no chronological information.
    return left.startedAt - right.startedAt;
}

async function optional<T>(read: () => Promise<T>): Promise<T | undefined> {
    try {
        return await read();
    } catch {
        return undefined;
    }
}

function activeGitWorkspaceIds(
    projects: readonly Project[],
    workspaces: readonly Workspace[],
): string[] {
    return [
        ...new Set([
            ...projects
                .filter((project) => project.archivedAt === null && project.status === "active")
                .map((project) => project.id),
            ...workspaces
                .filter(
                    (workspace) => workspace.archivedAt === null && workspace.status === "active",
                )
                .map((workspace) => workspace.id),
        ]),
    ];
}

/**
 * The caller's memberships with one replaced or added. Order is carried by the
 * membership's own `orderKey`, so the array position means nothing.
 */
function taskMembershipsReplace(
    memberships: readonly TaskMembership[],
    membership: TaskMembership,
): readonly TaskMembership[] {
    const index = memberships.findIndex((entry) => entry.taskId === membership.taskId);
    if (index < 0) return [...memberships, membership];
    const current = memberships[index]!;
    if (current.orderKey === membership.orderKey && current.joinedAt === membership.joinedAt)
        return memberships;
    const next = [...memberships];
    next[index] = membership;
    return next;
}

/** Whether an agent update moves nothing but its `updatedAt`. */
function agentChangesOnlyTimestamp(agent: Agent, changes: Partial<Agent>): boolean {
    return Object.entries(changes).every(
        ([key, value]) => key === "updatedAt" || Object.is(agent[key as keyof Agent], value),
    );
}

function agentIdOfEvent(event: HappyAgentEvent): string | undefined {
    switch (event.type) {
        case "agent.created":
            return event.payload.agent.id;
        case "agent.updated":
        case "agent.context.updated":
        case "agent.draft.updated":
        case "agent.slash_commands.updated":
        case "run.started":
        case "run.boundary":
        case "run.finished":
        case "message.created":
        case "message.updated":
        case "message.delta":
        case "message.deleted":
            return event.payload.agentId;
        case "question.created":
            return event.payload.question.agentId;
        case "process.started":
            return event.payload.process.agentId;
        default:
            return undefined;
    }
}

function abortableWait(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(done, milliseconds);
        signal.addEventListener("abort", aborted, { once: true });
        function done(): void {
            signal.removeEventListener("abort", aborted);
            resolve();
        }
        function aborted(): void {
            clearTimeout(timer);
            reject(signal.reason);
        }
    });
}
