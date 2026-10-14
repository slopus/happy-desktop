import { type ReactNode } from "react";
import { GitComparisonBase, type GitComparisonBaseSource } from "../../src/GitComparisonBase";
import { SearchField } from "../../src/TitleBar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-289";

const noop = () => undefined;

function strip(children: ReactNode, width = 320) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                padding: "6px",
                width: `${String(width)}px`,
            }}
        >
            {children}
        </div>
    );
}

const SOURCES: readonly {
    readonly source: GitComparisonBaseSource;
    readonly baseRef: string;
    readonly detail: string;
}[] = [
    { source: "explicit", baseRef: "origin/release-v8.8", detail: "Someone chose it" },
    { source: "workspace", baseRef: "origin/release-v8.8", detail: "The ref it was created from" },
    {
        source: "inferred",
        baseRef: "origin/release-v8.7",
        detail: "Read from the branch's history",
    },
    { source: "default", baseRef: "origin/main", detail: "The repository's default branch" },
];

export function GitComparisonBasePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Which branch a checkout's changes are measured against. A 32px box shaped like the Search changes field under it: a branch glyph, a secondary label, the ref in the code face, and where it came from. A fallback the host had to make is said under the box."
            title="GitComparisonBase"
        >
            <Specimen
                detail="The box over the search field: one edge, one height, one radius"
                label="Paired with search"
                number="01"
                stage="surface"
            >
                {strip(
                    <>
                        <GitComparisonBase baseRef="origin/main" source="default" />
                        <SearchField
                            onChange={noop}
                            placeholder="Search changes"
                            shortcutHint={false}
                            value=""
                        />
                    </>,
                )}
                <DimensionRule label="32px · 8px lead · radius-sm" />
            </Specimen>

            <Specimen
                detail="Each source the host reports, as the badge names it"
                label="Sources"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {SOURCES.map((entry) => (
                        <div key={entry.source}>
                            {strip(
                                <GitComparisonBase baseRef={entry.baseRef} source={entry.source} />,
                            )}
                            <DimensionRule label={entry.detail} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="The chosen branch was not found, so the host compared with its default and said why"
                label="Fallback notice"
                number="03"
                stage="surface"
            >
                {strip(
                    <GitComparisonBase
                        baseRef="origin/main"
                        notice="The chosen comparison branch “release-v9.0” was not found. Changes are compared with origin/main."
                        source="default"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Measured against HEAD itself: no ref, no source"
                label="HEAD"
                number="04"
                stage="surface"
            >
                {strip(<GitComparisonBase baseRef={null} />)}
            </Specimen>

            <Specimen
                detail="A narrow panel: the ref elides, the label and the badge do not"
                label="Long ref"
                number="05"
                stage="surface"
            >
                {strip(
                    <GitComparisonBase
                        baseRef="origin/release/2026-q4/fern-calendar-sync-hotfix"
                        source="explicit"
                    />,
                    250,
                )}
            </Specimen>
        </ComponentPage>
    );
}
