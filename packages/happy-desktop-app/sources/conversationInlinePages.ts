import type {
    HappyAgentArtifactId,
    HappyAgentComponent,
    HappyAgentComponentSitesSnapshot,
    HappyAgentComponentSitesStore,
    HappyAgentInlineArtifactsSnapshot,
    HappyAgentInlineArtifactsStore,
} from "happy-desktop-state";
import type {
    BrowserContentRenderer,
    BrowserFailure,
    ConversationInlinePages,
    HtmlPreviewFailure,
    HtmlPreviewRenderer,
} from "happy-desktop-ui";

const INLINE_EMPTY: HappyAgentInlineArtifactsSnapshot = new Map();

/** An inline-artifacts store with nothing behind it, for a Happy Agent that keeps no artifacts. */
export const inlineArtifactsStoreNoop: HappyAgentInlineArtifactsStore = {
    get: () => INLINE_EMPTY,
    subscribe: () => () => undefined,
    request: () => undefined,
    contentRequest: () => undefined,
    [Symbol.dispose]: () => undefined,
};

const COMPONENTS_EMPTY: HappyAgentComponentSitesSnapshot = new Map();

/** A component-sites store with nothing behind it, for a Happy Agent that keeps no artifacts. */
export const componentSitesStoreNoop: HappyAgentComponentSitesStore = {
    get: () => COMPONENTS_EMPTY,
    subscribe: () => () => undefined,
    request: () => undefined,
    [Symbol.dispose]: () => undefined,
};

function previewFailureMessage(failure: HtmlPreviewFailure): string {
    switch (failure.kind) {
        case "address-unavailable":
            return "This page has nowhere to load from.";
        case "load-failed":
            return failure.status !== undefined
                ? `This page could not be loaded (${String(failure.status)}).`
                : `This page could not be loaded${failure.description ? ` (${failure.description})` : ""}.`;
        case "renderer-gone":
            return "This page stopped responding and was closed.";
        case "unsupported":
            return "This window cannot show pages.";
    }
}

function browserFailureMessage(failure: BrowserFailure): string {
    if (failure.message) return failure.message;
    if (failure.status !== undefined)
        return `This page could not be loaded (${String(failure.status)}).`;
    return `This page could not be loaded${failure.description ? ` (${failure.description})` : ""}.`;
}

const ignore = (): void => undefined;

/**
 * What a conversation needs to show its artifacts and pages in a reply: the
 * artifacts it follows, the host's engines bound to this conversation, and
 * where a page opens beside it.
 *
 * A web page runs on the conversation's own agent's network, the way a browser
 * tab opened for that agent does, so `localhost` is the agent's machine. Such a
 * page may reach the network like any page the browser shows: a potential
 * vulnerability, bounded by the same guest sandbox every browser tab has.
 */
export function conversationInlinePagesCreate(input: {
    readonly artifacts: HappyAgentInlineArtifactsSnapshot;
    readonly store: HappyAgentInlineArtifactsStore;
    /** The pages the conversation's standard components are drawn on, and their store. */
    readonly components?: {
        readonly sites: HappyAgentComponentSitesSnapshot;
        readonly store: HappyAgentComponentSitesStore;
    };
    readonly artifactPage?: HtmlPreviewRenderer;
    readonly browserContent?: BrowserContentRenderer;
    readonly proposalRender?: ConversationInlinePages["proposalRender"];
    readonly storyRender?: ConversationInlinePages["storyRender"];
    readonly browserConnectionId: string | null;
    readonly workspaceId: string;
    readonly agentId: string;
    readonly artifactOpen: (artifactId: HappyAgentArtifactId, version?: number) => void;
    readonly pageOpen: (url: string) => void;
}): ConversationInlinePages {
    const artifactPage = input.artifactPage;
    const browserContent = input.browserContent;
    const components = input.components;
    return {
        artifacts: input.artifacts,
        artifactsRequest: (artifactIds) => input.store.request(artifactIds),
        artifactsContentRequest: (artifactIds) => input.store.contentRequest(artifactIds),
        ...(components
            ? {
                  componentSites: components.sites,
                  componentSitesRequest: (requested: readonly HappyAgentComponent[]) =>
                      components.store.request(requested),
              }
            : {}),
        ...(artifactPage
            ? {
                  artifactRender: (url, fit) =>
                      artifactPage({
                          source: url,
                          fit,
                          previewFailed: (failure) => fit.failed(previewFailureMessage(failure)),
                          previewLoaded: ignore,
                      }),
              }
            : {}),
        ...(browserContent
            ? {
                  liveRender: (artifactId, live, fit) =>
                      browserContent({
                          source: live.url,
                          fit,
                          // The network the artifact was made on, never the
                          // reader's or the agent's current one: a missing
                          // network fails closed.
                          target: {
                              connectionId: input.browserConnectionId,
                              workspaceId: input.workspaceId,
                              agentId: input.agentId,
                              networkId: live.networkId,
                              artifactId,
                          },
                          browserControllerReady: ignore,
                          browserLoadingChanged: ignore,
                          browserLocationChanged: ignore,
                          browserTitleChanged: ignore,
                          browserFailed: (failure) => fit.failed(browserFailureMessage(failure)),
                      }),
              }
            : {}),
        ...(input.proposalRender ? { proposalRender: input.proposalRender } : {}),
        ...(input.storyRender ? { storyRender: input.storyRender } : {}),
        artifactOpen: input.artifactOpen,
        pageOpen: input.pageOpen,
    };
}
