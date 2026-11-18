/**
 * Machine-local settings have no Cloud counterpart, including direct links.
 * An enterprise server keeps Mobile access, where phones scan its code.
 */
export function happyAgentSettingsCategoryAvailable(
    section: string,
    happyCloud: boolean,
    enterprise = false,
): boolean {
    if (!happyCloud) return true;
    if (enterprise && section === "mobile-access") return true;
    return !["experimental", "debug", "file-tiers", "mobile-access", "voice"].includes(section);
}
