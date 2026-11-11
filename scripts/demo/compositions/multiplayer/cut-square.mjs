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
            aware: { x: 0, y: 297 },
            activity: { x: 299, y: 0 },
            bots: { x: 299, y: 297 },
            artifacts: { x: 299, y: 0 },
            stepIn: { x: 299, y: 297 },
        },
        cues,
    ),
    id: "multiplayer-square",
});
