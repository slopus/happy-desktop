import { useSyncExternalStore } from "react";
import type {
    HappyAgentClockStore,
    HappyAgentTeamRoster,
    HappyAgentWorkspaceStore,
    PipelineAuthor,
    PipelineNodeLogStore,
    PipelineRunStore,
    PipelineStore,
    PipelinesStore,
} from "happy-desktop-state";
import { pipelineRunNodeShown } from "happy-desktop-state";
import {
    HappyAgentPipelinePage,
    HappyAgentPipelineRunPage,
    HappyAgentPipelinesPage,
    localAgoTime,
    type PipelineLabels,
} from "happy-desktop-ui";
import { messageReferenceEntities } from "../messageReferences";

/** A member by the name the team knows them by, the reader as "You". */
function personName(team: HappyAgentTeamRoster | undefined, userId: string): string | undefined {
    if (userId === team?.viewerId) return "You";
    return team?.members.find((member) => member.id === userId)?.name;
}

/**
 * One Happy Cloud server's pipelines: the list with every run beneath, one pipeline when `pipeline`
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
    /** Names the people versions credit; without it they are "A person". */
    readonly team?: HappyAgentTeamRoster;
    /** Names the agents this window knows; others are "An agent". */
    readonly workspace: HappyAgentWorkspaceStore;
    onPipelineOpen(pipelineId: string): void;
    onPipelinesOpen(): void;
    onRunOpen(runId: string): void;
    /** The pointer rests on a run's row; reads the run ahead of its open. */
    onRunIntent?(runId: string): void;
    /** One node's log in one run; absent where the server keeps none. */
    readonly nodeLog?: (runId: string, nodeId: string) => PipelineNodeLogStore | undefined;
}) {
    const list = useSyncExternalStore(
        props.pipelines.subscribe,
        props.pipelines.get,
        props.pipelines.get,
    );
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const workspace = useSyncExternalStore(
        props.workspace.subscribe,
        props.workspace.get,
        props.workspace.get,
    );
    const agents = messageReferenceEntities(workspace.list).agents;
    const agentName = (agentId: string): string | undefined => agents.get(agentId)?.label;
    const authorLabel = (author: PipelineAuthor | null): string => {
        if (author === null) return "Unknown author";
        if (author.kind === "user") return personName(props.team, author.userId) ?? "A person";
        const agent = agentName(author.agentId);
        if (agent !== undefined) return agent;
        // An agent this window doesn't list is still credited to the member it acted for.
        const person = author.userId === null ? undefined : personName(props.team, author.userId);
        if (person === "You") return "Your agent";
        return person === undefined ? "An agent" : `${person}'s agent`;
    };
    const labels: PipelineLabels = {
        time: (at) => localAgoTime(at, now),
        author: authorLabel,
        // A pipeline is named as the list names it, once the list has it.
        pipeline: (pipelineId) =>
            list.pipelines.find((entry) => entry.id === pipelineId)?.name ?? pipelineId,
        agent: (agentId) => agentName(agentId) ?? "An agent",
    };
    if (props.run !== undefined)
        return (
            <HappyAgentPipelineRunSurface
                labels={labels}
                now={now}
                {...(props.nodeLog ? { nodeLog: props.nodeLog } : {})}
                onPipelineOpen={props.onPipelineOpen}
                onRunOpen={props.onRunOpen}
                store={props.run}
            />
        );
    if (props.pipeline === undefined)
        return (
            <HappyAgentPipelinesPage
                labels={labels}
                now={now}
                onPipelineOpen={props.onPipelineOpen}
                onRunOpen={props.onRunOpen}
                {...(props.onRunIntent ? { onRunIntent: props.onRunIntent } : {})}
                onRunsMore={props.pipelines.runsMore}
                pipelines={list}
            />
        );
    return (
        <HappyAgentPipelineSurface
            labels={labels}
            now={now}
            onBack={props.onPipelinesOpen}
            onRunOpen={props.onRunOpen}
            {...(props.onRunIntent ? { onRunIntent: props.onRunIntent } : {})}
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
    onRunIntent?(runId: string): void;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentPipelinePage
            labels={props.labels}
            now={props.now}
            onBack={props.onBack}
            onNodeSelect={store.nodeSelect}
            onRunOpen={props.onRunOpen}
            {...(props.onRunIntent ? { onRunIntent: props.onRunIntent } : {})}
            onRunsMore={store.runsMore}
            onVersionSelect={store.versionSelect}
            pipeline={snapshot}
        />
    );
}

const LOG_NONE = {
    subscribe: () => () => undefined,
    get: () => undefined,
} as const;

function HappyAgentPipelineRunSurface(props: {
    readonly store: PipelineRunStore;
    readonly labels: PipelineLabels;
    readonly now: number;
    readonly nodeLog?: (runId: string, nodeId: string) => PipelineNodeLogStore | undefined;
    onPipelineOpen(pipelineId: string): void;
    onRunOpen(runId: string): void;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const pipelineId = snapshot.run?.pipelineId;
    const logNodeId =
        snapshot.run === null ? null : pipelineRunNodeShown(snapshot.run, snapshot.nodeSelected);
    // The shown node's log, which changes store as the shown node changes.
    const logStore =
        snapshot.run === null || logNodeId === null
            ? undefined
            : props.nodeLog?.(snapshot.run.id, logNodeId);
    const logSource = logStore ?? LOG_NONE;
    const log = useSyncExternalStore(logSource.subscribe, logSource.get, logSource.get);
    return (
        <HappyAgentPipelineRunPage
            labels={props.labels}
            {...(log !== undefined && logNodeId !== null
                ? { log: { nodeId: logNodeId, snapshot: log } }
                : {})}
            now={props.now}
            onAbort={store.runAbort}
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
