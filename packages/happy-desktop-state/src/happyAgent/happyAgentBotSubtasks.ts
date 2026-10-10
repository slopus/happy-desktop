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
