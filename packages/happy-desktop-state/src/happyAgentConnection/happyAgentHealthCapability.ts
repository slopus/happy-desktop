import type { HappyAgentHealth } from "./happyAgentSync.js";

/**
 * Capabilities a daemon reports that the pinned client's health schema does
 * not name yet: artifact covers, and a feed read for some kinds of subject
 * only. Bump the client and read them from its type once it does.
 */
export type HappyAgentHealthCapabilityLate = "artifactCovers" | "feedSubjectFilter";

/**
 * Whether this daemon said it can do something the pinned client does not
 * know of. The client hands the daemon's JSON over unparsed, so the flag is
 * read from the object as the daemon sent it; a daemon that has not said, or
 * has not answered yet, cannot.
 */
export function happyAgentHealthCapability(
    health: HappyAgentHealth | undefined,
    name: HappyAgentHealthCapabilityLate,
): boolean {
    const capabilities: object | undefined = health?.capabilities;
    return (
        capabilities !== undefined &&
        name in capabilities &&
        (capabilities as Readonly<Record<HappyAgentHealthCapabilityLate, unknown>>)[name] === true
    );
}
