import { chapters } from "./chapters.mjs";
import { stage } from "./stage.mjs";

/*
 * The landscape cut, 1920×1080, from 1133×700 takes. At the push the stage
 * shows about 809×415 CSS pixels: each view keeps an edge of the window in
 * frame (the left and bottom in chapter 1, the right elsewhere).
 */
export default (cues) =>
    chapters(
        stage,
        {
            // The sidebar's task list, where the new tasks land, and the open task.
            aware: { x: 0, y: 285 },
            // The Activity page's head and its newest entries.
            activity: { x: 324, y: 0 },
            // The bot's conversation, down to its composer.
            bots: { x: 324, y: 285 },
            // The Artifacts list, then the opened page, under the same view.
            artifacts: { x: 324, y: 0 },
            // The task's last turn and its composer.
            stepIn: { x: 324, y: 285 },
        },
        cues,
    );
