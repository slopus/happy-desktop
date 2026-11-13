/** The box a fixed child is laid out against, in viewport coordinates. */
export interface FixedBlock {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
}

/**
 * Measures the box a `position: fixed` child of `parent` is laid out against.
 *
 * That box is the viewport only until an ancestor is transformed or contained.
 * The connection surface is contained on purpose, so that nothing fixed inside
 * a connection covers the rail beside it, and from there on `left: x` lands `x`
 * from the surface's edge rather than the window's. A menu, card or carried tab
 * that is placed from a pointer or a trigger's viewport rectangle has to take
 * this box's origin off its offsets, or it opens that far away from what it
 * belongs to.
 *
 * Which ancestors make a containing block is the engine's knowledge, so it is
 * asked rather than guessed: a probe that fills the block is measured and
 * removed in the same call, before anything paints.
 */
export function fixedBlockMeasure(parent: Element): FixedBlock {
    const probe = parent.ownerDocument.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
        "position:fixed;inset:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none;";
    parent.append(probe);
    const { left, top, right, bottom } = probe.getBoundingClientRect();
    probe.remove();
    return { left, top, right, bottom };
}
