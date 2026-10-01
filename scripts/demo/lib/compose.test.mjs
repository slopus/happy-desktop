import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import sharp from "sharp";
import { composeFrames } from "./compose.mjs";
import { output, margin } from "./scene.mjs";

test("subtitle strip extends the frame without covering or scaling the app", async () => {
    const root = await mkdtemp(join(tmpdir(), "happy-subtitles-"));
    const previous = { ...output };
    try {
        const target = join(root, "composed");
        await mkdir(target);
        output.width = 800;
        output.height = 500;
        await sharp({ create: { width: 800, height: 500, channels: 3, background: "#c80000" } })
            .png()
            .toFile(join(root, "source.png"));
        await composeFrames({
            appearance: "dark",
            demo: { rawWindow: true, transitions: "none", subtitles: "below" },
            frames: [
                {
                    file: "source.png",
                    camera: { left: margin, top: margin, width: 800, height: 500 },
                    caption: "Real run time",
                    playbackSpeed: 4,
                },
            ],
            fps: 60,
            sourceDirectory: root,
            targetDirectory: target,
        });
        const { data, info } = await sharp(join(target, "f000000.jpg"))
            .raw()
            .toBuffer({ resolveWithObject: true });
        assert.equal(info.width, 800);
        assert.equal(info.height, 640);
        const pixel = (x, y) => [
            ...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3),
        ];
        for (const [x, y] of [
            [0, 0],
            [400, 250],
            [799, 499],
        ]) {
            const [red, green, blue] = pixel(x, y);
            assert.ok(
                red > 190 && green < 5 && blue < 5,
                "The app's original edge pixels survive.",
            );
        }
        const [red, green, blue] = pixel(0, 639);
        assert.ok(red < 30 && green < 30 && blue < 30, "Subtitles occupy a separate dark strip.");
    } finally {
        Object.assign(output, previous);
        await rm(root, { recursive: true, force: true });
    }
});
