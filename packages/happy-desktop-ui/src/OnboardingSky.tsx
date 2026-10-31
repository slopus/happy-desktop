import { useContext, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { ThemeAppearanceContext, type ThemeMode } from "./ThemeScope";
import { reducedMotionGet, reducedMotionSubscribe } from "./lottie/dotLottieRuntime";
import { onboardingGrainRenderer } from "./onboardingGrainRenderer";

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
 * Its palette, corner shape, procedural grain and animation speed match native.
 * The CSS corner glows remain underneath if WebGL is unavailable or lost.
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
        >
            <canvas
                ref={canvas}
                className="happy-onboarding-sky__canvas"
                data-motion={reducedMotion ? "still" : "full"}
            />
        </div>
    );
}
