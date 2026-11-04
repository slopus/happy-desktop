import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/menu.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import "./styles/badge.css";
import { Menu, type MenuItem } from "./Menu";
import { createRenderer, type VisiblePixelMetrics } from "./testing";

const FIGTREE = "happy Figtree, system-ui, sans-serif";

it("gives checked and unchecked Stories rows checkbox semantics with a real check glyph", async () => {
    const selected: string[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <Menu
                items={[
                    { kind: "item", id: "on", label: "Stories", checked: true },
                    { kind: "item", id: "off", label: "Stories", checked: false },
                ]}
                onSelect={(id) => selected.push(id)}
            />
        ),
        { width: 260, height: 100 },
    );
    await view.ready();
    for (const id of ["on", "off"]) {
        const row = view.$(`[data-item-id="${id}"]`);
        expect(row.element.getAttribute("role")).toBe("menuitemcheckbox");
        expect(row.element.getAttribute("aria-checked")).toBe(String(id === "on"));
        expect(row.element.querySelector('[data-happy-desktop-ui="icon"]') !== null).toBe(
            id === "on",
        );
        (row.element as HTMLButtonElement).click();
    }
    expect(
        (await view.$('[data-item-id="on"] [data-happy-desktop-ui="icon"]').visibleMetrics())
            .pixelCount,
    ).toBeGreaterThan(0);
    expect(view.$('[data-item-id="on"] .happy-menu__item-label').bounds().x).toBe(
        view.$('[data-item-id="off"] .happy-menu__item-label').bounds().x,
    );
    expect(selected).toEqual(["on", "off"]);
    view.destroy();
});

/*
 * The leading glyph fills its 16px slot. The icon font paints the glyph
 * box-centered, so Menu only owns the slot box and the fact that the glyph
 * really paints — a blank or unloaded font then fails loudly.
 */
async function assertIconInk(view: ReturnType<typeof createRenderer>, itemId: string) {
    const icon = view.$(
        `[data-testid="actions"] [data-item-id="${itemId}"] [data-happy-desktop-ui="menu-item-icon"] [data-happy-desktop-ui="icon"]`,
    );
    expect(icon.bounds().width, `${itemId} icon box`).toBe(16);
    expect(icon.bounds().height, `${itemId} icon box`).toBe(16);
    const visible = await icon.visibleMetrics();
    expect(visible.pixelCount, `${itemId} icon paints no pixels`).toBeGreaterThan(0);
}

it("holds Menu popover geometry, item rows, icons, danger, and shortcuts", async () => {
    const selected: string[] = [];
    const view = createRenderer();

    const items: MenuItem[] = [
        { kind: "item", id: "copy", label: "Copy link", icon: "link", shortcut: "⌘C" },
        { kind: "item", id: "star", label: "Add to starred", icon: "star" },
        { kind: "item", id: "view", label: "View details", icon: "eye", shortcut: "⌘I" },
        { kind: "separator" },
        { kind: "item", id: "edit", label: "Edit message", icon: "edit", shortcut: "⌘E" },
        {
            kind: "item",
            id: "delete",
            label: "Delete message",
            icon: "close",
            danger: true,
            shortcut: "⇧⌘D",
        },
    ];

    view.render(
        () => <Menu data-testid="actions" items={items} onSelect={(id) => selected.push(id)} />,
        { width: 320, height: 240, padding: 24 },
    );
    await view.ready();

    /* ---- Card contract --------------------------------------------------- */

    const menu = view.$('[data-testid="actions"]');
    expect(menu.element.getAttribute("role")).toBe("menu");
    expect(menu.element.hasAttribute("data-has-icons")).toBe(true);
    /* default 220px card; height is the sum of 4+4 list padding, 5 rows @28,
     * and the 1px separator with 4px margins, plus the 1px border top+bottom. */
    expect(menu.bounds()).toEqual({ x: 24, y: 24, width: 220, height: 159 });
    expect(
        menu.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "10px",
        "border-top-color": "rgba(0, 0, 0, 0.1)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        display: "flex",
    });
    expect((await menu.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const list = view.$('[data-testid="actions"] [data-happy-desktop-ui="menu-list"]');
    /* The list is inset by exactly the 1px card border on every edge. */
    expect(list.offsets()).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    /* The list is the scrolling column; the rows wrapper inside it carries
       the 4px inset so the inset scrolls with the rows. */
    expect(list.computedStyles(["display", "flex-direction", "padding"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        padding: "0px",
    });
    expect(
        view
            .$('[data-testid="actions"] [data-happy-desktop-ui="menu-rows"]')
            .computedStyles(["padding"]),
    ).toEqual({ padding: "4px" });

    /* ---- Row grid -------------------------------------------------------- */

    const item = (id: string) => view.$(`[data-testid="actions"] [data-item-id="${id}"]`);
    const rowIds = ["copy", "star", "view", "edit", "delete"] as const;

    for (const id of rowIds) {
        const row = item(id);
        expect(row.element.getAttribute("role"), `${id} role`).toBe("menuitem");
        expect(row.bounds().height, `${id} height`).toBe(28);
        expect(
            row.computedStyles([
                "align-items",
                "background-color",
                "border-radius",
                "cursor",
                "display",
                "padding",
            ]),
            id,
        ).toEqual({
            "align-items": "center",
            "background-color": "rgba(0, 0, 0, 0)",
            /* One radius on every corner of every row: the 10px card radius
             * minus the 5px border-box inset, so each row parallels the card
             * and edge rows need no per-corner exception. */
            "border-radius": "5px",
            cursor: "pointer",
            display: "flex",
            padding: "0px 8px",
        });
    }

    /* Deterministic vertical rhythm: 28px rows, +9px across the separator. */
    expect(item("copy").bounds().y).toBe(29);
    expect(item("star").bounds().y).toBe(57);
    expect(item("view").bounds().y).toBe(85);
    expect(item("edit").bounds().y).toBe(122);
    expect(item("delete").bounds().y).toBe(150);
    /* Each item's border-box is inset by the 4px list padding on both sides. */
    expect(item("copy").offsets()).toMatchObject({ top: 4, left: 4, right: 4 });

    /* Separator: 1px hairline spanning the padded inner width (220-2-8=210),
     * 4px of breathing room above and below. */
    const separator = view.$('[data-testid="actions"] [data-happy-desktop-ui="menu-separator"]');
    expect(separator.element.getAttribute("role")).toBe("separator");
    expect(separator.bounds()).toMatchObject({ width: 210, height: 1, y: 117 });
    expect(separator.computedStyle("background-color")).toBe("rgb(234, 234, 234)");
    expect(separator.computedStyles(["margin-top", "margin-bottom"])).toEqual({
        "margin-top": "4px",
        "margin-bottom": "4px",
    });

    /* ---- Leading icon gutter --------------------------------------------- */

    for (const id of rowIds) {
        const slot = view.$(
            `[data-testid="actions"] [data-item-id="${id}"] [data-happy-desktop-ui="menu-item-icon"]`,
        );
        expect(slot.bounds().width, `${id} slot`).toBe(16);
        expect(slot.bounds().height, `${id} slot`).toBe(16);
        /* 16px glyph centered in the 28px row starts 6px down, 8px in. */
        expect(slot.offsets(), `${id} slot offset`).toMatchObject({ top: 6, left: 8 });
    }
    expect(
        view
            .$(
                '[data-testid="actions"] [data-item-id="copy"] [data-happy-desktop-ui="menu-item-icon"]',
            )
            .computedStyle("color"),
    ).toBe("rgb(73, 69, 79)");

    /* Every row's glyph fills its 16px slot and actually paints. */
    for (const id of rowIds) {
        await assertIconInk(view, id);
    }

    /* ---- Labels: typography, colors, shared baseline, alignment ---------- */

    const label = (id: string) =>
        view.$(
            `[data-testid="actions"] [data-item-id="${id}"] [data-happy-desktop-ui="menu-item-label"]`,
        );
    let sharedBaseline: number | undefined;
    for (const id of rowIds) {
        const el = label(id);
        const metrics = el.textMetrics();
        expect(metrics.font, `${id} label font`).toMatchObject({
            family: FIGTREE,
            size: 13,
            weight: "500",
            lineHeight: 16,
        });
        /* Left-aligned label: horizontal position is deterministic, not a
         * centroid target — 8px padding + 16px gutter + 8px gap = 32px. */
        expect(el.offsets().left, `${id} label left`).toBe(32);
        expect((await el.visibleMetrics()).pixelCount, `${id} label ink`).toBeGreaterThan(0);
        const baseline = metrics.baseline.fromSurfaceTop - item(id).bounds().y;
        sharedBaseline ??= baseline;
        expect(Math.abs(baseline - sharedBaseline), `${id} shared baseline`).toBeLessThanOrEqual(
            0.001,
        );
    }
    /* Non-danger labels inherit the bright body text; the danger row is red. */
    expect(label("copy").computedStyle("color")).toBe("rgb(0, 0, 0)");

    /* ---- Danger row ------------------------------------------------------ */

    const del = item("delete");
    expect(del.element.hasAttribute("data-danger")).toBe(true);
    expect(del.computedStyle("color")).toBe("rgb(244, 67, 54)");
    expect(label("delete").computedStyle("color")).toBe("rgb(244, 67, 54)");
    expect(
        view
            .$(
                '[data-testid="actions"] [data-item-id="delete"] [data-happy-desktop-ui="menu-item-icon"]',
            )
            .computedStyle("color"),
    ).toBe("rgb(244, 67, 54)");

    /* ---- Shortcuts: KeyCap right-aligned in the row ---------------------- */

    for (const id of ["copy", "view", "edit", "delete"] as const) {
        const cap = view.$(
            `[data-testid="actions"] [data-item-id="${id}"] [data-happy-desktop-ui="key-cap"]`,
        );
        expect(cap.bounds().height, `${id} keycap height`).toBe(18);
        /* Trailing edge sits on the row's 8px right padding. */
        expect(cap.offsets().right, `${id} keycap right`).toBe(8);
        expect((await cap.visibleMetrics()).pixelCount, `${id} keycap ink`).toBeGreaterThan(0);
    }
    /* The no-shortcut row renders no KeyCap. */
    expect(
        view.container.querySelector(
            '[data-testid="actions"] [data-item-id="star"] [data-happy-desktop-ui="key-cap"]',
        ),
    ).toBeNull();

    /* ---- Interaction ----------------------------------------------------- */

    (item("copy").element as HTMLButtonElement).click();
    (item("delete").element as HTMLButtonElement).click();
    expect(selected).toEqual(["copy", "delete"]);

    await view.screenshot("Menu.test");
}, 120_000);

/*
 * A sidebar task row's menu, the one where the plus and the cross share the icon
 * column with the pencil and a framed outline glyph. Each sits on its keyline
 * (DESIGN.md, "Icon slots and optical size"): the archive box fills the 14px
 * live area, the pencil runs 13px corner to corner, the plus is 10.5px across,
 * and the cross a little less. Ink edges are quantized differently by each platform's rasterizer, so
 * the keylines are asserted as ranges and relations, never as one engine's
 * pixels.
 */
it("sets the plus, the cross, the pencil, and framed glyphs on their keylines in the icon column", async () => {
    const view = createRenderer();
    const items: MenuItem[] = [
        { kind: "item", id: "surface", label: "Add to sidebar", icon: "plus" },
        { kind: "separator" },
        { kind: "item", id: "rename", label: "Rename task", icon: "edit" },
        { kind: "item", id: "leave", label: "Leave task", icon: "close" },
        { kind: "separator" },
        { kind: "item", id: "archive", label: "Archive task", icon: "archive", danger: true },
    ];
    view.render(() => <Menu data-testid="task-row" items={items} width={200} />, {
        width: 260,
        height: 200,
        padding: 24,
    });
    await view.ready();
    const ids = ["surface", "rename", "leave", "archive"] as const;
    const slots = ids.map((id) =>
        view.$(
            `[data-testid="task-row"] [data-item-id="${id}"] [data-happy-desktop-ui="menu-item-icon"]`,
        ),
    );
    const metrics = await view.visibleMetrics(slots);
    const keylines = {
        surface: { min: 10, max: 11 },
        rename: { min: 12, max: 13.5 },
        leave: { min: 9, max: 9.5 },
        archive: { min: 13, max: 15 },
    };
    const ink = Object.fromEntries(
        ids.map((id, index) => [id, metrics.get(slots[index]!)!]),
    ) as Record<(typeof ids)[number], VisiblePixelMetrics>;
    console.info(
        "MENU_ICON_DIAGNOSTIC",
        JSON.stringify({ browser: server.browser, platform: server.platform, ink }),
    );
    for (const [index, id] of ids.entries()) {
        const slot = slots[index]!;
        const icon = view.$(
            `[data-testid="task-row"] [data-item-id="${id}"] [data-happy-desktop-ui="icon"]`,
        );
        // Every glyph's box is the slot itself, whatever its keyline.
        expect(icon.bounds(), `${id} icon box`).toEqual(slot.bounds());
        expect(slot.bounds().width, `${id} slot`).toBe(16);
        expect(slot.bounds().height, `${id} slot`).toBe(16);
        const bounds = ink[id].bounds;
        for (const extent of [bounds.width, bounds.height]) {
            expect(extent, `${id} ink ${JSON.stringify(bounds)}`).toBeGreaterThanOrEqual(
                keylines[id].min,
            );
            expect(extent, `${id} ink ${JSON.stringify(bounds)}`).toBeLessThanOrEqual(
                keylines[id].max,
            );
        }
        // The ink box, not its centroid, is centred in the slot: the font
        // places its alpha mass where the typeface drew it.
        expect(Math.abs(bounds.x + bounds.width / 2 - 8), `${id} ink centre x`).toBeLessThanOrEqual(
            0.25,
        );
        expect(
            Math.abs(bounds.y + bounds.height / 2 - 8),
            `${id} ink centre y`,
        ).toBeLessThanOrEqual(0.25);
    }
    // The cross stops a little short of the plus.
    expect(ink.leave.bounds.width).toBeLessThan(ink.surface.bounds.width);
    // The plus is two strokes of its own length crossing once, so its alpha
    // mass (backing pixels, four per CSS px) over that length is its stroke:
    // the house 1px, not the heavier stroke an enlarged glyph would carry.
    const plus = ink.surface;
    const stroke = plus.alphaMass / 4 / (plus.bounds.width + plus.bounds.height - 1);
    expect(stroke, "plus stroke").toBeGreaterThanOrEqual(0.9);
    expect(stroke, "plus stroke").toBeLessThanOrEqual(1.1);
});

it("holds Menu section labels, disabled items, and text-only alignment", async () => {
    const selected: string[] = [];
    const view = createRenderer();

    const grouped: MenuItem[] = [
        { kind: "label", label: "Sort by" },
        { kind: "item", id: "recent", label: "Most recent", icon: "clock" },
        { kind: "item", id: "unread", label: "Unread first", icon: "inbox" },
        { kind: "separator" },
        { kind: "label", label: "Filter" },
        { kind: "item", id: "mentions", label: "Only mentions", icon: "at" },
        { kind: "item", id: "muted", label: "Include muted", icon: "bell", disabled: true },
    ];
    const textOnly: MenuItem[] = [
        { kind: "item", id: "rename", label: "Rename" },
        { kind: "item", id: "duplicate", label: "Duplicate", shortcut: "⌘D" },
        { kind: "separator" },
        { kind: "item", id: "leave", label: "Leave channel", danger: true },
    ];

    view.render(
        () => (
            <Menu
                data-testid="grouped"
                items={grouped}
                onSelect={(id) => selected.push(id)}
                width={224}
            />
        ),
        { width: 300, height: 300, padding: 24 },
    );
    view.render(() => <Menu data-testid="text" items={textOnly} width={192} />, {
        width: 260,
        height: 200,
        padding: 24,
    });
    await view.ready();

    /* ---- Section labels -------------------------------------------------- */

    const grouped$ = view.$('[data-testid="grouped"]');
    expect(grouped$.bounds().width).toBe(224);

    const menuLabels = view.container.querySelectorAll(
        '[data-testid="grouped"] [data-happy-desktop-ui="menu-label"]',
    );
    expect(menuLabels.length).toBe(2);

    const sortBy = view.$('[data-testid="grouped"] [data-happy-desktop-ui="menu-label"]');
    expect(sortBy.bounds().height).toBe(24);
    expect(sortBy.textMetrics().font).toMatchObject({
        family: FIGTREE,
        size: 12,
        weight: "600",
        lineHeight: 22,
    });
    expect(sortBy.computedStyles(["color", "text-transform"])).toEqual({
        color: "rgb(73, 69, 79)",
        "text-transform": "none",
    });
    /* Mixed case with a descender: centre the full-height ink box, not the
     * alpha centroid. Vertical axis only (contract ceiling 0.75). */
    const sortInk = await sortBy.visibleMetrics();
    expect(sortInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(sortInk.bounds.y + sortInk.bounds.height / 2 - 12),
        "section label ink-box y",
    ).toBeLessThanOrEqual(0.75);

    /* ---- Disabled row ---------------------------------------------------- */

    const muted = view.$('[data-testid="grouped"] [data-item-id="muted"]');
    expect((muted.element as HTMLButtonElement).disabled).toBe(true);
    expect(muted.element.getAttribute("aria-disabled")).toBe("true");
    expect(muted.computedStyles(["cursor", "opacity"])).toEqual({
        cursor: "not-allowed",
        opacity: "0.4",
    });

    /* ---- Text-only menu: no gutter reserved ------------------------------ */

    const text$ = view.$('[data-testid="text"]');
    expect(text$.bounds().width).toBe(192);
    expect(text$.element.hasAttribute("data-has-icons")).toBe(false);
    /* No item declares an icon, so no leading slot is rendered at all. */
    expect(
        view.container.querySelector(
            '[data-testid="text"] [data-happy-desktop-ui="menu-item-icon"]',
        ),
    ).toBeNull();
    /* Labels sit flush on the 8px row padding when there is no gutter. */
    const rename = view.$(
        '[data-testid="text"] [data-item-id="rename"] [data-happy-desktop-ui="menu-item-label"]',
    );
    expect(rename.offsets().left).toBe(8);
    expect(rename.textMetrics().font).toMatchObject({ family: FIGTREE, size: 13, weight: "500" });
    /* Even without a gutter the trailing KeyCap still right-aligns. */
    const dupCap = view.$(
        '[data-testid="text"] [data-item-id="duplicate"] [data-happy-desktop-ui="key-cap"]',
    );
    expect(dupCap.offsets().right).toBe(8);
    /* Danger still paints red in a text-only menu. */
    expect(view.$('[data-testid="text"] [data-item-id="leave"]').computedStyle("color")).toBe(
        "rgb(244, 67, 54)",
    );

    /* ---- Interaction: enabled fires, disabled is inert ------------------- */

    (
        view.$('[data-testid="grouped"] [data-item-id="recent"]').element as HTMLButtonElement
    ).click();
    (muted.element as HTMLButtonElement).click();
    expect(selected).toEqual(["recent"]);

    await view.screenshot("Menu.variants.test");
}, 120_000);
