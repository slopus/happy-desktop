import { UserError } from "../types.js";
import type { HappyAgentChangedFileDocument, HappyAgentGitChangedFile } from "./happyAgentTypes.js";

/**
 * Two commits a change is read between, each a full object name. Only full
 * names are accepted: a branch or `HEAD` moves, and a review written about a
 * change must keep showing that change.
 */
export interface HappyAgentRevisionRange {
    readonly base: string;
    readonly head: string;
}

/**
 * One file's two sides, as last read. Without a range that is the working tree
 * against the revision the Git snapshot compares with, re-read when the file's
 * revision moves; with a range it is the file at `base` and at `head`, read
 * once. `missing` is a file the change does not touch: that is an answer, not
 * an absence, because a review that names it is wrong.
 *
 * An `error` with a `revision` is a read that failed at that identity. It is
 * not read again until the identity moves or a new subscription begins, so a
 * file the server refuses does not loop. One without a revision needed no
 * read: the checkout itself cannot be compared.
 */
export type HappyAgentChangedFileDiff =
    | { readonly type: "loading" }
    | { readonly type: "missing" }
    | { readonly type: "error"; readonly error: UserError; readonly revision?: string }
    | {
          readonly type: "ready";
          readonly document: HappyAgentChangedFileDocument;
          /** The identity this was read at; a newer one re-reads. */
          readonly revision: string;
      };

/** Where one diff is read: a path, alone or between two commits. */
export type HappyAgentChangedFileDiffKey = string & {
    readonly __brand: "HappyAgentChangedFileDiffKey";
};

export function happyAgentChangedFileDiffKey(
    path: string,
    range?: HappyAgentRevisionRange,
): HappyAgentChangedFileDiffKey {
    return (
        range === undefined ? path : `${range.base}..${range.head}\u0000${path}`
    ) as HappyAgentChangedFileDiffKey;
}

/**
 * Every file the checkout's live change touches — the branch since its merge
 * base, committed or not — as its live Git scan lists them. `complete` is
 * false when the scan capped its list, so a file absent from `files` may still
 * be changed. `base` is the merge base the change is measured from, absent
 * when the change is empty. `unavailable` is a checkout whose changes cannot
 * be compared at all.
 */
export type HappyAgentChangedFiles =
    | { readonly type: "loading" }
    | { readonly type: "unavailable" }
    | {
          readonly type: "ready";
          readonly files: readonly HappyAgentChangedFileEntry[];
          readonly complete: boolean;
          readonly base?: string;
      };

/** One file the live change lists, with what the scan counted for it. */
export interface HappyAgentChangedFileEntry {
    readonly path: string;
    readonly status: HappyAgentGitChangedFile["status"];
    /** Absent for a binary file, whose lines are not counted. */
    readonly addedLines?: number;
    readonly deletedLines?: number;
}

/** Two commits whose file list was asked for, as `base..head`. */
export type HappyAgentRevisionRangeKey = string & {
    readonly __brand: "HappyAgentRevisionRangeKey";
};

export function happyAgentRevisionRangeKey(
    range: HappyAgentRevisionRange,
): HappyAgentRevisionRangeKey {
    return `${range.base}..${range.head}` as HappyAgentRevisionRangeKey;
}

/**
 * Every file that differs between two commits. `unavailable` is a Happy Agent
 * that cannot list them — one older than the route, or a folder with no
 * history. An absent key is still being read.
 */
export type HappyAgentRevisionFiles =
    | { readonly type: "unavailable" }
    | { readonly type: "error"; readonly error: UserError }
    | {
          readonly type: "ready";
          readonly files: readonly HappyAgentRevisionFileEntry[];
          readonly complete: boolean;
      };

/** One file that differs between two commits; a rename lists its new path. */
export interface HappyAgentRevisionFileEntry {
    readonly path: string;
    readonly status:
        | "added"
        | "modified"
        | "deleted"
        | "renamed"
        | "copied"
        | "type_changed"
        | "submodule";
    /** Absent for a binary file or a submodule, whose lines are not counted. */
    readonly addedLines?: number;
    readonly deletedLines?: number;
}

/** What one checkout's Happy UI blocks are grounded in. */
export interface HappyAgentChangedFileDiffsSnapshot {
    readonly files: HappyAgentChangedFiles;
    /** Every diff asked for so far. */
    readonly diffs: ReadonlyMap<HappyAgentChangedFileDiffKey, HappyAgentChangedFileDiff>;
    /** Every two-commit file list asked for so far. */
    readonly revisionFiles: ReadonlyMap<HappyAgentRevisionRangeKey, HappyAgentRevisionFiles>;
}

/**
 * The changes behind the Happy UI blocks a conversation draws.
 *
 * A guided review names files and line ranges; what it shows at them must be
 * the real diff, and what it leaves out must be visible. This store keeps the
 * checkout's changed-file list and reads each named file's two sides, so a
 * transcript can ask while it renders and while it sizes rows. `request` only
 * records what is wanted; reads run while the store has a subscriber, never
 * inside the call, and stop with the last subscriber.
 */
export interface HappyAgentChangedFileDiffsStore {
    get(): HappyAgentChangedFileDiffsSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: a file a visible block names. Safe to call every render. */
    request(path: string, range?: HappyAgentRevisionRange): void;
    /** Owner input: two commits a visible block's coverage is checked against. */
    revisionFilesRequest(range: HappyAgentRevisionRange): void;
    [Symbol.dispose](): void;
}

/** The store as its creator holds it, with the private writer for Git scans. */
export interface HappyAgentChangedFileDiffsStoreOwned extends HappyAgentChangedFileDiffsStore {
    /**
     * Authoritative input: the checkout's changed files after a Git scan.
     * Publishes the list and, while subscribed, re-reads every working-tree
     * diff whose file moved or left the change.
     */
    filesUpdate(files: HappyAgentChangedFiles): void;
}

export interface HappyAgentChangedFileDiffsDeps {
    /** The live Git change for a path in this checkout, or nothing if unchanged. */
    readonly changeFind: (path: string) => HappyAgentGitChangedFile | undefined;
    /** Reads both sides of one working-tree change. */
    readonly read: (
        path: string,
        change: HappyAgentGitChangedFile,
        signal: AbortSignal,
    ) => Promise<HappyAgentChangedFileDocument>;
    /** Reads one file as of a commit, or nothing when the commit lacks it. */
    readonly revisionRead: (
        path: string,
        revision: string,
        signal: AbortSignal,
    ) => Promise<string | undefined>;
    /** Lists the files between two commits, or nothing when they cannot be listed. */
    readonly revisionFilesRead: (
        range: HappyAgentRevisionRange,
        signal: AbortSignal,
    ) => Promise<
        | { readonly files: readonly HappyAgentRevisionFileEntry[]; readonly complete: boolean }
        | undefined
    >;
}

const EMPTY: HappyAgentChangedFileDiffsSnapshot = {
    files: { type: "loading" },
    diffs: new Map(),
    revisionFiles: new Map(),
};

function userError(error: unknown): UserError {
    if (error instanceof UserError) return error;
    return new UserError(
        error instanceof Error && error.message ? error.message : "The change could not be read.",
        undefined,
        error,
    );
}

function filesEqual(left: HappyAgentChangedFiles, right: HappyAgentChangedFiles): boolean {
    if (left.type !== "ready" || right.type !== "ready") return left.type === right.type;
    return (
        left.complete === right.complete &&
        left.base === right.base &&
        left.files.length === right.files.length &&
        left.files.every((file, index) => {
            const other = right.files[index];
            return (
                other !== undefined &&
                other.path === file.path &&
                other.status === file.status &&
                other.addedLines === file.addedLines &&
                other.deletedLines === file.deletedLines
            );
        })
    );
}

export function happyAgentChangedFileDiffsStoreCreate(
    deps: HappyAgentChangedFileDiffsDeps,
): HappyAgentChangedFileDiffsStoreOwned {
    const listeners = new Set<() => void>();
    let snapshot = EMPTY;
    /** Everything asked for, read or not: a path, alone or between two commits. */
    const wanted = new Map<
        HappyAgentChangedFileDiffKey,
        { readonly path: string; readonly range: HappyAgentRevisionRange | undefined }
    >();
    /** Reads in flight under the current subscription, with the identity each is reading. */
    const reading = new Map<
        HappyAgentChangedFileDiffKey,
        { readonly revision: string; readonly abort: AbortController }
    >();
    /** Answers decided inside `request`, published on the next tick. */
    let pending: Map<HappyAgentChangedFileDiffKey, HappyAgentChangedFileDiff> | undefined;
    let active = false;
    let disposed = false;

    const notify = (): void => {
        for (const listener of listeners) listener();
    };
    const publish = (
        entries: ReadonlyMap<HappyAgentChangedFileDiffKey, HappyAgentChangedFileDiff>,
    ): void => {
        if (disposed) return;
        const diffs = new Map(snapshot.diffs);
        for (const [key, diff] of entries) diffs.set(key, diff);
        snapshot = { ...snapshot, diffs };
        notify();
    };
    /** Two-commit file lists asked for, read or not. */
    const wantedRanges = new Map<HappyAgentRevisionRangeKey, HappyAgentRevisionRange>();
    const rangeReading = new Map<HappyAgentRevisionRangeKey, AbortController>();
    /**
     * Reads one two-commit file list while subscribed. Its absence is what
     * says it is loading, so nothing is published until the answer arrives; a
     * failed read is tried again only by a new subscription.
     */
    const rangeEvaluate = (key: HappyAgentRevisionRangeKey, retry: boolean): void => {
        const range = wantedRanges.get(key);
        if (range === undefined || rangeReading.has(key)) return;
        const current = snapshot.revisionFiles.get(key);
        if (current !== undefined && (current.type !== "error" || !retry)) return;
        const abort = new AbortController();
        rangeReading.set(key, abort);
        void deps
            .revisionFilesRead(range, abort.signal)
            .then(
                (files): HappyAgentRevisionFiles =>
                    files === undefined ? { type: "unavailable" } : { type: "ready", ...files },
                (error: unknown): HappyAgentRevisionFiles => ({
                    type: "error",
                    error: userError(error),
                }),
            )
            .then((files) => {
                if (abort.signal.aborted || rangeReading.get(key) !== abort || disposed) return;
                rangeReading.delete(key);
                const revisionFiles = new Map(snapshot.revisionFiles);
                revisionFiles.set(key, files);
                snapshot = { ...snapshot, revisionFiles };
                notify();
            });
    };
    const later = (key: HappyAgentChangedFileDiffKey, diff: HappyAgentChangedFileDiff): void => {
        if (pending === undefined) {
            pending = new Map();
            queueMicrotask(() => {
                const batch = pending;
                pending = undefined;
                if (batch !== undefined) publish(batch);
            });
        }
        pending.set(key, diff);
    };
    const held = (key: HappyAgentChangedFileDiffKey): HappyAgentChangedFileDiff | undefined =>
        pending?.get(key) ?? snapshot.diffs.get(key);
    const settle = (
        key: HappyAgentChangedFileDiffKey,
        revision: string,
        work: (signal: AbortSignal) => Promise<HappyAgentChangedFileDiff>,
    ): void => {
        const abort = new AbortController();
        reading.set(key, { revision, abort });
        if (held(key)?.type !== "loading") later(key, { type: "loading" });
        void work(abort.signal)
            .catch(
                (error: unknown): HappyAgentChangedFileDiff => ({
                    type: "error",
                    error: userError(error),
                    revision,
                }),
            )
            .then((diff) => {
                if (abort.signal.aborted || reading.get(key)?.abort !== abort) return;
                reading.delete(key);
                publish(new Map([[key, diff]]));
            });
    };
    /** Settles a working-tree key on an answer that needs no read. */
    const worktreeAnswer = (
        key: HappyAgentChangedFileDiffKey,
        diff: Exclude<HappyAgentChangedFileDiff, { type: "ready" }>,
    ): void => {
        reading.get(key)?.abort.abort();
        reading.delete(key);
        if (held(key)?.type !== diff.type) later(key, diff);
    };
    /**
     * Brings one wanted key up to date while a subscriber is listening. A read
     * that failed is tried again only when `retry` says a new subscription
     * began, or, for the working tree, when its file's revision moved.
     */
    const evaluate = (key: HappyAgentChangedFileDiffKey, retry: boolean): void => {
        const target = wanted.get(key);
        if (target === undefined) return;
        const current = held(key);
        const inFlight = reading.get(key);
        if (target.range !== undefined) {
            // Two fixed commits never change, so any answer stands.
            if (current?.type === "ready" || current?.type === "missing") return;
            if (current?.type === "error" && !retry) return;
            if (inFlight !== undefined) return;
            const { base, head } = target.range;
            const revision = `${base}..${head}`;
            const path = target.path;
            settle(key, revision, async (signal) => {
                const [oldContent, newContent] = await Promise.all([
                    deps.revisionRead(path, base, signal),
                    deps.revisionRead(path, head, signal),
                ]);
                // One commit on both sides is code read as it is there: only a file
                // that is not in it is missing. Between two, an unchanged file is.
                if (base === head ? newContent === undefined : oldContent === newContent)
                    return { type: "missing" };
                return {
                    type: "ready",
                    document: {
                        path,
                        oldPath: path,
                        oldContent: oldContent ?? "",
                        newContent: newContent ?? "",
                    },
                    revision,
                };
            });
            return;
        }
        // Until the scan has listed the change, a file it does not list yet is
        // not known to be unchanged.
        if (snapshot.files.type === "loading") return worktreeAnswer(key, { type: "loading" });
        if (snapshot.files.type === "unavailable")
            return worktreeAnswer(key, {
                type: "error",
                error: new UserError("This checkout's changes cannot be compared right now."),
            });
        const path = target.path;
        const change = deps.changeFind(path);
        // Not in the change any more: whatever was read is stale, and an answer
        // in flight is for a revision that no longer exists.
        if (change === undefined) return worktreeAnswer(key, { type: "missing" });
        if (current?.type === "ready" && current.revision === change.revision) return;
        if (current?.type === "error" && current.revision === change.revision && !retry) return;
        if (inFlight?.revision === change.revision) return;
        inFlight?.abort.abort();
        settle(key, change.revision, async (signal) => ({
            type: "ready",
            document: await deps.read(path, change, signal),
            revision: change.revision,
        }));
    };
    const start = (): void => {
        if (disposed || active || listeners.size === 0) return;
        active = true;
        for (const key of wanted.keys()) evaluate(key, true);
        for (const key of wantedRanges.keys()) rangeEvaluate(key, true);
    };
    const stop = (): void => {
        active = false;
        // A read cut short leaves its key loading; the next subscriber reads it.
        for (const entry of reading.values()) entry.abort.abort();
        reading.clear();
        for (const abort of rangeReading.values()) abort.abort();
        rangeReading.clear();
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
        request(path, range) {
            if (disposed) return;
            const key = happyAgentChangedFileDiffKey(path, range);
            if (wanted.has(key)) return;
            wanted.set(key, { path, range });
            // Asked while rendering: the read starts after the render, not in it.
            queueMicrotask(() => {
                if (active) evaluate(key, false);
            });
        },
        revisionFilesRequest(range) {
            if (disposed) return;
            const key = happyAgentRevisionRangeKey(range);
            if (wantedRanges.has(key)) return;
            wantedRanges.set(key, range);
            // Asked while rendering: the read starts after the render, not in it.
            queueMicrotask(() => {
                if (active) rangeEvaluate(key, false);
            });
        },
        filesUpdate(files) {
            if (disposed) return;
            if (!filesEqual(snapshot.files, files)) {
                snapshot = { ...snapshot, files };
                notify();
            }
            // A scan is also what says a file moved, so every diff read from the
            // working tree is checked against it, not only the ones re-rendered.
            if (!active) return;
            for (const [key, target] of wanted)
                if (target.range === undefined) evaluate(key, false);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            wanted.clear();
            wantedRanges.clear();
            pending = undefined;
            listeners.clear();
        },
    };
}

const NOOP: HappyAgentChangedFileDiffsSnapshot = {
    files: { type: "unavailable" },
    diffs: new Map(),
    revisionFiles: new Map(),
};

/** The store a surface with no checkout behind it uses: nothing can be compared. */
export const happyAgentChangedFileDiffsStoreNoop: HappyAgentChangedFileDiffsStore = {
    get: () => NOOP,
    subscribe: () => () => undefined,
    request: () => undefined,
    revisionFilesRequest: () => undefined,
    [Symbol.dispose]: () => undefined,
};
