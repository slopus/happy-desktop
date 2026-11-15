import type { CSSProperties, ReactNode } from "react";
import type { PipelineDefinition, PipelineSnapshot, PipelineVersion } from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { ScrollArea } from "../../Scrollbar";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { PipelineGraph, PipelineGraphLegend } from "./PipelineGraph";
import {
    PipelineDetailSection,
    PipelineFacts,
    PipelineNodeDetail,
    PipelineTypeText,
} from "./PipelineNodeDetail";
import { pipelineNodeSummary, type PipelineLabels } from "./pipelinePresentation";

export interface HappyAgentPipelinePageProps {
    readonly pipeline: PipelineSnapshot;
    readonly labels: PipelineLabels;
    readonly onBack?: () => void;
    /** Shows one version's graph; null shows the latest. */
    readonly onVersionSelect: (number: number | null) => void;
    readonly onNodeSelect: (nodeId: string | null) => void;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

const CONCURRENCY_TEXT = {
    independent: "Every run starts at once, alongside any already running",
    supersede: "A new run aborts the one running and takes its place",
    queue: "Runs wait their turn, one at a time",
} as const;

/**
 * HappyAgentPipelinePage — one pipeline: the graph of the version on screen,
 * beside either that pipeline's overview and history or the node picked in
 * the graph. Picking an older version in the history draws its graph.
 */
export function HappyAgentPipelinePage(props: HappyAgentPipelinePageProps) {
    const snapshot = props.pipeline;
    const pipeline = snapshot.pipeline;
    const shown = snapshot.versionSelected ?? pipeline?.head.number ?? null;
    const load = shown === null ? undefined : snapshot.definitions.get(shown);
    const definition = load?.state === "loaded" ? load.definition : undefined;
    const node = definition?.nodes.find((entry) => entry.id === snapshot.nodeSelected);
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
            className={["happy-pipeline-page", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-pipeline"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-pipeline-page__header"
                {...(back ? { leading: back } : {})}
                {...(pipeline
                    ? {
                          subtitle: [
                              `Version ${String(pipeline.head.number)}`,
                              pipeline.enabled ? null : "Disabled",
                          ]
                              .filter(Boolean)
                              .join(" · "),
                      }
                    : {})}
                title={pipeline?.name ?? (snapshot.loading ? "Pipeline" : "Pipeline not found")}
            />
            {pipeline === null ? (
                <div className="happy-pipeline-page__empty">
                    <EmptyState
                        description={
                            snapshot.loading
                                ? "Reading this pipeline."
                                : snapshot.missing
                                  ? "This server has no such pipeline. It may have been archived."
                                  : (snapshot.error?.message ?? "This pipeline could not be read.")
                        }
                        icon={snapshot.loading ? "clock" : "pipeline"}
                        size="panel"
                        title={snapshot.loading ? "Loading pipeline…" : "Pipeline not found"}
                    />
                </div>
            ) : (
                <div className="happy-pipeline-page__body">
                    <div className="happy-pipeline-page__main">
                        <div className="happy-pipeline-page__bar">
                            <span className="happy-pipeline-page__version">
                                {shown === pipeline.head.number
                                    ? `Version ${String(shown)}, the latest`
                                    : `Version ${String(shown)} of ${String(pipeline.head.number)}`}
                            </span>
                            {shown !== pipeline.head.number ? (
                                <Button
                                    onClick={() => props.onVersionSelect(null)}
                                    size="small"
                                    variant="ghost"
                                >
                                    Show latest
                                </Button>
                            ) : null}
                            <span className="happy-pipeline-page__bar-end">
                                <PipelineGraphLegend />
                            </span>
                        </div>
                        {definition ? (
                            <PipelineGraph
                                aria-label={`${pipeline.name}, version ${String(shown)}`}
                                edges={definition.edges}
                                nodes={definition.nodes.map((entry) => ({
                                    id: entry.id,
                                    kind: entry.kind,
                                    detail: pipelineNodeSummary(entry, props.labels),
                                }))}
                                onNodeSelect={props.onNodeSelect}
                                root={definition.root}
                                selectedNodeId={node ? node.id : null}
                            />
                        ) : (
                            <div className="happy-pipeline-page__empty">
                                <EmptyState
                                    description={
                                        load?.state === "failed"
                                            ? load.error.message
                                            : "Reading this version's graph."
                                    }
                                    icon={load?.state === "failed" ? "alert" : "clock"}
                                    size="panel"
                                    title={
                                        load?.state === "failed"
                                            ? "Graph unavailable"
                                            : "Loading graph…"
                                    }
                                />
                            </div>
                        )}
                    </div>
                    <aside className="happy-pipeline-page__inspector">
                        {node && definition ? (
                            <PipelineNodeDetail
                                incoming={
                                    definition.edges.filter((edge) => edge.to === node.id).length
                                }
                                labels={props.labels}
                                node={node}
                                onClose={() => props.onNodeSelect(null)}
                            />
                        ) : (
                            <ScrollArea
                                className="happy-pipeline-page__inspector-scroll"
                                viewportClassName="happy-pipeline-page__inspector-viewport"
                            >
                                <div className="happy-pipeline-detail__body">
                                    {snapshot.error ? (
                                        <Banner
                                            tone="danger"
                                            title="This pipeline may be out of date"
                                        >
                                            {snapshot.error.message}
                                        </Banner>
                                    ) : null}
                                    {pipeline.description ? (
                                        <p className="happy-pipeline-detail__prose">
                                            {pipeline.description}
                                        </p>
                                    ) : null}
                                    {definition ? (
                                        <PipelineOverview definition={definition} />
                                    ) : null}
                                    <PipelineDetailSection title="Versions">
                                        <PipelineVersions
                                            head={pipeline.head.number}
                                            labels={props.labels}
                                            onVersionSelect={props.onVersionSelect}
                                            shown={shown}
                                            versions={snapshot.versions}
                                        />
                                    </PipelineDetailSection>
                                </div>
                            </ScrollArea>
                        )}
                    </aside>
                </div>
            )}
        </div>
    );
}

function PipelineOverview(props: { readonly definition: PipelineDefinition }): ReactNode {
    const definition = props.definition;
    const concurrency = definition.concurrency;
    return (
        <>
            <PipelineDetailSection title="Input">
                <PipelineTypeText fallback="" schema={definition.input} />
            </PipelineDetailSection>
            <PipelineDetailSection title="Runs">
                <PipelineFacts
                    empty=""
                    facts={[
                        ["Started by", definition.triggerAgents.join(", ") || "Nobody yet"],
                        ["Concurrency", CONCURRENCY_TEXT[concurrency.mode]],
                        ["Grouped by", concurrency.group ?? ""],
                        [
                            "Batches",
                            concurrency.batch ? "Waiting runs are merged into the next one" : "",
                        ],
                    ]}
                />
            </PipelineDetailSection>
        </>
    );
}

function PipelineVersions(props: {
    readonly versions: readonly PipelineVersion[];
    readonly head: number;
    readonly shown: number | null;
    readonly labels: PipelineLabels;
    readonly onVersionSelect: (number: number | null) => void;
}) {
    if (props.versions.length === 0)
        return <p className="happy-pipeline-detail__note">Reading the history…</p>;
    return (
        <div className="happy-pipeline-versions" role="list">
            {props.versions.map((version) => (
                <div className="happy-pipeline-versions__item" key={version.number} role="listitem">
                    <button
                        aria-current={version.number === props.shown ? "true" : undefined}
                        className="happy-pipeline-version"
                        data-happy-desktop-ui="pipeline-version"
                        onClick={() =>
                            props.onVersionSelect(
                                version.number === props.head ? null : version.number,
                            )
                        }
                        type="button"
                    >
                        <span className="happy-pipeline-version__head">
                            <span className="happy-pipeline-version__number">
                                Version {String(version.number)}
                            </span>
                            {version.number === props.head ? (
                                <span className="happy-pipeline-version__tag">Latest</span>
                            ) : null}
                        </span>
                        <span className="happy-pipeline-version__message">
                            {version.message || "No message"}
                        </span>
                        <span className="happy-pipeline-version__meta">
                            {props.labels.author(version.author)} ·{" "}
                            {props.labels.time(version.createdAt)}
                        </span>
                    </button>
                </div>
            ))}
        </div>
    );
}
