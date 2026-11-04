/**
 * Mention-layer keystroke cost: the real Composer, plain and with the mention
 * layer, typing at the end of drafts of several sizes and mention counts.
 *
 * Per keystroke it reports, from a Chromium performance trace, the renderer
 * main thread's work for that key (every top-level task from its keydown to the
 * next key's): CPU time (`tdur`), which other load on the machine cannot
 * inflate, and wall time (`dur`). From the page it reports input-to-next-frame
 * latency (keydown's timestamp to a task queued behind the next animation
 * frame), which is wall clock and so carries that load. BENCH_CARET=start types
 * at the top of the draft, ahead of every mention, instead of at its end. Variants are
 * interleaved and repeated so machine load falls on both alike. The scan alone
 * is timed separately, without a render.
 *
 * BENCH_URL=http://127.0.0.1:5193/ BENCH_OUT=/abs/dir node --import tsx bench.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";

const url = process.env.BENCH_URL ?? "http://127.0.0.1:5193/";
const out = process.env.BENCH_OUT ?? "/tmp/mention-bench";
const variants = (process.env.BENCH_VARIANTS ?? "plain,layer").split(",");
const repeats = Number(process.env.BENCH_REPEATS ?? "3");
const keys = Number(process.env.BENCH_KEYS ?? "40");
const caret = process.env.BENCH_CARET ?? "end";
mkdirSync(out, { recursive: true });

interface TraceEvent {
    readonly name: string;
    readonly cat: string;
    readonly ph: string;
    readonly ts: number;
    readonly dur?: number;
    readonly tdur?: number;
    readonly pid: number;
    readonly tid: number;
    readonly args?: { readonly name?: string; readonly data?: { readonly type?: string } };
}

const quantile = (values: readonly number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length === 0) return NaN;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
};
const round = (value: number) => Number(value.toFixed(2));

async function run(browser: Browser, variant: string, chars: number, mentions: number) {
    const context = await browser.newContext({
        deviceScaleFactor: 2,
        viewport: { width: 900, height: 600 },
    });
    const page = await context.newPage();
    await page.goto(
        `${url}?variant=${variant}&chars=${String(chars)}&mentions=${String(mentions)}#mention-layer-bench`,
    );
    const textarea = page.locator("textarea");
    await textarea.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await textarea.focus();
    await page.keyboard.press(caret === "start" ? "Control+Home" : "Control+End");
    await page.evaluate(() => {
        const state = { latencies: [] as number[] };
        Object.assign(window, { __latency: state });
        document.addEventListener(
            "keydown",
            (event) => {
                const start = event.timeStamp;
                requestAnimationFrame(() => {
                    const channel = new MessageChannel();
                    channel.port1.onmessage = () => state.latencies.push(performance.now() - start);
                    channel.port2.postMessage(undefined);
                });
            },
            { capture: true },
        );
    });
    await page.waitForTimeout(300);
    await browser.startTracing(page, {
        categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "toplevel"],
    });
    const typed = "and then ".repeat(Math.ceil(keys / 9)).slice(0, keys);
    await page.keyboard.type(typed, { delay: 50 });
    await page.waitForTimeout(200);
    const trace = JSON.parse((await browser.stopTracing()).toString()) as {
        traceEvents: TraceEvent[];
    };
    const latencies = await page.evaluate(
        () => (window as unknown as { __latency: { latencies: number[] } }).__latency.latencies,
    );
    // The caret must stay in view while typing at the end of a long draft.
    const caretVisible = await textarea.evaluate((element: HTMLTextAreaElement) => {
        const scroller = element.closest(".happy-composer__mention-scroller") ?? element;
        return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    });
    await context.close();

    const events = trace.traceEvents;
    const keydowns = events.filter(
        (event) => event.name === "EventDispatch" && event.args?.data?.type === "keydown",
    );
    const main = keydowns[0];
    if (!main) throw new Error("The trace recorded no keydown.");
    const tasks = events.filter(
        (event) =>
            event.pid === main.pid &&
            event.tid === main.tid &&
            event.ph === "X" &&
            event.name === "RunTask" &&
            event.dur !== undefined,
    );
    const starts = keydowns.map((event) => event.ts).sort((a, b) => a - b);
    const windows = starts.map((start, index) => {
        const end = starts[index + 1] ?? start + 50_000;
        let wall = 0;
        let cpu = 0;
        for (const task of tasks)
            if (task.ts >= start && task.ts < end) {
                wall += task.dur!;
                cpu += task.tdur ?? task.dur!;
            }
        return { wall: wall / 1000, cpu: cpu / 1000 };
    });
    return {
        busy: windows.map((window) => window.wall),
        cpu: windows.map((window) => window.cpu),
        latencies,
        caretVisible,
    };
}

const browser = await chromium.launch();
const rows: Record<string, unknown>[] = [];
for (const chars of [50, 2000, 20_000])
    for (const mentions of [0, 5, 50]) {
        const collected: Record<
            string,
            { busy: number[]; cpu: number[]; latencies: number[]; caret: boolean[] }
        > = {};
        for (let repeat = 0; repeat < repeats; repeat++)
            for (const variant of repeat % 2 === 0 ? variants : [...variants].reverse()) {
                const result = await run(browser, variant, chars, mentions);
                const entry = (collected[variant] ??= {
                    busy: [],
                    cpu: [],
                    latencies: [],
                    caret: [],
                });
                entry.busy.push(...result.busy);
                entry.cpu.push(...result.cpu);
                entry.latencies.push(...result.latencies);
                entry.caret.push(result.caretVisible);
            }
        for (const variant of variants) {
            const entry = collected[variant]!;
            const row = {
                chars,
                mentions,
                variant,
                keystrokes: entry.busy.length,
                caret,
                cpuP50: round(quantile(entry.cpu, 0.5)),
                cpuP95: round(quantile(entry.cpu, 0.95)),
                wallP50: round(quantile(entry.busy, 0.5)),
                wallP95: round(quantile(entry.busy, 0.95)),
                latencyP50: round(quantile(entry.latencies, 0.5)),
                latencyP95: round(quantile(entry.latencies, 0.95)),
                caretVisible: entry.caret.every(Boolean),
            };
            rows.push(row);
            console.log(JSON.stringify(row));
        }
    }

// The scan alone: every size and mention count, many calls, no render.
const scanPage = await (await browser.newContext()).newPage();
await scanPage.goto(`${url}?variant=plain&chars=50&mentions=0#mention-layer-bench`);
await scanPage.locator("textarea").waitFor();
const scan = await scanPage.evaluate(() => {
    const bench = (
        window as unknown as {
            __mentionBench: {
                benchText: (chars: number, mentions: number) => string;
                composerMentionRanges: (
                    text: string,
                    names: readonly string[],
                ) => readonly unknown[];
                names: readonly string[];
            };
        }
    ).__mentionBench;
    const results: Record<string, number | string>[] = [];
    for (const chars of [50, 2000, 20_000])
        for (const mentions of [0, 5, 50]) {
            const text = bench.benchText(chars, mentions);
            // performance.now() is clamped to 0.1 ms here, so each sample is
            // the mean of a batch of 100 scans.
            const samples: number[] = [];
            let found = 0;
            for (let batch = 0; batch < 60; batch++) {
                const start = performance.now();
                for (let i = 0; i < 100; i++)
                    found = bench.composerMentionRanges(text, bench.names).length;
                samples.push((performance.now() - start) / 100);
            }
            samples.sort((a, b) => a - b);
            results.push({
                chars,
                mentions,
                found,
                scanMsP50: Number(samples[30]!.toFixed(4)),
                scanMsP95: Number(samples[57]!.toFixed(4)),
            });
        }
    return results;
});
for (const row of scan) console.log(JSON.stringify(row));
writeFileSync(
    join(out, `bench-${caret}.json`),
    JSON.stringify({ keystrokes: rows, scan }, null, 2),
);
await browser.close();
