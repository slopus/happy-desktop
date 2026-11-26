import type {
    HappyAgentBotSubtask,
    HappyAgentTask,
    HappyAgentTaskRepositoriesSnapshot,
    HappyAgentTaskRepository,
} from "happy-desktop-state";
import type { RepositoryStackEntry } from "happy-desktop-ui";

/** What a Happy Cloud server said about the repositories tasks and agents work in. */
export type TaskRepositories = Pick<HappyAgentTaskRepositoriesSnapshot, "tasks" | "changed">;

/**
 * A task's repositories as its stack draws them: each one's photo, its name,
 * or its `owner/name` path where two in the same task are named alike, and
 * every place it is checked out. A failed checkout is not a place it is.
 */
function repositoryStackEntries(
    repositories: readonly HappyAgentTaskRepository[],
): readonly RepositoryStackEntry[] {
    return repositories.map((repository) => {
        const named = repositories.filter((entry) => entry.name === repository.name).length;
        return {
            id: repository.id,
            name: named > 1 && repository.path !== "" ? repository.path : repository.name,
            ...(repository.avatar ? { imageUrl: repository.avatar.url } : {}),
            checkouts: repository.checkouts
                .filter((checkout) => checkout.status !== "failed")
                .map((checkout) => ({
                    id: checkout.id,
                    branch: checkout.branch,
                    ...(checkout.computer ? { computer: checkout.computer.name } : {}),
                })),
        };
    });
}

/** The repositories a task's row wears; empty for a task working in none. */
export function taskRepositoryStack(
    repositories: TaskRepositories | undefined,
    task: HappyAgentTask,
): readonly RepositoryStackEntry[] {
    const listed = repositories?.tasks.get(task.id);
    return listed === undefined ? [] : repositoryStackEntries(listed);
}

/**
 * The one repository a subtask is scoped to, which its row wears; empty for a
 * subtask free to work in any. Inside a joined task the task's own listing
 * says it, with every place it is checked out. A bot's subtask, which no task
 * lists, wears the scope its agent was made with, under the name and photo the
 * repository has had since, if it changed.
 */
export function subtaskRepositoryStack(
    repositories: TaskRepositories | undefined,
    /** The repositories of the joined task this subtask is under, if it is under one. */
    taskListed: readonly HappyAgentTaskRepository[] | undefined,
    subtask: HappyAgentBotSubtask,
): readonly RepositoryStackEntry[] {
    const agentId = subtask.conversation.id;
    const listed = taskListed?.find((repository) =>
        repository.checkouts.some((checkout) => checkout.scoped && checkout.agentId === agentId),
    );
    if (listed) return repositoryStackEntries([listed]);
    const scope = subtask.scope;
    if (scope === undefined) return [];
    const changed = repositories?.changed.get(scope.repositoryId);
    // A repository deleted since leaves the subtask nothing to wear.
    if (changed === null) return [];
    const look = changed ?? scope;
    return [
        {
            id: scope.repositoryId,
            name: look.name,
            ...(look.avatar ? { imageUrl: look.avatar.url } : {}),
        },
    ];
}
