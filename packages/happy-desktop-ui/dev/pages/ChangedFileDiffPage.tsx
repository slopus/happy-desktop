import { type ReactNode, useState } from "react";
import { ChangedFileDiff } from "../../src/ChangedFileDiff";
import { CodeEditor } from "../../src/CodeEditor";
import { FilePreview } from "../../src/FilePreview";
import { TabbedPane } from "../../src/TabbedPane";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-237";

const oldContent = `# File viewer

Opening a file shows the file. A Markdown document renders as prose.

- Images and video play in place
- Anything else says so plainly
`;

const newContent = `# File viewer

Opening a file shows the file. A Markdown document renders as prose, in the
same type the rest of the product renders Markdown in.

- Images and video play in place
- Source and configuration read as code
- Anything else says so plainly

> A preview that crops has answered a different question than the one asked.
`;

const source = `/** How long a recording has run, as a reader says it. */
export function elapsed(seconds: number): string {
    const whole = Math.max(Math.floor(seconds), 0);
    const minutes = Math.floor(whole / 60);
    const rest = String(whole % 60).padStart(2, "0");
    return \`\${String(minutes)}:\${rest}\`;
}
`;

const sourceBefore = `/** How long a recording has run, as a reader says it. */
export function elapsed(seconds: number): string {
    return String(Math.floor(seconds));
}
`;

const wideBefore = `/** One sentence, kept on one line the way configuration prose often is. */
export const guidance = "Workspace writes stay inside the checkout.";
`;

const wide = `/** One sentence, kept on one line the way configuration prose often is. */
export const guidance = "Workspace writes stay inside the checkout, its Git control directory, and temporary directories; everything else on the host is readable but never writable, and outbound network access flows through the managed proxy alone.";
`;

/** The preview a host hands in: the product's own file surface, over one file. */
function preview(path: string, text: string) {
    return <FilePreview content={{ type: "text", text }} path={path} />;
}

/**
 * The same surface where the checkout can be written: the file's characters are
 * the editor rather than a second read-only copy of them. This is what the
 * product hands in for a writable file, and why there is no editing mode beside
 * this one.
 */
function EditableFile(props: { path: string; text: string }) {
    const [text, textSet] = useState(props.text);
    return (
        <ChangedFileDiff
            appearance="light"
            mode="file"
            newContent={text}
            oldContent={sourceBefore}
            onContentChange={textSet}
            onSave={() => undefined}
            path={props.path}
            preview={
                <FilePreview
                    content={{ type: "text", text }}
                    editor={
                        <CodeEditor
                            className="happy-changed-file-editor"
                            name={props.path}
                            onValueChange={textSet}
                            value={text}
                        />
                    }
                    path={props.path}
                />
            }
        />
    );
}

/* The diff renderer is told which appearance to draw in, so each specimen pins
   the face it names rather than following the workbench and disagreeing with
   the surface underneath it. */
function frame(children: ReactNode, height = 420, appearance: "dark" | "light" = "light") {
    return (
        <div
            className={appearance === "dark" ? "happy-theme-dark" : "happy-theme-light"}
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                height: `${height}px`,
                overflow: "hidden",
                width: "720px",
            }}
        >
            {children}
        </div>
    );
}

/** The real three-layer file surface, used twice so Preview and Pierre can be
 * compared without either specimen quietly changing the surrounding chrome. */
function tabbedDiff(mode: "file" | "unified") {
    return (
        <TabbedPane
            activeId="master-plans/03-file-viewer.md"
            onSelect={() => undefined}
            tabs={[
                {
                    icon: "doc",
                    id: "master-plans/03-file-viewer.md",
                    label: "03-file-viewer.md",
                },
            ]}
        >
            <ChangedFileDiff
                appearance="light"
                mode={mode}
                newContent={newContent}
                oldContent={oldContent}
                path="master-plans/03-file-viewer.md"
                preview={preview("master-plans/03-file-viewer.md", newContent)}
            />
        </TabbedPane>
    );
}

/* A file long enough that its changes are not all on screen at once, which is
   the only condition under which stepping through them means anything. Three
   edits, far apart, with plenty of untouched code between them. */
const longBefore = Array.from(
    { length: 120 },
    (_, index) => `export const value${String(index)} = ${String(index)};`,
).join("\n");
const longAfter = longBefore
    .split("\n")
    .map((line, index) =>
        index === 4 || index === 60 || index === 110 ? `${line} // revisited` : line,
    )
    .join("\n");

/* Notes are written, not posed: this specimen owns the same little state the
   product's store owns, so the gutter affordance, the composer, and the
   handover control can be exercised here rather than only described. */
function CommentedDiff() {
    const [comments, commentsSet] = useState<
        readonly { id: string; lineNumber: number; side: "additions"; text: string }[]
    >([
        {
            id: "c1",
            lineNumber: 4,
            side: "additions",
            text: "Say this in the same voice as the sentence above it.",
        },
    ]);
    const [draft, draftSet] = useState<
        { lineNumber: number; side: "deletions" | "additions"; text: string } | undefined
    >(undefined);

    return (
        <ChangedFileDiff
            appearance="light"
            commentDraft={draft}
            comments={comments}
            mode="unified"
            newContent={newContent}
            oldContent={oldContent}
            onCommentDraftCancel={() => draftSet(undefined)}
            onCommentDraftOpen={(lineNumber, side) => draftSet({ lineNumber, side, text: "" })}
            onCommentDraftSubmit={() => {
                if (draft === undefined || draft.text.trim() === "") return;
                commentsSet([
                    ...comments,
                    {
                        id: `c${String(comments.length + 1)}`,
                        lineNumber: draft.lineNumber,
                        side: "additions",
                        text: draft.text,
                    },
                ]);
                draftSet(undefined);
            }}
            onCommentDraftUpdate={(text) => draftSet(draft && { ...draft, text })}
            onCommentRemove={(commentId) =>
                commentsSet(comments.filter((comment) => comment.id !== commentId))
            }
            path="master-plans/03-file-viewer.md"
            preview={preview("master-plans/03-file-viewer.md", newContent)}
        />
    );
}

export function ChangedFileDiffPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One changed file, in the four ways there are to look at one. Preview is the product's own file preview over the working-tree copy, so a changed document reads as the document and changed source reads as numbered, highlighted source; Unified and Split are the diff; Edit is the text. A mode with nothing behind it is not offered."
            title="ChangedFileDiff"
        >
            <Specimen
                detail="Preview and Pierre share the same three 32px layers and path origin"
                label="Chrome and path alignment"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(tabbedDiff("file"), 280)}
                    {frame(tabbedDiff("unified"), 280)}
                    <DimensionRule label="Preview ↔ Unified · consecutive 32 px bands · 16 px icon at x16 · path at x42 · diff stats right" />
                </div>
            </Specimen>

            <Specimen
                detail="Source is the same numbered, highlighted read a file tab gives it — not the diff renderer with nothing to compare against"
                label="Source"
                number="02"
                stage="surface"
            >
                {frame(
                    <ChangedFileDiff
                        appearance="light"
                        mode="file"
                        newContent={source}
                        oldContent={sourceBefore}
                        path="packages/happy-desktop-ui/src/elapsed.ts"
                        preview={preview("packages/happy-desktop-ui/src/elapsed.ts", source)}
                    />,
                    300,
                )}
            </Specimen>

            <Specimen
                detail="Additions and deletions in one column"
                label="Unified"
                number="03"
                stage="surface"
            >
                {frame(
                    <ChangedFileDiff
                        appearance="light"
                        mode="unified"
                        newContent={newContent}
                        oldContent={oldContent}
                        path="master-plans/03-file-viewer.md"
                        preview={preview("master-plans/03-file-viewer.md", newContent)}
                    />,
                    360,
                )}
            </Specimen>

            <Specimen detail="Old and new side by side" label="Split" number="04" stage="surface">
                {frame(
                    <ChangedFileDiff
                        appearance="light"
                        mode="split"
                        newContent={newContent}
                        oldContent={oldContent}
                        path="master-plans/03-file-viewer.md"
                        preview={preview("master-plans/03-file-viewer.md", newContent)}
                    />,
                    360,
                )}
            </Specimen>

            <Specimen
                detail="The file face of a writable file is the editor: one place to read the result and fix what it says, with Command-S to save and no second mode showing the same lines read-only"
                label="File, written"
                number="05"
                stage="surface"
            >
                {frame(
                    <EditableFile path="packages/happy-desktop-ui/src/elapsed.ts" text={source} />,
                    300,
                )}
            </Specimen>

            <Specimen
                detail="What a change did to the file it names: created from nothing, moved from another path, or emptied without being removed"
                label="Change kinds"
                number="06"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <ChangedFileDiff
                            appearance="light"
                            mode="file"
                            newContent={source}
                            oldContent=""
                            path="packages/happy-desktop-ui/src/elapsed.ts"
                            preview={preview("packages/happy-desktop-ui/src/elapsed.ts", source)}
                        />,
                        260,
                    )}
                    {frame(
                        <ChangedFileDiff
                            appearance="light"
                            mode="unified"
                            newContent={source}
                            oldContent={sourceBefore}
                            oldPath="packages/happy-desktop-ui/src/duration.ts"
                            path="packages/happy-desktop-ui/src/elapsed.ts"
                            preview={preview("packages/happy-desktop-ui/src/elapsed.ts", source)}
                        />,
                        260,
                    )}
                    {/* Emptied rather than removed: there is still a file, so its
                        preview is still offered — over nothing, which is what the
                        file now holds. */}
                    {frame(
                        <ChangedFileDiff
                            appearance="light"
                            mode="file"
                            newContent=""
                            oldContent={source}
                            path="packages/happy-desktop-ui/src/elapsed.ts"
                            preview={preview("packages/happy-desktop-ui/src/elapsed.ts", "")}
                        />,
                        220,
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="A deleted file has no copy left to read, so Preview is absent and the switch falls back to the diff"
                label="Deleted"
                number="07"
                stage="surface"
            >
                {frame(
                    <ChangedFileDiff
                        appearance="light"
                        mode="file"
                        newContent=""
                        oldContent={oldContent}
                        path="master-plans/03-file-viewer.md"
                    />,
                    300,
                )}
            </Specimen>

            <Specimen
                detail="A read still in flight says so without taking the file away"
                label="Updating"
                number="08"
                stage="surface"
            >
                {frame(
                    <ChangedFileDiff
                        appearance="light"
                        loading
                        mode="file"
                        newContent={newContent}
                        oldContent={oldContent}
                        path="master-plans/03-file-viewer.md"
                        preview={preview("master-plans/03-file-viewer.md", newContent)}
                    />,
                    300,
                )}
            </Specimen>

            <Specimen
                detail="The same pane on the dark face — the preview and the diff draw in one appearance"
                label="Dark"
                number="09"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <ChangedFileDiff
                            appearance="dark"
                            mode="file"
                            newContent={newContent}
                            oldContent={oldContent}
                            path="master-plans/03-file-viewer.md"
                            preview={preview("master-plans/03-file-viewer.md", newContent)}
                        />,
                        360,
                        "dark",
                    )}
                    {frame(
                        <ChangedFileDiff
                            appearance="dark"
                            mode="unified"
                            newContent={newContent}
                            oldContent={oldContent}
                            path="master-plans/03-file-viewer.md"
                            preview={preview("master-plans/03-file-viewer.md", newContent)}
                        />,
                        300,
                        "dark",
                    )}
                </div>
            </Specimen>
            <Specimen
                detail="known Happy Agent offline · the edit draft and diff remain · Command-S waits for reconnect"
                label="Happy Agent offline"
                number="10"
                stage="surface"
            >
                {frame(
                    <ChangedFileDiff
                        appearance="light"
                        mode="file"
                        newContent={source}
                        oldContent={sourceBefore}
                        onContentChange={() => {}}
                        onSave={() => {}}
                        path="packages/happy-desktop-ui/src/elapsed.ts"
                        preview={preview("packages/happy-desktop-ui/src/elapsed.ts", source)}
                        saveDisabled
                    />,
                    300,
                )}
            </Specimen>

            <Specimen
                detail="Three edits far apart in a long file; the steps travel between them instead of the scrollbar travelling past everything else"
                label="Walking the change"
                number="13"
                stage="surface"
            >
                {frame(
                    <ChangedFileDiff
                        appearance="light"
                        mode="unified"
                        newContent={longAfter}
                        oldContent={longBefore}
                        path="packages/happy-desktop-ui/src/values.ts"
                    />,
                    320,
                )}
            </Specimen>

            <Specimen
                detail="The gutter offers a note where the pointer is; a written note sits under its line, and the bar says how many are waiting"
                label="Review notes"
                number="12"
                stage="surface"
            >
                {frame(<CommentedDiff />, 420)}
            </Specimen>

            <Specimen
                detail="The choice sits at the right end of the mode bar and leaves only for Preview; wrapped lines fold at the pane instead of scrolling out of it, in the diff and in Edit alike"
                label="Wrap"
                number="11"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <ChangedFileDiff
                            appearance="light"
                            mode="unified"
                            newContent={wide}
                            oldContent={wideBefore}
                            onWrapChange={() => {}}
                            path="packages/happy-desktop-ui/src/guidance.ts"
                        />,
                        240,
                    )}
                    {frame(
                        <ChangedFileDiff
                            appearance="light"
                            mode="unified"
                            newContent={wide}
                            oldContent={wideBefore}
                            onWrapChange={() => {}}
                            path="packages/happy-desktop-ui/src/guidance.ts"
                            wrap
                        />,
                        240,
                    )}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
