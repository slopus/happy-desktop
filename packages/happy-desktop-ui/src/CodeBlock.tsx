import { EXTENSION_TO_FILE_FORMAT } from "@pierre/diffs";
import { File } from "@pierre/diffs/react";
import type { CSSProperties, ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import { PIERRE_PANE_CSS, pierreCodeSurfacePhase } from "./pierreCodeSurface";

/** Do not retain Pierre ASTs for unusually large documents. */
export const CODE_BLOCK_HIGHLIGHT_CACHE_MAX_TEXT_LENGTH = 512 * 1024;

/** Every language name Pierre's own extension table can produce. */
const FENCE_LANGUAGES = new Set<string>(
    Object.values(EXTENSION_TO_FILE_FORMAT).filter((name) => name !== undefined),
);

/**
 * The highlighting language a Markdown fence info string asks for, or undefined
 * when it names nothing this renderer knows.
 *
 * A fence is written by a person, so `ts`, `typescript`, and `TS` all mean the
 * same thing. Pierre's extension table already answers the first form and its
 * values are the second, so consulting it both ways covers what people write
 * without a second language list to keep in step. An unknown word resolves to
 * nothing rather than being passed through: Shiki throws on a language it
 * cannot load, and a fence saying `pseudocode` must render as text, not fail.
 */
export function codeBlockLanguage(info: string | undefined): string | undefined {
    if (info === undefined) return undefined;
    const word =
        info
            .trim()
            .toLowerCase()
            .split(/[\s,:{]/)[0] ?? "";
    if (word.length === 0) return undefined;
    const mapped = EXTENSION_TO_FILE_FORMAT[word];
    if (mapped !== undefined) return mapped;
    return FENCE_LANGUAGES.has(word) ? word : undefined;
}

export type CodeBlockProps = {
    className?: string;
    style?: CSSProperties;
    /** The code itself. */
    text: string;
    /**
     * File name the language is inferred from — pass it whenever the code came
     * from a file, since a name answers what a fence label only guesses at.
     */
    name?: string;
    /**
     * Explicit language, for code with no file behind it. A Markdown fence's
     * info string goes through `codeBlockLanguage` first.
     */
    lang?: string;
    /**
     * Stable content identity for Pierre's worker-pool AST cache. Callers that
     * can identify authoritative bytes should pass it; transient drafts omit it
     * so they can never replace a saved file's cached result.
     */
    cacheKey?: string;
    /** Numbers the lines. On for a file, off for a snippet inside prose. */
    lineNumbers?: boolean;
};

export type CodeBlockFrameProps = {
    readonly children: ReactNode;
    readonly className?: string;
    readonly "data-happy-desktop-ui"?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    /** Exact displayed code copied by the frame action. */
    readonly text: string;
};

/**
 * The shared Markdown code-block frame: a reserved action strip above any code
 * renderer, with one quiet copy action that never covers code or its scrollbar.
 */
export function CodeBlockFrame(props: CodeBlockFrameProps) {
    return (
        <div
            className={["happy-code-block-frame", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui={props["data-happy-desktop-ui"] ?? "code-block-frame"}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <CopyButton
                className="happy-code-block-frame__copy"
                data-happy-desktop-ui="code-block-copy"
                label="Copy code"
                text={props.text}
            />
            {props.children}
        </div>
    );
}

/**
 * C-174 CodeBlock — code with syntax highlighting, wherever code is read.
 *
 * One renderer for every piece of code the product shows outside an editor: the
 * source face of the file viewer, a fenced block in a document. Pierre Diffs
 * tokenizes it with Shiki, which is the same engine the working-tree diff uses,
 * so a file read on its own and the same file read as a change are the same
 * colors and the same type rather than two palettes that merely resemble each
 * other.
 *
 * Colors follow the surrounding theme through `color-scheme`, which the theme
 * sets and the renderer's shadow tree inherits — there is no appearance prop to
 * thread down and nothing to keep in step when the theme changes. Tokenizing
 * happens in the shared worker pool whenever a `CodeHighlightWorkers` provider
 * is mounted above, and on the main thread when none is.
 */
export function CodeBlock(props: CodeBlockProps) {
    const cacheKey =
        props.cacheKey !== undefined &&
        props.text.length <= CODE_BLOCK_HIGHLIGHT_CACHE_MAX_TEXT_LENGTH
            ? props.cacheKey
            : undefined;
    return (
        <File
            className={["happy-code-block", props.className].filter(Boolean).join(" ")}
            file={{
                name: props.name ?? "snippet",
                contents: props.text,
                // Pierre reads the name when no language is given, so a snippet
                // with neither says plain text rather than guessing from the
                // placeholder name it was handed.
                lang: props.lang ?? (props.name === undefined ? "text" : undefined),
                ...(cacheKey === undefined ? {} : { cacheKey }),
            }}
            options={{
                disableFileHeader: true,
                disableLineNumbers: props.lineNumbers !== true,
                overflow: "scroll",
                onPostRender: (node, _instance, phase) => pierreCodeSurfacePhase(node, phase),
                theme: { dark: "pierre-dark", light: "pierre-light" },
                // Whatever scrolls this code is outside the renderer, so its own
                // reserved gutter would only leave a dead lane beside every line.
                unsafeCSS: PIERRE_PANE_CSS,
            }}
            style={props.style}
        />
    );
}
