/** Text rendered by the compact trace control attached to message metadata. */
export function agentTraceMetaTitle(open: boolean | undefined): string {
    return open ? "Hide traces" : "View traces";
}

function agentTraceTokenCountFormat(value: number): string {
    if (value >= 1_000_000) {
        const scaled = value / 1_000_000;
        return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, "")}M`;
    }
    if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
    if (value >= 1_000) {
        const scaled = value / 1_000;
        return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, "")}k`;
    }
    return String(value);
}

/** Optional statistics rendered beside the trace-control title. */
export function agentTraceMetaStats(
    toolCallCount?: number,
    totalTokens?: number,
): string | undefined {
    const parts: string[] = [];
    if (toolCallCount !== undefined && toolCallCount > 0)
        parts.push(`${String(toolCallCount)} ${toolCallCount === 1 ? "tool" : "tools"}`);
    if (totalTokens !== undefined && totalTokens > 0)
        parts.push(`${agentTraceTokenCountFormat(totalTokens)} tokens`);
    return parts.length > 0 ? parts.join(" · ") : undefined;
}
