import { useState, type ReactNode } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    HAPPY_AGENT_GEN_UI_RENDER_PATH,
    type ComposerSnapshot,
    type ConversationEntry,
    type HappyAgentArtifact,
    type HappyAgentArtifactFile,
    type HappyAgentArtifactId,
    type HappyAgentArtifactViewerSnapshot,
    type HappyAgentInlineArtifactsSnapshot,
} from "happy-desktop-state";
import { AppShell } from "../../src/AppShell";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import type { GenUiAction } from "../../src/genUi/genUiRender";
import type { GenUiInlineHost } from "../../src/pages/artifacts/ArtifactInlineContent";
import type { HappyAgentArtifactLabels } from "../../src/pages/artifacts/artifactPresentation";
import { HappyAgentArtifactViewer } from "../../src/pages/artifacts/HappyAgentArtifactViewer";
import { Sidebar } from "../../src/Sidebar";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import releaseRender from "../assets/genui/11-release.render.json?raw";
import galleryRender from "../assets/genui/05-gallery-grid.render.json?raw";
import secretRender from "../assets/genui/blueprint/secret-requests.render.json?raw";
import type { GenUiClusterSecretHost } from "../../src/genUi/GenUiArtifact";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-044";

/*
 * A `gen_ui` artifact where the desktop shows one, with mocked data: the
 * happy-agent client does not emit an artifact card for this type yet, so the
 * transcript, the inline store's content, and the viewer's snapshot are built
 * here exactly as the stores would publish them. The render documents are the
 * daemon's compiled examples; their pictures are this page's bundled files.
 */

const noop = () => undefined;
const WINDOW = { width: 1440, height: 1000 } as const;

const pictures = import.meta.glob<string>("../assets/genui/assets/*", {
    eager: true,
    import: "default",
    query: "?url",
});

/** Every picture by the path the documents name it at, as a version's file list maps it. */
const files: ReadonlyMap<string, string> = new Map(
    Object.entries(pictures).map(([path, url]) => [
        `assets/${path.slice(path.lastIndexOf("/") + 1)}`,
        url,
    ]),
);

const RELEASE_ID = "genui-release" as HappyAgentArtifactId;
const GALLERY_ID = "genui-gallery" as HappyAgentArtifactId;
const SECRETS_ID = "genui-secrets" as HappyAgentArtifactId;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "gen-ui",
    submission: { status: "idle" },
    text: "",
};

function message(id: string, fromOwner: boolean, text: string): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "gen-ui",
            sequence: id,
            changePts: id,
            sender: fromOwner ? happyAgentOwnerAuthor : agentAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-11-12T10:12:00.000Z",
        },
    };
}

/** The call that made the artifact, as the transcript records it. */
const artifactEntry: ConversationEntry = {
    kind: "agentActivity",
    id: "genui-create",
    sequence: "genui-create",
    activity: {
        kind: "tool",
        tool: {
            toolCallId: "genui-create",
            toolName: "create_artifact",
            arguments: { title: "Release 2.41", type: "gen_ui" },
            status: "success",
            failed: false,
            presentation: {
                type: "artifact",
                artifactId: RELEASE_ID,
                version: 1,
                artifactType: "gen_ui",
                title: "Release 2.41",
                shows: "latest",
            },
        },
    },
};

const entries: readonly ConversationEntry[] = [
    message("ask", true, "Is 2.41 ready to ship?"),
    message(
        "answer",
        false,
        "Almost: three of four checks are done and latency is down 12%. The canary is waiting for your call.",
    ),
    artifactEntry,
];

/** The artifact as the inline store holds it once its content is read. */
const inline: HappyAgentInlineArtifactsSnapshot = new Map([
    [
        RELEASE_ID,
        {
            type: "ready",
            title: "Release 2.41",
            status: "active",
            artifactType: "gen_ui",
            latestVersion: 1,
            display: null,
            content: {
                type: "gen_ui",
                version: 1,
                source: { artifactId: RELEASE_ID, version: 1, origin: true },
                render: releaseRender,
                files,
            },
        },
    ],
]);

const labels: HappyAgentArtifactLabels = {
    source: () => "Trip planning",
    author: () => "Happy",
    time: () => "Nov 12, 2026, 10:12",
};

function file(path: string, mimeType: string, size: number): HappyAgentArtifactFile {
    return { path, mimeType, size, sha256: `sha-${path}` };
}

/** A document open in the viewer at version 1, written by an agent. */
function genUiViewer(
    id: HappyAgentArtifactId,
    title: string,
    renderText: string,
): HappyAgentArtifactViewerSnapshot {
    const entry = file("index.genui.json", "application/json", 1_840);
    const render = file(HAPPY_AGENT_GEN_UI_RENDER_PATH, "application/json", renderText.length);
    const at = 1_794_000_000_000;
    const artifact: HappyAgentArtifact = {
        id,
        type: "gen_ui",
        title,
        status: "active",
        latestVersion: 1,
        cover: null,
        background: null,
        thumbnail: null,
        entry,
        fileCount: 2 + files.size,
        size: entry.size + render.size,
        source: { kind: "agent", agentId: "agent-1" },
        createdBy: { kind: "agent", agentId: "agent-1", botId: null },
        createdAt: at,
        updatedBy: { kind: "agent", agentId: "agent-1", botId: null },
        updatedSource: { kind: "agent", agentId: "agent-1" },
        updatedAt: at,
        deletedBy: null,
        deletedSource: null,
        deletedAt: null,
        version: "v-gallery",
    };
    return {
        artifactId: id,
        artifact: { type: "ready", value: artifact },
        versions: [],
        versionsLoading: false,
        versionsHasMore: false,
        version: {
            artifactId: id,
            number: 1,
            title: artifact.title,
            entry,
            files: [entry],
            createdBy: artifact.createdBy,
            source: artifact.source,
            createdAt: at,
        },
        files: [{ file: entry, url: "https://happy-agent.invalid/gallery/index.genui.json" }],
        content: {
            type: "gen_ui",
            source: { artifactId: id, version: 1, origin: true },
            render: renderText,
            files,
        },
        markdownView: "document",
        deletion: { phase: "idle" },
    };
}

/*
 * The cluster as a `cluster_secret` form sees it: the reader may add team and
 * personal secrets, the GitHub token the second button names exists, and a
 * save takes a moment, the way the action route answers.
 */
const clusterSecrets: GenUiClusterSecretHost = {
    formOpen: async (_source, _element, secretId) => ({
        owners: ["team", "me"],
        secret:
            secretId === undefined
                ? undefined
                : {
                      id: secretId,
                      name: "GitHub billing",
                      description: "Token for slopus/billing",
                      owner: "team",
                      access: { use: true, manage: true, attach: true },
                      uses: ["git"],
                      version: "v-1",
                      updatedAt: "Oct 2, 2026",
                      type: "git_credential",
                      public: {
                          server: "github.com",
                          method: { kind: "token", username: "x-access-token" },
                          repos: ["slopus/billing"],
                          operations: ["read", "write"],
                      },
                  },
        create: () => new Promise((resolve) => setTimeout(resolve, 600)),
        update: () => new Promise((resolve) => setTimeout(resolve, 600)),
    }),
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

function DesktopWindow(props: { children: ReactNode }) {
    return (
        <div style={{ display: "flex", transform: "translateZ(0)", width: "100%", height: "100%" }}>
            <AppShell
                sidebar={
                    <Sidebar
                        activeItemId="release"
                        onCompose={noop}
                        onItemSelect={noop}
                        sections={[
                            {
                                id: "tasks",
                                label: "Tasks",
                                items: [
                                    {
                                        id: "release",
                                        kind: "agent",
                                        label: "Ship 2.41",
                                        icon: "tasks",
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
 * The chat with the artifact laid into the reply. Its actions land here the
 * way the app's host receives them: a `message` would be sent as the next
 * message of this chat; here it is written into the composer instead, so the
 * wiring can be tried without a server.
 */
function ReleaseChat() {
    const [draft, setDraft] = useState("");
    const genUi: GenUiInlineHost = {
        actionsSupported: new Set<GenUiAction["type"]>(["message", "open", "copy"]),
        onAction: (_elementKey, action) => {
            if (action.type === "message") setDraft(action.text);
        },
    };
    return (
        <ConversationView
            agentAuthor={agentAuthor}
            conversationId="gen-ui"
            dock={
                <ConversationDock
                    composer={{ ...COMPOSER, text: draft }}
                    composerPlaceholder="Message Happy…"
                    onComposerSend={noop}
                    onComposerValueChange={setDraft}
                    running={false}
                />
            }
            entries={entries}
            inlinePages={{
                artifacts: inline,
                artifactsRequest: noop,
                artifactsContentRequest: noop,
                artifactOpen: noop,
                pageOpen: noop,
                genUi,
            }}
            running={false}
            style={{ flex: "1 1 auto", minWidth: 0 }}
            title="Ship 2.41"
            viewerId={happyAgentOwnerAuthor.id}
        />
    );
}

export function GenUiArtifactDesktopPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A gen_ui artifact in the desktop window with mocked stores: laid into a reply on the chat's own surface, and open in the artifact viewer. Its compiled render document is drawn from primitives; its actions go to the host."
            title="Gen UI artifact"
            width={WINDOW.width + 96}
        >
            <FullScreenSpecimen
                detail="In a reply a Gen UI artifact starts expanded under its title line, with no frame of its own: the card it draws is the only frame. Its chips report a message action; here that writes into the composer."
                label="Chat · Gen UI artifact"
                number="01"
                screen="01-genui-chat-1440x1000"
                window={WINDOW}
            >
                <DesktopWindow>
                    <ReleaseChat />
                </DesktopWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Open in the viewer, the document reads down one chat-width column. A message action has no chat to go to here, so it is shown as not supported."
                label="Viewer · Gen UI artifact"
                number="02"
                screen="02-genui-viewer-1440x1000"
                window={WINDOW}
            >
                <DesktopWindow>
                    <HappyAgentArtifactViewer
                        {...viewerHandlers}
                        genUi={{
                            actionsSupported: new Set<GenUiAction["type"]>(["open", "copy"]),
                            onAction: noop,
                        }}
                        labels={labels}
                        viewer={genUiViewer(GALLERY_ID, "Trip photos", galleryRender)}
                    />
                </DesktopWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A cluster_secret button opens the Settings secret form filled with what the agent suggested; every field stays editable and the values are typed here, never by the agent. With an id it opens that secret's own form instead. A saved form marks its button done for good."
                label="Viewer · Secret request"
                number="03"
                screen="03-genui-secret-request-1440x1000"
                window={WINDOW}
            >
                <DesktopWindow>
                    <HappyAgentArtifactViewer
                        {...viewerHandlers}
                        genUi={{
                            actionsSupported: new Set<GenUiAction["type"]>([
                                "open",
                                "copy",
                                "cluster_secret",
                            ]),
                            onAction: noop,
                            clusterSecrets,
                        }}
                        labels={labels}
                        viewer={genUiViewer(SECRETS_ID, "Billing keys", secretRender)}
                    />
                </DesktopWindow>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
