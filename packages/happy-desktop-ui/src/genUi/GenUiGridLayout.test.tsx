import { expect, it } from "vitest";
import "../theme.css";
import "../styles/gen-ui.css";
import { createRenderer } from "../testing";
import { genUiRenderParseText } from "./genUiRender";
import { GenUiRenderView } from "./GenUiRenderView";
import wideCells from "../../dev/assets/genui/15-table-wide-cells.render.json?raw";

/*
 * A table's columns are shared out from what its cells hold, as a Markdown
 * table's are: a long first cell wraps at words in a readable column, headers
 * keep their own width, and a column of pills stays as narrow as its pills.
 */

const fileUrl = () => "data:,";
const COLUMNS = 6;

async function tableAt(width: number) {
    const view = createRenderer();
    view.render(
        () => (
            <GenUiRenderView document={genUiRenderParseText(wideCells)} fileUrl={fileUrl} still />
        ),
        { width, height: 900, padding: 0 },
    );
    await view.ready();
    await document.fonts.ready;
    const grid = view.container.querySelector<HTMLElement>(".gen-ui-grid[data-density='table']");
    if (!grid) throw new Error("No table drawn.");
    const cells = [...grid.querySelectorAll<HTMLElement>(":scope > .gen-ui-grid__cell")];
    const heads = cells.slice(0, COLUMNS);
    const columns = heads.map((cell) => cell.getBoundingClientRect().width);
    return { view, grid, cells, heads, columns };
}

/* Each header's own text, not its box: a box that is too narrow lets the
   text run on over its neighbour. */
function headersApart(heads: readonly HTMLElement[]) {
    const texts = heads.map((cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell.querySelector("p")!);
        return range.getBoundingClientRect();
    });
    for (const [index, text] of texts.entries()) {
        const cell = heads[index]!.getBoundingClientRect();
        expect(text.right, `header ${String(index)} fits its column`).toBeLessThanOrEqual(
            cell.right + 0.5,
        );
        const next = texts[index + 1];
        if (next) expect(text.right, `header ${String(index)}`).toBeLessThanOrEqual(next.left);
    }
}

it("shares a wide table's columns out by what its cells hold", async () => {
    const { view, grid, cells, heads, columns } = await tableAt(720);
    headersApart(heads);
    /* It fits: nothing scrolls. */
    expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth);
    /* The long first cell gets a readable column and wraps at words. */
    expect(columns[0]).toBeGreaterThanOrEqual(136);
    const first = cells[COLUMNS]!.querySelector("p")!;
    const line = Number.parseFloat(getComputedStyle(first).lineHeight);
    expect(first.getBoundingClientRect().height).toBeLessThanOrEqual(line * 5);
    /* Port and ORPHAN hold pills and stay as narrow as their header or pill. */
    for (const index of [1, 5]) {
        const widest = Math.max(
            ...cells
                .filter((_, cell) => cell % COLUMNS === index)
                .map((cell) => cell.firstElementChild!.getBoundingClientRect().width),
        );
        expect(columns[index]! - widest, `column ${String(index)}`).toBeLessThanOrEqual(24.5);
    }
    view.destroy();
});

it("scrolls a table whose columns cannot all be readable", async () => {
    const { view, grid, cells, heads, columns } = await tableAt(600);
    expect(view.container.querySelector(".gen-ui-box[data-role='record']")).toBeNull();
    headersApart(heads);
    expect(grid.scrollWidth).toBeGreaterThan(grid.clientWidth);
    expect(columns[0]).toBeGreaterThanOrEqual(136);
    const first = cells[COLUMNS]!.querySelector("p")!;
    const line = Number.parseFloat(getComputedStyle(first).lineHeight);
    expect(first.getBoundingClientRect().height).toBeLessThanOrEqual(line * 4);
    view.destroy();
});
