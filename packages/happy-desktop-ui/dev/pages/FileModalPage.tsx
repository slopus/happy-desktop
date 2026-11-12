import { type ReactNode } from "react";
import { FileModal } from "../../src/FileModal";
import { FilePreview } from "../../src/FilePreview";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-342";

const markdown = `# Release notes

A file a message names opens over the conversation, at the size the window
gives it, and goes back where it came from with Escape or Command-W.

- **Open beside** moves it into the panel next to the conversation
- **Show in Finder** selects it in the file manager
`;
const sampleImage = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
        <rect width="640" height="400" fill="#1f2a44"/>
        <circle cx="200" cy="150" r="90" fill="#2baccc"/>
        <rect x="300" y="200" width="260" height="140" rx="12" fill="#e0a458"/>
    </svg>`,
)}`;

/** The overlay's gutter box, standing in for the window the card fills. */
function Window(props: { readonly children: ReactNode; readonly height?: number }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
                width: 1040,
                height: props.height ?? 560,
                padding: 24,
                background: "var(--overlay-backdrop)",
            }}
        >
            {props.children}
        </div>
    );
}

export function FileModalPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="File modal"
            summary="One file a message named, read over the conversation. A panel card hosted directly by ModalOverlay that fills the 24px gutter box up to 960 × 880; a 48px header names the file and offers Open beside, Show in Finder and Close, and the file's own surface fills the rest."
            width={1100}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <Specimen
                    number="01"
                    label="A workspace document"
                    stage="surface"
                    detail="Open beside · Show in Finder · Close · Markdown rendered below"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <Window>
                            <FileModal
                                onBesideOpen={() => {}}
                                onClose={() => {}}
                                onReveal={() => {}}
                                path="docs/release-notes.md"
                            >
                                <FilePreview
                                    content={{ type: "text", text: markdown }}
                                    onDownload={() => {}}
                                    path="docs/release-notes.md"
                                    pathHidden
                                    size="1.2 KB"
                                />
                            </FileModal>
                        </Window>
                        <DimensionRule label="960 max width · 24 px gutter · 48 px header" />
                    </div>
                </Specimen>
                <Specimen
                    number="02"
                    label="A file a tool call presented"
                    stage="surface"
                    detail="No file manager for it, so only Open beside and Close"
                >
                    <Window height={460}>
                        <FileModal
                            onBesideOpen={() => {}}
                            onClose={() => {}}
                            path="renders/relay-field.svg"
                        >
                            <FilePreview
                                content={{ type: "url", url: sampleImage }}
                                dimensions="640 × 400"
                                kind="image"
                                onDownload={() => {}}
                                path="renders/relay-field.svg"
                                pathHidden
                                size="18 KB"
                            />
                        </FileModal>
                    </Window>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
