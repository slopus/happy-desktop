import type { SidebarItem, SidebarSection } from "./Sidebar";

/**
 * Makes a function that hands back the previous sections, sections and rows wherever the next
 * ones are structurally equal.
 *
 * Owners rebuild every section and row from a fresh store snapshot, so a change that touches
 * nothing the sidebar shows — an agent moving from thinking to running tools, say — would still
 * give every row a new object and re-render the whole list. Sections are plain data, so equal
 * content means the same row: keeping the earlier object lets the list's memoized render stand
 * and re-renders only rows that actually changed.
 */
export function sidebarSectionsReuser(): (
    sections: readonly SidebarSection[],
) => readonly SidebarSection[] {
    let previous: readonly SidebarSection[] = [];
    return (sections) => {
        const before = new Map(previous.map((section) => [section.id, section]));
        const next = sections.map((section) => sectionReuse(before.get(section.id), section));
        if (next.length === previous.length && next.every((section, i) => section === previous[i]))
            return previous;
        previous = next;
        return next;
    };
}

function sectionReuse(previous: SidebarSection | undefined, next: SidebarSection): SidebarSection {
    if (previous === undefined) return next;
    const before = new Map(previous.items.map((item) => [item.id, item]));
    const items = next.items.map((item) => itemReuse(before.get(item.id), item));
    const itemsSame =
        items.length === previous.items.length &&
        items.every((item, i) => item === previous.items[i]);
    const { items: _nextItems, ...nextRest } = next;
    const { items: _previousItems, ...previousRest } = previous;
    if (itemsSame && dataEqual(previousRest, nextRest)) return previous;
    return { ...next, items: itemsSame ? previous.items : items };
}

function itemReuse(previous: SidebarItem | undefined, next: SidebarItem): SidebarItem {
    return previous !== undefined && dataEqual(previous, next) ? previous : next;
}

/**
 * Equality over plain data: primitives, arrays, and objects of them. A rendered
 * node a section carries (`headingAccessory`, `notice`) is not data: it is the
 * same only as the same object, and is never walked — an element leads back to
 * the tree that made it.
 */
function dataEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (typeof left !== "object" || typeof right !== "object" || left === null || right === null)
        return false;
    if ("$$typeof" in left || "$$typeof" in right) return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const leftKeys = Object.keys(left);
    if (leftKeys.length !== Object.keys(right).length) return false;
    return leftKeys.every(
        (key) =>
            Object.hasOwn(right, key) &&
            dataEqual(
                (left as Record<string, unknown>)[key],
                (right as Record<string, unknown>)[key],
            ),
    );
}
