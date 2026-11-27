import { happyAgentBotSubtasks } from "./happyAgentBotSubtasks.js";
import type {
    HappyAgentProjectGroup,
    HappyAgentWorktreeGroup,
} from "./happyAgentProjectGroupProject.js";
import type { HappyAgentBot, HappyAgentTask } from "./happyAgentTypes.js";

/** One project as the sidebar lists it: the project row, then its own worktree rows. */
export interface HappyAgentSidebarProject {
    readonly project: HappyAgentProjectGroup;
    readonly worktrees: readonly HappyAgentWorktreeGroup[];
}

/**
 * One Happy Agent's part of the sidebar, in the order it is drawn: its bots,
 * then the reader's tasks, then its projects. Every surface that describes
 * "what is in the sidebar" reads this one projection — the sidebar itself and
 * voice — so the order and the filtering are decided once.
 *
 * Happy Cloud's shared bots are not among the bots: each is a destination of
 * the sidebar's first group, above Activity and Artifacts, so they are listed
 * apart. Only a bot the host says is `shared` goes there; a personal bot and
 * every bot of a Happy Agent daemon, which sends no kind, stay under Bots.
 *
 * Bots are the host's top-level roots in catalog order and tasks the reader's
 * joined tasks in the reader's own order; the subtasks of either are
 * descendants listed under them, never roots of their own. Projects keep the
 * host's arrangement, and a worktree one of those subtasks works in is listed
 * once, as that subtask under its root, so the project leaves it out.
 */
export interface HappyAgentSidebarTree {
    /** Happy Cloud's shared bots, in catalog order, for the sidebar's first group. */
    readonly sharedBots: readonly HappyAgentBot[];
    /** Every other bot, in catalog order, for the Bots section. */
    readonly bots: readonly HappyAgentBot[];
    readonly tasks: readonly HappyAgentTask[];
    readonly projects: readonly HappyAgentSidebarProject[];
}

export interface HappyAgentSidebarTreeInput {
    readonly bots: readonly HappyAgentBot[];
    /** The reader's joined tasks, already in their own order. */
    readonly tasks?: readonly HappyAgentTask[];
    readonly projects: readonly HappyAgentProjectGroup[];
}

const NO_TASKS: readonly HappyAgentTask[] = [];
const NO_BOTS: readonly HappyAgentBot[] = [];
const treeCache = new WeakMap<
    readonly HappyAgentProjectGroup[],
    WeakMap<readonly HappyAgentBot[], WeakMap<readonly HappyAgentTask[], HappyAgentSidebarTree>>
>();

/** Memoized by the three input arrays, which the list keeps stable across unrelated ticks. */
export function happyAgentSidebarTree(entry: HappyAgentSidebarTreeInput): HappyAgentSidebarTree {
    const tasks = entry.tasks ?? NO_TASKS;
    let byBots = treeCache.get(entry.projects);
    let byTasks = byBots?.get(entry.bots);
    const cached = byTasks?.get(tasks);
    if (cached) return cached;
    const subtaskWorkspaceIds = new Set(
        happyAgentBotSubtasks([...entry.bots, ...tasks]).map((task) => task.workspaceId),
    );
    const shared = entry.bots.some((bot) => bot.kind === "shared");
    const tree: HappyAgentSidebarTree = {
        sharedBots: shared ? entry.bots.filter((bot) => bot.kind === "shared") : NO_BOTS,
        bots: shared ? entry.bots.filter((bot) => bot.kind !== "shared") : entry.bots,
        tasks,
        projects: entry.projects.map((project) => ({
            project,
            worktrees:
                subtaskWorkspaceIds.size === 0
                    ? project.worktrees
                    : project.worktrees.filter((worktree) => !subtaskWorkspaceIds.has(worktree.id)),
        })),
    };
    if (!byBots) {
        byBots = new WeakMap();
        treeCache.set(entry.projects, byBots);
    }
    if (!byTasks) {
        byTasks = new WeakMap();
        byBots.set(entry.bots, byTasks);
    }
    byTasks.set(tasks, tree);
    return tree;
}

/**
 * A group's tabs in the order the workspace records. Tabs it has no position
 * for follow in the order they arrived, so one opened this instant lands at the
 * end of the strip instead of appearing somewhere in the middle of it.
 */
export function happyAgentTabsOrdered<Item extends { readonly id: string }>(
    items: readonly Item[],
    order: readonly string[],
): Item[] {
    const remaining = new Map(items.map((item) => [item.id, item]));
    const placed = order.flatMap((id) => {
        const item = remaining.get(id);
        if (!item) return [];
        remaining.delete(id);
        return [item];
    });
    return [...placed, ...remaining.values()];
}
