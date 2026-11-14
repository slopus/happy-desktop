import { type ReactNode } from "react";
import type { HappyReference } from "happy-desktop-state";
import { MarkdownDocument } from "../../src/MarkdownDocument";
import type { MessageReferences, MessageReferenceView } from "../../src/messageReferences";
import { markdownTableFixtures } from "../../src/fixtures/markdownTables";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-171";

const readme = `# Happy file viewer

Opening a file shows the file. A Markdown document reads as a document — on a
reading measure, in the document type ramp — rather than as a wall of source.

## What renders

- **Headings** open a section and take air above them
- Lists, nested lists, and task lists
- Tables, block quotes, and fenced code
- Links: the web opens outside, [a file](master-plans/03-file-viewer.md) opens here

### Task list

- [x] Read the file
- [ ] Write it back

> A preview that crops has answered a different question than the one asked.

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

\`\`\`mermaid
flowchart LR
    Markdown --> Render[Beautiful Mermaid]
    Render --> SVG[Validated themed SVG]
\`\`\`

Inline \`code\` keeps the mono face, and a rule closes the document.

---

Last read from the workspace, not the browser.
`;

const short = `## Release notes

Two paragraphs and a list is the ordinary case, and it should look composed at
any width the panel is dragged to.

1. Files open inside Happy
2. Markdown renders
3. Chat links reuse the same viewer
`;

const tables = [
    "## Agent comparison",
    markdownTableFixtures.agentComparison,
    "## Long code identifier",
    markdownTableFixtures.longCodeSpan,
    "## Key and value",
    markdownTableFixtures.keyValue,
    "## Compact cells",
    markdownTableFixtures.compactMatrix,
    "## Long paths and words",
    markdownTableFixtures.longWords,
    "## Ten columns",
    markdownTableFixtures.tenColumns,
].join("\n\n");

/** The server this page's links are read on; a share link naming it opens here. */
const INSTANCE = "k3x9q2m7p0a4b8c1d5e6f7g2";
const ELSEWHERE = "m8w2r5t1y6u3i9o4p7a0s2d5";
const share = (rest: string, instance = INSTANCE) =>
    `https://link.happy.page/#1/${instance}/${rest}`;

const VIEWS: ReadonlyMap<string, MessageReferenceView> = new Map([
    ["agent:shiptask", { type: "link", label: "Ship the November build", busy: false }],
    ["agent:releasebot", { type: "link", label: "Release bot", busy: true }],
    ["artifact:q3report", { type: "link", label: "Q3 revenue report", busy: false }],
]);

const entities: MessageReferences = {
    instanceId: INSTANCE,
    view: (reference: HappyReference) =>
        VIEWS.get(`${reference.kind}:${reference.id}`) ?? {
            type: "text",
            label: `an unavailable ${reference.kind}`,
        },
    open: () => undefined,
};

const happyLinks = `## Release notes

- [The ship task](${share("agents/shiptask?as=task")}) signed off this morning.
- [Our release bot](${share("agents/releasebot?as=bot")}) is still packaging the installer.
- The numbers are in [the board deck](${share("artifacts/q3report")}).
- [Last week's retro](${share("artifacts/retro")}) is not on this server, and [their launch plan](${share("artifacts/plan", ELSEWHERE)}) is on one you are not connected to.
- Unlabelled: [](${share("agents/releasebot?as=bot")}), [](${share("artifacts/q3report")}), and [](${share("artifacts/retro")}).
- Bare: ${share("artifacts/q3report")}
- Legacy: [the old report link](happy://artifacts/q3report)
`;

function frame(children: ReactNode, height: number, width: number, screen?: string) {
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

export function MarkdownDocumentPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A Markdown file read as a document: a full-bleed scrollport with the document set on a 768px reading measure inside it. Headings, tables, task lists, quotes, fenced code, and securely isolated Mermaid diagrams render in the document type ramp; a link to another file is a click the caller handles."
            title="Markdown document"
        >
            <Specimen
                detail="768 px measure · 24/32 gutters · 15/24 body"
                label="Document"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(<MarkdownDocument onFileOpen={() => {}} text={readme} />, 620, 880)}
                    <DimensionRule label="880 × 620 px region · 768 px measure" />
                </div>
            </Specimen>

            <Specimen
                detail="A Happy link with a label reads as that label, opening in the app when it resolves and shimmering while its agent is busy · one this server cannot open keeps its label and a share link routes to its server · an unlabelled link reads as the current name or a placeholder · a bare share link is its address"
                label="Happy links"
                number="01b"
                stage="surface"
            >
                {frame(
                    <MarkdownDocument entities={entities} text={happyLinks} />,
                    420,
                    880,
                    "artifact-happy-links",
                )}
            </Specimen>

            <Specimen
                detail="The panel width a document opens at beside a conversation"
                label="Narrow"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(<MarkdownDocument text={short} />, 320, 360)}
                    <DimensionRule label="360 px wide · gutters hold at panel width" />
                </div>
            </Specimen>

            <Specimen
                detail="Every column keeps a readable width, long code and paths break inside their cell, short code keeps its line, and a table that cannot fit scrolls"
                label="Tables"
                number="03"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(<MarkdownDocument text={tables} />, 2400, 880)}
                    <DimensionRule label="880 px wide · 768 px measure" />
                    {frame(<MarkdownDocument text={tables} />, 3000, 480)}
                    <DimensionRule label="480 px wide · 416 px measure" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
