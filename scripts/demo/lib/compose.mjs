import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { margin, output, scene, window as windowRectangle, windowRadius } from "./scene.mjs";

/*
 * Turns captured viewport frames into the delivered shot.
 *
 * Everything that does not change between frames is rendered once: the
 * backdrop, its shadow, and the corner cutouts are baked into a single overlay
 * whose window area is transparent. A frame is then the capture with that
 * overlay dropped on top — one composite rather than a mask, a blur, and a
 * gradient per frame — cropped to the camera and resized to the output.
 */

const workspace = resolve(import.meta.dirname, "../../..");
const rootRequire = createRequire(resolve(workspace, "package.json"));
const sharp = rootRequire("sharp");

const backdrops = {
    dark: { from: "#11131a", to: "#05060a", glow: "rgba(88,110,190,0.30)" },
    light: { from: "#eef1f7", to: "#cdd4e4", glow: "rgba(255,255,255,0.85)" },
};

const escapeXml = (value) =>
    value.replace(
        /[&<>"']/gu,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character],
    );

const fontStack = "SF Pro Display,SF Pro Text,Helvetica Neue,Helvetica,Arial,sans-serif";

/**
 * Builds the one overlay every frame is finished with.
 *
 * The window is knocked out of the backdrop rather than the app being masked,
 * which is what lets a frame cost a single composite: the app is laid down
 * first and this is dropped over it, so the rounded corners, the shadow, and
 * the backdrop all arrive at once.
 */
async function overlayBuild(appearance) {
    const colours = backdrops[appearance] ?? backdrops.dark;
    const backdrop = await sharp(
        Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}">
                <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
                        <stop offset="0" stop-color="${colours.from}"/>
                        <stop offset="1" stop-color="${colours.to}"/>
                    </linearGradient>
                    <radialGradient id="glow" cx="0.5" cy="0.06" r="0.75">
                        <stop offset="0" stop-color="${colours.glow}"/>
                        <stop offset="1" stop-color="rgba(0,0,0,0)"/>
                    </radialGradient>
                </defs>
                <rect width="${scene.width}" height="${scene.height}" fill="url(#g)"/>
                <rect width="${scene.width}" height="${scene.height}" fill="url(#glow)"/>
            </svg>`,
        ),
    )
        .png()
        .toBuffer();

    // The shadow is a blurred, slightly grown copy of the window sitting a
    // little below it. Rasterizing and blurring beats an SVG filter here
    // because librsvg's filters are the least predictable part of its renderer.
    const spread = 26;
    const shadow = await sharp(
        Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}">
                <rect x="${windowRectangle.x - spread}" y="${windowRectangle.y - spread + 34}"
                      width="${windowRectangle.width + spread * 2}" height="${windowRectangle.height + spread * 2}"
                      rx="${windowRadius + spread}" fill="rgba(0,0,0,0.62)"/>
            </svg>`,
        ),
    )
        .blur(42)
        .png()
        .toBuffer();

    const hole = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}">
            <rect x="${windowRectangle.x}" y="${windowRectangle.y}"
                  width="${windowRectangle.width}" height="${windowRectangle.height}"
                  rx="${windowRadius}" fill="#000"/>
        </svg>`,
    );

    return sharp(backdrop)
        .composite([
            { input: shadow },
            // A hairline just inside the cutout, so the app does not float
            // edgeless on the backdrop once the corners are rounded.
            {
                input: Buffer.from(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}">
                        <rect x="${windowRectangle.x + 0.5}" y="${windowRectangle.y + 0.5}"
                              width="${windowRectangle.width - 1}" height="${windowRectangle.height - 1}"
                              rx="${windowRadius}" fill="none"
                              stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
                    </svg>`,
                ),
            },
            { blend: "dest-out", input: hole },
        ])
        .png()
        .toBuffer();
}

/** The caption pill, drawn at output resolution so its text is never resampled. */
function captionLayer(text) {
    const size = 42;
    const width = Math.min(output.width - 200, Math.round(text.length * size * 0.54) + 96);
    const height = 84;
    const x = Math.round((output.width - width) / 2);
    const y = output.height - height - 48;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}">
            <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}"
                  fill="rgba(8,10,14,0.82)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
            <text x="${output.width / 2}" y="${y + height / 2 + size * 0.35}"
                  font-family="${fontStack}" font-size="${size}" font-weight="560"
                  fill="#f4f6fb" text-anchor="middle">${escapeXml(text)}</text>
        </svg>`,
    );
}

/** Editorial badge: only accelerated prompt typing may carry this marker. */
function typingSpeedLayer() {
    const width = 104;
    const height = 64;
    const x = Math.round((output.width - width) / 2);
    const y = output.height - height - 48;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}">
            <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}"
                  fill="rgba(8,10,14,0.88)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
            <text x="${x + width / 2}" y="${y + 44}" text-anchor="middle"
                  font-family="${fontStack}" font-size="36" font-weight="650" fill="#f4f6fb">3×</text>
        </svg>`,
    );
}

/** An opaque premise card, deliberately free of app content and decoration. */
function cardLayer(text) {
    const size = text.length > 42 ? 54 : 66;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}">
            <rect width="${output.width}" height="${output.height}" fill="#090b10"/>
            <text x="${output.width / 2}" y="${output.height / 2 + size * 0.35}"
                  font-family="${fontStack}" font-size="${size}" font-weight="650"
                  letter-spacing="-0.3" fill="#f4f6fb" text-anchor="middle">${escapeXml(text)}</text>
        </svg>`,
    );
}

/** Runs `work` over `items`, `limit` at a time. sharp does its work off-thread, so this scales. */
async function pool(items, limit, work) {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (let index = next++; index < items.length; index = next++)
            await work(items[index], index);
    });
    await Promise.all(runners);
}

/**
 * One sticker pose, rendered at output resolution.
 *
 * The pose arrives in scene coordinates so the sticker rides the app content
 * under any camera; this maps it through the frame's crop, scales, rotates
 * around its centre, and thins its alpha for the fade at either end of its
 * life. The source is small, so the raw-pixel alpha pass costs nothing.
 */
async function stickerRender(source, pose, camera) {
    const toOutput = output.width / camera.width;
    const size = Math.max(2, Math.round(pose.size * toOutput));
    const rotated = await sharp(source)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .rotate(pose.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    if (pose.opacity < 1) {
        for (let index = 3; index < rotated.data.length; index += 4) {
            rotated.data[index] = Math.round(rotated.data[index] * pose.opacity);
        }
    }
    const centre = {
        x: (pose.x - camera.left) * toOutput,
        y: (pose.y - camera.top) * toOutput,
    };
    return {
        input: await sharp(rotated.data, { raw: rotated.info }).png().toBuffer(),
        left: Math.round(centre.x - rotated.info.width / 2),
        top: Math.round(centre.y - rotated.info.height / 2),
    };
}

export async function composeFrames(options) {
    const { appearance, frames, onProgress, sourceDirectory, targetDirectory } = options;
    const overlay = await overlayBuild(appearance);
    const captions = new Map();
    const cards = new Map();
    const stickers = new Map();
    const typingSpeed = typingSpeedLayer();
    let done = 0;

    const stickerSource = async (name) => {
        if (!stickers.has(name)) {
            stickers.set(
                name,
                readFile(resolve(import.meta.dirname, `../assets/stickers/${name}.webp`)),
            );
        }
        return stickers.get(name);
    };

    const composeOne = async (entry, index) => {
        const capture = await readFile(join(sourceDirectory, entry.file));
        const composed = await sharp({
            create: {
                background: { b: 0, g: 0, r: 0 },
                channels: 3,
                height: scene.height,
                width: scene.width,
            },
        })
            .composite([
                { input: capture, left: margin, top: margin },
                { input: overlay, left: 0, top: 0 },
            ])
            .png({ compressionLevel: 0 })
            .toBuffer();

        let pipeline = sharp(composed)
            .extract(entry.camera)
            .resize(output.width, output.height, { kernel: "lanczos3" });
        const layers = [];
        if (entry.sticker) {
            layers.push(
                await stickerRender(
                    await stickerSource(entry.sticker.name),
                    entry.sticker,
                    entry.camera,
                ),
            );
        }
        if (entry.caption) {
            if (!captions.has(entry.caption))
                captions.set(entry.caption, captionLayer(entry.caption));
            layers.push({ input: captions.get(entry.caption) });
        }
        if (entry.typingSpeed === 3) layers.push({ input: typingSpeed });
        if (entry.card) {
            if (!cards.has(entry.card)) cards.set(entry.card, cardLayer(entry.card));
            layers.push({ input: cards.get(entry.card) });
        }
        if (layers.length > 0) pipeline = pipeline.composite(layers);
        await pipeline
            .jpeg({ chromaSubsampling: "4:4:4", quality: 95 })
            .toFile(join(targetDirectory, `f${String(index).padStart(6, "0")}.jpg`));
        done += 1;
        if (onProgress && done % 25 === 0) onProgress(done, frames.length);
    };

    await pool(frames, 6, composeOne);
    if (onProgress) onProgress(frames.length, frames.length);

    // The opener is the first shot itself: a fade up from black with a gentle
    // push-in, and nothing written over it — the work on screen is the title.
    // The fade multiplies in linear light — a power law commutes with
    // multiplication, so multiplying encoded pixels by t^(1/2.2) is the exact
    // linear-light fade — which is what keeps the midtones from dying the way
    // an encoded-space fade makes them die.
    const easeOutQuint = (t) => 1 - (1 - t) ** 5;
    const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
    const introCount = Math.round(options.fps * 1.1);
    const first = await readFile(join(targetDirectory, "f000000.jpg"));
    const intro = [];
    for (let index = 0; index < introCount; index += 1) {
        const progress = index / (introCount - 1);
        const light = easeInOutSine(progress);
        const push = 1.032 - 0.032 * easeOutQuint(progress);
        const width = Math.round(output.width * push);
        const height = Math.round(output.height * push);
        const file = join(targetDirectory, `i${String(index).padStart(6, "0")}.jpg`);
        await sharp(first)
            .resize(width, height, { kernel: "lanczos3" })
            .extract({
                left: Math.round((width - output.width) / 2),
                top: Math.round((height - output.height) / 2),
                width: output.width,
                height: output.height,
            })
            .linear((0.02 + 0.98 * light) ** (1 / 2.2), 0)
            .jpeg({ chromaSubsampling: "4:4:4", quality: 95 })
            .toFile(file);
        intro.push(file);
    }

    // The closer mirrors it: the last shot eases to black in linear light, so
    // the video never ends on a hard cut and never needs an encoder-side fade.
    const outroCount = Math.round(options.fps * 0.7);
    const last = await readFile(
        join(targetDirectory, `f${String(frames.length - 1).padStart(6, "0")}.jpg`),
    );
    const outro = [];
    for (let index = 0; index < outroCount; index += 1) {
        const progress = (index + 1) / outroCount;
        const file = join(targetDirectory, `o${String(index).padStart(6, "0")}.jpg`);
        await sharp(last)
            .linear((1 - easeInOutSine(progress)) ** (1 / 2.2), 0)
            .jpeg({ chromaSubsampling: "4:4:4", quality: 95 })
            .toFile(file);
        outro.push(file);
    }

    // ffmpeg reads one numbered sequence, so the opener is written into the
    // same run of numbers ahead of the shot rather than concatenated after.
    const listing = join(targetDirectory, "frames.txt");
    await writeFile(
        listing,
        [
            ...intro,
            ...frames.map((_, index) =>
                join(targetDirectory, `f${String(index).padStart(6, "0")}.jpg`),
            ),
            ...outro,
        ]
            .map((file) => `file '${file}'\nduration ${(1 / options.fps).toFixed(6)}`)
            .join("\n") + "\n",
        "utf8",
    );
    return { listing, introFrames: introCount, outroFrames: outroCount };
}
