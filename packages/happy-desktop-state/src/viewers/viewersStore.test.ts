import {
    HappyAgentApiError,
    type HappyAgentUpdate,
    type PutViewersRequest,
    type PutViewersResponse,
    type Viewer,
} from "@slopus/happy-agent-client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentViewersCreate, type HappyAgentViewersActivity } from "./viewersStore.js";

const MINUTE = 60_000;
const START = 1_700_000_000_000;

interface Call {
    readonly streamId: string;
    readonly targets: PutViewersRequest["targets"];
}

/** One connection's stream, fed by the test. */
function streamCreate() {
    const queue: HappyAgentSyncInput[] = [];
    let wake: (() => void) | undefined;
    const sync: HappyAgentSync = {
        async *follow({ signal }) {
            while (!signal.aborted) {
                const next = queue.shift();
                if (next) yield next;
                else await new Promise<void>((resolve) => (wake = resolve));
            }
        },
        health: () => undefined,
    };
    const push = (update: HappyAgentUpdate): void => {
        queue.push({ kind: "update", update });
        wake?.();
    };
    return {
        sync,
        connected: (streamId: string) => push({ kind: "connected", cursor: "0", streamId }),
        frame: (id: string, viewer: Viewer) =>
            push({ kind: "viewers", frame: { target: { type: "surface", id }, viewer } }),
    };
}

/** A server that answers each PUT with whatever the test says is there. */
function serverCreate() {
    const calls: Call[] = [];
    const there = new Map<string, Viewer[]>();
    let refuse = false;
    return {
        calls,
        there,
        refuse: (value: boolean) => (refuse = value),
        client: {
            endpoint: "http://happy-agent.test/",
            getUsers: async () => ({ users: [] }),
            putViewers: async (
                streamId: string,
                request: PutViewersRequest,
            ): Promise<PutViewersResponse> => {
                calls.push({ streamId, targets: request.targets });
                if (refuse) throw new HappyAgentApiError(404, "Not found", "not_found", null);
                return {
                    targets: request.targets.map((target) => ({
                        target,
                        viewers: there.get(target.id) ?? [],
                    })),
                };
            },
        } as never,
    };
}

const team = () => ({
    viewerId: "me",
    members: [
        { id: "me", name: "Me" },
        { id: "anna", name: "Anna", imageUrl: "http://happy-agent.test/anna.png" },
        { id: "kirill", name: "Kirill" },
    ],
});

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
});

afterEach(() => {
    vi.useRealTimers();
});

const settle = () => vi.advanceTimersByTimeAsync(0);

it("says what is on screen, and shows who else is there by name", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    server.there.set("doc", [
        { userId: "anna", here: true, lastSeenAt: START },
        { userId: "kirill", here: false, lastSeenAt: START - 4 * MINUTE },
    ]);
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    const doc = viewers.target({ type: "surface", id: "doc" });
    doc.subscribe(() => undefined);
    stream.connected("stream-1");
    await settle();

    expect(server.calls).toEqual([
        { streamId: "stream-1", targets: [{ type: "surface", id: "doc" }] },
    ]);
    expect(doc.get()).toEqual({
        status: "available",
        now: START,
        viewers: [
            {
                userId: "anna",
                name: "Anna",
                imageUrl: "http://happy-agent.test/anna.png",
                tier: "here",
                lastSeenAt: START,
                arrived: false,
            },
            {
                userId: "kirill",
                name: "Kirill",
                tier: "recent",
                lastSeenAt: START - 4 * MINUTE,
                arrived: false,
            },
        ],
    });
    viewers[Symbol.dispose]();
});

it("shows an arrival from a frame, and renews every 15 seconds until it leaves the screen", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    const doc = viewers.target({ type: "surface", id: "doc" });
    const release = doc.subscribe(() => undefined);
    stream.connected("stream-1");
    await settle();

    stream.frame("doc", { userId: "kirill", here: true, lastSeenAt: START });
    await settle();
    const after = doc.get();
    expect(after.status === "available" && after.viewers.map((v) => [v.name, v.arrived])).toEqual([
        ["Kirill", true],
    ]);

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(server.calls.length).toBe(3);

    release();
    await settle();
    expect(server.calls.at(-1)).toEqual({ streamId: "stream-1", targets: [] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.calls.length).toBe(4);
    viewers[Symbol.dispose]();
});

it("sends one request for a navigation, and never leaves a view shown again at once", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    server.there.set("doc", [{ userId: "anna", here: true, lastSeenAt: START }]);
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    const doc = viewers.target({ type: "surface", id: "doc" });
    const session = viewers.target({ type: "agent", id: "session" });
    const releaseDoc = doc.subscribe(() => undefined);
    stream.connected("stream-1");
    await settle();
    const before = doc.get();

    // A remount: hidden and shown again in one task.
    releaseDoc();
    const releaseAgain = doc.subscribe(() => undefined);
    await settle();
    expect(server.calls.length).toBe(1);
    expect(doc.get()).toBe(before);

    // A navigation: the document goes, the session comes, in one task.
    releaseAgain();
    session.subscribe(() => undefined);
    await settle();
    expect(server.calls.map((call) => call.targets)).toEqual([
        [{ type: "surface", id: "doc" }],
        [{ type: "agent", id: "session" }],
    ]);
    viewers[Symbol.dispose]();
});

it("views nothing while the person is away from the window", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    let active = true;
    const listeners = new Set<() => void>();
    const activity: HappyAgentViewersActivity = {
        active: () => active,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    const viewers = happyAgentViewersCreate({
        client: server.client,
        sync: stream.sync,
        team,
        activity,
    });
    viewers.target({ type: "agent", id: "session" }).subscribe(() => undefined);
    stream.connected("stream-1");
    await settle();

    active = false;
    for (const listener of listeners) listener();
    await settle();
    active = true;
    for (const listener of listeners) listener();
    await settle();

    expect(server.calls.map((call) => call.targets)).toEqual([
        [{ type: "agent", id: "session" }],
        [],
        [{ type: "agent", id: "session" }],
    ]);
    viewers[Symbol.dispose]();
});

it("hides after a 404 and asks again only on the next stream", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    server.refuse(true);
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    const doc = viewers.target({ type: "surface", id: "doc" });
    doc.subscribe(() => undefined);
    stream.connected("stream-1");
    await settle();

    expect(doc.get()).toEqual({ status: "unavailable" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.calls.length).toBe(1);

    server.refuse(false);
    stream.connected("stream-2");
    await settle();
    expect(server.calls.map((call) => call.streamId)).toEqual(["stream-1", "stream-2"]);
    expect(doc.get()).toEqual({ status: "available", now: START + 60_000, viewers: [] });
    viewers[Symbol.dispose]();
});

it("lets someone recent fall to seen ten minutes after they left, with no server event", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    server.there.set("doc", [{ userId: "anna", here: false, lastSeenAt: START - 9 * MINUTE }]);
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    const doc = viewers.target({ type: "surface", id: "doc" });
    let notified = 0;
    doc.subscribe(() => (notified += 1));
    stream.connected("stream-1");
    await settle();
    const tierAt = () => {
        const snapshot = doc.get();
        return snapshot.status === "available" ? snapshot.viewers[0]?.tier : undefined;
    };

    expect(tierAt()).toBe("recent");
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(tierAt()).toBe("recent");
    await vi.advanceTimersByTimeAsync(1);
    expect(tierAt()).toBe("seen");
    expect(notified).toBeGreaterThanOrEqual(3);
    viewers[Symbol.dispose]();
});

it("is unavailable outside team mode and sends nothing", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    const viewers = happyAgentViewersCreate({
        client: server.client,
        sync: stream.sync,
        team: () => ({ members: [] }),
    });
    const doc = viewers.target({ type: "surface", id: "doc" });
    doc.subscribe(() => undefined);
    stream.connected("stream-1");
    await settle();

    expect(doc.get()).toEqual({ status: "unavailable" });
    expect(server.calls).toEqual([]);
    viewers[Symbol.dispose]();
});
