import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentArtifactSiteOpening } from "../happyAgent/happyAgentHostServices.js";
import {
    HAPPY_AGENT_ARTIFACT_EVENT_TYPES,
    happyAgentArtifactEventProject,
} from "./artifactCatalog.js";
import {
    happyAgentArtifactPageModeRead,
    type HappyAgentArtifactPageMode,
} from "./artifactPageMode.js";
import {
    happyAgentArtifactBackground,
    happyAgentArtifactTypeProject,
    happyAgentArtifactVersionProject,
} from "./artifactProject.js";
import type {
    HappyAgentArtifactDisplay,
    HappyAgentArtifactId,
    HappyAgentArtifactLive,
    HappyAgentArtifactType,
} from "./artifactTypes.js";
import type { HappyAgentArtifactFileLink } from "./artifactViewerStore.js";

/** Where an HTML artifact's latest version is served as a page, once it is. */
export type HappyAgentInlineArtifactSite =
    | { readonly type: "opening"; readonly version: number }
    | { readonly type: "opened"; readonly version: number; readonly url: string }
    /** This host has no guest to run a page in, or could not serve this version. */
    | { readonly type: "unavailable" };

/**
 * What an artifact other than a page shows inline, at the version it was read
 * for. A Markdown document is its text; an image, image series, video, or
 * document is its files.
 */
export type HappyAgentInlineArtifactContent =
    | {
          readonly type: "markdown";
          readonly version: number;
          readonly entryPath: string;
          readonly text: string;
          /** Every file of the version by path, so the entry's references resolve to it. */
          readonly files: ReadonlyMap<string, string>;
      }
    | {
          readonly type: "files";
          readonly version: number;
          readonly files: readonly HappyAgentArtifactFileLink[];
      }
    | { readonly type: "failed"; readonly version: number; readonly error: UserError };

/** The artifact types whose content a transcript can show inline from the store. */
const CONTENT_TYPES: ReadonlySet<HappyAgentArtifactType> = new Set([
    "markdown",
    "image",
    "image_series",
    "video",
    "document",
]);

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
          /**
           * What an HTML artifact's latest entry declares itself. An `app` is
           * never run in a chat row, so the row knows before it draws anything.
           */
          readonly pageMode?: HappyAgentArtifactPageMode;
          /** Present for a live artifact, whose page is this address instead of its files. */
          readonly live?: HappyAgentArtifactLive;
          /** Any other type's latest content, once a row asked to show it. */
          readonly content?: HappyAgentInlineArtifactContent;
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
    /**
     * Owner input: the artifacts whose content the transcript shows expanded.
     * Their latest content is read, and read again as new versions arrive; it
     * never publishes in this call.
     */
    contentRequest(artifactIds: readonly HappyAgentArtifactId[]): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentInlineArtifactsDeps {
    readonly client: Pick<
        HappyAgentClient,
        "getArtifact" | "getArtifactVersion" | "getArtifactFile" | "artifactFileUrl"
    >;
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
        left.pageMode === right.pageMode &&
        left.live?.url === right.live?.url &&
        left.live?.networkId === right.live?.networkId &&
        left.content === right.content &&
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
    const contentWanted = new Set<HappyAgentArtifactId>();
    /** Content being read now, as `<id>:<version>`. */
    const contentReading = new Set<string>();
    /** Versions being served as pages now, as `<id>:<version>`. */
    const opening = new Set<string>();
    /**
     * What each HTML version's entry declares, as `<id>:<version>`. A version
     * never changes, so each is read once; one that could not be read is
     * forgotten and read again the next time it is asked for.
     */
    const pageModes = new Map<string, Promise<HappyAgentArtifactPageMode>>();
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
        if (
            held?.type !== "ready" ||
            held.artifactType !== "html" ||
            held.status !== "active" ||
            held.live !== undefined ||
            // An app is never run in a chat row, so it is not served for one.
            held.pageMode === "app"
        )
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
    /**
     * What one version of an HTML artifact declares; a page when it cannot be
     * read. A read cut short by `signal` rejects, and is read again next time.
     */
    const pageModeOf = (
        artifactId: HappyAgentArtifactId,
        version: number,
        signal: AbortSignal,
    ): Promise<HappyAgentArtifactPageMode> => {
        const key = `${artifactId}:${String(version)}`;
        const held = pageModes.get(key);
        if (held) return held;
        const read = (async (): Promise<HappyAgentArtifactPageMode> => {
            const manifest = happyAgentArtifactVersionProject(
                (await deps.client.getArtifactVersion(artifactId, version, { signal })).version,
            );
            const entry = await deps.client.getArtifactFile(
                artifactId,
                version,
                manifest.entry.path,
                { signal },
            );
            if (entry === null) throw new Error("The artifact file could not be read.");
            return happyAgentArtifactPageModeRead(new TextDecoder().decode(entry.data));
        })().catch((error: unknown) => {
            pageModes.delete(key);
            if (signal.aborted) throw error;
            return "page" as const;
        });
        pageModes.set(key, read);
        return read;
    };
    /**
     * Follows what the latest version of an HTML artifact declares. The mode
     * held stays until the new version's is read.
     */
    const pageModeEnsure = (artifactId: HappyAgentArtifactId, signal: AbortSignal): void => {
        const held = snapshot.get(artifactId);
        if (held?.type !== "ready" || held.artifactType !== "html" || held.live !== undefined)
            return;
        const version = held.latestVersion;
        pageModeOf(artifactId, version, signal).then(
            (pageMode) => {
                if (signal.aborted) return;
                const current = snapshot.get(artifactId);
                if (current?.type !== "ready" || current.latestVersion !== version) return;
                artifactSet(artifactId, { ...current, pageMode });
                siteEnsure(artifactId, signal);
            },
            () => undefined,
        );
    };
    /**
     * Reads the latest content of an artifact a row shows expanded, unless it
     * is read already or being read. A newer version arriving meanwhile wins:
     * an answer for an older one is dropped.
     */
    const contentEnsure = (artifactId: HappyAgentArtifactId, signal: AbortSignal): void => {
        const held = snapshot.get(artifactId);
        if (
            !contentWanted.has(artifactId) ||
            held?.type !== "ready" ||
            held.status !== "active" ||
            !CONTENT_TYPES.has(held.artifactType)
        )
            return;
        const version = held.latestVersion;
        if (held.content !== undefined && held.content.version === version) return;
        const key = `${artifactId}:${String(version)}`;
        if (contentReading.has(key)) return;
        // What is on screen stays until the next version's content is read.
        contentReading.add(key);
        const contentLand = (content: HappyAgentInlineArtifactContent): void => {
            if (signal.aborted) return;
            const current = snapshot.get(artifactId);
            if (current?.type !== "ready" || current.latestVersion !== version) return;
            artifactSet(artifactId, { ...current, content });
        };
        void (async (): Promise<HappyAgentInlineArtifactContent> => {
            const manifest = happyAgentArtifactVersionProject(
                (await deps.client.getArtifactVersion(artifactId, version, { signal })).version,
            );
            const link = (path: string): string =>
                deps.client.artifactFileUrl(artifactId, version, path);
            if (held.artifactType !== "markdown")
                return {
                    type: "files",
                    version,
                    files: manifest.files.map((file) => ({ file, url: link(file.path) })),
                };
            const entry = await deps.client.getArtifactFile(
                artifactId,
                version,
                manifest.entry.path,
                { signal },
            );
            if (entry === null) throw new Error("The artifact file could not be read.");
            return {
                type: "markdown",
                version,
                entryPath: manifest.entry.path,
                text: new TextDecoder().decode(entry.data),
                files: new Map(manifest.files.map((file) => [file.path, link(file.path)])),
            };
        })()
            .then(contentLand, (error: unknown) =>
                contentLand({ type: "failed", version, error: happyAgentUserError(error) }),
            )
            .finally(() => contentReading.delete(key));
    };
    const artifactRead = (artifactId: HappyAgentArtifactId, signal: AbortSignal): void => {
        if (reading.has(artifactId)) return;
        reading.add(artifactId);
        void happyAgentSyncRead(
            signal,
            async () => {
                const artifact = await deps.client.getArtifact(artifactId, { signal }).then(
                    (response) => response.artifact,
                    (error: unknown) => {
                        if (notFound(error)) return undefined;
                        throw error;
                    },
                );
                if (artifact === undefined) return undefined;
                // An HTML artifact's row is drawn once what its entry declares
                // is known, so an app never starts out as a page.
                const pageMode =
                    happyAgentArtifactTypeProject(artifact.type) === "html" && !artifact.live
                        ? await pageModeOf(artifactId, artifact.latestVersion, signal)
                        : undefined;
                return { artifact, pageMode };
            },
            () => undefined,
        )
            .then((read) => {
                if (signal.aborted) return;
                if (read === undefined) {
                    artifactSet(artifactId, { type: "missing" });
                    return;
                }
                const { artifact, pageMode } = read;
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
                    ...(artifact.live ? { live: artifact.live } : {}),
                    ...(pageMode === undefined ? {} : { pageMode }),
                    ...(held?.type === "ready" && held.site !== undefined
                        ? { site: held.site }
                        : {}),
                    ...(held?.type === "ready" && held.content !== undefined
                        ? { content: held.content }
                        : {}),
                });
                siteEnsure(artifactId, signal);
                contentEnsure(artifactId, signal);
                pageModeEnsure(artifactId, signal);
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
                const live = changes?.live === undefined ? held.live : (changes.live ?? undefined);
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
                    ...(live === undefined ? {} : { live }),
                    ...(held.pageMode === undefined || live !== undefined
                        ? {}
                        : { pageMode: held.pageMode }),
                    ...(held.site === undefined ? {} : { site: held.site }),
                    ...(held.content === undefined ? {} : { content: held.content }),
                });
                siteEnsure(event.artifactId, active.signal);
                contentEnsure(event.artifactId, active.signal);
                pageModeEnsure(event.artifactId, active.signal);
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
        contentReading.clear();
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
        contentRequest(artifactIds) {
            if (disposed) return;
            for (const artifactId of artifactIds) {
                if (contentWanted.has(artifactId)) continue;
                contentWanted.add(artifactId);
                if (following) contentEnsure(artifactId, following.signal);
            }
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            pageModes.clear();
            listeners.clear();
        },
    };
}
