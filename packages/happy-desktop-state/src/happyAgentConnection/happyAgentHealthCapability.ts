import type { HappyAgentHealth } from "./happyAgentSync.js";

/** Capabilities a surface gates on: artifact covers, and a feed read for some kinds of subject only. */
export type HappyAgentHealthCapabilityName = "artifactCovers" | "feedSubjectFilter";

/** Whether this daemon said it can; a daemon that has not said, or has not answered yet, cannot. */
export function happyAgentHealthCapability(
    health: HappyAgentHealth | undefined,
    name: HappyAgentHealthCapabilityName,
): boolean {
    return health?.capabilities?.[name] === true;
}
