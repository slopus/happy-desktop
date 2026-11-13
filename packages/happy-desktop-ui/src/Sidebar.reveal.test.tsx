import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar, SIDEBAR_ROW_GAP, type SidebarItem } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * The active row is brought into view. One already wholly on screen moves
 * nothing. One that is not glides in, briefly and on the settle's easing, to
 * stand five rows clear of the edge it came in at — centred where the body is
 * too short for that, and stopped by the list's own ends. Reduced motion lands
 * at once, the reader's own scrolling stops a glide, and a row that arrives
 * after it was made active is shown as it arrives.
 */

const row = (id: string): SidebarItem => ({ icon: "doc", id, kind: "view", label: id });

const ROWS: SidebarItem[] = Array.from({ length: 60 }, (_, index) => row(`row-${String(index)}`));

type Control = {
    readonly activate: (id: string) => void;
    readonly add: (id: string) => void;
};

/**
 * The sidebar under test, `height` tall. `floor` is the room the list keeps
 * under its last row; the sidebar's own is deeper than the reveal's margin.
 */
const render = async (height = 500, floor?: string) => {
    let control: Control | undefined;
    const Fixture = () => {
        const [rows, setRows] = useState(ROWS);
        const [active, setActive] = useState("row-0");
        control = {
            activate: setActive,
            add: (id) => setRows((current) => [row(id), ...current]),
        };
        return (
            <div style={{ display: "flex", flexDirection: "column", height, width: 300 }}>
                <Sidebar
                    activeItemId={active}
                    onItemSelect={() => {}}
                    sections={[{ id: "work", items: rows }]}
                    style={{
                        width: "100%",
                        ...(floor === undefined ? {} : { "--happy-sidebar-floor": floor }),
                    }}
                />
            </div>
        );
    };
    const rendered = createRenderer().render(() => <Fixture />, { width: 300, height });
    await rendered.ready();
    const root = rendered.container;
    const viewport = root.querySelector<HTMLElement>(".happy-sidebar__body-viewport")!;
    const rect = (id: string) =>
        root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!.getBoundingClientRect();
    return {
        /** Makes a row active and lets any glide finish. */
        activate: async (id: string) => {
            flushSync(() => control!.activate(id));
            await settle();
        },
        add: async (id: string) => {
            flushSync(() => control!.add(id));
            await settle();
        },
        control: () => control!,
        margin: () => 5 * (rect("row-0").height + SIDEBAR_ROW_GAP),
        max: () => viewport.scrollHeight - viewport.clientHeight,
        rect,
        scrollTo: async (top: number) => {
            viewport.scrollTop = top;
            await frames(2);
        },
        view: () => viewport.getBoundingClientRect(),
        viewport,
    };
};

const frames = async (count = 3) => {
    for (let index = 0; index < count; index += 1)
        await new Promise((done) => requestAnimationFrame(() => done(undefined)));
};

/** Longer than any glide, then a few frames for the last write to land. */
const settle = async () => {
    await new Promise((done) => setTimeout(done, 400));
    await frames();
};

afterEach(() => {
    vi.restoreAllMocks();
});

it("moves nothing for a row already wholly on screen", async () => {
    const view = await render();
    const seen: number[] = [];
    view.viewport.addEventListener("scroll", () => seen.push(view.viewport.scrollTop));
    await view.activate("row-8");
    expect(view.viewport.scrollTop).toBe(0);
    expect(seen).toEqual([]);
});

it("stands a row coming in at the bottom five rows clear of it, and one at the top the same", async () => {
    const view = await render();
    await view.activate("row-30");
    expect(view.view().bottom - view.rect("row-30").bottom).toBeCloseTo(view.margin(), 0);

    // A row only partly hidden counts as hidden.
    await view.scrollTo(view.viewport.scrollTop + 200);
    const top = view.view().top;
    const hidden = ROWS.map((entry) => entry.id).find((id) => {
        const box = view.rect(id);
        return box.top < top && box.bottom > top;
    })!;
    expect(hidden).toBeDefined();
    await view.activate(hidden);
    expect(view.rect(hidden).top - view.view().top).toBeCloseTo(view.margin(), 0);
});

it("stops at the list's own ends", async () => {
    const view = await render(500, "0px");
    await view.activate("row-58");
    expect(view.viewport.scrollTop).toBeCloseTo(view.max(), 0);
    await view.activate("row-2");
    expect(view.viewport.scrollTop).toBe(0);
});

it("centres the row where the body is too short for the margin", async () => {
    const view = await render(300);
    expect(view.view().height).toBeLessThan(view.rect("row-0").height + 2 * view.margin());
    await view.activate("row-30");
    const box = view.rect("row-30");
    const above = box.top - view.view().top;
    const below = view.view().bottom - box.bottom;
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
});

it("glides there over a few frames, and lands at once under reduced motion", async () => {
    const view = await render();
    flushSync(() => view.control().activate("row-30"));
    await frames(2);
    const midway = view.viewport.scrollTop;
    await settle();
    const target = view.viewport.scrollTop;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(target);

    const query = window.matchMedia.bind(window);
    vi.spyOn(window, "matchMedia").mockImplementation((media) =>
        media === "(prefers-reduced-motion: reduce)"
            ? ({ matches: true, media } as MediaQueryList)
            : query(media),
    );
    flushSync(() => view.control().activate("row-2"));
    expect(view.viewport.scrollTop).toBe(0);
});

it("lets the reader's own scrolling stop a glide where it stands", async () => {
    const view = await render();
    flushSync(() => view.control().activate("row-40"));
    await frames(2);
    view.viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
    const stopped = view.viewport.scrollTop;
    await settle();
    expect(view.viewport.scrollTop).toBe(stopped);
    expect(view.rect("row-40").bottom).toBeGreaterThan(view.view().bottom);
});

it("shows an active row that arrives later, then leaves the reader's scrolling alone", async () => {
    const view = await render();
    await view.activate("row-40");
    expect(view.viewport.scrollTop).toBeGreaterThan(0);

    // Made active before it is listed, as a task whose join is on its way.
    const scrolled = view.viewport.scrollTop;
    await view.activate("joined");
    expect(view.viewport.scrollTop).toBe(scrolled);
    await view.add("joined");
    expect(view.viewport.scrollTop).toBe(0);

    await view.scrollTo(200);
    await view.add("another");
    expect(view.viewport.scrollTop).toBeGreaterThan(0);
});
