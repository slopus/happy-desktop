import { chapters } from "./chapters.mjs";
import { square } from "./stage.mjs";

/*
 * The square cut, 1080×1080, from 764×700 takes (MULTIPLAYER_VIEWPORT=764x700),
 * with its own camera. At the push the stage shows about 465×403 CSS pixels:
 * the whole 420-pixel session pane, or the sidebar beside a strip of it.
 *
 * A close-up of the session pane starts at the sidebar's edge as the frame
 * draws it (344 plus the stage's 28-pixel margin over the scale), so no
 * sliver of the sidebar shows at the left; the window's right edge comes
 * into the frame instead.
 */
export default (cues) => ({
    ...chapters(
        square,
        {
            // Activity with its count, down to the newest tasks under TASKS.
            aware: { x: 0, y: 112, scale: 1.9 },
            // The checklist entry, then the benchmark's post and its cover.
            activity: { x: 357, y: 100 },
            // Steve's request and its answer; then the whole conversation.
            bots: { x: 358, y: 230, scale: 2.05 },
            botsGrown: { x: 358, y: 30, scale: 2.05 },
            // Below the title bar, which is too narrow here for the artifact's title.
            artifacts: { x: 357, y: 50 },
            artifactPage: { x: 357, y: 50 },
            artifactRead: { x: 357, y: 297 },
            // The question, Kirill's answer and the agent's reply.
            stepIn: { x: 357, y: 150 },
        },
        cues,
    ),
    id: "multiplayer-square",
});
