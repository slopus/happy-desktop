import katex from "katex";

/**
 * One TeX formula, typeset by KaTeX, or the reason it could not be.
 *
 * Renderer and row-height model both read this one cached result, so a formula
 * that fails to parse is the same fallback in the transcript and in the height
 * the virtual list reserved for it.
 */
export type MathFormulaRender =
    | { readonly kind: "rendered"; readonly html: string }
    | { readonly kind: "failed"; readonly message: string };

/**
 * KaTeX options for untrusted chat content. `trust: false` keeps `\href`,
 * `\url`, `\includegraphics`, and the `\html…` commands inert; the size and
 * macro-expansion limits bound what one message can make the typesetter do.
 */
const KATEX_OPTIONS = {
    maxExpand: 500,
    maxSize: 20,
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: true,
    trust: false,
} as const;

const RENDER_CAPACITY = 512;
const renders = new Map<string, MathFormulaRender>();

/** Typesets `source`, reusing the result for a recently seen formula. */
export function mathFormulaRender(source: string, display: boolean): MathFormulaRender {
    const key = `${display ? "D" : "I"}${source}`;
    const hit = renders.get(key);
    if (hit !== undefined) {
        renders.delete(key);
        renders.set(key, hit);
        return hit;
    }
    let value: MathFormulaRender;
    try {
        value = {
            kind: "rendered",
            html: katex.renderToString(source, { ...KATEX_OPTIONS, displayMode: display }),
        };
    } catch (error) {
        value = {
            kind: "failed",
            message: error instanceof Error ? error.message : "This formula could not be typeset.",
        };
    }
    if (renders.size >= RENDER_CAPACITY) renders.delete(renders.keys().next().value!);
    renders.set(key, value);
    return value;
}

/** The element classes a rendered formula carries; the measurer builds the same element. */
export function mathFormulaClassName(display: boolean): string {
    return display ? "happy-math happy-math--display" : "happy-math happy-math--inline";
}

/**
 * Geometry of one rendered inline formula on a body line: its advance, and how
 * far the line box it sits on extends above and below the baseline. A line
 * with no formula is exactly its CSS line height; a line with one is the
 * tallest ascent plus the deepest descent of the formulas on it.
 */
export type MathInlineBox = {
    readonly width: number;
    readonly ascent: number;
    readonly descent: number;
};

/**
 * KaTeX lays a formula out with the browser, so a formula's geometry is the
 * one thing the text model cannot compute from font metrics alone. It is read
 * once per formula and type ramp from a hidden element built exactly like the
 * rendered one, then cached until a font changes.
 */
let measureHost: HTMLDivElement | undefined;
const inlineBoxes = new Map<string, MathInlineBox>();
const displayBoxes = new Map<string, MathDisplayBox>();
const MEASURE_CAPACITY = 2_048;
let fontsRequested = false;
let measuredBeforeFonts = false;
const fontListeners = new Set<() => void>();

function measureHostGet(): HTMLDivElement | undefined {
    if (typeof document === "undefined" || !document.body) return undefined;
    if (measureHost?.isConnected) return measureHost;
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.dataset.happyMathMeasure = "";
    Object.assign(host.style, {
        contain: "layout style",
        left: "-10000px",
        pointerEvents: "none",
        position: "absolute",
        top: "0",
        visibility: "hidden",
        whiteSpace: "nowrap",
        width: "max-content",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.append(host);
    measureHost = host;
    return host;
}

/**
 * KaTeX ships about twenty faces and the browser fetches each only when a
 * glyph first needs it, so the first formulas would be measured with fallback
 * metrics. Ask for every face once, the first time a formula is measured, and
 * tell the text model when they have all arrived.
 */
function mathFontsRequest(): void {
    if (fontsRequested || typeof document === "undefined" || !document.fonts) return;
    fontsRequested = true;
    const loads: Promise<unknown>[] = [];
    for (const face of document.fonts) {
        if (!face.family.replace(/["']/gu, "").startsWith("KaTeX_")) continue;
        /* Only a face still to arrive can have been measured with fallback metrics. */
        if (face.status !== "loaded") measuredBeforeFonts = true;
        loads.push(face.load().catch(() => undefined));
    }
    void Promise.all(loads).then(() => {
        if (!measuredBeforeFonts) return;
        inlineBoxes.clear();
        displayBoxes.clear();
        for (const listener of fontListeners) listener();
    });
}

/** Notifies the text model when KaTeX's faces change measured geometry. */
export function mathFontsSubscribe(listener: () => void): () => void {
    fontListeners.add(listener);
    return () => fontListeners.delete(listener);
}

/** Forgets measured geometry; the text model calls this when body fonts change. */
export function mathLayoutClear(): void {
    inlineBoxes.clear();
    displayBoxes.clear();
}

function bounded<T>(map: Map<string, T>, key: string, value: T): T {
    if (map.size >= MEASURE_CAPACITY) map.delete(map.keys().next().value!);
    map.set(key, value);
    return value;
}

/**
 * Inline geometry of `html` (a rendered inline formula) on a line of the given
 * UI type ramp. The host line holds a zero-size baseline probe beside the
 * formula, so the measured ascent and descent already include the line's own
 * strut: a formula that fits the line reports exactly `lineHeight`.
 */
export function mathInlineBoxMeasure(
    source: string,
    html: string,
    font: { readonly family: string; readonly size: number; readonly lineHeight: number },
): MathInlineBox {
    const key = `${String(font.size)}/${String(font.lineHeight)}:${source}`;
    const hit = inlineBoxes.get(key);
    if (hit !== undefined) return hit;
    const host = measureHostGet();
    if (!host)
        return {
            width: source.length * font.size * 0.5,
            ascent: font.lineHeight / 2,
            descent: font.lineHeight / 2,
        };
    mathFontsRequest();
    const line = document.createElement("div");
    Object.assign(line.style, {
        fontFamily: font.family,
        fontSize: `${String(font.size)}px`,
        fontStyle: "normal",
        fontWeight: "400",
        lineHeight: `${String(font.lineHeight)}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    const probe = document.createElement("span");
    Object.assign(probe.style, { display: "inline-block", height: "0", width: "0" });
    const formula = document.createElement("span");
    formula.className = mathFormulaClassName(false);
    formula.innerHTML = html;
    line.append(probe, formula);
    host.append(line);
    const lineRect = line.getBoundingClientRect();
    const baseline = probe.getBoundingClientRect().bottom;
    const box = {
        width: formula.getBoundingClientRect().width,
        ascent: baseline - lineRect.top,
        descent: lineRect.bottom - baseline,
    };
    line.remove();
    return bounded(inlineBoxes, key, box);
}

/**
 * A display formula's natural geometry. `reach` is how far right of its box's
 * left edge anything it lays out ends: KaTeX glyphs and kerns can pass the
 * box's own edge, and the host's scrollport scrolls once they pass its edge.
 */
export type MathDisplayBox = {
    readonly width: number;
    readonly height: number;
    readonly reach: number;
};

/**
 * Natural box of `html` (a rendered display formula). A display formula never
 * wraps — it scrolls — so neither dimension depends on the measure.
 */
export function mathDisplayBoxMeasure(
    source: string,
    html: string,
    font: { readonly family: string; readonly size: number; readonly lineHeight: number },
): MathDisplayBox {
    const hit = displayBoxes.get(source);
    if (hit !== undefined) return hit;
    const host = measureHostGet();
    if (!host)
        return {
            width: 0,
            height: font.lineHeight * Math.max(1, source.split("\n").length),
            reach: 0,
        };
    mathFontsRequest();
    const block = document.createElement("div");
    Object.assign(block.style, {
        fontFamily: font.family,
        fontSize: `${String(font.size)}px`,
        lineHeight: `${String(font.lineHeight)}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    const formula = document.createElement("div");
    formula.className = mathFormulaClassName(true);
    formula.innerHTML = html;
    block.append(formula);
    host.append(block);
    const bounds = formula.getBoundingClientRect();
    let right = bounds.right;
    /* KaTeX's visually hidden MathML is clipped and scrolls nothing. */
    for (const element of formula.querySelectorAll(".katex-html *"))
        right = Math.max(right, element.getBoundingClientRect().right);
    block.remove();
    return bounded(displayBoxes, source, {
        width: bounds.width,
        height: bounds.height,
        reach: right - bounds.left,
    });
}
