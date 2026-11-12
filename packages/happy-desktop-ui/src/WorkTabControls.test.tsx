import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/scrollbar.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/badge.css";
import "./styles/menu.css";
import "./styles/menu-button.css";
import "./styles/work-story.css";
import { CLOSE_SHORTCUT } from "./keyboardShortcut";
import type { MenuItem } from "./Menu";
import { createRenderer } from "./testing";
import { WorkTabControls } from "./WorkTabControls";

/*
 * The band's trailing controls with the chats menu: what the reader sees of a
 * workspace's open and closed chats, and that the menu is the keyboard's while
 * it is open — Escape and the close chord close it, never the chat behind it.
 */

const LONG = "Collapse the session list into one screen per folder, then address it by URL";
const CHATS: MenuItem[] = [
    { kind: "label", label: "Open" },
    { kind: "item", id: "chat:one", label: "Refactor the router", icon: "chat", detail: "now" },
    { kind: "item", id: "chat:two", label: LONG, icon: "chat", detail: "12m" },
    { kind: "separator" },
    { kind: "label", label: "Closed" },
    { kind: "item", id: "chat:three", label: "Fix the upload test", icon: "archive", detail: "3h" },
    {
        kind: "item",
        id: "chat:four",
        label: "Weekly plan usage",
        icon: "archive",
        detail: "10/19",
        disabled: true,
    },
];

function controls(selected: string[] = [], toggled: boolean[] = []) {
    return createRenderer().render(
        () => (
            <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                <WorkTabControls
                    chats={{ items: () => CHATS, onSelect: (id) => selected.push(id) }}
                    floatyOpen={false}
                    onFloatyOpenChange={(open) => toggled.push(open)}
                />
            </div>
        ),
        { width: 420, height: 320, padding: 16 },
    );
}

const closeChord = (target: Element) => {
    const meta = CLOSE_SHORTCUT.modifier === "Meta";
    target.dispatchEvent(
        new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            code: "KeyW",
            ctrlKey: !meta,
            key: "w",
            metaKey: meta,
        }),
    );
};

it("holds the chats menu beside the activity toggle, and lists open and closed chats with when", async () => {
    const view = controls();
    await view.ready();

    const trigger = view.$('[data-happy-desktop-ui="menu-button"] > button');
    const toggle = view.$(".happy-work-tab-controls__toggle");
    // Two equal squares on the band's control gap, the menu first.
    expect(trigger.bounds()).toMatchObject({ width: 28, height: 28 });
    expect(toggle.bounds()).toMatchObject({ width: 28, height: 28 });
    expect(toggle.bounds().x - (trigger.bounds().x + trigger.bounds().width)).toBe(4);
    expect(toggle.bounds().y).toBe(trigger.bounds().y);
    expect(trigger.element.getAttribute("aria-label")).toBe("Show chats");
    expect(trigger.element.getAttribute("aria-haspopup")).toBe("menu");
    // Nothing is read, or drawn, until the menu is asked for.
    expect(view.container.querySelector('[role="menu"]')).toBeNull();

    await userEvent.click(trigger.element);
    await view.ready();

    const menu = view.$('[role="menu"]');
    expect(menu.bounds().width).toBe(300);
    // The card ends on the trigger's own far edge, four pixels under it.
    expect(menu.bounds().x + menu.bounds().width).toBe(trigger.bounds().x + trigger.bounds().width);
    expect(menu.bounds().y).toBe(trigger.bounds().y + trigger.bounds().height + 4);
    expect(view.$('[data-happy-desktop-ui="menu-header"]').element.textContent).toBe("Chats");
    expect(
        [...view.container.querySelectorAll('[data-happy-desktop-ui="menu-label"]')].map(
            (label) => label.textContent,
        ),
    ).toEqual(["Open", "Closed"]);

    const rows = [...view.container.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(rows.map((row) => row.getAttribute("data-item-id"))).toEqual([
        "chat:one",
        "chat:two",
        "chat:three",
        "chat:four",
    ]);
    const details = rows.map(
        (row) => row.querySelector<HTMLElement>('[data-happy-desktop-ui="menu-item-detail"]')!,
    );
    expect(details.map((detail) => detail.textContent)).toEqual(["now", "12m", "3h", "10/19"]);

    // When is a quiet word: the secondary ink of the row's own glyph, smaller
    // than the name, in figures of one width.
    const detailStyle = getComputedStyle(details[0]!);
    const glyph = rows[0]!.querySelector('[data-happy-desktop-ui="menu-item-icon"]')!;
    expect(detailStyle.color).toBe(getComputedStyle(glyph).color);
    expect(detailStyle.fontSize).toBe("12px");
    expect(detailStyle.lineHeight).toBe("16px");
    expect(detailStyle.fontVariantNumeric).toBe("tabular-nums");

    // Every detail is whole and ends on one edge, eight pixels inside its row.
    for (const [index, detail] of details.entries()) {
        const row = rows[index]!.getBoundingClientRect();
        const box = detail.getBoundingClientRect();
        expect(detail.scrollWidth, detail.textContent ?? "").toBeLessThanOrEqual(
            detail.clientWidth,
        );
        expect(Math.round(row.right - box.right)).toBe(8);
        // Centred on the 28px row.
        expect(Math.round(box.top - row.top)).toBe(6);
        expect(Math.round(box.height)).toBe(16);
    }

    // A long title gives way to it: it ends in an ellipsis eight pixels short
    // of the time, and the row keeps the menu's width.
    const long = rows[1]!.querySelector<HTMLElement>('[data-happy-desktop-ui="menu-item-label"]')!;
    expect(long.scrollWidth).toBeGreaterThan(long.clientWidth);
    expect(getComputedStyle(long).textOverflow).toBe("ellipsis");
    expect(
        Math.round(details[1]!.getBoundingClientRect().left - long.getBoundingClientRect().right),
    ).toBe(8);
    expect(rows[1]!.getBoundingClientRect().width).toBe(rows[0]!.getBoundingClientRect().width);
    const short = rows[0]!.querySelector<HTMLElement>('[data-happy-desktop-ui="menu-item-label"]')!;
    expect(short.scrollWidth).toBeLessThanOrEqual(short.clientWidth);

    // A chat that cannot be reopened right now says so by being unavailable.
    expect((rows[3] as HTMLButtonElement).disabled).toBe(true);

    await view.screenshot("WorkTabControls.test");
});

it("is worked from the keyboard, and closes on Escape or the close chord before anything behind it", async () => {
    const selected: string[] = [];
    const view = controls(selected);
    await view.ready();
    const trigger = view.$('[data-happy-desktop-ui="menu-button"] > button')
        .element as HTMLButtonElement;
    const rowFocused = () => document.activeElement?.getAttribute("data-item-id") ?? null;
    const menuOpen = () => view.container.querySelector('[role="menu"]') !== null;

    // Opening from the keyboard lands on the first chat.
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await view.ready();
    expect(menuOpen()).toBe(true);
    expect(rowFocused()).toBe("chat:one");

    // The arrows walk the chats and skip the one that is unavailable.
    await userEvent.keyboard("{ArrowDown}");
    expect(rowFocused()).toBe("chat:two");
    await userEvent.keyboard("{ArrowDown}");
    expect(rowFocused()).toBe("chat:three");
    await userEvent.keyboard("{ArrowDown}");
    expect(rowFocused()).toBe("chat:one");
    await userEvent.keyboard("{End}");
    expect(rowFocused()).toBe("chat:three");

    // The close chord closes the menu. The window's own close command listens
    // behind it and must never hear the press, or it would close the chat too.
    const reached: KeyboardEvent[] = [];
    const windowListener = (event: KeyboardEvent) => {
        if (event.key === "Escape" || event.code === "KeyW") reached.push(event);
    };
    window.addEventListener("keydown", windowListener);
    closeChord(document.activeElement!);
    await view.ready();
    expect(menuOpen()).toBe(false);
    expect(reached).toEqual([]);
    expect(document.activeElement).toBe(trigger);
    expect(selected).toEqual([]);

    // Escape does the same.
    await userEvent.keyboard("{Enter}");
    await view.ready();
    expect(menuOpen()).toBe(true);
    await userEvent.keyboard("{Escape}");
    await view.ready();
    window.removeEventListener("keydown", windowListener);
    expect(menuOpen()).toBe(false);
    expect(reached).toEqual([]);
    expect(document.activeElement).toBe(trigger);

    // With the menu closed the chord is not the menu's: it goes on to the window.
    window.addEventListener("keydown", windowListener);
    closeChord(trigger);
    window.removeEventListener("keydown", windowListener);
    expect(reached.length).toBe(1);
    expect(reached[0]!.defaultPrevented).toBe(false);

    // Choosing a chat reports it once and closes the menu. Each key waits for
    // the menu to have taken the keyboard, as a reader's next press does.
    await userEvent.keyboard("{Enter}");
    await expect.poll(rowFocused).toBe("chat:one");
    await userEvent.keyboard("{End}");
    await expect.poll(rowFocused).toBe("chat:three");
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => selected).toEqual(["chat:three"]);
    expect(menuOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
});

it("offers no chats menu to a band that has none, and leaves the toggle where it was", async () => {
    const toggled: boolean[] = [];
    const view = createRenderer().render(
        () => (
            <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                <WorkTabControls
                    floatyOpen={false}
                    onFloatyOpenChange={(open) => toggled.push(open)}
                />
            </div>
        ),
        { width: 420, height: 80, padding: 16 },
    );
    await view.ready();

    expect(view.container.querySelector('[data-happy-desktop-ui="menu-button"]')).toBeNull();
    const controlsBox = view.$('[data-happy-desktop-ui="work-tab-controls"]').bounds();
    const toggle = view.$(".happy-work-tab-controls__toggle");
    expect(controlsBox.width).toBe(28);
    expect(toggle.bounds()).toMatchObject({ width: 28, height: 28 });

    await userEvent.click(toggle.element);
    expect(toggled).toEqual([true]);
});
