import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { TextField } from "./TextField";

/** Which column of a diff a note is attached to. */
export type ReviewCommentSide = "deletions" | "additions";

export type ReviewCommentProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Who left it. Initials only — this is the reader's own note, not a thread. */
    authorInitials: string;
    authorName: string;
    /** The line it is attached to. `0` addresses the file rather than a line. */
    lineNumber: number;
    side: ReviewCommentSide;
    /**
     * The note was written against text that has since changed, so its line no
     * longer describes what is on screen.
     */
    stale?: boolean;
} & (
    | {
          /** A note already written. */
          text: string;
          onRemove?: () => void;
          draft?: never;
          onDraftChange?: never;
          onSubmit?: never;
          onCancel?: never;
      }
    | {
          /** A note being written. */
          draft: string;
          onDraftChange: (text: string) => void;
          onSubmit: () => void;
          onCancel: () => void;
          text?: never;
          onRemove?: never;
      }
);

/**
 * Where a note sits, said the way a reader would say it: `R16` is line 16 of
 * the right-hand column, `L16` of the left. A note on the file itself has no
 * line, so it says so rather than claiming line zero.
 */
export function reviewCommentPlace(lineNumber: number, side: ReviewCommentSide): string {
    if (lineNumber === 0) return "this file";
    return `line ${side === "deletions" ? "L" : "R"}${String(lineNumber)}`;
}

/**
 * C-282 ReviewComment — one review note on a line of a diff, or on the file.
 *
 * It renders inside the diff, under the line it is about. That placement is the
 * feature: a remark about a named line is something an agent can act on, where
 * the same words typed into a composer are a description of a place the reader
 * then has to hope was understood.
 *
 * Two states, one component: a note that has been written, and one being
 * written. They are the same box in the same place so that committing a note
 * does not move anything.
 *
 * Props only. The caller owns the notes, the draft, and what submitting means.
 */
export function ReviewComment(props: ReviewCommentProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "authorInitials",
        "authorName",
        "lineNumber",
        "side",
        "stale",
        "text",
        "onRemove",
        "draft",
        "onDraftChange",
        "onSubmit",
        "onCancel",
    ]);
    const writing = local.onDraftChange !== undefined;
    const place = reviewCommentPlace(local.lineNumber, local.side);
    return (
        <section
            className={["happy-review-comment", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="review-comment"
            data-stale={local.stale ? "" : undefined}
            data-testid={local["data-testid"]}
            data-writing={writing ? "" : undefined}
            style={local.style}
        >
            <header className="happy-review-comment__header">
                <Avatar initials={local.authorInitials} size="sm" />
                <span className="happy-review-comment__author">{local.authorName}</span>
                <span
                    className="happy-review-comment__place"
                    data-happy-desktop-ui="review-comment-place"
                >
                    {/* Stated on every note, written or not. A reader looking at
                        several of them needs to know which line each is about
                        without tracing it back up the column. */}
                    {local.stale
                        ? `Local comment on ${place}, before the file changed`
                        : `Local comment on ${place}`}
                </span>
                {local.onRemove ? (
                    <Button
                        aria-label="Remove this comment"
                        icon="close"
                        iconOnly
                        onClick={() => local.onRemove?.()}
                        size="small"
                        variant="ghost"
                    />
                ) : null}
            </header>
            {writing ? (
                <>
                    <TextField
                        aria-label={`Comment on ${place}`}
                        autoFocus
                        className="happy-review-comment__field"
                        multiline
                        onValueChange={(value) => local.onDraftChange?.(value)}
                        placeholder="Request a change"
                        rows={2}
                        value={local.draft ?? ""}
                    />
                    <div className="happy-review-comment__actions">
                        <Button onClick={() => local.onCancel?.()} size="small" variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            /* Empty is not a comment. The control stays visible
                               and inert rather than appearing once something has
                               been typed, which would move the other one. */
                            disabled={(local.draft ?? "").trim() === ""}
                            onClick={() => local.onSubmit?.()}
                            size="small"
                            variant="secondary"
                        >
                            Comment
                        </Button>
                    </div>
                </>
            ) : (
                <p className="happy-review-comment__text">{local.text}</p>
            )}
        </section>
    );
}
