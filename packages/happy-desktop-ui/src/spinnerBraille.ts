/*
 * Device-pixel renderer for cli-spinners' `dots2` Braille loop.
 *
 * A 14px loader is only 28 physical pixels tall on the Retina surface it is
 * designed for. Drawing each of its eight dots as an independently
 * antialiased CSS circle makes the weak edge pixels disappear at a different
 * rate as opacity changes, so dots with the same CSS dimensions appear to
 * change size. This renderer owns the final pixel grid instead: it chooses one
 * binary dot stamp for the box's actual physical height and builds that exact
 * stamp eight times at integer device-pixel coordinates. At least one
 * transparent device pixel stays between every dot and the box edge.
 *
 * Animation belongs to the compositor. Every dot runs the one opacity
 * program — 60ms down, 40ms held dim, 60ms up across an 800ms loop — and
 * differs only by its 100ms phase, so no dot can acquire a different
 * transition. The stamps are built when the box is measured and never
 * redrawn: a frame of the loop is an opacity change on eight already
 * rasterised layers, with no script, no canvas upload, and no repaint, and the
 * colour is the box's own `currentColor`.
 *
 * The program is a Web Animation rather than a CSS one. A CSS animation
 * dispatches `animationiteration` on every loop, and with a listener on the
 * page — React keeps one on its root — each of those wakes the main thread for
 * a style pass: eight dots a spinner, every 800ms. A Web Animation has no
 * iteration events, so an endless one never touches the main thread.
 */

const BRAILLE_FRAME_MS = 100;
const BRAILLE_CYCLE_MS = 8 * BRAILLE_FRAME_MS;

/* Full, down to 18% over 60ms, held to 100ms, back up by 160ms, full after. */
const DOT_KEYFRAMES: Keyframe[] = [
    { offset: 0, opacity: 1 },
    { offset: 0.075, opacity: 0.18 },
    { offset: 0.125, opacity: 0.18 },
    { offset: 0.2, opacity: 1 },
    { offset: 1, opacity: 1 },
];

/* DOM order is left column top-to-bottom, then right column top-to-bottom.
 * dots2 dims dot1, dot2, dot3, dot7, dot8, dot6, dot5, then dot4. */
const DOT_PHASES = [0, 1, 2, 3, 7, 6, 5, 4] as const;

type PixelPoint = readonly [x: number, y: number];
type PixelSpan = readonly [start: number, length: number];

function modulo(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}

/** One hard-edged circular stamp, as horizontal one-device-pixel spans. */
function dotStamp(diameter: number): readonly PixelSpan[] {
    const center = (diameter - 1) / 2;
    const radius = diameter / 2;
    return Array.from({ length: diameter }, (_, y) => {
        let first = diameter;
        let last = -1;
        for (let x = 0; x < diameter; x += 1) {
            if (Math.hypot(x - center, y - center) > radius) continue;
            first = Math.min(first, x);
            last = x;
        }
        return [first, Math.max(0, last - first + 1)] as const;
    });
}

/**
 * Places four equal stamps with one guaranteed device pixel of top and bottom
 * padding. The remaining rows never alter the stamps:
 *
 * - first they widen the three internal gaps symmetrically;
 * - an unavoidable lone row goes into the middle gap.
 *
 * The first and last dots therefore remain mirror-aligned inside the box, and
 * every rounding sacrifice happens in whitespace.
 */
function rowOrigins(height: number, diameter: number): readonly number[] {
    const whitespace = Math.max(0, height - diameter * 4);
    const padding = whitespace >= 2 ? 1 : 0;
    const internalWhitespace = Math.max(0, whitespace - padding * 2);
    const baseGap = Math.min(diameter, Math.floor(internalWhitespace / 3));
    const remainder = internalWhitespace - baseGap * 3;
    const gapExtras =
        remainder === 0
            ? ([0, 0, 0] as const)
            : remainder === 1
              ? ([0, 1, 0] as const)
              : remainder === 2
                ? ([1, 0, 1] as const)
                : remainder === 3
                  ? ([1, 1, 1] as const)
                  : ([1, 2, 1] as const);
    const gaps = gapExtras.map((extra) => baseGap + extra);
    return [
        padding,
        padding + diameter + gaps[0]!,
        padding + diameter * 2 + gaps[0]! + gaps[1]!,
        padding + diameter * 3 + gaps[0]! + gaps[1]! + gaps[2]!,
    ];
}

/** Largest stamp that leaves hard one-pixel gaps and a transparent perimeter. */
function dotDiameter(width: number, height: number): number {
    let diameter = Math.min(width, height, Math.max(2, Math.floor(height / 7)));
    while (diameter > 1 && (width < diameter * 2 + 3 || height < diameter * 4 + 5)) {
        diameter -= 1;
    }
    return diameter;
}

/** Two columns with equal integer padding; an odd spare pixel widens the gap. */
function columnOrigins(width: number, diameter: number): readonly [number, number] {
    const whitespace = Math.max(0, width - diameter * 2);
    const baseGap = Math.min(diameter, whitespace);
    const remainder = whitespace - baseGap;
    const padding = Math.floor(remainder / 2);
    const gap = baseGap + modulo(remainder, 2);
    return [padding, padding + diameter + gap];
}

function dotOrigins(width: number, height: number, diameter: number): readonly PixelPoint[] {
    const rows = rowOrigins(height, diameter);
    const columns = columnOrigins(width, diameter);
    return [
        ...rows.map((y) => [columns[0], y] as const),
        ...rows.map((y) => [columns[1], y] as const),
    ];
}

/**
 * Rebuilds the eight stamps for a box of `width` × `height` device pixels. A
 * stamp is a stack of one-device-pixel runs, boxes filled with `currentColor`
 * whose every edge lies on a device-pixel boundary of the box, so they snap
 * to the screen together and each pixel is either wholly inked or empty.
 */
function dotsBuild(
    root: HTMLElement,
    width: number,
    height: number,
    ratio: number,
    startTime: CSSNumberish | null,
): void {
    const document = root.ownerDocument;
    const diameter = dotDiameter(width, height);
    const stamp = dotStamp(diameter);
    const origins = width === 0 || height === 0 ? [] : dotOrigins(width, height, diameter);
    const css = (pixels: number) => `${pixels / ratio}px`;
    const dots = origins.map((origin) => {
        const element = document.createElement("span");
        element.className = "happy-spinner__braille-dot";
        element.style.left = css(origin[0]);
        element.style.top = css(origin[1]);
        element.style.width = css(diameter);
        element.style.height = css(diameter);
        for (let y = 0; y < stamp.length; y += 1) {
            const [start, length] = stamp[y]!;
            if (length === 0) continue;
            const run = document.createElement("span");
            run.className = "happy-spinner__braille-run";
            run.style.left = css(start);
            run.style.top = css(y);
            run.style.width = css(length);
            run.style.height = css(1);
            element.append(run);
        }
        return element;
    });
    root.replaceChildren(...dots);
    for (const [dot, element] of dots.entries()) {
        // A whole cycle early, so every dot is already inside its loop at mount.
        const animation = element.animate(DOT_KEYFRAMES, {
            delay: DOT_PHASES[dot]! * BRAILLE_FRAME_MS - BRAILLE_CYCLE_MS,
            duration: BRAILLE_CYCLE_MS,
            iterations: Infinity,
        });
        // Every rebuild keeps the loop's own start, so a resize never restarts it.
        animation.startTime = startTime;
    }
    dotsPark(root);
}

/**
 * Holds every dot on the spinner's explicit `data-frame`, three quarters into
 * that frame where the fades have settled, or lets them run.
 */
function dotsPark(root: HTMLElement): void {
    const spinner = root.parentElement;
    const frame = Number(spinner?.getAttribute("data-frame"));
    const parked = spinner?.hasAttribute("data-paused") === true && Number.isFinite(frame);
    for (const element of root.children) {
        for (const animation of element.getAnimations()) {
            if (!parked) {
                if (animation.playState === "paused") animation.play();
                continue;
            }
            animation.pause();
            animation.currentTime = (modulo(frame, 8) + 0.75) * BRAILLE_FRAME_MS;
        }
    }
}

/** React 19 callback ref: the stamps follow the box's device-pixel size. */
export function brailleSpinnerAttach(root: HTMLElement | null): (() => void) | undefined {
    if (!root) return undefined;
    const view = root.ownerDocument.defaultView;
    if (!view) return undefined;
    const startTime = root.ownerDocument.timeline.currentTime;
    let width = -1;
    let height = -1;
    let ratio = -1;
    const resize = (nextWidth: number, nextHeight: number) => {
        const nextRatio = view.devicePixelRatio || 1;
        const roundedWidth = Math.max(0, Math.round(nextWidth));
        const roundedHeight = Math.max(0, Math.round(nextHeight));
        if (roundedWidth === width && roundedHeight === height && nextRatio === ratio) return;
        width = roundedWidth;
        height = roundedHeight;
        ratio = nextRatio;
        dotsBuild(root, width, height, ratio, startTime);
    };
    const resizeFromCss = (box: Pick<DOMRectReadOnly, "width" | "height">) => {
        const nextRatio = view.devicePixelRatio || 1;
        resize(box.width * nextRatio, box.height * nextRatio);
    };
    resizeFromCss(root.getBoundingClientRect());
    // The spinner's own attributes park it on a frame or set it running again.
    const parking = new view.MutationObserver(() => dotsPark(root));
    if (root.parentElement) {
        parking.observe(root.parentElement, {
            attributeFilter: ["data-frame", "data-paused"],
            attributes: true,
        });
    }
    if (typeof view.ResizeObserver !== "function") return () => parking.disconnect();
    const observer = new view.ResizeObserver(([entry]) => {
        if (!entry) return;
        const physical = entry.devicePixelContentBoxSize?.[0];
        const reportedAsCssPixels =
            physical !== undefined &&
            Math.abs(view.devicePixelRatio - 1) > 0.01 &&
            Math.abs(physical.inlineSize / entry.contentRect.width - 1) < 0.01 &&
            Math.abs(physical.blockSize / entry.contentRect.height - 1) < 0.01;
        if (physical && !reportedAsCssPixels) {
            resize(physical.inlineSize, physical.blockSize);
        } else {
            resizeFromCss(entry.contentRect);
        }
    });
    try {
        observer.observe(root, { box: "device-pixel-content-box" });
    } catch {
        observer.observe(root);
    }
    return () => {
        parking.disconnect();
        observer.disconnect();
    };
}
