import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";

const engine = () => server.browser as Engine;

/*
 * Per-engine label corrections (styles/button.css), measured at true 2× with
 * alpha-weighted visible-pixel centroids on zeroed CSS. Guards that the
 * @supports engine scopes resolve on the right engine and nowhere else. All
 * values are exact 0.5px multiples: every engine rasters vertical label ink
 * in whole device pixels, so anything finer silently rounds.
 */
const labelOffsets: Record<Engine, Record<ButtonSize, string>> = {
    chromium: { small: "-0.5px", medium: "0px", large: "0px" },
    firefox: { small: "-1px", medium: "-0.5px", large: "-1px" },
    webkit: { small: "-0.5px", medium: "-0.5px", large: "-1px" },
};

/*
 * Vertical-centroid tolerances per label. After correction, balanced-ink
 * labels measure |dy| ≤ 0.27px, asserted at 0.4. Descender-heavy words
 * ("Approve & merge", "Approve run" — p/g ink below the baseline) and
 * ascender-skewed words ("Request changes" tails vs "Review diff" double-f)
 * measure up to 0.64px: word-ink centroids inherently spread ~0.85px between
 * those extremes and the raster step is 0.5px, so no correction can bring
 * them all under 0.4. They get the 0.75px contract ceiling instead.
 */
const labelTolerances: Record<ButtonVariant, number> = {
    primary: 0.75,
    secondary: 0.75,
    ghost: 0.4,
    danger: 0.4,
    success: 0.75,
};

const sizeStyles = {
    small: { height: 28, padding: "0px 10px", fontSize: 12, lineHeight: 16 },
    medium: { height: 36, padding: "0px 14px", fontSize: 13, lineHeight: 18 },
    large: { height: 44, padding: "0px 18px", fontSize: 14, lineHeight: 20 },
} as const;

const variantStyles: Record<
    ButtonVariant,
    { background: string; borderColor: string; color: string }
> = {
    primary: {
        background: "rgb(0, 0, 0)",
        borderColor: "rgba(0, 0, 0, 0)",
        color: "rgb(255, 255, 255)",
    },
    secondary: {
        background: "rgb(248, 248, 248)",
        borderColor: "rgb(234, 234, 234)",
        color: "rgb(0, 0, 0)",
    },
    ghost: {
        background: "rgba(0, 0, 0, 0)",
        borderColor: "rgba(0, 0, 0, 0)",
        color: "rgb(102, 102, 102)",
    },
    danger: {
        background: "rgb(255, 240, 240)",
        borderColor: "rgba(0, 0, 0, 0)",
        color: "rgb(255, 59, 48)",
    },
    success: {
        background: "rgb(52, 199, 89)",
        borderColor: "rgba(0, 0, 0, 0)",
        color: "rgb(255, 255, 255)",
    },
};

/* Realistic Relay labels: ascender-only, descender-heavy, and mixed ink. */
const variantLabels: Record<ButtonVariant, string> = {
    primary: "Approve & merge",
    secondary: "Request changes",
    ghost: "Dismiss",
    danger: "Delete run",
    success: "Review diff",
};

const sizes = ["small", "medium", "large"] as const;
const variants = ["primary", "secondary", "ghost", "danger", "success"] as const;

type Renderer = ReturnType<typeof createRenderer>;

/*
 * Alpha-weighted ink centroid of `partSelector`, expressed as an offset from
 * the center of `buttonSelector` (positive = right/low). The captured part
 * MUST be an element with no optical nudge of its own (the static content
 * span): element captures frame the static layout box, so capturing a corrected
 * label would double-count its offset. Refuses blank or clipped captures:
 * the part must paint pixels and its ink may not touch the captured box
 * edges, so a truncated screenshot can never pass silently.
 */
async function inkDrift(view: Renderer, buttonSelector: string, partSelector: string) {
    const button = view.$(buttonSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    expect(visible.bounds.y, `${partSelector} ink clipped at box top`).toBeGreaterThan(0);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${partSelector} ink clipped at box bottom`,
    ).toBeLessThan(partBounds.height);
    const buttonBounds = button.bounds();
    return {
        dx: visible.center.x + partBounds.x - buttonBounds.x - buttonBounds.width / 2,
        dy: visible.center.y + partBounds.y - buttonBounds.y - buttonBounds.height / 2,
    };
}

/* Label ink centroid measured through the static content span. Only valid on
 * buttons whose content is the label alone (no icon ink in the capture). */
function labelDrift(view: Renderer, testId: string) {
    return inkDrift(
        view,
        `[data-testid="${testId}"]`,
        `[data-testid="${testId}"] [data-happy-desktop-ui="button-content"]`,
    );
}

it("holds Button dimensions, typography, and optical label centering for every size and variant", async () => {
    const view = createRenderer();

    for (const size of sizes) {
        view.render(
            () => (
                <div style={{ display: "flex", gap: "12px" }}>
                    {variants.map((variant) => (
                        <Button
                            data-testid={`${size}-${variant}`}
                            key={variant}
                            size={size}
                            variant={variant}
                        >
                            {variantLabels[variant]}
                        </Button>
                    ))}
                </div>
            ),
            { width: 720, height: sizeStyles[size].height + 24, padding: 12 },
        );
    }
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <Button data-testid="button-fixed" width={128}>
                    Button
                </Button>
                <Button data-testid="button-full" fullWidth>
                    Full width
                </Button>
            </div>
        ),
        { width: 300, height: 112, padding: 14 },
    );
    await view.ready();

    const fontFamily =
        server.browser === "webkit"
            ? "happy Figtree, system-ui, sans-serif"
            : '"happy Figtree", system-ui, sans-serif';

    for (const size of sizes) {
        for (const variant of variants) {
            const id = `${size}-${variant}`;
            const button = view.$(`[data-testid="${id}"]`);
            const spec = sizeStyles[size];
            expect(button.height(), id).toBe(spec.height);
            expect(
                button.computedStyles([
                    "align-items",
                    "background-color",
                    "border-radius",
                    "border-top-color",
                    "border-top-width",
                    "box-sizing",
                    "color",
                    "cursor",
                    "display",
                    "font-family",
                    "font-size",
                    "font-weight",
                    "height",
                    "justify-content",
                    "letter-spacing",
                    "line-height",
                    "padding",
                ]),
                id,
            ).toEqual({
                "align-items": "center",
                "background-color": variantStyles[variant].background,
                "border-radius": "999px",
                "border-top-color": variantStyles[variant].borderColor,
                "border-top-width": "1px",
                "box-sizing": "border-box",
                color: variantStyles[variant].color,
                cursor: "pointer",
                // inline-flex, blockified: these buttons are flex items here.
                display: "flex",
                "font-family": fontFamily,
                "font-size": `${spec.fontSize}px`,
                "font-weight": "700",
                height: `${spec.height}px`,
                "justify-content": "center",
                "letter-spacing": `${spec.fontSize / 100}px`,
                "line-height": `${spec.lineHeight}px`,
                padding: spec.padding,
            });

            const label = view.$(`[data-testid="${id}"] [data-happy-desktop-ui="button-label"]`);
            expect(label.computedStyle("--happy-button-label-y"), id).toBe(
                labelOffsets[engine()][size],
            );
            expect(label.textMetrics(), id).toMatchObject({
                font: {
                    family: "happy Figtree, system-ui, sans-serif",
                    letterSpacing: spec.fontSize / 100,
                    lineHeight: spec.lineHeight,
                    size: spec.fontSize,
                    weight: "700",
                },
                text: variantLabels[variant],
            });

            // Optical vertical centering at backing-pixel precision; see the
            // labelTolerances comment for why skewed words get the ceiling.
            const drift = await labelDrift(view, id);
            expect(Math.abs(drift.dy), `${id} vertical centroid`).toBeLessThanOrEqual(
                labelTolerances[variant],
            );

            // A word's ink centroid is horizontally asymmetric by nature
            // (heavy capitals, ascender clusters), so horizontal centering is
            // asserted as line-box symmetry inside the control instead of an
            // ink-centroid match.
            const buttonBounds = button.bounds();
            const labelBounds = label.bounds();
            const left = labelBounds.x - buttonBounds.x;
            const right = buttonBounds.x + buttonBounds.width - labelBounds.x - labelBounds.width;
            expect(Math.abs(left - right), `${id} line-box symmetry`).toBeLessThanOrEqual(0.5);
        }
    }

    // Fixed width: the label centers inside the forced 128px box.
    const fixed = view.$('[data-testid="button-fixed"]');
    expect(fixed.bounds()).toMatchObject({ width: 128, height: 36 });
    const fixedLabel = view.$(
        '[data-testid="button-fixed"] [data-happy-desktop-ui="button-label"]',
    );
    const fixedBounds = fixed.bounds();
    const fixedLabelBounds = fixedLabel.bounds();
    expect(
        Math.abs(
            fixedLabelBounds.x -
                fixedBounds.x -
                (fixedBounds.x + fixedBounds.width - fixedLabelBounds.x - fixedLabelBounds.width),
        ),
    ).toBeLessThanOrEqual(0.5);
    // "Button" is balanced ink: held to the tuned 0.4px.
    const fixedDrift = await labelDrift(view, "button-fixed");
    expect(Math.abs(fixedDrift.dy)).toBeLessThanOrEqual(0.4);

    // Full width fills the surface (300 - 2 × 14 padding).
    const full = view.$('[data-testid="button-full"]');
    expect(full.bounds()).toMatchObject({ width: 272, height: 36 });
    expect(full.computedStyles(["background-color", "color", "height", "padding"])).toEqual({
        "background-color": "rgb(0, 0, 0)",
        color: "rgb(255, 255, 255)",
        height: "36px",
        padding: "0px 14px",
    });
    // "Full width" is ascender-skewed but measures ≤ 0.24px at medium size.
    const fullDrift = await labelDrift(view, "button-full");
    expect(Math.abs(fullDrift.dy)).toBeLessThanOrEqual(0.4);

    await view.screenshot("Button.test");
}, 120_000);

it("holds Button icon forms and disabled state with correctly boxed glyphs", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <Button data-testid="lead-small" icon="plus" size="small" variant="secondary">
                    New task
                </Button>
                <Button data-testid="lead-medium" icon="plus" size="medium">
                    New task
                </Button>
                <Button data-testid="lead-large" icon="check" size="large" variant="success">
                    Approve run
                </Button>
            </div>
        ),
        { width: 420, height: 68, padding: 12 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <Button data-testid="plain-small" size="small" variant="secondary">
                    New task
                </Button>
                <Button data-testid="plain-medium" size="medium">
                    New task
                </Button>
                <Button data-testid="plain-large" size="large" variant="success">
                    Approve run
                </Button>
            </div>
        ),
        { width: 420, height: 68, padding: 12 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <Button
                    aria-label="Add small"
                    data-testid="io-plus-small"
                    icon="plus"
                    iconOnly
                    size="small"
                    variant="secondary"
                />
                <Button
                    aria-label="Add medium"
                    data-testid="io-plus-medium"
                    icon="plus"
                    iconOnly
                    size="medium"
                    variant="secondary"
                />
                <Button
                    aria-label="Add large"
                    data-testid="io-plus-large"
                    icon="plus"
                    iconOnly
                    size="large"
                    variant="secondary"
                />
                <Button
                    aria-label="Approve"
                    data-testid="io-check-medium"
                    icon="check"
                    iconOnly
                    size="medium"
                    variant="success"
                />
                <Button
                    aria-label="Settings"
                    data-testid="io-settings-medium"
                    icon="settings"
                    iconOnly
                    size="medium"
                    variant="ghost"
                />
            </div>
        ),
        { width: 300, height: 68, padding: 12 },
    );
    view.render(
        () => (
            <Button data-testid="button-disabled" disabled>
                Disabled
            </Button>
        ),
        { width: 240, height: 60, padding: 12 },
    );
    await view.ready();

    // Leading icon: 14/16/18 glyph box by size, 6px gap, box exactly centered
    // (the label optical correction must not displace the icon), the glyph
    // actually painting, and the label baseline identical to the same-size
    // plain button (box position pins the baseline for the same font). The icon
    // font centers the glyph inside that box, so there is no centroid to hold.
    const leadIconSizes = { small: 14, medium: 16, large: 18 } as const;
    for (const size of sizes) {
        const id = `lead-${size}`;
        const button = view.$(`[data-testid="${id}"]`);
        const icon = view.$(`[data-testid="${id}"] [data-happy-desktop-ui="button-icon"]`);
        const label = view.$(`[data-testid="${id}"] [data-happy-desktop-ui="button-label"]`);
        const buttonBounds = button.bounds();
        const iconBounds = icon.bounds();
        const labelBounds = label.bounds();
        const iconSize = leadIconSizes[size];
        expect(iconBounds.width, id).toBe(iconSize);
        expect(iconBounds.height, id).toBe(iconSize);
        expect(labelBounds.x - (iconBounds.x + iconBounds.width), `${id} gap`).toBe(6);
        expect(
            Math.abs(iconBounds.y - buttonBounds.y - (sizeStyles[size].height - iconSize) / 2),
            `${id} icon box centering`,
        ).toBeLessThanOrEqual(0.1);

        // The glyph must paint, which also proves the icon font resolved.
        const glyphInk = await view
            .$(`[data-testid="${id}"] [data-happy-desktop-ui="icon"]`)
            .visibleMetrics();
        expect(glyphInk.pixelCount, `${id} glyph paints`).toBeGreaterThan(0);

        // Label centering in the pair is proven transitively: the same-size
        // plain button's label centroid is asserted directly, and the pair's
        // label baseline must match it exactly, so the icon cannot have
        // displaced the label. (The pair's own content capture mixes icon and
        // label ink, so its label centroid cannot be isolated pixel-wise.)
        // "New task" is balanced ink (0.4); large's "Approve run" carries
        // p-descenders and gets the 0.75 ceiling (see labelTolerances).
        const plainDrift = await labelDrift(view, `plain-${size}`);
        expect(Math.abs(plainDrift.dy), `plain-${size} vertical centroid`).toBeLessThanOrEqual(
            size === "large" ? 0.75 : 0.4,
        );
        const plainButton = view.$(`[data-testid="plain-${size}"]`);
        const plainLabel = view.$(
            `[data-testid="plain-${size}"] [data-happy-desktop-ui="button-label"]`,
        );
        const baseline = label.textMetrics().verticalOffset - buttonBounds.y;
        const plainBaseline = plainLabel.textMetrics().verticalOffset - plainButton.bounds().y;
        expect(Math.abs(baseline - plainBaseline), `${id} baseline drift`).toBeLessThanOrEqual(0.1);
    }

    // Icon-only squares: 28/36/44, no padding, and the glyph box centered in
    // the square. The font supplies a box-centered glyph, so the contract is
    // the box geometry plus real ink in it.
    const squares = [
        ["io-plus-small", "small", 28, 14],
        ["io-plus-medium", "medium", 36, 16],
        ["io-plus-large", "large", 44, 18],
        ["io-check-medium", "medium", 36, 16],
        ["io-settings-medium", "medium", 36, 16],
    ] as const;
    for (const [id, , dimension, iconSize] of squares) {
        const button = view.$(`[data-testid="${id}"]`);
        const bounds = button.bounds();
        expect(bounds.width, id).toBe(dimension);
        expect(bounds.height, id).toBe(dimension);
        expect(button.computedStyles(["padding"]), id).toEqual({ padding: "0px" });
        const icon = view.$(`[data-testid="${id}"] [data-happy-desktop-ui="icon"]`);
        const iconBounds = icon.bounds();
        expect(iconBounds.width, id).toBe(iconSize);
        expect(iconBounds.height, id).toBe(iconSize);
        expect(
            Math.abs(iconBounds.x - bounds.x - (dimension - iconSize) / 2),
            `${id} glyph box horizontal centering`,
        ).toBeLessThanOrEqual(0.1);
        expect(
            Math.abs(iconBounds.y - bounds.y - (dimension - iconSize) / 2),
            `${id} glyph box vertical centering`,
        ).toBeLessThanOrEqual(0.1);
        expect((await icon.visibleMetrics()).pixelCount, `${id} glyph paints`).toBeGreaterThan(0);
    }

    // Disabled: dimmed but still optically centered. Rendered outside any
    // flex row, so the root keeps its natural inline-flex display.
    const disabled = view.$('[data-testid="button-disabled"]');
    expect(disabled.computedStyles(["cursor", "display", "opacity"])).toEqual({
        cursor: "not-allowed",
        display: "inline-flex",
        opacity: "0.48",
    });
    expect((disabled.element as HTMLButtonElement).disabled).toBe(true);
    // "Disabled" is balanced ink: held to the tuned 0.4px even at 0.48 alpha.
    const disabledDrift = await labelDrift(view, "button-disabled");
    expect(Math.abs(disabledDrift.dy)).toBeLessThanOrEqual(0.4);

    await view.screenshot("Button.variants.test");
}, 120_000);
