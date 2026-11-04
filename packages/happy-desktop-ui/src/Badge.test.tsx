import { type Key, type ReactNode } from "react";
import "./styles.css";
import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import { Badge, type BadgeVariant, CountBadge, KeyCap, ReactionChip } from "./Badge";
import { createRenderer, type RenderedElement } from "./testing";
/*
 * Optical protocol: every measured fixture sits at integer page coordinates
 * (absolute cells) so element-capture clips never round the left/top edge,
 * and carries the `ink` class (transparent background and border) so the
 * captured pixels are the glyph ink alone. Drift is asserted against boxes
 * that do not move with the corrective translate: the component box itself,
 * or the child's layout slot inside it. pixelCount > 0 is asserted for every
 * capture so a clipped or blank capture can never pass.
 */
const TOLERANCE = 0.75;
/*
 * Re-tuning protocol for styles/badge.css: zero the correction vars, collect
 * the Drift values below (temporarily dump them with expect.fail — browser
 * console.log is not forwarded), and re-measure per engine. Engines snap
 * glyph runs to device-pixel steps, so the response to a translate is
 * non-linear; iterate on measurements, never extrapolate.
 */
type Drift = {
    /* ink-bounds-center drift (stable for asymmetric centroid mass) */
    bx: number;
    by: number;
    /* alpha-weighted centroid drift */
    dx: number;
    dy: number;
};
function cell(x: number, y: number, children: ReactNode, key?: Key) {
    return (
        <span
            key={key}
            style={{
                alignItems: "flex-start",
                display: "flex",
                left: `${x}px`,
                position: "absolute",
                top: `${y}px`,
            }}
        >
            {children}
        </span>
    );
}
const INK_FIXTURE_CSS = `
    .ink { background: transparent !important; border-color: transparent !important; }
    .ink * { background: transparent !important; }
`;
/** Ink drift of `part` against the center of `host`'s box. */
async function drift(
    name: string,
    part: RenderedElement<Element>,
    host: RenderedElement<Element>,
): Promise<Drift> {
    const visible = await part.visibleMetrics();
    /* A clipped or blank capture must never pass. */
    expect(visible.pixelCount, `${name} ink`).toBeGreaterThan(0);
    const p = part.bounds();
    const h = host.bounds();
    return {
        dx: p.x - h.x + visible.center.x - h.width / 2,
        dy: p.y - h.y + visible.center.y - h.height / 2,
        bx: p.x - h.x + visible.bounds.x + visible.bounds.width / 2 - h.width / 2,
        by: p.y - h.y + visible.bounds.y + visible.bounds.height / 2 - h.height / 2,
    };
}
/**
 * Ink drift of a chip child against its layout slot (1px border + 8px padding
 * from the near edge, vertically centered). The slot is derived from the chip
 * box, not the child rect, so the corrective translate registers in the
 * measurement.
 */
async function chipDrift(
    name: string,
    part: RenderedElement<Element>,
    chip: RenderedElement<Element>,
    edge: "left" | "right",
): Promise<Drift> {
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${name} ink`).toBeGreaterThan(0);
    const p = part.bounds();
    const c = chip.bounds();
    const slotX = edge === "left" ? c.x + 9 : c.x + c.width - 9 - p.width;
    return {
        dx: p.x + visible.center.x - (slotX + p.width / 2),
        dy: p.y + visible.center.y - (c.y + c.height / 2),
        bx: p.x + visible.bounds.x + visible.bounds.width / 2 - (slotX + p.width / 2),
        by: p.y + visible.bounds.y + visible.bounds.height / 2 - (c.y + c.height / 2),
    };
}
const BADGE_LABELS: Record<BadgeVariant, string> = {
    neutral: "QUEUED",
    accent: "AGENT",
    success: "NEEDS REVIEW",
    warning: "IN PROGRESS",
    danger: "FAILED",
    info: "SYNCED",
    outline: "CONFIG",
};
const BADGE_VARIANTS = Object.keys(BADGE_LABELS) as BadgeVariant[];
it("centers Badge label and icon ink in every variant", { timeout: 120000 }, async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ height: "100%", position: "relative", width: "100%" }}>
                <style>{INK_FIXTURE_CSS}</style>
                {BADGE_VARIANTS.map((variant, index) =>
                    cell(
                        20,
                        20 + index * 30,
                        <Badge
                            className={`ink v-${variant}`}
                            label={BADGE_LABELS[variant]}
                            variant={variant}
                        />,
                        variant,
                    ),
                )}
                {cell(
                    160,
                    20,
                    <Badge className="ink v-icon" icon="spark" label="AGENT" variant="accent" />,
                )}
                {cell(160, 50, <Badge className="ink v-one" label="X" variant="neutral" />)}
            </div>
        ),
        { width: 300, height: 260 },
    );
    await view.ready();
    for (const variant of BADGE_VARIANTS) {
        const badge = view.$(`.v-${variant}`);
        const measured = await drift(
            `badge/${variant}`,
            view.$(`.v-${variant} [data-happy-desktop-ui="badge-label"]`),
            badge,
        );
        expect(badge.height(), `${variant} height`).toBe(18);
        expect(Math.abs(measured.dy), `${variant} optical y`).toBeLessThanOrEqual(TOLERANCE);
        /*
         * Word labels carry inherently asymmetric centroid mass (the word gap
         * in "IN PROGRESS" alone pushes the centroid ~2px right), so the
         * horizontal assertion uses the ink bounding-box center, which tracks
         * the trailing-letter-spacing bias the margin fix removes.
         */
        expect(Math.abs(measured.bx), `${variant} optical x`).toBeLessThanOrEqual(TOLERANCE);
    }
    /* Single glyph: symmetric enough to assert the centroid on both axes. */
    const one = await drift(
        "badge/one-char",
        view.$('.v-one [data-happy-desktop-ui="badge-label"]'),
        view.$(".v-one"),
    );
    expect(Math.abs(one.dx), "one-char optical x").toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(one.dy), "one-char optical y").toBeLessThanOrEqual(TOLERANCE);
    /* Icon form: the 12px glyph slot sits 6px from the left edge and paints
     * (Icon owns the box centering of the font glyph inside it), and the label
     * must share the text baseline treatment. */
    const iconBadge = view.$(".v-icon");
    const icon = view.$('.v-icon [data-happy-desktop-ui="badge-icon"]');
    const iconInk = await icon.visibleMetrics();
    expect(iconInk.pixelCount, "icon ink").toBeGreaterThan(0);
    const b = iconBadge.bounds();
    const i = icon.bounds();
    expect(i.width, "icon box width").toBe(12);
    expect(i.height, "icon box height").toBe(12);
    expect(Math.abs(i.x - (b.x + 6)), "icon slot inset").toBeLessThanOrEqual(0.5);
    const iconLabel = await drift(
        "badge/icon-label",
        view.$('.v-icon [data-happy-desktop-ui="badge-label"]'),
        iconBadge,
    );
    expect(Math.abs(iconLabel.dy), "icon-form label optical y").toBeLessThanOrEqual(TOLERANCE);
});
it(
    "aligns every CountBadge digit to one centered lining-figure band and baseline",
    { timeout: 120000 },
    async () => {
        const cases = [
            { count: 0, tone: "accent" },
            { count: 1, tone: "accent" },
            { count: 2, tone: "accent" },
            { count: 3, tone: "accent" },
            { count: 4, tone: "accent" },
            { count: 5, tone: "accent" },
            { count: 6, tone: "accent" },
            { count: 7, tone: "accent" },
            { count: 8, tone: "accent" },
            { count: 9, tone: "accent" },
            { count: 10, tone: "accent" },
            { count: 11, tone: "accent" },
            { count: 12, tone: "accent" },
            { count: 44, tone: "accent" },
            { count: 64, tone: "accent" },
            { count: 88, tone: "accent" },
            { count: 128, tone: "accent" },
            { count: 999, tone: "accent" },
            { count: 1234, tone: "accent" },
            { count: 0, tone: "neutral" },
            { count: 7, tone: "neutral" },
            { count: 64, tone: "neutral" },
            { count: 1234, tone: "neutral" },
        ] as const;
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {cases.map((entry, index) =>
                        cell(
                            20 + (index % 4) * 58,
                            20 + Math.floor(index / 4) * 30,
                            <CountBadge
                                className={`ink c-${entry.tone}-${entry.count}`}
                                count={entry.count}
                                tone={entry.tone}
                            />,
                            `${entry.tone}-${entry.count}`,
                        ),
                    )}
                </div>
            ),
            { width: 260, height: 210 },
        );
        await view.ready();
        let baseline: number | undefined;
        for (const entry of cases) {
            const id = `c-${entry.tone}-${entry.count}`;
            const badge = view.$(`.${id}`);
            const label = view.$(`.${id} [data-happy-desktop-ui="count-badge-label"]`);
            const measured = await drift(`count/${entry.tone}-${entry.count}`, label, badge);
            /*
             * Alignment means a common browser-laid-out baseline and a
             * centered lining-figure HEIGHT band. It does not mean forcing
             * every content-dependent centroid to zero: "7" is inherently
             * top-heavy. happy Mono's lining/tabular figures make the band
             * and advance width stable for every number assembled from 0–9.
             */
            const metrics = label.textMetrics();
            const currentBaseline = metrics.verticalOffset - badge.bounds().y;
            baseline ??= currentBaseline;
            expect(
                Math.abs(currentBaseline - baseline),
                `${id} shared baseline`,
            ).toBeLessThanOrEqual(0.001);
            const expectedBaseline = server.browser === "webkit" ? 12.875 : 13;
            expect(
                Math.abs(currentBaseline - expectedBaseline),
                `${id} measured baseline position`,
            ).toBeLessThanOrEqual(0.005);
            expect(metrics.font.family, `${id} numeric font`).toBe(
                "happy Mono, ui-monospace, monospace",
            );
            const numericVariant = label.computedStyle("font-variant-numeric");
            expect(numericVariant, `${id} lining figures`).toContain("lining-nums");
            expect(numericVariant, `${id} tabular figures`).toContain("tabular-nums");
            expect(Math.abs(measured.by), `${id} full numeral height`).toBeLessThanOrEqual(0.25);
            expect(
                Math.abs(label.offsets().left - label.offsets().right),
                `${id} line-box symmetry`,
            ).toBeLessThanOrEqual(0.5);
            if (entry.count === 0) {
                expect(
                    Math.abs(measured.bx),
                    `${id} zero bounds x ${measured.bx}`,
                ).toBeLessThanOrEqual(0.001);
                expect(
                    Math.abs(measured.by),
                    `${id} zero bounds y ${measured.by}`,
                ).toBeLessThanOrEqual(0.001);
                const expectedOptical =
                    server.browser === "webkit"
                        ? entry.tone === "accent"
                            ? { x: -0.01, y: -0.09 }
                            : { x: -0.01, y: -0.006 }
                        : entry.tone === "accent"
                          ? { x: -0.013, y: -0.007 }
                          : { x: -0.011, y: -0.007 };
                expect(
                    Math.abs(measured.dx - expectedOptical.x),
                    `${id} measured zero centroid x ${measured.dx}`,
                ).toBeLessThanOrEqual(0.005);
                expect(
                    Math.abs(measured.dy - expectedOptical.y),
                    `${id} measured zero centroid y ${measured.dy}`,
                ).toBeLessThanOrEqual(0.005);
            }
            if (entry.count === 1234) {
                const expectedOpticalY =
                    server.browser === "webkit"
                        ? entry.tone === "accent"
                            ? 0.093
                            : 0.196
                        : entry.tone === "accent"
                          ? 0.192
                          : 0.195;
                expect(
                    Math.abs(measured.dy - expectedOpticalY),
                    `${id} measured content-dependent centroid y ${measured.dy}`,
                ).toBeLessThanOrEqual(0.005);
            }
            /* Stepped integral width: fractional intrinsic text widths would
             * land right-aligned pills off the device-pixel grid. */
            expect(badge.width(), `${id} stepped width`).toBe(
                18 + (String(entry.count).length - 1) * 7,
            );
        }
    },
);
it(
    "measures each ReactionChip emoji independently inside a fixed slot",
    { timeout: 120000 },
    async () => {
        const cases = ["👍", "🎉", "🚀", "✅", "🔥", "👩‍💻", "🇺🇸", "❤️"];
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {cases.map((emoji, index) =>
                        cell(
                            20 + (index % 2) * 120,
                            20 + Math.floor(index / 2) * 34,
                            <ReactionChip
                                className={`ink emoji-${index}`}
                                count={index + 1}
                                emoji={emoji}
                            />,
                            emoji,
                        ),
                    )}
                </div>
            ),
            { width: 280, height: 170 },
        );
        await view.ready();
        for (const [index, emoji] of cases.entries()) {
            const chip = view.$(`.emoji-${index}`);
            const slot = view.$(`.emoji-${index} [data-happy-desktop-ui="reaction-chip-emoji"]`);
            const glyph = view.$(
                `.emoji-${index} [data-happy-desktop-ui="reaction-chip-emoji-glyph"]`,
            );
            expect(chip.height(), `${emoji} chip height`).toBe(24);
            expect(slot.bounds().width, `${emoji} slot width`).toBe(18);
            expect(slot.bounds().height, `${emoji} slot height`).toBe(18);
            expect(slot.bounds().x - chip.bounds().x, `${emoji} slot x`).toBe(9);
            expect(slot.bounds().y - chip.bounds().y, `${emoji} slot y`).toBe(3);
            expect(slot.computedStyle("font-family"), `${emoji} fallback stack`).toContain(
                "Apple Color Emoji",
            );
            const visible = await glyph.visibleMetrics();
            expect(visible.pixelCount, `${emoji} ink`).toBeGreaterThan(0);
            const glyphBounds = glyph.bounds();
            const slotBounds = slot.bounds();
            const inkLeft = glyphBounds.x - slotBounds.x + visible.bounds.x;
            const inkTop = glyphBounds.y - slotBounds.y + visible.bounds.y;
            const inkRight = inkLeft + visible.bounds.width;
            const inkBottom = inkTop + visible.bounds.height;
            expect(inkLeft, `${emoji} unclipped left`).toBeGreaterThanOrEqual(-0.5);
            expect(inkTop, `${emoji} unclipped top`).toBeGreaterThanOrEqual(-0.5);
            expect(inkRight, `${emoji} unclipped right`).toBeLessThanOrEqual(18.5);
            expect(inkBottom, `${emoji} unclipped bottom`).toBeLessThanOrEqual(18.5);
            /*
             * System color-emoji artwork has content-dependent mass, so compare
             * each glyph's full painted bounds with its own slot. Never combine
             * the emoji and count into one centroid.
             */
            const boundsDx = inkLeft + visible.bounds.width / 2 - 9;
            const boundsDy = inkTop + visible.bounds.height / 2 - 9;
            expect(Math.abs(boundsDx), `${emoji} bounds x ${boundsDx}`).toBeLessThanOrEqual(0.75);
            expect(Math.abs(boundsDy), `${emoji} bounds y ${boundsDy}`).toBeLessThanOrEqual(0.75);
        }
    },
);
it(
    "aligns ReactionChip counts to one lining-figure band and baseline",
    { timeout: 120000 },
    async () => {
        const counts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 44, 64, 88, 128, 999, 1234];
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {counts.map((count, index) =>
                        cell(
                            20 + (index % 4) * 74,
                            20 + Math.floor(index / 4) * 34,
                            <ReactionChip
                                className={`ink count-${count}`}
                                count={count}
                                emoji="👍"
                            />,
                            count,
                        ),
                    )}
                </div>
            ),
            { width: 330, height: 200 },
        );
        await view.ready();
        let baseline: number | undefined;
        for (const count of counts) {
            const chip = view.$(`.count-${count}`);
            const label = view.$(`.count-${count} [data-happy-desktop-ui="reaction-chip-count"]`);
            const measured = await chipDrift(`chip-count/${count}`, label, chip, "right");
            const metrics = label.textMetrics();
            const currentBaseline = metrics.verticalOffset - chip.bounds().y;
            baseline ??= currentBaseline;
            expect(
                Math.abs(currentBaseline - baseline),
                `${count} shared baseline`,
            ).toBeLessThanOrEqual(0.001);
            expect(
                Math.abs(currentBaseline - 16),
                `${count} baseline position`,
            ).toBeLessThanOrEqual(0.1);
            expect(metrics.font.family, `${count} numeric font`).toBe(
                "happy Mono, ui-monospace, monospace",
            );
            const numericVariant = label.computedStyle("font-variant-numeric");
            expect(numericVariant, `${count} lining figures`).toContain("lining-nums");
            expect(numericVariant, `${count} tabular figures`).toContain("tabular-nums");
            expect(Math.abs(measured.by), `${count} full numeral height`).toBeLessThanOrEqual(0.25);
            expect(
                Math.abs(
                    chip.bounds().x +
                        chip.bounds().width -
                        (label.bounds().x + label.bounds().width) -
                        9,
                ),
                `${count} trailing inset`,
            ).toBeLessThanOrEqual(0.001);
            if (count === 1234) {
                expect(Math.abs(measured.dy), `${count} balanced centroid`).toBeLessThanOrEqual(
                    0.15,
                );
            }
        }
    },
);
it(
    "stands every KeyCap glyph on one baseline, with the modifiers spanning the capitals' height",
    { timeout: 120000 },
    async () => {
        /*
         * The modifiers are text from the system face and the letters text from
         * the mono face, laid out on one shared baseline, so wherever a cap
         * lands — integer or fractional — both snap together. ⌘ ⇧ ⌥ span the
         * capitals' band: their ink starts on the cap line and ends on the
         * baseline, a round ⌘ overshooting it by at most one device pixel. ⌃ is
         * the raised caret macOS draws, hung from the cap line.
         */
        const combos = ["⌘K", "⇧⌘P", "⌥⌘K", "⌃K", "⌘0", "ESC", "ENTER"] as const;
        const offsets = [0, 0.25, 0.5, 0.75] as const;
        const isSym = (ch: string) => ["⌘", "⇧", "⌥", "⌃"].includes(ch);
        const view = createRenderer();
        view.render(
            () => (
                <div style={{ height: "100%", position: "relative", width: "100%" }}>
                    <style>{INK_FIXTURE_CSS}</style>
                    {offsets.flatMap((offset, column) =>
                        combos.map((keys, index) =>
                            cell(
                                20 + column * 80,
                                20 + index * 30 + offset,
                                <KeyCap className={`ink k-${column}-${index}`} keys={keys} />,
                                `combo-${column}-${keys}`,
                            ),
                        ),
                    )}
                </div>
            ),
            { width: 360, height: 260 },
        );
        await view.ready();
        const glyph = (cls: string, k: number) =>
            view.$(`.${cls} [data-happy-desktop-ui="key-cap-key"]:nth-child(${k + 1}) > span`);
        for (const column of offsets.keys())
            for (const [index, keys] of combos.entries()) {
                const cls = `k-${column}-${index}`;
                const cap = view.$(`.${cls}`);
                const label = view.$(`.${cls} [data-happy-desktop-ui="key-cap-label"]`);
                const chars = Array.from(keys);
                expect(cap.height(), `${keys} height`).toBe(18);
                expect(cap.element.getAttribute("aria-label"), `${keys} label`).toBe(keys);
                expect(cap.computedStyle("padding-left"), `${keys} left padding`).toBe("4px");
                expect(cap.computedStyle("padding-right"), `${keys} right padding`).toBe("4px");
                expect(label.bounds().height, `${keys} label height`).toBe(10);
                const contentWidth = chars.reduce((w, ch) => w + (isSym(ch) ? 10 : 6.5), 0);
                expect(label.bounds().width, `${keys} content width`).toBe(contentWidth);
                const ink: {
                    ch: string;
                    left: number;
                    right: number;
                    top: number;
                    bottom: number;
                }[] = [];
                let baseline: number | undefined;
                for (const [k, ch] of chars.entries()) {
                    const slot = view.$(
                        `.${cls} [data-happy-desktop-ui="key-cap-key"]:nth-child(${k + 1})`,
                    );
                    expect(slot.bounds().width, `${keys}/${ch} slot width`).toBe(
                        isSym(ch) ? 10 : 6.5,
                    );
                    const text = glyph(cls, k);
                    expect(text.element.getAttribute("data-happy-desktop-ui")).toBe(
                        isSym(ch) ? "key-cap-symbol" : "key-cap-text",
                    );
                    const own = text.textMetrics().verticalOffset;
                    baseline ??= own;
                    expect(
                        Math.abs(own - baseline),
                        `${keys}/${ch} shared baseline`,
                    ).toBeLessThanOrEqual(0.001);
                    const visible = await text.visibleMetrics();
                    expect(visible.pixelCount, `${keys}/${ch} paints ink`).toBeGreaterThan(0);
                    const box = text.bounds();
                    ink.push({
                        ch,
                        left: box.x + visible.bounds.x,
                        right: box.x + visible.bounds.x + visible.bounds.width,
                        top: box.y + visible.bounds.y,
                        bottom: box.y + visible.bounds.y + visible.bounds.height,
                    });
                }
                const capital = ink.find((entry) => /[A-Z]/.test(entry.ch));
                if (capital)
                    for (const entry of ink.filter((candidate) => isSym(candidate.ch))) {
                        const pair = `${keys}@${String(offsets[column])}/${entry.ch}`;
                        expect(
                            Math.abs(entry.top - capital.top),
                            `${pair} starts on the cap line`,
                        ).toBeLessThanOrEqual(0.5);
                        if (entry.ch === "⌃") continue;
                        const below = entry.bottom - capital.bottom;
                        expect(below, `${pair} ends on the baseline`).toBeGreaterThanOrEqual(0);
                        expect(below, `${pair} overshoot`).toBeLessThanOrEqual(0.5);
                    }
                // A modifier keeps clear air on each side; letters keep the mono rhythm.
                for (let token = 1; token < ink.length; token += 1) {
                    const gap = ink[token]!.left - ink[token - 1]!.right;
                    const pair = `${keys}/${ink[token - 1]!.ch}-${ink[token]!.ch}`;
                    if (isSym(ink[token]!.ch) || isSym(ink[token - 1]!.ch)) {
                        expect(gap, `${pair} modifier gap`).toBeGreaterThanOrEqual(0.5);
                        expect(gap, `${pair} modifier gap`).toBeLessThanOrEqual(2);
                    } else {
                        expect(gap, `${pair} letter gap`).toBeGreaterThanOrEqual(-0.01);
                        expect(gap, `${pair} letter gap`).toBeLessThanOrEqual(1.6);
                    }
                }
            }
        await view.screenshot("KeyCap.test");
    },
);
it("holds Badge family geometry, colors, and behavior", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div
                style={{
                    background: "#f5f5f5",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    height: "100%",
                    padding: "14px",
                }}
            >
                <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
                    <Badge className="g-neutral" label="QUEUED" variant="neutral" />
                    <Badge className="g-accent" label="AGENT" variant="accent" />
                    <Badge className="g-success" label="NEEDS REVIEW" variant="success" />
                    <Badge className="g-warning" label="IN PROGRESS" variant="warning" />
                    <Badge className="g-danger" label="FAILED" variant="danger" />
                </div>
                <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
                    <Badge className="g-info" label="SYNCED" variant="info" />
                    <Badge className="g-outline" label="CONFIG" variant="outline" />
                    <Badge className="g-icon" icon="spark" label="AGENT" variant="accent" />
                    <Badge className="g-default" label="DEFAULT" />
                </div>
                <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
                    <CountBadge className="g-count-0" count={0} />
                    <CountBadge className="g-count-1" count={1} />
                    <CountBadge className="g-count-12" count={12} />
                    <CountBadge className="g-count-128" count={128} />
                    <CountBadge className="g-count-neutral" count={64} tone="neutral" />
                    <KeyCap className="g-cap-short" keys="⌘K" />
                    <KeyCap className="g-cap-long" keys="CTRL+SHIFT+K" />
                </div>
                <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
                    <ReactionChip className="g-chip" count={2} emoji="👍" />
                    <ReactionChip active className="g-chip-active" count={14} emoji="🎉" />
                </div>
            </div>
        ),
        { width: 560, height: 144 },
    );
    await view.ready();
    const mono =
        server.browser === "webkit" && server.platform !== "darwin"
            ? "happy Mono, ui-monospace, monospace"
            : '"happy Mono", ui-monospace, monospace';
    /* Badge: 18px mono uppercase pill; each variant maps to its tokens. */
    const badgeColors: Record<
        BadgeVariant,
        {
            background: string;
            color: string;
        }
    > = {
        neutral: { background: "rgb(245, 245, 245)", color: "rgb(73, 69, 79)" },
        accent: { background: "rgb(234, 234, 234)", color: "rgb(43, 172, 204)" },
        success: {
            background: "rgb(248, 248, 248)",
            color: "rgb(52, 199, 89)",
        },
        warning: { background: "rgb(255, 248, 240)", color: "rgb(255, 149, 0)" },
        danger: { background: "rgb(255, 240, 240)", color: "rgb(255, 59, 48)" },
        info: { background: "rgb(248, 248, 248)", color: "rgb(0, 122, 255)" },
        outline: { background: "rgba(0, 0, 0, 0)", color: "rgb(73, 69, 79)" },
    };
    for (const variant of BADGE_VARIANTS) {
        const badge = view.$(`.g-${variant}`);
        expect(badge.element.getAttribute("data-variant"), variant).toBe(variant);
        expect(
            badge.computedStyles([
                "background-color",
                "border-radius",
                "box-sizing",
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "height",
                "letter-spacing",
                "line-height",
                "text-transform",
            ]),
            variant,
        ).toEqual({
            "background-color": badgeColors[variant].background,
            "border-radius": "4px",
            "box-sizing": "border-box",
            color: badgeColors[variant].color,
            "font-family": mono,
            "font-size": "10px",
            "font-weight": "700",
            height: "18px",
            "letter-spacing": "0.6px",
            "line-height": "18px",
            "text-transform": "uppercase",
        });
        /* 6px visual inset on both sides (outline trades 1px for its border);
         * the trailing letter-space of the last glyph is trimmed by the label
         * margin so the ink, not the advance box, is what gets centered. */
        expect(badge.computedStyle("padding-left"), variant).toBe(
            variant === "outline" ? "5px" : "6px",
        );
        expect(
            view
                .$(`.g-${variant} [data-happy-desktop-ui="badge-label"]`)
                .computedStyle("margin-right"),
            variant,
        ).toBe("-0.6px");
    }
    expect(view.$(".g-outline").computedStyles(["border-top-color", "border-top-width"])).toEqual({
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
    });
    expect(view.$(".g-default").element.getAttribute("data-variant")).toBe("neutral");
    /* Icon form: 12px icon box, 4px gap to the label. */
    const iconBadge = view.$(".g-icon");
    const icon = view.$('.g-icon [data-happy-desktop-ui="badge-icon"]');
    const label = view.$('.g-icon [data-happy-desktop-ui="badge-label"]');
    expect(icon.bounds().width).toBe(12);
    expect(icon.bounds().height).toBe(12);
    /* The icon slot starts 6px in; the box may carry a sub-pixel measured
     * optical correction. */
    expect(Math.abs(icon.bounds().x - (iconBadge.bounds().x + 6))).toBeLessThanOrEqual(0.5);
    expect(label.bounds().x - icon.bounds().x).toBeGreaterThanOrEqual(16);
    expect(
        view.$(".g-neutral").element.querySelector('[data-happy-desktop-ui="badge-icon"]'),
    ).toBeNull();
    /* CountBadge: 18px pill, min-width 18, grows with digit count. */
    for (const [id, tone] of [
        ["g-count-0", "accent"],
        ["g-count-1", "accent"],
        ["g-count-12", "accent"],
        ["g-count-128", "accent"],
        ["g-count-neutral", "neutral"],
    ] as const) {
        const badge = view.$(`.${id}`);
        expect(badge.element.getAttribute("data-tone"), id).toBe(tone);
        expect(badge.height(), id).toBe(18);
        expect(
            badge.computedStyles([
                "background-color",
                "border-radius",
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "font-variant-numeric",
                "line-height",
            ]),
            id,
        ).toEqual({
            "background-color": tone === "accent" ? "rgb(0, 0, 0)" : "rgb(245, 245, 245)",
            "border-radius": "999px",
            color: tone === "accent" ? "rgb(255, 255, 255)" : "rgb(73, 69, 79)",
            "font-family": mono,
            "font-size": "10.8px",
            "font-weight": "700",
            "font-variant-numeric": "lining-nums tabular-nums",
            "line-height": "18px",
        });
    }
    expect(view.$(".g-count-0").width()).toBe(18);
    expect(view.$(".g-count-1").width()).toBe(18);
    expect(view.$(".g-count-12").width()).toBeGreaterThan(18);
    expect(view.$(".g-count-12").width()).toBeLessThan(26);
    expect(view.$(".g-count-128").width()).toBeGreaterThan(26);
    expect(view.$(".g-count-128").width()).toBeLessThan(33);
    expect(view.$(".g-count-1").element.getAttribute("data-tone")).toBe("accent");
    /* ReactionChip: 24px bordered pill button with emoji + count. */
    const chip = view.$(".g-chip");
    expect(chip.element.tagName).toBe("BUTTON");
    expect(chip.element.getAttribute("type")).toBe("button");
    expect(chip.element.getAttribute("aria-label")).toBe("👍 2");
    expect(chip.element.getAttribute("aria-pressed")).toBe("false");
    expect(chip.height()).toBe(24);
    expect(
        chip.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "cursor",
        ]),
    ).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "999px",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        cursor: "pointer",
    });
    expect(
        view
            .$('.g-chip [data-happy-desktop-ui="reaction-chip-count"]')
            .computedStyles([
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "font-variant-numeric",
                "line-height",
            ]),
    ).toEqual({
        color: "rgb(73, 69, 79)",
        "font-family": mono,
        "font-size": "11px",
        "font-weight": "700",
        "font-variant-numeric": "lining-nums tabular-nums",
        "line-height": "22px",
    });
    const emojiSlot = view.$('.g-chip [data-happy-desktop-ui="reaction-chip-emoji"]');
    expect(emojiSlot.bounds().width).toBe(18);
    expect(emojiSlot.bounds().height).toBe(18);
    expect(emojiSlot.computedStyle("font-size")).toBe("13px");
    expect(emojiSlot.computedStyle("font-family")).toContain("Apple Color Emoji");
    expect(
        (
            await view
                .$('.g-chip [data-happy-desktop-ui="reaction-chip-emoji-glyph"]')
                .visibleMetrics()
        ).pixelCount,
    ).toBeGreaterThan(0);
    const active = view.$(".g-chip-active");
    expect(active.element.getAttribute("aria-pressed")).toBe("true");
    expect(active.computedStyles(["background-color", "border-top-color"])).toEqual({
        "background-color": "rgb(234, 234, 234)",
        "border-top-color": "rgb(43, 172, 204)",
    });
    expect(
        view
            .$('.g-chip-active [data-happy-desktop-ui="reaction-chip-count"]')
            .computedStyle("color"),
    ).toBe("rgb(43, 172, 204)");
    /* KeyCap: 18px mono hint. */
    for (const id of ["g-cap-short", "g-cap-long"]) {
        const cap = view.$(`.${id}`);
        expect(cap.element.tagName, id).toBe("KBD");
        expect(cap.height(), id).toBe(18);
        expect(
            cap.computedStyles([
                "background-color",
                "border-radius",
                "color",
                "font-family",
                "font-size",
                "font-weight",
            ]),
            id,
        ).toEqual({
            "background-color": "rgb(245, 245, 245)",
            "border-radius": "4px",
            color: "rgb(73, 69, 79)",
            "font-family": mono,
            "font-size": "10.8px",
            "font-weight": "500",
        });
    }
    await view.screenshot("Badge.test");
});
it("fires onSelect when a ReactionChip is clicked", async () => {
    const onSelect = vi.fn();
    const view = createRenderer();
    view.render(
        () => <ReactionChip className="click-me" count={2} emoji="👍" onSelect={onSelect} />,
        {
            width: 120,
            height: 48,
            padding: 12,
        },
    );
    await view.ready();
    (view.$(".click-me").element as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
});
