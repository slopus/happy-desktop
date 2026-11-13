import type {
    HappyAgentArtifactId,
    HappyAgentGenUiActions,
    HappyAgentGenUiClusterActions,
    HappyAgentInlineArtifactsSnapshot,
    HappyAgentInlineArtifactsStore,
} from "happy-desktop-state";
import type {
    GenUiAction,
    GenUiClusterSecretHost,
    GenUiInlineHost,
    GenUiSecretHost,
    ArtifactLiveRenderer,
    BrowserContentRenderer,
    BrowserFailure,
    ConversationInlinePages,
    HtmlPreviewFailure,
    HtmlPreviewRenderer,
} from "happy-desktop-ui";
import { clusterSecretRow } from "./views/AppClusterSecretSettings";

const INLINE_EMPTY: HappyAgentInlineArtifactsSnapshot = new Map();

/** An inline-artifacts store with nothing behind it, for a Happy Agent that keeps no artifacts. */
export const inlineArtifactsStoreNoop: HappyAgentInlineArtifactsStore = {
    get: () => INLINE_EMPTY,
    subscribe: () => () => undefined,
    request: () => undefined,
    contentRequest: () => undefined,
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
 * Draws a live artifact's page in a viewer: its recorded address, on the
 * network the artifact was made on, through the artifact's own restricted
 * proxy and in a browser profile of the artifact's own. The network is fixed
 * when the artifact is made, so one that has gone missing fails closed. The
 * page may reach the network: a potential vulnerability, bounded by the
 * daemon deciding every address its proxy connects to.
 */
export function artifactLiveRendererCreate(
    browserContent: BrowserContentRenderer,
    browserConnectionId: string | null,
): ArtifactLiveRenderer {
    return (artifactId, live, props) =>
        browserContent({
            ...props,
            target: { connectionId: browserConnectionId, artifactId, networkId: live.networkId },
        });
}

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
    readonly artifactPage?: HtmlPreviewRenderer;
    readonly browserContent?: BrowserContentRenderer;
    readonly browserConnectionId: string | null;
    readonly workspaceId: string;
    readonly agentId: string;
    readonly artifactOpen: (artifactId: HappyAgentArtifactId, version?: number) => void;
    readonly pageOpen: (url: string) => void;
    readonly entities?: ConversationInlinePages["entities"];
    readonly previews?: ConversationInlinePages["previews"];
    readonly genUi?: GenUiInlineHost;
}): ConversationInlinePages {
    const artifactPage = input.artifactPage;
    const browserContent = input.browserContent;
    return {
        ...(input.previews ? { previews: input.previews } : {}),
        artifacts: input.artifacts,
        artifactsRequest: (artifactIds) => input.store.request(artifactIds),
        artifactsContentRequest: (artifactIds) => input.store.contentRequest(artifactIds),
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
                          // reader's or the agent's current one. Gone missing,
                          // it is asked of this conversation's agent again and
                          // retried only if that agent names the same one.
                          target: {
                              connectionId: input.browserConnectionId,
                              artifactId,
                              networkId: live.networkId,
                              recovery: { workspaceId: input.workspaceId, agentId: input.agentId },
                          },
                          browserControllerReady: ignore,
                          browserLoadingChanged: ignore,
                          browserLocationChanged: ignore,
                          browserTitleChanged: ignore,
                          browserFailed: (failure) => fit.failed(browserFailureMessage(failure)),
                      }),
              }
            : {}),
        artifactOpen: input.artifactOpen,
        pageOpen: input.pageOpen,
        ...(input.entities ? { entities: input.entities } : {}),
        ...(input.genUi ? { genUi: input.genUi } : {}),
    };
}

/**
 * Runs what a Gen UI artifact's controls ask for, as if the person had done
 * it themselves: a `message` is sent as their next message in this
 * conversation, an `open` opens an https address beside it, and a `copy` puts
 * the text on the clipboard. The model wrote these actions, so nothing runs
 * that the person could not have done with the same tap, and anything but an
 * https address is refused. A `plugin` opens that plugin's page, where the
 * person may install it; the tap installs nothing. A `tool` call is shown as
 * not supported yet, and so is a `message` where there is no conversation to
 * send it to. `secret` and `cluster_secret` open the artifact's own form, each
 * served on the kind of server that stores it.
 */
export function genUiInlineHostCreate(input: {
    readonly messageSend?: (text: string) => Promise<void>;
    readonly linkOpen: (url: string) => void;
    readonly pluginOpen?: (pluginId: string) => void;
    readonly secrets?: GenUiSecretHost;
    readonly clusterSecrets?: GenUiClusterSecretHost;
}): GenUiInlineHost {
    const messageSend = input.messageSend;
    const supported: GenUiAction["type"][] = ["open", "copy"];
    if (messageSend) supported.push("message");
    if (input.pluginOpen) supported.push("plugin");
    if (input.secrets) supported.push("secret");
    if (input.clusterSecrets) supported.push("cluster_secret");
    return {
        actionsSupported: new Set(supported),
        ...(input.secrets ? { secrets: input.secrets } : {}),
        ...(input.clusterSecrets ? { clusterSecrets: input.clusterSecrets } : {}),
        onAction: async (_elementKey, action) => {
            switch (action.type) {
                case "message":
                    await messageSend?.(action.text);
                    return;
                case "open": {
                    let url: URL;
                    try {
                        url = new URL(action.url);
                    } catch {
                        return;
                    }
                    if (url.protocol === "https:") input.linkOpen(url.href);
                    return;
                }
                case "copy":
                    await navigator.clipboard.writeText(action.text);
                    return;
                case "plugin":
                    input.pluginOpen?.(action.plugin.id);
                    return;
                case "tool":
                case "secret":
                case "cluster_secret":
                    return;
            }
        },
    };
}

/**
 * The secret forms of Gen UI documents, by the server's kind: a Happy Agent's
 * `secret` form or a Happy Cloud server's `cluster_secret` form. The artifact
 * draws the form; saving it goes through the version's action route, which
 * also tells the agent that asked.
 */
export function genUiSecretHostsCreate(
    actions: HappyAgentGenUiActions,
): { readonly secrets: GenUiSecretHost } | { readonly clusterSecrets: GenUiClusterSecretHost } {
    if (actions.backend === "happyAgent")
        return {
            secrets: {
                formOpen: async (source, element, secretId) => {
                    const form = await actions.secretFormOpen(source, element, secretId);
                    return {
                        secret: form.secret
                            ? {
                                  id: form.secret.id,
                                  description: form.secret.description,
                                  variables: form.secret.environmentVariables,
                              }
                            : undefined,
                        create: async (input) => {
                            await form.create(input);
                        },
                        update: async (input) => {
                            await form.update(input);
                        },
                    };
                },
            },
        };
    return { clusterSecrets: genUiClusterSecretHostCreate(actions) };
}

function genUiClusterSecretHostCreate(
    actions: HappyAgentGenUiClusterActions,
): GenUiClusterSecretHost {
    return {
        formOpen: async (source, element, secretId) => {
            const form = await actions.clusterSecretFormOpen(source, element, secretId);
            return {
                owners: form.owners,
                secret: form.secret ? clusterSecretRow(form.secret) : undefined,
                create: async (input) => {
                    await form.create(input);
                },
                update: async (version, input) => {
                    await form.update(version, input);
                },
            };
        },
    };
}
