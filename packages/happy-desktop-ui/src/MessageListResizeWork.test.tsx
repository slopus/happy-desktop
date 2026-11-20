import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles.css";
import { ResizeHandle } from "./AppShell";
import { MessageList } from "./Message";
import { markdownBodyHeight, messageTextLayoutCacheCreate } from "./messageTextLayout";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const frames = async () => {
    for (let i = 0; i < 4; i += 1) await frame();
};

it("resizes the visible paragraph without preparing retained offscreen paragraphs, then enters them exactly", async () => {
    const originalRequest = window.requestIdleCallback;
    const originalCancel = window.cancelIdleCallback;
    const callbacks = new Map<number, IdleRequestCallback>();
    let nextId = 0;
    window.requestIdleCallback = (callback) => {
        callbacks.set(++nextId, callback);
        return nextId;
    };
    window.cancelIdleCallback = (id) => {
        callbacks.delete(id);
    };
    const textCache = messageTextLayoutCacheCreate();
    const sources = Array.from({ length: 5 }, (_, row) =>
        Array.from(
            { length: 1200 },
            (_, line) =>
                `Transcript ${row}, line ${line}. The same durable response exercises transcript projection, markdown layout and syntax highlighting at each desktop width. Prepared text must not evict its visible neighbour during a split drag. `,
        ).join(""),
    );
    const sizes = new Map<string, number>();
    const misses: { index: number; width: number; ms: number }[] = [];
    const key = (index: number, width: number) => `${index}:${width}`;
    const measure = (index: number, width: number) => {
        const cached = sizes.get(key(index, width));
        if (cached !== undefined) return cached;
        const start = performance.now();
        const height = markdownBodyHeight(sources[index]!, width, textCache);
        misses.push({ index, width, ms: performance.now() - start });
        sizes.set(key(index, width), height);
        return height;
    };
    let resize!: (width: number) => void;
    let mounts = 0;
    function KeptInput() {
        useState(() => {
            mounts += 1;
            return 0;
        });
        return (
            <input
                aria-label="kept editor"
                defaultValue="selection survives"
                style={{ position: "absolute", top: 2000 }}
            />
        );
    }
    const rows = sources.map((text, index) => (
        <div
            key={index}
            data-row={index}
            style={{
                position: "relative",
                fontFamily: "var(--happy-font-ui)",
                fontSize: 16,
                lineHeight: "24px",
            }}
        >
            <p style={{ margin: 0 }}>{text}</p>
            {index === 4 ? <KeptInput /> : null}
        </div>
    ));
    function Fixture() {
        const [width, setWidth] = useState(720);
        resize = (next) => flushSync(() => setWidth(next));
        return (
            <div style={{ display: "flex", height: 360, width }}>
                <ResizeHandle
                    edge="right"
                    label="Resize fixture"
                    min={300}
                    max={1000}
                    value={width}
                    onResize={resize}
                />
                <MessageList
                    virtualize
                    estimateRows={sources}
                    estimateDependencies={[]}
                    estimateRowSize={measure}
                    cachedRowSize={(index, width) => sizes.get(key(index, width))}
                    prepareRowSize={function* (index, width) {
                        measure(index, width);
                        yield;
                    }}
                    initialScrollPosition={{
                        type: "row",
                        rowKey: ".$4",
                        offset: 2000,
                        viewportInset: 180,
                    }}
                >
                    {rows}
                </MessageList>
            </div>
        );
    }
    const view = createRenderer();
    const drain = async () => {
        for (let i = 0; callbacks.size > 0 && i < 100; i += 1) {
            const [id, callback] = callbacks.entries().next().value!;
            callbacks.delete(id);
            callback({ didTimeout: false, timeRemaining: () => 8 });
            await frame();
        }
        expect(callbacks.size).toBe(0);
    };
    try {
        view.render(Fixture, { width: 1100, height: 650 });
        await view.ready();
        await frames();
        await drain();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const mounted = Array.from(viewport.querySelectorAll<HTMLElement>("[data-row]"));
        const originalWidths = new Map(
            mounted.map((row) => [row, row.getBoundingClientRect().width]),
        );
        expect(mounted.length).toBe(5);
        const visible = viewport.querySelector<HTMLElement>('[data-row="4"]')!;
        const input = viewport.querySelector<HTMLInputElement>("input")!;
        input.focus({ preventScroll: true });
        input.setSelectionRange(2, 8);
        const mountedBefore = mounts;
        const point = () =>
            visible.getBoundingClientRect().top - viewport.getBoundingClientRect().top + 2000;
        const held = point();
        const splitter = view.container.querySelector<HTMLElement>('[role="separator"]')!;
        splitter.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 700 }),
        );
        const timings: { width: number; ms: number; misses: number[] }[] = [];
        for (const width of [615, 481, 799, 557]) {
            const start = performance.now();
            misses.length = 0;
            resize(width);
            await frames();
            timings.push({
                width,
                ms: performance.now() - start,
                misses: misses.map((x) => x.index),
            });
            expect(misses.length).toBeGreaterThan(0);
            expect(misses.every(({ index }) => index === 4)).toBe(true);
            expect(Math.abs(point() - held)).toBeLessThanOrEqual(1);
            expect(document.activeElement).toBe(input);
            expect(input.selectionStart).toBe(2);
            expect(input.selectionEnd).toBe(8);
            expect(mounts).toBe(mountedBefore);
            for (const row of mounted)
                expect(viewport.querySelector(`[data-row="${row.dataset.row}"]`)).toBe(row);
            for (const row of mounted.slice(0, 4)) {
                expect(row.getBoundingClientRect().bottom).toBeLessThan(
                    viewport.getBoundingClientRect().top,
                );
                expect(row.getBoundingClientRect().width).toBe(originalWidths.get(row));
            }
            expect(visible.getBoundingClientRect().width).toBeCloseTo(viewport.clientWidth, 0);
            expect(callbacks.size).toBe(0);
        }
        console.log("cold resize work", JSON.stringify(timings));
        // Repeat a new cold width after all background preparation has had a
        // chance to evict the visible run from the bounded text cache.
        splitter.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
        await drain();
        splitter.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
        misses.length = 0;
        resize(631);
        await frames();
        expect(misses.map(({ index }) => index)).toEqual([4]);
        console.log("first cold width after idle", JSON.stringify(misses));
        expect(Math.abs(point() - held)).toBeLessThanOrEqual(1);
        // Text selection is a mandatory geometry consumer even in a row above
        // the viewport; its DOM endpoints survive the width transition.
        const selectedText = mounted[3]!.querySelector("p")!.firstChild!;
        const selection = document.getSelection()!;
        const range = document.createRange();
        range.setStart(selectedText, 13);
        range.setEnd(selectedText, 25);
        selection.removeAllRanges();
        selection.addRange(range);
        const selected = selection.toString();
        misses.length = 0;
        resize(589);
        await frames();
        expect(new Set(misses.map(({ index }) => index))).toEqual(new Set([3, 4]));
        expect(selection.anchorNode).toBe(selectedText);
        expect(selection.focusNode).toBe(selectedText);
        expect(selection.anchorOffset).toBe(13);
        expect(selection.focusOffset).toBe(25);
        expect(selection.toString()).toBe(selected);
        selection.removeAllRanges();
        // Selecting document text is a new browser selection operation. Start
        // a fresh input selection before checking the later scroll transition.
        input.focus({ preventScroll: true });
        input.setSelectionRange(2, 8);
        // A real scroll intent must size the pending neighbour before it enters.
        viewport.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2 }));
        const previous = viewport.querySelector<HTMLElement>('[data-row="3"]')!;
        viewport.scrollTop +=
            previous.getBoundingClientRect().top - viewport.getBoundingClientRect().top + 2000;
        await frames();
        expect(previous.getBoundingClientRect().width).toBeCloseTo(viewport.clientWidth, 0);
        const previousPoint =
            previous.getBoundingClientRect().top - viewport.getBoundingClientRect().top + 2000;
        expect(previousPoint).toBeGreaterThanOrEqual(-1);
        expect(previousPoint).toBeLessThanOrEqual(viewport.clientHeight + 1);
        splitter.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
        await drain();
        await frames();
        expect(
            Math.abs(
                previous.getBoundingClientRect().top -
                    viewport.getBoundingClientRect().top +
                    2000 -
                    previousPoint,
            ),
        ).toBeLessThanOrEqual(1);
        for (const row of mounted) {
            expect(viewport.querySelector(`[data-row="${row.dataset.row}"]`)).toBe(row);
            expect(row.getBoundingClientRect().width).toBeCloseTo(viewport.clientWidth, 0);
        }
        expect(input.value).toBe("selection survives");
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(8);
    } finally {
        view.destroy();
        window.requestIdleCallback = originalRequest;
        window.cancelIdleCallback = originalCancel;
    }
}, 30_000);
