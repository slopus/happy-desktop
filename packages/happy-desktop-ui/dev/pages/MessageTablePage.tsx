import { type ReactNode } from "react";
import { Message } from "../../src/Message";
import {
    markdownTableFixtures,
    type MarkdownTableFixture,
} from "../../src/fixtures/markdownTables";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-289";

const cases: readonly { fixture: MarkdownTableFixture; label: string; detail: string }[] = [
    {
        fixture: "agentComparison",
        label: "Agent comparison",
        detail: "A real reply: spaced code in the first column, long identifiers in the middle, the longest prose last",
    },
    {
        fixture: "fits",
        label: "Fits on one line per cell",
        detail: "Every cell fits on one line, so the table keeps its natural width instead of stretching",
    },
    {
        fixture: "oneProseColumn",
        label: "One prose column",
        detail: "Step and status stay on one line; the notes column takes the rest and wraps",
    },
    {
        fixture: "severalProseColumns",
        label: "Several prose columns",
        detail: "Prose columns grow to the same width above their floors, so none is left a narrow strip",
    },
    {
        fixture: "shortColumns",
        label: "Short ID and status columns",
        detail: "Columns narrower than the 136 px floor keep their one line; alignment is per column",
    },
    {
        fixture: "inlineFormatting",
        label: "Inline code, bold, links",
        detail: "Cells measure with the same rich-inline model as body paragraphs",
    },
    {
        fixture: "cjkEmoji",
        label: "CJK and emoji",
        detail: "CJK breaks between characters; emoji keep their font fallback advance",
    },
    {
        fixture: "tooManyColumns",
        label: "Too many columns",
        detail: "The column floors are wider than the measure, so the table scrolls at readable widths",
    },
    {
        fixture: "emptyCells",
        label: "Empty cells, short and long rows",
        detail: "A row with no text keeps only its padding; missing cells pad, extra cells drop",
    },
    {
        fixture: "unbreakable",
        label: "Unbreakable tokens",
        detail: "A word holds its column open only up to an equal share of the measure; longer URLs and words break",
    },
    {
        fixture: "longCodeSpan",
        label: "Long code identifier",
        detail: "One unbroken identifier and one long code path beside a short notes column",
    },
    {
        fixture: "keyValue",
        label: "Key and value",
        detail: "Short keys keep one line; the values take the rest of the measure",
    },
    {
        fixture: "compactMatrix",
        label: "Compact cells",
        detail: "Marks and counts fit, so the columns share the leftover width in proportion",
    },
    {
        fixture: "alignedFormatting",
        label: "Alignment and inline formatting",
        detail: "Left, centered, and right columns with bold, italic, links, code, and strikethrough",
    },
    {
        fixture: "headerOnly",
        label: "Header only",
        detail: "A delimiter row with no body rows renders the header alone",
    },
    {
        fixture: "oneRow",
        label: "One column, one row",
        detail: "A single cell fills the measure",
    },
    {
        fixture: "longWords",
        label: "Long paths and words",
        detail: "A long path as text and as code, and long German and Russian words",
    },
    {
        fixture: "tenColumns",
        label: "Ten columns",
        detail: "Ten columns with two prose columns at the end",
    },
];

function frame(width: number, children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: "8px 0",
                width: `${String(width)}px`,
            }}
        >
            {children}
        </div>
    );
}

export function MessageTablePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Markdown tables in chat wrap their cells at whole-pixel column widths solved from the same text model that sizes the virtual row, so a table mounts at exactly the height the list reserved."
            title="Message · Markdown tables"
        >
            {cases.map((item, index) => (
                <Specimen
                    detail={item.detail}
                    key={item.fixture}
                    label={item.label}
                    number={String(index).padStart(2, "0")}
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {frame(
                            860,
                            <Message
                                agent
                                author="Happy"
                                brandAvatar
                                body={markdownTableFixtures[item.fixture]}
                            />,
                        )}
                        <DimensionRule label="860 px frame · 764 px body" />
                        {frame(
                            500,
                            <Message
                                agent
                                author="Happy"
                                brandAvatar
                                body={markdownTableFixtures[item.fixture]}
                            />,
                        )}
                        <DimensionRule label="500 px frame · 404 px body" />
                    </div>
                </Specimen>
            ))}
            <Specimen
                detail="A bubble holding a table takes its full 76% cap so its columns are solved against a measure that does not depend on them"
                label="Own bubble"
                number={String(cases.length).padStart(2, "0")}
                stage="app"
            >
                {frame(
                    760,
                    <Message
                        author="Maya"
                        body={markdownTableFixtures.shortColumns}
                        own
                        time="9:41"
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
