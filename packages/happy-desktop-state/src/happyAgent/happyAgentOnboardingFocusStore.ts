import type { HappyAgentChatOnboardingSnapshot } from "./happyAgentChatOnboardingStore.js";
import type { HappyAgentOnboardingSnapshot } from "./happyAgentOnboardingStore.js";

/**
 * Experimental onboarding's focus: while a setup's onboarding runs, the window
 * shows that setup alone, with no rail and no sidebar, until its flow finishes
 * or the person presses "Skip setup". A skip is kept per setup, so a relaunch
 * keeps the app layout; a relaunch before one returns to focus.
 */
export interface HappyAgentOnboardingFocusSnapshot {
    /** The setups, by Happy Agent ID, the person let go of with "Skip setup". */
    readonly released: ReadonlySet<string>;
}

export interface HappyAgentOnboardingFocusPersistence {
    read(): unknown;
    write(released: readonly string[]): void;
}

export interface HappyAgentOnboardingFocusStore {
    get(): HappyAgentOnboardingFocusSnapshot;
    subscribe(listener: () => void): () => void;
    /** Lets one setup go for good: its window keeps the app layout from now on. */
    focusRelease(happyAgentId: string): void;
}

const NONE: HappyAgentOnboardingFocusSnapshot = { released: new Set() };

function releasedParse(value: unknown): ReadonlySet<string> {
    if (!Array.isArray(value)) return NONE.released;
    return new Set(value.filter((entry): entry is string => typeof entry === "string"));
}

export function happyAgentOnboardingFocusStoreCreate(
    persistence?: HappyAgentOnboardingFocusPersistence,
): HappyAgentOnboardingFocusStore {
    let snapshot: HappyAgentOnboardingFocusSnapshot;
    try {
        snapshot = { released: releasedParse(persistence?.read()) };
    } catch {
        snapshot = NONE;
    }
    const listeners = new Set<() => void>();
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
            snapshot = { released: new Set([...snapshot.released, happyAgentId]) };
            try {
                persistence?.write([...snapshot.released]);
            } catch {
                // Denied storage still lets this setup go until the window closes.
            }
            for (const listener of listeners) listener();
        },
    };
}

/** A window that takes no onboarding focus, for surfaces with no host behind them. */
export const happyAgentOnboardingFocusStoreNoop: HappyAgentOnboardingFocusStore = {
    get: () => NONE,
    subscribe: () => () => undefined,
    focusRelease: () => undefined,
};

/**
 * Whether a setup's onboarding holds its window: the conversation it runs in
 * has started and not finished, or a step of its own setup comes first, and
 * the person hasn't let it go. Requirements met is not the end: the
 * conversation holds the window until its flow says it finished.
 */
export function happyAgentOnboardingFocused(input: {
    readonly onboarding: HappyAgentOnboardingSnapshot;
    readonly chatOnboarding: HappyAgentChatOnboardingSnapshot;
    readonly released: boolean;
}): boolean {
    if (input.released) return false;
    const state = input.onboarding.state;
    const flow = input.chatOnboarding.flow;
    if (input.chatOnboarding.status === "available" && flow !== undefined)
        // A flow not started yet is owed one unless onboarding is complete.
        return flow.status === "not_started"
            ? state !== undefined && !state.completed
            : flow.status !== "finished";
    return state !== undefined && !state.completed && state.member?.completed !== true;
}

/**
 * Whether focus offers "Skip setup": where the flow says, and otherwise
 * always, as for a server that doesn't say.
 */
export function happyAgentOnboardingSkippable(snapshot: HappyAgentChatOnboardingSnapshot): boolean {
    return snapshot.flow?.skippable ?? true;
}
