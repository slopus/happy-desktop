/*
 * The video's two chapters, its opening and its closing cards, placed by the
 * takes' own cues so a re-recorded take needs no retiming here. Both cuts use
 * it; each names its stage, where its camera goes, and how it ends.
 *
 * The opening's two lines stand on the backdrop; the window rises under them,
 * then the lines give way to chapter 1's caption and the camera makes one
 * eased move in. Chapter 2 is named by a short card, opens on the working
 * rows for the progress and the badge, and eases out once
 * Activity opens; the moment Activity spends loading after the click is left
 * out. The take itself steps down Activity, one cover at a time.
 *
 * Takes, by `--take` name, each the multiplayer demo with that MULTIPLAYER_SHOT:
 * aware, activity.
 */
const move = 0.8;

const opening = [
    { text: "Today most tasks start as conversations with agents.", at: -0.3 },
    { text: "Happy is built around this idea.", at: 1.2 },
];
const awareTitle = "See who’s working on what";
const activityTitle = "See the most important updates from the team";

/**
 * @param stage  the frame, window and stage (`stage.mjs`)
 * @param views  `openingTop`: the window's top in the frame once it has risen;
 *               `aware`: chapter 1's close view; `progress`: chapter 2's close
 *               view before the click; `activity`: Activity's view after it;
 *               `activityUntil`: the step whose rest ends chapter 2, and how
 *               long it holds; `loading`: when, after the click, Activity
 *               starts loading and has drawn its feed
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

    // The intro holds the first recorded frame until the camera has moved in.
    const aware = cues.aware;
    const riseFrom = 4.5;
    const risen = 5.9;
    const captionFrom = 6.2;
    const freeze = risen + 0.4 + move;
    const lineHeight = Math.round(stage.type.opening * 1.15);
    const lineGap = Math.round(lineHeight * 0.18);
    const linesTop = Math.round((views.openingTop - 2 * lineHeight - lineGap) / 2);
    const lines = opening.map((line, index) => ({
        ...line,
        top: linesTop + index * (lineHeight + lineGap),
    }));
    // Both lines stand still for three seconds before the words and window rise.
    const drop = Math.round(output.height / 2 - lineHeight / 2 - linesTop);

    const activity = cues.activity;
    // Enter on the working rows, just before List cache finishes. Leave out
    // the stationary wait after the badge and one second of the first cover.
    const activityFrom = activity.open + 1.2;
    const [restStep, restSeconds] = views.activityUntil;
    const click = activity["activity-click"];
    const skips = [
        [activity["parent-done"] + 0.1, activity["parent-done"] + 1.6],
        [click + views.loading[0], click + views.loading[1]],
        [activity["activity-open"] + 2.1, activity["activity-open"] + 3.1],
    ];
    const skippedBefore = (at) =>
        skips.reduce((total, [from, to]) => total + Math.max(0, Math.min(at, to) - from), 0);
    const onCut = (at) => at - activityFrom - skippedBefore(at);
    const until = activity[restStep] + restSeconds;

    return {
        ...stage,
        segments: [
            chapter("aware", 0, aware["back-open"] + 1.0, {
                freeze,
                title: awareTitle,
                titleFrom: captionFrom,
                titleTo: freeze + aware["arrival-settled:Offline Drafts"] + 0.9,
                opening: { lines, rise: [riseFrom, risen], out: captionFrom, drop },
                camera: [
                    { at: 0, ...whole(output.height) },
                    { at: risen, move: risen - riseFrom, ...whole(views.openingTop) },
                    {
                        at: captionFrom + 0.4 + move,
                        move,
                        css: { scale: stage.push, ...views.aware },
                    },
                    // Once both tasks have landed the camera settles on the
                    // tasks and the conversation: opening a task leaves its
                    // Activity entry unread, and the badge is not this
                    // chapter's subject.
                    {
                        at: freeze + aware["arrival-settled:Offline Drafts"] + 0.6 + move,
                        move,
                        css: views.awareTasks,
                    },
                ],
            }),
            { kind: "card", text: activityTitle, seconds: 2.4, entrance: "after-window" },
            chapter("activity", activityFrom, until - skippedBefore(until), {
                skips,
                camera: [
                    { at: 0, css: { scale: stage.push, ...views.progress } },
                    {
                        at: onCut(activity["activity-open"] + 0.3),
                        move,
                        css: views.activity,
                    },
                ],
            }),
            ...ending,
        ],
    };
}
