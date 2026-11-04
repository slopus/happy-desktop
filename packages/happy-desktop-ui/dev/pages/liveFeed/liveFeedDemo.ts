import type { LiveFeedItem, LiveFeedMode, LiveFeedTier } from "../../../src/LiveFeed";
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
 */

/** How long an item stays in the stream, by tier, counting only unpaused time. */
export const LIVE_FEED_STREAM_TTL: Record<LiveFeedTier, number> = {
    line: 8_000,
    card: 12_000,
    post: 16_000,
    mention: 30_000,
};
/**
 * The most the stream holds at once; a further arrival lets the oldest go
 * early. The band is a fifth of the sidebar, about four rows, so the fifth is
 * the one washing out at its top.
 */
export const LIVE_FEED_STREAM_MAX = 5;
/** How long a leaving item takes to fade before it is dropped. */
const LEAVE_MS = 650;
/** Items that waited while paused come in one after another, this far apart. */
const FLUSH_STAGGER_MS = 450;
const TICK_MS = 100;

/** The installation clock the prototype tells ages against: 4 Nov 2026, 13:00 UTC. */
export const DEMO_EPOCH = Date.UTC(2026, 10, 4, 13, 0, 0);

interface StreamEntry {
    readonly id: string;
    /** In unpaused stream time. */
    readonly expiresAt: number;
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
    readonly mode: LiveFeedMode;
    readonly hovering: boolean;
    /** Everything delivered and still collected, oldest first. */
    readonly stack: readonly LiveFeedItem[];
    /** What the panel draws in the current mode, oldest first. */
    readonly visible: readonly LiveFeedItem[];
    /** Arrived while hovering, waiting to come in. */
    readonly queued: number;
    readonly unread: number;
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
    /** Real ms since Play; drives arrivals, which keep coming while paused. */
    private scriptClock = 0;
    /** Unpaused ms since Play; drives expiry, which stops while paused. */
    private streamClock = 0;
    private lastTick = 0;
    private nextEvent = 0;
    private nextFlushAt = 0;
    private stream: StreamEntry[] = [];
    private queue: LiveFeedItem[] = [];
    private items = new Map<string, LiveFeedItem>();
    private stackIds: string[] = [];
    private unreadIds = new Set<string>();
    private events = new Map<string, DemoEvent>();
    private heldEvents: DemoEvent[] = [];
    private belowEvents: DemoEvent[] = [];
    private following = new Map<DemoTaskId, boolean>(
        DEMO_TASKS.map((task) => [task.id, task.following]),
    );
    private mode: LiveFeedMode = "stream";
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

    modeToggle(): void {
        this.mode = this.mode === "stream" ? "stack" : "stream";
        // Opening the stack is reading it.
        if (this.mode === "stack") this.unreadIds.clear();
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
            // Following seeds the stack with what was held back, already read,
            // the way the daemon seeds a new subscription; none of it streams.
            const released = this.heldEvents.filter((event) => event.taskId === id);
            this.heldEvents = this.heldEvents.filter((event) => event.taskId !== id);
            for (const event of released) {
                const item = this.itemOf(event, DEMO_EPOCH + this.scriptClock - 60_000);
                this.items.set(item.id, item);
                this.events.set(item.id, event);
                this.stackIds.push(item.id);
            }
        }
        this.publish();
    }

    /** The item's ×: in the stream it leaves now; in the stack it is put away. */
    itemDismiss(itemId: string): void {
        this.unreadIds.delete(itemId);
        if (this.mode === "stack") {
            this.stackIds = this.stackIds.filter((id) => id !== itemId);
            this.stream = this.stream.filter((entry) => entry.id !== itemId);
        } else {
            this.stream = this.stream.map((entry) =>
                entry.id === itemId && entry.leavingSince === null
                    ? { ...entry, leavingSince: this.streamClock }
                    : entry,
            );
        }
        this.publish();
    }

    itemOpen(itemId: string): void {
        this.opened = itemId;
        this.unreadIds.delete(itemId);
        this.view = "chat";
        this.publish();
    }

    viewAllOpen(): void {
        this.view = "feed";
        this.mode = "stream";
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

    private tick(): void {
        const at = performance.now();
        const elapsed = at - this.lastTick;
        this.lastTick = at;
        this.scriptClock += elapsed;
        if (!this.hovering) this.streamClock += elapsed;
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
        if (!this.hovering) {
            this.stream = this.stream
                .map((entry) =>
                    entry.leavingSince === null && entry.expiresAt <= this.streamClock
                        ? { ...entry, leavingSince: this.streamClock }
                        : entry,
                )
                .filter(
                    (entry) =>
                        entry.leavingSince === null ||
                        this.streamClock - entry.leavingSince < LEAVE_MS,
                );
        }
        this.publish();
    }

    private arrive(event: DemoEvent): void {
        this.deliver(event, DEMO_EPOCH + this.scriptClock);
    }

    /** The follow rule, then the hover rule, then into the stack and the stream. */
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
        if (this.hovering) this.queue.push(item);
        else this.enter(item);
    }

    private enter(item: LiveFeedItem): void {
        this.stackIds.push(item.id);
        if (this.mode === "stream") this.unreadIds.add(item.id);
        this.stream.push({
            id: item.id,
            expiresAt: this.streamClock + LIVE_FEED_STREAM_TTL[item.tier],
            leavingSince: null,
        });
        const live = this.stream.filter((entry) => entry.leavingSince === null);
        if (live.length > LIVE_FEED_STREAM_MAX) {
            const oldest = live[0];
            this.stream = this.stream.map((entry) =>
                entry === oldest ? { ...entry, leavingSince: this.streamClock } : entry,
            );
        }
    }

    private itemOf(event: DemoEvent, at: number): LiveFeedItem {
        return { ...event.item, at };
    }

    private present(id: string, leaving: boolean): LiveFeedItem | null {
        const item = this.items.get(id);
        const event = this.events.get(id);
        if (item === undefined || event === undefined) return null;
        const task = DEMO_TASKS.find((entry) => entry.id === event.taskId);
        const unread = this.unreadIds.has(id);
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
            ...(unread ? { unread: true } : {}),
        };
    }

    private build(): LiveFeedDemoSnapshot {
        const previous = this.snapshot as LiveFeedDemoSnapshot | undefined;
        const reuse = (next: LiveFeedItem): LiveFeedItem => {
            // Keep an unchanged item's object, so its row renders nothing new.
            const old = previous?.stack.find((item) => item.id === next.id);
            return old !== undefined && sameItem(old, next) ? old : next;
        };
        const stack = this.stackIds
            .map((id) => this.present(id, false))
            .filter((item): item is LiveFeedItem => item !== null)
            .map(reuse);
        const stream = this.stream
            .map((entry) => this.present(entry.id, entry.leavingSince !== null))
            .filter((item): item is LiveFeedItem => item !== null)
            .map(reuse);
        return {
            running: this.timer !== null,
            now: DEMO_EPOCH + this.scriptClock,
            mode: this.mode,
            hovering: this.hovering,
            stack,
            visible: this.mode === "stack" ? stack : stream,
            queued: this.queue.length,
            unread: this.unreadIds.size,
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
        left.unread === right.unread &&
        left.follow?.following === right.follow?.following &&
        left.at === right.at
    );
}
