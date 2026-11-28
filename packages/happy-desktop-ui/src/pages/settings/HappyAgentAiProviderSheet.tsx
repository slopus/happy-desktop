import { useState, type ReactNode } from "react";
import type { BadgeVariant } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Icon, type IconName } from "../../Icon";
import { IconTile, type IconTileProps } from "../../IconTile";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { TextField } from "../../TextField";
import {
    HappyAgentProviderTokenDialog,
    type HappyAgentProviderAddFormProps,
} from "./HappyAgentProviderAddDialog";
import {
    HappyAgentProviderConnectionDialog,
    type HappyAgentProviderConnection,
    type HappyAgentProviderConnectionChange,
    type HappyAgentProviderEndpointVendor,
} from "./HappyAgentProviderConnectionFields";
import { HappyAgentSettingsStatus } from "./HappyAgentSettingsStatus";

/** Where one token stands, as the server reports it. */
export type HappyAgentAiProviderCredentialState = "ready" | "cooling" | "invalid" | "disabled";

/** One token behind a provider: an API key, a setup token or a sign-in. Never the secret. */
export interface HappyAgentAiProviderCredentialRow {
    readonly id: string;
    readonly label: string;
    /** What it is, already worded, such as "Anthropic · API key". */
    readonly meta: string;
    readonly enabled: boolean;
    readonly state: HappyAgentAiProviderCredentialState;
    /** When a cooling token is tried again, already formatted. */
    readonly coolingUntil?: string;
    /** A change asked for and not answered yet. */
    readonly saving?: boolean;
    /** What a new secret replaces it with: an API key or a setup token; absent for a sign-in. */
    readonly replaceWith?: "key" | "token";
    /** Whether its sign-in can be run again here. */
    readonly reauth?: boolean;
    /**
     * Where and how an API key connects, when it may say: its own endpoint,
     * such as a proxy, its auth and its headers' names. Absent for a sign-in
     * or setup token, which always run on the vendor's own.
     */
    readonly connection?: HappyAgentProviderConnection & {
        readonly vendor: HappyAgentProviderEndpointVendor;
    };
}

/** The one thing open on the sheet: its name, or one token's name, secret or removal. */
export type HappyAgentAiProviderSheetAction =
    | { readonly kind: "name" }
    | {
          readonly kind: "label" | "secret" | "connection" | "remove";
          readonly credentialId: string;
      };

export interface HappyAgentAiProviderSheetProps {
    readonly name: string;
    readonly tile: IconTileProps;
    /** Whose it is and how many tokens it holds, already worded: "Team · 2 tokens". */
    readonly meta: string;
    /** Its tokens, where the reader may see them. */
    readonly credentials?: readonly HappyAgentAiProviderCredentialRow[];
    /** Why the tokens are not listed, such as only managers seeing the team's. */
    readonly credentialsHidden?: string;
    /** Whether the reader may change its tokens; each then shows its actions. */
    readonly editable: boolean;
    readonly action?: HappyAgentAiProviderSheetAction;
    /** The open action, shown in a dialog of its own over the sheet. Its change is out while `busy`. */
    readonly busy?: boolean;
    readonly error?: { readonly title: string; readonly message: string };
    /**
     * The add form open over the sheet: signing `credentialId` in again, or
     * adding a token to this provider.
     */
    readonly add?: {
        readonly credentialId?: string;
        readonly form: HappyAgentProviderAddFormProps;
        onClose: () => void;
    };
    onClose: () => void;
    onCredentialEnabledChange: (credentialId: string, enabled: boolean) => void;
    onCredentialRenameOpen: (credentialId: string) => void;
    onCredentialReplaceOpen: (credentialId: string) => void;
    onCredentialRemoveOpen: (credentialId: string) => void;
    onCredentialReauth: (credentialId: string) => void;
    onActionCancel: () => void;
    onCredentialLabelSave: (label: string) => void;
    onCredentialSecretSave: (secret: string) => void;
    onCredentialConnectionOpen: (credentialId: string) => void;
    /** An empty `baseUrl` sends it to the vendor's own API again. */
    onCredentialConnectionSave: (change: HappyAgentProviderConnectionChange) => void;
    onCredentialRemove: (credentialId: string) => void;
    /** Adds a token to this provider; absent where the reader may not. */
    onAdd?: () => void;
    /** Opens its name; only a named provider someone created is renamed. */
    onRename?: () => void;
    onNameSave: (name: string) => void;
}

const STATE_LABELS: Record<HappyAgentAiProviderCredentialState, string | undefined> = {
    ready: undefined,
    cooling: "Resting",
    invalid: "Needs attention",
    disabled: "Off",
};

const STATE_VARIANTS: Record<HappyAgentAiProviderCredentialState, BadgeVariant> = {
    ready: "success",
    cooling: "warning",
    invalid: "danger",
    disabled: "neutral",
};

/** An endpoint as a token's line names it: its host, or the URL where it has none. */
function endpointHost(url: string): string {
    try {
        return new URL(url).host || url;
    } catch {
        return url;
    }
}

function credentialMeta(credential: HappyAgentAiProviderCredentialRow): string {
    const url = credential.connection?.url;
    const meta = url
        ? `${credential.meta} · via ${endpointHost(url)}${credential.connection?.auth === "none" ? ", no token" : ""}`
        : credential.meta;
    return credential.state === "cooling" && credential.coolingUntil
        ? `${meta} · Tried again at ${credential.coolingUntil}`
        : meta;
}

function actionKey(action: HappyAgentAiProviderSheetAction | undefined): string {
    if (!action) return "";
    return action.kind === "name" ? "name" : `${action.kind}:${action.credentialId}`;
}

/** What is typed in the open action, and the action it was typed for. */
interface Held {
    readonly key: string;
    readonly value: string;
}

/**
 * One provider behind its row, in one fixed card that never navigates: its
 * tokens as a list, each with its actions in plain sight — Rename, Replace
 * key, Connection, Sign in again, Remove — and its switch. Each action opens
 * a dialog of its own over the card, and Add token one with the add form;
 * the card under it stays as it was.
 */
export function HappyAgentAiProviderSheet(props: HappyAgentAiProviderSheetProps) {
    const busy = props.busy === true;
    const action = props.action;
    const key = actionKey(action);
    const [held, setHeld] = useState<Held | undefined>(undefined);
    const opened =
        action && action.kind !== "name"
            ? props.credentials?.find((entry) => entry.id === action.credentialId)
            : undefined;
    const value =
        held?.key === key
            ? held.value
            : action?.kind === "name"
              ? props.name
              : action?.kind === "label"
                ? (opened?.label ?? "")
                : "";
    const valueUpdate = (next: string): void => setHeld({ key, value: next });
    const close = (): void => {
        if (!busy && !props.add && !action) props.onClose();
    };
    const add = props.add;
    const reauthOf = add?.credentialId
        ? props.credentials?.find((entry) => entry.id === add.credentialId)
        : undefined;
    return (
        <>
            <ModalOverlay onDismiss={close}>
                <Modal
                    footer={
                        props.onAdd ? (
                            <Button icon="plus" onClick={props.onAdd} variant="secondary">
                                Add token
                            </Button>
                        ) : undefined
                    }
                    leading={<IconTile {...props.tile} />}
                    onClose={close}
                    size="sheet"
                    title={props.name}
                >
                    <Box
                        className="happy-agent-ai-provider-sheet"
                        data-happy-desktop-ui="happy-agent-ai-provider-sheet"
                    >
                        <Box className="happy-agent-ai-provider-sheet__heading">
                            <span className="happy-agent-ai-provider-sheet__meta">
                                {props.meta}
                            </span>
                            {props.onRename ? (
                                <Button
                                    icon="edit"
                                    onClick={props.onRename}
                                    size="small"
                                    variant="ghost"
                                >
                                    Rename provider
                                </Button>
                            ) : null}
                        </Box>
                        <CredentialList {...props} />
                    </Box>
                </Modal>
            </ModalOverlay>
            {action?.kind === "name" ? (
                <ActionDialog
                    busy={busy}
                    confirm="Save"
                    confirmDisabled={value.trim() === ""}
                    error={props.error}
                    icon="edit"
                    onClose={props.onActionCancel}
                    onConfirm={() => props.onNameSave(value)}
                    subject={props.name}
                    title="Rename provider"
                >
                    <TextField
                        autoFocus
                        disabled={busy}
                        fullWidth
                        label="Provider name"
                        onSubmit={() => {
                            if (value.trim() !== "") props.onNameSave(value);
                        }}
                        onValueChange={valueUpdate}
                        value={value}
                    />
                </ActionDialog>
            ) : action?.kind === "label" && opened ? (
                <ActionDialog
                    busy={busy}
                    confirm="Save"
                    confirmDisabled={value.trim() === ""}
                    error={props.error}
                    icon="edit"
                    onClose={props.onActionCancel}
                    onConfirm={() => props.onCredentialLabelSave(value)}
                    subject={`${props.name} · ${opened.meta}`}
                    title="Rename token"
                >
                    <TextField
                        autoFocus
                        disabled={busy}
                        fullWidth
                        label="Token name"
                        onSubmit={() => {
                            if (value.trim() !== "") props.onCredentialLabelSave(value);
                        }}
                        onValueChange={valueUpdate}
                        value={value}
                    />
                </ActionDialog>
            ) : action?.kind === "secret" && opened ? (
                <ActionDialog
                    busy={busy}
                    confirm={opened.replaceWith === "token" ? "Replace token" : "Replace key"}
                    confirmDisabled={value.trim() === ""}
                    error={props.error}
                    icon="lock"
                    onClose={props.onActionCancel}
                    onConfirm={() => props.onCredentialSecretSave(value)}
                    subject={opened.label}
                    title={
                        opened.replaceWith === "token" ? "Replace setup token" : "Replace API key"
                    }
                >
                    <TextField
                        autoComplete="off"
                        autoFocus
                        disabled={busy}
                        fullWidth
                        hint="The old one stops being used once the new one is saved. The name, usage and switch stay."
                        label={opened.replaceWith === "token" ? "New setup token" : "New API key"}
                        onSubmit={() => {
                            if (value.trim() !== "") props.onCredentialSecretSave(value);
                        }}
                        onValueChange={valueUpdate}
                        type="password"
                        value={value}
                    />
                </ActionDialog>
            ) : action?.kind === "connection" && opened?.connection ? (
                <HappyAgentProviderConnectionDialog
                    busy={busy}
                    connection={opened.connection}
                    {...(props.error ? { error: props.error } : {})}
                    onClose={props.onActionCancel}
                    onSave={props.onCredentialConnectionSave}
                    subject={opened.label}
                    vendor={opened.connection.vendor}
                />
            ) : action?.kind === "remove" && opened ? (
                <ActionDialog
                    busy={busy}
                    confirm="Remove"
                    danger
                    error={props.error}
                    icon="trash"
                    onClose={props.onActionCancel}
                    onConfirm={() => props.onCredentialRemove(opened.id)}
                    title={`Remove “${opened.label}”?`}
                >
                    <span className="happy-agent-ai-provider-sheet__text">
                        {`Agents stop using it right away. It is removed from ${props.name}.`}
                    </span>
                </ActionDialog>
            ) : add ? (
                <HappyAgentProviderTokenDialog
                    {...add.form}
                    onClose={add.onClose}
                    {...(reauthOf
                        ? { reauth: true, subject: reauthOf.label, title: "Sign in again" }
                        : { subject: props.name, title: "Add token" })}
                />
            ) : null}
        </>
    );
}

/**
 * One action in a dialog of its own over the sheet: its fields, and the one
 * button that does it. Removing is a confirmation, so it alone has Cancel.
 */
function ActionDialog(props: {
    readonly children?: ReactNode;
    readonly title: string;
    readonly subject?: string;
    readonly icon: IconName;
    readonly error?: { readonly title: string; readonly message: string };
    readonly busy: boolean;
    readonly confirm: string;
    readonly confirmDisabled?: boolean;
    readonly danger?: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const busy = props.busy;
    const close = (): void => {
        if (!busy) props.onClose();
    };
    const confirm = (
        <Button
            disabled={props.confirmDisabled === true && !busy}
            loading={busy}
            onClick={props.onConfirm}
            variant={props.danger ? "danger" : "primary"}
        >
            {props.confirm}
        </Button>
    );
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                busy={busy}
                footer={
                    props.danger ? (
                        <>
                            <Button disabled={busy} onClick={close} variant="secondary">
                                Cancel
                            </Button>
                            {confirm}
                        </>
                    ) : (
                        confirm
                    )
                }
                icon={props.icon}
                onClose={close}
                size={props.danger ? "small" : "medium"}
                {...(props.subject === undefined
                    ? {}
                    : {
                          subheader: (
                              <span className="happy-agent-provider-add__subject">
                                  {props.subject}
                              </span>
                          ),
                      })}
                {...(props.danger ? { tone: "danger" as const } : {})}
                title={props.title}
            >
                <Box
                    className="happy-agent-ai-provider-sheet__dialog"
                    data-happy-desktop-ui="happy-agent-ai-provider-action"
                >
                    {props.error ? (
                        <Banner tone="danger" title={props.error.title}>
                            {props.error.message}
                        </Banner>
                    ) : null}
                    {props.children}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

/** The provider's tokens, each with its actions. */
function CredentialList(props: HappyAgentAiProviderSheetProps) {
    if (props.credentials === undefined)
        return (
            <span className="happy-agent-ai-provider-sheet__note">{props.credentialsHidden}</span>
        );
    if (props.credentials.length === 0)
        return <span className="happy-agent-ai-provider-sheet__note">No tokens yet.</span>;
    return (
        <Box
            className="happy-agent-ai-provider-sheet__credentials"
            data-happy-desktop-ui="happy-agent-ai-provider-credentials"
        >
            {props.credentials.map((entry) => {
                const label = STATE_LABELS[entry.state];
                const locked = entry.saving === true;
                return (
                    <Box
                        className="happy-agent-ai-provider-sheet__credential"
                        data-happy-desktop-ui="happy-agent-ai-provider-credential"
                        data-state={entry.state}
                        key={entry.id}
                    >
                        <Box className="happy-agent-ai-provider-sheet__credential-row">
                            <Icon name="lock" size={14} />
                            <span className="happy-agent-provider-list__text">
                                <span className="happy-agent-provider-list__name">
                                    {entry.label}
                                </span>
                                <span className="happy-agent-provider-list__line">
                                    <span className="happy-agent-provider-list__line-text">
                                        {credentialMeta(entry)}
                                    </span>
                                </span>
                            </span>
                            {label ? (
                                <HappyAgentSettingsStatus
                                    label={label}
                                    variant={STATE_VARIANTS[entry.state]}
                                />
                            ) : null}
                            {entry.saving ? <Spinner size={14} /> : null}
                            {props.editable ? (
                                <Switch
                                    aria-label={`Use ${entry.label}`}
                                    checked={entry.enabled}
                                    disabled={locked}
                                    onChange={(enabled) =>
                                        props.onCredentialEnabledChange(entry.id, enabled)
                                    }
                                />
                            ) : null}
                        </Box>
                        {props.editable ? (
                            <Box
                                className="happy-agent-ai-provider-sheet__credential-actions"
                                data-happy-desktop-ui="happy-agent-ai-provider-credential-actions"
                            >
                                <Button
                                    disabled={locked}
                                    icon="edit"
                                    onClick={() => props.onCredentialRenameOpen(entry.id)}
                                    size="small"
                                    variant="ghost"
                                >
                                    Rename
                                </Button>
                                {entry.replaceWith ? (
                                    <Button
                                        disabled={locked}
                                        icon="lock"
                                        onClick={() => props.onCredentialReplaceOpen(entry.id)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        {entry.replaceWith === "token"
                                            ? "Replace token"
                                            : "Replace key"}
                                    </Button>
                                ) : null}
                                {entry.connection ? (
                                    <Button
                                        disabled={locked}
                                        icon="link"
                                        onClick={() => props.onCredentialConnectionOpen(entry.id)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Connection
                                    </Button>
                                ) : null}
                                {entry.reauth ? (
                                    <Button
                                        disabled={locked}
                                        icon="repeat"
                                        onClick={() => props.onCredentialReauth(entry.id)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Sign in again
                                    </Button>
                                ) : null}
                                <Button
                                    disabled={locked}
                                    icon="trash"
                                    onClick={() => props.onCredentialRemoveOpen(entry.id)}
                                    size="small"
                                    variant="ghost"
                                >
                                    Remove
                                </Button>
                            </Box>
                        ) : null}
                    </Box>
                );
            })}
        </Box>
    );
}
