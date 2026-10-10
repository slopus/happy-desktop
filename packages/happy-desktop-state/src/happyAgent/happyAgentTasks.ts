import type { HappyAgentTask } from "./happyAgentTypes.js";

/** The first Happy Agent that serves tasks and the task routes. */
export const HAPPY_AGENT_TASKS_VERSION = "0.4.87-preview.5";

/** The first Happy Agent that creates and renames tasks. */
export const HAPPY_AGENT_TASK_CREATE_VERSION = "0.4.87-preview.6";

/**
 * The reader's own task list: the active tasks they have joined, in their own
 * order. The order is the membership's `orderKey`, compared as plain strings —
 * the host mints them for that comparison, and a locale-aware one could put
 * two keys the other way round. Equal keys fall back to the task id so the
 * order never depends on where a task happened to sit in the catalog.
 */
export function happyAgentTasksJoined(tasks: readonly HappyAgentTask[]): readonly HappyAgentTask[] {
    return tasks
        .filter((task) => task.membership !== undefined && !task.archived)
        .sort((left, right) => {
            const leftKey = left.membership!.orderKey;
            const rightKey = right.membership!.orderKey;
            if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
            return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
        });
}

/** Every active task, joined or not, oldest first: what the reader can browse and join. */
export function happyAgentTasksBrowsable(
    tasks: readonly HappyAgentTask[],
): readonly HappyAgentTask[] {
    return tasks.filter((task) => !task.archived);
}
