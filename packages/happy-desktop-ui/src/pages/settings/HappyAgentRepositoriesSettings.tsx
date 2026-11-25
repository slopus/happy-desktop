import { useState } from "react";
import type { HappyAgentPluginImage } from "happy-desktop-state";
import { Avatar } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { IconTile } from "../../IconTile";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { PluginMark } from "../plugins/pluginPresentation";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One of the team's repositories, as the list shows it. */
export interface HappyAgentRepositoryRow {
    readonly id: string;
    readonly name: string;
    /** Host and path, for example `github.com/slopus/rig`. */
    readonly location: string;
    readonly defaultBranch?: string;
    /** Its picture, such as its GitHub owner's; the generic repository tile without one. */
    readonly imageUrl?: string;
    /** What the last access check found. */
    readonly access: "reachable" | "failed" | "unchecked";
    /** The plugin that manages it, marked on the row. */
    readonly plugin?: Pick<HappyAgentRepositoryPlugin, "name" | "image" | "status">;
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

/** A team git credential from Settings › Secrets a repository may be pinned to. */
export interface HappyAgentRepositoryCredentialOption {
    readonly id: string;
    /** Its name and server, for example "Acme deploy token · github.com". */
    readonly label: string;
}

/** The plugin that added a repository and signs in for it. Its credential is never shown. */
export interface HappyAgentRepositoryPlugin {
    /** The plugin's name, for example "GitHub". */
    readonly name: string;
    readonly image: HappyAgentPluginImage | null;
    /** How it signs in and as whom, for example "GitHub App · acme". */
    readonly detail?: string;
    /**
     * `suspended` while the service suspended the plugin's installation, and
     * `missing` once its credential is gone: the plugin was removed or
     * disconnected. Git access fails in both.
     */
    readonly status: "active" | "suspended" | "missing";
    /** The account it signs in as, named when the installation is suspended. */
    readonly account?: string;
    /** Opens the plugin, where it is connected again. */
    onOpen?: () => void;
}

/** Reaches the repository without a credential, as a public one is. */
export const HAPPY_AGENT_REPOSITORY_CREDENTIAL_NONE = "none";

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
                        <HappyAgentRepositoryMark
                            {...(repository.imageUrl ? { imageUrl: repository.imageUrl } : {})}
                        />
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
                        {repository.plugin ? (
                            <span
                                className="happy-agent-repositories__plugin-tag"
                                data-happy-desktop-ui="happy-agent-repository-plugin-tag"
                            >
                                <PluginMark image={repository.plugin.image} size="badge" />
                                {repository.plugin.name}
                            </span>
                        ) : null}
                        {/* A plugin whose credential is gone fails every access, whatever the last check found. */}
                        <span
                            className="happy-agent-repositories__access"
                            data-access={
                                repository.plugin && repository.plugin.status !== "active"
                                    ? "warning"
                                    : repository.access
                            }
                        >
                            {repository.plugin?.status === "missing"
                                ? "Credential missing"
                                : repository.plugin?.status === "suspended"
                                  ? "Suspended"
                                  : ACCESS_TEXT[repository.access]}
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

/**
 * A repository's mark at the head of its row and its dialog: its picture in
 * the 28px tile the generic repository glyph otherwise fills, so a row with a
 * picture and one without line up.
 */
function HappyAgentRepositoryMark(props: { readonly imageUrl?: string }) {
    return props.imageUrl ? (
        <Avatar imageUrl={props.imageUrl} initials="" size="sm" type="agent" />
    ) : (
        <IconTile icon="repository" tone="gray" />
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

/** Picks the team git credential a repository is reached with, or none. */
function HappyAgentRepositoryCredentialPicker(props: {
    /** An SSH address is refused without a pinned SSH git credential. */
    readonly ssh: boolean;
    readonly credentialId: string;
    readonly credentials: readonly HappyAgentRepositoryCredentialOption[];
    readonly disabled: boolean;
    onCredentialChange: (credentialId: string) => void;
    onSecretsOpen?: () => void;
}) {
    const empty = props.credentials.length === 0;
    return (
        <Box className="happy-agent-repositories__credential">
            <Select
                disabled={props.disabled}
                fullWidth
                hint={
                    props.ssh
                        ? empty
                            ? "An SSH address needs a team SSH git credential, and none in Settings › Secrets covers this URL."
                            : "An SSH address needs a team SSH git credential from Settings › Secrets."
                        : empty
                          ? "No git credential in Settings › Secrets covers this URL. Public repositories work without one."
                          : "Public repositories work without one. Pin a git credential from Settings › Secrets to reach a private one."
                }
                label="Credential"
                onValueChange={props.onCredentialChange}
                options={[
                    { value: HAPPY_AGENT_REPOSITORY_CREDENTIAL_NONE, label: "No credential" },
                    ...props.credentials.map((credential) => ({
                        value: credential.id,
                        label: credential.label,
                    })),
                ]}
                value={props.credentialId}
            />
            {empty && props.onSecretsOpen ? (
                <Box className="happy-agent-repositories__credential-action">
                    <Button
                        disabled={props.disabled}
                        icon="lock"
                        onClick={props.onSecretsOpen}
                        size="small"
                        variant="secondary"
                    >
                        Add a git credential
                    </Button>
                </Box>
            ) : null}
        </Box>
    );
}

export interface HappyAgentRepositoryAddDialogProps {
    readonly url: string;
    readonly name: string;
    /** The pinned team git credential, or `HAPPY_AGENT_REPOSITORY_CREDENTIAL_NONE`. */
    readonly credentialId: string;
    /** Whether the URL is an SSH address, which needs a pinned credential. */
    readonly ssh: boolean;
    readonly credentials: readonly HappyAgentRepositoryCredentialOption[];
    /** Opens Settings › Secrets, offered when no git credential covers the URL. */
    onSecretsOpen?: () => void;
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
                    <HappyAgentRepositoryCredentialPicker
                        ssh={props.ssh}
                        credentialId={props.credentialId}
                        credentials={props.credentials}
                        disabled={props.submitting}
                        onCredentialChange={props.onCredentialChange}
                        {...(props.onSecretsOpen ? { onSecretsOpen: props.onSecretsOpen } : {})}
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
    /** Its picture, leading the title in place of the generic repository glyph. */
    readonly imageUrl?: string;
    readonly url: string;
    readonly defaultBranch?: string;
    /** The branches the last read found, for choosing the default. */
    readonly branches: readonly string[];
    /** The pinned team git credential, or `HAPPY_AGENT_REPOSITORY_CREDENTIAL_NONE`. */
    readonly credentialId: string;
    /** Whether the URL is an SSH address, which needs a pinned credential. */
    readonly ssh: boolean;
    readonly credentials: readonly HappyAgentRepositoryCredentialOption[];
    /** Opens Settings › Secrets, offered when no git credential covers the URL. */
    onSecretsOpen?: () => void;
    /** The plugin that manages it; replaces the credential picker, which then offers nothing. */
    readonly plugin?: HappyAgentRepositoryPlugin;
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
        props.credentialId === HAPPY_AGENT_REPOSITORY_CREDENTIAL_NONE
            ? "No credential"
            : (props.credentials.find((credential) => credential.id === props.credentialId)
                  ?.label ?? "A team git credential");
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                footer={
                    <Button onClick={props.onClose} variant="ghost">
                        Done
                    </Button>
                }
                icon="repository"
                {...(props.imageUrl
                    ? { leading: <HappyAgentRepositoryMark imageUrl={props.imageUrl} /> }
                    : {})}
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
                            {props.plugin ? null : (
                                <HappyAgentRepositoryCredentialPicker
                                    ssh={props.ssh}
                                    credentialId={props.credentialId}
                                    credentials={props.credentials}
                                    disabled={props.saving}
                                    onCredentialChange={props.onCredentialChange}
                                    {...(props.onSecretsOpen
                                        ? { onSecretsOpen: props.onSecretsOpen }
                                        : {})}
                                />
                            )}
                        </>
                    ) : (
                        <Box className="happy-agent-repositories__facts">
                            <span>Default branch</span>
                            <span>{props.defaultBranch ?? "Not known yet"}</span>
                            {props.plugin ? null : (
                                <>
                                    <span>Credential</span>
                                    <span>{credentialLabel}</span>
                                </>
                            )}
                        </Box>
                    )}
                    {props.plugin ? <HappyAgentRepositoryPluginView plugin={props.plugin} /> : null}
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
                    {/* The plugin's warning already says why access fails. */}
                    {props.check.state === "failed" &&
                    (props.plugin?.status ?? "active") === "active" ? (
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

/** Who signs in for a plugin's repository, in place of a credential that can be picked. */
function HappyAgentRepositoryPluginView(props: { readonly plugin: HappyAgentRepositoryPlugin }) {
    const plugin = props.plugin;
    return (
        <Box className="happy-agent-repositories__plugin-section">
            <Box
                className="happy-agent-repositories__plugin"
                data-happy-desktop-ui="happy-agent-repository-plugin"
                data-status={plugin.status}
            >
                <PluginMark image={plugin.image} size="row" />
                <Box className="happy-agent-repositories__text">
                    <span className="happy-agent-repositories__name">Managed by {plugin.name}</span>
                    {plugin.detail ? (
                        <span className="happy-agent-repositories__meta">{plugin.detail}</span>
                    ) : null}
                </Box>
                {plugin.onOpen ? (
                    <Button onClick={plugin.onOpen} size="small" variant="secondary">
                        Open plugin
                    </Button>
                ) : null}
            </Box>
            <span className="happy-agent-repositories__note">
                {plugin.name} signs in for this repository. Its credential is managed by the plugin
                and is not shown here.
            </span>
            {plugin.status === "missing" ? (
                <Banner tone="warning" title={`${plugin.name}'s credential is gone`}>
                    The plugin was removed or disconnected, so git access to this repository fails
                    until it is connected again.
                </Banner>
            ) : plugin.status === "suspended" ? (
                <Banner tone="warning" title={`${plugin.name} suspended the app`}>
                    {plugin.account
                        ? `${plugin.name} suspended the app's installation for ${plugin.account}; git access fails until it is unsuspended on ${plugin.name}.`
                        : `${plugin.name} suspended the app's installation; git access fails until it is unsuspended on ${plugin.name}.`}
                </Banner>
            ) : null}
        </Box>
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
