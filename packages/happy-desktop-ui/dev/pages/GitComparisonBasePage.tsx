import { useState, type ReactNode } from "react";
import {
    GitComparisonBase,
    GitComparisonBaseCard,
    type GitComparisonBaseCardProps,
    type GitComparisonBaseSource,
} from "../../src/GitComparisonBase";
import { SearchField } from "../../src/TitleBar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-289";

const noop = () => undefined;

/** The host's own rules, so the specimens refuse what the product refuses. */
function refusal(value: string): string | undefined {
    if (value.length > 200) return "A branch name is at most 200 characters.";
    if (value.startsWith("-")) return "A branch name cannot start with “-”.";
    if (/[\s\p{Cc}]/u.test(value)) return "A branch name cannot contain spaces.";
    return undefined;
}

/** What a host listing might answer, newest first. */
const BRANCHES = [
    "origin/main",
    "origin/FERN-1234-inbox-filters",
    "origin/FERN-1188-reply-templates",
    "FERN-1234-inbox-filters",
    "origin/FERN-1102-calendar-hotfix",
    "origin/release-v8.8",
    "release-v8.8",
    "origin/release-v8.7",
    "upstream/main",
];

/** The few branches known without a host listing: current, created from, upstream. */
const KNOWN = ["origin/main", "origin/release-v8.8", "release-v8.8"];

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

/** A card at the width the picker opens at under a 320px panel's box. */
function card(props: Partial<GitComparisonBaseCardProps> & { readonly draft: string }) {
    return (
        <div style={{ display: "flex", width: "308px" }}>
            <GitComparisonBaseCard
                active={0}
                branches={BRANCHES}
                current="origin/main"
                onActiveChange={noop}
                onChoose={noop}
                onDraftChange={noop}
                resettable={false}
                {...props}
            />
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

/**
 * A box wired to its own state and to a stand-in host that answers a query
 * after a short pause, so typing, the keyboard, and choosing read back at once.
 */
function LiveComparison() {
    const [choice, choiceSet] = useState<string | null>(null);
    const [found, foundSet] = useState<readonly string[]>(BRANCHES);
    const [searching, searchingSet] = useState(false);
    return strip(
        <>
            <GitComparisonBase
                baseRef={choice ?? "origin/main"}
                branches={found}
                choice={choice}
                onChoiceChange={choiceSet}
                onQueryChange={(query) => {
                    searchingSet(true);
                    setTimeout(() => {
                        const needle = query.toLowerCase();
                        foundSet(BRANCHES.filter((ref) => ref.toLowerCase().includes(needle)));
                        searchingSet(false);
                    }, 300);
                }}
                searching={searching}
                source={choice === null ? "default" : "explicit"}
                validate={refusal}
            />
            <SearchField
                onChange={noop}
                placeholder="Search changes"
                shortcutHint={false}
                value=""
            />
        </>,
    );
}

export function GitComparisonBasePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Which branch a checkout's changes are measured against. A 32px box shaped like the Search changes field under it: a branch glyph, a secondary label, the ref in the code face, and where it came from. Where the host stores a choice, the box opens a picker that searches the repository's branches as you type, marks the current one, and takes a result on Enter or click. A fallback the host had to make is said under the box."
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
                        <GitComparisonBase
                            baseRef="origin/main"
                            choice={null}
                            onChoiceChange={noop}
                            source="default"
                        />
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
                                <GitComparisonBase
                                    baseRef={entry.baseRef}
                                    choice={entry.source === "explicit" ? "release-v8.8" : null}
                                    onChoiceChange={noop}
                                    source={entry.source}
                                />,
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
                        choice="release-v9.0"
                        notice="The chosen comparison branch “release-v9.0” was not found. Changes are compared with origin/main."
                        onChoiceChange={noop}
                        source="default"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="A project's own checkout: the host keeps no choice for it, so the ref is stated, not offered"
                label="Read-only"
                number="04"
                stage="surface"
            >
                {strip(<GitComparisonBase baseRef="origin/main" source="default" />)}
            </Specimen>

            <Specimen
                detail="Measured against HEAD itself: no ref, no source"
                label="HEAD"
                number="05"
                stage="surface"
            >
                {strip(<GitComparisonBase baseRef={null} choice={null} onChoiceChange={noop} />)}
            </Specimen>

            <Specimen
                detail="A narrow panel: the ref elides, the label, the badge, and the chevron do not"
                label="Long ref"
                number="06"
                stage="surface"
            >
                {strip(
                    <GitComparisonBase
                        baseRef="origin/release/2026-q4/fern-calendar-sync-hotfix"
                        choice="release/2026-q4/fern-calendar-sync-hotfix"
                        onChoiceChange={noop}
                        source="explicit"
                    />,
                    250,
                )}
            </Specimen>

            <Specimen
                detail="Just opened: the host's newest branches, the current one checked, Reset under a rule when there is a choice"
                label="Picker"
                number="07"
                stage="app"
            >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                    {card({ draft: "" })}
                    {card({
                        draft: "",
                        branches: KNOWN,
                        current: "origin/release-v8.8",
                        resettable: true,
                        unavailable: "HTTP 404",
                    })}
                </div>
                <DimensionRule label="Host listing, automatic · no listing: the known branches and why, set by you" />
            </Specimen>

            <Specimen
                detail="Typing narrows the list; the typed name itself is the last row; Down moved to the second match"
                label="Matches"
                number="08"
                stage="app"
            >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                    {card({ draft: "FERN-", active: 1 })}
                    {card({ draft: "FERN-12", searching: true })}
                </div>
                <DimensionRule label="Settled · still asking the host" />
            </Specimen>

            <Specimen
                detail="Nothing listed matches: the card says so and still offers the typed name, or refuses it"
                label="No matches"
                number="09"
                stage="app"
            >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                    {card({ draft: "hotfix-9.0" })}
                    {card({ draft: "release v8.8", refusal: refusal("release v8.8") })}
                </div>
                <DimensionRule label="A name the host has not listed · a name the host would refuse" />
            </Specimen>

            <Specimen
                detail="Type, move with Up and Down, take one with Enter or a click; Escape closes"
                label="Live"
                number="10"
                stage="surface"
            >
                <div style={{ height: "420px" }}>
                    <LiveComparison />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
