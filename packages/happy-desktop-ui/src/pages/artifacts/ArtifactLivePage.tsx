import { useState, type CSSProperties, type ReactNode } from "react";
import type { HappyAgentArtifactId, HappyAgentArtifactLive } from "happy-desktop-state";
import {
    browserFailureDescribe,
    type BrowserContentProps,
    type BrowserController,
    type BrowserFailure,
} from "../../BrowserPanel";
import { EmptyState } from "../../EmptyState";

/**
 * What the viewer hands the host's browser for a live artifact's page. Where
 * its traffic goes and whose profile it runs in are the host's to add.
 */
export type ArtifactLivePageContentProps = Pick<
    BrowserContentProps,
    | "source"
    | "browserControllerReady"
    | "browserLoadingChanged"
    | "browserLocationChanged"
    | "browserTitleChanged"
    | "browserFailed"
>;

/**
 * Draws a live artifact's page through the network it was made on, in a
 * browser profile of that artifact's own: its cookies and storage are never
 * the workspace browser's or another artifact's.
 */
export type ArtifactLiveRenderer = (
    artifactId: HappyAgentArtifactId,
    live: HappyAgentArtifactLive,
    props: ArtifactLivePageContentProps,
) => ReactNode;

export interface ArtifactLivePageProps {
    artifactId: HappyAgentArtifactId;
    /** The address the version on screen recorded, and the network it is reached through. */
    live: HappyAgentArtifactLive;
    /**
     * The host's browser. Absent where the host has none, as in a browser
     * tab, in which case the page names the address instead of showing it.
     */
    renderContent?: ArtifactLiveRenderer;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * ArtifactLivePage — a live artifact's page filling the slot it is given.
 *
 * The page is a web address on the network of the agent that made it, so only
 * a host that can reach that network shows it; anywhere else the address is
 * named, never the placeholder files a live artifact carries for clients that
 * predate it. A load that fails is drawn over the guest the way a browser tab
 * draws it, so the guest keeps its process while the page comes back.
 */
export function ArtifactLivePage(props: ArtifactLivePageProps) {
    const live = props.live;
    return (
        <div
            className={["happy-agent-artifact-live", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-artifact-live"
            data-state={props.renderContent ? "page" : "unavailable"}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {props.renderContent ? (
                /* Another address is another page: its guest, and any failure
                   the previous one reported, belong to the page that is gone. */
                <ArtifactLiveGuest
                    artifactId={props.artifactId}
                    key={`${live.networkId}\n${live.url}`}
                    live={live}
                    renderContent={props.renderContent}
                />
            ) : (
                <>
                    <EmptyState
                        description="It runs on the network of the agent that made it, which only the Happy desktop app can reach. Open it there to see it."
                        icon="globe"
                        size="inline"
                        title="This live page can’t be shown here"
                    />
                    <p
                        className="happy-agent-artifact-live__address"
                        data-happy-desktop-ui="happy-agent-artifact-live-address"
                    >
                        {live.url}
                    </p>
                </>
            )}
        </div>
    );
}

/**
 * One address, its guest, and what that guest last said about itself. The
 * failure is local UI state: it is what the engine reported about this page,
 * and a new navigation or a different document retires it.
 */
function ArtifactLiveGuest(props: {
    artifactId: HappyAgentArtifactId;
    live: HappyAgentArtifactLive;
    renderContent: ArtifactLiveRenderer;
}) {
    const [failure, failureSet] = useState<BrowserFailure | undefined>(undefined);
    const [controller, controllerSet] = useState<BrowserController | undefined>(undefined);
    const page = failure ? browserFailureDescribe(failure) : undefined;
    return (
        <>
            {props.renderContent(props.artifactId, props.live, {
                source: props.live.url,
                browserControllerReady: (next) => controllerSet(next),
                // The failure is reported before loading stops, so only a new
                // load retires it.
                browserLoadingChanged: (loading) => {
                    if (loading) failureSet(undefined);
                },
                browserLocationChanged: (url) =>
                    failureSet((current) =>
                        current?.url && current.url !== url ? undefined : current,
                    ),
                browserTitleChanged: () => undefined,
                browserFailed: (next) => failureSet(next),
            })}
            {page ? (
                <div
                    className="happy-agent-artifact-live__error"
                    data-happy-desktop-ui="happy-agent-artifact-live-error"
                    role="alert"
                >
                    <EmptyState
                        {...(controller
                            ? {
                                  action: {
                                      label: "Try again",
                                      onClick: () =>
                                          controller.browserLoad(failure?.url ?? props.live.url),
                                  },
                              }
                            : {})}
                        description={page.description}
                        icon={page.icon}
                        size="inline"
                        title={page.title}
                    />
                    {page.code ? (
                        <p
                            className="happy-agent-artifact-live__error-code"
                            data-happy-desktop-ui="happy-agent-artifact-live-error-code"
                        >
                            {page.code}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}
