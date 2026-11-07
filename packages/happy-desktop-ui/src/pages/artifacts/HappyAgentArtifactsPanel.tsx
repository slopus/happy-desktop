import type { CSSProperties } from "react";
import type {
    HappyAgentArtifactCatalogSnapshot,
    HappyAgentArtifactId,
    HappyAgentArtifactScope,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { ScrollArea } from "../../Scrollbar";
import { SegmentedControl, type SegmentedControlSegment } from "../../SegmentedControl";
import type { HappyAgentArtifactLabels } from "./artifactPresentation";
import { HappyAgentArtifactRow } from "./HappyAgentArtifactRow";

export interface HappyAgentArtifactsPanelProps {
    /** The list beside the chat as its store holds it, with the chat it is narrowed to. */
    catalog: HappyAgentArtifactCatalogSnapshot;
    labels: HappyAgentArtifactLabels;
    onScopeChange: (scope: HappyAgentArtifactScope) => void;
    /** Reads the next page of older artifacts. */
    onLoadMore: () => void;
    onArtifactOpen: (artifactId: HappyAgentArtifactId) => void;
    /** The artifact open in the viewer, marked where it appears in this list. */
    selectedId?: HappyAgentArtifactId;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentArtifactsPanel — what has been published beside the open chat, in
 * the side panel's narrow column.
 *
 * The list reaches as far as the reader chooses: the chat itself, the project
 * or workspace it works in, or the whole catalog. The narrower reaches are
 * offered only when the chat has them — a bot is its own place, so it offers
 * no second one — and nothing beside no chat is narrowed at all.
 */
export function HappyAgentArtifactsPanel(props: HappyAgentArtifactsPanelProps) {
    const catalog = props.catalog;
    const context = catalog.context;
    const placeName = context?.place?.kind === "workspace" ? "workspace" : "project";
    const segments: SegmentedControlSegment[] = context
        ? [
              { value: "chat", label: "This chat" },
              ...(context.place
                  ? [{ value: "place", label: placeName === "workspace" ? "Workspace" : "Project" }]
                  : []),
              { value: "all", label: "All" },
          ]
        : [];
    // A place this chat does not have reads as the chat itself, which is what
    // the store narrows to in that case too.
    const scope: HappyAgentArtifactScope =
        catalog.scope === "place" && !context?.place ? "chat" : catalog.scope;
    const reach = context === undefined ? "all" : scope;
    const count = catalog.artifacts.length;
    return (
        <div
            className={["happy-agent-artifacts-panel", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-artifacts-panel"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {segments.length > 0 ? (
                <div
                    className="happy-agent-artifacts-panel__scope"
                    data-happy-desktop-ui="happy-agent-artifacts-panel-scope"
                >
                    <SegmentedControl
                        aria-label="Show artifacts from"
                        fullWidth
                        onChange={(value) => props.onScopeChange(value as HappyAgentArtifactScope)}
                        segments={segments}
                        size="small"
                        value={scope}
                    />
                </div>
            ) : null}
            <ScrollArea
                className="happy-agent-artifacts-panel__scroll"
                data-happy-desktop-ui="happy-agent-artifacts-panel-scroll"
                viewportClassName="happy-agent-artifacts-panel__scroll-viewport"
            >
                <div className="happy-agent-artifacts-panel__content">
                    {catalog.error ? (
                        <Banner tone="danger" title="May be out of date">
                            {catalog.error.message}
                        </Banner>
                    ) : null}
                    {count === 0 ? (
                        <EmptyState
                            animation={catalog.loading ? undefined : "tickets"}
                            description={
                                catalog.loading
                                    ? undefined
                                    : reach === "chat"
                                      ? "Finished work this chat publishes appears here."
                                      : reach === "place"
                                        ? `Finished work published in this ${placeName} appears here.`
                                        : "Finished work any agent publishes appears here."
                            }
                            icon={catalog.loading ? "clock" : "package"}
                            size="panel"
                            title={catalog.loading ? "Loading artifacts…" : "No artifacts yet"}
                        />
                    ) : (
                        <div
                            className="happy-agent-artifacts-panel__list"
                            data-happy-desktop-ui="happy-agent-artifacts-panel-list"
                            role="list"
                        >
                            {catalog.artifacts.map((artifact) => (
                                <div
                                    className="happy-agent-artifacts-panel__item"
                                    key={artifact.id}
                                    role="listitem"
                                >
                                    <HappyAgentArtifactRow
                                        artifact={artifact}
                                        density="panel"
                                        labels={props.labels}
                                        onOpen={props.onArtifactOpen}
                                        selected={artifact.id === props.selectedId}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    {catalog.hasMore ? (
                        <div className="happy-agent-artifacts-panel__more">
                            <Button
                                loading={catalog.loadingMore}
                                onClick={props.onLoadMore}
                                size="small"
                                variant="ghost"
                            >
                                Show older
                            </Button>
                        </div>
                    ) : null}
                </div>
            </ScrollArea>
        </div>
    );
}
