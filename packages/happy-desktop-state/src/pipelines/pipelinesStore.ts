import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { entitiesSettle } from "../happyAgentConnection/projection.js";
import type { UserError } from "../types.js";
import { pipelineFollowCreate } from "./pipelineFollow.js";
import { pipelineRunListRead, pipelineSummariesRead } from "./pipelineRead.js";
import {
    pipelineRunsMerge,
    type PipelineRunListEntry,
    type PipelineSummary,
} from "./pipelineTypes.js";

/** Every pipeline's runs together, newest first, as far as they have been paged in. */
export interface PipelinesRuns {
    /** True until the first page answers. */
    readonly loading: boolean;
    /**
     * False on a server that does not list runs across pipelines; its
     * pipelines still show, and each one's page lists its own runs.
     */
    readonly listed: boolean;
    readonly entries: readonly PipelineRunListEntry[];
    /** Where the next older page starts; null when every run is in. */
    readonly nextCursor: string | null;
    readonly loadingMore: boolean;
    readonly error?: UserError;
}

export interface PipelinesSnapshot {
    /** True until the first answer, so "no pipelines" is never claimed early. */
    readonly loading: boolean;
    /** By name. */
    readonly pipelines: readonly PipelineSummary[];
    readonly runs: PipelinesRuns;
    /** Why the last read failed; the list shown is the last one read. */
    readonly error?: UserError;
}

/**
 * The team's pipelines on Happy Cloud, for the Pipelines list, and every run
 * of them beneath. The pipelines are read once on screen, then again on every
 * pipeline event, which is how a new version or a run's new state reaches the
 * row. The runs are read again on every `pipeline.run.updated`, the newest
 * page only, so older pages already read stay as they were.
 */
export interface PipelinesStore {
    get(): PipelinesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Reads the next older page of runs. */
    runsMore(): void;
    [Symbol.dispose](): void;
}

const RUNS = "v0/pipeline-runs";

export function pipelinesStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
}): PipelinesStore {
    const store = createStore<PipelinesSnapshot>()(() => ({
        loading: true,
        pipelines: [],
        runs: { loading: true, listed: true, entries: [], nextCursor: null, loadingMore: false },
    }));
    let disposed = false;
    let listeners = 0;
    let pagedPastFirst = false;

    const runsSet = (change: Partial<PipelinesRuns>): void => {
        store.setState({ runs: { ...store.getState().runs, ...change } });
    };

    const follow = pipelineFollowCreate({
        sync: deps.sync,
        events: ["pipeline.updated", "pipeline.run.updated"],
        read: async () => {
            const pipelines = pipelineSummariesRead(await deps.request("GET", "v0/pipelines")).sort(
                (left, right) => left.name.localeCompare(right.name),
            );
            if (disposed) return;
            const { error: _cleared, ...current } = store.getState();
            store.setState(
                {
                    ...current,
                    loading: false,
                    pipelines: entitiesSettle(current.pipelines, pipelines),
                },
                true,
            );
        },
        failed: (error) => {
            store.setState({ loading: false, error: happyAgentUserError(error) });
        },
    });

    const runsFollow = pipelineFollowCreate({
        sync: deps.sync,
        events: ["pipeline.run.updated"],
        read: async () => {
            // A server without the list says so once; it is asked again on the next visit.
            if (!store.getState().runs.listed) return;
            let answer: unknown;
            try {
                answer = await deps.request("GET", RUNS);
            } catch (error) {
                if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                    if (!disposed) runsSet({ loading: false, listed: false, entries: [] });
                    return;
                }
                throw error;
            }
            if (disposed) return;
            const page = pipelineRunListRead(answer);
            const { error: _cleared, ...current } = store.getState().runs;
            store.setState({
                runs: {
                    ...current,
                    loading: false,
                    // Matched by id: a new run in front shifts every row down one.
                    entries: entitiesSettle(
                        current.entries,
                        pipelineRunsMerge(current.entries, page.runs, !pagedPastFirst),
                    ),
                    // Paged past the first page, the cursor already points past what is kept.
                    nextCursor: pagedPastFirst ? current.nextCursor : page.nextCursor,
                },
            });
        },
        failed: (error) => {
            runsSet({ loading: false, error: happyAgentUserError(error) });
        },
    });

    return {
        get: () => store.getState(),
        subscribe(listener) {
            const unsubscribe = store.subscribe(listener);
            listeners += 1;
            if (listeners === 1 && !disposed) {
                if (!store.getState().runs.listed) runsSet({ listed: true, loading: true });
                follow.start();
                runsFollow.start();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners -= 1;
                if (listeners > 0) return;
                follow.stop();
                runsFollow.stop();
            };
        },
        runsMore() {
            const runs = store.getState().runs;
            if (disposed || runs.loadingMore || runs.nextCursor === null) return;
            const cursor = runs.nextCursor;
            runsSet({ loadingMore: true });
            void deps.request("GET", `${RUNS}?cursor=${encodeURIComponent(cursor)}`).then(
                (answer) => {
                    if (disposed) return;
                    const page = pipelineRunListRead(answer);
                    const { error: _cleared, ...current } = store.getState().runs;
                    const known = new Set(current.entries.map((run) => run.id));
                    pagedPastFirst = true;
                    store.setState({
                        runs: {
                            ...current,
                            loadingMore: false,
                            entries: [
                                ...current.entries,
                                ...page.runs.filter((run) => !known.has(run.id)),
                            ],
                            nextCursor: page.nextCursor,
                        },
                    });
                },
                (error: unknown) => {
                    if (!disposed)
                        runsSet({ loadingMore: false, error: happyAgentUserError(error) });
                },
            );
        },
        [Symbol.dispose]() {
            disposed = true;
            follow.stop();
            runsFollow.stop();
        },
    };
}
