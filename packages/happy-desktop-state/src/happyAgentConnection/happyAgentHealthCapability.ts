import type { HappyAgentHealth } from "./happyAgentSync.js";

/**
 * Capabilities a surface gates on: artifact covers, a feed read for some kinds
 * of subject only, Gen UI secret forms, plugins, payments, pipelines, and the
 * team's handbook.
 */
export type HappyAgentHealthCapabilityName =
    | "artifactCovers"
    | "feedSubjectFilter"
    | "artifactSecretActions"
    | "plugins"
    | "payments"
    | "pipelines"
    | "handbook";

/** Whether this daemon said it can; a daemon that has not said, or has not answered yet, cannot. */
export function happyAgentHealthCapability(
    health: HappyAgentHealth | undefined,
    name: HappyAgentHealthCapabilityName,
): boolean {
    // Happy Cloud says some, such as `pipelines`, that the daemon's protocol does not name.
    const capabilities: Readonly<Record<string, unknown>> | undefined = health?.capabilities;
    return capabilities?.[name] === true;
}
