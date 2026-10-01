import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
    deviceScaleFactor,
    margin,
    output,
    scene,
    window as windowRectangle,
    windowRadius,
} from "./scene.mjs";

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

/** Work acceleration stays separate from both subtitles and keyboard badges. */
function workSpeedLayer(below = false) {
    const x = below ? output.width - 104 - 48 : 1744;
    const y = below ? output.height - 64 - 48 : 72;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}">
            <rect x="${x}" y="${y}" width="104" height="64" rx="32" fill="rgba(8,10,14,0.88)" stroke="rgba(255,255,255,0.18)"/>
            <text x="${x + 52}" y="${y + 44}" text-anchor="middle" font-family="${fontStack}" font-size="36" font-weight="650" fill="#f4f6fb">4×</text>
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

/** Deterministic 32-bit generator, so confetti recorded twice falls the same way twice. */
function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The standard celebration, simulated once for the whole output frame.
 *
 * Two cannons at the bottom corners fire toward the centre. The motion is the
 * familiar browser-confetti model: an initial velocity that decays every
 * tick, constant gravity, a wobble and a tilt that make each piece flutter,
 * and a life that fades out. Positions are in output pixels; the model was
 * tuned for CSS pixels, so it is scaled by the delivered pixel density.
 */
export function confettiSimulate(ticks, density) {
    const random = mulberry32(0x5eed_c0f7);
    const colours = ["#26ccff", "#a25afd", "#ff5e7e", "#88ff5a", "#fcff42", "#ffa62d", "#ff36ff"];
    const cannons = [
        { x: 0.04, y: 1.02, angle: 58 },
        { x: 0.96, y: 1.02, angle: 122 },
    ];
    const pieces = [];
    for (const cannon of cannons) {
        for (let index = 0; index < 90; index += 1) {
            const spread = 58;
            const startVelocity = 62;
            pieces.push({
                x: cannon.x * output.width,
                y: cannon.y * output.height,
                angle:
                    (-cannon.angle * Math.PI) / 180 + (0.5 - random()) * ((spread * Math.PI) / 180),
                velocity: (startVelocity * 0.5 + random() * startVelocity) * density,
                colour: colours[Math.floor(random() * colours.length)],
                circle: random() < 0.3,
                wobble: random() * 10,
                wobbleSpeed: Math.min(0.11, random() * 0.1 + 0.05),
                tilt: random() * Math.PI,
                life: Math.round(ticks * (0.86 + random() * 0.14)),
                size: (8 + random() * 5) * density,
            });
        }
    }
    const gravity = 1 * density;
    const decay = 0.91;
    const frames = [];
    for (let tick = 0; tick < ticks; tick += 1) {
        const shapes = [];
        for (const piece of pieces) {
            if (tick >= piece.life) continue;
            const progress = tick / piece.life;
            const wobbleX = piece.x + 10 * density * Math.cos(piece.wobble);
            const wobbleY = piece.y + 10 * density * Math.sin(piece.wobble);
            shapes.push({
                x: wobbleX,
                y: wobbleY,
                width: piece.size * Math.abs(Math.cos(piece.tilt)) + piece.size * 0.35,
                height: piece.size * Math.abs(Math.sin(piece.tilt)) + piece.size * 0.35,
                rotation: (piece.wobble * 180) / Math.PI,
                colour: piece.colour,
                circle: piece.circle,
                opacity: 1 - progress,
            });
            piece.x += Math.cos(piece.angle) * piece.velocity;
            piece.y += Math.sin(piece.angle) * piece.velocity + gravity;
            piece.velocity *= decay;
            piece.wobble += piece.wobbleSpeed;
            piece.tilt += 0.1;
        }
        frames.push(shapes);
    }
    return frames;
}

/** One confetti tick as an SVG layer at output resolution. */
export function confettiLayer(shapes) {
    const body = shapes
        .map((shape) => {
            const transform = `translate(${shape.x.toFixed(1)} ${shape.y.toFixed(1)}) rotate(${shape.rotation.toFixed(1)})`;
            return shape.circle
                ? `<ellipse rx="${(shape.width / 2).toFixed(1)}" ry="${(shape.height / 2).toFixed(1)}" fill="${shape.colour}" opacity="${shape.opacity.toFixed(3)}" transform="${transform}"/>`
                : `<rect x="${(-shape.width / 2).toFixed(1)}" y="${(-shape.height / 2).toFixed(1)}" width="${shape.width.toFixed(1)}" height="${shape.height.toFixed(1)}" fill="${shape.colour}" opacity="${shape.opacity.toFixed(3)}" transform="${transform}"/>`;
        })
        .join("");
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}">${body}</svg>`,
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
    const rawWindow = options.demo.rawWindow === true;
    const appHeight = output.height;
    const subtitleStrip = options.demo.subtitles === "below" ? 140 : 0;
    if (subtitleStrip && (!rawWindow || options.demo.transitions !== "none"))
        throw new Error("Below-window subtitles require a raw-window take with no transitions.");
    output.height = appHeight + subtitleStrip;
    const overlay = rawWindow ? undefined : await overlayBuild(appearance);
    const captions = new Map();
    const cards = new Map();
    const stickers = new Map();
    const typingSpeed = typingSpeedLayer();
    const workSpeed = workSpeedLayer(subtitleStrip > 0);
    // The delivered pixel density: output pixels per CSS pixel of the app.
    const density = deviceScaleFactor * (output.width / (frames[0]?.camera.width ?? output.width));
    let confetti;
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
                ...(overlay ? [{ input: overlay, left: 0, top: 0 }] : []),
            ])
            .png({ compressionLevel: 0 })
            .toBuffer();

        let pipeline = sharp(composed)
            .extract(entry.camera)
            .resize(output.width, appHeight, {
                kernel: "lanczos3",
                fit: "contain",
                background: rawWindow ? "#212121" : "#090b10",
            });
        if (subtitleStrip)
            pipeline = pipeline.extend({ bottom: subtitleStrip, background: "#111318" });
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
        if (entry.confetti) {
            confetti ??= confettiSimulate(entry.confetti.ticks, density);
            const shapes = confetti[entry.confetti.tick];
            if (shapes?.length) layers.push({ input: confettiLayer(shapes) });
        }
        if (entry.typingSpeed === 3) layers.push({ input: typingSpeed });
        if (entry.playbackSpeed === 4) layers.push({ input: workSpeed });
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
    const introCount = options.demo.transitions === "none" ? 0 : Math.round(options.fps * 1.1);
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
    const outroCount = options.demo.transitions === "none" ? 0 : Math.round(options.fps * 0.7);
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
            .map(
                (file) =>
                    `file '${file}'\noption framerate ${options.fps}\nduration ${(1 / options.fps).toFixed(9)}`,
            )
            .join("\n") + "\n",
        "utf8",
    );
    return { listing, introFrames: introCount, outroFrames: outroCount };
}
