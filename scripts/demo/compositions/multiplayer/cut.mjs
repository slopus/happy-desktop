import { chapters } from "./chapters.mjs";
import { stage } from "./stage.mjs";

/*
 * The landscape cut, 1920×1080, from 1133×700 takes. At `stage.push` (2.2)
 * the stage shows about 809×415 CSS pixels; a view with its own scale shows
 * 1780/scale × 912/scale.
 *
 * A close-up of the session pane starts at the sidebar's edge as the frame
 * draws it (344 plus the stage's 70-pixel margin over the scale), so no
 * sliver of the sidebar shows at the left; the window's right edge comes
 * into the frame instead.
 */
export default (cues) =>
    chapters(
        stage,
        {
            // Activity with its count, down to the two newest tasks under TASKS.
            aware: { x: 0, y: 108, scale: 1.85 },
            // The Activity page's two newest entries: the shared checklist and
            // the benchmark's post, its summary and the top of its cover.
            activity: { x: 376, y: 105 },
            // Steve's request and its answer, low in the pane; then the whole
            // conversation, with Andrew's message and its answer.
            bots: { x: 376, y: 250 },
            botsGrown: { x: 376, y: 105 },
            // The Artifacts list; the opened page under the same view, then
            // its lower half: the trace and the next step.
            artifacts: { x: 376, y: 0 },
            artifactPage: { x: 376, y: 0 },
            artifactRead: { x: 376, y: 285 },
            // The question, Kirill's answer and the agent's reply.
            stepIn: { x: 377, y: 232, scale: 2.1 },
        },
        cues,
    );
