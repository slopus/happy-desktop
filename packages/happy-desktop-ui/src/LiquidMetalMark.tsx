import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { cloudLiquidMetalFieldUrl, cloudMarkUrl } from "./assets";
import { reducedMotionGet, reducedMotionSubscribe } from "./lottie/dotLottieRuntime";
import { liquidMetalRenderer } from "./liquidMetalRenderer";

export interface LiquidMetalMarkProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    /** The square's side, in CSS pixels. The cloud fills its width. */
    readonly size: number;
    /**
     * Whether it may move. Even then it holds still with reduced motion, off
     * screen, or in a hidden window. A fixture passes `false` to stay on
     * Paper's frame 0.
     */
    readonly moving?: boolean;
}

/**
 * C-340 LiquidMetalMark — the Happy Cloud mark, a cloud with the Happy H cut
 * out of it, in Paper's Liquid Metal: chrome stripes that flow over it and
 * bend at its edges. The same mark as happy-ios's `LiquidMetalView` and
 * happy-android's `LiquidMetalMark`.
 *
 * It draws only its own square and nothing around the cloud, so it sits on
 * any surface. The mask's edge field comes baked, so a frame is one texture
 * read and the stripes' arithmetic per pixel. It moves at the display's own
 * rate; until its field has loaded, and where WebGL 2 is unavailable, the
 * cloud's outline stands still in the text colour.
 */
export function LiquidMetalMark(props: LiquidMetalMarkProps) {
    const reducedMotion = useSyncExternalStore(
        reducedMotionSubscribe,
        reducedMotionGet,
        () => true,
    );
    const moving = (props.moving ?? true) && !reducedMotion;
    const canvas = useRef<HTMLCanvasElement>(null);
    // A change of motion keeps the place the stripes had reached.
    const clock = useRef({ seconds: 0 });
    const [ready, setReady] = useState(false);
    // eslint-disable-next-line happy-react/no-layout-effect -- The committed canvas owns a WebGL program, its texture, observers and animation clock, all released together.
    useLayoutEffect(() => {
        if (canvas.current === null) return;
        if (!moving) clock.current.seconds = 0;
        return liquidMetalRenderer(
            canvas.current,
            cloudLiquidMetalFieldUrl,
            moving,
            clock.current,
            setReady,
        );
    }, [moving]);
    const style = {
        width: `${props.size}px`,
        height: `${props.size}px`,
        "--happy-liquid-metal-mark-shape": `url("${cloudMarkUrl}")`,
    } as CSSProperties;
    return (
        <span
            aria-hidden="true"
            className={["happy-liquid-metal-mark", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="liquid-metal-mark"
            data-motion={moving ? "full" : "still"}
            data-ready={ready ? "" : undefined}
            data-testid={props["data-testid"]}
            style={style}
        >
            <span className="happy-liquid-metal-mark__still" />
            <canvas ref={canvas} className="happy-liquid-metal-mark__canvas" />
        </span>
    );
}
