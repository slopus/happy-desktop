import assert from "node:assert/strict";
import { mkdir, readFile, copyFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import demo, { captions } from "./demo.mjs";
import { composeFrames } from "../../lib/compose.mjs";
import { encode } from "../../lib/encode.mjs";
import { sceneConfigure } from "../../lib/scene.mjs";
import { subtitlesSrt } from "../../lib/timeline.mjs";

if (process.argv.length !== 4)
    throw new Error("Usage: node --import tsx recompose.mjs <source-take> <output-directory>");
const take = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
assert.notEqual(take, output, "Preserve the original take.");
const work = join(take, ".work", demo.id);
const source = JSON.parse(await readFile(join(work, "edited-timeline.json"), "utf8"));
const evidence = JSON.parse(await readFile(join(take, "resume.evidence.json"), "utf8"));
const sourceCaptions = [...new Set(source.map((frame) => frame.caption).filter(Boolean))];
assert.equal(sourceCaptions.length, captions.length);
assert.equal(source.length, evidence.timing.frames);
const replacements = new Map(sourceCaptions.map((text, index) => [text, captions[index]]));
const revised = source.map((frame) => ({
    ...frame,
    ...(frame.caption ? { caption: replacements.get(frame.caption) } : {}),
}));
for (const [index, frame] of revised.entries()) {
    const { caption: revisedCaption, ...revisedFootage } = frame;
    const { caption: originalCaption, ...originalFootage } = source[index];
    assert.deepEqual(revisedFootage, originalFootage);
    assert.equal(Boolean(revisedCaption), Boolean(originalCaption));
}
const composedDirectory = join(output, "composed");
await mkdir(composedDirectory, { recursive: true });
sceneConfigure(demo.geometry);
const composed = await composeFrames({
    appearance: "dark",
    demo,
    fps: evidence.timing.fps,
    frames: revised,
    sourceDirectory: join(work, "capture"),
    targetDirectory: composedDirectory,
    onProgress: (count, total) => {
        if (count % 250 === 0) console.log(`Composing ${count}/${total}`);
    },
});
assert.equal(composed.introFrames, 0);
assert.equal(composed.outroFrames, 0);
await writeFile(join(output, "edited-timeline.json"), JSON.stringify(revised, null, 2));
await copyFile(join(take, "resume.evidence.json"), join(output, "resume.evidence.json"));
await writeFile(join(output, "resume.srt"), subtitlesSrt(revised, evidence.timing.fps));
await writeFile(
    join(output, "revision.json"),
    JSON.stringify(
        {
            sourceTake: take,
            capturedSourceSha: evidence.sourceSha,
            sourceFrames: source.length,
            outputFrames: revised.length,
            fps: evidence.timing.fps,
            captions,
            footageAndCueIntervalsUnchanged: true,
            nativeRunsUnchanged: true,
        },
        null,
        2,
    ),
);
await encode({
    fps: evidence.timing.fps,
    frames: revised.length,
    listing: composed.listing,
    numbered: true,
    target: join(output, "resume.mp4"),
});
console.log(`${output}: ${revised.length} unchanged footage frames; captions revised.`);
