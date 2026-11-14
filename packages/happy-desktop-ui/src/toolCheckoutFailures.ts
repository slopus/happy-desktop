import type { ConversationToolCall } from "happy-desktop-state";

/**
 * The failed checkouts a tool call tells, one line each beneath its row: a
 * `checkout_repository` call's own failure in the server's sentence, which the
 * row already names, then every other failure the call ran into or reported,
 * named by repository and branch.
 */
export function toolCheckoutFailureLines(tool: ConversationToolCall): readonly string[] {
    const own =
        tool.presentation?.type === "checkout" && tool.presentation.error !== undefined
            ? [tool.presentation.error]
            : [];
    const others = (tool.checkoutFailures ?? []).map(
        (failure) => `${failure.repository} · ${failure.branch} — ${failure.error}`,
    );
    return [...own, ...others];
}
