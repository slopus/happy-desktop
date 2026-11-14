import squareCut from "./cut-square.mjs";
import { ending } from "./ending.mjs";
import { chapters } from "./chapters.mjs";
import { square } from "./stage.mjs";

const centred = (scale) => (square.stage.x - (square.output.width - 764 * scale) / 2) / scale;
export default (cues) => {
    // The same views and capture as the full square; only two beats are omitted.
    const full = squareCut(cues);
    const aware = full.segments.find((s) => s.take === "aware").camera.at(-1).css;
    return {
        ...chapters(
            square,
            {
                awareTasks: aware,
                repos: { scale: 1.3, x: centred(1.3), y: 230 },
                progress: { x: centred(1.3), y: 60 },
                bots: { scale: 1.2, x: centred(1.2), y: 0 },
                botsClose: { scale: 1.3, x: centred(1.3), y: 0 },
            },
            ending({ square: true, x: true }),
            cues,
            { x: true },
        ),
        id: "multiplayer-x",
    };
};
