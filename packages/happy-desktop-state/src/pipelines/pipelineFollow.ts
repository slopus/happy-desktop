import type {
    HappyAgentSync,
    HappyCloudEventType,
} from "../happyAgentConnection/happyAgentSync.js";

/** The cluster's pipeline events. Each is a hint to read again; none carries state. */
export const PIPELINE_EVENTS = [
    "pipeline.updated",
    "pipeline.run.updated",
    "pipeline.node.updated",
    "pipeline.node.log",
] as const satisfies readonly HappyCloudEventType[];

export interface PipelineFollow {
    /** Starts following the events and reads once. */
    start(): void;
    /** Stops following; reads already sent land, but no new one starts. */
    stop(): void;
    /** Reads now, or once more after the read in flight. */
    load(): void;
}

/**
 * Keeps one surface current while it is on screen: reads once, then again on
 * every pipeline event and every reconnect. Hints that arrive during a read
 * fold into one more read after it, so a burst of node updates costs two
 * reads, not one per event.
 */
export function pipelineFollowCreate(deps: {
    readonly sync: HappyAgentSync | undefined;
    readonly events: readonly (typeof PIPELINE_EVENTS)[number][];
    readonly read: () => Promise<void>;
    readonly failed: (error: unknown) => void;
}): PipelineFollow {
    let active = false;
    let reading = false;
    let readAgain = false;
    let follow: AbortController | undefined;

    const load = (): void => {
        if (!active) return;
        if (reading) {
            readAgain = true;
            return;
        }
        reading = true;
        readAgain = false;
        void deps
            .read()
            .catch((error: unknown) => {
                if (active) deps.failed(error);
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
            });
    };

    return {
        start() {
            if (active) return;
            active = true;
            const sync = deps.sync;
            if (sync) {
                const controller = new AbortController();
                follow = controller;
                void (async () => {
                    let greeted = false;
                    for await (const input of sync.follow({
                        signal: controller.signal,
                        events: deps.events,
                    })) {
                        const greeting = !greeted;
                        greeted = true;
                        // The first read below was sent after this subscription was installed.
                        if (input.kind === "error" || (greeting && input.kind !== "update"))
                            continue;
                        // An event, or a reconnect that may have missed some.
                        if (
                            input.kind === "update" &&
                            input.update.kind !== "event" &&
                            input.update.kind !== "connected" &&
                            input.update.kind !== "state_lost"
                        )
                            continue;
                        load();
                    }
                })().catch(() => undefined);
            }
            load();
        },
        stop() {
            active = false;
            follow?.abort();
            follow = undefined;
        },
        load,
    };
}
