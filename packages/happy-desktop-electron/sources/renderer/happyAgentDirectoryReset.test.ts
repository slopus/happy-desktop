import { afterEach, expect, it, vi } from "vitest";

/** Every connection the store opened, by the Happy Agent it is for, and whether it is disposed. */
const opened = vi.hoisted(() => [] as { happyAgentId: string; disposed: boolean }[]);

// A connection that never hears from its daemon: nothing is confirmed or changed.
vi.mock("./happyAgentConnection", () => ({
    happyAgentConnectionOpen(input: { happyAgentId: string }) {
        const record = { happyAgentId: input.happyAgentId, disposed: false };
        opened.push(record);
        return {
            setup: undefined,
            sync: {
                follow: ({ signal }: { signal: AbortSignal }) => ({
                    async *[Symbol.asyncIterator]() {
                        await new Promise((resolve) => signal.addEventListener("abort", resolve));
                    },
                }),
                health: () => undefined,
            },
            get: () => undefined,
            failure: () => undefined,
            starting: () => false,
            dispose: () => {
                record.disposed = true;
            },
        };
    },
}));
import type { HappyDesktopBridge } from "../shared/desktopContract";
import {
    happyAgentDirectoryStoreCreate,
    type HappyAgentDirectoryDeps,
} from "./happyAgentDirectoryStore";
import type { DesktopRuntimeStore } from "./runtimeStore";

/*
 * Reset & reconnect on This Mac opens its connection and roster again. The
 * remotes the roster listed keep their connections even when the window's
 * storage has lost them, since the daemon has not yet said anything new.
 */

afterEach(() => vi.unstubAllGlobals());

/** Anything not given answers with a no-op, as a quiet host would. */
function quiet<T>(known: Record<PropertyKey, unknown> = {}): T {
    return new Proxy(known, {
        get: (target, key) =>
            key in target ? target[key] : () => (key === "then" ? undefined : () => undefined),
    }) as T;
}

it("leaves a remote's connection alone when This Mac is reset and storage has lost it", () => {
    const stored = new Map<string, string>([
        [
            "happy.happy-agent.connections.v1",
            JSON.stringify([{ id: "connection:team", name: "Team", remoteId: "team" }]),
        ],
    ]);
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
    });
    // Nothing answers: the daemon never lists its connections again.
    vi.stubGlobal("fetch", () => new Promise(() => undefined));

    const runtime: DesktopRuntimeStore = {
        get: () => ({
            phase: "ready",
            activeTarget: {
                id: "local",
                kind: "local",
                label: "This Mac",
                detail: "",
                mode: "local",
                authentication: "happyAgent",
                happyAgentVersion: "0.4.87",
                happyAgentHttpUrl: "http://happy-agent",
            },
            activeTargetId: "local",
            connectionId: 1,
            mode: "local",
            targets: [],
            update: { status: "idle" },
        }),
        subscribe: () => () => undefined,
    };
    const store = happyAgentDirectoryStoreCreate(quiet<HappyDesktopBridge>(), runtime, {
        cloudHostFor: () => quiet(),
        conversationOpen: () => undefined,
        groupOpen: () => undefined,
        groupForget: () => undefined,
        subtasksForget: () => undefined,
        modelPreferencePersistence: () => quiet({ read: () => undefined }),
    } as unknown as HappyAgentDirectoryDeps);
    const unsubscribe = store.subscribe(() => undefined);
    const connections = (id: string) => opened.filter((record) => record.happyAgentId === id);
    expect(connections("connection:team")).toEqual([
        { happyAgentId: "connection:team", disposed: false },
    ]);

    stored.clear();
    store.happyAgentReset!("local");

    // This Mac reconnected; Team kept its one connection and its place on the rail.
    expect(connections("local").map((record) => record.disposed)).toEqual([true, false]);
    expect(connections("connection:team")).toEqual([
        { happyAgentId: "connection:team", disposed: false },
    ]);
    expect(store.get().happyAgents.map((entry) => entry.id)).toEqual(["local", "connection:team"]);
    unsubscribe();
});
