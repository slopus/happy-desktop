import "./styles.css";
import { expect, it } from "vitest";
import { Menu } from "./Menu";
import { Sidebar } from "./Sidebar";
import { SearchField } from "./TitleBar";
import { Tooltip } from "./Tooltip";
import { commandShortcut } from "./keyboardShortcut";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * Every shortcut the app shows is the one KeyCap, and in every place it stands
 * the same: the command modifier's capital spans the key's cap band, and the
 * cap's capitals sit on the centre line of the text they explain.
 */

const K = commandShortcut("k");

it("draws one key cap, on the centre line of its owner's text, in every context", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div
                style={{
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    padding: 12,
                    width: 300,
                }}
            >
                <Sidebar
                    activeItemId=""
                    data-testid="ctx-sidebar"
                    onItemSelect={() => {}}
                    searchRow={{ label: "Search", onOpen: () => {}, shortcut: K }}
                    style={{ width: 280, height: 120 }}
                    sections={[]}
                />
                <Menu
                    data-testid="ctx-menu"
                    items={[
                        { kind: "item", id: "link", label: "Link", icon: "link", shortcut: K.caps },
                    ]}
                    width={220}
                />
                <div data-testid="ctx-search" style={{ width: 240 }}>
                    <SearchField onChange={() => {}} placeholder="Search" value="" />
                </div>
                <div style={{ paddingTop: 34 }}>
                    <Tooltip data-testid="ctx-tooltip" label="Link" open shortcut={K}>
                        <button type="button">L</button>
                    </Tooltip>
                </div>
            </div>
        ),
        { width: 330, height: 400 },
    );
    await view.ready();
    const ink = async (element: RenderedElement<Element>) => {
        const visible = await element.visibleMetrics();
        expect(visible.pixelCount).toBeGreaterThan(0);
        const box = element.bounds();
        return {
            top: box.y + visible.bounds.y,
            bottom: box.y + visible.bounds.y + visible.bounds.height,
            centre: box.y + visible.center.y,
        };
    };
    const contexts = [
        ["sidebar", '[data-testid="ctx-sidebar"] [data-happy-desktop-ui="sidebar-item-label"]'],
        ["menu", '[data-testid="ctx-menu"] .happy-menu__item-label'],
        // The field's own box: each engine sets an input's text a pixel apart.
        ["search", '[data-testid="ctx-search"] [data-happy-desktop-ui="search-field"]'],
        ["tooltip", '[data-testid="ctx-tooltip"] [data-happy-desktop-ui="tooltip-bubble"]'],
    ] as const;
    for (const [name, ownerSelector] of contexts) {
        const root = `[data-testid="ctx-${name}"]`;
        const cap = view.$(`${root} [data-happy-desktop-ui="key-cap"]`);
        expect(cap.element.tagName, name).toBe("KBD");
        expect(cap.height(), name).toBe(18);
        expect(cap.element.textContent, name).toBe(K.caps);
        // macOS renders ⌘K; Windows/Linux render Ctrl+K. Measure the command
        // glyph or Ctrl's capital C against K, not an absent macOS glyph.
        const modifier = K.modifier === "Meta" ? "⌘" : "C";
        const symbol = await ink(
            view.$(
                `${root} [data-happy-desktop-ui="key-cap-key"]:first-child [data-happy-desktop-ui="${K.modifier === "Meta" ? "key-cap-symbol" : "key-cap-text"}"]`,
            ),
        );
        const letter = await ink(
            view.$(
                `${root} [data-happy-desktop-ui="key-cap-key"]:last-child [data-happy-desktop-ui="key-cap-text"]`,
            ),
        );
        expect(
            Math.abs(symbol.top - letter.top),
            `${name}: ${modifier} on the cap line`,
        ).toBeLessThanOrEqual(0.5);
        expect(
            symbol.bottom - letter.bottom,
            `${name}: ${modifier} on the baseline`,
        ).toBeGreaterThanOrEqual(0);
        expect(symbol.bottom - letter.bottom, `${name}: ${modifier} overshoot`).toBeLessThanOrEqual(
            0.5,
        );
        // The owner's text, minus the cap inside it for the tooltip bubble.
        const owner = view.$(ownerSelector);
        if (name === "tooltip") continue;
        const text =
            name === "search"
                ? { centre: owner.bounds().y + owner.bounds().height / 2 }
                : await ink(owner);
        expect(
            Math.abs(letter.centre - text.centre),
            `${name}: cap capitals on the owner's centre line (${String(letter.centre - text.centre)})`,
        ).toBeLessThanOrEqual(0.75);
    }
    await view.screenshot("KeyCap.contexts");
});
