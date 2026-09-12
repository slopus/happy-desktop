/*
 * The feel of asking: type into a real composer, watch a real run think and
 * answer. Its reply streams from the live daemon through the same pipeline a
 * user's reply streams through — the take just points a camera at it.
 */
export default {
    id: "streaming",
    subtitle: "A live run, from keystroke to answer",
    title: "Ask, and watch it work",

    async run(demo) {
        await demo.settle('[data-happy-desktop-ui="sidebar"]', { after: 2600 });
        // Open the conversation off camera; the video starts on the work.
        await demo.page.getByText("happy-desktop", { exact: true }).first().click();
        await demo.settle('[data-happy-desktop-ui="conversation-view"]', { after: 2200 });
        await demo.page.getByText("Keyboard shortcuts for").first().click();
        await demo.settle(undefined, { after: 1600 });
        await demo.hold(900);

        await demo.caption("Ask in plain words");
        await demo.hold(1200);
        await demo.caption(undefined);
        await demo.zoomTo('[data-happy-desktop-ui="composer"]', { level: 1.4 });
        await demo.click('[data-happy-desktop-ui="composer"]');
        await demo.hold(300);
        await demo.type("Thanks — recap what you changed for the shortcuts.");
        demo.sound("chime");
        await demo.press("Enter", { after: 300 });
        await demo.sticker("typing", '[data-happy-desktop-ui="composer"]', {
            offset: { x: 0.9, y: -0.5 },
            size: 250,
        });

        await demo.caption("It answers in your project's terms");
        await demo.settle(undefined, { after: 1600 });
        await demo.zoomOut();
        await demo.hold(2400);
        await demo.zoomTo('[data-happy-desktop-ui="conversation-view"]', { level: 1.26 });
        await demo.hold(3000);
        await demo.caption(undefined);
        await demo.zoomOut();
        await demo.hold(1400);
    },

    async assert(page) {
        const transcript = await page
            .locator('[data-happy-desktop-ui="conversation-view"]')
            .first()
            .innerText();
        if (!transcript.includes("Where we are"))
            throw new Error("The live reply did not stream into the transcript.");
    },
};
