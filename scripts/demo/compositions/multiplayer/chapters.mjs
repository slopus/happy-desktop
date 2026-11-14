/* Fable 5.2's cut10 beat sheet, mapped onto the real takes' cue clocks. */
export function chapters(stage, views, ending, cues, { x = false } = {}) {
    const square = stage.output.width === stage.output.height;
    const aware = cues.aware;
    const repos = cues.repos;
    const activity = cues.activity;
    const bots = cues.bots;
    const skipsBefore = (skips, at) =>
        skips.reduce((n, [a, b]) => n + Math.max(0, Math.min(at, b) - a), 0);
    const window = (take, from, seconds, more) => ({
        kind: "window",
        take,
        from,
        seconds,
        ...more,
    });
    const card = (text, hold) => ({
        kind: "card",
        text,
        seconds: (square ? 1 : 1.2) + hold,
        entrance: "after-window",
        textFrom: square ? 0.5 : 0.6,
        textFade: square ? 0.5 : 0.6,
    });
    const freeze = square ? 2.1 : 2.5;
    const awareSkips = square
        ? [
              [
                  aware["arrival-settled:Desktop Alerts"] + 0.4,
                  aware["arrival-settled:Desktop Alerts"] + 0.9,
              ],
              [
                  aware["arrival-settled:Offline Drafts"] + 0.4,
                  aware["arrival-settled:Offline Drafts"] + 0.9,
              ],
              [aware["back-open"] + 0.1, aware["back-open"] + 0.6],
              [aware["leave-menu-click"] + 0.12, aware["leave-menu-click"] + 0.32],
          ]
        : [
              [aware["visit-open"] + 1.4, aware["visit-open"] + 1.9],
              [aware["back-open"] + 0.1, aware["back-open"] + 0.2333333333],
          ];
    if (x) {
        const from = aware["visit-click"] - 0.8,
            to = aware["back-open"];
        for (let i = awareSkips.length - 1; i >= 0; i--)
            if (awareSkips[i][0] >= from && awareSkips[i][1] <= to) awareSkips.splice(i, 1);
        awareSkips.push([from, to]);
    }
    const awareAt = (at) => freeze + at - skipsBefore(awareSkips, at);
    const lineHeight = Math.round(stage.type.opening * 1.15);
    const gap = Math.round(lineHeight * 0.18);
    const lines = [
        { text: "Today most tasks start as conversations with agents.", at: -0.6, fade: 0.6 },
        {
            text: "Happy is built around this idea.",
            at: square ? 2.2 : 2.4,
            fade: square ? 0.5 : 0.6,
        },
    ].map((line, i) => ({
        ...line,
        top: Math.round(stage.output.height / 2 - lineHeight - gap / 2 + i * (lineHeight + gap)),
    }));

    const repoSkips = [
        [repos["repo:agent"] + 0.59, repos["repo:ios:first"] - 0.3],
        [repos["repo:agent:first"] + 0.2, repos["repo:ios:final"] - 0.4],
        [repos["repo:ios:final"] + 0.2, repos["repo:agent:final"] - 0.1],
    ].filter(([a, b]) => b > a);
    if (square)
        repoSkips.push(
            [repos["repo:ios"] + 0.57, repos["repo:desktop-sent"]],
            [repos["repo:desktop"] + 0.57, repos["repo:agent-sent"]],
            [repos["repo:ios:first"] + 0.2, repos["repo:agent:first"] - 0.1],
        );
    const activityFrom = activity["subtask-released"] - 1.6;
    const activitySkips = [];
    const targetClick = square ? 3.4 : 4.1;
    let excess = activity["activity-click"] - activityFrom - targetClick;
    const quietTrim = (from, to, maximum = Infinity) => {
        const seconds = Math.max(0, Math.min(excess, to - from, maximum));
        if (seconds > 0) activitySkips.push([from, from + seconds]);
        excess -= seconds;
    };
    // Only stationary pauses are shortened; the reach and native click stay intact.
    quietTrim(activity["parent-done"] + 1 / 60, activity["activity-move"]);
    if (square && excess > 0.2)
        quietTrim(activity["subtask-released"] + 0.2, activity["badge-sent"] - 0.15, excess - 0.2);
    quietTrim(activity["activity-click"] - 0.45, activity["activity-click"] - 0.25, 0.2);
    const activityClick =
        activity["activity-click"] -
        activityFrom -
        skipsBefore(activitySkips, activity["activity-click"]);
    const activityMove = square ? 1 : 1.1;

    const botsFrom = bots["releases-click"] - 0.15;
    const botSkips = [];
    const alignBot = (key, wanted, previous) => {
        const excess =
            bots[`${key}-click`] - botsFrom - skipsBefore(botSkips, bots[`${key}-click`]) - wanted;
        const end = bots[`${key}-move`];
        if (excess > 0)
            botSkips.push([Math.max(bots[`${previous}-open`] + 0.7, end - excess), end]);
    };
    alignBot("growth", square ? 4.2 : 5.5, "releases");
    alignBot("health", square ? 6.55 : 8.7, "growth");
    const botAt = (at) => at - botsFrom - skipsBefore(botSkips, at);
    const rest = stage.window.width / stage.window.cssWidth;
    const whole = {
        scale: rest,
        x: (stage.stage.x - stage.window.x) / rest,
        y: (stage.stage.y - 120) / rest,
    };
    return {
        ...stage,
        segments: [
            { kind: "card", seconds: square ? 5.6 : 6.4, opening: { lines } },
            window("aware", 0, x ? 9.1 : square ? 13.2 : 16.4, {
                freeze,
                skips: awareSkips,
                title: "See who's working on what",
                titleFrom: square ? 1.7 : 2,
                titleTo: square ? 6 : 7,
                captions: [
                    {
                        text: "Not interested? Leave it.",
                        from: square ? awareAt(aware["leave-menu-click"]) - 1 : 11.9,
                        to: square ? (x ? 9.3 : 13.4) : 16.6,
                    },
                ],
                camera: [
                    { at: 0, css: whole },
                    { at: square ? 1.2 : 1.3, css: whole },
                    { at: freeze, move: square ? 0.9 : 1.2, css: views.awareTasks },
                ],
            }),
            window("repos", repos["repo:ios"] - (square ? 1 : 1.2), square ? 4.8 : 5.8, {
                entrance: "in-app",
                skips: repoSkips,
                title: "One task, across all your repos",
                titleFrom: 0.5,
                titleTo: square ? 4.8 : 5.8,
                camera: [
                    { at: 0, css: views.awareTasks },
                    { at: 1, move: 1, css: views.repos },
                ],
            }),
            card("See the most important updates from the team", square ? 3 : 3.4),
            window("activity", activityFrom, square ? 7 : 8.6, {
                skips: activitySkips,
                camera: [
                    { at: 0, css: { scale: stage.push, ...views.progress } },
                    { at: activityClick + activityMove, move: activityMove, css: views.bots },
                ],
            }),
            card("Shared bots own the recurring work", square ? 2.5 : 2.8),
            window("bots", botsFrom, x ? 7.05 : square ? 9.6 : 12, {
                skips: botSkips,
                ...(x ? { until: bots["health-move"] } : {}),
                camera: [
                    { at: 0, css: views.bots },
                    { at: 3.1, move: 1.2, css: views.botsClose },
                ],
                sourceStops: {
                    growth: botAt(bots["growth-open"]),
                    health: botAt(bots["health-open"]),
                },
            }),
            ...ending,
        ],
    };
}
