import type { ConversationSummary } from "../conversation/conversationSummary.js";
import { happyAgentConversationSummaryProject } from "./happyAgentConversationAuthors.js";
import {
    happyAgentProjectWriteRefusal,
    happyAgentWorktreeWriteRefusal,
} from "./happyAgentGroupAccess.js";
import { deepEqual } from "./happyAgentSupport.js";
import type {
    HappyAgentGroupId,
    HappyAgentProject,
    HappyAgentProjectAvatar,
    HappyAgentProjectCatalog,
    HappyAgentProjectId,
    HappyAgentSessionSummary,
    HappyAgentWorktree,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

/**
 * Where a worktree is in its life, as the host reports it.
 *
 * A worktree is listed from the moment it is asked for, so the row exists long
 * before its checkout does and can outlive the checkout it names. These are the
 * phases the host actually distinguishes:
 *
 * - `creating` — the checkout is being prepared. The row is addressable and
 *   named, but its directory does not exist yet, so nothing can run in it.
 * - `ready` — the checkout is prepared and present.
 * - `missing` — the checkout was prepared and its directory is no longer there.
 *   Nothing in Happy did that; it is what the host sees on disk now.
 * - `failed` — the host could not prepare the checkout, carrying its own reason
 *   when it gives one. Terminal: nothing further happens to this worktree.
 *
 * Being archived is deliberately not a phase. The host stops listing a worktree
 * the moment its archival begins, so "on its way out" is not something this list
 * can observe — see the filter in `happyAgentProjectGroupsProject`.
 */
export type HappyAgentGroupLifecycle =
    | { readonly phase: "creating" }
    | { readonly phase: "ready" }
    | { readonly phase: "missing" }
    | { readonly phase: "failed"; readonly reason?: string };

/** The lifecycle of a project checkout, including a managed clone in progress. */
export type HappyAgentProjectLifecycle = HappyAgentGroupLifecycle;

/** The lifecycle of one additional checkout inside a project. */
export type HappyAgentWorktreeLifecycle = HappyAgentGroupLifecycle;

/**
 * One of a project's git worktrees with the sessions running in it. A worktree is
 * a branch someone is working on in parallel, so its sessions list under it
 * rather than beside the project's own — the same way a project's sessions list
 * under the project.
 */
export interface HappyAgentWorktreeGroup {
    readonly id: HappyAgentWorktreeId;
    readonly projectId: HappyAgentProjectId;
    /** Name the daemon reserved for the worktree; the row's label. */
    readonly name: string;
    /** Fractional index this worktree sorts by among its project's worktrees. */
    readonly orderKey: string;
    readonly path: string;
    readonly displayPath: string;
    /** Canonical path on this Happy Agent's host, absent for Docker compute. */
    readonly hostPath?: string;
    /**
     * Whether this worktree's checkout is being prepared, usable, gone, or was
     * never made at all. Every row carries one: a worktree that exists is always
     * somewhere in that sequence, and a row saying nothing about it would be a
     * row the reader has to guess at.
     */
    readonly lifecycle: HappyAgentWorktreeLifecycle;
    /**
     * Why nothing may be started or written in this checkout, or absent when
     * something may be. Read from the host's raw status and presence rather than
     * from `lifecycle`, which folds states together for presentation and would
     * report a checkout that is being deleted as ready to work in.
     */
    readonly writeRefusal?: string;
    readonly conversations: readonly ConversationSummary[];
    /** Live marker of the busiest session in the worktree. */
    readonly activity: "running" | "awaitingInput" | "waiting" | "idle";
    /** Epoch milliseconds of the newest content in any of its sessions. */
    readonly updatedAt: number;
    readonly changedFiles?: number;
    readonly addedLines?: number;
    readonly deletedLines?: number;
    readonly changes?: HappyAgentWorktree["changes"];
}

/**
 * One project of the local workspace with every session filed under it. The
 * daemon owns projects durably — it derives their name from the git remote and
 * their picture from the repository or its hosting provider — so the list
 * addresses the project, not the working directory: `id` survives a restart and
 * a rename, and no filesystem layout reaches the address bar.
 */
export interface HappyAgentProjectGroup {
    readonly id: HappyAgentProjectId;
    readonly name: string;
    /** Fractional index this project sorts by in the list. */
    readonly orderKey: string;
    readonly path: string;
    readonly displayPath: string;
    /** Canonical path on this Happy Agent's host, absent for Docker compute. */
    readonly hostPath?: string;
    /** `home` is the catch-all project for sessions started outside any repository. */
    readonly kind: "regular" | "home";
    /** Whether this project's checkout is being prepared, usable, gone, or failed. */
    readonly lifecycle: HappyAgentProjectLifecycle;
    /** Repository source for a managed project Happy Agent cloned. */
    readonly remoteSource?: HappyAgentProject["remoteSource"];
    /** Native credential required for Git operations on this managed project. */
    readonly requiredSecretKind?: HappyAgentProject["requiredSecretKind"];
    readonly avatar?: HappyAgentProjectAvatar;
    /** Sessions in the project itself, i.e. not in one of its worktrees. */
    readonly conversations: readonly ConversationSummary[];
    /** Why nothing may be written in this project's directory, or absent when it may. */
    readonly writeRefusal?: string;
    readonly worktrees: readonly HappyAgentWorktreeGroup[];
    /** Live marker of the busiest session directly in the project. */
    readonly activity: "running" | "awaitingInput" | "waiting" | "idle";
    /** Epoch milliseconds of the newest content anywhere under the project. */
    readonly updatedAt: number;
    readonly changedFiles?: number;
    readonly addedLines?: number;
    readonly deletedLines?: number;
    readonly changes?: HappyAgentProject["changes"];
}

/** A session the host has given a position, and which therefore takes a row. */
type HappyAgentPlacedSession = HappyAgentSessionSummary & { readonly orderKey: string };

/**
 * Groups the flat session catalog under the daemon's projects and worktrees,
 * preserving the incoming session order inside each group and ordering the
 * projects by their newest session. A project with no sessions is still listed —
 * it is a place to start one — while a worktree only appears once it has work in
 * it.
 *
 * Sessions whose project the catalog does not describe are dropped rather than
 * guessed at: the catalog and the session list are read together, so the only way
 * to see one is a session created between the two reads, and the very next
 * reconcile lists it.
 */
export function happyAgentProjectGroupsProject(
    catalog: HappyAgentProjectCatalog,
    sessions: readonly HappyAgentSessionSummary[],
): readonly HappyAgentProjectGroup[] {
    const projectSessions = new Map<HappyAgentProjectId, HappyAgentPlacedSession[]>();
    const worktreeSessions = new Map<HappyAgentWorktreeId, HappyAgentPlacedSession[]>();
    for (const session of sessions) {
        // A subagent runs under the session that started it and is reachable
        // through that session; giving it a row of its own would put a session
        // nobody opened in the tab strip. Parentage is the whole of that test:
        // a top-level session the host has not ordered yet — one created a
        // moment ago — is still the reader's own tab, so a missing key falls
        // back to the session's id rather than costing the session its row.
        if (session.parentSessionId !== undefined) continue;
        const placed: HappyAgentPlacedSession = {
            ...session,
            orderKey: session.orderKey ?? session.id,
        };
        const bucket = session.worktreeId
            ? mapAppend(worktreeSessions, session.worktreeId)
            : mapAppend(projectSessions, session.projectId);
        bucket.push(placed);
    }

    const worktreesByProject = new Map<HappyAgentProjectId, HappyAgentWorktreeGroup[]>();
    for (const worktree of catalog.worktrees) {
        // A worktree being torn down is already gone as far as the reader is
        // concerned: they asked for it. Listing it again between "archiving" and
        // "archived" would take the row away, put it back, and take it away
        // again. A failed archive stays listed — it still exists.
        if (worktree.status === "archived" || worktree.status === "archiving") continue;
        // A worktree is listed as soon as it exists, before anything has run in
        // it: it was created deliberately and is where the next session goes, so
        // an empty one is a destination rather than clutter.
        const conversations = conversationsOf(worktreeSessions.get(worktree.id));
        const worktreeRefusal = happyAgentWorktreeWriteRefusal(worktree);
        mapAppend(worktreesByProject, worktree.projectId).push({
            id: worktree.id,
            projectId: worktree.projectId,
            name: worktree.name,
            orderKey: worktree.orderKey,
            path: worktree.path,
            displayPath: worktree.displayPath,
            ...(worktree.hostPath === undefined ? {} : { hostPath: worktree.hostPath }),
            lifecycle: happyAgentWorktreeLifecycleOf(worktree),
            ...(worktreeRefusal === undefined ? {} : { writeRefusal: worktreeRefusal }),
            conversations,
            activity: activityOf(conversations),
            updatedAt: newestOf(conversations),
            ...(worktree.changedFiles === undefined ? {} : { changedFiles: worktree.changedFiles }),
            ...(worktree.addedLines === undefined ? {} : { addedLines: worktree.addedLines }),
            ...(worktree.deletedLines === undefined ? {} : { deletedLines: worktree.deletedLines }),
            ...(worktree.changes === undefined ? {} : { changes: worktree.changes }),
        });
    }

    const groups = catalog.projects.map((project) =>
        projectGroup(
            project,
            conversationsOf(projectSessions.get(project.id)),
            (worktreesByProject.get(project.id) ?? []).sort(byOrderKey),
        ),
    );
    return groups.sort(byOrderKey);
}

/**
 * Returns `next`, reusing every entity from `previous` the reconcile did not
 * actually change — matched by its own id rather than by where it happens to sit
 * in the array, and merged one level at a time so a change reaches only the
 * entities it is about.
 *
 * A projection is rebuilt in full on every reconcile, so identity has to be put
 * back deliberately. Matching positionally would make a drag, a new worktree, or
 * a project moving to the front replace every row after it, and a single
 * worktree changing phase would hand its siblings and their conversations new
 * objects. Matching by id means a reorder returns the same objects in a
 * different order, and one phase change replaces exactly one worktree, its
 * project, and the two arrays holding them.
 */
export function happyAgentProjectGroupsPreserve(
    previous: readonly HappyAgentProjectGroup[],
    next: readonly HappyAgentProjectGroup[],
): readonly HappyAgentProjectGroup[] {
    return entitiesPreserve(previous, next, (before, after) => {
        const conversations = entitiesPreserve(before.conversations, after.conversations);
        const worktrees = entitiesPreserve(before.worktrees, after.worktrees, worktreePreserve);
        const merged =
            conversations === after.conversations && worktrees === after.worktrees
                ? after
                : { ...after, conversations, worktrees };
        return deepEqual(before, merged) ? before : merged;
    });
}

function worktreePreserve(
    before: HappyAgentWorktreeGroup,
    after: HappyAgentWorktreeGroup,
): HappyAgentWorktreeGroup {
    const conversations = entitiesPreserve(before.conversations, after.conversations);
    const merged = conversations === after.conversations ? after : { ...after, conversations };
    return deepEqual(before, merged) ? before : merged;
}

/**
 * One collection's structural sharing: each entity is matched to the previous
 * one carrying the same id, and the array itself is reused when every entity in
 * it came back unchanged and in the same order.
 */
function entitiesPreserve<T extends { readonly id: string }>(
    previous: readonly T[],
    next: readonly T[],
    preserve: (before: T, after: T) => T = (before, after) =>
        deepEqual(before, after) ? before : after,
): readonly T[] {
    if (previous === next) return previous;
    const byId = new Map<string, T>();
    for (const entity of previous) byId.set(entity.id, entity);
    let changed = previous.length !== next.length;
    const merged = next.map((entity, index) => {
        const before = byId.get(entity.id);
        const kept = before === undefined ? entity : preserve(before, entity);
        if (kept !== previous[index]) changed = true;
        return kept;
    });
    return changed ? merged : previous;
}

function projectGroup(
    project: HappyAgentProject,
    conversations: readonly ConversationSummary[],
    worktrees: readonly HappyAgentWorktreeGroup[],
): HappyAgentProjectGroup {
    const projectRefusal = happyAgentProjectWriteRefusal(project);
    return {
        id: project.id,
        name: project.name,
        orderKey: project.orderKey,
        path: project.path,
        displayPath: project.displayPath,
        ...(project.hostPath === undefined ? {} : { hostPath: project.hostPath }),
        kind: project.kind,
        lifecycle: happyAgentProjectLifecycleOf(project),
        conversations,
        ...(projectRefusal === undefined ? {} : { writeRefusal: projectRefusal }),
        ...(project.remoteSource === undefined ? {} : { remoteSource: project.remoteSource }),
        ...(project.requiredSecretKind === undefined
            ? {}
            : { requiredSecretKind: project.requiredSecretKind }),
        worktrees,
        // A project and each of its worktrees are independent destinations.
        // Child activity belongs on the child row rather than bubbling upward.
        activity: activityOf(conversations),
        updatedAt: Math.max(
            newestOf(conversations),
            ...worktrees.map((worktree) => worktree.updatedAt),
            0,
        ),
        ...(project.avatar ? { avatar: project.avatar } : {}),
        ...(project.changedFiles === undefined ? {} : { changedFiles: project.changedFiles }),
        ...(project.addedLines === undefined ? {} : { addedLines: project.addedLines }),
        ...(project.deletedLines === undefined ? {} : { deletedLines: project.deletedLines }),
        ...(project.changes === undefined ? {} : { changes: project.changes }),
    };
}

/*
 * The phases with nothing else to say are shared objects rather than fresh ones,
 * so a reconcile that changed a session cannot hand a worktree row a new
 * lifecycle object and make an otherwise unchanged row compare as changed.
 */
const LIFECYCLE_CREATING: HappyAgentWorktreeLifecycle = { phase: "creating" };
const LIFECYCLE_READY: HappyAgentWorktreeLifecycle = { phase: "ready" };
const LIFECYCLE_MISSING: HappyAgentWorktreeLifecycle = { phase: "missing" };
const LIFECYCLE_FAILED: HappyAgentWorktreeLifecycle = { phase: "failed" };

/** Reads a project's managed-clone and filesystem facts as one visible phase. */
export function happyAgentProjectLifecycleOf(
    project: HappyAgentProject,
): HappyAgentProjectLifecycle {
    if (project.status === "initializing") return LIFECYCLE_CREATING;
    if (project.status === "failed")
        return project.error === undefined
            ? LIFECYCLE_FAILED
            : { phase: "failed", reason: project.error };
    return project.presence === "missing" ? LIFECYCLE_MISSING : LIFECYCLE_READY;
}

/**
 * Reads the host's worktree record as the phase a reader can act on.
 *
 * Preparation and presence are two separate facts about the same checkout, and
 * only their combination says what the reader is looking at: a checkout that was
 * never made is not the same thing as one that was made and then removed, and
 * showing both as "not there" would hide which of the two happened.
 */
export function happyAgentWorktreeLifecycleOf(
    worktree: HappyAgentWorktree,
): HappyAgentWorktreeLifecycle {
    if (worktree.status === "initializing") return LIFECYCLE_CREATING;
    if (worktree.status === "failed") {
        return worktree.error === undefined
            ? LIFECYCLE_FAILED
            : { phase: "failed", reason: worktree.error };
    }
    return worktree.presence === "missing" ? LIFECYCLE_MISSING : LIFECYCLE_READY;
}

/**
 * Whether work can start in this worktree at all. Only a prepared checkout that
 * is still on disk can host a session: a session pointed at a directory that
 * does not exist fails on its first command, and the failure it reports is about
 * a missing path rather than about the workspace never having been made.
 */
export function happyAgentWorktreeLifecycleAccepts(
    lifecycle: HappyAgentWorktreeLifecycle,
): boolean {
    return lifecycle.phase === "ready";
}

/**
 * Why work cannot start here, in the phase's own words, or `undefined` when it
 * can. The sentence is what a refused control shows and what a refused action
 * rejects with, so both say the same thing rather than one of them apologising
 * generically.
 */
export function happyAgentWorktreeLifecycleRefusal(
    lifecycle: HappyAgentWorktreeLifecycle,
): string | undefined {
    if (lifecycle.phase === "ready") return undefined;
    if (lifecycle.phase === "creating") return "This workspace is still being created.";
    if (lifecycle.phase === "missing") return "This workspace's folder is no longer on disk.";
    return lifecycle.reason === undefined
        ? "This workspace could not be created."
        : `This workspace could not be created. ${lifecycle.reason}`;
}

/**
 * The arrangement the user dragged, as the host records it: fractional index
 * first, then id to break the tie the host breaks the same way. Sorting on the
 * key rather than on recency is what keeps a dragged row where it was put
 * instead of letting the next message throw it back to the top.
 */
function byOrderKey(
    left: { readonly orderKey: string; readonly id: string },
    right: { readonly orderKey: string; readonly id: string },
): number {
    if (left.orderKey !== right.orderKey) return left.orderKey < right.orderKey ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * One group's rows in the arrangement the host records. The sessions are sorted
 * here rather than trusted in arrival order because an optimistic reorder
 * rewrites only the moved row's key: sorting on the key is what moves the row.
 */
function conversationsOf(
    sessions: readonly HappyAgentPlacedSession[] | undefined,
): readonly ConversationSummary[] {
    return [...(sessions ?? [])].sort(byOrderKey).map(happyAgentConversationSummaryProject);
}

function activityOf(
    conversations: readonly ConversationSummary[],
): "running" | "awaitingInput" | "waiting" | "idle" {
    if (conversations.some((row) => row.activity === "awaitingInput")) return "awaitingInput";
    // Waiting is a low-priority modifier: one session doing real work makes the
    // whole group read as working, and only a group where nothing runs at all
    // wears the clock.
    if (conversations.some((row) => row.activity === "running")) return "running";
    return conversations.some((row) => row.activity === "waiting") ? "waiting" : "idle";
}

function newestOf(conversations: readonly ConversationSummary[]): number {
    return conversations.reduce((newest, row) => Math.max(newest, row.updatedAt), 0);
}

function mapAppend<Key, Value>(map: Map<Key, Value[]>, key: Key): Value[] {
    const existing = map.get(key);
    if (existing) return existing;
    const created: Value[] = [];
    map.set(key, created);
    return created;
}

/** The group a session lists under: its worktree when it has one, otherwise its project. */
export function happyAgentSessionGroupIdOf(session: {
    readonly projectId: HappyAgentProjectId;
    readonly worktreeId?: HappyAgentWorktreeId;
}): HappyAgentGroupId {
    return session.worktreeId ?? session.projectId;
}
