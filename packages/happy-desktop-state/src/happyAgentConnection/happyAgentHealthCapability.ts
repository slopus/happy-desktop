import type { HappyAgentHealth } from "./happyAgentSync.js";

/**
 * Capabilities a surface gates on: artifact covers, a feed read for some kinds
 * of subject only, Gen UI secret forms, Gen UI plugin setup reports, plugins, payments, pipelines, feature
 * plugins, provider sign-in, the repositories of joined tasks, who else
 * views a target, and the team's handbook.
 */
export type HappyAgentHealthCapabilityName =
    | "artifactCovers"
    | "feedSubjectFilter"
    | "artifactSecretActions"
    | "artifactPluginActions"
    | "plugins"
    | "payments"
    | "pipelines"
    | "features"
    | "providerSignIn"
    | "taskRepositories"
    | "viewers"
    | "handbook";

/** Whether this daemon said it can; a daemon that has not said, or has not answered yet, cannot. */
export function happyAgentHealthCapability(
    health: HappyAgentHealth | undefined,
    name: HappyAgentHealthCapabilityName,
): boolean {
    // Happy Cloud says some, such as `pipelines`, that the daemon's protocol does not name, and
    // the daemon says `viewers` before the published protocol names it.
    const capabilities: Readonly<Record<string, unknown>> | undefined = health?.capabilities;
    return capabilities?.[name] === true;
}
