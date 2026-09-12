/*
 * Parallel work made visible: one project, two worktrees, and a
 * separate conversation living on each. The transcripts are the evidence —
 * a profiling table in one, a reviewed patch in the other.
 */
export default {
    id: "worktrees",
    subtitle: "A worktree per branch, an agent per worktree",
    title: "Work three branches at once",

    async run(demo) {
        await demo.settle('[data-happy-desktop-ui="sidebar"]', { after: 2600 });
        // Open the project off camera so the first frame already shows work.
        await demo.page.getByText("happy-desktop", { exact: true }).first().click();
        await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 2400 });
        await demo.hold(800);

        await demo.caption("One project. Two worktrees. Three conversations.");
        await demo.zoomTo('[data-happy-desktop-ui="sidebar"]', { level: 1.35 });
        await demo.hold(2300);
        await demo.zoomOut();

        await demo.caption("Here an agent traced a cold-start regression");
        await demo.click({ text: "cold-start", exact: true });
        await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 2200 });
        await demo.hold(900);
        // The conversation opens on its newest turn; the profiling table the
        // caption is talking about is one scroll up.
        await demo.scroll('[data-happy-desktop-ui="conversation-view"]', -1000);
        await demo.hold(500);
        await demo.zoomTo({ text: "1795ms" }, { level: 1.45 });
        await demo.hold(2600);
        await demo.zoomOut();
        await demo.hold(600);

        await demo.caption("Next door, another one is shipping the CSV export");
        await demo.click({ text: "csv-export", exact: true });
        await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 2200 });
        await demo.hold(1200);
        await demo.zoomTo('[data-happy-desktop-ui="conversation-view"]', { level: 1.3 });
        await demo.hold(2200);
        await demo.zoomOut();

        await demo.caption("Same app, same keystrokes — just more hands");
        await demo.click({ text: "happy-desktop", exact: true });
        await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 1800 });
        await demo.hold(1800);
        await demo.caption(undefined);
        await demo.hold(900);
    },

    async assert(page) {
        await page.getByText("cold-start", { exact: true }).first().click();
        await page.waitForTimeout(1200);
        const coldStart = await page
            .locator('[data-happy-desktop-ui="conversation-view"]')
            .first()
            .innerText();
        if (!coldStart.includes("1795ms"))
            throw new Error("The cold-start profile table is not in its worktree conversation.");
        await page.getByText("csv-export", { exact: true }).first().click();
        await page.waitForTimeout(1200);
        const csv = await page
            .locator('[data-happy-desktop-ui="conversation-view"]')
            .first()
            .innerText();
        if (!csv.includes("src/report/csv.ts"))
            throw new Error("The CSV worktree conversation does not name its patch.");
    },
};
