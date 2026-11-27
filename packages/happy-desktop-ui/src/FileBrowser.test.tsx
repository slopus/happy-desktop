import { expect, it } from "vitest";
import "./theme.css";
import "./styles/scrollbar.css";
import "./styles/visually-hidden.css";
import "./styles/icon.css";
import "./styles/segmented-control.css";
import "./styles/title-bar.css";
import "./styles/file-tree.css";
import "./styles/file-browser.css";
import { FileBrowser } from "./FileBrowser";
import { createRenderer } from "./testing";

/*
 * An empty listing can offer the one thing worth doing next. In a folder Git
 * does not track, Changes knows only what a chat edited through its tools, so
 * it says so and offers every file instead of leaving the reader at "nothing".
 */

it("offers the next listing from an empty one, under its status line", async () => {
    const shown: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ background: "var(--surface)", display: "flex", height: "100%" }}>
                <FileBrowser
                    count={0}
                    emptyAction={{ label: "Show all files", onClick: () => shown.push("all") }}
                    emptyLabel="No changed files."
                    layout="flat"
                    nodes={[]}
                    note="This folder isn't tracked by Git, so Changes lists only files this chat edited."
                    scope="changed"
                />
            </div>
        ),
        { width: 260, height: 240, padding: 16 },
    );
    await view.ready();

    const note = view.$('[data-happy-desktop-ui="file-browser-note"]');
    expect(note.element.textContent).toBe(
        "This folder isn't tracked by Git, so Changes lists only files this chat edited.",
    );

    const empty = view.$('[data-happy-desktop-ui="file-tree-empty"]');
    const action = view.$('[data-happy-desktop-ui="file-tree-empty-action"]');
    expect(empty.element.textContent).toBe("No changed files.");
    expect(action.element.tagName).toBe("BUTTON");
    expect(action.element.textContent).toBe("Show all files");

    /* It reads as the line after the status, on the same 28px grid and the same
       inset, in the link colour the tree's own "Show more…" uses. */
    expect(action.bounds().height).toBe(28);
    expect(action.bounds().y).toBeGreaterThanOrEqual(empty.bounds().y + empty.bounds().height);
    expect(action.computedStyle("padding-left")).toBe(empty.computedStyle("padding-left"));
    expect(action.bounds().x).toBe(empty.bounds().x);
    expect(action.computedStyle("color")).toBe("rgb(43, 172, 204)");
    expect(action.computedStyle("font-size")).toBe("12px");
    expect((await action.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    (action.element as HTMLButtonElement).click();
    expect(shown).toEqual(["all"]);
}, 120_000);
