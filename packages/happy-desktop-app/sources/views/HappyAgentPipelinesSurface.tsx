import { useSyncExternalStore } from "react";
import type {
    HappyAgentClockStore,
    PipelineAuthor,
    PipelineRunStore,
    PipelineStore,
    PipelinesStore,
} from "happy-desktop-state";
import {
    HappyAgentPipelinePage,
    HappyAgentPipelineRunPage,
    HappyAgentPipelinesPage,
    localAgoTime,
    type PipelineLabels,
} from "happy-desktop-ui";

function authorLabel(author: PipelineAuthor | null): string {
    if (author === null) return "Unknown author";
    return author.kind === "agent" ? "An agent" : "A person";
}

/**
 * One Happy Cloud server's pipelines: the list, one pipeline when `pipeline`
 * is given, or one run when `run` is. Each stays current on its own from the
 * server's pipeline events.
 */
export function HappyAgentPipelinesSurface(props: {
    readonly pipelines: PipelinesStore;
    /** The pipeline the address opens, within those pipelines. */
    readonly pipeline?: PipelineStore;
    /** The run the address opens. */
    readonly run?: PipelineRunStore;
    readonly clock: HappyAgentClockStore;
    onPipelineOpen(pipelineId: string): void;
    onPipelinesOpen(): void;
    onRunOpen(runId: string): void;
    onAgentOpen(agentId: string): void;
}) {
    const list = useSyncExternalStore(
        props.pipelines.subscribe,
        props.pipelines.get,
        props.pipelines.get,
    );
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const labels: PipelineLabels = {
        time: (at) => localAgoTime(at, now),
        author: authorLabel,
        // A pipeline is named as the list names it, once the list has it.
        pipeline: (pipelineId) =>
            list.pipelines.find((entry) => entry.id === pipelineId)?.name ?? pipelineId,
        agent: () => "An agent",
    };
    if (props.run !== undefined)
        return (
            <HappyAgentPipelineRunSurface
                labels={labels}
                now={now}
                onAgentOpen={props.onAgentOpen}
                onPipelineOpen={props.onPipelineOpen}
                onRunOpen={props.onRunOpen}
                store={props.run}
            />
        );
    if (props.pipeline === undefined)
        return (
            <HappyAgentPipelinesPage
                labels={labels}
                onPipelineOpen={props.onPipelineOpen}
                pipelines={list}
            />
        );
    return (
        <HappyAgentPipelineSurface
            labels={labels}
            now={now}
            onBack={props.onPipelinesOpen}
            onRunOpen={props.onRunOpen}
            store={props.pipeline}
        />
    );
}

function HappyAgentPipelineSurface(props: {
    readonly store: PipelineStore;
    readonly labels: PipelineLabels;
    readonly now: number;
    onBack(): void;
    onRunOpen(runId: string): void;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentPipelinePage
            labels={props.labels}
            now={props.now}
            onBack={props.onBack}
            onNodeSelect={store.nodeSelect}
            onPanelSelect={store.panelSelect}
            onRunOpen={props.onRunOpen}
            onRunsMore={store.runsMore}
            onVersionSelect={store.versionSelect}
            pipeline={snapshot}
        />
    );
}

function HappyAgentPipelineRunSurface(props: {
    readonly store: PipelineRunStore;
    readonly labels: PipelineLabels;
    readonly now: number;
    onAgentOpen(agentId: string): void;
    onPipelineOpen(pipelineId: string): void;
    onRunOpen(runId: string): void;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const pipelineId = snapshot.run?.pipelineId;
    return (
        <HappyAgentPipelineRunPage
            labels={props.labels}
            now={props.now}
            onAbort={store.runAbort}
            onAgentOpen={props.onAgentOpen}
            {...(pipelineId === undefined
                ? {}
                : { onBack: () => props.onPipelineOpen(pipelineId) })}
            onNodeSelect={store.nodeSelect}
            onPipelineOpen={props.onPipelineOpen}
            onRunOpen={props.onRunOpen}
            run={snapshot}
        />
    );
}
