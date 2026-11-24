/** The agent's received audio as three bands (low, mid, high), each 0..1. */
export type GptLiveCallLevels = readonly [low: number, mid: number, high: number];

/* The bars' box is 16px tall (gpt-live-call-bar.css draws three 3px bars 2px apart). */
const BOX = 16;
/* At rest a bar is a short pill, not a dot, so the three never read as an ellipsis. */
const REST = 6;
/* A bar rises in about 40ms and falls back over about 160ms. */
const ATTACK = 0.04;
const DECAY = 0.16;
/*
 * The analyser's bands are on its decibel scale (0 is -100 dB, 1 is -30 dB).
 * Speech spans about 0.45–1 in the low band, 0.3–0.9 in the mid and 0.2–0.75
 * in the high one (measured from recorded speech through the same analyser),
 * so each band is stretched over its own span and the line's hiss below it is
 * rest.
 */
const FLOOR = [0.45, 0.3, 0.2] as const;
const CEILING = [1, 0.9, 0.75] as const;
/* The middle bar is the loudest band, so the three read as one centred shape. */
const ORDER = [1, 0, 2] as const;
const SETTLED = 0.002;
/*
 * The bars move 30 times a second, and look for the voice 15 times a second
 * while they rest. A display-rate loop would have the window composite a new
 * frame on every refresh (120 a second on a ProMotion display) for three
 * pills a few pixels tall.
 */
const MOVING_MS = 1000 / 30;
const RESTING_MS = 1000 / 15;

/** How far each half of a bar's pill slides in from the bar's ends, for a height. */
function inset(height: number): string {
    return `${String((BOX - height) / 2)}px`;
}

/** The transforms that put a bar at rest; a fixture renders them as they are. */
export const GPT_LIVE_CALL_BAR_REST = {
    top: `translateY(${inset(REST)})`,
    bottom: `translateY(-${inset(REST)})`,
} as const;

/**
 * Moves the call bar's three bars with the level `read` reports. A bar is two
 * halves, each a whole 3 × 16 pill clipped to its half of the bar and slid in
 * from its end, so a bar of any height keeps its round caps while only
 * `transform` changes: the compositor moves them, with no layout and no
 * paint. Each step reads the bands once and eases every bar toward its band
 * with a fast attack and a slower decay, and writes only a bar that moved, so
 * a silent call costs one level read per step and nothing else. Nothing runs
 * while the bars are off screen or the document is hidden: the timer stops and
 * the level is not read until they are seen again. Returns the cleanup.
 */
export function gptLiveCallBarsRun(bars: HTMLElement, read: () => GptLiveCallLevels): () => void {
    const pills = [...bars.querySelectorAll<HTMLElement>("[data-pill]")];
    if (pills.length !== 6) return () => {};
    const heights = [0, 0, 0];
    const drawn = [-1, -1, -1];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: number | undefined;
    const step = () => {
        const now = performance.now();
        const first = last === undefined;
        const seconds = first ? 0 : Math.min(0.2, (now - last!) / 1000);
        last = now;
        const levels = read();
        let resting = true;
        for (let bar = 0; bar < 3; bar++) {
            const band = ORDER[bar]!;
            const span = CEILING[band] - FLOOR[band];
            const target = Math.min(1, Math.max(0, (levels[band] - FLOOR[band]) / span));
            const current = heights[bar]!;
            const time = target > current ? ATTACK : DECAY;
            // The first step on screen shows the level as it is, not a rise to it.
            heights[bar] = first
                ? target
                : current + (target - current) * (1 - Math.exp(-seconds / time));
            if (heights[bar]! < SETTLED) heights[bar] = 0;
            if (heights[bar]! > 0 || target > 0) resting = false;
            // Half pixels, whole device pixels at 2x, keep the caps crisp as they
            // slide, and a bar is written only when it lands on another one.
            const offset = Math.round((BOX - REST) * (1 - heights[bar]!)) / 2;
            if (offset === drawn[bar]) continue;
            drawn[bar] = offset;
            pills[bar * 2]!.style.transform = `translateY(${String(offset)}px)`;
            pills[bar * 2 + 1]!.style.transform = `translateY(${String(-offset)}px)`;
        }
        timer = setTimeout(step, resting ? RESTING_MS : MOVING_MS);
    };
    // On screen: the document is shown and the bars are not hidden, scrolled
    // off, or in a collapsed column. Off screen there is no step and no read.
    let intersecting = false;
    const update = () => {
        const shown = intersecting && document.visibilityState === "visible";
        if (shown && timer === undefined) {
            last = undefined;
            step();
        } else if (!shown && timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    };
    const observer = new IntersectionObserver((entries) => {
        intersecting = entries.at(-1)?.isIntersecting ?? intersecting;
        update();
    });
    observer.observe(bars);
    document.addEventListener("visibilitychange", update);
    return () => {
        observer.disconnect();
        document.removeEventListener("visibilitychange", update);
        intersecting = false;
        update();
    };
}

/** `mm:ss`, or `h:mm:ss` from the first hour. */
export function gptLiveCallDurationFormat(milliseconds: number): string {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const seconds = String(total % 60).padStart(2, "0");
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    return hours > 0
        ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${seconds}`
        : `${String(minutes).padStart(2, "0")}:${seconds}`;
}

/**
 * Keeps `node`'s text at the call's length, turning over on each whole second
 * since `since`. The text is the only thing written, so no render happens.
 * A hidden document keeps no timer; the text catches up when it is shown.
 */
export function gptLiveCallClockRun(
    node: HTMLElement,
    since: number,
    clock: () => number,
): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };
    const update = () => {
        stop();
        const elapsed = clock() - since;
        node.textContent = gptLiveCallDurationFormat(elapsed);
        if (document.visibilityState === "visible")
            timer = setTimeout(update, 1000 - (((elapsed % 1000) + 1000) % 1000) + 5);
    };
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
        document.removeEventListener("visibilitychange", update);
        stop();
    };
}
