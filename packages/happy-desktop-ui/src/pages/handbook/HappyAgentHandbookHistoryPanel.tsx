import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { MarkdownDiff } from "../../MarkdownDiff";
import { markdownDiffCompute, type MarkdownDiffModel } from "../../markdownDiffModel";
import { PanelHeader } from "../../PanelHeader";
import { ScrollArea } from "../../Scrollbar";
import { Spinner } from "../../Spinner";
import {
    HandbookFaces,
    handbookNames,
    type HappyAgentHandbookComparisonView,
    type HappyAgentHandbookPerson,
} from "./handbookPresentation";

/** One row of an item's history, newest first. */
export type HappyAgentHandbookHistoryRow =
    /** A revision agents were given: a milestone. */
    | {
          readonly kind: "revision";
          readonly key: string;
          readonly revision: number;
          readonly appliedBy: HappyAgentHandbookPerson;
          /** When, as the reader's clock tells it. */
          readonly when: string;
          readonly note?: string;
          /** Whose edits it published. */
          readonly contributors: readonly HappyAgentHandbookPerson[];
          /** The one agents follow now. */
          readonly current: boolean;
      }
    /** A run of edits by one author between applies. */
    | {
          readonly kind: "session";
          readonly key: string;
          /** The person who wrote, or how an agent or conversion is named. */
          readonly author: HappyAgentHandbookPerson;
          /** Its span, as "18:20–18:35". */
          readonly when: string;
          readonly changes: number;
      };

export interface HappyAgentHandbookHistoryPanelProps {
    readonly status: "loading" | "ready";
    readonly error?: string;
    readonly rows: readonly HappyAgentHandbookHistoryRow[];
    /** The text before and after each opened row, by key. */
    readonly expanded: ReadonlyMap<string, HappyAgentHandbookComparisonView>;
    /** Older sessions remain to be read. */
    readonly more: boolean;
    readonly loadingMore: boolean;
    /** The row being written back into the draft. */
    readonly restoring?: string;
    readonly restoreError?: string;
    /** May write an old version into the draft (`handbook.edit`). */
    readonly canEdit: boolean;
    readonly onToggle: (key: string) => void;
    readonly onRestore: (key: string) => void;
    readonly onMore: () => void;
    readonly onClose: () => void;
}

/** Blocks a change added and took away, as the comparison drawn below counts them. */
function changeCounts(diff: MarkdownDiffModel): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const block of diff.blocks) {
        if (block.status === "added") added += 1;
        else if (block.status === "removed") removed += 1;
        else if (block.status === "changed") {
            added += 1;
            removed += 1;
        }
    }
    return { added, removed };
}

/**
 * HappyAgentHandbookHistoryPanel — one item's history beside its editor:
 * each applied revision as a milestone, who applied it and why, and between
 * them every session of edits with its author and time. A row opens to the
 * exact change it made; any row's version can be written back into the
 * draft, which changes nothing for agents until it is applied.
 */
export function HappyAgentHandbookHistoryPanel(props: HappyAgentHandbookHistoryPanelProps) {
    return (
        <aside
            aria-label="History"
            className="happy-handbook-history"
            data-happy-desktop-ui="handbook-history"
            data-testid="happy-handbook-history"
        >
            <PanelHeader className="happy-handbook-history__header" edgeControl>
                <span className="happy-handbook-history__title">History</span>
                <Button
                    aria-label="Close history"
                    icon="close"
                    iconOnly
                    onClick={props.onClose}
                    size="small"
                    variant="ghost"
                />
            </PanelHeader>
            <ScrollArea
                className="happy-handbook-history__scroll"
                viewportClassName="happy-handbook-history__viewport"
            >
                <div className="happy-handbook-history__list">
                    {props.error === undefined ? null : (
                        <Banner tone="danger" title="History may be out of date">
                            {props.error}
                        </Banner>
                    )}
                    {props.restoreError === undefined ? null : (
                        <Banner tone="danger" title="Not restored">
                            {props.restoreError}
                        </Banner>
                    )}
                    {props.status === "loading" ? (
                        <div className="happy-handbook-history__pending">
                            <Spinner size={16} />
                            <span>Reading the history…</span>
                        </div>
                    ) : props.rows.length === 0 ? (
                        <p className="happy-handbook-history__empty">Nothing written yet.</p>
                    ) : (
                        props.rows.map((row) => (
                            <HistoryRow
                                canEdit={props.canEdit}
                                comparison={props.expanded.get(row.key)}
                                key={row.key}
                                onRestore={props.onRestore}
                                onToggle={props.onToggle}
                                restoring={props.restoring}
                                row={row}
                            />
                        ))
                    )}
                    {props.more ? (
                        <Button
                            loading={props.loadingMore}
                            onClick={props.onMore}
                            size="small"
                            variant="ghost"
                        >
                            Show older
                        </Button>
                    ) : null}
                </div>
            </ScrollArea>
        </aside>
    );
}

function HistoryRow(props: {
    readonly row: HappyAgentHandbookHistoryRow;
    readonly comparison: HappyAgentHandbookComparisonView | undefined;
    readonly restoring: string | undefined;
    readonly canEdit: boolean;
    readonly onToggle: (key: string) => void;
    readonly onRestore: (key: string) => void;
}) {
    const row = props.row;
    const open = props.comparison !== undefined;
    const comparison = props.comparison;
    const diff =
        comparison?.kind === "ready"
            ? markdownDiffCompute(comparison.before, comparison.after)
            : undefined;
    const counts = diff === undefined ? undefined : changeCounts(diff);
    return (
        <article
            className="happy-handbook-history__row"
            data-kind={row.kind}
            data-testid="happy-handbook-history-row"
        >
            <div className="happy-handbook-history__line">
                <button
                    aria-expanded={open}
                    className="happy-handbook-history__toggle"
                    onClick={() => props.onToggle(row.key)}
                    type="button"
                >
                    <span aria-hidden className="happy-handbook-history__mark">
                        <Icon name={row.kind === "revision" ? "check-circle" : "edit"} size={14} />
                    </span>
                    <span className="happy-handbook-history__text">
                        <span className="happy-handbook-history__headline">
                            {row.kind === "revision"
                                ? `Revision ${String(row.revision)}${row.current ? " · agents follow this" : ""}`
                                : `${row.author.name} edited`}
                        </span>
                        <span className="happy-handbook-history__detail">
                            {row.kind === "revision"
                                ? `Applied by ${row.appliedBy.name} · ${row.when}`
                                : `${row.when} · ${String(row.changes)} ${row.changes === 1 ? "change" : "changes"}${
                                      counts === undefined
                                          ? ""
                                          : ` · +${String(counts.added)} −${String(counts.removed)} blocks`
                                  }`}
                        </span>
                    </span>
                    <span aria-hidden className="happy-handbook-history__chevron">
                        <Icon name={open ? "chevron-up" : "chevron-down"} size={12} />
                    </span>
                </button>
            </div>
            {row.kind === "revision" && row.note !== undefined ? (
                <p className="happy-handbook-history__note">“{row.note}”</p>
            ) : null}
            {row.kind === "revision" && row.contributors.length > 0 ? (
                <div className="happy-handbook-history__people">
                    <HandbookFaces people={row.contributors} />
                    <span>Edits by {handbookNames(row.contributors)}</span>
                </div>
            ) : null}
            {comparison === undefined ? null : (
                <div className="happy-handbook-history__change">
                    {comparison.kind === "loading" ? (
                        <div className="happy-handbook-history__pending">
                            <Spinner size={16} />
                            <span>Reading the change…</span>
                        </div>
                    ) : comparison.kind === "error" ? (
                        <Banner tone="danger">{comparison.message}</Banner>
                    ) : diff?.identical ? (
                        <p className="happy-handbook-history__empty">The text did not change.</p>
                    ) : (
                        <MarkdownDiff diff={diff!} flow="inline" unchangedContext={1} />
                    )}
                    {props.canEdit ? (
                        <Button
                            disabled={props.restoring !== undefined}
                            icon="repeat"
                            loading={props.restoring === row.key}
                            onClick={() => props.onRestore(row.key)}
                            size="small"
                            variant="secondary"
                        >
                            Restore to draft
                        </Button>
                    ) : null}
                </div>
            )}
        </article>
    );
}
