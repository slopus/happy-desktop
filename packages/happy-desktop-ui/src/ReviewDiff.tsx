import { type CSSProperties, useSyncExternalStore } from "react";
import { type DiffLine } from "./DiffSnippet";
import { DiffStat } from "./DiffStat";
import {
    diffSnippetHighlight,
    diffSnippetHighlightGeneration,
    diffSnippetHighlightSubscribe,
    diffSnippetTokenColor,
    type DiffSnippetToken,
} from "./diffSnippetHighlight";
import { FileKindIcon } from "./FileKindIcon";
import { reviewDiffHang, reviewDiffTabsExpand } from "./reviewDiffLayout";

export type ReviewDiffStatus = "added" | "modified" | "deleted" | "renamed";

export type ReviewDiffProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The file the lines are from, relative to the repository. */
    path: string;
    status?: ReviewDiffStatus;
    /** How much the whole file changed, the counts the file list gives it. */
    stats?: { added: number; removed: number };
    /** The real lines, already cut to what the review points at. */
    lines: readonly DiffLine[];
    /** From `diffSnippetLanguage`; without one the code stays uncoloured. */
    language?: string;
    /** Opens the file; given one, the header is a button. */
    onOpen?: () => void;
};

const STATUS_LABELS: Readonly<Record<ReviewDiffStatus, string>> = {
    added: "Added",
    modified: "Modified",
    deleted: "Deleted",
    renamed: "Renamed",
};

/**
 * A few real lines of a change, quoted where a review talks about them.
 *
 * The header says which file in the words the file list uses — its kind,
 * its name, then the folder it is in — and how it changed. Below it the
 * lines carry their numbers, and a changed line is marked by a faint tint
 * of its side's colour, so the code still reads as code.
 */
export function ReviewDiff(props: ReviewDiffProps) {
    const cut = props.path.lastIndexOf("/");
    const name = props.path.slice(cut + 1);
    const directory = cut === -1 ? "" : props.path.slice(0, cut);
    /* A grammar arrives over the network; the lines are drawn plain until it
       does and colour themselves in place when it lands. */
    useSyncExternalStore(
        diffSnippetHighlightSubscribe,
        diffSnippetHighlightGeneration,
        diffSnippetHighlightGeneration,
    );
    const coloured = diffSnippetHighlight(
        props.lines.filter((line) => line.kind !== "meta").map((line) => line.text),
        props.language,
    );
    // Colours are given for the code lines alone; a meta line has none.
    const colours = ((lines: readonly DiffLine[]) => {
        let at = -1;
        return lines.map((line) =>
            line.kind === "meta" ? undefined : coloured?.[(at += 1)],
        ) as readonly (readonly DiffSnippetToken[] | undefined)[];
    })(props.lines);
    const title = (
        <>
            <FileKindIcon path={props.path} size={16} />
            <span className="happy-review-diff__name">{name}</span>
            {directory === "" ? null : (
                <span className="happy-review-diff__directory">
                    <bdi>{directory}</bdi>
                </span>
            )}
        </>
    );
    return (
        <div
            className={["happy-review-diff", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="review-diff"
            data-status={props.status}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-review-diff__header" data-happy-desktop-ui="review-diff-header">
                {props.onOpen === undefined ? (
                    <span className="happy-review-diff__title">{title}</span>
                ) : (
                    <button
                        className="happy-review-diff__title"
                        onClick={props.onOpen}
                        title={props.path}
                        type="button"
                    >
                        {title}
                    </button>
                )}
                {props.status === undefined ? null : (
                    <span className="happy-review-diff__status" data-status={props.status}>
                        {STATUS_LABELS[props.status]}
                    </span>
                )}
                {props.stats === undefined ? null : (
                    <DiffStat added={props.stats.added} removed={props.stats.removed} />
                )}
            </div>
            <div className="happy-review-diff__code" data-happy-desktop-ui="review-diff-code">
                {props.lines.map((line, index) => (
                    <div
                        className="happy-review-diff__line"
                        data-kind={line.kind}
                        key={`${line.kind}-${String(line.number ?? "")}-${String(index)}`}
                    >
                        <span className="happy-review-diff__number">{line.number}</span>
                        <span
                            className="happy-review-diff__text"
                            style={
                                line.kind === "meta"
                                    ? undefined
                                    : ({
                                          "--review-diff-hang": `${String(reviewDiffHang(reviewDiffTabsExpand(line.text).text))}ch`,
                                      } as CSSProperties)
                            }
                        >
                            {((tokens) => {
                                if (line.kind === "meta") return line.text;
                                if (tokens === undefined || tokens.length === 0)
                                    return reviewDiffTabsExpand(line.text).text;
                                // Tab stops count from the start of the line,
                                // across the tokens.
                                let column = 0;
                                return tokens.map((token, at) => {
                                    const expanded = reviewDiffTabsExpand(token.text, column);
                                    column = expanded.column;
                                    return (
                                        <span
                                            key={at}
                                            style={{ color: diffSnippetTokenColor(token) }}
                                        >
                                            {expanded.text}
                                        </span>
                                    );
                                });
                            })(colours[index])}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
