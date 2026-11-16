import type { CSSProperties } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { TextField } from "./TextField";

export type HappyAgentProjectCloneDialogProps = {
    /**
     * The GitHub repository to clone, or the folder's path where `folderOffered`.
     * The caller owns this draft so it remains intact while its Happy Agent
     * publishes project changes around the dialog.
     */
    repository: string;
    /**
     * True when the Happy Agent runs on a computer of the reader's own, so the
     * same field also takes a folder already there, such as `~/Projects/app`.
     */
    folderOffered?: boolean;
    /** True when the draft names such a folder: submitting opens it, not a clone. */
    folderNamed?: boolean;
    /** True while the Happy Agent is creating the checkout or opening the folder. */
    submitting?: boolean;
    /** Why the last attempt failed, in the Happy Agent's own words. */
    error?: string;
    /** Why this Happy Agent cannot currently accept a clone request. */
    submitDisabledReason?: string;
    onRepositoryChange: (repository: string) => void;
    onSubmit: () => void;
    onClose: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * C-256 HappyAgentProjectCloneDialog — clone a GitHub project onto one Happy Agent,
 * or open a folder already on that Happy Agent's computer.
 *
 * This is deliberately one field: GitHub's usual `owner/repository` spelling
 * is shortest to type, while a pasted GitHub URL remains equally clear. Where
 * the checkout lands is a decision for the addressed Happy Agent, not another local
 * path form that the reader must understand. A Happy Agent on a computer of the
 * reader's own also takes a folder in the same field, since a path never reads as
 * a repository; the caller says which one the draft names. The caller owns all
 * durable state and request lifecycle, making default, offline, failure, and
 * in-flight states directly renderable without an application dependency.
 */
export function HappyAgentProjectCloneDialog(props: HappyAgentProjectCloneDialogProps) {
    const submitting = props.submitting === true;
    const folderOffered = props.folderOffered === true;
    const folderNamed = folderOffered && props.folderNamed === true;
    const submittable =
        props.repository.trim().length > 0 &&
        !submitting &&
        props.submitDisabledReason === undefined;
    const submitLabel = folderNamed
        ? submitting
            ? "Opening…"
            : "Open folder"
        : submitting
          ? "Cloning…"
          : "Clone project";
    return (
        <ModalOverlay
            onDismiss={() => {
                if (!submitting) props.onClose();
            }}
        >
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={
                    <>
                        <Button disabled={submitting} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={!submittable}
                            onClick={props.onSubmit}
                            title={props.submitDisabledReason}
                            variant="primary"
                        >
                            {submitLabel}
                        </Button>
                    </>
                }
                icon="branch"
                onClose={submitting ? undefined : props.onClose}
                size="medium"
                style={props.style}
                title={folderOffered ? "Add project" : "Clone GitHub project"}
            >
                <div
                    className="happy-agent-project-clone-dialog"
                    data-happy-desktop-ui="happy-agent-project-clone-dialog"
                >
                    {props.submitDisabledReason ? (
                        <Banner tone="neutral" title="Happy Agent unavailable">
                            {props.submitDisabledReason}
                        </Banner>
                    ) : null}
                    {props.error ? (
                        <Banner
                            tone="danger"
                            title={
                                folderOffered ? "Couldn’t add project" : "Couldn’t clone project"
                            }
                        >
                            {props.error}
                        </Banner>
                    ) : null}
                    <TextField
                        autoFocus
                        disabled={submitting}
                        fullWidth
                        label={folderOffered ? "Folder or GitHub repository" : "GitHub repository"}
                        onSubmit={() => {
                            if (submittable) props.onSubmit();
                        }}
                        onValueChange={props.onRepositoryChange}
                        placeholder={
                            folderOffered
                                ? "~/Projects/app or owner/repository"
                                : "owner/repository or https://github.com/owner/repository"
                        }
                        value={props.repository}
                    />
                    <p
                        className="happy-agent-project-clone-dialog__hint"
                        data-happy-desktop-ui="happy-agent-project-clone-dialog-hint"
                    >
                        {folderOffered
                            ? "A folder must already be on this Happy Agent’s computer."
                            : "Clone a repository this HappyAgent can access."}
                    </p>
                </div>
            </Modal>
        </ModalOverlay>
    );
}
