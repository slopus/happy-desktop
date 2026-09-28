import type { HappyAgentFileLineRange } from "happy-desktop-state";

/**
 * A file, and the run of lines in it somebody was talking about.
 *
 * Everything that writes about code names a region the same way — the path, a
 * colon, and the line — so this is what a reference in a message, a tool
 * result, or a link target resolves to before anything opens it. The lines are
 * optional because most references are to the whole file.
 */
export interface FileReference {
    readonly path: string;
    readonly selection?: HappyAgentFileLineRange;
}

/**
 * Opens a file a surface points at, at the lines it pointed at when it named
 * some. The region is a separate argument rather than part of the path so that
 * every caller that only has a file to open stays exactly as it was.
 */
export type FileOpenHandler = (path: string, selection?: HappyAgentFileLineRange) => void;

/** Lines are counted from 1, and a file nobody would write about is this long. */
const LINE_MAX = 10_000_000;

/**
 * The shape of a written file reference: a path ending in an extension,
 * followed by the lines.
 *
 * Requiring both ends is what keeps this from claiming ordinary prose. A bare
 * word with no extension is a word; an extension with no line number is usually
 * a file being named rather than a place being pointed at, and the product
 * already has a listing for finding those. Together — `Store.ts:120`,
 * `packages/app/src/View.tsx:88-104` — they are unmistakably someone saying
 * "look here", which is the thing worth making clickable.
 *
 * The leading boundary rejects a reference that is really part of something
 * longer: the tail of a URL, a Windows drive, or a word ending in a dot. A
 * trailing digit is rejected too, so a truncated number cannot be read as a
 * whole one — but ordinary punctuation after the line is left alone, because a
 * sentence ends in a full stop and the reference is still a reference.
 */
const REFERENCE_PATTERN =
    /(?<![\w@:./\\-])((?:[\w.+-]+\/)*[\w+-][\w.+-]*\.[A-Za-z][A-Za-z\d]{0,9})(:\d{1,8}(?:-\d{1,8})?(?::\d{1,8})?)(?!\d)/;

/** A fresh matcher; a global regex carries its own cursor and cannot be shared. */
export function fileReferencePattern(): RegExp {
    return new RegExp(REFERENCE_PATTERN, "gu");
}

/**
 * Extensions a file someone would point into is known to end in. Source, the
 * files beside source, and the documents written about it.
 *
 * The shape alone is not enough: `api.example.com:443`, `db.internal:5432`,
 * and `redis.io:6379` are each a dotted name and a number, and a top-level
 * domain is indistinguishable from an extension by looks. A name with a
 * directory in it is a path whatever it ends in; a bare name has to end in
 * something files end in.
 */
const SOURCE_EXTENSIONS = new Set([
    "astro",
    "bash",
    "bat",
    "c",
    "cc",
    "cfg",
    "cjs",
    "clj",
    "cljs",
    "cmd",
    "conf",
    "cpp",
    "cs",
    "css",
    "csv",
    "cts",
    "cxx",
    "dart",
    "el",
    "env",
    "erl",
    "ex",
    "exs",
    "fish",
    "fs",
    "go",
    "gql",
    "gradle",
    "graphql",
    "groovy",
    "h",
    "hcl",
    "hh",
    "hpp",
    "hs",
    "htm",
    "html",
    "hxx",
    "ini",
    "java",
    "jl",
    "js",
    "json",
    "json5",
    "jsonc",
    "jsx",
    "kt",
    "kts",
    "less",
    "lisp",
    "lock",
    "lua",
    "m",
    "md",
    "mdx",
    "mjs",
    "ml",
    "mli",
    "mm",
    "mts",
    "nim",
    "php",
    "pl",
    "pm",
    "proto",
    "ps1",
    "py",
    "r",
    "rb",
    "rkt",
    "rs",
    "sass",
    "scala",
    "scm",
    "scss",
    "sh",
    "sol",
    "sql",
    "svelte",
    "svg",
    "swift",
    "tex",
    "tf",
    "toml",
    "ts",
    "tsv",
    "tsx",
    "txt",
    "v",
    "vim",
    "vue",
    "xml",
    "yaml",
    "yml",
    "zig",
    "zsh",
]);

/**
 * Whether a name the pattern accepted is one a file would actually have: a
 * path with a directory in it, or a bare name ending in a source extension.
 */
export function fileReferencePathPlausible(path: string): boolean {
    if (path.includes("/")) return true;
    const dot = path.lastIndexOf(".");
    return dot !== -1 && SOURCE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

/**
 * Every written file reference in a run of prose, in order, as the text that
 * was matched and where it starts.
 */
export function fileReferenceMatches(
    value: string,
): readonly { readonly index: number; readonly text: string }[] {
    const pattern = fileReferencePattern();
    const matches: { index: number; text: string }[] = [];
    let match = pattern.exec(value);
    while (match !== null) {
        const path = match[1];
        if (path !== undefined && fileReferencePathPlausible(path))
            matches.push({ index: match.index, text: match[0] });
        match = pattern.exec(value);
    }
    return matches;
}

/** Whether this whole string is one written file reference and nothing else. */
export function fileReferenceIsWhole(value: string): boolean {
    const match = new RegExp(`^${REFERENCE_PATTERN.source}$`, "u").exec(value);
    return match !== null && match[1] !== undefined && fileReferencePathPlausible(match[1]);
}

/**
 * A `:line`, `:line-line`, or `:line:column` tail read as the region it names,
 * or nothing when the string does not end in one.
 *
 * A column is accepted and dropped: it says where in a line something sits, and
 * what a reader asked for is the line. An end before its start is read as the
 * pair someone meant rather than refused, since `120-118` is a typo and not an
 * instruction to show nothing.
 */
export function fileReferenceSplit(value: string): FileReference {
    const match = /^(.*?):(\d{1,8})(?:-(\d{1,8}))?(?::\d{1,8})?$/u.exec(value);
    if (!match || match[1] === undefined || match[1].length === 0) return { path: value };
    const start = Number(match[2]);
    const end = match[3] === undefined ? start : Number(match[3]);
    if (start < 1 || start > LINE_MAX || end < 1 || end > LINE_MAX) return { path: value };
    return {
        path: match[1],
        selection: { startLine: Math.min(start, end), endLine: Math.max(start, end) },
    };
}

/**
 * The same region written the way a code host links it — `#L120`, `#L120-L148`
 * — read off a link's fragment. A copied GitHub address is a reference someone
 * pasted in, and it means exactly what the colon form means.
 */
export function fileReferenceFragment(fragment: string): HappyAgentFileLineRange | undefined {
    const match = /^L(\d{1,8})(?:-L?(\d{1,8}))?$/u.exec(fragment);
    if (!match) return undefined;
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || start > LINE_MAX || end < 1 || end > LINE_MAX) return undefined;
    return { startLine: Math.min(start, end), endLine: Math.max(start, end) };
}
