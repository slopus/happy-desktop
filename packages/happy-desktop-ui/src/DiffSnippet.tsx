import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import { CodeBlock } from "./CodeBlock";
import { compactCount, changeCountLabel } from "./countText";
import { ScrollArea } from "./Scrollbar";
export type DiffLineKind = "add" | "del" | "context" | "meta";
export type DiffLine = {
    kind: DiffLineKind;
    number?: number;
    text: string;
};
/** Whole-file text shown highlighted, as the file it is, instead of diff lines. */
export type DiffSnippetSource = {
    text: string;
    /** File name the highlighting language is inferred from. */
    name: string;
    /** Explicit highlighting language, when the producer knows it. */
    lang?: string;
};
export type DiffSnippetProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    className?: string;
    file?: string;
    /** The file was created: a "New" mark beside its name says so. */
    created?: boolean;
    stats?: {
        added: number;
        removed: number;
    };
    style?: CSSProperties;
    /**
     * Soft-wraps long lines instead of scrolling them sideways. A diff read in a
     * narrow column — an inspector panel rather than a full-width page — has no
     * room to carry a scrollport per block, and a line the reader never sees is
     * worse than a line that takes two rows.
     */
    wrap?: boolean;
} & (
        | { lines: DiffLine[]; source?: never }
        | {
              lines?: never;
              /**
               * A created file has nothing to differ from, so it is read as a
               * file: numbered and syntax-highlighted like any other source,
               * with no +/− gutter and no added tint on every line.
               */
              source: DiffSnippetSource;
          }
    );
function gutterGlyph(kind: DiffLineKind) {
    if (kind === "add") return "+";
    if (kind === "del") return "−";
    return "";
}
export function DiffSnippet(props: DiffSnippetProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "created",
        "file",
        "lines",
        "source",
        "stats",
        "style",
        "wrap",
    ]);
    const lines = local.lines ?? [];
    const numbered = () => lines.some((line) => line.number !== undefined);
    return (
        <div
            {...rest}
            className={["happy-diff-snippet", local.className].filter(Boolean).join(" ")}
            data-numbered={numbered() ? "" : undefined}
            data-happy-desktop-ui="diff-snippet"
            data-wrap={local.wrap ? "" : undefined}
            style={local.style}
        >
            {local.file !== undefined || local.stats !== undefined || local.created ? (
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
                    {local.created ? (
                        <span
                            className="happy-diff-snippet__tag"
                            data-happy-desktop-ui="diff-snippet-tag"
                        >
                            New
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
            {local.source !== undefined ? (
                <CodeBlock
                    className="happy-diff-snippet__source"
                    lineNumbers
                    name={local.source.name}
                    text={local.source.text}
                    {...(local.source.lang === undefined ? {} : { lang: local.source.lang })}
                    {...(local.wrap ? { wrap: true } : {})}
                />
            ) : (
                <ScrollArea
                    axes="horizontal"
                    className="happy-diff-snippet__scroll"
                    data-happy-desktop-ui="diff-snippet-scroll"
                    viewportClassName="happy-diff-snippet__scroll-viewport"
                >
                    <div
                        className="happy-diff-snippet__code"
                        data-happy-desktop-ui="diff-snippet-code"
                    >
                        {lines.map((line, index) => (
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
                                    {line.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}
