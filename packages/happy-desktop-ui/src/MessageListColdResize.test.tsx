import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import { MessageList, type MessageListScrollPosition } from "./Message";
import { RetainedViews } from "./RetainedViews";
import { createRenderer } from "./testing";

const settle = async () => {
    for (let i = 0; i < 4; i++)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

it.each([
    { target: 49, nextHeight: 1223.875 },
    { target: 25, nextHeight: 1223.875 },
    { target: 49, nextHeight: 620 },
    { target: 25, nextHeight: 620 },
    { target: 10, nextHeight: 800, native: "write" },
    { target: 10, nextHeight: 800, native: "wheel" },
    { target: 10, nextHeight: 1223.875, native: "write" },
])(
    "publishes the visible view when hidden before native event or resize delivery: %j",
    async ({ target, nextHeight, native }) => {
        const view = createRenderer();
        let update!: (height: number, active: boolean, cold?: boolean) => void;
        let latest: MessageListScrollPosition | undefined;
        let saved: MessageListScrollPosition | undefined;
        function Fixture() {
            const [state, setState] = useState({ height: 650, active: true, generation: 0 });
            update = (height, active, cold = false) =>
                flushSync(() =>
                    setState((previous) => ({
                        height,
                        active,
                        generation: previous.generation + Number(cold),
                    })),
                );
            return (
                <RetainedViews
                    activeId={state.active ? "chat" : undefined}
                    views={[
                        {
                            id: "chat",
                            content: (
                                <div
                                    data-scrollbar-visibility="always"
                                    style={{ display: "flex", height: state.height }}
                                >
                                    <MessageList
                                        key={state.generation}
                                        virtualize
                                        estimateDependencies={[]}
                                        estimateRowSize={() => 100}
                                        initialScrollPosition={
                                            saved ?? {
                                                type: "row",
                                                rowKey: `.$${target}`,
                                                offset: 25,
                                                viewportInset: 32,
                                            }
                                        }
                                        onScrollPositionChange={(position) => {
                                            latest = position;
                                        }}
                                    >
                                        {Array.from({ length: 50 }, (_, index) => (
                                            <div
                                                key={index}
                                                data-row={index}
                                                style={{ height: 100 }}
                                            >
                                                <span>Row {index} glyph</span>
                                            </div>
                                        ))}
                                    </MessageList>
                                </div>
                            ),
                        },
                    ]}
                />
            );
        }
        const viewport = () =>
            view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
        const read = () => {
            const element = viewport();
            const row = element.querySelector<HTMLElement>(`[data-row="${target}"]`)!;
            expect(row).not.toBeNull();
            const range = document.createRange();
            range.selectNodeContents(row.querySelector("span")!);
            return [
                row.getBoundingClientRect().top - element.getBoundingClientRect().top,
                range.getBoundingClientRect().top - element.getBoundingClientRect().top,
            ];
        };
        try {
            view.render(Fixture, { width: 560, height: 1400 });
            await view.ready();
            await settle();
            update(800, true);
            await settle();
            const committed = read();
            const committedTop = viewport().scrollTop;
            const element = viewport();
            let nativeTop = committedTop;
            if (native === "wheel") {
                let hidden = false;
                const hideBeforeTarget = (event: Event) => {
                    if (event.target !== element || element.scrollTop === committedTop) return;
                    nativeTop = element.scrollTop;
                    update(nextHeight, false);
                    hidden = true;
                };
                document.addEventListener("scroll", hideBeforeTarget, true);
                try {
                    await userEvent.wheel(element, { delta: { y: 200 } });
                    await expect.poll(() => hidden).toBe(true);
                    expect(nativeTop - committedTop).toBeGreaterThan(1);
                } finally {
                    document.removeEventListener("scroll", hideBeforeTarget, true);
                }
            } else {
                if (native === "write") element.scrollTop += 200;
                if (nextHeight !== 800) {
                    // Force native layout and its clamp, then hide in this task
                    // before ResizeObserver can deliver the changed box.
                    element.style.flex = "none";
                    element.style.height = `${nextHeight}px`;
                }
                nativeTop = element.scrollTop;
                if (target === 49 && nextHeight > 800)
                    expect(nativeTop).toBeLessThan(committedTop - 400);
                update(nextHeight, false);
            }
            saved = latest;
            expect(saved?.type === "row" && saved.viewportHeight).toBe(800);
            element.style.removeProperty("height");
            element.style.removeProperty("flex");
            await settle();
            update(nextHeight, true);
            await settle();
            const warm = read();
            // Pending geometry keeps its committed view, even if native input
            // arrived in the same task. An unchanged box keeps the native move.
            const movement = nextHeight === 800 ? nativeTop - committedTop : 0;
            console.log(
                "DBG",
                JSON.stringify({
                    committed,
                    warm,
                    nativeTop,
                    committedTop,
                    top: element.scrollTop,
                    cw: element.clientWidth,
                    ow: element.offsetWidth,
                    sh: element.scrollHeight,
                    ch: element.clientHeight,
                    saved,
                }),
            );
            for (let i = 0; i < warm.length; i++)
                expect(Math.abs(warm[i]! - (committed[i]! - movement))).toBeLessThanOrEqual(1);
            update(nextHeight, true, true);
            await settle();
            const cold = read();
            for (let i = 0; i < warm.length; i++)
                expect(Math.abs(cold[i]! - warm[i]!)).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);

it.each([false, true])(
    "publishes the held nonstandard point before a hidden width change (prepend: %s)",
    async (prepend) => {
        const view = createRenderer();
        let update!: (width: number, height: number, active: boolean, cold?: boolean) => void;
        let latest: MessageListScrollPosition | undefined;
        let saved: MessageListScrollPosition | undefined;
        let prependRows!: () => void;
        function Fixture() {
            const [state, setState] = useState({
                width: 820,
                height: 650,
                active: true,
                generation: 0,
                first: 0,
            });
            prependRows = () =>
                flushSync(() => setState((previous) => ({ ...previous, first: -10 })));
            update = (width, height, active, cold = false) =>
                flushSync(() =>
                    setState((previous) => ({
                        width,
                        height,
                        active,
                        generation: previous.generation + Number(cold),
                        first: previous.first,
                    })),
                );
            return (
                <div style={{ width: state.width }}>
                    <RetainedViews
                        activeId={state.active ? "chat" : undefined}
                        views={[
                            {
                                id: "chat",
                                content: (
                                    <div style={{ display: "flex", height: state.height }}>
                                        <MessageList
                                            key={state.generation}
                                            virtualize
                                            estimateDependencies={[state.first]}
                                            estimateRowSize={(index, width) =>
                                                index + state.first === 10 && width < 600
                                                    ? 196
                                                    : 100
                                            }
                                            initialScrollPosition={
                                                saved ?? {
                                                    type: "row",
                                                    rowKey: ".$10",
                                                    offset: 25,
                                                    viewportInset: 32,
                                                }
                                            }
                                            onScrollPositionChange={(position) => {
                                                latest = position;
                                            }}
                                        >
                                            {Array.from(
                                                { length: 50 - state.first },
                                                (_, offset) => {
                                                    const index = offset + state.first;
                                                    return (
                                                        <div
                                                            key={index}
                                                            data-row={index}
                                                            style={{
                                                                height:
                                                                    index === 10 &&
                                                                    state.width < 600
                                                                        ? 196
                                                                        : 100,
                                                            }}
                                                        >
                                                            <span>Row {index} glyph</span>
                                                        </div>
                                                    );
                                                },
                                            )}
                                        </MessageList>
                                    </div>
                                ),
                            },
                        ]}
                    />
                </div>
            );
        }
        const read = () => {
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const row = viewport.querySelector<HTMLElement>('[data-row="10"]')!;
            const range = document.createRange();
            range.selectNodeContents(row.querySelector("span")!);
            return [
                row.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
                range.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
            ];
        };
        try {
            view.render(Fixture, { width: 900, height: 1000 });
            await view.ready();
            await settle();
            update(820, 800, true);
            await settle();
            const before = read();
            if (prepend) {
                prependRows();
                await settle();
                expect(Math.abs(read()[0]! - before[0]!)).toBeLessThanOrEqual(1);
            }
            update(820, 800, false);
            saved = latest;
            expect(saved).toEqual({
                type: "row",
                rowKey: ".$10",
                offset: 25,
                viewportInset: 182,
                viewportHeight: 800,
            });
            update(537, 800, false);
            await settle();
            update(537, 800, true);
            await settle();
            const warm = read();
            update(537, 800, true, true);
            await settle();
            const cold = read();
            for (let i = 0; i < before.length; i++) {
                expect(Math.abs(warm[i]! - before[i]!)).toBeLessThanOrEqual(1);
                expect(Math.abs(cold[i]! - before[i]!)).toBeLessThanOrEqual(1);
            }
        } finally {
            view.destroy();
        }
    },
);

it("keeps the legacy bottom-relative restore when no viewport height was saved", async () => {
    const view = createRenderer();
    try {
        view.render(
            () => (
                <div style={{ display: "flex", height: 1223.875 }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[]}
                        estimateRowSize={() => 100}
                        initialScrollPosition={{
                            type: "row",
                            rowKey: ".$10",
                            offset: 25,
                            viewportInset: 32,
                        }}
                    >
                        {Array.from({ length: 50 }, (_, index) => (
                            <div key={index} data-row={index} style={{ height: 100 }}>
                                Row {index}
                            </div>
                        ))}
                    </MessageList>
                </div>
            ),
            { width: 800, height: 1400 },
        );
        await view.ready();
        await settle();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const row = viewport.querySelector<HTMLElement>('[data-row="10"]')!;
        expect(viewport.scrollTop).toBe(0);
        expect(
            Math.abs(row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 1012),
        ).toBeLessThanOrEqual(1);
    } finally {
        view.destroy();
    }
});

it.each([
    { count: 50, before: 650, after: 1223.875, zoom: 1 },
    { count: 50, before: 650, after: 360, zoom: 1 },
    { count: 50, before: 650, after: 360, zoom: 1, live: true },
    { count: 50, before: 650, after: 620, zoom: 1 },
    { count: 2, before: 360, after: 650, zoom: 1 },
    { count: 2, before: 650, after: 180, zoom: 1 },
    { count: 2, before: 650, after: 180, zoom: 0.67 },
    { count: 2, before: 650, after: 180, zoom: 1.5 },
    { count: 2, before: 650, after: 180, zoom: 1, pending: true },
    { count: 2, before: 650, after: 180, zoom: 0.67, pending: true },
    { count: 2, before: 650, after: 180, zoom: 1.5, pending: true },
    { count: 50, before: 650, after: 1223.875, zoom: 0.67 },
    { count: 2, before: 360, after: 650, zoom: 0.67 },
    { count: 2, before: 650, after: 1223.875, zoom: 0.67 },
    { count: 2, before: 650, after: 1223.875, zoom: 1.5 },
    { count: 2, before: 650, after: 1223.875, zoom: 0.67, pending: true },
    { count: 2, before: 650, after: 1223.875, zoom: 1.5, pending: true },
])("restores the same row and glyph as a retained view: %j", async (scenario) => {
    const view = createRenderer();
    let change!: (active: boolean, height: number, zoom: number, cold?: boolean) => void;
    let latest: MessageListScrollPosition | undefined;
    let saved: MessageListScrollPosition | undefined;
    const target = scenario.count === 2 ? 1 : 10;
    const measured = scenario.count === 50 && scenario.after === 360 ? 7 : target;
    function Fixture() {
        const [state, setState] = useState({
            active: true,
            height: scenario.before,
            zoom: 1,
            generation: 0,
        });
        change = (active, height, zoom, cold = false) =>
            flushSync(() =>
                setState((previous) => ({
                    active,
                    height,
                    zoom,
                    generation: previous.generation + Number(cold),
                })),
            );
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: state.height,
                    width: scenario.count === 2 && scenario.before === 650 ? 600 : 537.3125,
                    zoom: state.zoom,
                }}
            >
                <RetainedViews
                    activeId={state.active ? "chat" : undefined}
                    views={[
                        {
                            id: "chat",
                            content: (
                                <div style={{ display: "flex", height: "100%" }}>
                                    <MessageList
                                        key={state.generation}
                                        virtualize
                                        estimateDependencies={[]}
                                        estimateRowSize={() => 100}
                                        initialScrollPosition={
                                            saved ?? {
                                                type: "row",
                                                rowKey: `.$${target}`,
                                                offset: 25,
                                                viewportInset: 32,
                                            }
                                        }
                                        onScrollPositionChange={(position) => {
                                            latest = position;
                                        }}
                                    >
                                        {Array.from({ length: scenario.count }, (_, index) => (
                                            <div
                                                key={index}
                                                data-row={index}
                                                style={{ height: 100 }}
                                            >
                                                <span>Row {index} glyph</span>
                                            </div>
                                        ))}
                                    </MessageList>
                                </div>
                            ),
                        },
                    ]}
                />
            </div>
        );
    }
    const read = () => {
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const row = viewport.querySelector<HTMLElement>(`[data-row="${measured}"]`)!;
        expect(row).not.toBeNull();
        const range = document.createRange();
        range.selectNodeContents(row.querySelector("span")!);
        return [
            row.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
            range.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
        ];
    };
    try {
        view.render(Fixture, { width: 800, height: 1400 });
        await view.ready();
        await settle();
        const before = read();
        const element = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
        if (scenario.pending === true) {
            element.style.flex = "none";
            element.style.height = `${scenario.after}px`;
            void element.scrollTop;
        }
        change(false, scenario.before, 1);
        element.style.removeProperty("height");
        element.style.removeProperty("flex");
        await settle();
        saved = latest;
        expect(saved?.type).toBe("row");
        expect(saved?.type === "row" && saved.viewportHeight).toBe(scenario.before);
        if (scenario.count === 2 && scenario.after === 1223.875 && saved?.type === "row")
            expect(
                Math.abs(before[0]! + saved.offset - (scenario.before - saved.viewportInset!)),
            ).toBeLessThanOrEqual(1);
        const live = scenario.live === true;
        if (live) {
            change(true, scenario.before, 1);
            await settle();
        }
        change(live, scenario.after, scenario.zoom);
        await settle();
        change(true, scenario.after, scenario.zoom);
        await settle();
        const warm = read();
        if (scenario.count === 50 && scenario.zoom === 1)
            for (let i = 0; i < before.length; i++)
                expect(Math.abs(warm[i]! - before[i]!)).toBeLessThanOrEqual(1);
        change(true, scenario.after, scenario.zoom, true);
        await settle();
        const cold = read();
        for (let i = 0; i < warm.length; i++)
            expect(Math.abs(cold[i]! - warm[i]!)).toBeLessThanOrEqual(1);
    } finally {
        view.destroy();
    }
});
