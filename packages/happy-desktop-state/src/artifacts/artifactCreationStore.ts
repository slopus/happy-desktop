import type { UserError } from "../types.js";

export interface HappyAgentArtifactCreationSnapshot {
    /**
     * Why the last new artifact could not be made. It stays until the reader
     * puts it away or asks for another one.
     */
    readonly failure?: UserError;
}

/**
 * What became of the reader's last request for a new artifact. Making one is
 * asked for from a row that goes away when it works, so a refusal has to be
 * kept somewhere a surface can say it: without this the row simply does
 * nothing.
 */
export interface HappyAgentArtifactCreationStore {
    get(): HappyAgentArtifactCreationSnapshot;
    subscribe(listener: () => void): () => void;
    /** Puts the failure away. */
    failureDismiss(): void;
}

export interface HappyAgentArtifactCreation {
    readonly store: HappyAgentArtifactCreationStore;
    /** A new artifact was asked for: what the last one came to no longer stands. */
    started(): void;
    /** Happy Agent did not make the artifact. */
    failed(error: UserError): void;
    [Symbol.dispose](): void;
}

const NOTHING: HappyAgentArtifactCreationSnapshot = {};

export function happyAgentArtifactCreationCreate(): HappyAgentArtifactCreation {
    const listeners = new Set<() => void>();
    let snapshot = NOTHING;
    let disposed = false;
    const set = (next: HappyAgentArtifactCreationSnapshot): void => {
        if (disposed || next === snapshot) return;
        snapshot = next;
        for (const listener of [...listeners]) listener();
    };
    return {
        store: {
            get: () => snapshot,
            subscribe(listener) {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            },
            failureDismiss: () => set(NOTHING),
        },
        started: () => set(NOTHING),
        failed: (failure) => set({ failure }),
        [Symbol.dispose]() {
            disposed = true;
            snapshot = NOTHING;
            listeners.clear();
        },
    };
}
