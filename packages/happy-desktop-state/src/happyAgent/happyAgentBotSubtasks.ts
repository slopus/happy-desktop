import type { HappyAgentBotSubtask } from "./happyAgentTypes.js";

/**
 * A conversation that delegates subtasks: a bot's, or a task's. Both carry the
 * same explicit tree, so every walk over it takes either.
 */
export interface HappyAgentSubtaskRoot {
    readonly conversation: { readonly id: string };
    readonly subtasks: readonly HappyAgentBotSubtask[];
}

/** Preorder projection of the explicit tree, for addressing and group membership. */
export function happyAgentBotSubtasks(
    roots: readonly Pick<HappyAgentSubtaskRoot, "subtasks">[],
): readonly HappyAgentBotSubtask[] {
    const result: HappyAgentBotSubtask[] = [];
    const visit = (tasks: readonly HappyAgentBotSubtask[]): void => {
        for (const task of tasks) {
            result.push(task);
            visit(task.subtasks);
        }
    };
    for (const root of roots) visit(root.subtasks);
    return result;
}

/** How deep the walk goes before giving up on a tree that never ends. */
const TASK_DEPTH_LIMIT = 32;

/**
 * How many tasks each root conversation sits below, by conversation id: a bot's
 * or task's own conversation is 0, a subtask it delegated is 1, that subtask's
 * subtask 2, and so on, following each task's place in its parent's
 * `subtasks`. A conversation reached twice keeps its first depth, and anything
 * past the limit is left out rather than counted, so a malformed tree cannot
 * loop.
 */
export function happyAgentTaskDepths(
    roots: readonly HappyAgentSubtaskRoot[],
): ReadonlyMap<string, number> {
    const depths = new Map<string, number>();
    const visit = (tasks: readonly HappyAgentBotSubtask[], depth: number): void => {
        if (depth > TASK_DEPTH_LIMIT) return;
        for (const task of tasks) {
            if (depths.has(task.conversation.id)) continue;
            depths.set(task.conversation.id, depth);
            visit(task.subtasks, depth + 1);
        }
    };
    for (const root of roots) {
        if (depths.has(root.conversation.id)) continue;
        depths.set(root.conversation.id, 0);
        visit(root.subtasks, 1);
    }
    return depths;
}

/** One conversation's part of a task tree: it and every subtask under it. */
export interface HappyAgentSubtaskTree {
    /** Its own agent first, then each subtask's in preorder. */
    readonly agentIds: readonly string[];
    /** The workspace each of them runs in, in the same order, each once. */
    readonly workspaceIds: readonly HappyAgentBotSubtask["workspaceId"][];
}

/**
 * The tree under one conversation: a root's whole tree when it is a bot's or
 * task's own conversation, or the branch under a subtask. Undefined when no
 * root names it, as for a conversation that is in no task.
 */
export function happyAgentSubtaskTree(
    roots: readonly (HappyAgentSubtaskRoot & {
        readonly workspaceId: HappyAgentBotSubtask["workspaceId"];
    })[],
    conversationId: string,
): HappyAgentSubtaskTree | undefined {
    type Node = HappyAgentSubtaskRoot & {
        readonly workspaceId: HappyAgentBotSubtask["workspaceId"];
    };
    const collect = (node: Node): HappyAgentSubtaskTree => {
        const agentIds: string[] = [];
        const workspaceIds = new Set<HappyAgentBotSubtask["workspaceId"]>();
        const visit = (entry: Node, depth: number): void => {
            if (depth > TASK_DEPTH_LIMIT) return;
            agentIds.push(entry.conversation.id);
            workspaceIds.add(entry.workspaceId);
            for (const child of entry.subtasks) visit(child, depth + 1);
        };
        visit(node, 0);
        return { agentIds, workspaceIds: [...workspaceIds] };
    };
    const find = (
        tasks: readonly HappyAgentBotSubtask[],
        depth: number,
    ): HappyAgentBotSubtask | undefined => {
        if (depth > TASK_DEPTH_LIMIT) return undefined;
        for (const task of tasks) {
            if (task.conversation.id === conversationId) return task;
            const found = find(task.subtasks, depth + 1);
            if (found) return found;
        }
        return undefined;
    };
    for (const root of roots) {
        if (root.conversation.id === conversationId) return collect(root);
        const found = find(root.subtasks, 1);
        if (found) return collect(found);
    }
    return undefined;
}
