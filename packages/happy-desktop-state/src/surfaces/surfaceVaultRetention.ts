import { DEFAULT_VAULT_RETENTION } from "@slopus/happy-agent-client";
import type { HappyAgentVaultRetention } from "./surfaceVaultTypes.js";

/** The named policies the settings offer, in order; any other policy is `custom`. */
export type HappyAgentVaultRetentionPreset = "timeMachine" | "everything" | "lastTen" | "custom";

/**
 * Each preset's versions. A preset covers every field but `trashDays`, which
 * is the reader's own and is kept across presets.
 */
export const HAPPY_AGENT_VAULT_RETENTION_PRESETS: Readonly<
    Record<Exclude<HappyAgentVaultRetentionPreset, "custom">, HappyAgentVaultRetention>
> = {
    // The daemon's default for a new vault.
    timeMachine: DEFAULT_VAULT_RETENTION,
    everything: {
        maxVersions: null,
        maxAgeDays: null,
        keepAllDays: 0,
        thinning: [],
        trashDays: 30,
    },
    lastTen: { maxVersions: 10, maxAgeDays: null, keepAllDays: 0, thinning: [], trashDays: 30 },
};

/** The preset a policy's versions match, whatever its Trash duration. */
export function happyAgentVaultRetentionPreset(
    retention: HappyAgentVaultRetention,
): HappyAgentVaultRetentionPreset {
    for (const [name, preset] of Object.entries(HAPPY_AGENT_VAULT_RETENTION_PRESETS))
        if (happyAgentVaultRetentionVersionsEqual(retention, preset))
            return name as Exclude<HappyAgentVaultRetentionPreset, "custom">;
    return "custom";
}

/** A preset's versions with the Trash duration the policy already has. */
export function happyAgentVaultRetentionPresetApply(
    retention: HappyAgentVaultRetention,
    preset: Exclude<HappyAgentVaultRetentionPreset, "custom">,
): HappyAgentVaultRetention {
    return { ...HAPPY_AGENT_VAULT_RETENTION_PRESETS[preset], trashDays: retention.trashDays };
}

function happyAgentVaultRetentionVersionsEqual(
    left: HappyAgentVaultRetention,
    right: HappyAgentVaultRetention,
): boolean {
    return (
        left.maxVersions === right.maxVersions &&
        left.maxAgeDays === right.maxAgeDays &&
        left.keepAllDays === right.keepAllDays &&
        left.thinning.length === right.thinning.length &&
        left.thinning.every(
            (tier, index) =>
                tier.afterDays === right.thinning[index]!.afterDays &&
                tier.everyDays === right.thinning[index]!.everyDays,
        )
    );
}

export function happyAgentVaultRetentionEqual(
    left: HappyAgentVaultRetention,
    right: HappyAgentVaultRetention,
): boolean {
    return happyAgentVaultRetentionVersionsEqual(left, right) && left.trashDays === right.trashDays;
}

/**
 * Why the daemon would refuse a policy, in words for the reader, or
 * `undefined` when it would take it. The bounds are the daemon's.
 */
export function happyAgentVaultRetentionProblem(
    retention: HappyAgentVaultRetention,
): string | undefined {
    const whole = (value: number, min: number, max: number) =>
        Number.isInteger(value) && value >= min && value <= max;
    if (retention.maxVersions !== null && !whole(retention.maxVersions, 1, 10_000))
        return "Keep between 1 and 10,000 versions.";
    if (retention.maxAgeDays !== null && !whole(retention.maxAgeDays, 1, 36_500))
        return "Drop versions after 1 to 36,500 days.";
    if (!whole(retention.keepAllDays, 0, 36_500)) return "Keep every version for 0 to 36,500 days.";
    if (retention.thinning.length > 8) return "Use at most 8 thinning steps.";
    let after = -1;
    for (const tier of retention.thinning) {
        if (!whole(tier.afterDays, 0, 36_500)) return "Start each step after 0 to 36,500 days.";
        if (!whole(tier.everyDays, 1, 3_650)) return "Keep one version every 1 to 3,650 days.";
        if (tier.afterDays <= after) return "Each step must start later than the one before it.";
        after = tier.afterDays;
    }
    if (retention.trashDays !== null && !whole(retention.trashDays, 1, 3_650))
        return "Keep the Trash for 1 to 3,650 days.";
    return undefined;
}
