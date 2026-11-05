import { EmptyState } from "../../src/EmptyState";
import { LottieScene } from "../../src/LottieScene";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-237";

/*
 * Nothing on this page moves by itself. Every specimen is `on-demand`, which is
 * the shipped code path holding the frame the animation ends on — the same
 * picture a reader with reduced motion is left with, and the same picture the
 * product settles to a few seconds after a state appears. So the page
 * photographs identically every time, and still replays under a pointer or a
 * keypress when a person is actually here to look at it.
 */

export function LottieScenePage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="One vector animation, played once and then held, drawn by ThorVG on a worker thread against an OffscreenCanvas. All rasterising happens off the main thread, which transfers the canvas once and afterwards only sends play, pause, and seek; the renderer posts back one small frame notification per frame while it runs, and none once it rests. It stops when scrolled out of view or the window is hidden, replays on a click, a fresh hover, or Enter/Space, refuses to replay while it is already running, and never loops. Under reduced motion it holds a still frame and is not a control at all."
            title="LottieScene"
        >
            <Specimen
                detail="The nineteen shipped animations at the panel size, each holding its final frame. Alien monster: people and agents share one live session. Cherry blossom: a new friendship began. Closed lock: access is secured. Cloud: work runs on hardware that is not this machine. Confetti ball: a milestone just completed. Disguised face: this machine's identity is being defined. Front-facing baby chick: a new social identity is ready to meet people. Hatching chick: something new was created. Llama: several models are combined on one job. Mirror ball: one session, channel, or moment a whole circle is in at once. Hear-no-evil monkey: nobody outside can listen to this. Open hands: a social invitation awaits a response. Owl: we are looking and nothing is found yet. Party: a group shares a celebration. Robot: an agent is ready and waiting to be told what to do. Snail: something is being read and it is taking a moment. Sparkles: the absence is the good outcome. Spider catching a bug: a safety net helps catch unintended agent actions. Wand: the missing thing is one you can make here."
                label="The vocabulary"
                number="01"
                stage="surface"
            >
                <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 16 }}>
                    <LottieScene
                        name="alien-monster"
                        play="on-demand"
                        replayLabel="Play the alien monster again"
                        size={128}
                    />
                    <LottieScene
                        name="cherry-blossom"
                        play="on-demand"
                        replayLabel="Play the cherry blossom again"
                        size={128}
                    />
                    <LottieScene
                        name="closed-lock"
                        play="on-demand"
                        replayLabel="Play the closed lock again"
                        size={128}
                    />
                    <LottieScene
                        name="cloud-variation"
                        play="on-demand"
                        replayLabel="Play the cloud again"
                        size={128}
                    />
                    <LottieScene
                        name="confetti-ball"
                        play="on-demand"
                        replayLabel="Play the confetti ball again"
                        size={128}
                    />
                    <LottieScene
                        name="disguised-face"
                        play="on-demand"
                        replayLabel="Play the disguised face again"
                        size={128}
                    />
                    <LottieScene
                        name="front-facing-baby-chick"
                        play="on-demand"
                        replayLabel="Play the front-facing baby chick again"
                        size={128}
                    />
                    <LottieScene
                        name="hatching-chick"
                        play="on-demand"
                        replayLabel="Play the hatching chick again"
                        size={128}
                    />
                    <LottieScene
                        name="llama"
                        play="on-demand"
                        replayLabel="Play the llama again"
                        size={128}
                    />
                    <LottieScene
                        name="mirror-ball"
                        play="on-demand"
                        replayLabel="Play the mirror ball again"
                        size={128}
                    />
                    <LottieScene
                        name="monkey-hear-no-evil"
                        play="on-demand"
                        replayLabel="Play the hear-no-evil monkey again"
                        size={128}
                    />
                    <LottieScene
                        name="open-hands"
                        play="on-demand"
                        replayLabel="Play the open hands again"
                        size={128}
                    />
                    <LottieScene
                        name="owl"
                        play="on-demand"
                        replayLabel="Play the owl again"
                        size={128}
                    />
                    <LottieScene
                        name="party"
                        play="on-demand"
                        replayLabel="Play the party again"
                        size={128}
                    />
                    <LottieScene
                        name="robot"
                        play="on-demand"
                        replayLabel="Play the robot again"
                        size={128}
                    />
                    <LottieScene
                        name="snail"
                        play="on-demand"
                        replayLabel="Play the snail again"
                        size={128}
                    />
                    <LottieScene
                        name="sparkles"
                        play="on-demand"
                        replayLabel="Play the sparkles again"
                        size={128}
                    />
                    <LottieScene
                        name="spider-catching-bug"
                        play="on-demand"
                        replayLabel="Play the spider catching a bug again"
                        size={128}
                    />
                    <LottieScene
                        name="wand"
                        play="on-demand"
                        replayLabel="Play the wand again"
                        size={128}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="The two sizes empty states ship: 128 in a panel, 96 in an inline block. Both are the artwork's own transparent region — there is no card, medallion, fill, or border behind a scene, which is why the stage grid runs straight through it."
                label="Sizes"
                number="02"
                stage="surface"
            >
                <div style={{ alignItems: "center", display: "flex", gap: 24 }}>
                    <LottieScene
                        name="robot"
                        play="on-demand"
                        replayLabel="Play the robot again"
                        size={128}
                    />
                    <LottieScene
                        name="robot"
                        play="on-demand"
                        replayLabel="Play the robot again"
                        size={96}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Replay is a real control. Hover one of these and it plays once more; click or tap it, or reach it with Tab and press Enter or Space, and the same thing happens. A pointer that stays inside does not start a second play, and neither does a held key: a replay is refused while one is running. Under reduced motion none of this exists — no pointer cursor, no tab stop, no accessible name — because the picture is not meant to move."
                label="Replay"
                number="03"
                stage="app"
            >
                <div style={{ alignItems: "center", display: "flex", gap: 24 }}>
                    <LottieScene
                        name="wand"
                        play="on-demand"
                        replayLabel="Play the wand again"
                        size={128}
                    />
                    <LottieScene
                        name="snail"
                        play="on-demand"
                        replayLabel="Play the snail again"
                        size={128}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="In place, above the words. The scene replaces the medallion rather than sitting inside it; the glyph the empty state already required is drawn in the same region until the artwork paints, and is what stays if the worker runtime never loads."
                label="In an empty state"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", gap: 16 }}>
                    <EmptyState
                        action={{ icon: "plus", label: "New session", onClick: () => {} }}
                        animation="robot"
                        animationPlay="on-demand"
                        description="Select a session tab or start a new one to begin."
                        icon="chat"
                        size="inline"
                        title="No session selected"
                    />
                    <EmptyState
                        animation="snail"
                        animationPlay="on-demand"
                        description="Fetching every document you can see."
                        icon="doc"
                        size="inline"
                        title="Loading documents…"
                    />
                    <EmptyState
                        animation="sparkles"
                        animationPlay="on-demand"
                        description="Nothing needs your attention right now."
                        icon="home"
                        size="inline"
                        title="You’re all caught up"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="The plain medallion, for contrast. A screen that searched and found nothing keeps it: a miss is not a settled absence, and a filter that matched nothing changes with every keystroke — art that replayed on each of them would be noise."
                label="Unanimated, for contrast"
                number="05"
                stage="app"
            >
                <EmptyState
                    description="No channels, people, messages, or files match “kryptonite”."
                    icon="search"
                    size="inline"
                    title="No results"
                />
            </Specimen>
        </ComponentPage>
    );
}
