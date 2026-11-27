/** Where a question prompt is shown: the transcript card or a flat list. */
export type HappyAgentUserInputPromptVariant = "card" | "flat";

/**
 * Where the reply to a written question is typed: this conversation's own
 * message box, its chat opened from a list, or the subtask that asked it,
 * opened from its card in the parent's conversation.
 */
export type HappyAgentUserInputReplyPlace = "messageBox" | "chat" | "subtask";

/**
 * The line beside a question's name: how many of its options may be taken, so
 * the rule is read before the options rather than discovered by clicking one.
 * An optional question says so too: nothing under it is holding the submit
 * back. A settled question keeps the same words, so answering it changes
 * nothing about its card's size. The prompt and its modeled row height read
 * the same words.
 */
export function userInputRuleText(
    question: {
        readonly multiSelect: boolean;
        readonly required: boolean;
        readonly options: readonly unknown[];
    },
    replyPlace: HappyAgentUserInputReplyPlace,
): string {
    const count =
        question.options.length === 0
            ? replyPlace === "messageBox"
                ? "Reply in the message box"
                : replyPlace === "chat"
                  ? "Open chat to reply"
                  : "Open subtask to reply"
            : question.multiSelect
              ? "Choose any"
              : "Choose one";
    return question.required ? count : `${count} · optional`;
}
