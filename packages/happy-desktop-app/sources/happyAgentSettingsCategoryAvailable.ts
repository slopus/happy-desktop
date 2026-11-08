/** Machine-local settings have no Cloud counterpart, including direct links. */
export function happyAgentSettingsCategoryAvailable(section: string, happyCloud: boolean): boolean {
    if (!happyCloud) return true;
    return !["experimental", "debug", "servers", "file-tiers", "mobile-access"].includes(section);
}
