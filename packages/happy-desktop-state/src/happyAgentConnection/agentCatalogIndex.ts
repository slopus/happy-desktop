import type { Agent, Bot, Project, Task, Workspace } from "@slopus/happy-agent-client";
import { agentTreeFind, agentTreeUpdate } from "./agentSubtasks.js";
import { replaceResource } from "./projection.js";

/** The owners whose trees carry agents, in the order an agent is looked up across them. */
export interface AgentCatalog {
    readonly bots: readonly Bot[];
    readonly tasks: readonly Task[];
    readonly workspaces: readonly Workspace[];
    readonly projects: readonly Project[];
}

/**
 * Where every agent of one catalog lives.
 *
 * An owner is named by its rank: its position in the lookup order bots, tasks, workspaces,
 * projects. An agent is found as the first owner in that order holds it, exactly as a walk of
 * every tree would find it, without walking them.
 */
export interface AgentCatalogIndex {
    readonly catalog: AgentCatalog;
    readonly found: ReadonlyMap<string, { readonly agent: Agent; readonly rank: number }>;
    /** The rank of every owner whose tree holds each agent. */
    readonly holders: ReadonlyMap<string, ReadonlySet<number>>;
    readonly botAt: ReadonlyMap<string, number>;
    readonly taskAt: ReadonlyMap<string, number>;
    readonly workspaceAt: ReadonlyMap<string, number>;
    readonly projectAt: ReadonlyMap<string, number>;
}

interface IndexWritable {
    catalog: AgentCatalog;
    readonly found: Map<string, { readonly agent: Agent; readonly rank: number }>;
    readonly holders: Map<string, Set<number>>;
    readonly botAt: Map<string, number>;
    readonly taskAt: Map<string, number>;
    readonly workspaceAt: Map<string, number>;
    readonly projectAt: Map<string, number>;
}

/** The agents an owner of a rank holds at the top of its trees. */
function rootsAt(catalog: AgentCatalog, rank: number): readonly Agent[] {
    const { bots, tasks, workspaces, projects } = catalog;
    if (rank < bots.length) return [bots[rank]!.agent];
    rank -= bots.length;
    if (rank < tasks.length) return [tasks[rank]!.agent];
    rank -= tasks.length;
    if (rank < workspaces.length) return workspaces[rank]!.agents;
    return projects[rank - workspaces.length]!.agents;
}

function ownerCount(catalog: AgentCatalog): number {
    return (
        catalog.bots.length +
        catalog.tasks.length +
        catalog.workspaces.length +
        catalog.projects.length
    );
}

function treesAdd(index: IndexWritable, roots: readonly Agent[], rank: number): void {
    const visit = (agent: Agent): void => {
        let holders = index.holders.get(agent.id);
        if (holders === undefined) index.holders.set(agent.id, (holders = new Set()));
        holders.add(rank);
        const known = index.found.get(agent.id);
        // The first copy in lookup order wins, and within one owner the first in its walk.
        if (known === undefined || known.rank > rank) index.found.set(agent.id, { agent, rank });
        for (const child of agent.subtasks ?? []) visit(child);
    };
    for (const root of roots) visit(root);
}

function treesRemove(
    index: IndexWritable,
    roots: readonly Agent[],
    rank: number,
    lost: Set<string>,
): void {
    const visit = (agent: Agent): void => {
        const holders = index.holders.get(agent.id);
        holders?.delete(rank);
        if (holders?.size === 0) index.holders.delete(agent.id);
        if (index.found.get(agent.id)?.rank === rank) {
            index.found.delete(agent.id);
            lost.add(agent.id);
        }
        for (const child of agent.subtasks ?? []) visit(child);
    };
    for (const root of roots) visit(root);
}

function positionsOf(owners: readonly { readonly id: string }[]): Map<string, number> {
    const positions = new Map<string, number>();
    owners.forEach((owner, position) => {
        if (!positions.has(owner.id)) positions.set(owner.id, position);
    });
    return positions;
}

function indexBuild(catalog: AgentCatalog): IndexWritable {
    const index: IndexWritable = {
        catalog,
        found: new Map(),
        holders: new Map(),
        botAt: positionsOf(catalog.bots),
        taskAt: positionsOf(catalog.tasks),
        workspaceAt: positionsOf(catalog.workspaces),
        projectAt: positionsOf(catalog.projects),
    };
    const owners = ownerCount(catalog);
    for (let rank = 0; rank < owners; rank += 1) treesAdd(index, rootsAt(catalog, rank), rank);
    return index;
}

/** Whether two owners at the same rank carry the very same trees. */
function sameTrees(previous: AgentCatalog, next: AgentCatalog, rank: number): boolean {
    if (rank < next.bots.length) return previous.bots[rank]!.agent === next.bots[rank]!.agent;
    rank -= next.bots.length;
    if (rank < next.tasks.length) return previous.tasks[rank]!.agent === next.tasks[rank]!.agent;
    rank -= next.tasks.length;
    if (rank < next.workspaces.length)
        return previous.workspaces[rank]!.agents === next.workspaces[rank]!.agents;
    rank -= next.workspaces.length;
    return previous.projects[rank]!.agents === next.projects[rank]!.agents;
}

/**
 * Moves the index across one owner's trees that kept their shape — the same agents in the
 * same places, some of them replaced — visiting only the replaced ones, which a stored
 * version leaves as the path down to it. `false` when the shape changed, leaving the
 * owner's entries for a walk of the whole trees to settle.
 */
function treesPatch(
    index: IndexWritable,
    before: readonly Agent[],
    after: readonly Agent[],
    rank: number,
): boolean {
    if (before === after) return true;
    if (before.length !== after.length) return false;
    for (let at = 0; at < after.length; at += 1) {
        const previous = before[at]!;
        const agent = after[at]!;
        if (previous === agent) continue;
        if (previous.id !== agent.id) return false;
        // Only the copy the index found is replaced; a copy earlier in the walk keeps it.
        const known = index.found.get(agent.id);
        if (known?.rank === rank && known.agent === previous)
            index.found.set(agent.id, { agent, rank });
        if (!treesPatch(index, previous.subtasks ?? NO_AGENTS, agent.subtasks ?? NO_AGENTS, rank))
            return false;
    }
    return true;
}

const NO_AGENTS: readonly Agent[] = [];

/** Moves `index` onto `catalog`, whose owners differ from its own only at `changed` ranks. */
function indexAdvance(
    index: IndexWritable,
    catalog: AgentCatalog,
    changed: readonly number[],
): void {
    const before = index.catalog;
    const reshaped = changed.filter(
        (rank) => !treesPatch(index, rootsAt(before, rank), rootsAt(catalog, rank), rank),
    );
    const lost = new Set<string>();
    for (const rank of reshaped) treesRemove(index, rootsAt(before, rank), rank, lost);
    for (const rank of reshaped) treesAdd(index, rootsAt(catalog, rank), rank);
    for (const id of lost) {
        const holders = index.holders.get(id);
        if (holders === undefined) continue;
        // Still held by an owner whose trees were not walked again, which may come
        // before the one a walk found it in.
        let rank = Infinity;
        for (const holder of holders) rank = Math.min(rank, holder);
        if ((index.found.get(id)?.rank ?? Infinity) <= rank) continue;
        for (const root of rootsAt(catalog, rank)) {
            const agent = agentTreeFind(root, id);
            if (agent === undefined) continue;
            index.found.set(id, { agent, rank });
            break;
        }
    }
    index.catalog = catalog;
}

/**
 * The index of `catalog`, brought forward from `previous` when it can be.
 *
 * Replacing owners in place, which is how one agent's version reaches every copy of it, keeps
 * every rank where it was: only the owners whose trees changed are walked again, and the rest
 * are settled with one comparison each. A catalog whose owners were added, removed, or
 * reordered is indexed again from scratch.
 */
export function agentCatalogIndexed(
    previous: AgentCatalogIndex | undefined,
    catalog: AgentCatalog,
): AgentCatalogIndex {
    if (previous === undefined) return indexBuild(catalog);
    const before = previous.catalog;
    if (
        before.bots === catalog.bots &&
        before.tasks === catalog.tasks &&
        before.workspaces === catalog.workspaces &&
        before.projects === catalog.projects
    )
        return previous;
    if (
        before.bots.length !== catalog.bots.length ||
        before.tasks.length !== catalog.tasks.length ||
        before.workspaces.length !== catalog.workspaces.length ||
        before.projects.length !== catalog.projects.length
    )
        return indexBuild(catalog);
    const ownerIdsSame = <T extends { readonly id: string }>(
        left: readonly T[],
        right: readonly T[],
    ): boolean => left === right || left.every((owner, at) => owner.id === right[at]!.id);
    if (
        !ownerIdsSame(before.bots, catalog.bots) ||
        !ownerIdsSame(before.tasks, catalog.tasks) ||
        !ownerIdsSame(before.workspaces, catalog.workspaces) ||
        !ownerIdsSame(before.projects, catalog.projects)
    )
        return indexBuild(catalog);
    const changed: number[] = [];
    const owners = ownerCount(catalog);
    for (let rank = 0; rank < owners; rank += 1)
        if (!sameTrees(before, catalog, rank)) changed.push(rank);
    indexAdvance(previous as IndexWritable, catalog, changed);
    return previous;
}

/** Replaces an owner's copy of `agent`, listing it among the owner's own when it works there. */
export function ownerAgentReplace<Owner extends { readonly id: string; readonly agents: Agent[] }>(
    owner: Owner,
    agent: Agent,
): Owner {
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
}

/**
 * Stores one agent version everywhere it belongs: in every tree that holds it, under every
 * copy of its parent, and among the agents of the workspace it works in.
 *
 * Only those owners can change, and the index names them, so storing a version costs the
 * owners involved rather than the whole catalog. The index is moved onto the catalog it
 * returns, which is the same catalog when no owner changed.
 */
export function agentCatalogStore(
    index: AgentCatalogIndex,
    agent: Agent,
    /** Told the project of every workspace and project replaced. */
    projectReplaced?: (projectId: string) => void,
): AgentCatalog {
    const { catalog } = index;
    const ranks = new Set<number>(index.holders.get(agent.id));
    if (agent.parentAgentId !== null)
        for (const rank of index.holders.get(agent.parentAgentId) ?? []) ranks.add(rank);
    const taskBase = catalog.bots.length;
    const workspaceBase = taskBase + catalog.tasks.length;
    const projectBase = workspaceBase + catalog.workspaces.length;
    const workspaceAt = index.workspaceAt.get(agent.workspaceId);
    if (workspaceAt !== undefined) ranks.add(workspaceBase + workspaceAt);
    const projectAt = index.projectAt.get(agent.workspaceId);
    if (projectAt !== undefined) ranks.add(projectBase + projectAt);

    let bots = catalog.bots;
    let tasks = catalog.tasks;
    let workspaces = catalog.workspaces;
    let projects = catalog.projects;
    const changed: number[] = [];
    const ownersReplace = <T>(
        owners: readonly T[],
        original: readonly T[],
        at: number,
        next: T,
    ) => {
        const copy = owners === original ? [...owners] : (owners as T[]);
        copy[at] = next;
        return copy;
    };
    for (const rank of ranks) {
        if (rank < workspaceBase) {
            // A bot's or task's row is drawn from the agent embedded in it, so
            // the same versioned agent event has to reach that copy too —
            // otherwise the row keeps reporting the status it was created with.
            if (rank < taskBase) {
                const bot = bots[rank]!;
                const next = agentTreeUpdate(bot.agent, agent);
                if (next === bot.agent) continue;
                bots = ownersReplace(bots, catalog.bots, rank, { ...bot, agent: next });
            } else {
                const at = rank - taskBase;
                const task = tasks[at]!;
                const next = agentTreeUpdate(task.agent, agent);
                if (next === task.agent) continue;
                tasks = ownersReplace(tasks, catalog.tasks, at, { ...task, agent: next });
            }
        } else if (rank < projectBase) {
            const at = rank - workspaceBase;
            const workspace = workspaces[at]!;
            const next = ownerAgentReplace(workspace, agent);
            if (next === workspace) continue;
            workspaces = ownersReplace(workspaces, catalog.workspaces, at, next);
            if (next.projectId !== null) projectReplaced?.(next.projectId);
        } else {
            const at = rank - projectBase;
            const project = projects[at]!;
            const next = ownerAgentReplace(project, agent);
            if (next === project) continue;
            projects = ownersReplace(projects, catalog.projects, at, next);
            projectReplaced?.(next.id);
        }
        changed.push(rank);
    }
    if (changed.length === 0) return catalog;
    const stored = { bots, tasks, workspaces, projects };
    indexAdvance(index as IndexWritable, stored, changed);
    return stored;
}

/** The owners of a catalog by kind. */
export interface AgentCatalogOwners {
    readonly bot: Bot;
    readonly task: Task;
    readonly workspace: Workspace;
    readonly project: Project;
}

/**
 * The index's catalog with the owner of `kind` and `id` replaced in its place by `update` of
 * it, and the index moved onto that catalog; the same catalog when `update` returns the owner
 * it was given. `undefined` when the catalog holds no such owner or `update` renames it.
 *
 * Only that owner's trees are visited, and not at all when it keeps its agents, so storing a
 * record costs the record rather than the catalog.
 */
export function agentCatalogOwnerUpdate<Kind extends keyof AgentCatalogOwners>(
    index: AgentCatalogIndex,
    kind: Kind,
    id: string,
    update: (current: AgentCatalogOwners[Kind]) => AgentCatalogOwners[Kind],
):
    | {
          readonly catalog: AgentCatalog;
          readonly previous: AgentCatalogOwners[Kind];
          readonly next: AgentCatalogOwners[Kind];
      }
    | undefined {
    const { catalog } = index;
    const list = catalog[OWNER_LISTS[kind]] as readonly AgentCatalogOwners[Kind][];
    const at =
        kind === "workspace"
            ? index.workspaceAt.get(id)
            : kind === "project"
              ? index.projectAt.get(id)
              : kind === "bot"
                ? index.botAt.get(id)
                : index.taskAt.get(id);
    if (at === undefined) return undefined;
    const previous = list[at]!;
    const next = update(previous);
    if (next === previous) return { catalog, previous, next };
    if (next.id !== id) return undefined;
    const owners = [...list];
    owners[at] = next;
    const stored: AgentCatalog = { ...catalog, [OWNER_LISTS[kind]]: owners };
    const base =
        kind === "bot"
            ? 0
            : kind === "task"
              ? catalog.bots.length
              : kind === "workspace"
                ? catalog.bots.length + catalog.tasks.length
                : catalog.bots.length + catalog.tasks.length + catalog.workspaces.length;
    indexAdvance(index as IndexWritable, stored, [base + at]);
    return { catalog: stored, previous, next };
}

const OWNER_LISTS = {
    bot: "bots",
    task: "tasks",
    workspace: "workspaces",
    project: "projects",
} as const satisfies Record<keyof AgentCatalogOwners, keyof AgentCatalog>;

/** Names the project of every workspace and project whose trees hold `agentId`. */
export function agentHolderProjects(
    index: AgentCatalogIndex,
    agentId: string,
    add: (projectId: string) => void,
): void {
    const { bots, tasks, workspaces, projects } = index.catalog;
    const workspaceBase = bots.length + tasks.length;
    const projectBase = workspaceBase + workspaces.length;
    for (const rank of index.holders.get(agentId) ?? []) {
        if (rank < workspaceBase) continue;
        if (rank < projectBase) {
            const projectId = workspaces[rank - workspaceBase]!.projectId;
            if (projectId !== null) add(projectId);
        } else add(projects[rank - projectBase]!.id);
    }
}
