import { expect, it } from "vitest";
import "./theme.css";
import "./styles.css";
import { Icon } from "./Icon";
import { InlinePage } from "./InlinePage";
import { INLINE_PAGE_MAX_HEIGHT, type InlinePageFit } from "./inlinePageFit";
import { createRenderer } from "./testing";

/** A page that reports `height` as it mounts, the way a host's engine reports a measure. */
function pageOf(key: string, height: number) {
    return {
        key,
        render: (fit: InlinePageFit) => (
            <div
                ref={(element) => {
                    if (element) fit.heightChanged(height);
                }}
            />
        ),
    };
}

it("says a page as tall as the cap is cut, and opens the rest beside the chat", async () => {
    const opened: string[] = [];
    const view = createRenderer();
    for (const [testid, height] of [
        ["tall", INLINE_PAGE_MAX_HEIGHT],
        ["short", 2_000],
    ] as const)
        view.render(
            () => (
                <div data-testid={testid} style={{ display: "flex", width: "560px" }}>
                    <InlinePage
                        geometry={{ placement: "inline", collapsed: false, height }}
                        glyph={<Icon name="globe" size={16} />}
                        onCollapsedChange={() => undefined}
                        onHeightChange={() => undefined}
                        onOpenSide={() => opened.push(testid)}
                        page={pageOf(testid, height)}
                        title="Bug hunt report"
                    />
                </div>
            ),
            { width: 600, height: INLINE_PAGE_MAX_HEIGHT + 200 },
        );
    await view.ready();

    expect(view.container.querySelector('[data-testid="short"] .happy-inline-page__cut')).toBe(
        null,
    );
    const content = view.$('[data-testid="tall"] [data-happy-desktop-ui="inline-page-content"]')
        .element as HTMLElement;
    const cut = view.$('[data-testid="tall"] [data-happy-desktop-ui="inline-page-cut"]')
        .element as HTMLElement;
    // The notice lies over the page's foot: the row keeps the height it reserved.
    expect(content.getBoundingClientRect().height).toBe(INLINE_PAGE_MAX_HEIGHT);
    expect(cut.getBoundingClientRect().bottom).toBeCloseTo(
        content.getBoundingClientRect().bottom,
        1,
    );
    expect(cut.textContent).toContain("too tall to show here in full");
    const open = view.$('[data-testid="tall"] .happy-inline-page__cut-open')
        .element as HTMLButtonElement;
    open.scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const box = open.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    expect(open.contains(hit)).toBe(true);
    open.click();
    expect(opened).toEqual(["tall"]);
}, 120_000);
