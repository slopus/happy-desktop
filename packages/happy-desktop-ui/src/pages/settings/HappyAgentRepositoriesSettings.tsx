import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One of the team's repositories, as the list shows it. */
export interface HappyAgentRepositoryRow {
    readonly id: string;
    readonly name: string;
    /** Host and path, for example `github.com/slopus/rig`. */
    readonly location: string;
    readonly defaultBranch?: string;
    /** What the last access check found. */
    readonly access: "reachable" | "failed" | "unchecked";
}

const ACCESS_TEXT = {
    reachable: "Reachable",
    failed: "Access failed",
    unchecked: "Not checked",
} as const;

/** What the last access check found, already worded where it is text. */
export type HappyAgentRepositoryCheck =
    | { readonly state: "unchecked" }
    | { readonly state: "checking" }
    | {
          readonly state: "ok";
          /** For example "Default branch main · 12 branches · checked just now". */
          readonly summary: string;
      }
    /** An SSH repository: the credential applies, and the first checkout proves the rest. */
    | { readonly state: "partial"; readonly summary: string }
    | { readonly state: "failed"; readonly title: string; readonly message: string };

/** A shared git credential a repository may be pinned to. */
export interface HappyAgentRepositoryCredentialOption {
    readonly id: string;
    /** Its label and what it covers, for example "slopus deploy token · github.com/slopus". */
    readonly label: string;
}

/** Chooses among the acting person's own and the shared credentials each time. */
export const HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC = "automatic";

export interface HappyAgentRepositoriesSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    readonly repositories: readonly HappyAgentRepositoryRow[];
    /** Whether the reader may add, change and remove repositories. */
    readonly manage: boolean;
    onAdd: () => void;
    onOpen: (repositoryId: string) => void;
}

/**
 * Settings › Repositories on a Happy Cloud server: the team's code sources.
 * A task's agent attaches one itself and checks it out in its own sandbox.
 */
export function HappyAgentRepositoriesSettings(props: HappyAgentRepositoriesSettingsProps) {
    if (props.error)
        return (
            <Banner tone="danger" title="Repositories unavailable">
                {props.error}
            </Banner>
        );
    if (props.loading)
        return (
            <Box className="happy-agent-settings__pending">
                <Spinner size={16} />
                <span>Reading the repositories…</span>
            </Box>
        );
    if (props.repositories.length === 0)
        return (
            <Box className="happy-agent-repositories__empty">
                <EmptyState
                    description={
                        props.manage
                            ? "Add a repository so agents can work on its code."
                            : "Nobody has added a repository yet, and your role can't add one."
                    }
                    icon="repository"
                    title="No repositories yet"
                    {...(props.manage
                        ? {
                              action: {
                                  label: "Add repository",
                                  icon: "plus",
                                  onClick: props.onAdd,
                              },
                          }
                        : {})}
                />
            </Box>
        );
    return (
        <HappyAgentSettingsSection
            description={
                props.manage
                    ? "The code your team works on. An agent working on one checks it out in its own sandbox."
                    : "The code your team works on. Your role can see them but not change them."
            }
            title="Repositories"
        >
            <Box
                className="happy-agent-repositories__list"
                data-happy-desktop-ui="happy-agent-repositories-list"
            >
                {props.repositories.map((repository) => (
                    <button
                        className="happy-agent-repositories__row"
                        data-happy-desktop-ui="happy-agent-repository"
                        key={repository.id}
                        onClick={() => props.onOpen(repository.id)}
                        type="button"
                    >
                        <span className="happy-agent-repositories__icon">
                            <Icon name="repository" size={16} />
                        </span>
                        <span className="happy-agent-repositories__text">
                            <span className="happy-agent-repositories__name">
                                {repository.name}
                            </span>
                            <span className="happy-agent-repositories__meta">
                                {repository.defaultBranch
                                    ? `${repository.location} · ${repository.defaultBranch}`
                                    : repository.location}
                            </span>
                        </span>
                        <span
                            className="happy-agent-repositories__access"
                            data-access={repository.access}
                        >
                            {ACCESS_TEXT[repository.access]}
                        </span>
                        <Icon name="chevron-right" size={14} />
                    </button>
                ))}
            </Box>
            {props.manage ? (
                <Box className="happy-agent-repositories__actions">
                    <Button icon="plus" onClick={props.onAdd} size="small" variant="secondary">
                        Add repository
                    </Button>
                </Box>
            ) : null}
        </HappyAgentSettingsSection>
    );
}

function HappyAgentRepositoryCheckView(props: { readonly check: HappyAgentRepositoryCheck }) {
    const check = props.check;
    if (check.state === "failed")
        return (
            <Banner tone="danger" title={check.title}>
                {check.message}
            </Banner>
        );
    if (check.state === "unchecked") return null;
    return (
        <Box
            className="happy-agent-repositories__check"
            data-happy-desktop-ui="happy-agent-repository-check"
            data-state={check.state}
        >
            {check.state === "checking" ? (
                <Spinner size={14} />
            ) : (
                <Icon name={check.state === "ok" ? "check-circle" : "alert"} size={14} />
            )}
            <span>{check.state === "checking" ? "Checking access…" : check.summary}</span>
        </Box>
    );
}

function credentialOptions(credentials: readonly HappyAgentRepositoryCredentialOption[]) {
    return [
        {
            value: HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC,
            label: "Each person's own credential",
        },
        ...credentials.map((credential) => ({ value: credential.id, label: credential.label })),
    ];
}

const CREDENTIAL_HINT =
    "Each person reaches the repository with their own git credential for its host, or a shared one. Pin a shared credential to make everyone use it.";

export interface HappyAgentRepositoryAddDialogProps {
    readonly url: string;
    readonly name: string;
    /** The pinned shared credential, or `HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC`. */
    readonly credentialId: string;
    readonly credentials: readonly HappyAgentRepositoryCredentialOption[];
    readonly check: HappyAgentRepositoryCheck;
    readonly submitting: boolean;
    /** Why the server refused to add it. */
    readonly error?: string;
    onUrlChange: (url: string) => void;
    onNameChange: (name: string) => void;
    onCredentialChange: (credentialId: string) => void;
    onCheck: () => void;
    onSubmit: () => void;
    onClose: () => void;
}

/** Adds a repository: its URL, how to reach it, a check that it can, and its name. */
export function HappyAgentRepositoryAddDialog(props: HappyAgentRepositoryAddDialogProps) {
    const busy = props.submitting || props.check.state === "checking";
    const ready = props.url.trim().length > 0 && !busy;
    return (
        <ModalOverlay
            onDismiss={() => {
                if (!props.submitting) props.onClose();
            }}
        >
            <Modal
                footer={
                    <>
                        <Button disabled={props.submitting} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={!ready}
                            loading={props.submitting}
                            onClick={props.onSubmit}
                        >
                            Add repository
                        </Button>
                    </>
                }
                icon="repository"
                onClose={props.submitting ? undefined : props.onClose}
                size="medium"
                title="Add a repository"
            >
                <Box
                    className="happy-agent-repositories__form"
                    data-happy-desktop-ui="happy-agent-repository-add"
                >
                    {props.error ? (
                        <Banner tone="danger" title="Not added">
                            {props.error}
                        </Banner>
                    ) : null}
                    <TextField
                        autoFocus
                        disabled={props.submitting}
                        fullWidth
                        hint="An HTTPS or SSH address, for example https://github.com/acme/web.git"
                        label="URL"
                        onValueChange={props.onUrlChange}
                        placeholder="https://github.com/acme/web.git"
                        value={props.url}
                    />
                    <Select
                        disabled={props.submitting}
                        fullWidth
                        hint={
                            props.credentials.length === 0
                                ? "This server has no shared git credentials, so each person uses their own."
                                : CREDENTIAL_HINT
                        }
                        label="Credential"
                        onValueChange={props.onCredentialChange}
                        options={credentialOptions(props.credentials)}
                        value={props.credentialId}
                    />
                    <Box className="happy-agent-repositories__check-row">
                        <Button
                            disabled={!ready}
                            loading={props.check.state === "checking"}
                            onClick={props.onCheck}
                            size="small"
                            variant="secondary"
                        >
                            Check access
                        </Button>
                        {props.check.state === "checking" ||
                        props.check.state === "failed" ? null : (
                            <HappyAgentRepositoryCheckView check={props.check} />
                        )}
                    </Box>
                    {props.check.state === "failed" ? (
                        <HappyAgentRepositoryCheckView check={props.check} />
                    ) : null}
                    <TextField
                        disabled={props.submitting}
                        fullWidth
                        hint="How people and agents refer to it. You can change it later."
                        label="Name"
                        onValueChange={props.onNameChange}
                        placeholder="web"
                        value={props.name}
                    />
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

export interface HappyAgentRepositoryDialogProps {
    readonly name: string;
    readonly url: string;
    readonly defaultBranch?: string;
    /** The branches the last read found, for choosing the default. */
    readonly branches: readonly string[];
    /** The pinned shared credential, or `HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC`. */
    readonly credentialId: string;
    readonly credentials: readonly HappyAgentRepositoryCredentialOption[];
    readonly check: HappyAgentRepositoryCheck;
    /** Whether the reader may change and remove it. */
    readonly manage: boolean;
    /** Whether the reader may check access; viewers may not. */
    readonly checkAllowed: boolean;
    readonly saving: boolean;
    /** Why the last change was refused. */
    readonly error?: string;
    onNameSave: (name: string) => void;
    onDefaultBranchChange: (branch: string) => void;
    onCredentialChange: (credentialId: string) => void;
    onCheck: () => void;
    /** Deletes it; rejects with the reason to show. */
    onDelete: () => Promise<void>;
    onClose: () => void;
}

/** One repository: where it is, how it is reached, checking access, and changing or deleting it. */
export function HappyAgentRepositoryDialog(props: HappyAgentRepositoryDialogProps) {
    const [name, setName] = useState(props.name);
    const [deleting, setDeleting] = useState(false);
    if (deleting)
        return (
            <HappyAgentRepositoryDeleteDialog
                name={props.name}
                onClose={() => setDeleting(false)}
                onDelete={props.onDelete}
            />
        );
    const credentialLabel =
        props.credentialId === HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC
            ? "Each person's own credential"
            : (props.credentials.find((credential) => credential.id === props.credentialId)
                  ?.label ?? "A shared credential");
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                footer={
                    <Button onClick={props.onClose} variant="ghost">
                        Done
                    </Button>
                }
                icon="repository"
                onClose={props.onClose}
                size="large"
                title={props.name}
            >
                <Box
                    className="happy-agent-repositories__form"
                    data-happy-desktop-ui="happy-agent-repository-detail"
                >
                    {props.error ? (
                        <Banner tone="danger" title="Nothing changed">
                            {props.error}
                        </Banner>
                    ) : null}
                    <Box className="happy-agent-repositories__url">
                        <code>{props.url}</code>
                        <CopyButton label="Copy URL" text={props.url} />
                    </Box>
                    {props.manage ? (
                        <>
                            <Box className="happy-agent-repositories__inline">
                                <TextField
                                    disabled={props.saving}
                                    fullWidth
                                    label="Name"
                                    onSubmit={() => props.onNameSave(name)}
                                    onValueChange={setName}
                                    value={name}
                                />
                                <Button
                                    disabled={props.saving || name.trim() === props.name}
                                    onClick={() => props.onNameSave(name)}
                                    variant="secondary"
                                >
                                    Rename
                                </Button>
                            </Box>
                            <Select
                                disabled={props.saving || props.branches.length === 0}
                                fullWidth
                                label="Default branch"
                                onValueChange={props.onDefaultBranchChange}
                                options={props.branches.map((branch) => ({
                                    value: branch,
                                    label: branch,
                                }))}
                                {...(props.defaultBranch
                                    ? { value: props.defaultBranch }
                                    : { placeholder: "Check access to read the branches" })}
                            />
                            <Select
                                disabled={props.saving}
                                fullWidth
                                label="Credential"
                                onValueChange={props.onCredentialChange}
                                options={credentialOptions(props.credentials)}
                                value={props.credentialId}
                            />
                        </>
                    ) : (
                        <Box className="happy-agent-repositories__facts">
                            <span>Default branch</span>
                            <span>{props.defaultBranch ?? "Not known yet"}</span>
                            <span>Credential</span>
                            <span>{credentialLabel}</span>
                        </Box>
                    )}
                    {props.checkAllowed ? (
                        <Box className="happy-agent-repositories__check-row">
                            <Button
                                loading={props.check.state === "checking"}
                                onClick={props.onCheck}
                                size="small"
                                variant="secondary"
                            >
                                Check access
                            </Button>
                            {props.check.state === "checking" ||
                            props.check.state === "failed" ? null : (
                                <HappyAgentRepositoryCheckView check={props.check} />
                            )}
                        </Box>
                    ) : null}
                    {props.check.state === "failed" ? (
                        <HappyAgentRepositoryCheckView check={props.check} />
                    ) : null}
                    {props.manage ? (
                        <Box className="happy-agent-repositories__danger">
                            <Box className="happy-agent-repositories__text">
                                <span className="happy-agent-repositories__name">
                                    Delete this repository
                                </span>
                                <span className="happy-agent-repositories__meta">
                                    Tasks working in it keep their checkouts.
                                </span>
                            </Box>
                            <Button
                                disabled={props.saving}
                                onClick={() => setDeleting(true)}
                                size="small"
                                variant="danger"
                            >
                                Delete…
                            </Button>
                        </Box>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

export interface HappyAgentRepositoryDeleteDialogProps {
    readonly name: string;
    onClose: () => void;
    /** Deletes it; rejects with the reason to show. */
    onDelete: () => Promise<void>;
}

/** Confirms deleting a repository, and says what happens to the tasks in it. */
export function HappyAgentRepositoryDeleteDialog(props: HappyAgentRepositoryDeleteDialogProps) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const submit = (): void => {
        if (busy) return;
        setBusy(true);
        setError(undefined);
        void props.onDelete().then(
            () => props.onClose(),
            (reason: unknown) => {
                setBusy(false);
                setError(reason instanceof Error ? reason.message : String(reason));
            },
        );
    };
    return (
        <ModalOverlay
            onDismiss={() => {
                if (!busy) props.onClose();
            }}
        >
            <Modal
                footer={
                    <>
                        <Button disabled={busy} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button loading={busy} onClick={submit} variant="danger">
                            Delete repository
                        </Button>
                    </>
                }
                onClose={busy ? undefined : props.onClose}
                size="small"
                title={`Delete ${props.name}?`}
                tone="danger"
            >
                <Box className="happy-agent-repositories__confirm">
                    <p>
                        It leaves the team’s repositories, and no agent can attach it any more.
                        Tasks already working in it keep their checkouts. The repository itself is
                        not touched.
                    </p>
                    {error ? (
                        <Banner tone="danger" title="Not deleted">
                            {error}
                        </Banner>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
