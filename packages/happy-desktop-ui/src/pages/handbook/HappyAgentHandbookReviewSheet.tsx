import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { MarkdownDiff } from "../../MarkdownDiff";
import { markdownDiffCompute } from "../../markdownDiffModel";
import { Modal } from "../../Modal";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import {
    HandbookFaces,
    handbookNames,
    type HappyAgentHandbookComparisonView,
    type HappyAgentHandbookPerson,
} from "./handbookPresentation";

/** One metadata field the apply publishes with a new value, in words. */
export interface HappyAgentHandbookMetadataChangeView {
    readonly label: string;
    readonly from: string;
    readonly to: string;
}

/** One item in the review, as it stood when the review opened. */
export interface HappyAgentHandbookReviewEntry {
    readonly id: string;
    readonly title: string;
    /** The revision agents follow now; `null` for an item never applied. */
    readonly revision: number | null;
    /** Whose edits this apply publishes. */
    readonly contributors: readonly HappyAgentHandbookPerson[];
    readonly metadata:
        | { readonly kind: "loading" }
        | {
              readonly kind: "ready";
              readonly changes: readonly HappyAgentHandbookMetadataChangeView[];
          }
        | { readonly kind: "error"; readonly message: string };
    /** The applied text, and the draft as the review opened on it. */
    readonly comparison: HappyAgentHandbookComparisonView;
    /** People still writing in the draft. */
    readonly editing: readonly HappyAgentHandbookPerson[];
    /** The draft has moved on since the review opened. */
    readonly changedSinceOpened: boolean;
}

export interface HappyAgentHandbookReviewSheetProps {
    readonly entries: readonly HappyAgentHandbookReviewEntry[];
    readonly note: string;
    readonly applying: boolean;
    /** Why the apply was refused, or did not reach the server. */
    readonly error?: string;
    readonly onNoteChange: (value: string) => void;
    readonly onApply: () => void;
    readonly onClose: () => void;
    readonly "data-testid"?: string;
}

/** "Kirill is still editing", "Kirill and Steve are still editing". */
function editingText(entry: HappyAgentHandbookReviewEntry): string | undefined {
    if (entry.editing.length > 0)
        return `${handbookNames(entry.editing)} ${entry.editing.length === 1 ? "is" : "are"} still editing “${entry.title}”; changes after you opened this stay unapplied.`;
    if (entry.changedSinceOpened)
        return `“${entry.title}” changed after you opened this; those changes stay unapplied.`;
    return undefined;
}

/**
 * HappyAgentHandbookReviewSheet — what an apply would give every agent: for
 * each item, the change from the text agents follow now to the draft as it
 * stood when the sheet opened, the metadata that changes with it, and whose
 * edits it publishes; then an optional note and Apply.
 *
 * The sheet holds still on what was reviewed. Someone who keeps typing does
 * not change what is applied; the sheet says who is still writing and that
 * their later changes stay unapplied.
 */
export function HappyAgentHandbookReviewSheet(props: HappyAgentHandbookReviewSheetProps) {
    const warnings = props.entries.flatMap((entry) => {
        const text = editingText(entry);
        return text === undefined ? [] : [{ id: entry.id, text }];
    });
    const single = props.entries.length === 1 ? props.entries[0] : undefined;
    return (
        <Modal
            busy={props.applying}
            data-testid={props["data-testid"]}
            footer={
                <Button
                    data-testid="happy-handbook-review-apply"
                    disabled={props.entries.some((entry) => entry.comparison.kind === "loading")}
                    loading={props.applying}
                    onClick={props.onApply}
                    variant="primary"
                >
                    Apply
                </Button>
            }
            frame="anchored"
            icon="check-circle"
            onClose={props.onClose}
            size="large"
            title={
                single === undefined
                    ? `Apply ${String(props.entries.length)} items`
                    : `Apply “${single.title}”`
            }
        >
            <div className="happy-handbook-review" data-happy-desktop-ui="handbook-review">
                <p className="happy-handbook-review__lead">
                    Agents follow the applied handbook. Applying gives every agent on the team what
                    you see here, from their next message.
                </p>
                {warnings.map((warning) => (
                    <Banner key={warning.id} tone="warning">
                        {warning.text}
                    </Banner>
                ))}
                {props.entries.map((entry) => (
                    <ReviewItem entry={entry} key={entry.id} />
                ))}
                <TextField
                    data-testid="happy-handbook-review-note"
                    fullWidth
                    disabled={props.applying}
                    label="Note"
                    multiline
                    onValueChange={props.onNoteChange}
                    placeholder="Why this changed, for the history and the agents' notice"
                    rows={2}
                    value={props.note}
                />
                {props.error === undefined ? null : (
                    <Banner tone="danger" title="Not applied">
                        {props.error}
                    </Banner>
                )}
            </div>
        </Modal>
    );
}

function ReviewItem(props: { readonly entry: HappyAgentHandbookReviewEntry }) {
    const entry = props.entry;
    const comparison = entry.comparison;
    return (
        <section className="happy-handbook-review__item" data-testid="happy-handbook-review-item">
            <header className="happy-handbook-review__item-header">
                <span className="happy-handbook-review__item-title">{entry.title}</span>
                <span className="happy-handbook-review__item-revision">
                    {entry.revision === null
                        ? "New"
                        : `Revision ${String(entry.revision)} → ${String(entry.revision + 1)}`}
                </span>
                <span className="happy-handbook-review__item-people">
                    {entry.contributors.length === 0
                        ? null
                        : `Edits by ${handbookNames(entry.contributors)}`}
                    <HandbookFaces people={entry.contributors} />
                </span>
            </header>
            {entry.metadata.kind === "ready" && entry.metadata.changes.length > 0 ? (
                <ul className="happy-handbook-review__metadata">
                    {entry.metadata.changes.map((change) => (
                        <li key={change.label}>
                            <span className="happy-handbook-review__metadata-label">
                                {change.label}
                            </span>
                            <del>{change.from.length === 0 ? "None" : change.from}</del>
                            <span aria-hidden>→</span>
                            <ins>{change.to.length === 0 ? "None" : change.to}</ins>
                        </li>
                    ))}
                </ul>
            ) : entry.metadata.kind === "error" ? (
                <Banner tone="danger">{entry.metadata.message}</Banner>
            ) : null}
            <div className="happy-handbook-review__diff">
                {comparison.kind === "loading" ? (
                    <div className="happy-handbook-review__pending">
                        <Spinner size={16} />
                        <span>Reading the change…</span>
                    </div>
                ) : comparison.kind === "error" ? (
                    <Banner tone="danger" title="The change couldn’t be read">
                        {comparison.message}
                    </Banner>
                ) : comparison.before === comparison.after ? (
                    <p className="happy-handbook-review__same">The text is unchanged.</p>
                ) : (
                    <MarkdownDiff
                        diff={markdownDiffCompute(comparison.before, comparison.after)}
                        flow="inline"
                        unchangedContext={1}
                    />
                )}
            </div>
        </section>
    );
}
