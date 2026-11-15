import type { ReactNode } from "react";
import type {
    PipelineCompute,
    PipelineNode,
    PipelinePermissions,
    PipelineSchema,
} from "happy-desktop-state";
import { Button } from "../../Button";
import { CodeBlock } from "../../CodeBlock";
import { Icon } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import {
    PIPELINE_KIND_ICON,
    PIPELINE_KIND_LABEL,
    pipelineDurationText,
    pipelineSchemaText,
    type PipelineLabels,
} from "./pipelinePresentation";

/** One labelled block of a detail panel. */
export function PipelineDetailSection(props: {
    readonly title: string;
    readonly children: ReactNode;
}) {
    return (
        <section className="happy-pipeline-detail__section">
            <h3 className="happy-pipeline-detail__title">{props.title}</h3>
            {props.children}
        </section>
    );
}

/** A type, set in code type. */
export function PipelineTypeText(props: {
    readonly schema: PipelineSchema | null;
    readonly fallback: string;
}) {
    if (props.schema === null)
        return <p className="happy-pipeline-detail__note">{props.fallback}</p>;
    return (
        <pre className="happy-pipeline-detail__code" data-happy-desktop-ui="pipeline-type">
            {pipelineSchemaText(props.schema)}
        </pre>
    );
}

/** Rows of `label: value`, leaving out empty ones. */
export function PipelineFacts(props: {
    readonly facts: readonly (readonly [label: string, value: string])[];
    readonly empty: string;
}) {
    const facts = props.facts.filter(([, value]) => value !== "");
    if (facts.length === 0) return <p className="happy-pipeline-detail__note">{props.empty}</p>;
    return (
        <dl className="happy-pipeline-detail__facts">
            {facts.map(([label, value]) => (
                <div className="happy-pipeline-detail__fact" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

function listText(values: readonly string[]): string {
    return values.join(", ");
}

/** A permission set as facts: what it grants, and nothing for what it doesn't. */
export function pipelinePermissionFacts(
    permissions: PipelinePermissions,
): (readonly [string, string])[] {
    const grants = (entries: PipelinePermissions["vaults"]) =>
        listText(entries.map((entry) => `${entry.id} (${entry.access})`));
    const compute = permissions.compute;
    return [
        ["Tools", listText(permissions.tools)],
        ["Vaults", grants(permissions.vaults)],
        ["Secrets", listText(permissions.secrets)],
        ["Repositories", grants(permissions.repositories)],
        ["Messages agents", listText(permissions.agents)],
        ["Runs pipelines", listText(permissions.pipelines)],
        ["Reaches hosts", listText(permissions.egressHosts)],
        ["Compute pools", listText(compute?.pools ?? [])],
        ["Computers", listText(compute?.computers ?? [])],
        [
            "At most",
            compute?.maxLeases == null
                ? ""
                : `${String(compute.maxLeases)} ${compute.maxLeases === 1 ? "computer" : "computers"} at once`,
        ],
    ];
}

function computeFacts(compute: PipelineCompute): (readonly [string, string])[] {
    return [
        [
            "Acquires",
            listText(
                compute.acquire.map((lease) =>
                    "pool" in lease
                        ? `${lease.name} from ${lease.pool}`
                        : `${lease.name} on ${lease.computer}`,
                ),
            ),
        ],
        ["Uses", listText(compute.use)],
        ["Hands on", listText(compute.pass)],
    ];
}

export interface PipelineNodeDetailProps {
    readonly node: PipelineNode;
    /** How many edges lead into it, which decides whether its join means anything. */
    readonly incoming: number;
    readonly labels: PipelineLabels;
    readonly onClose: () => void;
}

/**
 * PipelineNodeDetail — one node of a version, read-only: its types, what it may
 * reach, the computers it holds, and its source or instructions.
 */
export function PipelineNodeDetail(props: PipelineNodeDetailProps) {
    const node = props.node;
    return (
        <div className="happy-pipeline-detail" data-happy-desktop-ui="pipeline-node-detail">
            <header className="happy-pipeline-detail__header">
                <span className="happy-pipeline-detail__kind" data-kind={node.kind}>
                    <Icon name={PIPELINE_KIND_ICON[node.kind]} size={16} />
                </span>
                <span className="happy-pipeline-detail__heading">
                    <span className="happy-pipeline-detail__name">{node.id}</span>
                    <span className="happy-pipeline-detail__subtitle">
                        {PIPELINE_KIND_LABEL[node.kind]}
                    </span>
                </span>
                <Button
                    aria-label="Close"
                    icon="close"
                    iconOnly
                    onClick={props.onClose}
                    size="small"
                    title="Close"
                    variant="ghost"
                />
            </header>
            <ScrollArea
                className="happy-pipeline-page__inspector-scroll"
                viewportClassName="happy-pipeline-page__inspector-viewport"
            >
                <div className="happy-pipeline-detail__body">
                    {node.kind === "agent" ? (
                        <PipelineDetailSection title="Model">
                            <PipelineFacts
                                empty="The server's default model."
                                facts={[
                                    ["Model", node.model ?? ""],
                                    ["Effort", node.effort ?? ""],
                                ]}
                            />
                        </PipelineDetailSection>
                    ) : null}
                    {node.kind === "pipeline" ? (
                        <PipelineDetailSection title="Runs">
                            <p className="happy-pipeline-detail__note">
                                The latest version of {props.labels.pipeline(node.pipelineId)}, as a
                                child run.
                            </p>
                        </PipelineDetailSection>
                    ) : null}
                    <PipelineDetailSection title="Input">
                        <PipelineTypeText
                            fallback="Whatever the edge into it carries."
                            schema={node.input}
                        />
                    </PipelineDetailSection>
                    <PipelineDetailSection title="Output">
                        <PipelineTypeText fallback="Not declared." schema={node.output} />
                    </PipelineDetailSection>
                    <PipelineDetailSection title="Permissions">
                        {node.permissions === null ? (
                            <p className="happy-pipeline-detail__note">
                                None. It can use the computers it holds and nothing else.
                            </p>
                        ) : (
                            <PipelineFacts
                                empty="None. It can use the computers it holds and nothing else."
                                facts={pipelinePermissionFacts(node.permissions)}
                            />
                        )}
                    </PipelineDetailSection>
                    <PipelineDetailSection title="Compute">
                        {node.compute === null ? (
                            <p className="happy-pipeline-detail__note">No computer.</p>
                        ) : (
                            <PipelineFacts
                                empty="No computer."
                                facts={computeFacts(node.compute)}
                            />
                        )}
                    </PipelineDetailSection>
                    <PipelineDetailSection title="Limits">
                        <PipelineFacts
                            empty=""
                            facts={[
                                ["Times out after", pipelineDurationText(node.timeoutSeconds)],
                                [
                                    "Runs when",
                                    props.incoming > 1
                                        ? node.join === "all"
                                            ? "Every edge into it fired"
                                            : "Any edge into it fired"
                                        : "",
                                ],
                            ]}
                        />
                    </PipelineDetailSection>
                    {node.kind === "code" ? (
                        <PipelineDetailSection title="Source">
                            <div className="happy-pipeline-detail__source">
                                <CodeBlock lang="python" text={node.source} />
                            </div>
                        </PipelineDetailSection>
                    ) : null}
                    {node.kind === "agent" ? (
                        <PipelineDetailSection title="Instructions">
                            <p className="happy-pipeline-detail__prose">
                                {node.instructions || "No instructions."}
                            </p>
                        </PipelineDetailSection>
                    ) : null}
                </div>
            </ScrollArea>
        </div>
    );
}
