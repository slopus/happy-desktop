import { type ReactNode } from "react";
import { ChangedFileDiff } from "../../src/ChangedFileDiff";
import { FileEditor } from "../../src/FileEditor";
import {
    FileOpenInMenu,
    fileOpenInMenuItems,
    type FileOpenInMenuProps,
} from "../../src/FileOpenInMenu";
import { FilePreview } from "../../src/FilePreview";
import { Menu } from "../../src/Menu";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-306";

const editors: FileOpenInMenuProps["targets"] = [
    { id: "vscode", label: "VS Code" },
    { id: "cursor", label: "Cursor" },
    { id: "zed", label: "Zed" },
    { id: "xcode", label: "Xcode" },
];
const noop = () => {};

const available: FileOpenInMenuProps = {
    targets: editors,
    onReveal: noop,
    onDefaultAppOpen: noop,
    onTargetOpen: noop,
};

function frame(children: ReactNode, height = 120, width = 640) {
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

/** The menu a state opens onto, drawn in place so every state can be reviewed at once. */
function opened(props: FileOpenInMenuProps) {
    return (
        <Menu
            items={fileOpenInMenuItems(props)}
            label={props.unavailableReason ?? "Open in"}
            width={240}
        />
    );
}

export function FileOpenInMenuPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Opens one project file outside Happy, from the header of every file it previews: Show in Finder, the file's default application, or an installed editor. A 28px ghost icon trigger beside Download; the popover hangs off the window overlay and aligns to the trigger's end edge."
            title="FileOpenInMenu"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Raster pictures, recordings, plain text, and Markdown"
                    label="Document"
                    number="01"
                    stage="app"
                >
                    {opened(available)}
                </Specimen>
                <Specimen
                    detail="Source and anything that might run: no default-application row"
                    label="Source"
                    number="02"
                    stage="app"
                >
                    {opened({ ...available, onDefaultAppOpen: undefined })}
                </Specimen>
                <Specimen
                    detail="No editor installed: no separator, no editor rows"
                    label="No editors"
                    number="03"
                    stage="app"
                >
                    {opened({ ...available, targets: [] })}
                </Specimen>
                <Specimen
                    detail="Transient: the reason is the heading, every row is disabled"
                    label="Offline"
                    number="04"
                    stage="app"
                >
                    {opened({ ...available, unavailableReason: "Happy Agent is offline." })}
                </Specimen>
                <Specimen
                    detail="A desktop app from before this feature"
                    label="App outdated"
                    number="05"
                    stage="app"
                >
                    {opened({
                        targets: [],
                        onReveal: noop,
                        onTargetOpen: noop,
                        unavailableReason: "Update Happy to open files in other apps.",
                    })}
                </Specimen>
            </div>

            <Specimen
                detail="Beside Download in the 32px preview header"
                label="In a preview"
                number="06"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(
                        <FilePreview
                            actions={<FileOpenInMenu {...available} />}
                            content={{ type: "unavailable" }}
                            onClose={noop}
                            onDownload={noop}
                            path="docs/assets/screens/onboarding.png"
                            size="214 KB"
                        />,
                    )}
                    <DimensionRule label="28 px trigger · 4 px gap · end-aligned 240 px popover" />
                </div>
            </Specimen>

            <Specimen
                detail="Before Download in the 32px editor header"
                label="In an editor"
                number="07"
                stage="surface"
            >
                {frame(
                    <FileEditor
                        actions={<FileOpenInMenu {...available} onDefaultAppOpen={undefined} />}
                        onClose={noop}
                        onDownload={noop}
                        path="packages/happy-desktop-app/sources/AppHappyAgentView.tsx"
                        value={"export function AppHappyAgentView() {}\n"}
                    />,
                    140,
                )}
            </Specimen>

            <Specimen
                detail="Ends the changed-file bar in every view; disabled for a deleted file"
                label="In a changed file"
                number="08"
                stage="surface"
            >
                {frame(
                    <ChangedFileDiff
                        actions={
                            <FileOpenInMenu
                                {...available}
                                onDefaultAppOpen={undefined}
                                unavailableReason="This file was deleted in these changes."
                            />
                        }
                        appearance="light"
                        newContent=""
                        oldContent={"removed\n"}
                        onWrapChange={noop}
                        path="scripts/old-release.sh"
                    />,
                    160,
                )}
            </Specimen>
        </ComponentPage>
    );
}
