import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { useState } from "react";
import { flushSync } from "react-dom";
import { AppShell } from "./AppShell";
import { Sidebar } from "./Sidebar";
import { TabbedPane } from "./TabbedPane";
import { createRenderer } from "./testing";

const noop = () => {};
const pane = (id: string, busy = false, closable = true) => (
    <TabbedPane
        data-testid={id}
        activeId="first"
        tabs={[
            { id: "first", label: "First document", busy, closable },
            { id: "second", label: "Another document" },
        ]}
        onSelect={noop}
        onClose={noop}
        tabSizing="content"
        closePresentation="overlay"
    >
        <div />
    </TabbedPane>
);

it.each([false, true])(
    "centres separators and joins full panel edges (collapsed: %s)",
    async (collapsed) => {
        const view = createRenderer().render(
            () => (
                <AppShell
                    navigationChrome="integrated"
                    sidebarCollapsible
                    sidebarCollapsed={collapsed}
                    onSidebarCollapsedChange={noop}
                    sidebarCollapsedLayout="overlay"
                    sidebarCollapsedAction={{ label: "New", onClick: noop }}
                    sidebar={<Sidebar activeItemId="" onItemSelect={noop} sections={[]} />}
                    panel={collapsed ? undefined : pane("right")}
                    panelToggleAction={{ open: !collapsed, onClick: noop }}
                >
                    {pane("main")}
                </AppShell>
            ),
            { width: 1440, height: 900 },
        );
        await view.ready();
        const band = view.$('[data-testid="main"] .happy-tabbed-pane__bar').bounds();
        const left = view.$(".happy-desktop-app-shell__sidebar-controls-rule").bounds();
        const rightPart = view.$(
            collapsed
                ? ".happy-desktop-app-shell__panel-controls"
                : '[data-happy-desktop-ui="app-shell-panel"]',
        );
        const rightOwner = rightPart.element;
        const right = getComputedStyle(rightOwner, "::before");
        const rightY = rightPart.bounds().y + parseFloat(right.top);
        const expectedHeight = band.height * (collapsed ? 0.6 : 1);
        expect(left.height).toBeCloseTo(expectedHeight, 1);
        expect(parseFloat(right.height)).toBeCloseTo(expectedHeight, 1);
        expect(left.y + left.height / 2 - (band.y + band.height / 2)).toBeCloseTo(0, 1);
        expect(rightY + parseFloat(right.height) / 2 - (band.y + band.height / 2)).toBeCloseTo(
            0,
            1,
        );
        const first = view.$('[data-testid="main"] [data-tab-id="first"]').bounds();
        expect(first.x).toBe(band.x + (collapsed ? left.x - band.x : 0));
        if (!collapsed) {
            expect(left.x).toBe(
                view.$('[data-happy-desktop-ui="app-shell-sidebar"]').bounds().x +
                    view.$('[data-happy-desktop-ui="app-shell-sidebar"]').bounds().width,
            );
        }
        console.log(
            `header ${collapsed ? "collapsed" : "expanded"}: band=${band.height}px left=${left.height}px right=${right.height} centre offsets=${left.y + left.height / 2 - (band.y + band.height / 2)},${rightY + parseFloat(right.height) / 2 - (band.y + band.height / 2)}`,
        );
    },
);

it("reserves exactly one trailing slot through loading, hover and close availability", async () => {
    let update: (state: { busy: boolean; closable: boolean }) => void = () => {};
    const Fixture = () => {
        const [state, setState] = useState({ busy: false, closable: true });
        update = setState;
        return pane("tabs", state.busy, state.closable);
    };
    const view = createRenderer().render(() => <Fixture />, {
        width: 900,
        height: 200,
    });
    await view.ready();
    const tab = () => view.$('[data-tab-id="first"]');
    const lane = () => view.$('[data-tab-id="first"] [data-happy-desktop-ui="tab-trailing"]');
    const before = tab().bounds();
    const slot = lane().bounds();
    for (const running of [true, false, true]) {
        flushSync(() => update({ busy: running, closable: true }));
        await view.ready();
        expect(tab().bounds()).toEqual(before);
        expect(lane().bounds()).toEqual(slot);
        await userEvent.hover(tab().element);
        expect(tab().bounds()).toEqual(before);
        expect(lane().bounds()).toEqual(slot);
        await userEvent.unhover(tab().element);
    }
    const activity = view
        .$('[data-tab-id="first"] [data-happy-desktop-ui="tab-activity"]')
        .bounds();
    const close = view.$('[data-tab-id="first"] [data-happy-desktop-ui="tab-close"]').bounds();
    expect(activity).toEqual(close);
    flushSync(() => update({ busy: false, closable: false }));
    await view.ready();
    expect(tab().bounds()).toEqual(before);
    expect(lane().bounds()).toEqual(slot);
});
