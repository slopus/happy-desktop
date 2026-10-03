import { expect, it } from "vitest";
import "./theme.css";
import "./styles/scrollbar.css";
import "./styles/visually-hidden.css";
import "./styles/icon.css";
import "./styles/file-tree.css";
import { FileTree, type FileTreeNode } from "./FileTree";
import { createRenderer } from "./testing";

/*
 * FileTree owns row LAYOUT (a 28px row grid, a fixed 16px disclosure slot, and
 * 16px-per-level indentation expressed as row left padding), the git-status
 * decoration tokens, the family colour of the row's icon, and the
 * selection/hover surfaces. Every painted glyph is an Icon primitive already
 * optically tuned in Icon.test, so this file asserts geometry, computed tokens,
 * and typography — not glyph centroids.
 *
 * Git state colours the small parts that exist to carry it — the status letter
 * — and not the file's name: a column where every changed name is tinted has no
 * ordinary text left to read the tinting against. Deletion is the one exception,
 * because that row names something that is no longer there.
 */

const fontFamily = "happy Figtree, system-ui, sans-serif";
const monoFamily = "happy Mono, ui-monospace, monospace";

const nodes: FileTreeNode[] = [
    {
        id: "src/",
        name: "src",
        kind: "directory",
        expanded: true,
        hasMore: true,
        children: [
            { id: "src/index.ts", name: "index.ts", kind: "file", gitStatus: "modified" },
            { id: "src/theme.css", name: "theme.css", kind: "file" },
            { id: "src/logo.png", name: "logo.png", kind: "file" },
            { id: "src/new.ts", name: "new.ts", kind: "file", gitStatus: "added" },
            { id: "src/old.ts", name: "old.ts", kind: "file", gitStatus: "deleted" },
        ],
    },
    { id: "docs/", name: "docs", kind: "directory", gitStatus: "ignored" },
    { id: "notes.md", name: "notes.md", kind: "file", gitStatus: "renamed" },
    { id: ".env", name: ".env", kind: "file", gitStatus: "untracked" },
    { id: "README.md", name: "README.md", kind: "file" },
];

const statusColor: Record<string, string> = {
    "src/index.ts": "rgb(194, 130, 10)", // modified
    "src/new.ts": "rgb(46, 160, 67)", // added · new
    "src/old.ts": "rgb(207, 34, 46)", // deleted
    "notes.md": "rgb(9, 105, 218)", // renamed
    ".env": "rgb(46, 160, 67)", // untracked · new
};

/* `added` and `untracked` are one thing to a reader — the file is new — so both
   say N rather than asking which kind of new it was. */
const statusLetter: Record<string, string> = {
    "src/index.ts": "M",
    "src/new.ts": "N",
    "src/old.ts": "D",
    "notes.md": "R",
    ".env": "N",
    "docs/": "I",
};

it("holds FileTree row grid, indentation, disclosure, git decorations, and selection", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ background: "var(--surface)", width: "100%" }}>
                <FileTree
                    data-testid="tree"
                    nodes={nodes}
                    onLoadMore={() => {}}
                    onSelect={() => {}}
                    onToggle={() => {}}
                    selectedId="README.md"
                />
            </div>
        ),
        { width: 300, height: 340, padding: 16 },
    );
    await view.ready();

    const sel = (rest: string) => `[data-testid="tree"] ${rest}`;
    const row = (path: string) => view.$(sel(`[data-path="${CSS.escape(path)}"]`));

    /* ---- Root contract -------------------------------------------------- */

    const root = view.$('[data-testid="tree"]');
    expect(root.element.tagName).toBe("DIV");
    /* The tree role sits on the scrollport that holds the rows. */
    expect(
        view.$('[data-testid="tree"] [data-scrollbar-viewport]').element.getAttribute("role"),
    ).toBe("tree");
    /* The root is a scroll host: a grid holding the viewport and its track
       (see styles/scrollbar.css). The viewport is the column the rows stack in. */
    expect(root.computedStyles(["box-sizing", "display", "background-color"])).toEqual({
        "box-sizing": "border-box",
        display: "grid",
        "background-color": "rgba(0, 0, 0, 0)",
    });
    expect(
        view
            .$('[data-testid="tree"] [data-scrollbar-viewport]')
            .computedStyles(["display", "flex-direction"]),
    ).toEqual({ display: "flex", "flex-direction": "column" });

    /* ---- Row grid: rendered in tree order, every row 28px tall ---------- */

    const order = [
        "src/",
        "src/index.ts",
        "src/theme.css",
        "src/logo.png",
        "src/new.ts",
        "src/old.ts",
        "docs/",
        "notes.md",
        ".env",
        "README.md",
    ];
    for (const path of order) {
        const r = row(path);
        expect(r.bounds().height, path).toBe(28);
        expect(r.computedStyles(["display", "align-items"]), path).toEqual({
            display: "flex",
            "align-items": "center",
        });
    }

    /* Depth → left padding: 8px base + 16px per level. Root at 8, src/* at 24. */
    expect(row("src/").computedStyle("padding-left")).toBe("8px");
    expect(row("README.md").computedStyle("padding-left")).toBe("8px");
    expect(row("src/index.ts").computedStyle("padding-left")).toBe("24px");
    expect(row("src/old.ts").computedStyle("padding-left")).toBe("24px");

    /* ---- Disclosure: directories carry a chevron; files never do -------- */

    /* The row is the treeitem and the only tab stop on the line, so the state
       and the label belong to it; the chevron is a pointer target the reader
       using a keyboard reaches through the arrow keys instead. */
    const srcChevron = view.$(
        sel('[data-path="src/"] [data-happy-desktop-ui="file-tree-chevron"]'),
    );
    expect(srcChevron.element.tagName).toBe("SPAN");
    expect(srcChevron.element.getAttribute("aria-hidden")).toBe("true");
    expect(row("src/").element.getAttribute("role")).toBe("treeitem");
    expect(row("src/").element.getAttribute("aria-expanded")).toBe("true");
    expect(row("src/").element.getAttribute("data-expanded")).toBe("");
    expect(srcChevron.bounds().width).toBe(16);

    expect(row("docs/").element.getAttribute("aria-expanded")).toBe("false");
    expect(row("docs/").element.getAttribute("data-expanded")).toBeNull();

    expect(
        view.container.querySelector(
            sel('[data-path="README.md"] [data-happy-desktop-ui="file-tree-chevron"]'),
        ),
        "files have no chevron",
    ).toBeNull();

    /* Disc slot is a fixed 16px column so file names align under folder names. */
    expect(
        view.$(sel('[data-path="README.md"] [data-happy-desktop-ui="file-tree-disc"]')).bounds()
            .width,
    ).toBe(16);

    /* ---- Kind icon: directories use the folder glyph, files resolve by type - */

    const iconGlyph = (path: string) =>
        view
            .$(
                sel(
                    `[data-path="${CSS.escape(path)}"] [data-happy-desktop-ui="file-tree-icon"] [data-glyph]`,
                ),
            )
            .element.getAttribute("data-glyph");

    /* A folder says which way it is standing, so the row still reads as open
       where the chevron is out of the reader's eye. */
    expect(iconGlyph("src/"), "open directory").toBe("folder-open-outline");
    expect(iconGlyph("docs/"), "shut directory").toBe("folder-outline");
    /* Every family owns a glyph nothing else uses: colour alone cannot carry
       the difference between a stylesheet and a source file. */
    expect(iconGlyph("src/index.ts"), ".ts is code").toBe("code-slash-outline");
    expect(iconGlyph("src/theme.css"), ".css is a palette").toBe("color-palette-outline");
    /* Configuration is its own family: `.env` is not read the way a stylesheet
       or a JSON document is, and its glyph and colour say so. */
    expect(iconGlyph(".env"), ".env is settings").toBe("cog-outline");
    expect(iconGlyph("src/logo.png"), ".png is image").toBe("image-outline");
    expect(iconGlyph("notes.md"), ".md is prose").toBe("document-text-outline");
    expect(iconGlyph("README.md"), "README.md is prose").toBe("document-text-outline");

    /* ---- Directory typography ------------------------------------------ */

    const srcName = view.$(sel('[data-path="src/"] [data-happy-desktop-ui="file-tree-name"]'));
    const srcMetrics = srcName.textMetrics();
    expect(srcMetrics.text).toBe("src");
    expect(srcMetrics.font.family).toBe(fontFamily);
    expect(srcMetrics.font.size).toBe(13);
    expect(srcMetrics.font.weight).toBe("600");
    expect(srcMetrics.font.lineHeight).toBe(18);
    /* A directory is a container rather than a destination: same weight as a
       file's name, without the file's full-contrast ink. */
    expect(srcName.computedStyle("color")).toBe("rgb(73, 69, 79)");

    /* ---- File typography (unselected, no status) ----------------------- */

    const plainName = view.$(
        sel('[data-path="src/theme.css"] [data-happy-desktop-ui="file-tree-name"]'),
    );
    const plainMetrics = plainName.textMetrics();
    expect(plainMetrics.font.weight).toBe("600");
    expect(plainMetrics.font.size).toBe(13);
    /* Every file name is primary ink: the row is a list of things to read, and
       secondary text in it belongs to the path, not the name. */
    expect(plainName.computedStyle("color")).toBe("rgb(0, 0, 0)");

    /* ---- Family colour: the icon says what sort of file this is --------- */

    const styleIcon = view.$(
        sel('[data-path="src/theme.css"] [data-happy-desktop-ui="file-tree-icon"]'),
    );
    expect(row("src/theme.css").element.getAttribute("data-family")).toBe("style");
    expect(styleIcon.computedStyle("color")).toBe("rgb(124, 58, 237)");
    const imageIcon = view.$(
        sel('[data-path="src/logo.png"] [data-happy-desktop-ui="file-tree-icon"]'),
    );
    expect(row("src/logo.png").element.getAttribute("data-family")).toBe("image");
    expect(imageIcon.computedStyle("color")).toBe("rgb(13, 148, 136)");
    const codeIcon = view.$(
        sel('[data-path="src/index.ts"] [data-happy-desktop-ui="file-tree-icon"]'),
    );
    expect(row("src/index.ts").element.getAttribute("data-family")).toBe("code");
    expect(codeIcon.computedStyle("color")).toBe("rgb(37, 99, 235)");

    /* ---- Selection: README.md carries the accent-soft surface + solid ink */

    expect(row("README.md").element.getAttribute("data-selected")).toBe("");
    expect(row("README.md").computedStyle("background-color")).toBe("rgb(234, 234, 234)");
    expect(
        view
            .$(sel('[data-path="README.md"] [data-happy-desktop-ui="file-tree-name"]'))
            .computedStyle("color"),
    ).toBe("rgb(0, 0, 0)");
    /* Unselected rows keep the transparent surface. */
    expect(row("src/theme.css").computedStyle("background-color")).toBe("rgba(0, 0, 0, 0)");

    /* ---- Git decorations: the letter carries the state's color ---------- */

    for (const [path, color] of Object.entries(statusColor)) {
        const status = view.$(
            sel(`[data-path="${CSS.escape(path)}"] [data-happy-desktop-ui="file-tree-status"]`),
        );
        expect(status.computedStyle("color"), `${path} letter`).toBe(color);
        expect(status.element.textContent, `${path} letter`).toBe(statusLetter[path]);
    }

    /* A changed file's name stays ordinary text, so the decoration beside it is
       the only thing the eye has to pick out. */
    for (const path of ["src/index.ts", "src/new.ts", "notes.md", ".env"]) {
        const name = view.$(
            sel(`[data-path="${CSS.escape(path)}"] [data-happy-desktop-ui="file-tree-name"]`),
        );
        expect(name.computedStyle("color"), `${path} name`).toBe("rgb(0, 0, 0)");
    }

    /* Deleted files are struck through and dimmed; ignored directories dim too. */
    const deletedName = view.$(
        sel('[data-path="src/old.ts"] [data-happy-desktop-ui="file-tree-name"]'),
    );
    expect(deletedName.computedStyle("text-decoration-line")).toBe("line-through");
    expect(deletedName.computedStyle("color")).toBe("rgb(73, 69, 79)");
    const docsName = view.$(sel('[data-path="docs/"] [data-happy-desktop-ui="file-tree-name"]'));
    expect(docsName.computedStyle("color")).toBe("rgb(73, 69, 79)");
    expect(row("docs/").element.getAttribute("data-status")).toBe("ignored");

    /* Status letter is tabular mono for a stable single-column decoration. */
    const modifiedStatus = view.$(
        sel('[data-path="src/index.ts"] [data-happy-desktop-ui="file-tree-status"]'),
    );
    expect(modifiedStatus.textMetrics().font.family).toBe(monoFamily);
    expect(modifiedStatus.textMetrics().font.size).toBe(11);
    expect(modifiedStatus.textMetrics().font.weight).toBe("700");

    /* ---- Paging affordance: a "Show more" row indented one level deeper -- */

    /* Paging is a row of the same tree on the same 28px grid, not a control
       floating beside it: the arrow keys reach it and the virtualizer counts
       it like every other row. */
    const more = view.$(sel('[data-happy-desktop-ui="file-tree-more"]'));
    expect(more.element.tagName).toBe("DIV");
    expect(more.element.getAttribute("role")).toBe("treeitem");
    expect(more.bounds().height).toBe(28);
    expect(more.element.textContent).toBe("Show more…");
    expect(more.computedStyle("padding-left")).toBe("24px");
    expect(more.computedStyle("color")).toBe("rgb(43, 172, 204)");
    expect((await more.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileTree.test");
}, 120_000);

it("prints a flat row's directory ahead of its name, dimmer and lighter, eliding only the path", async () => {
    const view = createRenderer();
    const deep = "packages/happy-desktop-ui/src/pages/files/components/detail";
    view.render(
        () => (
            <div style={{ background: "var(--surface)", display: "flex", flexDirection: "column" }}>
                <div style={{ width: "440px" }}>
                    <FileTree
                        data-testid="flat"
                        nodes={[
                            {
                                id: `${deep}/FilePreviewHeader.tsx`,
                                name: "FilePreviewHeader.tsx",
                                directory: deep,
                                kind: "file",
                                gitStatus: "modified",
                                addedLines: 42,
                                deletedLines: 7,
                            },
                            { id: "README.md", name: "README.md", kind: "file" },
                        ]}
                    />
                </div>
                <div style={{ width: "200px" }}>
                    <FileTree
                        data-testid="narrow"
                        nodes={[
                            {
                                id: `${deep}/FilePreviewHeader.tsx`,
                                name: "FilePreviewHeader.tsx",
                                directory: deep,
                                kind: "file",
                                gitStatus: "modified",
                                addedLines: 42,
                                deletedLines: 7,
                            },
                        ]}
                    />
                </div>
            </div>
        ),
        { width: 480, height: 160, padding: 16 },
    );
    await view.ready();

    const part = (name: string) =>
        view.$(`[data-testid="flat"] [data-happy-desktop-ui="file-tree-${name}"]`);

    /* The row still reads as the path it is: directory first, then the name. */
    const label = part("label");
    expect(label.element.textContent).toBe(`${deep}/FilePreviewHeader.tsx`);
    const path = part("path");
    const name = part("name");
    expect(path.bounds().x).toBeLessThan(name.bounds().x);

    /* Directory and name share a size and baseline so the pair reads as one
       line, and separate by weight and colour so the name is what stands out. */
    const pathMetrics = path.textMetrics();
    const nameMetrics = name.textMetrics();
    expect(pathMetrics.font.size).toBe(13);
    expect(nameMetrics.font.size).toBe(13);
    expect(pathMetrics.font.lineHeight).toBe(18);
    expect(nameMetrics.font.lineHeight).toBe(18);
    expect(pathMetrics.font.weight).toBe("400");
    expect(nameMetrics.font.weight).toBe("600");
    expect(path.computedStyle("color")).toBe("rgb(154, 150, 158)");
    expect(name.computedStyle("color")).toBe("rgb(0, 0, 0)");

    /* Too narrow for the whole path: the leading run elides, its last segment
       survives whole, and the file name never loses a character. */
    const head = view.$('[data-testid="flat"] .happy-file-tree__path-head');
    const tail = view.$('[data-testid="flat"] .happy-file-tree__path-tail');
    expect(head.element.scrollWidth).toBeGreaterThan(head.element.clientWidth);
    expect(tail.element.scrollWidth).toBe(tail.element.clientWidth);
    expect(tail.element.textContent).toBe("/detail/");
    expect(name.element.scrollWidth).toBe(name.element.clientWidth);

    /* Narrower still, past what any elision of the leading run can pay for: the
       last segment gives up width in its turn rather than printing on top of the
       name, which is what a path that refuses to shrink at all ends up doing. */
    const narrowPath = view.$('[data-testid="narrow"] [data-happy-desktop-ui="file-tree-path"]');
    const narrowName = view.$('[data-testid="narrow"] [data-happy-desktop-ui="file-tree-name"]');
    const narrowTail = view.$('[data-testid="narrow"] .happy-file-tree__path-tail');
    expect(narrowTail.element.scrollWidth).toBeGreaterThan(narrowTail.element.clientWidth);
    expect(narrowPath.bounds().x + narrowPath.bounds().width).toBeLessThanOrEqual(
        narrowName.bounds().x + 0.5,
    );

    /* Both sides of the per-file stat, in the diff's own colours. */
    expect(view.$('[data-testid="flat"] .happy-file-tree__stat-added').element.textContent).toBe(
        "+42",
    );
    expect(view.$('[data-testid="flat"] .happy-file-tree__stat-deleted').element.textContent).toBe(
        "−7",
    );
    expect(view.$('[data-testid="flat"] .happy-file-tree__stat-added').computedStyle("color")).toBe(
        "rgb(34, 197, 94)",
    );
    expect(
        view.$('[data-testid="flat"] .happy-file-tree__stat-deleted').computedStyle("color"),
    ).toBe("rgb(239, 68, 68)");

    /* A row with no directory prints only its name — no empty path box. */
    expect(
        document.querySelectorAll('[data-testid="flat"] [data-happy-desktop-ui="file-tree-path"]')
            .length,
    ).toBe(1);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileTree.path");
}, 120_000);

it("routes selection, disclosure, and paging callbacks, and renders loading/empty states", async () => {
    const selected: string[] = [];
    const toggled: string[] = [];
    const paged: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ background: "var(--surface)", width: "100%" }}>
                <FileTree
                    data-testid="live"
                    nodes={nodes}
                    onLoadMore={(id) => paged.push(id)}
                    onSelect={(id) => selected.push(id)}
                    onToggle={(id) => toggled.push(id)}
                />
                <FileTree data-testid="busy" loading nodes={[]} />
                <FileTree data-testid="empty" nodes={[]} />
                <FileTree
                    data-testid="collapsed"
                    nodes={[
                        {
                            id: "pkg/",
                            name: "pkg",
                            kind: "directory",
                            expanded: true,
                            loading: true,
                        },
                    ]}
                />
            </div>
        ),
        { width: 300, height: 460, padding: 16 },
    );
    await view.ready();

    const at = (testid: string, rest = "") => `[data-testid="${testid}"] ${rest}`;

    /* Clicking a file entry selects it; a directory chevron toggles it; the
       "Show more" control pages — each reports the node id, nothing else. */
    (
        view.$(at("live", '[data-path="README.md"] [data-happy-desktop-ui="file-tree-entry"]'))
            .element as HTMLButtonElement
    ).click();
    (
        view.$(at("live", '[data-path="docs/"] [data-happy-desktop-ui="file-tree-chevron"]'))
            .element as HTMLButtonElement
    ).click();
    (
        view.$(at("live", '[data-happy-desktop-ui="file-tree-more"]')).element as HTMLButtonElement
    ).click();
    expect(selected).toEqual(["README.md"]);
    expect(toggled).toEqual(["docs/"]);
    expect(paged).toEqual(["src/"]);

    /* Clicking a directory's own name discloses it exactly as its chevron does.
       A directory is not something a caller can open, so reporting the click as
       a selection asked one to open a folder as though it were a file. */
    (
        view.$(at("live", '[data-path="src/"] [data-happy-desktop-ui="file-tree-entry"]'))
            .element as HTMLButtonElement
    ).click();
    expect(selected).toEqual(["README.md"]);
    expect(toggled).toEqual(["docs/", "src/"]);

    /* Whole-tree loading and empty states render a single muted status line. */
    const busy = view.$(at("busy", '[data-happy-desktop-ui="file-tree-status-line"]'));
    expect(busy.element.textContent).toBe("Loading files…");
    expect(busy.computedStyle("color")).toBe("rgb(73, 69, 79)");
    expect(
        view.$(at("empty", '[data-happy-desktop-ui="file-tree-empty"]')).element.textContent,
    ).toBe("No files to show.");

    /* A directory mid-fetch shows its own loading placeholder in place of children. */
    const nested = view.$(at("collapsed", '[data-happy-desktop-ui="file-tree-loading"]'));
    expect(nested.element.textContent).toBe("Loading…");
    expect(nested.computedStyle("padding-left")).toBe("24px");

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileTree.states");
}, 120_000);
