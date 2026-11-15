import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { HappyCloudRequest } from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { pipelineFollowCreate } from "./pipelineFollow.js";
import { pipelineSummariesRead } from "./pipelineRead.js";
import type { PipelineSummary } from "./pipelineTypes.js";

export interface PipelinesSnapshot {
    /** True until the first answer, so "no pipelines" is never claimed early. */
    readonly loading: boolean;
    /** By name. */
    readonly pipelines: readonly PipelineSummary[];
    /** Why the last read failed; the list shown is the last one read. */
    readonly error?: UserError;
}

/**
 * The team's pipelines on Happy Cloud, for the Pipelines list. Read once on
 * screen, then again on every pipeline event, which is how a new version or a
 * run's new state reaches the row.
 */
export interface PipelinesStore {
    get(): PipelinesSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

export function pipelinesStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
}): PipelinesStore {
    const store = createStore<PipelinesSnapshot>()(() => ({ loading: true, pipelines: [] }));
    let disposed = false;
    let listeners = 0;
    const follow = pipelineFollowCreate({
        sync: deps.sync,
        events: ["pipeline.updated", "pipeline.run.updated"],
        read: async () => {
            const pipelines = pipelineSummariesRead(await deps.request("GET", "v0/pipelines")).sort(
                (left, right) => left.name.localeCompare(right.name),
            );
            if (disposed) return;
            const current = store.getState();
            store.setState(
                {
                    loading: false,
                    pipelines: referencesPreserve(current.pipelines, pipelines),
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
        [Symbol.dispose]() {
            disposed = true;
            follow.stop();
        },
    };
}
