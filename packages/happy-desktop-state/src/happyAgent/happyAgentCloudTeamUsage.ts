import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";

/** The permission that lets a member see the team's usage and spend, and each member's. */
const TEAM_USAGE = "usage.view_team";

/**
 * Whether the reader may see Happy Cloud's team usage. A server that doesn't
 * list the permission predates it and shows usage to everyone.
 */
export async function happyAgentCloudTeamUsageAllowed(
    request: HappyCloudRequest,
): Promise<boolean> {
    const answer = (await request("GET", "v0/permissions")) as
        | { readonly permissions?: unknown; readonly granted?: unknown }
        | undefined;
    const listed =
        Array.isArray(answer?.permissions) &&
        answer.permissions.some(
            (entry: unknown) =>
                typeof entry === "object" &&
                entry !== null &&
                (entry as { readonly id?: unknown }).id === TEAM_USAGE,
        );
    if (!listed) return true;
    return Array.isArray(answer?.granted) && answer.granted.includes(TEAM_USAGE);
}
