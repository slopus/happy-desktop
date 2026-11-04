import { useReducer, useState } from "react";
import { expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/scrollbar.css";
import "./styles/command-palette.css";
import "./styles/command-palette-results.css";
import "./styles/form-row.css";
import "./styles/switch.css";
import "./styles/avatar.css";
import "./styles/search-results.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import { CommandPalette } from "./CommandPalette";
import { CommandPaletteResults, type CommandPaletteResultsSection } from "./CommandPaletteResults";
import { FormRow } from "./FormRow";
import { commandShortcut } from "./keyboardShortcut";
import { Switch } from "./Switch";
import { SearchResults, type SearchResultGroup } from "./SearchResults";
import { createRenderer, RenderedElement } from "./testing";

const fontFamily = () =>
    server.browser === "webkit" && server.platform !== "darwin"
        ? "happy Figtree, system-ui, sans-serif"
        : '"happy Figtree", system-ui, sans-serif';

const shortGroups: SearchResultGroup[] = [
    {
        type: "channel",
        results: [
            { id: "calm-design", title: "calm-design", meta: "Relay palette review" },
            { id: "launch-room", title: "launch-room", meta: "Release coordination" },
        ],
    },
];

const overflowGroups: SearchResultGroup[] = (["channel", "user", "message", "file"] as const).map(
    (type) => ({
        type,
        results: Array.from({ length: 5 }, (_, index) => ({
            id: `${type}-${index + 1}`,
            title: `${type} result ${index + 1} for calm`,
            meta: `Workspace match ${index + 1}`,
        })),
    }),
);

/** Every rendered element a selector matches, in document order. */
function all(view: ReturnType<typeof createRenderer>, selector: string) {
    return [...view.container.querySelectorAll<HTMLElement>(selector)].map(
        (element) =>
            new RenderedElement(
                element,
                element.closest<HTMLElement>("[data-gym-surface]") ?? view.container,
            ),
    );
}

function frame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

it("grows to its 640x461 cap for a long list: field, scrolling results, and a footer of keys", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                data-testid="cp"
                onClose={() => {}}
                onQueryChange={() => {}}
                onSelectionCommit={() => {}}
                onSelectionMove={() => {}}
                placeholder="Search Happy Place…"
                query="calm"
            >
                <SearchResults groups={overflowGroups} query="calm" variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();

    const card = view.$('[data-testid="cp"]');
    expect(card.element.getAttribute("role")).toBe("dialog");
    expect(card.element.getAttribute("aria-modal")).toBe("true");
    expect(card.element.getAttribute("aria-label")).toBe("Search Happy Place…");
    expect(card.bounds()).toEqual({ x: 0, y: 0, width: 640, height: 461 });
    expect(
        card.computedStyles([
            "background-color",
            "border-top-color",
            "border-top-left-radius",
            "border-top-width",
            "box-shadow",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "height",
            "max-height",
            "max-width",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        // Opaque on the content surface: the soft dim behind it does the
        // separating, so nothing under the card muddies its text.
        "background-color": "rgb(255, 255, 255)",
        "border-top-color": "rgba(0, 0, 0, 0.1)",
        "border-top-left-radius": "14px",
        "border-top-width": "1px",
        // A contact line and two wide, faint layers; no heavy drop.
        "box-shadow":
            "rgba(0, 0, 0, 0.06) 0px 1px 2px 0px, rgba(0, 0, 0, 0.08) 0px 8px 24px 0px, rgba(0, 0, 0, 0.12) 0px 24px 64px 0px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily(),
        // The card follows its rows; the scrollport's cap is what stops it.
        height: "461px",
        "max-height": "100%",
        "max-width": "100%",
        "overflow-y": "hidden",
        width: "640px",
    });

    const header = view.$('[data-testid="cp"] [data-happy-desktop-ui="command-palette-header"]');
    // The 56px field, then its hairline.
    expect(header.bounds()).toEqual({ x: 1, y: 1, width: 638, height: 57 });
    expect(
        header.computedStyles([
            "align-items",
            "border-bottom-color",
            "border-bottom-width",
            "column-gap",
            "display",
            "height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "align-items": "center",
        "border-bottom-color": "rgb(234, 234, 234)",
        "border-bottom-width": "1px",
        "column-gap": "12px",
        display: "flex",
        height: "57px",
        "padding-left": "20px",
        "padding-right": "20px",
    });

    const input = view.$('[data-testid="cp"] [data-happy-desktop-ui="command-palette-input"]');
    expect(input.element.tagName).toBe("INPUT");
    expect((input.element as HTMLInputElement).value).toBe("calm");
    expect(input.element.getAttribute("placeholder")).toBe("Search Happy Place…");
    expect(input.element.getAttribute("aria-label")).toBe("Search Happy Place…");
    expect(
        input.computedStyles([
            "background-color",
            "border-top-width",
            "color",
            "font-size",
            "font-weight",
            "outline-style",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "0px",
        color: "rgb(0, 0, 0)",
        "font-size": "16px",
        "font-weight": "400",
        "outline-style": "none",
    });
    expect((await input.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    // The search glyph sits in a 20px lane, the field's words 12px after it.
    const lane = view.$('[data-testid="cp"] [data-happy-desktop-ui="command-palette-icon"]');
    expect(lane.bounds()).toEqual({ x: 21, y: 19, width: 20, height: 20 });
    expect(
        view
            .$(
                '[data-testid="cp"] [data-happy-desktop-ui="command-palette-icon"] [data-happy-desktop-ui="icon"]',
            )
            .bounds().width,
    ).toBe(18);
    expect(input.bounds().x).toBe(53);
    // Nothing in the field but the field: Escape and the footer close it.
    expect(header.element.querySelector("button")).toBeNull();

    const body = view.$('[data-testid="cp"] [data-happy-desktop-ui="command-palette-body"]');
    expect(body.bounds()).toEqual({ x: 1, y: 58, width: 638, height: 365 });
    expect(
        view
            .$(
                '[data-testid="cp"] [data-happy-desktop-ui="command-palette-body"] [data-scrollbar-viewport]',
            )
            .computedStyles(["max-height"]),
    ).toEqual({ "max-height": "365px" });
    /* The host frames the body; the viewport inside it is the scrollport. */
    const bodyViewport = view.$(
        '[data-testid="cp"] [data-happy-desktop-ui="command-palette-body"] [data-scrollbar-viewport]',
    );
    expect(
        bodyViewport.computedStyles([
            "margin-top",
            "overflow-x",
            "overflow-y",
            "padding-left",
            "padding-top",
            "scrollbar-gutter",
        ]),
    ).toEqual({
        "margin-top": "0px",
        "overflow-x": "hidden",
        "overflow-y": "auto",
        "padding-left": "0px",
        "padding-top": "0px",
        /* No reserved lane: the bar is laid over the content's inset, so the
           638px body above is the full width between the card's borders
           whether or not the list is long enough to scroll. */
        "scrollbar-gutter": "auto",
    });
    const bodyContent = view.$(
        '[data-testid="cp"] [data-happy-desktop-ui="command-palette-body-content"]',
    );
    expect(bodyContent.computedStyles(["padding-top", "padding-left"])).toEqual({
        "padding-top": "8px",
        "padding-left": "8px",
    });
    // The footer keeps the rows out of the card's corners, so the last row is
    // rounded like every other.
    const lastRow = view.$('[data-testid="cp"] [data-item-id="file-5"]');
    expect(
        lastRow.computedStyles([
            "border-bottom-left-radius",
            "border-bottom-right-radius",
            "border-top-left-radius",
        ]),
    ).toEqual({
        "border-bottom-left-radius": "6px",
        "border-bottom-right-radius": "6px",
        "border-top-left-radius": "6px",
    });

    const footer = view.$('[data-testid="cp"] [data-happy-desktop-ui="command-palette-footer"]');
    // Its hairline, then the 36px band of keys.
    expect(footer.bounds()).toEqual({ x: 1, y: 423, width: 638, height: 37 });
    expect(footer.element.getAttribute("aria-hidden")).toBe("true");
    expect(
        footer.computedStyles([
            "align-items",
            "border-top-color",
            "border-top-width",
            "color",
            "column-gap",
            "font-size",
            "padding-left",
        ]),
    ).toEqual({
        "align-items": "center",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        color: "rgb(73, 69, 79)",
        "column-gap": "16px",
        "font-size": "12px",
        "padding-left": "20px",
    });
    const hints = all(view, '[data-testid="cp"] [data-happy-desktop-ui="command-palette-hint"]');
    const label = (hint: RenderedElement) =>
        hint.element.querySelector(".happy-command-palette__hint-label")?.textContent;
    expect(hints.map(label)).toEqual(["Navigate", "Open", "Close"]);
    // Every key is an 18px cap, on the footer's centre line, with real ink.
    for (const key of all(view, '[data-testid="cp"] .happy-command-palette__key')) {
        expect([key.bounds().width, key.bounds().height]).toEqual([18, 18]);
        expect(key.bounds().y).toBe(433);
        expect((await key.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    }
    const escape = view.$('[data-testid="cp"] [data-happy-desktop-ui="key-cap"]');
    expect(escape.bounds().height).toBe(18);
    expect(escape.bounds().y).toBe(433);
    // The first hint starts on the 20px column the glyphs above it do.
    expect(hints[0]!.bounds().x).toBe(21);

    await view.screenshot("CommandPalette.test");
}, 120_000);

it("fits a short list and nothing found, with the field and the footer where they always are", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                data-testid="short"
                onClose={() => {}}
                onQueryChange={() => {}}
                query="calm"
            >
                <SearchResults groups={shortGroups} query="calm" variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                data-testid="none"
                onClose={() => {}}
                onQueryChange={() => {}}
                query="cobalt"
            >
                <CommandPaletteResults
                    activeIndex={0}
                    emptyDescription="Try a different search."
                    emptyLabel="No results"
                    sections={[]}
                />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();

    for (const id of ["short", "none"]) {
        const card = view.$(`[data-testid="${id}"]`).bounds();
        const header = view.$(
            `[data-testid="${id}"] [data-happy-desktop-ui="command-palette-header"]`,
        );
        const body = view.$(`[data-testid="${id}"] [data-happy-desktop-ui="command-palette-body"]`);
        const content = view.$(
            `[data-testid="${id}"] [data-happy-desktop-ui="command-palette-body-content"]`,
        );
        const footer = view.$(
            `[data-testid="${id}"] [data-happy-desktop-ui="command-palette-footer"]`,
        );
        // No blank band under the rows: the body is exactly its content, and
        // the card ends at the footer.
        expect(header.bounds()).toEqual({ x: 1, y: 1, width: 638, height: 57 });
        expect(body.bounds().height).toBe(content.bounds().height);
        expect(footer.bounds().y).toBe(body.bounds().y + body.bounds().height);
        expect(footer.bounds().height).toBe(37);
        expect(card.height).toBe(1 + 57 + body.bounds().height + 37 + 1);
        expect(card.height).toBeLessThan(461);
    }
    // Nothing found is one row's height between the body's 8px insets.
    const empty = view.$(
        '[data-testid="none"] [data-happy-desktop-ui="command-palette-results-empty"]',
    );
    expect(empty.element.getAttribute("role")).toBe("status");
    expect(
        [...empty.element.querySelectorAll(".happy-command-palette-results__body > span")].map(
            (span) => span.textContent,
        ),
    ).toEqual(["No results", "Try a different search."]);
    expect(empty.bounds().height).toBe(40);
    expect(view.$('[data-testid="none"]').bounds().height).toBe(1 + 57 + 56 + 37 + 1);
    expect(empty.computedStyles(["background-color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
    });

    await view.screenshot("CommandPalette.fit.test");
}, 120_000);

it("names only the keys its owner reads: Escape alone for a palette without a list", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <CommandPalette autoFocus={false} onClose={() => {}} onQueryChange={() => {}} query="">
                <SearchResults groups={shortGroups} variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();
    expect(
        all(view, '[data-happy-desktop-ui="command-palette-hint"]').map(
            (hint) => hint.element.querySelector(".happy-command-palette__hint-label")?.textContent,
        ),
    ).toEqual(["Close"]);
});

it("shrinks in a short host and keeps overflowing focused rows visible at both extremes", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div
                data-testid="short-host"
                style={{ display: "flex", height: "408px", width: "640px" }}
            >
                <CommandPalette
                    autoFocus={false}
                    data-testid="constrained"
                    onClose={() => {}}
                    onQueryChange={() => {}}
                    query="calm"
                >
                    <SearchResults groups={overflowGroups} query="calm" variant="flush" />
                </CommandPalette>
            </div>
        ),
        { width: 640, height: 408 },
    );
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                data-testid="overflow"
                onClose={() => {}}
                onQueryChange={() => {}}
                query="calm"
            >
                <SearchResults groups={overflowGroups} query="calm" variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    (
        view.$(
            '[data-testid="constrained"] [data-happy-desktop-ui="command-palette-body"] [data-scrollbar-viewport]',
        ).element as HTMLElement
    ).scrollTop = 4;
    await view.ready();

    const constrained = view.$('[data-testid="constrained"]');
    expect(constrained.bounds()).toEqual({ x: 0, y: 0, width: 640, height: 408 });
    // The field and the footer keep their heights; the body gives way.
    expect(
        view
            .$('[data-testid="constrained"] [data-happy-desktop-ui="command-palette-header"]')
            .bounds().height,
    ).toBe(57);
    expect(
        view
            .$('[data-testid="constrained"] [data-happy-desktop-ui="command-palette-footer"]')
            .bounds().height,
    ).toBe(37);
    expect(
        view
            .$('[data-testid="constrained"] [data-happy-desktop-ui="command-palette-body"]')
            .bounds().height,
    ).toBe(312);

    const body = view.$('[data-testid="overflow"] [data-happy-desktop-ui="command-palette-body"]');
    const bodyElement = view.$(
        '[data-testid="overflow"] [data-happy-desktop-ui="command-palette-body"] [data-scrollbar-viewport]',
    ).element as HTMLElement;
    expect(bodyElement.scrollHeight).toBeGreaterThan(bodyElement.clientHeight);
    expect(bodyElement.clientHeight).toBe(365);

    bodyElement.scrollTop = 0;
    await frame();
    const first = view.$('[data-testid="overflow"] [data-item-id="channel-1"]');
    (first.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(first.element);
    expect(first.element.matches(":focus-visible")).toBe(true);
    expect(first.computedStyles(["outline-offset", "outline-style", "outline-width"])).toEqual({
        "outline-offset": "-2px",
        "outline-style": "solid",
        "outline-width": "2px",
    });
    expect(first.bounds().y).toBeGreaterThanOrEqual(body.bounds().y);
    expect(first.bounds().y + first.bounds().height).toBeLessThanOrEqual(
        body.bounds().y + body.bounds().height,
    );

    const last = view.$('[data-testid="overflow"] [data-item-id="file-5"]');
    const lastTopBeforeScroll = last.bounds().y;
    bodyElement.scrollTop = bodyElement.scrollHeight;
    await userEvent.wheel(bodyElement, { delta: { y: bodyElement.scrollHeight } });
    for (let attempt = 0; attempt < 12 && last.bounds().y === lastTopBeforeScroll; attempt += 1)
        await frame();
    (last.element as HTMLButtonElement).focus({ preventScroll: true });
    expect(document.activeElement).toBe(last.element);
    expect(last.element.matches(":focus-visible")).toBe(true);
    expect(last.bounds().y).toBeLessThan(lastTopBeforeScroll);
    expect(last.bounds().y).toBeGreaterThanOrEqual(body.bounds().y);
    expect(last.bounds().y + last.bounds().height).toBeLessThanOrEqual(
        body.bounds().y + body.bounds().height,
    );
    expect(body.bounds().y + body.bounds().height - (last.bounds().y + last.bounds().height)).toBe(
        8,
    );
    expect(
        last.computedStyles(["border-bottom-left-radius", "border-bottom-right-radius"]),
    ).toEqual({
        "border-bottom-left-radius": "6px",
        "border-bottom-right-radius": "6px",
    });

    await view.screenshot("CommandPalette.overflow.test");
}, 120_000);

it("preserves the exact card, header, and input nodes across result-content swaps", async () => {
    const view = createRenderer();
    function SwappingFixture() {
        const [overflowing, toggle] = useReducer((value) => !value, false);
        return (
            <>
                <button data-testid="swap" onClick={toggle} type="button">
                    Swap results
                </button>
                <CommandPalette
                    autoFocus={false}
                    data-testid="identity"
                    onClose={() => {}}
                    onQueryChange={() => {}}
                    query="calm"
                >
                    <SearchResults
                        groups={overflowing ? overflowGroups : shortGroups}
                        query="calm"
                        variant="flush"
                    />
                </CommandPalette>
            </>
        );
    }
    view.render(SwappingFixture, { width: 680, height: 540, padding: 20 });
    await view.ready();

    const card = view.$('[data-testid="identity"]').element;
    const header = view.$(
        '[data-testid="identity"] [data-happy-desktop-ui="command-palette-header"]',
    ).element;
    const input = view.$('[data-testid="identity"] [data-happy-desktop-ui="command-palette-input"]')
        .element as HTMLInputElement;
    input.focus();
    input.setSelectionRange(1, 4);
    const headerBefore = view
        .$('[data-testid="identity"] [data-happy-desktop-ui="command-palette-header"]')
        .bounds();
    const shortHeight = view.$('[data-testid="identity"]').bounds().height;
    (view.$('[data-testid="swap"]').element as HTMLButtonElement).click();
    await frame();
    // The longer list grows the card downward to its cap; the field stays put.
    expect(
        view
            .$('[data-testid="identity"] [data-happy-desktop-ui="command-palette-header"]')
            .bounds(),
    ).toEqual(headerBefore);
    expect(shortHeight).toBeLessThan(461);
    expect(view.$('[data-testid="identity"]').bounds().height).toBe(461);

    expect(view.$('[data-testid="identity"]').element).toBe(card);
    expect(
        view.$('[data-testid="identity"] [data-happy-desktop-ui="command-palette-header"]').element,
    ).toBe(header);
    expect(
        view.$('[data-testid="identity"] [data-happy-desktop-ui="command-palette-input"]').element,
    ).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(4);
    expect(view.container.querySelector('[data-item-id="file-5"]')).toBeTruthy();
});

it("focuses its input on open, caret after the query, and returns focus to the opener on close", async () => {
    const view = createRenderer();
    function PaletteFixture() {
        const [open, setOpen] = useState(false);
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button data-testid="trigger" onClick={() => setOpen(true)} type="button">
                    Open palette
                </button>
                {open ? (
                    <CommandPalette
                        onClose={() => setOpen(false)}
                        onQueryChange={() => {}}
                        query="seed"
                    >
                        <SearchResults groups={shortGroups} query="seed" variant="flush" />
                    </CommandPalette>
                ) : null}
            </div>
        );
    }
    view.render(PaletteFixture, { width: 720, height: 520, padding: 24 });
    await view.ready();
    const trigger = view.$('[data-testid="trigger"]').element as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    await frame();
    const input = view.$('[data-happy-desktop-ui="command-palette-input"]')
        .element as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    // The query reads as typed: nothing selected, the caret after it.
    expect(input.selectionStart).toBe("seed".length);
    expect(input.selectionEnd).toBe("seed".length);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await frame();
    expect(
        view.container.querySelector('[data-happy-desktop-ui="command-palette-input"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
});

it("keeps composition input safe and closes only on a committed Escape", async () => {
    const view = createRenderer();
    const changes: string[] = [];
    const closed: number[] = [];
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                onClose={() => closed.push(1)}
                onQueryChange={(value) => changes.push(value)}
                query=""
            >
                <SearchResults groups={shortGroups} variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();
    const input = view.$('[data-happy-desktop-ui="command-palette-input"]')
        .element as HTMLInputElement;
    input.value = "rel";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(changes).toEqual(["rel"]);
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.value = "に";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    input.value = "にほん";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(changes).toEqual(["rel"]);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual([]);
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(changes).toEqual(["rel"]);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: false }));
    expect(changes).toEqual(["rel", "にほん"]);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual([1]);
});

it("closes on ⌘K again from anywhere in the card", async () => {
    const view = createRenderer();
    const closed: number[] = [];
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                onClose={() => closed.push(1)}
                onQueryChange={() => {}}
                query="x"
            >
                <SearchResults groups={shortGroups} query="x" variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();
    const chord = commandShortcut("k").modifier === "Meta" ? { metaKey: true } : { ctrlKey: true };
    view.$('[data-happy-desktop-ui="command-palette-input"]').element.dispatchEvent(
        new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            code: "KeyK",
            key: "k",
            ...chord,
        }),
    );
    expect(closed).toEqual([1]);
});

const mixedSections: CommandPaletteResultsSection[] = [
    {
        id: "recent",
        caption: "Recent",
        rows: [
            { kind: "command", id: "task", icon: "tasks", meta: "Task", title: "Fix Cmd K search" },
        ],
    },
    {
        id: "actions",
        caption: "Actions",
        rows: [
            {
                kind: "command",
                id: "sidebar",
                icon: "sidebar-collapse",
                shortcut: commandShortcut("b"),
                title: "Hide sidebar",
            },
        ],
    },
    {
        id: "settings",
        caption: "Settings",
        rows: [
            {
                kind: "control",
                id: "shimmer",
                icon: "zap",
                label: "Shimmer active titles",
                description: "Animates running session, project, and workspace names",
                control: (
                    <FormRow
                        control={
                            <Switch
                                aria-label="Shimmer active titles"
                                checked
                                onChange={() => {}}
                                size="small"
                            />
                        }
                        density="compact"
                        description="Animates running session, project, and workspace names"
                        label="Shimmer active titles"
                    />
                ),
            },
        ],
    },
];

it("draws command rows as one compact 40px line — title, then its muted secondary text — beside taller settings rows", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <CommandPalette autoFocus={false} onClose={() => {}} onQueryChange={() => {}} query="">
                <CommandPaletteResults
                    activeIndex={0}
                    sections={[
                        ...mixedSections,
                        {
                            id: "long",
                            caption: "Long",
                            rows: [
                                {
                                    kind: "command",
                                    id: "long",
                                    icon: "chat",
                                    meta: "~/Developer/a-very-long-folder-name/that-keeps-going/and-going",
                                    shortcut: commandShortcut("9"),
                                    title: "A very long chat title that cannot possibly fit on one line of the palette, however wide the card is drawn, because it keeps going",
                                },
                            ],
                        },
                    ]}
                />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();

    const row = (id: string) =>
        view.$(`[data-happy-desktop-ui="command-palette-results-row"][data-row-id="${id}"]`);
    const part = (id: string, name: string) =>
        view.$(`[data-row-id="${id}"] [data-happy-desktop-ui="command-palette-results-${name}"]`);
    // Command rows are one line; the settings row keeps its label over its
    // description, at least the compact 56px, and wraps rather than clips.
    expect([row("task"), row("sidebar"), row("long")].map((r) => r.bounds().height)).toEqual([
        40, 40, 40,
    ]);
    expect(row("task").computedStyles(["column-gap", "padding-left", "padding-right"])).toEqual({
        "column-gap": "12px",
        "padding-left": "12px",
        "padding-right": "12px",
    });
    expect(row("shimmer").bounds().height).toBeGreaterThanOrEqual(56);

    // The secondary text follows the title on its line, muted, 8px after it.
    const title = part("task", "title");
    const meta = part("task", "meta");
    expect(Math.abs(meta.bounds().y - title.bounds().y)).toBeLessThan(1);
    expect(meta.bounds().x - (title.bounds().x + title.bounds().width)).toBe(8);
    expect(meta.element.textContent).toBe("Task");
    expect(title.computedStyles(["font-size", "font-weight"])).toEqual({
        "font-size": "14px",
        "font-weight": "500",
    });
    expect(meta.computedStyles(["font-size", "font-weight"])).toEqual({
        "font-size": "13px",
        "font-weight": "400",
    });
    // A caption is a sentence-case label in the UI face, not a mono shout.
    const caption = view.$('[data-happy-desktop-ui="command-palette-results-caption"]');
    expect(caption.bounds().height).toBe(28);
    expect(
        caption.computedStyles(["font-family", "font-size", "font-weight", "text-transform"]),
    ).toEqual({
        "font-family": fontFamily(),
        "font-size": "12px",
        "font-weight": "500",
        "text-transform": "none",
    });
    // The highlighted row is filled and lifts its glyph to the text colour.
    expect(row("task").element.hasAttribute("data-active")).toBe(true);
    expect(row("task").computedStyle("background-color")).toBe("rgb(234, 234, 234)");
    expect(part("task", "leading").computedStyle("color")).toBe("rgb(0, 0, 0)");
    expect(part("sidebar", "leading").computedStyle("color")).toBe("rgb(73, 69, 79)");
    expect(meta.computedStyles(["color"])).toEqual(
        view
            .$('[data-row-id="shimmer"] [data-happy-desktop-ui="form-row-description"]')
            .computedStyles(["color"]),
    );

    // A long row truncates on its one line and keeps its cap inside the row.
    const longRow = row("long").bounds();
    const longTitle = part("long", "title");
    const cap = view.$('[data-row-id="long"] [data-happy-desktop-ui="key-cap"]').bounds();
    expect((longTitle.element as HTMLElement).scrollWidth).toBeGreaterThan(
        (longTitle.element as HTMLElement).clientWidth,
    );
    expect(longTitle.computedStyles(["text-overflow", "white-space"])).toEqual({
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    expect(longTitle.bounds().x + longTitle.bounds().width).toBeLessThanOrEqual(cap.x);
    expect(cap.x + cap.width).toBeLessThanOrEqual(longRow.x + longRow.width);

    // The command row's words and the settings row's label start on one column.
    const label = view.$('[data-row-id="shimmer"] [data-happy-desktop-ui="form-row-label"]');
    expect(title.bounds().x).toBe(label.bounds().x);
    expect(
        view
            .$('[data-row-id="shimmer"] [data-happy-desktop-ui="form-row"]')
            .computedStyles(["border-bottom-width"]),
    ).toEqual({ "border-bottom-width": "0px" });
    // The action wears the chord that does the same outside the palette.
    expect(row("sidebar").element.getAttribute("aria-keyshortcuts")).toBe(
        commandShortcut("b").aria,
    );
});

it("wears the sidebar's marks: a 20px rounded tile, the tasks glyph in a task's", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <CommandPalette autoFocus={false} onClose={() => {}} onQueryChange={() => {}} query="">
                <CommandPaletteResults
                    activeIndex={0}
                    sections={[
                        {
                            id: "recent",
                            caption: "Recent",
                            rows: [
                                {
                                    kind: "command",
                                    id: "chat",
                                    icon: "chat",
                                    meta: "search-infra",
                                    title: "Index rebuild",
                                },
                                {
                                    kind: "command",
                                    id: "bot",
                                    avatar: { initials: "H", tone: "violet", type: "agent" },
                                    meta: "Bot",
                                    title: "Happy",
                                },
                                {
                                    kind: "command",
                                    id: "release",
                                    avatar: { icon: "tasks", initials: "", type: "agent" },
                                    meta: "Task",
                                    title: "Release desktop",
                                },
                            ],
                        },
                    ]}
                />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();

    const titleX = (id: string) =>
        view
            .$(`[data-row-id="${id}"] [data-happy-desktop-ui="command-palette-results-title"]`)
            .bounds().x;
    for (const id of ["bot", "release"]) {
        const row = view.$(
            `[data-happy-desktop-ui="command-palette-results-row"][data-row-id="${id}"]`,
        );
        const avatar = view.$(`[data-row-id="${id}"] [data-happy-desktop-ui="avatar"]`);
        expect(row.bounds().height).toBe(40);
        // The sidebar's agent tile, at the sidebar's size.
        expect(avatar.element.getAttribute("data-type")).toBe("agent");
        expect([avatar.bounds().width, avatar.bounds().height]).toEqual([20, 20]);
        // A mark keeps the words on the same column as a plain glyph does.
        expect(titleX(id)).toBe(titleX("chat"));
    }
    expect(
        view.$('[data-row-id="release"] [data-happy-desktop-ui="avatar-glyph"]').element,
    ).toBeTruthy();
});

it("opens a numbered result from ⌘1…⌘9 and keeps the chord from the window", async () => {
    const committed: number[] = [];
    const reachedWindow: string[] = [];
    const onWindowKeyDown = (event: KeyboardEvent) => {
        if (!event.defaultPrevented) reachedWindow.push(event.key);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    try {
        const view = createRenderer();
        view.render(
            () => (
                <CommandPalette
                    onClose={() => {}}
                    onNumberCommit={(number) => committed.push(number)}
                    onQueryChange={() => {}}
                    query=""
                >
                    <CommandPaletteResults activeIndex={0} sections={mixedSections} />
                </CommandPalette>
            ),
            { width: 640, height: 461 },
        );
        await view.ready();
        const input = view.$('[data-happy-desktop-ui="command-palette-input"]')
            .element as HTMLInputElement;
        const press = (key: string, modifiers: KeyboardEventInit = {}) =>
            input.dispatchEvent(
                new KeyboardEvent("keydown", {
                    bubbles: true,
                    cancelable: true,
                    code: /^[0-9]$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`,
                    key,
                    ...modifiers,
                }),
            );
        const chord =
            commandShortcut("1").modifier === "Meta" ? { metaKey: true } : { ctrlKey: true };
        press("1", chord);
        press("9", chord);
        // A digit typed without the chord is a search, and the chord with the
        // other modifier is not the palette's.
        press("3");
        press("3", { ...chord, shiftKey: true });
        expect(committed).toEqual([1, 9]);
        expect(reachedWindow).toEqual(["3", "3"]);
    } finally {
        window.removeEventListener("keydown", onWindowKeyDown);
    }
});
