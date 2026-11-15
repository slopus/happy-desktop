import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { entitiesSettle } from "../happyAgentConnection/projection.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import { pipelineFollowCreate } from "./pipelineFollow.js";
import {
    pipelineDefinitionLoad,
    pipelineDetailRead,
    pipelineRunsRead,
    pipelineVersionDefinitionRead,
    pipelineVersionsRead,
} from "./pipelineRead.js";
import type {
    PipelineDefinitionLoad,
    PipelineDetail,
    PipelineRunEntry,
    PipelineVersion,
} from "./pipelineTypes.js";

/** The pipeline's runs, newest first, as far as they have been paged in. */
export interface PipelineRuns {
    /** True until the first page answers. */
    readonly loading: boolean;
    readonly entries: readonly PipelineRunEntry[];
    /** Where the next older page starts; null when every run is in. */
    readonly nextCursor: string | null;
    readonly loadingMore: boolean;
    readonly error?: UserError;
}

export interface PipelineSnapshot {
    /** True until the first answer. */
    readonly loading: boolean;
    /** Null until read, and for a pipeline the server does not have. */
    readonly pipeline: PipelineDetail | null;
    /** The server answered that there is no such pipeline, or it was archived. */
    readonly missing: boolean;
    /** Newest first. */
    readonly versions: readonly PipelineVersion[];
    /** The version on screen; null follows the head as it moves. */
    readonly versionSelected: number | null;
    readonly definitions: ReadonlyMap<number, PipelineDefinitionLoad>;
    /** The node whose details are open, in whichever version is on screen. */
    readonly nodeSelected: string | null;
    readonly runs: PipelineRuns;
    /** Why the last read failed; what is shown is the last one read. */
    readonly error?: UserError;
}

/**
 * One pipeline's page: the pipeline, its version history, its runs, and the
 * graph of whichever version the reader picked. The pipeline and its history
 * are read again on every `pipeline.updated`; a version's definition is read
 * once, since versions are immutable. Its runs are read again on every
 * `pipeline.run.updated`, the newest page only, so older pages already read
 * stay as they were.
 */
export interface PipelineStore {
    get(): PipelineSnapshot;
    subscribe(listener: () => void): () => void;
    /** Shows one version's graph; null, or the head's number, follows the head. */
    versionSelect(number: number | null): void;
    /** Opens one node's details, or closes them with null. */
    nodeSelect(nodeId: string | null): void;
    /** Reads the next older page of runs. */
    runsMore(): void;
    [Symbol.dispose](): void;
}

/**
 * A fresh newest page in front of the older pages already read. Runs that
 * page holds replace their old copies; older ones keep their place.
 */
function runsMerge(
    previous: readonly PipelineRunEntry[],
    page: readonly PipelineRunEntry[],
    pageComplete: boolean,
): PipelineRunEntry[] {
    if (pageComplete) return [...page];
    const fresh = new Set(page.map((run) => run.id));
    const oldest = page.at(-1)?.createdAt ?? Number.POSITIVE_INFINITY;
    return [...page, ...previous.filter((run) => !fresh.has(run.id) && run.createdAt <= oldest)];
}

export function pipelineStoreCreate(deps: {
    readonly pipelineId: string;
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
}): PipelineStore {
    const store = createStore<PipelineSnapshot>()(() => ({
        loading: true,
        pipeline: null,
        missing: false,
        versions: [],
        versionSelected: null,
        definitions: new Map(),
        nodeSelected: null,
        runs: { loading: true, entries: [], nextCursor: null, loadingMore: false },
    }));
    const base = `v0/pipelines/${encodeURIComponent(deps.pipelineId)}`;
    let disposed = false;
    let listeners = 0;
    /** Whether the reader has paged past the first page, so a refresh keeps the rest. */
    let pagedPastFirst = false;

    const definitionSet = (number: number, load: PipelineDefinitionLoad): void => {
        const definitions = new Map(store.getState().definitions);
        definitions.set(number, load);
        store.setState({ definitions });
    };

    const runsSet = (change: Partial<PipelineRuns>): void => {
        store.setState({ runs: { ...store.getState().runs, ...change } });
    };

    const follow = pipelineFollowCreate({
        sync: deps.sync,
        events: ["pipeline.updated"],
        read: async () => {
            let detailAnswer: unknown;
            let versionsAnswer: unknown;
            try {
                [detailAnswer, versionsAnswer] = await Promise.all([
                    deps.request("GET", base),
                    deps.request("GET", `${base}/versions`),
                ]);
            } catch (error) {
                if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                    if (!disposed)
                        store.setState({ loading: false, missing: true, pipeline: null });
                    return;
                }
                throw error;
            }
            if (disposed) return;
            const detail = pipelineDetailRead(detailAnswer);
            if (!detail)
                throw new UserError("Happy Cloud answered with a pipeline this app cannot read.");
            const current = store.getState();
            const definitions = new Map(current.definitions);
            const head = detail.pipeline.head.number;
            if (definitions.get(head)?.state !== "loaded")
                definitions.set(head, pipelineDefinitionLoad(detail.definition));
            const { error: _cleared, ...rest } = current;
            store.setState(
                {
                    ...rest,
                    loading: false,
                    missing: false,
                    pipeline: detail.pipeline,
                    versions: referencesPreserve(
                        current.versions,
                        pipelineVersionsRead(versionsAnswer),
                    ),
                    // A head that moved onto the version on screen follows it from now on.
                    versionSelected:
                        current.versionSelected === head ? null : current.versionSelected,
                    definitions,
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
            const page = pipelineRunsRead(await deps.request("GET", `${base}/runs`));
            if (disposed) return;
            const current = store.getState().runs;
            const entries = runsMerge(current.entries, page.runs, !pagedPastFirst);
            const { error: _cleared, ...rest } = current;
            store.setState({
                runs: {
                    ...rest,
                    loading: false,
                    // Matched by id: a new run in front shifts every row down one.
                    entries: entitiesSettle(current.entries, entries),
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
        versionSelect(number) {
            if (disposed) return;
            const current = store.getState();
            const selected = number === current.pipeline?.head.number ? null : number;
            if (selected === current.versionSelected) return;
            store.setState({ versionSelected: selected });
            if (selected === null) return;
            const known = current.definitions.get(selected);
            if (known?.state === "loaded" || known?.state === "loading") return;
            definitionSet(selected, { state: "loading" });
            void deps.request("GET", `${base}/versions/${String(selected)}`).then(
                (answer) => {
                    if (!disposed)
                        definitionSet(
                            selected,
                            pipelineDefinitionLoad(pipelineVersionDefinitionRead(answer)),
                        );
                },
                (error: unknown) => {
                    if (!disposed)
                        definitionSet(selected, {
                            state: "failed",
                            error: happyAgentUserError(error),
                        });
                },
            );
        },
        nodeSelect(nodeId) {
            if (disposed || store.getState().nodeSelected === nodeId) return;
            store.setState({ nodeSelected: nodeId });
        },
        runsMore() {
            const runs = store.getState().runs;
            if (disposed || runs.loadingMore || runs.nextCursor === null) return;
            const cursor = runs.nextCursor;
            runsSet({ loadingMore: true });
            void deps.request("GET", `${base}/runs?cursor=${encodeURIComponent(cursor)}`).then(
                (answer) => {
                    if (disposed) return;
                    const page = pipelineRunsRead(answer);
                    const current = store.getState().runs;
                    const known = new Set(current.entries.map((run) => run.id));
                    pagedPastFirst = true;
                    const { error: _cleared, ...rest } = current;
                    store.setState({
                        runs: {
                            ...rest,
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
