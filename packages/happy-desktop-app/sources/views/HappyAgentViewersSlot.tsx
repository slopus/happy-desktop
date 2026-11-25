import { useSyncExternalStore } from "react";
import type {
    HappyAgentTargetViewersSnapshot,
    HappyAgentTargetViewersStore,
    HappyAgentViewerTarget,
    HappyAgentViewers,
} from "happy-desktop-state";
import { ViewerStack } from "happy-desktop-ui";

const UNAVAILABLE_SNAPSHOT: HappyAgentTargetViewersSnapshot = { status: "unavailable" };
const UNAVAILABLE: HappyAgentTargetViewersStore = {
    get: () => UNAVAILABLE_SNAPSHOT,
    subscribe: () => () => undefined,
};

/**
 * Who else is looking at one agent session or Surface, for its header.
 * Rendering it is what tells the Happy Agent the reader is looking too: its
 * subscription lasts exactly as long as the header is on screen.
 */
export function HappyAgentViewersSlot(props: {
    viewers: HappyAgentViewers | undefined;
    target: HappyAgentViewerTarget;
}) {
    const store = props.viewers?.target(props.target) ?? UNAVAILABLE;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    if (snapshot.status === "unavailable") return null;
    return (
        <ViewerStack
            now={snapshot.now}
            viewers={snapshot.viewers.map((viewer) => ({
                id: viewer.userId,
                name: viewer.name,
                ...(viewer.imageUrl === undefined ? {} : { imageUrl: viewer.imageUrl }),
                tier: viewer.tier,
                lastSeenAt: viewer.lastSeenAt,
                arrived: viewer.arrived,
            }))}
        />
    );
}
