// Type-only, so it costs nothing at runtime: the renderer itself is still
// reached through the lazy import inside `dotLottieRuntimeLoad`.
import type { DotLottieWorker } from "@lottiefiles/dotlottie-web";
import {
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type KeyboardEvent,
} from "react";
import {
    LOTTIE_WORKER_ID,
    assetUrlAbsolute,
    dotLottieRuntimeLoad,
    reducedMotionGet,
    reducedMotionSubscribe,
    scenePixelRatio,
} from "./lottie/dotLottieRuntime";
import alienMonsterUrl from "./assets/animations/alien-monster.json?url";
import cherryBlossomUrl from "./assets/animations/cherry-blossom.json?url";
import closedLockUrl from "./assets/animations/closed-lock.json?url";
import cloudVariationUrl from "./assets/animations/cloud-variation.json?url";
import confettiBallUrl from "./assets/animations/confetti-ball.json?url";
import disguisedFaceUrl from "./assets/animations/disguised-face.json?url";
import frontFacingBabyChickUrl from "./assets/animations/front-facing-baby-chick.json?url";
import hatchingChickUrl from "./assets/animations/hatching-chick.json?url";
import llamaUrl from "./assets/animations/llama.json?url";
import mirrorBallUrl from "./assets/animations/mirror-ball.json?url";
import monkeyHearNoEvilUrl from "./assets/animations/monkey-hear-no-evil.json?url";
import openHandsUrl from "./assets/animations/open-hands.json?url";
import owlUrl from "./assets/animations/owl.json?url";
import partyUrl from "./assets/animations/party.json?url";
import robotUrl from "./assets/animations/robot.json?url";
import snailUrl from "./assets/animations/snail.json?url";
import sparklesUrl from "./assets/animations/sparkles.json?url";
import spiderCatchingBugUrl from "./assets/animations/spider-catching-bug.json?url";
import ticketsUrl from "./assets/animations/tickets.json?url";
import wandUrl from "./assets/animations/wand.json?url";

/**
 * The animations Happy ships. This is a closed list on purpose: a scene is part
 * of the design system, not a slot a product screen can point at arbitrary art,
 * and every name here carries exactly one meaning:
 *
 * - `alien-monster` — people and agents are together in one live session.
 * - `cherry-blossom` — a new friendship has begun.
 * - `closed-lock` — access is secured.
 * - `cloud-variation` — work runs on hardware that is not this machine.
 * - `confetti-ball` — one milestone has just completed.
 * - `disguised-face` — this machine's identity is being defined.
 * - `front-facing-baby-chick` — a new social identity is ready to meet people.
 * - `hatching-chick` — something new has been created.
 * - `llama` — several models are being combined on one job.
 * - `mirror-ball` — one session, channel, or moment a whole circle is in at once.
 * - `monkey-hear-no-evil` — nobody outside can listen to this.
 * - `open-hands` — a social invitation is waiting for a response.
 * - `owl` — we are looking, and there is nothing found yet (search).
 * - `party` — a group is celebrating a shared completion.
 * - `robot` — an agent is ready to work, and waiting to be told what to do.
 * - `snail` — something is being read right now, and it is taking a moment.
 * - `sparkles` — the absence is the good outcome; there is nothing left to do.
 * - `spider-catching-bug` — a safety net helps catch unintended agent actions.
 * - `tickets` — finished work is kept here, and none has been kept yet.
 * - `wand` — the thing that is missing is one you can make right here.
 *
 * See `assets/animations/PROVENANCE.md` for where they came from and what was
 * turned down.
 */
export type LottieSceneName =
    | "alien-monster"
    | "cherry-blossom"
    | "closed-lock"
    | "cloud-variation"
    | "confetti-ball"
    | "disguised-face"
    | "front-facing-baby-chick"
    | "hatching-chick"
    | "llama"
    | "mirror-ball"
    | "monkey-hear-no-evil"
    | "open-hands"
    | "owl"
    | "party"
    | "robot"
    | "snail"
    | "sparkles"
    | "spider-catching-bug"
    | "tickets"
    | "wand";

/**
 * When the one play happens. `on-appear` is the product default: the scene
 * plays once as the state it belongs to appears, and afterwards holds its last
 * frame. `on-demand` skips that first play and shows the same held frame from
 * the start — the deterministic form the blueprint is drawn with, and the right
 * choice for any surface that should not move on its own.
 */
export type LottieScenePlay = "on-appear" | "on-demand";

const SOURCES: Record<LottieSceneName, string> = {
    "alien-monster": alienMonsterUrl,
    "cherry-blossom": cherryBlossomUrl,
    "closed-lock": closedLockUrl,
    "cloud-variation": cloudVariationUrl,
    "confetti-ball": confettiBallUrl,
    "disguised-face": disguisedFaceUrl,
    "front-facing-baby-chick": frontFacingBabyChickUrl,
    "hatching-chick": hatchingChickUrl,
    llama: llamaUrl,
    "mirror-ball": mirrorBallUrl,
    "monkey-hear-no-evil": monkeyHearNoEvilUrl,
    "open-hands": openHandsUrl,
    owl: owlUrl,
    party: partyUrl,
    robot: robotUrl,
    snail: snailUrl,
    sparkles: sparklesUrl,
    "spider-catching-bug": spiderCatchingBugUrl,
    tickets: ticketsUrl,
    wand: wandUrl,
};

/**
 * Frames are relative to the animation's in-point. The spider's source starts
 * at 120: source frame 250 (relative 130) holds the spider down with the bug
 * still caught and both wing rotations at their folded 0° keyframe, before
 * the bug's departure beginning at source frame 254.
 * Keep the original asset and end every play, replay, and reduced-motion hold
 * at this pose through the renderer's segment contract.
 */
const PLAYBACK_SEGMENTS: Partial<Record<LottieSceneName, [number, number]>> = {
    "spider-catching-bug": [0, 130],
};

type Player = DotLottieWorker;

export type LottieSceneProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Which shipped animation to draw. */
    name: LottieSceneName;
    /** Rendered box, in CSS pixels. Square. Empty states use 96 and 128. */
    size: number;
    /** When the single play happens. Defaults to `on-appear`. */
    play?: LottieScenePlay;
    /**
     * Repeats the play for as long as it is true. Off by default, which is the
     * play-once contract below. Turning it off never restarts or remounts the
     * player: the cycle already under way finishes and its last frame holds.
     * For a scene that stands for one continuous wait, such as an update.
     */
    loop?: boolean;
    /**
     * The accessible name of the replay control. The artwork itself carries no
     * information — whatever it illustrates is already written beside it — so
     * the only thing assistive technology is told about is the one action:
     * play it again.
     */
    replayLabel: string;
};

/**
 * C-237 LottieScene — one vector animation, played once, drawn on a worker
 * thread.
 *
 * Every frame is decoded, rasterised, and composited by ThorVG (WASM) inside a
 * Web Worker, against an OffscreenCanvas the main thread transfers once and
 * never touches again. There is no requestAnimationFrame loop here, no timer,
 * and no React render per frame. All scenes share one worker.
 *
 * It never loops unless its host passes `loop`. The scene plays once when the state it illustrates appears,
 * and then holds its playback range's last frame. Most scenes use the complete
 * animation; the spider ends on its selected caught-bug pose.
 * After that it only moves when a reader asks: a click or tap, a fresh hover
 * entry, or Enter/Space while it has keyboard focus. A replay is refused while
 * one is already running, so a pointer resting inside cannot turn "again" into
 * a loop.
 *
 * The main thread is not completely silent, and it would be dishonest to say so:
 * the renderer posts one small `frame` and one `render` notification per
 * rendered frame, which its own facade handles in constant time — a property
 * write and a dispatch to an empty listener list, since this component
 * subscribes to neither. That is a bounded message per frame, not rendering
 * work, and it is the one cost of the library that cannot be turned off. Once
 * the single play ends even those stop, which is the difference between this
 * and a loop. See the C-237 blueprint page for what it measures at.
 *
 * The scene stops whenever no one is looking — scrolled out of view, or the
 * window hidden — and resumes where it stopped, because a play that was
 * interrupted has still not been seen. A reader who has asked for reduced
 * motion never sees it move at all: it holds the same final frame, nothing
 * starts it, and it is not offered as a control, because the least surprising
 * reading of "reduce motion" is that this picture does not move.
 *
 * Until the runtime has loaded, and forever if it cannot load, the scene
 * renders nothing and leaves whatever its host drew underneath in place. That
 * is the cross-browser and locked-down-CSP fallback: an empty state that keeps
 * its ordinary glyph is a correct empty state, so nothing here is load-bearing.
 */
export function LottieScene(props: LottieSceneProps) {
    const canvas = useRef<HTMLCanvasElement | null>(null);
    // Set by the effect once the player exists, and called by the DOM handlers
    // below. A ref rather than state because asking for a replay changes
    // nothing React renders.
    const replay = useRef<() => void>(() => {});
    // Set by the effect once the player exists. Applies a changed `loop` to the
    // running player; until then the effect reads `loop` when it builds one.
    const loopApply = useRef<(loop: boolean) => void>(() => {});
    // Drives only the canvas's own opacity, so the still glyph underneath is not
    // crossed by a half-painted first frame. It is not product state and nothing
    // outside this component reads it.
    const [painted, setPainted] = useState(false);
    /*
     * Read at render time rather than mirrored into state: the preference
     * decides whether this is a control at all, and that has to be answered
     * while rendering. The effect below subscribes to the same store for
     * playback, so a reader turning the preference on stops a scene that is
     * already moving without remounting anything.
     */
    const reducedMotion = useSyncExternalStore(
        reducedMotionSubscribe,
        reducedMotionGet,
        () => true,
    );
    const play = props.play ?? "on-appear";
    /*
     * A control only once there is really something to replay. Before the first
     * frame is painted — and permanently in an engine where the worker renderer
     * cannot come up at all, where the host's still glyph shows through instead
     * — a tab stop and a pointer cursor would promise an action that does
     * nothing.
     */
    const interactive = !reducedMotion && painted;
    const loop = props.loop === true;

    /*
     * Owning a worker player, a transferred OffscreenCanvas, an
     * IntersectionObserver, a visibilitychange listener and a media-query
     * listener is not something a render derivation or a single ref callback can
     * express. The resources arrive asynchronously, after the runtime has
     * loaded; they outlive the callback that asked for them; and every one of
     * them has to be released together. The teardown below is that one path.
     */
    // eslint-disable-next-line happy-react/no-layout-effect -- the asynchronous worker/canvas/observer lifetime described above
    useLayoutEffect(() => {
        const element = canvas.current;
        if (element === null) return;
        const view = element.ownerDocument.defaultView;
        if (view === null) return;
        /*
         * The renderer draws into an OffscreenCanvas it takes ownership of, and
         * where an engine cannot hand one over its constructor throws from an
         * async method nobody can catch. Ask first: an engine without the
         * transfer simply keeps the host's static glyph.
         */
        if (typeof element.transferControlToOffscreen !== "function") return;

        // Everything created below is registered here, so there is exactly one
        // teardown path whether the scene unmounted, the runtime never arrived,
        // or the effect re-ran for a different animation.
        let disposed = false;
        let player: Player | undefined;
        const release: (() => void)[] = [];

        /*
         * Playing is only ever correct when all four are true: a play is owed,
         * the scene is in view, the window is not hidden, and no one asked for
         * less movement. Each source below flips its own flag and then asks the
         * one question, so they cannot fight each other — an offscreen scene
         * does not resume merely because the window came back to the
         * foreground.
         *
         * The flags live out here, above the runtime promise, because a scene
         * can scroll away or a window can be hidden while the runtime is still
         * arriving. Recording those answers early and applying them once the
         * player exists is the difference between a scene that honours them and
         * one that quietly drops them.
         */
        let visible = false;
        let shown = !element.ownerDocument.hidden;
        let reduced = reducedMotionGet();
        // The play-once permission: true from the moment a play is owed until
        // the renderer reports that play finished. It is what keeps a second
        // hover, or a pointer sitting still inside, from becoming a loop.
        let owed = false;
        // The frame the animation ends on, and therefore the frame it holds
        // whenever it is not moving. Known only once the animation has loaded.
        let rest = 0;
        /*
         * The two things the sources below do to a player, replaced with the
         * real ones the moment there is a player to do them to. Until then the
         * sources still run, and the flags they write are what the load handler
         * reads — which is the whole reason they are subscribed before the
         * runtime is even asked for.
         */
        let settle = () => {};
        let hold = () => {};
        // Whether the play repeats. Read when the player is built and kept
        // current by `loopApply`, so a change never rebuilds the player.
        let looping = loop;
        const segment = PLAYBACK_SEGMENTS[props.name];

        /*
         * Subscribed now, not after the runtime resolves. Scrolling away,
         * hiding the window, or turning reduced motion on during that wait are
         * all answers this scene has to honour, and a listener attached
         * afterwards would never hear the ones that already happened.
         */
        const observer = new view.IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            settle();
        });
        observer.observe(element);
        release.push(() => {
            observer.disconnect();
        });

        const onVisibility = () => {
            shown = !element.ownerDocument.hidden;
            settle();
        };
        element.ownerDocument.addEventListener("visibilitychange", onVisibility);
        release.push(() => {
            element.ownerDocument.removeEventListener("visibilitychange", onVisibility);
        });

        release.push(
            reducedMotionSubscribe(() => {
                reduced = reducedMotionGet();
                // Turning the preference on is a request to stop moving, and to
                // stop on something worth looking at rather than wherever the
                // play happened to be.
                if (reduced) hold();
                else settle();
            }),
        );

        void dotLottieRuntimeLoad()
            .then(({ DotLottieWorker }) => {
                // The reader closed the screen while the runtime was still
                // arriving. Do not transfer the canvas; there is nothing to
                // transfer it to and it would leak a worker player.
                if (disposed) return;

                /*
                 * The worker sizes its bitmap from the canvas's laid-out box,
                 * and a canvas inside a host that is not displayed yet has no
                 * box: it falls back to the element's own 300 × 150, which is
                 * then drawn squeezed into the square. Giving the element the
                 * square first makes that fallback the right size too.
                 */
                const ratio = scenePixelRatio(view);
                element.width = Math.round(props.size * ratio);
                element.height = Math.round(props.size * ratio);

                const instance = new DotLottieWorker({
                    /*
                     * Nothing starts on its own. Every command to a player whose
                     * worker-side half is not built yet is silently dropped, so
                     * a scene that autoplayed here would be running by the time
                     * anyone could tell it not to. `settle` below is the only
                     * thing that ever starts or stops it, and it does not run
                     * until the animation has loaded.
                     */
                    autoplay: false,
                    canvas: element,
                    // The artwork keeps its own proportions inside the square
                    // box, centred, whatever the source frame's shape.
                    layout: { align: [0.5, 0.5], fit: "contain" },
                    // Only while the host asks for it. Otherwise one play is
                    // the whole contract, and a second one is always
                    // something a reader asked for.
                    loop: looping,
                    ...(segment === undefined ? {} : { segment }),
                    renderConfig: {
                        autoResize: false,
                        devicePixelRatio: ratio,
                        // The worker's own offscreen check. The observer below
                        // still runs: this one knows about the viewport, and
                        // only the observer knows about a collapsed or
                        // display:none ancestor.
                        freezeOnOffscreen: true,
                    },
                    // Absolute: the worker fetching this has a blob: base URL.
                    src: assetUrlAbsolute(SOURCES[props.name]),
                    workerId: LOTTIE_WORKER_ID,
                });
                player = instance;

                /*
                 * Playback state is written straight onto the element rather
                 * than held in React: it changes a few times per play, nothing
                 * in the tree renders from it, and re-rendering a component to
                 * say "still playing" is the kind of main-thread work this
                 * renderer was chosen to avoid. `data-state` is whatever the
                 * gate below decided — `waiting` is a play that is owed but
                 * held back because nobody is looking — and `data-plays` counts
                 * starts, which is how one appearance is shown to be one play.
                 */
                settle = () => {
                    if (disposed) return;
                    const running = owed && !reduced && visible && shown;
                    element.dataset.state = owed ? (running ? "playing" : "waiting") : "rested";
                    void (running ? instance.play() : instance.pause());
                };
                const start = () => {
                    owed = true;
                    element.dataset.plays = String(Number(element.dataset.plays ?? "0") + 1);
                    settle();
                };
                hold = () => {
                    owed = false;
                    settle();
                    void instance.setFrame(rest);
                };

                loopApply.current = (next) => {
                    if (disposed || next === looping) return;
                    looping = next;
                    // Off: the cycle under way plays out and fires `complete`,
                    // which holds its last frame. On: a rested scene starts again.
                    void instance.setLoop(next);
                    if (next && !owed && !reduced) {
                        void instance.setFrame(0);
                        start();
                    }
                };

                replay.current = () => {
                    // Refused while a play is still running: a pointer that
                    // entered, or a key held down, must not be able to restart
                    // the scene over and over.
                    if (disposed || reduced || owed) return;
                    void instance.setFrame(0);
                    start();
                };

                instance.addEventListener("complete", () => {
                    if (disposed) return;
                    // The player already holds the final frame; this only
                    // records that the debt is paid, so the next hover, click,
                    // or keypress is allowed to start another play.
                    owed = false;
                    settle();
                });

                instance.addEventListener("load", () => {
                    /*
                     * The first point at which the worker-side player certainly
                     * exists, and therefore the first point at which any of this
                     * has an effect. Loading also draws frame 0, so revealing
                     * the canvas here never uncovers an empty one.
                     */
                    if (disposed) {
                        // The scene was torn down while its player was being
                        // built, so the teardown's own destroy() found nothing
                        // to free. This is the second chance to free it.
                        void instance.destroy();
                        return;
                    }
                    rest = Math.max(
                        Math.min(
                            segment?.[1] ?? instance.totalFrames - 1,
                            instance.totalFrames - 1,
                        ),
                        0,
                    );
                    if (play === "on-appear" && !reduced) {
                        setPainted(true);
                        start();
                        return;
                    }
                    /*
                     * Nothing is going to move, so the canvas must not be
                     * revealed on frame 0 and then jump: seek to the frame the
                     * animation would have finished on, and only then fade it in
                     * over the host's glyph.
                     */
                    settle();
                    void instance.setFrame(rest).then(() => {
                        if (!disposed) setPainted(true);
                    });
                });
            })
            .catch(() => {
                // No worker, no WASM, or a policy that forbids one. The host's
                // still glyph is already on screen and stays there.
            });

        return () => {
            disposed = true;
            replay.current = () => {};
            loopApply.current = () => {};
            setPainted(false);
            for (const off of release) off();
            release.length = 0;
            /*
             * Frees the worker-side player, its ThorVG surface, and the
             * transferred canvas buffer. The worker itself is shared and
             * outlives this scene by design. If the player has not finished
             * being built this call does nothing, which is why the load handler
             * above checks `disposed` and destroys it then instead.
             */
            void player?.destroy();
        };
        // `loop` is read only when a player is built; a later change goes
        // through `loopApply` below, so it never rebuilds the player.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    }, [play, props.name, props.size]);

    // eslint-disable-next-line happy-react/no-layout-effect -- hands a changed `loop` to the worker player already running; rebuilding it would restart the scene, and there is nothing to clean up
    useLayoutEffect(() => {
        loopApply.current(loop);
    }, [loop]);

    const box = `${String(props.size)}px`;
    const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        // Space would scroll the surface the empty state sits in, and a held key
        // repeats; `replay` refuses the repeat itself, so only the scroll needs
        // stopping here.
        event.preventDefault();
        replay.current();
    };
    return (
        <canvas
            // The artwork repeats what the empty state already says in words, so
            // there is nothing here for a screen reader until it becomes a
            // control — and under reduced motion it never does.
            aria-hidden={interactive ? undefined : "true"}
            aria-label={interactive ? props.replayLabel : undefined}
            className={["happy-lottie-scene", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="lottie-scene"
            data-motion={reducedMotion ? "reduced" : "full"}
            data-name={props.name}
            data-painted={painted ? "true" : "false"}
            data-play={play}
            data-testid={props["data-testid"]}
            /*
             * A canvas transferred to a worker can never be reclaimed by the
             * main thread: its backing bitmap was sized once, from this box and
             * the pixel ratio, and nothing on this side can resize it again. So
             * a different animation, a different answer to when it plays, or a
             * different box must each get a different element rather than a
             * re-used one that would be scaled up to fit.
             */
            key={`${props.name}:${play}:${String(props.size)}`}
            onClick={interactive ? () => replay.current() : undefined}
            onKeyDown={interactive ? onKeyDown : undefined}
            // Entering fires once per entry, so a pointer that comes to rest
            // inside asks for exactly one replay and then nothing.
            onPointerEnter={interactive ? () => replay.current() : undefined}
            ref={canvas}
            role={interactive ? "button" : undefined}
            style={{ ...props.style, height: box, width: box }}
            tabIndex={interactive ? 0 : undefined}
        />
    );
}
