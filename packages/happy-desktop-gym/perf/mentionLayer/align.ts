/**
 * Mention-layer alignment: the composer's draft drawn once by its textarea and
 * once by the mention layer behind it, each alone in the same black ink on the
 * same white, at several zooms, scroll offsets, and both appearances. Any
 * difference between the two captures is the layer drifting from the text.
 *
 * Serve a production Blueprint build (`vite build --config vite.bench.config.ts`)
 * and run: BENCH_URL=http://127.0.0.1:5193/ BENCH_OUT=/abs/dir node --import tsx align.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const url = process.env.BENCH_URL ?? "http://127.0.0.1:5193/";
const out = process.env.BENCH_OUT ?? "/tmp/mention-align";
const variant = process.env.BENCH_VARIANT ?? "layer";
mkdirSync(out, { recursive: true });

interface Comparison {
    readonly differing: number;
    readonly maxChannel: number;
    /** The farthest an ink pixel of either capture lies from the other's ink, in device px (capped at 12). */
    readonly offset: number;
    /** Textarea ink in blue, layer ink in red, both in black. */
    readonly overlay: string;
}

/** Decodes both captures on a canvas in `lab` and compares them there. */
async function compare(lab: Page, a: Buffer, b: Buffer): Promise<Comparison> {
    return await lab.evaluate(
        async ([first, second]) => {
            const load = async (base64: string) => {
                const image = new Image();
                image.src = `data:image/png;base64,${base64}`;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext("2d")!;
                context.drawImage(image, 0, 0);
                return context.getImageData(0, 0, image.width, image.height);
            };
            const a = await load(first!);
            const b = await load(second!);
            const { width, height } = a;
            const inkOf = (data: ImageData) => {
                const mask = new Uint8Array(width * height);
                for (let i = 0; i < width * height; i++)
                    mask[i] =
                        data.data[i * 4]! + data.data[i * 4 + 1]! + data.data[i * 4 + 2]! < 480
                            ? 1
                            : 0;
                return mask;
            };
            const inkA = inkOf(a);
            const inkB = inkOf(b);
            const farthest = (from: Uint8Array, to: Uint8Array) => {
                let worst = 0;
                for (let y = 0; y < height; y++)
                    for (let x = 0; x < width; x++) {
                        const i = y * width + x;
                        if (!from[i] || to[i]) continue;
                        let found = 12;
                        search: for (let r = 1; r < 12; r++)
                            for (let dy = -r; dy <= r; dy++)
                                for (let dx = -r; dx <= r; dx++) {
                                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                                    const nx = x + dx;
                                    const ny = y + dy;
                                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                                    if (to[ny * width + nx]) {
                                        found = r;
                                        break search;
                                    }
                                }
                        worst = Math.max(worst, found);
                    }
                return worst;
            };
            let differing = 0;
            let maxChannel = 0;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d")!;
            const overlay = context.createImageData(width, height);
            for (let i = 0; i < width * height; i++) {
                const o = i * 4;
                let same = true;
                for (let c = 0; c < 3; c++) {
                    const d = Math.abs(a.data[o + c]! - b.data[o + c]!);
                    if (d > 0) same = false;
                    maxChannel = Math.max(maxChannel, d);
                }
                if (!same) differing++;
                const color =
                    inkA[i] && inkB[i]
                        ? [0, 0, 0]
                        : inkA[i]
                          ? [0, 90, 255]
                          : inkB[i]
                            ? [255, 0, 0]
                            : [255, 255, 255];
                overlay.data[o] = color[0]!;
                overlay.data[o + 1] = color[1]!;
                overlay.data[o + 2] = color[2]!;
                overlay.data[o + 3] = 255;
            }
            context.putImageData(overlay, 0, 0);
            return {
                differing,
                maxChannel,
                offset: Math.max(farthest(inkA, inkB), farthest(inkB, inkA)),
                overlay: canvas.toDataURL("image/png").split(",")[1]!,
            };
        },
        [a.toString("base64"), b.toString("base64")],
    );
}

async function frames(page: Page) {
    await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
}

async function capture(page: Page, mode: "textarea" | "layer"): Promise<Buffer> {
    await page.evaluate((value) => {
        document.querySelector("[data-mention-bench]")!.setAttribute("data-align", value);
    }, mode);
    await frames(page);
    const box = await page.locator(".happy-composer__textarea-scroll").boundingBox();
    return await page.screenshot({ clip: box! });
}

const browser = await chromium.launch();
const lab = await (await browser.newContext()).newPage();
// tsx keeps function names with a `__name` helper the page does not have.
await lab.evaluate("window.__name = (f) => f");
const rows: Record<string, unknown>[] = [];
for (const scheme of ["light", "dark"] as const)
    for (const scale of [1, 1.25, 1.5, 2])
        for (const width of [640, 413])
            for (const scroll of ["top", "middle", "bottom"] as const) {
                const context = await browser.newContext({
                    colorScheme: scheme,
                    deviceScaleFactor: scale,
                    viewport: { width: 900, height: 600 },
                });
                const page = await context.newPage();
                await page.goto(
                    `${url}?variant=${variant}&fixture=align&width=${String(width)}#mention-layer-bench`,
                );
                const textarea = page.locator("textarea");
                await textarea.waitFor();
                await page.evaluate(() => document.fonts.ready);
                await textarea.evaluate((textarea: HTMLTextAreaElement, where) => {
                    // The scroller is the textarea itself, or the wrapper the mention layer shares.
                    const element =
                        textarea.closest(".happy-composer__mention-scroller") ?? textarea;
                    const max = element.scrollHeight - element.clientHeight;
                    // An offset that is no multiple of the line height, so a line is cut.
                    element.scrollTop =
                        where === "top" ? 0 : where === "bottom" ? max : Math.round(max / 2) + 7;
                }, scroll);
                await frames(page);
                const a = await capture(page, "textarea");
                const b = await capture(page, "layer");
                const result = await compare(lab, a, b);
                const name = `${scheme}-${String(scale * 100)}pct-w${String(width)}-${scroll}`;
                writeFileSync(
                    join(out, `${name}-overlay.png`),
                    Buffer.from(result.overlay, "base64"),
                );
                if (result.differing > 0) {
                    writeFileSync(join(out, `${name}-textarea.png`), a);
                    writeFileSync(join(out, `${name}-layer.png`), b);
                }
                const row = {
                    name,
                    differingPixels: result.differing,
                    maxChannelDelta: result.maxChannel,
                    maxOffsetDevicePx: result.offset,
                    maxOffsetCssPx: Number((result.offset / scale).toFixed(2)),
                };
                rows.push(row);
                console.log(JSON.stringify(row));
                await context.close();
            }
writeFileSync(join(out, `align-${variant}.json`), JSON.stringify(rows, null, 2));
await browser.close();
