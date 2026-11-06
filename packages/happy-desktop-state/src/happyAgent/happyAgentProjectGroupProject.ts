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
 * can observe — see `worktreeListed`.
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
    /** The agent that created this worktree, or null for one a person made. */
    readonly creatorAgentId: string | null;
    /** Fractional index this worktree sorts by among its project's worktrees. */
    readonly orderKey: string;
    readonly path: string;
    readonly displayPath: string;
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
    readonly changesStatus?: "loading" | "ready" | "stale" | "unavailable";
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
    /** `home` is the catch-all project for sessions started outside any repository. */
    readonly kind: "regular" | "home";
    /** Whether this project's checkout is being prepared, usable, gone, or failed. */
    readonly lifecycle: HappyAgentProjectLifecycle;
    /** Repository source for a managed project Happy Agent cloned. */
    readonly remoteSource?: HappyAgentProject["remoteSource"];
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
    readonly changesStatus?: "loading" | "ready" | "stale" | "unavailable";
    readonly changedFiles?: number;
    readonly addedLines?: number;
    readonly deletedLines?: number;
    readonly changes?: HappyAgentProject["changes"];
}

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
    return happyAgentProjectGroupsProjectorCreate()(catalog, sessions);
}

/**
 * `happyAgentProjectGroupsProject` for one reader that projects the same catalog
 * over and over. The catalog source hands back the very same project, worktree and
 * session objects for everything a change did not touch, so a group whose inputs
 * are all identical to the last projection's is that projection's group, and only
 * the groups a change reached are built again. A rebuilt group that turns out
 * equal to the one it replaces is the one it replaces, so a change the list does
 * not show — a timestamp the row does not carry — leaves every reference alone.
 */
export function happyAgentProjectGroupsProjectorCreate(): (
    catalog: HappyAgentProjectCatalog,
    sessions: readonly HappyAgentSessionSummary[],
) => readonly HappyAgentProjectGroup[] {
    interface WorktreeProjection {
        readonly source: HappyAgentWorktree;
        readonly sessions: readonly HappyAgentSessionSummary[];
        readonly value: HappyAgentWorktreeGroup;
    }
    interface ProjectProjection {
        readonly source: HappyAgentProject;
        readonly sessions: readonly HappyAgentSessionSummary[];
        readonly worktrees: readonly HappyAgentWorktreeGroup[];
        readonly value: HappyAgentProjectGroup;
    }
    let worktreeProjections = new Map<HappyAgentWorktreeId, WorktreeProjection>();
    let projectProjections = new Map<HappyAgentProjectId, ProjectProjection>();
    let projectedWorktrees: readonly HappyAgentWorktree[] = [];
    let projectedProjects: readonly HappyAgentProject[] = [];
    let groups: readonly HappyAgentProjectGroup[] = [];
    let groupIndex = new Map<HappyAgentProjectId, number>();

    /*
     * The buckets the last call filed its sessions into, and where each session
     * sat. The source hands back the very same flat list but for the sessions a
     * change touched, so when none of those moved between groups the buckets are
     * patched in place of being filed again.
     */
    let bucketed: readonly HappyAgentSessionSummary[] = [];
    let buckets = new Map<string, HappyAgentSessionSummary[]>();
    let slots: (readonly [string, number] | undefined)[] = [];

    const bucketsFile = (sessions: readonly HappyAgentSessionSummary[]): void => {
        buckets = new Map();
        slots = sessions.map((session) => {
            // A subagent runs under the session that started it and is reachable
            // through that session; giving it a row of its own would put a session
            // nobody opened in the tab strip. Parentage is the whole of that test:
            // a top-level session the host has not ordered yet — one created a
            // moment ago — is still the reader's own tab, so a missing key falls
            // back to the session's id rather than costing the session its row.
            if (session.parentSessionId !== undefined) return undefined;
            const key = bucketKey(session);
            const bucket = mapAppend(buckets, key);
            bucket.push(session);
            return [key, bucket.length - 1] as const;
        });
        bucketed = sessions;
    };

    /**
     * Files `sessions` by patching the last call's buckets, answering the
     * buckets it changed, or `undefined` when a session moved and everything
     * has to be filed again.
     */
    const bucketsPatch = (
        sessions: readonly HappyAgentSessionSummary[],
    ): ReadonlySet<string> | undefined => {
        if (sessions.length !== bucketed.length) return undefined;
        let patched: Map<string, HappyAgentSessionSummary[]> | undefined;
        for (let index = 0; index < sessions.length; index += 1) {
            const session = sessions[index]!;
            if (session === bucketed[index]) continue;
            const slot = slots[index];
            if (
                (session.parentSessionId === undefined) !== (slot !== undefined) ||
                (slot !== undefined && bucketKey(session) !== slot[0])
            )
                return undefined;
            if (slot === undefined) continue;
            // A bucket the last projection holds is never written: the first
            // change to it this call copies it.
            patched ??= new Map();
            let bucket = patched.get(slot[0]);
            if (bucket === undefined) {
                bucket = [...buckets.get(slot[0])!];
                patched.set(slot[0], bucket);
            }
            bucket[slot[1]] = session;
        }
        bucketed = sessions;
        if (patched === undefined) return NO_KEYS;
        // Only the bucket arrays are ever held by a projection; the index is this
        // projector's own and is updated in place.
        for (const [key, bucket] of patched) buckets.set(key, bucket);
        return new Set(patched.keys());
    };

    const worktreeProject = (worktree: HappyAgentWorktree): WorktreeProjection => {
        const listed = buckets.get(worktreeKey(worktree.id)) ?? NO_SESSIONS;
        const previous = worktreeProjections.get(worktree.id);
        if (
            previous !== undefined &&
            previous.source === worktree &&
            elementsSame(previous.sessions, listed)
        )
            return previous;
        return {
            source: worktree,
            sessions: listed,
            value: settled(
                previous?.value,
                worktreeGroup(
                    worktree,
                    conversationsSettled(previous?.value.conversations, listed),
                ),
            ),
        };
    };

    const projectProject = (
        project: HappyAgentProject,
        worktrees: readonly HappyAgentWorktreeGroup[],
    ): ProjectProjection => {
        const listed = buckets.get(projectKey(project.id)) ?? NO_SESSIONS;
        const previous = projectProjections.get(project.id);
        if (
            previous !== undefined &&
            previous.source === project &&
            elementsSame(previous.sessions, listed) &&
            elementsSame(previous.worktrees, worktrees)
        )
            return previous;
        return {
            source: project,
            sessions: listed,
            worktrees,
            value: settled(
                previous?.value,
                projectGroup(
                    project,
                    conversationsSettled(previous?.value.conversations, listed),
                    previous !== undefined && elementsSame(previous.value.worktrees, worktrees)
                        ? previous.value.worktrees
                        : worktrees,
                ),
            ),
        };
    };

    const projectAll = (catalog: HappyAgentProjectCatalog): readonly HappyAgentProjectGroup[] => {
        const worktreesNext = new Map<HappyAgentWorktreeId, WorktreeProjection>();
        const worktreesByProject = new Map<HappyAgentProjectId, HappyAgentWorktreeGroup[]>();
        for (const worktree of catalog.worktrees) {
            if (!worktreeListed(worktree)) continue;
            // A worktree is listed as soon as it exists, before anything has run in
            // it: it was created deliberately and is where the next session goes, so
            // an empty one is a destination rather than clutter.
            const projection = worktreeProject(worktree);
            worktreesNext.set(worktree.id, projection);
            mapAppend(worktreesByProject, worktree.projectId).push(projection.value);
        }
        worktreeProjections = worktreesNext;

        const projectsNext = new Map<HappyAgentProjectId, ProjectProjection>();
        const next = catalog.projects.map((project) => {
            const projection = projectProject(
                project,
                (worktreesByProject.get(project.id) ?? []).sort(byOrderKey),
            );
            projectsNext.set(project.id, projection);
            return projection.value;
        });
        projectProjections = projectsNext;
        next.sort(byOrderKey);
        projectedWorktrees = catalog.worktrees;
        projectedProjects = catalog.projects;
        // The list itself is the last one when it holds the same groups in the same order.
        if (elementsSame(groups, next)) return groups;
        groups = next;
        groupIndex = new Map(next.map((group, index) => [group.id, index]));
        return groups;
    };

    /**
     * Projects only what changed since the last call: the worktrees and projects
     * whose records were replaced and the groups whose sessions were. Answers
     * `undefined` when something was added, removed, listed, unlisted, or moved,
     * because only a full projection settles a new arrangement.
     */
    const projectChanged = (
        catalog: HappyAgentProjectCatalog,
        patched: ReadonlySet<string>,
    ): readonly HappyAgentProjectGroup[] | undefined => {
        const { projects, worktrees } = catalog;
        if (
            worktrees.length !== projectedWorktrees.length ||
            projects.length !== projectedProjects.length
        )
            return undefined;
        const worktreesDirty = new Map<HappyAgentWorktreeId, HappyAgentWorktree>();
        for (let index = 0; index < worktrees.length; index += 1) {
            const worktree = worktrees[index]!;
            const before = projectedWorktrees[index]!;
            if (worktree === before) continue;
            if (
                worktree.id !== before.id ||
                worktree.projectId !== before.projectId ||
                worktree.orderKey !== before.orderKey ||
                worktreeListed(worktree) !== worktreeListed(before)
            )
                return undefined;
            if (worktreeListed(worktree)) worktreesDirty.set(worktree.id, worktree);
        }
        const projectsDirty = new Map<HappyAgentProjectId, HappyAgentProject>();
        for (let index = 0; index < projects.length; index += 1) {
            const project = projects[index]!;
            const before = projectedProjects[index]!;
            if (project === before) continue;
            if (project.id !== before.id || project.orderKey !== before.orderKey) return undefined;
            projectsDirty.set(project.id, project);
        }
        // A session's bucket names a group whose record did not change; a bucket
        // naming a group the catalog does not list is dropped, as a full
        // projection drops it.
        for (const key of patched) {
            if (key.startsWith(WORKTREE_PREFIX)) {
                const projection = worktreeProjections.get(
                    key.slice(WORKTREE_PREFIX.length) as HappyAgentWorktreeId,
                );
                if (projection !== undefined && !worktreesDirty.has(projection.source.id))
                    worktreesDirty.set(projection.source.id, projection.source);
            } else {
                const projection = projectProjections.get(
                    key.slice(PROJECT_PREFIX.length) as HappyAgentProjectId,
                );
                if (projection !== undefined && !projectsDirty.has(projection.source.id))
                    projectsDirty.set(projection.source.id, projection.source);
            }
        }
        const worktreesReplaced = new Map<HappyAgentWorktreeId, HappyAgentWorktreeGroup>();
        for (const worktree of worktreesDirty.values()) {
            const previous = worktreeProjections.get(worktree.id);
            if (previous === undefined) return undefined;
            const projection = worktreeProject(worktree);
            if (projection === previous) continue;
            worktreeProjections.set(worktree.id, projection);
            if (projection.value === previous.value) continue;
            worktreesReplaced.set(worktree.id, projection.value);
            const project = projectProjections.get(worktree.projectId);
            if (project !== undefined && !projectsDirty.has(project.source.id))
                projectsDirty.set(project.source.id, project.source);
        }
        let next: HappyAgentProjectGroup[] | undefined;
        for (const project of projectsDirty.values()) {
            const previous = projectProjections.get(project.id);
            const index = groupIndex.get(project.id);
            if (previous === undefined || index === undefined) return undefined;
            // No worktree's key changed, so the replaced ones keep their places.
            const projectWorktrees =
                worktreesReplaced.size === 0
                    ? previous.worktrees
                    : previous.worktrees.map(
                          (worktree) => worktreesReplaced.get(worktree.id) ?? worktree,
                      );
            const projection = projectProject(project, projectWorktrees);
            if (projection === previous) continue;
            projectProjections.set(project.id, projection);
            if (projection.value === previous.value) continue;
            next ??= [...groups];
            next[index] = projection.value;
        }
        projectedWorktrees = worktrees;
        projectedProjects = projects;
        if (next !== undefined) groups = next;
        return groups;
    };

    return (catalog, sessions) => {
        const patched = sessions === bucketed ? NO_KEYS : bucketsPatch(sessions);
        if (patched !== undefined) {
            const projected = projectChanged(catalog, patched);
            if (projected !== undefined) return projected;
        } else bucketsFile(sessions);
        return projectAll(catalog);
    };
}

const NO_KEYS: ReadonlySet<string> = new Set();
const WORKTREE_PREFIX = "worktree:";
const PROJECT_PREFIX = "project:";

function worktreeKey(id: HappyAgentWorktreeId): string {
    return `${WORKTREE_PREFIX}${id}`;
}

function projectKey(id: HappyAgentProjectId): string {
    return `${PROJECT_PREFIX}${id}`;
}

/** The bucket a top-level session is filed in: its worktree's, or else its project's. */
function bucketKey(session: HappyAgentSessionSummary): string {
    return session.worktreeId ? worktreeKey(session.worktreeId) : projectKey(session.projectId);
}

/**
 * Whether a worktree is listed at all. One being torn down is already gone as
 * far as the reader is concerned: they asked for it. Listing it again between
 * "archiving" and "archived" would take the row away, put it back, and take it
 * away again. A failed archive stays listed — it still exists.
 */
function worktreeListed(worktree: HappyAgentWorktree): boolean {
    return worktree.status !== "archived" && worktree.status !== "archiving";
}

const NO_SESSIONS: readonly HappyAgentSessionSummary[] = [];

/** `next`, or `previous` when the two describe the very same row. */
function settled<T>(previous: T | undefined, next: T): T {
    return previous !== undefined && deepEqual(previous, next) ? previous : next;
}

/** One group's rows, reusing the previous array when every row came back the same. */
function conversationsSettled(
    previous: readonly ConversationSummary[] | undefined,
    sessions: readonly HappyAgentSessionSummary[],
): readonly ConversationSummary[] {
    const conversations = conversationsOf(sessions);
    return previous !== undefined && elementsSame(previous, conversations)
        ? previous
        : conversations;
}

/** Whether two lists hold the very same items in the same order. */
function elementsSame<T>(left: readonly T[], right: readonly T[]): boolean {
    if (left === right) return true;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1)
        if (left[index] !== right[index]) return false;
    return true;
}

function worktreeGroup(
    worktree: HappyAgentWorktree,
    conversations: readonly ConversationSummary[],
): HappyAgentWorktreeGroup {
    const worktreeRefusal = happyAgentWorktreeWriteRefusal(worktree);
    return {
        id: worktree.id,
        projectId: worktree.projectId,
        name: worktree.name,
        creatorAgentId: worktree.creatorAgentId,
        orderKey: worktree.orderKey,
        path: worktree.path,
        displayPath: worktree.displayPath,
        lifecycle: happyAgentWorktreeLifecycleOf(worktree),
        ...(worktreeRefusal === undefined ? {} : { writeRefusal: worktreeRefusal }),
        conversations,
        activity: activityOf(conversations),
        updatedAt: newestOf(conversations),
        ...(worktree.changesStatus === undefined ? {} : { changesStatus: worktree.changesStatus }),
        ...(worktree.changedFiles === undefined ? {} : { changedFiles: worktree.changedFiles }),
        ...(worktree.addedLines === undefined ? {} : { addedLines: worktree.addedLines }),
        ...(worktree.deletedLines === undefined ? {} : { deletedLines: worktree.deletedLines }),
        ...(worktree.changes === undefined ? {} : { changes: worktree.changes }),
    };
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
    return entitiesPreserve(previous, next, (before, after) =>
        preserved(before, after, () => {
            const conversations = entitiesPreserve(before.conversations, after.conversations);
            const worktrees = entitiesPreserve(before.worktrees, after.worktrees, worktreePreserve);
            const merged =
                conversations === after.conversations && worktrees === after.worktrees
                    ? after
                    : { ...after, conversations, worktrees };
            return deepEqual(before, merged) ? before : merged;
        }),
    );
}

function worktreePreserve(
    before: HappyAgentWorktreeGroup,
    after: HappyAgentWorktreeGroup,
): HappyAgentWorktreeGroup {
    return preserved(before, after, () => {
        const conversations = entitiesPreserve(before.conversations, after.conversations);
        const merged = conversations === after.conversations ? after : { ...after, conversations };
        return deepEqual(before, merged) ? before : merged;
    });
}

/*
 * What each projected group was last preserved as. A projector hands back the
 * very same group until its inputs change, while the list keeps the merged or
 * earlier object it was preserved as, so without this every group a change ever
 * reached would be merged again on every later publish.
 */
const preservedAs = new WeakMap<object, object>();

function preserved<T extends object>(before: T, after: T, merge: () => T): T {
    if (before === after || preservedAs.get(after) === before) return before;
    const kept = merge();
    if (kept !== after) preservedAs.set(after, kept);
    return kept;
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
    // An entity still in its old place is matched without the index, which is
    // only built once something actually moved.
    let byId: Map<string, T> | undefined;
    let changed = previous.length !== next.length;
    const merged = next.map((entity, index) => {
        if (entity === previous[index]) return entity;
        if (byId === undefined) {
            byId = new Map<string, T>();
            for (const candidate of previous) byId.set(candidate.id, candidate);
        }
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
        kind: project.kind,
        lifecycle: happyAgentProjectLifecycleOf(project),
        conversations,
        ...(projectRefusal === undefined ? {} : { writeRefusal: projectRefusal }),
        ...(project.remoteSource === undefined ? {} : { remoteSource: project.remoteSource }),
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
        ...(project.changesStatus === undefined ? {} : { changesStatus: project.changesStatus }),
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
    left: { readonly orderKey?: string; readonly id: string },
    right: { readonly orderKey?: string; readonly id: string },
): number {
    const leftKey = left.orderKey ?? left.id;
    const rightKey = right.orderKey ?? right.id;
    if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * One group's rows in the arrangement the host records. The sessions are sorted
 * here rather than trusted in arrival order because an optimistic reorder
 * rewrites only the moved row's key: sorting on the key is what moves the row.
 */
function conversationsOf(
    sessions: readonly HappyAgentSessionSummary[] | undefined,
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
