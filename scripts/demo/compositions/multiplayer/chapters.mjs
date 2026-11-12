/*
 * The video's two chapters, its opening and its closing cards, placed by the
 * takes' own cues so a re-recorded take needs no retiming here. Both cuts use
 * it; each names its stage, where its camera goes, and how it ends.
 *
 * The opening's two lines stand on the backdrop; the window rises under them,
 * then the lines give way to chapter 1's caption and the camera makes one
 * eased move in. Chapter 2 is named by a short card, opens on the whole
 * window, moves in for the progress and the badge, and eases out once
 * Activity opens. The take itself steps down Activity, one cover at a time.
 *
 * Takes, by `--take` name, each the multiplayer demo with that MULTIPLAYER_SHOT:
 * aware, activity.
 */
const move = 0.8;

const opening = [
    { text: "Today most tasks start as conversations with agents.", at: 0 },
    { text: "Happy is built around this idea.", at: 1.3 },
];
const awareTitle = "See who’s working on what";
const activityTitle = "See the most important updates from the team";

/**
 * @param stage  the frame, window and stage (`stage.mjs`)
 * @param views  `openingTop`: the window's top in the frame once it has risen;
 *               `aware`: chapter 1's close view; `progress`: chapter 2's close
 *               view before the click; `activity`: Activity's view after it;
 *               `activityUntil`: the step whose rest ends chapter 2, and how
 *               long it holds
 * @param ending the segments after chapter 2
 * @param cues   the takes' cues by take and name, in take seconds
 */
export function chapters(stage, views, ending, cues) {
    const { output, window: frameWindow } = stage;
    const rest = frameWindow.width / frameWindow.cssWidth;
    /** The window whole, at rest's scale, with its top at `top` in the frame. */
    const whole = (top) => ({
        css: {
            scale: rest,
            x: (stage.stage.x - frameWindow.x) / rest,
            y: (stage.stage.y - top) / rest,
        },
    });
    /** A chapter: its take from `from` to `until`, in take seconds; where the take ends sooner, its last frame holds. */
    const chapter = (take, from, until, more) => ({
        kind: "window",
        take,
        from,
        seconds: until - from + (more.freeze ?? 0),
        tail: Math.max(0, until - cues[take].end),
        ...more,
    });

    // Chapter 1, with the opening on its first frame held still: the first
    // task lands at about 4.4 s, after the camera has moved in.
    const aware = cues.aware;
    const risen = 2.6;
    const freeze = Math.max(risen + 0.4 + move, 4.4 - aware["arrival:Android Push Fixes"]);
    const lineHeight = Math.round(stage.type.opening * 1.15);
    const lineGap = Math.round(lineHeight * 0.18);
    const linesTop = Math.round((views.openingTop - 2 * lineHeight - lineGap) / 2);
    const lines = opening.map((line, index) => ({
        ...line,
        top: linesTop + index * (lineHeight + lineGap),
    }));
    // Before the window rises the two lines stand at the frame's middle.
    const drop = Math.round(output.height / 2 - views.openingTop / 2);

    const activity = cues.activity;
    const activityFrom = activity.open;
    const [restStep, restSeconds] = views.activityUntil;

    return {
        ...stage,
        segments: [
            chapter("aware", 0, aware["back-open"] + 2.0, {
                freeze,
                title: awareTitle,
                titleFrom: 2.8,
                opening: { lines, rise: [1.6, risen], out: 2.8, drop },
                camera: [
                    { at: 0, ...whole(output.height) },
                    { at: risen, move: risen - 1.6, ...whole(views.openingTop) },
                    { at: 2.8 + 0.4 + move, move, css: { scale: stage.push, ...views.aware } },
                ],
            }),
            { kind: "card", text: activityTitle, seconds: 1.3 },
            chapter("activity", activityFrom, activity[restStep] + restSeconds, {
                title: activityTitle,
                camera: [
                    { at: 0 },
                    { at: 0.6 + move, move, css: { scale: stage.push, ...views.progress } },
                    {
                        at: activity["activity-open"] + 0.3 - activityFrom,
                        move,
                        css: views.activity,
                    },
                ],
            }),
            ...ending,
        ],
    };
}
