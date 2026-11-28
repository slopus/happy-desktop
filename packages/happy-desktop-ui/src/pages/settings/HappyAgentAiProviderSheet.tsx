import { useState, type ReactNode } from "react";
import type { BadgeVariant } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { IconTile, type IconTileProps } from "../../IconTile";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { TextField } from "../../TextField";
import {
    HappyAgentProviderAddPanel,
    type HappyAgentProviderAddPanelProps,
} from "./HappyAgentProviderAddDialog";
import {
    HappyAgentProviderConnectionEditor,
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
    /** The open action's change is out. */
    readonly busy?: boolean;
    readonly error?: { readonly title: string; readonly message: string };
    /**
     * The add form open in the sheet: under one token when it signs that
     * token in again, under the list when it adds one.
     */
    readonly add?: {
        readonly credentialId?: string;
        readonly panel: HappyAgentProviderAddPanelProps;
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
 * key, Sign in again, Remove — and its switch. An action opens in place under
 * its token and closes when it is done or cancelled; adding a token opens
 * the add form under the list the same way.
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
    const addBusy = props.add?.panel.phase === "busy";
    const close = (): void => {
        if (!busy && !addBusy) props.onClose();
    };
    const error = props.error ? (
        <Banner tone="danger" title={props.error.title}>
            {props.error.message}
        </Banner>
    ) : null;
    const nameSave = (): void => {
        if (!busy && value.trim() !== "") props.onNameSave(value);
    };
    const add = props.add;
    const adding = add !== undefined && add.credentialId === undefined;
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                busy={busy || addBusy}
                footer={
                    props.onAdd ? (
                        <Button
                            disabled={adding}
                            icon="plus"
                            onClick={props.onAdd}
                            variant="secondary"
                        >
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
                    {action?.kind === "name" ? (
                        <ActionPanel
                            busy={busy}
                            confirm="Save"
                            confirmDisabled={value.trim() === ""}
                            error={error}
                            onCancel={props.onActionCancel}
                            onConfirm={nameSave}
                        >
                            <TextField
                                autoFocus
                                disabled={busy}
                                fullWidth
                                label="Provider name"
                                onSubmit={nameSave}
                                onValueChange={valueUpdate}
                                value={value}
                            />
                        </ActionPanel>
                    ) : (
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
                    )}
                    {action ? null : error}
                    <CredentialList
                        {...props}
                        openError={action && action.kind !== "name" ? error : null}
                        value={value}
                        valueUpdate={valueUpdate}
                    />
                    {adding ? (
                        <Box
                            className="happy-agent-ai-provider-sheet__add"
                            data-happy-desktop-ui="happy-agent-ai-provider-add"
                        >
                            <span className="happy-agent-ai-provider-sheet__add-title">
                                New token
                            </span>
                            <HappyAgentProviderAddPanel {...add.panel} />
                        </Box>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

/** An action opened under a token or the provider's name: its fields, and Cancel beside its one button. */
function ActionPanel(props: {
    readonly children?: ReactNode;
    readonly error: ReactNode;
    readonly busy: boolean;
    readonly confirm: string;
    readonly confirmDisabled?: boolean;
    readonly danger?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Box
            className="happy-agent-ai-provider-sheet__action"
            data-happy-desktop-ui="happy-agent-ai-provider-action"
        >
            {props.error}
            {props.children}
            <Box className="happy-agent-ai-provider-sheet__action-buttons">
                <Button disabled={props.busy} onClick={props.onCancel} size="small" variant="ghost">
                    Cancel
                </Button>
                <Button
                    disabled={props.confirmDisabled === true && !props.busy}
                    loading={props.busy}
                    onClick={props.onConfirm}
                    size="small"
                    variant={props.danger ? "danger" : "primary"}
                >
                    {props.confirm}
                </Button>
            </Box>
        </Box>
    );
}

/** The provider's tokens, each with its actions and the one that is open under it. */
function CredentialList(
    props: HappyAgentAiProviderSheetProps & {
        readonly value: string;
        readonly valueUpdate: (value: string) => void;
        readonly openError: ReactNode;
    },
) {
    if (props.credentials === undefined)
        return (
            <span className="happy-agent-ai-provider-sheet__note">{props.credentialsHidden}</span>
        );
    if (props.credentials.length === 0)
        return <span className="happy-agent-ai-provider-sheet__note">No tokens yet.</span>;
    const busy = props.busy === true;
    const action = props.action;
    const add = props.add;
    const valueSave = (save: (value: string) => void) => (): void => {
        if (!busy && props.value.trim() !== "") save(props.value);
    };
    return (
        <Box
            className="happy-agent-ai-provider-sheet__credentials"
            data-happy-desktop-ui="happy-agent-ai-provider-credentials"
        >
            {props.credentials.map((entry) => {
                const label = STATE_LABELS[entry.state];
                const current =
                    action && action.kind !== "name" && action.credentialId === entry.id
                        ? action.kind
                        : add?.credentialId === entry.id
                          ? "reauth"
                          : undefined;
                const locked = busy || entry.saving === true;
                const labelSave = valueSave(props.onCredentialLabelSave);
                const secretSave = valueSave(props.onCredentialSecretSave);
                const secretWord = entry.replaceWith === "token" ? "token" : "key";
                return (
                    <Box
                        className="happy-agent-ai-provider-sheet__credential"
                        data-happy-desktop-ui="happy-agent-ai-provider-credential"
                        data-open={current}
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
                                        {`Replace ${secretWord}`}
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
                        {current === "label" ? (
                            <ActionPanel
                                busy={busy}
                                confirm="Save"
                                confirmDisabled={props.value.trim() === ""}
                                error={props.openError}
                                onCancel={props.onActionCancel}
                                onConfirm={labelSave}
                            >
                                <TextField
                                    autoFocus
                                    disabled={busy}
                                    fullWidth
                                    label="Token name"
                                    onSubmit={labelSave}
                                    onValueChange={props.valueUpdate}
                                    value={props.value}
                                />
                            </ActionPanel>
                        ) : current === "secret" ? (
                            <ActionPanel
                                busy={busy}
                                confirm={`Replace ${secretWord}`}
                                confirmDisabled={props.value.trim() === ""}
                                error={props.openError}
                                onCancel={props.onActionCancel}
                                onConfirm={secretSave}
                            >
                                <TextField
                                    autoComplete="off"
                                    autoFocus
                                    disabled={busy}
                                    fullWidth
                                    hint="The old one stops being used once the new one is saved. The name, usage and switch stay."
                                    label={
                                        entry.replaceWith === "token"
                                            ? "New setup token"
                                            : "New API key"
                                    }
                                    onSubmit={secretSave}
                                    onValueChange={props.valueUpdate}
                                    type="password"
                                    value={props.value}
                                />
                            </ActionPanel>
                        ) : current === "connection" && entry.connection ? (
                            <HappyAgentProviderConnectionEditor
                                busy={busy}
                                connection={entry.connection}
                                error={props.openError}
                                onCancel={props.onActionCancel}
                                onSave={props.onCredentialConnectionSave}
                                vendor={entry.connection.vendor}
                            />
                        ) : current === "remove" ? (
                            <ActionPanel
                                busy={busy}
                                confirm="Remove"
                                danger
                                error={props.openError}
                                onCancel={props.onActionCancel}
                                onConfirm={() => props.onCredentialRemove(entry.id)}
                            >
                                <span className="happy-agent-ai-provider-sheet__text">
                                    {`Remove “${entry.label}”? Agents stop using it right away.`}
                                </span>
                            </ActionPanel>
                        ) : current === "reauth" && add ? (
                            <Box className="happy-agent-ai-provider-sheet__action">
                                <HappyAgentProviderAddPanel {...add.panel} reauth />
                            </Box>
                        ) : null}
                    </Box>
                );
            })}
        </Box>
    );
}
