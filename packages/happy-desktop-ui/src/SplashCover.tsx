import { type ReactNode, useState } from "react";
import { SplashScreen } from "./SplashScreen";
import type { SegmentedProgressSegment } from "./SegmentedProgress";

export interface SplashCoverProps {
    /**
     * The app is ready to be seen. While false the mark covers the window; on
     * the change to true the mark fades away over what is underneath.
     */
    readonly ready: boolean;
    /** Optional startup detail shown below the mark while the cover remains. */
    readonly note?: string;
    /**
     * The steps of the start being covered, and where it has got to. Shown below
     * the mark for a start that lasts long enough to be worth explaining.
     */
    readonly steps?: readonly SegmentedProgressSegment[];
    /** Names the sequence for a screen reader when steps are shown. */
    readonly stepsLabel?: string;
    /**
     * Covers with the surface alone: no mark, no note, no steps. The window
     * still never shows a half-built screen, and still dissolves into the app,
     * but a start the person has already been through is not announced again.
     */
    readonly quiet?: boolean;
    readonly children: ReactNode;
}

/**
 * C-253 SplashCover — the boot mark, and its one dissolve into the app.
 *
 * Booting ends at a single moment, and cutting from the mark to a full window in
 * one frame reads as a flash however brief the mark was. So the mark stays in
 * place above the mounted app and fades off it: what changes is the mark's
 * opacity, never the surface underneath, which is why both screens are drawn on
 * the same `--surface` and the app appears to have been there all along.
 *
 * The fade is the only local state here, and it is genuinely local: whether an
 * animation that started is still running is a fact about this DOM node, not
 * product state, and it is settled by the node's own `animationend` rather than
 * by a timer that could disagree with it. Once it has faded the cover is gone
 * for good — it is keyed off the first readiness, so nothing later in the
 * window's life can bring it back.
 *
 * Reduced motion is honoured by the stylesheet rather than by a branch here: the
 * animation collapses to no duration, `animationend` still fires, and the cover
 * is removed on the same path.
 */
export function SplashCover(props: SplashCoverProps) {
    // Three states, in the only order they can occur: covering the window,
    // fading off it, and gone. `finished` is what makes this one-way.
    const [finished, setFinished] = useState(false);
    if (finished) return <>{props.children}</>;
    return (
        <div className="happy-splash-cover" data-happy-desktop-ui="splash-cover">
            {/* Mounted underneath from the first frame of the fade, so the app
                is already laid out and painted by the time it is visible. */}
            {props.ready ? props.children : null}
            <div
                className="happy-splash-cover__veil"
                data-happy-desktop-ui="splash-cover-veil"
                data-leaving={props.ready ? "" : undefined}
                onAnimationEnd={() => {
                    if (props.ready) setFinished(true);
                }}
            >
                {props.quiet ? null : (
                    <SplashScreen
                        note={props.note}
                        steps={props.steps}
                        stepsLabel={props.stepsLabel}
                    />
                )}
            </div>
        </div>
    );
}
