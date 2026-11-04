import { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/file-editor.css";
import "./styles/file-path-label.css";
import "./styles/code-editor.css";
import "./styles/scrollbar.css";
import { FileEditor } from "./FileEditor";
import { createRenderer } from "./testing";

/*
 * FileEditor owns the editor surface contract: a compact 32px diff-style path
 * row, a monospace code body on the code surface, no Save button or bottom
 * path, and Command-S persistence. The owning tab carries the file name and
 * unsaved marker. Buttons and icons are primitives tuned in their own tests,
 * so this file asserts layout, computed tokens, and intent callbacks.
 */

const fontUi = "happy Figtree, system-ui, sans-serif";
const fontMono = "happy Mono, ui-monospace, monospace";
const content = "const answer = 42;\nexport default answer;\n";

/* Visible word labels of the action buttons, in DOM order. Icon-only buttons
 * (Close) carry no label element and read as "" — their glyph is a font
 * codepoint, so reading raw textContent would compare a PUA character. */
function actionLabels(view: ReturnType<typeof createRenderer>, actionsSelector: string) {
    return Array.from(
        view.container.querySelectorAll(`${actionsSelector} [data-happy-desktop-ui="button"]`),
    ).map(
        (button) =>
            button.querySelector('[data-happy-desktop-ui="button-label"]')?.textContent ?? "",
    );
}

it("holds FileEditor path row, code body, and tab-owned dirty affordances", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ height: "360px", width: "560px" }}>
                <FileEditor
                    data-testid="clean"
                    onClose={() => {}}
                    onSave={() => {}}
                    path="src/model.ts"
                    status="1.0 KB"
                    value={content}
                />
            </div>
        ),
        { width: 600, height: 400, padding: 20 },
    );
    view.render(
        () => (
            <div data-scrollbar-visibility="always" style={{ height: "240px", width: "560px" }}>
                <FileEditor
                    data-testid="long"
                    path="src/long.ts"
                    value={Array.from(
                        { length: 80 },
                        (_, index) => `export const line${String(index)} = ${String(index)};`,
                    ).join("\n")}
                />
            </div>
        ),
        { width: 600, height: 280, padding: 20 },
    );
    view.render(
        () => (
            <div style={{ height: "360px", width: "560px" }}>
                <FileEditor
                    data-testid="dirty"
                    dirty
                    onClose={() => {}}
                    onRevert={() => {}}
                    onSave={() => {}}
                    path="src/model.ts"
                    status="Modified"
                    value={content}
                />
            </div>
        ),
        { width: 600, height: 400, padding: 20 },
    );
    await view.ready();

    /* ---- Root + header -------------------------------------------------- */

    const root = view.$('[data-testid="clean"]');
    expect(root.element.tagName).toBe("SECTION");
    expect(root.computedStyles(["display", "flex-direction", "background-color"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        "background-color": "rgb(255, 255, 255)",
    });

    const header = view.$('[data-testid="clean"] [data-happy-desktop-ui="file-editor-header"]');
    expect(header.bounds().height).toBe(32);

    const name = view.$('[data-testid="clean"] [data-happy-desktop-ui="file-path-label-name"]');
    const nameMetrics = name.textMetrics();
    expect(nameMetrics.text).toBe("model.ts");
    expect(nameMetrics.font.family).toBe(fontUi);
    expect(nameMetrics.font.size).toBe(12);
    expect(nameMetrics.font.weight).toBe("400");
    expect(name.computedStyle("color")).toBe("rgb(0, 0, 0)");

    const directory = view.$(
        '[data-testid="clean"] [data-happy-desktop-ui="file-path-label-directory"]',
    );
    expect(directory.element.textContent).toBe("src/");
    expect(directory.textMetrics().font.family).toBe(fontUi);
    expect(directory.computedStyle("color")).toBe("rgb(0, 0, 0)");

    /* ---- Code body: monospace ink on the code surface ------------------- */

    const area = view.$('[data-testid="clean"] [data-happy-desktop-ui="code-editor"]');
    expect(area.bounds().height).toBe(328);
    expect(area.element.textContent).toContain(content.split("\n")[0]);
    /* Writing happens on the surface itself, not on a tinted code panel. */
    expect(area.computedStyle("background-color")).toBe("rgb(255, 255, 255)");
    /* The code type belongs to the editor's own content, not to its container.
       Engines quote font family names with spaces (`"happy Mono"`); normalize. */
    const editable = view.$('[data-testid="clean"] .cm-content');
    expect(editable.computedStyle("font-family").replace(/"/g, "")).toBe(fontMono);
    expect(editable.computedStyles(["font-size", "line-height"])).toEqual({
        "font-size": "13px",
        "line-height": "20px",
    });

    const longScroller = view.$('[data-testid="long"] .cm-scroller');
    expect(longScroller.element.scrollHeight).toBeGreaterThan(longScroller.element.clientHeight);
    if (getComputedStyle(longScroller.element).scrollbarWidth === "auto")
        expect(
            (longScroller.element as HTMLElement).offsetWidth -
                (longScroller.element as HTMLElement).clientWidth,
        ).toBe(0);

    /* ---- Compact status + no retired bottom bar ------------------------- */

    expect(
        view.$('[data-testid="clean"] [data-happy-desktop-ui="file-editor-status"]').element
            .textContent,
    ).toBe("1.0 KB");
    expect(
        view.container.querySelector(
            '[data-testid="clean"] [data-happy-desktop-ui="file-editor-path"]',
        ),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="clean"] [data-happy-desktop-ui="file-editor-status-text"]',
        ),
    ).toBeNull();

    /* ---- Clean vs dirty: the tab owns the dot; Command-S owns Save ------- */

    expect(root.element.getAttribute("data-dirty")).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="clean"] [data-happy-desktop-ui="file-editor-marker"]',
        ),
    ).toBeNull();
    const cleanActions = '[data-testid="clean"] [data-happy-desktop-ui="file-editor-actions"]';
    expect(actionLabels(view, cleanActions)).toEqual([""]);

    const dirtyRoot = view.$('[data-testid="dirty"]');
    expect(dirtyRoot.element.getAttribute("data-dirty")).toBe("");
    expect(
        view.container.querySelector(
            '[data-testid="dirty"] [data-happy-desktop-ui="file-editor-marker"]',
        ),
    ).toBeNull();

    const dirtyActions = '[data-testid="dirty"] [data-happy-desktop-ui="file-editor-actions"]';
    expect(actionLabels(view, dirtyActions)).toEqual(["Revert", ""]);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileEditor.test");
}, 120_000);

it("routes edit, Command-S, revert, and close intents and respects read-only", async () => {
    const changes: string[] = [];
    let saves = 0;
    let reverts = 0;
    let closes = 0;
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ height: "300px", width: "520px" }}>
                <FileEditor
                    data-testid="live"
                    dirty
                    onClose={() => (closes += 1)}
                    onRevert={() => (reverts += 1)}
                    onSave={() => (saves += 1)}
                    onValueChange={(value) => changes.push(value)}
                    path="notes.md"
                    value="hello"
                />
                <FileEditor data-testid="ro" path="dist/out.js" readOnly value="frozen" />
            </div>
        ),
        { width: 560, height: 340, padding: 20 },
    );
    await view.ready();

    /* Editing goes through CodeMirror's own document, which is what the person
       typing is editing; the change reaches the caller as the new whole text. */
    const live = EditorView.findFromDOM(
        view.$('[data-testid="live"] [data-happy-desktop-ui="code-editor"]').element as HTMLElement,
    )!;
    live.dispatch({ changes: { from: live.state.doc.length, insert: " world" } });
    expect(changes).toEqual(["hello world"]);

    const button = (testid: string, label: string) =>
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>(
                `[data-testid="${testid}"] [data-happy-desktop-ui="file-editor-actions"] [data-happy-desktop-ui="button"]`,
            ),
        ).find((element) => element.textContent === label);
    button("live", "Revert")!.click();
    view.$(
        '[data-testid="live"] [data-happy-desktop-ui="file-editor-actions"] [aria-label="Close file"]',
    ).element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(saves).toBe(0);
    expect(reverts).toBe(1);
    expect(closes).toBe(1);

    /* Cmd/Ctrl+S is the only save control and keeps keyboard focus in place. */
    expect(button("live", "Save")).toBeUndefined();
    view.$('[data-testid="live"]').element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }),
    );
    expect(saves).toBe(1);

    /* Read-only: the editor refuses edits and no Save/Revert render. */
    const readOnly = view.$('[data-testid="ro"] [data-happy-desktop-ui="code-editor"]');
    expect(readOnly.element.getAttribute("data-read-only")).toBe("");
    expect(readOnly.element.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe(
        "false",
    );
    expect(readOnly.element.textContent).toContain("frozen");
    expect(
        Array.from(
            view.container.querySelectorAll(
                '[data-testid="ro"] [data-happy-desktop-ui="file-editor-actions"] [data-happy-desktop-ui="button"]',
            ),
        ).map((element) => element.textContent),
    ).toEqual([]);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileEditor.states");
}, 120_000);
