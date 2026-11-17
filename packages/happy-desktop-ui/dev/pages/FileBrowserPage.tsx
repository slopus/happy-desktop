import { useState, type ReactNode } from "react";
import {
    happyAgentChangeTiersAssign,
    type HappyAgentChangeTier,
    type HappyAgentChangeTierId,
} from "happy-desktop-state";
import { FileBrowser, type FileBrowserLayout, type FileBrowserScope } from "../../src/FileBrowser";
import {
    fileTreeBuild,
    fileTreeFlatten,
    fileTreeRanked,
    type FileTreeBuildEntry,
    type FileTreeExpansion,
} from "../../src/fileTreeBuild";
import type { FileTreeNode } from "../../src/FileTree";
import { filePathMatches } from "../../src/fileTreeSearch";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-168";
const changed: FileTreeBuildEntry[] = [
    {
        path: "packages/happy-desktop-ui/src/FileTree.tsx",
        gitStatus: "modified",
        addedLines: 148,
        deletedLines: 62,
    },
    {
        path: "packages/happy-desktop-ui/src/styles/file-tree.css",
        gitStatus: "modified",
        addedLines: 96,
        deletedLines: 41,
    },
    {
        path: "packages/happy-desktop-ui/src/FileBrowser.tsx",
        gitStatus: "added",
        addedLines: 157,
        deletedLines: 0,
    },
    {
        path: "packages/happy-desktop-app/sources/AppHappyAgentView.tsx",
        gitStatus: "modified",
        addedLines: 24,
        deletedLines: 38,
    },
    { path: "packages/happy-desktop-ui/src/assets/plugin.png", gitStatus: "added" },
    {
        path: "packages/happy-desktop-ui/src/SegmentedControl.tsx",
        gitStatus: "deleted",
        addedLines: 0,
        deletedLines: 84,
    },
    {
        path: "docs/notes/file-viewer.md",
        gitStatus: "renamed",
        addedLines: 3,
        deletedLines: 1,
    },
    { path: ".env.local", gitStatus: "untracked", addedLines: 6, deletedLines: 0 },
];
const everything: FileTreeBuildEntry[] = [
    ...changed,
    { path: "packages/happy-desktop-ui/src/Button.tsx" },
    { path: "packages/happy-desktop-ui/src/theme.css" },
    { path: "packages/happy-desktop-state/src/index.ts" },
    { path: "scripts/release.sh" },
    { path: "assets/keys/deploy.pem" },
    { path: "media/intro.mp4" },
    { path: "media/theme.mp3" },
    { path: "vendor/toolchain.tar.gz" },
    { path: "package.json" },
    { path: "README.md" },
];
/**
 * Names chosen to prove the order rather than to look like a repository: a
 * capital and a lowercase spelling of one word, a run of numbers that reads
 * wrong when compared character by character, and a name long enough to need
 * the whole row.
 */
const awkward: FileTreeBuildEntry[] = [
    { path: "release/v9/notes.md" },
    { path: "release/v10/notes.md" },
    { path: "release/v2/notes.md" },
    { path: "release/V1/notes.md" },
    { path: "Makefile" },
    { path: "makefile.local" },
    { path: "zebra.ts" },
    { path: "Apple.ts" },
    { path: "apple.ts" },
    { path: "img/photo-2.png" },
    { path: "img/photo-10.png" },
    { path: "img/photo-1.png" },
    {
        path: "packages/happy-desktop-ui/src/components/experimental/very-long-component-name-that-will-not-fit.tsx",
    },
];
/**
 * A checkout the size of a real one, built from a fixed recipe so the specimen
 * is the same on every run. Five thousand rows is the point of the listing: it
 * must cost the same to draw as fifty.
 */
const bulk: FileTreeBuildEntry[] = (() => {
    const areas = ["packages", "services", "vendor", "docs", "tools"];
    const kinds = ["ts", "tsx", "css", "json", "md", "png", "sh", "yaml", "mp4", "pem"];
    const entries: FileTreeBuildEntry[] = [];
    for (let index = 0; index < 5000; index += 1) {
        const area = areas[index % areas.length]!;
        const module = `module-${String((index * 7) % 40)}`;
        // The case alternates on purpose so the listing has to tie-break, and
        // the index keeps every path distinct: two rows with one path would be
        // two rows with one identity.
        const leaf = `${index % 3 === 0 ? "Item" : "item"}-${String(index)}`;
        entries.push({
            path: `${area}/${module}/src/${leaf}.${kinds[index % kinds.length]!}`,
            ...(index % 97 === 0 ? { gitStatus: "modified" as const, addedLines: index % 40 } : {}),
        });
    }
    return entries;
})();
const totals = changed.reduce(
    (sum, entry) => ({
        added: sum.added + (entry.addedLines ?? 0),
        deleted: sum.deleted + (entry.deletedLines ?? 0),
    }),
    { added: 0, deleted: 0 },
);
/** A change with tests, text fixtures, and snapshots beside the work itself. */
const tiered: FileTreeBuildEntry[] = [
    ...changed.slice(0, 4),
    {
        path: "packages/happy-desktop-ui/src/FileTree.test.tsx",
        gitStatus: "modified",
        addedLines: 212,
        deletedLines: 18,
    },
    {
        path: "packages/happy-desktop-ui/src/FileBrowser.test.tsx",
        gitStatus: "added",
        addedLines: 96,
        deletedLines: 0,
    },
    {
        path: "packages/happy-desktop-state/src/changeTiers.test.ts",
        gitStatus: "added",
        addedLines: 120,
        deletedLines: 0,
    },
    {
        path: "packages/happy-desktop-ui/src/copy/empty.text.ts",
        gitStatus: "modified",
        addedLines: 4,
        deletedLines: 4,
    },
    {
        path: "packages/happy-desktop-ui/src/__snapshots__/FileTree.test.tsx.snap",
        gitStatus: "modified",
        addedLines: 40,
        deletedLines: 22,
    },
];
function tier(
    id: string,
    name: string,
    patterns: readonly string[],
    collapsed = false,
): HappyAgentChangeTier {
    return { id: id as HappyAgentChangeTierId, name, patterns, collapsed };
}
/**
 * The tiers the specimens list by. Docs claims nothing in this change, so it
 * draws no section at all, and Snapshots starts folded shut.
 */
const tiers: readonly HappyAgentChangeTier[] = [
    tier("snapshots", "Snapshots", ["__snapshots__/"], true),
    tier("tests", "Tests", ["*.test.ts", "*.test.tsx"]),
    tier("text", "Text fixtures", ["*.text.ts"]),
    tier("docs", "Docs", ["*.md"]),
];
/** The listing the product draws for a tiered change; see `changeTierNodes` in the app. */
function tieredNodes(
    entries: readonly FileTreeBuildEntry[],
    changeTiers: readonly HappyAgentChangeTier[],
    layout: FileBrowserLayout,
): FileTreeNode[] {
    const arrange = (files: readonly FileTreeBuildEntry[]) =>
        layout === "tree" ? fileTreeBuild(files, untouchedAll) : fileTreeFlatten(files);
    const assignment = happyAgentChangeTiersAssign(entries, changeTiers);
    return [
        ...arrange(assignment.primary),
        ...assignment.tiers.map(
            ({ tier: entry, files }): FileTreeNode => ({
                id: `tier:${entry.id}`,
                kind: "section",
                name: entry.name,
                count: files.length,
                expanded: !entry.collapsed,
                ...(entry.collapsed ? {} : { children: arrange(files) }),
            }),
        ),
    ];
}
/** The tree as it stands before the reader has opened or closed anything. */
const untouched: FileTreeExpansion = {
    opened: new Set(),
    closed: new Set(),
    defaultDepth: 1,
};
/** Changes as the product opens it: every changed file showing. */
const untouchedAll: FileTreeExpansion = {
    opened: new Set(),
    closed: new Set(),
    defaultDepth: Number.POSITIVE_INFINITY,
};
function panelFrame(children: ReactNode, height = 480, width = 320) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                height: `${height}px`,
                overflow: "hidden",
                width: `${width}px`,
            }}
        >
            {children}
        </div>
    );
}
/**
 * A listing wired to its own state, so the specimen answers the keyboard the
 * way the product does: the arrow keys walk it, Left and Right disclose,
 * Enter opens, and the switches change what is listed without moving the row
 * the reader is standing on.
 */
function LiveBrowser(props: { entries: FileTreeBuildEntry[]; height?: number; width?: number }) {
    const [scope, scopeSet] = useState<FileBrowserScope>("all");
    const [layout, layoutSet] = useState<FileBrowserLayout>("tree");
    const [opened, openedSet] = useState<ReadonlySet<string>>(new Set());
    const [closed, closedSet] = useState<ReadonlySet<string>>(new Set());
    const [selectedId, selectedIdSet] = useState<string | undefined>(undefined);
    const [query, querySet] = useState("");
    const expansion: FileTreeExpansion = { opened, closed, defaultDepth: 1 };
    // The specimen has its whole listing in hand, so it answers a query the way
    // Changes does in the product. All Files asks the checkout instead, which is
    // a store's job and not something a blueprint page can stand in for.
    const matched = props.entries.filter((entry) => filePathMatches(entry.path, query));
    const nodes =
        query !== ""
            ? fileTreeRanked(matched)
            : layout === "tree"
              ? fileTreeBuild(props.entries, expansion)
              : fileTreeFlatten(props.entries);
    return panelFrame(
        <FileBrowser
            count={query === "" ? props.entries.length : matched.length}
            emptyLabel={query === "" ? undefined : `Nothing matches “${query}”.`}
            layout={layout}
            nodes={nodes}
            onLayoutChange={layoutSet}
            onScopeChange={scopeSet}
            onSearchQueryChange={querySet}
            searchQuery={query}
            onSelect={(id) => selectedIdSet(id)}
            onToggle={(path, expanded) => {
                openedSet((current) => {
                    const next = new Set(current);
                    if (expanded) next.add(path);
                    else next.delete(path);
                    return next;
                });
                closedSet((current) => {
                    const next = new Set(current);
                    if (expanded) next.delete(path);
                    else next.add(path);
                    return next;
                });
            }}
            scope={scope}
            {...(selectedId ? { selectedId } : {})}
        />,
        props.height ?? 480,
        props.width ?? 320,
    );
}
/** One checkout's section, the way the app lists a task's checkouts. */
function checkoutSection(
    id: string,
    name: string,
    detail: string | undefined,
    files: readonly FileTreeBuildEntry[],
    layout: FileBrowserLayout,
    expanded = true,
): FileTreeNode {
    // The files are addressed under the section, so two checkouts of one
    // repository never share a row identity.
    const entries = files.map((file) => ({
        ...file,
        path: `${id}/${file.path}`,
        displayPath: file.path,
    }));
    return {
        id,
        kind: "section",
        name,
        count: files.length,
        expanded,
        checkout: {
            mark: { initials: name.slice(0, 1).toUpperCase(), placeholderSeed: id },
            ...(detail === undefined ? {} : { detail }),
            addedLines: files.reduce((sum, file) => sum + (file.addedLines ?? 0), 0),
            deletedLines: files.reduce((sum, file) => sum + (file.deletedLines ?? 0), 0),
        },
        ...(expanded
            ? {
                  children:
                      layout === "tree"
                          ? fileTreeBuild(entries, {
                                opened: new Set(),
                                closed: new Set(),
                                defaultDepth: Number.POSITIVE_INFINITY,
                            })
                          : fileTreeFlatten(entries),
              }
            : {}),
    };
}
const checkoutFiles: readonly FileTreeBuildEntry[] = [
    {
        path: "crates/hc-api/src/routes/files.rs",
        gitStatus: "modified",
        addedLines: 84,
        deletedLines: 3,
    },
    { path: "API.md", gitStatus: "modified", addedLines: 12 },
];
function checkoutNodes(layout: FileBrowserLayout): FileTreeNode[] {
    return [
        checkoutSection(
            "checkout:desktop",
            "happy-desktop",
            "happy/per-checkout-changes",
            changed.slice(0, 3),
            layout,
        ),
        checkoutSection(
            "checkout:cluster",
            "happy-cluster",
            "happy/file-revision",
            checkoutFiles,
            layout,
        ),
        checkoutSection(
            "checkout:agent",
            "happy-agent-with-a-very-long-repository-name",
            "happy/a-branch-name-long-enough-to-give-way-first",
            changed.slice(3, 4),
            layout,
            false,
        ),
        checkoutSection("checkout:docs", "happy-docs", undefined, changed.slice(4, 5), layout),
    ];
}
const checkoutFileCount = checkoutNodes("flat").reduce((sum, node) => sum + (node.count ?? 0), 0);
/** A tiered listing whose headings fold, the way the product's do. */
function LiveTieredBrowser() {
    const [layout, layoutSet] = useState<FileBrowserLayout>("flat");
    const [changeTiers, changeTiersSet] = useState(tiers);
    const [query, querySet] = useState("");
    // A query narrows the files before they are split, so a tier whose files
    // all fail to match leaves with them.
    const matched = tiered.filter((entry) => filePathMatches(entry.path, query));
    return panelFrame(
        <FileBrowser
            count={matched.length}
            emptyLabel={query === "" ? undefined : `Nothing matches “${query}”.`}
            layout={layout}
            nodes={tieredNodes(matched, changeTiers, layout)}
            searchQuery={query}
            onLayoutChange={layoutSet}
            onSearchQueryChange={querySet}
            onToggle={(id, expanded) =>
                changeTiersSet((current) =>
                    current.map((entry) =>
                        `tier:${entry.id}` === id ? { ...entry, collapsed: !expanded } : entry,
                    ),
                )
            }
            scope="changed"
        />,
        520,
    );
}
export function FileBrowserPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One permanent Files tab contains a one-layer Changes / All Files choice: the group has no track, and only the selected option uses the file-tree selection fill. The same row carries totals and the List / Tree choice over a virtualized FileTree."
            title="FileBrowser"
        >
            <Specimen
                detail="32px bar · 24px controls · shared 6px selection inset"
                label="Changed files, flat"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser
                            addedLines={totals.added}
                            count={changed.length}
                            deletedLines={totals.deleted}
                            layout="flat"
                            nodes={fileTreeFlatten(changed)}
                            onReviewOpen={() => undefined}
                            scope="changed"
                            selectedId="packages/happy-desktop-ui/src/FileTree.tsx"
                        />,
                    )}
                    <DimensionRule label="32 px bar · 24 px selector · 28 px row · 6 px shared inset" />
                </div>
            </Specimen>

            <Specimen
                detail="Nothing has been opened by hand: the top level stands open, one level down"
                label="Changed files, tree"
                number="02"
                stage="surface"
            >
                {panelFrame(
                    <FileBrowser
                        addedLines={totals.added}
                        count={changed.length}
                        deletedLines={totals.deleted}
                        layout="tree"
                        nodes={fileTreeBuild(changed, untouched)}
                        scope="changed"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Whole checkout — a count, and no line totals to claim"
                label="All files"
                number="03"
                stage="surface"
            >
                {panelFrame(
                    <FileBrowser
                        count={everything.length}
                        layout="flat"
                        nodes={fileTreeFlatten(everything)}
                        note="Showing the first 20,000 files."
                        scope="all"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="A narrow panel: the path elides in its middle, the name never does"
                label="Narrow"
                number="04"
                stage="surface"
            >
                {panelFrame(
                    <FileBrowser
                        addedLines={totals.added}
                        count={changed.length}
                        deletedLines={totals.deleted}
                        layout="flat"
                        nodes={fileTreeFlatten(changed)}
                        scope="changed"
                    />,
                    320,
                    250,
                )}
            </Specimen>

            <Specimen detail="Loading and empty" label="States" number="06" stage="surface">
                <div style={{ display: "flex", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser count={0} layout="flat" loading nodes={[]} scope="all" />,
                        260,
                    )}
                    {panelFrame(
                        <FileBrowser
                            count={0}
                            emptyLabel="No changed files."
                            layout="flat"
                            nodes={[]}
                            scope="changed"
                        />,
                        260,
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="v2 before v10, Apple beside apple, folders ahead of files, and the same order flat as nested"
                label="Ordering"
                number="07"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser
                            count={awkward.length}
                            layout="tree"
                            nodes={fileTreeBuild(awkward, untouched)}
                            scope="all"
                        />,
                    )}
                    {panelFrame(
                        <FileBrowser
                            count={awkward.length}
                            layout="flat"
                            nodes={fileTreeFlatten(awkward)}
                            scope="all"
                        />,
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="Arrow keys walk it, Left and Right disclose, Enter opens; both switches keep the row you are on"
                label="Live"
                number="08"
                stage="surface"
            >
                <LiveBrowser entries={everything} />
            </Specimen>

            <Specimen
                detail="5,000 files — only the rows on screen exist, and the scrollbar still tells the truth about the rest"
                label="Whole checkout"
                number="09"
                stage="surface"
            >
                <LiveBrowser entries={bulk} height={480} width={360} />
            </Specimen>

            <Specimen
                detail="Secondary files listed under tier headings below the rest · first match wins · a tier that claims nothing draws no section · the count covers every tier"
                label="Tiers"
                number="11"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser
                            count={tiered.length}
                            layout="flat"
                            nodes={tieredNodes(tiered, tiers, "flat")}
                            onReviewOpen={() => undefined}
                            onSearchQueryChange={() => undefined}
                            scope="changed"
                            searchQuery=""
                            selectedId="packages/happy-desktop-ui/src/FileTree.test.tsx"
                        />,
                        520,
                    )}
                    {panelFrame(
                        <FileBrowser
                            count={tiered.length}
                            layout="tree"
                            nodes={tieredNodes(tiered, tiers, "tree")}
                            onReviewOpen={() => undefined}
                            onSearchQueryChange={() => undefined}
                            scope="changed"
                            searchQuery=""
                        />,
                        520,
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="A task working in several repositories lists each checkout under its own heading · 16px repository picture · name, then the branch, which gives way first · the checkout's line totals and file count"
                label="Checkouts"
                number="13"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser
                            count={checkoutFileCount}
                            layout="flat"
                            nodes={checkoutNodes("flat")}
                            onReviewOpen={() => undefined}
                            scope="changed"
                            selectedId="checkout:cluster/API.md"
                        />,
                        520,
                    )}
                    {panelFrame(
                        <FileBrowser
                            count={checkoutFileCount}
                            layout="tree"
                            nodes={checkoutNodes("tree")}
                            scope="changed"
                        />,
                        520,
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="Click or press Enter on a heading to fold its tier; Left from a file in a tier steps to its heading; a search drops the tiers it empties"
                label="Tiers, live"
                number="12"
                stage="surface"
            >
                <LiveTieredBrowser />
            </Specimen>

            <Specimen
                detail="known Happy Agent offline · retained rows and local selection remain · remote reads and writes are unavailable"
                label="Happy Agent offline"
                number="10"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "12px" }}>
                    {panelFrame(
                        <FileBrowser
                            addedLines={totals.added}
                            count={changed.length}
                            deletedLines={totals.deleted}
                            layout="flat"
                            nodes={fileTreeFlatten(changed)}
                            scope="changed"
                            scopeUnavailable={{
                                all: "Happy Agent must reconnect before loading all files.",
                            }}
                            selectedId="packages/happy-desktop-ui/src/FileTree.tsx"
                        />,
                    )}
                    {panelFrame(
                        <FileBrowser
                            count={everything.length}
                            fileActionsUnavailable="Happy Agent must reconnect before opening files."
                            layout="tree"
                            nodes={fileTreeBuild(everything, untouched)}
                            scope="all"
                        />,
                    )}
                </div>
            </Specimen>
            <Specimen
                detail="At the 200px listing minimum, the action group wraps beneath the scope choice; wider listings keep one row."
                label="Narrow listing"
                number="13"
                stage="surface"
            >
                {panelFrame(
                    <FileBrowser
                        addedLines={totals.added}
                        count={changed.length}
                        deletedLines={totals.deleted}
                        layout="flat"
                        nodes={fileTreeFlatten(changed)}
                        onReviewOpen={() => {}}
                        scope="changed"
                    />,
                    320,
                    200,
                )}
            </Specimen>
        </ComponentPage>
    );
}
