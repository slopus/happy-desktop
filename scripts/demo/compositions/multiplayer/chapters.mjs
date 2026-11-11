/*
 * The video's five chapters and its closing card, placed by the takes' own
 * cues so a re-recorded take needs no retiming here. Both cuts use it; each
 * names its stage and where its camera pushes in.
 *
 * Every chapter opens on the whole window for about a second, while the hand
 * does what it does in the sidebar. Then the camera makes one eased move in,
 * between events, and holds still while the event lands. Chapter 1 opens on
 * the app with no card; each later chapter is named by a short card, then by
 * the same words under the window.
 *
 * Takes, by `--take` name, each the multiplayer demo with that MULTIPLAYER_SHOT:
 * aware, activity, bots, artifacts, step-in.
 */
const cardSeconds = 0.8;
const move = 0.8;

const card = (text) => ({ kind: "card", text, seconds: cardSeconds });

/**
 * @param stage  the frame, window and stage (`stage.mjs`)
 * @param views  per chapter, the CSS corner the camera pushes in to and,
 *               where it differs from `stage.push`, its scale
 * @param cues   the takes' cues by take and name, in take seconds
 */
export function chapters(stage, views, cues) {
    /** The whole window, then one move in that ends `at`. */
    const pushIn = (at, view, seconds = move) => [
        { at: 0 },
        { at, move: seconds, css: { scale: stage.push, ...view } },
    ];

    const aware = cues.aware;
    // The first arrival lands on the whole window; the camera moves in after it.
    const awareSettled = aware["arrival-settled:Android Push Fixes"];
    const awareEnd = aware["arrival-settled:Launch Email"] + 0.8;

    const activity = cues.activity;
    const activityFrom = activity["activity-click"] - 1.0;

    const bots = cues.bots;
    const botsFrom = bots["bot-click"] - 1.0;

    const artifacts = cues.artifacts;
    const artifactsFrom = artifacts["artifacts-click"] - 1.0;

    const step = cues["step-in"];
    // The subtask reports as the question is released, and the question
    // streams after it; the camera is in and still before either.
    const stepFrom = Math.max(0, step["ask-released"] - 2.0);
    const stepPush = stepFrom + 0.8;
    // Everything in the session pane above the question, where it stands once asked.
    const question = step.rects.ask;
    const stepDim = {
        x: stage.window.sidebarEdge,
        y: 40,
        width: stage.window.cssWidth - stage.window.sidebarEdge,
        height: Math.round(question.y - 8 - 40),
    };

    return {
        ...stage,
        id: "multiplayer",
        segments: [
            {
                kind: "window",
                take: "aware",
                from: 0,
                seconds: awareEnd,
                title: "See who’s working on what",
                camera: pushIn(awareSettled + 0.2 + move, views.aware),
            },
            card("Catch up on what shipped"),
            {
                kind: "window",
                take: "activity",
                from: activityFrom,
                seconds: activity["activity-open"] + 2.5 - activityFrom,
                title: "Catch up on what shipped",
                camera: pushIn(
                    activity["activity-open"] + 0.3 + move - activityFrom,
                    views.activity,
                ),
            },
            card("Shared bots for the standing jobs"),
            {
                kind: "window",
                take: "bots",
                from: botsFrom,
                seconds: bots.report + 1.0 - botsFrom,
                title: "Shared bots for the standing jobs",
                camera: pushIn(bots["bot-opened"] + 0.2 + 0.7 - botsFrom, views.bots, 0.7),
            },
            card("Share what your agents make"),
            {
                kind: "window",
                take: "artifacts",
                from: artifactsFrom,
                seconds: artifacts["pointer-away"] + 1.0 - artifactsFrom,
                title: "Share what your agents make",
                camera: pushIn(
                    artifacts["artifacts-open"] + 0.2 + move - artifactsFrom,
                    views.artifacts,
                ),
            },
            card("Step in when it’s your call"),
            {
                kind: "window",
                take: "step-in",
                from: stepFrom,
                seconds: step.reply + 1.0 - stepFrom,
                title: "Step in when it’s your call",
                camera: pushIn(stepPush + move - stepFrom, views.stepIn),
                // Only the question is bright while it streams; the dim
                // releases over a quarter second once Kirill clicks to answer.
                dims: [
                    {
                        rect: stepDim,
                        amount: 0.55,
                        from: stepPush - stepFrom,
                        to: step.typing + 0.25 - stepFrom,
                    },
                ],
            },
            {
                kind: "card",
                wordmark: "Happy",
                line: "One place for you, your team, and your agents.",
                small: "Open source. Runs on your own server.",
                seconds: 2.6,
            },
        ],
    };
}
