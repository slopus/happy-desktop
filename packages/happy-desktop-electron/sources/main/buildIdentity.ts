import { execFileSync } from "node:child_process";
import { unwatchFile, watch, watchFile, type FSWatcher } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { DesktopBuildIdentity } from "../shared/desktopContract";

/** Branches that are the baseline rather than a piece of work in progress. */
const DEFAULT_BRANCHES = new Set(["main", "master"]);

/** How long after the last touch of HEAD the checkout is read again. */
const READ_SETTLE_MS = 150;

/** How often HEAD is looked at when the directory cannot be watched. */
const POLL_INTERVAL_MS = 1000;

function git(cwd: string, args: readonly string[]): string | undefined {
    try {
        const output = execFileSync("git", args, {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 5000,
        }).trim();
        return output.length > 0 ? output : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Names the checkout a development window is running from, so several of them on
 * one screen are told apart without guessing. A packaged Happy has no identity to
 * report: it is the product, and the window says so by saying nothing.
 *
 * The short label is what the reader actually calls this thing. A linked worktree
 * is known by its directory — that is the name it was created with and the name
 * in the path they cd into — while the primary checkout is known by its branch,
 * falling back to plain "dev" while it sits on the default branch with nothing in
 * particular going on.
 */
export function desktopBuildIdentityRead(
    packaged: boolean,
    checkout: string,
): DesktopBuildIdentity | undefined {
    if (packaged) return undefined;
    const root = git(checkout, ["rev-parse", "--show-toplevel"]);
    if (!root) return undefined;
    const branch = git(checkout, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? "HEAD";
    // A linked worktree keeps its own git directory while the common one stays
    // with the checkout it was made from; equal paths mean this is that checkout.
    const gitDir = git(checkout, ["rev-parse", "--git-dir"]);
    const commonDir = git(checkout, ["rev-parse", "--git-common-dir"]);
    const worktree =
        gitDir !== undefined &&
        commonDir !== undefined &&
        resolve(checkout, gitDir) !== resolve(checkout, commonDir);
    const label = worktree
        ? basename(root)
        : branch !== "HEAD" && !DEFAULT_BRANCHES.has(branch)
          ? branch
          : "dev";
    return { branch, label, path: root };
}

export interface DesktopBuildIdentityWatch {
    /** Reads the checkout again now, for a moment the file watcher may have missed. */
    refresh(): void;
    dispose(): void;
}

function identityEqual(a: DesktopBuildIdentity, b: DesktopBuildIdentity): boolean {
    return a.branch === b.branch && a.label === b.label && a.path === b.path;
}

/**
 * Follows the checkout a development build runs from, so a window says which
 * branch is checked out now rather than which one was at launch. A branch is
 * switched, a rebase detaches HEAD and reattaches it, and the window on screen
 * should say so without being restarted.
 *
 * Git rewrites HEAD by writing a new file into place, so the directory holding
 * it is watched rather than the file itself, which the rename would orphan. That
 * directory is the checkout's own: `--git-path HEAD` names `.git/HEAD` for the
 * primary checkout and `.git/worktrees/<name>/HEAD` for a linked worktree, so
 * each worktree's window follows its own HEAD and no other's. One checkout
 * touches HEAD several times, so reads are held until the touches settle, and
 * only an identity that actually differs is reported.
 *
 * A directory watch is not guaranteed on macOS — the process may be out of
 * file descriptors, or the watch may fail later — so when it cannot be had the
 * HEAD file is polled by path instead. Polling by path survives the rename
 * that a watch on the file itself would not.
 */
export function desktopBuildIdentityWatch(
    checkout: string,
    initial: DesktopBuildIdentity,
    onChange: (identity: DesktopBuildIdentity) => void,
): DesktopBuildIdentityWatch {
    let current = initial;
    let settle: NodeJS.Timeout | undefined;
    let disposed = false;
    const read = () => {
        settle = undefined;
        if (disposed) return;
        const next = desktopBuildIdentityRead(false, checkout);
        if (!next || identityEqual(current, next)) return;
        current = next;
        onChange(next);
    };
    const schedule = () => {
        if (disposed) return;
        if (settle !== undefined) clearTimeout(settle);
        settle = setTimeout(read, READ_SETTLE_MS);
    };
    const headPath = git(checkout, ["rev-parse", "--git-path", "HEAD"]);
    const head = headPath === undefined ? undefined : resolve(checkout, headPath);
    let watcher: FSWatcher | undefined;
    let polling = false;
    const pollStart = () => {
        if (head === undefined || polling || disposed) return;
        polling = true;
        watchFile(head, { interval: POLL_INTERVAL_MS, persistent: false }, schedule);
    };
    if (head !== undefined) {
        try {
            watcher = watch(dirname(head), (_event, filename) => {
                if (filename === null || filename === basename(head)) schedule();
            });
            watcher.on("error", () => {
                watcher?.close();
                watcher = undefined;
                pollStart();
            });
        } catch {
            watcher = undefined;
            pollStart();
        }
    }
    return {
        refresh: schedule,
        dispose() {
            disposed = true;
            if (settle !== undefined) clearTimeout(settle);
            watcher?.close();
            if (head !== undefined && polling) unwatchFile(head, schedule);
        },
    };
}
