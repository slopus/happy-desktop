import { chapters } from "./chapters.mjs";
import { stage } from "./stage.mjs";
import { ending } from "./ending.mjs";

/*
 * The landscape cut, 1920×1080, from 1133×800 takes. At rest the whole window
 * is 1292 pixels wide; at `stage.push` (1.45) the stage shows the window's
 * whole width by 629 rows, and Activity's view (1.3) its whole width by 701.
 * A view's `x` centres the window across the frame.
 */
const centred = (scale) => (stage.stage.x - (stage.output.width - 1133 * scale) / 2) / scale;

export default (cues) => ({
    ...chapters(
        stage,
        {
            openingTop: 164,
            // Activity and its badge, the bots, the task list, and the open conversation.
            aware: { x: centred(1.45), y: 60 },
            // The task list and the open conversation, Activity above the frame.
            awareTasks: { scale: 1.645, x: centred(1.645), y: 158 },
            progress: { x: centred(1.45), y: 60 },
            // The feed, one cover at a time, beside the sidebar.
            // Low enough that the hand parked in the title bar stays out of frame.
            activity: { scale: 1.3, x: centred(1.3), y: 66 },
            loading: [0.11, 0.38],
            activityUntil: ["step3-rest", 2.0],
        },
        ending(),
        cues,
    ),
    id: "multiplayer",
});
