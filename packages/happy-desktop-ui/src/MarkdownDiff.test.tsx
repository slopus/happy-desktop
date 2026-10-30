import { expect, it } from "vitest";
import "./styles.css";
import { MarkdownDiff } from "./MarkdownDiff";
import { markdownDiffCompute } from "./markdownDiffModel";
import { createRenderer } from "./testing";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const before = `## Setup

The quick brown fox.

- keep
- drop this item

| Kind | Opens as |
| ---- | -------- |
| Image | Contained stage |

\`\`\`ts
const a = 1;
const b = 2;
\`\`\`
`;

const after = `### Setup

The slow brown fox.

- keep
- [a new link](https://example.com)

| Kind | Opens as |
| ---- | -------- |
| Image | Centred stage |
| Video | Player |

\`\`\`ts
const a = 1;
const b = 3;
\`\`\`
`;

it("renders a diff through the document renderer with every change marked", async () => {
    const view = createRenderer();
    view.render(() => <MarkdownDiff diff={markdownDiffCompute(before, after)} flow="inline" />, {
        width: 720,
        height: 900,
    });
    await view.ready();
    const root = view.container.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="markdown-diff"]',
    )!;
    const body = root.querySelector<HTMLElement>(".happy-markdown-document__body")!;

    const heading = body.querySelector("h3")!;
    expect(heading.dataset.markdownDiff).toBe("changed");
    expect(heading.querySelector("[data-markdown-diff-note]")?.textContent).toBe("was H2");

    const paragraph = body.querySelector("p")!;
    expect(paragraph.querySelector("del")?.textContent).toBe("quick");
    expect(paragraph.querySelector("ins")?.textContent).toBe("slow");
    expect(getComputedStyle(paragraph.querySelector("ins")!).textDecorationLine).toBe("underline");
    expect(getComputedStyle(paragraph.querySelector("del")!).textDecorationLine).toBe(
        "line-through",
    );

    const items = [...body.querySelectorAll("li")];
    expect(items.map((item) => item.dataset.markdownDiff ?? "unchanged")).toEqual([
        "unchanged",
        "removed",
        "added",
    ]);
    // The added item's link is the document's own web link.
    expect(items[2]!.querySelector("a")?.getAttribute("href")).toBe("https://example.com");

    const rows = [...body.querySelectorAll("tr")];
    expect(rows.map((row) => row.dataset.markdownDiff ?? "unchanged")).toEqual([
        "unchanged",
        "changed",
        "added",
    ]);
    expect(rows[1]!.querySelector("del")?.textContent).toBe("Contained");
    expect(rows[1]!.querySelector("ins")?.textContent).toBe("Centred");

    const code = body.querySelector<HTMLElement>('[data-happy-desktop-ui="markdown-diff-code"]')!;
    expect(
        [...code.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="diff-snippet-line"]')].map(
            (line) => `${line.dataset.kind ?? ""} ${line.textContent ?? ""}`,
        ),
    ).toEqual(["context 1const a = 1;", "del 2−const b = 2;", "add 2+const b = 3;"]);
    view.destroy();
});

it("folds unchanged runs until the reader opens one", async () => {
    const paragraphs = Array.from({ length: 8 }, (_, index) => `Paragraph ${String(index)}.`);
    const changed = [...paragraphs];
    changed[7] = "Paragraph seven, edited.";
    const view = createRenderer();
    view.render(
        () => (
            <MarkdownDiff
                diff={markdownDiffCompute(paragraphs.join("\n\n"), changed.join("\n\n"))}
                flow="inline"
                unchangedContext={1}
            />
        ),
        { width: 720, height: 600 },
    );
    await view.ready();
    const body = view.container.querySelector<HTMLElement>(".happy-markdown-document__body")!;
    const fold = body.querySelector<HTMLElement>('[data-happy-desktop-ui="markdown-diff-fold"]')!;
    // The button also holds its icon glyph.
    expect(fold.textContent).toContain("Show 6 unchanged blocks");
    expect(body.querySelectorAll("p")).toHaveLength(2);

    fold.querySelector("button")!.click();
    await nextFrame();
    expect(body.querySelector('[data-happy-desktop-ui="markdown-diff-fold"]')).toBeNull();
    expect(body.querySelectorAll("p")).toHaveLength(8);
    view.destroy();
});
