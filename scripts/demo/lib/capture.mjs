import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { window as windowRectangle } from "./scene.mjs";

/*
 * Receives the headless compositor's continuous, full-resolution frame stream.
 * Taking a fresh Playwright screenshot for each output frame stalls rendering
 * and loses most of a live animation. The compositor runs independently here;
 * the director samples its timestamped frames on one wall-time timeline.
 */
export async function sinkCreate(options) {
    const frames = [];
    const sources = [];
    const written = new Set();
    const cdp = await options.page.context().newCDPSession(options.page);
    let nextId = 0;
    let failure;
    let firstResolve;
    const first = new Promise((resolve) => {
        firstResolve = resolve;
    });
    cdp.on("Page.screencastFrame", (frame) => {
        const at = performance.now();
        sources.push({
            id: nextId++,
            at,
            timestamp: frame.metadata.timestamp,
            data: Buffer.from(frame.data, "base64"),
        });
        while (sources.length > 1 && sources[1].at < at - 2_000) sources.shift();
        firstResolve();
        void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch((error) => {
            failure = error;
        });
    });
    await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 92,
        maxWidth: windowRectangle.width,
        maxHeight: windowRectangle.height,
        everyNthFrame: 1,
    });
    let firstTimeout;
    try {
        await Promise.race([
            first,
            new Promise((_, reject) => {
                firstTimeout = setTimeout(
                    () => reject(new Error("The compositor sent no capture frame.")),
                    10_000,
                );
            }),
        ]);
    } finally {
        clearTimeout(firstTimeout);
    }
    return {
        frames,
        async capture(shot, captureOptions = {}) {
            if (failure) throw failure;
            const at = captureOptions.at ?? performance.now();
            const source = sources.findLast((candidate) => candidate.at <= at) ?? sources[0];
            const file = `s${String(source.id).padStart(6, "0")}.jpg`;
            if (!written.has(source.id)) {
                await writeFile(join(options.directory, file), source.data);
                written.add(source.id);
            }
            frames.push({
                file,
                ...shot,
                sourceFrame: source.id,
                sourceTimestamp: source.timestamp,
                sourceAgeMs: Math.max(0, at - source.at),
            });
            if (options.onProgress && frames.length % 30 === 0) options.onProgress(frames.length);
        },
        async close() {
            await cdp.send("Page.stopScreencast").catch(() => undefined);
            await cdp.detach().catch(() => undefined);
        },
    };
}
