import type {
    HappyAgentSync,
    HappyCloudEventType,
} from "../happyAgentConnection/happyAgentSync.js";
import { handbookEventRead } from "./handbookRead.js";
import type { HandbookEvent } from "./handbookTypes.js";

/** The cluster's handbook events. Each is a hint to read again; none carries state. */
export const HANDBOOK_EVENTS = [
    "handbook.updated",
    "handbook.document.updated",
    "handbook.change_request.updated",
] as const satisfies readonly HappyCloudEventType[];

export interface HandbookFollow {
    /** Starts following the events and reads once. */
    start(): void;
    /** Stops following; reads already sent land, but no new one starts. */
    stop(): void;
    /** Reads now, or once more after the read in flight. */
    load(): void;
}

/**
 * Keeps one handbook surface current while it is on screen: reads once, then
 * again on every event it cares about and every reconnect. Hints that arrive
 * during a read fold into one more read after it, so a burst of edits costs
 * two reads, not one per event.
 */
export function handbookFollowCreate(deps: {
    readonly sync: HappyAgentSync | undefined;
    readonly events: readonly (typeof HANDBOOK_EVENTS)[number][];
    /** Whether an event concerns this surface; every one does when absent. */
    readonly concerns?: (event: HandbookEvent) => boolean;
    readonly read: () => Promise<void>;
    readonly failed: (error: unknown) => void;
}): HandbookFollow {
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
                        // A bootstrap or reconcile after the first may have missed some.
                        const update = input.kind === "update" ? input.update : undefined;
                        if (update?.kind === "event") {
                            // Cloud events travel as the daemon's event envelope, typed by name.
                            const event = handbookEventRead(
                                update.event as {
                                    readonly type: string;
                                    readonly payload?: unknown;
                                },
                            );
                            if (event === undefined || (deps.concerns && !deps.concerns(event)))
                                continue;
                        } else if (
                            update !== undefined &&
                            update.kind !== "connected" &&
                            update.kind !== "state_lost"
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
