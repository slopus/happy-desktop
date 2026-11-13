import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * The active row is brought into view: an address that lands on a row off
 * screen scrolls just far enough to show it, one already on screen moves
 * nothing, and a row that arrives after it was made active is shown as it
 * arrives. The reader's own scrolling afterwards is left alone.
 */

const row = (id: string): SidebarItem => ({ icon: "doc", id, kind: "view", label: id });

const ROWS: SidebarItem[] = Array.from({ length: 40 }, (_, index) => row(`row-${String(index)}`));

type Control = {
    readonly activate: (id: string) => void;
    readonly add: (id: string) => void;
};

const render = async () => {
    let control: Control | undefined;
    const Fixture = () => {
        const [rows, setRows] = useState(ROWS);
        const [active, setActive] = useState("row-0");
        control = {
            activate: setActive,
            add: (id) => setRows((current) => [row(id), ...current]),
        };
        return (
            <div style={{ display: "flex", flexDirection: "column", height: 400, width: 300 }}>
                <Sidebar
                    activeItemId={active}
                    onItemSelect={() => {}}
                    sections={[{ id: "work", items: rows }]}
                    style={{ width: "100%" }}
                />
            </div>
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 300, height: 400 });
    await view.ready();
    const root = view.container;
    const viewport = root.querySelector<HTMLElement>(".happy-sidebar__body-viewport")!;
    const act = async (change: (control: Control) => void) => {
        flushSync(() => change(control!));
        await frames();
    };
    const visible = (id: string) => {
        const box = root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
        const rect = box.getBoundingClientRect();
        const view = viewport.getBoundingClientRect();
        return rect.top >= view.top - 0.5 && rect.bottom <= view.bottom + 0.5;
    };
    return { act, viewport, visible };
};

const frames = async () => {
    for (let index = 0; index < 3; index += 1)
        await new Promise((done) => requestAnimationFrame(() => done(undefined)));
};

it("scrolls an active row off screen into view, and no further", async () => {
    const view = await render();
    expect(view.viewport.scrollTop).toBe(0);
    expect(view.visible("row-35")).toBe(false);

    await view.act((control) => control.activate("row-35"));
    expect(view.visible("row-35")).toBe(true);
    // Nearest: the row stands at the bottom edge, not centred or at the top.
    expect(view.visible("row-34")).toBe(true);
    const scrolled = view.viewport.scrollTop;
    expect(scrolled).toBeGreaterThan(0);

    // A row already on screen moves nothing.
    await view.act((control) => control.activate("row-33"));
    expect(view.viewport.scrollTop).toBe(scrolled);

    // Back up to the top, just far enough to show the first row.
    await view.act((control) => control.activate("row-0"));
    expect(view.visible("row-0")).toBe(true);
    expect(view.viewport.scrollTop).toBeLessThan(scrolled);
});

it("shows an active row that arrives later, then leaves the reader's scrolling alone", async () => {
    const view = await render();
    await view.act((control) => control.activate("row-35"));
    const scrolled = view.viewport.scrollTop;
    expect(scrolled).toBeGreaterThan(0);

    // Made active before it is listed, as a task whose join is on its way.
    await view.act((control) => control.activate("joined"));
    expect(view.viewport.scrollTop).toBe(scrolled);
    await view.act((control) => control.add("joined"));
    expect(view.visible("joined")).toBe(true);
    expect(view.viewport.scrollTop).toBeLessThan(scrolled);

    view.viewport.scrollTop = 200;
    await new Promise((done) => view.viewport.addEventListener("scroll", done, { once: true }));
    await frames();
    await view.act((control) => control.add("another"));
    expect(view.viewport.scrollTop).toBeGreaterThan(0);
});
