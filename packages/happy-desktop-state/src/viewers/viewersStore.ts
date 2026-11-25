import {
    HappyAgentApiError,
    type HappyAgentClient,
    type ViewerTarget,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { HappyAgentTeamRoster } from "../happyAgentConnection/types.js";
import { happyAgentSurfacePeopleReaderCreate } from "../surfaces/surfacePeople.js";
import type { HappyAgentSurfacePerson } from "../surfaces/surfaceTypes.js";
import {
    viewerTargetKey,
    viewerTierOf,
    viewersListAnswered,
    viewersListChanged,
    viewersNextChangeAt,
    type HappyAgentViewerEntry,
    type HappyAgentViewerTarget,
    type HappyAgentViewerTargetKey,
    type HappyAgentViewerTier,
} from "./viewersList.js";

/** How often a window says again what it views; the server forgets a stream after 30 s. */
export const VIEWERS_HEARTBEAT_MS = 15_000;
/** The most targets one stream may view at once. */
const VIEWERS_TARGETS_LIMIT = 8;

/**
 * Whether the person is at this window: it is focused, visible, and was used
 * in the last five minutes. While they are not, the window views nothing.
 */
export interface HappyAgentViewersActivity {
    active(): boolean;
    subscribe(listener: () => void): () => void;
}

/** One other person who views a target now, or did. */
export interface HappyAgentViewerSnapshot {
    readonly userId: string;
    readonly name: string;
    readonly imageUrl?: string;
    readonly tier: HappyAgentViewerTier;
    readonly lastSeenAt: number;
    /** Came while the reader was already looking, so the arrival is news. */
    readonly arrived: boolean;
}

export type HappyAgentTargetViewersSnapshot =
    /** Outside team mode, or on a server without viewers: the header has no slot. */
    | { readonly status: "unavailable" }
    | {
          readonly status: "available";
          /** Here first, in the order they came, then newest first; at most 50. */
          readonly viewers: readonly HappyAgentViewerSnapshot[];
          /** The time the tiers were worked out at, for labels such as `4m`. */
          readonly now: number;
      };

/**
 * Who else views one agent session or Surface. Subscribing is what says the
 * reader is looking at it: a header subscribes while it is on screen, and
 * React tears the subscription down for a view it keeps out of sight.
 */
export interface HappyAgentTargetViewersStore {
    get(): HappyAgentTargetViewersSnapshot;
    subscribe(listener: () => void): () => void;
}

/** Everyone viewing what this connection's window views, for one Happy Agent. */
export interface HappyAgentViewers {
    target(target: HappyAgentViewerTarget): HappyAgentTargetViewersStore;
    [Symbol.dispose](): void;
}

export interface HappyAgentViewersDeps {
    readonly client: Pick<HappyAgentClient, "putViewers" | "endpoint" | "getUsers">;
    readonly sync: HappyAgentSync;
    readonly team: () => HappyAgentTeamRoster;
    /** Absent, the reader counts as always at the window. */
    readonly activity?: HappyAgentViewersActivity;
    readonly now?: () => number;
}

interface Shown {
    readonly target: ViewerTarget;
    readonly listeners: Set<() => void>;
    /** When it was last put on screen; the newest eight are what the stream views. */
    shownAt: number;
}

const UNAVAILABLE: HappyAgentTargetViewersSnapshot = { status: "unavailable" };

function notFound(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status === 404;
}

/**
 * The connection's viewers. It opens nothing until a target is first shown.
 *
 * It then follows the connection's event stream for its `streamId` and for
 * `viewers.updated` frames, and says which targets are on screen with one
 * `PUT /v0/viewers/streams/:streamId` whenever that changes and every 15
 * seconds while anything is, with at most one request in flight. Each answer
 * replaces the lists for the targets it names, and frames change them in
 * between. A server that answers 404 has no viewers for this stream, and is
 * asked again only on the next stream.
 */
export function happyAgentViewersCreate(deps: HappyAgentViewersDeps): HappyAgentViewers {
    const clock = deps.now ?? Date.now;
    const life = new AbortController();
    const shown = new Map<HappyAgentViewerTargetKey, Shown>();
    const stores = new Map<HappyAgentViewerTargetKey, HappyAgentTargetViewersStore>();
    const lists = new Map<HappyAgentViewerTargetKey, readonly HappyAgentViewerEntry[]>();
    const people = new Map<string, HappyAgentSurfacePerson>();
    const peopleReader = happyAgentSurfacePeopleReaderCreate({
        client: deps.client,
        signal: life.signal,
        read(found) {
            for (const [userId, person] of found) people.set(userId, person);
            publish();
        },
    });
    let disposed = false;
    let following = false;
    let activityRelease: (() => void) | undefined;
    let streamId: string | undefined;
    /** The stream a 404 came back on; nothing more is sent on it. */
    let refusedOn: string | undefined;
    /** What the server last accepted on the current stream, as keys. */
    let accepted = "";
    let sending = false;
    let sendAgain = false;
    let changeQueued = false;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setTimeout> | undefined;
    let now = clock();
    /** Rises with every change a snapshot shows. */
    let version = 0;

    const teamMode = (): boolean => deps.team().viewerId !== undefined;
    const available = (): boolean =>
        teamMode() && (streamId === undefined || streamId !== refusedOn);

    const wanted = (): ViewerTarget[] => {
        if (!available() || !(deps.activity?.active() ?? true)) return [];
        return [...shown.values()]
            .sort((one, other) => other.shownAt - one.shownAt)
            .slice(0, VIEWERS_TARGETS_LIMIT)
            .map((entry) => entry.target);
    };

    /** Keeps a list, reading anyone the team roster does not name. */
    const listSet = (
        key: HappyAgentViewerTargetKey,
        list: readonly HappyAgentViewerEntry[],
    ): void => {
        lists.set(key, list);
        const members = new Set(deps.team().members.map((member) => member.id));
        peopleReader.request(
            list.flatMap((entry) => (members.has(entry.userId) ? [] : [entry.userId])),
        );
    };

    const tickSchedule = (): void => {
        if (tick !== undefined) clearTimeout(tick);
        tick = undefined;
        if (disposed) return;
        const at = viewersNextChangeAt(lists.values(), now);
        if (at === undefined) return;
        tick = setTimeout(
            () => {
                tick = undefined;
                publish();
            },
            Math.max(0, at - clock()),
        );
    };

    function publish(): void {
        if (disposed) return;
        now = clock();
        version += 1;
        tickSchedule();
        for (const entry of shown.values()) for (const listener of entry.listeners) listener();
    }

    const heartbeatSchedule = (): void => {
        if (heartbeat !== undefined) clearTimeout(heartbeat);
        heartbeat = setTimeout(() => {
            heartbeat = undefined;
            void send(true);
        }, VIEWERS_HEARTBEAT_MS);
    };

    /**
     * One navigation hides one view and shows the next in the same task, so the
     * change is sent once, after both. A view hidden and shown again in that
     * task keeps its list, and the others never see the reader leave.
     */
    const changeSend = (): void => {
        if (changeQueued) return;
        changeQueued = true;
        queueMicrotask(() => {
            changeQueued = false;
            for (const key of lists.keys()) if (!shown.has(key)) lists.delete(key);
            void send(false);
        });
    };

    async function send(renew: boolean): Promise<void> {
        if (disposed || streamId === undefined || !available()) return;
        if (sending) {
            sendAgain = true;
            return;
        }
        const targets = wanted();
        const keys = targets.map(viewerTargetKey).join(" ");
        if (keys === accepted && (!renew || keys === "")) return;
        const stream = streamId;
        sending = true;
        try {
            const answer = await deps.client.putViewers(
                stream,
                { targets },
                { signal: life.signal },
            );
            if (disposed || stream !== streamId) return;
            accepted = keys;
            let changed = false;
            for (const { target, viewers } of answer.targets) {
                const key = viewerTargetKey(target);
                if (!shown.has(key)) continue;
                const previous = lists.get(key);
                const next = viewersListAnswered(previous, viewers);
                if (next === previous) continue;
                listSet(key, next);
                changed = true;
            }
            if (changed) publish();
        } catch (error) {
            if (disposed || stream !== streamId) return;
            if (notFound(error)) {
                refusedOn = stream;
                lists.clear();
                publish();
            }
        } finally {
            sending = false;
        }
        if (disposed) return;
        // A failed request is tried again on the next beat, as is a stream
        // that is still viewing something.
        if (wanted().length > 0 || accepted !== "") heartbeatSchedule();
        else if (heartbeat !== undefined) clearTimeout(heartbeat);
        if (sendAgain) {
            sendAgain = false;
            void send(false);
        }
    }

    const follow = (): void => {
        if (following || disposed) return;
        following = true;
        activityRelease = deps.activity?.subscribe(() => void send(false));
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: life.signal,
                events: [],
                viewers: true,
            })) {
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    // Team mode is known from the bootstrap onwards.
                    publish();
                    void send(false);
                    continue;
                }
                if (input.kind !== "update") continue;
                const update = input.update;
                if (update.kind === "connected") {
                    if (update.streamId === streamId) continue;
                    // A new stream views nothing yet, and may reach a server
                    // that has viewers where the last one did not.
                    streamId = update.streamId;
                    accepted = "";
                    publish();
                    void send(false);
                    continue;
                }
                if (update.kind === "disconnected") {
                    // The server ends a closed stream's viewing at once.
                    streamId = undefined;
                    accepted = "";
                    continue;
                }
                if (update.kind !== "viewers") continue;
                const key = viewerTargetKey(update.frame.target);
                const previous = lists.get(key);
                // Before the first answer there is nothing to change; the
                // answer itself will name them.
                if (previous === undefined) continue;
                const next = viewersListChanged(previous, update.frame.viewer);
                if (next === previous) continue;
                listSet(key, next);
                publish();
            }
        })().catch(() => undefined);
    };

    const personOf = (userId: string): { name: string; imageUrl?: string } => {
        const member = deps.team().members.find((entry) => entry.id === userId);
        if (member !== undefined)
            return member.imageUrl === undefined
                ? { name: member.name }
                : { name: member.name, imageUrl: member.imageUrl };
        const person = people.get(userId);
        return {
            name: person?.name ?? "Someone",
            ...(person?.photo ? { imageUrl: person.photo.url } : {}),
        };
    };

    const storeOf = (target: ViewerTarget): HappyAgentTargetViewersStore => {
        const key = viewerTargetKey(target);
        let snapshot: HappyAgentTargetViewersSnapshot = UNAVAILABLE;
        let snapshotVersion = -1;
        return {
            get() {
                if (snapshotVersion === version) return snapshot;
                snapshotVersion = version;
                if (!available()) {
                    snapshot = UNAVAILABLE;
                    return snapshot;
                }
                const at = now;
                snapshot = {
                    status: "available",
                    now: at,
                    viewers: (lists.get(key) ?? []).map((entry) => ({
                        userId: entry.userId,
                        ...personOf(entry.userId),
                        tier: viewerTierOf(entry, at),
                        lastSeenAt: entry.lastSeenAt,
                        arrived: entry.arrived,
                    })),
                };
                return snapshot;
            },
            subscribe(listener) {
                if (disposed) return () => undefined;
                let entry = shown.get(key);
                const first = entry === undefined;
                if (entry === undefined) {
                    entry = { target, listeners: new Set(), shownAt: clock() };
                    shown.set(key, entry);
                }
                entry.listeners.add(listener);
                follow();
                if (first) changeSend();
                let released = false;
                return () => {
                    if (released) return;
                    released = true;
                    const current = shown.get(key);
                    current?.listeners.delete(listener);
                    if (current === undefined || current.listeners.size > 0) return;
                    // Looked at again later, it starts from what the server
                    // says then, without treating everyone there as arriving.
                    shown.delete(key);
                    changeSend();
                };
            },
        };
    };

    return {
        target(target) {
            const key = viewerTargetKey(target);
            let store = stores.get(key);
            if (store === undefined) {
                store = storeOf(target);
                stores.set(key, store);
            }
            return store;
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            life.abort();
            activityRelease?.();
            if (heartbeat !== undefined) clearTimeout(heartbeat);
            if (tick !== undefined) clearTimeout(tick);
            shown.clear();
            lists.clear();
        },
    };
}
