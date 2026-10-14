/** The longest comparison branch the host accepts. */
const COMPARISON_BASE_MAXIMUM_LENGTH = 200;

/**
 * Why the host would refuse `value` as a worktree's comparison branch, or
 * nothing when it would accept it. The host applies the same rules and is the
 * authority; this only lets the refusal be said before anything is sent. A
 * branch that does not exist is not refused: the host falls back and says so.
 */
export function happyAgentComparisonBaseRefusal(value: string): string | undefined {
    if (value.length === 0) return "Enter a branch name.";
    if (value.length > COMPARISON_BASE_MAXIMUM_LENGTH)
        return `A branch name is at most ${String(COMPARISON_BASE_MAXIMUM_LENGTH)} characters.`;
    if (value.startsWith("-")) return "A branch name cannot start with “-”.";
    if (/[\s\p{Cc}]/u.test(value)) return "A branch name cannot contain spaces.";
    return undefined;
}
