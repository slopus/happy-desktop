import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { Icon, iconNames } from "./Icon";
import { ioniconsGlyphs } from "./vectorIcons/ioniconsGlyphs";
import { octiconsGlyphs } from "./vectorIcons/octiconsGlyphs";
import { createRenderer } from "./testing";
import "./styles.css";
const SIZES = [12, 14, 16, 18, 20] as const;
/*
 * Icon is now font-backed: each curated name resolves to one Private Use Area
 * glyph in the Ionicons or Octicons font. The geometry contract is the square
 * font box (size sets both font-size and box), the correct per-set font
 * resolution, and the stable data-name/data-happy-desktop-ui parts call sites and
 * other component tests key on. Optical centering belongs to the font, so the
 * old SVG stroke/viewBox/centroid assertions are replaced by a real-ink proof
 * (non-zero visible pixels, which also proves the font actually loaded) for
 * every name in every engine.
 */
it("holds Icon box geometry, font, and PUA glyph across sizes", async () => {
    const view = createRenderer();
    for (const size of SIZES) {
        view.render(
            () => (
                <div data-testid={`icon-size-${size}`} style={{ display: "flex" }}>
                    <Icon name="inbox" size={size} />
                </div>
            ),
            { width: 44, height: 44, padding: 12 },
        );
    }
    view.render(
        () => (
            <div data-testid="icon-default" style={{ display: "flex" }}>
                <Icon name="check" />
            </div>
        ),
        { width: 44, height: 44, padding: 12 },
    );
    view.render(
        () => (
            <div data-testid="icon-octicon" style={{ display: "flex" }}>
                <Icon name="branch" size={20} />
            </div>
        ),
        { width: 44, height: 44, padding: 12 },
    );
    view.render(
        () => (
            <div data-testid="icon-inherit" style={{ display: "flex", color: "#8e8e93" }}>
                <Icon name="bell" size={20} />
            </div>
        ),
        { width: 44, height: 44, padding: 12 },
    );
    view.render(
        () => (
            <div data-testid="icon-colored" style={{ display: "flex", color: "#8e8e93" }}>
                <Icon name="bell" size={20} color="#007aff" aria-label="Notifications" />
            </div>
        ),
        { width: 44, height: 44, padding: 12 },
    );
    await view.ready();
    for (const size of SIZES) {
        const icon = view.$(`[data-testid="icon-size-${size}"] [data-happy-desktop-ui="icon"]`);
        expect(icon.bounds(), `icon ${size} box`).toEqual({
            x: 12,
            y: 12,
            width: size,
            height: size,
        });
        expect(
            icon.computedStyles(["box-sizing", "display", "flex-grow", "flex-shrink"]),
            `icon ${size} styles`,
        ).toEqual({
            "box-sizing": "border-box",
            /* inline-flex is blockified to flex here because each fixture wraps
             * the icon in a display:flex parent, making it a flex item. */
            display: "flex",
            "flex-grow": "0",
            "flex-shrink": "0",
        });
        expect(icon.computedStyle("font-family").replaceAll('"', ""), `icon ${size} font`).toBe(
            "happy Ionicons",
        );
        expect(icon.element.textContent, `icon ${size} glyph`).toBe(
            String.fromCodePoint(ioniconsGlyphs["file-tray-outline"]),
        );
    }
    const fallback = view.$('[data-testid="icon-default"] [data-happy-desktop-ui="icon"]');
    expect(fallback.bounds()).toEqual({ x: 12, y: 12, width: 16, height: 16 });
    expect(fallback.element.getAttribute("aria-hidden")).toBe("true");
    expect(fallback.element.getAttribute("role")).toBeNull();
    expect(fallback.element.getAttribute("data-name")).toBe("check");
    expect(fallback.element.getAttribute("data-set")).toBe("ionicons");
    const octicon = view.$('[data-testid="icon-octicon"] [data-happy-desktop-ui="icon"]');
    expect(octicon.computedStyle("font-family").replaceAll('"', "")).toBe("happy Octicons");
    expect(octicon.element.getAttribute("data-set")).toBe("octicons");
    expect(octicon.element.getAttribute("data-name")).toBe("branch");
    expect(octicon.element.textContent).toBe(String.fromCodePoint(octiconsGlyphs["git-branch"]));
    const inherit = view.$('[data-testid="icon-inherit"] [data-happy-desktop-ui="icon"]');
    expect(inherit.computedStyle("color")).toBe("rgb(142, 142, 147)");
    const colored = view.$('[data-testid="icon-colored"] [data-happy-desktop-ui="icon"]');
    expect(colored.computedStyle("color")).toBe("rgb(0, 122, 255)");
    expect(colored.element.getAttribute("aria-label")).toBe("Notifications");
    expect(colored.element.getAttribute("role")).toBe("img");
    expect(colored.element.getAttribute("aria-hidden")).toBeNull();
});
it("paints real ink for every curated glyph in its box", async () => {
    const size = 20;
    const columns = 8;
    const gap = 12;
    const rows = Math.ceil(iconNames.length / columns);
    const view = createRenderer().render(
        () => (
            <div
                data-testid="icon-sheet"
                style={{
                    alignItems: "flex-start",
                    color: "#111111",
                    background: "#ffffff",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: `${gap}px`,
                    width: `${columns * size + (columns - 1) * gap}px`,
                }}
            >
                {iconNames.map((name) => (
                    <Icon key={name} name={name} size={size} />
                ))}
            </div>
        ),
        {
            height: rows * size + (rows - 1) * gap + 24,
            padding: 12,
            width: columns * size + (columns - 1) * gap + 24,
        },
    );
    await view.ready();
    expect(iconNames.length).toBe(85);
    const parts = iconNames.map((name) => view.$(`[data-name="${name}"]`));
    const metrics = await view.visibleMetrics(parts);
    console.info(
        "ICON_DIAGNOSTIC",
        JSON.stringify({
            browser: server.browser,
            platform: server.platform,
            items: parts.map((part) => ({
                name: part.element.getAttribute("data-name"),
                box: part.bounds(),
                ink: metrics.get(part),
            })),
        }),
    );
    for (const [index, name] of iconNames.entries()) {
        const part = parts[index]!;
        const visible = metrics.get(part)!;
        /* A blank capture means the font never loaded or the codepoint is wrong. */
        expect(visible.pixelCount, `${name} ink`).toBeGreaterThan(0);
        expect(part.bounds().width, `${name} box`).toBe(size);
        expect(part.bounds().height, `${name} box`).toBe(size);
        expect(part.element.getAttribute("data-happy-desktop-ui")).toBe("icon");
    }
    await view.screenshot("Icon.test");
});
/*
 * The keyline contract (DESIGN.md, "Icon slots and optical size"). The plus and
 * cross keep their 16px drawing in the 12 and 14px boxes of hover-revealed row
 * and tab controls, so the same glyph paints whatever box it is handed below
 * 16, and grows with the box above it. Octicons are set at 14/16 so their full
 * 16 grid lands in the Ionicons live area. Edges are quantized differently by
 * each platform's rasterizer, so sizes are asserted as relations and ranges.
 */
it("holds the plus and cross at their 16px drawing and Octicons in the live area", async () => {
    const view = createRenderer();
    const held = ["plus", "close"] as const;
    const sizes = [12, 14, 16, 20] as const;
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {held.map((name) => (
                    <div key={name} style={{ display: "flex", gap: "12px" }}>
                        {sizes.map((size) => (
                            <span
                                data-testid={`${name}-${size}`}
                                key={size}
                                style={{ display: "flex" }}
                            >
                                <Icon name={name} size={size} />
                            </span>
                        ))}
                    </div>
                ))}
            </div>
        ),
        { width: 160, height: 80, padding: 12 },
    );
    view.render(
        () => (
            <div data-testid="octicons" style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {iconNames.map((name) => (
                    <Icon key={name} name={name} size={16} />
                ))}
            </div>
        ),
        { width: 340, height: 340, padding: 12 },
    );
    await view.ready();
    const parts = held.flatMap((name) =>
        sizes.map((size) =>
            view.$(`[data-testid="${name}-${size}"] [data-happy-desktop-ui="icon"]`),
        ),
    );
    const metrics = await view.visibleMetrics(parts);
    for (const [row, name] of held.entries()) {
        const at = (index: number) => metrics.get(parts[row * sizes.length + index]!)!;
        const reference = at(2);
        for (const [index, size] of sizes.entries()) {
            const part = parts[row * sizes.length + index]!;
            expect(part.bounds().width, `${name} ${size} box`).toBe(size);
            expect(part.bounds().height, `${name} ${size} box`).toBe(size);
            const visible = at(index);
            if (size > 16) continue;
            // The 16px drawing is centred in whatever smaller box it is given.
            expect(
                Math.abs(visible.bounds.x + visible.bounds.width / 2 - size / 2),
                `${name} ${size} ink centre x`,
            ).toBeLessThanOrEqual(0.25);
            expect(
                Math.abs(visible.bounds.y + visible.bounds.height / 2 - size / 2),
                `${name} ${size} ink centre y`,
            ).toBeLessThanOrEqual(0.25);
            // Below 16 it is the 16px drawing: same ink, same alpha mass.
            expect(visible.bounds.width, `${name} ${size} ink width`).toBe(reference.bounds.width);
            expect(visible.bounds.height, `${name} ${size} ink height`).toBe(
                reference.bounds.height,
            );
            expect(
                Math.abs(visible.alphaMass - reference.alphaMass),
                `${name} ${size} alpha mass`,
            ).toBeLessThanOrEqual(0.01 * reference.alphaMass);
        }
        // Above 16 it scales with the box like every other glyph.
        expect(at(3).bounds.width, `${name} 20 ink`).toBeGreaterThan(reference.bounds.width);
    }
    const octiconParts = iconNames
        .map((name) => view.$(`[data-testid="octicons"] [data-name="${name}"]`))
        .filter((part) => part.element.getAttribute("data-set") === "octicons");
    expect(octiconParts.length).toBeGreaterThan(0);
    const octiconMetrics = await view.visibleMetrics(octiconParts);
    for (const part of octiconParts) {
        const { bounds } = octiconMetrics.get(part)!;
        const name = part.element.getAttribute("data-name");
        expect(bounds.width, `${name} ink width`).toBeLessThanOrEqual(15);
        expect(bounds.height, `${name} ink height`).toBeLessThanOrEqual(15);
    }
});
/*
 * `compose` sits on the framed keyline (DESIGN.md, "Icon slots and optical
 * size"), with its declared (+0.5, -1)px offset putting the frame, rather than
 * frame and pencil together, on the slot centre. So its ink box — frame plus the
 * overshooting tip — is centred on the slot centre moved by that offset.
 */
it("sets compose on the framed keyline with its frame centred", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", gap: "12px" }}>
                <span data-testid="compose" style={{ display: "flex" }}>
                    <Icon name="compose" />
                </span>
                <span data-testid="edit" style={{ display: "flex" }}>
                    <Icon name="edit" />
                </span>
            </div>
        ),
        { width: 68, height: 40, padding: 12 },
    );
    await view.ready();
    const compose = view.$('[data-testid="compose"] [data-happy-desktop-ui="icon"]');
    const edit = view.$('[data-testid="edit"] [data-happy-desktop-ui="icon"]');
    expect(compose.element.getAttribute("data-set")).toBe("ionicons");
    expect(edit.element.getAttribute("data-set")).toBe("octicons");
    const metrics = await view.visibleMetrics([compose, edit]);
    const { bounds } = metrics.get(compose)!;
    for (const extent of [bounds.width, bounds.height]) {
        expect(extent, `compose ink ${JSON.stringify(bounds)}`).toBeGreaterThanOrEqual(13);
        expect(extent, `compose ink ${JSON.stringify(bounds)}`).toBeLessThanOrEqual(14.5);
    }
    expect(
        Math.abs(bounds.x + bounds.width / 2 - 8.5),
        "compose ink centre x, offset +0.5",
    ).toBeLessThanOrEqual(0.25);
    expect(
        Math.abs(bounds.y + bounds.height / 2 - 7),
        "compose ink centre y, offset -1",
    ).toBeLessThanOrEqual(0.25);
    // The bare pencil runs corner to corner too, no wider than the framed one.
    expect(metrics.get(edit)!.pixelCount).toBeGreaterThan(0);
    expect(metrics.get(edit)!.bounds.width).toBeLessThanOrEqual(bounds.width);
});
