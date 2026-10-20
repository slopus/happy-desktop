import type { ReactNode } from "react";
import {
    entryKey,
    type ConversationEntry,
    type HappyAgentArtifactId,
    type HappyAgentInlineArtifactsSnapshot,
} from "happy-desktop-state";
import { Icon } from "./Icon";
import type { InlinePageProps } from "./InlinePage";
import type { InlinePageFit, InlinePageGeometry } from "./inlinePageFit";
import { ArtifactTypeGlyph } from "./pages/artifacts/artifactPresentation";

/**
 * What a transcript needs from its owner to show pages inline: the artifacts it
 * follows, as they are now, the host's engines to draw a page, and where a page
 * opens beside the conversation. Absent, every call keeps its card.
 */
export interface ConversationInlinePages {
    /** The artifacts the transcript shows inline, as the owner's store holds them. */
    readonly artifacts: HappyAgentInlineArtifactsSnapshot;
    /** Asks the owner's store for these artifacts; it never publishes in this call. */
    artifactsRequest(artifactIds: readonly HappyAgentArtifactId[]): void;
    /** Draws an artifact's page served at `url`; absent where the host has no engine. */
    readonly artifactRender?: (url: string, fit: InlinePageFit) => ReactNode;
    /**
     * Draws a web page through the conversation's agent's network; absent where
     * the host has no browser. The page may reach the network like any page
     * the browser shows — a potential vulnerability the host's sandbox bounds.
     */
    readonly pageRender?: (url: string, fit: InlinePageFit) => ReactNode;
    /** Opens an artifact beside the conversation, following its latest version. */
    artifactOpen(artifactId: HappyAgentArtifactId): void;
    /** Opens a web page beside the conversation. */
    pageOpen(url: string): void;
}

/** One row's inline page: its geometry for the row model and the props that draw it. */
export interface ConversationInlinePage {
    readonly geometry: InlinePageGeometry;
    readonly props: InlinePageProps;
}

/** What the reader did to an inline page here; local to this reader and window. */
export interface ConversationInlinePageLocal {
    collapsed(key: string): boolean | undefined;
    collapsedSet(key: string, collapsed: boolean): void;
    height(key: string): number | undefined;
    heightSet(key: string, height: number): void;
}

/**
 * The newest call that follows each artifact. An artifact a conversation
 * follows is shown inline once, where it was last taken up; the calls before
 * that keep only its title.
 */
export function conversationInlineArtifactLeads(
    entries: readonly ConversationEntry[],
): ReadonlyMap<HappyAgentArtifactId, string> {
    const leads = new Map<HappyAgentArtifactId, string>();
    for (const entry of entries) {
        if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") continue;
        const presentation = entry.activity.tool.presentation;
        if (presentation?.type !== "artifact" || presentation.shows !== "latest") continue;
        leads.set(presentation.artifactId, entryKey(entry));
    }
    return leads;
}

/**
 * The page a transcript row shows inline, or `undefined` when it shows none:
 * an HTML artifact a call follows, or a web page a call showed, drawn by an
 * engine the host supplies. Anything else keeps its card.
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
        if (
            presentation.shows !== "latest" ||
            presentation.artifactType !== "html" ||
            pages.artifactRender === undefined
        )
            return undefined;
        const render = pages.artifactRender;
        const artifactId = presentation.artifactId;
        const artifact = pages.artifacts.get(artifactId);
        if (artifact === undefined) pages.artifactsRequest([artifactId]);
        if (artifact?.type === "missing" || artifact?.status === "deleted") return undefined;
        if (artifact?.site?.type === "unavailable") return undefined;
        const display = artifact?.display ?? null;
        const placement =
            display === "side" || leads.get(artifactId) !== entryKey(entry) ? "title" : "inline";
        const collapsed = local.collapsed(rowKey) ?? display === "inline_compact";
        const height = local.height(rowKey);
        const geometry: InlinePageGeometry = {
            placement,
            collapsed,
            ...(height === undefined ? {} : { height }),
        };
        const site = artifact?.site;
        const title = artifact?.title ?? presentation.title;
        return {
            geometry,
            props: {
                title,
                glyph: <ArtifactTypeGlyph size={16} type="html" />,
                geometry,
                ...(site?.type === "opened"
                    ? { page: { key: site.url, render: (fit) => render(site.url, fit) } }
                    : {}),
                ...(artifact?.background ? { background: artifact.background } : {}),
                onCollapsedChange: (next) => local.collapsedSet(rowKey, next),
                onOpenSide: () => {
                    // Opened beside the chat, it is not also open in it; closing
                    // the panel leaves it collapsed until the reader expands it.
                    if (placement === "inline") local.collapsedSet(rowKey, true);
                    pages.artifactOpen(artifactId);
                },
                onHeightChange: (next) => local.heightSet(rowKey, next),
                "data-testid": "conversation-inline-artifact",
            },
        };
    }
    if (presentation?.type === "page") {
        if (pages.pageRender === undefined) return undefined;
        const render = pages.pageRender;
        const url = presentation.url;
        const placement = presentation.display === "side" ? "title" : "inline";
        const collapsed = local.collapsed(rowKey) ?? presentation.display === "inline_compact";
        const height = local.height(rowKey);
        const geometry: InlinePageGeometry = {
            placement,
            collapsed,
            ...(height === undefined ? {} : { height }),
        };
        return {
            geometry,
            props: {
                title: presentation.title,
                glyph: <Icon name="globe" size={16} />,
                geometry,
                page: { key: url, render: (fit) => render(url, fit) },
                onCollapsedChange: (next) => local.collapsedSet(rowKey, next),
                onOpenSide: () => {
                    if (placement === "inline") local.collapsedSet(rowKey, true);
                    pages.pageOpen(url);
                },
                onHeightChange: (next) => local.heightSet(rowKey, next),
                "data-testid": "conversation-inline-page",
            },
        };
    }
    return undefined;
}
