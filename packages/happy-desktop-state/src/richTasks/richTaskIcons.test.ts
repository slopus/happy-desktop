import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentRichTasksStoreCreate } from "./richTasksStore.js";

/* A drawn card's icon is the daemon's versioned URL for its slug and hash, any
 * slug at all; no hash leaves the letter tile, and a task not drawn gets none. */

const opened: HappyAgentConnection[] = [];
afterEach(() => {
    for (const connection of opened.splice(0)) connection.close();
});

it("pictures each drawn card by its slug and hash, and no other", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSectionsSet([{ id: "sec_now", name: "Now", orderKey: "a0", collapsed: false }]);
    const hash = "b".repeat(64);
    const icon = (slug: string, withHash = true) =>
        ({ type: "library", slug, ...(withHash ? { hash } : {}) }) as const;
    daemon.taskSeed({
        id: "task_k",
        name: "Cluster",
        joinedKey: "a1",
        icon: icon("kubernetes-deployments"),
    });
    daemon.taskSeed({ id: "task_old", name: "Older", joinedKey: "a2", icon: icon("code", false) });
    daemon.taskSeed({
        id: "task_gone",
        name: "Gone",
        joinedKey: "a3",
        icon: icon("ux"),
        status: "archived",
    });
    await daemon.client.saveUserSetting("tasks.rich", { value: true });
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    opened.push(connection);
    const store = happyAgentRichTasksStoreCreate({ client: daemon.client, connection });
    store.subscribe(() => undefined);
    const iconSrcs = () => {
        const snapshot = store.get();
        return snapshot.mode === "rich"
            ? snapshot.entries.flatMap((entry) =>
                  entry.kind === "task" ? [[entry.task.id, entry.iconSrc]] : [],
              )
            : [];
    };
    await vi.waitFor(() => expect(iconSrcs()).toHaveLength(2));
    expect(iconSrcs()).toEqual([
        ["task_k", `http://happy-agent.test/v0/task-icons/kubernetes-deployments?v=${hash}`],
        ["task_old", undefined],
    ]);
});
