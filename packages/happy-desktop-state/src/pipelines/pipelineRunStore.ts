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
 * One run, live: read on every `pipeline.run.updated` and
 * `pipeline.node.updated`, so node states, status lines and progress move as
 * the server records them. The graph of the version it pinned is read once.
 * Its parent and children are read beside it on the same hints, each until it
 * ends.
 *
 * A run still queued or running keeps following while it is kept, on screen
 * or not, and a reconnect reads it again. Opening it shows what was read and
 * reads it again behind that. A run that has ended, with every relative it
 * shows ended too, never changes again: it stops following, and opening it
 * reads nothing.
 */
export interface PipelineRunStore {
    get(): PipelineRunSnapshot;
    subscribe(listener: () => void): () => void;
    /** Whether a reader is subscribed, which keeps the run from being let go. */
    subscribed(): boolean;
    /**
     * Reads the run ahead of an open, if it has not been read; settles once
     * the first read answers or fails. Never rejects.
     */
    preload(): Promise<void>;
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
    let following = false;
    /** Preloads still waiting for their first answer, settled if the store goes first. */
    const disposeWaiters = new Set<() => void>();

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
                    if (disposed) return;
                    store.setState({ loading: false, missing: true, run: null });
                    // A run that is not there is not live: off screen it stops following.
                    followSettle();
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
            followSettle();
        },
        failed: (error) => {
            store.setState({ loading: false, error: happyAgentUserError(error) });
            followSettle();
        },
    });

    /** Starts following, or reads again behind what is shown when it already follows. */
    const followStart = (): void => {
        if (following) {
            follow.load();
            return;
        }
        following = true;
        follow.start();
    };
    const followStop = (): void => {
        following = false;
        follow.stop();
    };
    /**
     * After every read: an ended run stops following, and so, off screen, does
     * one that is not running, so only live runs are kept current.
     */
    const followSettle = (): void => {
        const current = store.getState();
        if (pipelineRunSettled(current)) followStop();
        else if (listeners === 0 && !pipelineRunLive(current)) followStop();
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            const unsubscribe = store.subscribe(listener);
            listeners += 1;
            if (listeners === 1 && !disposed) {
                const current = store.getState();
                if (!pipelineRunSettled(current)) followStart();
                else if (current.run !== null && current.definition?.state === "failed")
                    definitionRead(current.run);
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners -= 1;
                // A read in flight decides when it lands; a live run keeps following.
                const current = store.getState();
                if (listeners === 0 && !current.loading && !pipelineRunLive(current)) followStop();
            };
        },
        subscribed: () => listeners > 0,
        preload() {
            if (disposed || !store.getState().loading) return Promise.resolve();
            if (!following) followStart();
            return new Promise((resolve) => {
                const unsubscribe = store.subscribe((current) => {
                    if (current.loading && !disposed) return;
                    unsubscribe();
                    disposeWaiters.delete(settle);
                    resolve();
                });
                const settle = (): void => {
                    unsubscribe();
                    resolve();
                };
                disposeWaiters.add(settle);
            });
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
            followStop();
            for (const settle of disposeWaiters) settle();
            disposeWaiters.clear();
        },
    };
}

/** Queued or running: the server will change it. */
function pipelineRunLive(snapshot: PipelineRunSnapshot): boolean {
    return snapshot.run !== null && !pipelineRunEnded(snapshot.run.state);
}

/** Ended, and every relative it shows read and ended too: nothing on its page changes again. */
function pipelineRunSettled(snapshot: PipelineRunSnapshot): boolean {
    const run = snapshot.run;
    if (run === null || snapshot.error !== undefined || !pipelineRunEnded(run.state)) return false;
    return pipelineRunRelativeIds(run).every((id) => {
        const relative = snapshot.relatives.get(id);
        return relative !== undefined && pipelineRunEnded(relative.state);
    });
}
