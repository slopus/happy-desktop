import {
    HappyAgentApiError,
    type HappyAgentUpdate,
    type PutViewersResponse,
    type Viewer,
    type ViewerRequestTarget,
} from "@slopus/happy-agent-client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentViewersCreate,
    type HappyAgentViewersActivity,
    type HappyAgentViewersDeps,
} from "./viewersStore.js";

const MINUTE = 60_000;
const START = 1_700_000_000_000;

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
        disconnected: () => push({ kind: "disconnected" }),
        frame: (id: string, viewer: Viewer) =>
            push({ kind: "viewers", frame: { target: { type: "surface", id }, viewer } }),
    };
}

/** One `PUT /v0/viewers/streams/:streamId`, answered when the test says. */
interface Put {
    readonly streamId: string;
    readonly targets: readonly ViewerRequestTarget[];
    readonly signal: AbortSignal | undefined;
    answer(response?: PutViewersResponse): void;
    fail(error: unknown): void;
}

/**
 * A server whose PUTs answer at once with whoever the test says is there, or,
 * while held, wait for the test to answer or fail them. An aborted PUT rejects
 * with the signal's reason, as the real client does.
 */
function serverCreate() {
    const puts: Put[] = [];
    const there = new Map<string, Viewer[]>();
    let hold = false;
    let refuse = false;
    const answerOf = (targets: readonly ViewerRequestTarget[]): PutViewersResponse => ({
        targets: targets.map((target) => ({ target, viewers: there.get(target.id) ?? [] })),
    });
    const client: HappyAgentViewersDeps["client"] = {
        endpoint: "http://happy-agent.test/",
        getUsers: async () => ({ users: [] }),
        putViewers: (streamId, request, options) =>
            new Promise<PutViewersResponse>((resolve, reject) => {
                const signal = options?.signal;
                signal?.addEventListener("abort", () => reject(signal.reason));
                const put: Put = {
                    streamId,
                    targets: request.targets,
                    signal,
                    answer: (response = answerOf(request.targets)) => resolve(response),
                    fail: reject,
                };
                puts.push(put);
                if (refuse) put.fail(new HappyAgentApiError(404, "Not found", "not_found", null));
                else if (!hold) put.answer();
            }),
    };
    return {
        client,
        puts,
        there,
        /** What was sent, in order. */
        sent: () => puts.map(({ streamId, targets }) => ({ streamId, targets })),
        hold: (value: boolean) => (hold = value),
        refuse: (value: boolean) => (refuse = value),
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

    expect(server.sent()).toEqual([
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
    expect(server.puts.length).toBe(3);

    release();
    await settle();
    expect(server.sent().at(-1)).toEqual({ streamId: "stream-1", targets: [] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.puts.length).toBe(4);
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
    expect(server.puts.length).toBe(1);
    expect(doc.get()).toBe(before);

    // A navigation: the document goes, the session comes, in one task.
    releaseAgain();
    session.subscribe(() => undefined);
    await settle();
    expect(server.sent().map((call) => call.targets)).toEqual([
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

    expect(server.sent().map((call) => call.targets)).toEqual([
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
    expect(server.puts.length).toBe(1);

    server.refuse(false);
    stream.connected("stream-2");
    await settle();
    expect(server.sent().map((call) => call.streamId)).toEqual(["stream-1", "stream-2"]);
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
    expect(server.sent()).toEqual([]);
    viewers[Symbol.dispose]();
});

it("advertises on a new stream at once while the old stream's request hangs", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    viewers.target({ type: "agent", id: "session" }).subscribe(() => undefined);
    server.hold(true);
    stream.connected("stream-1");
    await settle();

    stream.connected("stream-2");
    await settle();
    expect(server.puts.map((put) => [put.streamId, put.signal?.aborted])).toEqual([
        ["stream-1", true],
        ["stream-2", false],
    ]);

    server.puts[1]!.answer();
    server.hold(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(server.sent().map((put) => put.streamId)).toEqual(["stream-1", "stream-2", "stream-2"]);
    viewers[Symbol.dispose]();
});

it("says it left when the window blurs after a request whose answer was lost", async () => {
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
    server.hold(true);
    stream.connected("stream-1");
    await settle();
    server.puts[0]!.fail(new TypeError("fetch failed"));
    await settle();

    server.hold(false);
    active = false;
    for (const listener of listeners) listener();
    await settle();
    expect(server.sent().map((put) => put.targets)).toEqual([
        [{ type: "agent", id: "session" }],
        [],
    ]);
    viewers[Symbol.dispose]();
});

it("shows a view opened again empty until the server answers, not as it was", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    server.there.set("doc", [{ userId: "anna", here: true, lastSeenAt: START }]);
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    const doc = viewers.target({ type: "surface", id: "doc" });
    const release = doc.subscribe(() => undefined);
    stream.connected("stream-1");
    await settle();
    const before = doc.get();
    expect(before.status === "available" && before.viewers.map((v) => v.name)).toEqual(["Anna"]);
    release();
    await settle();

    server.there.set("doc", []);
    server.hold(true);
    doc.subscribe(() => undefined);
    await settle();
    expect(doc.get()).toEqual({ status: "available", now: START, viewers: [] });
    viewers[Symbol.dispose]();
});

it("ignores a late answer for a view gone from the screen, and targets it does not know", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    const doc = viewers.target({ type: "surface", id: "doc" });
    const release = doc.subscribe(() => undefined);
    server.hold(true);
    stream.connected("stream-1");
    await settle();
    release();
    await settle();

    const anna: Viewer = { userId: "anna", here: true, lastSeenAt: START };
    server.puts[0]!.answer({
        targets: [
            { target: { type: "surface", id: "doc" }, viewers: [anna] },
            { target: { type: "thread", id: "doc" }, viewers: [anna] },
        ],
    });
    await settle();
    server.puts[1]!.answer();
    server.there.set("doc", []);
    server.hold(false);
    doc.subscribe(() => undefined);
    await settle();
    expect(doc.get()).toEqual({ status: "available", now: START, viewers: [] });
    viewers[Symbol.dispose]();
});

it("clears who is here and stops its timers when the stream drops", async () => {
    const stream = streamCreate();
    const server = serverCreate();
    server.there.set("doc", [{ userId: "anna", here: true, lastSeenAt: START }]);
    const viewers = happyAgentViewersCreate({ client: server.client, sync: stream.sync, team });
    const doc = viewers.target({ type: "surface", id: "doc" });
    doc.subscribe(() => undefined);
    stream.connected("stream-1");
    await settle();

    stream.disconnected();
    await settle();
    expect(doc.get()).toEqual({ status: "available", now: START, viewers: [] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.puts.length).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    viewers[Symbol.dispose]();
});
