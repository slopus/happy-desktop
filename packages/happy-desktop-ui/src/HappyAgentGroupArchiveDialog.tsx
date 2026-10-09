import type { CSSProperties } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

/**
 * What a workspace's worktree folder still holds that is not committed.
 * `unknown` means the count is missing or stale: the dialog then says the
 * folder could not be checked rather than implying it is clean.
 */
export type HappyAgentGroupArchiveChanges =
    | { readonly status: "unknown" }
    | { readonly status: "clean" }
    | {
          readonly status: "dirty";
          readonly changedFiles: number;
          readonly addedLines: number;
          readonly deletedLines: number;
      };

/** The project or workspace the reader is being asked to archive. */
export type HappyAgentGroupArchiveSubject =
    | {
          readonly kind: "workspace";
          readonly name: string;
          readonly changes: HappyAgentGroupArchiveChanges;
      }
    | {
          readonly kind: "project";
          readonly name: string;
          /** How many workspaces leave with the project; each loses its worktree folder. */
          readonly worktrees: number;
      };

export type HappyAgentGroupArchiveDialogProps = {
    subject: HappyAgentGroupArchiveSubject;
    /**
     * Whether the reader still wants this confirmation next time. The "Don't
     * ask again" box is its inverse; the caller owns the value and decides
     * what to do with it once the reader confirms.
     */
    askAgain: boolean;
    onAskAgainChange: (askAgain: boolean) => void;
    /** True while the host is archiving; the dialog goes inert and cannot be dismissed. */
    submitting?: boolean;
    /** Why the last attempt did not archive it, in the host's own words. */
    error?: string;
    /** Why archiving cannot be asked for right now, such as the Happy Agent being offline. */
    confirmDisabledReason?: string;
    /** The reader confirmed. Nothing is archived here; the caller performs it. */
    onConfirm: () => void;
    onCancel: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** The one line said about uncommitted work. */
function changesLine(changes: HappyAgentGroupArchiveChanges): string {
    if (changes.status === "clean") return "No uncommitted changes";
    if (changes.status === "unknown") return "Uncommitted changes not checked";
    const files = `${changes.changedFiles} changed ${changes.changedFiles === 1 ? "file" : "files"}`;
    return `${files}, +${changes.addedLines} −${changes.deletedLines} uncommitted`;
}

/** What leaves with a project, said once in the sentence that names it. */
function worktreesPhrase(count: number): string {
    if (count === 0) return "";
    return count === 1
        ? " and archives its workspace, deleting its worktree folder"
        : ` and archives its ${count} workspaces, deleting their worktree folders`;
}

/**
 * C-286 HappyAgentGroupArchiveDialog — the destructive confirmation for
 * archiving a workspace or a project, in the small Modal card. One sentence
 * names what goes and what it costs, a workspace adds one line on the
 * uncommitted work its folder still holds, and a "Don't ask again" box lets
 * the reader opt out of the question for next time. Presentational and fully
 * controlled: the caller owns the archive request, the opt-out, and supplies
 * pending and failure state.
 */
export function HappyAgentGroupArchiveDialog(props: HappyAgentGroupArchiveDialogProps) {
    const submitting = props.submitting === true;
    const subject = props.subject;
    const noun = subject.kind === "workspace" ? "workspace" : "project";
    return (
        <ModalOverlay onDismiss={submitting ? undefined : props.onCancel}>
            <Modal
                className={["happy-agent-group-archive-dialog", props.className]
                    .filter(Boolean)
                    .join(" ")}
                data-testid={props["data-testid"]}
                footer={
                    <>
                        <Button disabled={submitting} onClick={props.onCancel} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            data-testid="happy-agent-group-archive-confirm"
                            disabled={props.confirmDisabledReason !== undefined}
                            icon="archive"
                            loading={submitting}
                            onClick={props.onConfirm}
                            title={props.confirmDisabledReason}
                            variant="danger"
                        >
                            {submitting ? "Archiving…" : "Archive"}
                        </Button>
                    </>
                }
                icon="archive"
                onClose={submitting ? undefined : props.onCancel}
                size="small"
                style={props.style}
                title={`Archive ${noun}`}
                tone="danger"
            >
                <div
                    className="happy-agent-group-archive-dialog__body"
                    data-happy-desktop-ui="happy-agent-group-archive-dialog"
                    data-kind={subject.kind}
                >
                    {props.confirmDisabledReason ? (
                        <Banner tone="neutral" title="Happy Agent unavailable">
                            {props.confirmDisabledReason}
                        </Banner>
                    ) : null}
                    {props.error ? (
                        <Banner
                            data-testid="happy-agent-group-archive-error"
                            tone="danger"
                            title={`Could not archive ${noun}`}
                        >
                            {props.error}
                        </Banner>
                    ) : null}
                    <p
                        className="happy-agent-group-archive-dialog__lead"
                        data-happy-desktop-ui="happy-agent-group-archive-dialog-lead"
                    >
                        Removes{" "}
                        <strong className="happy-agent-group-archive-dialog__name">
                            {subject.name}
                        </strong>{" "}
                        {subject.kind === "workspace"
                            ? "from the sidebar and deletes its worktree folder, including any uncommitted changes."
                            : `from the sidebar${worktreesPhrase(subject.worktrees)}. Its own checkout stays.`}
                    </p>
                    {subject.kind === "workspace" ? (
                        <span
                            className="happy-agent-group-archive-dialog__changes"
                            data-happy-desktop-ui="happy-agent-group-archive-dialog-changes"
                            data-tone={
                                subject.changes.status === "dirty"
                                    ? "danger"
                                    : subject.changes.status === "unknown"
                                      ? "warning"
                                      : "neutral"
                            }
                        >
                            {changesLine(subject.changes)}
                        </span>
                    ) : null}
                    <Checkbox
                        checked={!props.askAgain}
                        className="happy-agent-group-archive-dialog__ask-again"
                        data-testid="happy-agent-group-archive-ask-again"
                        disabled={submitting}
                        label="Don’t ask again"
                        onChange={(checked) => props.onAskAgainChange(!checked)}
                    />
                </div>
            </Modal>
        </ModalOverlay>
    );
}
