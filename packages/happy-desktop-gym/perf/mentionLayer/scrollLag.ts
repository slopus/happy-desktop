/**
 * Mention-layer scroll lag: the textarea's ink in black over the layer's in
 * magenta, recorded frame by frame from the compositor (CDP screencast) while a
 * wheel scrolls a long draft. Aligned, the black covers the red except for
 * antialiased edges; a frame where the layer trails the textarea's scroll shows
 * whole red glyphs. Each frame's red-pixel count is compared with a still frame.
 *
 * BENCH_URL=http://127.0.0.1:5193/ BENCH_OUT=/abs/dir node --import tsx scrollLag.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const url = process.env.BENCH_URL ?? "http://127.0.0.1:5193/";
const out = process.env.BENCH_OUT ?? "/tmp/mention-scroll";
mkdirSync(out, { recursive: true });

async function redPixels(
    lab: Page,
    png: string,
    clip: { x: number; y: number; width: number; height: number },
) {
    return await lab.evaluate(
        async ([base64, box]) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64 as string}`;
            await image.decode();
            // Frames come at whatever size the screencast chose; the box is in CSS px of a 900px viewport.
            const ratio = image.width / 900;
            const css = box as { x: number; y: number; width: number; height: number };
            const [x, y, width, height] = [css.x, css.y, css.width, css.height].map((v) =>
                Math.round(v * ratio),
            ) as [number, number, number, number];
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, x, y, width, height, 0, 0, width, height);
            const data = context.getImageData(0, 0, width, height).data;
            let red = 0;
            for (let i = 0; i < data.length; i += 4)
                if (data[i]! > 190 && data[i + 1]! < 90 && data[i + 2]! > 190) red++;
            return red;
        },
        [png, clip] as const,
    );
}

const browser = await chromium.launch();
const lab = await (await browser.newContext()).newPage();
await lab.evaluate("window.__name = (f) => f");
const rows: Record<string, unknown>[] = [];
for (const scale of [1, 1.5, 2]) {
    const context = await browser.newContext({
        deviceScaleFactor: scale,
        viewport: { width: 900, height: 600 },
    });
    const page = await context.newPage();
    await page.goto(`${url}?variant=layer&fixture=align&width=640#mention-layer-bench`);
    const textarea = page.locator("textarea");
    await textarea.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
        document.querySelector("[data-mention-bench]")!.setAttribute("data-align", "both"),
    );
    // The visible scrollport: the textarea, or the wrapper the mention layer shares with it.
    const scroller = page.locator(".happy-composer__mention-scroller");
    const box = (await ((await scroller.count()) > 0 ? scroller : textarea).boundingBox())!;
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
    const session = await context.newCDPSession(page);
    const frames: string[] = [];
    session.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
        frames.push(frame.data);
        void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
    });
    await session.send("Page.startScreencast", {
        format: "png",
        everyNthFrame: 1,
        maxWidth: Math.round(900 * scale),
        maxHeight: Math.round(600 * scale),
    });
    await page.waitForTimeout(400);
    const still = frames.at(-1)!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let round = 0; round < 3; round++) {
        for (let step = 0; step < 12; step++) {
            await page.mouse.wheel(0, 37);
            await page.waitForTimeout(16);
        }
        for (let step = 0; step < 12; step++) {
            await page.mouse.wheel(0, -37);
            await page.waitForTimeout(16);
        }
    }
    await page.waitForTimeout(300);
    await session.send("Page.stopScreencast");
    const baseline = await redPixels(lab, still, clip);
    let worst = 0;
    let worstFrame = "";
    let lagging = 0;
    for (const frame of frames) {
        const red = await redPixels(lab, frame, clip);
        if (red > baseline * 2 + 50) lagging++;
        if (red > worst) {
            worst = red;
            worstFrame = frame;
        }
    }
    writeFileSync(
        join(out, `scroll-${String(scale * 100)}pct-worst-frame.png`),
        Buffer.from(worstFrame, "base64"),
    );
    writeFileSync(
        join(out, `scroll-${String(scale * 100)}pct-still.png`),
        Buffer.from(still, "base64"),
    );
    const row = {
        scale,
        frameWidth: await lab.evaluate(async (b64) => {
            const i = new Image();
            i.src = `data:image/png;base64,${b64}`;
            await i.decode();
            return i.width;
        }, still),
        frames: frames.length,
        baselineRed: baseline,
        worstRed: worst,
        laggingFrames: lagging,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
    await context.close();
}
writeFileSync(join(out, "scroll-lag.json"), JSON.stringify(rows, null, 2));
await browser.close();
