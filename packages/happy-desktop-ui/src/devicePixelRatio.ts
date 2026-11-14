import { useSyncExternalStore } from "react";

/** Page zoom and a move to a screen of another scale both fire a resize: the ratio is read again. */
function pixelRatioSubscribe(change: () => void) {
    addEventListener("resize", change);
    return () => removeEventListener("resize", change);
}

/**
 * The window's device pixel ratio, kept current through page zoom and screen
 * moves. Static markup has no window; it renders at 1.
 */
export function useDevicePixelRatio(): number {
    return useSyncExternalStore(
        pixelRatioSubscribe,
        () => devicePixelRatio,
        () => 1,
    );
}

/**
 * A CSS length for `pixels` rounded to an even number of the window's device
 * pixels, as ThemeScope declares them. Engines snap boxes to device pixels and
 * a transformed glyph to a whole one, but under page zoom a 12px box is 26.29
 * of them at 110% on a 2x screen, so a glyph centred in it, and the box centred
 * in its button, fell half a pixel to one side or the other by where the row
 * landed. An even box centred in an even container sits on whole device pixels
 * at every zoom; at 1x and 2x an even CSS size already is one.
 */
export function evenDevicePixels(pixels: number): string {
    return `calc(2 * round(${pixels / 2}px, var(--happy-device-pixel, 1px)))`;
}
