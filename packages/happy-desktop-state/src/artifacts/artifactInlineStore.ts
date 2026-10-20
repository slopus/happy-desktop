import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentArtifactSiteOpening } from "../happyAgent/happyAgentHostServices.js";
import {
    HAPPY_AGENT_ARTIFACT_EVENT_TYPES,
    happyAgentArtifactEventProject,
} from "./artifactCatalog.js";
import { happyAgentArtifactBackground, happyAgentArtifactTypeProject } from "./artifactProject.js";
import type {
    HappyAgentArtifactDisplay,
    HappyAgentArtifactId,
    HappyAgentArtifactType,
} from "./artifactTypes.js";

/** Where an HTML artifact's latest version is served as a page, once it is. */
export type HappyAgentInlineArtifactSite =
    | { readonly type: "opening"; readonly version: number }
    | { readonly type: "opened"; readonly version: number; readonly url: string }
    /** This host has no guest to run a page in, or could not serve this version. */
    | { readonly type: "unavailable" };

/** An artifact the transcript shows inline, as it is now. */
export type HappyAgentInlineArtifact =
    | {
          readonly type: "ready";
          readonly title: string;
          readonly status: "active" | "deleted";
          readonly artifactType: HappyAgentArtifactType;
          readonly latestVersion: number;
          readonly display: HappyAgentArtifactDisplay | null;
          /** The latest version's canvas colour, or absent for the chat's own surface. */
          readonly background?: string;
          /** Only an HTML artifact is served as a page. */
          readonly site?: HappyAgentInlineArtifactSite;
      }
    /** No artifact has this id here, or this reader cannot see it. */
    | { readonly type: "missing" };

/** Every artifact asked for and read so far, by id; an absent one is still being read. */
export type HappyAgentInlineArtifactsSnapshot = ReadonlyMap<
    HappyAgentArtifactId,
    HappyAgentInlineArtifact
>;

/**
 * The artifacts a transcript shows inline, each at its latest version.
 *
 * A call that creates an artifact, or takes one up to edit, asks the chat to
 * follow it: the agent writes the artifact's files after that call, so every
 * version that matters comes later. This reads each such artifact once, keeps
 * its latest version, title, display preference, and canvas current from the
 * `artifact.*` events, and serves each new version of an HTML artifact as a
 * page through the host as soon as it exists.
 *
 * `request` only records what is wanted and starts reads; it never publishes in
 * its own call, so a surface may ask while it renders. Reads run only while the
 * store has a subscriber, and a reconnect reads every artifact held again.
 */
export interface HappyAgentInlineArtifactsStore {
    get(): HappyAgentInlineArtifactsSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: the artifacts the visible transcript shows inline. */
    request(artifactIds: readonly HappyAgentArtifactId[]): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentInlineArtifactsDeps {
    readonly client: Pick<HappyAgentClient, "getArtifact">;
    readonly sync: HappyAgentSync;
    /** Serves an HTML version as a live site, where the host has a guest to show it in. */
    readonly siteOpen?: (
        artifactId: HappyAgentArtifactId,
        version: number,
    ) => Promise<HappyAgentArtifactSiteOpening>;
}

function notFound(error: unknown): boolean {
    return (
        error instanceof HappyAgentApiError &&
        (error.status === 404 || error.status === 403 || error.status === 400)
    );
}

function displayProject(value: unknown): HappyAgentArtifactDisplay | null {
    return value === "inline_compact" || value === "inline_expanded" || value === "side"
        ? value
        : null;
}

type Ready = Extract<HappyAgentInlineArtifact, { type: "ready" }>;

function readyEqual(left: Ready, right: Ready): boolean {
    const leftSite = left.site;
    const rightSite = right.site;
    return (
        left.title === right.title &&
        left.status === right.status &&
        left.artifactType === right.artifactType &&
        left.latestVersion === right.latestVersion &&
        left.display === right.display &&
        left.background === right.background &&
        leftSite?.type === rightSite?.type &&
        (leftSite?.type !== "opening" ||
            (rightSite?.type === "opening" && leftSite.version === rightSite.version)) &&
        (leftSite?.type !== "opened" ||
            (rightSite?.type === "opened" &&
                leftSite.version === rightSite.version &&
                leftSite.url === rightSite.url))
    );
}

const EMPTY: HappyAgentInlineArtifactsSnapshot = new Map();

export function happyAgentInlineArtifactsStoreCreate(
    deps: HappyAgentInlineArtifactsDeps,
): HappyAgentInlineArtifactsStore {
    const listeners = new Set<() => void>();
    let snapshot = EMPTY;
    const wanted = new Set<HappyAgentArtifactId>();
    const reading = new Set<HappyAgentArtifactId>();
    /** Versions being served as pages now, as `<id>:<version>`. */
    const opening = new Set<string>();
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const publish = (next: HappyAgentInlineArtifactsSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const artifactSet = (artifactId: HappyAgentArtifactId, artifact: HappyAgentInlineArtifact) => {
        const held = snapshot.get(artifactId);
        if (
            held !== undefined &&
            (held.type === "missing"
                ? artifact.type === "missing"
                : artifact.type === "ready" && readyEqual(held, artifact))
        )
            return;
        const next = new Map(snapshot);
        next.set(artifactId, artifact);
        publish(next);
    };
    /**
     * Serves the artifact's latest version as a page, unless it is served
     * already or is being. A newer version arriving meanwhile wins: an answer
     * for an older one is dropped.
     */
    const siteEnsure = (artifactId: HappyAgentArtifactId, signal: AbortSignal): void => {
        const held = snapshot.get(artifactId);
        if (held?.type !== "ready" || held.artifactType !== "html" || held.status !== "active")
            return;
        const version = held.latestVersion;
        if (held.site?.type === "unavailable") return;
        if (held.site !== undefined && held.site.version === version) return;
        const key = `${artifactId}:${String(version)}`;
        if (opening.has(key)) return;
        const siteOpen = deps.siteOpen;
        if (!siteOpen) {
            artifactSet(artifactId, { ...held, site: { type: "unavailable" } });
            return;
        }
        // The page on screen stays until the next one is served.
        artifactSet(artifactId, {
            ...held,
            site: held.site?.type === "opened" ? held.site : { type: "opening", version },
        });
        opening.add(key);
        void siteOpen(artifactId, version)
            .finally(() => opening.delete(key))
            .then(
                (served) => {
                    if (signal.aborted) return;
                    const current = snapshot.get(artifactId);
                    if (current?.type !== "ready" || current.latestVersion !== version) return;
                    artifactSet(artifactId, {
                        ...current,
                        site:
                            served.type === "opened"
                                ? { type: "opened", version, url: served.url }
                                : { type: "unavailable" },
                    });
                },
                () => {
                    if (signal.aborted) return;
                    const current = snapshot.get(artifactId);
                    if (current?.type !== "ready" || current.latestVersion !== version) return;
                    artifactSet(artifactId, { ...current, site: { type: "unavailable" } });
                },
            );
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
                if (artifact === undefined) {
                    artifactSet(artifactId, { type: "missing" });
                    return;
                }
                const held = snapshot.get(artifactId);
                const background = happyAgentArtifactBackground(artifact.background);
                artifactSet(artifactId, {
                    type: "ready",
                    title: artifact.title,
                    status: artifact.status,
                    artifactType: happyAgentArtifactTypeProject(artifact.type),
                    latestVersion: artifact.latestVersion,
                    display: displayProject(artifact.display),
                    ...(background === undefined ? {} : { background }),
                    ...(held?.type === "ready" && held.site !== undefined
                        ? { site: held.site }
                        : {}),
                });
                siteEnsure(artifactId, signal);
            })
            .catch(() => undefined)
            .finally(() => reading.delete(artifactId));
    };
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
                const raw = input.update.event;
                const event = happyAgentArtifactEventProject(raw);
                if (event === undefined || event.type === "created") continue;
                const held = snapshot.get(event.artifactId);
                // An event about an artifact not read yet is answered by the
                // read already in flight for it.
                if (held?.type !== "ready") continue;
                if (event.type === "deleted") {
                    artifactSet(event.artifactId, { ...held, status: "deleted" });
                    continue;
                }
                const changes = raw.type === "artifact.updated" ? raw.payload.changes : undefined;
                const background =
                    changes?.background === undefined
                        ? held.background
                        : happyAgentArtifactBackground(changes.background);
                artifactSet(event.artifactId, {
                    type: "ready",
                    title: event.changes.title,
                    status: held.status,
                    artifactType: held.artifactType,
                    latestVersion: event.changes.latestVersion,
                    display:
                        changes?.display === undefined
                            ? held.display
                            : displayProject(changes.display),
                    ...(background === undefined ? {} : { background }),
                    ...(held.site === undefined ? {} : { site: held.site }),
                });
                siteEnsure(event.artifactId, active.signal);
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
