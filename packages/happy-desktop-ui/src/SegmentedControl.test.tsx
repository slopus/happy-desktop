import { expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/segmented-control.css";
import "./styles/icon.css";
import { SegmentedControl } from "./SegmentedControl";
import { createRenderer } from "./testing";

const RANGE = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

/*
 * Contract geometry per size. The transparent group and each direct child
 * share the same 28/36/44px height; selection paints that child without adding
 * an inset track or changing its border box.
 */
const sizeSpec = {
    small: { height: 28, fontSize: 12, lineHeight: 16 },
    medium: { height: 36, fontSize: 13, lineHeight: 18 },
    large: { height: 44, fontSize: 14, lineHeight: 20 },
} as const;

const sizes = ["small", "medium", "large"] as const;

type Renderer = ReturnType<typeof createRenderer>;

/* WebKit reports the family unquoted; textMetrics strips quotes for both. */
const fontFamily = () =>
    server.browser === "webkit" && server.platform !== "darwin"
        ? "happy Figtree, system-ui, sans-serif"
        : '"happy Figtree", system-ui, sans-serif';

async function settleSegmentColors(view: Renderer, activeSelector: string) {
    /* The browser pointer can begin over the first fixture's inactive segment.
     * Park it on an active segment, then remove color-transition timing so
     * computed token assertions cannot sample an interpolated Firefox frame. */
    await userEvent.hover(view.$(activeSelector).element);
    for (const segment of view.container.querySelectorAll<HTMLElement>(
        ".happy-segmented-control__segment",
    )) {
        segment.style.setProperty("transition", "none", "important");
    }
}

it("holds SegmentedControl dimensions, layout, colors, and one-layer selection", async () => {
    const view = createRenderer();

    // Each size as a fullWidth 3-segment control in a 280px well: two 2px gaps
    // leave 276px, so the three equal columns are exactly 92px.
    for (const size of sizes) {
        view.render(
            () => (
                <div style={{ width: "280px" }}>
                    <SegmentedControl
                        data-testid={`sc-${size}`}
                        fullWidth
                        segments={RANGE}
                        size={size}
                        value="week"
                    />
                </div>
            ),
            { width: 320, height: sizeSpec[size].height + 24, padding: 12 },
        );
    }
    // Content-sized default (inline-grid), two segments of unequal label length:
    // both columns must still resolve to the widest label's width.
    view.render(
        () => (
            <SegmentedControl
                data-testid="sc-content"
                segments={[
                    { value: "on", label: "Enabled" },
                    { value: "off", label: "Off" },
                ]}
                value="on"
            />
        ),
        { width: 320, height: 60, padding: 12 },
    );
    await view.ready();
    await settleSegmentColors(view, '[data-testid="sc-small"] [data-value="week"]');

    for (const size of sizes) {
        const id = `sc-${size}`;
        const spec = sizeSpec[size];
        const control = view.$(`[data-testid="${id}"]`);
        const bounds = control.bounds();
        expect(bounds.width, `${id} width`).toBe(280);
        expect(bounds.height, `${id} height`).toBe(spec.height);
        expect(
            control.computedStyles([
                "background-color",
                "border-radius",
                "border-top-width",
                "box-sizing",
                "column-gap",
                "display",
                "font-family",
                "height",
            ]),
            id,
        ).toEqual({
            "background-color": "rgba(0, 0, 0, 0)",
            "border-radius": "0px",
            "border-top-width": "0px",
            "box-sizing": "border-box",
            "column-gap": "2px",
            display: "grid",
            "font-family": fontFamily(),
            height: `${spec.height}px`,
        });

        // Equal segment widths (3 × 92) and the integer contract heights.
        const values = ["day", "week", "month"];
        const segBounds = values.map((value) =>
            view.$(`[data-testid="${id}"] [data-value="${value}"]`).bounds(),
        );
        for (const [index, sb] of segBounds.entries()) {
            expect(sb.width, `${id} seg ${values[index]} width`).toBe(92);
            expect(sb.height, `${id} seg ${values[index]} height`).toBe(spec.height);
        }

        // The group remains unpainted. Selection is one layer: the active
        // segment itself carries the same quiet fill as a selected file row.
        const active = view.$(`[data-testid="${id}"] [data-value="week"]`);
        expect(
            active.computedStyles([
                "background-color",
                "border-radius",
                "border-top-color",
                "border-top-width",
                "box-sizing",
            ]),
            `${id} active segment`,
        ).toEqual({
            "background-color": "rgb(234, 234, 234)",
            "border-radius": "6px",
            "border-top-color": "rgb(234, 234, 234)",
            "border-top-width": "1px",
            "box-sizing": "border-box",
        });
        const inactive = view.$(`[data-testid="${id}"] [data-value="day"]`);
        expect(
            inactive.computedStyles(["background-color", "border-top-color", "border-top-width"]),
            `${id} inactive segment`,
        ).toEqual({
            "background-color": "rgba(0, 0, 0, 0)",
            "border-top-color": "rgba(0, 0, 0, 0)",
            "border-top-width": "1px",
        });

        // Active vs inactive foreground tokens.
        const activeLabel = view.$(
            `[data-testid="${id}"] [data-value="week"] [data-happy-desktop-ui="segmented-control-label"]`,
        );
        const inactiveLabel = view.$(
            `[data-testid="${id}"] [data-value="day"] [data-happy-desktop-ui="segmented-control-label"]`,
        );
        expect(activeLabel.computedStyle("color"), `${id} active color`).toBe("rgb(0, 0, 0)");
        expect(inactiveLabel.computedStyle("color"), `${id} inactive color`).toBe(
            "rgb(73, 69, 79)",
        );

        // Label typography contract.
        expect(activeLabel.textMetrics(), `${id} typography`).toMatchObject({
            font: {
                family: "happy Figtree, system-ui, sans-serif",
                letterSpacing: spec.fontSize / 100,
                lineHeight: spec.lineHeight,
                size: spec.fontSize,
                weight: "600",
            },
            text: "Week",
        });

        // Word labels are horizontally asymmetric ink, so centering is asserted
        // as line-box symmetry inside each segment rather than an ink centroid.
        for (const value of values) {
            const seg = view.$(`[data-testid="${id}"] [data-value="${value}"]`).bounds();
            const label = view
                .$(
                    `[data-testid="${id}"] [data-value="${value}"] [data-happy-desktop-ui="segmented-control-label"]`,
                )
                .bounds();
            const left = label.x - seg.x;
            const right = seg.x + seg.width - label.x - label.width;
            expect(Math.abs(left - right), `${id} ${value} label symmetry`).toBeLessThanOrEqual(
                0.5,
            );
        }
    }

    // Content-sized control shrink-wraps yet keeps equal columns.
    const content = view.$('[data-testid="sc-content"]');
    expect(content.computedStyle("display"), "content display").toBe("inline-grid");
    const onBounds = view.$('[data-testid="sc-content"] [data-value="on"]').bounds();
    const offBounds = view.$('[data-testid="sc-content"] [data-value="off"]').bounds();
    expect(offBounds.width, "equal content columns").toBe(onBounds.width);
    expect(offBounds.x - (onBounds.x + onBounds.width), "content segment gap").toBe(2);
    expect(
        view.$('[data-testid="sc-content"] [data-value="on"]').computedStyle("background-color"),
        "content active fill",
    ).toBe("rgb(234, 234, 234)");
    expect(
        view.container.querySelector(
            '[data-testid="sc-content"] [data-happy-desktop-ui="segmented-control-pill"]',
        ),
        "retired outer-track pill",
    ).toBeNull();

    await view.screenshot("SegmentedControl.test");
}, 120_000);

it("holds SegmentedControl icon segments, selection sweep, fullWidth, and disabled state", async () => {
    const view = createRenderer();

    const ICONS = [
        { value: "board", label: "Board", icon: "inbox" as const },
        { value: "list", label: "List", icon: "clock" as const },
        { value: "grid", label: "Home", icon: "home" as const },
    ];
    // Medium icon control, fullWidth in a 280px well (columns = 92).
    view.render(
        () => (
            <div style={{ width: "280px" }}>
                <SegmentedControl data-testid="sc-icons" fullWidth segments={ICONS} value="list" />
            </div>
        ),
        { width: 320, height: 60, padding: 12 },
    );
    // Small (icon 14) and large (icon 18) content-sized controls for the size→
    // icon mapping.
    view.render(
        () => (
            <div style={{ display: "flex", gap: "16px" }}>
                <SegmentedControl
                    data-testid="sc-icons-sm"
                    segments={ICONS}
                    size="small"
                    value="list"
                />
                <SegmentedControl
                    data-testid="sc-icons-lg"
                    segments={ICONS}
                    size="large"
                    value="list"
                />
            </div>
        ),
        { width: 460, height: 72, padding: 12 },
    );

    const SWEEP = [
        { value: "a", label: "Auto" },
        { value: "b", label: "Online" },
        { value: "c", label: "Away" },
        { value: "d", label: "Busy" },
    ];
    // Four-segment sweep, fullWidth in a 282px well: three 2px gaps leave
    // 276px, so each segment is exactly 69px.
    for (let index = 0; index < SWEEP.length; index += 1) {
        view.render(
            () => (
                <div style={{ width: "282px" }}>
                    <SegmentedControl
                        data-testid={`sweep-${index}`}
                        fullWidth
                        segments={SWEEP}
                        value={SWEEP[index]!.value}
                    />
                </div>
            ),
            { width: 320, height: 56, padding: 12 },
        );
    }

    view.render(
        () => <SegmentedControl data-testid="sc-disabled" disabled segments={RANGE} value="day" />,
        { width: 300, height: 60, padding: 12 },
    );
    await view.ready();
    await settleSegmentColors(view, '[data-testid="sc-icons"] [data-value="list"]');

    // Icon box geometry: 16px glyph on the medium control, 6px gap to the label.
    const iconBox = view.$(
        '[data-testid="sc-icons"] [data-value="board"] [data-happy-desktop-ui="icon"]',
    );
    const iconBounds = iconBox.bounds();
    expect(iconBounds.width, "icon box width").toBe(16);
    expect(iconBounds.height, "icon box height").toBe(16);
    const iconLabel = view
        .$(
            '[data-testid="sc-icons"] [data-value="board"] [data-happy-desktop-ui="segmented-control-label"]',
        )
        .bounds();
    expect(iconLabel.x - (iconBounds.x + iconBounds.width), "icon → label gap").toBe(6);

    // Size → icon mapping: 14 at small, 18 at large.
    expect(
        view
            .$('[data-testid="sc-icons-sm"] [data-value="board"] [data-happy-desktop-ui="icon"]')
            .bounds().width,
        "small icon",
    ).toBe(14);
    expect(
        view
            .$('[data-testid="sc-icons-lg"] [data-value="board"] [data-happy-desktop-ui="icon"]')
            .bounds().width,
        "large icon",
    ).toBe(18);

    // The Icon glyphs on the two inactive segments actually paint. Placement
    // inside the icon box belongs to the icon font, which centers the glyph in
    // its own em box, so only the box geometry above is a SegmentedControl
    // contract; the ink check catches a missing font or an empty glyph.
    for (const value of ["board", "grid"]) {
        const selector = `[data-testid="sc-icons"] [data-value="${value}"] [data-happy-desktop-ui="icon"]`;
        expect(
            (await view.$(selector).visibleMetrics()).pixelCount,
            `${value} glyph paints no pixels`,
        ).toBeGreaterThan(0);
    }

    // Selection sweep: only the selected segment carries the quiet fill,
    // selected border, and active foreground token.
    for (let index = 0; index < SWEEP.length; index += 1) {
        const id = `sweep-${index}`;
        const selected = view.$(`[data-testid="${id}"] [data-value="${SWEEP[index]!.value}"]`);
        expect(selected.bounds().width, `${id} seg width`).toBe(69);
        expect(
            selected.computedStyles(["background-color", "border-top-color"]),
            `${id} active paint`,
        ).toEqual({
            "background-color": "rgb(234, 234, 234)",
            "border-top-color": "rgb(234, 234, 234)",
        });
        const selectedLabel = view.$(
            `[data-testid="${id}"] [data-value="${SWEEP[index]!.value}"] [data-happy-desktop-ui="segmented-control-label"]`,
        );
        expect(selectedLabel.computedStyle("color"), `${id} active color`).toBe("rgb(0, 0, 0)");
        for (let other = 0; other < SWEEP.length; other += 1) {
            if (other === index) continue;
            const otherLabel = view.$(
                `[data-testid="${id}"] [data-value="${SWEEP[other]!.value}"] [data-happy-desktop-ui="segmented-control-label"]`,
            );
            expect(
                view
                    .$(`[data-testid="${id}"] [data-value="${SWEEP[other]!.value}"]`)
                    .computedStyle("background-color"),
                `${id} inactive ${other} fill`,
            ).toBe("rgba(0, 0, 0, 0)");
            expect(otherLabel.computedStyle("color"), `${id} inactive ${other}`).toBe(
                "rgb(73, 69, 79)",
            );
        }
    }

    // Disabled: dimmed, not interactive, and every segment button disabled.
    const disabled = view.$('[data-testid="sc-disabled"]');
    expect(disabled.computedStyles(["cursor", "opacity"])).toEqual({
        cursor: "not-allowed",
        opacity: "0.48",
    });
    for (const value of ["day", "week", "month"]) {
        const seg = view.$(`[data-testid="sc-disabled"] [data-value="${value}"]`);
        expect((seg.element as HTMLButtonElement).disabled, `${value} disabled`).toBe(true);
    }

    await view.screenshot("SegmentedControl.variants.test");
}, 120_000);
