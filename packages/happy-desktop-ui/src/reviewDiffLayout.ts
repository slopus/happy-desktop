import { type DiffLine } from "./DiffSnippet";

/*
 * How a quoted diff wraps. A long line of code wraps the way `pre-wrap`
 * wraps it — at a space or a break the line allows, mid-word only when a word
 * does not fit (`review-diff.css`) — and its later rows hang under the code
 * they continue, two characters in from its indentation. The row model counts
 * those rows with the same text measure the transcript uses. Tabs are
 * expanded to stops of four where the code is drawn and where it is counted,
 * so both agree.
 */

const TAB = 4;
/** The mono face's advance at 12px: one `ch`. */
const ADVANCE = 7.2;
/** Borders, the number column, and the trailing padding of a row. */
const GUTTER = 2 + 52 + 16;
/** Deep indentation hangs no further than this, so a wrapped row keeps room. */
const HANG_MAX = 16;
const HANG_STEP = 2;

/** `text` with its tabs expanded, starting at `column`, and the column it ends at. */
export function reviewDiffTabsExpand(
    text: string,
    column = 0,
): { readonly text: string; readonly column: number } {
    if (!text.includes("\t")) return { text, column: column + [...text].length };
    let out = "";
    let at = column;
    for (const character of text) {
        if (character === "\t") {
            const spaces = TAB - (at % TAB);
            out += " ".repeat(spaces);
            at += spaces;
        } else {
            out += character;
            at += 1;
        }
    }
    return { text: out, column: at };
}

/** How far, in characters, a line's wrapped rows hang in from its start. */
export function reviewDiffHang(expanded: string): number {
    const indent = expanded.length - expanded.trimStart().length;
    return Math.min(indent, HANG_MAX) + HANG_STEP;
}

/**
 * Rows the lines take in a diff drawn `width` wide; a note line is one row.
 * `codeRows` wraps one line of code: its first row `first` wide, the rest
 * `rest` wide.
 */
export function reviewDiffRows(
    lines: readonly DiffLine[],
    width: number,
    codeRows: (text: string, first: number, rest: number) => number,
): number {
    const first = width - GUTTER;
    let rows = 0;
    for (const line of lines) {
        if (line.kind === "meta") {
            rows += 1;
            continue;
        }
        const text = reviewDiffTabsExpand(line.text).text;
        rows += Math.max(1, codeRows(text, first, first - reviewDiffHang(text) * ADVANCE));
    }
    return rows;
}
