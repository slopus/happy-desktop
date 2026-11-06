import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, SIDEBAR_SLOT_CELL, type SidebarSection } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * A row's unread mark is a red dot centred on the top-right pixel of its photo,
 * mirroring the folded count centred on the bottom-right one. A mention is a
 * blue disc of exactly the folded count's diameter on the same centre. It never carries a
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

const element = (id: string, selector: string) =>
    document.querySelector<HTMLElement>(
        `[data-testid="unread"] [data-item-id="${id}"] ${selector}`,
    )!;

const ratioVariable = () =>
    getComputedStyle(document.querySelector('[data-testid="unread"]')!).getPropertyValue(
        "--happy-device-pixel",
    );

/** Sets the window's device pixel ratio, as page zoom or another screen would. */
const withRatio = async (ratio: number) => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: ratio });
    window.dispatchEvent(new Event("resize"));
    await expect.poll(ratioVariable).toBe(`${1 / ratio}px`);
};

const near = (actual: number, expected: number) =>
    expect(Math.abs(actual - expected)).toBeLessThan(0.1);

it("centres each corner badge on the photo's corner pixel, in device pixels at every ratio", async () => {
    const view = render();
    await view.ready();
    const own = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    const real = devicePixelRatio;
    try {
        for (const ratio of [1, 1.25, 1.5, 2, 2.5, 3]) {
            await withRatio(ratio);
            const photo = element("folded", ".happy-avatar").getBoundingClientRect();
            // Layout keeps 1/64 (Chromium) or 1/60 (Gecko) of a CSS pixel, so a
            // tenth of a device pixel is the tolerance; the rendered pixels are
            // measured exactly by the sheet.
            // The photo's last pixel column and its top and bottom rows, counted
            // from its first device pixel; a disc is centred on a pixel's middle.
            const last = Math.round(photo.width * ratio) - 1 + 0.5;
            const first = 0.5;
            const at = (rect: DOMRect) => ({
                x: (rect.left - photo.left) * ratio + (rect.width * ratio) / 2,
                y: (rect.top - photo.top) * ratio + (rect.height * ratio) / 2,
                diameter: rect.width * ratio,
            });
            const mention = at(
                element(
                    "folded",
                    '[data-happy-desktop-ui="sidebar-item-unread"]',
                ).getBoundingClientRect(),
            );
            const count = at(
                element("folded", ".happy-sidebar__item-folded").getBoundingClientRect(),
            );
            const dot = at(
                element(
                    "unread",
                    '[data-happy-desktop-ui="sidebar-item-unread"]',
                ).getBoundingClientRect(),
            );
            const dotPhoto = element("unread", ".happy-avatar").getBoundingClientRect();
            near(mention.x, last);
            near(mention.y, first);
            near(count.x, last);
            near(count.y, last);
            // The dot shares the rule, on its own row's photo.
            near(dot.x - (dotPhoto.left - photo.left) * ratio, last);
            // One diameter for both badges, an odd whole number of device pixels,
            // so the centre is a pixel; the plain dot is smaller and odd too.
            near(mention.diameter, count.diameter);
            for (const diameter of [mention.diameter, dot.diameter]) {
                near(diameter % 2, 1);
            }
            expect(dot.diameter).toBeLessThan(mention.diameter);
            expect(
                getComputedStyle(element("folded", ".happy-sidebar__item-unread")).borderTopWidth,
            ).toBe(
                getComputedStyle(element("folded", ".happy-sidebar__item-folded")).borderTopWidth,
            );
        }
    } finally {
        if (own) Object.defineProperty(window, "devicePixelRatio", own);
        else Reflect.deleteProperty(window, "devicePixelRatio");
        window.dispatchEvent(new Event("resize"));
        await expect.poll(ratioVariable).toBe(`${1 / real}px`);
    }
    expect(element("folded", '[data-happy-desktop-ui="sidebar-item-unread"]').textContent).toBe("");
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
