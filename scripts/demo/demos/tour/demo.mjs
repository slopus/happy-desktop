/*
 * A whole-product tour in forty seconds: projects and worktrees in one tree,
 * conversations in titled tabs, the transcript as the record of work. Wide
 * shots and short holds — this one is the trailer, not the feature spot.
 */
export default {
    id: "tour",
    subtitle: "Projects, worktrees, and the agents working them",
    title: "This is Happy",

    async run(demo) {
        await demo.settle('[data-happy-desktop-ui="sidebar"]', { after: 2600 });
        // The tour also starts on the work: open the project off camera.
        await demo.page.getByText("happy-desktop", { exact: true }).first().click();
        await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 2400 });
        await demo.hold(900);

        await demo.caption("Every project and its worktrees, one tree");
        await demo.zoomTo('[data-happy-desktop-ui="sidebar"]', { level: 1.3 });
        await demo.hold(2200);
        await demo.zoomOut();

        await demo.caption("Conversations live in tabs, titled for you");
        await demo.hold(1400);
        await demo.click({ text: "Upgrade the build to V" });
        await demo.settle(undefined, { after: 1200 });
        await demo.hold(1600);
        await demo.click({ text: "Fix the flaky retry back" });
        await demo.settle(undefined, { after: 1200 });
        await demo.hold(1200);

        await demo.caption("The transcript is the work: reasoning, diffs, results");
        await demo.zoomTo('[data-happy-desktop-ui="conversation-view"]', { level: 1.26 });
        await demo.hold(2600);
        await demo.zoomOut();

        await demo.caption("Branch work runs beside it, in real worktrees");
        await demo.click({ text: "cold-start", exact: true });
        await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 2000 });
        await demo.hold(2200);

        await demo.caption("And the composer talks to whichever agent you choose");
        await demo.click({ text: "happy-desktop", exact: true });
        await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 1800 });
        await demo.hold(1500);
        await demo.caption(undefined);
        await demo.zoomTo('[data-happy-desktop-ui="composer"]', { level: 1.45 });
        await demo.hold(2200);
        await demo.zoomOut();
        await demo.hold(1200);
    },

    async assert(page) {
        const shell = await page.locator('[data-happy-desktop-ui="app-shell"]').first().innerText();
        for (const expected of ["happy-desktop", "cold-start", "csv-export"]) {
            if (!shell.includes(expected))
                throw new Error(`The tour's world is missing "${expected}" on screen.`);
        }
    },
};
