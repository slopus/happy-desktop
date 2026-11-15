import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import { pipelineFollowCreate } from "./pipelineFollow.js";
import {
    pipelineDefinitionLoad,
    pipelineDefinitionRead,
    pipelineRunRead,
    pipelineVersionDefinitionRead,
} from "./pipelineRead.js";
import {
    pipelineRunAbortable,
    pipelineRunEnded,
    pipelineRunRelativeIds,
    pipelineRunRelativeOf,
    pipelineRunRelativeSame,
    type PipelineDefinitionLoad,
    type PipelineRun,
    type PipelineRunRelative,
} from "./pipelineTypes.js";

/** The reader's abort, from the press until the server answers. */
export type PipelineRunAbort =
    | { readonly state: "idle" }
    | { readonly state: "sending" }
    | { readonly state: "failed"; readonly error: UserError };

export interface PipelineRunSnapshot {
    /** True until the first answer. */
    readonly loading: boolean;
    /** Null until read, and for a run the server does not have. */
    readonly run: PipelineRun | null;
    readonly missing: boolean;
    /** The graph of the version the run pinned; null until the run is read. */
    readonly definition: PipelineDefinitionLoad | null;
    /**
     * Its parent and child runs by ID, as far as they have been read; one the
     * server would not give yet is absent.
     */
    readonly relatives: ReadonlyMap<string, PipelineRunRelative>;
    /** The node whose execution is open. */
    readonly nodeSelected: string | null;
    readonly abort: PipelineRunAbort;
    /** Why the last read failed; what is shown is the last one read. */
    readonly error?: UserError;
}

/**
 * One run, live: read once on screen and again on every `pipeline.run.updated`
 * and `pipeline.node.updated`, so node states, status lines and progress move
 * as the server records them. The graph of the version it pinned is read once.
 * Its parent and children are read beside it on the same hints, each until it
 * ends.
 */
export interface PipelineRunStore {
    get(): PipelineRunSnapshot;
    subscribe(listener: () => void): () => void;
    nodeSelect(nodeId: string | null): void;
    /**
     * Asks the server to abort the run, while it is queued or running. The run
     * shows aborted only once the server's own record says so.
     */
    runAbort(): void;
    [Symbol.dispose](): void;
}

export function pipelineRunStoreCreate(deps: {
    readonly runId: string;
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
}): PipelineRunStore {
    const store = createStore<PipelineRunSnapshot>()(() => ({
        loading: true,
        run: null,
        missing: false,
        definition: null,
        relatives: new Map(),
        nodeSelected: null,
        abort: { state: "idle" },
    }));
    const path = `v0/pipeline-runs/${encodeURIComponent(deps.runId)}`;
    let disposed = false;
    let listeners = 0;

    const definitionRead = (run: PipelineRun): void => {
        store.setState({ definition: { state: "loading" } });
        void deps
            .request(
                "GET",
                `v0/pipelines/${encodeURIComponent(run.pipelineId)}/versions/${String(run.version)}`,
            )
            .then(
                (answer) => {
                    if (!disposed)
                        store.setState({
                            definition: pipelineDefinitionLoad(
                                pipelineVersionDefinitionRead(answer),
                            ),
                        });
                },
                (error: unknown) => {
                    if (!disposed)
                        store.setState({
                            definition: { state: "failed", error: happyAgentUserError(error) },
                        });
                },
            );
    };

    // Versions never change, so each one's node count is read once.
    const nodeTotals = new Map<string, number>();
    const nodeTotalRead = async (run: PipelineRun): Promise<number | null> => {
        const path = `v0/pipelines/${encodeURIComponent(run.pipelineId)}/versions/${String(run.version)}`;
        const known = nodeTotals.get(path);
        if (known !== undefined) return known;
        const definition = pipelineDefinitionRead(
            pipelineVersionDefinitionRead(await deps.request("GET", path)),
        );
        if (!definition) return null;
        nodeTotals.set(path, definition.nodes.length);
        return definition.nodes.length;
    };

    const relativeRead = async (
        id: string,
        kept: PipelineRunRelative | undefined,
    ): Promise<PipelineRunRelative | undefined> => {
        // An ended run never changes again.
        if (kept && pipelineRunEnded(kept.state) && kept.nodesTotal !== null) return kept;
        try {
            const run = pipelineRunRead(
                await deps.request("GET", `v0/pipeline-runs/${encodeURIComponent(id)}`),
            );
            if (!run) return kept;
            const read = pipelineRunRelativeOf(run, await nodeTotalRead(run));
            return kept && pipelineRunRelativeSame(kept, read) ? kept : read;
        } catch {
            // A relative is beside the run, not the run: one that cannot be
            // read now keeps what was shown, and the next hint tries again.
            return kept;
        }
    };

    const relativesRead = async (run: PipelineRun): Promise<void> => {
        const known = store.getState().relatives;
        const ids = pipelineRunRelativeIds(run);
        const read = await Promise.all(ids.map((id) => relativeRead(id, known.get(id))));
        if (disposed) return;
        const relatives = new Map<string, PipelineRunRelative>();
        ids.forEach((id, index) => {
            const relative = read[index];
            if (relative) relatives.set(id, relative);
        });
        const same =
            relatives.size === known.size &&
            [...relatives].every(([id, relative]) => known.get(id) === relative);
        if (!same) store.setState({ relatives });
    };

    const follow = pipelineFollowCreate({
        sync: deps.sync,
        events: ["pipeline.run.updated", "pipeline.node.updated"],
        read: async () => {
            let answer: unknown;
            try {
                answer = await deps.request("GET", path);
            } catch (error) {
                if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                    if (!disposed) store.setState({ loading: false, missing: true, run: null });
                    return;
                }
                throw error;
            }
            if (disposed) return;
            const read = pipelineRunRead(answer);
            if (!read) throw new UserError("Happy Cloud answered with a run this app cannot read.");
            const current = store.getState();
            const { error: _cleared, ...rest } = current;
            const run: PipelineRun =
                current.run === null
                    ? read
                    : // Unchanged nodes keep their objects, so one node's update redraws one card.
                      { ...read, nodes: referencesPreserve(current.run.nodes, read.nodes) };
            store.setState({ ...rest, loading: false, missing: false, run }, true);
            if (current.definition === null || current.definition.state === "failed")
                definitionRead(run);
            await relativesRead(run);
        },
        failed: (error) => {
            store.setState({ loading: false, error: happyAgentUserError(error) });
        },
    });

    return {
        get: () => store.getState(),
        subscribe(listener) {
            const unsubscribe = store.subscribe(listener);
            listeners += 1;
            if (listeners === 1 && !disposed) follow.start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners -= 1;
                if (listeners === 0) follow.stop();
            };
        },
        nodeSelect(nodeId) {
            if (disposed || store.getState().nodeSelected === nodeId) return;
            store.setState({ nodeSelected: nodeId });
        },
        runAbort() {
            const current = store.getState();
            if (
                disposed ||
                current.run === null ||
                !pipelineRunAbortable(current.run.state) ||
                current.abort.state === "sending"
            )
                return;
            store.setState({ abort: { state: "sending" } });
            // Abort is idempotent on the server, so a repeated press is harmless.
            void deps.request("POST", `${path}/abort`).then(
                () => {
                    if (disposed) return;
                    store.setState({ abort: { state: "idle" } });
                    follow.load();
                },
                (error: unknown) => {
                    if (!disposed)
                        store.setState({
                            abort: { state: "failed", error: happyAgentUserError(error) },
                        });
                },
            );
        },
        [Symbol.dispose]() {
            disposed = true;
            follow.stop();
        },
    };
}
