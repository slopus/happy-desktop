import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { happyAgentRichTasksStoreCreate } from "../richTasks/richTasksStore.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";

/* A card's icon is read by slug and hash, once per hash, only for cards on
 * screen; no hash, or an unreadable icon, leaves the card its letter tile. */

const opened: HappyAgentConnection[] = [];
afterEach(() => {
    for (const connection of opened.splice(0)) connection.close();
});

const UX = "a".repeat(64);
const KUBERNETES = "b".repeat(64);
const GONE = "c".repeat(64);

it("reads each hash once, for any slug, and only for the cards drawn", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSectionsSet([{ id: "sec_now", name: "Now", orderKey: "a0", collapsed: false }]);
    const icon = (slug: string, hash?: string) => ({ type: "library" as const, slug, hash });
    daemon.taskSeed({ id: "task_a", name: "Launch", joinedKey: "a1", icon: icon("ux", UX) });
    daemon.taskSeed({ id: "task_b", name: "Polish", joinedKey: "a2", icon: icon("ux", UX) });
    daemon.taskSeed({
        id: "task_k",
        name: "Cluster",
        joinedKey: "a3",
        icon: icon("kubernetes-deployments", KUBERNETES),
    });
    daemon.taskSeed({ id: "task_old", name: "Older", joinedKey: "a4", icon: icon("code") });
    daemon.taskSeed({ id: "task_gone", name: "Gone", joinedKey: "a5", icon: icon("x", GONE) });
    await daemon.client.saveUserSetting("tasks.rich", { value: true });
    const requests: { url: string; authorization: string | null }[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
        return url.includes(GONE)
            ? new Response(null, { status: 404 })
            : new Response(new Blob([url], { type: "image/webp" }));
    });
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        fetch,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    opened.push(connection);
    const store = happyAgentRichTasksStoreCreate({ client: daemon.client, connection });
    // Nothing is read for a list nobody draws.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toEqual([]);

    store.subscribe(() => undefined);
    const iconSrcs = () => {
        const snapshot = store.get();
        return snapshot.mode === "rich"
            ? Object.fromEntries(
                  snapshot.entries.flatMap((entry) =>
                      entry.kind === "task" ? [[entry.task.id, entry.iconSrc]] : [],
                  ),
              )
            : {};
    };
    await vi.waitFor(() => {
        expect(iconSrcs().task_a).toMatch(/^blob:/u);
        expect(iconSrcs().task_k).toMatch(/^blob:/u);
        expect(requests).toHaveLength(3);
    });
    const srcs = iconSrcs();
    expect(srcs.task_b).toBe(srcs.task_a);
    expect(srcs.task_old).toBeUndefined();
    expect(srcs.task_gone).toBeUndefined();
    expect(requests.map(({ url }) => url).sort()).toEqual([
        `http://happy-agent.test/v0/task-icons/kubernetes-deployments?v=${KUBERNETES}`,
        `http://happy-agent.test/v0/task-icons/ux?v=${UX}`,
        `http://happy-agent.test/v0/task-icons/x?v=${GONE}`,
    ]);
    expect(requests.every(({ authorization }) => authorization === "Bearer token")).toBe(true);
    // Later changes to the list ask for nothing already asked for, the failed one included.
    store.taskExpandToggle("task_a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toHaveLength(3);
});
