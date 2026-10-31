import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import { createRenderer } from "./testing";

/* A bot hidden for the reader folds shut in place and opens there again, the same row. */

let awaySet: (away: boolean) => void = () => undefined;
function Bots() {
    const [away, setAway] = useState(false);
    awaySet = (next) => flushSync(() => setAway(next));
    const items = [
        { id: "growth", kind: "project", label: "Social Growth", away, unread: !away },
        { id: "release", kind: "project", label: "Release monitor" },
    ] as const;
    return (
        <Sidebar
            activeItemId=""
            onItemSelect={() => undefined}
            sections={[{ id: "bots", label: "Bots", items: [...items] }]}
        />
    );
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 400));

it("folds a hidden bot shut where it stands and opens the same row again with its dot", async () => {
    const view = createRenderer({ width: 280, height: 400 });
    view.render(() => <Bots />);
    await view.ready();
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    const node = row("growth");
    const below = row("release").getBoundingClientRect().top;
    awaySet(true);
    // Mid-glide it is part way shut, and the row under it is on its way up.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(node.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(node.getBoundingClientRect().height).toBeLessThan(32);
    await settled();
    expect([
        node.getBoundingClientRect().height,
        row("release").getBoundingClientRect().top,
    ]).toEqual([0, below - 34]);
    awaySet(false);
    await settled();
    expect(row("growth")).toBe(node);
    expect([
        node.getBoundingClientRect().height,
        row("release").getBoundingClientRect().top,
    ]).toEqual([32, below]);
    expect(node.hasAttribute("data-unread")).toBe(true);
});

it("walks the arrows past a row that is away", async () => {
    const view = createRenderer({ width: 280, height: 400 });
    view.render(() => (
        <Sidebar
            activeItemId=""
            keyboardNavigation
            onItemSelect={() => undefined}
            sections={[
                {
                    id: "bots",
                    label: "Bots",
                    items: [
                        { id: "a", kind: "project", label: "A" },
                        { id: "b", kind: "project", label: "B", away: true },
                        { id: "c", kind: "project", label: "C" },
                    ],
                },
            ]}
        />
    ));
    await view.ready();
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    row("a").focus();
    row("a").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(row("c"));
});

it("hands the focus of a row going away to the nearest row shown, and the arrows go on", async () => {
    let hide: () => void = () => undefined;
    function Rows() {
        const [away, setAway] = useState(false);
        hide = () => flushSync(() => setAway(true));
        const items = ["a", "b", "c", "d"].map((id) => ({
            id,
            kind: "project" as const,
            label: id,
            ...(id === "b" ? { away } : {}),
        }));
        return (
            <Sidebar
                activeItemId=""
                keyboardNavigation
                onItemSelect={() => undefined}
                sections={[{ id: "bots", label: "Bots", items }]}
            />
        );
    }
    const view = createRenderer({ width: 280, height: 400 });
    view.render(() => <Rows />);
    await view.ready();
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    row("b").focus();
    hide();
    expect(document.activeElement).toBe(row("c"));
    row("c").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(row("d"));
});
