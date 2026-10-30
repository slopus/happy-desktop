import { describe, expect, it } from "vitest";
import {
    markdownDiffCompute,
    type MarkdownDiffBlock,
    type MarkdownDiffCode,
    type MarkdownDiffHeading,
    type MarkdownDiffInlineRun,
    type MarkdownDiffList,
    type MarkdownDiffModel,
    type MarkdownDiffParagraph,
    type MarkdownDiffPhrasing,
    type MarkdownDiffTable,
} from "./markdownDiffModel";
import { markdownDiffTree } from "./markdownDiffTree";
import { sequenceDiff, sequenceDiffMatches } from "./sequenceDiff";

/* Each case reads a diff back as text: `[-deleted-]` and `{+inserted+}` mark
   inline runs, and Markdown punctuation marks the formatting a run kept. */

function phrasingText(nodes: readonly MarkdownDiffPhrasing[]): string {
    return nodes
        .map((node) => {
            switch (node.type) {
                case "text":
                    return node.value;
                case "emphasis":
                    return `*${phrasingText(node.children)}*`;
                case "strong":
                    return `**${phrasingText(node.children)}**`;
                case "delete":
                    return `~~${phrasingText(node.children)}~~`;
                case "inlineCode":
                    return `\`${node.value}\``;
                case "link":
                    return `[${phrasingText(node.children)}](${node.url})`;
                case "image":
                    return `![${node.alt ?? ""}](${node.url})`;
                case "break":
                    return "\\n";
                default:
                    return `<${node.type}>`;
            }
        })
        .join("");
}

function runsText(runs: readonly MarkdownDiffInlineRun[]): string {
    return runs
        .map((run) => {
            const text = phrasingText(run.content);
            if (run.change === "inserted") return `{+${text}+}`;
            if (run.change === "deleted") return `[-${text}-]`;
            return text;
        })
        .join("");
}

/** One line per block: its status, its kind, and its text with inline changes. */
function blockLine(block: MarkdownDiffBlock): string {
    const status = block.moved ? `${block.status} (moved)` : block.status;
    switch (block.type) {
        case "paragraph":
            return `${status} p: ${runsText(block.inline)}`;
        case "heading":
            return `${status} h${String(block.depth)}: ${runsText(block.inline)}`;
        case "code":
            return `${status} code`;
        case "list":
            return `${status} list`;
        case "table":
            return `${status} table`;
        case "blockquote":
            return `${status} quote`;
        case "opaque":
            return `${status} ${block.node.type}`;
    }
}

function lines(diff: MarkdownDiffModel): string[] {
    return diff.blocks.map(blockLine);
}

function only<T extends MarkdownDiffBlock["type"]>(
    diff: MarkdownDiffModel,
    type: T,
): Extract<MarkdownDiffBlock, { type: T }> {
    const blocks = diff.blocks.filter((block) => block.type === type);
    expect(blocks, `exactly one ${type}`).toHaveLength(1);
    return blocks[0] as Extract<MarkdownDiffBlock, { type: T }>;
}

/** One line per list item, indented by depth, with the item's first paragraph. */
function itemLines(list: MarkdownDiffList, depth = 0): string[] {
    return list.items.flatMap((item) => {
        const lead = item.children.find(
            (child): child is MarkdownDiffParagraph => child.type === "paragraph",
        );
        const task =
            item.checked === undefined
                ? ""
                : item.checkedBefore !== item.checked
                  ? `[${item.checkedBefore ? "x" : " "}→${item.checked ? "x" : " "}] `
                  : `[${item.checked ? "x" : " "}] `;
        const status = item.moved ? `${item.status} (moved)` : item.status;
        return [
            `${"  ".repeat(depth)}${status}: ${task}${lead ? runsText(lead.inline) : ""}`,
            ...item.children
                .filter((child): child is MarkdownDiffList => child.type === "list")
                .flatMap((child) => itemLines(child, depth + 1)),
        ];
    });
}

function rowLines(table: MarkdownDiffTable): string[] {
    return table.rows.map(
        (row) =>
            `${row.moved ? `${row.status} (moved)` : row.status}: ${row.cells
                .map(
                    (cell) =>
                        `${cell.status === "changed" ? "" : `${cell.status}=`}${runsText(cell.inline)}`,
                )
                .join(" | ")}`,
    );
}

function codeLines(code: MarkdownDiffCode): string[] {
    return code.lines.map((line) => {
        const mark = line.change === "inserted" ? "+" : line.change === "deleted" ? "-" : " ";
        return `${mark}${String(line.numberBefore ?? "")}:${String(line.numberAfter ?? "")} ${line.text}`;
    });
}

describe("sequenceDiff", () => {
    it("finds a longest common subsequence", () => {
        expect(sequenceDiffMatches([..."ABCABBA"], [..."CBABAC"])).toHaveLength(4);
        expect(sequenceDiffMatches([], [..."abc"])).toEqual([]);
        expect(sequenceDiffMatches([..."abc"], [..."abc"])).toEqual([
            [0, 0],
            [1, 1],
            [2, 2],
        ]);
    });

    it("matches the dynamic-programming optimum on random inputs", () => {
        let seed = 7;
        const random = () => {
            seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
            return seed / 2_147_483_648;
        };
        const optimum = (a: string[], b: string[]) => {
            const table = Array.from({ length: a.length + 1 }, () =>
                Array.from({ length: b.length + 1 }, () => 0),
            );
            for (let i = a.length - 1; i >= 0; i -= 1)
                for (let j = b.length - 1; j >= 0; j -= 1)
                    table[i]![j] =
                        a[i] === b[j]
                            ? table[i + 1]![j + 1]! + 1
                            : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
            return table[0]![0]!;
        };
        for (let round = 0; round < 2000; round += 1) {
            const alphabet = 1 + Math.floor(random() * 4);
            const draw = () =>
                Array.from({ length: Math.floor(random() * 12) }, () =>
                    String(Math.floor(random() * alphabet)),
                );
            const a = draw();
            const b = draw();
            const matches = sequenceDiffMatches(a, b);
            let previous = [-1, -1];
            for (const [i, j] of matches) {
                expect(a[i]).toBe(b[j]);
                expect(i > previous[0]! && j > previous[1]!).toBe(true);
                previous = [i, j];
            }
            expect(matches.length).toBe(optimum(a, b));
        }
    });

    it("orders a replacement as deletions and then insertions", () => {
        expect(sequenceDiff(["a", "b", "c"], ["a", "x", "c"]).map((step) => step.kind)).toEqual([
            "equal",
            "delete",
            "insert",
            "equal",
        ]);
    });

    it("stays fast on long, mostly similar inputs", () => {
        const before = Array.from({ length: 20_000 }, (_, index) => String(index % 97));
        const after = before.map((key, index) => (index % 13 === 0 ? "changed" : key));
        const started = performance.now();
        expect(sequenceDiffMatches(before, after).length).toBeGreaterThan(18_000);
        expect(performance.now() - started).toBeLessThan(2000);
    });
});

describe("empty and identical documents", () => {
    it("compares two empty documents as identical", () => {
        expect(markdownDiffCompute("", "")).toEqual({ blocks: [], identical: true });
        expect(markdownDiffCompute("   \n\n\t\n", "").identical).toBe(true);
    });

    it("reads everything as added to an empty document", () => {
        const diff = markdownDiffCompute("", "# Title\n\nBody text.\n");
        expect(diff.identical).toBe(false);
        expect(lines(diff)).toEqual(["added h1: {+Title+}", "added p: {+Body text.+}"]);
    });

    it("reads everything as removed from an emptied document", () => {
        const diff = markdownDiffCompute("# Title\n\n- one\n- two\n", "");
        expect(lines(diff)).toEqual(["removed h1: [-Title-]", "removed list"]);
        expect(itemLines(only(diff, "list"))).toEqual(["removed: [-one-]", "removed: [-two-]"]);
    });

    it("compares a document with itself as identical", () => {
        const source =
            "# Doc\n\nSome *text* with a [link](https://example.com).\n\n- a\n  - b\n\n| x | y |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst a = 1;\n```\n\n> quote\n\n---\n";
        const diff = markdownDiffCompute(source, source);
        expect(diff.identical).toBe(true);
        expect(diff.blocks.every((block) => block.status === "unchanged")).toBe(true);
        expect(lines(diff)).toEqual([
            "unchanged h1: Doc",
            "unchanged p: Some *text* with a [link](https://example.com).",
            "unchanged list",
            "unchanged table",
            "unchanged code",
            "unchanged quote",
            "unchanged thematicBreak",
        ]);
    });
});

describe("whitespace", () => {
    it("ignores changes a reader cannot see", () => {
        const before = [
            "A paragraph that is",
            "wrapped across   lines.",
            "",
            "* one",
            "* two",
            "",
            "Some _emphasis_ here.   ",
            "",
            "",
            "",
            "```js",
            "const a = 1;   ",
            "```",
        ].join("\n");
        const after = [
            "A paragraph that is wrapped across lines.",
            "",
            "- one",
            "",
            "- two",
            "",
            "Some *emphasis* here.",
            "",
            "```js",
            "const a = 1;",
            "```",
        ].join("\n");
        expect(markdownDiffCompute(before, after).identical).toBe(true);
    });

    it("keeps an indentation change inside code", () => {
        const diff = markdownDiffCompute("```py\nif a:\n  b()\n```", "```py\nif a:\n    b()\n```");
        expect(codeLines(only(diff, "code"))).toEqual([" 1:1 if a:", "-2:   b()", "+:2     b()"]);
    });

    it("keeps a space that joins or splits words", () => {
        const diff = markdownDiffCompute("Sign in now.", "Signin now.");
        expect(lines(diff)).toEqual(["changed p: [-Sign in-]{+Signin+} now."]);
    });
});

describe("block alignment", () => {
    const base = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n";

    it("inserts a block between unchanged ones", () => {
        const diff = markdownDiffCompute(
            base,
            "# Title\n\nFirst paragraph.\n\nA brand new note.\n\nSecond paragraph.\n\nThird paragraph.\n",
        );
        expect(lines(diff)).toEqual([
            "unchanged h1: Title",
            "unchanged p: First paragraph.",
            "added p: {+A brand new note.+}",
            "unchanged p: Second paragraph.",
            "unchanged p: Third paragraph.",
        ]);
    });

    it("deletes a block from between unchanged ones", () => {
        const diff = markdownDiffCompute(base, "# Title\n\nFirst paragraph.\n\nThird paragraph.\n");
        expect(lines(diff)).toEqual([
            "unchanged h1: Title",
            "unchanged p: First paragraph.",
            "removed p: [-Second paragraph.-]",
            "unchanged p: Third paragraph.",
        ]);
    });

    it("pairs an edited block with its old version", () => {
        const diff = markdownDiffCompute(
            base,
            "# Title\n\nFirst paragraph.\n\nSecond, longer paragraph.\n\nThird paragraph.\n",
        );
        expect(lines(diff)).toEqual([
            "unchanged h1: Title",
            "unchanged p: First paragraph.",
            "changed p: Second{+, longer+} paragraph.",
            "unchanged p: Third paragraph.",
        ]);
    });

    it("replaces an unrelated block rather than diffing it word by word", () => {
        const diff = markdownDiffCompute(
            base,
            "# Title\n\nFirst paragraph.\n\nCompletely different words here.\n\nThird paragraph.\n",
        );
        expect(lines(diff).slice(2, 4)).toEqual([
            "removed p: [-Second paragraph.-]",
            "added p: {+Completely different words here.+}",
        ]);
    });

    it("pairs each edit with its most similar counterpart", () => {
        const diff = markdownDiffCompute(
            "Alpha beta gamma delta.\n\nOne two three four.\n",
            "A new opening line.\n\nAlpha beta gamma epsilon.\n\nOne two three five.\n",
        );
        expect(lines(diff)).toEqual([
            "added p: {+A new opening line.+}",
            "changed p: Alpha beta gamma [-delta-]{+epsilon+}.",
            "changed p: One two three [-four-]{+five+}.",
        ]);
    });

    it("marks a block that moved, at both ends", () => {
        const diff = markdownDiffCompute(
            "Intro.\n\nMoving paragraph.\n\nMiddle one.\n\nMiddle two.\n\nEnd.\n",
            "Intro.\n\nMiddle one.\n\nMiddle two.\n\nMoving paragraph.\n\nEnd.\n",
        );
        expect(lines(diff)).toEqual([
            "unchanged p: Intro.",
            "removed (moved) p: [-Moving paragraph.-]",
            "unchanged p: Middle one.",
            "unchanged p: Middle two.",
            "added (moved) p: {+Moving paragraph.+}",
            "unchanged p: End.",
        ]);
    });

    it("does not call a deletion and an unrelated insertion a move", () => {
        const diff = markdownDiffCompute("One.\n\nTwo.\n", "Two.\n\nThree.\n");
        expect(lines(diff)).toEqual([
            "removed p: [-One.-]",
            "unchanged p: Two.",
            "added p: {+Three.+}",
        ]);
    });

    it("never pairs blocks of different kinds", () => {
        const diff = markdownDiffCompute("Install the app.\n", "# Install the app\n");
        expect(lines(diff)).toEqual([
            "removed p: [-Install the app.-]",
            "added h1: {+Install the app+}",
        ]);
    });

    it("adds and removes rules and raw HTML whole", () => {
        const diff = markdownDiffCompute(
            "One.\n\n<div>old</div>\n\nTwo.\n",
            "One.\n\n---\n\nTwo.\n",
        );
        expect(lines(diff)).toEqual([
            "unchanged p: One.",
            "removed html",
            "added thematicBreak",
            "unchanged p: Two.",
        ]);
    });
});

describe("inline word diff", () => {
    it("marks a replaced word inside an unchanged sentence", () => {
        const diff = markdownDiffCompute("The quick brown fox.", "The slow brown fox.");
        expect(lines(diff)).toEqual(["changed p: The [-quick-]{+slow+} brown fox."]);
    });

    it("reads a rewritten phrase as one deletion and one insertion", () => {
        const diff = markdownDiffCompute(
            "We ship the new viewer next week.",
            "We ship the rendered diff viewer tomorrow.",
        );
        expect(lines(diff)).toEqual([
            "changed p: We ship the [-new-]{+rendered diff+} viewer [-next week-]{+tomorrow+}.",
        ]);
    });

    it("keeps formatting around inserted words", () => {
        const diff = markdownDiffCompute(
            "Read the **docs** and *notes* here.",
            "Read the **new docs** and *notes* here.",
        );
        const paragraph = only(diff, "paragraph");
        expect(runsText(paragraph.inline)).toBe("Read the {+**new**+} **docs** and *notes* here.");
        expect(paragraph.inline[1]).toMatchObject({
            change: "inserted",
            content: [{ type: "strong", children: [{ type: "text", value: "new" }] }],
        });
    });

    it("treats a change of formatting as a change of the words", () => {
        const diff = markdownDiffCompute("Make this important.", "Make this **important**.");
        expect(lines(diff)).toEqual(["changed p: Make this [-important-]{+**important**+}."]);
    });

    it("marks a changed link target and keeps its text", () => {
        const diff = markdownDiffCompute(
            "See [the guide](https://a.example) for more.",
            "See [the guide](https://b.example) for more.",
        );
        expect(lines(diff)).toEqual([
            "changed p: See [-[the guide](https://a.example)-]{+[the guide](https://b.example)+} for more.",
        ]);
    });

    it("splits a link where only some of its words changed", () => {
        const diff = markdownDiffCompute(
            "Open [the old guide](https://a.example).",
            "Open [the new guide](https://a.example).",
        );
        expect(lines(diff)).toEqual([
            "changed p: Open [the ](https://a.example)[-[old](https://a.example)-]{+[new](https://a.example)+} [guide](https://a.example).",
        ]);
    });

    it("compares a code span as one piece", () => {
        const diff = markdownDiffCompute("Call `start()` first.", "Call `begin()` first.");
        expect(lines(diff)).toEqual(["changed p: Call [-`start()`-]{+`begin()`+} first."]);
    });

    it("handles text that is only added at the end", () => {
        const diff = markdownDiffCompute("Done.", "Done. Shipped too.");
        expect(lines(diff)).toEqual(["changed p: Done. {+Shipped too.+}"]);
    });
});

describe("headings", () => {
    it("keeps a heading that changed level as one changed heading", () => {
        const diff = markdownDiffCompute("## Setup\n\nText.\n", "### Setup\n\nText.\n");
        const heading = only(diff, "heading");
        expect(heading).toMatchObject({ status: "changed", depth: 3, depthBefore: 2 });
        expect(runsText(heading.inline)).toBe("Setup");
    });

    it("pairs a renamed heading at the same level", () => {
        const diff = markdownDiffCompute("## Install\n\nText.\n", "## Getting started\n\nText.\n");
        expect(lines(diff)).toEqual([
            "changed h2: [-Install-]{+Getting started+}",
            "unchanged p: Text.",
        ]);
    });

    it("renames and changes level together", () => {
        const diff = markdownDiffCompute("# Release notes\n", "## Release notes for 2.0\n");
        const heading = only(diff, "heading") satisfies MarkdownDiffHeading;
        expect(heading).toMatchObject({ depth: 2, depthBefore: 1 });
        expect(runsText(heading.inline)).toBe("Release notes {+for 2.0+}");
    });
});

describe("lists", () => {
    it("adds, removes, and edits items inside one list", () => {
        const diff = markdownDiffCompute(
            "- Files open inside Happy\n- Markdown renders\n- Chat links open the browser\n",
            "- Files open inside Happy\n- Markdown renders as a document\n- Images preview\n",
        );
        const list = only(diff, "list");
        expect(list.status).toBe("changed");
        expect(itemLines(list)).toEqual([
            "unchanged: Files open inside Happy",
            "changed: Markdown renders {+as a document+}",
            "removed: [-Chat links open the browser-]",
            "added: {+Images preview+}",
        ]);
    });

    it("diffs a nested list inside its parent item", () => {
        const diff = markdownDiffCompute(
            "- Parent\n  - child one\n  - child two\n- Sibling\n",
            "- Parent\n  - child one\n  - child 1.5\n  - child two\n- Sibling\n",
        );
        expect(itemLines(only(diff, "list"))).toEqual([
            "changed: Parent",
            "  unchanged: child one",
            "  added: {+child 1.5+}",
            "  unchanged: child two",
            "unchanged: Sibling",
        ]);
    });

    it("diffs words three levels deep", () => {
        const diff = markdownDiffCompute(
            "1. One\n   - Two\n     - Three deep words\n",
            "1. One\n   - Two\n     - Three deeper words\n",
        );
        expect(itemLines(only(diff, "list"))).toEqual([
            "changed: One",
            "  changed: Two",
            "    changed: Three [-deep-]{+deeper+} words",
        ]);
    });

    it("marks a reordered item as moved", () => {
        const diff = markdownDiffCompute(
            "- first item\n- second item\n- third item\n",
            "- second item\n- third item\n- first item\n",
        );
        expect(itemLines(only(diff, "list"))).toEqual([
            "removed (moved): [-first item-]",
            "unchanged: second item",
            "unchanged: third item",
            "added (moved): {+first item+}",
        ]);
    });

    it("records a ticked task", () => {
        const diff = markdownDiffCompute(
            "- [ ] Read the file\n- [ ] Write it back\n",
            "- [x] Read the file\n- [ ] Write it back\n",
        );
        expect(itemLines(only(diff, "list"))).toEqual([
            "changed: [ →x] Read the file",
            "unchanged: [ ] Write it back",
        ]);
    });

    it("replaces a list that changed between ordered and unordered", () => {
        const diff = markdownDiffCompute("- a\n- b\n", "1. a\n2. b\n");
        expect(lines(diff)).toEqual(["removed list", "added list"]);
    });

    it("keeps old and new numbers in a changed ordered list", () => {
        const diff = markdownDiffCompute(
            "1. one\n2. two\n3. three\n",
            "1. one\n2. three\n3. four\n",
        );
        const list = only(diff, "list");
        expect(itemLines(list)).toEqual([
            "unchanged: one",
            "removed: [-two-]",
            "unchanged: three",
            "added: {+four+}",
        ]);
        const tree = markdownDiffTree(diff, undefined, new Set());
        const rendered = tree.root.children[0];
        expect(rendered?.type).toBe("list");
        if (rendered?.type !== "list") return;
        expect(rendered.children.map((item) => item.data?.hProperties?.["value"])).toEqual([
            "1",
            "2",
            "2",
            "3",
        ]);
    });
});

describe("tables", () => {
    const table =
        "| Kind | Opens as | Scrolls |\n| --- | --- | --- |\n| Markdown | Rendered prose | Yes |\n| Image | Contained stage | No |\n";

    it("adds and removes rows", () => {
        const diff = markdownDiffCompute(
            table,
            "| Kind | Opens as | Scrolls |\n| --- | --- | --- |\n| Markdown | Rendered prose | Yes |\n| Video | Player | No |\n",
        );
        expect(rowLines(only(diff, "table"))).toEqual([
            "unchanged: unchanged=Kind | unchanged=Opens as | unchanged=Scrolls",
            "unchanged: unchanged=Markdown | unchanged=Rendered prose | unchanged=Yes",
            "removed: removed=[-Image-] | removed=[-Contained stage-] | removed=[-No-]",
            "added: added={+Video+} | added={+Player+} | added={+No+}",
        ]);
    });

    it("diffs an edited row cell by cell", () => {
        const diff = markdownDiffCompute(
            table,
            table.replace(
                "| Image | Contained stage | No |",
                "| Image | Contained, centred stage | No |",
            ),
        );
        expect(rowLines(only(diff, "table"))[2]).toBe(
            "changed: unchanged=Image | Contained{+, centred+} stage | unchanged=No",
        );
    });

    it("pairs the header by place and diffs its cells", () => {
        const diff = markdownDiffCompute(
            table,
            table.replace("| Kind | Opens as | Scrolls |", "| Type | Opens as | Scrolls |"),
        );
        expect(rowLines(only(diff, "table"))[0]).toBe(
            "changed: [-Kind-]{+Type+} | unchanged=Opens as | unchanged=Scrolls",
        );
    });

    it("adds a column to every row", () => {
        const diff = markdownDiffCompute(
            "| a | b |\n| - | - |\n| 1 | 2 |\n",
            "| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n",
        );
        expect(rowLines(only(diff, "table"))).toEqual([
            "changed: unchanged=a | unchanged=b | added={+c+}",
            "changed: unchanged=1 | unchanged=2 | added={+3+}",
        ]);
    });

    it("marks a moved row", () => {
        const diff = markdownDiffCompute(
            "| x |\n| - |\n| alpha |\n| beta |\n| gamma |\n",
            "| x |\n| - |\n| beta |\n| gamma |\n| alpha |\n",
        );
        expect(rowLines(only(diff, "table")).map((row) => row.split(":")[0])).toEqual([
            "unchanged",
            "removed (moved)",
            "unchanged",
            "unchanged",
            "added (moved)",
        ]);
    });
});

describe("code fences", () => {
    it("diffs a fence line by line with numbers on each side", () => {
        const diff = markdownDiffCompute(
            "```ts\nconst a = 1;\nconst b = 2;\nexport { a, b };\n```\n",
            "```ts\nconst a = 1;\nconst b = 3;\nconst c = 4;\nexport { a, b };\n```\n",
        );
        const code = only(diff, "code");
        expect(code).toMatchObject({ status: "changed", lang: "ts", langBefore: "ts" });
        expect(codeLines(code)).toEqual([
            " 1:1 const a = 1;",
            "-2: const b = 2;",
            "+:2 const b = 3;",
            "+:3 const c = 4;",
            " 3:4 export { a, b };",
        ]);
    });

    it("records a changed fence language", () => {
        const diff = markdownDiffCompute("```js\nlet a = 1;\n```", "```ts\nlet a = 1;\n```");
        expect(only(diff, "code")).toMatchObject({
            status: "changed",
            lang: "ts",
            langBefore: "js",
        });
    });

    it("adds and removes whole fences", () => {
        const diff = markdownDiffCompute("Text.\n", "Text.\n\n```sh\npnpm install\n```\n");
        expect(lines(diff)).toEqual(["unchanged p: Text.", "added code"]);
        expect(codeLines(only(diff, "code"))).toEqual(["+:1 pnpm install"]);
    });

    it("replaces an unrelated fence", () => {
        const diff = markdownDiffCompute(
            "```sh\npnpm install\n```",
            "```py\nprint('hello world')\n```",
        );
        expect(lines(diff)).toEqual(["removed code", "added code"]);
    });
});

describe("block quotes", () => {
    it("diffs the blocks inside a quote", () => {
        const diff = markdownDiffCompute(
            "> A preview that crops has answered a different question.\n>\n> Second line.\n",
            "> A preview that crops has answered another question.\n>\n> Second line.\n",
        );
        const quote = only(diff, "blockquote");
        expect(quote.status).toBe("changed");
        expect(quote.children.map(blockLine)).toEqual([
            "changed p: A preview that crops has answered [-a different-]{+another+} question.",
            "unchanged p: Second line.",
        ]);
    });
});

describe("rendered tree", () => {
    const blocks = (count: number) =>
        Array.from({ length: count }, (_, index) => `Paragraph number ${String(index)}.`);

    it("marks inline changes as ins and del inside a changed block", () => {
        const tree = markdownDiffTree(
            markdownDiffCompute("The quick fox.", "The slow fox."),
            undefined,
            new Set(),
        );
        const paragraph = tree.root.children[0];
        expect(paragraph).toMatchObject({
            type: "paragraph",
            data: { hProperties: { dataMarkdownDiff: "changed" } },
            children: [
                { type: "text", value: "The " },
                { data: { hName: "del" }, children: [{ type: "text", value: "quick" }] },
                { data: { hName: "ins" }, children: [{ type: "text", value: "slow" }] },
                { type: "text", value: " fox." },
            ],
        });
    });

    it("marks a status only where it begins", () => {
        const tree = markdownDiffTree(markdownDiffCompute("", "- a\n- b\n"), undefined, new Set());
        const list = tree.root.children[0];
        expect(list?.data?.hProperties).toEqual({ dataMarkdownDiff: "added" });
        if (list?.type !== "list") throw new Error("Expected a list.");
        expect(list.children.map((item) => item.data)).toEqual([undefined, undefined]);
    });

    it("notes a heading's previous level", () => {
        const tree = markdownDiffTree(
            markdownDiffCompute("## A\n", "### A\n"),
            undefined,
            new Set(),
        );
        expect(tree.root.children[0]).toMatchObject({
            type: "heading",
            depth: 3,
            children: [
                { type: "text", value: "A" },
                { type: "text", value: "was H2", data: { hName: "span" } },
            ],
        });
    });

    it("leaves a changed fence to a code slot", () => {
        const tree = markdownDiffTree(
            markdownDiffCompute("```\na\nb\n```", "```\na\nc\n```"),
            undefined,
            new Set(),
        );
        expect(tree.root.children[0]?.data?.hProperties).toEqual({
            dataMarkdownDiffSlot: "code:0",
        });
        expect(tree.slots.get("code:0")).toMatchObject({ kind: "code", block: { type: "code" } });
    });

    it("folds long unchanged runs and keeps context beside the change", () => {
        const before = blocks(12);
        const after = [...before];
        after[6] = "Paragraph number six, rewritten.";
        const diff = markdownDiffCompute(before.join("\n\n"), after.join("\n\n"));
        const tree = markdownDiffTree(diff, 1, new Set());
        expect([...tree.slots.values()]).toEqual([
            { kind: "fold", first: 0, count: 5 },
            { kind: "fold", first: 8, count: 4 },
        ]);
        // Fold, one block of context, the change, one block of context, fold.
        expect(tree.root.children).toHaveLength(5);
        const opened = markdownDiffTree(diff, 1, new Set([0]));
        expect([...opened.slots.values()]).toEqual([{ kind: "fold", first: 8, count: 4 }]);
        expect(opened.root.children).toHaveLength(9);
    });

    it("folds an identical document into one run", () => {
        const source = blocks(6).join("\n\n");
        const tree = markdownDiffTree(markdownDiffCompute(source, source), 2, new Set());
        expect([...tree.slots.values()]).toEqual([{ kind: "fold", first: 0, count: 6 }]);
    });

    it("does not fold a run too short to save anything", () => {
        const before = blocks(4);
        const after = [...before];
        after[1] = "Paragraph number one, rewritten.";
        const tree = markdownDiffTree(
            markdownDiffCompute(before.join("\n\n"), after.join("\n\n")),
            1,
            new Set(),
        );
        expect(tree.slots.size).toBe(0);
    });

    it("keeps link definitions from folded runs", () => {
        const source =
            "See [the guide][g].\n\nOne.\n\nTwo.\n\nThree.\n\n[g]: https://example.com\n";
        const tree = markdownDiffTree(
            markdownDiffCompute(source, source.replace("See", "Read")),
            0,
            new Set(),
        );
        expect(tree.root.children.map((child) => child.type)).toEqual([
            "paragraph",
            "paragraph",
            "definition",
        ]);
    });
});

describe("scale", () => {
    it("compares long documents promptly", () => {
        const before = Array.from(
            { length: 3000 },
            (_, index) =>
                `Paragraph ${String(index)} says something about item ${String(index % 17)}.`,
        );
        const after = before.flatMap((paragraph, index) =>
            index % 50 === 0
                ? [paragraph.replace("says", "now says"), `An inserted note ${String(index)}.`]
                : index % 75 === 0
                  ? []
                  : [paragraph],
        );
        const started = performance.now();
        const diff = markdownDiffCompute(before.join("\n\n"), after.join("\n\n"));
        expect(performance.now() - started).toBeLessThan(4000);
        const counts = { added: 0, removed: 0, changed: 0 };
        for (const block of diff.blocks)
            if (block.status !== "unchanged") counts[block.status] += 1;
        expect(counts).toEqual({ added: 60, removed: 20, changed: 60 });
    });
});
