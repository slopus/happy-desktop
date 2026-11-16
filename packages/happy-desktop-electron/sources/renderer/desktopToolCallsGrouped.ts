const TOOL_CALLS_GROUPED_KEY = "happy.tool-calls-grouped.v1";

/**
 * Group tool calls, kept in this machine's window storage beside Animated
 * avatars: how this window draws a transcript is nothing an account or a
 * Happy Agent holds. Off unless turned on.
 */
export const desktopToolCallsGrouped = {
    read(): boolean {
        try {
            return localStorage.getItem(TOOL_CALLS_GROUPED_KEY) === "true";
        } catch {
            return false;
        }
    },
    write(grouped: boolean): void {
        try {
            localStorage.setItem(TOOL_CALLS_GROUPED_KEY, String(grouped));
        } catch {
            // A storage-denied renderer keeps the choice for this window's lifetime.
        }
    },
};
