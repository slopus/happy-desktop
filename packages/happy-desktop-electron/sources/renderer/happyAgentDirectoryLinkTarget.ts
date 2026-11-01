import type { HappyLinkTarget } from "happy-desktop-state";
import type { HappyAgentDirectorySnapshot } from "./happyAgentDirectoryStore";

/**
 * Where an instance link stands in this window: on the connection whose own
 * health named that instance, live or not yet. A connection that has not said
 * which instance it is leaves the answer open; only once every one has said is
 * an instance no connection names unknown.
 */
export function happyAgentDirectoryLinkTarget(
    snapshot: HappyAgentDirectorySnapshot,
    instanceId: string,
): HappyLinkTarget {
    const entry = snapshot.happyAgents.find((candidate) => candidate.instanceId === instanceId);
    if (entry)
        return entry.status === "connected" && entry.session
            ? { kind: "live", happyAgentId: entry.id }
            : { kind: "waiting", label: entry.label };
    return snapshot.happyAgents.some((candidate) => candidate.instanceId === undefined)
        ? { kind: "undetermined" }
        : { kind: "unknown" };
}
