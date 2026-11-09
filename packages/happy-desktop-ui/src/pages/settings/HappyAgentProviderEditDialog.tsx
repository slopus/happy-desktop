import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { TextField } from "../../TextField";

/** One credential as the edit dialog shows it. Never the secret. */
export interface HappyAgentProviderEditCredential {
    readonly id: string;
    readonly label: string;
    /** What it is, already worded, such as "OpenAI · API key". */
    readonly meta: string;
    /** Whether a new key can be typed to replace it; a sign-in can't. */
    readonly replaceable: boolean;
}

/** What changed: a new name, and per credential a new label or key. */
export interface HappyAgentProviderEditChanges {
    readonly name?: string;
    readonly credentials?: readonly {
        readonly id: string;
        readonly label?: string;
        readonly secret?: string;
    }[];
}

export interface HappyAgentProviderEditDialogProps {
    readonly name: string;
    readonly credentials: readonly HappyAgentProviderEditCredential[];
    /** True while the changes are out. */
    readonly saving: boolean;
    readonly error?: { readonly title: string; readonly message: string };
    onSave: (changes: HappyAgentProviderEditChanges) => void;
    onClose: () => void;
}

interface Draft {
    readonly name: string;
    readonly labels: Readonly<Record<string, string>>;
    readonly secrets: Readonly<Record<string, string>>;
    /** Why the form can't be sent, shown once the person tries. */
    readonly invalid?: string;
}

/**
 * Edits one of the team's AI provider connections: its name, what each key is
 * called, and a key typed again to replace it. A replacement is checked and
 * added before the old key is removed, so the connection is never left without one.
 */
export function HappyAgentProviderEditDialog(props: HappyAgentProviderEditDialogProps) {
    const [draft, setDraft] = useState<Draft>(() => ({
        name: props.name,
        labels: Object.fromEntries(props.credentials.map((entry) => [entry.id, entry.label])),
        secrets: {},
    }));
    const close = (): void => {
        if (!props.saving) props.onClose();
    };
    const update = (change: Partial<Draft>): void => {
        const { invalid: _cleared, ...rest } = draft;
        setDraft({ ...rest, ...change });
    };
    const submit = (): void => {
        if (props.saving) return;
        const name = draft.name.trim();
        if (!name) {
            setDraft({ ...draft, invalid: "Give the provider a name." });
            return;
        }
        const credentials = props.credentials.flatMap((credential) => {
            const label = (draft.labels[credential.id] ?? "").trim();
            const secret = credential.replaceable
                ? (draft.secrets[credential.id] ?? "").trim()
                : "";
            if (label === credential.label && secret === "") return [];
            return [
                {
                    id: credential.id,
                    ...(label === "" || label === credential.label ? {} : { label }),
                    ...(secret === "" ? {} : { secret }),
                },
            ];
        });
        props.onSave({
            ...(name === props.name ? {} : { name }),
            ...(credentials.length === 0 ? {} : { credentials }),
        });
    };
    const message = draft.invalid ?? props.error?.message;
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                footer={
                    <>
                        <Button disabled={props.saving} onClick={close} variant="ghost">
                            Cancel
                        </Button>
                        <Button loading={props.saving} onClick={submit}>
                            Save
                        </Button>
                    </>
                }
                icon="spark"
                onClose={props.saving ? undefined : close}
                size="medium"
                title={`Edit ${props.name}`}
            >
                <Box
                    className="happy-agent-custom-provider__form"
                    data-happy-desktop-ui="happy-agent-provider-edit"
                >
                    {message ? (
                        <Banner tone="danger" title={props.error?.title ?? "Not saved"}>
                            {message}
                        </Banner>
                    ) : null}
                    <TextField
                        autoFocus
                        disabled={props.saving}
                        fullWidth
                        label="Name"
                        onSubmit={submit}
                        onValueChange={(name) => update({ name })}
                        value={draft.name}
                    />
                    {props.credentials.map((credential) => (
                        <Box
                            className="happy-agent-provider-edit__credential"
                            data-happy-desktop-ui="happy-agent-provider-edit-credential"
                            key={credential.id}
                        >
                            <span className="happy-agent-provider-edit__credential-title">
                                {credential.meta}
                            </span>
                            <Box className="happy-agent-custom-provider__pair">
                                <TextField
                                    disabled={props.saving}
                                    fullWidth
                                    label="Label"
                                    onSubmit={submit}
                                    onValueChange={(label) =>
                                        update({
                                            labels: { ...draft.labels, [credential.id]: label },
                                        })
                                    }
                                    placeholder={credential.label}
                                    value={draft.labels[credential.id] ?? ""}
                                />
                                {credential.replaceable ? (
                                    <TextField
                                        autoComplete="off"
                                        disabled={props.saving}
                                        fullWidth
                                        hint="Leave empty to keep the current key."
                                        label="New key"
                                        onSubmit={submit}
                                        onValueChange={(secret) =>
                                            update({
                                                secrets: {
                                                    ...draft.secrets,
                                                    [credential.id]: secret,
                                                },
                                            })
                                        }
                                        type="password"
                                        value={draft.secrets[credential.id] ?? ""}
                                    />
                                ) : null}
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
