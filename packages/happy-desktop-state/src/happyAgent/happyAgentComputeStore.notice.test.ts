import { expect, it } from "vitest";
import { happyAgentComputeStoreCreate } from "./happyAgentComputeStore.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it("does not keep a deletion's notice for a later visit", async () => {
    let computers = [
        { id: "c1", name: "build-01", status: "online", access: "shared", agents: [] },
        { id: "c2", name: "gpu-box", status: "online", access: "shared", agents: [] },
    ];
    const request: HappyCloudRequest = async (method, path) => {
        if (method === "DELETE") {
            computers = computers.filter((computer) => computer.id !== "c1");
            throw new HappyCloudRequestRefusal("Computer not found", "not_found", 404, {
                error: "Computer not found",
            });
        }
        if (path === "v0/permissions") return { granted: ["compute.use", "pools.manage"] };
        if (path === "v0/profile") return { profile: { userId: "reader" } };
        if (path === "v0/computers") return { computers };
        if (path === "v0/computers/approvals") return { approvals: [] };
        throw new Error(`Unexpected ${method} ${path}`);
    };
    const store = happyAgentComputeStoreCreate({ request });
    let unsubscribe = store.subscribe(() => undefined);
    await flush();
    store.machineDeleteOpen("c1");
    store.machineDelete("c1");
    await flush();
    await flush();
    // Told while the reader is on the page, through the reads that follow.
    expect(store.get().actionNotice).toBe("build-01 was already deleted.");
    expect(store.get().machines.map((machine) => machine.id)).toEqual(["c2"]);

    // The reader leaves Settings › Compute and comes back later.
    unsubscribe();
    unsubscribe = store.subscribe(() => undefined);
    await flush();
    await flush();
    expect(store.get().loading).toBe(false);
    expect(store.get().actionNotice).toBeUndefined();
    unsubscribe();
    store[Symbol.dispose]();
});
