import { Icon, type IconName } from "./Icon";
import { LottieScene, type LottieSceneName, type LottieSceneProps } from "./LottieScene";

/*
 * The glyph each scene is held by until its artwork paints, one per meaning in
 * the closed scene vocabulary (see `LottieSceneName`). Total on purpose: a new
 * scene cannot ship without saying what stands in for it.
 */
const GLYPHS: Record<LottieSceneName, IconName> = {
    "alien-monster": "users",
    "cherry-blossom": "smile",
    "closed-lock": "lock",
    "cloud-variation": "globe",
    "confetti-ball": "check-circle",
    "crow-eating-worm": "bug",
    "disguised-face": "eye-off",
    "front-facing-baby-chick": "at",
    "hatching-chick": "spark",
    llama: "merge",
    "magic-wand": "zap",
    "mirror-ball": "chat",
    "monkey-hear-no-evil": "shield",
    "open-hands": "bell",
    owl: "search",
    party: "star",
    robot: "agents",
    seedling: "dot",
    snail: "clock",
    sparkles: "check",
    "spider-catching-bug": "shield",
    sprig: "users",
    tickets: "archive",
    tree: "globe",
    wand: "plus",
};

/**
 * LottieSceneStage — a `LottieScene` standing on its placeholder glyph, the
 * same hand-over an empty state's scene makes: the glyph is what the reader
 * sees while the worker runtime, WASM, and animation arrive, and what they keep
 * if they never do; the canvas fades in over it once painted and the glyph
 * steps aside. The box is the scene's own square, so nothing moves when the
 * artwork takes over.
 *
 * For scenes with no `still` picture. A scene that has one already covers the
 * wait itself, and a glyph would show through the picture's transparent parts.
 */
export function LottieSceneStage(props: LottieSceneProps) {
    const { className, style, ...scene } = props;
    const box = `${String(props.size)}px`;
    return (
        <span
            className={["happy-lottie-scene-stage", className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="lottie-scene-stage"
            style={{ ...style, height: box, width: box }}
        >
            {/* The same placeholder size an empty state uses: a stand-in, not a
                second illustration, so it does not grow to fill the square. */}
            <Icon name={GLYPHS[props.name]} size={props.size >= 128 ? 20 : 18} />
            <LottieScene {...scene} className="happy-lottie-scene-stage__art" />
        </span>
    );
}
