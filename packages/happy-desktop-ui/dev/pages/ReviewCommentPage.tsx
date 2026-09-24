import { useState, type ReactNode } from "react";
import { ReviewComment } from "../../src/ReviewComment";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-282";
/*
 * The notes here are the kind people actually leave on a diff — a specific ask
 * about a named line — because the component's whole argument is that such a
 * remark is actionable where the same words in a composer are not. One runs to
 * several lines so the box is shown doing what it does with real prose.
 */
const SHORT = "This should use the existing helper instead of re-deriving the path.";
const LONG = [
    "This swallows the rejection, so a failed write looks exactly like a successful one.",
    "",
    "Keep the draft and state the reason where the reader already is.",
].join("\n");
/** The notes sit in a diff column, so a specimen gives them that measure. */
function column(children: ReactNode) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                width: "640px",
                background: "var(--surface)",
            }}
        >
            {children}
        </div>
    );
}
/** A note being written, wired to its own state so the specimen types back. */
function LiveDraft() {
    const [text, textSet] = useState("");
    return column(
        <ReviewComment
            authorInitials="KD"
            authorName="You"
            draft={text}
            lineNumber={16}
            onCancel={() => textSet("")}
            onDraftChange={textSet}
            onSubmit={() => textSet("")}
            side="additions"
        />,
    );
}
export function ReviewCommentPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One review note under the diff line it is about. Two states in one box — a note already written and a note being written — so committing one moves nothing. The place is stated on every note as L/R plus the line, and a note whose file has since changed says so rather than silently pointing at whatever now occupies that row."
            title="ReviewComment"
        >
            <Specimen
                detail="Right column, line 16 · the place is stated at the trailing edge"
                label="A note already written"
                number="01"
                stage="surface"
            >
                {column(
                    <ReviewComment
                        authorInitials="KD"
                        authorName="You"
                        lineNumber={16}
                        onRemove={() => undefined}
                        side="additions"
                        text={SHORT}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Several lines of prose, and a note on the left column of the diff"
                label="Longer, on a removed line"
                number="02"
                stage="surface"
            >
                {column(
                    <ReviewComment
                        authorInitials="KD"
                        authorName="You"
                        lineNumber={42}
                        onRemove={() => undefined}
                        side="deletions"
                        text={LONG}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Dashed edge and a warned place — still readable, still sendable"
                label="Written before the file changed"
                number="03"
                stage="surface"
            >
                {column(
                    <ReviewComment
                        authorInitials="KD"
                        authorName="You"
                        lineNumber={16}
                        onRemove={() => undefined}
                        side="additions"
                        stale
                        text={SHORT}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="No line: `lineNumber` 0 addresses the file rather than a row in it"
                label="A note on the file itself"
                number="04"
                stage="surface"
            >
                {column(
                    <ReviewComment
                        authorInitials="KD"
                        authorName="You"
                        lineNumber={0}
                        onRemove={() => undefined}
                        side="additions"
                        text="Worth splitting this file before it grows again."
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Commit is inert until something is typed, so neither control moves"
                label="Being written"
                number="05"
                stage="surface"
            >
                <LiveDraft />
            </Specimen>
        </ComponentPage>
    );
}
