import {
    LIVE_FEED_ROWS,
    liveFeedItemRows,
    type LiveFeedItem,
    type LiveFeedTier,
} from "../../../src/LiveFeed";
import {
    DEMO_SCRIPT,
    DEMO_SEED,
    DEMO_TASKS,
    type DemoEvent,
    type DemoTaskId,
} from "./liveFeedData";

/*
 * The prototype's stand-in for a `happy-desktop-state` surface store: one
 * immutable snapshot, typed actions, and timers that only run between Play
 * and the page going away. A real store would take arrivals from the Feed's
 * realtime events instead of a script; the rules below are the proposal.
 *
 * The feed region shows exactly what is unread, and the footer counts it.
 * An item stops being unread when the reader ×s it, opens it, presses Read
 * all, or has had it on screen long enough.
 */

/**
 * How long an item may be on screen before it counts as seen and leaves, by
 * tier: only time in view, with the feed on and the pointer off it. An item
 * washed out above the region, or one that came while the feed was off, has
 * not been seen and waits. A mention stays until the reader deals with it.
 */
export const LIVE_FEED_SEEN_MS: Record<LiveFeedTier, number | null> = {
    line: 8_000,
    card: 12_000,
    post: 16_000,
    mention: null,
};
/** How long a leaving item takes to fade before it is dropped. */
const LEAVE_MS = 650;
/** Items that waited while paused come in one after another, this far apart. */
const FLUSH_STAGGER_MS = 450;
const TICK_MS = 100;

/** The installation clock the prototype tells ages against: 4 Nov 2026, 13:00 UTC. */
export const DEMO_EPOCH = Date.UTC(2026, 10, 4, 13, 0, 0);

interface UnreadEntry {
    readonly id: string;
    /** Time in view so far, counted as LIVE_FEED_SEEN_MS describes. */
    readonly seenMs: number;
    /** Script time it was read at; it fades, then is dropped. */
    readonly leavingSince: number | null;
}

export type { DemoEvent };

export interface HeldItem {
    readonly item: LiveFeedItem;
    readonly taskLabel: string;
}

export interface LiveFeedDemoSnapshot {
    readonly running: boolean;
    /** Wall-clock moment ages are told against. */
    readonly now: number;
    /** The footer control: the region is drawn. */
    readonly on: boolean;
    readonly hovering: boolean;
    /** What the region draws: everything unread, and what is just leaving, oldest first. */
    readonly unreadItems: readonly LiveFeedItem[];
    /** Unread, counting what waits while the pointer holds the feed. */
    readonly unread: number;
    readonly unreadIds: ReadonlySet<string>;
    /** Everything ever delivered, read or not, oldest first: what the Feed page lists. */
    readonly delivered: readonly LiveFeedItem[];
    readonly following: ReadonlyMap<DemoTaskId, boolean>;
    /** Not delivered: artifacts and posts of tasks the reader does not follow. */
    readonly held: readonly HeldItem[];
    /** Real events that arrived but are under the bar, with why. */
    readonly below: readonly DemoEvent[];
    readonly view: "chat" | "feed";
    /** The item the reader last opened. */
    readonly opened: string | null;
}

type Listener = () => void;

export class LiveFeedDemo {
    private listeners = new Set<Listener>();
    private snapshot: LiveFeedDemoSnapshot;
    private timer: ReturnType<typeof setInterval> | null = null;
    /** Real ms since Play; drives arrivals, which keep coming while hovered. */
    private scriptClock = 0;
    private lastTick = 0;
    private nextEvent = 0;
    private nextFlushAt = 0;
    private unread: UnreadEntry[] = [];
    /** Arrived while the pointer held the feed; they come in when it leaves. */
    private queue: LiveFeedItem[] = [];
    private items = new Map<string, LiveFeedItem>();
    private deliveredIds: string[] = [];
    private events = new Map<string, DemoEvent>();
    private heldEvents: DemoEvent[] = [];
    private belowEvents: DemoEvent[] = [];
    private following = new Map<DemoTaskId, boolean>(
        DEMO_TASKS.map((task) => [task.id, task.following]),
    );
    private on = true;
    private hovering = false;
    private view: "chat" | "feed" = "chat";
    private opened: string | null = null;

    constructor() {
        for (const event of DEMO_SEED) this.deliver(event, DEMO_EPOCH - 40_000);
        this.snapshot = this.build();
    }

    get = (): LiveFeedDemoSnapshot => this.snapshot;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    play(): void {
        if (this.timer !== null) return;
        this.lastTick = performance.now();
        this.timer = setInterval(() => this.tick(), TICK_MS);
        this.publish();
    }

    pause(): void {
        if (this.timer === null) return;
        clearInterval(this.timer);
        this.timer = null;
        this.publish();
    }

    /** Delivers the next scripted event now, as if its time had come. */
    eventNext(): void {
        const event = DEMO_SCRIPT[this.nextEvent];
        if (event === undefined) return;
        this.nextEvent += 1;
        this.arrive(event);
        this.publish();
    }

    /** The footer control: shows or hides the region; nothing is read by it. */
    feedToggle(): void {
        this.on = !this.on;
        // A hidden region has no pointer on it.
        this.hoverUpdate(false);
        this.publish();
    }

    hoverUpdate(hovering: boolean): void {
        if (this.hovering === hovering) return;
        this.hovering = hovering;
        if (!hovering) this.nextFlushAt = this.scriptClock;
        this.publish();
    }

    followUpdate(taskId: string, following: boolean): void {
        const id = DEMO_TASKS.find((task) => task.id === taskId)?.id;
        if (id === undefined) return;
        this.following.set(id, following);
        if (following) {
            // Following brings what was held back into the Feed, already read,
            // the way the daemon seeds a new subscription; none of it streams.
            const released = this.heldEvents.filter((event) => event.taskId === id);
            this.heldEvents = this.heldEvents.filter((event) => event.taskId !== id);
            for (const event of released) {
                const item = this.itemOf(event, DEMO_EPOCH + this.scriptClock - 60_000);
                this.items.set(item.id, item);
                this.events.set(item.id, event);
                this.deliveredIds.push(item.id);
            }
        }
        this.publish();
    }

    /** The item's ×: read, so it leaves, and what stood above it drops down. */
    itemDismiss(itemId: string): void {
        this.read((entry) => entry.id === itemId);
        this.publish();
    }

    itemOpen(itemId: string): void {
        this.opened = itemId;
        this.view = "chat";
        this.read((entry) => entry.id === itemId);
        this.publish();
    }

    /** Everything unread is read: the region empties and goes; the control stays on. */
    readAll(): void {
        this.read(() => true);
        for (const item of this.queue) this.deliveredIds.push(item.id);
        this.queue = [];
        this.publish();
    }

    viewAllOpen(): void {
        this.view = "feed";
        this.publish();
    }

    viewClose(): void {
        this.view = "chat";
        this.publish();
    }

    /** Back to the reader's own chat. */
    chatHome(): void {
        this.view = "chat";
        this.opened = null;
        this.publish();
    }

    dispose(): void {
        if (this.timer !== null) clearInterval(this.timer);
        this.timer = null;
        this.listeners.clear();
    }

    private read(which: (entry: UnreadEntry) => boolean): void {
        this.unread = this.unread.map((entry) =>
            entry.leavingSince === null && which(entry)
                ? { ...entry, leavingSince: this.scriptClock }
                : entry,
        );
    }

    /** The ids that are in view: from the newest up, as many rows as the region shows. */
    private inView(): Set<string> {
        const ids = new Set<string>();
        let rows = 0;
        for (let index = this.unread.length - 1; index >= 0; index -= 1) {
            const entry = this.unread[index];
            const item = entry === undefined ? undefined : this.items.get(entry.id);
            if (entry === undefined || item === undefined) continue;
            rows += liveFeedItemRows(item);
            if (rows > LIVE_FEED_ROWS) break;
            ids.add(entry.id);
        }
        return ids;
    }

    private tick(): void {
        const at = performance.now();
        const elapsed = at - this.lastTick;
        this.lastTick = at;
        this.scriptClock += elapsed;
        let event = DEMO_SCRIPT[this.nextEvent];
        while (event !== undefined && event.at <= this.scriptClock) {
            this.nextEvent += 1;
            this.arrive(event);
            event = DEMO_SCRIPT[this.nextEvent];
        }
        if (!this.hovering && this.queue.length > 0 && this.scriptClock >= this.nextFlushAt) {
            const item = this.queue.shift();
            if (item !== undefined) this.enter(item);
            this.nextFlushAt = this.scriptClock + FLUSH_STAGGER_MS;
        }
        if (this.on && !this.hovering) {
            const visible = this.inView();
            this.unread = this.unread.map((entry) => {
                const item = this.items.get(entry.id);
                const limit = item === undefined ? null : LIVE_FEED_SEEN_MS[item.tier];
                if (entry.leavingSince !== null || limit === null || !visible.has(entry.id))
                    return entry;
                const seenMs = entry.seenMs + elapsed;
                return {
                    ...entry,
                    seenMs,
                    leavingSince: seenMs >= limit ? this.scriptClock : null,
                };
            });
        }
        this.unread = this.unread.filter(
            (entry) =>
                entry.leavingSince === null || this.scriptClock - entry.leavingSince < LEAVE_MS,
        );
        this.publish();
    }

    private arrive(event: DemoEvent): void {
        this.deliver(event, DEMO_EPOCH + this.scriptClock);
    }

    /** The follow rule, then the hover rule, then into the unread stack. */
    private deliver(event: DemoEvent, at: number): void {
        if (event.gate === "below") {
            this.belowEvents.push(event);
            return;
        }
        if (event.gate === "followed" && this.following.get(event.taskId) !== true) {
            this.heldEvents.push(event);
            return;
        }
        const item = this.itemOf(event, at);
        this.items.set(item.id, item);
        this.events.set(item.id, event);
        if (this.on && this.hovering) this.queue.push(item);
        else this.enter(item);
    }

    private enter(item: LiveFeedItem): void {
        this.deliveredIds.push(item.id);
        this.unread.push({ id: item.id, seenMs: 0, leavingSince: null });
    }

    private itemOf(event: DemoEvent, at: number): LiveFeedItem {
        return { ...event.item, at };
    }

    private present(id: string, leaving: boolean): LiveFeedItem | null {
        const item = this.items.get(id);
        const event = this.events.get(id);
        if (item === undefined || event === undefined) return null;
        const task = DEMO_TASKS.find((entry) => entry.id === event.taskId);
        return {
            ...item,
            ...(event.followable && task !== undefined
                ? {
                      follow: {
                          id: task.id,
                          label: task.label,
                          following: this.following.get(task.id) === true,
                      },
                  }
                : {}),
            ...(leaving ? { leaving: true } : {}),
        };
    }

    private build(): LiveFeedDemoSnapshot {
        const previous = this.snapshot as LiveFeedDemoSnapshot | undefined;
        const reuse =
            (from: readonly LiveFeedItem[] | undefined) =>
            (next: LiveFeedItem): LiveFeedItem => {
                // Keep an unchanged item's object, so its row renders nothing new.
                const old = from?.find((item) => item.id === next.id);
                return old !== undefined && sameItem(old, next) ? old : next;
            };
        const unreadItems = this.unread
            .map((entry) => this.present(entry.id, entry.leavingSince !== null))
            .filter((item): item is LiveFeedItem => item !== null)
            .map(reuse(previous?.unreadItems));
        const delivered = this.deliveredIds
            .map((id) => this.present(id, false))
            .filter((item): item is LiveFeedItem => item !== null)
            .map(reuse(previous?.delivered));
        const unreadIds = new Set(
            this.unread.filter((entry) => entry.leavingSince === null).map((entry) => entry.id),
        );
        for (const item of this.queue) unreadIds.add(item.id);
        return {
            running: this.timer !== null,
            now: DEMO_EPOCH + this.scriptClock,
            on: this.on,
            hovering: this.hovering,
            unreadItems,
            unread: unreadIds.size,
            unreadIds,
            delivered,
            following: new Map(this.following),
            held: this.heldEvents.map((event) => ({
                item: this.itemOf(event, DEMO_EPOCH),
                taskLabel: DEMO_TASKS.find((task) => task.id === event.taskId)?.label ?? "",
            })),
            below: [...this.belowEvents],
            view: this.view,
            opened: this.opened,
        };
    }

    private publish(): void {
        this.snapshot = this.build();
        for (const listener of this.listeners) listener();
    }
}

function sameItem(left: LiveFeedItem, right: LiveFeedItem): boolean {
    return (
        left.leaving === right.leaving &&
        left.follow?.following === right.follow?.following &&
        left.at === right.at
    );
}
