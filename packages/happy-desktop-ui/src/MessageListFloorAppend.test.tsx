import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles.css";
import { MessageList, type MessageListScrollPosition } from "./Message";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it.each(["queued", "queued-wheel", "insert-only", "trim"] as const)(
    "uses the pre-insertion floor when content and viewport height change together (%s)",
    async (mode) => {
        const queued = mode === "queued" || mode === "queued-wheel";
        const view = createRenderer();
        let grow!: () => void;
        let commit!: () => void;
        let stop!: () => void;
        let position: MessageListScrollPosition | undefined;
        function Fixture() {
            const [state, setState] = useState({
                height: mode === "trim" ? 832 : 732,
                inserted: false,
                stopped: false,
            });
            grow = () =>
                flushSync(() =>
                    setState({
                        height: mode === "trim" ? 920 : 820,
                        inserted: false,
                        stopped: false,
                    }),
                );
            commit = () =>
                flushSync(() => setState({ height: 665, inserted: true, stopped: false }));
            stop = () => flushSync(() => setState((previous) => ({ ...previous, stopped: true })));
            const rows = [
                { key: "prefix", height: 499 },
                ...(state.inserted ? [{ key: "reply", height: state.stopped ? 78 : 76 }] : []),
                ...(state.stopped ? [{ key: "stopped", height: 32 }] : []),
                { key: "question", height: 80 },
                ...(mode === "trim" && !state.inserted ? [{ key: "removed", height: 100 }] : []),
                ...(!queued ? [{ key: "tail", height: 16 }] : []),
                ...(state.inserted && queued ? [{ key: "queued", height: 76 }] : []),
            ];
            return (
                <div style={{ display: "flex", height: state.height }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[state.inserted, state.stopped]}
                        estimateVersion={Number(state.inserted) + Number(state.stopped)}
                        onScrollPositionChange={(next) => {
                            position = next;
                        }}
                        estimateRowSize={(index) => rows[index]!.height}
                        paddingEnd={queued ? 24 : 8}
                        footer={
                            state.inserted && !state.stopped && queued ? (
                                <div style={{ height: 36 }} />
                            ) : undefined
                        }
                        footerHeight={state.inserted && !state.stopped && queued ? 36 : 0}
                        footerBefore={rows.length - 1}
                        initialScrollPosition={{
                            type: "row",
                            rowKey: ".$question",
                            offset: 80,
                            viewportInset: mode === "trim" ? 124 : 24,
                        }}
                    >
                        {rows.map((row) => (
                            <div key={row.key} data-row={row.key} style={{ height: row.height }}>
                                <span>{row.key}</span>
                            </div>
                        ))}
                    </MessageList>
                </div>
            );
        }
        try {
            view.render(Fixture, { width: 620, height: 900 });
            await view.ready();
            await frame();
            await frame();
            grow();
            await frame();
            await frame();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const row = viewport.querySelector<HTMLElement>('[data-row="question"]')!;
            const inset =
                viewport.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom;
            expect(viewport.scrollTop).toBe(0);
            expect(Math.abs(inset - (mode === "trim" ? 212 : 112))).toBeLessThanOrEqual(1);
            if (mode === "queued-wheel") {
                // The question is the last readable row. The upward wheel
                // cannot move native 0, so its standard point is still this
                // question's end. No native event arrives before the resize.
                viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, cancelable: true }));
                expect(viewport.scrollTop).toBe(0);
            }
            commit();
            await frame();
            await frame();
            // A shrinking viewport consumes the 88px held by grow(). Without
            // a queued row below it, the question keeps only its natural tail.
            expect(
                Math.abs(
                    viewport.getBoundingClientRect().bottom -
                        row.getBoundingClientRect().bottom -
                        (queued ? 112 : 24),
                ),
            ).toBeLessThanOrEqual(1);
            expect(Math.abs(viewport.scrollTop - (queued ? 114 : 26))).toBeLessThanOrEqual(1);
            expect(Math.abs(viewport.scrollHeight - (queued ? 803 : 691))).toBeLessThanOrEqual(1);
            if (queued) {
                expect(position).toMatchObject({
                    type: "row",
                    rowKey: ".$question",
                    offset: 80,
                    viewportInset: 112,
                });
                const top = row.getBoundingClientRect().top;
                // One echo consumes expectedScrollTop; a repeated native echo
                // and scrollend must retain the same nonstandard row point.
                viewport.dispatchEvent(new Event("scroll"));
                viewport.dispatchEvent(new Event("scroll"));
                viewport.dispatchEvent(new Event("scrollend"));
                expect(position).toMatchObject({
                    type: "row",
                    rowKey: ".$question",
                    offset: 80,
                    viewportInset: 112,
                });
                const nativeTop = viewport.scrollTop;
                const descriptor = Object.getOwnPropertyDescriptor(viewport, "scrollTop");
                try {
                    Object.defineProperty(viewport, "scrollTop", {
                        configurable: true,
                        get: () => nativeTop + 0.5,
                    });
                    viewport.dispatchEvent(new Event("scroll"));
                    viewport.dispatchEvent(new Event("scrollend"));
                    expect(position).toMatchObject({
                        type: "row",
                        rowKey: ".$question",
                        offset: 80,
                        viewportInset: 112,
                    });
                } finally {
                    if (descriptor) Object.defineProperty(viewport, "scrollTop", descriptor);
                    else Reflect.deleteProperty(viewport, "scrollTop");
                }
                stop();
                await frame();
                await frame();
                expect(Math.abs(row.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
                expect(position).toMatchObject({
                    type: "row",
                    rowKey: ".$question",
                    offset: 80,
                    viewportInset: 112,
                });
                viewport.scrollTop -= 1;
                viewport.dispatchEvent(new Event("scroll"));
                viewport.dispatchEvent(new Event("scrollend"));
                expect(position).toMatchObject({
                    type: "row",
                    rowKey: ".$queued",
                    offset: 76,
                    viewportInset: 35,
                });
            }
        } finally {
            view.destroy();
        }
    },
);

it.each(["wheel", "End"] as const)(
    "resumes following from a parked maximum through %s intent",
    async (intent) => {
        const view = createRenderer();
        let append!: () => void;
        let position: MessageListScrollPosition | undefined;
        function Fixture() {
            const [rows, setRows] = useState([0, 1]);
            append = () => flushSync(() => setRows([0, 1, 2]));
            return (
                <div style={{ display: "flex", height: 100, width: 620 }}>
                    <MessageList
                        virtualize
                        estimateRows={rows}
                        estimateDependencies={[]}
                        estimateRowSize={() => 70}
                        footer={<div style={{ height: 34 }} />}
                        footerHeight={34}
                        initialScrollPosition={{
                            type: "row",
                            rowKey: ".$1",
                            offset: 70,
                            viewportInset: 42,
                        }}
                        onScrollPositionChange={(next) => {
                            position = next;
                        }}
                    >
                        {rows.map((row) => (
                            <div key={row} data-row={row} style={{ height: 70 }}>
                                Row {row}
                            </div>
                        ))}
                    </MessageList>
                </div>
            );
        }
        try {
            view.render(Fixture, { width: 1000, height: 1000 });
            await view.ready();
            await frame();
            await frame();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            expect(viewport.scrollTop).toBe(viewport.scrollHeight - viewport.clientHeight);
            const before = viewport.scrollTop;
            if (intent === "wheel")
                viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, cancelable: true }));
            else
                viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
            expect(viewport.scrollTop).toBe(before);
            append();
            await frame();
            await frame();
            expect(position).toEqual({ type: "bottom" });
            expect(viewport.scrollTop).toBe(viewport.scrollHeight - viewport.clientHeight);
            const row = viewport.querySelector<HTMLElement>('[data-row="2"]')!;
            expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
                viewport.getBoundingClientRect().bottom,
            );
        } finally {
            view.destroy();
        }
    },
);

function streamingFixture(view: ReturnType<typeof createRenderer>) {
    let grow!: () => void;
    let position: MessageListScrollPosition | undefined;
    function Fixture() {
        const [live, setLive] = useState(140);
        grow = () => flushSync(() => setLive((previous) => previous + 20));
        const rows = [70, 70, 70, live];
        return (
            <div style={{ display: "flex", height: 160, width: 620 }}>
                <MessageList
                    virtualize
                    estimateDependencies={[live]}
                    estimateRowSize={(index) => rows[index]!}
                    onScrollPositionChange={(next) => {
                        position = next;
                    }}
                >
                    {rows.map((height, index) => (
                        <div key={index} data-row={index} style={{ height }}>
                            Row {index}
                        </div>
                    ))}
                </MessageList>
            </div>
        );
    }
    view.render(Fixture, { width: 1000, height: 1000 });
    return {
        grow: () => grow(),
        position: () => position,
        viewport: () => view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!,
    };
}

it.each(["wheel", "ArrowDown"] as const)(
    "resumes following when a %s from a reader just above a live end reaches it",
    async (intent) => {
        const view = createRenderer();
        try {
            const fixture = streamingFixture(view);
            await view.ready();
            await frame();
            await frame();
            const viewport = fixture.viewport();
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -30 }));
            viewport.scrollTop -= 30;
            await frame();
            await frame();
            expect(fixture.position()).not.toEqual({ type: "bottom" });
            // One notch or arrow press reaches further than the 30px left.
            if (intent === "wheel")
                viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true }));
            else
                viewport.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
                );
            for (let index = 0; index < 3; index += 1) {
                fixture.grow();
                await frame();
            }
            expect(fixture.position()).toEqual({ type: "bottom" });
            expect(viewport.scrollTop).toBe(viewport.scrollHeight - viewport.clientHeight);
        } finally {
            view.destroy();
        }
    },
);

it("never puts a scrollbar drag back when the stream commits before its scroll event", async () => {
    const view = createRenderer();
    try {
        const fixture = streamingFixture(view);
        await view.ready();
        await frame();
        await frame();
        const viewport = fixture.viewport();
        expect(viewport.scrollTop).toBe(viewport.scrollHeight - viewport.clientHeight);
        // A press on the native bar: past the client area, on the scrollport itself.
        const bounds = viewport.getBoundingClientRect();
        viewport.dispatchEvent(
            new PointerEvent("pointerdown", {
                bubbles: true,
                clientX: bounds.left + viewport.clientWidth + 1,
                clientY: bounds.top + 10,
            }),
        );
        let wanted = viewport.scrollTop;
        for (let step = 0; step < 4; step += 1) {
            wanted -= 20;
            viewport.scrollTop = wanted;
            fixture.grow();
            await frame();
            expect(Math.abs(viewport.scrollTop - wanted), `step ${String(step)}`).toBeLessThan(1);
        }
        window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        fixture.grow();
        await frame();
        await frame();
        expect(Math.abs(viewport.scrollTop - wanted)).toBeLessThan(1);
        expect(fixture.position()).not.toEqual({ type: "bottom" });
    } finally {
        view.destroy();
    }
});

it.each([180, 100])(
    "keeps a formerly floored transcript visible when the viewport becomes %ipx",
    async (nextHeight) => {
        const view = createRenderer();
        let shrink!: () => void;
        function Fixture() {
            const [height, setHeight] = useState(650);
            shrink = () => flushSync(() => setHeight(nextHeight));
            return (
                <div style={{ display: "flex", height }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[]}
                        estimateRowSize={() => 70}
                        footer={<div style={{ height: 34 }} />}
                        footerHeight={34}
                        initialScrollPosition={{
                            type: "row",
                            rowKey: ".$1",
                            offset: 70,
                            viewportInset: 42,
                        }}
                    >
                        {[0, 1].map((index) => (
                            <div key={index} data-row={index} style={{ height: 70 }}>
                                Row {index}
                            </div>
                        ))}
                    </MessageList>
                </div>
            );
        }
        try {
            view.render(Fixture, { width: 620, height: 700 });
            await view.ready();
            await frame();
            await frame();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const row = viewport.querySelector<HTMLElement>('[data-row="1"]')!;
            expect(
                row.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
            ).toBeGreaterThan(500);
            shrink();
            await frame();
            await frame();
            const bounds = viewport.getBoundingClientRect();
            expect(row.isConnected).toBe(true);
            expect(
                Math.abs(
                    row.getBoundingClientRect().top - bounds.top - (nextHeight === 180 ? 82 : -12),
                ),
            ).toBeLessThanOrEqual(1);
            if (nextHeight === 100)
                expect(
                    Math.abs(bounds.bottom - row.getBoundingClientRect().bottom - 42),
                ).toBeLessThanOrEqual(1);
            expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.bottom);
        } finally {
            view.destroy();
        }
    },
);

it.each([false, true])(
    "keeps a restored short reader row fixed when a row arrives below it (trim: %s)",
    async (trim) => {
        const view = createRenderer();
        let append!: () => void;
        function Fixture() {
            const [rows, setRows] = useState([70, 70]);
            append = () =>
                flushSync(() =>
                    setRows((previous) => [previous[0]!, previous[1]! - (trim ? 2 : 0), 42]),
                );
            return (
                <div style={{ display: "flex", height: 360 }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[rows.length]}
                        estimateRowSize={(index) => rows[index] ?? 0}
                        footer={<div style={{ height: 34 }} />}
                        footerHeight={34}
                        initialScrollPosition={{
                            type: "row",
                            rowKey: ".$1",
                            offset: 70,
                            viewportInset: 42,
                        }}
                    >
                        {rows.map((height, index) => (
                            <div key={index} data-row={index} style={{ height }}>
                                Row {index}
                            </div>
                        ))}
                    </MessageList>
                </div>
            );
        }
        try {
            view.render(Fixture, { width: 620, height: 360 });
            await view.ready();
            await frame();
            await frame();
            const row = view.container.querySelector<HTMLElement>('[data-row="1"]')!;
            const before = row.getBoundingClientRect().top;
            append();
            await frame();
            await frame();
            expect(row.isConnected).toBe(true);
            expect(Math.abs(row.getBoundingClientRect().top - before)).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);
