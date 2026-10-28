import type { ReactNode } from "react";
import {
    entryKey,
    type ConversationEntry,
    type HappyAgentArtifactDisplay,
    type HappyAgentArtifactId,
    type HappyAgentArtifactType,
    type HappyAgentComponent,
    type HappyAgentComponentSitesSnapshot,
    type HappyAgentInlineArtifactLive,
    type HappyAgentInlineArtifactsSnapshot,
} from "happy-desktop-state";
import { Icon } from "./Icon";
import type { InlinePageProps } from "./InlinePage";
import type { InlinePageFit, InlinePageGeometry } from "./inlinePageFit";
import { ArtifactInlineContent } from "./pages/artifacts/ArtifactInlineContent";
import { ArtifactTypeGlyph } from "./pages/artifacts/artifactPresentation";

/**
 * What a transcript needs from its owner to show artifacts in a reply: the
 * artifacts it follows, as they are now, the host's engines to draw a page,
 * and where an artifact opens beside the conversation.
 */
export interface ConversationInlinePages {
    /** The artifacts the transcript shows, as the owner's store holds them. */
    readonly artifacts: HappyAgentInlineArtifactsSnapshot;
    /** Asks the owner's store for these artifacts; it never publishes in this call. */
    artifactsRequest(artifactIds: readonly HappyAgentArtifactId[]): void;
    /**
     * Asks the owner's store for the content of artifacts shown expanded that
     * are not pages; it never publishes in this call.
     */
    artifactsContentRequest(artifactIds: readonly HappyAgentArtifactId[]): void;
    /** Draws an artifact's page served at `url`; absent where the host has no engine. */
    readonly artifactRender?: (url: string, fit: InlinePageFit) => ReactNode;
    /**
     * The pages the standard components a reply holds — its charts, diagrams,
     * code quotes, and file lists — are served on, as the owner's store holds
     * them. Each is drawn by `artifactRender`.
     */
    readonly componentSites?: HappyAgentComponentSitesSnapshot;
    /** Asks the owner's store for these components' pages; it never publishes in this call. */
    componentSitesRequest?(components: readonly HappyAgentComponent[]): void;
    /**
     * Draws a live artifact's page through the network it was made on, in a
     * browser profile of that artifact's own: its cookies and storage are
     * never the workspace browser's or another artifact's.
     */
    readonly liveRender?: (
        artifactId: HappyAgentArtifactId,
        live: HappyAgentInlineArtifactLive,
        fit: InlinePageFit,
    ) => ReactNode;
    /**
     * Draws a sidebar proposal as the sidebar it proposes, live and editable,
     * at its full height; absent where the host does not draw proposals.
     */
    readonly proposalRender?: (artifactId: HappyAgentArtifactId, fit: InlinePageFit) => ReactNode;
    /**
     * Draws a story as the story itself, from its latest version, with Post
     * and Edit while it is the reader's draft; absent where the host has none.
     */
    readonly storyRender?: (artifactId: HappyAgentArtifactId, fit: InlinePageFit) => ReactNode;
    /**
     * Opens an artifact beside the conversation: the numbered version a call
     * recorded, or without one its latest version, followed as it changes.
     */
    artifactOpen(artifactId: HappyAgentArtifactId, version?: number): void;
    /** Opens a web page beside the conversation. */
    pageOpen(url: string): void;
}

/** One row's artifact: its geometry for the row model and the props that draw it. */
export interface ConversationInlinePage {
    readonly geometry: InlinePageGeometry;
    readonly props: InlinePageProps;
}

/** What the reader did to an artifact in a reply here; local to this reader and window. */
export interface ConversationInlinePageLocal {
    collapsed(key: string): boolean | undefined;
    collapsedSet(key: string, collapsed: boolean): void;
    height(key: string): number | undefined;
    heightSet(key: string, height: number): void;
}

/**
 * The newest call that shows each artifact. An artifact a conversation shows
 * starts expanded only there, where it was last taken up; the calls before
 * that start folded to its title, and can be expanded the same way.
 */
export function conversationInlineArtifactLeads(
    entries: readonly ConversationEntry[],
): ReadonlyMap<HappyAgentArtifactId, string> {
    const leads = new Map<HappyAgentArtifactId, string>();
    for (const entry of entries) {
        if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") continue;
        const presentation = entry.activity.tool.presentation;
        if (presentation?.type !== "artifact") continue;
        leads.set(presentation.artifactId, entryKey(entry));
    }
    return leads;
}

/**
 * Whether an artifact starts expanded where it was last taken up. Its author's
 * display preference decides: `inline_expanded` starts open, `inline_compact`
 * and `side` start at their title. Without one, what reads at a glance — a
 * page, a picture, a recording — starts open, and a document someone reads
 * through starts at its title.
 */
function artifactStartsExpanded(
    display: HappyAgentArtifactDisplay | null,
    type: HappyAgentArtifactType,
): boolean {
    if (display !== null) return display === "inline_expanded";
    return (
        type === "html" ||
        type === "image" ||
        type === "image_series" ||
        type === "video" ||
        type === "story"
    );
}

/**
 * The row a transcript shows for a call's artifact or web page, or `undefined`
 * for any other call. Every artifact is the same row, whatever its type and
 * however often the conversation names it: its title, which opens it beside
 * the conversation, and its content under it once expanded — a page drawn by
 * an engine the host supplies, or a document, picture, or recording drawn
 * here. Only where it starts differs.
 */
export function conversationInlinePage(
    entry: ConversationEntry,
    rowKey: string,
    pages: ConversationInlinePages,
    leads: ReadonlyMap<HappyAgentArtifactId, string>,
    local: ConversationInlinePageLocal,
): ConversationInlinePage | undefined {
    if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") return undefined;
    const presentation = entry.activity.tool.presentation;
    if (presentation?.type === "artifact") {
        const artifactId = presentation.artifactId;
        // A story the host draws reads itself, and says for itself whether it
        // is gone: its artifact is not readable to everyone who may read the
        // chat it was drafted in.
        const storyDrawn = presentation.artifactType === "story" && pages.storyRender !== undefined;
        const held = pages.artifacts.get(artifactId);
        if (held === undefined && !storyDrawn) pages.artifactsRequest([artifactId]);
        const artifact = held?.type === "ready" ? held : undefined;
        const gone = !storyDrawn && (held?.type === "missing" || artifact?.status === "deleted");
        const type = artifact?.artifactType ?? presentation.artifactType;
        const live = artifact?.live;
        const site = artifact?.site;
        const lead = leads.get(artifactId) === entryKey(entry);
        const collapsed =
            local.collapsed(rowKey) ??
            !(lead && artifactStartsExpanded(artifact?.display ?? null, type));
        // What it can be expanded into here. A page needs the host's engine,
        // and a document is read beside the chat, where it has a viewer.
        const expandable =
            !gone &&
            (type === "html"
                ? live
                    ? pages.liveRender !== undefined
                    : pages.artifactRender !== undefined && site?.type !== "unavailable"
                : type === "sidebar_proposal"
                  ? pages.proposalRender !== undefined
                  : type === "story"
                    ? pages.storyRender !== undefined
                    : type === "markdown" ||
                      type === "image" ||
                      type === "image_series" ||
                      type === "video");
        const placement = expandable ? "inline" : "title";
        if (
            placement === "inline" &&
            !collapsed &&
            type !== "html" &&
            type !== "sidebar_proposal" &&
            type !== "story" &&
            artifact
        )
            pages.artifactsContentRequest([artifactId]);
        const height = local.height(rowKey);
        const geometry: InlinePageGeometry = {
            placement,
            collapsed,
            ...(height === undefined ? {} : { height }),
        };
        const title = artifact?.title || presentation.title || "Untitled artifact";
        // A call that recorded one version names it, and opens that version,
        // once it is no longer the latest; a call that follows the artifact
        // always shows its latest.
        const latest = artifact?.latestVersion;
        const recorded =
            presentation.shows === "version" &&
            latest !== undefined &&
            presentation.version !== latest
                ? presentation.version
                : undefined;
        const status = gone
            ? held?.type === "missing"
                ? "Unavailable"
                : "Deleted"
            : recorded === undefined || latest === undefined
              ? undefined
              : placement === "inline" && !collapsed
                ? `Version ${String(recorded)} · showing the latest, ${String(latest)}`
                : `Version ${String(recorded)}`;
        // A live artifact's files are only a placeholder, so the panel beside
        // the chat has nothing of it to show yet: it is read in the chat. So
        // is a proposal, which is answered where it was asked.
        const openSide =
            gone || live || type === "sidebar_proposal" || type === "story"
                ? undefined
                : () => {
                      // Opened beside the chat, it is not also open in it; closing
                      // the panel leaves it collapsed until the reader expands it.
                      if (placement === "inline") local.collapsedSet(rowKey, true);
                      pages.artifactOpen(artifactId, recorded);
                  };
        const liveRender = pages.liveRender;
        const render = pages.artifactRender;
        const proposalRender = pages.proposalRender;
        const storyRender = pages.storyRender;
        const content = artifact?.content;
        const page =
            !expandable || (artifact === undefined && !storyDrawn)
                ? undefined
                : type === "story" && storyRender
                  ? {
                        // One page for the story's whole life: it follows the
                        // latest version in place, posted or deleted.
                        key: `story:${artifactId}`,
                        render: (fit: InlinePageFit) => storyRender(artifactId, fit),
                    }
                  : type === "sidebar_proposal" && proposalRender
                    ? {
                          // One page across every version: it is edited in place,
                          // and a revision redraws its rows without a new frame.
                          key: `proposal:${artifactId}`,
                          render: (fit: InlinePageFit) => proposalRender(artifactId, fit),
                      }
                    : live && liveRender
                      ? {
                            key: `${artifactId}:${live.networkId}:${live.url}`,
                            render: (fit: InlinePageFit) => liveRender(artifactId, live, fit),
                        }
                      : type === "html"
                        ? site?.type === "opened" && render
                            ? {
                                  key: site.url,
                                  render: (fit: InlinePageFit) => render(site.url, fit),
                              }
                            : undefined
                        : content
                          ? {
                                key: `${artifactId}:${String(content.version)}`,
                                render: (fit: InlinePageFit) => (
                                    <ArtifactInlineContent
                                        artifactType={type}
                                        content={content}
                                        fit={fit}
                                        {...(openSide ? { onOpen: openSide } : {})}
                                    />
                                ),
                            }
                          : undefined;
        return {
            geometry,
            props: {
                title,
                glyph: live ? (
                    <Icon name="globe" size={16} />
                ) : (
                    <ArtifactTypeGlyph size={16} type={type} />
                ),
                geometry,
                ...(page ? { page } : {}),
                ...(status ? { status } : {}),
                ...(artifact?.background && type === "html"
                    ? { background: artifact.background }
                    : {}),
                ...(expandable
                    ? { onCollapsedChange: (next: boolean) => local.collapsedSet(rowKey, next) }
                    : {}),
                ...(openSide ? { onOpenSide: openSide } : {}),
                onHeightChange: (next) => local.heightSet(rowKey, next),
                "data-testid": "conversation-inline-artifact",
            },
        };
    }
    if (presentation?.type === "page") {
        // A page from the deprecated show_page is not run inline: its network
        // has no rule for where the page may connect, which a live artifact's
        // has. It keeps its title, and the reader may open it beside the chat.
        const url = presentation.url;
        const geometry: InlinePageGeometry = { placement: "title", collapsed: true };
        return {
            geometry,
            props: {
                title: presentation.title,
                glyph: <Icon name="globe" size={16} />,
                geometry,
                onOpenSide: () => pages.pageOpen(url),
                onHeightChange: (next) => local.heightSet(rowKey, next),
                "data-testid": "conversation-inline-page",
            },
        };
    }
    return undefined;
}
