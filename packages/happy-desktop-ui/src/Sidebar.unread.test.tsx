import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, SIDEBAR_SLOT_CELL, type SidebarSection } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * A row's unread mark is a red dot centred on the top corner of its own mark,
 * mirroring the folded count centred on the bottom one. A mention is a disc of
 * exactly the folded count's diameter on the same centre. It never carries a
 * number and never touches the trailing lane; a row with no mark of its own
 * wears it in the spinner's cell instead.
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
            {
                collapsed: true,
                id: "folded",
                kind: "project",
                label: "Folded and mentioned",
                unread: true,
                unreadMentioned: true,
            },
            { depth: 1, id: "folded-a", kind: "workspace", label: "Hidden" },
            { depth: 1, id: "folded-b", kind: "workspace", label: "Hidden" },
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
                onItemCollapseToggle={() => {}}
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

it("mirrors the unread mark and the folded count across the mark's corners at one diameter", async () => {
    const view = render();
    await view.ready();
    const leading = mark("folded", "sidebar-item-leading")!.getBoundingClientRect();
    const mention = mark("folded", "sidebar-item-unread")!.getBoundingClientRect();
    const count = document
        .querySelector<HTMLElement>(
            '[data-testid="unread"] [data-item-id="folded"] .happy-sidebar__item-folded',
        )!
        .getBoundingClientRect();
    const top = centre(mention);
    const bottom = centre(count);
    // Both centres on the mark box's right edge, one on each corner.
    expect(top.x).toBe(leading.right);
    expect(bottom.x).toBe(leading.right);
    expect(top.y).toBe(leading.top);
    expect(bottom.y).toBe(leading.bottom);
    // Mirrored about the mark's midline.
    const midline = leading.top + leading.height / 2;
    expect(midline - top.y).toBe(bottom.y - midline);
    // One diameter, a circle each, with the same ring.
    expect(count.width).toBe(count.height);
    expect(mention.width).toBe(mention.height);
    expect(mention.width).toBe(count.width);
    const ring = (selector: string) =>
        getComputedStyle(
            document.querySelector(`[data-testid="unread"] [data-item-id="folded"] ${selector}`)!,
        ).borderTopWidth;
    expect(ring(".happy-sidebar__item-unread")).toBe(ring(".happy-sidebar__item-folded"));
    // The plain dot is smaller, on the same centre.
    for (const id of ["unread"]) {
        const dot = mark(id, "sidebar-item-unread")!.getBoundingClientRect();
        const lead = mark(id, "sidebar-item-leading")!.getBoundingClientRect();
        expect(dot.width).toBeLessThan(mention.width);
        expect(centre(dot).x).toBe(lead.right);
        expect(centre(dot).y).toBe(lead.top);
    }
    expect(mark("folded", "sidebar-item-unread")!.textContent).toBe("");
    expect(mark("folded", "sidebar-item-trailing")).toBeNull();
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
