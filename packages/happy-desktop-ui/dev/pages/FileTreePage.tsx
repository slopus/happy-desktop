import type { ContextMenuSelectionResult } from "../../src/ContextMenu";
import { FileTree, type FileTreeContextSelection, type FileTreeNode } from "../../src/FileTree";
import type { MenuItem } from "../../src/Menu";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-052";

const sampleNodes: FileTreeNode[] = [
    {
        id: "src/",
        name: "src",
        kind: "directory",
        expanded: true,
        children: [
            {
                id: "src/components/",
                name: "components",
                kind: "directory",
                expanded: true,
                hasMore: true,
                children: [
                    {
                        id: "src/components/FileTree.tsx",
                        name: "FileTree.tsx",
                        kind: "file",
                        gitStatus: "added",
                    },
                    {
                        id: "src/components/Sidebar.tsx",
                        name: "Sidebar.tsx",
                        kind: "file",
                        gitStatus: "modified",
                    },
                    {
                        id: "src/components/legacy.tsx",
                        name: "legacy.tsx",
                        kind: "file",
                        gitStatus: "deleted",
                    },
                ],
            },
            { id: "src/index.ts", name: "index.ts", kind: "file", gitStatus: "modified" },
            { id: "src/theme.css", name: "theme.css", kind: "file" },
            { id: "src/logo.svg", name: "logo.svg", kind: "file" },
            { id: "src/notes.md", name: "notes.md", kind: "file", gitStatus: "renamed" },
        ],
    },
    {
        id: "tests/",
        name: "tests",
        kind: "directory",
        expanded: true,
        loading: true,
    },
    { id: "deploy.sh", name: "deploy.sh", kind: "file" },
    { id: "package.json", name: "package.json", kind: "file", gitStatus: "modified" },
    { id: ".env.local", name: ".env.local", kind: "file", gitStatus: "untracked" },
    { id: "dist/", name: "dist", kind: "directory", gitStatus: "ignored" },
    { id: "README.md", name: "README.md", kind: "file" },
];

const collapsedNodes: FileTreeNode[] = [
    { id: ".git/", name: ".git", kind: "directory" },
    { id: "node_modules/", name: "node_modules", kind: "directory", gitStatus: "ignored" },
    { id: "src/", name: "src", kind: "directory", gitStatus: "modified" },
    { id: "package.json", name: "package.json", kind: "file" },
];

const sampleSelectedIds = new Set(["src/index.ts", "src/theme.css"]);

/** Enough rows that drawing all of them would be the wrong thing to do. */
const manyNodes: FileTreeNode[] = Array.from({ length: 2000 }, (_, index) => ({
    id: `src/module-${String(index)}.ts`,
    name: `module-${String(index)}.ts`,
    kind: "file" as const,
}));

function frame(children: ReturnType<typeof FileTree>, width = 320) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                padding: "6px",
                width: `${width}px`,
            }}
        >
            {children}
        </div>
    );
}

function rowMenuItems(selection: FileTreeContextSelection): readonly MenuItem[] {
    return [
        { kind: "item", id: "open", label: "Open", icon: "doc" },
        { kind: "item", id: "reveal", label: "Show in Finder", icon: "eye" },
        { kind: "separator" },
        {
            kind: "item",
            id: "copy-relative-path",
            label: selection.entries.length > 1 ? "Copy relative paths" : "Copy relative path",
            icon: "copy",
        },
    ];
}

function rowMenuSelect(
    selection: FileTreeContextSelection,
    actionId: string,
): Promise<ContextMenuSelectionResult> | undefined {
    if (actionId !== "copy-relative-path") return undefined;
    return navigator.clipboard
        .writeText(selection.entries.map((entry) => entry.id).join("\n"))
        .then(() => ({ feedback: "Relative path copied" }));
}

export function FileTreePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A props-only file/folder explorer: 28px rows, chevron disclosure for directories, 16px-per-level indentation, file-type icons resolved from each name, git-status decorations, selection, right-click actions, and a 'Show more' paging affordance."
            title="FileTree"
        >
            <Specimen
                detail="28px rows · 16px indent · git decorations · selection · paging · per-directory loading"
                label="Materialized tree"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <FileTree
                            nodes={sampleNodes}
                            onLoadMore={() => {}}
                            onSelect={() => {}}
                            onToggle={() => {}}
                            onRowMenuSelect={rowMenuSelect}
                            rowMenuItems={rowMenuItems}
                            selectedId="src/index.ts"
                            selectedIds={sampleSelectedIds}
                        />,
                    )}
                    <DimensionRule label="320 px panel · 28 px row · 16 px indent per level" />
                </div>
            </Specimen>

            <Specimen
                detail="Collapsed directories waiting to disclose; ignored entries dimmed"
                label="Collapsed roots"
                number="02"
                stage="surface"
            >
                {frame(<FileTree nodes={collapsedNodes} onToggle={() => {}} />)}
            </Specimen>

            <Specimen
                detail="Owns its own scrolling and draws only the rows on screen; 2,000 rows, ~24 in the DOM"
                label="Virtualized"
                number="03"
                stage="surface"
            >
                <div
                    style={{
                        background: "var(--surface)",
                        border: "1px solid var(--divider)",
                        borderRadius: "10px",
                        display: "flex",
                        flexDirection: "column",
                        height: "320px",
                        overflow: "hidden",
                        width: "320px",
                    }}
                >
                    <FileTree nodes={manyNodes} onSelect={() => {}} virtualize />
                </div>
            </Specimen>

            <Specimen detail="Initial load" label="Loading" number="04" stage="surface">
                {frame(<FileTree loading nodes={[]} />)}
            </Specimen>

            <Specimen detail="Nothing to show" label="Empty" number="05" stage="surface">
                {frame(<FileTree nodes={[]} />)}
            </Specimen>
        </ComponentPage>
    );
}
