import { useState, type ReactNode } from "react";
import { RepositoryStack, type RepositoryStackEntry } from "../../src/RepositoryStack";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { WindowOverlayHostContext } from "../../src/WindowOverlay";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-354";

const photo = (name: string) => new URL(`../assets/repo-photo-${name}.webp`, import.meta.url).href;

const HAPPY: RepositoryStackEntry = {
    id: "happy",
    name: "happy",
    imageUrl: photo("fox"),
    checkouts: [{ id: "c1", branch: "main", computer: "build-01" }],
};
const CLUSTER: RepositoryStackEntry = {
    id: "happy-cluster",
    name: "happy-cluster",
    imageUrl: photo("rocket"),
    checkouts: [
        { id: "c2", branch: "repo-photos-api", computer: "build-01" },
        { id: "c3", branch: "main", computer: "gpu-02" },
    ],
};
const DESKTOP: RepositoryStackEntry = {
    id: "happy-desktop",
    name: "happy-desktop",
    imageUrl: photo("sprout"),
    checkouts: [{ id: "c4", branch: "repo-photos-ui", computer: "build-01" }],
};
const DOCS: RepositoryStackEntry = {
    id: "docs",
    name: "docs",
    imageUrl: photo("whale"),
    checkouts: [{ id: "c5", branch: "main" }],
};
/** A repository nobody gave a photo: it wears the placeholder its id picks. */
const INFRA: RepositoryStackEntry = {
    id: "infra",
    name: "infra",
    checkouts: [{ id: "c6", branch: "main", computer: "build-01" }],
};

const ONE = [HAPPY] as const;
const TWO = [CLUSTER, DESKTOP] as const;
const THREE = [CLUSTER, DESKTOP, HAPPY] as const;
const FIVE = [CLUSTER, DESKTOP, HAPPY, DOCS, INFRA] as const;
/** Many: the count runs to two figures. */
const TWELVE: readonly RepositoryStackEntry[] = [
    ...FIVE,
    ...Array.from({ length: 7 }, (_, index) => ({
        id: `service-${String(index + 1)}`,
        name: `service-${String(index + 1)}`,
        checkouts: [{ id: `s${String(index + 1)}`, branch: "main" }],
    })),
];
const NO_PHOTO = [INFRA] as const;

const row: Record<string, string> = { display: "flex", alignItems: "flex-end", gap: "40px" };
const cell: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
};

const SECTIONS: readonly SidebarSection[] = [
    {
        id: "bots",
        label: "Bots",
        items: [
            { id: "b1", kind: "project", label: "Release notes", placeholderSeed: "b1" },
            {
                depth: 1,
                id: "b1-s1",
                kind: "workspace",
                label: "Fix the changelog script",
                repositories: ONE,
            },
        ],
    },
    {
        id: "tasks",
        label: "Tasks",
        items: [
            { id: "t1", kind: "project", label: "Fix release notes", repositories: ONE },
            { id: "t2", kind: "project", label: "Repo photos everywhere", repositories: TWO },
            {
                id: "t3",
                kind: "project",
                label: "Cluster migration",
                repositories: FIVE,
                unread: true,
            },
            { id: "t4", kind: "project", label: "Rotate infra keys", repositories: NO_PHOTO },
            {
                id: "t5",
                kind: "project",
                label: "Rewrite onboarding guide",
                placeholderSeed: "t5",
            },
        ],
    },
];

/**
 * The lane the app shell keeps for overlays, so a list opened by hovering a
 * pile here hangs off the page as it hangs off the window in the app, over
 * the rows after it rather than under them.
 */
function OverlayLane(props: { children: ReactNode }) {
    const [host, setHost] = useState<HTMLElement | null>(null);
    return (
        <WindowOverlayHostContext.Provider value={host}>
            {props.children}
            <div ref={setHost} />
        </WindowOverlayHostContext.Provider>
    );
}

export function RepositoryStackPage() {
    return (
        <OverlayLane>
            <ComponentPage
                number={componentNumber}
                summary="The repositories a task works in, in its sidebar row. One repository wears its photo; two pile up, first in front; more wear the first photo with a +N pill on its corner counting the rest. Resting on a pile fans it out with a list of every repository — photo, name, and where it is checked out. A repository without a photo wears the placeholder its id picks. The 20px lane never changes with what is in it."
                title="RepositoryStack"
                width={1040}
            >
                <Specimen
                    detail="20 × 20 · the sidebar's identity lane · two: 14px tiles at a 6px step · more: the first photo at 16px with a +N pill counting the rest"
                    label="Row"
                    number="01"
                    stage="chrome"
                >
                    <div style={row}>
                        {(
                            [
                                ["One", ONE],
                                ["No photo", NO_PHOTO],
                                ["Two", TWO],
                                ["Three", THREE],
                                ["Five", FIVE],
                                ["Twelve", TWELVE],
                            ] as const
                        ).map(([label, repositories]) => (
                            <div key={label} style={cell}>
                                <RepositoryStack repositories={repositories} />
                                <DimensionRule label={label} />
                            </div>
                        ))}
                    </div>
                </Specimen>

                <Specimen
                    detail="Rested on: the pile fans along its diagonal and the list hangs from the mark"
                    label="Row, fanned out"
                    number="02"
                    stage="chrome"
                >
                    <div
                        style={{ ...row, alignItems: "flex-start", gap: "320px", height: "260px" }}
                    >
                        <RepositoryStack listOpen repositories={TWO} />
                        <RepositoryStack listOpen repositories={FIVE} />
                    </div>
                </Specimen>

                <Specimen
                    detail="A bot keeps its own face and its scoped subtask wears its repository; tasks with one repository, two, five (unread), one without a photo, and none. Rest on a pile to list it."
                    label="In the sidebar"
                    number="03"
                    stage="chrome"
                >
                    <div
                        style={{
                            background: "var(--groupped-background)",
                            display: "flex",
                            height: "380px",
                            width: "300px",
                        }}
                    >
                        <Sidebar
                            activeItemId="t2"
                            onItemSelect={() => undefined}
                            sections={[...SECTIONS]}
                        />
                    </div>
                </Specimen>
            </ComponentPage>
        </OverlayLane>
    );
}
