import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import {
    HAPPY_AGENT_ARTIFACT_EVENT_TYPES,
    happyAgentArtifactEventProject,
} from "./artifactCatalog.js";
import { happyAgentArtifactTypeProject } from "./artifactProject.js";
import type { HappyAgentArtifactId, HappyAgentArtifactType } from "./artifactTypes.js";

/** What one artifact a message names reads as, once it has been read. */
export type HappyAgentArtifactTitle =
    | {
          readonly type: "ready";
          readonly title: string;
          /** What kind of artifact it is, which it stays for its whole life. */
          readonly artifactType: HappyAgentArtifactType;
          readonly status: "active" | "deleted";
      }
    /** No artifact has this id on this Happy Agent, or this reader cannot see it. */
    | { readonly type: "missing" };

/**
 * Every artifact asked for and read so far, by id; an absent one is still
 * being read. A reference always reads as the artifact's current title, even
 * when it pins an older version, so versions are never read here.
 */
export type HappyAgentArtifactTitlesSnapshot = ReadonlyMap<
    HappyAgentArtifactId,
    HappyAgentArtifactTitle
>;

/**
 * The live titles of the artifacts conversations name.
 *
 * An agent names an artifact in its reply by id alone, and the transcript shows
 * that artifact's current title in its place. The catalog cannot answer that:
 * it holds one filtered page, and the artifact named may be anywhere in it or
 * deleted. So this reads each named artifact by id, once, and keeps the answer
 * current from the `artifact.*` events while anything is subscribed.
 *
 * `request` only records what is wanted and starts reads; it never publishes
 * in its own call, so a surface may ask while it renders. Reads run only while
 * the store has a subscriber, and a reconnect re-reads every artifact held.
 */
export interface HappyAgentArtifactTitlesStore {
    get(): HappyAgentArtifactTitlesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: the artifacts the visible transcript names. */
    request(artifactIds: readonly HappyAgentArtifactId[]): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentArtifactTitlesDeps {
    readonly client: Pick<HappyAgentClient, "getArtifact">;
    readonly sync: HappyAgentSync;
}

function notFound(error: unknown): boolean {
    return (
        error instanceof HappyAgentApiError &&
        (error.status === 404 || error.status === 403 || error.status === 400)
    );
}

const EMPTY: HappyAgentArtifactTitlesSnapshot = new Map();

export function happyAgentArtifactTitlesStoreCreate(
    deps: HappyAgentArtifactTitlesDeps,
): HappyAgentArtifactTitlesStore {
    const listeners = new Set<() => void>();
    let snapshot = EMPTY;
    /** Everything asked for, read or not. */
    const wanted = new Set<HappyAgentArtifactId>();
    /** Reads in flight under the current follow, so one is never started twice. */
    const reading = new Set<HappyAgentArtifactId>();
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const publish = (next: HappyAgentArtifactTitlesSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const artifactSet = (artifactId: HappyAgentArtifactId, title: HappyAgentArtifactTitle) => {
        const held = snapshot.get(artifactId);
        if (
            held !== undefined &&
            held.type === title.type &&
            (held.type === "missing" ||
                (title.type === "ready" &&
                    held.title === title.title &&
                    held.artifactType === title.artifactType &&
                    held.status === title.status))
        )
            return;
        const next = new Map(snapshot);
        next.set(artifactId, title);
        publish(next);
    };
    const artifactRead = (artifactId: HappyAgentArtifactId, signal: AbortSignal): void => {
        if (reading.has(artifactId)) return;
        reading.add(artifactId);
        void happyAgentSyncRead(
            signal,
            async () => {
                try {
                    return (await deps.client.getArtifact(artifactId, { signal })).artifact;
                } catch (error) {
                    if (notFound(error)) return undefined;
                    throw error;
                }
            },
            () => undefined,
        )
            .then((artifact) => {
                if (signal.aborted) return;
                artifactSet(
                    artifactId,
                    artifact === undefined
                        ? { type: "missing" }
                        : {
                              type: "ready",
                              title: artifact.title,
                              artifactType: happyAgentArtifactTypeProject(artifact.type),
                              status: artifact.status,
                          },
                );
            })
            .catch(() => undefined)
            .finally(() => reading.delete(artifactId));
    };
    /** Reads every artifact held again. */
    const reconcile = (signal: AbortSignal): void => {
        for (const artifactId of wanted) artifactRead(artifactId, signal);
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        let failed = false;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...HAPPY_AGENT_ARTIFACT_EVENT_TYPES],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    failed = false;
                    reconcile(active.signal);
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const event = happyAgentArtifactEventProject(input.update.event);
                if (event === undefined) continue;
                if (event.type === "created") {
                    if (!wanted.has(event.artifact.id)) continue;
                    artifactSet(event.artifact.id, {
                        type: "ready",
                        title: event.artifact.title,
                        artifactType: event.artifact.type,
                        status: event.artifact.status,
                    });
                    continue;
                }
                const held = snapshot.get(event.artifactId);
                // An event about an artifact not read yet is answered by the
                // read already in flight for it.
                if (held?.type !== "ready") continue;
                artifactSet(
                    event.artifactId,
                    event.type === "updated"
                        ? { ...held, title: event.changes.title }
                        : { ...held, status: "deleted" },
                );
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        following?.abort();
        following = undefined;
        reading.clear();
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        request(artifactIds) {
            if (disposed) return;
            for (const artifactId of artifactIds) {
                if (wanted.has(artifactId)) continue;
                wanted.add(artifactId);
                if (following) artifactRead(artifactId, following.signal);
            }
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
