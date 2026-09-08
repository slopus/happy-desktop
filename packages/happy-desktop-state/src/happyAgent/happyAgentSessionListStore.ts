import type { MutationRejectedDelta, HappyAgentConnection } from "../happyAgentConnection/index.js";
import type { HappyAgentClient } from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { Loadable } from "../conversation/loadable.js";
import { UserError } from "../types.js";
import {
    happyAgentProjectGroupsPreserve,
    happyAgentProjectGroupsProject,
    happyAgentSessionGroupIdOf,
    type HappyAgentProjectGroup,
} from "./happyAgentProjectGroupProject.js";
import {
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_GROUP_UNREAD_REFUSAL,
    happyAgentProjectWriteRefusal,
    happyAgentWorktreeConversationRefusal,
    happyAgentWorktreeWriteRefusal,
} from "./happyAgentGroupAccess.js";
import { referencesPreserve, happyAgentUserError } from "./happyAgentSupport.js";
import { happyAgentComputeRequest, happyAgentProjectComputeProject } from "./happyAgentProject.js";
import { happyAgentWorkspaceGeneratedName } from "./happyAgentWorkspaceNames.js";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentGroupId,
    HappyAgentProjectCatalog,
    HappyAgentProjectCompute,
    HappyAgentProjectComputeState,
    HappyAgentProjectId,
    HappyAgentSession,
    HappyAgentSessionCreateInput,
    HappyAgentSessionId,
    HappyAgentSessionSummary,
    HappyAgentWorktree,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

/** How many outstanding Happy Agent mutations this surface can attribute a refusal to. */
const PENDING_MUTATION_LIMIT = 256;

/**
 * The list surface of the local workspace: a `Loadable` of projects, each
 * carrying its sessions — and its worktrees' sessions — as ordinary conversation
 * rows. Local sessions are conversations like any other; nothing here is
 * Happy Agent-shaped, and nothing here is selected — the open group and conversation are
 * addressed by the URL.
 */
export interface HappyAgentSessionListSnapshot {
    readonly projects: Loadable<readonly HappyAgentProjectGroup[]>;
    /**
     * The host's bots, in its own order. They are listed apart from the projects
     * because they are not projects: a bot is one permanent conversation with
     * nothing to add to it, and it is shown above the project list rather than
     * inside it.
     */
    readonly bots: readonly HappyAgentBot[];
    /** Sessions the host still holds but has taken out of their workspace strips. */
    readonly archivedSessions: readonly HappyAgentSessionSummary[];
    /** Last failed create/fork/reset, surfaced without rejecting the action. */
    readonly mutationError?: UserError;
    /**
     * How many times the host's own answer has actually changed what this list
     * describes, counting from zero. It is what tells an optimistic publication
     * apart from the host's own answer: a surface that must not act on a row this
     * list only *believes* has gone — navigation away from an addressed group,
     * above all — waits for this to advance rather than for the row to disappear.
     *
     * It counts changes, not reads. A read that comes back describing exactly the
     * catalog the last read described establishes nothing new to act on, so it
     * leaves this alone and the snapshot with it. How many reads have landed is a
     * separate, private question — one of read ordering, not of what the list
     * says — and it is answered by the read sequence rather than by this.
     */
    readonly catalogRevision: number;
    /** Managed projects whose optimistic clone request this window saw refused. */
    readonly projectCreateFailures: ReadonlyMap<HappyAgentProjectId, UserError>;
    /** Sessions whose optimistic peer creation this window saw refused. */
    readonly sessionCreateFailures: ReadonlyMap<HappyAgentSessionId, UserError>;
    /**
     * Worktrees this window asked for that the host refused, by the identity it
     * refused them under — which is the identity the worktree would have had, so
     * the reader who was sent to that address finds the refusal waiting there
     * instead of an empty screen.
     *
     * A refused creation leaves nothing behind on the host: it never made the
     * worktree, and it keeps no record of having declined to. So this is the
     * only place the refusal exists, and it is kept for as long as the window is
     * open rather than pretended to be durable. Each attempt carries its own
     * identity, so a refusal can never land on a later attempt's row.
     */
    readonly worktreeCreateFailures: ReadonlyMap<HappyAgentWorktreeId, UserError>;
}

/**
 * What became of one project archive, as the caller that asked for it needs to
 * read it. Deliberately not a `void` promise resolved on the host's answer: a
 * request the host accepted is not proof that the project is gone, and the
 * absence of a row is not proof either while the read that would establish it
 * may itself have failed. `archived` is reported only once a successful
 * authoritative catalog read no longer holds the project, so it also covers the
 * project another window archived first. Everything else is `failed`, carrying
 * the reason to show and leaving the caller free to ask again — the host takes
 * the same request on an already archived project unchanged.
 *
 * Returned by value rather than recorded in `mutationError`, so a concurrent
 * unrelated mutation can neither clear nor overwrite this answer.
 */
export type HappyAgentProjectArchiveResult =
    | { readonly type: "archived" }
    | { readonly type: "failed"; readonly error: UserError };

/** Verified outcome of removing one worktree and its checkout. */
export type HappyAgentWorktreeArchiveResult = HappyAgentProjectArchiveResult;

/** Authoritative outcome of returning one archived session to its strip. */
export type HappyAgentSessionRestoreResult =
    | { readonly type: "restored" }
    | { readonly type: "failed"; readonly error: UserError };

/**
 * What came of one attempt to change where a project's sessions run.
 *
 * `saved` carries the host's own read-back rather than the value that was asked
 * for: a write that raced another window reports the setting that actually won,
 * so a caller can never show a choice as saved that the host does not hold.
 * `failed` carries the reason, and the setting is whatever the next read says —
 * the host either applied nothing or applied it and lost the answer, and only a
 * read can tell those apart.
 *
 * Returned by value rather than recorded in `mutationError` so an unrelated
 * concurrent mutation can neither clear nor stand in for this answer.
 */
export type HappyAgentProjectComputeResult =
    | { readonly type: "saved"; readonly state: HappyAgentProjectComputeState }
    | { readonly type: "failed"; readonly error: UserError };

/**
 * Where a session lives: both halves of its address, since a local session is
 * addressed by its group — its project, or the worktree inside it — and then by
 * itself.
 */
export interface HappyAgentSessionLocation {
    readonly sessionId: HappyAgentSessionId;
    readonly groupId: HappyAgentGroupId;
}

export type HappyAgentSessionListOutput = {
    readonly type: "sessionCreated";
    readonly location: HappyAgentSessionLocation;
};

export interface HappyAgentSessionListStore {
    get(): HappyAgentSessionListSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Reconciles the durable list from the live catalog. Not a user-facing refresh
     * button: it runs on hydration and after mutations to converge on server truth.
     */
    sessionsRefresh(): Promise<void>;
    /**
     * Where one session lives, for a caller holding nothing but its id — a
     * question in the machine's inbox names the session that asked and nothing
     * more. A listed session answers from the rows already reconciled; anything
     * else is read from the host, which is what keeps a subagent addressable: it
     * syncs and opens by id, but it never takes a row to be found in. Resolves
     * with `undefined` when the session is gone or its group is not listed,
     * since then there is no address to send a reader to.
     */
    sessionLocationRead(
        sessionId: HappyAgentSessionId,
    ): Promise<HappyAgentSessionLocation | undefined>;
    /**
     * Marks the session's latest completed work as seen. The mark is durable:
     * a session read before the window closed is not unread when it opens again.
     * `knownUnread` carries the folder view's observation for a chat that is not
     * part of this code-session list.
     */
    sessionRead(sessionId: HappyAgentSessionId, knownUnread?: boolean): void;
    /**
     * Creates a session and resolves with its address, or with `undefined` when
     * the mutation failed and was recorded in `mutationError`. That address is
     * what lets the caller navigate to the new conversation; this store never
     * selects.
     */
    sessionCreate(
        input: HappyAgentSessionCreateInput,
    ): Promise<HappyAgentSessionLocation | undefined>;
    /**
     * Closes a session: it leaves this list immediately and stays out of it
     * durably, without ending the session itself. A failure is recorded in
     * `mutationError` and the row returns on the following reconcile.
     */
    sessionArchive(sessionId: HappyAgentSessionId): Promise<void>;
    /** Returns an archived session to its workspace strip and verifies the host's answer. */
    sessionRestore(sessionId: HappyAgentSessionId): Promise<HappyAgentSessionRestoreResult>;
    /** Moves one session after `afterId`, or to the front of its workspace when null. */
    sessionReorder(
        sessionId: HappyAgentSessionId,
        afterId: HappyAgentSessionId | null,
    ): Promise<void>;

    /** Moves one project after `afterId`, or to the front of the list when null. */
    projectReorder(
        projectId: HappyAgentProjectId,
        afterId: HappyAgentProjectId | null,
    ): Promise<void>;

    /**
     * Creates a bot with an optional display name and answers with the address of the
     * one conversation it is made of, so the caller can open what it just made.
     *
     * Nothing about a bot can be named locally — the daemon derives its folder
     * name and makes its agent — so this waits on the host rather than
     * reserving a row, and rejects with a displayable reason when the host
     * refuses creation.
     */
    botCreate(name?: string): Promise<HappyAgentSessionLocation>;
    botRename(botId: string, name: string): Promise<void>;
    /** Archives a bot, preserving its dedicated folder for a later restore. */
    botArchive(botId: HappyAgentBotId): Promise<void>;
    /** Moves one bot after `afterId`, or to the front of the bot list when null. */
    botReorder(botId: HappyAgentBotId, afterId: HappyAgentBotId | null): Promise<void>;
    /** Starts one peer-owned managed project and returns its optimistic identity. */
    projectCloneGithub(repository: string, name: string): HappyAgentProjectId;

    /**
     * Archives a project: it leaves the list with its conversations and
     * worktrees, and the host archives those worktrees and removes their
     * checkouts. Deliberately not optimistic — the row goes when a successful
     * authoritative read says it is gone, which is also the only thing that
     * resolves this as `archived`. A refused request, an unreadable catalog, and
     * a project still listed afterwards are all `failed`, and the list is left
     * showing the project that is still there.
     */
    projectArchive(projectId: HappyAgentProjectId): Promise<HappyAgentProjectArchiveResult>;

    /**
     * Reads where sessions started in one project run by default. Not part of the
     * list snapshot: the host's live catalog does not describe the setting, so it
     * belongs to the surface that asks for it rather than to every row.
     */
    projectComputeRead(projectId: HappyAgentProjectId): Promise<HappyAgentProjectComputeState>;

    /**
     * Changes where sessions started in one project run by default, or stops the
     * project stating it when `compute` is absent. Deliberately not optimistic
     * and not recorded in `mutationError`: the answer is the host's own read-back
     * of the project, returned to the one caller that asked.
     *
     * `mutationId` is the caller's identity for this submission and must be
     * reused by every attempt at it, so a request whose answer was lost can be
     * sent again without the host applying it a second time.
     */
    projectComputeUpdate(
        projectId: HappyAgentProjectId,
        compute: HappyAgentProjectCompute | undefined,
        mutationId: string,
    ): Promise<HappyAgentProjectComputeResult>;

    /**
     * Notifies whenever the host says a project changed, whether or not the
     * grouped list can see the change.
     *
     * The list itself reconciles on the same events, but a project's compute
     * setting is not in the catalog those events are reconciled into, so a change
     * to it alone leaves every row identical and announces nothing. A surface
     * showing that setting subscribes here instead and re-reads it. Independent
     * of `subscribe`, because it is a different question — "the host says
     * something changed" rather than "these are the rows" — and because a surface
     * asking it does not want the list materialized on its behalf.
     */
    projectsChangedSubscribe(listener: () => void): () => void;

    /** Renames a project; the new name shows before the host confirms it. */
    projectRename(projectId: HappyAgentProjectId, name: string): Promise<void>;

    /**
     * Reserves a worktree in the project and returns its id at once, in the
     * caller's own call stack, so the caller can list and address it while the
     * host is still preparing the checkout. Returns `undefined` when the
     * reservation failed, with the reason recorded in `mutationError`.
     */
    worktreeCreate(projectId: HappyAgentProjectId): HappyAgentWorktreeId | undefined;

    /**
     * Why the host's checkout for a group cannot be written to right now, or
     * `undefined` when it can. Answered from the raw catalog record rather than
     * from the projected rows: a group on its way out is deliberately absent
     * from the rows, and an absence there must never read as permission.
     */
    groupWriteRefusal(groupId: HappyAgentGroupId): string | undefined;

    /**
     * Why a conversation cannot be started in a group or sent to, or `undefined`
     * when it can. Broader than `groupWriteRefusal`: a workspace whose checkout
     * is still being prepared may accept the user's intent, but Happy holds that
     * intent locally until the workspace is ready. Answered from the raw catalog
     * record for the same reason as its sibling.
     */
    groupConversationRefusal(groupId: HappyAgentGroupId): string | undefined;

    /**
     * Whether this session belongs to another session rather than to a list.
     *
     * The host says so outright, by naming the session that spawned it: a
     * subagent syncs and can be opened by id, but it belongs to its parent and
     * never takes a row. Parentage is asked for here rather than worked out
     * from the rows or from ordering, because a session can be missing from
     * both for ordinary reasons — chiefly that it was named a moment ago —
     * and reading that absence as delegation locks the reader out of the chat
     * they just made.
     *
     * A session this Happy Agent has never heard of is not delegated. Nothing is known
     * about it, which is not the same as knowing it belongs to someone else.
     */
    sessionDelegated(sessionId: HappyAgentSessionId): boolean;

    /**
     * Starts the first conversation in a worktree and returns its address in
     * the caller's own call stack. It is split from `worktreeCreate` so
     * addressing the worktree does not wait on the host at all, and it is
     * synchronous so the workspace and its first tab appear in the same frame:
     * there is never a rendered moment where the place exists and its
     * conversation does not.
     *
     * The address is real from the first moment: the connection names the agent
     * itself and announces it locally, so the workspace has its tab, its id, and
     * its composer while the checkout is still being prepared. The daemon does
     * not queue an agent created against an initializing checkout, so the
     * request alone waits for the catalog to report a ready, present workspace
     * at a canonical nonempty path — and everything addressed to the session
     * meanwhile queues behind that request. A checkout that never arrives
     * withdraws the session rather than leaving one that can never run.
     *
     * `create` configures that conversation. Its `cwd` and `worktreeId` are
     * supplied here, since only this call knows which checkout is meant.
     * Returns `undefined` when starting failed, with the reason recorded in
     * `mutationError`.
     */
    worktreeSessionStart(
        worktreeId: HappyAgentWorktreeId,
        create?: Omit<HappyAgentSessionCreateInput, "cwd" | "worktreeId">,
    ): HappyAgentSessionLocation | undefined;

    /** Archives a worktree: it leaves the list and the host removes its checkout. */
    worktreeArchive(
        projectId: HappyAgentProjectId,
        worktreeId: HappyAgentWorktreeId,
    ): Promise<HappyAgentWorktreeArchiveResult>;
    /** Renames a worktree; the new name shows before the host confirms it. */
    worktreeRename(
        projectId: HappyAgentProjectId,
        worktreeId: HappyAgentWorktreeId,
        name: string,
    ): Promise<void>;

    /** Moves one worktree after `afterId` within its project, or to the front when null. */
    worktreeReorder(
        projectId: HappyAgentProjectId,
        worktreeId: HappyAgentWorktreeId,
        afterId: HappyAgentWorktreeId | null,
    ): Promise<void>;
    [Symbol.dispose](): void;
}

export interface HappyAgentSessionListDeps {
    readonly client: Pick<HappyAgentClient, "getAgent" | "getProject" | "replaceProjectSettings">;
    /** The one stream-owned catalog authority for this Happy Agent connection. */
    readonly catalogSource: HappyAgentSessionCatalogSource;
    /**
     * Happy Agent mutation authority paired with `catalogSource`. An unavailable
     * authority makes the operation unavailable instead of sending a second
     * protocol.
     */
    readonly connectActions: Pick<
        HappyAgentConnection,
        | "archiveBot"
        | "archiveWorkspace"
        | "createBot"
        | "createSession"
        | "createWorkspace"
        | "markSessionRead"
        | "renameGroup"
        | "reorderBot"
        | "reorderProject"
        | "reorderSession"
        | "reorderWorkspace"
        | "setSessionArchived"
    > & {
        readonly projects: Pick<HappyAgentConnection["projects"], "archive" | "clone">;
    };
    /**
     * Terminal failures for mutations issued through `connectActions`. They
     * arrive here rather than as a rejected promise, because such a mutation is
     * accepted locally and can only fail later.
     */
    readonly connectMutationSubscribe: (
        listener: (rejection: MutationRejectedDelta) => void,
    ) => () => void;
    readonly output?: (event: HappyAgentSessionListOutput) => void;
}

export interface HappyAgentSessionCatalogSnapshot {
    readonly catalog: HappyAgentProjectCatalog;
    readonly sessions: readonly HappyAgentSessionSummary[];
    /** The host's complete archived catalog in newest-archived-first presentation order. */
    readonly archivedSessions: readonly HappyAgentSessionSummary[];
}

export interface HappyAgentSessionCatalogSource {
    read(): Promise<HappyAgentSessionCatalogSnapshot>;
    subscribe(listener: () => void, onError: (error: unknown) => void): () => void;
    [Symbol.dispose](): void;
}

/**
 * Owns the local conversation catalog grouped by project: the host's projects
 * and worktrees are read together with the flat session list, already in the
 * host's presentation order — with archived sessions carried explicitly beside
 * the active set — and projected into project rows, keeping that order inside
 * each group and putting the most recently active project first. The
 * constructor opens nothing; the first subscriber triggers hydration and one
 * global-event subscription, and the last unsubscribe tears both down.
 *
 * Daemon global events are delivery hints only: receiving one schedules a
 * reconcile of the durable list rather than trusting the payload it carried, so
 * a dropped, reordered, or partial event can never leave a row that the daemon
 * does not actually have.
 */
export function happyAgentSessionListStoreCreate(
    deps: HappyAgentSessionListDeps,
): HappyAgentSessionListStore {
    const output = deps.output ?? (() => undefined);

    const NO_WORKTREE_CREATE_FAILURES: ReadonlyMap<HappyAgentWorktreeId, UserError> = new Map();
    const NO_PROJECT_CREATE_FAILURES: ReadonlyMap<HappyAgentProjectId, UserError> = new Map();
    const NO_SESSION_CREATE_FAILURES: ReadonlyMap<HappyAgentSessionId, UserError> = new Map();

    const store = createStore<HappyAgentSessionListSnapshot>()(() => ({
        archivedSessions: [],
        bots: [],
        catalogRevision: 0,
        projectCreateFailures: NO_PROJECT_CREATE_FAILURES,
        projects: { type: "loading" },
        sessionCreateFailures: NO_SESSION_CREATE_FAILURES,
        worktreeCreateFailures: NO_WORKTREE_CREATE_FAILURES,
    }));

    const EMPTY_CATALOG: HappyAgentProjectCatalog = { bots: [], projects: [], worktrees: [] };

    /**
     * The durable rows this surface last reconciled, kept apart from the public
     * snapshot so a projection can be rebuilt without refetching and so
     * unchanged rows keep their references.
     */
    interface HappyAgentSessionListInternalState {
        readonly catalog: HappyAgentProjectCatalog;
        // Whether the catalog has ever been read. An empty catalog is not the
        // same claim as an unread one, and neither of them is permission:
        // before the first read nothing is known, and after it an id that is
        // not there has been withdrawn. Both refuse, and they say different
        // things.
        readonly catalogListed: boolean;
        readonly sessions: readonly HappyAgentSessionSummary[];
        readonly archivedSessions: readonly HappyAgentSessionSummary[];
        /**
         * Counts the changes the authoritative reads have made to what this
         * list describes. An optimistic publication leaves it alone, so a
         * subscriber can tell "the host says this row is gone" from "this
         * store took a row out ahead of the host".
         */
        readonly catalogRevision: number;
        readonly optimisticProjectOrder: readonly HappyAgentProjectId[] | undefined;
        readonly optimisticWorkspaceOrders: ReadonlyMap<
            HappyAgentProjectId,
            readonly HappyAgentWorktreeId[]
        >;
        /**
         * The list as the last successful authoritative read described it, kept
         * apart from what is currently published because the published rows
         * also carry optimistic changes the host has not answered yet.
         * Comparing each read against this — rather than against the snapshot —
         * is what makes a removal the reader performed here still count as the
         * host's own answer when it is read back, while a read that changed
         * nothing counts as nothing.
         */
        readonly authoritativeProjects: readonly HappyAgentProjectGroup[] | undefined;
        readonly authoritativeArchivedSessions: readonly HappyAgentSessionSummary[] | undefined;
    }

    const internal = createStore<HappyAgentSessionListInternalState>()(() => ({
        archivedSessions: [],
        authoritativeArchivedSessions: undefined,
        authoritativeProjects: undefined,
        catalog: EMPTY_CATALOG,
        catalogListed: false,
        catalogRevision: 0,
        optimisticProjectOrder: undefined,
        optimisticWorkspaceOrders: new Map(),
        sessions: [],
    }));

    const listeners = new Set<() => void>();
    let active = false;
    let disposed = false;
    /** Tokens handed to catalog reads in the order they are issued. */
    let readSequence = 0;
    /**
     * The newest read token whose snapshot was actually applied here; nothing
     * older may write. It says a newer authoritative observation exists, so it
     * advances only when one really did land — never to cancel work.
     */
    let appliedSequence = 0;
    /**
     * Reads issued up to here have been retired by a stop and may no longer
     * write, whatever they come back with. Kept apart from `appliedSequence`
     * because retiring a read establishes nothing about the host: a retired read
     * still holds the only fresh answer its caller has.
     */
    let retiredSequence = 0;
    let reconciling = false;
    let reconcileAgain = false;
    let unsubscribeGlobal: (() => void) | undefined;
    let unsubscribeMutationRejections: (() => void) | undefined;
    // Mutations issued through `connectActions` and not yet refused, newest last.
    // The bound keeps a long-lived list from remembering every mutation it ever
    // made; a refusal that arrives after this many later ones is not worth the
    // memory to attribute.
    const pendingMutationIds = new Set<string>();
    const pendingMutationOrder: string[] = [];
    interface SessionArchiveIntent {
        readonly archived: boolean;
        readonly mutationId: string;
        readonly summary?: HappyAgentSessionSummary;
    }
    const sessionArchiveIntents = new Map<HappyAgentSessionId, SessionArchiveIntent>();
    const sessionArchiveMutationIds = new Map<string, HappyAgentSessionId>();
    interface SessionRestoreWaiter {
        readonly resolve: (result: HappyAgentSessionRestoreResult) => void;
        stopObservation?: () => void;
    }
    const sessionRestoreWaiters = new Map<string, SessionRestoreWaiter>();
    interface ProjectArchiveWaiter {
        readonly projectId: HappyAgentProjectId;
        readonly resolve: (result: HappyAgentProjectArchiveResult) => void;
        stopObservation?: () => void;
    }
    const projectArchiveWaiters = new Map<string, ProjectArchiveWaiter>();
    interface WorktreeArchiveWaiter {
        readonly worktreeId: HappyAgentWorktreeId;
        readonly resolve: (result: HappyAgentWorktreeArchiveResult) => void;
        stopObservation?: () => void;
    }
    const worktreeArchiveWaiters = new Map<string, WorktreeArchiveWaiter>();
    const reorderMutations = new Map<
        string,
        | { readonly kind: "project"; readonly order: readonly HappyAgentProjectId[] }
        | {
              readonly kind: "workspace";
              readonly projectId: HappyAgentProjectId;
              readonly order: readonly HappyAgentWorktreeId[];
          }
    >();
    // Callers waiting for a freshly reserved worktree to be given its canonical
    // path. Settled from every reconcile, so the wait is driven by the host's
    // own catalog rather than by polling it. Each waiter keeps both halves: a
    // creation the host refuses, a checkout it could not prepare, a row it
    // withdrew, and disposal all have to end the wait, or the caller's action
    // never returns and its spinner never stops.
    interface HappyAgentWorktreeWaiter {
        readonly resolve: (worktree: HappyAgentWorktree) => void;
        readonly reject: (error: Error) => void;
        /** Whether the catalog has ever listed this worktree, so a later absence is a withdrawal. */
        listed: boolean;
    }
    /**
     * Several waits per worktree, not one.
     *
     * A workspace now takes work from the moment it is asked for, so two things
     * can be waiting on the same one at once — the composer's first message and
     * an agent's slot action, say. Holding a single waiter per id would let the
     * second arrival silently replace the first, and the intent it displaced
     * would never be consumed at all: no session, no message, no error, and a
     * promise pending for the life of the window.
     *
     * Every settlement takes its waiter out of this structure before calling it,
     * so an intent is acted on exactly once however many reconciles arrive.
     */
    const worktreeWaiters = new Map<HappyAgentWorktreeId, HappyAgentWorktreeWaiter[]>();
    /** Takes every waiter on one worktree out of the registry, ready to settle. */
    const worktreeWaitersTake = (
        worktreeId: HappyAgentWorktreeId,
    ): readonly HappyAgentWorktreeWaiter[] => {
        const waiting = worktreeWaiters.get(worktreeId);
        if (!waiting) return [];
        worktreeWaiters.delete(worktreeId);
        return waiting;
    };

    /** Ends every wait on one worktree with a reason. */
    const worktreeWaiterReject = (worktreeId: HappyAgentWorktreeId, message: string): void => {
        for (const waiter of worktreeWaitersTake(worktreeId)) waiter.reject(new Error(message));
    };

    const projectArchiveSettle = (
        mutationId: string,
        result: HappyAgentProjectArchiveResult,
    ): void => {
        const waiter = projectArchiveWaiters.get(mutationId);
        if (waiter === undefined) return;
        projectArchiveWaiters.delete(mutationId);
        pendingMutationIds.delete(mutationId);
        waiter.stopObservation?.();
        waiter.resolve(result);
    };

    const worktreeArchiveSettle = (
        mutationId: string,
        result: HappyAgentWorktreeArchiveResult,
    ): void => {
        const waiter = worktreeArchiveWaiters.get(mutationId);
        if (waiter === undefined) return;
        worktreeArchiveWaiters.delete(mutationId);
        pendingMutationIds.delete(mutationId);
        waiter.stopObservation?.();
        waiter.resolve(result);
    };

    const sessionRestoreSettle = (
        mutationId: string,
        result: HappyAgentSessionRestoreResult,
    ): void => {
        const waiter = sessionRestoreWaiters.get(mutationId);
        if (waiter === undefined) return;
        sessionRestoreWaiters.delete(mutationId);
        pendingMutationIds.delete(mutationId);
        waiter.stopObservation?.();
        waiter.resolve(result);
    };

    const projectArchivesConfirmAbsent = (): void => {
        for (const [mutationId, waiter] of projectArchiveWaiters) {
            if (
                !internal
                    .getState()
                    .catalog.projects.some((project) => project.id === waiter.projectId)
            ) {
                projectArchiveSettle(mutationId, { type: "archived" });
            }
        }
    };

    const worktreeArchivesConfirmAbsent = (): void => {
        for (const [mutationId, waiter] of worktreeArchiveWaiters) {
            if (
                !internal
                    .getState()
                    .catalog.worktrees.some((worktree) => worktree.id === waiter.worktreeId)
            ) {
                worktreeArchiveSettle(mutationId, { type: "archived" });
            }
        }
    };

    /** Keeps a local archive/restore visible until an authoritative read confirms it. */
    const sessionArchiveIntentsApply = (
        sessions: readonly HappyAgentSessionSummary[],
        archivedSessions: readonly HappyAgentSessionSummary[],
    ): {
        readonly sessions: readonly HappyAgentSessionSummary[];
        readonly archivedSessions: readonly HappyAgentSessionSummary[];
    } => {
        if (sessionArchiveIntents.size === 0) return { sessions, archivedSessions };
        let active = [...sessions];
        let archived = [...archivedSessions];
        for (const [sessionId, intent] of sessionArchiveIntents) {
            const activeSummary = active.find((session) => session.id === sessionId);
            const archivedSummary = archived.find((session) => session.id === sessionId);
            if (
                (intent.archived && archivedSummary !== undefined) ||
                (!intent.archived && activeSummary !== undefined)
            ) {
                sessionArchiveIntents.delete(sessionId);
                sessionArchiveMutationIds.delete(intent.mutationId);
                pendingMutationIds.delete(intent.mutationId);
                if (!intent.archived) sessionRestoreSettle(intent.mutationId, { type: "restored" });
                continue;
            }
            const summary = activeSummary ?? archivedSummary ?? intent.summary;
            active = active.filter((session) => session.id !== sessionId);
            archived = archived.filter((session) => session.id !== sessionId);
            if (summary === undefined) continue;
            if (intent.archived) archived.unshift(summary);
            else active.push(summary);
        }
        return { sessions: active, archivedSessions: archived };
    };

    const orderByIds = <T extends { readonly id: string }>(
        entries: readonly T[],
        order: readonly string[] | undefined,
    ): readonly T[] => {
        if (order === undefined) return entries;
        const position = new Map(order.map((id, index) => [id, index]));
        return entries
            .map((entry, index) => ({ entry, index }))
            .sort(
                (left, right) =>
                    (position.get(left.entry.id) ?? order.length + left.index) -
                    (position.get(right.entry.id) ?? order.length + right.index),
            )
            .map(({ entry }) => entry);
    };

    const optimisticOrderApply = (
        projected: readonly HappyAgentProjectGroup[],
    ): readonly HappyAgentProjectGroup[] => {
        const { optimisticProjectOrder, optimisticWorkspaceOrders } = internal.getState();
        return orderByIds(
            projected.map((project) => {
                const order = optimisticWorkspaceOrders.get(project.id);
                if (order === undefined) return project;
                return { ...project, worktrees: orderByIds(project.worktrees, order) };
            }),
            optimisticProjectOrder,
        );
    };

    const orderMatches = (
        entries: readonly { readonly id: string }[],
        expected: readonly string[],
    ): boolean =>
        entries.length === expected.length &&
        entries.every((entry, index) => entry.id === expected[index]);

    const optimisticOrdersConfirm = (projected: readonly HappyAgentProjectGroup[]): void => {
        const { optimisticProjectOrder, optimisticWorkspaceOrders } = internal.getState();
        let nextProjectOrder = optimisticProjectOrder;
        if (
            optimisticProjectOrder !== undefined &&
            orderMatches(projected, optimisticProjectOrder)
        ) {
            nextProjectOrder = undefined;
            for (const [mutationId, target] of reorderMutations)
                if (target.kind === "project") reorderMutations.delete(mutationId);
        }
        let nextWorkspaceOrders:
            | Map<HappyAgentProjectId, readonly HappyAgentWorktreeId[]>
            | undefined;
        for (const project of projected) {
            const expected = optimisticWorkspaceOrders.get(project.id);
            if (expected === undefined || !orderMatches(project.worktrees, expected)) continue;
            nextWorkspaceOrders ??= new Map(optimisticWorkspaceOrders);
            nextWorkspaceOrders.delete(project.id);
            for (const [mutationId, target] of reorderMutations)
                if (target.kind === "workspace" && target.projectId === project.id)
                    reorderMutations.delete(mutationId);
        }
        if (nextProjectOrder !== optimisticProjectOrder || nextWorkspaceOrders !== undefined)
            internal.setState({
                optimisticProjectOrder: nextProjectOrder,
                ...(nextWorkspaceOrders === undefined
                    ? {}
                    : { optimisticWorkspaceOrders: nextWorkspaceOrders }),
            });
    };

    const publish = (
        projected: readonly HappyAgentProjectGroup[] = happyAgentProjectGroupsProject(
            internal.getState().catalog,
            internal.getState().sessions,
        ),
        archivedSessions: readonly HappyAgentSessionSummary[] = internal.getState()
            .archivedSessions,
    ): void => {
        const { catalogRevision } = internal.getState();
        const ordered = optimisticOrderApply(projected);
        // Bots are taken straight from the catalog: the host owns their order,
        // and nothing in this surface rearranges or nests them.
        const bots = internal.getState().catalog.bots;
        store.setState((previous) => {
            // An unchanged project keeps its previous object — and with it the
            // identity of the worktrees and conversation rows nested inside it — so a
            // reconcile that changed one session does not replace every project row,
            // and a worktree changing phase does not replace its siblings.
            const projects =
                previous.projects.type === "ready"
                    ? happyAgentProjectGroupsPreserve(previous.projects.value, ordered)
                    : ordered;
            // The revision alone is worth a notification: a read that confirmed the
            // list is unchanged is still the host's answer, and it is what a
            // subscriber waiting on authoritative truth is waiting for. A
            // publish that changed nothing returns the previous snapshot
            // untouched, so no subscriber is notified for it.
            if (
                previous.projects.type === "ready" &&
                previous.projects.value === projects &&
                previous.bots === bots &&
                previous.archivedSessions === archivedSessions &&
                previous.catalogRevision === catalogRevision
            )
                return previous;
            return {
                ...previous,
                archivedSessions,
                bots,
                catalogRevision,
                projects: { type: "ready", value: projects },
            };
        });
    };

    /**
     * What one catalog read observed, and whether it was still the newest one
     * when it came back. A superseded read is not wrong, only late: its value
     * describes an earlier moment, so the caller judging something against it
     * must use the winner's snapshot instead — which is what `superseded` says.
     *
     * A read the surface retired on its way back is not superseded: nothing
     * newer was observed, the surface simply stopped listening. Its value is
     * still the freshest thing anyone has, and the caller that asked for it is
     * meant to judge from that value rather than from what the store kept.
     */
    interface CatalogObservation {
        readonly catalog: HappyAgentProjectCatalog;
        readonly sessions: readonly HappyAgentSessionSummary[];
        readonly archivedSessions: readonly HappyAgentSessionSummary[];
        readonly superseded: boolean;
    }

    /**
     * Every authoritative catalog read in this store goes through here, and the
     * order they are allowed to land in is decided before any of them starts.
     *
     * A token is taken when the read is issued, not when it returns. Only a read
     * whose token is newer than the last applied one may write, so a slow read
     * can never roll the catalog back over a later one that already landed, and
     * a read that lost the race neither publishes nor counts as a new revision.
     * That ordering is what keeps a project or worktree created, unarchived, or
     * renamed while a read was in flight from being wiped out by its answer.
     *
     * A read that fails keeps its place in that order rather than losing it: it
     * reports the token it was issued and whether something newer landed while
     * it was failing, so a caller holding an error can still see that a later
     * read has already answered its question.
     */
    const catalogRead = async (): Promise<
        | { readonly ok: true; readonly observed: CatalogObservation; readonly token: number }
        | {
              readonly ok: false;
              readonly error: unknown;
              readonly superseded: boolean;
              readonly token: number;
          }
    > => {
        const token = ++readSequence;
        try {
            const snapshot = await deps.catalogSource.read();
            const observedArchivedSessions = snapshot.archivedSessions;
            if (disposed)
                return {
                    ok: false,
                    error: new Error("The session list was closed."),
                    superseded: token <= appliedSequence,
                    token,
                };
            const superseded = token <= appliedSequence;
            // Two different questions: whether something newer was observed, and
            // whether this read is still allowed to write. Only the first one
            // may advance `appliedSequence`, because only the first one means a
            // snapshot actually landed here.
            if (!superseded && token > retiredSequence) {
                // The read landed, whatever it turned out to say: `appliedSequence`
                // is the read order, and a later read must not be allowed to think
                // this one never happened just because the host had nothing new.
                appliedSequence = token;
                const pending = sessionArchiveIntentsApply(
                    snapshot.sessions,
                    observedArchivedSessions,
                );
                internal.setState({
                    archivedSessions: pending.archivedSessions,
                    catalog: snapshot.catalog,
                    catalogListed: true,
                    sessions: pending.sessions,
                });
                const authoritativeProjected = happyAgentProjectGroupsProject(
                    snapshot.catalog,
                    snapshot.sessions,
                );
                const projected = happyAgentProjectGroupsProject(
                    snapshot.catalog,
                    pending.sessions,
                );
                optimisticOrdersConfirm(authoritativeProjected);
                // Judged against the previous authoritative read, so a row this
                // store took out optimistically is still a change when the host
                // confirms it, and a read describing the same catalog twice is
                // not. Reusing that read's references keeps the equal case
                // identical rather than merely equal, which is what lets the
                // comparison be an identity check.
                const { authoritativeArchivedSessions, authoritativeProjects } =
                    internal.getState();
                const authoritative =
                    authoritativeProjects === undefined
                        ? authoritativeProjected
                        : referencesPreserve(authoritativeProjects, authoritativeProjected);
                const archived =
                    authoritativeArchivedSessions === undefined
                        ? observedArchivedSessions
                        : referencesPreserve(
                              authoritativeArchivedSessions,
                              observedArchivedSessions,
                          );
                if (
                    authoritative !== authoritativeProjects ||
                    archived !== authoritativeArchivedSessions
                ) {
                    internal.setState((state) => ({
                        authoritativeArchivedSessions: archived,
                        authoritativeProjects: authoritative,
                        catalogRevision: state.catalogRevision + 1,
                    }));
                }
                publish(projected, pending.archivedSessions);
                worktreesSettle();
                projectArchivesConfirmAbsent();
                worktreeArchivesConfirmAbsent();
            }
            return {
                ok: true,
                observed: {
                    archivedSessions: observedArchivedSessions,
                    catalog: snapshot.catalog,
                    sessions: snapshot.sessions,
                    superseded,
                },
                token,
            };
        } catch (error) {
            return { ok: false, error, superseded: token <= appliedSequence, token };
        }
    };

    /**
     * Settles everyone waiting on a worktree the host now reports ready and
     * present, and ends the wait for one the catalog has stopped listing after
     * having listed it — a withdrawn row is an answer, not a reason to keep
     * waiting.
     *
     * The optimistic row a creation publishes carries no path, so an id that has
     * only ever been predicted keeps waiting here until the host's own answer
     * arrives. A canonical path alone is insufficient: Happy waits for a ready,
     * present checkout because the daemon rejects agents created while workspace
     * initialization is still in flight.
     */
    const worktreesSettle = (): void => {
        if (worktreeWaiters.size === 0) return;
        const listed = new Set<HappyAgentWorktreeId>();
        for (const worktree of internal.getState().catalog.worktrees) {
            const waiting = worktreeWaiters.get(worktree.id);
            if (!waiting) continue;
            listed.add(worktree.id);
            for (const waiter of waiting) waiter.listed = true;
            // Initializing is pending, not a refusal, even when the daemon has
            // already assigned the future checkout path.
            if (worktree.status === "initializing") continue;
            // Everything else must satisfy the exact disk-write invariant:
            // ready, present, and a nonempty canonical path.
            const refusal = happyAgentWorktreeWriteRefusal(worktree);
            if (refusal !== undefined) {
                for (const waiter of worktreeWaitersTake(worktree.id))
                    waiter.reject(new Error(refusal));
                continue;
            }
            if (worktree.path === "") continue;
            for (const waiter of worktreeWaitersTake(worktree.id)) waiter.resolve(worktree);
        }
        for (const [worktreeId, waiting] of worktreeWaiters) {
            if (waiting.some((waiter) => waiter.listed) && !listed.has(worktreeId)) {
                worktreeWaiterReject(worktreeId, "The workspace is no longer listed.");
            }
        }
    };

    /**
     * Resolves once the host reports this worktree ready at a canonical path, or
     * rejects when it failed to prepare, was refused, or was withdrawn. A
     * worktree the host has not answered for yet leaves this pending; the caller
     * is a user action, so it is cancelled by disposal rather than by a timeout
     * that would report a failure the host never had.
     */
    const worktreePathed = (worktreeId: HappyAgentWorktreeId): Promise<HappyAgentWorktree> => {
        const refused = store.getState().worktreeCreateFailures.get(worktreeId);
        if (refused) return Promise.reject(new Error(refused.message));
        const known = internal
            .getState()
            .catalog.worktrees.find((candidate) => candidate.id === worktreeId);
        if (known) {
            if (known.status === "initializing") {
                // Keep waiting below even when an initializing workspace already
                // advertises the path it will eventually use.
            } else {
                const refusal = happyAgentWorktreeWriteRefusal(known);
                if (refusal !== undefined) return Promise.reject(new Error(refusal));
                if (known.path !== "") return Promise.resolve(known);
            }
        }
        return new Promise<HappyAgentWorktree>((resolve, reject) => {
            const waiting = worktreeWaiters.get(worktreeId);
            const waiter: HappyAgentWorktreeWaiter = {
                resolve,
                reject,
                listed: known !== undefined,
            };
            if (waiting) waiting.push(waiter);
            else worktreeWaiters.set(worktreeId, [waiter]);
        });
    };

    const reconcile = async (): Promise<void> => {
        if (reconciling) {
            reconcileAgain = true;
            return;
        }
        reconciling = true;
        try {
            // The catalog and its sessions are read together so a project and the
            // sessions filed under it are never one tick apart: a session whose
            // project the catalog does not yet describe would otherwise vanish
            // from the list for a moment. Ordering, application, and supersession
            // all belong to the coordinator.
            const read = await catalogRead();
            if (read.ok || disposed) return;
            const previous = store.getState();
            // A failed refresh of an already loaded list keeps the rows on screen.
            if (previous.projects.type !== "ready")
                store.setState({
                    ...previous,
                    projects: { type: "error", error: happyAgentUserError(read.error) },
                });
        } finally {
            reconciling = false;
            if (reconcileAgain && !disposed && active) {
                reconcileAgain = false;
                void reconcile();
            }
        }
    };

    const mutationRejected = (rejection: MutationRejectedDelta): void => {
        // Another surface's refusal is not this list's to report, and the
        // withdrawal of an optimistic created row is the connection's own
        // doing. What remains here is attributing the failure and reconciling
        // any optimistic ordering, name, or archive projection.
        if (disposed || !pendingMutationIds.delete(rejection.mutationId)) return;
        const error = happyAgentUserError(new Error(rejection.message));
        const archivedSessionId = sessionArchiveMutationIds.get(rejection.mutationId);
        sessionArchiveMutationIds.delete(rejection.mutationId);
        if (
            archivedSessionId !== undefined &&
            sessionArchiveIntents.get(archivedSessionId)?.mutationId === rejection.mutationId
        )
            sessionArchiveIntents.delete(archivedSessionId);
        const reordered = reorderMutations.get(rejection.mutationId);
        reorderMutations.delete(rejection.mutationId);
        const { optimisticProjectOrder, optimisticWorkspaceOrders } = internal.getState();
        if (reordered?.kind === "project" && optimisticProjectOrder === reordered.order)
            internal.setState({ optimisticProjectOrder: undefined });
        if (
            reordered?.kind === "workspace" &&
            optimisticWorkspaceOrders.get(reordered.projectId) === reordered.order
        ) {
            const nextWorkspaceOrders = new Map(optimisticWorkspaceOrders);
            nextWorkspaceOrders.delete(reordered.projectId);
            internal.setState({ optimisticWorkspaceOrders: nextWorkspaceOrders });
        }
        const previous = store.getState();
        const worktreeCreateFailures =
            rejection.action === "create_workspace"
                ? new Map(previous.worktreeCreateFailures).set(
                      rejection.mutationId as HappyAgentWorktreeId,
                      error,
                  )
                : previous.worktreeCreateFailures;
        const projectCreateFailures =
            rejection.action === "create_project"
                ? new Map(previous.projectCreateFailures).set(
                      rejection.mutationId as HappyAgentProjectId,
                      error,
                  )
                : previous.projectCreateFailures;
        const sessionCreateFailures =
            rejection.action === "create_session"
                ? new Map(previous.sessionCreateFailures).set(
                      rejection.mutationId as HappyAgentSessionId,
                      error,
                  )
                : previous.sessionCreateFailures;
        projectArchiveSettle(rejection.mutationId, {
            type: "failed",
            error,
        });
        worktreeArchiveSettle(rejection.mutationId, {
            type: "failed",
            error,
        });
        sessionRestoreSettle(rejection.mutationId, {
            type: "failed",
            error,
        });
        store.setState({
            ...previous,
            mutationError: error,
            projectCreateFailures,
            sessionCreateFailures,
            worktreeCreateFailures,
        });
        if (reordered !== undefined) publish();
        if (rejection.action === "create_workspace") {
            worktreeWaiterReject(rejection.mutationId as HappyAgentWorktreeId, error.message);
        }
        void reconcile();
    };

    const start = (): void => {
        active = true;
        // A new watching epoch begins with nothing known about the host. Cleared
        // here rather than on the way out because a mutation issued while nobody
        // was watching still reconciles, and its read would otherwise leave a
        // baseline behind that the startup read below matches — announcing
        // nothing to a subscriber that has just arrived and knows nothing. The
        // first read of an epoch therefore always counts as a change, however
        // familiar it looks, so a group is confirmed present before its later
        // absence can be reported as a removal.
        internal.setState({ authoritativeProjects: undefined });
        unsubscribeGlobal = deps.catalogSource.subscribe(
            () => {
                if (!disposed && active) void reconcile();
            },
            () => {
                if (!disposed && active) void reconcile();
            },
        );
        unsubscribeMutationRejections = deps.connectMutationSubscribe(mutationRejected);
        void reconcile();
    };

    const stop = (): void => {
        active = false;
        // Every read already in flight loses its right to write: retiring the
        // whole issued range means none of them may publish here, while a read
        // issued after this takes a newer token and applies normally. It is
        // deliberately not `appliedSequence` — stopping observes nothing about
        // the host, and claiming otherwise would let a retired read pass for a
        // newer authoritative snapshot that never existed.
        retiredSequence = readSequence;
        unsubscribeGlobal?.();
        unsubscribeGlobal = undefined;
        unsubscribeMutationRejections?.();
        unsubscribeMutationRejections = undefined;
    };

    const notify = (): void => {
        for (const listener of listeners) listener();
    };
    const storeUnsub = store.subscribe(notify);

    /** Whether a group id still names something this list would show a reader. */
    const groupListed = (groupId: HappyAgentGroupId): boolean => {
        const { catalog } = internal.getState();
        return (
            catalog.projects.some((project) => project.id === groupId) ||
            catalog.worktrees.some((worktree) => worktree.id === groupId) ||
            // A bot is addressed through its own workspace, which belongs to no
            // project and so appears in neither list above. It is listed for as
            // long as the bot is.
            catalog.bots.some((bot) => bot.workspaceId === groupId)
        );
    };

    /**
     * Remembers a mutation issued through `connectActions` so its later refusal
     * can be told apart from one belonging to another surface, and returns its
     * id, which for a create is also the identity of what it created.
     */
    const connectMutationTrack = (mutationId: string): string => {
        pendingMutationIds.add(mutationId);
        pendingMutationOrder.push(mutationId);
        while (pendingMutationOrder.length > PENDING_MUTATION_LIMIT) {
            const expired = pendingMutationOrder.shift();
            if (expired) {
                pendingMutationIds.delete(expired);
                const sessionId = sessionArchiveMutationIds.get(expired);
                sessionArchiveMutationIds.delete(expired);
                if (sessionId && sessionArchiveIntents.get(sessionId)?.mutationId === expired)
                    sessionArchiveIntents.delete(sessionId);
            }
        }
        return mutationId;
    };

    const mutate = async <T>(run: () => Promise<T>): Promise<T | undefined> => {
        try {
            store.setState({ ...store.getState(), mutationError: undefined });
            return await run();
        } catch (error) {
            if (!disposed) {
                store.setState({ ...store.getState(), mutationError: happyAgentUserError(error) });
            }
            return undefined;
        }
    };

    /**
     * The synchronous shape of `mutate`, for the acts that only name things
     * locally. It exists so a caller can have the name in hand — and the row on
     * screen — in the same call stack as the click, with no interim frame where
     * the place exists and its conversation does not.
     */
    const mutateSync = <T>(run: () => T): T | undefined => {
        try {
            store.setState({ ...store.getState(), mutationError: undefined });
            return run();
        } catch (error) {
            if (!disposed) {
                store.setState({ ...store.getState(), mutationError: happyAgentUserError(error) });
            }
            return undefined;
        }
    };

    const sessionCreateRun = (
        input: HappyAgentSessionCreateInput,
        checkoutReady?: Promise<unknown>,
    ): HappyAgentSessionLocation => {
        const { catalog } = internal.getState();
        const worktree =
            input.worktreeId === undefined
                ? undefined
                : catalog.worktrees.find((entry) => entry.id === input.worktreeId);
        const project =
            worktree === undefined
                ? catalog.projects.find((entry) => entry.path === input.cwd)
                : catalog.projects.find((entry) => entry.id === worktree.projectId);
        const groupId = input.worktreeId ?? project?.id;
        if (groupId === undefined)
            throw new UserError("That project or workspace is no longer listed.");
        const sessionId = connectMutationTrack(
            deps.connectActions.createSession(
                {
                    cwd: input.cwd,
                    ...(input.providerId === undefined ? {} : { providerId: input.providerId }),
                    ...(input.modelId === undefined ? {} : { modelId: input.modelId }),
                    ...(input.effort === undefined ? {} : { effort: input.effort }),
                    ...(input.serviceTier === undefined ? {} : { serviceTier: input.serviceTier }),
                    ...(input.permissionMode === undefined
                        ? {}
                        : { permissionMode: input.permissionMode }),
                    ...(project === undefined ? {} : { projectId: project.id }),
                    ...(input.worktreeId === undefined ? {} : { workspaceId: input.worktreeId }),
                    ...(project?.requiredSecretKind === "github"
                        ? { gitSecret: { kind: "github" as const } }
                        : {}),
                },
                checkoutReady,
            ),
        ) as HappyAgentSessionId;
        const location = { groupId, sessionId };
        output({ type: "sessionCreated", location });
        return location;
    };

    const reorderedIds = <Id extends string>(
        ids: readonly Id[],
        id: Id,
        afterId: Id | null,
    ): readonly Id[] => {
        const remaining = ids.filter((candidate) => candidate !== id);
        const index = afterId === null ? 0 : Math.max(0, remaining.indexOf(afterId) + 1);
        return [...remaining.slice(0, index), id, ...remaining.slice(index)];
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1 && !disposed) start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        sessionsRefresh: () => reconcile(),
        groupWriteRefusal(groupId) {
            const { catalog, catalogListed } = internal.getState();
            const worktree = catalog.worktrees.find((entry) => entry.id === groupId);
            if (worktree !== undefined) return happyAgentWorktreeWriteRefusal(worktree);
            const project = catalog.projects.find((entry) => entry.id === groupId);
            if (project !== undefined) return happyAgentProjectWriteRefusal(project);
            if (catalog.bots.some((bot) => bot.workspaceId === groupId)) return undefined;
            return catalogListed
                ? HAPPY_AGENT_GROUP_UNLISTED_REFUSAL
                : HAPPY_AGENT_GROUP_UNREAD_REFUSAL;
        },
        groupConversationRefusal(groupId) {
            const { catalog, catalogListed } = internal.getState();
            const worktree = catalog.worktrees.find((entry) => entry.id === groupId);
            if (worktree !== undefined) return happyAgentWorktreeConversationRefusal(worktree);
            const project = catalog.projects.find((entry) => entry.id === groupId);
            // A project is the folder Happy was pointed at rather than one Happy Agent
            // is making, so there is no interval where it can take a chat but
            // not a change: the same sentence answers both questions.
            if (project !== undefined) return happyAgentProjectWriteRefusal(project);
            // A bot's workspace exists from the moment the bot does — the daemon
            // makes the two together — so there is no phase in which it is being
            // prepared and nothing to refuse. It answers both questions the same
            // way for the same reason a project does.
            if (catalog.bots.some((bot) => bot.workspaceId === groupId)) return undefined;
            return catalogListed
                ? HAPPY_AGENT_GROUP_UNLISTED_REFUSAL
                : HAPPY_AGENT_GROUP_UNREAD_REFUSAL;
        },
        sessionDelegated(sessionId) {
            const known = internal
                .getState()
                .sessions.find((candidate) => candidate.id === sessionId);
            return known !== undefined && known.parentSessionId !== undefined;
        },
        async sessionLocationRead(sessionId) {
            const listed = internal
                .getState()
                .sessions.find((candidate) => candidate.id === sessionId);
            // A session the list does not carry is not necessarily gone: a
            // subagent never takes a row, and a session started a moment ago
            // may not have been reconciled yet. Asking the host is what tells
            // those apart from a session that really has left.
            if (listed) {
                const location = sessionLocationOf(listed);
                return groupListed(location.groupId) ? location : undefined;
            }
            const response = await deps.client.getAgent(sessionId).catch(() => undefined);
            if (!response) return undefined;
            const location = {
                sessionId,
                groupId: response.agent.workspaceId as HappyAgentGroupId,
            };
            return groupListed(location.groupId) ? location : undefined;
        },
        sessionRead(sessionId, knownUnread) {
            const { catalog, sessions } = internal.getState();
            const session = sessions.find((candidate) => candidate.id === sessionId);
            // A bot's one conversation is carried on the bot itself and never
            // joins the flat session list, so both halves of reading it happen
            // on the catalog copy instead. Both halves matter: the open chat is
            // asked to report itself read on every list update, and a bot
            // looked for among the sessions is never found — so a bot whose
            // reply arrives while its chat is on screen would keep its dot
            // until something else cleared it.
            const bot = catalog.bots.find((candidate) => candidate.conversation.id === sessionId);
            const unread =
                session === undefined
                    ? bot?.conversation.unread === true
                    : session.unreadReason !== undefined;
            if (!unread && knownUnread !== true) return;
            if (session?.unreadReason !== undefined) {
                internal.setState({
                    sessions: sessions.map((candidate) =>
                        candidate.id === sessionId
                            ? { ...candidate, unreadReason: undefined }
                            : candidate,
                    ),
                });
                publish();
            } else if (bot?.conversation.unread === true) {
                internal.setState((state) => ({
                    catalog: {
                        ...state.catalog,
                        bots: state.catalog.bots.map((candidate) =>
                            candidate.id === bot.id
                                ? {
                                      ...candidate,
                                      conversation: { ...candidate.conversation, unread: false },
                                  }
                                : candidate,
                        ),
                    },
                }));
                publish();
            }
            deps.connectActions.markSessionRead(sessionId);
        },
        sessionCreate: (input) => mutate(async () => sessionCreateRun(input)),
        projectCloneGithub(repository, name) {
            return connectMutationTrack(
                deps.connectActions.projects.clone({
                    name,
                    secret: { kind: "github" },
                    source: { kind: "github", repository },
                }),
            ) as HappyAgentProjectId;
        },
        sessionArchive: (sessionId) =>
            mutate(async () => {
                // The row leaves the list before the host confirms, because
                // closing a tab must feel immediate. A failed archive is
                // recorded in `mutationError`; its rejection then reconciles
                // the authoritative catalog and puts the row back.
                const closing = internal
                    .getState()
                    .sessions.find((existing) => existing.id === sessionId);
                internal.setState((state) => {
                    return {
                        archivedSessions: closing
                            ? [
                                  closing,
                                  ...state.archivedSessions.filter(
                                      (existing) => existing.id !== sessionId,
                                  ),
                              ]
                            : state.archivedSessions,
                        sessions: state.sessions.filter((existing) => existing.id !== sessionId),
                    };
                });
                publish();
                const mutationId = connectMutationTrack(
                    deps.connectActions.setSessionArchived(sessionId, true),
                );
                sessionArchiveIntents.set(sessionId, {
                    archived: true,
                    mutationId,
                    ...(closing === undefined ? {} : { summary: closing }),
                });
                sessionArchiveMutationIds.set(mutationId, sessionId);
            }),
        async sessionRestore(sessionId) {
            const state = internal.getState();
            if (state.sessions.some((existing) => existing.id === sessionId))
                return { type: "restored" };
            const restoring = state.archivedSessions.find((existing) => existing.id === sessionId);
            store.setState({ ...store.getState(), mutationError: undefined });
            internal.setState((current) => ({
                archivedSessions: current.archivedSessions.filter(
                    (existing) => existing.id !== sessionId,
                ),
                sessions:
                    restoring === undefined ||
                    current.sessions.some((existing) => existing.id === sessionId)
                        ? current.sessions
                        : [...current.sessions, restoring],
            }));
            publish();
            return await new Promise<HappyAgentSessionRestoreResult>((resolve) => {
                const mutationId = connectMutationTrack(
                    deps.connectActions.setSessionArchived(sessionId, false),
                );
                sessionArchiveIntents.set(sessionId, {
                    archived: false,
                    mutationId,
                    ...(restoring === undefined ? {} : { summary: restoring }),
                });
                sessionArchiveMutationIds.set(mutationId, sessionId);
                const waiter: SessionRestoreWaiter = { resolve };
                sessionRestoreWaiters.set(mutationId, waiter);
                const unsubscribeCatalog = deps.catalogSource.subscribe(
                    () => {
                        void reconcile();
                    },
                    () => {
                        void reconcile();
                    },
                );
                const unsubscribeMutation = deps.connectMutationSubscribe(mutationRejected);
                waiter.stopObservation = () => {
                    unsubscribeCatalog();
                    unsubscribeMutation();
                };
                void reconcile();
            });
        },
        sessionReorder: (sessionId, afterId) =>
            mutate(async () => {
                connectMutationTrack(deps.connectActions.reorderSession(sessionId, afterId));
            }),
        worktreeCreate: (projectId) =>
            mutateSync(() => {
                // The connection names the worktree itself and returns that name
                // synchronously, so the row is in the catalog — through the same
                // stream that carries the authoritative one — before the request
                // is even sent, and the id can be addressed immediately. A
                // refusal withdraws the row and arrives as a rejection rather
                // than as a thrown error, which is why it is tracked below.
                const { catalog } = internal.getState();
                const project = catalog.projects.find((entry) => entry.id === projectId);
                return connectMutationTrack(
                    deps.connectActions.createWorkspace({
                        // No base is named: a ref given here is taken as a
                        // deliberate choice and forked verbatim, while leaving
                        // it out has Happy Agent fork the project's trunk.
                        name: happyAgentWorkspaceGeneratedName(catalog, projectId),
                        projectId,
                        ...(project?.requiredSecretKind === "github"
                            ? { secret: { kind: "github" as const } }
                            : {}),
                    }),
                ) as HappyAgentWorktreeId;
            }),
        worktreeSessionStart: (worktreeId, create) =>
            mutateSync(() => {
                // The session is named here, in the caller's own call stack,
                // and requested when the checkout is there. Anything slower
                // would give the reader a frame with a workspace and no tab in
                // it, and then rebuild the surface around them when the tab
                // arrived. The daemon is still never asked for an agent in a
                // workspace it is preparing: the wait moved behind the name
                // rather than in front of it.
                const pathed = worktreePathed(worktreeId);
                // The wait now belongs to the creation rather than to this
                // call, so it is marked handled here: a create refused before
                // it is passed on must not leave this rejection with nobody
                // listening to it.
                void pathed.catch(() => undefined);
                // Whatever the host has already said about where the checkout
                // is going. It is the workspace's id that names the agent's
                // home, so a checkout with no path yet costs nothing.
                const known = internal
                    .getState()
                    .catalog.worktrees.find((entry) => entry.id === worktreeId);
                return sessionCreateRun({ ...create, cwd: known?.path ?? "", worktreeId }, pathed);
            }),
        async worktreeArchive(projectId, worktreeId) {
            if (
                !internal
                    .getState()
                    .catalog.worktrees.some((worktree) => worktree.id === worktreeId)
            )
                return { type: "archived" };
            store.setState({ ...store.getState(), mutationError: undefined });
            // The row leaves immediately, but the promise below answers only
            // after the authoritative catalog confirms removal or the mutation
            // stream reports a refusal.
            internal.setState((state) => ({
                catalog: {
                    ...state.catalog,
                    worktrees: state.catalog.worktrees.filter((entry) => entry.id !== worktreeId),
                },
            }));
            publish();
            return await new Promise<HappyAgentWorktreeArchiveResult>((resolve) => {
                const mutationId = connectMutationTrack(
                    deps.connectActions.archiveWorkspace(projectId, worktreeId),
                );
                const waiter: WorktreeArchiveWaiter = { worktreeId, resolve };
                worktreeArchiveWaiters.set(mutationId, waiter);
                const unsubscribeCatalog = deps.catalogSource.subscribe(
                    () => {
                        void reconcile();
                    },
                    () => {
                        void reconcile();
                    },
                );
                const unsubscribeMutation = deps.connectMutationSubscribe(mutationRejected);
                waiter.stopObservation = () => {
                    unsubscribeCatalog();
                    unsubscribeMutation();
                };
                void reconcile();
            });
        },
        worktreeReorder: (projectId, worktreeId, afterId) =>
            mutate(async () => {
                const { catalog, sessions } = internal.getState();
                const projected = happyAgentProjectGroupsProject(catalog, sessions);
                const current = store.getState().projects;
                const peers =
                    (current.type === "ready" ? current.value : projected).find(
                        (project) => project.id === projectId,
                    )?.worktrees ?? [];
                if (!peers.some((entry) => entry.id === worktreeId)) return;
                const order = reorderedIds(
                    peers.map((entry) => entry.id),
                    worktreeId,
                    afterId,
                );
                internal.setState((state) => ({
                    optimisticWorkspaceOrders: new Map(state.optimisticWorkspaceOrders).set(
                        projectId,
                        order,
                    ),
                }));
                publish(projected);
                const mutationId = connectMutationTrack(
                    deps.connectActions.reorderWorkspace(worktreeId, afterId),
                );
                reorderMutations.set(mutationId, { kind: "workspace", projectId, order });
            }),
        projectReorder: (projectId, afterId) =>
            mutate(async () => {
                const { catalog, sessions } = internal.getState();
                const projected = happyAgentProjectGroupsProject(catalog, sessions);
                const current = store.getState().projects;
                const visible = current.type === "ready" ? current.value : projected;
                if (!visible.some((project) => project.id === projectId)) return;
                const order = reorderedIds(
                    visible.map((project) => project.id),
                    projectId,
                    afterId,
                );
                internal.setState({ optimisticProjectOrder: order });
                publish(projected);
                const mutationId = connectMutationTrack(
                    deps.connectActions.reorderProject(projectId, afterId),
                );
                reorderMutations.set(mutationId, { kind: "project", order });
            }),
        botCreate: async (name) => {
            store.setState({ ...store.getState(), mutationError: undefined });
            try {
                const bot = await deps.connectActions.createBot(name);
                // A bot's workspace is its group and its one agent is its one
                // conversation, so the bot the host answered with already holds
                // the whole address.
                return {
                    groupId: bot.workspaceId as HappyAgentGroupId,
                    sessionId: bot.agent.id as HappyAgentSessionId,
                };
            } catch (error) {
                // The creation surface reports why nothing was made.
                const failure = happyAgentUserError(error);
                if (!disposed) store.setState({ ...store.getState(), mutationError: failure });
                throw failure;
            }
        },
        botRename: (botId, name) =>
            mutate(async () => {
                if (!internal.getState().catalog.bots.some((bot) => bot.id === botId)) return;
                internal.setState((state) => ({
                    catalog: {
                        ...state.catalog,
                        bots: state.catalog.bots.map((bot) =>
                            bot.id === botId ? { ...bot, name } : bot,
                        ),
                    },
                }));
                publish();
                connectMutationTrack(deps.connectActions.renameGroup({ kind: "bot", botId }, name));
            }),
        botArchive: (botId) =>
            mutate(async () => {
                if (!internal.getState().catalog.bots.some((bot) => bot.id === botId)) return;
                connectMutationTrack(deps.connectActions.archiveBot(botId));
            }),
        botReorder: (botId, afterId) =>
            mutate(async () => {
                const { bots } = internal.getState().catalog;
                if (!bots.some((bot) => bot.id === botId)) return;
                // The row moves under the hand that dragged it. The catalog is
                // the one place bots are held, so reordering it there is what
                // the next publish reads; the host's own answer replaces the
                // whole catalog on the next reconcile.
                const order = reorderedIds(
                    bots.map((bot) => bot.id),
                    botId,
                    afterId,
                );
                const byId = new Map(bots.map((bot) => [bot.id, bot]));
                internal.setState((state) => ({
                    catalog: {
                        ...state.catalog,
                        bots: order.flatMap((id) => {
                            const bot = byId.get(id);
                            return bot === undefined ? [] : [bot];
                        }),
                    },
                }));
                publish();
                connectMutationTrack(deps.connectActions.reorderBot(botId, afterId));
            }),
        projectRename: (projectId, name) =>
            mutate(async () => {
                // The new name shows immediately: renaming is a direct
                // manipulation of a label, and a name that lags behind the
                // typing that produced it reads as the rename having failed.
                // The reconcile below is what makes the host's answer final.
                internal.setState((state) => ({
                    catalog: {
                        ...state.catalog,
                        projects: state.catalog.projects.map((project) =>
                            project.id === projectId ? { ...project, name } : project,
                        ),
                    },
                }));
                publish();
                connectMutationTrack(
                    deps.connectActions.renameGroup({ kind: "project", projectId }, name),
                );
            }),
        worktreeRename: (projectId, worktreeId, name) =>
            mutate(async () => {
                internal.setState((state) => ({
                    catalog: {
                        ...state.catalog,
                        worktrees: state.catalog.worktrees.map((worktree) =>
                            worktree.id === worktreeId ? { ...worktree, name } : worktree,
                        ),
                    },
                }));
                publish();
                connectMutationTrack(
                    deps.connectActions.renameGroup(
                        { kind: "workspace", projectId, workspaceId: worktreeId },
                        name,
                    ),
                );
            }),
        async projectArchive(projectId) {
            if (!internal.getState().catalog.projects.some((project) => project.id === projectId)) {
                return { type: "archived" };
            }

            return await new Promise<HappyAgentProjectArchiveResult>((resolve) => {
                const mutationId = connectMutationTrack(
                    deps.connectActions.projects.archive(projectId),
                );
                const waiter: ProjectArchiveWaiter = { projectId, resolve };
                projectArchiveWaiters.set(mutationId, waiter);

                // The mounted workspace normally owns equivalent subscriptions,
                // but this result must remain truthful if that reader unmounts
                // while the archive is in flight. Keep a scoped observation
                // until the authoritative project disappears or is refused.
                const unsubscribeCatalog = deps.catalogSource.subscribe(
                    () => {
                        void reconcile();
                    },
                    () => {
                        void reconcile();
                    },
                );
                const unsubscribeMutation = deps.connectMutationSubscribe(mutationRejected);
                waiter.stopObservation = () => {
                    unsubscribeCatalog();
                    unsubscribeMutation();
                };
                void reconcile();
            });
        },
        async projectComputeRead(projectId) {
            const { project } = await deps.client.getProject(projectId);
            return happyAgentProjectComputeProject(project);
        },
        async projectComputeUpdate(projectId, compute, mutationId) {
            try {
                // The `/v0` answer is the host's own read of the project
                // after the write, not an echo of the request, so this is the
                // authoritative read-back rather than the question asked twice.
                // A disposed store still returns it: the caller asked, the host
                // answered, and losing the surface does not unmake either.
                return {
                    type: "saved",
                    state: await deps.client.getProject(projectId).then(async ({ project }) => {
                        const updated = await deps.client.replaceProjectSettings(
                            projectId,
                            {
                                defaultWorkspaceCompute: happyAgentComputeRequest(compute),
                                mutationId,
                            },
                            { ifMatch: project.version },
                        );
                        return happyAgentProjectComputeProject(updated.project);
                    }),
                };
            } catch (error) {
                return { type: "failed", error: happyAgentUserError(error) };
            }
        },
        projectsChangedSubscribe(listener) {
            return deps.catalogSource.subscribe(
                () => {
                    if (!disposed) listener();
                },
                () => {
                    if (!disposed) listener();
                },
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            // A wait that outlives its surface would leave its caller's promise
            // pending for the life of the process, so disposal answers it.
            const cancelled = new Error("The workspace list was closed.");
            const waiters = [...worktreeWaiters.values()].flat();
            worktreeWaiters.clear();
            for (const waiter of waiters) waiter.reject(cancelled);
            for (const mutationId of projectArchiveWaiters.keys()) {
                projectArchiveSettle(mutationId, {
                    type: "failed",
                    error: happyAgentUserError(cancelled),
                });
            }
            for (const mutationId of worktreeArchiveWaiters.keys()) {
                worktreeArchiveSettle(mutationId, {
                    type: "failed",
                    error: happyAgentUserError(cancelled),
                });
            }
            for (const mutationId of sessionRestoreWaiters.keys()) {
                sessionRestoreSettle(mutationId, {
                    type: "failed",
                    error: happyAgentUserError(cancelled),
                });
            }
            sessionArchiveIntents.clear();
            sessionArchiveMutationIds.clear();
            stop();
            storeUnsub();
            listeners.clear();
        },
    };
}

/** The address of a session: its group, then itself. */
function sessionLocationOf(
    session:
        | {
              readonly id: HappyAgentSessionId;
              readonly scope: HappyAgentSession["scope"];
          }
        | {
              readonly id: HappyAgentSessionId;
              readonly projectId: HappyAgentProjectId;
              readonly worktreeId?: HappyAgentWorktreeId;
          },
): HappyAgentSessionLocation {
    return {
        sessionId: session.id,
        groupId:
            "scope" in session
                ? session.scope.kind === "workspace"
                    ? session.scope.worktreeId
                    : session.scope.projectId
                : happyAgentSessionGroupIdOf(session),
    };
}
