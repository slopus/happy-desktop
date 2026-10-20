import type { MessageDelivery } from "../types.js";

/**
 * What a message sent while the agent is working does: steer the run already
 * under way, or queue behind it. `steer` and `queue` name what plain Enter does,
 * with Command+Enter doing the other; the two `always` choices lock both keys to
 * one delivery. To an idle agent every choice is the same: the message is sent.
 */
export type FollowUpBehavior = "steer" | "queue" | "alwaysSteer" | "alwaysQueue";

/** The delivery each send gesture uses while the agent is working. */
export interface FollowUpDeliveries {
    /** Plain Enter, and the send button. */
    readonly plain: MessageDelivery;
    /** Command+Enter (Ctrl+Enter off macOS). */
    readonly command: MessageDelivery;
}

export function followUpDeliveries(behavior: FollowUpBehavior): FollowUpDeliveries {
    switch (behavior) {
        case "steer":
            return { plain: "steer", command: "queue" };
        case "queue":
            return { plain: "queue", command: "steer" };
        case "alwaysSteer":
            return { plain: "steer", command: "steer" };
        case "alwaysQueue":
            return { plain: "queue", command: "queue" };
    }
}

/**
 * It is the window's own choice, like the experiments switch: it is about how
 * this person writes, for every Happy Agent the window addresses, so it is kept
 * by the host's storage rather than by any machine the window connects to.
 *
 * The constructor opens nothing: it reads the host's record once, and writes
 * back only when the reader changes the setting.
 */
export interface FollowUpBehaviorDocument {
    readonly followUp: FollowUpBehavior;
}

/** Where the choice is kept. Omitting it keeps the choice for this window's lifetime only. */
export interface FollowUpBehaviorPersistence {
    read(): FollowUpBehaviorDocument | undefined;
    write(document: FollowUpBehaviorDocument): void;
}

export interface FollowUpBehaviorSnapshot {
    /** Enter steers and Command+Enter queues until the reader chooses otherwise. */
    readonly followUp: FollowUpBehavior;
}

export interface FollowUpBehaviorStore {
    get(): FollowUpBehaviorSnapshot;
    subscribe(listener: () => void): () => void;
    /** Chooses what each send key does while an agent is working, across this whole window. */
    followUpUpdate(followUp: FollowUpBehavior): void;
}

/**
 * A stored record read back as this window's own value. Anything that is not
 * the field this version knows is no record at all, since a person can edit the
 * host's storage by hand.
 */
function documentParse(value: unknown): FollowUpBehaviorDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const followUp = (value as { followUp?: unknown }).followUp;
    return followUp === "steer" ||
        followUp === "queue" ||
        followUp === "alwaysSteer" ||
        followUp === "alwaysQueue"
        ? { followUp }
        : undefined;
}

const STEER: FollowUpBehaviorSnapshot = { followUp: "steer" };

/** Creates the window-lifetime store, hydrated from the host's storage when it has one. */
export function followUpBehaviorStoreCreate(
    persistence?: FollowUpBehaviorPersistence,
): FollowUpBehaviorStore {
    let snapshot: FollowUpBehaviorSnapshot = (() => {
        try {
            return documentParse(persistence?.read()) ?? STEER;
        } catch {
            // Storage the host refused is a window with no record.
            return STEER;
        }
    })();
    const listeners = new Set<() => void>();

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        followUpUpdate(followUp) {
            if (snapshot.followUp === followUp) return;
            snapshot = { followUp };
            try {
                persistence?.write(snapshot);
            } catch {
                // Storage the host refused still keeps this window's choice for
                // as long as it stays open.
            }
            for (const listener of listeners) listener();
        },
    };
}

/** The store a host that remembers nothing stands in: Enter steers, Command+Enter queues. */
export const followUpBehaviorStoreNoop: FollowUpBehaviorStore = {
    get: () => STEER,
    followUpUpdate: () => {},
    subscribe: () => () => {},
};
