import type {
    HappyAgentProviderUsageEntry,
    HappyAgentProviderUsageWindow,
} from "./happyAgentProviderUsageStore.js";
import type { HappyAgentModelCatalog } from "./happyAgentTypes.js";

/**
 * The account the conversation is on has spent its limit, so its next message
 * moves to `providerId`, on the same model. Nothing has changed on the Happy
 * Agent: the move is made with that message, and picking the spent account
 * again keeps it.
 */
export interface HappyAgentAccountSwitch {
    /** The spent account the conversation is on. */
    readonly fromProviderId: string;
    /** When the spent account starts over, in milliseconds, when its usage says. */
    readonly fromResetsAt?: number;
    /** The account its next message runs on. */
    readonly providerId: string;
}

/**
 * Until when a reading says the account cannot be used: a window is full, or
 * the vendor said every window is spent, and the moment it starts over has not
 * come. `null` when it is spent and that moment was never given; `undefined`
 * when it is not spent. A reset that has passed is not a limit any more, even
 * before a new reading confirms it.
 */
function usageSpentUntil(
    entry: HappyAgentProviderUsageEntry | undefined,
    now: number,
): number | null | undefined {
    const reading = entry?.usage;
    if (reading === undefined) return undefined;
    const windows = [reading.fiveHour, reading.weekly, reading.monthly].filter(
        (window): window is HappyAgentProviderUsageWindow => window !== undefined,
    );
    const holds = (window: HappyAgentProviderUsageWindow) =>
        window.resetsAt === undefined || window.resetsAt > now;
    const full = windows.filter((window) => window.usedPercent >= 100);
    // Spent with no full window, it waits on its fullest one.
    const blocking =
        full.length > 0 || reading.exhausted !== true
            ? full
            : [...windows].sort((left, right) => right.usedPercent - left.usedPercent).slice(0, 1);
    if (reading.exhausted === true && windows.length === 0) return null;
    const holding = blocking.filter(holds);
    if (holding.length === 0) return undefined;
    // It is usable again once every window holding it has started over.
    const resets = holding.map((window) => window.resetsAt);
    return resets.includes(undefined) ? null : Math.max(...(resets as number[]));
}

/** How much of the week, or else the session, an account has spent; absent with no reading. */
function usageUsed(entry: HappyAgentProviderUsageEntry | undefined): number | undefined {
    return (entry?.usage?.weekly ?? entry?.usage?.fiveHour)?.usedPercent;
}

/**
 * The account a conversation on a spent account should move to: another
 * account of the same service that offers the same model and has not spent
 * its own limit. The account picked last anywhere on this Happy Agent comes
 * first, since other conversations have already moved to it; then one with a
 * reading before one without, and the one with the most of its week left.
 * Ties keep catalog order. Nothing when the account is not spent or no other
 * can take the model.
 */
export function happyAgentAccountSwitchTarget(input: {
    readonly catalog: HappyAgentModelCatalog;
    readonly providerId: string;
    readonly modelId: string;
    readonly usage: readonly HappyAgentProviderUsageEntry[];
    readonly preferredProviderId?: string;
    readonly now: number;
}): HappyAgentAccountSwitch | undefined {
    const usageOf = (providerId: string) =>
        input.usage.find((entry) => entry.providerId === providerId);
    const current = input.catalog.providers.find((provider) => provider.id === input.providerId);
    if (current === undefined) return undefined;
    const spentUntil = usageSpentUntil(usageOf(current.id), input.now);
    if (spentUntil === undefined) return undefined;
    const candidates = input.catalog.providers.filter((provider) => {
        if (provider.id === current.id || provider.type !== current.type) return false;
        if (!provider.enabled || provider.hidden || provider.disabledReason !== undefined)
            return false;
        if (provider.aliasOf !== undefined || provider.hiddenModels.includes(input.modelId))
            return false;
        if (!provider.models.some((model) => model.id === input.modelId)) return false;
        const entry = usageOf(provider.id);
        return entry?.signIn !== "signed_out" && usageSpentUntil(entry, input.now) === undefined;
    });
    const rank = (providerId: string): readonly number[] => {
        const used = usageUsed(usageOf(providerId));
        return [
            providerId === input.preferredProviderId ? 0 : 1,
            used === undefined ? 1 : 0,
            used ?? 0,
        ];
    };
    let best: { readonly id: string; readonly rank: readonly number[] } | undefined;
    for (const provider of candidates) {
        const candidate = { id: provider.id, rank: rank(provider.id) };
        const at = best?.rank.findIndex((value, index) => value !== candidate.rank[index]) ?? -1;
        if (best === undefined || (at >= 0 && candidate.rank[at]! < best.rank[at]!))
            best = candidate;
    }
    if (best === undefined) return undefined;
    return {
        fromProviderId: current.id,
        ...(spentUntil === null ? {} : { fromResetsAt: spentUntil }),
        providerId: best.id,
    };
}
