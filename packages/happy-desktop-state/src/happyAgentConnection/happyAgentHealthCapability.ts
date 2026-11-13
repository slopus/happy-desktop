import type { HappyAgentHealth } from "./happyAgentSync.js";

/**
 * Capabilities a surface gates on: artifact covers, a feed read for some kinds
 * of subject only, Gen UI secret forms, and plugins.
 */
export type HappyAgentHealthCapabilityName =
    | "artifactCovers"
    | "feedSubjectFilter"
    | "artifactSecretActions"
    | "plugins";

/** Whether this daemon said it can; a daemon that has not said, or has not answered yet, cannot. */
export function happyAgentHealthCapability(
    health: HappyAgentHealth | undefined,
    name: HappyAgentHealthCapabilityName,
): boolean {
    return health?.capabilities?.[name] === true;
}
