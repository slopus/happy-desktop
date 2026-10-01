/** The service-tier vocabulary Happy exposes to product state and UI. */
export type HappyAgentServiceTier = "fast" | "ultrafast";

/** The OpenAI/Codex tier name published by Happy Agent's wire contract. */
const HAPPY_AGENT_FAST_SERVICE_TIER = "priority";

/** Projects one daemon service tier into Happy's closed product vocabulary. */
export function happyAgentServiceTierFromWire(
    value: string | null | undefined,
): HappyAgentServiceTier | undefined {
    if (value === HAPPY_AGENT_FAST_SERVICE_TIER) return "fast";
    return value === "ultrafast" ? "ultrafast" : undefined;
}

/** Projects a daemon capability list without leaking unknown wire tiers. */
export function happyAgentServiceTiersFromWire(values: readonly string[]): HappyAgentServiceTier[] {
    return [
        ...(values.includes(HAPPY_AGENT_FAST_SERVICE_TIER) ? ["fast" as const] : []),
        ...(values.includes("ultrafast") ? ["ultrafast" as const] : []),
    ];
}

/** Projects Happy's service-tier selection into the daemon's wire vocabulary. */
export function happyAgentServiceTierToWire(
    value: HappyAgentServiceTier | undefined,
): "priority" | "ultrafast" | null {
    if (value === "fast") return HAPPY_AGENT_FAST_SERVICE_TIER;
    return value === "ultrafast" ? "ultrafast" : null;
}
