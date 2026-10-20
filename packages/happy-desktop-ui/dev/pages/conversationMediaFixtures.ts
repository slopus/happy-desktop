import type {
    ConversationMediaItem,
    ConversationToolCall,
    HappyAgentArtifactId,
} from "happy-desktop-state";
import type { MessageReferences } from "../../src/messageReferences";
import { videoClipWide } from "./videoClips";

/*
 * Deterministic, offline presented files: inline SVG pictures, the workbench's
 * own encoded clip, and ThumbHashes encoded from the same palettes, so a
 * screenshot never waits on the network and every run paints the same pixels.
 */
function svg(width: number, height: number, body: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">${body}</svg>`,
    )}`;
}

export const mediaSquareUrl = svg(
    1024,
    1024,
    `<rect width="1024" height="1024" fill="#283c6e"/>
     <rect width="1024" height="614" fill="#f0a868"/>
     <circle cx="512" cy="560" r="180" fill="#ffd27a"/>
     <path d="M0 640 L300 460 L620 680 L1024 420 L1024 1024 L0 1024 Z" fill="#283c6e"/>`,
);
export const mediaSquareThumbhash = "nzgOXxCHh4d/eHiGiGiImIeIlvhoh48J";

export const mediaWideUrl = svg(
    1600,
    900,
    `<rect width="1600" height="900" fill="#1f2a44"/>
     <circle cx="480" cy="380" r="220" fill="#2baccc"/>
     <rect x="760" y="520" width="640" height="300" rx="28" fill="#e0a458"/>`,
);
export const mediaWideThumbhash = "E8cFDIiFh4eAiIiHeHdwf0j4eA==";

export const mediaTallUrl = svg(
    900,
    1600,
    `<rect width="900" height="1600" fill="#3c8278"/>
     <rect y="800" width="900" height="800" fill="#b48ca0"/>
     <circle cx="450" cy="520" r="200" fill="#f2e6c8"/>`,
);
export const mediaTallThumbhash = "3+cFJAxzB4iIh4eHeIePgogIeA==";

/** An address no image decodes from, so the tile settles into its failure. */
export const mediaBrokenUrl = "data:image/png;base64,AAAA";

export const mediaImageSquare: ConversationMediaItem = {
    kind: "image",
    name: "dithered-sunset.png",
    mimeType: "image/png",
    size: 1_482_112,
    width: 1024,
    height: 1024,
    thumbhash: mediaSquareThumbhash,
    url: mediaSquareUrl,
};

export const mediaImageWide: ConversationMediaItem = {
    kind: "image",
    name: "relay-field.png",
    mimeType: "image/png",
    size: 2_204_901,
    width: 1600,
    height: 900,
    thumbhash: mediaWideThumbhash,
    url: mediaWideUrl,
};

export const mediaImageTall: ConversationMediaItem = {
    kind: "image",
    name: "poster-draft.webp",
    mimeType: "image/webp",
    size: 318_440,
    width: 900,
    height: 1600,
    thumbhash: mediaTallThumbhash,
    url: mediaTallUrl,
};

/**
 * A 16:10 desktop screenshot drawn as an app window — sidebar, toolbar, text
 * lines, and cards — so a mosaic shows whether its content stays legible.
 * The accent tells the four apart.
 */
function screenshotUrl(accent: string, title: string): string {
    const lines = Array.from(
        { length: 9 },
        (_, index) =>
            `<rect x="420" y="${String(250 + index * 56)}" width="${String(900 - (index % 3) * 180)}" height="20" rx="10" fill="#3a4152"/>`,
    ).join("");
    const items = Array.from(
        { length: 8 },
        (_, index) =>
            `<rect x="40" y="${String(170 + index * 72)}" width="${String(240 - (index % 2) * 60)}" height="24" rx="12" fill="${index === 1 ? accent : "#323846"}"/>`,
    ).join("");
    return svg(
        1600,
        1000,
        `<rect width="1600" height="1000" fill="#1b1f27"/>
         <rect width="340" height="1000" fill="#232833"/>
         <rect width="1600" height="96" fill="#262c38"/>
         <circle cx="48" cy="48" r="14" fill="#ff5f57"/>
         <circle cx="92" cy="48" r="14" fill="#febc2e"/>
         <circle cx="136" cy="48" r="14" fill="#28c840"/>
         <text x="420" y="64" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#e8ebf2">${title}</text>
         <rect x="1300" y="28" width="250" height="44" rx="22" fill="${accent}"/>
         ${items}${lines}
         <rect x="420" y="780" width="520" height="160" rx="24" fill="${accent}" opacity="0.85"/>
         <rect x="980" y="780" width="560" height="160" rx="24" fill="#323846"/>`,
    );
}

function screenshot(name: string, accent: string, title: string): ConversationMediaItem {
    return {
        kind: "image",
        name,
        mimeType: "image/png",
        size: 412_880,
        width: 1600,
        height: 1000,
        url: screenshotUrl(accent, title),
    };
}

/** Four 16:10 UI screenshots presented together, the case a square grid crops hardest. */
export const mediaScreenshots: readonly ConversationMediaItem[] = [
    screenshot("settings-general.png", "#5b8cff", "General"),
    screenshot("settings-models.png", "#34c38f", "Models"),
    screenshot("settings-secrets.png", "#f0a868", "Secrets"),
    screenshot("settings-about.png", "#c084fc", "About"),
];

export const mediaImagePanorama: ConversationMediaItem = {
    kind: "image",
    name: "skyline-panorama.jpg",
    mimeType: "image/jpeg",
    size: 3_921_004,
    width: 3200,
    height: 1000,
    url: svg(
        3200,
        1000,
        `<rect width="3200" height="1000" fill="#1d2b4a"/>
         <rect y="620" width="3200" height="380" fill="#0f1729"/>
         <circle cx="2500" cy="300" r="150" fill="#f5d07a"/>
         <path d="M0 700 L240 520 L420 640 L700 420 L980 610 L1300 470 L1640 650 L2000 500 L2360 660 L2700 540 L3200 680 L3200 1000 L0 1000 Z" fill="#2e4a6e"/>`,
    ),
};

export const mediaImagePortrait: ConversationMediaItem = {
    kind: "image",
    name: "mobile-preview.png",
    mimeType: "image/png",
    size: 640_112,
    width: 1000,
    height: 1500,
    url: svg(
        1000,
        1500,
        `<rect width="1000" height="1500" fill="#2a2140"/>
         <rect x="80" y="120" width="840" height="520" rx="48" fill="#8b7cf7"/>
         <rect x="80" y="700" width="600" height="44" rx="22" fill="#d9d2ff"/>
         <rect x="80" y="780" width="760" height="32" rx="16" fill="#5d5280"/>
         <rect x="80" y="840" width="700" height="32" rx="16" fill="#5d5280"/>
         <rect x="80" y="1300" width="840" height="110" rx="55" fill="#f472b6"/>`,
    ),
};

/** A portrait picture whose producer stated no size: its ThumbHash gives the shape. */
export const mediaImageHashedOnly: ConversationMediaItem = {
    kind: "image",
    name: "poster-draft-unsized.webp",
    mimeType: "image/webp",
    size: 318_440,
    thumbhash: mediaTallThumbhash,
    url: mediaTallUrl,
};

/** A picture with neither a size nor a ThumbHash: the mosaic assumes 4:3. */
export const mediaImageUnsized: ConversationMediaItem = {
    kind: "image",
    name: "capture.heic",
    mimeType: "image/heic",
    size: 1_200_400,
    url: mediaSquareUrl,
};

export const mediaVideo: ConversationMediaItem = {
    kind: "video",
    name: "onboarding-walkthrough.webm",
    mimeType: "video/webm",
    size: 4_812_330,
    url: videoClipWide,
};

export const mediaDocument: ConversationMediaItem = {
    kind: "document",
    name: "Q3 launch readiness review.pdf",
    mimeType: "application/pdf",
    size: 1_784_220,
    url: "data:application/pdf;base64,",
};

export const mediaFile: ConversationMediaItem = {
    kind: "file",
    name: "release-assets.zip",
    mimeType: "application/zip",
    size: 42_118_000,
    url: "data:application/zip;base64,",
};

function presentedTool(
    toolCallId: string,
    toolName: string,
    items: readonly ConversationMediaItem[],
): ConversationToolCall {
    return {
        toolCallId,
        toolName,
        arguments: {},
        status: "success",
        failed: false,
        presentation: { type: "media", items },
    };
}

export const generatedImageTool = presentedTool("tool-imagegen", "codex_imagegen", [
    mediaImageWide,
]);
export const generatedImagesTool = presentedTool("tool-imagegen-grid", "gemini_imagegen", [
    mediaImageSquare,
    mediaImageWide,
    mediaImageTall,
]);
export const presentedVideoTool = presentedTool("tool-present-video", "present_files", [
    mediaVideo,
]);
export const presentedFilesTool = presentedTool("tool-present-files", "present_files", [
    mediaDocument,
    mediaFile,
]);

export const artifactId = "a7k2m9q4r8t1v5w3x6y0z2b4" as HappyAgentArtifactId;

export const createdArtifactTool: ConversationToolCall = {
    toolCallId: "tool-create-artifact",
    toolName: "create_artifact",
    arguments: {},
    status: "success",
    failed: false,
    presentation: {
        type: "artifact",
        artifactId,
        version: 1,
        artifactType: "html",
        title: "Relay flagship landing page",
        shows: "latest",
    },
};

export const updatedArtifactTool: ConversationToolCall = {
    toolCallId: "tool-update-artifact",
    toolName: "update_artifact",
    arguments: {},
    status: "success",
    failed: false,
    presentation: {
        type: "artifact",
        artifactId,
        version: 4,
        artifactType: "document",
        title: "Q3 launch readiness review",
        shows: "version",
    },
};

/** Live titles as the window would have them: the artifact was renamed since. */
export const artifactReferences: MessageReferences = {
    view: (reference) =>
        reference.kind === "artifact"
            ? { type: "link", label: "Relay flagship — final", busy: false }
            : { type: "text", label: reference.id },
    open: () => undefined,
};
