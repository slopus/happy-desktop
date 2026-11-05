import { useState, type ReactNode } from "react";
import {
    entryKey,
    happyAgentArtifactAuthorLabel,
    happyAgentArtifactSourceLabel,
    type HappyAgentArtifact,
    type HappyAgentArtifactCatalogSnapshot,
    type HappyAgentArtifactContent,
    type HappyAgentArtifactCover,
    type HappyAgentArtifactFile,
    type HappyAgentArtifactFileLink,
    type HappyAgentArtifactId,
    type HappyAgentArtifactMarkdownView,
    type HappyAgentArtifactNames,
    type HappyAgentArtifactStaticReason,
    type HappyAgentArtifactThumbnail,
    type HappyAgentArtifactType,
    type HappyAgentArtifactVersion,
    type HappyAgentArtifactViewerSnapshot,
} from "happy-desktop-state";
import { AgentActivityRow } from "../../src/AgentActivityRow";
import { conversationInlinePage } from "../../src/conversationInlinePages";
import type {
    HappyAgentArtifactLabels,
    HappyAgentArtifactSourceChoice,
} from "../../src/pages/artifacts/artifactPresentation";
import { HappyAgentArtifactsPage } from "../../src/pages/artifacts/HappyAgentArtifactsPage";
import { HappyAgentArtifactsPanel } from "../../src/pages/artifacts/HappyAgentArtifactsPanel";
import { HappyAgentArtifactViewer } from "../../src/pages/artifacts/HappyAgentArtifactViewer";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";
import { ARCADE_HTML, ArcadeStandIn, arcadeEntry, arcadeInline } from "./artifactAppFixture";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-017";

const names: HappyAgentArtifactNames = {
    bot: (id) => (id === "bot-1" ? "Release notes bot" : undefined),
    task: (id) => (id === "task-1" ? "Quarterly report" : undefined),
    project: (id) => (id === "project-1" ? "happy-desktop" : undefined),
    workspace: (id) => (id === "workspace-1" ? "artifacts" : undefined),
    agent: (id) => (id === "agent-1" ? "Draft the launch post" : undefined),
    user: (id) => (id === "user-1" ? "Steve" : undefined),
};

/** Fixed moments, written without the clock so every capture is the same. */
const MOMENTS = new Map<number, string>([
    [1_760_000_000_000, "Oct 9, 2025, 10:53"],
    [1_760_003_600_000, "Oct 9, 2025, 11:53"],
    [1_760_090_000_000, "Oct 10, 2025, 11:53"],
    [1_760_100_000_000, "Oct 10, 2025, 14:40"],
]);

const labels: HappyAgentArtifactLabels = {
    source: (source) => happyAgentArtifactSourceLabel(source, names),
    author: (author) => happyAgentArtifactAuthorLabel(author, names),
    time: (at) => MOMENTS.get(at) ?? "Oct 9, 2025",
};

const sources: readonly HappyAgentArtifactSourceChoice[] = [
    { kind: "bot", label: "Any bot" },
    { kind: "task", label: "Any task" },
    { kind: "project", label: "Any project" },
    { kind: "workspace", label: "Any workspace" },
    { kind: "agent", label: "Any conversation" },
    { kind: "bot", id: "bot-1", label: "Release notes bot" },
    { kind: "project", id: "project-1", label: "happy-desktop" },
];

function svg(fill: string, label: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="${fill}"/><circle cx="240" cy="160" r="96" fill="white" fill-opacity="0.4"/><text x="240" y="172" font-family="sans-serif" font-size="36" text-anchor="middle" fill="white">${label}</text></svg>`,
    )}`;
}

function file(path: string, mimeType: string, size: number): HappyAgentArtifactFile {
    return { path, mimeType, size, sha256: `sha-${path}` };
}

/** A cover drawn for this page, in one of the two shapes covers come in. */
function coverOf(
    asset: string,
    aspect: HappyAgentArtifactCover["aspect"],
    thumbhash: string,
): HappyAgentArtifactCover {
    return {
        version: 1,
        path: "cover.webp",
        mimeType: "image/webp",
        width: aspect === "wide" ? 1600 : 1200,
        height: aspect === "wide" ? 900 : 1200,
        aspect,
        url: asset,
        thumbhash,
        // This page's covers are small enough to stand for their own previews.
        preview: { url: asset, width: 640, height: aspect === "wide" ? 360 : 640 },
    };
}
/** The thumbnail a list reads off a cover, as the state projection does. */
function coverThumbnail(cover: HappyAgentArtifactCover): HappyAgentArtifactThumbnail {
    return {
        kind: "cover",
        aspect: cover.aspect,
        url: cover.preview?.url ?? cover.url,
        preview: cover.preview !== null,
        thumbhash: cover.thumbhash,
    };
}
const coverRevenue = coverOf(
    new URL("../assets/feed-cover-revenue.webp", import.meta.url).href,
    "wide",
    "9ecJDIRWq5hYiIdvaqVJi5+z+A==",
);
const coverLaunch = coverOf(
    new URL("../assets/feed-cover-launch.webp", import.meta.url).href,
    "wide",
    "8GYGJIJpd3h5iHiAd4t+h/CYKg==",
);
const coverSignups = coverOf(
    new URL("../assets/feed-cover-signups.webp", import.meta.url).href,
    "square",
    "zucJDwQIVriLdod1iXl3eId3pwRXr5II",
);
/** An image or video's own preview, which a row without a cover leads with. */
const mediaWelcome: HappyAgentArtifactThumbnail = {
    kind: "media",
    url: new URL("../assets/artifact-preview-welcome.webp", import.meta.url).href,
    thumbhash: "OggGBID3R6eJiId8g3f3e4f8Zw==",
};
const mediaSync: HappyAgentArtifactThumbnail = {
    kind: "media",
    url: new URL("../assets/artifact-preview-sync.webp", import.meta.url).href,
    thumbhash: "SdcFDIIJl2iGe4SDiZf3i3qvuA==",
};

function artifact(
    id: string,
    type: HappyAgentArtifactType,
    title: string,
    overrides: Partial<HappyAgentArtifact> = {},
): HappyAgentArtifact {
    return {
        id: id as HappyAgentArtifactId,
        type,
        title,
        status: "active",
        latestVersion: 1,
        cover: null,
        background: null,
        thumbnail: null,
        entry: file("index.md", "text/markdown", 2_048),
        fileCount: 1,
        size: 2_048,
        source: { kind: "agent", agentId: "agent-1" },
        createdBy: { kind: "agent", agentId: "agent-1", botId: null },
        createdAt: 1_760_000_000_000,
        updatedBy: { kind: "agent", agentId: "agent-1", botId: null },
        updatedSource: { kind: "agent", agentId: "agent-1" },
        updatedAt: 1_760_000_000_000,
        deletedBy: null,
        deletedSource: null,
        deletedAt: null,
        version: `0190000${id}`,
        ...overrides,
    };
}

const launchPost = artifact("launch", "markdown", "Launch post draft", {
    latestVersion: 3,
    fileCount: 2,
    size: 48_211,
    source: {
        kind: "workspace",
        workspaceId: "workspace-1",
        projectId: "project-1",
        agentId: "agent-1",
    },
    updatedBy: { kind: "user", userId: "user-1" },
    updatedAt: 1_760_100_000_000,
});
const landing = artifact("landing", "html", "Landing page mock", {
    cover: coverLaunch,
    thumbnail: coverThumbnail(coverLaunch),
    entry: file("index.html", "text/html", 1_200),
    fileCount: 3,
    size: 9_400,
    source: { kind: "project", projectId: "project-1", agentId: "agent-1" },
    createdAt: 1_760_090_000_000,
    updatedAt: 1_760_090_000_000,
});
const shots = artifact("shots", "image_series", "Onboarding screenshots", {
    thumbnail: mediaWelcome,
    entry: file("01-welcome.svg", "image/svg+xml", 1_400),
    fileCount: 3,
    size: 4_200,
    source: { kind: "bot", botId: "bot-1", agentId: "agent-2" },
    createdBy: { kind: "agent", agentId: "agent-2", botId: "bot-1" },
    updatedBy: { kind: "agent", agentId: "agent-2", botId: "bot-1" },
    updatedSource: { kind: "bot", botId: "bot-1", agentId: "agent-2" },
    createdAt: 1_760_003_600_000,
    updatedAt: 1_760_003_600_000,
});
const report = artifact("report", "document", "Q3 report", {
    cover: coverRevenue,
    thumbnail: coverThumbnail(coverRevenue),
    entry: file("report.pdf", "application/pdf", 1_482_113),
    size: 1_482_113,
    source: { kind: "task", taskId: "task-1", agentId: "agent-3" },
    createdBy: { kind: "user", userId: null },
    updatedBy: { kind: "user", userId: null },
});
const signups = artifact("signups", "image", "Signups by channel", {
    cover: coverSignups,
    thumbnail: coverThumbnail(coverSignups),
    background: "#16171c",
    entry: file("signups.png", "image/png", 36_992),
    size: 36_992,
    source: { kind: "bot", botId: "bot-1", agentId: "agent-2" },
    createdBy: { kind: "agent", agentId: "agent-2", botId: "bot-1" },
    updatedBy: { kind: "agent", agentId: "agent-2", botId: "bot-1" },
    updatedSource: { kind: "bot", botId: "bot-1", agentId: "agent-2" },
    createdAt: 1_760_003_600_000,
    updatedAt: 1_760_003_600_000,
});
const capture = artifact("capture", "video", "Sync walkthrough", {
    thumbnail: mediaSync,
    entry: file("walkthrough.mp4", "video/mp4", 18_220_331),
    size: 18_220_331,
    source: null,
    createdBy: { kind: "user", userId: "user-1" },
    updatedBy: { kind: "user", userId: "user-1" },
});
const future = artifact("future", "unknown", "Spreadsheet from a newer agent", {
    entry: file("sheet.xlsx", "application/octet-stream", 31_002),
    fileCount: 2,
    size: 40_002,
    source: { kind: "unknown", agentId: null },
    createdBy: { kind: "unknown" },
    updatedBy: { kind: "unknown" },
});
const removed = artifact("removed", "image", "Old logo", {
    status: "deleted",
    // Never drawn: a deleted artifact wears its glyph.
    cover: coverSignups,
    thumbnail: coverThumbnail(coverSignups),
    entry: file("logo.svg", "image/svg+xml", 900),
    size: 900,
    deletedBy: { kind: "user", userId: "user-1" },
    deletedSource: { kind: "agent", agentId: "agent-1" },
    deletedAt: 1_760_100_000_000,
    updatedBy: { kind: "user", userId: "user-1" },
    updatedSource: { kind: "agent", agentId: "agent-1" },
    updatedAt: 1_760_100_000_000,
});

const catalogBase: HappyAgentArtifactCatalogSnapshot = {
    availability: "available",
    filter: { includeDeleted: false },
    deletedShown: false,
    scope: "all",
    loading: false,
    artifacts: [launchPost, landing, signups, shots, report, capture, future],
    hasMore: true,
    loadingMore: false,
};

const noop = () => undefined;
const pageHandlers = {
    onArtifactOpen: noop,
    onDeletedShownChange: noop,
    onLoadMore: noop,
    onSourceChange: noop,
    onTypeChange: noop,
};
const viewerHandlers = {
    onDeletionCancel: noop,
    onDeletionConfirm: noop,
    onDeletionRequest: noop,
    onFileDownload: noop,
    onVersionSelect: noop,
    onMarkdownViewSelect: noop,
    onVersionsLoadMore: noop,
    onBack: noop,
};
/** The side panel's viewer: a tab, which its close button ends, so it has no way back. */
const { onBack: _onBack, ...panelViewerHandlers } = viewerHandlers;

function link(artifactId: string, number: number, entry: HappyAgentArtifactFile, url?: string) {
    return {
        file: entry,
        url:
            url ??
            `https://happy-agent.invalid/v0/artifacts/${artifactId}/versions/${String(number)}/files/${entry.path}`,
    } satisfies HappyAgentArtifactFileLink;
}

function version(
    of: HappyAgentArtifact,
    number: number,
    files: readonly HappyAgentArtifactFile[],
    overrides: Partial<HappyAgentArtifactVersion> = {},
): HappyAgentArtifactVersion {
    return {
        artifactId: of.id,
        number,
        title: of.title,
        entry: files[0]!,
        files,
        createdBy: of.createdBy,
        source: of.source,
        createdAt: of.createdAt,
        ...overrides,
    };
}

function viewerOf(
    of: HappyAgentArtifact,
    versions: readonly HappyAgentArtifactVersion[],
    content: HappyAgentArtifactContent,
    files: readonly HappyAgentArtifactFileLink[],
    overrides: Partial<HappyAgentArtifactViewerSnapshot> = {},
): HappyAgentArtifactViewerSnapshot {
    return {
        artifactId: of.id,
        artifact: { type: "ready", value: of },
        versions,
        versionsLoading: false,
        versionsHasMore: false,
        ...(versions[0] ? { version: versions[0] } : {}),
        files,
        content,
        markdownView: "document",
        deletion: { phase: "idle" },
        ...overrides,
    };
}

const launchFiles = [
    file("index.md", "text/markdown", 2_048),
    file("images/hero.svg", "image/svg+xml", 46_163),
];
const launchVersions = [
    version(launchPost, 3, launchFiles, {
        createdBy: { kind: "user", userId: "user-1" },
        createdAt: 1_760_100_000_000,
    }),
    version(launchPost, 2, launchFiles, { createdAt: 1_760_090_000_000 }),
    version(launchPost, 1, launchFiles.slice(0, 1)),
];
const heroUrl = svg("teal", "hero");
const launchViewer = viewerOf(
    launchPost,
    launchVersions,
    {
        type: "markdown",
        entryPath: "index.md",
        text: [
            "# Happy, now with artifacts",
            "",
            "Every agent can publish **finished work** — a page, a picture, a report — and keep every version of it.",
            "",
            "![The artifacts panel](images/hero.svg)",
            "",
            "- Published once, kept for good",
            "- Tracked per chat, per project, and across the whole machine",
            "",
            "Read the [notes](./images/hero.svg) or the [docs](https://example.com/docs).",
        ].join("\n"),
        files: new Map([
            ["index.md", "about:blank"],
            ["images/hero.svg", heroUrl],
        ]),
    },
    launchFiles.map((entry) => link("launch", 3, entry)),
);

/** The launch post as its latest version changed it from version 2. */
const launchDiffViewer: HappyAgentArtifactViewerSnapshot =
    launchViewer.content.type === "markdown"
        ? {
              ...launchViewer,
              markdownView: "diff",
              content: {
                  ...launchViewer.content,
                  before: {
                      number: 2,
                      text: [
                          "# Happy, with artifacts",
                          "",
                          "Every agent can publish a page or a picture.",
                          "",
                          "![The artifacts panel](images/hero.svg)",
                          "",
                          "- Published once",
                          "- Tracked per chat",
                          "- Shared with everyone on the team",
                          "",
                          "Read the [notes](./images/hero.svg) or the [docs](https://example.com/docs).",
                      ].join("\n"),
                      files: launchViewer.content.files,
                  },
              },
          }
        : launchViewer;

function dataUrl(mimeType: string, text: string): string {
    return `data:${mimeType};base64,${btoa(text)}`;
}

const landingFiles = [
    file("index.html", "text/html", 1_200),
    file("style.css", "text/css", 400),
    file("assets/mark.svg", "image/svg+xml", 7_800),
];
const landingViewer = viewerOf(
    landing,
    [version(landing, 1, landingFiles)],
    {
        type: "html",
        entryPath: "index.html",
        pageMode: "page",
        page: {
            kind: "static",
            reason: { type: "no-guest" },
            text: `<!doctype html><html><head><link rel="stylesheet" href="style.css"><script>document.body.textContent = "scripts ran"</script></head><body><main><img src="./assets/mark.svg" alt="Mark"><h1>Ship work, not screenshots</h1><p>Every version kept, every change attributed. <a href="https://example.com">Learn more</a>.</p></main></body></html>`,
            assets: new Map([
                [
                    "style.css",
                    dataUrl(
                        "text/css",
                        "body{margin:0;font-family:sans-serif;background:linear-gradient(160deg,lavender,white)}main{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px}img{width:160px;height:auto;border-radius:16px}h1{margin:0}",
                    ),
                ],
                ["assets/mark.svg", svg("slateblue", "mark")],
            ]),
            omitted: [],
        },
    },
    landingFiles.map((entry) => link("landing", 1, entry)),
);

/** The landing page drawn statically for another reason than a host with no guest. */
function landingStatic(reason: HappyAgentArtifactStaticReason): HappyAgentArtifactViewerSnapshot {
    const content = landingViewer.content;
    if (content.type !== "html" || content.page.kind !== "static") return landingViewer;
    return { ...landingViewer, content: { ...content, page: { ...content.page, reason } } };
}

/**
 * A page written the way artifacts are: it takes the window's colour scheme,
 * names no colours, and leaves its background alone, so it reads on whatever
 * surface it is shown on.
 */
const plainFiles = [file("index.html", "text/html", 120)];
const plainViewer = viewerOf(
    landing,
    [version(landing, 1, plainFiles)],
    {
        type: "html",
        entryPath: "index.html",
        pageMode: "page",
        page: {
            kind: "static",
            reason: { type: "no-guest" },
            text: "<!doctype html><html><head><style>:root{color-scheme:light dark}</style></head><body><h1>Hello</h1><p>A page with no colours of its own.</p></body></html>",
            assets: new Map(),
            omitted: [],
        },
    },
    plainFiles.map((entry) => link("landing", 1, entry)),
);

/** A version that names the colour it is shown on, for a page drawn in light ink. */
const posterFiles = [file("index.html", "text/html", 240)];
const posterViewer = viewerOf(
    landing,
    [version(landing, 1, posterFiles, { background: "#10161c" })],
    {
        type: "html",
        entryPath: "index.html",
        pageMode: "page",
        page: {
            kind: "static",
            reason: { type: "no-guest" },
            text: "<!doctype html><html><head><style>body{margin:0;padding:48px;font-family:sans-serif;color:#f6f8fa}h1{margin:0 0 12px}</style></head><body><h1>Night shift</h1><p>Light ink on the colour this version names for its slot.</p></body></html>",
            assets: new Map(),
            omitted: [],
        },
    },
    posterFiles.map((entry) => link("landing", 1, entry)),
);

/**
 * A dashboard that needs the frame's whole width, and says so in its head
 * instead of being centred on the page measure.
 */
const wideFiles = [file("index.html", "text/html", 640)];
const wideViewer = viewerOf(
    landing,
    [version(landing, 1, wideFiles)],
    {
        type: "html",
        entryPath: "index.html",
        pageMode: "page",
        page: {
            kind: "static",
            reason: { type: "no-guest" },
            text: `<!doctype html><html><head><meta name="happy-page-width" content="full"><style>:root{color-scheme:light dark}body{font-family:sans-serif}.tiles{display:flex;gap:16px}.tile{flex:1 1 0;min-width:0;height:160px;border-radius:8px;background:color-mix(in srgb,currentColor 8%,transparent)}</style></head><body><h1>Release dashboard</h1><div class="tiles"><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div></div></body></html>`,
            assets: new Map(),
            omitted: [],
        },
    },
    wideFiles.map((entry) => link("landing", 1, entry)),
);

/**
 * A canvas game that declares itself an app: it fills the slot edge to edge,
 * never scrolls as a page, and the header offers it full screen.
 */
const arcade = artifact("arcade", "html", "Paddle", {
    entry: file("index.html", "text/html", ARCADE_HTML.length),
    size: ARCADE_HTML.length,
});
const arcadeFiles = [file("index.html", "text/html", ARCADE_HTML.length)];
const arcadeViewer = viewerOf(
    arcade,
    [version(arcade, 1, arcadeFiles)],
    {
        type: "html",
        entryPath: "index.html",
        pageMode: "app",
        page: { kind: "site", url: "happy-artifact://arcade-v1/index.html" },
    },
    arcadeFiles.map((entry) => link("arcade", 1, entry)),
);

const shotFiles = [
    file("01-welcome.svg", "image/svg+xml", 1_400),
    file("02-sign-in.svg", "image/svg+xml", 1_400),
    file("03-done.svg", "image/svg+xml", 1_400),
];
const shotUrls = [svg("seagreen", "1"), svg("steelblue", "2"), svg("indianred", "3")];
const shotLinks = shotFiles.map((entry, index) => link("shots", 1, entry, shotUrls[index]));
const shotsViewer = viewerOf(
    shots,
    [version(shots, 1, shotFiles)],
    { type: "image_series", images: shotLinks },
    shotLinks,
);

const reportFiles = [file("report.pdf", "application/pdf", 1_482_113)];
const reportViewer = viewerOf(
    report,
    [version(report, 1, reportFiles)],
    { type: "document", document: link("report", 1, reportFiles[0]!) },
    reportFiles.map((entry) => link("report", 1, entry)),
);

const futureFiles = [
    file("sheet.xlsx", "application/octet-stream", 31_002),
    file("notes.txt", "text/plain", 9_000),
];
const futureViewer = viewerOf(
    future,
    [version(future, 1, futureFiles)],
    { type: "files" },
    futureFiles.map((entry) => link("future", 1, entry)),
);

const removedViewer = viewerOf(removed, [], { type: "loading" }, []);

/** Gives a fixed overlay a desktop-sized window of its own to cover. */
function windowFrame(children: ReactNode) {
    return (
        <div
            style={{
                display: "flex",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
            }}
        >
            {children}
        </div>
    );
}

/** The markdown viewer with Add to Surfaces held here, so the toggle can be tried. */
function LiveSurfaceToggleViewer() {
    const [added, setAdded] = useState(false);
    return (
        <HappyAgentArtifactViewer
            {...viewerHandlers}
            labels={labels}
            surface={{ added, onToggle: () => setAdded(!added) }}
            viewer={launchViewer}
        />
    );
}

/** The launch post opened on its diff, with Diff / Latest held here so it can be switched. */
function LiveMarkdownDiffViewer(props: { tab?: boolean }) {
    const [markdownView, setMarkdownView] = useState<HappyAgentArtifactMarkdownView>("diff");
    return (
        <HappyAgentArtifactViewer
            {...(props.tab ? panelViewerHandlers : viewerHandlers)}
            labels={labels}
            onMarkdownViewSelect={setMarkdownView}
            {...(props.tab ? { tab: true } : {})}
            viewer={{ ...launchDiffViewer, markdownView }}
        />
    );
}

export function HappyAgentArtifactsBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A Happy Agent's published artifacts: the catalog page from the sidebar, the list beside a chat narrowed to that chat, and the viewer with its version history, per-type body, and confirmed deletion."
            title="HappyAgentArtifacts"
        >
            <FullScreenSpecimen
                detail="Newest first, one row per artifact: a 16:9 thumbnail, title, version, and where, who, and when. A wide cover fills the thumbnail, a square one stands whole on the artifact's background, and an artifact without a cover wears its type's glyph there. An unknown type and an unknown place read as an artifact made elsewhere by someone."
                label="Catalog"
                screen="01-catalog-1100x760"
                window={{ width: 1100, height: 760 }}
                number="01"
            >
                <HappyAgentArtifactsPage
                    {...pageHandlers}
                    catalog={catalogBase}
                    labels={labels}
                    sources={sources}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Narrowed to images with deleted artifacts shown: the tombstone stays listed, struck through."
                label="Filtered with deleted"
                screen="02-filtered-1100x760"
                window={{ width: 1100, height: 760 }}
                number="02"
            >
                <HappyAgentArtifactsPage
                    {...pageHandlers}
                    catalog={{
                        ...catalogBase,
                        type: "image",
                        deletedShown: true,
                        filter: { includeDeleted: true, type: "image" },
                        artifacts: [removed],
                        hasMore: false,
                    }}
                    labels={labels}
                    sources={sources}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Nothing published yet."
                label="Empty"
                screen="03-empty-1100x760"
                window={{ width: 1100, height: 760 }}
                number="03"
            >
                <HappyAgentArtifactsPage
                    {...pageHandlers}
                    catalog={{ ...catalogBase, artifacts: [], hasMore: false }}
                    labels={labels}
                    sources={sources}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="320px column beside a worktree chat: this chat, its workspace, or everything."
                label="Panel · worktree chat"
                number="04"
                screen="04-panel-worktree-320x560"
                window={{ width: 320, height: 560 }}
            >
                {
                    <HappyAgentArtifactsPanel
                        catalog={{
                            ...catalogBase,
                            scope: "chat",
                            context: {
                                chat: { by: "agent", agentId: "agent-1" },
                                place: {
                                    kind: "workspace",
                                    narrowing: {
                                        by: "source",
                                        kind: "workspace",
                                        id: "workspace-1",
                                    },
                                },
                            },
                            artifacts: [launchPost],
                            hasMore: false,
                        }}
                        labels={labels}
                        onArtifactOpen={noop}
                        onLoadMore={noop}
                        onScopeChange={noop}
                        selectedId={launchPost.id}
                    />
                }
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The panel beside a chat scoped to everything: the same thumbnails, 64 by 36."
                label="Panel · everything"
                number="27"
                screen="27-panel-all-320x560"
                window={{ width: 320, height: 560 }}
            >
                <HappyAgentArtifactsPanel
                    catalog={{
                        ...catalogBase,
                        scope: "all",
                        context: { chat: { by: "agent", agentId: "agent-1" } },
                        hasMore: false,
                    }}
                    labels={labels}
                    onArtifactOpen={noop}
                    onLoadMore={noop}
                    onScopeChange={noop}
                    selectedId={signups.id}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A bot is its own place, so only this chat and everything are offered."
                label="Panel · bot, empty"
                number="05"
                screen="05-panel-bot-320x560"
                window={{ width: 320, height: 560 }}
            >
                {
                    <HappyAgentArtifactsPanel
                        catalog={{
                            ...catalogBase,
                            scope: "chat",
                            context: { chat: { by: "source", kind: "bot", id: "bot-1" } },
                            artifacts: [],
                            hasMore: false,
                        }}
                        labels={labels}
                        onArtifactOpen={noop}
                        onLoadMore={noop}
                        onScopeChange={noop}
                    />
                }
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Markdown read as a document; its own picture is shown from the same version, and a link to one of its files saves that file. The history stays folded away until History is pressed. Add to sidebar keeps it in the reader's sidebar; pressed, it takes it out again."
                label="Viewer · markdown"
                screen="06-markdown-1100x760"
                window={{ width: 1100, height: 760 }}
                number="06"
            >
                <LiveSurfaceToggleViewer />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="History open, looking back at version 2: a banner says so and offers the newest again. On the newest version nothing stands between the title and the artifact."
                label="Viewer · older version"
                screen="07-older-1100x760"
                window={{ width: 1100, height: 760 }}
                number="07"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    defaultHistoryShown
                    labels={labels}
                    viewer={{ ...launchViewer, versionSelected: 2, version: launchVersions[1]! }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Where the host has no isolated guest: a scriptless page built from its own files, with its stylesheet and picture inlined."
                label="Viewer · web page, static"
                screen="08-html-1100x760"
                window={{ width: 1100, height: 760 }}
                number="08"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={landingViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="An image series in its listed order, one large with the run below."
                label="Viewer · image series"
                screen="09-series-1100x760"
                window={{ width: 1100, height: 760 }}
                number="09"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={shotsViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A document this host cannot show inline: what it is, and the way to save it."
                label="Viewer · document"
                screen="10-document-1100x760"
                window={{ width: 1100, height: 760 }}
                number="10"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={reportViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A type this build does not know is shown as its files."
                label="Viewer · unknown type"
                screen="11-unknown-1100x760"
                window={{ width: 1100, height: 760 }}
                number="11"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={futureViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A deleted artifact keeps its record and says who deleted it, where, and when."
                label="Viewer · deleted"
                screen="12-deleted-1100x760"
                window={{ width: 1100, height: 760 }}
                number="12"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={removedViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="360px confirmation; a refused deletion is stated inside it for another try."
                label="Delete · conflict"
                number="13"
                screen="13-delete-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                {windowFrame(
                    <HappyAgentArtifactViewer
                        {...viewerHandlers}
                        labels={labels}
                        viewer={{
                            ...reportViewer,
                            deletion: {
                                phase: "failed",
                                error: {
                                    name: "UserError",
                                    message:
                                        "This artifact changed while you were deciding. Look at its latest version, then delete it again.",
                                },
                            },
                        }}
                    />,
                )}
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="No artifact has this id."
                label="Viewer · missing"
                screen="14-missing-1100x760"
                window={{ width: 1100, height: 760 }}
                number="14"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={{ ...removedViewer, artifact: { type: "missing" } }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Where the host serves the version as a site of its own: its page runs in the host's isolated guest, drawn here by an inert stand-in."
                label="Viewer · web page, live"
                screen="15-html-live-1100x760"
                window={{ width: 1100, height: 760 }}
                number="15"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    renderPage={() => <LivePageStandIn />}
                    viewer={{
                        ...landingViewer,
                        content: {
                            type: "html",
                            entryPath: "index.html",
                            pageMode: "page",
                            page: { kind: "site", url: "happy-artifact://landing-v1/index.html" },
                        },
                    }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A renderer newer than the desktop app around it: the app cannot run the page yet, so the static preview says to update it."
                label="Viewer · web page, app too old"
                screen="16-html-app-outdated-1100x760"
                window={{ width: 1100, height: 760 }}
                number="16"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={landingStatic({ type: "app-outdated" })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The app runs pages and could not serve this one: its reason, above the static preview shown instead."
                label="Viewer · web page, not served"
                screen="17-html-failed-1100x760"
                window={{ width: 1100, height: 760 }}
                number="17"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={landingStatic({
                        type: "failed",
                        error: {
                            name: "UserError",
                            message: "This artifact holds too many files to serve.",
                        },
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Beside a chat in the side panel, under its tab strip: a slim toolbar with no way back, since the tab's own button closes it. A page the host cannot run is drawn without a notice."
                label="Viewer · side panel"
                screen="18-panel-560x760"
                window={{ width: 560, height: 760 }}
                number="18"
            >
                <HappyAgentArtifactViewer
                    {...panelViewerHandlers}
                    labels={labels}
                    tab
                    viewer={landingViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The slot paints nothing of its own: a page that declares the light and dark schemes and names no colours reads on the surface around it, in either appearance."
                label="Viewer · web page, on the surface"
                screen="19-html-plain-1100x760"
                window={{ width: 1100, height: 760 }}
                number="19"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={plainViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A version that names a background colour has its slot painted that colour, whatever the window's appearance."
                label="Viewer · named background"
                screen="20-html-background-1100x760"
                window={{ width: 1100, height: 760 }}
                number="20"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    viewer={posterViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Opened on a Markdown version made in the last twenty minutes, the viewer starts on its rendered diff against the version before it: added words on green, removed ones struck on red, and unchanged runs folded. Diff / Latest in the header switches to the document alone and back."
                label="Viewer · markdown diff"
                screen="21-markdown-diff-1100x760"
                window={{ width: 1100, height: 760 }}
                number="21"
            >
                <LiveMarkdownDiffViewer />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same diff in the side panel's slim toolbar."
                label="Viewer · markdown diff, side panel"
                screen="22-markdown-diff-panel-560x760"
                window={{ width: 560, height: 760 }}
                number="22"
            >
                <LiveMarkdownDiffViewer tab />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail={`A page is centred on the content column unless it declares <meta name="happy-page-width" content="full">, as this dashboard does to take the frame's whole width.`}
                label="Viewer · web page, full width"
                screen="23-html-full-width-1100x760"
                window={{ width: 1100, height: 760 }}
                number="23"
            >
                <HappyAgentArtifactViewer {...viewerHandlers} labels={labels} viewer={wideViewer} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail={`A page that declares <meta name="happy-page-mode" content="app"> — this canvas game — fills the slot edge to edge with no page scrolling, and the header offers Full screen: the slot alone takes the screen, with "Press Esc to exit full screen" for a moment. Escape, or the window's own control, brings it back.`}
                label="Viewer · app"
                screen="24-html-app-1100x760"
                window={{ width: 1100, height: 760 }}
                number="24"
            >
                <HappyAgentArtifactViewer
                    {...viewerHandlers}
                    labels={labels}
                    renderPage={() => <ArcadeStandIn />}
                    viewer={arcadeViewer}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same app beside a chat, in the side panel's slim toolbar."
                label="Viewer · app, side panel"
                screen="25-html-app-panel-560x760"
                window={{ width: 560, height: 760 }}
                number="25"
            >
                <HappyAgentArtifactViewer
                    {...panelViewerHandlers}
                    labels={labels}
                    renderPage={() => <ArcadeStandIn />}
                    tab
                    viewer={arcadeViewer}
                />
            </FullScreenSpecimen>

            <Specimen
                detail="In a reply, an app is never run: its title row says App and offers Open, which opens it beside the chat. No frame, no background, the same 28px title line every artifact has."
                label="Inline · app"
                number="26"
                stage="surface"
            >
                <ArcadeInlineRow />
            </Specimen>
        </ComponentPage>
    );
}

/**
 * The game's call in a reply, drawn through the same decision the transcript
 * makes: an app is its title, which opens it, and never a running page.
 */
function ArcadeInlineRow() {
    const page = conversationInlinePage(
        arcadeEntry,
        entryKey(arcadeEntry),
        {
            artifacts: arcadeInline,
            artifactsRequest: noop,
            artifactsContentRequest: noop,
            artifactRender: () => <ArcadeStandIn />,
            artifactOpen: noop,
            pageOpen: noop,
        },
        new Map([[arcade.id, entryKey(arcadeEntry)]]),
        {
            collapsed: () => undefined,
            collapsedSet: noop,
            height: () => undefined,
            heightSet: noop,
        },
    );
    if (arcadeEntry.kind !== "agentActivity") return null;
    return (
        <div style={{ display: "flex", flexDirection: "column", width: "640px" }}>
            <AgentActivityRow
                activity={arcadeEntry.activity}
                {...(page ? { inlinePage: page.props } : {})}
                motion="calm"
                treatment="focused"
            />
        </div>
    );
}

/** What the host's guest would draw for the landing page; Blueprint has no engine to run it in. */
function LivePageStandIn() {
    return (
        <div
            style={{
                display: "flex",
                flex: "1 1 0%",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                background: "linear-gradient(160deg, lavender, white)",
                color: "#18171c",
                fontFamily: "sans-serif",
            }}
        >
            <img
                alt="Mark"
                src={svg("slateblue", "mark")}
                style={{ width: "160px", borderRadius: "16px" }}
            />
            <h1 style={{ margin: 0 }}>Ship work, not screenshots</h1>
            <p style={{ margin: 0 }}>scripts ran</p>
        </div>
    );
}
