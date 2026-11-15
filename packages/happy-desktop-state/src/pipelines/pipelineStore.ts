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
    pipelineDefinitionRead,
    pipelineDetailRead,
    pipelineVersionDefinitionRead,
    pipelineVersionsRead,
} from "./pipelineRead.js";
import type { PipelineDefinition, PipelineDetail, PipelineVersion } from "./pipelineTypes.js";

/** One version's definition, as far as it has been read. Versions never change, so a read one is kept. */
export type PipelineDefinitionLoad =
    | { readonly state: "loading" }
    | { readonly state: "loaded"; readonly definition: PipelineDefinition }
    | { readonly state: "failed"; readonly error: UserError };

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
    /** Why the last read failed; what is shown is the last one read. */
    readonly error?: UserError;
}

/**
 * One pipeline's page: the pipeline, its version history, and the graph of
 * whichever version the reader picked. The pipeline and its history are read
 * again on every `pipeline.updated`; a version's definition is read once,
 * since versions are immutable.
 */
export interface PipelineStore {
    get(): PipelineSnapshot;
    subscribe(listener: () => void): () => void;
    /** Shows one version's graph; null, or the head's number, follows the head. */
    versionSelect(number: number | null): void;
    /** Opens one node's details, or closes them with null. */
    nodeSelect(nodeId: string | null): void;
    [Symbol.dispose](): void;
}

const UNREADABLE = new UserError("This version is written in a form this app cannot read yet.");

function loadOf(definition: unknown): PipelineDefinitionLoad {
    const read = pipelineDefinitionRead(definition);
    return read ? { state: "loaded", definition: read } : { state: "failed", error: UNREADABLE };
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
    }));
    const base = `v0/pipelines/${encodeURIComponent(deps.pipelineId)}`;
    let disposed = false;
    let listeners = 0;

    const definitionSet = (number: number, load: PipelineDefinitionLoad): void => {
        const definitions = new Map(store.getState().definitions);
        definitions.set(number, load);
        store.setState({ definitions });
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
                definitions.set(head, loadOf(detail.definition));
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
                        definitionSet(selected, loadOf(pipelineVersionDefinitionRead(answer)));
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
        [Symbol.dispose]() {
            disposed = true;
            follow.stop();
        },
    };
}
