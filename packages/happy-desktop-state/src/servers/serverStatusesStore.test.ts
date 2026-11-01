import { HappyAgentApiError, type ConnectionStatus } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import { serverStatusesStoreCreate } from "./serverStatusesStore.js";

function syncScript() {
    const queue: HappyAgentSyncInput[] = [];
    let wake: (() => void) | undefined;
    const sync: HappyAgentSync = {
        async *follow({ signal }) {
            while (!signal.aborted) {
                const next = queue.shift();
                if (next) {
                    yield next;
                    continue;
                }
                await new Promise<void>((resume) => {
                    wake = resume;
                    signal.addEventListener("abort", () => resume(), { once: true });
                });
            }
        },
        health: () => undefined,
    };
    return {
        sync,
        push(input: HappyAgentSyncInput) {
            queue.push(input);
            wake?.();
        },
        event(payload: ConnectionStatus) {
            this.push({
                kind: "update",
                update: {
                    kind: "event",
                    event: { type: "connections.status.updated", payload },
                } as never,
            });
        },
    };
}

const ready: ConnectionStatus = { id: "team", status: "ready", updatedAt: 10 };

it("reads every status, then follows each one's changes, keeping the newer", async () => {
    const stream = syncScript();
    const listConnectionStatuses = vi.fn(async () => ({ statuses: [ready] }));
    const store = serverStatusesStoreCreate({ listConnectionStatuses } as never, stream.sync);
    const leave = store.subscribe(() => undefined);
    stream.push({ kind: "reconcile" } as HappyAgentSyncInput);
    await vi.waitFor(() => expect(store.get().statuses.get("team")).toEqual(ready));
    stream.event({ id: "team", status: "needs_sign_in", message: "Sign in again.", updatedAt: 20 });
    await vi.waitFor(() => expect(store.get().statuses.get("team")?.status).toBe("needs_sign_in"));
    // An event older than what is held does not undo it.
    stream.event({ id: "team", status: "ready", updatedAt: 15 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.get().statuses.get("team")?.status).toBe("needs_sign_in");
    leave();
    store[Symbol.dispose]();
});

it("has no statuses on a daemon that predates server connections", async () => {
    const stream = syncScript();
    const listConnectionStatuses = vi.fn(async () => {
        throw new HappyAgentApiError(404, "Not found", "not_found", null);
    });
    const store = serverStatusesStoreCreate({ listConnectionStatuses } as never, stream.sync);
    const leave = store.subscribe(() => undefined);
    stream.push({ kind: "reconcile" } as HappyAgentSyncInput);
    await vi.waitFor(() => expect(listConnectionStatuses).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.get().statuses.size).toBe(0);
    expect(listConnectionStatuses).toHaveBeenCalledTimes(1);
    leave();
    store[Symbol.dispose]();
});
