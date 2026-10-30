import type {
    MarkdownDiffModel,
    MarkdownDiffBlock,
    MarkdownDiffCode,
    MarkdownDiffFlow,
    MarkdownDiffInlineRun,
    MarkdownDiffListItem,
    MarkdownDiffPhrasing,
    MarkdownDiffRoot,
    MarkdownDiffStatus,
} from "./markdownDiff";

type MarkdownData = NonNullable<MarkdownDiffFlow["data"]>;
type MarkdownProperties = NonNullable<MarkdownData["hProperties"]>;
type MarkdownList = Extract<MarkdownDiffFlow, { type: "list" }>;
type MarkdownListItem = MarkdownList["children"][number];
type MarkdownTable = Extract<MarkdownDiffFlow, { type: "table" }>;
type MarkdownTableRow = MarkdownTable["children"][number];
type MarkdownTableCell = MarkdownTableRow["children"][number];

/**
 * A part of the diff the document renderer cannot draw from Markdown alone: a
 * fenced block's line diff, or a run of unchanged blocks folded away. The tree
 * holds an empty placeholder element naming the slot by its key.
 */
export type MarkdownDiffSlot =
    | { readonly kind: "code"; readonly block: MarkdownDiffCode }
    | { readonly kind: "fold"; readonly first: number; readonly count: number };

export type MarkdownDiffTree = {
    /** The diff as one Markdown tree, each changed element marked with its status. */
    readonly root: MarkdownDiffRoot;
    readonly slots: ReadonlyMap<string, MarkdownDiffSlot>;
};

/** The fewest unchanged blocks a fold hides; folding one block saves nothing. */
const FOLD_MINIMUM = 2;

/**
 * The diff as a Markdown tree the document renderer draws: unchanged content is
 * plain Markdown, a block or part with a status carries `data-markdown-diff`,
 * and inline changes are `<ins>` and `<del>` inside their block. An added or
 * removed status is marked only where it begins, so an added list marks the
 * list, not each item.
 *
 * With `unchangedContext`, a run of unchanged top-level blocks longer than that
 * many blocks on each side of a change folds into one slot, unless the run's
 * first hidden index is in `expanded`.
 */
export function markdownDiffTree(
    diff: MarkdownDiffModel,
    unchangedContext: number | undefined,
    expanded: ReadonlySet<number>,
): MarkdownDiffTree {
    const slots = new Map<string, MarkdownDiffSlot>();
    const folds = new Map<number, number>();
    if (unchangedContext !== undefined) {
        const blocks = diff.blocks;
        let index = 0;
        while (index < blocks.length) {
            if (blocks[index]!.status !== "unchanged") {
                index += 1;
                continue;
            }
            let end = index;
            while (end < blocks.length && blocks[end]!.status === "unchanged") end += 1;
            const first = index === 0 ? 0 : index + unchangedContext;
            const last = end === blocks.length ? end : end - unchangedContext;
            if (last - first >= FOLD_MINIMUM && !expanded.has(first))
                folds.set(first, last - first);
            index = end;
        }
    }
    const children: MarkdownDiffFlow[] = [];
    for (let index = 0; index < diff.blocks.length; index += 1) {
        const count = folds.get(index);
        if (count === undefined) {
            children.push(...blockTree(diff.blocks[index]!, "unchanged", slots));
            continue;
        }
        const key = `fold:${String(index)}`;
        slots.set(key, { kind: "fold", first: index, count });
        children.push(slotNode(key));
        // A folded definition still resolves the links that remain in view; it
        // renders nothing itself.
        for (const block of diff.blocks.slice(index, index + count))
            if (
                block.type === "opaque" &&
                (block.node.type === "definition" || block.node.type === "footnoteDefinition")
            )
                children.push(block.node);
        index += count - 1;
    }
    return { root: { type: "root", children }, slots };
}

function slotNode(key: string): MarkdownDiffFlow {
    return {
        type: "paragraph",
        children: [],
        data: { hName: "div", hProperties: { dataMarkdownDiffSlot: key } },
    };
}

function statusProperties(
    status: MarkdownDiffStatus,
    moved: boolean,
    parent: MarkdownDiffStatus,
): MarkdownProperties | undefined {
    // Inside an added or removed block every part shares its status, so only
    // the block says it; a changed part inside a changed block is its own.
    if (status === "unchanged" || (status === parent && status !== "changed")) return undefined;
    return moved
        ? { dataMarkdownDiff: status, dataMarkdownDiffMoved: "" }
        : { dataMarkdownDiff: status };
}

function withProperties(properties: MarkdownProperties | undefined): { data?: MarkdownData } {
    return properties === undefined ? {} : { data: { hProperties: properties } };
}

function inlineTree(
    runs: readonly MarkdownDiffInlineRun[],
    status: MarkdownDiffStatus,
): MarkdownDiffPhrasing[] {
    // A whole added or removed block is marked once, on the block.
    if (status !== "changed") return runs.flatMap((run) => [...run.content]);
    return runs.flatMap((run): MarkdownDiffPhrasing[] =>
        run.change === "equal"
            ? [...run.content]
            : [
                  // The strikethrough node only carries the run: `hName` names
                  // the element it renders as.
                  {
                      type: "delete",
                      data: {
                          hName: run.change === "inserted" ? "ins" : "del",
                          hProperties: { dataMarkdownDiffInline: run.change },
                      },
                      children: [...run.content],
                  },
              ],
    );
}

/** A short aside on a changed block, for a change its rendering cannot show. */
function noteNode(text: string): MarkdownDiffPhrasing {
    return {
        type: "text",
        value: text,
        data: { hName: "span", hProperties: { dataMarkdownDiffNote: "" } },
    };
}

function blockTree(
    block: MarkdownDiffBlock,
    parent: MarkdownDiffStatus,
    slots: Map<string, MarkdownDiffSlot>,
): MarkdownDiffFlow[] {
    const properties = statusProperties(block.status, block.moved, parent);
    switch (block.type) {
        case "paragraph":
            return [
                {
                    type: "paragraph",
                    children: inlineTree(block.inline, block.status),
                    ...withProperties(properties),
                },
            ];
        case "heading":
            return [
                {
                    type: "heading",
                    depth: block.depth,
                    children: [
                        ...inlineTree(block.inline, block.status),
                        ...(block.depth === block.depthBefore
                            ? []
                            : [noteNode(`was H${String(block.depthBefore)}`)]),
                    ],
                    ...withProperties(properties),
                },
            ];
        case "code": {
            if (block.status === "changed") {
                const key = `code:${String(slots.size)}`;
                slots.set(key, { kind: "code", block });
                return [slotNode(key)];
            }
            // The renderer puts a code node's properties on its inner <code>;
            // the document's <pre> reads them from there.
            return [
                {
                    type: "code",
                    lang: block.lang ?? null,
                    meta: block.meta ?? null,
                    value: block.lines.map((line) => line.text).join("\n"),
                    ...withProperties(
                        properties === undefined
                            ? undefined
                            : {
                                  dataMarkdownDiffCode: block.status,
                                  ...(block.moved ? { dataMarkdownDiffCodeMoved: "" } : {}),
                              },
                    ),
                },
            ];
        }
        case "list": {
            // Removed items keep their old numbers and the rest count on from
            // the new start, so an inserted item does not renumber what follows.
            const numbered = block.ordered && block.status === "changed";
            let after = block.start ?? 1;
            let before = block.startBefore ?? 1;
            return [
                {
                    type: "list",
                    ordered: block.ordered,
                    start: block.start ?? null,
                    spread: block.spread,
                    children: block.items.map((item) => {
                        let value: number | undefined;
                        if (numbered) {
                            if (item.status === "removed") value = before++;
                            else if (item.status === "added") value = after++;
                            else {
                                value = after++;
                                before += 1;
                            }
                        }
                        return itemTree(item, block.status, value, slots);
                    }),
                    ...withProperties(properties),
                },
            ];
        }
        case "table":
            return [
                {
                    type: "table",
                    align: block.align,
                    children: block.rows.map(
                        (row): MarkdownTableRow => ({
                            type: "tableRow",
                            children: row.cells.map(
                                (cell): MarkdownTableCell => ({
                                    type: "tableCell",
                                    children: inlineTree(cell.inline, cell.status),
                                    ...withProperties(
                                        statusProperties(cell.status, false, row.status),
                                    ),
                                }),
                            ),
                            ...withProperties(
                                statusProperties(row.status, row.moved, block.status),
                            ),
                        }),
                    ),
                    ...withProperties(properties),
                },
            ];
        case "blockquote":
            return [
                {
                    type: "blockquote",
                    children: block.children.flatMap((child) =>
                        blockTree(child, block.status, slots),
                    ),
                    ...withProperties(properties),
                },
            ];
        case "opaque":
            return [
                properties === undefined
                    ? block.node
                    : { ...block.node, data: { ...block.node.data, hProperties: properties } },
            ];
    }
}

function itemTree(
    item: MarkdownDiffListItem,
    parent: MarkdownDiffStatus,
    value: number | undefined,
    slots: Map<string, MarkdownDiffSlot>,
): MarkdownListItem {
    const children = item.children.flatMap((child) => blockTree(child, item.status, slots));
    if (
        item.status === "changed" &&
        item.checked !== undefined &&
        item.checkedBefore !== undefined &&
        item.checked !== item.checkedBefore
    ) {
        const lead = children[0];
        const note = noteNode(item.checkedBefore ? "was checked" : "was unchecked");
        if (lead?.type === "paragraph")
            children[0] = { ...lead, children: [...lead.children, note] };
        else children.unshift({ type: "paragraph", children: [note] });
    }
    const properties = statusProperties(item.status, item.moved, parent);
    const numbered = value === undefined ? undefined : { value: String(value) };
    return {
        type: "listItem",
        checked: item.checked ?? null,
        spread: item.spread,
        children,
        ...withProperties(
            properties === undefined && numbered === undefined
                ? undefined
                : { ...properties, ...numbered },
        ),
    };
}
