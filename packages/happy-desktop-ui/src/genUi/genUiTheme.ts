import theme from "./shared/theme.json";
import {
    genUiColorNames,
    genUiSemanticTones,
    type GenUiMarker,
    type GenUiPlotColor,
    type GenUiTone,
} from "./genUiRender";

type GenUiMarkerStatus = GenUiMarker["status"];

/*
 * Gen UI colours are shared by every client. `shared/theme.json` is a copy of
 * the spec's theme and the only place a Gen UI colour is written: tones, raw
 * colours and the chart are read from it here and painted inline, so a hue
 * change is a change to that file alone. Surfaces, body text and hairlines
 * stay the app's own theme.
 *
 * Each colour is `light-dark()` of its two values, so it follows the colour
 * scheme of wherever the document is drawn.
 */

type Pair = { readonly light: string; readonly dark: string };
type Swatch = { readonly ink: Pair; readonly text: Pair; readonly fill: Pair };

const pair = (value: Pair) => `light-dark(${value.light}, ${value.dark})`;

const swatches: Readonly<Record<GenUiTone, Swatch>> = { ...theme.colors, ...theme.tones };

/** The colour that paints a tone's icons, bars, sparklines and markers. */
export function genUiInk(tone: GenUiTone): string {
    return pair(swatches[tone].ink);
}

/** Text in a tone, pill labels included: its ink adjusted to 4.5:1 on the card. */
export function genUiText(tone: GenUiTone): string {
    return pair(swatches[tone].text);
}

const toneNames: readonly string[] = [...genUiSemanticTones, ...genUiColorNames];
const isTone = (value: string): value is GenUiTone => toneNames.includes(value);
/* A marker tone the theme names but this client does not know draws neutral. */
const markerTone = (value: string): GenUiTone => (isTone(value) ? value : "neutral");

/** The tone a step marker is painted in, by its status, as the theme maps it. */
export const genUiMarkerTones: Readonly<Record<GenUiMarkerStatus, GenUiTone>> = {
    done: markerTone(theme.markers.done),
    failed: markerTone(theme.markers.failed),
    active: markerTone(theme.markers.active),
    pending: markerTone(theme.markers.pending),
};

/** The background of a pill or notice in a tone. */
export function genUiFill(tone: GenUiTone): string {
    return pair(swatches[tone].fill);
}

/** How many colours the shared chart palette has; colour N wraps past the end. */
export const GEN_UI_PALETTE_SIZE = theme.chart.palette.length;

/**
 * A plot colour: palette colour N is `palette[(N - 1) % length]`, `muted` is
 * the chart's own, and a colour name is that colour's ink.
 */
export function genUiPlotPaint(color: GenUiPlotColor): string {
    if (color === "muted") return pair(theme.chart.muted);
    if (typeof color === "string") return genUiInk(color);
    const size = GEN_UI_PALETTE_SIZE;
    const swatch = theme.chart.palette[(((color - 1) % size) + size) % size];
    return swatch ? pair(swatch) : pair(theme.chart.muted);
}

/** Grid lines and tick labels of a plot. */
export const genUiChartGrid = pair(theme.chart.grid);
export const genUiChartAxis = pair(theme.chart.axisLabel);
