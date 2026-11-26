import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * A leave makes every row below it glide up, and a list with work running in
 * it commits many times while they do. Each `getAnimations()` call walks every
 * animation in the document — a working row carries a spinner and a title
 * shimmer — so a commit that asked each gliding row for its own held the main
 * thread for hundreds of milliseconds per commit: the next ✕ stayed on screen
 * for a second and the gap closed in jerks. A commit asks for the document's
 * animations at most once, however many rows are gliding.
 */

const ROWS = 60;
const leave = { icon: "close", label: "Leave", reveal: "hover" } as const;

const rowsInitial = (): SidebarItem[] =>
    Array.from({ length: ROWS }, (_, index) => ({
        action: leave,
        id: `task-${String(index)}`,
        kind: "project",
        label: `Task ${String(index)}`,
        status: "working",
    }));

type Control = {
    readonly leave: (id: string) => void;
    readonly rename: (id: string, label: string) => void;
};

afterEach(() => {
    vi.restoreAllMocks();
});

it("asks for the document's animations at most once per commit while the rows below a leave glide", async () => {
    let control: Control | undefined;
    const Fixture = () => {
        const [rows, setRows] = useState(rowsInitial);
        control = {
            leave: (id) => setRows((current) => current.filter((entry) => entry.id !== id)),
            rename: (id, label) =>
                setRows((current) =>
                    current.map((entry) => (entry.id === id ? { ...entry, label } : entry)),
                ),
        };
        return (
            <div style={{ display: "flex", flexDirection: "column", height: 2400, width: 300 }}>
                <Sidebar
                    activeItemId=""
                    onItemAction={(id) => control?.leave(id)}
                    onItemSelect={() => {}}
                    sections={[{ id: "tasks", label: "Tasks", items: rows }]}
                    style={{ width: "100%" }}
                />
            </div>
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 300, height: 2400 });
    await view.ready();
    const root = view.container;
    const top = (id: string) =>
        Number.parseFloat(
            getComputedStyle(root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!).top,
        ) || 0;

    flushSync(() => control!.leave("task-0"));
    // Every row below the one that left stands displaced, on its way up.
    const gliding = Array.from({ length: ROWS - 1 }, (_, index) => `task-${String(index + 1)}`);
    expect(gliding.filter((id) => top(id) !== 0).length).toBeGreaterThan(ROWS / 2);

    // Commits that change no arrangement while the glide runs, as a working
    // list's status and title updates do.
    const asks = vi.spyOn(Element.prototype, "getAnimations");
    for (let index = 0; index < 5; index += 1) {
        asks.mockClear();
        flushSync(() => control!.rename("task-30", `Task 30, update ${String(index)}`));
        expect(gliding.filter((id) => top(id) !== 0).length).toBeGreaterThan(ROWS / 2);
        expect(asks.mock.calls.length).toBeLessThanOrEqual(1);
    }
});
