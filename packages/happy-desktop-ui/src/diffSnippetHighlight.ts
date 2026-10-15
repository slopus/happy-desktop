import {
    EXTENSION_TO_FILE_FORMAT,
    getHighlighterIfLoaded,
    getSharedHighlighter,
} from "@pierre/diffs";

/**
 * Syntax colours for the few lines a diff snippet shows.
 *
 * A snippet is a dozen lines quoted inside prose, not a file, so it is drawn
 * by `DiffSnippet` rather than by Pierre's own surface — and until now it was
 * drawn in one colour, while the same code one panel over was coloured. This
 * tokenizes those lines with the highlighter and palette every other code
 * surface in Happy already uses, so a line reads the same wherever it is read.
 *
 * Shiki's grammars load over the network, so the first snippet of a language
 * is plain for as long as that takes and colours itself when the grammar
 * arrives. Colour never changes a character, a font, or a line, so the row
 * model's height holds throughout and nothing moves when it lands.
 */

const THEMES = { dark: "pierre-dark", light: "pierre-light" } as const;

/** One run of characters in a line, and its colour in each theme. */
export interface DiffSnippetToken {
    readonly text: string;
    readonly light: string;
    readonly dark: string;
}

/** The colour of a token, following the surface's light or dark scheme. */
export function diffSnippetTokenColor(token: DiffSnippetToken): string {
    return `light-dark(${token.light}, ${token.dark})`;
}

/**
 * The language a path's code is in, or nothing for a name this highlighter
 * knows no grammar for, which is then left as plain text.
 */
export function diffSnippetLanguage(path: string): string | undefined {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    const extension = dot === -1 ? name.toLowerCase() : name.slice(dot + 1).toLowerCase();
    const format = EXTENSION_TO_FILE_FORMAT[extension];
    return format === undefined || format === "text" ? undefined : format;
}

type Highlighted = readonly (readonly DiffSnippetToken[])[];

/*
 * One result per snippet, kept against the exact lines it was made from. A
 * snippet is a dozen short lines and the same one is asked for on every
 * render and every row-sizing pass, so the cache is small and the work is
 * done once; a language still loading is remembered so it is asked for once.
 */
const RESULTS_MAX = 128;
const results = new Map<string, Highlighted>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
let generation = 0;

/**
 * How many grammars have arrived. A surface drawing snippets reads this to
 * know its plain lines can be asked for their colours again.
 */
export function diffSnippetHighlightGeneration(): number {
    return generation;
}

/** Told when a grammar has arrived and the lines waiting on it can colour. */
export function diffSnippetHighlightSubscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * The colours of these lines, or nothing while the grammar loads — the lines
 * are drawn in the kind's own colour until then. The lines are tokenized
 * together, as they read, so a token that spans them keeps its colour.
 */
export function diffSnippetHighlight(
    lines: readonly string[],
    language: string | undefined,
): Highlighted | undefined {
    if (language === undefined || lines.length === 0) return undefined;
    const code = lines.join("\n");
    const key = `${language}\u0000${code}`;
    const held = results.get(key);
    if (held !== undefined) return held;
    const highlighter = getHighlighterIfLoaded();
    if (highlighter?.getLoadedLanguages().includes(language) === true) {
        let highlighted: Highlighted;
        try {
            highlighted = highlighter
                .codeToTokens(code, { lang: language, themes: THEMES })
                .tokens.map((line) =>
                    line.map((token) => ({
                        text: token.content,
                        light: token.htmlStyle?.["color"] ?? "inherit",
                        dark: token.htmlStyle?.["--shiki-dark"] ?? "inherit",
                    })),
                );
        } catch {
            // A grammar that cannot read these lines leaves them plain.
            highlighted = [];
        }
        results.set(key, highlighted);
        if (results.size > RESULTS_MAX) results.delete(results.keys().next().value!);
        return highlighted;
    }
    languageLoad(language);
    return undefined;
}

function languageLoad(language: string): void {
    if (loading.has(language)) return;
    loading.add(language);
    void getSharedHighlighter({ langs: [language], themes: [THEMES.light, THEMES.dark] })
        .then(() => {
            generation += 1;
            for (const listener of listeners) listener();
        })
        .catch(() => undefined);
}
