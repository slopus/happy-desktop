import { useContext, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    happyAgentArtifactBackground,
    happyAgentArtifactMarkdownDiffOffered,
    happyAgentArtifactReferenceResolve,
    happyAgentArtifactTypeLabel,
    type HappyAgentArtifact,
    type HappyAgentArtifactContent,
    type HappyAgentArtifactDeletion,
    type HappyAgentArtifactFileLink,
    type HappyAgentArtifactId,
    type HappyAgentArtifactLive,
    type HappyAgentArtifactMarkdownView,
    type HappyAgentArtifactVersion,
    type HappyAgentArtifactViewerSnapshot,
} from "happy-desktop-state";
import { Badge } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { GenUiArtifact } from "../../genUi/GenUiArtifact";
import { HtmlPreviewFrame } from "../../HtmlPreviewFrame";
import type { HtmlPreviewRenderer } from "../../htmlPreview";
import { ImageViewer } from "../../ImageViewer";
import { LinkCopyContext } from "../../LinkContextMenu";
import { MarkdownDiff } from "../../MarkdownDiff";
import { markdownDiffCompute } from "../../markdownDiffModel";
import { MarkdownDocument, type MarkdownDocumentReferences } from "../../MarkdownDocument";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { ScrollArea } from "../../Scrollbar";
import { SegmentedControl } from "../../SegmentedControl";
import { VideoViewer } from "../../VideoViewer";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import {
    ArtifactTypeGlyph,
    artifactFileName,
    artifactMadeBy,
    artifactSizeText,
    type HappyAgentArtifactLabels,
} from "./artifactPresentation";
import { ArtifactHeader } from "./ArtifactHeader";
import { ArtifactLivePage, type ArtifactLiveRenderer } from "./ArtifactLivePage";
import { genUiArtifactHost, type GenUiInlineHost } from "./ArtifactInlineContent";
import { HappyAgentArtifactHtmlFrame } from "./HappyAgentArtifactHtmlFrame";
import type { MessageReferences } from "../../messageReferences";

export interface HappyAgentArtifactViewerProps {
    /** The open artifact, its history, and the version on screen, as the viewer store holds them. */
    viewer: HappyAgentArtifactViewerSnapshot;
    labels: HappyAgentArtifactLabels;
    onVersionSelect: (number: number) => void;
    /** Shows a Markdown version as its diff against the version before it, or as the document. */
    onMarkdownViewSelect: (view: HappyAgentArtifactMarkdownView) => void;
    /** Reads the next page of older versions. */
    onVersionsLoadMore: () => void;
    onDeletionRequest: () => void;
    onDeletionCancel: () => void;
    onDeletionConfirm: () => void;
    /**
     * Saves one file of the version on screen. A link in the artifact to another
     * of its files lands here too: the file is the artifact's, and there is no
     * page here to navigate to.
     */
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
    /**
     * Leaves the viewer for wherever it was opened from. Absent where there is
     * nowhere to go back to, such as a tab, which its own close button ends.
     */
    onBack?: () => void;
    /**
     * Whether the versions column starts out shown. It starts hidden: the
     * artifact comes first, and the History button brings the column up.
     */
    defaultHistoryShown?: boolean;
    /**
     * Drawn as a tab's content — beside a chat in the side panel, or as a tab
     * of the main content — under a strip that is already the window's header
     * row, so the viewer's own header is a slim toolbar.
     */
    tab?: boolean;
    /**
     * Keeps the artifact among the reader's Surfaces, or takes it out. Absent
     * where the Happy Agent has no Surfaces.
     */
    surface?: { readonly added: boolean; readonly onToggle: () => void };
    /**
     * The host's isolated guest for an HTML version served as a site. Absent
     * where the host has none, in which case the viewer never holds a site.
     */
    renderPage?: HtmlPreviewRenderer;
    /**
     * The host's browser for a live artifact's page, bound to the network the
     * artifact was made on and a profile of the artifact's own. Absent where
     * the host has none, in which case the viewer names the page's address.
     */
    renderLive?: ArtifactLiveRenderer;
    /**
     * Opens the live page on screen as a browser tab bound to the artifact,
     * where it has the browser's own toolbar. Absent where there is no tab
     * to open it in.
     */
    onLiveOpen?: (live: HappyAgentArtifactLive) => void;
    /**
     * Reads and opens the `happy://` links to Happy entities a Markdown
     * version carries, as a message's do. Absent, each reads as its label.
     */
    entities?: MessageReferences;
    /**
     * Runs what a Gen UI version's controls ask for. Absent, they report
     * nowhere: the viewer has no conversation of its own to send to.
     */
    genUi?: GenUiInlineHost;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentArtifactViewer — one artifact: what it is, where it was made and by
 * whom, every version of it, and the version on screen shown the way its type
 * reads best.
 *
 * Every file it shows comes from one numbered version, so a page and the
 * pictures it names can never come from two different versions. The history
 * beside it picks which version that is; picking the newest follows the newest
 * again as the artifact changes. A Markdown version with one before it can be
 * read as a rendered diff against that version, or as the document alone.
 * Deleting asks first, and names the version it is deleting so a change made
 * meanwhile is not deleted unseen.
 *
 * A page that declares itself an app fills the slot edge to edge and never
 * scrolls as a page, and the header offers to show it full screen: the slot
 * alone takes the screen, Escape or the window's own control brings it back,
 * and a hint says so for a moment as it opens.
 */
export function HappyAgentArtifactViewer(props: HappyAgentArtifactViewerProps) {
    const viewer = props.viewer;
    const [historyShown, setHistoryShown] = useState(props.defaultHistoryShown ?? false);
    const state = viewer.artifact;
    const artifact = state.type === "ready" ? state.value : undefined;
    const shown = artifact ? (viewer.versionSelected ?? artifact.latestVersion) : 0;
    const diffOffered =
        artifact?.status === "active" &&
        happyAgentArtifactMarkdownDiffOffered(artifact.type, shown);
    // Checked again where it becomes a style: a snapshot can be built by hand.
    const background = happyAgentArtifactBackground(viewer.version?.background);
    const app =
        artifact?.status === "active" &&
        viewer.content.type === "html" &&
        viewer.content.pageMode === "app";
    // The slot is what goes full screen, so the page keeps its guest, its
    // state, and its place; the window only reports when it went and came back.
    const stage = useRef<HTMLDivElement | null>(null);
    const [fullScreen, setFullScreen] = useState(false);
    const stageAttach = (node: HTMLDivElement | null) => {
        stage.current = node;
        if (!node) return;
        const changed = () => setFullScreen(document.fullscreenElement === node);
        // Escape typed into the page reaches the page's engine (`escapePressed`);
        // typed anywhere else in the window, it lands here. An engine that
        // already leaves full screen on Escape has left it by now.
        const keyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || document.fullscreenElement !== node) return;
            document.exitFullscreen().catch(() => undefined);
        };
        node.addEventListener("fullscreenchange", changed);
        document.addEventListener("keydown", keyDown);
        return () => {
            node.removeEventListener("fullscreenchange", changed);
            document.removeEventListener("keydown", keyDown);
            stage.current = null;
        };
    };
    const fullScreenEnter = () => {
        stage.current?.requestFullscreen().catch(() => undefined);
    };
    const fullScreenExit = () => {
        if (document.fullscreenElement === stage.current)
            document.exitFullscreen().catch(() => undefined);
    };
    // An app's own exit, `window.happyApp.close()`: out of full screen if it
    // is there, otherwise back from the viewer, as the header's arrow goes.
    // A tab has no way back of its own; its close button is the tab's.
    const onBack = props.onBack;
    const appClose = () => {
        if (document.fullscreenElement === stage.current) fullScreenExit();
        else onBack?.();
    };
    const live =
        artifact?.status === "active" && viewer.content.type === "live"
            ? viewer.content.live
            : undefined;
    const onLiveOpen = props.onLiveOpen;
    const back = props.onBack ? (
        <Button
            aria-label="Back"
            iconOnly
            onClick={props.onBack}
            size="small"
            title="Back"
            variant="ghost"
        >
            <Ionicon name="arrow-back" size={14} />
        </Button>
    ) : undefined;
    return (
        <div
            className={["happy-agent-artifact-viewer", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-artifact-viewer"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {artifact ? (
                <>
                    <ArtifactHeader
                        className="happy-agent-artifact-viewer__header"
                        {...(props.tab ? { compact: true } : {})}
                        {...(back ? { leading: back } : {})}
                        subtitle={app ? "App" : happyAgentArtifactTypeLabel(artifact.type)}
                        title={artifact.title || "Untitled"}
                        trailing={
                            <>
                                {/* First, so the controls after it stay where
                                    they were when the version turns out to be
                                    an app. */}
                                {app ? (
                                    <Button
                                        data-testid="happy-agent-artifact-full-screen"
                                        icon="full-screen"
                                        onClick={fullScreenEnter}
                                        size="small"
                                        title="Show full screen · Esc exits"
                                        variant="ghost"
                                    >
                                        Full screen
                                    </Button>
                                ) : null}
                                {live && onLiveOpen ? (
                                    <Button
                                        data-testid="happy-agent-artifact-live-open"
                                        icon="open-external"
                                        onClick={() => onLiveOpen(live)}
                                        size="small"
                                        title="Open this page in a browser tab"
                                        variant="ghost"
                                    >
                                        Open in tab
                                    </Button>
                                ) : null}
                                {diffOffered ? (
                                    <SegmentedControl
                                        aria-label="How this version is shown"
                                        data-testid="happy-agent-artifact-markdown-view"
                                        onChange={(value) =>
                                            props.onMarkdownViewSelect(
                                                value === "diff" ? "diff" : "document",
                                            )
                                        }
                                        segments={[
                                            {
                                                value: "diff",
                                                label: "Diff",
                                                title: `Changes since version ${String(shown - 1)}`,
                                            },
                                            {
                                                value: "document",
                                                label:
                                                    shown === artifact.latestVersion
                                                        ? "Latest"
                                                        : `Version ${String(shown)}`,
                                            },
                                        ]}
                                        size="small"
                                        value={viewer.markdownView}
                                    />
                                ) : null}
                                {artifact.status === "active" ? (
                                    <Button
                                        aria-pressed={historyShown}
                                        icon="history"
                                        onClick={() => setHistoryShown(!historyShown)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        History
                                    </Button>
                                ) : null}
                                {artifact.status === "active" && props.surface ? (
                                    <Button
                                        aria-pressed={props.surface.added}
                                        data-testid="happy-agent-artifact-surface"
                                        icon={props.surface.added ? "check" : "plus"}
                                        onClick={props.surface.onToggle}
                                        size="small"
                                        title={
                                            props.surface.added ? "Remove from sidebar" : undefined
                                        }
                                        variant="ghost"
                                    >
                                        {props.surface.added ? "In sidebar" : "Add to sidebar"}
                                    </Button>
                                ) : null}
                                {artifact.status === "active" ? (
                                    <ArtifactLinkCopy artifactId={artifact.id} />
                                ) : null}
                                {artifact.status === "active" ? (
                                    <Button
                                        data-testid="happy-agent-artifact-delete"
                                        disabled={viewer.deletion.phase !== "idle"}
                                        icon="trash"
                                        onClick={props.onDeletionRequest}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Delete
                                    </Button>
                                ) : null}
                            </>
                        }
                    />
                    {viewer.versionSelected !== undefined && artifact.status === "active" ? (
                        <ArtifactOlder
                            labels={props.labels}
                            onLatestShow={() => props.onVersionSelect(artifact.latestVersion)}
                            {...(viewer.version ? { version: viewer.version } : {})}
                            versionSelected={viewer.versionSelected}
                        />
                    ) : null}
                    <div
                        className="happy-agent-artifact-viewer__main"
                        data-happy-desktop-ui="happy-agent-artifact-viewer-main"
                    >
                        {/* The slot the version is shown in. It paints nothing of
                            its own, so the surface shows through, unless the
                            version names a colour to be shown on. */}
                        <div
                            className="happy-agent-artifact-viewer__body"
                            data-happy-desktop-ui="happy-agent-artifact-viewer-body"
                            data-page-mode={app ? "app" : undefined}
                            ref={stageAttach}
                            style={
                                background && artifact.status === "active"
                                    ? { backgroundColor: background }
                                    : undefined
                            }
                        >
                            {artifact.status === "deleted" ? (
                                <EmptyState
                                    description={deletedSentence(artifact, props.labels)}
                                    icon="trash"
                                    size="panel"
                                    title="This artifact was deleted"
                                />
                            ) : (
                                <ArtifactContent
                                    artifactId={artifact.id}
                                    content={viewer.content}
                                    diff={diffOffered && viewer.markdownView === "diff"}
                                    {...(props.entities ? { entities: props.entities } : {})}
                                    files={viewer.files}
                                    key={viewer.version?.number ?? 0}
                                    onFileDownload={props.onFileDownload}
                                    {...(fullScreen ? { escapePressed: fullScreenExit } : {})}
                                    {...(app ? { closeRequested: appClose } : {})}
                                    {...(props.renderPage ? { renderPage: props.renderPage } : {})}
                                    {...(props.renderLive ? { renderLive: props.renderLive } : {})}
                                    {...(props.genUi ? { genUi: props.genUi } : {})}
                                    title={artifact.title}
                                />
                            )}
                            {fullScreen ? (
                                <div
                                    className="happy-agent-artifact-viewer__full-screen-hint"
                                    data-happy-desktop-ui="happy-agent-artifact-full-screen-hint"
                                    role="status"
                                >
                                    Press Esc to exit full screen
                                </div>
                            ) : null}
                        </div>
                        {artifact.status === "active" && historyShown ? (
                            <ArtifactHistory
                                artifact={artifact}
                                labels={props.labels}
                                onFileDownload={props.onFileDownload}
                                onVersionSelect={props.onVersionSelect}
                                onVersionsLoadMore={props.onVersionsLoadMore}
                                viewer={viewer}
                            />
                        ) : null}
                    </div>
                    {viewer.deletion.phase === "idle" ? null : (
                        <ArtifactDeleteDialog
                            deletion={viewer.deletion}
                            onCancel={props.onDeletionCancel}
                            onConfirm={props.onDeletionConfirm}
                            title={artifact.title}
                        />
                    )}
                </>
            ) : (
                <>
                    <ArtifactHeader
                        className="happy-agent-artifact-viewer__header"
                        {...(props.tab ? { compact: true } : {})}
                        {...(back ? { leading: back } : {})}
                        title="Artifact"
                    />
                    {state.type === "missing" ? (
                        <EmptyState
                            description="Nothing with this name is published on this Happy Agent."
                            icon="package"
                            size="panel"
                            title="Artifact not found"
                        />
                    ) : state.type === "error" ? (
                        <EmptyState
                            description={state.error.message}
                            icon="alert"
                            size="panel"
                            title="The artifact could not be read"
                        />
                    ) : (
                        <EmptyState
                            description="Reading the artifact and its history."
                            icon="clock"
                            size="panel"
                            title="Loading artifact…"
                        />
                    )}
                </>
            )}
        </div>
    );
}

/** How long the copied check stays before the button offers the link again. */
const LINK_COPIED_MS = 1_600;

/**
 * Copies the artifact's link, in the form the window writes for a link that
 * leaves it: its share link. The check confirms the copy for a moment; the
 * label stays, so the controls beside it never move. A server with no link
 * that leaves the app offers nothing to copy.
 */
function ArtifactLinkCopy(props: { artifactId: HappyAgentArtifactId }) {
    const link = useContext(LinkCopyContext)(`happy://artifacts/${props.artifactId}`);
    const [copied, setCopied] = useState(false);
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    if (link === undefined) return null;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            if (copiedTimer.current !== undefined) clearTimeout(copiedTimer.current);
            copiedTimer.current = setTimeout(() => {
                copiedTimer.current = undefined;
                setCopied(false);
            }, LINK_COPIED_MS);
        } catch {
            // The browser owns clipboard permission; keep the action retryable.
        }
    };
    return (
        <Button
            data-testid="happy-agent-artifact-link-copy"
            icon={copied ? "check" : "link"}
            onClick={() => void copy()}
            size="small"
            title={copied ? "Copied" : "Copy link to artifact"}
            variant="ghost"
        >
            Copy link
        </Button>
    );
}

function deletedSentence(artifact: HappyAgentArtifact, labels: HappyAgentArtifactLabels): string {
    const by = artifact.deletedBy ? labels.author(artifact.deletedBy) : "Someone";
    const where = labels.source(artifact.deletedSource);
    const when = artifact.deletedAt === null ? "" : ` on ${labels.time(artifact.deletedAt)}`;
    return `Deleted by ${artifactMadeBy(by, where)}${when}. Its versions are no longer served.`;
}

/**
 * Said only when the reader is looking back at an older version, with the way
 * back to the newest, since everything below then describes a version that is
 * no longer current.
 */
function ArtifactOlder(props: {
    labels: HappyAgentArtifactLabels;
    version?: HappyAgentArtifactVersion;
    versionSelected: number;
    onLatestShow: () => void;
}) {
    const labels = props.labels;
    const shown = props.versionSelected;
    return (
        <div
            className="happy-agent-artifact-viewer__older"
            data-happy-desktop-ui="happy-agent-artifact-viewer-older"
        >
            <Banner
                action={{ label: "Show latest", onClick: props.onLatestShow }}
                tone="info"
                title={`Showing version ${String(shown)}`}
            >
                {props.version && props.version.number === shown
                    ? `Made by ${artifactMadeBy(labels.author(props.version.createdBy), labels.source(props.version.source))} · ${labels.time(props.version.createdAt)}.`
                    : "An older version of this artifact."}
            </Banner>
        </div>
    );
}

/** The version on screen, shown the way its type reads best. */
function ArtifactContent(props: {
    artifactId: HappyAgentArtifactId;
    content: HappyAgentArtifactContent;
    /** A Markdown version is read as its diff against the version before it. */
    diff: boolean;
    entities?: MessageReferences;
    files: readonly HappyAgentArtifactFileLink[];
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
    /** Escape was pressed inside a running page; heard only while it is full screen. */
    escapePressed?: () => void;
    /** A running app asked to close; offered only for a page that declared itself one. */
    closeRequested?: () => void;
    renderPage?: HtmlPreviewRenderer;
    renderLive?: ArtifactLiveRenderer;
    genUi?: GenUiInlineHost;
    title: string;
}): ReactNode {
    const content = props.content;
    switch (content.type) {
        case "loading":
            return (
                <EmptyState
                    description="Reading this version's files."
                    icon="clock"
                    size="panel"
                    title="Loading…"
                />
            );
        case "error":
            return (
                <div className="happy-agent-artifact-viewer__fallback">
                    <Banner tone="danger" title="This version could not be shown">
                        {content.error.message}
                    </Banner>
                    <ArtifactFileList files={props.files} onFileDownload={props.onFileDownload} />
                </div>
            );
        case "markdown": {
            const fileOf = (path: string) => props.files.find((link) => link.file.path === path);
            const before = content.before;
            const references: MarkdownDocumentReferences = {
                // A picture the diff shows removed may be gone from this
                // version; it is still the earlier version's.
                image: (src) => {
                    const target = happyAgentArtifactReferenceResolve(content.entryPath, src);
                    if (target.type !== "file") return undefined;
                    return (
                        content.files.get(target.path) ??
                        (props.diff ? before?.files.get(target.path) : undefined)
                    );
                },
                link: (href) => {
                    const target = happyAgentArtifactReferenceResolve(content.entryPath, href);
                    return target.type === "file" && content.files.has(target.path)
                        ? target.path
                        : undefined;
                },
            };
            const onFileOpen = (path: string) => {
                const link = fileOf(path);
                if (link) props.onFileDownload(link);
            };
            if (props.diff && before !== undefined && before.text !== content.text)
                return (
                    <MarkdownDiff
                        className="happy-agent-artifact-viewer__markdown"
                        data-testid="happy-agent-artifact-markdown-diff"
                        diff={markdownDiffCompute(before.text, content.text)}
                        {...(props.entities ? { entities: props.entities } : {})}
                        onFileOpen={onFileOpen}
                        references={references}
                        // A long document is mostly unchanged, and the diff is
                        // read for the change; a little context stays beside it.
                        unchangedContext={2}
                    />
                );
            const document = (
                <MarkdownDocument
                    className="happy-agent-artifact-viewer__markdown"
                    {...(props.entities ? { entities: props.entities } : {})}
                    onFileOpen={onFileOpen}
                    references={references}
                    text={content.text}
                />
            );
            if (!props.diff) return document;
            // Asked for a diff there is none of: say why above the document.
            return (
                <>
                    <div
                        className="happy-agent-artifact-viewer__note"
                        data-happy-desktop-ui="happy-agent-artifact-viewer-note"
                    >
                        <Banner tone="neutral" title="No diff to show">
                            {before === undefined
                                ? "The version before this one could not be read, so this version is shown on its own."
                                : `The text is the same as in version ${String(before.number)}.`}
                        </Banner>
                    </div>
                    {document}
                </>
            );
        }
        case "html":
            return content.page.kind === "site" ? (
                <HtmlPreviewFrame
                    canvas="none"
                    data-testid="happy-agent-artifact-page"
                    {...(props.escapePressed ? { escapePressed: props.escapePressed } : {})}
                    {...(props.closeRequested ? { closeRequested: props.closeRequested } : {})}
                    {...(props.renderPage ? { renderContent: props.renderPage } : {})}
                    source={content.page.url}
                />
            ) : (
                <HappyAgentArtifactHtmlFrame
                    assets={content.page.assets}
                    entryPath={content.entryPath}
                    omitted={content.page.omitted}
                    reason={content.page.reason}
                    text={content.page.text}
                    title={props.title || "Web page"}
                />
            );
        case "live":
            return (
                <ArtifactLivePage
                    artifactId={props.artifactId}
                    data-testid="happy-agent-artifact-live"
                    live={content.live}
                    {...(props.renderLive ? { renderContent: props.renderLive } : {})}
                />
            );
        case "image":
            return (
                <ImageViewer
                    content={{ type: "url", url: content.image.url }}
                    name={artifactFileName(content.image.file.path)}
                    tone="immersive"
                />
            );
        case "image_series":
            return <ArtifactGallery images={content.images} />;
        case "video":
            return (
                <VideoViewer
                    content={{ type: "url", url: content.video.url }}
                    name={artifactFileName(content.video.file.path)}
                    tone="immersive"
                />
            );
        case "document":
            return content.inlineUrl !== undefined ? (
                <iframe
                    className="happy-agent-artifact-viewer__document"
                    data-happy-desktop-ui="happy-agent-artifact-document"
                    src={content.inlineUrl}
                    title={artifactFileName(content.document.file.path)}
                />
            ) : (
                <div className="happy-agent-artifact-viewer__fallback">
                    <ArtifactFileCard
                        link={content.document}
                        onFileDownload={props.onFileDownload}
                    />
                </div>
            );
        case "gen_ui":
            return (
                <ScrollArea
                    className="happy-agent-artifact-viewer__gen-ui"
                    data-testid="happy-agent-artifact-gen-ui"
                    viewportClassName="happy-agent-artifact-viewer__gen-ui-viewport"
                >
                    <div className="happy-agent-artifact-viewer__gen-ui-column">
                        <GenUiArtifact
                            files={content.files}
                            render={content.render}
                            source={content.source}
                            {...(props.genUi ? genUiArtifactHost(props.genUi) : {})}
                        />
                    </div>
                </ScrollArea>
            );
        case "files":
            return (
                <div className="happy-agent-artifact-viewer__fallback">
                    <Banner tone="neutral" title="Shown as its files">
                        This kind of artifact has no viewer here yet. Its files can still be
                        downloaded.
                    </Banner>
                    <ArtifactFileList files={props.files} onFileDownload={props.onFileDownload} />
                </div>
            );
    }
}

/**
 * The pictures of an image series in the order they were listed, one large
 * with the whole run below it. Which one is large is this surface's own
 * business, and a new version starts again from the first.
 */
function ArtifactGallery(props: { images: readonly HappyAgentArtifactFileLink[] }) {
    const [selected, setSelected] = useState(0);
    const index = Math.min(selected, props.images.length - 1);
    const shown = props.images[index];
    if (!shown) return <EmptyState icon="image" size="panel" title="This series has no pictures" />;
    return (
        <div
            className="happy-agent-artifact-gallery"
            data-happy-desktop-ui="happy-agent-artifact-gallery"
        >
            <div className="happy-agent-artifact-gallery__stage">
                <ImageViewer
                    adjacentImages={{
                        previous:
                            props.images[(index - 1 + props.images.length) % props.images.length]
                                ?.url,
                        next: props.images[(index + 1) % props.images.length]?.url,
                    }}
                    content={{ type: "url", url: shown.url }}
                    name={artifactFileName(shown.file.path)}
                    tone="immersive"
                />
            </div>
            <ScrollArea
                axes="horizontal"
                className="happy-agent-artifact-gallery__strip"
                data-happy-desktop-ui="happy-agent-artifact-gallery-strip"
                viewportClassName="happy-agent-artifact-gallery__strip-viewport"
            >
                <div
                    aria-label="Pictures in this series"
                    className="happy-agent-artifact-gallery__thumbs"
                    role="group"
                >
                    {props.images.map((image, index) => (
                        <button
                            aria-label={artifactFileName(image.file.path)}
                            aria-pressed={image === shown}
                            className="happy-agent-artifact-gallery__thumb"
                            data-happy-desktop-ui="happy-agent-artifact-gallery-thumb"
                            key={image.file.path}
                            onClick={() => setSelected(index)}
                            title={`${String(index + 1)} of ${String(props.images.length)} · ${artifactFileName(image.file.path)}`}
                            type="button"
                        >
                            <img
                                alt=""
                                className="happy-agent-artifact-gallery__thumb-image"
                                draggable={false}
                                loading="lazy"
                                src={image.url}
                            />
                        </button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

/** One file stated plainly — its name, its kind, its size — with the way to save it. */
function ArtifactFileCard(props: {
    link: HappyAgentArtifactFileLink;
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
}) {
    const file = props.link.file;
    return (
        <div
            className="happy-agent-artifact-viewer__file-card"
            data-happy-desktop-ui="happy-agent-artifact-file-card"
        >
            <span aria-hidden="true" className="happy-agent-artifact-viewer__file-card-glyph">
                <ArtifactTypeGlyph size={20} type="document" />
            </span>
            <span className="happy-agent-artifact-viewer__file-card-text">
                <span className="happy-agent-artifact-viewer__file-card-name">
                    {artifactFileName(file.path)}
                </span>
                <span className="happy-agent-artifact-viewer__file-card-meta">
                    {file.mimeType} · {artifactSizeText(file.size)}
                </span>
            </span>
            <Button onClick={() => props.onFileDownload(props.link)} size="small">
                Download
            </Button>
        </div>
    );
}

/** Every file of the version on screen, each one savable. */
function ArtifactFileList(props: {
    files: readonly HappyAgentArtifactFileLink[];
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
}) {
    return (
        <ul
            className="happy-agent-artifact-files"
            data-happy-desktop-ui="happy-agent-artifact-files"
        >
            {props.files.map((link) => (
                <li className="happy-agent-artifact-files__item" key={link.file.path}>
                    <span className="happy-agent-artifact-files__text">
                        <span className="happy-agent-artifact-files__name" title={link.file.path}>
                            {link.file.path}
                        </span>
                        <span className="happy-agent-artifact-files__meta">
                            {artifactSizeText(link.file.size)}
                        </span>
                    </span>
                    <Button
                        aria-label={`Download ${artifactFileName(link.file.path)}`}
                        iconOnly
                        onClick={() => props.onFileDownload(link)}
                        size="small"
                        title="Download"
                        variant="ghost"
                    >
                        <Ionicon name="download-outline" size={14} />
                    </Button>
                </li>
            ))}
        </ul>
    );
}

/**
 * The column beside the artifact: every version, newest first, each with who
 * made it, where, and when; then the files of the version on screen.
 */
function ArtifactHistory(props: {
    artifact: HappyAgentArtifact;
    viewer: HappyAgentArtifactViewerSnapshot;
    labels: HappyAgentArtifactLabels;
    onVersionSelect: (number: number) => void;
    onVersionsLoadMore: () => void;
    onFileDownload: (link: HappyAgentArtifactFileLink) => void;
}) {
    const viewer = props.viewer;
    const shown = viewer.versionSelected ?? props.artifact.latestVersion;
    return (
        <aside
            aria-label="Versions and files"
            className="happy-agent-artifact-history"
            data-happy-desktop-ui="happy-agent-artifact-history"
        >
            <ScrollArea
                className="happy-agent-artifact-history__scroll"
                viewportClassName="happy-agent-artifact-history__scroll-viewport"
            >
                <div className="happy-agent-artifact-history__content">
                    <h2 className="happy-agent-artifact-history__heading">Versions</h2>
                    {viewer.versions.length === 0 ? (
                        <p className="happy-agent-artifact-history__note">
                            {viewer.versionsLoading
                                ? "Reading the history…"
                                : "No history to show."}
                        </p>
                    ) : (
                        <ol
                            className="happy-agent-artifact-history__versions"
                            data-happy-desktop-ui="happy-agent-artifact-versions"
                        >
                            {viewer.versions.map((version) => (
                                <li key={version.number}>
                                    <button
                                        aria-current={version.number === shown ? "true" : undefined}
                                        className="happy-agent-artifact-history__version"
                                        data-happy-desktop-ui="happy-agent-artifact-version"
                                        data-version={version.number}
                                        onClick={() => props.onVersionSelect(version.number)}
                                        type="button"
                                    >
                                        <span className="happy-agent-artifact-history__version-line">
                                            <span className="happy-agent-artifact-history__version-number">
                                                Version {version.number}
                                            </span>
                                            {version.number === props.artifact.latestVersion ? (
                                                <Badge label="Latest" variant="outline" />
                                            ) : null}
                                        </span>
                                        <span className="happy-agent-artifact-history__version-meta">
                                            {artifactMadeBy(
                                                props.labels.author(version.createdBy),
                                                props.labels.source(version.source),
                                            )}
                                        </span>
                                        <span className="happy-agent-artifact-history__version-meta">
                                            {props.labels.time(version.createdAt)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ol>
                    )}
                    {viewer.versionsHasMore ? (
                        <Button
                            loading={viewer.versionsLoading}
                            onClick={props.onVersionsLoadMore}
                            size="small"
                            variant="ghost"
                        >
                            Show older versions
                        </Button>
                    ) : null}
                    {viewer.files.length > 0 ? (
                        <>
                            <h2 className="happy-agent-artifact-history__heading">
                                Files in version {shown}
                            </h2>
                            <ArtifactFileList
                                files={viewer.files}
                                onFileDownload={props.onFileDownload}
                            />
                        </>
                    ) : null}
                </div>
            </ScrollArea>
        </aside>
    );
}

/**
 * The confirmation before an artifact is deleted for everyone. It stays up
 * while the deletion is under way, and says so inside itself when the daemon
 * refuses — most often because the artifact changed while it was open.
 */
function ArtifactDeleteDialog(props: {
    deletion: Exclude<HappyAgentArtifactDeletion, { readonly phase: "idle" }>;
    title: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const pending = props.deletion.phase === "pending";
    const title = props.title || "Untitled";
    return (
        <ModalOverlay onDismiss={pending ? undefined : props.onCancel}>
            <Modal
                className="happy-agent-artifact-delete-dialog"
                footer={
                    <Box className="happy-agent-artifact-delete-dialog__actions">
                        <Button disabled={pending} onClick={props.onCancel} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            data-testid="happy-agent-artifact-delete-confirm"
                            loading={pending}
                            onClick={props.onConfirm}
                            variant="danger"
                        >
                            {pending ? "Deleting…" : "Delete artifact"}
                        </Button>
                    </Box>
                }
                icon="trash"
                onClose={pending ? undefined : props.onCancel}
                size="small"
                title={`Delete “${title}”?`}
                tone="danger"
            >
                <Box className="happy-agent-artifact-delete-dialog__body">
                    {props.deletion.phase === "failed" ? (
                        <Banner tone="danger" title="Not deleted">
                            {props.deletion.error.message}
                        </Banner>
                    ) : null}
                    <span className="happy-agent-artifact-delete-dialog__message">
                        This deletes {title} for everyone. Its versions stop being served, and it
                        stays listed only as deleted.
                    </span>
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
