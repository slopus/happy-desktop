import { useState } from "react";
import {
    ReviewStream,
    type ReviewStreamComment,
    type ReviewStreamFile,
} from "../../src/ReviewStream";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-283";

const composerBefore = `export function composerSubmit(text: string): void {
    if (text === "") return;
    send(text);
}
`;

const composerAfter = `export function composerSubmit(text: string, attachments: Attachment[]): void {
    if (text === "" && attachments.length === 0) return;
    send(text, attachments);
}
`;

const storeBefore = `export interface ComposerSnapshot {
    readonly text: string;
}
`;

const storeAfter = `export interface ComposerSnapshot {
    readonly text: string;
    readonly attachments: readonly Attachment[];
}
`;

/* Long enough that its own changes are off screen from one another, which is
   what the steps are for. */
const longBefore = Array.from(
    { length: 90 },
    (_, index) => `export const value${String(index)} = ${String(index)};`,
).join("\n");
const longAfter = longBefore
    .split("\n")
    .map((line, index) =>
        index === 3 || index === 45 || index === 85 ? `${line} // revisited` : line,
    )
    .join("\n");

const files: readonly ReviewStreamFile[] = [
    {
        path: "packages/happy-desktop-ui/src/Composer.tsx",
        oldContent: composerBefore,
        newContent: composerAfter,
    },
    {
        path: "packages/happy-desktop-state/src/composerStore.ts",
        oldContent: storeBefore,
        newContent: storeAfter,
    },
    {
        path: "packages/happy-desktop-ui/src/values.ts",
        oldContent: longBefore,
        newContent: longAfter,
    },
];

function frame(children: React.ReactNode, height = 520, appearance: "dark" | "light" = "light") {
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
                width: "860px",
            }}
        >
            {children}
        </div>
    );
}

/* The same small state the product's store owns, so the gutter, the composer,
   and the handover control can be exercised here rather than only described. */
function CommentedStream() {
    const [comments, commentsSet] = useState<readonly ReviewStreamComment[]>([
        {
            id: "c1",
            path: "packages/happy-desktop-state/src/composerStore.ts",
            lineNumber: 3,
            side: "additions",
            text: "Give this its own branded type rather than a bare array.",
        },
    ]);
    const [draft, draftSet] = useState<
        | {
              path: string;
              lineNumber: number;
              side: "deletions" | "additions";
              text: string;
          }
        | undefined
    >(undefined);

    return (
        <ReviewStream
            appearance="light"
            commentDraft={draft}
            comments={comments}
            files={files}
            onCommentDraftCancel={() => draftSet(undefined)}
            onCommentDraftOpen={(path, lineNumber, side) =>
                draftSet({ path, lineNumber, side, text: "" })
            }
            onCommentDraftSubmit={() => {
                if (draft === undefined || draft.text.trim() === "") return;
                commentsSet([
                    ...comments,
                    {
                        id: `c${String(comments.length + 1)}`,
                        path: draft.path,
                        lineNumber: draft.lineNumber,
                        side: draft.side,
                        text: draft.text,
                    },
                ]);
                draftSet(undefined);
            }}
            onCommentDraftUpdate={(text) => draftSet(draft && { ...draft, text })}
            onCommentRemove={(commentId) =>
                commentsSet(comments.filter((comment) => comment.id !== commentId))
            }
        />
    );
}

/**
 * A change too large to draw in one scroll: one file of it is on screen, and
 * the steps beside the count move to the file before or after it. The same
 * state the product's store owns, so the steps can be exercised here.
 */
function SingleFileStream() {
    const [at, atSet] = useState(1);
    return (
        <ReviewStream
            appearance="light"
            files={files.slice(at, at + 1)}
            singleFile={{
                index: at + 1,
                onNext: () => atSet((held) => Math.min(files.length - 1, held + 1)),
                onPrevious: () => atSet((held) => Math.max(0, held - 1)),
            }}
            total={files.length}
        />
    );
}

/**
 * Reading a change file by file: closing the ones that are done, and keeping
 * the record of which those were. The same small state the product's store
 * owns, so the header's controls can be exercised here rather than described.
 */
function ReviewedStream() {
    const [collapsed, collapsedSet] = useState<ReadonlySet<string>>(new Set([files[0].path]));
    const [viewed, viewedSet] = useState<ReadonlySet<string>>(new Set([files[0].path]));
    const [view, viewSet] = useState<"unified" | "split">("unified");
    const toggle = (held: ReadonlySet<string>, path: string): ReadonlySet<string> => {
        const next = new Set(held);
        if (!next.delete(path)) next.add(path);
        return next;
    };
    return (
        <ReviewStream
            appearance="light"
            collapsed={collapsed}
            files={files}
            onFileCollapsedToggle={(path) => collapsedSet(toggle(collapsed, path))}
            onFileOpen={() => undefined}
            onFileViewedToggle={(path) => {
                const marking = !viewed.has(path);
                viewedSet(toggle(viewed, path));
                // Marking closes the file; taking the mark off leaves it as it
                // is, which is what the product does.
                if (marking) collapsedSet(new Set(collapsed).add(path));
            }}
            onFilesCollapsedSet={(all) =>
                collapsedSet(all ? new Set(files.map((file) => file.path)) : new Set())
            }
            onViewChange={viewSet}
            view={view}
            viewed={viewed}
        />
    );
}

export function ReviewStreamPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Every changed file in one scroll, the way a review is actually read. A diff per pane answers what happened to one file; a change is rarely about one file, and reading it a pane at a time makes the reader hold the order in their head. The steps travel between the changes themselves, from addresses the parsed diff supplies, so a change far below what has been drawn is still somewhere to go."
            title="ReviewStream"
        >
            <Specimen
                detail="Three files, one scroll, one set of steps through every hunk in them"
                label="The whole change"
                number="01"
                stage="surface"
            >
                {frame(<ReviewStream appearance="light" files={files} />)}
            </Specimen>

            <Specimen
                detail="Each header carries what can be done with that one file: copy its path, close it, open it on its own. They wait for the pointer; the reviewed mark does not, because it is the answer to where the reader had got to"
                label="File by file"
                number="07"
                stage="surface"
            >
                {frame(<ReviewedStream />)}
            </Specimen>

            <Specimen
                detail="A note belongs to a file and a line; the bar counts them across the whole review, not the file on screen"
                label="Notes across files"
                number="02"
                stage="surface"
            >
                {frame(<CommentedStream />)}
            </Specimen>

            <Specimen
                detail="The same type, spacing, and green a single changed file is drawn with — the surface a review opens from must not change what a diff looks like"
                label="Dark"
                number="04"
                stage="surface"
            >
                {frame(<ReviewStream appearance="dark" files={files} />, 360, "dark")}
            </Specimen>

            <Specimen
                detail="One file is still a review — the count says so, and nothing else changes"
                label="One file"
                number="03"
                stage="surface"
            >
                {frame(<ReviewStream appearance="light" files={files.slice(0, 1)} />, 260)}
            </Specimen>

            <Specimen
                detail="A change too large for one scroll is read a file at a time: the notice says why, the count says which file of how many, and the steps beside it move between them. Everything on screen is whole — nothing arrives under the reader"
                label="One file at a time"
                number="05"
                stage="surface"
            >
                {frame(<SingleFileStream />, 320)}
            </Specimen>

            <Specimen
                detail="A file the checkout would not give up is named, with the way to ask again — a review short of one of its files must not look like a review of fewer files"
                label="Would not read"
                number="06"
                stage="surface"
            >
                {frame(
                    <ReviewStream
                        appearance="light"
                        failures={["packages/happy-desktop-ui/src/Composer.tsx"]}
                        files={files.slice(1)}
                        onFailuresRetry={() => undefined}
                        total={3}
                    />,
                    300,
                )}
            </Specimen>
        </ComponentPage>
    );
}
