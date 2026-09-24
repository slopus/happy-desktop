import {
    ComposerAttachmentPreviews,
    type ComposerAttachmentPreview,
} from "../../src/ComposerAttachmentPreviews";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { videoClipWide } from "./videoClips";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-167a";

const imagePreview = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#172554"/><circle cx="116" cy="44" r="24" fill="#fbbf24"/><path d="M0 132 54 70l34 38 22-22 50 50v24H0Z" fill="#22d3ee"/><path d="M0 144 54 82l34 38 22-22 50 50v12H0Z" fill="#f472b6"/></svg>',
)}`;

const items: readonly ComposerAttachmentPreview[] = [
    {
        id: "image",
        kind: "image",
        name: "reference.png",
        detail: "823 KB",
        url: imagePreview,
    },
    {
        id: "video",
        kind: "video",
        name: "walkthrough.webm",
        detail: "7.9 MB",
        url: videoClipWide,
    },
    { id: "file", kind: "file", name: "requirements.pdf", detail: "122 KB" },
];

const denseItems: readonly ComposerAttachmentPreview[] = [
    ...items,
    { id: "notes", kind: "file", name: "release-notes.md", detail: "18 KB" },
    { id: "archive", kind: "file", name: "assets.zip", detail: "4.2 MB" },
];

const noteItems: readonly ComposerAttachmentPreview[] = [
    {
        id: "one",
        kind: "comments",
        name: "1 comment",
        notes: [
            {
                id: "n1",
                path: "packages/happy-desktop-ui/src/ReviewStream.tsx",
                place: "line R124",
                text: "This reads the measured height before the file below it has drawn.",
            },
        ],
    },
    {
        id: "many",
        kind: "comments",
        name: "3 comments",
        notes: [
            {
                id: "n2",
                path: "packages/happy-desktop-state/src/happyAgent/happyAgentWorkspaceStore.ts",
                place: "line R5912",
                text: "Say why the notes are projected here rather than at send.",
            },
            {
                id: "n3",
                path: "packages/happy-desktop-ui/src/ChangedFileDiff.tsx",
                place: "line L88",
                stale: true,
                text: "The removed branch was the only caller of this helper.",
            },
            {
                id: "n4",
                path: "docs/releases.md",
                place: "this file",
                text: "Two paragraphs here describe the same step.\nKeep the second one.",
            },
        ],
    },
];

const noop = () => undefined;

export function ComposerAttachmentPreviewsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Compact square previews for image, video, and ordinary files waiting in a composer draft, a pill for the review notes waiting with it, and a removable and read-only treatment."
            title="Composer attachment previews"
        >
            <Specimen
                detail="56px squares · 8px gap · 28px remove targets"
                label="Image, video, and file"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <DimensionRule label="56 × 56 px" />
                    <ComposerAttachmentPreviews items={items} onOpen={noop} onRemove={noop} />
                </div>
            </Specimen>
            <Specimen
                detail="160px constraint · five attachments wrap without overflow"
                label="Wrapped"
                number="02"
                stage="surface"
            >
                <ComposerAttachmentPreviews
                    items={denseItems}
                    onOpen={noop}
                    onRemove={noop}
                    style={{ width: "160px" }}
                />
            </Specimen>
            <Specimen
                detail="32px pill · sized to its own words · the notes themselves under the pointer"
                label="Review notes"
                number="03"
                stage="surface"
            >
                <ComposerAttachmentPreviews items={noteItems} onRemove={noop} />
            </Specimen>
            <Specimen
                detail="same geometry · removal withheld while the draft is read-only"
                label="Read only"
                number="04"
                stage="surface"
            >
                <ComposerAttachmentPreviews items={items} onOpen={noop} readOnly />
            </Specimen>
        </ComponentPage>
    );
}
