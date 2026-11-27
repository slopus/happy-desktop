import { useContext, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { ThemeAppearanceContext, type ThemeMode } from "./ThemeScope";
import { reducedMotionGet, reducedMotionSubscribe } from "./lottie/dotLottieRuntime";
import { onboardingGrainRenderer } from "./onboardingGrainRenderer";
import { useWindowCaptionTrailing } from "./windowCaption";

const systemDarkGet = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const systemDarkSubscribe = (listener: () => void) => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
};

interface OnboardingSkyProps {
    readonly appearance: ThemeMode;
    readonly className?: string;
}

/**
 * The native iOS/Android Grain Gradient behind first-run onboarding.
 * Its palette and procedural grain match native, with corner fields at 70% of
 * native's inward reach. It moves at a third of native's speed, and not at all
 * without GPU acceleration.
 * Where the caption buttons sit top-right, the gradient is mirrored so its
 * dense corners are top-left and bottom-right, clear of them.
 * It draws its first frame before the window first paints, so it never fades
 * in. The same frame, baked with its grain, lies underneath for when WebGL is
 * unavailable or lost.
 */
export function OnboardingSky(props: OnboardingSkyProps) {
    const scopeAppearance = useContext(ThemeAppearanceContext);
    const requestedAppearance =
        scopeAppearance ??
        (props.appearance === "midnight" || props.appearance === "custom"
            ? "dark"
            : props.appearance);
    const systemDark = useSyncExternalStore(systemDarkSubscribe, systemDarkGet, () => false);
    const appearance =
        requestedAppearance === "system" ? (systemDark ? "dark" : "light") : requestedAppearance;
    const reducedMotion = useSyncExternalStore(
        reducedMotionSubscribe,
        reducedMotionGet,
        () => true,
    );
    const captionTrailing = useWindowCaptionTrailing();
    const canvas = useRef<HTMLCanvasElement>(null);
    // Appearance changes update the palette without rewinding the native motion.
    const clock = useRef({ seconds: 0 });
    // eslint-disable-next-line happy-react/no-layout-effect -- The committed canvas owns a WebGL program, observers and animation clock, all released together.
    useLayoutEffect(() => {
        if (canvas.current === null) return;
        return onboardingGrainRenderer(canvas.current, !reducedMotion, clock.current);
    }, [appearance, reducedMotion]);
    return (
        <div
            aria-hidden="true"
            className={["happy-onboarding-sky", props.className].filter(Boolean).join(" ")}
            data-appearance={appearance}
            data-happy-desktop-ui="onboarding-sky"
            data-mirrored={captionTrailing ? "" : undefined}
        >
            <canvas
                ref={canvas}
                className="happy-onboarding-sky__canvas"
                data-motion={reducedMotion ? "still" : "full"}
            />
        </div>
    );
}
