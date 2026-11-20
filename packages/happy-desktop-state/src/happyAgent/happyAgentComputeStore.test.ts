import { afterEach, describe, expect, it, vi } from "vitest";
import { happyAgentComputeStoreCreate } from "./happyAgentComputeStore.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";

afterEach(() => vi.useRealTimers());

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

type Computer = {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly access: string;
    readonly agents: readonly unknown[];
};

/**
 * A Happy Cloud whose computer reads the test can hold, so a read sent before
 * a change can be answered after it.
 */
function cloud(computers: Computer[]) {
    let server = computers;
    const held: { readonly gate: ReturnType<typeof deferred<void>> }[] = [];
    const state = { hold: false, fail: false };
    const writes: { method: string; path: string; answer: ReturnType<typeof deferred<void>> }[] =
        [];
    const request: HappyCloudRequest = async (method, path, body) => {
        if (method !== "GET") {
            const answer = deferred<void>();
            writes.push({ method, path, answer });
            await answer.promise;
            const id = decodeURIComponent(path.split("/")[2] ?? "");
            if (method === "DELETE") {
                server = server.filter((computer) => computer.id !== id);
                return undefined;
            }
            server = server.map((computer) =>
                computer.id === id ? { ...computer, ...(body as object) } : computer,
            );
            return { computer: server.find((computer) => computer.id === id) };
        }
        if (path === "v0/permissions") return { granted: ["compute.use", "pools.manage"] };
        if (path === "v0/profile") return { profile: { userId: "reader" } };
        if (path === "v0/computers/approvals") return { approvals: [] };
        if (path === "v0/computers") {
            if (state.fail) throw new Error("offline");
            // What the server held when it was asked.
            const answer = { computers: server };
            if (!state.hold) return answer;
            const gate = deferred<void>();
            held.push({ gate });
            await gate.promise;
            return answer;
        }
        throw new Error(`Unexpected ${method} ${path}`);
    };
    return { request, held, writes, state };
}

const COMPUTERS: Computer[] = [
    { id: "c1", name: "build-01", status: "online", access: "shared", agents: [] },
    { id: "c2", name: "gpu-box", status: "online", access: "shared", agents: [] },
];

describe("compute reads sent before a change", () => {
    it("do not bring back a computer deleted while they were on their way", async () => {
        vi.useFakeTimers();
        const fake = cloud(COMPUTERS);
        const store = happyAgentComputeStoreCreate({ request: fake.request });
        const seen: string[][] = [];
        const unsubscribe = store.subscribe(() =>
            seen.push(store.get().machines.map((machine) => machine.id)),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(store.get().machines.map((machine) => machine.id)).toEqual(["c1", "c2"]);

        store.machineDeleteOpen("c1");
        store.machineDelete("c1");
        // The poll sends a read while the delete is still on its way.
        fake.state.hold = true;
        await vi.advanceTimersByTimeAsync(4_000);
        expect(fake.held).toHaveLength(1);

        fake.writes[0]!.answer.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.get().machines.map((machine) => machine.id)).toEqual(["c2"]);

        // Nothing after it corrects what the old read would put back.
        fake.state.hold = false;
        fake.state.fail = true;
        seen.length = 0;
        fake.held[0]!.gate.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.get().machines.map((machine) => machine.id)).toEqual(["c2"]);
        expect(seen.every((ids) => !ids.includes("c1"))).toBe(true);
        unsubscribe();
        store[Symbol.dispose]();
    });

    it("do not bring back a computer's old name after it was saved", async () => {
        vi.useFakeTimers();
        const fake = cloud(COMPUTERS);
        const store = happyAgentComputeStoreCreate({ request: fake.request });
        const names: string[] = [];
        const unsubscribe = store.subscribe(() => {
            const name = store.get().machines.find((machine) => machine.id === "c1")?.name;
            if (name !== undefined && names.at(-1) !== name) names.push(name);
        });
        await vi.advanceTimersByTimeAsync(0);

        store.machineDetailOpen("c1");
        store.machineNameUpdate("build-02");
        store.machineSave();
        fake.state.hold = true;
        await vi.advanceTimersByTimeAsync(4_000);
        expect(fake.held).toHaveLength(1);

        fake.writes[0]!.answer.resolve();
        await vi.advanceTimersByTimeAsync(0);
        fake.state.hold = false;
        fake.state.fail = true;
        fake.held[0]!.gate.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(names).toEqual(["build-01", "build-02"]);
        unsubscribe();
        store[Symbol.dispose]();
    });
});
