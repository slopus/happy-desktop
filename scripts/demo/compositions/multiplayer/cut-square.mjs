import { chapters } from "./chapters.mjs";
import { square } from "./stage.mjs";

/*
 * The square cut, 1080×1080, from 764×800 takes (MULTIPLAYER_VIEWPORT=764x800).
 * At rest the whole window is 846 pixels wide; at `square.push` (1.3) the
 * stage shows its whole width by 681 rows. Chapter 2 ends one step down
 * Activity, on the review.
 */
const centred = (scale) => (square.stage.x - (square.output.width - 764 * scale) / 2) / scale;

export default (cues) => ({
    ...chapters(
        square,
        {
            openingTop: 190,
            aware: { x: centred(1.3), y: 60 },
            awareTasks: { scale: 1.3, x: centred(1.3), y: 158 },
            progress: { x: centred(1.3), y: 60 },
            activity: { scale: 1.3, x: centred(1.3), y: 66 },
            loading: [0.11, 0.38],
            activityUntil: ["step1-rest", 1.0],
        },
        [
            {
                kind: "card",
                wordmark: "Happy",
                line: "One place for you, your team, and your agents.",
                small: "On your phone too. Free and open source.",
                seconds: 3.5,
            },
        ],
        cues,
    ),
    id: "multiplayer-square",
});
