import { useState, type CSSProperties } from "react";
import { LottieScene, type LottieSceneName } from "./LottieScene";

export interface SetupDriftProps {
    /** The scenes to scatter, half down each side of the window. */
    readonly scenes: readonly LottieSceneName[];
}

interface DriftPlacement {
    readonly name: LottieSceneName;
    readonly style: CSSProperties;
}

/** A uniform number in [min, max). */
function between(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

/**
 * Every scene gets its own band of height on its side, so two never land on
 * each other, and somewhere random inside it: the side strips stay clear of
 * the centred column at any window width.
 */
function driftPlace(scenes: readonly LottieSceneName[]): DriftPlacement[] {
    const left = Math.ceil(scenes.length / 2);
    return scenes.map((name, index) => {
        const onLeft = index < left;
        const slot = onLeft ? index : index - left;
        const slots = onLeft ? left : scenes.length - left;
        const band = 66 / slots;
        const size = Math.round(between(64, 104));
        return {
            name,
            style: {
                "--happy-setup-drift-x": `${between(onLeft ? 5 : 81, onLeft ? 19 : 95).toFixed(1)}%`,
                "--happy-setup-drift-y": `${(14 + band * slot + between(0.2, 0.8) * band).toFixed(1)}%`,
                "--happy-setup-drift-dx": `${Math.round(between(-36, 36))}px`,
                "--happy-setup-drift-dy": `${Math.round(between(-48, 48))}px`,
                "--happy-setup-drift-delay": `${between(0.2, 2.4).toFixed(2)}s`,
                "--happy-setup-drift-duration": `${between(16, 28).toFixed(1)}s`,
                width: size,
                height: size,
            } as CSSProperties,
        };
    });
}

/**
 * Ambient scenes down both sides of a setup page: each one fades in after its
 * own short wait and then wanders slowly back and forth, looping as it goes.
 * Pure decoration behind the page, so it is hidden from assistive technology,
 * never takes a pointer or focus, and holds still under reduced motion.
 *
 * Placement is drawn once per mount; a page that stays up keeps its layout.
 */
export function SetupDrift(props: SetupDriftProps) {
    const [placements] = useState(() => driftPlace(props.scenes));
    return (
        <div aria-hidden className="happy-setup-drift" data-happy-desktop-ui="setup-drift" inert>
            {placements.map((placement) => (
                <span
                    className="happy-setup-drift__item"
                    key={placement.name}
                    style={placement.style}
                >
                    <LottieScene
                        loop
                        name={placement.name}
                        replayLabel=""
                        size={Number(placement.style.width)}
                    />
                </span>
            ))}
        </div>
    );
}
