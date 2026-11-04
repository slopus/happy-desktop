import { reducedMotionGet, reducedMotionSubscribe } from "../lottie/dotLottieRuntime";
import {
    AVATAR_SHADER_FRAMES_PER_SECOND,
    AVATAR_SHADER_MAX_PIXELS,
    avatarShaderSpeed,
} from "./avatarShader";
import type {
    AvatarShaderRequest,
    AvatarShaderResponse,
    AvatarShaderTile,
} from "./avatarShaderProtocol";
import AvatarShaderWorker from "./avatarShaderWorker?worker";

/*
 * The one renderer every live placeholder on a page draws with.
 *
 * A browser allows a page about sixteen WebGL contexts and each costs its own
 * buffers and GPU round trips, while a sidebar can show dozens of placeholders
 * at once. So there is one context, in one worker (`avatarShaderWorker.ts`),
 * with the shader compiled once. A pass comes back as one bitmap with every
 * avatar in it, and each avatar is a plain 2D canvas its square is copied
 * into, GPU to GPU. The page's thread only decides what is due and does the
 * copies, so a slow GPU — or none — costs the worker time, never a dropped
 * frame of scrolling or typing.
 *
 * What a frame costs is not its pixels, which are a few dozen squared an
 * avatar, but what the GPU process does per texture: a bitmap per avatar per
 * frame was a texture made, filled and freed for each, and on a Mac that was
 * most of the work. A 2D canvas keeps its own few textures and only draws
 * into them.
 *
 * The clock runs at `AVATAR_SHADER_FRAMES_PER_SECOND`, set by a timer rather
 * than animation frames so the page is not woken at the display's rate, and never
 * more than one pass in flight, so a GPU that cannot keep up draws fewer
 * frames rather than queueing them. Only avatars an IntersectionObserver
 * reports on screen move, at most 32, largest first; nothing runs while the
 * document is hidden or no avatar is visible. Every avatar gets one frame as
 * soon as it mounts, on screen or not, and under reduced motion, on battery,
 * or where the browser draws WebGL in software, that frame — the placeholder
 * at its phase, the still the phone ships — is all it gets.
 * Sizes come from a ResizeObserver, so neither mounting nor scrolling an
 * avatar ever reads layout.
 */

/** Past this many on screen the largest keep moving and the rest hold their last frame. */
const MAX_LIVE = 32;
const FRAME_MS = 1000 / AVATAR_SHADER_FRAMES_PER_SECOND;

/** A document's window, with the constructors it was made with. */
type View = Window & typeof globalThis;

/** The Battery Status API, which TypeScript's DOM library leaves out. */
interface BatteryManager extends EventTarget {
    readonly charging: boolean;
}

interface Entry {
    readonly id: number;
    readonly context: CanvasRenderingContext2D;
    readonly index: number;
    /** When this placeholder first showed; its clock runs from there. */
    readonly started: number;
    /** CSS pixels across, which sets its speed. */
    side: number;
    /** Device pixels across, which it is drawn at. */
    pixels: number;
    visible: boolean;
    /** A frame of this placeholder at its current size is on its canvas, or on its way. */
    drawn: boolean;
    /** The size its last frame was asked for at. */
    asked: number;
}

/** What drawing has cost on this page so far, for the performance gym and the blueprint. */
export interface AvatarShaderRendererStats {
    /** Avatars attached, and those an observer last reported on screen. */
    readonly attached: number;
    readonly visible: number;
    /** Passes the worker drew, and avatar frames across them. */
    readonly passes: number;
    readonly frames: number;
    /** Ticks skipped because the previous pass had not come back. */
    readonly skipped: number;
    /** The page thread's milliseconds: asking for passes and putting their frames up. */
    readonly pageMs: number;
    readonly pageMaxMs: number;
    /** The worker's milliseconds drawing passes, and its slowest. */
    readonly workerMs: number;
    readonly workerMaxMs: number;
    /** False once the worker reported it cannot draw at all. */
    readonly available: boolean;
    /** False where the browser draws WebGL in software, and placeholders hold still. */
    readonly animates: boolean;
}

const STATS_ZERO = {
    passes: 0,
    frames: 0,
    skipped: 0,
    pageMs: 0,
    pageMaxMs: 0,
    workerMs: 0,
    workerMaxMs: 0,
};

class AvatarShaderRenderer {
    readonly #view: View;
    readonly #entries = new Map<HTMLCanvasElement, Entry>();
    readonly #byId = new Map<number, Entry>();
    readonly #intersection: IntersectionObserver | undefined;
    readonly #resize: ResizeObserver | undefined;
    /** Undefined until first needed; null where there is none or it cannot draw. */
    #worker: Worker | null | undefined;
    #inFlight = false;
    #woken = false;
    #nextId = 0;
    #timer: number | undefined;
    #lastTick = 0;
    /** Whether the reader allows motion. */
    #motion = !reducedMotionGet();
    /** Undefined until the browser says, or where it never does: then on power. */
    #battery: BatteryManager | undefined;
    /** Whether the worker's context is fast enough to animate in; assumed until it says. */
    #fast = true;
    #unsubscribeMotion: (() => void) | undefined;
    #stats = { ...STATS_ZERO };

    constructor(view: View) {
        this.#view = view;
        this.#intersection =
            typeof view.IntersectionObserver === "function"
                ? new view.IntersectionObserver((records) => {
                      for (const record of records) {
                          const entry = this.#entries.get(record.target as HTMLCanvasElement);
                          if (entry) entry.visible = record.isIntersecting;
                      }
                      this.#wake();
                  })
                : undefined;
        this.#resize =
            typeof view.ResizeObserver === "function"
                ? new view.ResizeObserver((records) => {
                      for (const record of records) {
                          const entry = this.#entries.get(record.target as HTMLCanvasElement);
                          const box = record.contentBoxSize[0];
                          if (!entry || !box || box.inlineSize <= 0) continue;
                          // The device-pixel box is observed so a move to another
                          // display reports here, but the size is worked out from
                          // the ratio, which an emulated one changes too.
                          const pixels = Math.min(
                              AVATAR_SHADER_MAX_PIXELS,
                              Math.ceil(box.inlineSize * (this.#view.devicePixelRatio || 1)),
                          );
                          entry.side = box.inlineSize;
                          if (pixels !== entry.pixels) {
                              entry.pixels = pixels;
                              entry.drawn = false;
                          }
                      }
                      this.#wake();
                  })
                : undefined;
    }

    attach(canvas: HTMLCanvasElement, index: number, side: number): () => void {
        if (this.#worker === null) return () => {};
        const context = canvas.getContext("2d");
        if (context === null) return () => {};
        if (this.#entries.size === 0) this.#start();
        const entry: Entry = {
            id: this.#nextId++,
            context,
            index,
            started: this.#view.performance.now(),
            side,
            pixels: Math.min(
                AVATAR_SHADER_MAX_PIXELS,
                Math.ceil(side * (this.#view.devicePixelRatio || 1)),
            ),
            // Until an observer says it is on screen; without one, always.
            visible: this.#intersection === undefined,
            drawn: false,
            asked: 0,
        };
        this.#entries.set(canvas, entry);
        this.#byId.set(entry.id, entry);
        this.#intersection?.observe(canvas);
        this.#resize?.observe(canvas, { box: "device-pixel-content-box" });
        this.#wake();
        return () => {
            this.#entries.delete(canvas);
            this.#byId.delete(entry.id);
            this.#intersection?.unobserve(canvas);
            this.#resize?.unobserve(canvas);
            if (this.#entries.size === 0) this.#stop();
        };
    }

    stats(): AvatarShaderRendererStats {
        let visible = 0;
        for (const entry of this.#entries.values()) if (entry.visible) visible += 1;
        return {
            attached: this.#entries.size,
            visible,
            ...this.#stats,
            available: this.#worker !== null,
            animates: this.#animates(),
        };
    }

    statsReset() {
        this.#stats = { ...STATS_ZERO };
    }

    #start() {
        this.#view.document.addEventListener("visibilitychange", this.#visibilityChanged);
        this.#unsubscribeMotion = reducedMotionSubscribe(this.#motionChanged);
        this.#motion = !reducedMotionGet();
        const navigator = this.#view.navigator as Navigator & {
            getBattery?: () => Promise<BatteryManager>;
        };
        if (this.#battery === undefined && typeof navigator.getBattery === "function")
            void navigator.getBattery().then(
                (battery) => {
                    this.#battery = battery;
                    if (this.#entries.size > 0)
                        battery.addEventListener("chargingchange", this.#motionChanged);
                    if (!battery.charging) this.#motionChanged();
                },
                () => {},
            );
        else this.#battery?.addEventListener("chargingchange", this.#motionChanged);
    }

    #stop() {
        this.#view.document.removeEventListener("visibilitychange", this.#visibilityChanged);
        this.#unsubscribeMotion?.();
        this.#unsubscribeMotion = undefined;
        this.#battery?.removeEventListener("chargingchange", this.#motionChanged);
        this.#cancel();
    }

    #cancel() {
        if (this.#timer !== undefined) this.#view.clearTimeout(this.#timer);
        this.#timer = undefined;
    }

    readonly #visibilityChanged = () => {
        if (this.#view.document.hidden) this.#cancel();
        else this.#wake();
    };

    /**
     * Whether placeholders move: the reader allows it, the machine is not on
     * battery, and the GPU is not software.
     */
    #animates(): boolean {
        return this.#motion && (this.#battery?.charging ?? true) && this.#fast;
    }

    /** Motion was allowed or refused: every avatar is drawn again, at its clock or at its still. */
    readonly #motionChanged = () => {
        this.#motion = !reducedMotionGet();
        if (!this.#animates()) this.#cancel();
        for (const entry of this.#entries.values()) entry.drawn = false;
        this.#wake();
    };

    /**
     * Asks for whatever has no frame yet, and keeps the clock running while
     * anything should move. Once a task, so every avatar a render mounts goes
     * in one pass.
     */
    #wake() {
        if (this.#woken) return;
        this.#woken = true;
        queueMicrotask(() => {
            this.#woken = false;
            if (this.#view.document.hidden) return;
            for (const entry of this.#entries.values())
                if (!entry.drawn) {
                    this.#pass(false);
                    break;
                }
            this.#schedule();
        });
    }

    #schedule() {
        if (this.#timer !== undefined || !this.#animates() || this.#view.document.hidden) return;
        let visible = false;
        for (const entry of this.#entries.values())
            if (entry.visible) {
                visible = true;
                break;
            }
        if (!visible) return;
        const wait = Math.max(0, this.#lastTick + FRAME_MS - this.#view.performance.now());
        this.#timer = this.#view.setTimeout(() => {
            this.#timer = undefined;
            this.#pass(true);
            this.#schedule();
        }, wait);
    }

    /** One pass: every avatar without a frame, and on the clock the visible ones that move. */
    #pass(clock: boolean) {
        const now = this.#view.performance.now();
        const moving = clock && this.#animates();
        if (moving) this.#lastTick = now;
        if (this.#inFlight) {
            // The previous pass has not come back: draw fewer frames rather than queue them.
            if (moving) this.#stats.skipped += 1;
            return;
        }
        const due = new Set<Entry>();
        if (moving) {
            const showing: Entry[] = [];
            for (const entry of this.#entries.values()) if (entry.visible) showing.push(entry);
            showing.sort((a, b) => b.pixels - a.pixels);
            for (const entry of showing.slice(0, MAX_LIVE)) due.add(entry);
        }
        for (const entry of this.#entries.values()) if (!entry.drawn) due.add(entry);
        if (due.size === 0) return;
        const worker = this.#workerGet();
        if (worker === null) return;
        const tiles: AvatarShaderTile[] = [...due].map((entry) => {
            entry.drawn = true;
            entry.asked = entry.pixels;
            return {
                id: entry.id,
                index: entry.index,
                pixels: entry.pixels,
                time: this.#animates()
                    ? ((now - entry.started) / 1000) * avatarShaderSpeed(entry.side)
                    : 0,
            };
        });
        this.#inFlight = true;
        worker.postMessage({ kind: "draw", tiles } satisfies AvatarShaderRequest);
        this.#spent(now);
    }

    #workerGet(): Worker | null {
        if (this.#worker !== undefined) return this.#worker;
        if (typeof this.#view.Worker !== "function") return (this.#worker = null);
        const worker = new AvatarShaderWorker();
        worker.addEventListener("message", (event: MessageEvent<AvatarShaderResponse>) =>
            this.#received(event.data),
        );
        worker.addEventListener("error", () => this.#unavailable());
        return (this.#worker = worker);
    }

    #received(response: AvatarShaderResponse) {
        this.#inFlight = false;
        if (response.kind === "unavailable") {
            this.#unavailable();
            return;
        }
        const now = this.#view.performance.now();
        const { bitmap } = response;
        for (const { id, x, y } of response.placements) {
            const entry = this.#byId.get(id);
            // A frame for an avatar that has gone, or changed size since it was asked for, is dropped.
            if (!entry?.drawn || entry.pixels !== entry.asked) continue;
            const canvas = entry.context.canvas;
            if (canvas.width !== entry.pixels) {
                canvas.width = entry.pixels;
                canvas.height = entry.pixels;
            }
            entry.context.drawImage(
                bitmap,
                x,
                y,
                entry.pixels,
                entry.pixels,
                0,
                0,
                entry.pixels,
                entry.pixels,
            );
        }
        bitmap.close();
        // Software WebGL: each avatar keeps the frame it has, and the clock stops.
        if (!response.animates && this.#fast) {
            this.#fast = false;
            this.#cancel();
        }
        this.#stats.passes += 1;
        this.#stats.frames += response.placements.length;
        this.#stats.workerMs += response.ms;
        this.#stats.workerMaxMs = Math.max(this.#stats.workerMaxMs, response.ms);
        this.#spent(now);
        // Anything that came due while this pass was out goes now rather than on the next tick.
        this.#wake();
    }

    /** No WebGL2 in the worker: every placeholder keeps its gradient, and nothing is asked again. */
    #unavailable() {
        this.#worker?.terminate();
        this.#worker = null;
        this.#inFlight = false;
        this.#cancel();
    }

    #spent(since: number) {
        const spent = this.#view.performance.now() - since;
        this.#stats.pageMs += spent;
        this.#stats.pageMaxMs = Math.max(this.#stats.pageMaxMs, spent);
    }
}

const renderers = new WeakMap<View, AvatarShaderRenderer>();

function rendererOf(view: View): AvatarShaderRenderer {
    let renderer = renderers.get(view);
    if (!renderer) {
        renderer = new AvatarShaderRenderer(view);
        renderers.set(view, renderer);
    }
    return renderer;
}

/**
 * Puts placeholder `index` on `canvas`, live, until the returned function is
 * called. `side` is the avatar's CSS size, used until the canvas is measured.
 */
export function avatarShaderAttach(
    canvas: HTMLCanvasElement,
    index: number,
    side: number,
): () => void {
    const view = canvas.ownerDocument.defaultView;
    if (view === null) return () => {};
    return rendererOf(view).attach(canvas, index, side);
}

/** What the page's renderer has drawn so far, and optionally starts counting again. */
export function avatarShaderRendererStats(
    view: View = globalThis.window,
    reset = false,
): AvatarShaderRendererStats {
    const renderer = rendererOf(view);
    const stats = renderer.stats();
    if (reset) renderer.statsReset();
    return stats;
}
