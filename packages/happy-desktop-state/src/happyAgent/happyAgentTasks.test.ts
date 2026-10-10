import { expect, it } from "vitest";
import { happyAgentTasksBrowsable, happyAgentTasksJoined } from "./happyAgentTasks.js";
import type { HappyAgentTask, HappyAgentTaskId, HappyAgentWorktreeId } from "./happyAgentTypes.js";

const task = (
    id: string,
    options: { readonly orderKey?: string; readonly archived?: boolean } = {},
): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name: id,
    conversation: {
        id: `ses_${id}`,
        title: id,
        subtitle: "",
        updatedAt: 1,
        activity: "idle",
        participants: [],
    },
    subtasks: [],
    owner: {},
    path: `/tasks/${id}`,
    displayPath: `~/tasks/${id}`,
    createdAt: 1,
    archived: options.archived === true,
    canArchive: false,
    ...(options.orderKey === undefined ? {} : { membership: { orderKey: options.orderKey } }),
});

it("lists only the joined, active tasks, ordered by membership key as plain strings", () => {
    const tasks = [
        task("lower", { orderKey: "a0" }),
        task("upper", { orderKey: "Zz" }),
        task("not_joined"),
        task("archived", { orderKey: "A0", archived: true }),
        task("first", { orderKey: "0z" }),
        task("tie_b", { orderKey: "b" }),
        task("tie_a", { orderKey: "b" }),
    ];
    // Code-unit order: digits, then capitals, then lower case — not the
    // locale's, which would put "Zz" after "a0".
    expect(happyAgentTasksJoined(tasks).map((entry) => entry.id)).toEqual([
        "first",
        "upper",
        "lower",
        "tie_a",
        "tie_b",
    ]);
});

it("offers every active task to browse, joined or not", () => {
    const tasks = [
        task("joined", { orderKey: "a" }),
        task("open"),
        task("gone", { archived: true }),
    ];
    expect(happyAgentTasksBrowsable(tasks).map((entry) => entry.id)).toEqual(["joined", "open"]);
});
