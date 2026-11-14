import type { HappyAgentNewKind, HappyAgentNewSurfaceKind } from "../../../src/FocusedSidebar";
import {
    LIVE_FEED_ROWS,
    liveFeedItemRows,
    type LiveFeedItem,
    type LiveFeedTier,
} from "../../../src/LiveFeed";
import {
    botFace,
    DEMO_BOTS,
    DEMO_PINS,
    DEMO_SCRIPT,
    DEMO_SEED,
    DEMO_TASKS,
    DOZING_BOT,
    FOLLOWABLE_TASKS,
    taskFace,
    WAKING_BOT,
    type DemoBot,
    type DemoEvent,
    type DemoPin,
    type DemoTask,
} from "./focusedSidebarData";

/*
 * The prototype's stand-in for a `happy-desktop-state` surface store: one
 * immutable snapshot, typed entity-first actions, and a clock that only runs
 * once the reader has done something. The rules in it are the proposal:
 *
 *   tasks     sorted by `tasksSorted`; at most `priorityLimit` are priority
 *   bots      a background bot with nothing to say dozes; one with something
 *             to say wakes
 *   pins      a pinned bot or task leaves its section
 *   feed      the live feed's v4 rules, unchanged: the region holds exactly
 *             what is unread
 */

/** The three directions the page switches between. */
export type FocusedVersion = "shelf" | "strip" | "lanes";

export type FocusedView =
    | { readonly kind: "chat"; readonly rowId: string }
    | { readonly kind: "new" }
    | { readonly kind: "feed" }
    | { readonly kind: "opened"; readonly itemId: string };

export interface FocusedBot extends DemoBot {
    /** Nothing left to say: it dims where it stands for a moment, then joins the sleeping. */
    readonly dozing: boolean;
    /** What it woke up to say, shown where its chat opens. */
    readonly note?: string;
}

/** A menu open at a point in the window: a row's own, or the swap a full priority list asks for. */
export type FocusedMenu =
    | { readonly kind: "swap"; readonly x: number; readonly y: number }
    | { readonly kind: "row"; readonly rowId: string; readonly x: number; readonly y: number };

export interface FocusedFeed {
    readonly on: boolean;
    readonly hovering: boolean;
    readonly now: number;
    /** What the region draws: everything unread, and what is just leaving, oldest first. */
    readonly unreadItems: readonly LiveFeedItem[];
    readonly unread: number;
    readonly unreadIds: ReadonlySet<string>;
    /** Everything ever delivered, read or not: what View all lists. */
    readonly delivered: readonly LiveFeedItem[];
    /** Not delivered: work of tasks the reader neither owns nor follows. */
    readonly held: readonly DemoEvent[];
    /** Real events under the bar, with why. */
    readonly below: readonly DemoEvent[];
}

export interface FocusedSnapshot {
    readonly version: FocusedVersion;
    readonly view: FocusedView;
    readonly newKind: HappyAgentNewKind;
    readonly newSurfaceKind: HappyAgentNewSurfaceKind;
    readonly pins: readonly DemoPin[];
    readonly pinnedOpen: boolean;
    readonly bots: readonly FocusedBot[];
    readonly sleepingOpen: boolean;
    /** The reader's tasks and the ones they follow, in the reader's own order. */
    readonly tasks: readonly DemoTask[];
    readonly priorityLimit: number;
    /** The task waiting for a priority place while every place is taken. */
    readonly swapFor: string | null;
    readonly menu: FocusedMenu | null;
    readonly projectsOpen: boolean;
    readonly feed: FocusedFeed;
}

/**
 * The order tasks are listed in. Four bands, top to bottom:
 *
 *   1. needs input and priority
 *   2. needs input
 *   3. priority
 *   4. everything else
 *
 * Inside a band the reader's own order stands, so nothing reshuffles for any
 * other reason: not for unread, not for work starting or stopping.
 */
export function tasksSorted(tasks: readonly DemoTask[]): DemoTask[] {
    const band = (task: DemoTask) =>
        (task.activity === "awaitingInput" ? 0 : 2) + (task.priority ? 0 : 1);
    return tasks
        .map((task, index) => ({ task, index }))
        .sort((left, right) => band(left.task) - band(right.task) || left.index - right.index)
        .map((entry) => entry.task);
}

/** How long an item may be in view before it counts as seen, as in the live feed. */
export const FEED_SEEN_MS: Record<LiveFeedTier, number | null> = {
    line: 8_000,
    card: 12_000,
    post: 16_000,
    milestone: 12_000,
    mention: null,
};
const LEAVE_MS = 650;
const FLUSH_STAGGER_MS = 450;
const TICK_MS = 100;
/** A dozing bot dims for this long before it joins the sleeping. */
const DOZE_MS = 900;
/** A bot whose work just ended stays as it is this long before it dozes. */
const SETTLE_MS = 1_100;

/** The installation clock ages are told against: 14 Nov 2026, 09:40 UTC. */
export const DEMO_EPOCH = Date.UTC(2026, 10, 14, 9, 40, 0);

/** Kirill's tasks that have since left the sidebar; their work still reaches him. */
const ALSO_CARED = new Set(["npvvcr4tkxiaqvhd8qs2q0mc"]);

interface UnreadEntry {
    readonly id: string;
    readonly seenMs: number;
    readonly leavingSince: number | null;
}

type Listener = () => void;

export class FocusedSidebarDemo {
    private listeners = new Set<Listener>();
    private snapshot: FocusedSnapshot;
    private timer: ReturnType<typeof setInterval> | null = null;
    private clock = 0;
    private lastTick = 0;

    private version: FocusedVersion;
    private view: FocusedView;
    private newKind: HappyAgentNewKind = "task";
    private newSurfaceKind: HappyAgentNewSurfaceKind = "todo";
    private pins: DemoPin[];
    private pinnedOpen = true;
    private bots: FocusedBot[];
    private sleepingOpen = false;
    private dozeAt = new Map<string, number>();
    private tasks: DemoTask[];
    private priorityLimit = 3;
    private swapFor: string | null = null;
    private menu: FocusedMenu | null = null;
    private projectsOpen = false;

    private feedOn = true;
    private feedHovering = false;
    private feedAutoRead = true;
    private nextEvent = 0;
    private nextFlushAt = 0;
    private unread: UnreadEntry[] = [];
    private queue: LiveFeedItem[] = [];
    private items = new Map<string, LiveFeedItem>();
    private events = new Map<string, DemoEvent>();
    private deliveredIds: string[] = [];
    private heldEvents: DemoEvent[] = [];
    private belowEvents: DemoEvent[] = [];
    private readonly script: readonly DemoEvent[];

    constructor(options: { readonly version?: FocusedVersion; readonly empty?: boolean } = {}) {
        this.version = options.version ?? "shelf";
        const empty = options.empty === true;
        this.pins = empty ? [] : [...DEMO_PINS];
        this.bots = (empty ? DEMO_BOTS.slice(0, 1) : DEMO_BOTS).map((bot) => ({
            ...bot,
            dozing: false,
        }));
        this.tasks = empty ? [] : [...DEMO_TASKS];
        this.script = empty ? [] : DEMO_SCRIPT;
        const first = tasksSorted(this.tasks)[0];
        this.view = empty
            ? { kind: "chat", rowId: `bot:${DEMO_BOTS[0]?.id ?? ""}` }
            : { kind: "chat", rowId: `task:${first?.id ?? ""}` };
        if (!empty) for (const event of DEMO_SEED) this.deliver(event, DEMO_EPOCH - 40_000);
        this.snapshot = this.build();
    }

    get = (): FocusedSnapshot => this.snapshot;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    dispose(): void {
        if (this.timer !== null) clearInterval(this.timer);
        this.timer = null;
        this.listeners.clear();
    }

    /* ---- Window ---------------------------------------------------------- */

    versionUpdate(version: FocusedVersion): void {
        this.version = version;
        this.swapFor = null;
        this.menu = null;
        this.publish();
    }

    rowSelect(rowId: string): void {
        this.view = { kind: "chat", rowId };
        // Opening a row reads it.
        const [kind, id] = splitRowId(rowId);
        if (kind === "bot")
            this.bots = this.bots.map((bot) => (bot.id === id ? { ...bot, unread: false } : bot));
        if (kind === "task")
            this.tasks = this.tasks.map((task) =>
                task.id === id ? { ...task, unread: false } : task,
            );
        this.pins = this.pins.map((pin) => (pin.id === rowId ? { ...pin, unread: false } : pin));
        this.changed();
    }

    newOpen(): void {
        this.view = { kind: "new" };
        this.changed();
    }

    newKindUpdate(kind: HappyAgentNewKind): void {
        this.newKind = kind;
        this.changed();
    }

    newSurfaceKindUpdate(kind: HappyAgentNewSurfaceKind): void {
        this.newSurfaceKind = kind;
        this.changed();
    }

    menuOpen(menu: FocusedMenu): void {
        this.menu = menu;
        this.changed();
    }

    menuDismiss(): void {
        if (this.menu?.kind === "swap") this.swapFor = null;
        this.menu = null;
        this.changed();
    }

    projectsToggle(): void {
        this.projectsOpen = !this.projectsOpen;
        this.changed();
    }

    /* ---- Pins ------------------------------------------------------------ */

    pinnedToggle(): void {
        this.pinnedOpen = !this.pinnedOpen;
        this.changed();
    }

    /** Pins a bot or a task, which takes it out of its section. */
    pinAdd(rowId: string): void {
        if (this.pins.some((pin) => pin.id === rowId)) return;
        const [kind, id] = splitRowId(rowId);
        const bot = kind === "bot" ? this.bots.find((entry) => entry.id === id) : undefined;
        const task = kind === "task" ? this.tasks.find((entry) => entry.id === id) : undefined;
        if (bot !== undefined)
            this.pins.push({ id: rowId, kind: "bot", label: bot.name, face: botFace(bot) });
        else if (task !== undefined)
            this.pins.push({ id: rowId, kind: "task", label: task.name, face: taskFace(task) });
        this.changed();
    }

    pinRemove(pinId: string): void {
        this.pins = this.pins.filter((pin) => pin.id !== pinId);
        this.menu = null;
        this.changed();
    }

    /* ---- Bots ------------------------------------------------------------ */

    sleepingToggle(): void {
        this.sleepingOpen = !this.sleepingOpen;
        this.changed();
    }

    /** The reader's own "Put to sleep": the bot dims, then joins the sleeping. */
    botDoze(botId: string): void {
        this.bots = this.bots.map((bot) =>
            bot.id === botId && !bot.asleep
                ? { ...bot, working: false, unread: false, dozing: true }
                : bot,
        );
        this.dozeAt.set(botId, this.clock + DOZE_MS);
        this.changed();
    }

    /** A bot with something to say comes back to the list, unread. */
    botWake(botId: string, note?: string): void {
        this.dozeAt.delete(botId);
        this.bots = this.bots.map((bot) =>
            bot.id === botId
                ? {
                      ...bot,
                      asleep: false,
                      dozing: false,
                      unread: note !== undefined,
                      ...(note === undefined ? {} : { note }),
                  }
                : bot,
        );
        this.changed();
    }

    /** The demo's releaser finishes its release: it goes quiet, then dozes off by itself. */
    botWorkFinish(): void {
        const bot = this.bots.find((entry) => entry.id === DOZING_BOT);
        if (bot === undefined || bot.asleep || bot.dozing) return;
        this.bots = this.bots.map((entry) =>
            entry.id === DOZING_BOT ? { ...entry, working: false } : entry,
        );
        this.dozeAt.set(DOZING_BOT, this.clock + SETTLE_MS + DOZE_MS);
        this.changed();
    }

    /** The demo's disk watcher finds something: it wakes. */
    botWakeNext(note: string): void {
        this.botWake(WAKING_BOT, note);
    }

    /* ---- Tasks ----------------------------------------------------------- */

    priorityLimitUpdate(limit: number): void {
        this.priorityLimit = Math.max(1, Math.min(5, Math.round(limit)));
        this.swapFor = null;
        this.menu = null;
        this.changed();
    }

    /**
     * Marks or unmarks a task as priority. With every place taken it marks
     * nothing: the task waits in `swapFor` for the reader to give up a place.
     * Returns whether the reader has to choose.
     */
    taskPriorityToggle(taskId: string): boolean {
        const task = this.tasks.find((entry) => entry.id === taskId);
        if (task === undefined) return false;
        if (!task.priority && this.priorityCount() >= this.priorityLimit) {
            this.swapFor = taskId;
            this.changed();
            return true;
        }
        this.tasks = this.tasks.map((entry) =>
            entry.id === taskId ? { ...entry, priority: !entry.priority } : entry,
        );
        this.swapFor = null;
        this.menu = null;
        this.changed();
        return false;
    }

    /** Gives `outId`'s place to the waiting task, or to `forId` named outright. */
    taskPrioritySwap(outId: string, forId?: string): void {
        const incoming = forId ?? this.swapFor;
        if (incoming === null || incoming === undefined) return;
        this.tasks = this.tasks.map((entry) =>
            entry.id === outId
                ? { ...entry, priority: false }
                : entry.id === incoming
                  ? { ...entry, priority: true }
                  : entry,
        );
        this.swapFor = null;
        this.menu = null;
        this.changed();
    }

    taskPrioritySwapCancel(): void {
        this.swapFor = null;
        this.menu = null;
        this.changed();
    }

    /** A task stops to ask the reader something, or is answered. */
    taskInputUpdate(taskId: string, awaiting: boolean): void {
        this.tasks = this.tasks.map((entry) =>
            entry.id === taskId
                ? {
                      ...entry,
                      activity: awaiting ? "awaitingInput" : "working",
                      ...(awaiting ? { unread: true } : {}),
                  }
                : entry,
        );
        this.changed();
    }

    /** Leaves one of the reader's tasks, or stops following a teammate's. */
    taskLeave(taskId: string): void {
        this.tasks = this.tasks.filter((entry) => entry.id !== taskId);
        this.pins = this.pins.filter((pin) => pin.id !== `task:${taskId}`);
        if (this.swapFor === taskId) this.swapFor = null;
        this.changed();
    }

    /** Follows a teammate's task from its feed line, which lists it under Tasks. */
    taskFollowUpdate(taskId: string, following: boolean): void {
        const task = FOLLOWABLE_TASKS.find((entry) => entry.id === taskId);
        if (task === undefined) return;
        if (following && !this.tasks.some((entry) => entry.id === taskId)) this.tasks.push(task);
        if (!following) this.tasks = this.tasks.filter((entry) => entry.id !== taskId);
        this.changed();
    }

    /* ---- Feed ------------------------------------------------------------ */

    /** Delivers the next scripted event now. */
    feedEventNext(): void {
        const event = this.script[this.nextEvent];
        if (event === undefined) return;
        this.nextEvent += 1;
        this.deliver(event, DEMO_EPOCH + this.clock);
        this.changed();
    }

    feedToggle(): void {
        this.feedOn = !this.feedOn;
        this.feedHovering = false;
        this.changed();
    }

    /** Whether time in view reads an item. Off, an item stays until the reader acts. */
    feedAutoReadUpdate(enabled: boolean): void {
        this.feedAutoRead = enabled;
        this.changed();
    }

    feedHoverUpdate(hovering: boolean): void {
        if (this.feedHovering === hovering) return;
        this.feedHovering = hovering;
        if (!hovering) this.nextFlushAt = this.clock;
        this.publish();
    }

    feedItemDismiss(itemId: string): void {
        this.read((entry) => entry.id === itemId);
        this.changed();
    }

    feedItemOpen(itemId: string): void {
        this.view = { kind: "opened", itemId };
        this.read((entry) => entry.id === itemId);
        this.changed();
    }

    feedReadAll(): void {
        this.read(() => true);
        for (const item of this.queue) this.deliveredIds.push(item.id);
        this.queue = [];
        this.changed();
    }

    feedViewAll(): void {
        this.view = { kind: "feed" };
        this.changed();
    }

    /* ---- Internals ------------------------------------------------------- */

    private priorityCount(): number {
        return this.tasks.filter((task) => task.priority).length;
    }

    /** Every action starts the clock that fades, dozes and reads; nothing runs before one. */
    private changed(): void {
        if (this.timer === null) {
            this.lastTick = performance.now();
            this.timer = setInterval(() => this.tick(), TICK_MS);
        }
        this.publish();
    }

    private read(which: (entry: UnreadEntry) => boolean): void {
        this.unread = this.unread.map((entry) =>
            entry.leavingSince === null && which(entry)
                ? { ...entry, leavingSince: this.clock }
                : entry,
        );
    }

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
        this.clock += elapsed;
        let dirty = false;

        for (const [botId, due] of this.dozeAt) {
            const bot = this.bots.find((entry) => entry.id === botId);
            if (bot === undefined) continue;
            if (!bot.dozing && this.clock >= due - DOZE_MS) {
                this.bots = this.bots.map((entry) =>
                    entry.id === botId ? { ...entry, dozing: true } : entry,
                );
                dirty = true;
            }
            if (this.clock >= due) {
                this.bots = this.bots.map((entry) =>
                    entry.id === botId
                        ? { ...entry, asleep: true, dozing: false, working: false, unread: false }
                        : entry,
                );
                this.dozeAt.delete(botId);
                dirty = true;
            }
        }

        if (!this.feedHovering && this.queue.length > 0 && this.clock >= this.nextFlushAt) {
            const item = this.queue.shift();
            if (item !== undefined) this.enter(item);
            this.nextFlushAt = this.clock + FLUSH_STAGGER_MS;
            dirty = true;
        }
        if (this.feedOn && !this.feedHovering && this.feedAutoRead) {
            const visible = this.inView();
            this.unread = this.unread.map((entry) => {
                const item = this.items.get(entry.id);
                const limit = item === undefined ? null : FEED_SEEN_MS[item.tier];
                if (entry.leavingSince !== null || limit === null || !visible.has(entry.id))
                    return entry;
                const seenMs = entry.seenMs + elapsed;
                if (seenMs >= limit) dirty = true;
                return { ...entry, seenMs, leavingSince: seenMs >= limit ? this.clock : null };
            });
        }
        const kept = this.unread.filter(
            (entry) => entry.leavingSince === null || this.clock - entry.leavingSince < LEAVE_MS,
        );
        if (kept.length !== this.unread.length) dirty = true;
        this.unread = kept;
        if (dirty) this.publish();
    }

    private cares(taskId: string): boolean {
        return this.tasks.some((task) => task.id === taskId) || ALSO_CARED.has(taskId);
    }

    private deliver(event: DemoEvent, at: number): void {
        if (event.gate === "below") {
            this.belowEvents.push(event);
            return;
        }
        if (event.gate === "cared" && !this.cares(event.taskId)) {
            this.heldEvents.push(event);
            return;
        }
        const item: LiveFeedItem = { ...event.item, at };
        this.items.set(item.id, item);
        this.events.set(item.id, event);
        if (this.feedOn && this.feedHovering) this.queue.push(item);
        else this.enter(item);
    }

    private enter(item: LiveFeedItem): void {
        this.deliveredIds.push(item.id);
        this.unread.push({ id: item.id, seenMs: 0, leavingSince: null });
    }

    private present(id: string, leaving: boolean): LiveFeedItem | null {
        const item = this.items.get(id);
        const event = this.events.get(id);
        if (item === undefined || event === undefined) return null;
        const followable =
            item.tier === "line"
                ? FOLLOWABLE_TASKS.find((task) => task.id === event.taskId)
                : undefined;
        return {
            ...item,
            ...(followable === undefined
                ? {}
                : {
                      follow: {
                          id: followable.id,
                          label: followable.name,
                          following: this.tasks.some((task) => task.id === followable.id),
                      },
                  }),
            ...(leaving ? { leaving: true } : {}),
        };
    }

    private build(): FocusedSnapshot {
        const previous = this.snapshot as FocusedSnapshot | undefined;
        const reuse =
            (from: readonly LiveFeedItem[] | undefined) =>
            (next: LiveFeedItem): LiveFeedItem => {
                const old = from?.find((item) => item.id === next.id);
                return old !== undefined &&
                    old.leaving === next.leaving &&
                    old.follow?.following === next.follow?.following &&
                    old.at === next.at
                    ? old
                    : next;
            };
        const unreadItems = this.unread
            .map((entry) => this.present(entry.id, entry.leavingSince !== null))
            .filter((item): item is LiveFeedItem => item !== null)
            .map(reuse(previous?.feed.unreadItems));
        const delivered = this.deliveredIds
            .map((id) => this.present(id, false))
            .filter((item): item is LiveFeedItem => item !== null)
            .map(reuse(previous?.feed.delivered));
        const unreadIds = new Set(
            this.unread.filter((entry) => entry.leavingSince === null).map((entry) => entry.id),
        );
        for (const item of this.queue) unreadIds.add(item.id);
        return {
            version: this.version,
            view: this.view,
            newKind: this.newKind,
            newSurfaceKind: this.newSurfaceKind,
            pins: [...this.pins],
            pinnedOpen: this.pinnedOpen,
            bots: [...this.bots],
            sleepingOpen: this.sleepingOpen,
            tasks: [...this.tasks],
            priorityLimit: this.priorityLimit,
            swapFor: this.swapFor,
            menu: this.menu,
            projectsOpen: this.projectsOpen,
            feed: {
                on: this.feedOn,
                hovering: this.feedHovering,
                // Ages are told to the nearest ten seconds, so a tick that
                // changes nothing else changes no snapshot.
                now: DEMO_EPOCH + Math.floor(this.clock / 10_000) * 10_000,
                unreadItems,
                unread: unreadIds.size,
                unreadIds,
                delivered,
                held: [...this.heldEvents],
                below: [...this.belowEvents],
            },
        };
    }

    private publish(): void {
        this.snapshot = this.build();
        for (const listener of this.listeners) listener();
    }
}

/** A row's kind and the ID behind it: `task:abc` is `["task", "abc"]`. */
export function splitRowId(rowId: string): [string, string] {
    const at = rowId.indexOf(":");
    return at < 0 ? ["", rowId] : [rowId.slice(0, at), rowId.slice(at + 1)];
}
