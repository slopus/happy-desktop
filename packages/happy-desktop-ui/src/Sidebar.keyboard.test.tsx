import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * A walked sidebar: the arrows, Home and End move the focus through every item
 * but the separators — Search, Create, rows, nested rows, section headings —
 * and bring it into view. Only one item is a Tab stop. Enter or Space
 * activates what has focus: a row or a command opens, a heading folds.
 */

const items: SidebarItem[] = [
    { icon: "search", id: "search", kind: "action", label: "Search" },
    { icon: "compose", id: "create", kind: "action", label: "Create" },
    { collapsed: false, icon: "doc", id: "happy", kind: "project", label: "Happy" },
    { depth: 1, icon: "doc", id: "happy-session", kind: "project", label: "A session" },
    { icon: "doc", id: "notes", kind: "project", label: "Notes" },
    { id: "rule", kind: "separator", label: "" },
    { collapsed: false, id: "desktop", kind: "section", label: "Desktop" },
    ...Array.from(
        { length: 12 },
        (_, index): SidebarItem => ({
            icon: "doc",
            id: `work-${String(index)}`,
            kind: "project",
            label: `Work ${String(index)}`,
        }),
    ),
];

const WALKED = items.filter((item) => item.kind !== "separator").map((item) => item.id);

it("walks every item but the separators with the arrows, Home and End, and activates with Enter or Space", async () => {
    const acts: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId="notes"
                data-testid="walked"
                foldControlPlacement="trailing"
                keyboardNavigation
                onItemCollapseToggle={(id) => acts.push(`fold:${id}`)}
                onItemReorder={() => {}}
                onItemSelect={(id) => acts.push(`open:${id}`)}
                style={{ width: 280, height: 260 }}
                sections={[{ id: "spaces", items }]}
            />
        ),
        { width: 304, height: 280 },
    );
    await view.ready();
    const root = view.$('[data-testid="walked"]').element;
    const node = (id: string) =>
        root.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="sidebar-item"][data-item-id="${id}"]`,
        )!;
    const focused = () =>
        (document.activeElement as HTMLElement | null)?.getAttribute("data-item-id");
    const stops = () =>
        [...root.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="sidebar-item"]')]
            .filter((item) => item.tabIndex === 0)
            .map((item) => item.getAttribute("data-item-id"));
    const viewport = root.querySelector<HTMLElement>(".happy-sidebar__body-viewport")!;
    const inView = (id: string) => {
        const box = viewport.getBoundingClientRect();
        const row = node(id).getBoundingClientRect();
        return row.top >= box.top - 0.5 && row.bottom <= box.bottom + 0.5;
    };

    // One Tab stop, the row on screen; the separator is never one.
    expect(stops()).toEqual(["notes"]);

    node("search").focus();
    const walked: (string | null | undefined)[] = [focused()];
    for (let step = 1; step < WALKED.length + 2; step += 1) {
        await userEvent.keyboard("{ArrowDown}");
        walked.push(focused());
    }
    // Every item but the separator, in order, stopping at the last.
    expect(walked).toEqual([...WALKED, WALKED.at(-1), WALKED.at(-1)]);
    expect(inView(WALKED.at(-1)!)).toBe(true);
    expect(stops()).toEqual([WALKED.at(-1)]);

    await userEvent.keyboard("{Home}");
    expect(focused()).toBe("search");
    expect(inView("search")).toBe(true);
    await userEvent.keyboard("{End}");
    expect(focused()).toBe(WALKED.at(-1));
    // Back up past the heading and the separator to the notes row.
    for (let step = 0; step < 13; step += 1) await userEvent.keyboard("{ArrowUp}");
    expect(focused()).toBe("notes");

    // Enter and Space activate what has focus.
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe("desktop");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("[Space]");
    node("create").focus();
    await userEvent.keyboard("[Space]");
    node("search").focus();
    await userEvent.keyboard("{Enter}");
    expect(acts).toEqual([
        "open:notes",
        "fold:desktop",
        "fold:desktop",
        "open:create",
        "open:search",
    ]);
}, 60_000);
