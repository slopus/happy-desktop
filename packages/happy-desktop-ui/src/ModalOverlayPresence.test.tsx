import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, onTestFinished } from "vitest";
import { commands, userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/scrollbar.css";
import "./styles/modal-overlay.css";
import "./styles/command-palette.css";
import "./styles/command-palette-results.css";
import "./styles/badge.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import { CommandPalette } from "./CommandPalette";
import { CommandPaletteResults } from "./CommandPaletteResults";
import { ModalOverlay, ModalOverlayPresence } from "./ModalOverlay";
import { createRenderer } from "./testing";

declare module "vitest/browser" {
    interface BrowserCommands {
        reducedMotionEmulate: (reduce: boolean) => Promise<void>;
    }
}

/*
 * The ⌘K palette arrives and leaves rather than cutting in and out: a soft dim
 * fades in while the card fades in and settles from just under its size, and
 * leaving runs faster the other way. It is mounted through its exit and gone
 * after it; its input has focus from the first frame; a leaving palette opened
 * again turns round as the same card; and a reader who asked for reduced
 * motion gets only a fade within a frame.
 */

const SECTIONS = [
    {
        id: "recent",
        caption: "Recent",
        rows: [
            { kind: "command" as const, id: "plan", icon: "doc" as const, title: "Launch plan" },
        ],
    },
];

let openSet: (open: boolean) => void = () => {};

function Fixture() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    openSet = (next) => {
        if (next) setQuery("");
        setOpen(next);
    };
    return (
        <div style={{ height: "600px", position: "relative", width: "900px" }}>
            <button data-testid="opener" type="button">
                Search
            </button>
            <ModalOverlayPresence open={open}>
                <ModalOverlay
                    backdrop="soft"
                    data-testid="overlay"
                    onDismiss={() => setOpen(false)}
                    placement="top"
                    style={{ position: "absolute" }}
                >
                    <CommandPalette
                        data-testid="card"
                        onClose={() => setOpen(false)}
                        onQueryChange={setQuery}
                        query={query}
                    >
                        <CommandPaletteResults activeIndex={0} sections={SECTIONS} />
                    </CommandPalette>
                </ModalOverlay>
            </ModalOverlayPresence>
        </div>
    );
}

const overlay = () => document.querySelector<HTMLElement>('[data-testid="overlay"]');
const card = () => document.querySelector<HTMLElement>('[data-testid="card"]');
const input = () =>
    document.querySelector<HTMLInputElement>('[data-happy-desktop-ui="command-palette-input"]');
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The transitions running on an element, by property, with their durations in ms. */
function transitions(element: Element) {
    return Object.fromEntries(
        element
            .getAnimations()
            .filter((animation): animation is CSSTransition => animation instanceof CSSTransition)
            .map((animation) => [
                animation.transitionProperty,
                Number(animation.effect?.getTiming().duration),
            ]),
    );
}

/** Resolves once the overlay is gone, failing if that takes longer than `ms`. */
async function goneWithin(ms: number) {
    const started = performance.now();
    while (overlay() !== null) {
        if (performance.now() - started > ms)
            throw new Error(`overlay still mounted after ${ms}ms`);
        await frame();
    }
}

async function render() {
    const view = createRenderer();
    view.render(Fixture, { width: 900, height: 600 });
    await view.ready();
    const opener = document.querySelector<HTMLButtonElement>('[data-testid="opener"]')!;
    opener.focus();
    return { view, opener };
}

it("arrives with focus on its first frame, stays mounted while it leaves, then goes", async () => {
    const { opener } = await render();
    expect(overlay()).toBeNull();

    flushSync(() => openSet(true));
    // Before any frame is painted the input already has focus.
    expect(document.activeElement).toBe(input());
    expect(overlay()?.dataset.presence).toBe("open");
    // The dim fades in; the card fades in as it settles from just under its size.
    expect(transitions(overlay()!)).toEqual({ opacity: 120 });
    expect(transitions(card()!)).toEqual({ opacity: 150, transform: 150 });
    expect(getComputedStyle(card()!).transformOrigin).toBe(`${card()!.offsetWidth / 2}px 0px`);
    // Typing is never held up by the entrance.
    await userEvent.keyboard("pl");
    expect(input()!.value).toBe("pl");
    await wait(250);
    expect(getComputedStyle(card()!).opacity).toBe("1");
    expect(getComputedStyle(card()!).transform).toBe("none");

    const leaving = overlay()!;
    flushSync(() => openSet(false));
    // Still there, inert, and leaving faster than it came; focus is already back.
    expect(overlay()).toBe(leaving);
    expect(leaving.dataset.presence).toBe("closing");
    expect(leaving.inert).toBe(true);
    expect(document.activeElement).toBe(opener);
    expect(transitions(card()!)).toEqual({ opacity: 100, transform: 100 });
    // It shows the list the reader left, not another, while it goes.
    expect(input()!.value).toBe("pl");
    await frame();
    expect(overlay()).toBe(leaving);
    await goneWithin(500);
    expect(document.activeElement).toBe(opener);
});

it("turns round as the same card when opened again while it is leaving", async () => {
    await render();
    flushSync(() => openSet(true));
    await wait(250);
    const first = overlay()!;
    const firstCard = card()!;

    flushSync(() => openSet(false));
    // Caught part-way out: fading, and still there.
    let fading = 1;
    while (fading === 1 && overlay() === first) {
        await frame();
        fading = Number(getComputedStyle(firstCard).opacity);
    }
    expect(overlay()).toBe(first);
    expect(fading).toBeLessThan(1);
    flushSync(() => openSet(true));
    // No second mount and no restarted entrance: the same nodes reverse from
    // where they stood.
    expect(overlay()).toBe(first);
    expect(card()).toBe(firstCard);
    expect(first.dataset.presence).toBe("open");
    expect(first.inert).toBe(false);
    // The exit runs on for the moment between reading it and opening again; a
    // restarted entrance would drop the card to nothing instead.
    expect(Number(getComputedStyle(firstCard).opacity)).toBeGreaterThan(fading - 0.2);
    expect(document.activeElement).toBe(input());
    // The exit that was called off never takes it down.
    await wait(400);
    expect(overlay()).toBe(first);
    expect(getComputedStyle(firstCard).opacity).toBe("1");
    expect(getComputedStyle(firstCard).transform).toBe("none");
});

it("is never left standing by rapid opening and closing", async () => {
    await render();
    for (let round = 0; round < 9; round += 1) {
        flushSync(() => openSet(round % 2 === 0));
        await wait(round * 7);
    }
    // Nine flips end open.
    await wait(400);
    expect(overlay()?.dataset.presence).toBe("open");
    expect(document.activeElement).toBe(input());
    for (let round = 0; round < 9; round += 1) {
        flushSync(() => openSet(round % 2 === 1));
        await wait(round * 5);
    }
    // Nine more, starting with a close, end closed, and it goes.
    await goneWithin(500);
});

it("only fades, within a frame, for a reader who asked for reduced motion", async () => {
    await commands.reducedMotionEmulate(true);
    onTestFinished(() => commands.reducedMotionEmulate(false));
    await render();

    flushSync(() => openSet(true));
    expect(document.activeElement).toBe(input());
    // No travel at all, and the fade is over almost at once.
    expect(transitions(card()!)).toEqual({ opacity: 1 });
    expect(getComputedStyle(card()!).transform).toBe("none");
    await frame();
    await frame();
    expect(getComputedStyle(card()!).opacity).toBe("1");

    flushSync(() => openSet(false));
    expect(transitions(card()!)).toEqual({ opacity: 1 });
    expect(getComputedStyle(card()!).transform).toBe("none");
    await goneWithin(100);
});

it("stands still outside a presence, as the blueprint's fixtures need", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ height: "600px", position: "relative", width: "900px" }}>
                <ModalOverlay
                    data-testid="overlay"
                    placement="top"
                    style={{ position: "absolute" }}
                >
                    <CommandPalette
                        autoFocus={false}
                        data-testid="card"
                        onClose={() => {}}
                        onQueryChange={() => {}}
                        query=""
                    >
                        <CommandPaletteResults activeIndex={0} sections={SECTIONS} />
                    </CommandPalette>
                </ModalOverlay>
            </div>
        ),
        { width: 900, height: 600 },
    );
    await view.ready();
    expect(overlay()?.dataset.presence).toBeUndefined();
    expect(overlay()!.getAnimations({ subtree: true })).toEqual([]);
});
