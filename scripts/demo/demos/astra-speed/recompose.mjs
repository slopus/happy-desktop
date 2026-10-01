import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import demo from "./demo.mjs";
import { composeFrames } from "../../lib/compose.mjs";
import { encode } from "../../lib/encode.mjs";
import { soundtrackWrite } from "../../lib/sounds.mjs";
import { subtitlesSrt, timelineEdit } from "../../lib/timeline.mjs";
import { output as sceneOutput } from "../../lib/scene.mjs";

if (process.argv.length !== 5) {
    throw new Error(
        "Usage: node scripts/demo/demos/astra-speed/recompose.mjs <raw-take-directory> <revision.json> <output-directory>. The raw take must have been captured with --keep-frames.",
    );
}
const take = resolve(process.argv[2]);
const revisionPath = resolve(process.argv[3]);
const manifest = JSON.parse(await readFile(revisionPath, "utf8"));
const revision = manifest.revision;
const fps = manifest.fps;
assert.ok(Number.isInteger(fps) && fps > 0 && fps <= 60);
assert.ok(["dark", "light"].includes(manifest.appearance));
const output = resolve(process.argv[4]);
assert.notEqual(
    output,
    resolve(import.meta.dirname, "selected"),
    "Write a new cut outside the committed selected delivery.",
);
const work = join(take, ".work", "astra-speed");
const source = JSON.parse(await readFile(join(work, "timeline.json"), "utf8"));
assert.equal(
    source.length,
    manifest.sourceFrames,
    "This revision belongs to a different raw take; choose frame ranges for the new capture.",
);
const sounds = JSON.parse(await readFile(join(work, "sounds.json"), "utf8"));
const framing = JSON.parse(await readFile(join(take, "framing.json"), "utf8"));
sceneOutput.width = framing.output.width;
sceneOutput.height = framing.output.height;
assert.ok(revision.segments.length > 0);
const selected = [];
const originalToSelected = new Map();
let previousTo = 0;
for (const segment of revision.segments) {
    assert.ok(Number.isInteger(segment.from) && Number.isInteger(segment.to));
    assert.ok(
        segment.from >= previousTo && segment.from < segment.to && segment.to <= source.length,
    );
    if (segment.playbackSpeed !== undefined) assert.ok([1, 4].includes(segment.playbackSpeed));
    for (let index = segment.from; index < segment.to; index++) {
        originalToSelected.set(index, selected.length);
        selected.push({
            ...source[index],
            originalTimelineFrame: index,
            ...(segment.caption !== undefined ? { caption: segment.caption } : {}),
            ...(segment.playbackSpeed !== undefined
                ? { playbackSpeed: segment.playbackSpeed }
                : {}),
        });
    }
    previousTo = segment.to;
}
if (revision.finalHoldFrames !== undefined) {
    assert.ok(Number.isInteger(revision.finalHoldFrames) && revision.finalHoldFrames >= 0);
    assert.equal(selected.at(-1).originalTimelineFrame, source.length - 1);
    for (let index = 0; index < revision.finalHoldFrames; index++) {
        selected.push({ ...selected.at(-1), playbackSpeed: 1, editorialFinalHold: true });
    }
}
for (const hold of revision.resultHolds ?? []) {
    assert.ok(Number.isInteger(hold.frame) && hold.frame >= 0 && hold.frame < source.length);
    assert.ok(Number.isInteger(hold.frames) && hold.frames > 0);
    assert.equal(typeof hold.caption, "string");
    for (let index = 0; index < hold.frames; index++) {
        selected.push({
            ...source[hold.frame],
            caption: hold.caption,
            playbackSpeed: 1,
            originalTimelineFrame: hold.frame,
            editorialResultHold: true,
        });
    }
}
const edited = timelineEdit(
    selected,
    sounds
        .filter((event) => originalToSelected.has(event.frame))
        .map((event) => ({ ...event, frame: originalToSelected.get(event.frame) })),
);
await mkdir(join(output, "composed"), { recursive: true });
await writeFile(
    join(output, "revision.json"),
    JSON.stringify(
        {
            sourceTake: relative(output, take),
            sourceTimeline: relative(output, join(work, "timeline.json")),
            sourceFrames: source.length,
            fps,
            appearance: manifest.appearance,
            revision,
            retainedFrames: selected.length,
            outputFrames: edited.frames.length,
            nativeRunsUnchanged: true,
        },
        null,
        2,
    ),
);
await writeFile(join(output, "edited-timeline.json"), JSON.stringify(edited.frames, null, 2));
const composed = await composeFrames({
    appearance: manifest.appearance,
    demo,
    fps,
    frames: edited.frames,
    sourceDirectory: join(work, "capture"),
    targetDirectory: join(output, "composed"),
    onProgress: (count, total) => {
        if (count % 250 === 0) console.log(`Composing ${count}/${total}`);
    },
});
assert.equal(composed.introFrames, 0);
assert.equal(composed.outroFrames, 0);
await writeFile(join(output, "astra-speed.srt"), subtitlesSrt(edited.frames, fps));
const soundtrack = await soundtrackWrite(
    edited.sounds,
    fps,
    edited.frames.length,
    join(output, "soundtrack.wav"),
);
await encode({
    fps,
    frames: edited.frames.length,
    listing: composed.listing,
    numbered: true,
    soundtrack,
    target: join(output, "astra-speed.mp4"),
});
console.log(
    JSON.stringify(
        { output, seconds: edited.frames.length / fps, nativeRunsUnchanged: true },
        null,
        2,
    ),
);
