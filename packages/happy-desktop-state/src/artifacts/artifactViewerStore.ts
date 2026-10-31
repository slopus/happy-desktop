import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { HappyAgentArtifactSiteOpening } from "../happyAgent/happyAgentHostServices.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import {
    HAPPY_AGENT_ARTIFACT_EVENT_TYPES,
    happyAgentArtifactEventApply,
    happyAgentArtifactEventProject,
    happyAgentArtifactVersionNewer,
    type HappyAgentArtifactEvent,
} from "./artifactCatalog.js";
import { happyAgentArtifactAuthors } from "./artifactPeopleStore.js";
import { happyAgentArtifactProject, happyAgentArtifactVersionProject } from "./artifactProject.js";
import type {
    HappyAgentArtifact,
    HappyAgentArtifactAuthor,
    HappyAgentArtifactFile,
    HappyAgentArtifactId,
    HappyAgentArtifactVersion,
} from "./artifactTypes.js";

/** How many versions one history read asks for. */
const VERSION_PAGE_LIMIT = 50;
/**
 * What a static page preview inlines. A page is shown from its own files, and
 * the frame it runs in can reach none of the daemon's routes, so every file it
 * names is handed to it as data; these bounds keep a page that ships a film
 * beside its markup from being read whole into memory to show a thumbnail.
 */
const HTML_ASSET_MAX_BYTES = 8 * 1024 * 1024;
const HTML_ASSETS_MAX_BYTES = 24 * 1024 * 1024;

/** One file of the version on screen and the address it is served at. */
export interface HappyAgentArtifactFileLink {
    readonly file: HappyAgentArtifactFile;
    /** The daemon's route for this file of this numbered version. */
    readonly url: string;
}

/** Why an HTML version is drawn as a static preview rather than run as a site. */
export type HappyAgentArtifactStaticReason =
    /** This host has no isolated guest to run a page in, as in a browser tab. */
    | { readonly type: "no-guest" }
    /** The desktop app around this renderer predates running pages; updating it runs them. */
    | { readonly type: "app-outdated" }
    /** The host runs pages, and could not serve this one. */
    | { readonly type: "failed"; readonly error: UserError };

/** How an HTML version's page is shown. */
export type HappyAgentArtifactPage =
    /** Served by the host as a site of its own, where its scripts run. */
    | { readonly kind: "site"; readonly url: string }
    /** Drawn from its own files with every asset inlined, and no script. */
    | {
          readonly kind: "static";
          readonly reason: HappyAgentArtifactStaticReason;
          readonly text: string;
          /** The version's other files by path, as `data:` URLs the page can load. */
          readonly assets: ReadonlyMap<string, string>;
          /** Files too large to inline, which the page will find missing. */
          readonly omitted: readonly string[];
      };

/** What the viewer shows for the version on screen, by the artifact's type. */
export type HappyAgentArtifactContent =
    | { readonly type: "loading" }
    | { readonly type: "error"; readonly error: UserError }
    | {
          readonly type: "markdown";
          readonly entryPath: string;
          readonly text: string;
          /** Every file of the version by path, so the entry's references resolve to it. */
          readonly files: ReadonlyMap<string, string>;
      }
    | { readonly type: "html"; readonly entryPath: string; readonly page: HappyAgentArtifactPage }
    | { readonly type: "image"; readonly image: HappyAgentArtifactFileLink }
    | { readonly type: "image_series"; readonly images: readonly HappyAgentArtifactFileLink[] }
    | { readonly type: "video"; readonly video: HappyAgentArtifactFileLink }
    | {
          readonly type: "document";
          readonly document: HappyAgentArtifactFileLink;
          /** An object URL of the bytes, when this host shows the document inline. */
          readonly inlineUrl?: string;
      }
    /** A type this build does not know: its files are the whole of what can be shown. */
    | { readonly type: "files" };

/** Where deleting the open artifact stands. */
export type HappyAgentArtifactDeletion =
    | { readonly phase: "idle" }
    | { readonly phase: "confirming" }
    | { readonly phase: "pending" }
    | { readonly phase: "failed"; readonly error: UserError };

export type HappyAgentArtifactViewerArtifact =
    | { readonly type: "loading" }
    | { readonly type: "ready"; readonly value: HappyAgentArtifact }
    /** No artifact has this id on this Happy Agent. */
    | { readonly type: "missing" }
    | { readonly type: "error"; readonly error: UserError };

export interface HappyAgentArtifactViewerSnapshot {
    /** The artifact the viewer is open on; absent until navigation names one. */
    readonly artifactId?: HappyAgentArtifactId;
    readonly artifact: HappyAgentArtifactViewerArtifact;
    /** The history, newest first; empty for a deleted artifact, which serves none. */
    readonly versions: readonly HappyAgentArtifactVersion[];
    readonly versionsLoading: boolean;
    readonly versionsHasMore: boolean;
    /** The version the reader picked; absent follows the latest as it changes. */
    readonly versionSelected?: number;
    /** The version on screen, once its manifest has been read. */
    readonly version?: HappyAgentArtifactVersion;
    /** Every file of the version on screen, in path order. */
    readonly files: readonly HappyAgentArtifactFileLink[];
    readonly content: HappyAgentArtifactContent;
    readonly deletion: HappyAgentArtifactDeletion;
}

export interface HappyAgentArtifactViewerStore {
    get(): HappyAgentArtifactViewerSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Owner input: the artifact navigation opened, or none, and the numbered
     * version it named when it named one. Without a version the viewer follows
     * the latest; with one it opens on that version, as if the reader had
     * picked it from the history.
     */
    artifactOpen(artifactId: HappyAgentArtifactId | undefined, version?: number): void;
    /** Shows one numbered version; the latest number follows the latest again. */
    versionSelect(number: number): void;
    /** Reads the next page of older versions. */
    versionsNextLoad(): void;
    /** Asks the reader to confirm deleting the open artifact. */
    deletionRequest(): void;
    deletionCancel(): void;
    /**
     * Deletes the open artifact against the version on screen. Retrying a
     * failed attempt reuses its mutation id; the tombstone replaces the
     * artifact when the daemon confirms it.
     */
    deletionConfirm(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentArtifactViewerDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "getArtifact"
        | "listArtifactVersions"
        | "getArtifactVersion"
        | "getArtifactFile"
        | "artifactFileUrl"
        | "deleteArtifact"
    >;
    readonly sync: HappyAgentSync;
    /** Whether this host renders a document of this media type inline. */
    readonly documentInline?: (mimeType: string) => boolean;
    /**
     * Serves an HTML version as a live site and names its entry's address.
     * Absent, refused, or too old to serve one, the page is shown as a static
     * preview that says which of those it is.
     */
    readonly siteOpen?: (
        artifactId: HappyAgentArtifactId,
        version: number,
    ) => Promise<HappyAgentArtifactSiteOpening>;
    /** Reports who the artifact and its history credit, so the people among them can be named. */
    readonly authorsSeen?: (authors: readonly (HappyAgentArtifactAuthor | null)[]) => void;
}

const LOADING = { type: "loading" } as const;
const DELETION_IDLE: HappyAgentArtifactDeletion = { phase: "idle" };

function snapshotEmpty(
    artifactId?: HappyAgentArtifactId,
    versionSelected?: number,
): HappyAgentArtifactViewerSnapshot {
    return {
        ...(artifactId === undefined ? {} : { artifactId }),
        ...(versionSelected === undefined ? {} : { versionSelected }),
        artifact: LOADING,
        versions: [],
        versionsLoading: false,
        versionsHasMore: false,
        files: [],
        content: LOADING,
        deletion: DELETION_IDLE,
    };
}

function notFound(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status === 404;
}

function base64Of(data: ArrayBuffer): string {
    const bytes = new Uint8Array(data);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
}

/** Versions merged newest first, a newly read copy replacing the one held. */
function versionsMerge(
    held: readonly HappyAgentArtifactVersion[],
    read: readonly HappyAgentArtifactVersion[],
): readonly HappyAgentArtifactVersion[] {
    const byNumber = new Map(held.map((version) => [version.number, version]));
    for (const version of read) byNumber.set(version.number, version);
    return [...byNumber.values()].sort((left, right) => right.number - left.number);
}

/**
 * The artifact viewer: one artifact, its history, and the content of the
 * version on screen, kept live.
 *
 * Navigation opens an artifact by id; the constructor opens nothing, and the
 * first subscriber follows `artifact.*` events while the viewer is on screen.
 * Every file is addressed through a numbered version, never `latest`, so a
 * page and everything it refers to always come from the same version. A
 * numbered version never changes, so its content is read once and survives a
 * reconnect; only the artifact and its history are reconciled.
 */
export function happyAgentArtifactViewerStoreCreate(
    deps: HappyAgentArtifactViewerDeps,
): HappyAgentArtifactViewerStore {
    const listeners = new Set<() => void>();
    let snapshot = snapshotEmpty();
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** Everything read for the open artifact; aborted when another is opened. */
    let opened = new AbortController();
    /** The content read in flight, and the version number it is for. */
    let contentRead: { readonly controller: AbortController; readonly number: number } | undefined;
    /** The version number whose content is on screen. */
    let contentNumber: number | undefined;
    let versionsCursor: string | null = null;
    let inlineUrl: string | undefined;
    let deletionMutationId: string | undefined;
    let disposed = false;

    const publish = (next: Partial<HappyAgentArtifactViewerSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };

    const inlineRelease = (): void => {
        if (inlineUrl !== undefined && typeof URL.revokeObjectURL === "function")
            URL.revokeObjectURL(inlineUrl);
        inlineUrl = undefined;
    };

    const fileLink = (
        artifactId: HappyAgentArtifactId,
        number: number,
        file: HappyAgentArtifactFile,
    ): HappyAgentArtifactFileLink => ({
        file,
        url: deps.client.artifactFileUrl(artifactId, number, file.path),
    });

    const fileText = async (
        artifactId: HappyAgentArtifactId,
        number: number,
        path: string,
        signal: AbortSignal,
    ): Promise<{ readonly data: ArrayBuffer; readonly contentType: string }> => {
        const file = await deps.client.getArtifactFile(artifactId, number, path, { signal });
        if (file === null) throw new UserError("The artifact file could not be read.");
        return { data: file.data, contentType: file.contentType };
    };

    /** Reads what one version shows, by the artifact's type. */
    const contentOf = async (
        artifact: HappyAgentArtifact,
        version: HappyAgentArtifactVersion,
        signal: AbortSignal,
    ): Promise<HappyAgentArtifactContent> => {
        const id = artifact.id;
        const number = version.number;
        const entry = fileLink(id, number, version.entry);
        switch (artifact.type) {
            case "markdown": {
                const { data } = await fileText(id, number, version.entry.path, signal);
                return {
                    type: "markdown",
                    entryPath: version.entry.path,
                    text: new TextDecoder().decode(data),
                    files: new Map(
                        version.files.map((file) => [
                            file.path,
                            deps.client.artifactFileUrl(id, number, file.path),
                        ]),
                    ),
                };
            }
            case "html": {
                // Whatever keeps the page from running as a site, the static
                // preview is still shown, and says why it is not the page.
                let reason: HappyAgentArtifactStaticReason = { type: "no-guest" };
                if (deps.siteOpen) {
                    const opening = await deps.siteOpen(id, number).then(
                        (value) => value,
                        (error: unknown) => ({
                            type: "failed" as const,
                            error: happyAgentUserError(error),
                        }),
                    );
                    if (opening.type === "opened")
                        return {
                            type: "html",
                            entryPath: version.entry.path,
                            page: { kind: "site", url: opening.url },
                        };
                    reason = opening;
                }
                const { data } = await fileText(id, number, version.entry.path, signal);
                const assets = new Map<string, string>();
                const omitted: string[] = [];
                let budget = HTML_ASSETS_MAX_BYTES;
                for (const file of version.files) {
                    if (file.path === version.entry.path) continue;
                    if (file.size > HTML_ASSET_MAX_BYTES || file.size > budget) {
                        omitted.push(file.path);
                        continue;
                    }
                    budget -= file.size;
                    const asset = await fileText(id, number, file.path, signal);
                    assets.set(file.path, `data:${file.mimeType};base64,${base64Of(asset.data)}`);
                }
                return {
                    type: "html",
                    entryPath: version.entry.path,
                    page: {
                        kind: "static",
                        reason,
                        text: new TextDecoder().decode(data),
                        assets,
                        omitted,
                    },
                };
            }
            case "image":
                return { type: "image", image: entry };
            case "image_series":
                return {
                    type: "image_series",
                    images: version.files.map((file) => fileLink(id, number, file)),
                };
            case "video":
                return { type: "video", video: entry };
            case "document": {
                if (
                    deps.documentInline?.(version.entry.mimeType) !== true ||
                    typeof URL.createObjectURL !== "function"
                )
                    return { type: "document", document: entry };
                const { data } = await fileText(id, number, version.entry.path, signal);
                const url = URL.createObjectURL(new Blob([data], { type: version.entry.mimeType }));
                if (signal.aborted) {
                    URL.revokeObjectURL(url);
                    return { type: "document", document: entry };
                }
                inlineRelease();
                inlineUrl = url;
                return { type: "document", document: entry, inlineUrl: url };
            }
            case "unknown":
                return { type: "files" };
        }
    };

    /**
     * Shows the version the reader picked, or the latest. Content of a numbered
     * version never changes, so a version already on screen is not read again.
     */
    const contentLoad = (): void => {
        const state = snapshot.artifact;
        if (state.type !== "ready") return;
        const artifact = state.value;
        if (artifact.status === "deleted") {
            contentRead?.controller.abort();
            contentRead = undefined;
            return;
        }
        const number = snapshot.versionSelected ?? artifact.latestVersion;
        if (contentNumber === number && snapshot.content.type !== "error") return;
        if (contentRead?.number === number) return;
        contentRead?.controller.abort();
        const controller = new AbortController();
        contentRead = { controller, number };
        const signal = AbortSignal.any([opened.signal, controller.signal]);
        if (contentNumber !== number) publish({ content: LOADING });
        void (async () => {
            const held = snapshot.versions.find((version) => version.number === number);
            const version =
                held ??
                happyAgentArtifactVersionProject(
                    (await deps.client.getArtifactVersion(artifact.id, number, { signal })).version,
                );
            if (signal.aborted) return;
            publish({
                version,
                files: version.files.map((file) => fileLink(artifact.id, number, file)),
            });
            const content = await contentOf(artifact, version, signal);
            if (signal.aborted) return;
            contentNumber = number;
            publish({ content });
        })()
            .catch((error: unknown) => {
                if (signal.aborted) return;
                publish({ content: { type: "error", error: happyAgentUserError(error) } });
            })
            .finally(() => {
                if (contentRead?.controller === controller) contentRead = undefined;
            });
    };

    /** Reads the newest page of the history, keeping older pages already read. */
    const versionsLoad = (artifactId: HappyAgentArtifactId): void => {
        const signal = opened.signal;
        publish({ versionsLoading: true });
        void deps.client
            .listArtifactVersions(artifactId, { limit: VERSION_PAGE_LIMIT }, { signal })
            .then(
                (response) => {
                    if (signal.aborted) return;
                    if (snapshot.versions.length === 0) versionsCursor = response.nextPageCursor;
                    const read = response.versions.map(happyAgentArtifactVersionProject);
                    deps.authorsSeen?.(read.map((version) => version.createdBy));
                    publish({
                        versions: versionsMerge(snapshot.versions, read),
                        versionsLoading: false,
                        versionsHasMore: versionsCursor !== null,
                    });
                },
                () => {
                    // A deleted artifact serves no history, and a failed read is
                    // retried by the next reconcile; the viewer still shows the
                    // version it can read.
                    if (!signal.aborted) publish({ versionsLoading: false });
                },
            );
    };

    const artifactAdopt = (artifact: HappyAgentArtifact): void => {
        const held = snapshot.artifact.type === "ready" ? snapshot.artifact.value : undefined;
        if (held && happyAgentArtifactVersionNewer(held.version, artifact.version)) return;
        deps.authorsSeen?.(happyAgentArtifactAuthors([artifact]));
        // A version named on opening that turns out to be the latest is the
        // latest, and follows it from here like any other.
        if (held === undefined && snapshot.versionSelected === artifact.latestVersion) {
            const { versionSelected: _selected, ...rest } = snapshot;
            snapshot = rest;
        }
        publish({ artifact: { type: "ready", value: artifact } });
    };

    /** Reads the open artifact and its history again; its content only if the version moved. */
    const reconcile = (): void => {
        const artifactId = snapshot.artifactId;
        if (artifactId === undefined || following === undefined) return;
        const signal = opened.signal;
        void deps.client.getArtifact(artifactId, { signal }).then(
            (response) => {
                if (signal.aborted) return;
                artifactAdopt(happyAgentArtifactProject(response.artifact));
                if (
                    snapshot.artifact.type === "ready" &&
                    snapshot.artifact.value.status === "active"
                )
                    versionsLoad(artifactId);
                contentLoad();
            },
            (error: unknown) => {
                if (signal.aborted) return;
                if (notFound(error)) {
                    publish({ artifact: { type: "missing" } });
                    return;
                }
                if (snapshot.artifact.type !== "ready")
                    publish({ artifact: { type: "error", error: happyAgentUserError(error) } });
            },
        );
    };

    const eventApply = (event: HappyAgentArtifactEvent): void => {
        const artifactId = snapshot.artifactId;
        if (artifactId === undefined) return;
        if (event.type === "created") {
            if (event.artifact.id !== artifactId || snapshot.artifact.type === "ready") return;
            artifactAdopt(event.artifact);
            versionsLoad(artifactId);
            contentLoad();
            return;
        }
        if (event.artifactId !== artifactId || snapshot.artifact.type !== "ready") return;
        const held = snapshot.artifact.value;
        if (
            held.version === event.version ||
            happyAgentArtifactVersionNewer(held.version, event.version)
        )
            return;
        if (held.version !== event.previousVersion) {
            reconcile();
            return;
        }
        artifactAdopt(happyAgentArtifactEventApply(held, event));
        if (event.type === "updated") versionsLoad(artifactId);
        contentLoad();
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
                    reconcile();
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const event = happyAgentArtifactEventProject(input.update.event);
                if (event !== undefined) eventApply(event);
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
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    const deletionFailure = (error: unknown): UserError => {
        if (error instanceof HappyAgentApiError && error.status === 409)
            return new UserError(
                "This artifact changed while you were deciding. Look at its latest version, then delete it again.",
                "conflict",
                error,
            );
        return happyAgentUserError(error);
    };

    const versionSelect = (number: number): void => {
        if (disposed || snapshot.artifact.type !== "ready") return;
        const latest = snapshot.artifact.value.latestVersion;
        const next = number === latest ? undefined : number;
        if (next === snapshot.versionSelected) return;
        const { versionSelected: _selected, ...rest } = snapshot;
        snapshot = next === undefined ? rest : { ...rest, versionSelected: next };
        for (const listener of listeners) listener();
        contentLoad();
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
        artifactOpen(artifactId, version) {
            if (disposed) return;
            if (artifactId === snapshot.artifactId) {
                if (version !== undefined && artifactId !== undefined) versionSelect(version);
                return;
            }
            opened.abort();
            opened = new AbortController();
            contentRead = undefined;
            contentNumber = undefined;
            versionsCursor = null;
            deletionMutationId = undefined;
            inlineRelease();
            snapshot = snapshotEmpty(artifactId, version);
            for (const listener of listeners) listener();
            reconcile();
        },
        versionSelect,
        versionsNextLoad() {
            const artifactId = snapshot.artifactId;
            if (
                disposed ||
                artifactId === undefined ||
                versionsCursor === null ||
                snapshot.versionsLoading
            )
                return;
            const signal = opened.signal;
            const pageCursor = versionsCursor;
            publish({ versionsLoading: true });
            void deps.client
                .listArtifactVersions(
                    artifactId,
                    { limit: VERSION_PAGE_LIMIT, pageCursor },
                    { signal },
                )
                .then(
                    (response) => {
                        if (signal.aborted) return;
                        versionsCursor = response.nextPageCursor;
                        const read = response.versions.map(happyAgentArtifactVersionProject);
                        deps.authorsSeen?.(read.map((version) => version.createdBy));
                        publish({
                            versions: versionsMerge(snapshot.versions, read),
                            versionsLoading: false,
                            versionsHasMore: versionsCursor !== null,
                        });
                    },
                    () => {
                        if (!signal.aborted) publish({ versionsLoading: false });
                    },
                );
        },
        deletionRequest() {
            if (
                disposed ||
                snapshot.artifact.type !== "ready" ||
                snapshot.artifact.value.status !== "active" ||
                snapshot.deletion.phase !== "idle"
            )
                return;
            deletionMutationId = globalThis.crypto.randomUUID();
            publish({ deletion: { phase: "confirming" } });
        },
        deletionCancel() {
            if (disposed || snapshot.deletion.phase === "pending") return;
            deletionMutationId = undefined;
            publish({ deletion: DELETION_IDLE });
        },
        deletionConfirm() {
            if (
                disposed ||
                snapshot.artifact.type !== "ready" ||
                (snapshot.deletion.phase !== "confirming" && snapshot.deletion.phase !== "failed")
            )
                return;
            const artifact = snapshot.artifact.value;
            const mutationId = (deletionMutationId ??= globalThis.crypto.randomUUID());
            const signal = opened.signal;
            publish({ deletion: { phase: "pending" } });
            void deps.client
                .deleteArtifact(artifact.id, { ifMatch: artifact.version, mutationId, signal })
                .then(
                    (response) => {
                        if (signal.aborted) return;
                        deletionMutationId = undefined;
                        artifactAdopt(happyAgentArtifactProject(response.artifact));
                        publish({ deletion: DELETION_IDLE });
                        contentLoad();
                    },
                    (error: unknown) => {
                        if (signal.aborted) return;
                        publish({ deletion: { phase: "failed", error: deletionFailure(error) } });
                        // A conflict means the artifact moved on; show the version
                        // the deletion would now have to name. Deleting that one is
                        // a new decision, so it is a new mutation rather than a
                        // retry of the refused one.
                        if (error instanceof HappyAgentApiError && error.status === 409) {
                            deletionMutationId = undefined;
                            reconcile();
                        }
                    },
                );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            opened.abort();
            stop();
            inlineRelease();
            listeners.clear();
        },
    };
}
