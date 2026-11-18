import "./styles.css";
import { flushSync } from "react-dom";
import { useState } from "react";
import { expect, it } from "vitest";
import { ComposerModelControl, type ComposerModelSelection } from "./ComposerModelControl";
import { createRenderer } from "./testing";

const catalog = ["First", "Middle", "Last"].map((id) => ({
    id,
    label: id,
    account: id,
    accounts: [
        {
            id,
            label: id,
            models: Array.from({ length: 12 }, (_, i) => ({
                id: String(i),
                label: `Model ${String(i)}`,
                efforts: [],
            })),
        },
    ],
}));

const choice = (service: string, index: number): ComposerModelSelection => ({
    service,
    account: service,
    model: String(index),
});

async function picker(initial: ComposerModelSelection, height = 430) {
    // The owner can deliver a new selection while the menu is open.
    let select!: (next: ComposerModelSelection) => void;
    const Fixture = () => {
        const [selection, setSelection] = useState(initial);
        select = setSelection;
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "flex-end",
                    height,
                }}
            >
                <ComposerModelControl
                    selection={selection}
                    services={catalog}
                    onAccountsManage={async () => {}}
                />
            </div>
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 640, height, padding: 0 });
    await view.ready();
    const button = (part: string) =>
        view.container.querySelector<HTMLButtonElement>(
            `[data-happy-desktop-ui="composer-model-control-${part}"]`,
        )!;
    flushSync(() => button("trigger").click());
    return {
        select: (next: ComposerModelSelection) => flushSync(() => select(next)),
        toggle: () =>
            flushSync(() => {
                const anchor = button("model-setting");
                anchor.focus();
                anchor.click();
            }),
        get viewport() {
            return view.container.querySelector<HTMLElement>("[data-scrollbar-viewport]")!;
        },
        get row() {
            return view.container.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!;
        },
        get group() {
            return view.container.querySelector<HTMLElement>(
                '[role="group"][aria-label="Middle"]',
            )!;
        },
    };
}

const midpoint = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return (rect.top + rect.bottom) / 2;
};

/** Sample every visible frame, including the commit before the first paint. */
async function staysAt(viewport: HTMLElement, top: number) {
    const until = performance.now() + 450;
    do {
        expect(viewport.scrollTop).toBe(top);
        await new Promise<void>((done) => requestAnimationFrame(() => done()));
    } while (performance.now() < until);
    expect(viewport.scrollTop).toBe(top);
}

it("centers the provider on the opening commit, then leaves a changed selection alone until reopen", async () => {
    const p = await picker(choice("Middle", 4));
    p.toggle();
    expect(p.viewport.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(midpoint(p.group) - midpoint(p.viewport))).toBeLessThanOrEqual(1);
    expect(document.activeElement).toBe(p.row);
    const centered = p.viewport.scrollTop;
    await staysAt(p.viewport, centered);

    p.select(choice("Middle", 1));
    expect(p.row.firstElementChild?.textContent).toBe("Model 1");
    const above = () => p.row.getBoundingClientRect().top - p.viewport.getBoundingClientRect().top;
    expect(above()).toBeLessThan(2 * p.row.offsetHeight);
    await staysAt(p.viewport, centered);

    p.toggle();
    p.toggle();
    expect(above()).toBeCloseTo(2 * p.row.offsetHeight, 0);
    await staysAt(p.viewport, p.viewport.scrollTop);

    p.toggle();
    p.select(choice("Middle", 11));
    p.toggle();
    expect(
        p.viewport.getBoundingClientRect().bottom - p.row.getBoundingClientRect().bottom,
    ).toBeCloseTo(2 * p.row.offsetHeight, 0);
});

it("clamps at both catalog ends and shares the available margin in a short pane", async () => {
    const p = await picker(choice("First", 0), 220);
    p.toggle();
    expect(p.viewport.scrollTop).toBe(0);
    p.toggle();
    p.select(choice("Last", 11));
    p.toggle();
    expect(p.viewport.scrollTop).toBe(p.viewport.scrollHeight - p.viewport.clientHeight);
    p.toggle();
    p.select(choice("Middle", 10));
    p.toggle();
    expect(p.viewport.clientHeight).toBeLessThan(5 * p.row.offsetHeight);
    expect(Math.abs(midpoint(p.row) - midpoint(p.viewport))).toBeLessThanOrEqual(1);
});
