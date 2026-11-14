/*
 * The multiplayer video's cut: recorded takes of the app window on the App
 * Store videos' moving shader backdrop, with a title under each chapter and
 * a short card between chapters.
 *
 *   node scripts/demo/compositions/multiplayer/compose.mjs <cut.mjs> \
 *       --backdrop <loop.mp4> --take aware=<take.mp4> [--take ... ] \
 *       --out <directory> [--name <name>] [--stills 4.2,9.8] [--poster 3.4]
 *
 * Nothing here retimes or repaints the app. A window segment is a take's own
 * frames from `from` for `seconds`, scaled as one picture. Its camera moves
 * between keys: each key names the part of the window to show (`css`: its
 * top-left corner and output pixels per CSS pixel) or the window whole
 * (`rest`), and the move into it ends at `at` after `move` seconds on one
 * eased curve, pan and zoom together. Pushed in, the whole window is drawn
 * larger and runs past the frame's edges; the frame alone cuts it. Where it
 * runs under the chapter's caption, the caption sits on a dark pill that
 * fades in with how much of it the window covers. Drawn over the window: macOS's
 * window buttons (the take reserves their lane), a hairline edge, and where a
 * segment asks for it an even dimming of part of the window, eased in and
 * out over a quarter second.
 *
 * A segment may hold its take's first frame (`freeze`) or last frame
 * (`tail`) still for some seconds: the take's own pixels, never repainted.
 * It may leave out stretches of its take (`skips`, pairs of take seconds
 * from and to): idle holds or a page's loading state. The segment's
 * `seconds` and camera are on the cut's clock, after those omissions.
 *
 * The first window segment may open with `opening` lines: they stand centred
 * on the backdrop, each fading in at its own time, then rise as the window
 * rises into the frame beneath them, and fade before the caption comes in.
 * A card may show `pictures` under its words, side by side.
 *
 * Segments hand over with a short dissolve. A chapter card fades the window
 * gently toward the backdrop before its words enter. The ending fades to a
 * centred native phone, playing continuously through the Happy card.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
        else if (argument === "--backdrop") options.backdrop = resolve(rest.shift());
        else if (argument === "--stills") options.stills = rest.shift().split(",").map(Number);
        else if (argument === "--poster") options.poster = Number(rest.shift());
        else if (argument === "--name") options.name = rest.shift();
        else if (!options.cut) options.cut = resolve(argument);
        else throw new Error(`Unknown argument: ${argument}`);
    }
    if (!options.cut || !options.out || !options.backdrop)
        throw new Error("Name a cut, --backdrop and --out.");
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
/** The camera's one curve: ease-in-out, no overshoot. */
const ease = cubicBezier([0.65, 0, 0.35, 1]);
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const sine = (value) => (1 - Math.cos(Math.PI * clamp01(value))) / 2;

const svg = (width, height, body, viewBox) =>
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"${
            viewBox ? ` viewBox="${viewBox}"` : ""
        }>${body}</svg>`,
    );

// ---------------------------------------------------------------- words

async function fontFace(family, file, weight) {
    const data = await readFile(join(import.meta.dirname, "fonts", file));
    return `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/woff2;base64,${data.toString("base64")}) format("woff2"); }`;
}

/** Chromium draws every piece of text once, transparent, at the frame's size. */
async function wordsDraw(cut) {
    const { chromium } = gymRequire("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--force-color-profile=srgb"] });
    const { width, height } = cut.output;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const type = cut.type;
    const ionicons = (
        await readFile(
            resolve(workspace, "packages/happy-desktop-ui/src/assets/fonts/Ionicons.ttf"),
        )
    ).toString("base64");
    const names = await readFile(
        resolve(workspace, "packages/happy-desktop-ui/src/vectorIcons/ioniconsGlyphs.ts"),
        "utf8",
    );
    const glyph = (name) => {
        const found = new RegExp(`^\\s+"?${name}"?: (0x[0-9a-f]+),$`, "mu").exec(names);
        if (!found) throw new Error(`No Ionicons glyph is named ${name}.`);
        return `<span class="glyph">&#${Number(found[1])};</span>`;
    };
    const square = width === height;
    const style = `
        ${await fontFace("IBM Plex Sans", "ibm-plex-sans-latin.woff2", "400 700")}
        ${await fontFace("Bricolage Grotesque", "bricolage-grotesque-latin.woff2", "200 800")}
        @font-face { font-family: Ionicons; src:url(data:font/ttf;base64,${ionicons}); }
        html, body { margin: 0; background: transparent; }
        body { width: ${width}px; height: ${height}px; overflow: hidden; position: relative;
            font-family: "IBM Plex Sans"; -webkit-font-smoothing: antialiased; color: #fff; }
        .shade { text-shadow: 0 2px 24px rgba(20, 0, 40, 0.45), 0 1px 3px rgba(20, 0, 40, 0.35); }
        .title { position: absolute; left: 0; right: 0; text-align: center; font-weight: 600;
            letter-spacing: -0.025em; white-space: nowrap; }
        .card { position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; text-align: center; }
        .card h1 { margin: 0; max-width: ${type.cardWidth}px; font-weight: 600; font-size: ${type.card}px;
            line-height: 1.12; letter-spacing: -0.03em; text-wrap: balance; }
        .card .word { font-family: "Bricolage Grotesque"; font-weight: 700; font-size: ${type.wordmark}px;
            line-height: 1; letter-spacing: -0.03em; }
        .card p { margin: ${type.gap}px 0 0; max-width: ${type.cardWidth}px; font-size: ${type.line}px;
            line-height: 1.25; font-weight: 500; letter-spacing: -0.02em; text-wrap: balance; }
        .card small { display: block; margin-top: ${type.gap}px; font-size: ${type.small}px; line-height: 1.25;
            font-weight: 500; letter-spacing: -0.01em; }
        .card .pictures { display: flex; gap: ${type.gap * 2}px; margin-top: ${type.gap * 2}px; }
        .card .pictures img { display: block; height: ${type.pictureHeight ?? 700}px; border-radius: ${Math.round((type.pictureHeight ?? 700) / 34)}px;
            box-shadow: 0 18px 60px rgba(18, 0, 42, 0.55); }
        .line { position: absolute; left: 0; right: 0; text-align: center; font-weight: 600;
            font-size: ${type.opening ?? type.card}px; line-height: 1.15; letter-spacing: -0.03em; white-space: nowrap; }
        .closing { position:absolute; inset:0; font-family:"IBM Plex Sans"; }
        .closing .phone { position:absolute; width:430px; aspect-ratio:1406/2822;
            left:0; top:0; }
        .closing .screen { position:absolute; left:7.25462%; top:3.543586%; width:85.775249%; height:92.912828%; object-fit:contain; background:#000; mask-mode:luminance; mask-size:100% 100%; }
        .closing .bezel { position:absolute; inset:0; width:100%; height:100%; }
        .platform-copy { position:absolute; left:0; right:0; top:930px; display:flex; flex-direction:column; align-items:center; }
        .platform-copy h1 { margin:0; font-size:48px; font-weight:600; line-height:1.03; letter-spacing:-.025em; }
        .icons { display:flex; gap:22px; margin-top:17px; font-size:38px; align-items:center; }
        .glyph { font-family:Ionicons; font-weight:400; line-height:1; }
        .brand-copy { position:absolute; left:${square ? 540 : 845}px; top:${square ? 280 : 270}px; text-align:left; }
        .brand-copy h1 { margin:0; font-size:${square ? 155 : 190}px; font-weight:600; line-height:1; letter-spacing:-.035em; }
        .brand-copy p { margin:26px 0 0; font-size:${square ? 36 : 48}px; line-height:1.3; font-weight:400; letter-spacing:-.02em; white-space:pre-line; }
        .brand-copy .stars { display:flex; align-items:center; gap:${square ? 12 : 18}px; margin-top:28px; opacity:.9; font-size:${square ? 25 : 34}px; white-space:nowrap; }
        .brand-copy .stars .glyph { margin-left:6px; }
    `;
    const draw = async (body) => {
        await page.setContent(`<style>${style}</style>${body}`);
        await page.evaluate(() => document.fonts.ready);
        return page.screenshot({ omitBackground: true, type: "png" });
    };
    const escape = (value) =>
        value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const words = {
        titles: new Map(),
        cards: new Map(),
        lines: new Map(),
        phones: new Map(),
        brands: new Map(),
    };
    const picture = async (file) =>
        `data:image/png;base64,${(await sharp(file).png().toBuffer()).toString("base64")}`;
    const device = async (phone) =>
        `<div class="phone"><img class="screen" src="${await picture(phone.screen)}" style="mask-image:url('${await picture(phone.mask)}')"><img class="bezel" src="${await picture(phone.frame)}"></div>`;
    const closing = async (segment) => {
        if (segment.layout === "brand")
            return `<div class="closing shade"><div class="brand-copy"><h1>${escape(segment.wordmark)}</h1><p>${escape(segment.line)}</p><div class="stars">${escape(segment.small)}${glyph("logo-github")}<span>${segment.stars}</span></div></div></div>`;
        return `<div class="closing platforms shade"><div class="platform-copy"><h1>On all platforms</h1><div class="icons">${["logo-apple", "logo-windows", "logo-tux", "logo-android"].map(glyph).join("")}</div></div></div>`;
    };
    for (const segment of cut.segments) {
        if (segment.layout === "brand") {
            const markup = await closing(segment);
            const layers = [];
            for (const selector of ["h1", "p", ".stars"])
                layers.push(
                    await draw(
                        `${markup}<style>.brand-copy>*{visibility:hidden}.brand-copy>${selector}{visibility:visible}</style>`,
                    ),
                );
            words.brands.set(segment, layers);
        }
        if (segment.phone) {
            const phoneWidth = 430;
            const phoneHeight = Math.round((phoneWidth * 2822) / 1406);
            const layer = await draw(`<div class="closing">${await device(segment.phone)}</div>`);
            words.phones.set(segment, {
                input: await sharp(layer)
                    .extract({ left: 0, top: 0, width: phoneWidth, height: phoneHeight })
                    .png()
                    .toBuffer(),
                width: phoneWidth,
                height: phoneHeight,
                bezel: await sharp(segment.phone.frame)
                    .resize(phoneWidth, phoneHeight)
                    .png()
                    .toBuffer(),
                screen: {
                    left: Math.round((phoneWidth * 102) / 1406),
                    top: Math.round((phoneHeight * 100) / 2822),
                    width: Math.round((phoneWidth * 1206) / 1406),
                    height: Math.round((phoneHeight * 2622) / 2822),
                },
                mask: await sharp(segment.phone.mask)
                    .resize(
                        Math.round((phoneWidth * 1206) / 1406),
                        Math.round((phoneHeight * 2622) / 2822),
                    )
                    .extractChannel(0)
                    .raw()
                    .toBuffer(),
            });
        }
        // Fixed opening lines fade independently without changing their position.
        if (segment.opening) {
            const layers = [];
            for (const line of segment.opening.lines)
                layers.push(
                    await draw(
                        `<div class="line shade" style="top:${line.top}px">${escape(line.text)}</div>`,
                    ),
                );
            words.lines.set(segment, layers);
        }
        for (const title of [
            segment.title,
            ...(segment.captions ?? []).map((caption) => caption.text),
        ].filter(Boolean)) {
            if (words.titles.has(title)) continue;
            const band = cut.title;
            const text = await draw(
                `<div class="title shade" style="top:${band.centerY - band.lineHeight / 2}px;font-size:${band.size}px;line-height:${band.lineHeight}px"><span id="words">${escape(title)}</span></div>`,
            );
            // The caption's pill, drawn under the words where the window runs beneath them.
            const box = await page.locator("#words").boundingBox();
            const pad = { x: Math.round(band.size * 0.6), y: Math.round(band.size * 0.2) };
            const pill = {
                left: Math.round(box.x - pad.x),
                top: Math.round(box.y - pad.y),
                width: Math.round(box.width + pad.x * 2),
                height: Math.round(box.height + pad.y * 2),
            };
            const back = await sharp(
                svg(
                    pill.width,
                    pill.height,
                    `<rect width="${pill.width}" height="${pill.height}" rx="${pill.height / 2}" fill="#140a22" fill-opacity="0.94"/>`,
                ),
            )
                .png()
                .toBuffer();
            words.titles.set(title, { text, pill, back });
        }
        if (segment.kind === "card")
            words.cards.set(
                segment,
                await draw(
                    segment.layout
                        ? await closing(segment)
                        : `<div class="card shade">${
                              segment.wordmark
                                  ? `<div class="word">${escape(segment.wordmark)}</div>`
                                  : ""
                          }${segment.text ? `<h1>${escape(segment.text)}</h1>` : ""}${
                              segment.line ? `<p>${escape(segment.line)}</p>` : ""
                          }${segment.small ? `<small>${escape(segment.small)}</small>` : ""}${
                              segment.pictures
                                  ? `<div class="pictures">${(
                                        await Promise.all(segment.pictures.map(picture))
                                    )
                                        .map((src) => `<img src="${src}">`)
                                        .join("")}</div>`
                                  : ""
                          }</div>`,
                ),
            );
    }
    await browser.close();
    return words;
}

/** A transparent layer at `opacity`, cached by a twentieth. */
const faded = new Map();
async function fade(layer, opacity) {
    const step = Math.round(clamp01(opacity) * 20);
    const cache = faded.get(layer) ?? new Map();
    faded.set(layer, cache);
    if (!cache.has(step))
        cache.set(
            step,
            step === 20
                ? layer
                : await sharp(layer)
                      .ensureAlpha()
                      .linear([1, 1, 1, step / 20], [0, 0, 0, 0])
                      .png()
                      .toBuffer(),
        );
    return cache.get(step);
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

/**
 * A camera key as the part of the window in view, in CSS pixels: `x`, `y` at
 * the stage's top-left corner, and `scale` output pixels per CSS pixel.
 */
function viewOf(cut, key) {
    if (!key.css) {
        const scale = cut.window.width / cut.window.cssWidth;
        return {
            x: (cut.stage.x - cut.window.x) / scale,
            y: (cut.stage.y - cut.window.y) / scale,
            scale,
        };
    }
    return key.css;
}

/** The window's rectangle in the frame at `t` seconds into a segment. */
function windowRect(cut, segment, t) {
    const keys = segment.camera ?? [{ at: 0 }];
    let view = viewOf(cut, keys[0]);
    for (let index = 1; index < keys.length; index += 1) {
        const to = keys[index];
        const start = to.at - (to.move ?? 0.8);
        if (t <= start) break;
        const from = view;
        const target = viewOf(cut, to);
        const k = ease(clamp01((t - start) / (to.at - start)));
        // The zoom changes at an even rate to the eye: its logarithm is eased.
        const scale = Math.exp(
            Math.log(from.scale) + (Math.log(target.scale) - Math.log(from.scale)) * k,
        );
        // The view's centre travels in a straight line across the stage.
        const half = { x: cut.stage.width / 2, y: cut.stage.height / 2 };
        const centre = (v) => ({ x: v.x + half.x / v.scale, y: v.y + half.y / v.scale });
        const a = centre(from);
        const b = centre(target);
        const c = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        view = { x: c.x - half.x / scale, y: c.y - half.y / scale, scale };
        if (t < to.at) break;
        view = target;
    }
    const width = Math.round(cut.window.cssWidth * view.scale);
    return {
        left: Math.round(cut.stage.x - view.x * view.scale),
        top: Math.round(cut.stage.y - view.y * view.scale),
        width,
        height: Math.round(cut.window.cssHeight * view.scale),
        scale: view.scale,
    };
}

/** Each dimmed part of the window at `t`: its CSS rectangle and how dark. */
function dimsAt(segment, t) {
    return (segment.dims ?? [])
        .map((dim) => {
            const into = clamp01((t - (dim.from ?? 0)) / 0.25);
            const out = dim.to === undefined ? 1 : clamp01((dim.to - t) / 0.25);
            return {
                rect: dim.rect,
                amount: Math.round(dim.amount * Math.min(into, out) * 50) / 50,
            };
        })
        .filter((dim) => dim.amount > 0);
}

/** The part of a rectangle inside another. */
function intersect(a, b) {
    const x0 = Math.max(a.left, b.left);
    const y0 = Math.max(a.top, b.top);
    const x1 = Math.min(a.left + a.width, b.left + b.width);
    const y1 = Math.min(a.top + a.height, b.top + b.height);
    if (x1 <= x0 || y1 <= y0) return undefined;
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}

/** What is drawn over and around the window at one size: buttons, edge, dims, its shape, its shadow. */
async function windowLayers(cut, rect, dims) {
    const frame = { left: 0, top: 0, width: cut.output.width, height: cut.output.height };
    // Pushed in, the window is simply larger: whatever falls outside the frame is cut by the frame.
    const shown = intersect(rect, frame);
    const radius = cut.window.cssRadius * rect.scale;
    const local = (x, y) => `translate(${x - shown.left} ${y - shown.top})`;
    const dimBody = dims
        .map(
            (dim) =>
                `<rect x="${dim.rect.x * rect.scale}" y="${dim.rect.y * rect.scale}" width="${dim.rect.width * rect.scale}" height="${dim.rect.height * rect.scale}" fill="#000" opacity="${dim.amount}"/>`,
        )
        .join("");
    const over = await sharp(
        svg(
            shown.width,
            shown.height,
            `<g transform="${local(rect.left, rect.top)}">${dimBody}${trafficLights(rect.scale)}<rect x="0.5" y="0.5" width="${rect.width - 1}" height="${rect.height - 1}" rx="${radius}" fill="none" stroke="#fff" stroke-opacity="0.16"/></g>`,
        ),
    )
        .png()
        .toBuffer();
    const mask = await sharp(
        svg(
            shown.width,
            shown.height,
            `<rect x="${rect.left - shown.left}" y="${rect.top - shown.top}" width="${rect.width}" height="${rect.height}" rx="${radius}" fill="#fff"/>`,
        ),
    )
        .png()
        .toBuffer();
    const pad = 150;
    const halo = intersect(
        {
            left: shown.left - pad,
            top: shown.top - pad,
            width: shown.width + pad * 2,
            height: shown.height + pad * 2,
        },
        frame,
    );
    const shadow = await sharp(
        svg(
            halo.width,
            halo.height,
            `<rect x="${rect.left - halo.left}" y="${rect.top - halo.top + 22}" width="${rect.width}" height="${rect.height}" rx="${radius}" fill="#12002a" fill-opacity="0.55"/>`,
        ),
    )
        .blur(34)
        .png()
        .toBuffer();
    return { shown, over, mask, shadow, halo };
}

/** Draw the same recorded window and frame at a new camera rectangle. */
async function windowDraw(picture, size, rect, dims) {
    const made = await windowLayers(cut, rect, dims);
    const { shown } = made;
    const scaled = await sharp(picture, { raw: { ...size, channels: 3 } })
        .resize(rect.width, rect.height, { kernel: "lanczos3" })
        .extract({
            left: shown.left - rect.left,
            top: shown.top - rect.top,
            width: shown.width,
            height: shown.height,
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
    const shaped = await sharp(scaled, {
        raw: { width: shown.width, height: shown.height, channels: 4 },
    })
        .composite([
            { input: made.over, left: 0, top: 0 },
            { input: made.mask, left: 0, top: 0, blend: "dest-in" },
        ])
        .png({ compressionLevel: 0 })
        .toBuffer();
    return [
        { input: made.shadow, left: made.halo.left, top: made.halo.top },
        { input: shaped, left: shown.left, top: shown.top },
    ];
}

/** Clip a translated layer to the output without changing its opacity. */
async function translated(input, size, left, top) {
    const shown = intersect({ left, top, ...size }, { left: 0, top: 0, width, height });
    if (!shown) return [];
    return [
        {
            input: await sharp(input)
                .extract({
                    left: shown.left - left,
                    top: shown.top - top,
                    width: shown.width,
                    height: shown.height,
                })
                .png()
                .toBuffer(),
            left: shown.left,
            top: shown.top,
        },
    ];
}

// ---------------------------------------------------------------- decoding

function framesOf(child, bytes) {
    return (async function* () {
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
    })();
}

/** A take's frames from `from` for `count` frames, as raw RGB at its own size. */
function takeOpen(file, from, count, fps, size) {
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
    return framesOf(child, size.width * size.height * 3);
}

/** The backdrop loop, endlessly, covering the frame. */
function backdropOpen(file, fps, size) {
    const child = spawn(
        "ffmpeg",
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-stream_loop",
            "-1",
            "-i",
            file,
            "-an",
            "-vf",
            `fps=${fps},scale=${size.width}:${size.height}:force_original_aspect_ratio=increase:${decodeColour},crop=${size.width}:${size.height}`,
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "inherit"] },
    );
    const frames = framesOf(child, size.width * size.height * 3);
    return { next: async () => (await frames.next()).value, kill: () => child.kill("SIGKILL") };
}

async function probe(file) {
    const child = spawn(
        "ffprobe",
        [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            file,
        ],
        { stdio: ["ignore", "pipe", "inherit"] },
    );
    let out = "";
    for await (const chunk of child.stdout) out += chunk;
    const [width, height] = out.trim().split(",").map(Number);
    return { width, height };
}

// ---------------------------------------------------------------- the cut

/**
 * Each take's cues, by take name and cue name, in seconds, from the
 * `cues.json` beside it; `rects` holds the CSS rectangle a cue points at.
 */
async function cuesRead(takes) {
    const cues = {};
    for (const [name, file] of Object.entries(takes)) {
        const list = JSON.parse(await readFile(join(dirname(file), "cues.json"), "utf8"));
        cues[name] = Object.fromEntries(list.map((entry) => [entry.name, entry.seconds]));
        cues[name].rects = Object.fromEntries(
            list.filter((entry) => entry.rect).map((entry) => [entry.name, entry.rect]),
        );
    }
    return cues;
}

const options = parse(process.argv.slice(2));
// A cut is its segments, or a function that places them by the takes' cues.
const loaded = (await import(pathToFileURL(options.cut).href)).default;
const cut = typeof loaded === "function" ? loaded(await cuesRead(options.takes)) : loaded;
const { width, height, fps } = cut.output;
const raw = { raw: { width, height, channels: 3 } };
await mkdir(options.out, { recursive: true });
const words = await wordsDraw(cut);
const backdrop = backdropOpen(options.backdrop, fps, { width, height });
// One decoder spans both ending beats, so native playback never resets.
const firstPhone = cut.segments.find((segment) => segment.phone);
const phoneGeometry = firstPhone ? words.phones.get(firstPhone) : undefined;
const phonePictures = firstPhone?.phone.video
    ? takeOpen(
          firstPhone.phone.video,
          0,
          Math.round(
              cut.segments
                  .filter((segment) => segment.phone)
                  .reduce((sum, segment) => sum + segment.seconds, 0) * fps,
          ),
          fps,
          phoneGeometry.screen,
      )
    : undefined;
let currentBackdrop;
let lastWindow;

/**
 * How much of a window's caption shows at `t`. Captions arrive after the
 * dissolve; cards are drawn complete and crossfaded by the segment handover.
 */
function wordsShown(segment, t, first, last) {
    const handover = cut.dissolve ?? 0;
    const into =
        segment.titleFrom !== undefined
            ? clamp01((t - segment.titleFrom) / (segment.titleFadeIn ?? 0.5))
            : first
              ? 1
              : clamp01((t - handover) / 0.3);
    const end = Math.min(segment.seconds - 1 / fps, segment.titleTo ?? Infinity);
    const out = last ? 1 : clamp01((end - t) / (segment.titleFadeOut ?? 0.5));
    return { into, amount: Math.min(into, out) };
}

/** Every segment as a run of finished frames. */
async function* segmentFrames(segment, first, last, start) {
    const count = Math.round(segment.seconds * fps);
    if (segment.kind === "card") {
        const layer = words.cards.get(segment);
        const phone = words.phones.get(segment);
        const square = width === height;
        for (let index = 0; index < count; index += 1) {
            const t = index / fps;
            const glide =
                segment.layout === "brand"
                    ? sine((t - segment.glideFrom) / segment.glideSeconds)
                    : 0;
            const amount =
                segment.entrance === "after-window"
                    ? sine((t - segment.textFrom) / segment.textFade)
                    : segment.layout === "platforms"
                      ? sine((t - segment.textFrom) / segment.textFade)
                      : 1;
            const layers = [];
            if (segment.opening) {
                for (const [i, line] of segment.opening.lines.entries())
                    layers.push({
                        input: await fade(
                            words.lines.get(segment)[i],
                            sine((t - line.at) / line.fade),
                        ),
                        left: 0,
                        top: 0,
                    });
            } else if (segment.layout === "brand") {
                for (const [i, input] of words.brands.get(segment).entries())
                    layers.push({
                        input: await fade(
                            input,
                            sine((t - segment.textTimes[i]) / segment.textFade),
                        ),
                        left: 0,
                        top: 0,
                    });
                const platforms = cut.segments.find((entry) => entry.layout === "platforms");
                if (t < segment.platformsOut)
                    layers.push({
                        input: await fade(
                            words.cards.get(platforms),
                            1 - sine(t / segment.platformsOut),
                        ),
                        left: 0,
                        top: 0,
                    });
            } else
                layers.push({
                    input: amount === 1 ? layer : await fade(layer, amount),
                    left: 0,
                    top: 0,
                });
            if (phone) {
                const centre = (width - phone.width) / 2;
                const left = Math.round(centre + ((square ? 45 : 245) - centre) * glide);
                const top = 42;
                let phoneInput = phone.input;
                if (phonePictures) {
                    const next = await phonePictures.next();
                    if (next.done)
                        throw new Error("Native phone video ended before the closing card.");
                    const screen = await sharp(next.value, {
                        raw: {
                            width: phone.screen.width,
                            height: phone.screen.height,
                            channels: 3,
                        },
                    })
                        .joinChannel(phone.mask, {
                            raw: {
                                width: phone.screen.width,
                                height: phone.screen.height,
                                channels: 1,
                            },
                        })
                        .png()
                        .toBuffer();
                    phoneInput = await sharp({
                        create: {
                            width: phone.width,
                            height: phone.height,
                            channels: 4,
                            background: "#00000000",
                        },
                    })
                        .composite([
                            { input: screen, left: phone.screen.left, top: phone.screen.top },
                            { input: phone.bezel, left: 0, top: 0 },
                        ])
                        .png()
                        .toBuffer();
                }
                layers.push(
                    ...(await translated(
                        segment.layout === "platforms"
                            ? await fade(
                                  phoneInput,
                                  sine((t - segment.phoneFrom) / segment.phoneFade),
                              )
                            : phoneInput,
                        { width: phone.width, height: phone.height },
                        left,
                        top,
                    )),
                );
            }
            const back = await backdrop.next();
            currentBackdrop = back;
            yield await sharp(back, raw).composite(layers).removeAlpha().raw().toBuffer();
        }
        return;
    }
    const source = options.takes[segment.take];
    if (!source) throw new Error(`No --take ${segment.take}= was named.`);
    const size = await probe(source);
    // A segment may open on its take's first frame held still (`freeze`
    // seconds): the camera can move in before anything on screen does. It may
    // close on its take's last frame held still (`tail` seconds), where the
    // take ends on a settled window.
    const held = Math.round((segment.freeze ?? 0) * fps);
    const tail = Math.round((segment.tail ?? 0) * fps);
    const pictures = (async function* () {
        let lastPicture;
        let shown = 0;
        const skips = (segment.skips ?? []).map(([from, to]) => ({
            at: Math.round((from - segment.from) * fps),
            frames: Math.round((to - from) * fps),
        }));
        const skipped = skips.reduce((total, skip) => total + skip.frames, 0);
        let read = 0;
        for await (const picture of takeOpen(
            source,
            segment.from,
            Math.min(
                count - held - tail + skipped,
                segment.until === undefined
                    ? Infinity
                    : Math.round((segment.until - segment.from) * fps),
            ),
            fps,
            size,
        )) {
            read += 1;
            if (skips.some((skip) => read > skip.at && read <= skip.at + skip.frames)) continue;
            if (!lastPicture) for (; shown < held; shown += 1) yield picture;
            lastPicture = picture;
            shown += 1;
            yield picture;
        }
        for (; shown < count && lastPicture; shown += 1) yield lastPicture;
    })();
    const frame = { left: 0, top: 0, width, height };
    let index = 0;
    for await (const picture of pictures) {
        const t = index / fps;
        const localCaption = segment.captions?.find(
            (caption) => t >= caption.from && t <= caption.to,
        );
        const title = words.titles.get(localCaption?.text ?? segment.title);
        const rect = windowRect(cut, segment, t);
        if (!intersect(rect, frame)) {
            const back = await backdrop.next();
            currentBackdrop = back;
            yield await sharp(back, raw).removeAlpha().raw().toBuffer();
            index += 1;
            continue;
        }
        const dims = dimsAt(segment, t);
        const windowOnly = await windowDraw(picture, size, rect, dims);
        if (index === count - 1) lastWindow = { picture, size, rect, dims };
        // Where the window runs under the caption, the caption sits on its pill.
        const under = title ? intersect(rect, title.pill) : undefined;
        const covered = under
            ? (under.width * under.height) / (title.pill.width * title.pill.height)
            : 0;
        const caption = wordsShown(
            localCaption
                ? { ...segment, titleFrom: localCaption.from, titleTo: localCaption.to }
                : segment,
            t,
            first,
            last,
        ).amount;
        const back = await backdrop.next();
        currentBackdrop = back;
        // A still for the page has no caption: the page sets its own words above it.
        if (stills.has(start + index))
            cleanStills.set(
                start + index,
                await sharp(back, raw).composite(windowOnly).removeAlpha().raw().toBuffer(),
            );
        yield await sharp(back, raw)
            .composite([
                ...windowOnly,
                ...(covered * caption > 0
                    ? [
                          {
                              input: await fade(title.back, covered * caption),
                              left: title.pill.left,
                              top: title.pill.top,
                          },
                      ]
                    : []),
                ...(title && caption > 0
                    ? [{ input: await fade(title.text, caption), left: 0, top: 0 }]
                    : []),
            ])
            .removeAlpha()
            .raw()
            .toBuffer();
        index += 1;
    }
    if (index !== count)
        throw new Error(`${segment.take} ended after ${index} of ${count} frames.`);
}

const stills = new Map(options.stills.map((seconds) => [Math.round(seconds * fps), seconds]));
/** Each still's frame without its caption, by frame, as the segment draws it. */
const cleanStills = new Map();

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
const encoded = new Promise((settled, fail) => {
    encoder.once("error", fail);
    encoder.once("exit", (code) =>
        code === 0 ? settled() : fail(new Error(`ffmpeg exited with ${code}.`)),
    );
});
const write = (buffer) =>
    new Promise((settled) => {
        if (encoder.stdin.write(buffer)) settled();
        else encoder.stdin.once("drain", settled);
    });

/** One frame dissolving into the next, eased. */
const blend = (from, to, k) => {
    const out = Buffer.allocUnsafe(from.length);
    for (let index = 0; index < from.length; index += 1)
        out[index] = from[index] + (to[index] - from[index]) * k;
    return out;
};

const posterFrame = Math.round((options.poster ?? 0) * fps);
const timeline = [];
let total = 0;
let previous;
for (const [position, segment] of cut.segments.entries()) {
    const start = total;
    const previousSegment = cut.segments[position - 1];
    const chapterToApp = segment.kind === "window" && previousSegment?.kind === "card";
    const seconds =
        segment.entrance === "in-app" ? 0.6 : chapterToApp ? cut.dissolve + 0.2 : cut.dissolve;
    const dissolve =
        previous && segment.entrance !== "continuous-phone" ? Math.round(seconds * fps) : 0;
    let index = 0;
    const first = position === 0;
    const last = position === cut.segments.length - 1;
    for await (const picture of segmentFrames(segment, first, last, start)) {
        const t = index / fps;
        let departing = previous;
        if (
            index < dissolve &&
            segment.kind === "card" &&
            previousSegment?.kind === "window" &&
            lastWindow
        ) {
            const amount = 1 - 0.015 * sine(t / cut.dissolve);
            const base = lastWindow.rect;
            const rect = {
                ...base,
                width: Math.round(base.width * amount),
                height: Math.round(base.height * amount),
                left: Math.round(base.left + (base.width * (1 - amount)) / 2),
                top: Math.round(base.top + (base.height * (1 - amount)) / 2),
                scale: base.scale * amount,
            };
            departing = await sharp(currentBackdrop, raw)
                .composite(
                    await windowDraw(lastWindow.picture, lastWindow.size, rect, lastWindow.dims),
                )
                .removeAlpha()
                .raw()
                .toBuffer();
        }
        const out =
            index < dissolve
                ? chapterToApp
                    ? blend(
                          blend(previous, currentBackdrop, sine(t / (cut.textOut ?? 0.5))),
                          picture,
                          sine((t - 0.2) / cut.dissolve),
                      )
                    : blend(departing, picture, sine((index + 1) / (dissolve + 1)))
                : picture;
        await write(out);
        if (stills.has(total)) {
            const at = stills.get(total).toFixed(2);
            await sharp(out, raw)
                .png()
                .toFile(join(options.out, `${name}-${at}s-caption.png`));
            if (cleanStills.has(total))
                await sharp(cleanStills.get(total), raw)
                    .png()
                    .toFile(join(options.out, `${name}-${at}s.png`));
        }
        if (total === posterFrame) {
            await sharp(out, raw)
                .webp({ quality: 92 })
                .toFile(join(options.out, `${name}-poster.webp`));
            await sharp(out, raw)
                .png()
                .toFile(join(options.out, `${name}-poster.png`));
        }
        // The last frame of a segment stands still while the next one dissolves in over it.
        if (index === Math.round(segment.seconds * fps) - 1) previous = picture;
        index += 1;
        total += 1;
    }
    const label = segment.title ?? segment.text ?? segment.wordmark ?? "";
    timeline.push({
        kind: segment.kind,
        take: segment.take,
        title: label,
        from: start / fps,
        to: total / fps,
        // The take second drawn at the segment's start (before any frozen
        // opening), to find a take's moment in the cut.
        ...(segment.kind === "window" ? { takeFrom: segment.from - (segment.freeze ?? 0) } : {}),
        ...(segment.skips ? { skips: segment.skips } : {}),
    });
    process.stdout.write(
        `  ${segment.kind.padEnd(7)}${(start / fps).toFixed(2)}–${(total / fps).toFixed(2)} s  ${label}\n`,
    );
}
backdrop.kill();
encoder.stdin.end();
await encoded;
await writeFile(
    join(options.out, `${name}.json`),
    JSON.stringify({ output: cut.output, seconds: total / fps, frames: total, timeline }, null, 2),
);
process.stdout.write(`  ${target}  (${(total / fps).toFixed(2)} s)\n`);
