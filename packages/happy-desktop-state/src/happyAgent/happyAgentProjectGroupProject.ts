import type { ConversationSummary } from "../conversation/conversationSummary.js";
import { happyAgentConversationSummaryProject } from "./happyAgentConversationAuthors.js";
import {
    happyAgentProjectWriteRefusal,
    happyAgentWorktreeWriteRefusal,
} from "./happyAgentGroupAccess.js";
import { sortedPatch, sortedPatchMapped } from "../utils/sortedPatch.js";
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
 * One project's contents as a catalog source states them: the project, its
 * worktrees, and the active sessions filed under each — every session in the
 * list of the group it names — in catalog order. A source that can answer for
 * one project lets a reader project that project alone.
 */
export interface HappyAgentSessionCatalogGroup {
    readonly project: HappyAgentProject;
    readonly worktrees: readonly HappyAgentWorktree[];
    /** The project's own active sessions, subagents included. */
    readonly sessions: readonly HappyAgentSessionSummary[];
    /** Each worktree's active sessions, subagents included; a worktree with none may be absent. */
    readonly worktreeSessions: ReadonlyMap<
        HappyAgentWorktreeId,
        readonly HappyAgentSessionSummary[]
    >;
}

/** `happyAgentProjectGroupsProject` for one reader that projects the same catalog over and over. */
export interface HappyAgentProjectGroupsProjector {
    (
        catalog: HappyAgentProjectCatalog,
        sessions: readonly HappyAgentSessionSummary[],
    ): readonly HappyAgentProjectGroup[];
    /**
     * The groups of the last projection with only `projects` projected again,
     * each from its own contents as `groupOf` states them. Every other project is
     * taken to be exactly as last projected, and none to have been added,
     * removed, or moved; `undefined` says a whole projection is needed instead.
     */
    changed(
        projects: ReadonlySet<HappyAgentProjectId>,
        groupOf: (projectId: HappyAgentProjectId) => HappyAgentSessionCatalogGroup | undefined,
    ): readonly HappyAgentProjectGroup[] | undefined;
}

/**
 * The catalog source hands back the very same project, worktree and session
 * objects for everything a change did not touch, so a group whose inputs are all
 * identical to the last projection's is that projection's group, and only the
 * groups a change reached are built again. Within one, only the rows that changed
 * are moved, by binary search, in its sorted lists. A rebuilt group that turns out
 * equal to the one it replaces is the one it replaces, so a change the list does
 * not show — a timestamp the row does not carry — leaves every reference alone.
 */
export function happyAgentProjectGroupsProjectorCreate(): HappyAgentProjectGroupsProjector {
    /** One group's top-level sessions in catalog order, sorted, and drawn as rows. */
    interface Rows {
        readonly sessions: readonly HappyAgentSessionSummary[];
        readonly sorted: readonly HappyAgentSessionSummary[];
        readonly conversations: readonly ConversationSummary[];
    }
    interface WorktreeProjection extends Rows {
        readonly source: HappyAgentWorktree;
        readonly value: HappyAgentWorktreeGroup;
    }
    interface ProjectProjection extends Rows {
        readonly source: HappyAgentProject;
        /** The project's listed worktrees in catalog order, and sorted the way the list shows them. */
        readonly worktrees: readonly WorktreeProjection[];
        readonly worktreesSorted: readonly HappyAgentWorktreeGroup[];
        readonly value: HappyAgentProjectGroup;
    }
    const worktreeProjections = new Map<HappyAgentWorktreeId, WorktreeProjection>();
    const projectProjections = new Map<HappyAgentProjectId, ProjectProjection>();
    let groups: readonly HappyAgentProjectGroup[] = [];
    let groupIndex = new Map<HappyAgentProjectId, number>();

    /*
     * The flat input the last whole projection filed, kept so the next flat one can
     * be patched: the buckets its sessions went into and where each session sat,
     * and the catalog lists it projected. A projection of changed groups alone
     * leaves these behind, and the next flat one files everything again.
     */
    let bucketed: readonly HappyAgentSessionSummary[] | undefined;
    let buckets = new Map<string, HappyAgentSessionSummary[]>();
    let slots: (readonly [string, number] | undefined)[] = [];
    let projectedWorktrees: readonly HappyAgentWorktree[] | undefined;
    let projectedProjects: readonly HappyAgentProject[] | undefined;

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
        if (bucketed === undefined || sessions.length !== bucketed.length) return undefined;
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

    /**
     * A group's rows brought forward from `previous` to `sessions`, in the
     * arrangement the host records. The sessions are sorted here rather than
     * trusted in arrival order because an optimistic reorder rewrites only the
     * moved row's key: sorting on the key is what moves the row.
     */
    const rowsProject = (
        previous: Rows | undefined,
        sessions: readonly HappyAgentSessionSummary[],
    ): Rows => {
        if (previous === undefined) {
            const sorted = [...sessions].sort(byOrderKey);
            return {
                sessions,
                sorted,
                conversations: sorted.map(happyAgentConversationSummaryProject),
            };
        }
        const patched = sortedPatchMapped(
            previous.sorted,
            previous.conversations,
            previous.sessions,
            sessions,
            byOrderKey,
            happyAgentConversationSummaryProject,
        );
        return { sessions, sorted: patched.sorted, conversations: patched.mapped };
    };

    const worktreeProject = (
        worktree: HappyAgentWorktree,
        listed: readonly HappyAgentSessionSummary[],
    ): WorktreeProjection => {
        const previous = worktreeProjections.get(worktree.id);
        if (
            previous !== undefined &&
            previous.source === worktree &&
            elementsSame(previous.sessions, listed)
        )
            return previous;
        const rows = rowsProject(previous, listed);
        const value = settled(previous?.value, worktreeGroup(worktree, rows.conversations));
        return { ...rows, conversations: value.conversations, source: worktree, value };
    };

    const projectProject = (
        project: HappyAgentProject,
        worktrees: readonly WorktreeProjection[],
        listed: readonly HappyAgentSessionSummary[],
    ): ProjectProjection => {
        const previous = projectProjections.get(project.id);
        if (
            previous !== undefined &&
            previous.source === project &&
            elementsSame(previous.sessions, listed) &&
            elementsSame(previous.worktrees, worktrees)
        )
            return previous;
        const rows = rowsProject(previous, listed);
        const values = worktrees.map((worktree) => worktree.value);
        const worktreesSorted =
            previous === undefined
                ? [...values].sort(byOrderKey)
                : sortedPatch(
                      previous.worktreesSorted,
                      previous.worktrees.map((worktree) => worktree.value),
                      values,
                      byOrderKey,
                  );
        const value = settled(
            previous?.value,
            projectGroup(
                project,
                rows.conversations,
                previous !== undefined && elementsSame(previous.value.worktrees, worktreesSorted)
                    ? previous.value.worktrees
                    : worktreesSorted,
            ),
        );
        return {
            ...rows,
            conversations: value.conversations,
            source: project,
            worktrees,
            worktreesSorted: value.worktrees,
            value,
        };
    };

    const projectAll = (catalog: HappyAgentProjectCatalog): readonly HappyAgentProjectGroup[] => {
        const worktreesByProject = new Map<HappyAgentProjectId, WorktreeProjection[]>();
        const worktreesListed = new Set<HappyAgentWorktreeId>();
        for (const worktree of catalog.worktrees) {
            if (!worktreeListed(worktree)) continue;
            // A worktree is listed as soon as it exists, before anything has run in
            // it: it was created deliberately and is where the next session goes, so
            // an empty one is a destination rather than clutter.
            const projection = worktreeProject(
                worktree,
                buckets.get(worktreeKey(worktree.id)) ?? NO_SESSIONS,
            );
            worktreeProjections.set(worktree.id, projection);
            worktreesListed.add(worktree.id);
            mapAppend(worktreesByProject, worktree.projectId).push(projection);
        }
        for (const id of worktreeProjections.keys())
            if (!worktreesListed.has(id)) worktreeProjections.delete(id);

        const projectsListed = new Set<HappyAgentProjectId>();
        const next = catalog.projects.map((project) => {
            const projection = projectProject(
                project,
                worktreesByProject.get(project.id) ?? NO_WORKTREES,
                buckets.get(projectKey(project.id)) ?? NO_SESSIONS,
            );
            projectProjections.set(project.id, projection);
            projectsListed.add(project.id);
            return projection.value;
        });
        for (const id of projectProjections.keys())
            if (!projectsListed.has(id)) projectProjections.delete(id);
        next.sort(byOrderKey);
        projectedWorktrees = catalog.worktrees;
        projectedProjects = catalog.projects;
        // The list itself is the last one when it holds the same groups in the same order.
        if (elementsSame(groups, next)) return groups;
        groups = next;
        groupIndex = new Map(next.map((group, index) => [group.id, index]));
        return groups;
    };

    /** Puts `projection` in its project's place, copying the list the first time. */
    const groupReplace = (
        next: HappyAgentProjectGroup[] | undefined,
        projection: ProjectProjection,
    ): HappyAgentProjectGroup[] | undefined => {
        const previous = projectProjections.get(projection.source.id);
        projectProjections.set(projection.source.id, projection);
        if (previous?.value === projection.value) return next;
        const copy = next ?? [...groups];
        copy[groupIndex.get(projection.source.id)!] = projection.value;
        return copy;
    };

    /**
     * Projects only what changed since the last flat call: the worktrees and
     * projects whose records were replaced and the groups whose sessions were.
     * Answers `undefined` when something was added, removed, listed, unlisted, or
     * moved, because only a full projection settles a new arrangement.
     */
    const projectFlatChanged = (
        catalog: HappyAgentProjectCatalog,
        patched: ReadonlySet<string>,
    ): readonly HappyAgentProjectGroup[] | undefined => {
        const { projects, worktrees } = catalog;
        if (
            projectedWorktrees === undefined ||
            projectedProjects === undefined ||
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
        for (const worktree of worktreesDirty.values()) {
            const previous = worktreeProjections.get(worktree.id);
            if (previous === undefined) return undefined;
            const projection = worktreeProject(
                worktree,
                buckets.get(worktreeKey(worktree.id)) ?? NO_SESSIONS,
            );
            if (projection === previous) continue;
            worktreeProjections.set(worktree.id, projection);
            const project = projectProjections.get(worktree.projectId);
            if (project !== undefined && !projectsDirty.has(project.source.id))
                projectsDirty.set(project.source.id, project.source);
        }
        let next: HappyAgentProjectGroup[] | undefined;
        for (const project of projectsDirty.values()) {
            const previous = projectProjections.get(project.id);
            if (previous === undefined || !groupIndex.has(project.id)) return undefined;
            next = groupReplace(
                next,
                projectProject(
                    project,
                    previous.worktrees.map(
                        (worktree) => worktreeProjections.get(worktree.source.id) ?? worktree,
                    ),
                    buckets.get(projectKey(project.id)) ?? NO_SESSIONS,
                ),
            );
        }
        projectedWorktrees = worktrees;
        projectedProjects = projects;
        if (next !== undefined) groups = next;
        return groups;
    };

    const projector = (
        catalog: HappyAgentProjectCatalog,
        sessions: readonly HappyAgentSessionSummary[],
    ): readonly HappyAgentProjectGroup[] => {
        const patched = sessions === bucketed ? NO_KEYS : bucketsPatch(sessions);
        if (patched !== undefined) {
            const projected = projectFlatChanged(catalog, patched);
            if (projected !== undefined) return projected;
        } else bucketsFile(sessions);
        return projectAll(catalog);
    };

    projector.changed = (
        projects: ReadonlySet<HappyAgentProjectId>,
        groupOf: (projectId: HappyAgentProjectId) => HappyAgentSessionCatalogGroup | undefined,
    ): readonly HappyAgentProjectGroup[] | undefined => {
        // Whatever this changes, the flat input last filed no longer describes it.
        bucketed = undefined;
        projectedWorktrees = undefined;
        projectedProjects = undefined;
        let next: HappyAgentProjectGroup[] | undefined;
        for (const projectId of projects) {
            const group = groupOf(projectId);
            const previous = projectProjections.get(projectId);
            if (
                group === undefined ||
                previous === undefined ||
                !groupIndex.has(projectId) ||
                group.project.id !== projectId ||
                group.project.orderKey !== previous.source.orderKey
            )
                return undefined;
            const worktrees: WorktreeProjection[] = [];
            for (const worktree of group.worktrees) {
                if (!worktreeListed(worktree)) continue;
                const projection = worktreeProject(
                    worktree,
                    topLevelOf(group.worktreeSessions.get(worktree.id)),
                );
                worktreeProjections.set(worktree.id, projection);
                worktrees.push(projection);
            }
            const kept = new Set(worktrees.map((worktree) => worktree.source.id));
            // A worktree that moved to another changed project keeps that project's entry.
            for (const worktree of previous.worktrees)
                if (
                    !kept.has(worktree.source.id) &&
                    worktreeProjections.get(worktree.source.id)?.source.projectId === projectId
                )
                    worktreeProjections.delete(worktree.source.id);
            next = groupReplace(
                next,
                projectProject(
                    group.project,
                    elementsSame(previous.worktrees, worktrees) ? previous.worktrees : worktrees,
                    topLevelOf(group.sessions),
                ),
            );
        }
        if (next !== undefined) groups = next;
        return groups;
    };

    return projector;
}

const NO_KEYS: ReadonlySet<string> = new Set();
const NO_WORKTREES: readonly never[] = [];
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

/** A list's top-level sessions, the very same list each time it is asked about the same one. */
const topLevels = new WeakMap<
    readonly HappyAgentSessionSummary[],
    readonly HappyAgentSessionSummary[]
>();

function topLevelOf(
    sessions: readonly HappyAgentSessionSummary[] | undefined,
): readonly HappyAgentSessionSummary[] {
    if (sessions === undefined || sessions.length === 0) return NO_SESSIONS;
    let topLevel = topLevels.get(sessions);
    if (topLevel === undefined) {
        topLevel = sessions.some((session) => session.parentSessionId !== undefined)
            ? sessions.filter((session) => session.parentSessionId === undefined)
            : sessions;
        topLevels.set(sessions, topLevel);
    }
    return topLevel;
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
