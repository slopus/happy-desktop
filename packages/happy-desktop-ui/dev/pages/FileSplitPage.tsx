import { useState, type ReactNode } from "react";
import { FileBrowser, type FileBrowserLayout } from "../../src/FileBrowser";
import { FilePreview } from "../../src/FilePreview";
import { FileSplit } from "../../src/FileSplit";
import { fileTreeFlatten, type FileTreeBuildEntry } from "../../src/fileTreeBuild";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-351";
const changed: FileTreeBuildEntry[] = [
    {
        path: "packages/happy-desktop-ui/src/AppShell.tsx",
        gitStatus: "modified",
        addedLines: 64,
        deletedLines: 21,
    },
    {
        path: "packages/happy-desktop-ui/src/FileSplit.tsx",
        gitStatus: "added",
        addedLines: 157,
        deletedLines: 0,
    },
    {
        path: "packages/happy-desktop-ui/src/styles/file-split.css",
        gitStatus: "added",
        addedLines: 58,
        deletedLines: 0,
    },
    {
        path: "packages/happy-desktop-state/src/happyAgent/happyAgentViewPreferences.ts",
        gitStatus: "modified",
        addedLines: 40,
        deletedLines: 3,
    },
    { path: "docs/notes/side-panel.md", gitStatus: "renamed", addedLines: 3, deletedLines: 1 },
];
const sources: Readonly<Record<string, string>> = {
    "packages/happy-desktop-ui/src/AppShell.tsx": `/**
 * The widest a balanced panel grows. Past this width the extra room goes to
 * the conversation instead.
 */
export const APP_SHELL_PANEL_BALANCED_MAX_WIDTH = 720;

function panelShareOf(room: number): number {
    if (!(room > 0)) return PANEL_MAX_WIDTH;
    return Math.max(PANEL_MIN_WIDTH, Math.round(room * PANEL_MAX_FRACTION));
}
`,
};
function frame(children: ReactNode, width: number, height = 440) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                height: `${String(height)}px`,
                overflow: "hidden",
                width: `${String(width)}px`,
            }}
        >
            {children}
        </div>
    );
}
/**
 * A split wired to its own state, the way the product's Files tab is: a click
 * in the listing previews the file beside it, and the divider remembers where
 * it was left.
 */
function LiveSplit(props: { width: number; initial?: string }) {
    const [layout, layoutSet] = useState<FileBrowserLayout>("flat");
    const [selected, selectedSet] = useState<string | undefined>(props.initial);
    const [listWidth, listWidthSet] = useState<number>();
    return frame(
        <FileSplit
            {...(listWidth === undefined ? {} : { listWidth })}
            onListWidthChange={listWidthSet}
            {...(selected
                ? {
                      preview: (
                          <FilePreview
                              content={
                                  sources[selected] === undefined
                                      ? { type: "unavailable" }
                                      : { type: "text", text: sources[selected] }
                              }
                              // In the product this moves the file into a main
                              // tab; here the preview simply gives it up.
                              onOpenInTab={() => selectedSet(undefined)}
                              path={selected}
                          />
                      ),
                      previewKey: selected,
                  }
                : {})}
            emptyDescription="Its contents or changes show here, beside the list."
            listing={
                <FileBrowser
                    addedLines={164}
                    count={changed.length}
                    deletedLines={25}
                    layout={layout}
                    nodes={fileTreeFlatten(changed)}
                    onLayoutChange={layoutSet}
                    onSelect={(id) => selectedSet(id)}
                    scope="changed"
                    {...(selected ? { selectedId: selected } : {})}
                />
            }
        />,
        props.width,
    );
}
export function FileSplitPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The Files tab as one lane: the listing on the leading side, the picked file's preview filling the rest, meeting on the shell's own resize hairline. The preview column is there before anything is picked, so the first click fills it rather than opening it. Too narrow for both, the two take turns with a way back."
            title="FileSplit"
        >
            <Specimen
                detail="280 px listing · 200 px floor · preview takes the rest"
                label="Nothing picked yet"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <LiveSplit width={720} />
                    <DimensionRule label="720 px lane · 280 px listing · 1 px divider" />
                </div>
            </Specimen>
            <Specimen
                detail="the picked row carries the selection fill · Open in tab ends the header"
                label="A file picked"
                number="02"
                stage="surface"
            >
                <LiveSplit initial="packages/happy-desktop-ui/src/AppShell.tsx" width={720} />
            </Specimen>
            <Specimen
                detail="below 520 px the preview replaces the listing, with a way back"
                label="Stacked in a narrow lane"
                number="03"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "row", gap: "16px" }}>
                    <LiveSplit width={400} />
                    <LiveSplit initial="packages/happy-desktop-ui/src/AppShell.tsx" width={400} />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
