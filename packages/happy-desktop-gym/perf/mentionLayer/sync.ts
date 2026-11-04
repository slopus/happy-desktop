/**
 * Mention-layer frame sync: does the layer ever paint a frame out of step with
 * the textarea while the draft is edited, reflowed, grown, or scrolled?
 *
 * Two independent checks per interaction, at 100% and 200%:
 * - Pixels: the textarea's ink is black and the layer's magenta (no emoji in the
 *   fixture has any), and every
 *   compositor frame (CDP screencast) is searched for red ink lying away from
 *   black ink; in step, red shows only as an antialiased fringe touching black.
 * - DOM, in every animation frame: the layer's text is the textarea's value
 *   through the paragraph of its last mention, and the two boxes share a top
 *   and a width. rAF callbacks see the state the frame then paints.
 *
 * BENCH_URL=http://127.0.0.1:5193/ BENCH_OUT=/abs/dir node --import tsx sync.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type CDPSession, type Page } from "playwright";

const url = process.env.BENCH_URL ?? "http://127.0.0.1:5193/";
const out = process.env.BENCH_OUT ?? "/tmp/mention-sync";
const only = process.env.SYNC_CASES?.split(",");
mkdirSync(out, { recursive: true });

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
const scrollerOf = `(document.querySelector(".happy-composer__mention-scroller") ?? document.querySelector("textarea"))`;

async function caretAt(page: Page, find: string, after = false) {
    await page.locator("textarea").evaluate(
        (element: HTMLTextAreaElement, [needle, past]) => {
            const index = element.value.indexOf(needle as string);
            if (index === -1) throw new Error(`No "${needle as string}" in the draft.`);
            const offset = index + (past ? (needle as string).length : 0);
            element.focus();
            element.setSelectionRange(offset, offset);
        },
        [find, after] as const,
    );
}

interface Case {
    readonly name: string;
    readonly fixture: "align" | "grow";
    /** Records caret offset and scroll position after each step, in both variants. */
    readonly behaviour?: boolean;
    run(
        page: Page,
        cdp: CDPSession,
        context: BrowserContext,
        log: (step: string) => Promise<void>,
    ): Promise<void>;
}

/** Positive controls: the layer deliberately moved, which both checks must report. */
const control = (px: number): Case => ({
    name: `0-control-layer-moved-${String(px)}px`,
    fixture: "align",
    async run(page) {
        await caretAt(page, "@Carol Diaz");
        await page.keyboard.type("w");
        await pause(page, 100);
        await page.evaluate((shift) => {
            const layer = document.querySelector<HTMLElement>(
                ".happy-composer__mention-layer-text",
            )!;
            layer.style.transform = `translateY(${String(shift)}px)`;
        }, px);
        await pause(page, 150);
        await page.keyboard.type("w");
        await pause(page, 150);
    },
});

const cases: Case[] = [
    control(1),
    control(3),
    {
        name: "1-newlines-joins-and-send",
        fixture: "align",
        async run(page) {
            // In the composer Enter sends; Shift+Enter is the newline.
            await caretAt(page, "check where");
            await page.keyboard.press("Shift+Enter");
            await pause(page, 150);
            await page.keyboard.press("Shift+Enter");
            await pause(page, 150);
            await page.keyboard.press("Backspace");
            await pause(page, 150);
            await page.keyboard.press("Backspace");
            await pause(page, 150);
            // Join the first two paragraphs, then split them again.
            await caretAt(page, "\nEmoji", true);
            await page.keyboard.press("Home");
            await page.keyboard.press("Backspace");
            await pause(page, 150);
            await page.keyboard.press("Shift+Enter");
            await pause(page, 150);
            // Enter sends, and the draft empties.
            await page.keyboard.press("Enter");
            await pause(page, 150);
        },
    },
    {
        name: "2-wrap-and-unwrap-before-a-mention",
        fixture: "align",
        async run(page) {
            await caretAt(page, "@Carol Diaz");
            for (let i = 0; i < 10; i++) {
                await page.keyboard.type("w");
                await pause(page, 60);
            }
            for (let i = 0; i < 10; i++) {
                await page.keyboard.press("Backspace");
                await pause(page, 60);
            }
        },
    },
    {
        name: "3a-auto-grow-to-max-then-scroll",
        fixture: "grow",
        async run(page) {
            await page.locator("textarea").focus();
            await page.keyboard.press("Control+End");
            for (let i = 0; i < 12; i++) {
                await page.keyboard.press("Shift+Enter");
                await page.keyboard.type(`line ${String(i)} for @Dana Kim`, { delay: 15 });
                await pause(page, 60);
            }
        },
    },
    {
        name: "3b-caret-scrolls-into-view",
        fixture: "align",
        async run(page) {
            await page.locator("textarea").focus();
            await page.keyboard.press("Control+End");
            await pause(page, 100);
            await page.evaluate(`${scrollerOf}.scrollTop = 0`);
            await pause(page, 150);
            // The caret is below the scrollport; typing brings it into view.
            await page.keyboard.type("x");
            await pause(page, 150);
            await caretAt(page, "Can @Bob");
            await page.evaluate(`${scrollerOf}.scrollTop = ${scrollerOf}.scrollHeight`);
            await pause(page, 150);
            await page.keyboard.type("y");
            await pause(page, 150);
        },
    },
    {
        name: "4a-paste-undo-redo",
        fixture: "align",
        async run(page, _cdp, context) {
            await context.grantPermissions(["clipboard-read", "clipboard-write"]);
            await page.evaluate(() =>
                navigator.clipboard.writeText(
                    "pasted one @Eli Okafor\npasted two\npasted three @Fay Novak\npasted four\n",
                ),
            );
            await caretAt(page, "for the email copy");
            const before = await page.locator("textarea").inputValue();
            await page.keyboard.press("Control+V");
            await pause(page, 200);
            if ((await page.locator("textarea").inputValue()) === before)
                throw new Error("Paste inserted nothing.");
            await page.keyboard.press("Control+Z");
            await pause(page, 200);
            await page.keyboard.press("Control+Shift+Z");
            await pause(page, 200);
            await page.keyboard.press("Control+Z");
            await pause(page, 200);
        },
    },
    {
        name: "4b-ime-composition-before-a-mention",
        fixture: "align",
        async run(page, cdp) {
            await caretAt(page, "@Dana Kim");
            for (const text of ["n", "に", "にh", "にほ", "にほn", "にほん"]) {
                await cdp.send("Input.imeSetComposition", {
                    text,
                    selectionStart: text.length,
                    selectionEnd: text.length,
                });
                await pause(page, 80);
            }
            await cdp.send("Input.insertText", { text: "日本" });
            await pause(page, 150);
            for (const text of ["z", "zh", "中", "中文"]) {
                await cdp.send("Input.imeSetComposition", {
                    text,
                    selectionStart: text.length,
                    selectionEnd: text.length,
                });
                await pause(page, 80);
            }
            // Cancelled: the preedit goes away again.
            await cdp.send("Input.imeSetComposition", {
                text: "",
                selectionStart: 0,
                selectionEnd: 0,
            });
            await pause(page, 150);
        },
    },
    {
        name: "5a-fast-typing-15-per-second",
        fixture: "align",
        async run(page) {
            await caretAt(page, "Can @Bob");
            await page.keyboard.type("quick brown fox jumps over the lazy dog again ", {
                delay: 66,
            });
        },
    },
    {
        name: "5b-key-held-auto-repeat",
        fixture: "align",
        async run(page) {
            await caretAt(page, "@Carol Diaz");
            await page.keyboard.down("x");
            for (let i = 0; i < 40; i++) {
                await pause(page, 33);
                await page.keyboard.down("x");
            }
            await page.keyboard.up("x");
            await page.keyboard.down("Backspace");
            for (let i = 0; i < 40; i++) {
                await pause(page, 33);
                await page.keyboard.down("Backspace");
            }
            await page.keyboard.up("Backspace");
        },
    },
    {
        name: "6a-width-animated-like-a-sidebar",
        fixture: "align",
        async run(page) {
            await page.evaluate(
                () =>
                    new Promise<void>((resolve) => {
                        const root = document.querySelector<HTMLElement>("[data-mention-bench]")!;
                        let frame = 0;
                        const step = () => {
                            const t = frame / 40;
                            const width = 640 - 220 * Math.sin(Math.PI * Math.min(1, t));
                            root.style.width = `${String(width)}px`;
                            if (frame++ < 40) requestAnimationFrame(step);
                            else resolve();
                        };
                        requestAnimationFrame(step);
                    }),
            );
        },
    },
    {
        name: "6b-width-toggled-and-window-resized",
        fixture: "align",
        async run(page) {
            const root = page.locator("[data-mention-bench]");
            for (const width of [400, 640, 470, 640]) {
                await root.evaluate((element: HTMLElement, value) => {
                    element.style.width = `${String(value)}px`;
                }, width);
                await pause(page, 120);
            }
            await root.evaluate((element: HTMLElement) => {
                element.style.width = "auto";
            });
            for (const width of [900, 640, 760, 520, 900]) {
                await page.setViewportSize({ width, height: 600 });
                await pause(page, 120);
            }
        },
    },
    {
        name: "7a-keyboard-scroll",
        fixture: "align",
        behaviour: true,
        async run(page, _cdp, _context, log) {
            await caretAt(page, "Can @Bob");
            await log("start");
            for (const key of [
                "PageDown",
                "PageDown",
                "PageDown",
                "PageUp",
                "PageUp",
                "Control+End",
                "Control+Home",
                "ArrowDown",
                "ArrowDown",
            ]) {
                await page.keyboard.press(key);
                await pause(page, 150);
                await log(key);
            }
        },
    },
    {
        name: "7b-drag-select-autoscroll",
        fixture: "align",
        behaviour: true,
        async run(page, _cdp, _context, log) {
            await caretAt(page, "Can @Bob");
            const box = (await page.evaluate(
                `(() => { const r = ${scrollerOf}.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
            )) as {
                x: number;
                y: number;
                width: number;
                height: number;
            };
            await page.mouse.move(box.x + 30, box.y + 10);
            await page.mouse.down();
            await page.mouse.move(box.x + 120, box.y + box.height + 30, { steps: 6 });
            for (let i = 0; i < 25; i++) {
                await pause(page, 40);
                await page.mouse.move(box.x + 120 + (i % 2), box.y + box.height + 30);
            }
            await log("dragged below");
            await page.mouse.move(box.x + 120, box.y - 30, { steps: 6 });
            for (let i = 0; i < 25; i++) {
                await pause(page, 40);
                await page.mouse.move(box.x + 120 + (i % 2), box.y - 30);
            }
            await page.mouse.up();
            await log("dragged above");
        },
    },
    {
        name: "7c-wheel-momentum",
        fixture: "align",
        async run(page) {
            const box = (await page.evaluate(
                `(() => { const r = ${scrollerOf}.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
            )) as {
                x: number;
                y: number;
                width: number;
                height: number;
            };
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            // A flick and its decaying momentum, down then up, at 60 Hz.
            for (const sign of [1, -1])
                for (let delta = 90; delta > 1; delta *= 0.86) {
                    await page.mouse.wheel(0, sign * delta);
                    await pause(page, 16);
                }
        },
    },
];

interface FrameStat {
    readonly maxOffset: number;
    readonly misplaced: number;
}

/** Red ink lying farther than one pixel from any black ink, per frame. */
async function analyse(
    lab: Page,
    frames: readonly string[],
    clip: { x: number; y: number; width: number; height: number },
) {
    return (await lab.evaluate(
        async ([list, box]) => {
            const results: { maxOffset: number; misplaced: number }[] = [];
            const { x, y, width, height } = box as {
                x: number;
                y: number;
                width: number;
                height: number;
            };
            for (const base64 of list as string[]) {
                const image = new Image();
                image.src = `data:image/png;base64,${base64}`;
                await image.decode();
                const ratio = image.width / 900;
                const [cx, cy, cw, ch] = [x, y, width, height].map((v) =>
                    Math.round(v * ratio),
                ) as [number, number, number, number];
                const canvas = document.createElement("canvas");
                canvas.width = cw;
                canvas.height = ch;
                const context = canvas.getContext("2d")!;
                context.drawImage(image, cx, cy, cw, ch, 0, 0, cw, ch);
                const data = context.getImageData(0, 0, cw, ch).data;
                const black = new Uint8Array(cw * ch);
                const red: number[] = [];
                for (let i = 0; i < cw * ch; i++) {
                    const r = data[i * 4]!;
                    const g = data[i * 4 + 1]!;
                    const b = data[i * 4 + 2]!;
                    if (r < 120 && g < 120 && b < 120) black[i] = 1;
                    else if (r > 190 && g < 90 && b > 190) red.push(i);
                }
                let maxOffset = 0;
                let misplaced = 0;
                for (const i of red) {
                    const px = i % cw;
                    const py = Math.floor(i / cw);
                    let found = 12;
                    search: for (let radius = 1; radius < 12; radius++)
                        for (let dy = -radius; dy <= radius; dy++)
                            for (let dx = -radius; dx <= radius; dx++) {
                                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                                const nx = px + dx;
                                const ny = py + dy;
                                if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
                                if (black[ny * cw + nx]) {
                                    found = radius;
                                    break search;
                                }
                            }
                    if (found > 1) misplaced++;
                    maxOffset = Math.max(maxOffset, found);
                }
                results.push({ maxOffset: Number((maxOffset / ratio).toFixed(2)), misplaced });
            }
            return results;
        },
        [frames, clip] as const,
    )) as FrameStat[];
}

const browser = await chromium.launch();
const lab = await (await browser.newContext()).newPage();
await lab.evaluate("window.__name = (f) => f");
const rows: Record<string, unknown>[] = [];
const behaviour: Record<string, unknown>[] = [];
for (const testCase of cases) {
    if (only && !only.some((prefix) => testCase.name.startsWith(prefix))) continue;
    for (const scale of [1, 2])
        for (const variant of testCase.behaviour ? ["layer", "plain"] : ["layer"]) {
            const context = await browser.newContext({
                deviceScaleFactor: scale,
                viewport: { width: 900, height: 600 },
            });
            const page = await context.newPage();
            await page.goto(
                `${url}?variant=${variant}&fixture=${testCase.fixture}&width=640#mention-layer-bench`,
            );
            await page.locator("textarea").waitFor();
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate("window.__name = (f) => f");
            await page.evaluate(() => {
                document.querySelector("[data-mention-bench]")!.setAttribute("data-align", "both");
                const state = { frames: 0, bad: 0, worst: "" };
                Object.assign(window, { __sync: state });
                const check = () => {
                    state.frames++;
                    const textarea = document.querySelector("textarea")!;
                    const layer = document.querySelector<HTMLElement>(
                        ".happy-composer__mention-layer-text",
                    );
                    if (layer) {
                        const text = [...layer.children]
                            .map((paragraph) => paragraph.textContent)
                            .join("\n");
                        const value = textarea.value;
                        const a = textarea.getBoundingClientRect();
                        const b = layer.getBoundingClientRect();
                        const problems = [
                            value.startsWith(text) ? "" : "text is not the draft's start",
                            value.length === text.length || value[text.length] === "\n"
                                ? ""
                                : "text stops inside a paragraph",
                            Math.abs(a.top - b.top) < 0.01 ? "" : `top ${String(a.top - b.top)}`,
                            Math.abs(a.width - b.width) < 0.01
                                ? ""
                                : `width ${String(a.width - b.width)}`,
                        ].filter(Boolean);
                        if (problems.length > 0) {
                            state.bad++;
                            state.worst ||= problems.join("; ");
                        }
                    }
                    requestAnimationFrame(check);
                };
                requestAnimationFrame(check);
            });
            const cdp = await context.newCDPSession(page);
            const frames: string[] = [];
            cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
                frames.push(frame.data);
                void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
            });
            await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
            await pause(page, 300);
            const steps: unknown[] = [];
            const log = async (step: string) => {
                steps.push(
                    await page.evaluate(
                        `(() => ({ step: ${JSON.stringify(step)}, caret: document.querySelector("textarea").selectionStart, selectionEnd: document.querySelector("textarea").selectionEnd, scrollTop: Math.round(${scrollerOf}.scrollTop) }))()`,
                    ),
                );
            };
            let error = "";
            try {
                await testCase.run(page, cdp, context, log);
            } catch (caught) {
                error = String(caught);
            }
            await pause(page, 300);
            await cdp.send("Page.stopScreencast");
            if (testCase.behaviour) behaviour.push({ case: testCase.name, scale, variant, steps });
            if (variant === "plain") {
                await context.close();
                continue;
            }
            const dom = (await page.evaluate("window.__sync")) as {
                frames: number;
                bad: number;
                worst: string;
            };
            // The scroller's box at the end; a resize case is analysed over the whole composer column.
            const clip = (await page.evaluate(
                `(() => { const r = ${testCase.name.startsWith("6") ? 'document.querySelector("[data-mention-bench]")' : scrollerOf}.getBoundingClientRect(); return { x: r.x, y: r.y, width: Math.max(r.width, 660), height: r.height }; })()`,
            )) as { x: number; y: number; width: number; height: number };
            const stats = await analyse(lab, frames, clip);
            const worst = stats.reduce(
                (best, stat, index) =>
                    stat.maxOffset > (stats[best]?.maxOffset ?? -1) ? index : best,
                0,
            );
            const outOfStep = stats.filter((stat) => stat.maxOffset > 1).length;
            if (process.env.SYNC_DUMP && frames.length > 0) {
                writeFileSync(
                    join(out, `${testCase.name}-${String(scale * 100)}pct-first.png`),
                    Buffer.from(frames[0]!, "base64"),
                );
                writeFileSync(
                    join(out, `${testCase.name}-${String(scale * 100)}pct-last.png`),
                    Buffer.from(frames.at(-1)!, "base64"),
                );
                console.log(JSON.stringify(stats));
            }
            if (frames[worst])
                writeFileSync(
                    join(out, `${testCase.name}-${String(scale * 100)}pct-worst.png`),
                    Buffer.from(frames[worst]!, "base64"),
                );
            const row = {
                case: testCase.name,
                zoom: `${String(scale * 100)}%`,
                frames: frames.length,
                outOfStepFrames: outOfStep,
                maxOffsetPx: Math.max(0, ...stats.map((stat) => stat.maxOffset)),
                rafFrames: dom.frames,
                rafFramesOutOfStep: dom.bad,
                ...(dom.worst ? { rafProblem: dom.worst } : {}),
                ...(error ? { error } : {}),
            };
            rows.push(row);
            console.log(JSON.stringify(row));
            await context.close();
        }
}
writeFileSync(join(out, "sync.json"), JSON.stringify({ rows, behaviour }, null, 2));
await browser.close();
