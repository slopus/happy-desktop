import { useId, useLayoutEffect, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { happyLogoBlackUrl, happyLogoWhiteUrl } from "./assets";
import { LottieScene, type LottieSceneName } from "./LottieScene";
import { reducedMotionGet, reducedMotionSubscribe } from "./lottie/dotLottieRuntime";

/** What one slide shows above its words. */
export type WelcomeSlideArt =
    | { readonly kind: "logo" }
    | { readonly kind: "scene"; readonly name: LottieSceneName };

export interface WelcomeSlide {
    /** Stable identity for this slide; also the React key. */
    readonly id: string;
    readonly art: WelcomeSlideArt;
    readonly title: string;
    readonly copy: string;
}

/**
 * Which surface the deck is drawn on. `sky` is the brand-scene presentation for
 * a deck over one of the sky paintings: white words, white position control.
 */
export type WelcomeDeckTint = "surface" | "sky";

export interface WelcomeDeckProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    /** The row of dots names what it steps through; the deck has no visible heading. */
    readonly label: string;
    /** At least one. The first is shown first. */
    readonly slides: readonly WelcomeSlide[];
    readonly tint?: WelcomeDeckTint;
}

/**
 * How long one slide holds before the deck moves on. Fifteen seconds, because
 * five was measured against how long a slogan takes to *see* rather than how
 * long it takes to read one, notice the art, and look back — a reader who is
 * still on a slide when it changes has been interrupted, not paced. It is long
 * enough that the deck is something a reader can sit with, and still short
 * enough that anyone who stays on this screen learns it is a deck.
 */
const ADVANCE_MS = 15000;

/**
 * The art box, in CSS pixels. It is the same square for both slide kinds, and
 * the same number as the `width`/`height` of `__stage` in the stylesheet: the
 * stage is what keeps a logo slide and a scene slide from putting the words at
 * two different heights, so the two values must not be able to disagree.
 */
const ART_SIZE = 160;

/**
 * C-276 WelcomeDeck — big art, a title, a slogan, and a row of dots. It is what
 * introduces the product on first run; the words are the caller's, the layout
 * and the timing are ours.
 *
 * The deck advances on its own every fifteen seconds and wraps, which is the
 * whole argument for the layout. Two things must not move while it does. The
 * art sits in a fixed square stage, so a logo slide and a Lottie slide put their
 * titles at exactly the same y. And every slide's words are stacked in one cell
 * — see `welcome-deck.css` — so the block is as tall as the longest copy in the
 * deck and the dots, and whatever the host puts beneath them, never shift: a
 * reader whose pointer is already resting on the action cannot have it slide
 * away mid-read. Only the active slide's words are visible, and
 * `visibility: hidden` plus `aria-hidden` keep the rest out of the accessibility
 * tree, so the stack is one screen of words rather than four read one after
 * another.
 *
 * The dots are the real control: a tablist of buttons over the panels they
 * select, with a roving tab stop and Left/Right arrow keys. Choosing a slide
 * restarts the clock rather than letting the pending tick fire a moment later,
 * because being yanked off the slide you just asked for is worse than no
 * slideshow at all.
 *
 * A reader who asked for reduced motion never sees it advance by itself. The
 * deck holds the slide it is on, the dots stay usable, and the crossfade is off
 * — the preference is read from the same store `LottieScene` plays from, so a
 * scene slide and the deck carrying it always agree about it.
 */
export function WelcomeDeck(props: WelcomeDeckProps) {
    /*
     * Which slide is on screen. Narrowly scoped local UI state in the exact
     * sense the package allows: nothing outside this component can observe it,
     * and no product state depends on which picture is showing.
     */
    const [index, setIndex] = useState(0);
    /*
     * Read at render time rather than mirrored into state, because it decides
     * what is rendered as well as what moves: the effect below reads the same
     * value, so turning the preference on stops the deck without remounting it.
     * The pessimistic server snapshot means nothing advances before the
     * preference can be asked for.
     */
    const reducedMotion = useSyncExternalStore(
        reducedMotionSubscribe,
        reducedMotionGet,
        () => true,
    );
    const prefix = useId();
    const count = props.slides.length;
    // A deck that shrank under a live index would otherwise point past its end.
    const activeIndex = index < count ? index : 0;
    const active = props.slides[activeIndex];

    /*
     * A timer is a browser resource, not a value a render can derive and not an
     * event any reader produces: nobody clicks "fifteen seconds passed". This
     * is the one thing here that has to be started and stopped by hand. It is
     * one timeout per slide rather than a repeating interval, so the effect's
     * own dependencies do the restarting — every advance, every dot, every arrow
     * key changes `activeIndex`, which tears the pending tick down and starts a
     * full fifteen seconds afresh. The reduced-motion subscription it answers to
     * is the `useSyncExternalStore` above, which React unsubscribes with the
     * component.
     */
    // eslint-disable-next-line happy-react/no-layout-effect -- the auto-advance timeout is an imperative browser resource with no declarative or event-driven equivalent
    useLayoutEffect(() => {
        // Nothing to advance to, or a reader who asked for less movement.
        if (reducedMotion || count < 2) return;
        const timer = globalThis.setTimeout(() => {
            setIndex((activeIndex + 1) % count);
        }, ADVANCE_MS);
        return () => {
            globalThis.clearTimeout(timer);
        };
    }, [activeIndex, count, reducedMotion]);

    /*
     * On the dot rather than on the row: the row is a `tablist`, which is not
     * focusable and therefore never receives a key of its own — the keys arrive
     * at whichever dot holds the tab stop, and a handler on the row would only
     * be reading them as they bubble past.
     */
    const dotKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (step === 0) return;
        // Arrow keys would otherwise scroll the surface the deck sits on.
        event.preventDefault();
        const next = (activeIndex + step + count) % count;
        setIndex(next);
        /*
         * The row carries one tab stop, so selection and focus move together.
         * The dot being focused still has `tabIndex={-1}` in the committed tree;
         * a programmatic focus does not care, and the render this keypress
         * schedules hands the tab stop over to it.
         */
        const dot = event.currentTarget.parentElement?.children[next];
        if (dot instanceof HTMLElement) dot.focus();
    };

    return (
        <div
            className={["happy-welcome-deck", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="welcome-deck"
            data-testid={props["data-testid"]}
            data-tint={props.tint === "sky" ? "sky" : undefined}
        >
            <div className="happy-welcome-deck__stage" data-happy-desktop-ui="welcome-stage">
                {active ? welcomeArt(active, props.tint === "sky") : null}
            </div>

            <div className="happy-welcome-deck__panels" data-happy-desktop-ui="welcome-panels">
                {props.slides.map((slide, position) => {
                    const current = position === activeIndex;
                    return (
                        <div
                            key={slide.id}
                            // Every slide is in the tree so the stack can be as
                            // tall as the longest one; only the slide on screen
                            // is readable.
                            aria-hidden={current ? undefined : "true"}
                            aria-labelledby={`${prefix}-tab-${slide.id}`}
                            className="happy-welcome-deck__panel"
                            data-active={current ? "" : undefined}
                            data-happy-desktop-ui="welcome-panel"
                            id={`${prefix}-panel-${slide.id}`}
                            role="tabpanel"
                            // The panel holds no control of its own, so it takes
                            // a tab stop itself and the words stay reachable
                            // from the keyboard.
                            tabIndex={current ? 0 : undefined}
                        >
                            <h1
                                className="happy-welcome-deck__title"
                                data-happy-desktop-ui="welcome-title"
                            >
                                {slide.title}
                            </h1>
                            <p
                                className="happy-welcome-deck__copy"
                                data-happy-desktop-ui="welcome-copy"
                            >
                                {slide.copy}
                            </p>
                        </div>
                    );
                })}
            </div>

            {count > 1 ? (
                <div
                    aria-label={props.label}
                    className="happy-welcome-deck__dots"
                    data-happy-desktop-ui="welcome-dots"
                    role="tablist"
                >
                    {props.slides.map((slide, position) => {
                        const current = position === activeIndex;
                        return (
                            <button
                                key={slide.id}
                                aria-controls={`${prefix}-panel-${slide.id}`}
                                // The dot itself is a circle with nothing in it;
                                // the slide it selects is what it is called.
                                aria-label={slide.title}
                                aria-selected={current ? "true" : "false"}
                                className="happy-welcome-deck__dot"
                                data-active={current ? "" : undefined}
                                data-happy-desktop-ui="welcome-dot"
                                id={`${prefix}-tab-${slide.id}`}
                                onClick={() => setIndex(position)}
                                onKeyDown={dotKeyDown}
                                role="tab"
                                tabIndex={current ? 0 : -1}
                                type="button"
                            >
                                <span
                                    className="happy-welcome-deck__dot-mark"
                                    data-happy-desktop-ui="welcome-dot-mark"
                                />
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

/**
 * The picture above the words. The logo is drawn at full strength rather than
 * the splash screen's muted mark: this screen *is* the brand moment, where that
 * one means "still waking up". A scene keeps its `on-appear` default so it plays
 * once as its slide arrives — the deck remounts it by key on every visit, which
 * is what makes coming back to a slide show the animation again instead of a
 * held final frame.
 */
function welcomeArt(slide: WelcomeSlide, whiteLogo: boolean) {
    if (slide.art.kind === "logo")
        return (
            <img
                alt=""
                aria-hidden="true"
                className={
                    whiteLogo
                        ? "happy-welcome-deck__mark"
                        : "happy-brand-logo happy-welcome-deck__mark"
                }
                data-happy-desktop-ui="welcome-mark"
                src={whiteLogo ? happyLogoWhiteUrl : happyLogoBlackUrl}
            />
        );
    return (
        <LottieScene
            key={slide.id}
            name={slide.art.name}
            replayLabel={`Play the ${slide.title} animation again`}
            size={ART_SIZE}
        />
    );
}
