/*
 * The video's five chapters and its closing card, placed by the takes' own
 * cues so a re-recorded take needs no retiming here. Both cuts use it; each
 * names its stage and where its camera pushes in.
 *
 * Chapter 1 opens on the whole window held still, and the camera moves in
 * before the first task arrives. Every later chapter opens on the whole
 * window for about a second, while the hand does what it does in the
 * sidebar. Then the camera makes one eased move in, between events, and holds
 * still while the event lands and long enough to read it. Each later chapter
 * is named by a card held long enough to read, then by the same words under
 * the window.
 *
 * Takes, by `--take` name, each the multiplayer demo with that MULTIPLAYER_SHOT:
 * aware, activity, bots, artifacts, step-in.
 */
const cardSeconds = 2.0;
const move = 0.8;

const card = (text) => ({ kind: "card", text, seconds: cardSeconds });

/**
 * @param stage  the frame, window and stage (`stage.mjs`)
 * @param views  per chapter, the CSS corner the camera pushes in to and,
 *               where it differs from `stage.push`, its scale; `artifactPage`
 *               is where the camera goes once the artifact opens (its top),
 *               and `artifactRead` where it then reads down to; `botsGrown` is
 *               where the bots chapter's camera rises to as its conversation grows
 * @param cues   the takes' cues by take and name, in take seconds
 */
export function chapters(stage, views, cues) {
    /** The whole window, then one move in that ends `at`. */
    const pushIn = (at, view, seconds = move) => [
        { at: 0 },
        { at, move: seconds, css: { scale: stage.push, ...view } },
    ];

    /**
     * A chapter: its take from `from` to `until`, in take seconds. Where the
     * take ends sooner, on a settled window, its last frame holds.
     */
    const chapter = (take, from, until, rest) => ({
        kind: "window",
        take,
        from,
        seconds: until - from + (rest.freeze ?? 0),
        tail: Math.max(0, until - cues[take].end),
        ...rest,
    });

    const aware = cues.aware;
    // Held still for `hook` seconds, the window is pushed in on Activity and the
    // task list before the first arrival, which lands close up at about 1 s.
    const hook = Math.max(0.8, 1.0 - aware["arrival:Android Push Fixes"]);
    const awareUntil = aware["arrival-settled:Launch Email"] + 2.4;

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

    return {
        ...stage,
        id: "multiplayer",
        segments: [
            chapter("aware", 0, awareUntil, {
                freeze: hook,
                title: "See who’s working on what",
                camera: pushIn(hook, views.aware, hook - 0.2),
            }),
            card("Catch up on what shipped"),
            chapter("activity", activityFrom, activity["activity-open"] + 4.6, {
                title: "Catch up on what shipped",
                camera: pushIn(
                    activity["activity-open"] + 0.3 + move - activityFrom,
                    views.activity,
                ),
            }),
            card("Shared bots for the standing jobs"),
            chapter("bots", botsFrom, bots.report + 3.0, {
                title: "Shared bots for the standing jobs",
                camera: [
                    ...pushIn(bots["bot-opened"] + 0.2 + move - botsFrom, views.bots),
                    // The conversation grows up the pane as Steve writes and
                    // the bot answers; the camera rises with it.
                    {
                        at: bots.message + 0.7 - botsFrom,
                        move,
                        css: { scale: stage.push, ...views.botsGrown },
                    },
                ],
            }),
            card("Share what your agents make"),
            chapter("artifacts", artifactsFrom, artifacts["artifact-open"] + 9.0, {
                title: "Share what your agents make",
                camera: [
                    ...pushIn(
                        artifacts["artifacts-open"] + 0.2 + move - artifactsFrom,
                        views.artifacts,
                    ),
                    // The page's top, held to read, then one slow move down it.
                    {
                        at: artifacts["artifact-open"] + 0.2 + move - artifactsFrom,
                        move,
                        css: { scale: stage.push, ...views.artifactPage },
                    },
                    {
                        at: artifacts["artifact-open"] + 6.0 - artifactsFrom,
                        move: 1.4,
                        css: { scale: stage.push, ...views.artifactRead },
                    },
                ],
            }),
            card("Step in when it’s your call"),
            chapter("step-in", stepFrom, step.reply + 2.8, {
                title: "Step in when it’s your call",
                camera: pushIn(0.8 + move, views.stepIn),
            }),
            {
                kind: "card",
                wordmark: "Happy",
                line: "One place for you, your team, and your agents.",
                small: "Open source. Runs on your own server.",
                seconds: 3.4,
            },
        ],
    };
}
