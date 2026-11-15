import { useSyncExternalStore } from "react";
import type {
    HappyAgentClockStore,
    PipelineAuthor,
    PipelineStore,
    PipelinesStore,
} from "happy-desktop-state";
import {
    HappyAgentPipelinePage,
    HappyAgentPipelinesPage,
    localAgoTime,
    type PipelineLabels,
} from "happy-desktop-ui";

function authorLabel(author: PipelineAuthor | null): string {
    if (author === null) return "Unknown author";
    return author.kind === "agent" ? "An agent" : "A person";
}

/**
 * One Happy Cloud server's pipelines: the list, or one pipeline when `pipeline`
 * is given. Both stay current on their own from the server's pipeline events.
 */
export function HappyAgentPipelinesSurface(props: {
    readonly pipelines: PipelinesStore;
    /** The pipeline the address opens, within those pipelines. */
    readonly pipeline?: PipelineStore;
    readonly clock: HappyAgentClockStore;
    onPipelineOpen(pipelineId: string): void;
    onPipelinesOpen(): void;
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
        // A child pipeline is named as the list names it, once the list has it.
        pipeline: (pipelineId) =>
            list.pipelines.find((entry) => entry.id === pipelineId)?.name ?? pipelineId,
    };
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
            onBack={props.onPipelinesOpen}
            store={props.pipeline}
        />
    );
}

function HappyAgentPipelineSurface(props: {
    readonly store: PipelineStore;
    readonly labels: PipelineLabels;
    onBack(): void;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentPipelinePage
            labels={props.labels}
            onBack={props.onBack}
            onNodeSelect={store.nodeSelect}
            onVersionSelect={store.versionSelect}
            pipeline={snapshot}
        />
    );
}
