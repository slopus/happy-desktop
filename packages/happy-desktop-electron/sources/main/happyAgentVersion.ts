export type HappyAgentUpdateChannel = "stable" | "preview";

/** The release pipeline owns these identities; other prereleases are not updates. */
export function happyAgentVersionKind(version: string): "stable" | "preview" | "other" {
    if (/^\d+\.\d+\.\d+$/u.test(version)) return "stable";
    if (/^\d+\.\d+\.\d+-preview\.(?:0|[1-9]\d*)$/u.test(version)) return "preview";
    return "other";
}

export function happyAgentVersionAllowed(
    version: string,
    channel: HappyAgentUpdateChannel,
): boolean {
    const kind = happyAgentVersionKind(version);
    return kind === "stable" || (channel === "preview" && kind === "preview");
}

export function happyAgentVersionNewer(candidate: string, current: string): boolean {
    const left = versionParse(candidate);
    const right = versionParse(current);
    for (let index = 0; index < 3; index += 1) {
        if (left.core[index] !== right.core[index]) return left.core[index]! > right.core[index]!;
    }
    if (left.prerelease.length === 0 || right.prerelease.length === 0)
        return left.prerelease.length === 0 && right.prerelease.length > 0;
    for (
        let index = 0;
        index < Math.max(left.prerelease.length, right.prerelease.length);
        index += 1
    ) {
        const a = left.prerelease[index];
        const b = right.prerelease[index];
        if (a === undefined) return false;
        if (b === undefined) return true;
        if (a === b) continue;
        const numericA = /^\d+$/u.test(a);
        const numericB = /^\d+$/u.test(b);
        if (numericA && numericB) return BigInt(a) > BigInt(b);
        return numericA !== numericB ? !numericA : a > b;
    }
    return false;
}

function versionParse(version: string): { core: bigint[]; prerelease: string[] } {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(version);
    if (!match) throw new Error(`Happy Agent version is invalid: ${version}`);
    return {
        core: [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)],
        prerelease: match[4]?.split(".") ?? [],
    };
}
