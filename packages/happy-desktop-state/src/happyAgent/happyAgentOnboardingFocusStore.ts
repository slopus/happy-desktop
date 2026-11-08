import type { HappyAgentChatOnboardingSnapshot } from "./happyAgentChatOnboardingStore.js";
import type { HappyAgentOnboardingSnapshot } from "./happyAgentOnboardingStore.js";

/**
 * Experimental onboarding's focus: while a setup's onboarding runs, the window
 * shows that setup alone, with no rail and no sidebar, until its first task
 * starts, its flow finishes, or the person presses "Skip setup". A skip is kept
 * per setup, so a relaunch keeps the app layout; a relaunch before one returns
 * to focus.
 */
export interface HappyAgentOnboardingFocusSnapshot {
    /** The setups, by Happy Agent ID, the person let go of with "Skip setup". */
    readonly released: ReadonlySet<string>;
    /**
     * The first tasks, by task ID, whose sidebar rows have been pointed at once
     * as the window let go, so a relaunch doesn't point at them again.
     */
    readonly highlighted: ReadonlySet<string>;
}

/** What the window keeps of onboarding's focus between launches. */
export interface HappyAgentOnboardingFocusSaved {
    readonly released: readonly string[];
    readonly highlighted: readonly string[];
}

export interface HappyAgentOnboardingFocusPersistence {
    read(): unknown;
    write(saved: HappyAgentOnboardingFocusSaved): void;
}

export interface HappyAgentOnboardingFocusStore {
    get(): HappyAgentOnboardingFocusSnapshot;
    subscribe(listener: () => void): () => void;
    /** Lets one setup go for good: its window keeps the app layout from now on. */
    focusRelease(happyAgentId: string): void;
    /** A first task's row has been pointed at; it isn't pointed at again. */
    taskHighlightEnd(taskId: string): void;
}

const NONE: HappyAgentOnboardingFocusSnapshot = { released: new Set(), highlighted: new Set() };

/** First tasks only grow a few at a time; the oldest are forgotten past this. */
const HIGHLIGHTED_KEPT = 64;

function idsParse(value: unknown): ReadonlySet<string> {
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((entry): entry is string => typeof entry === "string"));
}

function savedParse(value: unknown): HappyAgentOnboardingFocusSnapshot {
    if (typeof value !== "object" || value === null) return NONE;
    const saved = value as { readonly released?: unknown; readonly highlighted?: unknown };
    return { released: idsParse(saved.released), highlighted: idsParse(saved.highlighted) };
}

export function happyAgentOnboardingFocusStoreCreate(
    persistence?: HappyAgentOnboardingFocusPersistence,
): HappyAgentOnboardingFocusStore {
    let snapshot: HappyAgentOnboardingFocusSnapshot;
    try {
        snapshot = savedParse(persistence?.read());
    } catch {
        snapshot = NONE;
    }
    const listeners = new Set<() => void>();
    const save = (next: HappyAgentOnboardingFocusSnapshot): void => {
        snapshot = next;
        try {
            persistence?.write({
                released: [...next.released],
                highlighted: [...next.highlighted].slice(-HIGHLIGHTED_KEPT),
            });
        } catch {
            // Denied storage still keeps this until the window closes.
        }
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        focusRelease(happyAgentId) {
            if (snapshot.released.has(happyAgentId)) return;
            save({ ...snapshot, released: new Set([...snapshot.released, happyAgentId]) });
        },
        taskHighlightEnd(taskId) {
            if (snapshot.highlighted.has(taskId)) return;
            save({ ...snapshot, highlighted: new Set([...snapshot.highlighted, taskId]) });
        },
    };
}

/** A window that takes no onboarding focus, for surfaces with no host behind them. */
export const happyAgentOnboardingFocusStoreNoop: HappyAgentOnboardingFocusStore = {
    get: () => NONE,
    subscribe: () => () => undefined,
    focusRelease: () => undefined,
    taskHighlightEnd: () => undefined,
};

/**
 * Whether a setup's onboarding holds its window: the conversation it runs in
 * has started and neither started a first task nor finished, or a step of its
 * own setup comes first, and the person hasn't let it go. Requirements met is
 * not the end: the conversation holds the window until its flow says it
 * finished. Classic setup, where there is no such conversation, holds nothing.
 */
export function happyAgentOnboardingFocused(input: {
    readonly onboarding: HappyAgentOnboardingSnapshot;
    readonly chatOnboarding: HappyAgentChatOnboardingSnapshot;
    readonly released: boolean;
}): boolean {
    if (input.released) return false;
    const state = input.onboarding.state;
    const flow = input.chatOnboarding.flow;
    if (input.chatOnboarding.status === "available" && flow !== undefined) {
        // Once the first task starts, onboarding carries on in the app, where
        // "under Tasks in your sidebar" names a row the person can see.
        if ((flow.firstTasks?.length ?? 0) > 0) return false;
        // A flow not started yet is owed one unless onboarding is complete.
        return flow.status === "not_started"
            ? state !== undefined && !state.completed
            : flow.status !== "finished";
    }
    // A daemon or server with no conversation to run it in sets up the classic
    // way and opens the app; there is nothing to hold the window for.
    if (input.chatOnboarding.status === "unsupported") return false;
    return state !== undefined && !state.completed && state.member?.completed !== true;
}

/**
 * Whether focus offers "Skip setup": where the flow says, and otherwise
 * always, as for a server that doesn't say.
 */
export function happyAgentOnboardingSkippable(snapshot: HappyAgentChatOnboardingSnapshot): boolean {
    return snapshot.flow?.skippable ?? true;
}

/**
 * The first tasks whose sidebar rows the window points at once as it lets go,
 * by task ID, oldest first: each the flow lists that hasn't been pointed at.
 */
export function happyAgentOnboardingTaskHighlights(input: {
    readonly chatOnboarding: HappyAgentChatOnboardingSnapshot;
    readonly highlighted: ReadonlySet<string>;
}): readonly string[] {
    return (input.chatOnboarding.flow?.firstTasks ?? [])
        .filter((task) => !input.highlighted.has(task.id))
        .map((task) => task.id);
}
