import { type ConversationAuthor } from "happy-desktop-state";

/**
 * How a message body is read. An agent's reply is Markdown; a person's message
 * is shown exactly as they typed it, with no Markdown, links, or reflowing.
 */
export type MessageBodyFormat = "markdown" | "plain";

/** An agent writes Markdown; anyone else is read exactly as typed. */
export function messageBodyFormat(sender: ConversationAuthor | undefined): MessageBodyFormat {
    return sender?.kind === "agent" ? "markdown" : "plain";
}

/**
 * The text a plain body paints, shared by the renderer and the row-height
 * model. Normalize line endings as CSS does; preserve every space, tab, and
 * blank line so selecting the message retains the original text.
 */
export function messagePlainTextNormalize(text: string): string {
    return text.replace(/\r\n?/gu, "\n");
}

/** The labels of a compact plain body's fold control, shared with the row-height model. */
export const MESSAGE_PLAIN_FOLD_LABELS = { closed: "Show full", open: "Show less" } as const;
