import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * The top of the sidebar never moves. Folding or unfolding a section, the
 * bottom-most one included and while scrolled to the very bottom, leaves every
 * row above the change exactly where it was, and the bottom-most section
 * unfolds where it can be seen.
 */

const heading = (id: string, label: string, collapsed = false): SidebarItem => ({
    collapsed,
    id,
    kind: "section",
    label,
});
const row = (id: string, label: string): SidebarItem => ({
    icon: "doc",
    id,
    kind: "view",
    label,
});

const LONG: SidebarItem[] = [
    ...["releases", "desktop", "research", "writing", "infra"].flatMap((id) => [
        heading(id, id),
        ...[1, 2, 3].map((index) => row(`${id}-${String(index)}`, `${id} task ${String(index)}`)),
    ]),
    heading("later", "later", true),
    ...[1, 2, 3, 4].map((index) => row(`later-${String(index)}`, `later task ${String(index)}`)),
];

type Control = {
    readonly fold: (id: string) => void;
};

const render = async () => {
    let control: Control | undefined;
    const Fixture = () => {
        const [rows, setRows] = useState(LONG);
        control = {
            fold: (id) =>
                setRows((current) =>
                    current.map((entry) =>
                        entry.id === id ? { ...entry, collapsed: !entry.collapsed } : entry,
                    ),
                ),
        };
        return (
            <div style={{ display: "flex", flexDirection: "column", height: 520, width: 300 }}>
                <Sidebar
                    activeItemId=""
                    foldControlPlacement="trailing"
                    onItemCollapseToggle={(id) => control?.fold(id)}
                    onItemSelect={() => {}}
                    sections={[{ id: "work", items: rows }]}
                    style={{ width: "100%" }}
                />
            </div>
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 300, height: 520 });
    await view.ready();
    const root = view.container;
    const viewport = root.querySelector<HTMLElement>(".happy-sidebar__body-viewport")!;
    const act = async (change: (control: Control) => void) => {
        flushSync(() => change(control!));
        await frames();
    };
    /** Every rendered row's top, by ID. */
    const tops = () =>
        new Map(
            [...root.querySelectorAll<HTMLElement>("[data-item-id]")].map((node) => [
                node.dataset.itemId!,
                node.getBoundingClientRect().top,
            ]),
        );
    const rect = (id: string) =>
        root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!.getBoundingClientRect();
    const scrollToBottom = async () => {
        viewport.scrollTop = viewport.scrollHeight;
        await new Promise((done) => viewport.addEventListener("scroll", done, { once: true }));
        await frames();
    };
    return { act, rect, scrollToBottom, tops, viewport };
};

const frames = async () => {
    for (let index = 0; index < 3; index += 1)
        await new Promise((done) => requestAnimationFrame(() => done(undefined)));
};

/** No row that stood above `limit` before has moved. */
const expectStill = (
    before: ReadonlyMap<string, number>,
    after: ReadonlyMap<string, number>,
    limit: number,
) => {
    const moved = [...before]
        .filter(([id, top]) => top < limit && after.has(id))
        .map(([id, top]) => [id, after.get(id)! - top] as const)
        .filter(([, delta]) => Math.abs(delta) > 0.01);
    expect(moved).toEqual([]);
};

it("unfolds the bottom-most section at the bottom where it can be seen, and folds it back, without moving a row", async () => {
    const view = await render();
    await view.scrollToBottom();
    const scrollTop = view.viewport.scrollTop;
    expect(scrollTop).toBeGreaterThan(0);

    let before = view.tops();
    await view.act((control) => control.fold("later"));
    expectStill(before, view.tops(), Number.POSITIVE_INFINITY);
    expect(view.viewport.scrollTop).toBe(scrollTop);
    // What unfolded stands on screen.
    const first = view.rect("later-1");
    expect(first.bottom).toBeLessThanOrEqual(view.viewport.getBoundingClientRect().bottom);
    expect(first.top).toBeGreaterThan(view.viewport.getBoundingClientRect().top);

    before = view.tops();
    await view.act((control) => control.fold("later"));
    expectStill(before, view.tops(), Number.POSITIVE_INFINITY);
    expect(view.viewport.scrollTop).toBe(scrollTop);
});

it("folds and unfolds a section above the bottom, scrolled to the bottom, without moving a row above it", async () => {
    const view = await render();
    await view.scrollToBottom();
    for (const id of ["infra", "infra", "writing", "writing"]) {
        const before = view.tops();
        await view.act((control) => control.fold(id));
        expectStill(before, view.tops(), before.get(id)! + 1);
    }
});
