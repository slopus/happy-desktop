import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, SIDEBAR_SLOT_CELL, type SidebarSection } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * A row's unread mark is a red dot on the top corner of its own mark, opposite
 * the folded count. A mention doubles it around a drawn `@`, centred on the
 * same point. It never carries a number and never touches the trailing lane;
 * a row with no mark of its own wears it in the spinner's cell instead.
 */
const leave = { icon: "close", label: "Leave", reveal: "hover" } as const;

const sections = (): SidebarSection[] => [
    {
        id: "tasks",
        label: "Tasks",
        items: [
            { action: leave, id: "working", kind: "project", label: "Working", status: "working" },
            { action: leave, id: "unread", kind: "project", label: "Unread", unread: true },
            {
                action: leave,
                id: "mentioned",
                kind: "project",
                label: "Mentioned",
                unread: true,
                unreadMentioned: true,
            },
            {
                changeStats: { added: 518, deleted: 52 },
                depth: 1,
                id: "delta",
                kind: "workspace",
                label: "Delta",
            },
            {
                changeStats: { added: 518, deleted: 52 },
                depth: 1,
                id: "delta-unread",
                kind: "workspace",
                label: "Delta",
                unread: true,
            },
            {
                id: "both",
                kind: "project",
                label: "Mentioned while working",
                status: "working",
                unread: true,
                unreadMentioned: true,
            },
            {
                id: "busy",
                kind: "project",
                label: "Unread while working",
                status: "working",
                unread: true,
            },
        ],
    },
];

const render = () => {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="unread"
                onItemAction={() => {}}
                onItemSelect={() => {}}
                sections={sections()}
                style={{ width: 300 }}
            />
        ),
        { width: 320, height: 420 },
    );
    return view;
};

const mark = (id: string, part: string) =>
    document.querySelector<HTMLElement>(
        `[data-testid="unread"] [data-item-id="${id}"] [data-happy-desktop-ui="${part}"]`,
    );

const centre = (rect: DOMRect) => ({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
});

it("puts the unread dot on the mark's top corner and doubles it for a mention", async () => {
    const view = render();
    await view.ready();
    const dot = mark("unread", "sidebar-item-unread")!.getBoundingClientRect();
    const mention = mark("mentioned", "sidebar-item-unread")!.getBoundingClientRect();
    // The visible disc, inside a one-pixel ring of the surface.
    expect(dot.width - 2).toBe(6);
    expect(mention.width - 2).toBe(12);
    expect(mention.height).toBe(mention.width);
    for (const [id, rect] of [
        ["unread", dot],
        ["mentioned", mention],
    ] as const) {
        const leading = mark(id, "sidebar-item-leading")!.getBoundingClientRect();
        expect(centre(rect).x - leading.left).toBeCloseTo(18, 3);
        expect(centre(rect).y - leading.top).toBeCloseTo(3, 3);
        expect(
            mark(id, "sidebar-item-trailing")?.contains(mark(id, "sidebar-item-unread")),
        ).not.toBe(true);
    }
    // The `@` is drawn, centred by geometry: the label says it, and no text does.
    const badge = mark("mentioned", "sidebar-item-unread")!;
    expect(badge.textContent).toBe("");
    const glyph = centre(badge.querySelector("svg")!.getBoundingClientRect());
    expect(glyph.x).toBeCloseTo(centre(mention).x, 3);
    expect(glyph.y).toBeCloseTo(centre(mention).y, 3);
    expect(mark("unread", "sidebar-item-unread")!.querySelector("svg")).toBeNull();
    expect(
        document.querySelector('[data-happy-desktop-ui="sidebar-item-unread-count"]'),
    ).toBeNull();
});

it("keeps a row with no mark of its own in the spinner's cell, never moving the delta", async () => {
    const view = render();
    await view.ready();
    const spinner = mark("working", "sidebar-item-activity")!.getBoundingClientRect();
    const cell = mark("delta-unread", "sidebar-item-unread-cell")!.getBoundingClientRect();
    expect(cell.width).toBe(SIDEBAR_SLOT_CELL);
    expect(cell.width).toBe(spinner.width);
    expect(cell.right).toBe(spinner.right);
    const read = mark("delta", "sidebar-item-change-stats")!.getBoundingClientRect();
    const unread = mark("delta-unread", "sidebar-item-change-stats")!.getBoundingClientRect();
    // The cell joins the lane after the delta, exactly as a working spinner would.
    expect(unread.right).toBeLessThan(cell.left);
    expect(read.right - unread.right).toBe(cell.right - unread.right - 3);
});

it("shows the spinner and the unread mark together", async () => {
    const view = render();
    await view.ready();
    for (const id of ["both", "busy"]) {
        expect(mark(id, "sidebar-item-activity")).not.toBeNull();
        expect(mark(id, "sidebar-item-leading")!.contains(mark(id, "sidebar-item-unread"))).toBe(
            true,
        );
    }
    expect(mark("both", "sidebar-item-unread")!.hasAttribute("data-mentioned")).toBe(true);
});

it("keeps the mark in place while the hover control comes up", async () => {
    const view = render();
    await view.ready();
    const badge = mark("mentioned", "sidebar-item-unread")!;
    const before = badge.getBoundingClientRect();
    await userEvent.hover(
        document.querySelector('[data-testid="unread"] [data-item-id="mentioned"]')!,
    );
    await expect
        .poll(() => mark("mentioned", "sidebar-item-actions")?.getBoundingClientRect().width ?? 0)
        .toBeGreaterThan(0);
    expect(getComputedStyle(badge).visibility).toBe("visible");
    expect(badge.getBoundingClientRect()).toEqual(before);
});
