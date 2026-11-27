import { expect, it } from "vitest";
import "./theme.css";
import "./styles/usage-activity-grid.css";
import { UsageActivityGrid, type UsageActivityDay } from "./UsageActivityGrid";
import { createRenderer } from "./testing";

/** `count` days ending on `last`, each with some use. */
function daysUntil(last: string, count: number): UsageActivityDay[] {
    const end = Date.parse(`${last}T00:00:00Z`);
    return Array.from({ length: count }, (_, index) => ({
        date: new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10),
        tokens: 1_000 * (index + 1),
        models: [],
    }));
}

it("shows a day or two of history whole, weekday labels and all", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Hosted as Settings › Usage hosts it: a flex row as wide as its weeks. */}
                <div data-testid="one" style={{ display: "flex" }}>
                    <UsageActivityGrid aria-label="One day" days={daysUntil("2026-11-20", 1)} />
                </div>
                <div data-testid="two" style={{ display: "flex" }}>
                    <UsageActivityGrid aria-label="Two days" days={daysUntil("2026-12-02", 2)} />
                </div>
            </div>
        ),
        { width: 400, height: 240, padding: 16 },
    );
    await view.ready();

    for (const id of ["one", "two"]) {
        const grid = view.$(`[data-testid="${id}"] .happy-usage-activity`).element as HTMLElement;
        expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth);
        expect(grid.scrollLeft).toBe(0);
        const box = grid.getBoundingClientRect();
        const monday = view
            .$(`[data-testid="${id}"] .happy-usage-activity__weekdays span`)
            .element.getBoundingClientRect();
        expect(monday.left).toBeGreaterThanOrEqual(box.left);
        const months = grid.querySelectorAll(".happy-usage-activity__months span");
        const newest = months[months.length - 1]!.getBoundingClientRect();
        expect(newest.right).toBeLessThanOrEqual(box.right + 0.5);
    }
}, 120_000);

it("still opens a long history on today", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div data-testid="year" style={{ display: "flex", width: "240px" }}>
                <UsageActivityGrid aria-label="A year" days={daysUntil("2026-11-20", 365)} />
            </div>
        ),
        { width: 300, height: 200, padding: 16 },
    );
    await view.ready();

    const grid = view.$('[data-testid="year"] .happy-usage-activity').element as HTMLElement;
    expect(grid.scrollWidth).toBeGreaterThan(grid.clientWidth);
    expect(grid.scrollLeft).toBeCloseTo(grid.scrollWidth - grid.clientWidth, 0);
    const cells = grid.querySelectorAll(".happy-usage-activity__cell");
    const today = cells[cells.length - 1]!.getBoundingClientRect();
    expect(today.right).toBeLessThanOrEqual(grid.getBoundingClientRect().right + 0.5);
}, 120_000);
