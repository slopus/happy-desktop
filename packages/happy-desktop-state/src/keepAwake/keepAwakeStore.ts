/**
 * The keep-awake surface: whether this computer is being held out of system
 * sleep, and why.
 *
 * It exists because the choice is product state, not React state: the sidebar
 * footer's control renders one snapshot of it, and the host that actually holds
 * the machine awake follows the same snapshot. Keeping it here also keeps the
 * selection out of the application layer, which may not own React state.
 *
 * Following the state principles, the constructor opens nothing. Whether an
 * agent is working is observed only while the store has a subscriber and only
 * while the mode actually depends on it, so a backgrounded surface does no work.
 */
export type KeepAwakeMode = "on" | "agent" | "off";

export interface KeepAwakeSnapshot {
    /** The user's selection. */
    readonly mode: KeepAwakeMode;
    /** Whether an agent this computer runs is working right now. */
    readonly agentWorking: boolean;
    /** Whether the computer is being held awake, after resolving `agent`. */
    readonly active: boolean;
}

export interface KeepAwakeStore {
    get(): KeepAwakeSnapshot;
    subscribe(listener: () => void): () => void;
    modeSelect(mode: KeepAwakeMode): void;
    [Symbol.dispose](): void;
}

/** What the `agent` mode resolves against: a live read of whether work is running. */
export interface KeepAwakeAgentWorkingSource {
    get(): boolean;
    subscribe(listener: () => void): () => void;
}

export interface KeepAwakeStoreOptions {
    /** Initial selection; defaults to following the agents. */
    readonly mode?: KeepAwakeMode;
    /**
     * Where the `agent` mode reads whether an agent is working. Absent, no
     * agent is ever working, so `agent` behaves as `off`.
     */
    readonly agentWorking?: KeepAwakeAgentWorkingSource;
}

const NO_AGENT: KeepAwakeAgentWorkingSource = {
    get: () => false,
    subscribe: () => () => undefined,
};

function activeResolve(mode: KeepAwakeMode, agentWorking: boolean): boolean {
    return mode === "on" || (mode === "agent" && agentWorking);
}

/**
 * Creates a keep-awake store. The agent-working source is injectable so tests
 * drive it deterministically. Listeners are notified only when the resolved
 * snapshot actually changes, so an agent starting while the mode ignores it is
 * not a notification.
 */
export function keepAwakeStoreCreate(options: KeepAwakeStoreOptions = {}): KeepAwakeStore {
    const source = options.agentWorking ?? NO_AGENT;
    const listeners = new Set<() => void>();
    let mode: KeepAwakeMode = options.mode ?? "agent";
    let snapshot: KeepAwakeSnapshot = {
        mode,
        agentWorking: source.get(),
        active: activeResolve(mode, source.get()),
    };
    let sourceUnsubscribe: (() => void) | undefined;
    let disposed = false;

    const publish = (): void => {
        const agentWorking = source.get();
        const active = activeResolve(mode, agentWorking);
        if (
            snapshot.mode === mode &&
            snapshot.agentWorking === agentWorking &&
            snapshot.active === active
        )
            return;
        snapshot = { mode, agentWorking, active };
        for (const listener of listeners) listener();
    };

    // The agents are only worth observing while a subscriber exists. They are
    // followed in every mode rather than only in `agent`, because the control
    // shows whether an agent is working beside the selection either way.
    const sourceWatchSync = (): void => {
        const wanted = listeners.size > 0 && !disposed;
        if (wanted && sourceUnsubscribe === undefined) sourceUnsubscribe = source.subscribe(publish);
        else if (!wanted && sourceUnsubscribe !== undefined) {
            sourceUnsubscribe();
            sourceUnsubscribe = undefined;
        }
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                // An agent may have started or finished while nothing was listening.
                publish();
                sourceWatchSync();
            }
            return () => {
                listeners.delete(listener);
                sourceWatchSync();
            };
        },
        modeSelect(next) {
            if (mode === next) return;
            mode = next;
            publish();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            sourceWatchSync();
        },
    };
}
