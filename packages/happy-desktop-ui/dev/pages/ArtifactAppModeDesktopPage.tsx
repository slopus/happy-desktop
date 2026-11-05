import type { ReactNode } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
    type HappyAgentArtifact,
    type HappyAgentArtifactContent,
    type HappyAgentArtifactFile,
    type HappyAgentArtifactId,
    type HappyAgentArtifactViewerSnapshot,
} from "happy-desktop-state";
import { AppShell } from "../../src/AppShell";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import type { HappyAgentArtifactLabels } from "../../src/pages/artifacts/artifactPresentation";
import { HappyAgentArtifactViewer } from "../../src/pages/artifacts/HappyAgentArtifactViewer";
import { Sidebar } from "../../src/Sidebar";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import {
    ARCADE_HTML,
    ARCADE_ID,
    ArcadeStandIn,
    arcadeEntry,
    arcadeInline,
} from "./artifactAppFixture";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-031";

const noop = () => undefined;
const WINDOW = { width: 1440, height: 900 } as const;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "app-mode",
    submission: { status: "idle" },
    text: "",
};

const labels: HappyAgentArtifactLabels = {
    source: () => "Paddle game",
    author: () => "Happy",
    time: () => "Nov 5, 2026, 10:12",
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

function file(path: string, size: number): HappyAgentArtifactFile {
    return { path, mimeType: "text/html", size, sha256: `sha-${path}` };
}

/** One HTML artifact at version 1, open in the viewer with `content` on screen. */
function viewerOf(
    id: string,
    title: string,
    size: number,
    content: HappyAgentArtifactContent,
): HappyAgentArtifactViewerSnapshot {
    const entry = file("index.html", size);
    const at = 1_793_000_000_000;
    const artifact: HappyAgentArtifact = {
        id: id as HappyAgentArtifactId,
        type: "html",
        title,
        status: "active",
        latestVersion: 1,
        cover: null,
        background: null,
        thumbnail: null,
        entry,
        fileCount: 1,
        size,
        source: { kind: "agent", agentId: "agent-1" },
        createdBy: { kind: "agent", agentId: "agent-1", botId: null },
        createdAt: at,
        updatedBy: { kind: "agent", agentId: "agent-1", botId: null },
        updatedSource: { kind: "agent", agentId: "agent-1" },
        updatedAt: at,
        deletedBy: null,
        deletedSource: null,
        deletedAt: null,
        version: `v-${id}`,
    };
    return {
        artifactId: artifact.id,
        artifact: { type: "ready", value: artifact },
        versions: [],
        versionsLoading: false,
        versionsHasMore: false,
        version: {
            artifactId: artifact.id,
            number: 1,
            title,
            entry,
            files: [entry],
            createdBy: artifact.createdBy,
            source: artifact.source,
            createdAt: at,
        },
        files: [{ file: entry, url: `https://happy-agent.invalid/${id}/index.html` }],
        content,
        markdownView: "document",
        deletion: { phase: "idle" },
    };
}

const arcadeViewer = viewerOf(ARCADE_ID, "Paddle", ARCADE_HTML.length, {
    type: "html",
    entryPath: "index.html",
    pageMode: "app",
    page: { kind: "site", url: "happy-artifact://arcade-v1/index.html" },
});

/** An ordinary page, for comparison: it scrolls, and reads down the centred content column. */
const REPORT_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>:root{color-scheme:light dark}body{font-family:sans-serif;line-height:1.55}h1{margin:0 0 8px}p{margin:0 0 16px}table{border-collapse:collapse;width:100%;margin:8px 0 24px}td,th{text-align:left;padding:8px 12px;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent)}</style></head><body><h1>Release notes · 2.14</h1><p>Artifacts can now declare themselves apps. A game, a canvas, or a drawing pad fills the viewer edge to edge and offers full screen; everything else keeps reading down the content column like this page.</p><table><tr><th>Area</th><th>Change</th></tr><tr><td>Artifacts</td><td>App mode for HTML artifacts</td></tr><tr><td>Chat</td><td>An app shows as an Open card, never a live frame</td></tr><tr><td>Viewer</td><td>Full screen, Esc exits</td></tr></table><p>Pages that only need more width keep declaring <code>happy-page-width: full</code>; they still scroll as pages.</p><p>Every version is kept, and every change is credited to whoever made it.</p></body></html>`;
const reportViewer = viewerOf("notes", "Release notes", REPORT_HTML.length, {
    type: "html",
    entryPath: "index.html",
    pageMode: "page",
    page: {
        kind: "static",
        reason: { type: "no-guest" },
        text: REPORT_HTML,
        assets: new Map(),
        omitted: [],
    },
});

function message(id: string, fromOwner: boolean, text: string): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "app-mode",
            sequence: id,
            changePts: id,
            sender: fromOwner ? happyAgentOwnerAuthor : agentAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-11-05T10:12:00.000Z",
        },
    };
}

const entries: readonly ConversationEntry[] = [
    message("ask", true, "Make me a little paddle game I can play between builds."),
    message(
        "plan",
        false,
        "Here is Paddle: one canvas, mouse, touch, or the arrow keys. It is an app, so it opens on a screen of its own.",
    ),
    arcadeEntry,
];

/** The window as the app assembles it: shell, sidebar, and `children` as the main lane. */
function DesktopWindow(props: { children: ReactNode; active: string }) {
    return (
        <div style={{ display: "flex", transform: "translateZ(0)", width: "100%", height: "100%" }}>
            <AppShell
                sidebar={
                    <Sidebar
                        activeItemId={props.active}
                        onCompose={noop}
                        onItemSelect={noop}
                        sections={[
                            {
                                id: "bots",
                                label: "Bots",
                                items: [
                                    {
                                        id: "chief",
                                        kind: "agent",
                                        label: "Chief of Staff",
                                        icon: "spark",
                                    },
                                ],
                            },
                            {
                                id: "tasks",
                                label: "Tasks",
                                items: [
                                    {
                                        id: "paddle",
                                        kind: "agent",
                                        label: "Paddle game",
                                        icon: "tasks",
                                    },
                                    {
                                        id: "release",
                                        kind: "agent",
                                        label: "Release notes",
                                        icon: "tasks",
                                    },
                                ],
                            },
                            {
                                id: "projects",
                                label: "Projects",
                                items: [
                                    {
                                        id: "happy",
                                        kind: "project",
                                        label: "happy-desktop",
                                        icon: "branch",
                                    },
                                ],
                            },
                        ]}
                    />
                }
                sidebarCollapsible
                sidebarDefaultWidth={260}
                windowControls
            >
                {props.children}
            </AppShell>
        </div>
    );
}

/**
 * App mode for HTML artifacts in the window it is used in: the Open card in a
 * reply, the game filling the viewer under its header, and an ordinary page
 * centred on the content column for comparison. Full screen is the viewer
 * screen with its Full screen action pressed.
 */
export function ArtifactAppModeDesktopPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary='An HTML artifact that declares <meta name="happy-page-mode" content="app"> in the desktop window: never run in a reply, filling the viewer with no page scrolling, and offered full screen.'
            title="Artifact app mode"
            width={WINDOW.width + 96}
        >
            <FullScreenSpecimen
                detail="In a reply the game is its title line: the App note and Open, which opens the viewer. Nothing runs in the chat."
                label="Chat · app card"
                number="01"
                screen="01-chat-1440x900"
                window={WINDOW}
            >
                <DesktopWindow active="paddle">
                    <ConversationView
                        agentAuthor={agentAuthor}
                        conversationId="app-mode"
                        dock={
                            <ConversationDock
                                composer={COMPOSER}
                                composerPlaceholder="Message Happy…"
                                onComposerSend={noop}
                                onComposerValueChange={noop}
                                running={false}
                            />
                        }
                        entries={entries}
                        inlinePages={{
                            artifacts: arcadeInline,
                            artifactsRequest: noop,
                            artifactsContentRequest: noop,
                            artifactRender: () => <ArcadeStandIn />,
                            artifactOpen: noop,
                            pageOpen: noop,
                        }}
                        running={false}
                        style={{ flex: "1 1 auto", minWidth: 0 }}
                        title="Paddle game"
                        viewerId={happyAgentOwnerAuthor.id}
                    />
                </DesktopWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The game fills the pane under the header, edge to edge, with no page scrolling; Full screen leads the header's actions."
                label="Viewer · app"
                number="02"
                screen="02-viewer-app-1440x900"
                window={WINDOW}
            >
                <DesktopWindow active="paddle">
                    <HappyAgentArtifactViewer
                        {...viewerHandlers}
                        labels={labels}
                        renderPage={() => <ArcadeStandIn />}
                        viewer={arcadeViewer}
                    />
                </DesktopWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="An ordinary page for comparison: centred on the content column, scrolling as a page, with no Full screen action."
                label="Viewer · ordinary page"
                number="03"
                screen="03-viewer-page-1440x900"
                window={WINDOW}
            >
                <DesktopWindow active="release">
                    <HappyAgentArtifactViewer
                        {...viewerHandlers}
                        labels={labels}
                        viewer={reportViewer}
                    />
                </DesktopWindow>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
