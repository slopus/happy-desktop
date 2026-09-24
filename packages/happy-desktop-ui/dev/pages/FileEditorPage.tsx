import { type ReactNode } from "react";
import { Banner } from "../../src/Banner";
import { EmptyState } from "../../src/EmptyState";
import { FileEditor } from "../../src/FileEditor";
import { MarkdownDocument } from "../../src/MarkdownDocument";
import { TabbedPane } from "../../src/TabbedPane";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-054";
const sample = `import { useState } from "react";

export function Counter() {
    const [count, setCount] = useState(0);
    return (
        <button onClick={() => setCount(count() + 1)}>
            Count: {count()}
        </button>
    );
}
`;
const wideSample = `[workspace]
guidance = "Workspace writes stay inside the checkout, its Git control directory, and temporary directories; everything else on the host is readable but never writable, and outbound network access flows through the managed proxy alone."
`;
const markdownSample = `# Notes

One sentence kept on one line the way dictated prose often is, long enough that the only honest ways to read it are to scroll after it or to fold it at the pane and keep reading.
`;
function frame(
    children: ReactNode,
    height = 420,
    tab: { path: string; dirty?: boolean } = { path: "src/components/Counter.tsx" },
) {
    const name = tab.path.split("/").at(-1) ?? tab.path;
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                height: `${height}px`,
                overflow: "hidden",
                width: "640px",
            }}
        >
            <TabbedPane
                activeId={tab.path}
                closeLabel="Close file"
                onClose={() => undefined}
                onSelect={() => undefined}
                tabs={[
                    {
                        closable: true,
                        icon: "doc",
                        id: tab.path,
                        label: name,
                        ...(tab.dirty ? { dirty: true } : {}),
                    },
                ]}
            >
                {children}
            </TabbedPane>
        </div>
    );
}
export function FileEditorPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A tab-owned text editor: the tab carries the file name and unsaved dot; a compact 32px diff-style path row sits over the code; there is no Save button or bottom path. Cmd/Ctrl+S saves."
            title="FileEditor"
        >
            <Specimen
                detail="Clean file — no dot, no Save button, no bottom status/path strip"
                label="Saved"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <FileEditor
                            documentKey="src/components/Counter.tsx@7f3a"
                            onDownload={() => {}}
                            onSave={() => {}}
                            path="src/components/Counter.tsx"
                            value={sample}
                        />,
                    )}
                    <DimensionRule label="640 px surface · 32 px tab · 32 px path row" />
                </div>
            </Specimen>

            <Specimen
                detail="Dirty — classic tab dot and Revert; Command-S is the only save control"
                label="Unsaved edits"
                number="02"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        dirty
                        documentKey="src/components/Counter.tsx@7f3a"
                        onRevert={() => {}}
                        onSave={() => {}}
                        path="src/components/Counter.tsx"
                        value={sample.replace("Count:", "Total:")}
                    />,
                    420,
                    { path: "src/components/Counter.tsx", dirty: true },
                )}
            </Specimen>

            <Specimen
                detail="Disk-change / conflict alert above the body"
                label="Conflict banner"
                number="03"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        banner={
                            <Banner action={{ label: "Reload", onClick: () => {} }} tone="warning">
                                This file changed on disk. Reloading discards your edits.
                            </Banner>
                        }
                        dirty
                        documentKey="README.md@aa31"
                        onRevert={() => {}}
                        onSave={() => {}}
                        path="README.md"
                        status="Conflict"
                        value={"# Project\n\nLocal edits that no longer match the file on disk.\n"}
                    />,
                    420,
                    { path: "README.md", dirty: true },
                )}
            </Specimen>

            <Specimen
                detail="Read-only — no Save/Revert, muted ink"
                label="Read only"
                number="04"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        documentKey="dist/bundle.js@19b0"
                        path="dist/bundle.js"
                        readOnly
                        status="Read only"
                        value={"// generated output — do not edit\nconsole.log(0);\n"}
                    />,
                    300,
                    { path: "dist/bundle.js" },
                )}
            </Specimen>
            <Specimen
                detail="known Happy Agent offline · the unsaved draft remains editable · persistence waits for reconnect"
                label="Happy Agent offline"
                number="05"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        dirty
                        documentKey="src/components/Counter.tsx@7f3a"
                        onRevert={() => {}}
                        onSave={() => {}}
                        onValueChange={() => {}}
                        path="src/components/Counter.tsx"
                        saveDisabled
                        status="Happy Agent is offline. Draft preserved locally."
                        value={sample.replace("Count:", "Total:")}
                    />,
                    420,
                    { path: "src/components/Counter.tsx", dirty: true },
                )}
            </Specimen>
            <Specimen
                detail="A cached tab goes straight to highlighted content; only a file with no retained content gets the loading surface"
                label="Cached vs cold"
                number="06"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <FileEditor
                            documentKey="src/components/Counter.tsx@7f3a"
                            onSave={() => {}}
                            path="src/components/Counter.tsx"
                            value={sample}
                        />,
                        280,
                    )}
                    {frame(
                        <EmptyState
                            animation="snail"
                            description="Reading the file from its workspace."
                            icon="doc"
                            size="panel"
                            title="Loading file…"
                        />,
                        220,
                        { path: "src/components/NewFile.tsx" },
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="Right-aligned in the path row; on a file with a rendered face it sits left of Rendered / Source and shows only with the source, so the face control never moves"
                label="Wrap"
                number="07"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <FileEditor
                            documentKey="happy.toml@31c8"
                            onSave={() => {}}
                            onWrapChange={() => {}}
                            path="happy.toml"
                            value={wideSample}
                            wrap
                        />,
                        220,
                        { path: "happy.toml" },
                    )}
                    {frame(
                        <FileEditor
                            documentKey="docs/notes.md@5d02"
                            initialFace="source"
                            onSave={() => {}}
                            onWrapChange={() => {}}
                            path="docs/notes.md"
                            rendered={<MarkdownDocument text={markdownSample} />}
                            value={markdownSample}
                        />,
                        220,
                        { path: "docs/notes.md" },
                    )}
                </div>
            </Specimen>

            <Specimen
                detail="A Markdown file opened at a region opens on its source: lines are a fact about the text, and the rendered page has none. The band marks what the reference named"
                label="Opened at a region"
                number="08"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        documentKey="docs/notes.md@5d02"
                        onSave={() => {}}
                        onWrapChange={() => {}}
                        path="docs/notes.md"
                        rendered={<MarkdownDocument text={markdownSample} />}
                        reveal={{ startLine: 3, endLine: 3, requestId: 1 }}
                        value={markdownSample}
                    />,
                    260,
                    { path: "docs/notes.md" },
                )}
            </Specimen>
        </ComponentPage>
    );
}
