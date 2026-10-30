import { partitionComponentProps } from "./componentProps";
import {
    createContext,
    createElement,
    useContext,
    useState,
    type ComponentPropsWithoutRef,
    type CSSProperties,
    type ReactNode,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import { Button } from "./Button";
import { DiffSnippet, type DiffLine } from "./DiffSnippet";
import type { FileLinkOpenHandler, FileOpenHandler } from "./fileReference";
import type { MessageReferences } from "./messageReferences";
import type { MarkdownDiffCode, MarkdownDiffModel } from "./markdownDiffModel";
import { markdownDiffTree, type MarkdownDiffSlot } from "./markdownDiffTree";
import {
    MarkdownDocumentFrame,
    MarkdownDocumentPre,
    markdownDocumentComponents,
    markdownFileUrlTransform,
    type MarkdownDocumentReferences,
} from "./MarkdownDocument";

export type MarkdownDiffProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The comparison to draw, from `markdownDiffCompute`. */
    diff: MarkdownDiffModel;
    /**
     * Unchanged top-level blocks kept in view on each side of a change. A
     * longer unchanged run folds behind a control that shows it. Omit it to
     * show the whole document.
     */
    unchangedContext?: number;
    /** Opens a link to another file, as `MarkdownDocument` does. */
    onFileOpen?: FileOpenHandler;
    /** Opens a `happy://` or `happy-file://` file link, as `MarkdownDocument` does. */
    onFileLinkOpen?: FileLinkOpenHandler;
    /** Reads and opens the `happy://` links to Happy entities, as `MarkdownDocument` does. */
    entities?: MessageReferences;
    /** Resolves the document's own relative references, as `MarkdownDocument` does. */
    references?: MarkdownDocumentReferences;
    /** `scroll`, the default, or `inline`, as `MarkdownDocument` lays out. */
    flow?: "scroll" | "inline";
};

type MarkdownDiffSlots = {
    readonly slots: ReadonlyMap<string, MarkdownDiffSlot>;
    readonly onFoldExpand: (first: number) => void;
};

const MarkdownDiffSlotsContext = createContext<MarkdownDiffSlots>({
    slots: new Map(),
    onFoldExpand: () => {},
});

/** The diff attributes the tree put on an element, for a component that draws its own. */
function diffAttributes(props: object): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const name of ["data-markdown-diff", "data-markdown-diff-moved"]) {
        const value = (props as Record<string, unknown>)[name];
        if (typeof value === "string") attributes[name] = value;
    }
    return attributes;
}

/**
 * A whole fenced block that was added or removed is the document's own code
 * block, inside a frame that says which; its status rides on the inner
 * `<code>`, where the renderer puts a code node's properties.
 */
const DiffPre = (props: ComponentPropsWithoutRef<"pre"> & ExtraProps) => {
    const code = props.node?.children.find(
        (child) => child.type === "element" && child.tagName === "code",
    );
    const status = code?.type === "element" ? code.properties["dataMarkdownDiffCode"] : undefined;
    if (typeof status !== "string") return <MarkdownDocumentPre {...props} />;
    return (
        <div
            className="happy-markdown-diff__code"
            data-happy-desktop-ui="markdown-diff-code"
            data-markdown-diff={status}
            data-markdown-diff-moved={
                code?.type === "element" &&
                code.properties["dataMarkdownDiffCodeMoved"] !== undefined
                    ? ""
                    : undefined
            }
        >
            <MarkdownDocumentPre {...props} />
        </div>
    );
};

function codeLabel(block: MarkdownDiffCode): string | undefined {
    if (block.lang === block.langBefore) return block.lang;
    return `${block.langBefore ?? "text"} → ${block.lang ?? "text"}`;
}

/** A fenced block that changed, as the product's line diff of its source. */
function DiffCodeChange(props: { block: MarkdownDiffCode }) {
    const lines = props.block.lines.map(
        (line): DiffLine =>
            line.change === "inserted"
                ? { kind: "add", number: line.numberAfter, text: line.text }
                : line.change === "deleted"
                  ? { kind: "del", number: line.numberBefore, text: line.text }
                  : { kind: "context", number: line.numberAfter, text: line.text },
    );
    const label = codeLabel(props.block);
    return (
        <div
            className="happy-markdown-diff__code"
            data-happy-desktop-ui="markdown-diff-code"
            data-markdown-diff="changed"
        >
            <DiffSnippet
                {...(label === undefined ? {} : { file: label })}
                lines={lines}
                stats={{
                    added: lines.filter((line) => line.kind === "add").length,
                    removed: lines.filter((line) => line.kind === "del").length,
                }}
            />
        </div>
    );
}

function DiffFold(props: { count: number; first: number }) {
    const { onFoldExpand } = useContext(MarkdownDiffSlotsContext);
    return (
        <div className="happy-markdown-diff__fold" data-happy-desktop-ui="markdown-diff-fold">
            <Button
                icon="unfold"
                onClick={() => onFoldExpand(props.first)}
                size="small"
                variant="ghost"
            >
                {`Show ${String(props.count)} unchanged blocks`}
            </Button>
        </div>
    );
}

/** A placeholder `div` the tree left for a slot draws that slot; any other is a `div`. */
const DiffDiv = ({ node: _node, ...props }: ComponentPropsWithoutRef<"div"> & ExtraProps) => {
    const { slots } = useContext(MarkdownDiffSlotsContext);
    const key = (props as Record<string, unknown>)["data-markdown-diff-slot"];
    const slot = typeof key === "string" ? slots.get(key) : undefined;
    if (slot?.kind === "code") return <DiffCodeChange block={slot.block} />;
    if (slot?.kind === "fold") return <DiffFold count={slot.count} first={slot.first} />;
    return <div {...props} />;
};

/** Headings keep the document's no-`id` rule and carry their diff status. */
const diffHeading = (
    tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
): NonNullable<Components[typeof tag]> => {
    const DiffHeading = ({ children, ...props }: { children?: ReactNode }) =>
        createElement(tag, diffAttributes(props), children);
    return DiffHeading as NonNullable<Components[typeof tag]>;
};

const markdownDiffComponents: Components = {
    ...markdownDocumentComponents,
    div: DiffDiv,
    pre: DiffPre,
    h1: diffHeading("h1"),
    h2: diffHeading("h2"),
    h3: diffHeading("h3"),
    h4: diffHeading("h4"),
    h5: diffHeading("h5"),
    h6: diffHeading("h6"),
};

/**
 * C-331 MarkdownDiff — two versions of a Markdown document, read as one
 * rendered document.
 *
 * The document is drawn by the same renderer and on the same surface as
 * `MarkdownDocument`, so a heading, table, or fenced block in the diff reads
 * exactly as it does when the file is opened. An added block sits on the
 * added wash and a removed one on the removed wash, struck through; inside a
 * changed block, inserted words are underlined on green and deleted ones
 * struck on red. A changed fence is the product's line diff of its source. A
 * moved block is tinted with the link colour where it arrived and left as a
 * faded ghost where it was. A change a rendering cannot show — a heading's
 * level, a task ticked — is said in a short note beside it.
 *
 * Props only: the caller computes the diff with `markdownDiffCompute`.
 * Unfolding an unchanged run is local to this view.
 */
export function MarkdownDiff(props: MarkdownDiffProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "diff",
        "unchangedContext",
        "onFileOpen",
        "onFileLinkOpen",
        "entities",
        "references",
        "flow",
    ]);
    const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
    const tree = markdownDiffTree(local.diff, local.unchangedContext, expanded);
    const slots: MarkdownDiffSlots = {
        slots: tree.slots,
        onFoldExpand: (first) => setExpanded((current) => new Set(current).add(first)),
    };
    // The tree is already built; the plugin hands it to the renderer in place
    // of parsing the empty source.
    const remarkPlugins = [() => () => tree.root];
    return (
        <MarkdownDocumentFrame
            className={["happy-markdown-diff", local.className].filter(Boolean).join(" ")}
            data-testid={local["data-testid"]}
            entities={local.entities}
            flow={local.flow}
            onFileLinkOpen={local.onFileLinkOpen}
            onFileOpen={local.onFileOpen}
            part="markdown-diff"
            references={local.references}
            style={local.style}
        >
            <MarkdownDiffSlotsContext.Provider value={slots}>
                <Markdown
                    components={markdownDiffComponents}
                    remarkPlugins={remarkPlugins}
                    urlTransform={markdownFileUrlTransform}
                >
                    {""}
                </Markdown>
            </MarkdownDiffSlotsContext.Provider>
        </MarkdownDocumentFrame>
    );
}
