import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, SIDEBAR_SLOT_CELL, type SidebarSection } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * A row's unread mark is the activity spinner's own cell at the trailing edge:
 * the same square, on the same column, so the marks of a list stand in one
 * line. It never carries a number, never moves the Git delta before it, never
 * sits on the avatar's corner, and gives way to a hover control as the spinner
 * does.
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

it("puts the unread mark in the spinner's cell, with no number and nothing on the avatar", async () => {
    const view = render();
    await view.ready();
    const spinner = mark("working", "sidebar-item-activity")!.getBoundingClientRect();
    expect(spinner.width).toBe(SIDEBAR_SLOT_CELL);
    for (const id of ["unread", "mentioned"]) {
        const cell = mark(id, "sidebar-item-unread")!.getBoundingClientRect();
        expect(cell.width).toBe(spinner.width);
        expect(cell.height).toBe(spinner.height);
        expect(cell.right).toBe(spinner.right);
        // Sub-pixel layout rounds the two rows apart by a few millionths.
        expect(cell.top - mark(id, "sidebar-item-label")!.getBoundingClientRect().top).toBeCloseTo(
            spinner.top - mark("working", "sidebar-item-label")!.getBoundingClientRect().top,
            3,
        );
    }
    // The `@` is drawn, not written: the label says it, and nothing else does.
    expect(mark("unread", "sidebar-item-unread")!.textContent).toBe("");
    expect(mark("mentioned", "sidebar-item-unread")!.textContent).toBe("");
    expect(getComputedStyle(mark("mentioned", "sidebar-item-unread")!, "::before").content).toBe(
        '"@"',
    );
    expect(
        document.querySelector('[data-happy-desktop-ui="sidebar-item-leading-unread"]'),
    ).toBeNull();
    expect(
        document.querySelector('[data-happy-desktop-ui="sidebar-item-unread-count"]'),
    ).toBeNull();
});

it("never moves the delta or shortens the name more than the spinner's cell does", async () => {
    const view = render();
    await view.ready();
    const read = mark("delta", "sidebar-item-change-stats")!.getBoundingClientRect();
    const unread = mark("delta-unread", "sidebar-item-change-stats")!.getBoundingClientRect();
    const cell = mark("delta-unread", "sidebar-item-unread")!.getBoundingClientRect();
    // The cell joins the lane after the delta, exactly as a working spinner would.
    expect(unread.right).toBeLessThan(cell.left);
    expect(read.right - unread.right).toBe(cell.right - unread.right - 3);
});

it("lets a mention outrank the spinner, and the spinner outrank the plain dot", async () => {
    const view = render();
    await view.ready();
    expect(mark("both", "sidebar-item-unread")?.hasAttribute("data-mentioned")).toBe(true);
    expect(mark("both", "sidebar-item-activity")).toBeNull();
    expect(mark("busy", "sidebar-item-activity")).not.toBeNull();
    expect(mark("busy", "sidebar-item-unread")).toBeNull();
});

it("swaps the mark for the hover control in the same cell", async () => {
    const view = render();
    await view.ready();
    const cell = mark("mentioned", "sidebar-item-unread")!;
    const before = cell.getBoundingClientRect();
    await userEvent.hover(
        document.querySelector('[data-testid="unread"] [data-item-id="mentioned"]')!,
    );
    await expect.poll(() => getComputedStyle(cell).visibility).toBe("hidden");
    const control = document
        .querySelector(
            '[data-testid="unread"] [data-item-id="mentioned"] [data-happy-desktop-ui="sidebar-item-actions"]',
        )!
        .getBoundingClientRect();
    expect(control.right).toBe(before.right);
    expect(cell.getBoundingClientRect()).toEqual(before);
});
