import { useState } from "react";
import type {
    HandbookCategory,
    HandbookChangeRequestInput,
    HandbookDocumentCreateInput,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { CodeEditor } from "../../CodeEditor";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { TextField } from "../../TextField";
import { handbookErrorMessage, type HandbookPeople } from "./handbookPresentation";

/** Runs a dialog's one action, holding the dialog open and saying why if it fails. */
function useSubmit<T>(run: (value: T) => Promise<void>, done: () => void) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string>();
    const submit = (value: T) => {
        if (submitting) return;
        setSubmitting(true);
        setError(undefined);
        void Promise.resolve()
            .then(() => run(value))
            .then(done, (reason: unknown) => {
                setSubmitting(false);
                setError(handbookErrorMessage(reason));
            });
    };
    return { submitting, error, submit };
}

export interface HandbookDocumentCreateDialogProps {
    readonly categories: readonly HandbookCategory[];
    /** Whether the reader may file into protected categories. */
    readonly manage: boolean;
    readonly people: HandbookPeople;
    /** The reader, the maintainer until someone else is picked. */
    readonly viewerId?: string;
    /** Makes it; the owner opens it once made. */
    readonly onSubmit: (input: HandbookDocumentCreateInput) => Promise<void>;
    readonly onClose: () => void;
}

/** A new handbook document: its title, category, and the person who keeps it current. */
export function HandbookDocumentCreateDialog(props: HandbookDocumentCreateDialogProps) {
    const categories = props.categories.filter((category) => props.manage || !category.protected);
    const [title, setTitle] = useState("");
    const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
    const [maintainer, setMaintainer] = useState(props.viewerId ?? props.people[0]?.id ?? "");
    const [attempted, setAttempted] = useState(false);
    const { submitting, error, submit } = useSubmit(props.onSubmit, props.onClose);
    const titleError = attempted && title.trim() === "" ? "Give it a title." : undefined;
    const create = () => {
        setAttempted(true);
        if (title.trim() === "" || categoryId === "") return;
        submit({
            title: title.trim(),
            categoryId,
            ...(maintainer === "" ? {} : { maintainerUserId: maintainer }),
        });
    };
    return (
        <ModalOverlay onDismiss={submitting ? undefined : props.onClose}>
            <Modal
                footer={
                    <>
                        <Button disabled={submitting} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button loading={submitting} onClick={create}>
                            Create document
                        </Button>
                    </>
                }
                icon="book"
                onClose={submitting ? undefined : props.onClose}
                size="medium"
                title="New document"
            >
                <div className="happy-handbook-form" data-happy-desktop-ui="handbook-create">
                    {error ? (
                        <Banner tone="danger" title="Document not created">
                            {error}
                        </Banner>
                    ) : null}
                    <TextField
                        autoFocus
                        fullWidth
                        label="Title"
                        onSubmit={create}
                        onValueChange={setTitle}
                        placeholder="How we review pull requests"
                        value={title}
                        {...(titleError ? { error: titleError } : {})}
                    />
                    <Select
                        fullWidth
                        hint={
                            categories.find((category) => category.id === categoryId)
                                ?.description ?? ""
                        }
                        label="Category"
                        onValueChange={setCategoryId}
                        options={categories.map((category) => ({
                            value: category.id,
                            label: category.name,
                        }))}
                        value={categoryId}
                    />
                    <Select
                        fullWidth
                        hint="Keeps it current and decides on its change requests."
                        label="Maintainer"
                        onValueChange={setMaintainer}
                        options={props.people.map((person) => ({
                            value: person.id,
                            label:
                                person.id === props.viewerId ? `${person.name} (you)` : person.name,
                        }))}
                        value={maintainer}
                    />
                </div>
            </Modal>
        </ModalOverlay>
    );
}

export interface HandbookChangeRequestDialogProps {
    readonly mode: "create" | "edit";
    /** The proposal to start from: the document's text, or the request being edited. */
    readonly initial: HandbookChangeRequestInput;
    readonly onSubmit: (input: HandbookChangeRequestInput) => Promise<void>;
    readonly onClose: () => void;
}

/**
 * A proposed change: a title, why, and the whole document as it should read,
 * in Markdown. The maintainer merges it; conflicting edits made meanwhile are
 * resolved on merge.
 */
export function HandbookChangeRequestDialog(props: HandbookChangeRequestDialogProps) {
    const [title, setTitle] = useState(props.initial.title);
    const [description, setDescription] = useState(props.initial.description);
    const [text, setText] = useState(props.initial.text);
    const [attempted, setAttempted] = useState(false);
    const { submitting, error, submit } = useSubmit(props.onSubmit, props.onClose);
    const titleError = attempted && title.trim() === "" ? "Say what it changes." : undefined;
    const send = () => {
        setAttempted(true);
        if (title.trim() === "") return;
        submit({ title: title.trim(), description, text });
    };
    // Unsent work is never lost to a stray click; Escape still closes it.
    return (
        <ModalOverlay onEscape={submitting ? undefined : props.onClose}>
            <Modal
                footer={
                    <>
                        <Button disabled={submitting} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button loading={submitting} onClick={send}>
                            {props.mode === "create" ? "Propose change" : "Save changes"}
                        </Button>
                    </>
                }
                icon="merge"
                onClose={submitting ? undefined : props.onClose}
                size="large"
                title={props.mode === "create" ? "Propose a change" : "Edit change request"}
            >
                <div
                    className="happy-handbook-form"
                    data-happy-desktop-ui="handbook-change-request-form"
                >
                    {error ? (
                        <Banner
                            tone="danger"
                            title={
                                props.mode === "create"
                                    ? "Change not proposed"
                                    : "Changes not saved"
                            }
                        >
                            {error}
                        </Banner>
                    ) : null}
                    <TextField
                        autoFocus
                        fullWidth
                        label="Title"
                        onValueChange={setTitle}
                        placeholder="Explain the new review rule"
                        value={title}
                        {...(titleError ? { error: titleError } : {})}
                    />
                    <TextField
                        fullWidth
                        label="Description"
                        multiline
                        onValueChange={setDescription}
                        placeholder="Why, in a sentence or two (optional)"
                        rows={2}
                        value={description}
                    />
                    <div className="happy-handbook-form__text">
                        <span className="happy-handbook-form__label">Proposed text</span>
                        <div className="happy-handbook-form__editor">
                            <CodeEditor
                                name="proposal.md"
                                onValueChange={setText}
                                value={text}
                                wrap
                            />
                        </div>
                    </div>
                </div>
            </Modal>
        </ModalOverlay>
    );
}

export interface HandbookConfirmDialogProps {
    readonly title: string;
    readonly body: string;
    readonly confirmLabel: string;
    readonly danger?: boolean;
    readonly onConfirm: () => Promise<void>;
    readonly onClose: () => void;
}

/** One question before something that is not taken back with a click. */
export function HandbookConfirmDialog(props: HandbookConfirmDialogProps) {
    const { submitting, error, submit } = useSubmit(props.onConfirm, props.onClose);
    return (
        <ModalOverlay onDismiss={submitting ? undefined : props.onClose}>
            <Modal
                footer={
                    <>
                        <Button disabled={submitting} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            loading={submitting}
                            onClick={() => submit(undefined)}
                            variant={props.danger ? "danger" : "primary"}
                        >
                            {props.confirmLabel}
                        </Button>
                    </>
                }
                onClose={submitting ? undefined : props.onClose}
                size="small"
                title={props.title}
                {...(props.danger ? { tone: "danger" as const } : {})}
            >
                <div className="happy-handbook-form">
                    {error ? (
                        <Banner tone="danger" title="That didn’t work">
                            {error}
                        </Banner>
                    ) : null}
                    <p className="happy-handbook-form__body">{props.body}</p>
                </div>
            </Modal>
        </ModalOverlay>
    );
}

export interface HandbookRejectDialogProps {
    readonly onReject: (reason: string) => Promise<void>;
    readonly onClose: () => void;
}

/** Declines a change request, with a reason its author reads if one is given. */
export function HandbookRejectDialog(props: HandbookRejectDialogProps) {
    const [reason, setReason] = useState("");
    const { submitting, error, submit } = useSubmit(props.onReject, props.onClose);
    return (
        <ModalOverlay onDismiss={submitting ? undefined : props.onClose}>
            <Modal
                footer={
                    <>
                        <Button disabled={submitting} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            loading={submitting}
                            onClick={() => submit(reason)}
                            variant="danger"
                        >
                            Reject
                        </Button>
                    </>
                }
                onClose={submitting ? undefined : props.onClose}
                size="small"
                title="Reject change request"
                tone="danger"
            >
                <div className="happy-handbook-form">
                    {error ? (
                        <Banner tone="danger" title="Not rejected">
                            {error}
                        </Banner>
                    ) : null}
                    <TextField
                        autoFocus
                        fullWidth
                        label="Reason"
                        multiline
                        onValueChange={setReason}
                        placeholder="Optional; its author sees it"
                        rows={3}
                        value={reason}
                    />
                </div>
            </Modal>
        </ModalOverlay>
    );
}
