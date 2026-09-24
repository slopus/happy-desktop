import { useState, type ReactNode } from "react";
import { Button } from "../../src/Button";
import { CodeEditor } from "../../src/CodeEditor";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** Long enough to scroll, so what a save does to the scroll can be seen. */
const long = Array.from(
    { length: 120 },
    (_unused, index) => `export const value${String(index)} = ${String(index)};`,
).join("\n");

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-175";

const typescript = `import { CodeEditor } from "happy-desktop-ui";

/** The file tab's body: one file, edited where it is read. */
export function Editor(props: { path: string; text: string }) {
    const dirty = props.text !== saved;
    return (
        <CodeEditor
            name={props.path}
            onValueChange={(value) => draft.update(value)}
            value={props.text}
        />
    );
}
`;

const python = `from dataclasses import dataclass


@dataclass
class Session:
    """One agent session, as the daemon reports it."""

    id: str
    waiting: bool = False

    def label(self) -> str:
        return f"{self.id}{' (waiting)' if self.waiting else ''}"
`;

function frame(children: ReactNode, height = 280, width = 720) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
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
 * What saving does to the editor's identity: the file keeps the text that was
 * just written to it and gets a new identity for it. The caret, the selection,
 * and the scroll belong to the person, not to the identity, so they stay.
 */
function SavedEditor() {
    const [version, versionSet] = useState(1);
    const [text, textSet] = useState(long);
    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div style={{ flex: "none", padding: "6px" }}>
                <Button
                    data-testid="code-editor-save"
                    onClick={() => versionSet(version + 1)}
                    size="small"
                    variant="secondary"
                >
                    {`Save (identity ${String(version)})`}
                </Button>
            </div>
            <CodeEditor
                documentKey={`sources/long.ts@${String(version)}`}
                name="sources/long.ts"
                onSave={() => versionSet(version + 1)}
                onValueChange={textSet}
                value={text}
            />
        </div>
    );
}

/**
 * What a reference does when it is followed: the lines it named are scrolled to
 * and banded, and asking again takes the reader back to them. The band is only
 * ever put there by a fresh ask, so clicking into the text puts it away.
 */
function RevealedEditor() {
    const [requestId, requestIdSet] = useState(1);
    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div style={{ flex: "none", padding: "6px" }}>
                <Button
                    data-testid="code-editor-reveal"
                    onClick={() => requestIdSet(requestId + 1)}
                    size="small"
                    variant="secondary"
                >
                    Show lines 84–88
                </Button>
            </div>
            <CodeEditor
                name="sources/long.ts"
                readOnly
                reveal={{ startLine: 84, endLine: 88, requestId }}
                value={long}
            />
        </div>
    );
}

export function CodeEditorPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A real code editor for one file: CodeMirror parses incrementally, so highlighting keeps up with typing at any file size. Undo history, bracket matching, and a line-number gutter come with it; Cmd/Ctrl+S reports intent to save."
            title="CodeEditor"
        >
            <Specimen
                detail="Language from the file name · 13 px / 20 px"
                label="Editing"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(<CodeEditor name="Editor.tsx" value={typescript} />)}
                    <DimensionRule label="720 × 280 px region · 40 px gutter" />
                </div>
            </Specimen>

            <Specimen
                detail="Another grammar, the same palette"
                label="Python"
                number="02"
                stage="surface"
            >
                {frame(<CodeEditor name="session.py" value={python} />)}
            </Specimen>

            <Specimen
                detail="Saving gives the file a new identity for the text it already holds. Put the caret deep in the file, scroll, then save: both stay where the person left them"
                label="Saved"
                number="05"
                stage="surface"
            >
                {frame(<SavedEditor />, 320)}
            </Specimen>

            <Specimen
                detail="A reference named these lines. The band outlives the scroll, because landing in the middle of a file says nothing about which lines were meant; clicking into the text puts it away, and asking again brings it back"
                label="Referenced region"
                number="06"
                stage="surface"
            >
                {frame(<RevealedEditor />, 320)}
            </Specimen>

            <Specimen
                detail="A file being read rather than written goes quiet"
                label="Read-only"
                number="03"
                stage="surface"
            >
                {frame(<CodeEditor name="Editor.tsx" readOnly value={typescript} />, 200)}
            </Specimen>

            <Specimen
                detail="The same editor on the dark face — one palette, no appearance prop"
                label="Dark"
                number="04"
                stage="surface"
            >
                <div className="happy-theme-dark" style={{ display: "flex" }}>
                    {frame(<CodeEditor name="Editor.tsx" value={typescript} />)}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
