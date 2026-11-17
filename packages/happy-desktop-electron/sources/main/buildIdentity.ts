import { basename } from "node:path";
import { resolve } from "node:path";
import type { DesktopBuildIdentity } from "../shared/desktopContract";
import { execFileHiddenSync } from "./childProcess";

/** Branches that are the baseline rather than a piece of work in progress. */
const DEFAULT_BRANCHES = new Set(["main", "master"]);

function git(cwd: string, args: readonly string[]): string | undefined {
    try {
        const output = execFileHiddenSync("git", args, {
            cwd,
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
