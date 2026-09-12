import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import {
    cameraCrop,
    cameraRest,
    deviceScaleFactor,
    maximumZoom,
    sceneRectangle,
} from "./scene.mjs";

/*
 * The clock a demo is written against.
 *
 * One continuous wall-time pump samples the compositor at the output cadence.
 * It stays running between choreography calls, including while the scenario
 * awaits real daemon work. Page animations, timers, and inference all keep
 * their native clocks; no slow screenshot loop can compress a live response.
 */

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutQuint = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

/** Deterministic jitter, so a demo recorded twice is the same demo twice. */
function randomSequence(seed) {
    let value = 0;
    for (const character of seed) value = (value * 31 + character.charCodeAt(0)) >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

/** macOS key caps for a Playwright chord, for the badge the video shows. */
function keyCaps(chord) {
    const names = {
        alt: "⌥",
        arrowdown: "↓",
        arrowleft: "←",
        arrowright: "→",
        arrowup: "↑",
        backspace: "⌫",
        control: "⌃",
        enter: "↩",
        escape: "esc",
        meta: "⌘",
        shift: "⇧",
        tab: "⇥",
    };
    return chord.split("+").map((part) => names[part.toLowerCase()] ?? part.toUpperCase());
}

export class Director {
    #page;
    #sink;
    #fps;
    #random;
    #camera = cameraRest();
    #pointer = { x: 0, y: 0, press: 0, visible: false };
    #caption;
    #keysLife = 0;
    #sounds = [];
    #sticker;
    #card;
    #liveWaits = [];
    #typingSpeed = 1;
    #recording = false;
    #pump;
    #startedAt;
    #finishedAt;
    #motion;
    #error;
    #maxFrameLatenessMs = 0;

    constructor(options) {
        this.#page = options.page;
        this.#sink = options.sink;
        this.#fps = options.fps;
        this.#random = randomSequence(options.seed);
        this.#pointer.x = options.viewport.width * 0.5;
        this.#pointer.y = options.viewport.height * 0.62;
    }

    get page() {
        return this.#page;
    }

    /** Every sound cue the take asked for, as `{ frame, sound }`. */
    get sounds() {
        return this.#sounds;
    }

    /** Evidence for the take's real-time waits, used by the demo assertion. */
    get timing() {
        return {
            fps: this.#fps,
            frames: this.#sink.frames.length,
            liveWaits: this.#liveWaits.map((wait) => ({ ...wait })),
            wallMs:
                this.#startedAt === undefined
                    ? 0
                    : (this.#finishedAt ?? performance.now()) - this.#startedAt,
            maxFrameLatenessMs: this.#maxFrameLatenessMs,
            sourceFrames: new Set(this.#sink.frames.map((frame) => frame.sourceFrame)).size,
        };
    }

    /** Measures real compositor delivery over a selected part of the take. */
    captureSummary(from, to = this.#sink.frames.length) {
        const frames = this.#sink.frames.slice(from, to);
        const freshFrames = new Set(frames.map((frame) => frame.sourceFrame)).size;
        const ages = frames.map((frame) => frame.sourceAgeMs).sort((a, b) => a - b);
        let repeated = 0;
        let maxRepeatedFrames = 0;
        let previous;
        for (const frame of frames) {
            repeated = frame.sourceFrame === previous ? repeated + 1 : 1;
            maxRepeatedFrames = Math.max(maxRepeatedFrames, repeated);
            previous = frame.sourceFrame;
        }
        return {
            frames: frames.length,
            freshFrames,
            freshFramesPerSecond: (freshFrames / Math.max(1, frames.length)) * this.#fps,
            maxRepeatedFrames,
            frameAgeP95Ms: ages[Math.floor(ages.length * 0.95)] ?? 0,
            speedBadgeFrames: frames.filter((frame) => frame.typingSpeed === 3).length,
        };
    }

    /** Milliseconds one frame is worth. */
    get #step() {
        return 1000 / this.#fps;
    }

    // ---------------------------------------------------------------- frames

    /** Poses the recorder overlay without replacing the page's animation clock. */
    async #frame(at) {
        const step = this.#step;
        await this.#page.evaluate(
            ([x, y, press, visible, rippleStep, keys, tick]) => {
                const demo = window.__happyDemo;
                demo.pointer(x, y, press, visible);
                demo.rippleStep(rippleStep);
                if (keys >= 0) demo.keysFade(keys);
                demo.clockLiveTick(tick);
            },
            [
                this.#pointer.x,
                this.#pointer.y,
                this.#pointer.press,
                this.#pointer.visible,
                step / 460,
                this.#keysBadge(step),
                step,
            ],
        );
        await this.#captureCurrent({ at });
    }

    /** Captures the current page pose with the director's current framing. */
    async #captureCurrent(options = {}) {
        await this.#sink.capture(
            {
                camera: cameraCrop(this.#camera),
                ...(this.#caption ? { caption: this.#caption } : {}),
                ...(this.#card ? { card: this.#card } : {}),
                ...(this.#typingSpeed === 3 ? { typingSpeed: 3 } : {}),
                ...this.#stickerPose(this.#step),
            },
            options,
        );
    }

    /** Runs independently of scenario actions, so API awaits remain on film. */
    async #recordLoop() {
        while (this.#recording) {
            const at = this.#startedAt + this.#sink.frames.length * this.#step;
            const remaining = at - performance.now();
            if (remaining > 0) await delay(remaining);
            if (!this.#recording) break;
            this.#maxFrameLatenessMs = Math.max(this.#maxFrameLatenessMs, performance.now() - at);
            const motion = this.#motion;
            const progress =
                motion === undefined
                    ? 0
                    : Math.min(
                          1,
                          Math.max(0, (at - motion.startedAt) / Math.max(1, motion.duration)),
                      );
            if (motion?.apply) await motion.apply(progress);
            await this.#frame(at);
            if (motion && progress >= 1 && this.#motion === motion) {
                this.#motion = undefined;
                motion.resolve();
            }
        }
    }

    /** Freezes the final timeline before its assertions and composition. */
    async finish() {
        this.#recording = false;
        await this.#pump;
        if (this.#startedAt !== undefined) this.#finishedAt ??= performance.now();
        if (this.#error) throw this.#error;
    }

    async #liveWait(target, options = {}) {
        const startedAt = performance.now();
        const firstFrame = this.#sink.frames.length;
        if (target !== undefined) {
            await this.#locator(target).waitFor({
                state: "visible",
                timeout: options.timeout ?? 30_000,
            });
        }
        await this.hold(options.after ?? 500);
        this.#liveWaits.push({
            frames: this.#sink.frames.length - firstFrame,
            wallMs: performance.now() - startedAt,
        });
    }

    /** The sticker's pose for this frame, aged by one step. */
    #stickerPose(step) {
        const sticker = this.#sticker;
        if (!sticker) return {};
        const t = sticker.age;
        sticker.age += step;
        if (sticker.age >= sticker.duration) this.#sticker = undefined;
        // Pop in with an overshoot, wave while alive, slip away at the end.
        const backOut = (value) => {
            const c = 1.70158 * 1.2;
            return 1 + (c + 1) * (value - 1) ** 3 + c * (value - 1) ** 2;
        };
        const arrival = Math.min(1, t / 280);
        const leaving = Math.max(0, (t - (sticker.duration - 240)) / 240);
        const scale = backOut(arrival) * (1 - 0.18 * leaving);
        const wave = Math.sin((t / 1000) * Math.PI * 2 * 1.4) * 6 * (1 - leaving);
        return {
            sticker: {
                name: sticker.name,
                x: sticker.x,
                y: sticker.y,
                size: Math.max(1, Math.round(sticker.size * scale)),
                rotation: wave,
                opacity: Math.min(1, arrival * 1.6) * (1 - leaving),
            },
        };
    }

    /** Key caps hold at full strength, then fade; -1 means leave the badge alone. */
    #keysBadge(step) {
        if (this.#keysLife <= 0) return -1;
        this.#keysLife = Math.max(0, this.#keysLife - step);
        if (this.#keysLife > 420) return 1;
        return easeOutCubic(this.#keysLife / 420);
    }

    /** Animates for a real duration on the same continuous capture timeline. */
    async #render(durationMs, onFrame) {
        if (this.#error) throw this.#error;
        if (this.#motion) throw new Error("Demo camera/pointer motions must be sequential.");
        if (this.#pump && !this.#recording) throw new Error("The demo take has already finished.");
        await new Promise((resolve, reject) => {
            this.#motion = {
                startedAt: performance.now(),
                duration: durationMs,
                apply: onFrame,
                resolve,
                reject,
            };
            if (this.#pump) return;
            this.#startedAt = performance.now();
            this.#recording = true;
            this.#pump = this.#recordLoop().catch((error) => {
                this.#error = error;
                this.#recording = false;
                this.#motion?.reject(error);
                this.#motion = undefined;
            });
        });
    }

    // ---------------------------------------------------------------- camera

    /**
     * Keeps the pointer inside the shot while the camera is close.
     *
     * A zoomed camera that ignores the pointer loses it off the edge; one that
     * tracks it exactly swims. This does neither: the camera is still until the
     * pointer leaves a generous inner box, then follows only far enough to put
     * it back on the edge of that box, eased so the correction is never abrupt.
     */
    #follow() {
        if (this.#camera.level <= 1.01) return;
        const crop = cameraCrop(this.#camera);
        const point = {
            x: this.#pointer.x * deviceScaleFactor + 100,
            y: this.#pointer.y * deviceScaleFactor + 100,
        };
        const slack = { x: (crop.width * 0.62) / 2, y: (crop.height * 0.62) / 2 };
        const drift = { x: point.x - this.#camera.x, y: point.y - this.#camera.y };
        const correct = (value, limit) =>
            value > limit ? value - limit : value < -limit ? value + limit : 0;
        this.#camera.x += correct(drift.x, slack.x) * 0.14;
        this.#camera.y += correct(drift.y, slack.y) * 0.14;
    }

    /**
     * Eases the camera onto a region.
     *
     * With no level, one is chosen so the region fills a comfortable share of
     * the shot rather than butting against its edges, and it is never pushed
     * past the point where the scene stops having real pixels to show.
     */
    async zoomTo(target, options = {}) {
        const rectangle = sceneRectangle(await this.#rectangle(target));
        const level =
            options.level ??
            Math.min(
                maximumZoom,
                Math.max(
                    1.12,
                    Math.min(
                        (3200 * 0.74) / Math.max(rectangle.width, 320),
                        (1800 * 0.7) / Math.max(rectangle.height, 180),
                    ),
                ),
            );
        await this.#camera_to(
            {
                level,
                x: rectangle.x + rectangle.width / 2,
                y: rectangle.y + rectangle.height / 2,
            },
            options.duration ?? 760,
        );
    }

    /** Eases the camera back to the whole scene. */
    async zoomOut(options = {}) {
        await this.#camera_to(cameraRest(), options.duration ?? 620);
    }

    async #camera_to(to, durationMs) {
        const from = { ...this.#camera };
        await this.#render(durationMs, (progress) => {
            const eased = easeInOutQuint(progress);
            this.#camera = {
                level: from.level + (to.level - from.level) * eased,
                x: from.x + (to.x - from.x) * eased,
                y: from.y + (to.y - from.y) * eased,
            };
        });
    }

    // --------------------------------------------------------------- pointer

    /**
     * Glides the pointer onto a target.
     *
     * The path bows rather than running straight, because a straight line
     * between two points is the one thing a hand never draws, and the duration
     * grows with distance so a long reach does not snap. The real mouse is
     * moved along with the drawn one, so hover states light up under it exactly
     * as they would for a person.
     */
    async moveTo(target, options = {}) {
        const point = await this.#point(target);
        const from = { ...this.#pointer };
        const distance = Math.hypot(point.x - from.x, point.y - from.y);
        if (distance < 1.5) return point;
        const duration = options.duration ?? Math.min(940, 300 + distance * 0.52);
        // Bow the path perpendicular to the travel, to whichever side keeps the
        // arc away from the shorter axis of the move.
        const bow = Math.min(distance * 0.16, 90) * (from.x < point.x ? -1 : 1);
        const normal = { x: -(point.y - from.y) / distance, y: (point.x - from.x) / distance };
        await this.#render(duration, async (progress) => {
            const eased = easeInOutCubic(progress);
            const arc = Math.sin(progress * Math.PI) * bow;
            this.#pointer.visible = true;
            this.#pointer.x = from.x + (point.x - from.x) * eased + normal.x * arc;
            this.#pointer.y = from.y + (point.y - from.y) * eased + normal.y * arc;
            this.#follow();
            await this.#page.mouse.move(this.#pointer.x, this.#pointer.y);
        });
        return point;
    }

    /** Glides onto a target, presses it, and lets the ripple play out. */
    async click(target, options = {}) {
        const point = await this.moveTo(target, options);
        await this.#render(90, (progress) => {
            this.#pointer.press = progress;
        });
        await this.#page.mouse.down();
        this.#sounds.push({ frame: this.#sink.frames.length, sound: "click" });
        await this.#page.evaluate(
            ([x, y]) => window.__happyDemo.ripple(x, y),
            [this.#pointer.x, this.#pointer.y],
        );
        await this.#page.mouse.up();
        await this.#render(130, (progress) => {
            this.#pointer.press = 1 - progress;
        });
        await this.hold(options.after ?? 320);
        return point;
    }

    /** Clicks whatever carries this visible text. */
    async clickText(text, options = {}) {
        return this.click({ text }, options);
    }

    /** Wheels a scrollable region, in CSS pixels, over a duration. */
    async scroll(target, by, options = {}) {
        await this.moveTo(target);
        const duration = options.duration ?? Math.min(1400, 380 + Math.abs(by) * 0.9);
        let sent = 0;
        await this.#render(duration, async (progress) => {
            const want = Math.round(by * easeInOutCubic(progress));
            if (want === sent) return;
            await this.#page.mouse.wheel(0, want - sent);
            sent = want;
        });
        await this.hold(options.after ?? 260);
    }

    // -------------------------------------------------------------- keyboard

    /**
     * Types at a human cadence.
     *
     * The gaps are jittered from the demo's own seed rather than a real random
     * source, so the rhythm looks typed but a re-recording is identical.
     */
    async type(text, options = {}) {
        const speed = options.speed ?? 1;
        if (speed !== 1 && speed !== 3) throw new Error("Typing speed must be 1 or 3.");
        if (!this.#pump) await this.#render(0);
        const base = (options.perKey ?? 96) / speed;
        this.#typingSpeed = speed;
        let nextAt = performance.now();
        let ordinaryKey = 0;
        let spaceKey = 0;
        try {
            for (const character of text) {
                if (this.#error) throw this.#error;
                await this.#page.keyboard.type(character);
                const sound =
                    character === " "
                        ? `space-${String((spaceKey++ % 2) + 1).padStart(3, "0")}`
                        : `key-${String((ordinaryKey++ % 29) + 1).padStart(3, "0")}`;
                this.#sounds.push({
                    frame: this.#sink.frames.length,
                    sound,
                });
                const rhythm = base * (0.72 + this.#random() * 0.66);
                const pause =
                    character === "\n"
                        ? base * 3.4
                        : /[.!?]/u.test(character)
                          ? base * 2.8
                          : /[,;:]/u.test(character)
                            ? base * 2
                            : character === " "
                              ? base * 1.25
                              : rhythm;
                nextAt += pause;
                const remaining = nextAt - performance.now();
                if (remaining > 0) await delay(remaining);
            }
        } finally {
            this.#typingSpeed = 1;
        }
        await this.hold(options.after ?? 340);
    }

    /** Sends a keyboard chord and shows it as key caps while it lands. */
    async press(chord, options = {}) {
        const caps = keyCaps(chord);
        await this.#page.evaluate((value) => window.__happyDemo.keys(value), caps);
        this.#keysLife = options.badge ?? 1100;
        await this.hold(options.before ?? 220);
        this.#sounds.push({
            frame: this.#sink.frames.length,
            sound: chord.toLowerCase() === "enter" ? "enter" : "key-001",
        });
        await this.#page.keyboard.press(chord);
        await this.hold(options.after ?? 620);
    }

    /** Plays a named cue from the palette at the current frame. */
    sound(name) {
        this.#sounds.push({ frame: this.#sink.frames.length, sound: name });
    }

    /**
     * Publishes a scripted local-daemon snapshot into the app's real daemon
     * store. Spends no frames: the surfaces that react to it are shot by
     * whatever the demo does next.
     */
    async daemonPublish(snapshot) {
        await this.#page.evaluate((value) => window.__happyDemoDaemon.publish(value), snapshot);
    }

    /**
     * Pops an animated sticker beside a target and lets it live for a couple
     * of seconds while the demo carries on. The sticker rides the app content,
     * so the camera treats it like anything else on screen.
     */
    async sticker(name, target, options = {}) {
        const rectangle = sceneRectangle(await this.#rectangle(target));
        const offset = options.offset ?? { x: 1.02, y: -0.12 };
        this.#sticker = {
            age: 0,
            duration: options.duration ?? 2200,
            name,
            size: options.size ?? 300,
            x: rectangle.x + rectangle.width * offset.x,
            y: rectangle.y + rectangle.height * offset.y,
        };
    }

    // ----------------------------------------------------------------- shots

    /** Holds the shot, letting the app's own motion play. */
    async hold(durationMs) {
        await this.#render(durationMs);
    }

    /** Shows a full-frame title card, with no app content visible in the shot. */
    async card(text, options = {}) {
        this.#card = text;
        if (options.hold) await this.hold(options.hold);
    }

    /** Shows a caption under the shot. It stays until the next one, or `undefined` clears it. */
    async caption(text, options = {}) {
        this.#caption = text;
        if (options.hold) await this.hold(options.hold);
    }

    /** Preparation waits are off camera; all waits after the first shot stay live. */
    async settle(selector, options = {}) {
        // Before the first shot, waits are genuinely off camera. From the
        // first shot onward, every wait is filmed at wall-clock speed.
        if (this.#sink.frames.length === 0) {
            if (selector)
                await this.#page.waitForSelector(selector, { timeout: options.timeout ?? 30_000 });
            await this.#page.waitForTimeout(options.after ?? 500);
            return;
        }
        await this.#liveWait(selector, options);
    }

    /** Brings the pointer on or off screen without moving it. */
    async pointerVisible(visible) {
        this.#pointer.visible = visible;
    }

    // ---------------------------------------------------------------- target

    /**
     * Resolves the many ways a demo may name something on screen.
     *
     * A demo reads better when it addresses what a person would look for — the
     * visible words, the accessible role — than when it addresses a class name,
     * so those come first and a raw selector is the fallback.
     */
    #locator(target) {
        if (typeof target?.click === "function") return target;
        if (typeof target === "string") return this.#page.locator(target).first();
        if (target.text)
            return this.#page.getByText(target.text, { exact: target.exact ?? false }).first();
        if (target.role) return this.#page.getByRole(target.role, { name: target.name }).first();
        if (target.label) return this.#page.getByLabel(target.label).first();
        if (target.placeholder) return this.#page.getByPlaceholder(target.placeholder).first();
        if (target.selector) return this.#page.locator(target.selector).first();
        throw new Error(
            `A demo named a target this director cannot resolve: ${JSON.stringify(target)}`,
        );
    }

    async #rectangle(target) {
        if (target?.x !== undefined && target?.width !== undefined) return target;
        const locator = this.#locator(target);
        await locator.waitFor({ state: "visible", timeout: 20_000 });
        const box = await locator.boundingBox();
        if (!box) throw new Error("A demo target is on the page but has no box to aim at.");
        return box;
    }

    async #point(target) {
        if (target?.x !== undefined && target?.width === undefined) return target;
        const box = await this.#rectangle(target);
        const offset = target?.offset ?? { x: 0.5, y: 0.5 };
        return { x: box.x + box.width * offset.x, y: box.y + box.height * offset.y };
    }
}
