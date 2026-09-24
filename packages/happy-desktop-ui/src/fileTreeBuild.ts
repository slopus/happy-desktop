import type { FileTreeGitStatus, FileTreeNode } from "./FileTree";
import { fileEntriesSort } from "./fileTreeSort";

export interface FileTreeBuildEntry {
    readonly path: string;
    readonly gitStatus?: FileTreeGitStatus;
    readonly addedLines?: number;
    readonly deletedLines?: number;
}

/**
 * Which directories are open, as the two things that are actually known: what
 * the reader has said, and what a listing nobody has touched yet should look
 * like.
 *
 * Holding only a set of open paths cannot tell "the reader closed this" apart
 * from "the reader has not opened it", so a listing that wants to start part
 * way open has to seed that set — and then reopens, on the next reload, every
 * directory the reader deliberately shut. Recording the decisions instead
 * leaves the default free to be a rule rather than a copy of one moment's
 * state.
 */
export interface FileTreeExpansion {
    /** Directories the reader opened. */
    readonly opened: ReadonlySet<string>;
    /** Directories the reader closed, including ones that open on their own. */
    readonly closed: ReadonlySet<string>;
    /**
     * How many levels stand open before the reader has said anything. `1` opens
     * every top-level row, which is what makes a listing land showing the
     * checkout and one level of what is in it rather than a column of shut
     * folders.
     */
    readonly defaultDepth: number;
}

/** Whether a directory at this depth is open, given what the reader has said. */
export function fileTreeExpanded(
    expansion: FileTreeExpansion,
    path: string,
    depth: number,
): boolean {
    if (expansion.opened.has(path)) return true;
    if (expansion.closed.has(path)) return false;
    return depth < expansion.defaultDepth;
}

/** The per-entry facts a node carries verbatim, whichever shape it is built into. */
function entryFacts(entry: FileTreeBuildEntry) {
    return {
        ...(entry.gitStatus ? { gitStatus: entry.gitStatus } : {}),
        ...(entry.addedLines === undefined ? {} : { addedLines: entry.addedLines }),
        ...(entry.deletedLines === undefined ? {} : { deletedLines: entry.deletedLines }),
    };
}

/**
 * Turns a flat list of repository-relative paths into `FileTree` nodes.
 *
 * Directories keep their full path as their id, matching the files beneath
 * them, so expansion state and selection are addressed the same way everywhere
 * — the panel never has to invent a second naming scheme for folders. The id is
 * always the real path, never the label a row happens to print: a joined
 * `a/b/c` row still opens, selects, and reports the directory it actually is.
 *
 * A directory chain with nothing in it but one more directory is joined into a
 * single `a/b/c` row. A repository whose sources sit four levels down otherwise
 * opens as four rows of scaffolding before anything worth reading, and every one
 * of them has to be expanded by hand.
 *
 * Rows come out in `filePathCompare` order, which already puts directories
 * ahead of files at every level, so nothing is sorted a second time on the way
 * out and opening a directory costs one walk rather than one sort.
 */
export function fileTreeBuild(
    entries: readonly FileTreeBuildEntry[],
    expansion: FileTreeExpansion,
): FileTreeNode[] {
    interface Directory {
        readonly children: Map<string, Directory>;
        readonly files: (FileTreeBuildEntry & { name: string })[];
    }
    const directoryCreate = (): Directory => ({ children: new Map(), files: [] });
    const root = directoryCreate();

    for (const entry of fileEntriesSort(entries)) {
        const segments = entry.path.split("/").filter((segment) => segment.length > 0);
        const name = segments.pop();
        if (name === undefined) continue;
        let directory = root;
        for (const segment of segments) {
            let child = directory.children.get(segment);
            if (!child) {
                child = directoryCreate();
                directory.children.set(segment, child);
            }
            directory = child;
        }
        directory.files.push({ ...entry, name });
    }

    const nodesOf = (directory: Directory, prefix: string, depth: number): FileTreeNode[] => {
        const directories: FileTreeNode[] = [];
        for (const [segment, child] of directory.children) {
            let label = segment;
            let path = prefix ? `${prefix}/${segment}` : segment;
            let node = child;
            // Collapse the chain while this level holds exactly one directory
            // and no files of its own — there is nothing to choose between here.
            while (node.files.length === 0 && node.children.size === 1) {
                const [nextSegment, nextChild] = [...node.children][0]!;
                label = `${label}/${nextSegment}`;
                path = `${path}/${nextSegment}`;
                node = nextChild;
            }
            const open = fileTreeExpanded(expansion, path, depth);
            directories.push({
                id: path,
                name: label,
                kind: "directory",
                expanded: open,
                // Children are built only for an open directory: the whole tree
                // is already in memory, but handing every unopened branch to the
                // renderer would build a repository's worth of rows nobody asked
                // to see.
                ...(open ? { children: nodesOf(node, path, depth + 1) } : {}),
            });
        }
        const files = directory.files.map((file) => ({
            id: file.path,
            name: file.name,
            kind: "file" as const,
            ...entryFacts(file),
        }));
        return [...directories, ...files];
    };

    return nodesOf(root, "", 0);
}

/**
 * The same entries as one row per file.
 *
 * A flat listing is read by file name, so the name is the last segment and the
 * directory that holds it travels beside it as secondary text. Labelling the row
 * with the whole path instead put the only word being looked for at the far end
 * of the line, where it is the first thing an ellipsis eats.
 *
 * The rows are in the same order the nested shape would draw them in, so
 * switching between the two moves a file's neighbours around it rather than
 * moving the file.
 */
export function fileTreeFlatten(entries: readonly FileTreeBuildEntry[]): FileTreeNode[] {
    return fileTreeRows(fileEntriesSort(entries));
}

/**
 * The same rows, in the order they were given.
 *
 * For a ranked answer, where the order is the answer: sorting search results by
 * path would throw away which of them the checkout thought was the best match
 * and bury it under whatever happens to sort first.
 */
export function fileTreeRanked(entries: readonly FileTreeBuildEntry[]): FileTreeNode[] {
    return fileTreeRows(entries);
}

function fileTreeRows(entries: readonly FileTreeBuildEntry[]): FileTreeNode[] {
    return entries.map((entry) => {
        const cut = entry.path.lastIndexOf("/");
        return {
            id: entry.path,
            name: cut === -1 ? entry.path : entry.path.slice(cut + 1),
            kind: "file" as const,
            ...(cut === -1 ? {} : { directory: entry.path.slice(0, cut) }),
            ...entryFacts(entry),
        };
    });
}

/**
 * The files of a built tree in the order they are drawn, skipping the ones a
 * closed directory is hiding.
 *
 * A range selection means "everything between these two rows", and what lies
 * between them is a question about the arrangement on screen, not about the
 * paths: the same two files have different neighbours flat than they do nested
 * under half-open folders. Directories are left out because a range picks files
 * to act on, and a folder is not one of them.
 */
export function fileTreeVisibleFiles(nodes: readonly FileTreeNode[]): string[] {
    const paths: string[] = [];
    const walk = (level: readonly FileTreeNode[]): void => {
        for (const node of level) {
            if (node.kind === "file") paths.push(node.id);
            else if (node.expanded && node.children) walk(node.children);
        }
    };
    walk(nodes);
    return paths;
}
