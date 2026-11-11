import { chapters } from "./chapters.mjs";
import { stage } from "./stage.mjs";

/*
 * The landscape cut, 1920×1080, from 1133×700 takes. At `stage.push` (2.2)
 * the stage shows about 809×415 CSS pixels; a view with its own scale shows
 * 1780/scale × 912/scale.
 */
export default (cues) =>
    chapters(
        stage,
        {
            // Activity with its count, down to the two newest tasks under TASKS.
            aware: { x: 0, y: 108, scale: 1.85 },
            // The Activity page's two newest entries: the shared checklist and
            // the benchmark's post, its summary and the top of its cover.
            activity: { x: 324, y: 105 },
            // Steve's request and its answer, low in the pane; then the whole
            // conversation, with Andrew's message and its answer.
            bots: { x: 324, y: 250 },
            botsGrown: { x: 324, y: 105 },
            // The Artifacts list; the opened page under the same view, then
            // its lower half: the trace and the next step.
            artifacts: { x: 324, y: 0 },
            artifactPage: { x: 324, y: 0 },
            artifactRead: { x: 324, y: 285 },
            // The question, Kirill's answer and the agent's reply.
            stepIn: { x: 285, y: 232, scale: 2.1 },
        },
        cues,
    );
