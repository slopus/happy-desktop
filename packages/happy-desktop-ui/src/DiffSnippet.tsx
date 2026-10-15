import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes, useSyncExternalStore } from "react";
import {
    diffSnippetHighlight,
    diffSnippetHighlightGeneration,
    diffSnippetHighlightSubscribe,
    diffSnippetTokenColor,
    type DiffSnippetToken,
} from "./diffSnippetHighlight";
import { compactCount, changeCountLabel } from "./countText";
import { ScrollArea } from "./Scrollbar";
export type DiffLineKind = "add" | "del" | "context" | "meta";
export type DiffLine = {
    kind: DiffLineKind;
    number?: number;
    text: string;
};
export type DiffSnippetProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    className?: string;
    file?: string;
    lines: DiffLine[];
    stats?: {
        added: number;
        removed: number;
    };
    style?: CSSProperties;
    /**
     * The language its code is in, from `diffSnippetLanguage`. Given one, the
     * lines are syntax coloured with the palette every code surface here uses;
     * without one they stay the plain text of their kind.
     */
    language?: string;
    /**
     * Soft-wraps long lines instead of scrolling them sideways. A diff read in a
     * narrow column — an inspector panel rather than a full-width page — has no
     * room to carry a scrollport per block, and a line the reader never sees is
     * worse than a line that takes two rows.
     */
    wrap?: boolean;
};
function gutterGlyph(kind: DiffLineKind) {
    if (kind === "add") return "+";
    if (kind === "del") return "−";
    return "";
}
export function DiffSnippet(props: DiffSnippetProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "file",
        "language",
        "lines",
        "stats",
        "style",
        "wrap",
    ]);
    const numbered = () => local.lines.some((line) => line.number !== undefined);
    /* A grammar arrives over the network; the snippet is drawn plain until it
       does and colours itself in place when it lands. */
    useSyncExternalStore(
        diffSnippetHighlightSubscribe,
        diffSnippetHighlightGeneration,
        diffSnippetHighlightGeneration,
    );
    const coloured = diffSnippetHighlight(
        local.lines.filter((line) => line.kind !== "meta").map((line) => line.text),
        local.language,
    );
    // Colours are given for the code lines alone; a meta line has none.
    const colours = ((lines: readonly DiffLine[]) => {
        let at = -1;
        return lines.map((line) =>
            line.kind === "meta" ? undefined : coloured?.[(at += 1)],
        ) as readonly (readonly DiffSnippetToken[] | undefined)[];
    })(local.lines);
    return (
        <div
            {...rest}
            className={["happy-diff-snippet", local.className].filter(Boolean).join(" ")}
            data-numbered={numbered() ? "" : undefined}
            data-happy-desktop-ui="diff-snippet"
            data-wrap={local.wrap ? "" : undefined}
            style={local.style}
        >
            {local.file !== undefined || local.stats !== undefined ? (
                <div
                    className="happy-diff-snippet__header"
                    data-happy-desktop-ui="diff-snippet-header"
                >
                    {local.file !== undefined ? (
                        <span
                            className="happy-diff-snippet__file"
                            data-happy-desktop-ui="diff-snippet-file"
                        >
                            {local.file}
                        </span>
                    ) : null}
                    {/* A side that changed nothing is left unsaid: "+0" is a
                        number the reader has to read before learning there was
                        nothing to learn, and a diff with neither side shows no
                        stats cluster at all. */}
                    {local.stats && (local.stats.added || local.stats.removed)
                        ? ((stats) => (
                              <span
                                  className="happy-diff-snippet__stats"
                                  data-happy-desktop-ui="diff-snippet-stats"
                              >
                                  {stats.added ? (
                                      <span
                                          aria-hidden="true"
                                          className="happy-diff-snippet__added"
                                          data-happy-desktop-ui="diff-snippet-added"
                                      >
                                          +{compactCount(stats.added)}
                                      </span>
                                  ) : null}
                                  {stats.removed ? (
                                      <span
                                          aria-hidden="true"
                                          className="happy-diff-snippet__removed"
                                          data-happy-desktop-ui="diff-snippet-removed"
                                      >
                                          &minus;{compactCount(stats.removed)}
                                      </span>
                                  ) : null}
                                  <span className="happy-visually-hidden">
                                      {changeCountLabel(stats.added ?? 0, stats.removed ?? 0)}
                                  </span>
                              </span>
                          ))(local.stats)
                        : null}
                </div>
            ) : null}
            <ScrollArea
                axes="horizontal"
                className="happy-diff-snippet__scroll"
                data-happy-desktop-ui="diff-snippet-scroll"
                viewportClassName="happy-diff-snippet__scroll-viewport"
            >
                <div className="happy-diff-snippet__code" data-happy-desktop-ui="diff-snippet-code">
                    {local.lines.map((line, index) => (
                        <div
                            className="happy-diff-snippet__line"
                            key={`${line.kind}-${line.number ?? ""}-${index}`}
                            data-kind={line.kind}
                            data-happy-desktop-ui="diff-snippet-line"
                        >
                            {numbered() ? (
                                <span
                                    className="happy-diff-snippet__number"
                                    data-happy-desktop-ui="diff-snippet-number"
                                >
                                    {line.number}
                                </span>
                            ) : null}
                            <span
                                className="happy-diff-snippet__gutter"
                                data-happy-desktop-ui="diff-snippet-gutter"
                            >
                                {gutterGlyph(line.kind)}
                            </span>
                            <span
                                className="happy-diff-snippet__text"
                                data-happy-desktop-ui="diff-snippet-text"
                            >
                                {((tokens) =>
                                    tokens === undefined || tokens.length === 0
                                        ? line.text
                                        : tokens.map((token, at) => (
                                              <span
                                                  key={at}
                                                  style={{ color: diffSnippetTokenColor(token) }}
                                              >
                                                  {token.text}
                                              </span>
                                          )))(colours[index])}
                            </span>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
