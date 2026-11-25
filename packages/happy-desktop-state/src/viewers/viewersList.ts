import type { Viewer, ViewerTarget } from "@slopus/happy-agent-client";

/** How long after leaving a person still counts as recent. */
export const VIEWERS_RECENT_MS = 10 * 60_000;
/** The most people one target lists, as the server bounds it. */
export const VIEWERS_LIMIT = 50;

/**
 * How present a person is: viewing it now, here within the last ten minutes,
 * or here at some point before that.
 */
export type HappyAgentViewerTier = "here" | "recent" | "seen";

/** What a person can be viewing: an agent session or a Surface. */
export type HappyAgentViewerTarget = ViewerTarget;

/** One target's key, the same for every object naming it. */
export type HappyAgentViewerTargetKey = `${ViewerTarget["type"]}:${string}`;

export function viewerTargetKey(target: ViewerTarget): HappyAgentViewerTargetKey {
    return `${target.type}:${target.id}`;
}

/** One other person as this window knows them for one target. */
export interface HappyAgentViewerEntry {
    readonly userId: string;
    readonly here: boolean;
    readonly lastSeenAt: number;
    /**
     * They arrived while this window was already watching the target, rather
     * than being here when it first looked: their arrival is news to show.
     */
    readonly arrived: boolean;
}

export function viewerTierOf(
    viewer: Pick<HappyAgentViewerEntry, "here" | "lastSeenAt">,
    now: number,
): HappyAgentViewerTier {
    if (viewer.here) return "here";
    return now - viewer.lastSeenAt <= VIEWERS_RECENT_MS ? "recent" : "seen";
}

/**
 * The order the list keeps. People here stay in the order they came, the
 * newest arrival first: the server stamps everyone here with its own clock on
 * every heartbeat, and ordering them by it would reshuffle the faces every 15
 * seconds. Everyone else is newest first.
 */
function viewersOrder(
    entries: readonly HappyAgentViewerEntry[],
    hereOrder: readonly string[],
): HappyAgentViewerEntry[] {
    const rank = new Map(hereOrder.map((userId, index) => [userId, index]));
    return [...entries]
        .sort((one, other) => {
            if (one.here !== other.here) return one.here ? -1 : 1;
            if (one.here) {
                const oneRank = rank.get(one.userId) ?? -1;
                const otherRank = rank.get(other.userId) ?? -1;
                if (oneRank !== otherRank) return oneRank - otherRank;
            }
            if (one.lastSeenAt !== other.lastSeenAt) return other.lastSeenAt - one.lastSeenAt;
            return one.userId < other.userId ? -1 : one.userId > other.userId ? 1 : 0;
        })
        .slice(0, VIEWERS_LIMIT);
}

function entryOf(
    viewer: Viewer,
    previous: HappyAgentViewerEntry | undefined,
    watching: boolean,
): HappyAgentViewerEntry {
    const arrived = viewer.here && (previous?.here === true ? previous.arrived : watching);
    return { userId: viewer.userId, here: viewer.here, lastSeenAt: viewer.lastSeenAt, arrived };
}

/** Keeps the entries that did not change, so a list that says nothing new is the same list. */
function entriesReuse(
    previous: readonly HappyAgentViewerEntry[] | undefined,
    next: HappyAgentViewerEntry[],
): readonly HappyAgentViewerEntry[] {
    if (previous === undefined) return next;
    const known = new Map(previous.map((entry) => [entry.userId, entry]));
    let same = previous.length === next.length;
    const reused = next.map((entry, index) => {
        const old = known.get(entry.userId);
        const keep =
            old !== undefined &&
            old.here === entry.here &&
            old.lastSeenAt === entry.lastSeenAt &&
            old.arrived === entry.arrived;
        if (!keep || previous[index] !== old) same = false;
        return keep ? old : entry;
    });
    return same ? previous : reused;
}

/**
 * The list a heartbeat answered, replacing what was known. `previous` is
 * undefined the first time the window looks at the target, so nobody already
 * there counts as arriving.
 */
export function viewersListAnswered(
    previous: readonly HappyAgentViewerEntry[] | undefined,
    viewers: readonly Viewer[],
): readonly HappyAgentViewerEntry[] {
    const known = new Map((previous ?? []).map((entry) => [entry.userId, entry]));
    const entries = viewers.map((viewer) =>
        entryOf(viewer, known.get(viewer.userId), previous !== undefined),
    );
    const hereBefore = (previous ?? []).filter((entry) => entry.here).map((entry) => entry.userId);
    const staying = new Set(hereBefore);
    const arriving = entries
        .filter((entry) => entry.here && !staying.has(entry.userId))
        .map((entry) => entry.userId);
    return entriesReuse(previous, viewersOrder(entries, [...arriving, ...hereBefore]));
}

/** The list after one person started or stopped being here. */
export function viewersListChanged(
    previous: readonly HappyAgentViewerEntry[],
    viewer: Viewer,
): readonly HappyAgentViewerEntry[] {
    const old = previous.find((entry) => entry.userId === viewer.userId);
    const entry = entryOf(viewer, old, true);
    const hereBefore = previous.filter((other) => other.here).map((other) => other.userId);
    const hereOrder = entry.here && old?.here !== true ? [entry.userId, ...hereBefore] : hereBefore;
    const rest = previous.filter((other) => other.userId !== viewer.userId);
    return entriesReuse(previous, viewersOrder([...rest, entry], hereOrder));
}

/**
 * When the next tier or minute label changes for anyone in these lists: the
 * next whole minute since someone recent left, or the first moment past ten
 * minutes, when they fall from recent to seen. Undefined when nothing changes
 * with time.
 */
export function viewersNextChangeAt(
    lists: Iterable<readonly HappyAgentViewerEntry[]>,
    now: number,
): number | undefined {
    let next: number | undefined;
    for (const list of lists)
        for (const entry of list) {
            if (viewerTierOf(entry, now) !== "recent") continue;
            const elapsed = Math.max(0, now - entry.lastSeenAt);
            const minute = entry.lastSeenAt + (Math.floor(elapsed / 60_000) + 1) * 60_000;
            const at = Math.min(minute, entry.lastSeenAt + VIEWERS_RECENT_MS + 1);
            if (next === undefined || at < next) next = at;
        }
    return next;
}
