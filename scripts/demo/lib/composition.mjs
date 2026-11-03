import { spawn, execFile as exec } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { encode } from "./encode.mjs";
import { overlaysBuild } from "./overlays.mjs";
import { soundtrackWrite } from "./sounds.mjs";
import { splitEncode } from "./split.mjs";

/*
 * Stages an already recorded take: the desktop movie and its synchronized
 * phone movie, composed onto a backdrop as one delivered shot.
 *
 * Nothing here re-records or retimes anything. Both movies are decoded in
 * lockstep from frame zero, so frame i of the output is frame i of each
 * source — the take's one shared clock. The phone's movement is a pure
 * function of that clock and the take's own focus cues.
 *
 * Static layers (backdrop, window shadow, window trim, phone shadow) are built
 * once. A frame is then the desktop laid into the window hole, the backdrop
 * overlay dropped over it, and the phone — screen, bezel, and shadow, resized
 * once from its full-resolution composite — placed on top.
 */

const execFile = promisify(exec);
const workspace = resolve(import.meta.dirname, "../../..");
const rootRequire = createRequire(resolve(workspace, "package.json"));
const sharp = rootRequire("sharp");

/** The decoder's half of encode.mjs's contract: limited BT.709 in, full-range RGB out. */
const decodeColour =
    "flags=lanczos+accurate_rnd+full_chroma_int:in_range=tv:in_color_matrix=bt709:out_range=pc";

/** CSS cubic-bezier(x1, y1, x2, y2), solved for y at x by bisection. */
function cubicBezier([x1, y1, x2, y2]) {
    const curve = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
    return (x) => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let low = 0;
        let high = 1;
        for (let step = 0; step < 40; step += 1) {
            const middle = (low + high) / 2;
            if (curve(x1, x2, middle) < x) low = middle;
            else high = middle;
        }
        return curve(y1, y2, (low + high) / 2);
    };
}

async function probe(file) {
    const { stdout } = await execFile("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,width,height,r_frame_rate,nb_frames",
        "-of",
        "json",
        file,
    ]);
    const streams = JSON.parse(stdout).streams;
    const video = streams.find((stream) => stream.codec_type === "video");
    if (!video) throw new Error(`${file} has no video stream.`);
    return { video, audio: streams.some((stream) => stream.codec_type === "audio") };
}

/** One decoder, yielding exact raw RGB frames resampled onto the output clock. */
function decoderOpen(file, filter, size) {
    const argv = ["-hide_banner", "-loglevel", "error", "-i", file, "-an", "-vf", filter];
    argv.push("-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1");
    const child = spawn("ffmpeg", argv, { stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.pause();
    const exit = new Promise((settle, fail) => {
        child.once("error", fail);
        child.once("exit", (code) =>
            code === 0 ? settle() : fail(new Error(`ffmpeg decoding ${file} exited ${code}.`)),
        );
    });
    exit.catch(() => {});
    // Frames are copied into one preallocated buffer each; concatenating
    // 64 KiB chunks into a 9 MB phone frame would be quadratic.
    async function* frames() {
        let frame = Buffer.allocUnsafe(size);
        let filled = 0;
        for await (const chunk of child.stdout) {
            let offset = 0;
            while (offset < chunk.length) {
                const count = Math.min(size - filled, chunk.length - offset);
                chunk.copy(frame, filled, offset, offset + count);
                filled += count;
                offset += count;
                if (filled === size) {
                    yield frame;
                    frame = Buffer.allocUnsafe(size);
                    filled = 0;
                }
            }
        }
        await exit;
        if (filled !== 0) throw new Error(`${file} ended inside a frame.`);
    }
    return { frames: frames(), kill: () => child.kill("SIGKILL") };
}

const svg = (width, height, body) =>
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,
    );

/** A blurred silhouette: the cheapest believable soft shadow, and the most predictable one. */
async function shadow(width, height, body, sigma) {
    return sharp(svg(width, height, body))
        .blur(sigma)
        .png()
        .toBuffer();
}

/** macOS's window buttons, at `scale` pixels per CSS pixel, for a window whose corner is at (x, y). */
function trafficLightsSvg(x, y, scale) {
    // 12 px circles, 20 px apart, the first centred 20 px from the window's corner.
    return [
        ["#ff5f57", "#e0443e"],
        ["#febc2e", "#dea123"],
        ["#28c840", "#1aab29"],
    ]
        .map(
            ([fill, stroke], index) =>
                `<circle cx="${x + (20 + index * 20) * scale}" cy="${y + 20 * scale}" r="${6 * scale - 0.5}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
        )
        .join("");
}

/**
 * The backdrop, and the window's shadow, corner mask, and trim in the
 * window's own space, so the window can be laid anywhere on the backdrop:
 * the shadow under it, the desktop masked to its corners, the trim over its
 * edge.
 */
async function desktopLayersBuild(composition, directory, measured) {
    const { output, desktop } = composition;
    const backdropSource = resolve(directory, composition.backdrop.source);
    // The photograph is softened just past its own grain: it sits behind the
    // work, and grain is the one thing in this frame that costs bits every
    // frame without telling the viewer anything.
    const backdrop = await sharp(backdropSource)
        .resize(output.width, output.height, { fit: "cover", kernel: "lanczos3" })
        .blur(composition.backdrop.blur)
        .removeAlpha()
        .raw()
        .toBuffer();
    const radius = (desktop.cssRadius * desktop.width) / desktop.cssWidth;
    // Room around the window for the ambient shadow's drop and blur.
    const pad = 140;
    const tile = { width: desktop.width + pad * 2, height: desktop.height + pad * 2 };
    const rectangle = (inset, dy, fill) =>
        `<rect x="${pad - inset}" y="${pad - inset + dy}" width="${desktop.width + inset * 2}" height="${desktop.height + inset * 2}" rx="${radius + inset}" fill="${fill}"/>`;
    // An ambient shadow that lifts the window off the photograph, and a
    // contact shadow that keeps its edge from floating.
    const ambient = await shadow(tile.width, tile.height, rectangle(8, 30, "rgba(0,0,0,0.55)"), 34);
    const contact = await shadow(tile.width, tile.height, rectangle(1, 3, "rgba(0,0,0,0.5)"), 4);
    const windowShadow = await sharp(ambient)
        .composite([{ input: contact }])
        .png()
        .toBuffer();
    const mask = await sharp(
        svg(
            desktop.width,
            desktop.height,
            `<rect width="${desktop.width}" height="${desktop.height}" rx="${radius}" fill="#fff"/>`,
        ),
    )
        .extractChannel(3)
        .raw()
        .toBuffer();
    // macOS draws its window buttons over the app's reserved lane.
    const scale = desktop.width / desktop.cssWidth;
    const trafficLights = desktop.trafficLights ? trafficLightsSvg(pad, pad, scale) : "";
    // A dark outer hairline, then the website's light inner one.
    const trim = svg(
        tile.width,
        tile.height,
        `${trafficLights}<rect x="${pad - 0.5}" y="${pad - 0.5}" width="${desktop.width + 1}" height="${desktop.height + 1}" rx="${radius + 0.5}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
         <rect x="${pad + 0.75}" y="${pad + 0.75}" width="${desktop.width - 1.5}" height="${desktop.height - 1.5}" rx="${radius - 0.75}" fill="none" stroke="rgba(255,255,255,0.17)" stroke-width="1.5"/>`,
    );
    return {
        backdrop,
        mask,
        pad,
        pictures: await picturesBuild(composition, directory, measured, scale),
        tile,
        shadow: windowShadow,
        trim: await sharp(trim).png().toBuffer(),
    };
}

/**
 * Pictures that replace the take's placeholders without shooting it again:
 * for each `composition.pictures` entry whose file exists, the image, cut to
 * the corner radius of the box the take measured for it (filmed.json's
 * `pictures`, at the take's start and end, which must agree), at `scale`
 * pixels per CSS pixel. Each layer is placed relative to the window's corner.
 */
async function picturesBuild(composition, directory, measured, scale) {
    const layers = [];
    for (const [name, file] of Object.entries(composition.pictures ?? {})) {
        const path = resolve(directory, file);
        if (!(await stat(path).catch(() => undefined))) continue;
        const box = measured?.opening?.[name];
        if (!box) throw new Error(`The take measured no box for the ${name} picture.`);
        if (JSON.stringify(box) !== JSON.stringify(measured.closing?.[name]))
            throw new Error(
                `The ${name} picture moved during the take; it cannot be swapped in the cut.`,
            );
        const width = Math.round(box.width * scale);
        const height = Math.round(box.height * scale);
        const radius = box.radius.endsWith("%")
            ? (Number.parseFloat(box.radius) / 100) * width
            : Number.parseFloat(box.radius) * scale;
        const input = await sharp(path)
            .resize(width, height, { fit: "cover", kernel: "lanczos3" })
            .ensureAlpha()
            .composite([
                {
                    input: svg(
                        width,
                        height,
                        `<rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/>`,
                    ),
                    blend: "dest-in",
                },
            ])
            .png()
            .toBuffer();
        layers.push({ input, left: Math.round(box.x * scale), top: Math.round(box.y * scale) });
    }
    return layers;
}

/** The window's traffic lights and swapped pictures as one transparent image at the window's recorded size. */
async function windowOverlayBuild(composition, directory, measured, { width, height }) {
    const scale = width / composition.desktop.cssWidth;
    return sharp(
        svg(width, height, composition.desktop.trafficLights ? trafficLightsSvg(0, 0, scale) : ""),
    )
        .composite(await picturesBuild(composition, directory, measured, scale))
        .png()
        .toBuffer();
}

/**
 * The bezel artwork and its screen mask at their own full resolution, so each
 * frame's handset is resampled exactly once, and its shadow at the focused
 * output size, where a soft blur loses nothing by being resized.
 */
async function phoneLayersBuild(composition, directory) {
    const { phone } = composition;
    const frame = resolve(directory, phone.frame);
    const { width, height } = await sharp(frame).metadata();
    const alpha = await sharp(resolve(directory, phone.alpha)).extractChannel(0).raw().toBuffer();
    // The bezel's inner edge and the screen mask are both anti-aliased on the
    // same boundary; where both are half transparent the backdrop would show
    // through as a hairline. A black underlay grown a few pixels under the
    // bezel closes it without moving the artwork.
    const underlay = await sharp(resolve(directory, phone.alpha))
        .extractChannel(0)
        .blur(3)
        .linear(4, 0)
        .raw()
        .toBuffer();
    const black = Buffer.alloc(phone.screen.width * phone.screen.height * 3);
    const underlayRgba = await sharp(black, {
        raw: { width: phone.screen.width, height: phone.screen.height, channels: 3 },
    })
        .joinChannel(underlay, {
            raw: { width: phone.screen.width, height: phone.screen.height, channels: 1 },
        })
        .png()
        .toBuffer();
    const bezel = await sharp(frame).png().toBuffer();
    const focusedWidth = phone.width * phone.focusScale;
    const scale = focusedWidth / width;
    const pad = Math.ceil(80 * phone.focusScale);
    const focused = { width: Math.round(focusedWidth), height: Math.round(height * scale) };
    const silhouette = await sharp(frame)
        .resize(focused.width, focused.height)
        .extractChannel(3)
        .raw()
        .toBuffer();
    const shadowBlack = (opacity) =>
        sharp(Buffer.alloc(focused.width * focused.height * 3), {
            raw: { width: focused.width, height: focused.height, channels: 3 },
        })
            .joinChannel(Buffer.from(silhouette.map((value) => Math.round(value * opacity))), {
                raw: { width: focused.width, height: focused.height, channels: 1 },
            })
            .png()
            .toBuffer();
    const canvas = { width: focused.width + pad * 2, height: focused.height + pad * 2 };
    const empty = { create: { ...canvas, channels: 4, background: "#00000000" } };
    const ambient = await sharp(
        await sharp(empty)
            .composite([{ input: await shadowBlack(0.6), left: pad, top: pad + 22 }])
            .png()
            .toBuffer(),
    )
        .blur(24)
        .png()
        .toBuffer();
    const contact = await sharp(
        await sharp(empty)
            .composite([{ input: await shadowBlack(0.45), left: pad, top: pad + 3 }])
            .png()
            .toBuffer(),
    )
        .blur(3)
        .png()
        .toBuffer();
    const phoneShadow = await sharp(ambient)
        .composite([{ input: contact }])
        .png()
        .toBuffer();
    return {
        alpha,
        bezel,
        canvas: { width, height },
        shadow: { image: phoneShadow, pad, focused },
        underlay: underlayRgba,
    };
}

/** How far into the phone's focus one instant is: 0 parked or away, 1 focused, eased between. */
function focusProgress(composition, focus, seconds) {
    const { phone } = composition;
    const ease = cubicBezier(phone.transition.easing);
    return Math.max(
        ...focus.map((window) =>
            seconds < window.enter
                ? 0
                : seconds < window.exit
                  ? ease((seconds - window.enter) / phone.transition.seconds)
                  : 1 - ease((seconds - window.exit) / phone.transition.seconds),
        ),
    );
}

/** Where the phone is at one instant: parked, focused, or easing between. */
function phonePose(composition, focus, seconds, canvas) {
    const { output, phone } = composition;
    const progress = focusProgress(composition, focus, seconds);
    // A phone that enters from below rises from out of frame to its pose and
    // leaves the same way; between its focus windows it is not on screen.
    if (phone.enter === "bottom") {
        const height = (phone.width * canvas.height) / canvas.width;
        const hidden = output.height + height + 40;
        return { scale: 1, left: phone.left, bottom: hidden + (phone.bottom - hidden) * progress };
    }
    const scale = 1 + (phone.focusScale - 1) * progress;
    // A phone kept clear of the desktop grows from its left edge, away from
    // the window, and never covers it.
    if (phone.clearOfDesktop) return { scale, left: phone.left, bottom: phone.bottom };
    // The website moves only the excess beyond the frame's right margin.
    const shift = Math.min(
        0,
        output.width - phone.left - phone.width * phone.focusScale - phone.focusMargin,
    );
    return { scale, left: phone.left + shift * progress, bottom: phone.bottom };
}

/** A composition that keeps its phone clear of the desktop must fit it, focused, in the frame. */
function phoneClearanceCheck(composition, canvas) {
    const { output, desktop, phone } = composition;
    if (!phone.clearOfDesktop) return;
    const width = phone.width * phone.focusScale;
    const height = (width * canvas.height) / canvas.width;
    if (phone.left < desktop.x + desktop.width)
        throw new Error("The phone must start right of the desktop window.");
    if (phone.left + width > output.width || phone.bottom - height < 0)
        throw new Error("The focused phone must stay inside the frame.");
}

/** One output frame, from one desktop frame and the phone screen at the same instant. */
async function frameCompose({
    composition,
    layers,
    desktopRgb,
    phoneRgb,
    seconds,
    focus,
    overlaysAt,
}) {
    const { output, desktop, phone } = composition;
    const screen = phone.screen;
    const masked = await sharp(phoneRgb, {
        raw: { width: screen.width, height: screen.height, channels: 3 },
    })
        .joinChannel(layers.phone.alpha, {
            raw: { width: screen.width, height: screen.height, channels: 1 },
        })
        .png({ compressionLevel: 0 })
        .toBuffer();
    const handset = await sharp({
        create: { ...layers.phone.canvas, channels: 4, background: "#00000000" },
    })
        .composite([
            { input: layers.phone.underlay, left: screen.x, top: screen.y },
            { input: masked, left: screen.x, top: screen.y },
            { input: layers.phone.bezel },
        ])
        .png({ compressionLevel: 0 })
        .toBuffer();
    const pose = phonePose(composition, focus, seconds, layers.phone.canvas);
    const width = Math.round(phone.width * pose.scale);
    const height = Math.round((width * layers.phone.canvas.height) / layers.phone.canvas.width);
    const left = Math.round(pose.left);
    const top = Math.round(pose.bottom - height);
    const handsetScaled = await sharp(handset)
        .resize(width, height, { kernel: "lanczos3" })
        .png({ compressionLevel: 0 })
        .toBuffer();
    const { shadow } = layers.phone;
    const shadowScale = width / shadow.focused.width;
    const shadowWidth = Math.round((shadow.focused.width + shadow.pad * 2) * shadowScale);
    const shadowHeight = Math.round((shadow.focused.height + shadow.pad * 2) * shadowScale);
    const shadowScaled = await sharp(shadow.image).resize(shadowWidth, shadowHeight).toBuffer();
    // Sharp clips a layer at the canvas edge only if it starts inside it; the
    // parked phone deliberately runs off the right edge, so crop it first.
    const placed = async (input, x, y, w, h) => {
        const visibleWidth = Math.min(w, output.width - x) - Math.max(0, -x);
        const visibleHeight = Math.min(h, output.height - y) - Math.max(0, -y);
        if (visibleWidth <= 0 || visibleHeight <= 0) return [];
        return [
            {
                input: await sharp(input)
                    .extract({
                        left: Math.max(0, -x),
                        top: Math.max(0, -y),
                        width: visibleWidth,
                        height: visibleHeight,
                    })
                    .toBuffer(),
                left: Math.max(0, x),
                top: Math.max(0, y),
            },
        ];
    };
    const shadowLeft = Math.round(left - shadow.pad * shadowScale);
    const shadowTop = Math.round(top - shadow.pad * shadowScale);
    const overlays = [];
    // The phone's label rides above the handset wherever it is.
    const label = overlaysAt?.phoneLabel;
    // Only while the handset itself is in frame.
    if (label && top < output.height)
        overlays.push(
            ...(await placed(
                label.png,
                Math.round(left + width / 2 - label.width / 2),
                top - label.height + 4,
                label.width,
                label.height,
            )),
        );
    for (const layer of overlaysAt ? await overlaysAt(seconds) : []) {
        const { width: w, height: h } = await sharp(layer.input).metadata();
        overlays.push(...(await placed(layer.input, layer.left, layer.top, w, h)));
    }
    // The window slides aside, on the phone's own easing, while the phone is up.
    const windowLeft = Math.round(
        desktop.x + (desktop.focusShift ?? 0) * focusProgress(composition, focus, seconds),
    );
    const { pad, tile } = layers.desktop;
    const framed = await sharp(desktopRgb, {
        raw: { width: desktop.width, height: desktop.height, channels: 3 },
    })
        .joinChannel(layers.desktop.mask, {
            raw: { width: desktop.width, height: desktop.height, channels: 1 },
        })
        .png({ compressionLevel: 0 })
        .toBuffer();
    return sharp(layers.desktop.backdrop, {
        raw: { width: output.width, height: output.height, channels: 3 },
    }).composite([
        ...(await placed(
            layers.desktop.shadow,
            windowLeft - pad,
            desktop.y - pad,
            tile.width,
            tile.height,
        )),
        { input: framed, left: windowLeft, top: desktop.y },
        ...layers.desktop.pictures.map((picture) => ({
            ...picture,
            left: windowLeft + picture.left,
            top: desktop.y + picture.top,
        })),
        ...(await placed(
            layers.desktop.trim,
            windowLeft - pad,
            desktop.y - pad,
            tile.width,
            tile.height,
        )),
        ...(await placed(shadowScaled, shadowLeft, shadowTop, shadowWidth, shadowHeight)),
        ...(await placed(handsetScaled, left, top, width, height)),
        ...overlays,
    ]);
}

/** The take's freezes, in its own frames; a take recorded at another rate cannot be cut here. */
async function freezesRead(file, fps) {
    const recorded = JSON.parse(await readFile(file, "utf8"));
    if (recorded.fps !== fps)
        throw new Error(`${file} counts ${recorded.fps}fps frames; the cut runs at ${fps}fps.`);
    return recorded.freezes;
}

/**
 * Which frames of the two takes the cut keeps, the same for both, so the
 * screens stay in step.
 *
 * Editorial speed-ups: between two cues, keep every `rate`-th frame, so the
 * stretch plays `rate` times faster. Freezes: a composition that sets
 * `cutFreezes` drops the frames the desktop capture held while its
 * screencast stalled mid-motion (the take's `freezes.json`, from the
 * director's `captureFreezes`), so the motion on either side of a stall
 * joins up instead of hanging. Returns which source frames are kept, where a
 * source frame lands on the output timeline, for re-timing the take's sounds
 * and cues, and the same rule as an ffmpeg `select` expression.
 */
function timelineRead(composition, cues, freezes) {
    const fps = composition.output.fps;
    const at = (reference) => {
        const [name, occurrence = "1"] = reference.split("#");
        const found = cues.filter((cue) => cue.name === name)[Number(occurrence) - 1];
        if (!found) throw new Error(`The cues have no "${reference}" cue.`);
        return Math.round(found.seconds * fps);
    };
    const windows = (composition.speedUps ?? []).map((entry) => {
        if (!Number.isInteger(entry.rate) || entry.rate < 2)
            throw new Error("A speed-up rate must be a whole number above 1.");
        return { from: at(entry.from), to: at(entry.to), rate: entry.rate };
    });
    const cuts = composition.cutFreezes ? freezes : [];
    const kept = (frame) =>
        windows.every(
            (window) =>
                frame < window.from ||
                frame >= window.to ||
                (frame - window.from) % window.rate === 0,
        ) && cuts.every((cut) => frame < cut.from || frame >= cut.to);
    const select = [
        ...windows.map(
            (window) =>
                `(lt(n,${window.from})+gte(n,${window.to})+not(mod(n-${window.from},${window.rate})))`,
        ),
        ...cuts.map((cut) => `(lt(n,${cut.from})+gte(n,${cut.to}))`),
    ];
    return {
        edited: windows.length > 0 || cuts.length > 0,
        cuts,
        kept,
        select: select.length === 0 ? "1" : select.join("*"),
        outputFrame: (frame) => {
            let position = 0;
            for (let source = 0; source < frame; source += 1) if (kept(source)) position += 1;
            return position;
        },
    };
}

/** Each phone-enter pairs with the next phone-exit; a take may focus the phone more than once. */
function focusRead(cues) {
    const at = (name) => cues.filter((entry) => entry.name === name).map((cue) => cue.seconds);
    const enters = at("phone-enter");
    const exits = at("phone-exit");
    if (enters.length === 0) throw new Error('The cues have no "phone-enter" cue.');
    if (enters.length !== exits.length)
        throw new Error("Every phone-enter needs exactly one phone-exit.");
    const focus = enters.map((enter, index) => ({ enter, exit: exits[index] }));
    focus.forEach((window, index) => {
        if (!(window.exit > window.enter)) throw new Error("phone-exit must follow phone-enter.");
        if (index > 0 && !(window.enter > focus[index - 1].exit))
            throw new Error("A phone-enter must follow the previous phone-exit.");
    });
    return focus;
}

/**
 * Renders a composition end to end: decode both takes in lockstep, compose,
 * encode, and refuse a result above the composition's size ceiling.
 */
export async function compositionRender({
    composition,
    directory,
    desktop,
    phone,
    cues,
    out,
    keepFrames = false,
}) {
    const started = Date.now();
    const { output } = composition;
    const cueList = JSON.parse(await readFile(cues, "utf8"));
    const focus = focusRead(cueList);
    const freezes = composition.cutFreezes
        ? await freezesRead(join(dirname(cues), "freezes.json"), output.fps)
        : [];
    const timeline = timelineRead(composition, cueList, freezes);
    const [desktopInfo, phoneInfo] = await Promise.all([probe(desktop), probe(phone)]);
    if (desktopInfo.video.r_frame_rate !== phoneInfo.video.r_frame_rate)
        throw new Error("The desktop and phone takes must share one frame rate.");
    if (
        phoneInfo.video.width !== composition.phone.screen.width ||
        phoneInfo.video.height !== composition.phone.screen.height
    )
        throw new Error(
            `The phone take must be the ${composition.phone.screen.width}×${composition.phone.screen.height} screen.`,
        );
    const work = join(out, ".work", composition.id);
    const composed = join(work, "composed");
    await rm(work, { force: true, recursive: true });
    await mkdir(composed, { recursive: true });

    process.stdout.write(`\n  ${composition.title}\n`);
    // What the take measured of its placeholder pictures, if it measured any.
    const measured = composition.pictures
        ? JSON.parse(await readFile(join(dirname(cues), "filmed.json"), "utf8")).pictures
        : undefined;
    const layers = {
        desktop: await desktopLayersBuild(composition, directory, measured),
        phone: await phoneLayersBuild(composition, directory),
    };
    phoneClearanceCheck(composition, layers.phone.canvas);
    const overlaysAt =
        composition.captions || composition.hints || composition.phone.label
            ? await overlaysBuild({ composition, cues: cueList, phoneCanvas: layers.phone.canvas })
            : undefined;
    const { width: desktopWidth, height: desktopHeight } = composition.desktop;
    const desktopDecoder = decoderOpen(
        desktop,
        `fps=${output.fps},scale=${desktopWidth}:${desktopHeight}:${decodeColour},format=rgb24`,
        desktopWidth * desktopHeight * 3,
    );
    const { width: screenWidth, height: screenHeight } = composition.phone.screen;
    const phoneDecoder = decoderOpen(
        phone,
        `fps=${output.fps},scale=${screenWidth}:${screenHeight}:${decodeColour},format=rgb24`,
        screenWidth * screenHeight * 3,
    );
    const posterFrame = Math.round(composition.poster.seconds * output.fps);
    const poster = join(out, `${composition.id}.poster.png`);
    const inFlight = new Set();
    let decoded = 0;
    let frames = 0;
    try {
        for (;;) {
            const [desktopNext, phoneNext] = await Promise.all([
                desktopDecoder.frames.next(),
                phoneDecoder.frames.next(),
            ]);
            if (desktopNext.done !== phoneNext.done)
                throw new Error(
                    "The desktop and phone takes end on different frames; they are not one timeline.",
                );
            if (desktopNext.done) break;
            const source = decoded;
            decoded += 1;
            if (!timeline.kept(source)) continue;
            const index = frames;
            frames += 1;
            const job = (async () => {
                const frame = await frameCompose({
                    composition,
                    layers,
                    desktopRgb: desktopNext.value,
                    phoneRgb: phoneNext.value,
                    // Poses and overlays follow the takes' own clock.
                    seconds: source / output.fps,
                    focus,
                    overlaysAt,
                });
                const { data, info } = await frame.raw().toBuffer({ resolveWithObject: true });
                if (index === posterFrame) await sharp(data, { raw: info }).png().toFile(poster);
                await sharp(data, { raw: info })
                    .jpeg({ chromaSubsampling: "4:4:4", quality: 95 })
                    .toFile(join(composed, `f${String(index).padStart(6, "0")}.jpg`));
            })();
            const tracked = job.finally(() => inFlight.delete(tracked));
            inFlight.add(tracked);
            if (inFlight.size >= 6) await Promise.race(inFlight);
            if (frames % 25 === 0) process.stdout.write(`\r    composing ${frames} frames`);
        }
        await Promise.all(inFlight);
    } catch (error) {
        desktopDecoder.kill();
        phoneDecoder.kill();
        await Promise.allSettled(inFlight);
        throw error;
    }
    process.stdout.write(`\r    composing ${frames} frames — done\n`);
    if (posterFrame >= frames) throw new Error("The poster instant is past the end of the take.");

    // The desktop take carries the recorded soundtrack; the phone is silent.
    // A sped-up or cut take re-mixes its sounds on the output timeline
    // instead, so nothing is pitched up or clipped.
    let soundtrack;
    if (timeline.edited) {
        const events = JSON.parse(await readFile(join(dirname(cues), "sounds.json"), "utf8"));
        soundtrack = await soundtrackWrite(
            events.map((event) => ({ ...event, frame: timeline.outputFrame(event.frame) })),
            output.fps,
            frames,
            join(work, "soundtrack.wav"),
        );
    } else if (desktopInfo.audio) {
        soundtrack = join(work, "soundtrack.wav");
        await execFile("ffmpeg", ["-y", "-v", "error", "-i", desktop, "-vn", soundtrack]);
    }
    const target = join(out, `${composition.id}.mp4`);
    const { crf, preset, audioBitrate, maximumBytes } = composition.encode;
    const { seconds } = await encode({
        audioBitrate,
        crf,
        fps: output.fps,
        frames,
        // A numbered encode reads f%06d.jpg from the listing's directory.
        listing: join(composed, "frames.txt"),
        numbered: true,
        preset,
        soundtrack,
        target,
    });
    const { size } = await stat(target);
    // The take's cues where they land in the cut.
    const cutCues = cueList.map((cue) => ({
        ...cue,
        seconds: timeline.outputFrame(Math.round(cue.seconds * output.fps)) / output.fps,
    }));
    await writeFile(
        join(out, `${composition.id}.json`),
        JSON.stringify(
            {
                desktop,
                phone,
                cues,
                focus,
                frames,
                seconds,
                bytes: size,
                freezes: timeline.cuts,
                cutCues,
            },
            null,
            2,
        ) + "\n",
    );
    if (composition.split)
        await splitEncode({
            composition,
            desktop,
            desktopSize: { width: desktopInfo.video.width, height: desktopInfo.video.height },
            // The recorded window's traffic lights and swapped pictures, at its own scale.
            windowOverlay: await windowOverlayBuild(
                composition,
                directory,
                measured,
                desktopInfo.video,
            ),
            phone,
            select: timeline.select,
            frames,
            cues: cutCues,
            soundtrack,
            out: join(out, "split"),
            work,
        });
    if (size > maximumBytes)
        throw new Error(
            `${target} is ${size} bytes, above the ${maximumBytes}-byte ceiling; raise the CRF.`,
        );
    // Kept, the composed frames and soundtrack are the master other encodes start from.
    if (!keepFrames) await rm(work, { force: true, recursive: true });
    process.stdout.write(
        `    ${target}  (${seconds.toFixed(1)}s, ${(size / 1e6).toFixed(2)} MB, took ${((Date.now() - started) / 1000).toFixed(0)}s)\n    ${poster}\n`,
    );
    return target;
}
