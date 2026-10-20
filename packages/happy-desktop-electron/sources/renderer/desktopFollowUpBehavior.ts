import type { FollowUpBehaviorDocument, FollowUpBehaviorPersistence } from "happy-desktop-state";

const FOLLOW_UP_BEHAVIOR_KEY = "happy.follow-up-behavior.v1";

/**
 * Where this machine remembers what Enter and Command+Enter do to a message sent
 * while the agent works. It is the window's own storage, like the experiments
 * switch: the choice is about how this person writes, so it applies to every
 * Happy Agent the window addresses and survives any of them going away.
 */
export function desktopFollowUpBehaviorPersistence(): FollowUpBehaviorPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(FOLLOW_UP_BEHAVIOR_KEY);
                return value ? (JSON.parse(value) as FollowUpBehaviorDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(FOLLOW_UP_BEHAVIOR_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still honours the choice for as long
                // as the window stays open.
            }
        },
    };
}
