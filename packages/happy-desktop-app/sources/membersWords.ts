import type { HappyAgentMembersSnapshot } from "happy-desktop-state";

/** A role's name on this server, or its ID while the roles are unread. */
export function membersRoleName(members: HappyAgentMembersSnapshot, roleId: string): string {
    return members.roles.find((role) => role.id === roleId)?.name ?? roleId;
}

/** "Expires in 3 days", "Expires in 5 hours" or "Expires soon". */
export function membersExpiresText(expiresAt: number): string {
    const hours = Math.floor((expiresAt - Date.now()) / 3_600_000);
    if (hours >= 48) return `Expires in ${String(Math.floor(hours / 24))} days`;
    if (hours >= 2) return `Expires in ${String(hours)} hours`;
    return "Expires soon";
}

/** "Joined Nov 8". */
export function membersJoinedText(joinedAt: number): string {
    return `Joined ${new Date(joinedAt).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

/** "Used once" or "Used 3 times", nothing for a code nobody has used. */
export function membersUsesText(uses: number): string | undefined {
    if (uses === 0) return undefined;
    return uses === 1 ? "Used once" : `Used ${String(uses)} times`;
}
