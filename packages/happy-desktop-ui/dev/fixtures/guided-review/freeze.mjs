/*
 * Freezes one real change into a fixture the guided-review Blueprint page
 * draws tours over.
 *
 *   node dev/fixtures/guided-review/freeze.mjs <name> <commit|worktree> [path ...]
 *
 * Every changed file's path and status is recorded. Both sides' full text are
 * recorded only for the paths listed, which are the files a tour points a diff
 * node at; a tour may still name any changed file. Line numbers in a tour are
 * checked against these frozen contents, never against the live checkout.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [name, ref, ...withContents] = process.argv.slice(2);
if (!name || !ref) {
    console.error("Usage: freeze.mjs <name> <commit|worktree> [path ...]");
    process.exit(1);
}
const workspace = resolve(import.meta.dirname, "../../../../..");
const git = (args, allowFail = false) => {
    try {
        return execFileSync("git", args, {
            cwd: workspace,
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (error) {
        if (allowFail) return "";
        throw error;
    }
};
const worktree = ref === "worktree";
const statusLines = worktree
    ? [
          ...git(["diff", "--name-status", "HEAD"]).split("\n"),
          ...git(["ls-files", "--others", "--exclude-standard"])
              .split("\n")
              .filter(Boolean)
              .map((path) => `A\t${path}`),
      ]
    : git(["show", "--name-status", "--format=", ref]).split("\n");
const STATUS = { A: "added", D: "deleted", M: "modified", R: "renamed" };
const files = statusLines
    .filter(Boolean)
    .map((line) => {
        const [code, ...rest] = line.split("\t");
        return { path: rest.at(-1), status: STATUS[code[0]] ?? "modified" };
    })
    .filter((file) => !file.path.startsWith(".context/") && !file.path.startsWith("master-plans/"));
const subject = worktree ? "Working tree" : git(["show", "--format=%s", "--no-patch", ref]).trim();
const contents = {};
for (const path of withContents) {
    const file = files.find((candidate) => candidate.path === path);
    if (!file) throw new Error(`${path} is not changed in ${ref}`);
    const oldContent =
        file.status === "added"
            ? ""
            : git(["show", `${worktree ? "HEAD" : `${ref}^`}:${path}`], true);
    const newContent =
        file.status === "deleted"
            ? ""
            : worktree
              ? readFileSync(join(workspace, path), "utf8")
              : git(["show", `${ref}:${path}`]);
    contents[path] = { oldContent, newContent };
}
const out = join(import.meta.dirname, `${name}.json`);
writeFileSync(out, `${JSON.stringify({ name, ref, subject, files, contents }, null, 1)}\n`);
console.log(
    `${out}: ${String(files.length)} files, ${String(Object.keys(contents).length)} with contents`,
);
