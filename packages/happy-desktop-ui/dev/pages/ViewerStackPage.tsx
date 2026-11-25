import { useState } from "react";
import { Button } from "../../src/Button";
import { HappyAgentSurfaceHeader } from "../../src/pages/surfaces/HappyAgentSurfaceHeader";
import type { HappyAgentSurfaceView } from "../../src/pages/surfaces/surfacePresentation";
import { TabbedPane } from "../../src/TabbedPane";
import { ViewerStack, type ViewerStackPerson } from "../../src/ViewerStack";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    ANNA,
    GRACE,
    KIRILL,
    LEE,
    MAX,
    VIEWERS_FIFTY,
    VIEWERS_HERE,
    VIEWERS_MIXED,
    VIEWERS_NOW,
    VIEWERS_RECENT,
    VIEWERS_SEEN,
    VIEWERS_TEN,
    VIEWERS_ZONE,
} from "./viewerStackFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-352";

const row: Record<string, string> = { display: "flex", alignItems: "flex-end", gap: "32px" };
const cell: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
};
const header: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    width: "880px",
    background: "var(--surface)",
    border: "1px solid var(--divider)",
};
const strip: Record<string, string> = {
    display: "flex",
    width: "880px",
    height: "200px",
    background: "var(--surface)",
    border: "1px solid var(--divider)",
};
const body: Record<string, string> = {
    display: "flex",
    flex: "1",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-secondary)",
    fontSize: "12px",
};

const SURFACE: HappyAgentSurfaceView = {
    name: "Launch plan",
    type: { kind: "document" },
    creator: { name: "Steve Korshakov" },
    members: [
        { key: "m1", name: "Steve Korshakov" },
        { key: "m2", name: "Anna Park" },
    ],
};

const TABS = [
    { id: "s1", label: "Fix the release notes" },
    { id: "s2", label: "Ship viewers" },
];

function stack(viewers: readonly ViewerStackPerson[]) {
    return <ViewerStack now={VIEWERS_NOW} viewers={viewers} zone={VIEWERS_ZONE} />;
}

/**
 * The stack driven by hand, so an arrival's pop, a departure's fade, and the
 * glide of everyone making room can be watched and recorded.
 */
function ArriveAndLeave() {
    const [viewers, setViewers] = useState<readonly ViewerStackPerson[]>([
        { ...ANNA, tier: "here", lastSeenAt: VIEWERS_NOW },
        MAX,
    ]);
    const [now, setNow] = useState(VIEWERS_NOW);
    const arrive = (person: ViewerStackPerson) => {
        const rest = viewers.filter((entry) => entry.id !== person.id);
        const here = rest.filter((entry) => entry.tier === "here");
        const others = rest.filter((entry) => entry.tier !== "here");
        setViewers([
            { ...person, tier: "here", lastSeenAt: now, arrived: true },
            ...here,
            ...others,
        ]);
    };
    const leave = (id: string) => {
        const person = viewers.find((entry) => entry.id === id);
        if (person?.tier !== "here") return;
        const rest = viewers.filter((entry) => entry.id !== id);
        const here = rest.filter((entry) => entry.tier === "here");
        const others = rest.filter((entry) => entry.tier !== "here");
        setViewers([
            ...here,
            { ...person, tier: "recent", lastSeenAt: now, arrived: false },
            ...others,
        ]);
    };
    const later = () => {
        const next = now + 11 * 60_000;
        setNow(next);
        setViewers(
            viewers.map((entry) =>
                entry.tier === "recent" && next - entry.lastSeenAt > 10 * 60_000
                    ? { ...entry, tier: "seen" }
                    : entry,
            ),
        );
    };
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "640px" }}>
            <div style={{ ...header, width: "640px" }}>
                <HappyAgentSurfaceHeader
                    surface={SURFACE}
                    viewers={<ViewerStack now={now} viewers={viewers} zone={VIEWERS_ZONE} />}
                />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {[KIRILL, GRACE, LEE].map((person) => (
                    <Button
                        data-testid={`arrive-${person.id}`}
                        key={`arrive-${person.id}`}
                        onClick={() => arrive(person)}
                        size="small"
                    >
                        {person.name} arrives
                    </Button>
                ))}
                {[KIRILL, GRACE, LEE, ANNA].map((person) => (
                    <Button
                        data-testid={`leave-${person.id}`}
                        key={`leave-${person.id}`}
                        onClick={() => leave(person.id)}
                        size="small"
                        variant="ghost"
                    >
                        {person.name} leaves
                    </Button>
                ))}
                <Button data-testid="later" onClick={later} size="small" variant="ghost">
                    11 minutes later
                </Button>
            </div>
        </div>
    );
}

export function ViewerStackPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Who else is looking at an agent session or a Surface, in its header: here now with a breathing ring and a green dot, here in the last ten minutes with how long ago, or seen before, smaller and grey. One fixed 132 × 36 box whoever is there, so the header never moves."
            title="ViewerStack"
            width={1040}
        >
            <Specimen
                detail="132 × 36 · 28px faces at 24px steps · the same box empty and full"
                label="Tiers"
                number="01"
                stage="surface"
            >
                <div style={row}>
                    {(
                        [
                            ["Nobody", []],
                            ["Here", VIEWERS_HERE],
                            ["Recent", VIEWERS_RECENT],
                            ["Seen", VIEWERS_SEEN],
                            ["All three", VIEWERS_MIXED],
                        ] as const
                    ).map(([label, viewers]) => (
                        <div key={label} style={cell}>
                            {stack(viewers)}
                            <DimensionRule label={label} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Four faces, then the rest as a count in the fifth step"
                label="Overflow"
                number="02"
                stage="surface"
            >
                <div style={row}>
                    {(
                        [
                            ["5", [KIRILL, GRACE, LEE, ANNA, MAX]],
                            ["10", VIEWERS_TEN],
                            ["50", VIEWERS_FIFTY],
                        ] as const
                    ).map(([label, viewers]) => (
                        <div key={label} style={cell}>
                            {stack(viewers)}
                            <DimensionRule label={label} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Hover or focus lists everyone with when they were here"
                label="List"
                number="03"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        width: "320px",
                        height: "300px",
                    }}
                >
                    <ViewerStack
                        listOpen
                        now={VIEWERS_NOW}
                        viewers={VIEWERS_TEN}
                        zone={VIEWERS_ZONE}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="A Surface's header with nobody, three tiers, ten people, and fifty: the title and controls hold their places"
                label="In a Surface header"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {[[], VIEWERS_MIXED, VIEWERS_TEN, VIEWERS_FIFTY].map((viewers) => (
                        <div
                            data-testid={`surface-header-${String(viewers.length)}`}
                            key={viewers.length}
                            style={header}
                        >
                            <HappyAgentSurfaceHeader
                                chat={{ open: false, onToggle: () => undefined }}
                                surface={SURFACE}
                                viewers={stack(viewers)}
                            />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="An agent session's tab strip carries it in its trailing lane, and keeps it when one session hides the strip"
                label="In an agent's tab strip"
                number="05"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {(
                        [
                            ["strip", false, VIEWERS_MIXED],
                            ["strip-empty", false, []],
                            ["one-session", true, VIEWERS_HERE],
                        ] as const
                    ).map(([key, hidden, viewers]) => (
                        <div data-testid={`agent-${key}`} key={key} style={strip}>
                            <TabbedPane
                                activeId="s2"
                                barHidden={hidden}
                                barOverlay
                                onSelect={() => undefined}
                                size="medium"
                                tabSizing="content"
                                tabs={hidden ? TABS.slice(1) : TABS}
                                trailing={stack(viewers)}
                            >
                                <div style={body}>Conversation</div>
                            </TabbedPane>
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Live: arrivals pop in front and the others glide to make room; a departure fades the ring and dot and leaves how long ago; later, recent turns to seen"
                label="Arrive and leave"
                number="06"
                stage="app"
            >
                <ArriveAndLeave />
            </Specimen>
        </ComponentPage>
    );
}
