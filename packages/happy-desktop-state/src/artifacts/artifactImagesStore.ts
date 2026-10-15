import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentArtifactId } from "./artifactTypes.js";

/** One version of one artifact, which never changes once published. */
export type HappyAgentArtifactImageKey = string & {
    readonly __brand: "HappyAgentArtifactImageKey";
};

export function happyAgentArtifactImageKey(
    artifactId: HappyAgentArtifactId,
    version: number,
): HappyAgentArtifactImageKey {
    return `${artifactId}@${String(version)}` as HappyAgentArtifactImageKey;
}

/**
 * What one artifact version reads as when a block shows it as a picture.
 *
 * - `ready` — its entry is an image, served at `url`.
 * - `notImage` — the version exists, but its entry is some other kind of file.
 * - `missing` — no such artifact or version on this Happy Agent, or one this
 *   reader cannot see.
 *
 * An absent key is still being read.
 */
export type HappyAgentArtifactImage =
    | { readonly type: "ready"; readonly url: string; readonly mimeType: string }
    | { readonly type: "notImage"; readonly mimeType: string }
    | { readonly type: "missing" };

export type HappyAgentArtifactImagesSnapshot = ReadonlyMap<
    HappyAgentArtifactImageKey,
    HappyAgentArtifactImage
>;

/**
 * The pictures Happy UI blocks show from artifacts: a screenshot before and
 * after a change, published by the agent that wrote the tour.
 *
 * A block names an artifact and a version, and a version's files never change
 * after it is published, so each is read once. `request` only records what is
 * wanted; reads run while the store has a subscriber, never inside the call,
 * so a surface may ask while it renders. Deletion is not followed here: the
 * artifact titles store already does, and the block reads it from there.
 */
export interface HappyAgentArtifactImagesStore {
    get(): HappyAgentArtifactImagesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: an artifact version a visible block shows. */
    request(artifactId: HappyAgentArtifactId, version: number): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentArtifactImagesDeps {
    readonly client: Pick<HappyAgentClient, "getArtifactVersion" | "artifactFileUrl">;
}

function notFound(error: unknown): boolean {
    return (
        error instanceof HappyAgentApiError &&
        (error.status === 404 || error.status === 403 || error.status === 400)
    );
}

const EMPTY: HappyAgentArtifactImagesSnapshot = new Map();

export function happyAgentArtifactImagesStoreCreate(
    deps: HappyAgentArtifactImagesDeps,
): HappyAgentArtifactImagesStore {
    const listeners = new Set<() => void>();
    let snapshot = EMPTY;
    /** Everything asked for, read or not. */
    const wanted = new Map<
        HappyAgentArtifactImageKey,
        { readonly artifactId: HappyAgentArtifactId; readonly version: number }
    >();
    /** Reads in flight under the current subscription, so one never starts twice. */
    const reading = new Set<HappyAgentArtifactImageKey>();
    let active: AbortController | undefined;
    let disposed = false;

    const imageSet = (key: HappyAgentArtifactImageKey, image: HappyAgentArtifactImage): void => {
        const next = new Map(snapshot);
        next.set(key, image);
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const imageRead = (key: HappyAgentArtifactImageKey, signal: AbortSignal): void => {
        const target = wanted.get(key);
        if (target === undefined || reading.has(key) || snapshot.has(key)) return;
        reading.add(key);
        void happyAgentSyncRead(
            signal,
            async () => {
                try {
                    return (
                        await deps.client.getArtifactVersion(target.artifactId, target.version, {
                            signal,
                        })
                    ).version;
                } catch (error) {
                    if (notFound(error)) return undefined;
                    throw error;
                }
            },
            () => undefined,
        )
            .then((version) => {
                if (signal.aborted) return;
                if (version === undefined) return imageSet(key, { type: "missing" });
                const { entry } = version;
                imageSet(
                    key,
                    entry.mimeType.startsWith("image/")
                        ? {
                              type: "ready",
                              url: deps.client.artifactFileUrl(
                                  target.artifactId,
                                  version.number,
                                  entry.path,
                              ),
                              mimeType: entry.mimeType,
                          }
                        : { type: "notImage", mimeType: entry.mimeType },
                );
            })
            .catch(() => undefined)
            .finally(() => reading.delete(key));
    };
    const start = (): void => {
        if (disposed || active || listeners.size === 0) return;
        active = new AbortController();
        for (const key of wanted.keys()) imageRead(key, active.signal);
    };
    const stop = (): void => {
        active?.abort();
        active = undefined;
        reading.clear();
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
        request(artifactId, version) {
            if (disposed) return;
            const key = happyAgentArtifactImageKey(artifactId, version);
            if (wanted.has(key)) return;
            wanted.set(key, { artifactId, version });
            if (active) imageRead(key, active.signal);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}

/** The store a surface with no artifacts behind it subscribes to: it never answers. */
export const happyAgentArtifactImagesStoreNoop: HappyAgentArtifactImagesStore = {
    get: () => EMPTY,
    subscribe: () => () => undefined,
    request: () => undefined,
    [Symbol.dispose]: () => undefined,
};
