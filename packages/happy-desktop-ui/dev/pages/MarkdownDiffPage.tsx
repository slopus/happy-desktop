import { type ReactNode } from "react";
import { MarkdownDiff } from "../../src/MarkdownDiff";
import { markdownDiffCompute } from "../../src/markdownDiffModel";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-331";

const before = `# File viewer

Opening a file shows the file. A Markdown document reads as a document rather
than as a wall of source.

## What renders

- **Headings** open a section
- Lists, nested lists, and task lists
  - Ordered lists keep their numbers
- Links open in the browser

### Plan

- [ ] Read the file
- [ ] Write it back

| Kind     | Opens as        | Scrolls |
| -------- | --------------- | ------- |
| Markdown | Rendered prose  | Yes     |
| Image    | Contained stage | No      |
| Source   | Monospace text  | Yes     |

\`\`\`ts
export function filePreviewKind(path: string): FilePreviewKind {
    return EXTENSION_KIND[extensionOf(path)] ?? "binary";
}
\`\`\`

> A preview that crops has answered a different question than the one asked.

Last read from the workspace, not the browser.

---

Raw HTML is never activated.
`;

const after = `# File viewer

Opening a file shows the file. A Markdown document reads as a *rendered*
document, on a reading measure, rather than as a wall of source.

## What renders

- **Headings** open a section and take air above them
- Lists, nested lists, and task lists
  - Ordered lists keep their numbers
  - Nested lists indent by one step
- Links to [another file](master-plans/03-file-viewer.md) open here

## Plan

- [x] Read the file
- [ ] Write it back

| Kind     | Opens as        | Scrolls |
| -------- | --------------- | ------- |
| Markdown | Rendered prose  | Yes     |
| Image    | Centred stage   | No      |
| Video    | Inline player   | No      |
| Source   | Monospace text  | Yes     |

Raw HTML is never activated.

\`\`\`ts
export function filePreviewKind(path: string): FilePreviewKind {
    const extension = extensionOf(path).toLowerCase();
    return EXTENSION_KIND[extension] ?? "binary";
}
\`\`\`

> A preview that crops has answered another question than the one asked.

---
`;

const diff = markdownDiffCompute(before, after);

const longBefore = Array.from(
    { length: 14 },
    (_, index) =>
        `${index % 5 === 0 ? `## Section ${String(index / 5 + 1)}\n\n` : ""}Paragraph ${String(index + 1)} of a long document whose middle is the only part that changed.`,
).join("\n\n");
const longAfter = longBefore
    .replace("Paragraph 7 of a long", "Paragraph 7 of a much longer")
    .replace(
        "Paragraph 8 of a long document whose middle is the only part that changed.",
        "Paragraph 8 of a long document whose middle is the only part that changed.\n\nA paragraph added after the eighth.",
    );
const longDiff = markdownDiffCompute(longBefore, longAfter);

function frame(children: ReactNode, height: number, width: number, screen: string) {
    return (
        <div
            data-screen={screen}
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                height: `${height}px`,
                overflow: "hidden",
                width: `${width}px`,
            }}
        >
            {children}
        </div>
    );
}

export function MarkdownDiffPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Two versions of a Markdown document read as one rendered document, on the Markdown document's own surface and renderer. Added blocks sit on the added wash, removed ones on the removed wash and struck through; inside a changed block, inserted words are underlined on green and deleted ones struck on red. A changed fence is a line diff, a moved block is tinted with the link colour where it arrived and left as a ghost where it was, and a heading's old level or a ticked task is said in a note."
            title="Markdown diff"
        >
            <Specimen
                detail="Paragraph, heading, list, task, table, fence, quote, rule, and move changes"
                label="Document"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <MarkdownDiff diff={diff} onFileOpen={() => {}} />,
                        1360,
                        880,
                        "01-document",
                    )}
                    <DimensionRule label="880 px wide · 768 px measure" />
                </div>
            </Specimen>

            <Specimen
                detail="One unchanged block of context on each side of a change; longer runs fold"
                label="Folded"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <MarkdownDiff diff={longDiff} unchangedContext={1} />,
                        520,
                        880,
                        "02-folded",
                    )}
                    <DimensionRule label="880 px wide · unchangedContext 1" />
                </div>
            </Specimen>

            <Specimen
                detail="The panel width a document opens at beside a conversation"
                label="Narrow"
                number="03"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(<MarkdownDiff diff={diff} />, 1300, 360, "03-narrow")}
                    <DimensionRule label="360 px wide" />
                </div>
            </Specimen>

            <Specimen
                detail="An identical document folds into a single run"
                label="No changes"
                number="04"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <MarkdownDiff
                            diff={markdownDiffCompute(after, after)}
                            unchangedContext={1}
                        />,
                        120,
                        880,
                        "04-identical",
                    )}
                    <DimensionRule label="880 px wide" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
