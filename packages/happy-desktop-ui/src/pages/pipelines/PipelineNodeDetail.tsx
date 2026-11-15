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
import { MarkdownDocument } from "../../MarkdownDocument";
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

export interface PipelineNodeFactsProps {
    readonly node: PipelineNode;
    /** How many edges lead into it, which decides whether its join means anything. */
    readonly incoming: number;
    readonly labels: PipelineLabels;
}

/**
 * PipelineNodeFacts — one node of a version, read-only, for the side column:
 * its model, types, what it may reach, the computers it holds, and its limits.
 * Its source or instructions take the main column.
 */
export function PipelineNodeFacts(props: PipelineNodeFactsProps) {
    const node = props.node;
    return (
        <>
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
                    <PipelineFacts empty="No computer." facts={computeFacts(node.compute)} />
                )}
            </PipelineDetailSection>
            <PipelineDetailSection title="Limits">
                <PipelineFacts
                    empty="None."
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
        </>
    );
}

/** A node's heading over the main column: its glyph, ID, kind, and a way to close it. */
export function PipelineNodeHeading(props: {
    readonly id: string;
    readonly kind: PipelineNode["kind"];
    readonly children?: ReactNode;
    readonly onClose?: () => void;
}) {
    return (
        <header className="happy-pipeline-pane__header">
            <span className="happy-pipeline-pane__kind" data-kind={props.kind}>
                <Icon name={PIPELINE_KIND_ICON[props.kind]} size={14} />
            </span>
            <span className="happy-pipeline-pane__title">{props.id}</span>
            <span className="happy-pipeline-pane__subtitle">{PIPELINE_KIND_LABEL[props.kind]}</span>
            {props.children}
            {props.onClose ? (
                <span className="happy-pipeline-pane__end">
                    <Button
                        aria-label="Close"
                        icon="close"
                        iconOnly
                        onClick={props.onClose}
                        size="small"
                        title="Close"
                        variant="ghost"
                    />
                </span>
            ) : null}
        </header>
    );
}

/** What a node does, read-only, for the main column: its source, instructions, or child pipeline. */
export function PipelineNodeWork(props: {
    readonly node: PipelineNode;
    readonly labels: PipelineLabels;
}) {
    const node = props.node;
    return (
        <ScrollArea
            className="happy-pipeline-pane__scroll"
            viewportClassName="happy-pipeline-pane__viewport"
        >
            <div className="happy-pipeline-pane__prose">
                {node.kind === "code" ? (
                    // Code never wraps: a long line scrolls sideways inside the block.
                    <div className="happy-pipeline-pane__source">
                        <CodeBlock lang="python" lineNumbers text={node.source} />
                    </div>
                ) : node.kind === "agent" ? (
                    node.instructions ? (
                        <MarkdownDocument flow="inline" text={node.instructions} />
                    ) : (
                        <p className="happy-pipeline-detail__note">No instructions.</p>
                    )
                ) : (
                    <p className="happy-pipeline-detail__note">
                        Runs the latest version of {props.labels.pipeline(node.pipelineId)} as a
                        child run.
                    </p>
                )}
            </div>
        </ScrollArea>
    );
}
