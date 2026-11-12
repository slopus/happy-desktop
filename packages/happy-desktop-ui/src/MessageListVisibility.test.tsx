import { Activity, useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { createRenderer } from "./testing";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it.each(["activity", "css"])(
    "reports the same visible rows again after a retained %s view reappears",
    async (mode) => {
        const view = createRenderer();
        const report = vi.fn<(first: number, last: number, element: HTMLElement) => void>();
        let shownSet!: (shown: boolean) => void;
        // A transcript that fits has the same range before and after hiding,
        // so a callback cannot be rescued by an unrelated scroll change.
        const rows = Array.from({ length: 6 }, (_, index) => (
            <div key={index} data-row={index} style={{ height: 50 }}>
                Row {index}
            </div>
        ));
        function Fixture() {
            const [shown, setShown] = useState(true);
            shownSet = (value) => flushSync(() => setShown(value));
            return (
                <Activity mode={mode === "activity" && !shown ? "hidden" : "visible"}>
                    <div
                        style={{
                            display: mode === "css" && !shown ? "none" : "flex",
                            height: 360,
                            width: 620,
                        }}
                    >
                        <MessageList
                            virtualize
                            estimateRowSize={() => 50}
                            onVisibleRowsChange={report}
                        >
                            {rows}
                        </MessageList>
                    </div>
                </Activity>
            );
        }
        try {
            view.render(Fixture, { width: 620, height: 360 });
            await view.ready();
            await vi.waitFor(() => expect(report).toHaveBeenCalled());
            await nextFrame();
            await nextFrame();
            const initial = report.mock.calls.at(-1)!;
            const viewport = initial[2];
            const scrollTop = viewport.scrollTop;
            const mounted = [...viewport.querySelectorAll<HTMLElement>("[data-row]")];
            const geometry = mounted.map((row) => ({ row, top: row.getBoundingClientRect().top }));
            shownSet(false);
            await nextFrame();
            await nextFrame();
            expect(viewport.checkVisibility()).toBe(false);
            report.mockClear();
            shownSet(true);
            await vi.waitFor(() => expect(report).toHaveBeenCalled());
            await nextFrame();
            const restored = report.mock.calls.at(-1)!;
            expect(restored.slice(0, 2)).toEqual(initial.slice(0, 2));
            expect(restored[2]).toBe(viewport);
            expect(viewport.scrollTop).toBe(scrollTop);
            for (const { row, top } of geometry) {
                const restoredRow = viewport.querySelector<HTMLElement>(
                    `[data-row="${row.dataset.row}"]`,
                )!;
                // Activity retains row DOM. A CSS-zero virtualizer may release
                // hidden rows; its viewport and restored geometry still persist.
                if (mode === "activity") expect(restoredRow).toBe(row);
                expect(restoredRow.getBoundingClientRect().top).toBe(top);
            }
        } finally {
            view.destroy();
        }
    },
);
