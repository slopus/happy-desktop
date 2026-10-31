import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentRichTasksStoreCreate, type HappyAgentRichTasksStore } from "./richTasksStore.js";

/* The Tasks area is rich only behind both gates: the daemon's
 * `capabilities.taskSections` and the reader's `tasks.rich`. An older daemon
 * gets exactly the requests it got before, whatever the setting says. */

const opened: { connection: HappyAgentConnection; store: HappyAgentRichTasksStore }[] = [];

afterEach(() => {
    for (const { connection, store } of opened.splice(0)) {
        store[Symbol.dispose]();
        connection.close();
    }
});

const SECTION = { id: "sec_now", name: "Now", orderKey: "a0", collapsed: false };

async function daemonSeed(options: { readonly capable: boolean; readonly rich: boolean }) {
    const daemon = fakeHappyAgentDaemonCreate();
    if (options.capable) daemon.taskSectionsSet([SECTION]);
    else daemon.healthSet({ protocol: 31 });
    daemon.taskSeed({ id: "task_a", name: "Launch", joinedKey: "a1" });
    daemon.taskSeed({ id: "task_b", name: "Docs", joinedKey: "a2" });
    await daemon.client.saveUserSetting("tasks.rich", { value: options.rich });
    return daemon;
}

function open(daemon: FakeHappyAgentDaemon, subscribed: boolean) {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    const store = happyAgentRichTasksStoreCreate({ client: daemon.client, connection });
    opened.push({ connection, store });
    const unsubscribe = subscribed ? store.subscribe(() => undefined) : () => undefined;
    return { connection, store, unsubscribe };
}

const methods = (daemon: FakeHappyAgentDaemon) =>
    [...new Set(daemon.calls.map((call) => call.method))].sort();

const taskIds = (store: HappyAgentRichTasksStore) => {
    const snapshot = store.get();
    return snapshot.mode === "rich"
        ? snapshot.entries.map((entry) =>
              entry.kind === "task" ? entry.task.id : `section:${entry.section.id}`,
          )
        : snapshot.mode;
};

it("keeps a protocol-31 daemon on the classic list and sends it nothing new", async () => {
    const today = await daemonSeed({ capable: false, rich: true });
    const branch = await daemonSeed({ capable: false, rich: true });
    const classic = open(today, false);
    const rich = open(branch, true);
    await vi.waitFor(() => {
        expect(classic.connection.richTasks.get().memberships).toHaveLength(2);
        expect(rich.connection.richTasks.get().memberships).toHaveLength(2);
    });

    expect(rich.store.get()).toEqual({ mode: "classic" });
    rich.store.sectionCollapseToggle(SECTION.id);
    rich.store.childHide("task_a", { kind: "workspace", id: "ws" });
    rich.store.taskExpandToggle("task_a");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(rich.store.get()).toEqual({ mode: "classic" });
    // The same kinds of request as a window without the store: no settings read,
    // no sections, no child choice.
    expect(methods(branch)).toEqual(methods(today));
    expect(branch.callCount("getUserSettings")).toBe(0);
});

it("draws the rich list from a capable daemon once tasks.rich is true", async () => {
    const daemon = await daemonSeed({ capable: true, rich: true });
    const { store } = open(daemon, true);
    await vi.waitFor(() => expect(taskIds(store)).toEqual(["task_a", "task_b"]));

    // Sections stay out until tasks.sections is on too.
    await daemon.client.saveUserSetting("tasks.sections", { value: true });
    await vi.waitFor(() => expect(taskIds(store)).toEqual(["section:sec_now", "task_a", "task_b"]));

    store.sectionCollapseToggle(SECTION.id);
    await vi.waitFor(() => expect(taskIds(store)).toEqual(["section:sec_now"]));
    expect(daemon.calls.find((call) => call.method === "replaceTaskSections")?.args[0]).toEqual(
        expect.objectContaining({
            sections: [{ id: "sec_now", name: "Now", collapsed: true }],
        }),
    );

    store.childHide("task_a", { kind: "workspace", id: "ws_1" });
    await vi.waitFor(() => expect(daemon.callCount("setTaskChild")).toBe(1));
    expect(daemon.calls.find((call) => call.method === "setTaskChild")?.args).toEqual([
        "task_a",
        { kind: "workspace", id: "ws_1" },
        expect.objectContaining({ visibility: "hidden" }),
        expect.anything(),
    ]);
});

it("switches between the lists when user_settings.updated flips tasks.rich", async () => {
    const daemon = await daemonSeed({ capable: true, rich: false });
    const { connection, store } = open(daemon, true);
    await vi.waitFor(() => expect(connection.richTasks.get().memberships).toHaveLength(2));
    expect(store.get()).toEqual({ mode: "classic" });

    await daemon.client.saveUserSetting("tasks.rich", { value: true });
    await vi.waitFor(() => expect(taskIds(store)).toEqual(["task_a", "task_b"]));

    // Anything but JSON true is off.
    await daemon.client.saveUserSetting("tasks.rich", { value: "yes" });
    await vi.waitFor(() => expect(store.get()).toEqual({ mode: "classic" }));
});
