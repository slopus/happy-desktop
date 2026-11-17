import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { pipelineFollowCreate } from "./pipelineFollow.js";
import { pipelineLogPageRead } from "./pipelineRead.js";
import type { PipelineLogEntry, PipelineLogPage } from "./pipelineTypes.js";

/** How many entries one request asks for. */
const PAGE_LIMIT = 500;
/** Pages read back to back in one read before yielding to the next hint. */
const PAGES_PER_READ = 10;

export interface PipelineNodeLogSnapshot {
    /** True until the first answer. */
    readonly loading: boolean;
    /** Every entry read so far, in `seq` order. */
    readonly entries: readonly PipelineLogEntry[];
    /** How many of the oldest entries the server let go before they were read. */
    readonly dropped: number;
    /**
     * The commands first read while still running. The reader watched them
     * work, so they stay open after they end rather than folding under them.
     */
    readonly watched: ReadonlySet<number>;
    /** Why the last read failed; what is shown is what was read before. */
    readonly error?: UserError;
}

/**
 * One node's log in one run, live: read once on screen, then only what came
 * after on every `pipeline.node.log` and every reconnect. Entries rewritten in
 * place, such as a command that finished, replace their earlier copy; every
 * other entry keeps its object. A log read to its end after its run ended is
 * final: it stops following, and opening it again reads nothing.
 */
export interface PipelineNodeLogStore {
    get(): PipelineNodeLogSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

function logMerge(
    entries: readonly PipelineLogEntry[],
    watched: ReadonlySet<number>,
    page: PipelineLogPage,
): { entries: readonly PipelineLogEntry[]; watched: ReadonlySet<number> } {
    if (page.entries.length === 0 && page.changed.length === 0) return { entries, watched };
    const next = [...entries];
    const index = new Map(entries.map((entry, position) => [entry.seq, position]));
    for (const entry of page.changed) {
        const position = index.get(entry.seq);
        if (position !== undefined) next[position] = entry;
    }
    let watchedNext = watched;
    const last = next.at(-1)?.seq ?? 0;
    for (const entry of page.entries) {
        const position = index.get(entry.seq);
        if (position !== undefined) next[position] = entry;
        else if (entry.seq > last) next.push(entry);
        if (entry.kind === "command" && entry.state === "running" && !watched.has(entry.seq)) {
            if (watchedNext === watched) watchedNext = new Set(watched);
            (watchedNext as Set<number>).add(entry.seq);
        }
    }
    return { entries: next, watched: watchedNext };
}

export function pipelineNodeLogStoreCreate(deps: {
    readonly runId: string;
    readonly nodeId: string;
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
    /** Whether the run has ended, as far as this window has read it. */
    readonly runEnded?: () => boolean;
}): PipelineNodeLogStore {
    const store = createStore<PipelineNodeLogSnapshot>()(() => ({
        loading: true,
        entries: [],
        dropped: 0,
        watched: new Set(),
    }));
    const path = `v0/pipeline-runs/${encodeURIComponent(deps.runId)}/nodes/${encodeURIComponent(deps.nodeId)}/log`;
    let after = 0;
    let disposed = false;
    let listeners = 0;
    /** Read to its end after the run ended, so nothing more is written to it. */
    let complete = false;

    const follow = pipelineFollowCreate({
        sync: deps.sync,
        events: ["pipeline.node.log"],
        read: async () => {
            // Asked before the read, so a run that ends during it is read once more.
            const ended = deps.runEnded?.() ?? false;
            for (let pages = 0; pages < PAGES_PER_READ; pages++) {
                let answer: unknown;
                try {
                    answer = await deps.request(
                        "GET",
                        `${path}?after=${String(after)}&limit=${String(PAGE_LIMIT)}`,
                    );
                } catch (error) {
                    // A node that has not started has no log yet.
                    if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                        if (!disposed && store.getState().loading)
                            store.setState({ loading: false });
                        // One that never ran in a run that ended never will.
                        if (ended) {
                            complete = true;
                            follow.stop();
                        }
                        return;
                    }
                    throw error;
                }
                if (disposed) return;
                const page = pipelineLogPageRead(answer, after);
                after = page.nextAfter;
                const current = store.getState();
                const merged = logMerge(current.entries, current.watched, page);
                if (
                    merged.entries !== current.entries ||
                    page.dropped !== current.dropped ||
                    current.loading ||
                    current.error !== undefined
                ) {
                    const { error: _cleared, ...rest } = current;
                    store.setState(
                        { ...rest, loading: false, dropped: page.dropped, ...merged },
                        true,
                    );
                }
                if (page.entries.length < PAGE_LIMIT) {
                    if (ended) {
                        complete = true;
                        follow.stop();
                    }
                    return;
                }
            }
            // A long backlog: the rest is read after other hints get a turn.
            follow.load();
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
            if (listeners === 1 && !disposed && !complete) follow.start();
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
