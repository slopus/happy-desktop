import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/*
 * Captions and hints laid over a composed take.
 *
 * A caption is one line of narration, subtitle-style, centred in the
 * composition's caption band, from one cue to the next caption. A hint is a short label with a notch that points at what the
 * take's cue recorded on screen — a sidebar row, a tool row, the phone's row —
 * with a ring around it. Every sprite is drawn once, in Chromium with the
 * app's own Figtree, and then only faded in and out on the take's clock.
 */

const workspace = resolve(import.meta.dirname, "../../..");
const rootRequire = createRequire(resolve(workspace, "package.json"));
const sharp = rootRequire("sharp");
const gymRequire = createRequire(resolve(workspace, "packages/happy-desktop-gym/package.json"));

const FADE_SECONDS = 0.3;
const OPACITY_STEPS = 12;
const ACCENT = "#e07aae";

/** `name` or `name#2` for a cue's second occurrence. */
function cueFind(cues, reference) {
    const [name, occurrence = "1"] = reference.split("#");
    const found = cues.filter((cue) => cue.name === name)[Number(occurrence) - 1];
    if (!found) throw new Error(`The cues have no "${reference}" cue.`);
    return found;
}

const at = (cues, value) => (typeof value === "number" ? value : cueFind(cues, value).seconds);

const escape = (value) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
/** `*word*` marks the accent. */
const markup = (value) => escape(value).replace(/\*([^*]+)\*/gu, "<em>$1</em>");

async function pageOpen() {
    const { chromium } = gymRequire("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--force-color-profile=srgb"] });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const font = await readFile(
        resolve(
            workspace,
            "packages/happy-desktop-ui/node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
        ),
    );
    const style = `
        @font-face { font-family: Figtree; font-weight: 300 900; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); }
        html, body { margin: 0; background: transparent; }
        body { font-family: Figtree; -webkit-font-smoothing: antialiased; }
        em { font-style: normal; color: ${ACCENT}; }
        .caption { display: inline-block; padding: 10px 18px 14px; color: #fff; font-weight: 650;
            font-size: 40px; line-height: 50px; letter-spacing: -0.005em; white-space: nowrap;
            text-shadow: 0 2px 16px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.6); }
        .hint { display: inline-block; position: relative; padding: 14px; }
        .pill { position: relative; padding: 10px 16px 11px; border-radius: 12px; white-space: nowrap;
            background: rgba(22,22,24,0.95); color: #fff; font-weight: 650; font-size: 22px; line-height: 28px;
            box-shadow: 0 0 0 1px rgba(255,255,255,0.16), 0 10px 30px rgba(0,0,0,0.45); }
        .notch { position: absolute; width: 14px; height: 14px; background: rgba(22,22,24,0.95);
            box-shadow: 1px 1px 0 0 rgba(255,255,255,0.16); }
        .left .notch { left: -7px; top: var(--notch); transform: translateY(-50%) rotate(135deg); }
        .right .notch { right: -7px; top: var(--notch); transform: translateY(-50%) rotate(-45deg); }
        .above .notch { bottom: -7px; left: var(--notch); transform: translateX(-50%) rotate(45deg); }
        .below .notch { top: -7px; left: var(--notch); transform: translateX(-50%) rotate(-135deg); }
    `;
    await page.setContent(`<style>${style}</style><div id="root"></div>`);
    await page.evaluate(() => document.fonts.ready);
    return { browser, page };
}

async function spriteDraw(page, html, prepare) {
    await page.evaluate((value) => {
        document.getElementById("root").innerHTML = value;
    }, html);
    await page.evaluate(() => document.fonts.ready);
    const element = page.locator("#root > *").first();
    const box = await element.boundingBox();
    const extra = prepare ? await prepare(box) : undefined;
    const png = await element.screenshot({ omitBackground: true });
    return { png, width: Math.round(box.width), height: Math.round(box.height), ...extra };
}

/** Where a recorded rectangle is in the output frame. */
function targetPlace(composition, phoneCanvas, cue) {
    const { desktop, phone } = composition;
    if (cue.rect) {
        const scale = desktop.width / desktop.cssWidth;
        return {
            x: desktop.x + cue.rect.x * scale,
            y: desktop.y + cue.rect.y * scale,
            width: cue.rect.width * scale,
            height: cue.rect.height * scale,
        };
    }
    if (cue.phoneRect) {
        // The focused handset: its screen is 3× the phone's points.
        const width = phone.width * phone.focusScale;
        const factor = width / phoneCanvas.width;
        const top = phone.bottom - phoneCanvas.height * factor;
        return {
            x: phone.left + (phone.screen.x + cue.phoneRect.x * 3) * factor,
            y: top + (phone.screen.y + cue.phoneRect.y * 3) * factor,
            width: cue.phoneRect.width * 3 * factor,
            height: cue.phoneRect.height * 3 * factor,
        };
    }
    throw new Error(`Cue ${cue.name} recorded no rectangle for a hint to point at.`);
}

async function ringDraw(target) {
    const pad = 5;
    const glow = 14;
    const width = Math.round(target.width + (pad + glow) * 2);
    const height = Math.round(target.height + (pad + glow) * 2);
    const rect = (stroke, opacity) =>
        `<rect x="${glow}" y="${glow}" width="${width - glow * 2}" height="${height - glow * 2}" rx="12" fill="none" stroke="${ACCENT}" stroke-opacity="${opacity}" stroke-width="${stroke}"/>`;
    const blurred = await sharp(
        Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rect(6, 0.7)}</svg>`,
        ),
    )
        .blur(6)
        .png()
        .toBuffer();
    const png = await sharp(blurred)
        .composite([
            {
                input: Buffer.from(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rect(2.5, 1)}</svg>`,
                ),
            },
        ])
        .png()
        .toBuffer();
    return {
        png,
        width,
        height,
        left: Math.round(target.x - pad - glow),
        top: Math.round(target.y - pad - glow),
    };
}

/**
 * Builds every caption and hint for one take. Returns `layersAt(seconds)`,
 * the sprites to lay over the frame at that instant, already faded.
 */
export async function overlaysBuild({ composition, cues, phoneCanvas }) {
    const { output } = composition;
    const items = [];
    let phoneLabel;
    const { browser, page } = await pageOpen();
    try {
        if (composition.phone.label)
            phoneLabel = await spriteDraw(
                page,
                `<div class="hint above"><div class="pill">${markup(composition.phone.label)}</div></div>`,
            );
        const captions = composition.captions ?? [];
        for (const [index, caption] of captions.entries()) {
            const from = at(cues, caption.from);
            const to =
                caption.to !== undefined
                    ? at(cues, caption.to)
                    : index + 1 < captions.length
                      ? at(cues, captions[index + 1].from)
                      : Infinity;
            const sprite = await spriteDraw(
                page,
                `<div class="caption">${markup(caption.text)}</div>`,
            );
            items.push({
                from,
                to,
                sprites: [
                    {
                        ...sprite,
                        left: Math.round((output.width - sprite.width) / 2),
                        top: Math.round(composition.captionBand.centerY - sprite.height / 2),
                    },
                ],
            });
        }
        for (const hint of composition.hints ?? []) {
            const cue = cueFind(cues, hint.cue);
            const from = cue.seconds + (hint.delay ?? 0);
            const to = from + hint.seconds;
            const target = targetPlace(composition, phoneCanvas, cue);
            // A hint without text is only the ring, where a label would cover the chat.
            if (hint.text === undefined) {
                items.push({ from, to, sprites: [await ringDraw(target)] });
                continue;
            }
            const side = hint.side;
            const gap = 10;
            let place;
            const sprite = await spriteDraw(
                page,
                `<div class="hint ${side === "right" ? "left" : side === "left" ? "right" : side === "above" ? "above" : "below"}"><div class="pill">${markup(hint.text)}<div class="notch"></div></div></div>`,
                async (box) => {
                    const centerX = target.x + target.width / 2;
                    const centerY = target.y + target.height / 2;
                    let left =
                        side === "right"
                            ? target.x + target.width + gap
                            : side === "left"
                              ? target.x - box.width - gap
                              : centerX - box.width / 2;
                    let top =
                        side === "above"
                            ? target.y - box.height - gap
                            : side === "below"
                              ? target.y + target.height + gap
                              : centerY - box.height / 2;
                    left = Math.max(8, Math.min(output.width - box.width - 8, left));
                    top = Math.max(8, Math.min(output.height - box.height - 8, top));
                    // The notch points at the target's centre wherever the pill landed.
                    const pad = 14;
                    const notch =
                        side === "left" || side === "right"
                            ? Math.max(18, Math.min(box.height - 2 * pad - 18, centerY - top - pad))
                            : Math.max(
                                  18,
                                  Math.min(box.width - 2 * pad - 18, centerX - left - pad),
                              );
                    await page.evaluate((value) => {
                        document.querySelector(".pill").style.setProperty("--notch", `${value}px`);
                    }, notch);
                    place = { left: Math.round(left), top: Math.round(top) };
                },
            );
            items.push({
                from,
                to,
                sprites: [await ringDraw(target), { ...sprite, ...place }],
            });
        }
    } finally {
        await browser.close();
    }
    // Faded copies, made on first use: alpha scaled to one of a few steps.
    const faded = new Map();
    const fade = async (sprite, step) => {
        const key = `${items.findIndex((item) => item.sprites.includes(sprite))}:${sprite.left}:${sprite.top}:${step}`;
        if (!faded.has(key))
            faded.set(
                key,
                (async () => {
                    const { data, info } = await sharp(sprite.png)
                        .ensureAlpha()
                        .raw()
                        .toBuffer({ resolveWithObject: true });
                    for (let index = 3; index < data.length; index += 4)
                        data[index] = Math.round((data[index] * step) / OPACITY_STEPS);
                    return sharp(data, { raw: info }).png({ compressionLevel: 0 }).toBuffer();
                })(),
            );
        return faded.get(key);
    };
    return Object.assign(layersAt, { phoneLabel });
    async function layersAt(seconds) {
        const layers = [];
        for (const item of items) {
            // What is on screen from the first frame is already there, so
            // the opening (and the poster cut from it) shows it whole.
            const opacity = Math.min(
                1,
                item.from <= 0 ? 1 : Math.max(0, (seconds - item.from) / FADE_SECONDS),
                Math.max(0, (item.to - seconds) / FADE_SECONDS),
            );
            const step = Math.round(opacity * OPACITY_STEPS);
            if (step === 0) continue;
            for (const sprite of item.sprites)
                layers.push({
                    input: await fade(sprite, step),
                    left: sprite.left,
                    top: sprite.top,
                });
        }
        return layers;
    }
}
