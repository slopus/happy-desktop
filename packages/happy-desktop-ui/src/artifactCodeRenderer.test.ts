import { getHighlighterOptions, getSharedHighlighter } from "@pierre/diffs";
import { expect, it } from "vitest";
import { renderCode, type ArtifactCodeInput } from "./artifactCodeRenderer";

/** A TypeScript file whose quoted lines sit inside constructs opened far above them. */
function source(filler: number): string {
    const lines = ["const banner = `"];
    for (let index = 0; index < filler; index += 1) lines.push(`  template line ${String(index)}`);
    lines.push("`;", "/*");
    for (let index = 0; index < filler; index += 1) lines.push(` * comment line ${String(index)}`);
    lines.push(" */", "export function quoted(value: number): string {");
    lines.push("    return `${String(value)} quoted`; // tail");
    lines.push("}");
    for (let index = 0; index < filler; index += 1)
        lines.push(`const after${String(index)} = ${String(index)};`);
    return lines.join("\n");
}

function input(code: string, lines: ArtifactCodeInput["lines"]): ArtifactCodeInput {
    return {
        code,
        path: "src/quoted.ts",
        name: null,
        language: null,
        lines,
        lineNumbers: true,
        wrap: false,
    };
}

/** Each drawn line's number and highlighted markup. */
async function drawn(code: string, lines: ArtifactCodeInput["lines"]) {
    const target = document.createElement("div");
    document.body.append(target);
    const rendering = await renderCode(target, input(code, lines));
    const root = target.querySelector("diffs-container")!.shadowRoot!;
    const rows = new Map<number, string>();
    for (const row of root.querySelectorAll<HTMLElement>("[data-line][data-line-type]"))
        if (row.closest("[data-gutter]") === null)
            rows.set(Number(row.dataset.line), row.innerHTML);
    rendering.dispose();
    target.remove();
    return rows;
}

it("highlights a quote as the whole file would, from what the lines above it open", async () => {
    const code = source(40);
    const all = code.split("\n");
    const whole = await drawn(code, null);
    // Inside the template literal, inside the comment, and the function after them.
    for (const [first, last] of [
        [10, 12],
        [50, 52],
        [all.length - 42, all.length - 40],
    ] as const) {
        const quote = await drawn(code, { first, last });
        expect([...quote.keys()]).toEqual(
            Array.from({ length: last - first + 1 }, (_, index) => first + index),
        );
        for (const [line, markup] of quote) expect(markup).toBe(whole.get(line));
    }
}, 120_000);

it("tokenizes a quote's own lines, and the lines above a later quote of the same file once", async () => {
    const code = source(3_000);
    const highlighter = await getSharedHighlighter(
        getHighlighterOptions("typescript", {
            theme: { dark: "pierre-dark", light: "pierre-light" },
        }),
    );
    const highlighted: number[] = [];
    const context: number[] = [];
    const codeToHast = highlighter.codeToHast;
    const codeToTokens = highlighter.codeToTokens;
    highlighter.codeToHast = (text, options) => {
        highlighted.push(text.split("\n").length);
        return codeToHast.call(highlighter, text, options);
    };
    highlighter.codeToTokens = (text, options) => {
        context.push(text.split("\n").length - 1);
        return codeToTokens.call(highlighter, text, options);
    };
    try {
        await drawn(code, { first: 4_001, last: 4_003 });
        expect(highlighted).toEqual([3]);
        expect(context.reduce((sum, lines) => sum + lines, 0)).toBe(4_000);

        highlighted.length = 0;
        context.length = 0;
        await drawn(code, { first: 4_501, last: 4_502 });
        expect(highlighted).toEqual([2]);
        // Read on from where the quote before it began.
        expect(context.reduce((sum, lines) => sum + lines, 0)).toBe(500);
    } finally {
        highlighter.codeToHast = codeToHast;
        highlighter.codeToTokens = codeToTokens;
    }
}, 120_000);

/** Where each drawn line's code starts, from the left edge of the quote. */
async function codeLeft(code: string, lines: ArtifactCodeInput["lines"]) {
    const target = document.createElement("div");
    target.style.width = "640px";
    document.body.append(target);
    const rendering = await renderCode(target, input(code, lines));
    const host = target.querySelector("diffs-container")!;
    const left = host.getBoundingClientRect().left;
    const lefts = [...host.shadowRoot!.querySelectorAll<HTMLElement>("[data-line][data-line-type]")]
        .filter((row) => row.closest("[data-gutter]") === null)
        .map((row) => row.getBoundingClientRect().left - left);
    rendering.dispose();
    target.remove();
    return lefts;
}

it("numbers a quote in a gutter as wide as the whole file's", async () => {
    const code = source(400);
    const all = code.split("\n").length;
    const [whole] = await codeLeft(code, null);
    expect(whole).toBeGreaterThan(0);
    // Near the top the quote's own numbers are short; the file's last ones are not.
    for (const [first, last] of [
        [1, 3],
        [10, 12],
        [120, 122],
        [all - 2, all],
    ] as const) {
        const quote = await codeLeft(code, { first, last });
        expect(quote).toHaveLength(last - first + 1);
        for (const left of quote) expect(left).toBeCloseTo(whole, 0);
    }
}, 120_000);

it("reads the context of several files' quotes in short turns, the page first", async () => {
    const highlighter = await getSharedHighlighter(
        getHighlighterOptions("typescript", {
            theme: { dark: "pierre-dark", light: "pierre-light" },
        }),
    );
    await drawn(source(10), { first: 20, last: 22 });
    const files = [801, 802, 803, 804].map((filler) => source(filler));
    const before: number[] = [];
    const after: number[] = [];
    let pageRan = false;
    const codeToTokens = highlighter.codeToTokens;
    highlighter.codeToTokens = (text, options) => {
        (pageRan ? after : before).push(text.split("\n").length - 1);
        return codeToTokens.call(highlighter, text, options);
    };
    try {
        const quotes = files.map((code) => drawn(code, { first: 2_001, last: 2_003 }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        pageRan = true;
        await Promise.all(quotes);
    } finally {
        highlighter.codeToTokens = codeToTokens;
    }
    // Nothing is read before the page has had a turn, and no turn reads much.
    expect(before).toEqual([]);
    expect(after.reduce((sum, lines) => sum + lines, 0)).toBe(4 * 2_000);
    expect(Math.max(...after)).toBeLessThanOrEqual(100);
}, 120_000);
