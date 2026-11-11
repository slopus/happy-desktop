import { chapters } from "./chapters.mjs";
import { square } from "./stage.mjs";

/*
 * The square cut, 1080×1080, from 764×700 takes (MULTIPLAYER_VIEWPORT=764x700),
 * with its own camera. At the push the stage shows about 465×403 CSS pixels:
 * the whole 420-pixel session pane, or the sidebar beside a strip of it.
 */
export default (cues) => ({
    ...chapters(
        square,
        {
            // Activity with its count, down to the newest tasks under TASKS.
            aware: { x: 0, y: 112, scale: 1.9 },
            // The checklist entry, then the benchmark's post and its cover.
            activity: { x: 299, y: 100 },
            // Steve's request and its answer; then the whole conversation.
            bots: { x: 264, y: 230, scale: 2.05 },
            botsGrown: { x: 264, y: 30, scale: 2.05 },
            // Below the title bar, which is too narrow here for the artifact's title.
            artifacts: { x: 299, y: 50 },
            artifactPage: { x: 299, y: 50 },
            artifactRead: { x: 299, y: 297 },
            // The question, Kirill's answer and the agent's reply.
            stepIn: { x: 299, y: 150 },
        },
        cues,
    ),
    id: "multiplayer-square",
});
