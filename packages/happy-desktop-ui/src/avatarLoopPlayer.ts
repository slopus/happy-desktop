import { reducedMotionGet, reducedMotionSubscribe } from "./lottie/dotLottieRuntime";

/*
 * Decides when the placeholder loops on a page play.
 *
 * A loop is shown only while what an avatar stands for is working, so few play
 * at once, but each is still a video decoder. One player per document watches
 * every loop: a loop plays only while it is on screen, the window is shown,
 * the reader allows motion, and the machine is not running on battery. Any
 * other time it rests on frame 0, which is the placeholder's still, so
 * stopping never leaves it on a frame the still does not show.
 */

/** The Battery Status API, which TypeScript's DOM library leaves out. */
interface BatteryManager extends EventTarget {
    readonly charging: boolean;
}

type View = Window & typeof globalThis;

class AvatarLoopPlayer {
    readonly #view: View;
    readonly #visible = new Map<HTMLVideoElement, boolean>();
    readonly #intersection: IntersectionObserver | undefined;
    #motion = true;
    #battery: BatteryManager | undefined;
    #unsubscribeMotion: (() => void) | undefined;

    constructor(view: View) {
        this.#view = view;
        this.#intersection =
            typeof view.IntersectionObserver === "function"
                ? new view.IntersectionObserver((records) => {
                      for (const record of records) {
                          const video = record.target as HTMLVideoElement;
                          if (!this.#visible.has(video)) continue;
                          this.#visible.set(video, record.isIntersecting);
                          this.#sync(video);
                      }
                  })
                : undefined;
    }

    attach(video: HTMLVideoElement): () => void {
        if (this.#visible.size === 0) this.#start();
        // Muted as a property too, which is what lets a page play it unprompted.
        video.muted = true;
        // Until an observer says it is on screen; without one, always.
        this.#visible.set(video, this.#intersection === undefined);
        this.#intersection?.observe(video);
        this.#sync(video);
        return () => {
            this.#intersection?.unobserve(video);
            this.#visible.delete(video);
            video.pause();
            if (this.#visible.size === 0) this.#stop();
        };
    }

    #start() {
        this.#view.document.addEventListener("visibilitychange", this.#syncAll);
        this.#motion = !reducedMotionGet();
        this.#unsubscribeMotion = reducedMotionSubscribe(this.#motionChanged);
        const navigator = this.#view.navigator as Navigator & {
            getBattery?: () => Promise<BatteryManager>;
        };
        if (this.#battery === undefined && typeof navigator.getBattery === "function")
            void navigator.getBattery().then(
                (battery) => {
                    this.#battery = battery;
                    battery.addEventListener("chargingchange", this.#syncAll);
                    this.#syncAll();
                },
                () => {},
            );
        else this.#battery?.addEventListener("chargingchange", this.#syncAll);
    }

    #stop() {
        this.#view.document.removeEventListener("visibilitychange", this.#syncAll);
        this.#unsubscribeMotion?.();
        this.#unsubscribeMotion = undefined;
        this.#battery?.removeEventListener("chargingchange", this.#syncAll);
    }

    readonly #motionChanged = () => {
        this.#motion = !reducedMotionGet();
        this.#syncAll();
    };

    readonly #syncAll = () => {
        for (const video of this.#visible.keys()) this.#sync(video);
    };

    /** Whether loops may play at all: shown, motion allowed, and not on battery. */
    #allowed(): boolean {
        return (
            !this.#view.document.hidden &&
            this.#motion &&
            (this.#battery?.charging ?? true) === true
        );
    }

    #sync(video: HTMLVideoElement) {
        if (this.#allowed() && this.#visible.get(video) === true) {
            if (video.paused) void video.play().catch(() => {});
        } else if (!video.paused || video.currentTime !== 0) {
            video.pause();
            video.currentTime = 0;
        }
    }
}

const players = new WeakMap<View, AvatarLoopPlayer>();

/**
 * Plays `video`'s loop whenever it may, until the returned function is
 * called; it rests on its first frame otherwise.
 */
export function avatarLoopAttach(video: HTMLVideoElement): () => void {
    const view = video.ownerDocument.defaultView;
    if (view === null) return () => {};
    let player = players.get(view);
    if (!player) {
        player = new AvatarLoopPlayer(view);
        players.set(view, player);
    }
    return player.attach(video);
}
