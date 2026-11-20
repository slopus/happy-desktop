import {
    File,
    FileDiff,
    getFiletypeFromFileName,
    getHighlighterOptions,
    getSharedHighlighter,
    parsePatchFiles,
    type BaseCodeOptions,
} from "@pierre/diffs";
import { codeBlockLanguage } from "./codeBlockLanguage";
import { PIERRE_PANE_CSS } from "./pierreCodeSurface";

/** The artifact components' host-renderer contract, /api/v1/code.js. */
export const version = 1;

export interface ArtifactCodeRendering {
    dispose(): void;
}

export interface ArtifactDiffInput {
    readonly patch: string;
    readonly path: string;
    readonly previousPath: string | null;
    readonly status: "added" | "deleted" | "renamed" | "modified";
    readonly wrap: boolean;
}

export interface ArtifactCodeInput {
    readonly code: string;
    readonly path: string | null;
    readonly name: string | null;
    readonly language: string | null;
    readonly lines: { readonly first: number; readonly last: number } | null;
    readonly lineNumbers: boolean;
    readonly wrap: boolean;
}

// Both themes are tokenized together: inherited color-scheme switches appearance
// in place, without observers, new renderers, or replacing the selected code.
const theme = { dark: "pierre-dark", light: "pierre-light" } as const;

function options(wrap: boolean): BaseCodeOptions {
    return {
        theme,
        overflow: wrap ? "wrap" : "scroll",
        disableVirtualizationBuffers: true,
        unsafeCSS: PIERRE_PANE_CSS,
    };
}

function mount(
    target: HTMLElement,
    instance: File | FileDiff,
    render: (container: HTMLElement) => void,
): ArtifactCodeRendering {
    const container = target.ownerDocument.createElement("diffs-container");
    target.append(container);
    try {
        render(container);
    } catch (error) {
        instance.cleanUp();
        container.remove();
        throw error;
    }
    let disposed = false;
    return {
        dispose() {
            if (disposed) return;
            disposed = true;
            instance.cleanUp();
            container.remove();
        },
    };
}

/** Draws one already-selected file patch, including Pierre's path, status, and counts. */
export async function renderDiff(
    target: HTMLElement,
    input: ArtifactDiffInput,
): Promise<ArtifactCodeRendering> {
    const files = parsePatchFiles(input.patch, undefined, true).flatMap((patch) => patch.files);
    const diff = files[0];
    if (files.length !== 1 || diff === undefined)
        throw new Error("The code renderer requires one file patch.");
    // The component supplied the authoritative paths separately from patch text.
    // In particular, a deletion's display path is not /dev/null.
    diff.name = input.path;
    diff.prevName = input.previousPath ?? undefined;
    const lang = diff.lang ?? getFiletypeFromFileName(input.path);
    await getSharedHighlighter(getHighlighterOptions(lang, { theme }));
    const instance = new FileDiff({
        ...options(input.wrap),
        disableFileHeader: false,
        disableErrorHandling: true,
        diffStyle: "unified",
        diffIndicators: "bars",
        // A quote starts at its first selected line. Only gaps between hunks
        // need a separator; a leading omitted-context label repeats its setup.
        hunkSeparators: "simple",
        lineHoverHighlight: "both",
        lineDiffType: "word-alt",
    });
    return mount(target, instance, (container) => {
        // A sticky line-number gutter cannot mask scrolling source with a
        // transparent base. Use the same opaque page material as the app.
        const background = "var(--happy-host-code-background, Canvas)";
        container.style.setProperty("--diffs-light-bg", background);
        container.style.setProperty("--diffs-dark-bg", background);
        instance.render({ fileDiff: diff, fileContainer: container });
    });
}

/*
 * A quote of a few lines from a large file must not cost the whole file. Pierre
 * tokenizes every line it is given, in both themes, synchronously, and a page
 * quoting one long file three times paid for it three times: seconds of the
 * guest's main thread, during which the chat around it stutters.
 *
 * A line's highlighting depends only on the lines before it, through the
 * grammar state they end in, never on the lines after. So a quote gives Pierre
 * the file only up to its last line, and Pierre's one highlighter call for it
 * is answered from the quote's first line on, continuing from the grammar state
 * the lines above end in. Those lines are never shown and stand in empty. Their
 * state is read in chunks that yield to the page between them, and kept per
 * file at chunk boundaries, so a later quote of the same file reads on from the
 * nearest one before it instead of from the top.
 */

/** Pierre's own default, stated so the grammar context is read exactly as Pierre reads the quote. */
const TOKENIZE_MAX_LINE_LENGTH = 1_000;
/**
 * Lines read between yields to the page, and between kept grammar states. In
 * a guest quoting 35 files, 1 000 held its main thread for over a second at a
 * time; 100 keeps each read short enough for the page to keep drawing.
 */
const CONTEXT_CHUNK = 100;
/** Files whose grammar states are kept. */
const CONTEXT_FILES = 8;
/** Languages without a grammar: nothing carries from one line to the next. */
const PLAIN_LANGUAGES = new Set(["text", "plaintext", "txt", "plain", "ansi"]);

type Highlighter = Awaited<ReturnType<typeof getSharedHighlighter>>;
type GrammarState = NonNullable<ReturnType<Highlighter["codeToTokens"]>["grammarState"]>;

interface GrammarContext {
    /** The offset each line starts at, as Shiki splits lines. */
    readonly starts: readonly number[];
    /** Grammar states at line boundaries, by the line they start, ascending. */
    readonly states: { readonly line: number; readonly state: GrammarState }[];
    /** Reads one after another, so a quote reuses the states the one before it kept. */
    queue: Promise<unknown>;
}

const contexts = new Map<string, GrammarContext>();

function lineStarts(code: string): number[] {
    const starts = [0];
    for (const match of code.matchAll(/\r?\n/g)) starts.push(match.index + match[0].length);
    return starts;
}

function contextOf(lang: string, code: string): GrammarContext {
    const key = `${lang}\n${code}`;
    let context = contexts.get(key);
    if (context === undefined) {
        context = { starts: lineStarts(code), states: [], queue: Promise.resolve() };
        if (contexts.size >= CONTEXT_FILES) contexts.delete(contexts.keys().next().value!);
    } else contexts.delete(key);
    contexts.set(key, context);
    return context;
}

/** The grammar state the lines before `line` (0-based) end in. */
function grammarStateAt(
    highlighter: Highlighter,
    lang: string,
    code: string,
    context: GrammarContext,
    line: number,
): Promise<GrammarState | undefined> {
    const read = context.queue.then(async () => {
        const before = context.states.filter((entry) => entry.line <= line);
        let at = before.at(-1)?.line ?? 0;
        let state = before.at(-1)?.state;
        while (at < line) {
            // Each chunk is a task of its own, so the quotes of several files
            // read their context in turns, and the page draws between them.
            await new Promise((resolve) => setTimeout(resolve, 0));
            const to = Math.min(line, (Math.floor(at / CONTEXT_CHUNK) + 1) * CONTEXT_CHUNK);
            state = highlighter.codeToTokens(code.slice(context.starts[at], context.starts[to]), {
                lang,
                themes: theme,
                defaultColor: false,
                tokenizeMaxLineLength: TOKENIZE_MAX_LINE_LENGTH,
                tokenizeTimeLimit: 0,
                ...(state === undefined ? {} : { grammarState: state }),
            }).grammarState;
            at = to;
            if (state === undefined) return undefined;

            const index = context.states.findIndex((entry) => entry.line > at);
            context.states.splice(index === -1 ? context.states.length : index, 0, {
                line: at,
                state,
            });
        }
        return state;
    });
    context.queue = read.catch(() => undefined);
    return read;
}

/**
 * Runs Pierre's render with its highlighter call for `contents` answered from
 * line `first` (0-based, starting at offset `start`) on, starting in `state`.
 * The lines above are given to Pierre's line numbering as empty lines it never
 * shows. Pierre renders synchronously once the highlighter has the language,
 * so the call is answered within `render`; should it ever highlight later, it
 * highlights `contents` as given, which is correct, only slower.
 */
function renderFrom(
    highlighter: Highlighter,
    contents: string,
    first: number,
    start: number,
    state: GrammarState,
    render: () => void,
): void {
    const codeToHast = highlighter.codeToHast;
    highlighter.codeToHast = (code, hastOptions) => {
        if (code !== contents) return codeToHast.call(highlighter, code, hastOptions);
        return codeToHast.call(highlighter, code.slice(start), {
            ...hastOptions,
            grammarState: state,
            transformers: [
                {
                    pre(pre) {
                        const element = pre.children[0];
                        if (element?.type !== "element" || element.tagName !== "code") return;
                        element.children.unshift(
                            ...Array.from({ length: first }, () => ({
                                type: "element" as const,
                                tagName: "span",
                                properties: { class: "line" },
                                children: [],
                            })),
                        );
                    },
                },
                ...(hastOptions.transformers ?? []),
            ],
        });
    };
    try {
        render();
    } finally {
        highlighter.codeToHast = codeToHast;
    }
}

/** Highlights a quote from the grammar state the lines above it end in, never the whole file. */
export async function renderCode(
    target: HTMLElement,
    input: ArtifactCodeInput,
): Promise<ArtifactCodeRendering> {
    const name = input.path ?? input.name ?? "snippet";
    const lang =
        input.language === null
            ? getFiletypeFromFileName(name)
            : (codeBlockLanguage(input.language) ?? "text");
    const highlighter = await getSharedHighlighter(getHighlighterOptions(lang, { theme }));
    // Shiki splits lines at \r?\n only; a lone \r would number them differently.
    const quote = input.lines !== null && !/\r(?!\n)/.test(input.code) ? input.lines : null;
    let contents = input.code;
    let context: { readonly start: number; readonly state: GrammarState } | undefined;
    // Pierre sizes the line-number column from the lines it is given, which
    // for a quote end at its last line. The whole file's last number sets it
    // instead, as when Pierre had the whole file, so every quote of a file
    // starts its code at the same place.
    let numberWidth: string | undefined;
    if (quote !== null) {
        const grammar = contextOf(lang, input.code);
        numberWidth = `${String(String(grammar.starts.length).length)}ch`;
        const end = grammar.starts[quote.last];
        // Without its last newline, so the file ends on the quote's last line.
        if (end !== undefined) contents = input.code.slice(0, end).replace(/\r?\n$/, "");
        const start = grammar.starts[quote.first - 1];
        if (quote.first > 1 && start !== undefined && !PLAIN_LANGUAGES.has(lang)) {
            const state = await grammarStateAt(
                highlighter,
                lang,
                input.code,
                grammar,
                quote.first - 1,
            );
            if (state !== undefined) context = { start, state };
        }
    }
    const instance = new File({
        ...options(input.wrap),
        disableFileHeader: input.path === null,
        disableErrorHandling: true,
        disableLineNumbers: !input.lineNumbers,
        tokenizeMaxLineLength: TOKENIZE_MAX_LINE_LENGTH,
    });
    const render = (container: HTMLElement) =>
        instance.render({
            file: { name, contents, lang },
            fileContainer: container,
            ...(input.lines === null
                ? {}
                : {
                      renderRange: {
                          startingLine: input.lines.first - 1,
                          totalLines: input.lines.last - input.lines.first + 1,
                          bufferBefore: 0,
                          bufferAfter: 0,
                      },
                  }),
        });
    return mount(target, instance, (container) => {
        if (numberWidth !== undefined)
            container.style.setProperty("--diffs-min-number-column-width", numberWidth);
        if (quote === null || context === undefined) render(container);
        else
            renderFrom(highlighter, contents, quote.first - 1, context.start, context.state, () =>
                render(container),
            );
    });
}
