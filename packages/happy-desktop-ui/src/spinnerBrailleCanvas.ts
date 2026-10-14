/*
 * Device-pixel renderer for cli-spinners' `dots2` Braille loop.
 *
 * A 14px loader is only 28 physical pixels tall on the Retina surface it is
 * designed for. Drawing each of its eight dots as an independently
 * antialiased CSS circle makes the weak edge pixels disappear at a different
 * rate as opacity changes, so dots with the same CSS dimensions appear to
 * change size. This renderer owns the final pixel grid instead: it chooses one
 * binary dot stamp for the canvas's actual physical height and copies that
 * exact stamp eight times at integer coordinates. At least one transparent
 * device pixel stays between every dot and the canvas edge, so a fractionally
 * positioned canvas cannot lend its antialiased clipping edge to a dot.
 *
 * Animation is equally singular. Every dot evaluates `dotOpacity` with the
 * same local time; the only difference is its 100ms phase. That reproduces the
 * existing 800ms waveform exactly — 60ms down, 40ms held dim, 60ms up — while
 * making it impossible for one dot to acquire a different transition program.
 *
 * All mounted canvases in one window share one clock. It follows the display
 * refresh while the window is visible, so the fades are as smooth as the panel
 * allows, and stops while the window is hidden or minimized. What it does not
 * do is repaint for nothing: on a 240Hz panel a spinner that redraws every
 * vsync whether or not it is seen keeps the desktop compositor busy for every
 * other application on Windows. A canvas that is scrolled away, or whose pixels
 * would not change, is not repainted at all.
 */

const BRAILLE_FRAME_COUNT = 8;
const BRAILLE_FRAME_MS = 100;
const BRAILLE_CYCLE_MS = BRAILLE_FRAME_COUNT * BRAILLE_FRAME_MS;
const BRAILLE_FADE_MS = 60;
const BRAILLE_DIM_OPACITY = 0.18;
/** Where a parked frame samples its cell: past every fade. */
const BRAILLE_PARKED_OFFSET = 0.75;

/* DOM order is left column top-to-bottom, then right column top-to-bottom.
 * dots2 dims dot1, dot2, dot3, dot7, dot8, dot6, dot5, then dot4. */
const DOT_PHASES = [0, 1, 2, 3, 7, 6, 5, 4] as const;

type PixelPoint = readonly [x: number, y: number];
type PixelSpan = readonly [start: number, length: number];

interface BrailleRenderer {
    draw(now: number): void;
}

interface BrailleClock {
    readonly renderers: Set<BrailleRenderer>;
    frame: number | undefined;
    releaseVisibility: (() => void) | undefined;
}

const clocks = new WeakMap<Window, BrailleClock>();

function modulo(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}

/** The one opacity waveform every dot runs, sampled at its phase-local time. */
function dotOpacity(localTime: number): number {
    const time = modulo(localTime, BRAILLE_CYCLE_MS);
    if (time < BRAILLE_FADE_MS) {
        return 1 - (1 - BRAILLE_DIM_OPACITY) * (time / BRAILLE_FADE_MS);
    }
    if (time < BRAILLE_FRAME_MS) return BRAILLE_DIM_OPACITY;
    if (time < BRAILLE_FRAME_MS + BRAILLE_FADE_MS) {
        return (
            BRAILLE_DIM_OPACITY +
            (1 - BRAILLE_DIM_OPACITY) * ((time - BRAILLE_FRAME_MS) / BRAILLE_FADE_MS)
        );
    }
    return 1;
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

function clockFor(view: Window): BrailleClock {
    const current = clocks.get(view);
    if (current) return current;
    const created: BrailleClock = {
        renderers: new Set(),
        frame: undefined,
        releaseVisibility: undefined,
    };
    clocks.set(view, created);
    return created;
}

function clockStop(view: Window, clock: BrailleClock): void {
    if (clock.frame === undefined) return;
    view.cancelAnimationFrame(clock.frame);
    clock.frame = undefined;
}

function clockTick(view: Window, clock: BrailleClock): void {
    clock.frame = undefined;
    if (clock.renderers.size === 0) return;
    // A hidden window draws nothing; the visibility change that shows it again
    // restarts the clock.
    if (view.document.hidden || typeof view.requestAnimationFrame !== "function") return;
    const now = view.performance.now();
    for (const renderer of clock.renderers) renderer.draw(now);
    clock.frame = view.requestAnimationFrame(() => clockTick(view, clock));
}

function clockAdd(view: Window, renderer: BrailleRenderer): () => void {
    const clock = clockFor(view);
    clock.renderers.add(renderer);
    if (!clock.releaseVisibility) {
        const restart = (): void => {
            clockStop(view, clock);
            clockTick(view, clock);
        };
        view.document.addEventListener("visibilitychange", restart);
        clock.releaseVisibility = () =>
            view.document.removeEventListener("visibilitychange", restart);
    }
    if (clock.frame === undefined) clockTick(view, clock);
    return () => {
        clock.renderers.delete(renderer);
        if (clock.renderers.size !== 0) return;
        clockStop(view, clock);
        clock.releaseVisibility?.();
        clock.releaseVisibility = undefined;
    };
}

class BrailleCanvasRenderer implements BrailleRenderer {
    readonly #canvas: HTMLCanvasElement;
    readonly #context: CanvasRenderingContext2D;
    readonly #root: HTMLElement;
    readonly #view: Window;
    readonly #startedAt: number;
    readonly #releaseClock: () => void;
    #observer: ResizeObserver | undefined;
    #visibility: IntersectionObserver | undefined;
    #visible = true;
    /** What the bitmap currently shows, so an identical frame is not repainted. */
    #drawn: string | undefined;
    #width = 0;
    #height = 0;

    constructor(canvas: HTMLCanvasElement) {
        const context = canvas.getContext("2d");
        const root = canvas.parentElement;
        const view = canvas.ownerDocument.defaultView;
        if (!context || !root || !view) {
            throw new Error("Braille spinner requires a mounted 2D window canvas");
        }

        this.#canvas = canvas;
        this.#context = context;
        this.#root = root;
        this.#view = view;
        this.#startedAt = view.performance.now();
        this.#resizeFromCss(root.getBoundingClientRect());

        if (typeof view.ResizeObserver === "function") {
            this.#observer = new view.ResizeObserver(([entry]) => {
                if (!entry) return;
                const physical = entry.devicePixelContentBoxSize?.[0];
                const reportedAsCssPixels =
                    physical !== undefined &&
                    Math.abs(this.#view.devicePixelRatio - 1) > 0.01 &&
                    Math.abs(physical.inlineSize / entry.contentRect.width - 1) < 0.01 &&
                    Math.abs(physical.blockSize / entry.contentRect.height - 1) < 0.01;
                if (physical && !reportedAsCssPixels) {
                    this.#resize(physical.inlineSize, physical.blockSize);
                } else {
                    this.#resizeFromCss(entry.contentRect);
                }
                this.#drawNow();
            });
            try {
                this.#observer.observe(root, { box: "device-pixel-content-box" });
            } catch {
                this.#observer.observe(root);
            }
        }

        // A spinner scrolled out of a long sidebar, or inside a hidden panel,
        // keeps its place on the clock but paints nothing until it is seen.
        if (typeof view.IntersectionObserver === "function") {
            this.#visibility = new view.IntersectionObserver((entries) => {
                const entry = entries[entries.length - 1];
                if (!entry) return;
                this.#visible = entry.isIntersecting;
                if (this.#visible) this.#drawNow();
            });
            this.#visibility.observe(canvas);
        }

        this.#releaseClock = clockAdd(view, this);
        this.#drawNow();
    }

    destroy(): void {
        this.#observer?.disconnect();
        this.#visibility?.disconnect();
        this.#releaseClock();
    }

    draw(now: number): void {
        if (!this.#visible || this.#width === 0 || this.#height === 0) return;
        const parked = this.#root.hasAttribute("data-paused");
        const parkedFrame = Number(this.#root.getAttribute("data-frame"));
        const elapsed =
            parked && Number.isFinite(parkedFrame)
                ? (modulo(parkedFrame, BRAILLE_FRAME_COUNT) + BRAILLE_PARKED_OFFSET) *
                  BRAILLE_FRAME_MS
                : now - this.#startedAt;

        const opacities = DOT_PHASES.map((phase) => dotOpacity(elapsed - phase * BRAILLE_FRAME_MS));
        const color = this.#view.getComputedStyle(this.#canvas).color;
        const drawn = `${this.#width}x${this.#height} ${color} ${opacities
            .map((opacity) => opacity.toFixed(3))
            .join(",")}`;
        if (drawn === this.#drawn) return;
        this.#drawn = drawn;

        const diameter = dotDiameter(this.#width, this.#height);
        const stamp = dotStamp(diameter);
        const origins = dotOrigins(this.#width, this.#height, diameter);

        this.#context.clearRect(0, 0, this.#width, this.#height);
        this.#context.fillStyle = color;
        for (let dot = 0; dot < origins.length; dot += 1) {
            const origin = origins[dot]!;
            this.#context.globalAlpha = opacities[dot]!;
            for (let y = 0; y < stamp.length; y += 1) {
                const [start, length] = stamp[y]!;
                if (length === 0) continue;
                this.#context.fillRect(origin[0] + start, origin[1] + y, length, 1);
            }
        }
        this.#context.globalAlpha = 1;
    }

    #drawNow(): void {
        this.draw(this.#view.performance.now());
    }

    #resizeFromCss(box: Pick<DOMRectReadOnly, "width" | "height">): void {
        const ratio = this.#view?.devicePixelRatio || 1;
        this.#resize(box.width * ratio, box.height * ratio);
    }

    #resize(width: number, height: number): void {
        const nextWidth = Math.max(0, Math.round(width));
        const nextHeight = Math.max(0, Math.round(height));
        if (nextWidth === this.#width && nextHeight === this.#height) return;
        this.#width = nextWidth;
        this.#height = nextHeight;
        // Resizing clears the bitmap, so the next frame must paint whatever it is.
        this.#drawn = undefined;
        this.#canvas.width = nextWidth;
        this.#canvas.height = nextHeight;
        this.#context.imageSmoothingEnabled = false;
    }
}

/** React 19 callback ref: the renderer's lifetime is exactly the canvas's. */
export function brailleSpinnerCanvasAttach(
    canvas: HTMLCanvasElement | null,
): (() => void) | undefined {
    if (!canvas) return undefined;
    const renderer = new BrailleCanvasRenderer(canvas);
    return () => renderer.destroy();
}
