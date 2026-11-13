import type { ReactNode } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import { fixedBlockMeasure } from "./fixedBlock";
import { MenuButton } from "./MenuButton";
import { MessageMention } from "./MessageMention";
import { Sidebar } from "./Sidebar";
import { Tabs } from "./Tabs";
import { createRenderer } from "./testing";
import { TransferZone } from "./TransferZone";
import { WorkTabControls } from "./WorkTabControls";

/*
 * Everything the window floats over its content is placed from a rectangle or a
 * pointer measured against the window, and drawn as a fixed box. Inside a
 * connection that box is laid out against the connection's surface, which is
 * contained on purpose and starts beside the rail — not at the window's edge.
 * Each of these has to open where it was asked for all the same.
 */

/** How far the stand-in for the connection surface starts from the window's corner. */
const RAIL = 56;
const BAND = 24;

function surface(contained: boolean, children: ReactNode) {
    return (
        <div
            data-surface=""
            style={{
                display: "flex",
                flexDirection: "column",
                width: 520,
                height: 420,
                marginLeft: RAIL,
                marginTop: BAND,
                ...(contained ? { contain: "layout" } : {}),
            }}
        >
            {children}
        </div>
    );
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const box = (element: Element) => {
    const bounds = element.getBoundingClientRect();
    return {
        left: Math.round(bounds.left * 100) / 100,
        top: Math.round(bounds.top * 100) / 100,
        right: Math.round(bounds.right * 100) / 100,
        bottom: Math.round(bounds.bottom * 100) / 100,
    };
};

const ITEMS = [
    { kind: "item" as const, id: "one", label: "One" },
    { kind: "item" as const, id: "two", label: "Two" },
    { kind: "item" as const, id: "three", label: "Three" },
];

it("measures the window when nothing contains the box", async () => {
    const view = createRenderer();
    view.render(() => surface(false, <span />), { width: 640, height: 480 });
    await view.ready();
    const plain = view.container.querySelector("[data-surface]")!;
    expect(fixedBlockMeasure(plain)).toEqual({
        left: 0,
        top: 0,
        right: document.documentElement.clientWidth,
        bottom: document.documentElement.clientHeight,
    });
    // The probe is gone again by the time the measurement is returned.
    expect(plain.children.length).toBe(1);
});

it("measures the surface when it contains the box", async () => {
    const view = createRenderer();
    view.render(() => surface(true, <span />), { width: 640, height: 480 });
    await view.ready();
    const contained = view.container.querySelector("[data-surface]")!;
    const bounds = box(contained);
    expect(bounds.left).toBeGreaterThanOrEqual(RAIL);
    expect(bounds.top).toBeGreaterThanOrEqual(BAND);
    expect(fixedBlockMeasure(contained)).toEqual(bounds);
    expect(contained.children.length).toBe(1);
});

for (const contained of [false, true]) {
    const where = contained ? "inside a contained surface" : "against the window";

    it(`hangs a menu button's card from its trigger ${where}`, async () => {
        const view = createRenderer();
        view.render(
            () =>
                surface(
                    contained,
                    <>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <WorkTabControls
                                chats={{ items: () => ITEMS, onSelect: () => {} }}
                                floatyOpen={false}
                                onFloatyOpenChange={() => {}}
                            />
                        </div>
                        <div style={{ display: "flex", flex: "1 1 0%" }} />
                        <div style={{ display: "flex", paddingLeft: 180 }}>
                            <MenuButton
                                icon="settings"
                                items={ITEMS}
                                label="Theme"
                                menuLabel="Theme"
                                menuWidth={160}
                                onSelect={() => {}}
                                overlay
                                placement="above"
                            />
                        </div>
                    </>,
                ),
            { width: 640, height: 480 },
        );
        await view.ready();

        // Under the trigger, ending on the trigger's far edge.
        const chats = view.container.querySelector<HTMLElement>('[aria-label="Show chats"]')!;
        await userEvent.click(chats);
        await view.ready();
        const below = box(view.$('[role="menu"]').element);
        const chatsBox = box(chats);
        expect(below.right).toBe(chatsBox.right);
        expect(below.top).toBe(chatsBox.bottom + 4);
        await userEvent.keyboard("{Escape}");
        await view.ready();
        expect(view.container.querySelector('[role="menu"]')).toBeNull();

        // Over the trigger, starting on the trigger's near edge.
        const theme = view.container.querySelector<HTMLElement>('[aria-label="Theme"]')!;
        await userEvent.click(theme);
        await view.ready();
        const above = box(view.$('[role="menu"]').element);
        const themeBox = box(theme);
        expect(above.left).toBe(themeBox.left);
        expect(above.bottom).toBe(themeBox.top - 4);
    });

    it(`opens a tab's menu and a sidebar row's menu at the pointer ${where}`, async () => {
        const view = createRenderer();
        view.render(
            () =>
                surface(
                    contained,
                    <>
                        <Tabs
                            activeId="a"
                            onSelect={() => {}}
                            tabMenuItems={() => ITEMS}
                            tabs={[
                                { id: "a", label: "First" },
                                { id: "b", label: "Second" },
                            ]}
                        />
                        <div style={{ display: "flex", flex: "1 1 0%", width: 260 }}>
                            <Sidebar
                                activeItemId="row"
                                itemMenuItems={() => ITEMS}
                                onItemMenuSelect={() => {}}
                                onItemSelect={() => {}}
                                sections={[
                                    {
                                        id: "chats",
                                        label: "Chats",
                                        items: [{ id: "row", kind: "channel", label: "A chat" }],
                                    },
                                ]}
                            />
                        </div>
                    </>,
                ),
            { width: 640, height: 480 },
        );
        await view.ready();

        const rightClick = (target: Element, clientX: number, clientY: number) =>
            target.dispatchEvent(
                new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    clientX,
                    clientY,
                }),
            );

        // A menu is in the document once the browser has drawn the press.
        const shown = (selector: string) =>
            expect.poll(() => document.querySelector(selector), { timeout: 3000 }).not.toBeNull();
        const tab = view.container.querySelector('[role="tab"]')!;
        rightClick(tab, 150, 40);
        await shown('[data-happy-desktop-ui="tabs-menu"]');
        const tabMenu = box(view.$('[data-happy-desktop-ui="tabs-menu"]').element);
        expect({ left: tabMenu.left, top: tabMenu.top }).toEqual({ left: 150, top: 40 });
        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        await expect
            .poll(() => document.querySelector('[data-happy-desktop-ui="tabs-menu"]'))
            .toBeNull();

        const row = view.container.querySelector('[data-item-id="row"]')!;
        rightClick(row, 120, 110);
        await shown('[data-happy-desktop-ui="sidebar-item-menu"]');
        const rowMenu = box(view.$('[data-happy-desktop-ui="sidebar-item-menu"]').element);
        expect({ left: rowMenu.left, top: rowMenu.top }).toEqual({ left: 120, top: 110 });

        // Pushed back inside the window when asked for past its edge, not
        // inside the surface's own box.
        rightClick(row, window.innerWidth - 4, 110);
        await expect
            .poll(() => box(view.$('[data-happy-desktop-ui="sidebar-item-menu"]').element).right)
            .toBe(window.innerWidth - 8);
    });

    it(`carries a tab at the pointer ${where}`, async () => {
        const view = createRenderer();
        view.render(
            () =>
                surface(
                    contained,
                    <>
                        <Tabs
                            activeId="a"
                            onSelect={() => {}}
                            onTransfer={() => {}}
                            tabs={[
                                { id: "a", label: "First" },
                                { id: "b", label: "Second" },
                            ]}
                            transferTargets={[
                                { zone: "side", label: "the side panel", side: "trailing" },
                            ]}
                        />
                        <TransferZone id="side" label="Move to the side panel">
                            <div style={{ display: "flex", flex: "1 1 0%", height: 200 }} />
                        </TransferZone>
                    </>,
                ),
            { width: 640, height: 480 },
        );
        await view.ready();

        const tab = view.container.querySelector<HTMLElement>('[role="tab"]')!;
        // A scripted pointer is not one the browser can capture.
        tab.setPointerCapture = () => {};
        tab.releasePointerCapture = () => {};
        const start = tab.getBoundingClientRect();
        const pointer = (type: string, clientX: number, clientY: number) =>
            tab.dispatchEvent(
                new PointerEvent(type, {
                    bubbles: true,
                    button: 0,
                    cancelable: true,
                    clientX,
                    clientY,
                    isPrimary: true,
                    pointerId: 7,
                }),
            );
        pointer("pointerdown", start.left + 10, start.top + 10);
        pointer("pointermove", 260, 200);
        await frame();
        const carried = view.$('[data-happy-desktop-ui="tab-carried"]').element;
        const first = carried.getBoundingClientRect();
        // Centred on the pointer.
        expect(Math.round(first.left + first.width / 2)).toBe(260);
        expect(Math.round(first.top + first.height / 2)).toBe(200);
        pointer("pointermove", 300, 240);
        await frame();
        const second = carried.getBoundingClientRect();
        expect(Math.round(second.left + second.width / 2)).toBe(300);
        expect(Math.round(second.top + second.height / 2)).toBe(240);
        pointer("pointerup", 300, 240);
        await frame();
    });

    it(`opens a mentioned teammate's card on their tag ${where}`, async () => {
        const view = createRenderer();
        view.render(
            () =>
                surface(
                    contained,
                    <p style={{ margin: 0, paddingTop: 160, paddingLeft: 40 }}>
                        Ask{" "}
                        <MessageMention
                            href="happy://people/ada"
                            person={{
                                type: "person",
                                label: "@Ada",
                                name: "Ada",
                                role: "Engineer",
                                self: false,
                            }}
                        >
                            @Ada
                        </MessageMention>
                    </p>,
                ),
            { width: 640, height: 480 },
        );
        await view.ready();

        const tag = view.container.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="message-person"]',
        )!;
        // The pointer resting on the tag, which opens it whether or not the
        // browser's window has the keyboard.
        await userEvent.hover(tag);
        await expect
            .poll(() => view.container.querySelector('[data-happy-desktop-ui="mention-card"]'), {
                timeout: 3000,
            })
            .not.toBeNull();
        const card = box(view.$('[data-happy-desktop-ui="mention-card"]').element);
        const line = box(tag);
        expect(card.left).toBe(line.left);
        expect(card.bottom).toBe(line.top - 6);
    });
}
