import {
    type BotGroup,
    type HappyAgentBotSubtask,
    type GitChangeSnapshot,
    type GroupsChanges,
    type GroupSession,
    type ProjectGroup,
    type TaskGroup,
    type WorkspaceGroup,
    type HappyAgentConnection,
    type HappyAgentGitChangedFile,
    type HappyAgentPermissionMode,
    type HappyAgentBot,
    type HappyAgentBotId,
    type HappyAgentConversationSummaryInput,
    happyAgentConversationSummaryProject,
    type HappyAgentProject,
    type HappyAgentProjectAvatar,
    type HappyAgentProjectCatalog,
    type HappyAgentProjectId,
    type HappyAgentSessionCatalogChanges,
    type HappyAgentSessionCatalogGroup,
    type HappyAgentSessionCatalogSnapshot,
    type HappyAgentSessionCatalogSource,
    type HappyAgentSessionId,
    type HappyAgentSessionStatus,
    type HappyAgentSessionSummary,
    type HappyAgentTask,
    type HappyAgentTaskId,
    type HappyAgentThinkingLevel,
    type HappyAgentWorktree,
    type HappyAgentWorktreeId,
} from "happy-desktop-state";

/**
 * Projects the Happy Agent connection's live group tree into Happy's closed
 * catalog source. The connection owns bootstrap, gap recovery, and reconnects;
 * this adapter only holds the newest complete projection for synchronous reads.
 */
export function happyAgentCatalogSourceCreate(
    happyAgent: HappyAgentConnection,
    baseUrl: string,
): HappyAgentSessionCatalogSource {
    const base = baseUrl.replace(/\/$/, "");
    let snapshot: CatalogSnapshot | undefined;
    /** Set when a publish went unprojected, so the next one cannot be said to follow the last. */
    let skipped = false;
    let connection: ReturnType<HappyAgentConnection["connectGroups"]> | undefined;
    let disposed = false;
    const listeners = new Set<() => void>();
    const errorListeners = new Set<(error: unknown) => void>();
    const waiting = new Set<{
        resolve: (value: HappyAgentSessionCatalogSnapshot) => void;
        reject: (error: unknown) => void;
    }>();

    const publish = (
        projects: readonly ProjectGroup[],
        bots: readonly BotGroup[],
        tasks: readonly TaskGroup[],
        changes: GroupsChanges | undefined,
    ): void => {
        if (disposed) return;
        const previous = snapshot;
        snapshot =
            (previous !== undefined &&
                changes !== undefined &&
                !skipped &&
                catalogChanged(previous, projects, bots, tasks, changes.projects)) ||
            catalogProject(projects, bots, tasks, base);
        skipped = false;
        for (const waiter of waiting) waiter.resolve(snapshot);
        waiting.clear();
        for (const listener of listeners) listener();
    };

    const fail = (error: unknown): void => {
        if (disposed) return;
        for (const waiter of waiting) waiter.reject(error);
        waiting.clear();
        for (const listener of errorListeners) listener(error);
    };

    const start = (): void => {
        if (disposed || connection) return;
        connection = happyAgent.connectGroups({
            onChange: (projects, state, bots, tasks, changes) => {
                if (!state.sessionsComplete) {
                    skipped = true;
                    return;
                }
                publish(projects, bots, tasks, changes);
            },
            onError: fail,
        });
    };

    return {
        read() {
            if (disposed)
                return Promise.reject(new Error("The Happy Agent catalog source is disposed."));
            if (snapshot) return Promise.resolve(snapshot);
            start();
            return new Promise<HappyAgentSessionCatalogSnapshot>((resolve, reject) => {
                waiting.add({ resolve, reject });
            });
        },
        subscribe(listener, onError) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            errorListeners.add(onError);
            start();
            return () => {
                listeners.delete(listener);
                errorListeners.delete(onError);
            };
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            connection?.close();
            connection = undefined;
            const error = new Error("The Happy Agent catalog source was disposed.");
            for (const waiter of waiting) waiter.reject(error);
            waiting.clear();
            listeners.clear();
            errorListeners.clear();
        },
    };
}

/**
 * One catalog as the connection's groups state it. Bots and tasks are short and
 * listed eagerly; the projects, worktrees and flat session list are drawn from the
 * project groups the first time anyone reads them, so a publish that changed one
 * project costs that project, and readers that only look up a project by id never
 * pay for the rest.
 */
class CatalogSnapshot implements HappyAgentSessionCatalogSnapshot {
    readonly catalog: HappyAgentProjectCatalog;
    #sessions: readonly HappyAgentSessionSummary[] | undefined;

    constructor(
        /** The connection's groups this was projected from, and each one's projection. */
        readonly groupsSource: readonly ProjectGroup[],
        readonly groups: readonly GroupProjection[],
        /** Where each project sits in both lists. */
        readonly at: ReadonlyMap<string, number>,
        bots: readonly HappyAgentBot[],
        tasks: readonly HappyAgentTask[],
        readonly archivedSessions: readonly HappyAgentSessionSummary[],
        readonly changes?: HappyAgentSessionCatalogChanges,
    ) {
        let projects: readonly HappyAgentProject[] | undefined;
        let worktrees: readonly HappyAgentWorktree[] | undefined;
        this.catalog = {
            bots,
            tasks,
            get projects() {
                return (projects ??= groups.map((group) => group.project));
            },
            get worktrees() {
                return (worktrees ??= groups.flatMap((group) => group.worktrees));
            },
        };
    }

    get sessions(): readonly HappyAgentSessionSummary[] {
        if (this.#sessions === undefined) {
            const sessions: HappyAgentSessionSummary[] = [];
            for (const group of this.groups) {
                sessions.push(...group.sessions);
                for (const worktree of group.worktrees)
                    sessions.push(...(group.worktreeSessions.get(worktree.id) ?? []));
            }
            this.#sessions = sessions;
        }
        return this.#sessions;
    }

    group(projectId: HappyAgentProjectId): HappyAgentSessionCatalogGroup | undefined {
        const at = this.at.get(projectId);
        return at === undefined ? undefined : this.groups[at];
    }
}

function catalogProject(
    groups: readonly ProjectGroup[],
    botGroups: readonly BotGroup[],
    taskGroups: readonly TaskGroup[],
    baseUrl: string,
): CatalogSnapshot {
    const projected = groups.map((group) => groupProject(group, baseUrl));
    return new CatalogSnapshot(
        groups,
        projected,
        new Map(groups.map((group, at) => [group.id, at])),
        // A bot's conversation is stated on the bot and deliberately kept out of
        // the flat session list: that list is grouped under projects, and a bot
        // is not one. The chat itself is opened by id, which needs no catalog
        // entry.
        botGroups.map(botProject),
        // A task's conversation is stated on the task for the same reason a
        // bot's is, and its subtasks nest under it the same way.
        taskGroups.map(taskProject),
        archivedSessionsProject(projected),
    );
}

/**
 * `previous` brought forward to `groups`, in which only the projects in `changed`
 * were replaced, each in its own place. `undefined` when that is not what
 * happened, or when a changed project files a session somewhere other than the
 * group it names, which only a reader filing the whole list settles.
 */
function catalogChanged(
    previous: CatalogSnapshot,
    groups: readonly ProjectGroup[],
    botGroups: readonly BotGroup[],
    taskGroups: readonly TaskGroup[],
    changed: ReadonlySet<string>,
): CatalogSnapshot | undefined {
    if (groups.length !== previous.groupsSource.length) return undefined;
    const baseUrl = previous.groups[0]?.baseUrl;
    let projected: GroupProjection[] | undefined;
    let archivedSessions = previous.archivedSessions;
    const projects = new Set<HappyAgentProjectId>();
    for (const projectId of changed) {
        const at = previous.at.get(projectId);
        const group = at === undefined ? undefined : groups[at];
        if (at === undefined || group === undefined || group.id !== projectId) return undefined;
        const before = previous.groups[at]!;
        const projection = groupProject(group, baseUrl!, before);
        if (!projection.regular) return undefined;
        if (projection === before) continue;
        projected ??= [...previous.groups];
        projected[at] = projection;
        projects.add(projectId as HappyAgentProjectId);
        if (!elementsSame(before.archivedSessions, projection.archivedSessions))
            archivedSessions = archivedSessionsMerge(
                archivedSessions,
                before.archivedSessions,
                projection.archivedSessions,
                at,
            );
    }
    return new CatalogSnapshot(
        groups,
        projected ?? previous.groups,
        previous.at,
        elementsReuse(previous.catalog.bots, botGroups.map(botProject)),
        elementsReuse(previous.catalog.tasks, taskGroups.map(taskProject)),
        archivedSessions,
        { previous, projects },
    );
}

/*
 * The archived list is newest-archived first; sessions archived at the same moment
 * keep catalog order, by project and then within it. Each archived row remembers
 * the place of the project it came from, so one project's archive can be merged
 * into the list without sorting the rest again.
 */
const archivedProjectAt = new WeakMap<HappyAgentSessionSummary, number>();

function archivedCompare(left: HappyAgentSessionSummary, right: HappyAgentSessionSummary): number {
    return (right.archivedAt ?? 0) - (left.archivedAt ?? 0);
}

function archivedSessionsProject(
    groups: readonly GroupProjection[],
): readonly HappyAgentSessionSummary[] {
    const archived: HappyAgentSessionSummary[] = [];
    groups.forEach((group, at) => {
        for (const session of group.archivedSessions) {
            archivedProjectAt.set(session, at);
            archived.push(session);
        }
    });
    return archived.sort(archivedCompare);
}

/**
 * `archived` with the archive of the project at `at` changed from `before` to `after`: for each moment a row was archived
 * at that the change touched, that project's run of rows archived then is found by
 * binary search and replaced with the project's own rows for the moment, which are
 * already in catalog order. The rest of the list is copied, not visited.
 */
function archivedSessionsMerge(
    archived: readonly HappyAgentSessionSummary[],
    before: readonly HappyAgentSessionSummary[],
    after: readonly HappyAgentSessionSummary[],
    at: number,
): readonly HappyAgentSessionSummary[] {
    const moments = new Set<number>();
    const kept = new Set(after);
    for (const session of before) if (!kept.has(session)) moments.add(session.archivedAt ?? 0);
    const prior = new Set(before);
    for (const session of after) if (!prior.has(session)) moments.add(session.archivedAt ?? 0);
    const merged = [...archived];
    for (const moment of moments) {
        const run = after.filter((session) => (session.archivedAt ?? 0) === moment);
        for (const session of run) archivedProjectAt.set(session, at);
        const low = archivedBound(merged, moment, at, false);
        const high = archivedBound(merged, moment, at, true);
        merged.splice(low, high - low, ...run);
    }
    return merged;
}

/**
 * The first row of `archived` that sorts after the rows archived at `moment` in the
 * project at `at` — or, unless `past`, the first that does not sort before them.
 */
function archivedBound(
    archived: readonly HappyAgentSessionSummary[],
    moment: number,
    at: number,
    past: boolean,
): number {
    let low = 0;
    let high = archived.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        const row = archived[middle]!;
        const order = moment - (row.archivedAt ?? 0) || (archivedProjectAt.get(row) ?? 0) - at;
        if (order < 0 || (past && order === 0)) low = middle + 1;
        else high = middle;
    }
    return low;
}

function elementsSame<T>(left: readonly T[], right: readonly T[]): boolean {
    if (left === right) return true;
    if (left.length !== right.length) return false;
    for (let at = 0; at < left.length; at += 1) if (left[at] !== right[at]) return false;
    return true;
}

function elementsReuse<T>(previous: readonly T[], next: readonly T[]): readonly T[] {
    return elementsSame(previous, next) ? previous : next;
}

function subtasksProject(tasks: BotGroup["subtasks"]): readonly HappyAgentBotSubtask[] {
    return tasks.map((task) => ({
        workspaceId: task.workspaceId as HappyAgentWorktreeId,
        path: task.path,
        conversation: happyAgentConversationSummaryProject(conversationProject(task.session)),
        subtasks: subtasksProject(task.subtasks),
    }));
}

/* The connection hands back the very same bot and task groups for the ones nothing changed in. */
const botProjections = new WeakMap<BotGroup, HappyAgentBot>();
const taskProjections = new WeakMap<TaskGroup, HappyAgentTask>();

function botProject(bot: BotGroup): HappyAgentBot {
    const cached = botProjections.get(bot);
    if (cached !== undefined) return cached;
    const value: HappyAgentBot = {
        id: bot.id as HappyAgentBotId,
        workspaceId: bot.workspaceId as HappyAgentWorktreeId,
        conversation: happyAgentConversationSummaryProject(conversationProject(bot.session)),
        subtasks: subtasksProject(bot.subtasks),
        name: bot.name,
        ...(bot.shortName === undefined ? {} : { shortName: bot.shortName }),
        username: bot.username,
        ...(bot.stories === undefined ? {} : { stories: bot.stories }),
        ...(bot.systemKey === undefined ? {} : { systemKey: bot.systemKey }),
        orderKey: bot.orderKey,
        path: bot.path,
        displayPath: bot.path,
        ...(bot.avatar === undefined ? {} : { avatar: bot.avatar }),
    };
    botProjections.set(bot, value);
    return value;
}

function taskProject(task: TaskGroup): HappyAgentTask {
    const cached = taskProjections.get(task);
    if (cached !== undefined) return cached;
    const value: HappyAgentTask = {
        id: task.id as HappyAgentTaskId,
        workspaceId: task.workspaceId as HappyAgentWorktreeId,
        name: task.name,
        ...(task.shortName === undefined ? {} : { shortName: task.shortName }),
        conversation: happyAgentConversationSummaryProject(conversationProject(task.session)),
        subtasks: subtasksProject(task.subtasks),
        owner:
            task.owner === null
                ? null
                : {
                      ...(task.owner.userId === undefined ? {} : { userId: task.owner.userId }),
                      ...(task.owner.name === undefined ? {} : { name: task.owner.name }),
                      ...(task.owner.avatar === undefined ? {} : { avatar: task.owner.avatar }),
                  },
        path: task.path,
        displayPath: task.path,
        createdAt: task.createdAt,
        archived: task.archived,
        canArchive: task.canArchive,
        ...(task.membership === undefined
            ? {}
            : { membership: { orderKey: task.membership.orderKey } }),
    };
    taskProjections.set(task, value);
    return value;
}

interface GroupProjection extends HappyAgentSessionCatalogGroup {
    readonly baseUrl: string;
    readonly archivedSessions: readonly HappyAgentSessionSummary[];
    /** Whether every active session is in the list of the group it names. */
    readonly regular: boolean;
}

/*
 * The connection hands back the very same group for a project nothing changed in, so one
 * session's change re-projects only its own project here.
 */
const groupProjections = new WeakMap<ProjectGroup, GroupProjection>();

function groupProject(
    group: ProjectGroup,
    baseUrl: string,
    /** The same project's last projection, whose unchanged records are handed back. */
    previous?: GroupProjection,
): GroupProjection {
    const cached = groupProjections.get(group);
    if (cached?.baseUrl === baseUrl) return cached;
    const projectId = group.id as HappyAgentProjectId;
    const own = ownerSessionsProject(group.sessions, projectId, undefined);
    let regular = own.regular;
    const worktrees: HappyAgentWorktree[] = [];
    const worktreeSessions = new Map<HappyAgentWorktreeId, readonly HappyAgentSessionSummary[]>();
    const archivedSessions: HappyAgentSessionSummary[] = [...own.archived];
    group.workspaces.forEach((workspace, at) => {
        const before = previous?.worktrees[at];
        worktrees.push(
            worktreeProject(workspace, projectId, before?.id === workspace.id ? before : undefined),
        );
        const listed = ownerSessionsProject(
            workspace.sessions,
            projectId,
            workspace.id as HappyAgentWorktreeId,
        );
        regular &&= listed.regular;
        if (listed.active.length > 0)
            worktreeSessions.set(workspace.id as HappyAgentWorktreeId, listed.active);
        archivedSessions.push(...listed.archived);
    });
    const projection: GroupProjection = {
        baseUrl,
        project: recordReuse(previous?.project, projectProject(group, baseUrl)),
        worktrees:
            previous !== undefined && elementsSame(previous.worktrees, worktrees)
                ? previous.worktrees
                : worktrees,
        sessions: own.active,
        worktreeSessions,
        archivedSessions:
            previous !== undefined && elementsSame(previous.archivedSessions, archivedSessions)
                ? previous.archivedSessions
                : archivedSessions,
        regular,
    };
    groupProjections.set(group, projection);
    return projection;
}

interface OwnerSessions {
    readonly active: readonly HappyAgentSessionSummary[];
    readonly archived: readonly HappyAgentSessionSummary[];
    readonly regular: boolean;
}

/* A list the connection did not change is the very same list, and is split once. */
const ownerSessionsCache = new WeakMap<
    readonly GroupSession[],
    {
        readonly projectId: string;
        readonly worktreeId: string | undefined;
        readonly value: OwnerSessions;
    }
>();

/**
 * One owner's sessions split into active and archived, and whether each active
 * one names the owner it is listed under: the project itself, or the worktree.
 */
function ownerSessionsProject(
    listed: readonly GroupSession[],
    projectId: HappyAgentProjectId,
    worktreeId: HappyAgentWorktreeId | undefined,
): OwnerSessions {
    const cached = ownerSessionsCache.get(listed);
    if (cached?.projectId === projectId && cached.worktreeId === worktreeId) return cached.value;
    const active: HappyAgentSessionSummary[] = [];
    const archived: HappyAgentSessionSummary[] = [];
    let regular = true;
    for (const session of listed) {
        const summary = sessionProject(session, projectId);
        if (session.archived) archived.push(summary);
        else {
            active.push(summary);
            if (summary.worktreeId !== worktreeId) regular = false;
        }
    }
    const value: OwnerSessions = { active, archived, regular };
    ownerSessionsCache.set(listed, { projectId, worktreeId, value });
    return value;
}

/**
 * `previous` when `next` says exactly the same, field for field — one level into a
 * nested record such as an avatar, which is drawn afresh each time.
 */
function recordReuse<T extends object>(previous: T | undefined, next: T): T {
    if (previous === undefined) return next;
    const before = previous as Record<string, unknown>;
    const after = next as Record<string, unknown>;
    const keys = Object.keys(after);
    if (keys.length !== Object.keys(before).length) return next;
    for (const key of keys) {
        const left = before[key];
        const right = after[key];
        if (left === right) continue;
        if (
            typeof left !== "object" ||
            typeof right !== "object" ||
            left === null ||
            right === null ||
            Array.isArray(left) ||
            Array.isArray(right)
        )
            return next;
        const leftNested = left as Record<string, unknown>;
        const rightNested = right as Record<string, unknown>;
        const nested = Object.keys(rightNested);
        if (nested.length !== Object.keys(leftNested).length) return next;
        if (nested.some((field) => leftNested[field] !== rightNested[field])) return next;
    }
    return previous;
}

/* The connection likewise hands back the very same workspace group when nothing in it changed. */
const worktreeProjections = new WeakMap<WorkspaceGroup, HappyAgentWorktree>();

function worktreeProject(
    workspace: WorkspaceGroup,
    projectId: HappyAgentProjectId,
    previous?: HappyAgentWorktree,
): HappyAgentWorktree {
    const cached = worktreeProjections.get(workspace);
    if (cached?.projectId === projectId) return cached;
    const worktree: HappyAgentWorktree = recordReuse(previous, {
        id: workspace.id as HappyAgentWorktreeId,
        projectId,
        name: workspace.name,
        creatorAgentId: workspace.creatorAgentId,
        orderKey: workspace.orderKey,
        path: workspace.path,
        displayPath: workspace.path,
        status: workspace.status,
        presence: workspace.presence,
        // The host's own sentence about a failed checkout, carried
        // whole. It is present only while the workspace it belongs to
        // reports one, so a workspace that stops failing stops carrying
        // a reason rather than keeping the last one it had.
        ...(workspace.error === undefined ? {} : { error: workspace.error }),
        ...gitProject(workspace.git),
    });
    worktreeProjections.set(workspace, worktree);
    return worktree;
}

function projectProject(group: ProjectGroup, baseUrl: string): HappyAgentProject {
    const avatar = avatarProject(group.avatar, baseUrl);
    return {
        id: group.id as HappyAgentProjectId,
        name: group.name,
        orderKey: group.orderKey,
        path: group.path,
        displayPath: group.path,
        kind: group.kind,
        status: group.initializationStatus,
        presence: group.presence,
        ...(group.initializationError === undefined ? {} : { error: group.initializationError }),
        ...(group.remoteSource === undefined ? {} : { remoteSource: group.remoteSource }),
        ...(avatar ? { avatar } : {}),
        ...gitProject(group.git),
    };
}

function avatarProject(
    value: object | undefined,
    baseUrl: string,
): HappyAgentProjectAvatar | undefined {
    if (value === undefined) return undefined;
    const avatar = value as {
        readonly url?: unknown;
        readonly width?: unknown;
        readonly height?: unknown;
    };
    if (
        typeof avatar.url !== "string" ||
        typeof avatar.width !== "number" ||
        typeof avatar.height !== "number"
    ) {
        return undefined;
    }
    return {
        url: avatar.url.startsWith("/") ? `${baseUrl}${avatar.url}` : avatar.url,
        width: avatar.width,
        height: avatar.height,
    };
}

type GitProjection = Pick<
    HappyAgentProject,
    "changesStatus" | "changedFiles" | "addedLines" | "deletedLines" | "changes"
>;

/** A snapshot is replaced when its scan changes, so its file list is projected once. */
const gitProjections = new WeakMap<GitChangeSnapshot, GitProjection>();

function gitProject(git: GitChangeSnapshot | undefined): GitProjection {
    if (git === undefined) return { changesStatus: "loading" };
    const cached = gitProjections.get(git);
    if (cached !== undefined) return cached;
    const projection = gitProjectFresh(git);
    gitProjections.set(git, projection);
    return projection;
}

function gitProjectFresh(git: GitChangeSnapshot): GitProjection {
    if (git.comparison === "unavailable") return { changesStatus: "unavailable" };
    return {
        changesStatus: git.comparison,
        changedFiles: git.changedFiles,
        addedLines: git.insertions,
        deletedLines: git.deletions,
        changes: git.files.map((file) => ({
            path: file.path,
            ...(file.previousPath ? { previousPath: file.previousPath } : {}),
            ...(git.baseRevision === undefined ? {} : { baseRevision: git.baseRevision }),
            // A binary file has no lines to count, and saying "+0 −0" about one
            // reads as an empty change rather than as an unmeasurable one.
            ...(file.binary || file.insertions === undefined
                ? {}
                : { addedLines: file.insertions }),
            ...(file.binary || file.deletions === undefined
                ? {}
                : { deletedLines: file.deletions }),
            status: gitStatusProject(file.status),
            revision: [
                git.revision ?? `${git.generation}:${String(git.version)}`,
                git.baseRevision ?? "",
                file.path,
                file.status,
                file.staged ? "staged" : "",
                file.unstaged ? "unstaged" : "",
            ].join(":"),
        })),
    };
}

function gitStatusProject(status: string): HappyAgentGitChangedFile["status"] {
    if (status === "added") return "added";
    if (status === "deleted") return "deleted";
    if (status === "renamed" || status === "copied") return "renamed";
    if (status === "untracked") return "untracked";
    return "modified";
}

const sessionSummaryCache = new WeakMap<GroupSession, HappyAgentSessionSummary>();

function sessionProject(
    session: GroupSession,
    /**
     * The project whose list this session is being put into. It is supplied by
     * the caller rather than read off the session's own scope because only a
     * project's sessions are gathered here — a bot's one conversation is stated
     * on the bot itself and never joins this flat list.
     */
    projectId: HappyAgentProjectId,
): HappyAgentSessionSummary {
    const cached = sessionSummaryCache.get(session);
    if (cached?.projectId === projectId) return cached;
    const value: HappyAgentSessionSummary = {
        ...conversationProject(session),
        projectId,
        ...(session.scope.kind === "workspace"
            ? { worktreeId: session.scope.workspaceId as HappyAgentWorktreeId }
            : {}),
    };
    sessionSummaryCache.set(session, value);
    return value;
}

/**
 * One session as everything about it except where it is listed.
 *
 * A bot's conversation is exactly this and nothing more: it belongs to the bot
 * rather than to a project, so the placement a session summary carries is the
 * one part of the shape it cannot supply. Splitting it out is what lets a bot's
 * chat be projected by the same code that projects every other one, instead of
 * a second reading of the same fields that could drift from it.
 */
function conversationProject(session: GroupSession): HappyAgentConversationSummaryInput {
    const effort = thinkingLevel(session.effort);
    const serviceTier = session.serviceTier;
    return {
        id: session.id as HappyAgentSessionId,
        ...(session.archivedAt === undefined ? {} : { archivedAt: session.archivedAt }),
        ...(session.orderKey === undefined ? {} : { orderKey: session.orderKey }),
        ...(session.parentSessionId === undefined
            ? {}
            : { parentSessionId: session.parentSessionId as HappyAgentSessionId }),
        cwd: session.cwd,
        displayCwd: session.cwd,
        providerId: session.providerId,
        modelId: session.modelId,
        permissionMode: permissionMode(session.permissionMode),
        ...(effort ? { effort } : {}),
        ...(serviceTier ? { serviceTier } : {}),
        status: session.status as HappyAgentSessionStatus,
        activeSubagentCount: session.activeSubagents,
        ...(session.subtaskActivity === undefined
            ? {}
            : { subtaskActivity: session.subtaskActivity }),
        pendingQuestion: session.pendingQuestion,
        ...(session.wait === undefined
            ? {}
            : { wait: { startedAt: session.wait.startedAt, dueAt: session.wait.dueAt } }),
        ...(session.unread === undefined ? {} : { unreadReason: session.unread.reason }),
        ...(session.unread?.count === undefined ? {} : { unreadCount: session.unread.count }),
        ...(session.unread?.mentioned === true ? { unreadMentioned: true as const } : {}),
        ...(session.title === undefined ? {} : { title: session.title }),
        ...(session.statusLine === undefined ? {} : { statusLine: session.statusLine }),
        ...(session.draftPreview === undefined ? {} : { draftPreview: session.draftPreview }),
        ...(session.recap === undefined ? {} : { recap: session.recap }),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        ...(session.lastMessageAt === undefined ? {} : { lastMessageAt: session.lastMessageAt }),
        ...(session.lastActivityAt === undefined ? {} : { lastActivityAt: session.lastActivityAt }),
    };
}

export function permissionMode(value: string): HappyAgentPermissionMode {
    if (
        value === "auto" ||
        value === "workspace_write" ||
        value === "read_only" ||
        value === "full_access"
    ) {
        return value;
    }
    return "auto";
}

export function thinkingLevel(value: string | undefined): HappyAgentThinkingLevel | undefined {
    if (
        value === "off" ||
        value === "on" ||
        value === "minimal" ||
        value === "low" ||
        value === "medium" ||
        value === "high" ||
        value === "xhigh" ||
        value === "max" ||
        value === "ultra"
    ) {
        return value;
    }
    return undefined;
}
