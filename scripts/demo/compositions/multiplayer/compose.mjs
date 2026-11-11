/*
 * The multiplayer video's cut: recorded takes of the app window, laid whole
 * on the site's dark backdrop, with a title under each chapter and a card
 * between chapters.
 *
 *   node scripts/demo/compositions/multiplayer/compose.mjs <cut.mjs> \
 *       --take aware=<take.mp4> [--take bots=<take.mp4> ...] \
 *       --out <directory> [--stills 0,0.6,4.5]
 *
 * Nothing here retimes or repaints the app. A window segment is a take's own
 * frames from `from` to `to`, scaled as one picture; the only things drawn
 * over the window are macOS's window buttons (the take reserves their lane)
 * and, where a segment asks for it, a slight even dimming of the session
 * pane. Geometry is in output pixels; `css` values are CSS pixels of the
 * recorded window.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = resolve(import.meta.dirname, "../../../..");
const sharp = createRequire(resolve(workspace, "package.json"))("sharp");
const gymRequire = createRequire(resolve(workspace, "packages/happy-desktop-gym/package.json"));

const decodeColour =
    "flags=lanczos+accurate_rnd+full_chroma_int:in_range=tv:in_color_matrix=bt709:out_range=pc";
const encodeColour = [
    "scale=in_range=pc:out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int",
    "format=yuv420p",
    "setparams=range=tv:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709",
].join(",");

function parse(argv) {
    const options = { takes: {}, stills: [] };
    const rest = [...argv];
    while (rest.length > 0) {
        const argument = rest.shift();
        if (argument === "--take") {
            const [name, path] = rest.shift().split("=");
            options.takes[name] = resolve(path);
        } else if (argument === "--out") options.out = resolve(rest.shift());
        else if (argument === "--stills") options.stills = rest.shift().split(",").map(Number);
        else if (argument === "--name") options.name = rest.shift();
        else if (!options.cut) options.cut = resolve(argument);
        else throw new Error(`Unknown argument: ${argument}`);
    }
    if (!options.cut || !options.out) throw new Error("Name a cut and --out.");
    return options;
}

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
const ease = cubicBezier([0.45, 0, 0.2, 1]);

const svg = (width, height, body, viewBox) =>
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"${
            viewBox ? ` viewBox="${viewBox}"` : ""
        }>${body}</svg>`,
    );

// ---------------------------------------------------------------- text and backdrop

async function fontFace(family, file, weight) {
    const data = await readFile(join(import.meta.dirname, "fonts", file));
    return `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/woff2;base64,${data.toString("base64")}) format("woff2"); }`;
}

/** Chromium draws every still layer once: the backdrop, the titles, the cards. */
async function layersDraw(cut) {
    const { chromium } = gymRequire("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--force-color-profile=srgb"] });
    const { width, height } = cut.output;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const palette = cut.palette;
    const style = `
        ${await fontFace("IBM Plex Sans", "ibm-plex-sans-latin.woff2", "400 700")}
        ${await fontFace("Bricolage Grotesque", "bricolage-grotesque-latin.woff2", "200 800")}
        html, body { margin: 0; background: transparent; }
        body { width: ${width}px; height: ${height}px; overflow: hidden; position: relative;
            font-family: "IBM Plex Sans"; -webkit-font-smoothing: antialiased; color: #fff; }
        .backdrop { position: absolute; inset: 0; background:
            radial-gradient(ellipse 900px 700px at 100% 0%, ${palette.glow}66, ${palette.patch}33 45%, transparent 72%),
            radial-gradient(ellipse 900px 700px at 0% 100%, ${palette.glow}55, ${palette.patch}2b 45%, transparent 72%),
            radial-gradient(ellipse 700px 500px at 0% 0%, ${palette.violet}2e, transparent 70%),
            radial-gradient(ellipse 700px 500px at 100% 100%, ${palette.violet}2e, transparent 70%),
            ${palette.back}; }
        .grain { position: absolute; inset: 0; opacity: 0.16; mix-blend-mode: screen; }
        .title { position: absolute; left: 0; right: 0; text-align: center; font-weight: 600;
            letter-spacing: -0.025em; white-space: nowrap; }
        .card { position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; text-align: center; }
        .card h1 { margin: 0; font-weight: 600; font-size: 92px; line-height: 104px; letter-spacing: -0.03em; }
        .card .word { font-family: "Bricolage Grotesque"; font-weight: 700; font-size: 168px;
            line-height: 170px; letter-spacing: -0.03em; }
        .card p { margin: 22px 0 0; font-size: 46px; line-height: 58px; font-weight: 500;
            letter-spacing: -0.02em; color: rgba(255,255,255,0.87); }
        .card small { display: block; margin-top: 30px; font-size: 34px; line-height: 44px;
            font-weight: 500; color: ${palette.accent}; letter-spacing: -0.01em; }
    `;
    const backdrop = `<div class="backdrop"></div><svg class="grain" width="${width}" height="${height}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.75  0 0 0 0 0.7  0 0 0 0 1  0.9 0.9 0.9 0 -0.75"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
    const draw = async (body, transparent = false) => {
        await page.setContent(`<style>${style}</style>${body}`);
        await page.evaluate(() => document.fonts.ready);
        return page.screenshot({ omitBackground: transparent, type: "png" });
    };
    const escape = (value) =>
        value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const layers = { backdrop: await draw(backdrop), titles: new Map(), cards: new Map() };
    for (const segment of cut.segments) {
        if (segment.kind === "window" && segment.title && !layers.titles.has(segment.title)) {
            const band = cut.title;
            layers.titles.set(
                segment.title,
                await draw(
                    `<div class="title" style="top:${band.centerY - band.lineHeight / 2}px;font-size:${band.size}px;line-height:${band.lineHeight}px">${escape(segment.title)}</div>`,
                    true,
                ),
            );
        }
        if (segment.kind === "card")
            layers.cards.set(
                segment,
                await draw(
                    `${backdrop}<div class="card">${
                        segment.wordmark ? `<div class="word">${escape(segment.wordmark)}</div>` : ""
                    }${segment.text ? `<h1>${escape(segment.text)}</h1>` : ""}${
                        segment.line ? `<p>${escape(segment.line)}</p>` : ""
                    }${segment.small ? `<small>${escape(segment.small)}</small>` : ""}</div>`,
                ),
            );
    }
    await browser.close();
    return layers;
}

// ---------------------------------------------------------------- the window

/** macOS's window buttons, at `scale` output pixels per CSS pixel. */
function trafficLights(scale) {
    return [
        ["#ff5f57", "#e0443e"],
        ["#febc2e", "#dea123"],
        ["#28c840", "#1aab29"],
    ]
        .map(
            ([fill, stroke], index) =>
                `<circle cx="${(20 + index * 20) * scale}" cy="${20 * scale}" r="${6 * scale - 0.5}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
        )
        .join("");
}

/** What a window segment's camera shows at `t` seconds into it: the window's rectangle. */
function windowRect(cut, segment, t) {
    const rest = { x: cut.window.x, y: cut.window.y, width: cut.window.width };
    const keys = segment.camera ?? [{ at: 0, ...rest }];
    const full = keys.map((key) => ({ ...rest, ...key }));
    let rect = full[0];
    for (let index = 1; index < full.length; index += 1) {
        const from = full[index - 1];
        const to = full[index];
        const start = to.at - (to.move ?? 0.8);
        if (t <= start) break;
        const k = ease(Math.min(1, (t - start) / (to.at - start)));
        rect = {
            x: from.x + (to.x - from.x) * k,
            y: from.y + (to.y - from.y) * k,
            width: from.width + (to.width - from.width) * k,
        };
        if (t < to.at) break;
        rect = to;
    }
    const width = Math.round(rect.width);
    return {
        left: Math.round(rect.x),
        top: Math.round(rect.y),
        width,
        height: Math.round((width * cut.window.cssHeight) / cut.window.cssWidth),
    };
}

/** The part of a layer at (left, top) that falls inside the frame. */
function clip(frame, left, top, width, height) {
    const x0 = Math.max(0, left);
    const y0 = Math.max(0, top);
    const x1 = Math.min(frame.width, left + width);
    const y1 = Math.min(frame.height, top + height);
    if (x1 <= x0 || y1 <= y0) return undefined;
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0, dx: x0 - left, dy: y0 - top };
}

const overlayCache = new Map();
/** The window's own layers at one size and clipping: what is drawn over it, its shape, its shadow. */
async function windowLayers(cut, segment, rect) {
    const key = `${segment.dim ?? ""}:${segment.dimAmount ?? ""}:${rect.left}:${rect.top}:${rect.width}`;
    if (overlayCache.has(key)) return overlayCache.get(key);
    const frame = cut.output;
    const scale = rect.width / cut.window.cssWidth;
    const radius = cut.window.cssRadius * scale;
    const visible = clip(frame, rect.left, rect.top, rect.width, rect.height);
    const viewBox = `${visible.dx} ${visible.dy} ${visible.width} ${visible.height}`;
    const dim =
        segment.dim === "session"
            ? `<rect x="${cut.window.sidebarEdge * scale}" y="0" width="${rect.width}" height="${rect.height}" fill="#000" opacity="${segment.dimAmount ?? cut.dim}"/>`
            : "";
    const over = await sharp(
        svg(
            visible.width,
            visible.height,
            `${dim}${trafficLights(scale)}<rect x="0.5" y="0.5" width="${rect.width - 1}" height="${rect.height - 1}" rx="${radius}" fill="none" stroke="#fff" stroke-opacity="0.13"/>`,
            viewBox,
        ),
    )
        .png()
        .toBuffer();
    const mask = await sharp(
        svg(
            visible.width,
            visible.height,
            `<rect width="${rect.width}" height="${rect.height}" rx="${radius}" fill="#fff"/>`,
            viewBox,
        ),
    )
        .png()
        .toBuffer();
    const pad = 160;
    const shadowBox = clip(
        frame,
        rect.left - pad,
        rect.top - pad,
        rect.width + pad * 2,
        rect.height + pad * 2,
    );
    const shadow = await sharp(
        svg(
            shadowBox.width,
            shadowBox.height,
            `<rect x="${pad}" y="${pad + 24}" width="${rect.width}" height="${rect.height}" rx="${radius}" fill="#000" fill-opacity="0.55"/>`,
            `${shadowBox.dx} ${shadowBox.dy} ${shadowBox.width} ${shadowBox.height}`,
        ),
    )
        .blur(36)
        .png()
        .toBuffer();
    const layers = { visible, over, mask, shadow, shadowBox };
    if (overlayCache.size > 400) overlayCache.clear();
    overlayCache.set(key, layers);
    return layers;
}

/** A take's frames from `from` for `count` frames, as raw RGB. */
function decoderOpen(file, from, count, fps, size) {
    const child = spawn(
        "ffmpeg",
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            String(from),
            "-i",
            file,
            "-an",
            "-vf",
            `fps=${fps},scale=${size.width}:${size.height}:${decodeColour}`,
            "-frames:v",
            String(count),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "inherit"] },
    );
    const bytes = size.width * size.height * 3;
    async function* frames() {
        let frame = Buffer.allocUnsafe(bytes);
        let filled = 0;
        for await (const chunk of child.stdout) {
            let offset = 0;
            while (offset < chunk.length) {
                const take = Math.min(bytes - filled, chunk.length - offset);
                chunk.copy(frame, filled, offset, offset + take);
                filled += take;
                offset += take;
                if (filled === bytes) {
                    yield frame;
                    frame = Buffer.allocUnsafe(bytes);
                    filled = 0;
                }
            }
        }
    }
    return frames();
}

async function probe(file) {
    const child = spawn(
        "ffprobe",
        ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file],
        { stdio: ["ignore", "pipe", "inherit"] },
    );
    let out = "";
    for await (const chunk of child.stdout) out += chunk;
    const [width, height] = out.trim().split(",").map(Number);
    return { width, height };
}

// ---------------------------------------------------------------- the cut

const options = parse(process.argv.slice(2));
const cut = (await import(pathToFileURL(options.cut).href)).default;
const { width, height, fps } = cut.output;
const frame = { width, height };
await mkdir(options.out, { recursive: true });
const layers = await layersDraw(cut);
const backdropRaw = await sharp(layers.backdrop).removeAlpha().raw().toBuffer();
const raw = { raw: { width, height, channels: 3 } };

/** Every segment as a run of finished frames. */
async function* segmentFrames(segment) {
    const count = Math.round(segment.seconds * fps);
    if (segment.kind === "card") {
        const card = await sharp(layers.cards.get(segment)).removeAlpha().raw().toBuffer();
        for (let index = 0; index < count; index += 1) yield card;
        return;
    }
    const source = options.takes[segment.take];
    if (!source) throw new Error(`No --take ${segment.take}= was named.`);
    const size = await probe(source);
    const title = segment.title ? layers.titles.get(segment.title) : undefined;
    let index = 0;
    for await (const picture of decoderOpen(source, segment.from, count, fps, size)) {
        const rect = windowRect(cut, segment, index / fps);
        const made = await windowLayers(cut, segment, rect);
        const { visible } = made;
        const scaled = await sharp(picture, { raw: { ...size, channels: 3 } })
            .resize(rect.width, rect.height, { kernel: "lanczos3" })
            .extract({ left: visible.dx, top: visible.dy, width: visible.width, height: visible.height })
            .ensureAlpha()
            .raw()
            .toBuffer();
        const shaped = await sharp(scaled, {
            raw: { width: visible.width, height: visible.height, channels: 4 },
        })
            .composite([
                { input: made.over, left: 0, top: 0 },
                { input: made.mask, left: 0, top: 0, blend: "dest-in" },
            ])
            .png({ compressionLevel: 0 })
            .toBuffer();
        yield await sharp(backdropRaw, raw)
            .composite([
                { input: made.shadow, left: made.shadowBox.left, top: made.shadowBox.top },
                { input: shaped, left: visible.left, top: visible.top },
                ...(title ? [{ input: title, left: 0, top: 0 }] : []),
            ])
            .removeAlpha()
            .raw()
            .toBuffer();
        index += 1;
    }
    if (index !== count)
        throw new Error(`${segment.take} ended after ${index} of ${count} frames.`);
}

const name = options.name ?? cut.id;
const target = join(options.out, `${name}.mp4`);
const encoder = spawn(
    "ffmpeg",
    [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        `${width}x${height}`,
        "-r",
        String(fps),
        "-i",
        "pipe:0",
        "-vf",
        encodeColour,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        String(cut.encode?.crf ?? 16),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        target,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
);
const encoded = new Promise((settle, fail) => {
    encoder.once("error", fail);
    encoder.once("exit", (code) =>
        code === 0 ? settle() : fail(new Error(`ffmpeg exited with ${code}.`)),
    );
});
const write = (buffer) =>
    new Promise((settle) => {
        if (encoder.stdin.write(buffer)) settle();
        else encoder.stdin.once("drain", settle);
    });

/** A short dissolve where one segment hands to the next. */
const blend = (from, to, k) => {
    const out = Buffer.allocUnsafe(from.length);
    for (let index = 0; index < from.length; index += 1)
        out[index] = from[index] + (to[index] - from[index]) * k;
    return out;
};

const stills = new Map(options.stills.map((seconds) => [Math.round(seconds * fps), seconds]));
const timeline = [];
let total = 0;
let previous;
for (const segment of cut.segments) {
    const start = total;
    const dissolve = previous ? Math.round((cut.dissolve ?? 0) * fps) : 0;
    let index = 0;
    for await (const picture of segmentFrames(segment)) {
        const out =
            index < dissolve ? blend(previous, picture, ease((index + 1) / (dissolve + 1))) : picture;
        await write(out);
        if (stills.has(total)) {
            const seconds = stills.get(total);
            await sharp(out, raw)
                .png()
                .toFile(join(options.out, `${name}-${seconds.toFixed(2)}s.png`));
        }
        if (index === 0 && total === 0)
            await sharp(out, raw).webp({ quality: 92 }).toFile(join(options.out, `${name}-poster.webp`));
        previous = picture;
        index += 1;
        total += 1;
    }
    timeline.push({
        kind: segment.kind,
        take: segment.take,
        title: segment.title ?? segment.text ?? segment.wordmark,
        from: start / fps,
        to: total / fps,
    });
    process.stdout.write(`  ${segment.kind.padEnd(7)}${(start / fps).toFixed(2)}–${(total / fps).toFixed(2)} s  ${segment.title ?? segment.text ?? segment.wordmark ?? ""}\n`);
}
encoder.stdin.end();
await encoded;
await writeFile(
    join(options.out, `${name}.json`),
    JSON.stringify({ output: cut.output, seconds: total / fps, frames: total, timeline }, null, 2),
);
process.stdout.write(`  ${target}  (${(total / fps).toFixed(2)} s)\n`);
