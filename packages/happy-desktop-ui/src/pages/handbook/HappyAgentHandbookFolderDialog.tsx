import { Button } from "../../Button";
import { Modal } from "../../Modal";
import { TextField } from "../../TextField";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { HANDBOOK_FOLDER_ICONS, handbookFolderIcon } from "./handbookTree";

export interface HappyAgentHandbookFolderDialogProps {
    /** Making a folder, or renaming one. */
    readonly mode: "create" | "edit";
    /** A category: a top-level folder, which wears an icon. */
    readonly topLevel: boolean;
    /** Where the new folder goes, as "Engineering › Reliability"; absent for a category. */
    readonly parentPath?: string;
    readonly name: string;
    readonly icon: string | null;
    readonly saving: boolean;
    readonly error?: string;
    readonly onNameChange: (value: string) => void;
    readonly onIconChange: (value: string) => void;
    readonly onSubmit: () => void;
    readonly onClose: () => void;
    readonly "data-testid"?: string;
}

/**
 * HappyAgentHandbookFolderDialog — names a new folder or renames one; a
 * category also picks its icon from the house set. Folders are organization:
 * the change takes effect at once, with nothing to apply.
 */
export function HappyAgentHandbookFolderDialog(props: HappyAgentHandbookFolderDialogProps) {
    const icon = handbookFolderIcon(props.icon);
    const title =
        props.mode === "edit"
            ? props.topLevel
                ? "Edit category"
                : "Rename folder"
            : props.topLevel
              ? "New category"
              : "New folder";
    return (
        <Modal
            busy={props.saving}
            data-testid={props["data-testid"]}
            footer={
                <>
                    <Button disabled={props.saving} onClick={props.onClose} variant="secondary">
                        Cancel
                    </Button>
                    <Button
                        data-testid="happy-handbook-folder-save"
                        disabled={props.name.trim().length === 0}
                        loading={props.saving}
                        onClick={props.onSubmit}
                        variant="primary"
                    >
                        {props.mode === "edit" ? "Save" : "Create"}
                    </Button>
                </>
            }
            icon="folder"
            onClose={props.onClose}
            size="medium"
            title={title}
        >
            <div
                className="happy-handbook-folder-dialog"
                data-happy-desktop-ui="handbook-folder-dialog"
            >
                {props.parentPath === undefined ? null : (
                    <p className="happy-handbook-folder-dialog__lead">In {props.parentPath}</p>
                )}
                <TextField
                    autoFocus
                    data-testid="happy-handbook-folder-name"
                    disabled={props.saving}
                    fullWidth
                    label="Name"
                    onSubmit={props.onSubmit}
                    onValueChange={props.onNameChange}
                    placeholder={props.topLevel ? "Engineering" : "Reliability"}
                    value={props.name}
                    {...(props.error === undefined ? {} : { error: props.error })}
                />
                {props.topLevel ? (
                    <fieldset className="happy-handbook-folder-dialog__icons">
                        <legend className="happy-handbook-folder-dialog__legend">Icon</legend>
                        <div className="happy-handbook-icon-grid" role="radiogroup">
                            {HANDBOOK_FOLDER_ICONS.map((name) => (
                                <button
                                    aria-checked={name === icon}
                                    aria-label={name.replace(/-outline$/u, "").replaceAll("-", " ")}
                                    className="happy-handbook-icon-grid__option"
                                    data-happy-desktop-ui="handbook-icon-option"
                                    disabled={props.saving}
                                    key={name}
                                    onClick={() => props.onIconChange(name)}
                                    role="radio"
                                    type="button"
                                >
                                    <Ionicon name={name} size={16} />
                                </button>
                            ))}
                        </div>
                    </fieldset>
                ) : null}
            </div>
        </Modal>
    );
}
