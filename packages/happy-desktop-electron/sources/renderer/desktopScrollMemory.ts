import type {
    HappyAgentScrollMemoryDocument,
    HappyAgentScrollMemoryPersistence,
} from "happy-desktop-state";
import { desktopSettledStorageCreate } from "./desktopSettledStorage";

const SCROLL_MEMORY_PREFIX = "happy.happy-agent.scroll-memory.v1:";

/**
 * Where this window remembers the place the reader left each conversation of
 * one Happy Agent, so a restart reopens a conversation read part way up where
 * it was rather than at its newest message.
 *
 * Scrolling reports a new place every frame, so it is written at most once
 * every 250 ms while scrolling, and right away when the window is hidden. One
 * instance per Happy Agent, for the same reason the view preferences are
 * shared: a second one would race the first's writes.
 */
const shared = new Map<string, HappyAgentScrollMemoryPersistence>();
export function desktopScrollMemoryPersistence(
    happyAgentId: string,
): HappyAgentScrollMemoryPersistence {
    let persistence = shared.get(happyAgentId);
    if (!persistence) {
        persistence = desktopSettledStorageCreate<HappyAgentScrollMemoryDocument>(
            `${SCROLL_MEMORY_PREFIX}${happyAgentId}`,
        );
        shared.set(happyAgentId, persistence);
    }
    return persistence;
}
