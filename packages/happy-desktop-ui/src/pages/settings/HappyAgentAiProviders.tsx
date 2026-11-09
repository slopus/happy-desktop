import { Banner } from "../../Banner";
import type { BadgeVariant } from "../../Badge";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import {
    HappyAgentProviderAddDialog,
    type HappyAgentProviderAddDialogProps,
} from "./HappyAgentProviderAddDialog";
import {
    HappyAgentProviderEditDialog,
    type HappyAgentProviderEditDialogProps,
} from "./HappyAgentProviderEditDialog";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";
import { HappyAgentSettingsStatus } from "./HappyAgentSettingsStatus";

/** Where one credential stands, as the server reports it. */
export type HappyAgentAiProviderCredentialState = "ready" | "cooling" | "invalid" | "disabled";

/** One key or sign-in behind a connection. Never the secret. */
export interface HappyAgentAiProviderCredentialRow {
    readonly id: string;
    readonly label: string;
    /** What it is, already worded, such as "Anthropic · API key". */
    readonly meta: string;
    readonly enabled: boolean;
    readonly state: HappyAgentAiProviderCredentialState;
    /** When a cooling credential is tried again, already formatted. */
    readonly coolingUntil?: string;
    /** A change asked for and not answered yet. */
    readonly saving?: boolean;
}

/** One thing a conversation can run on. */
export interface HappyAgentAiProviderConnectionRow {
    readonly id: string;
    readonly name: string;
    /** Which list it is in: what Happy includes, the team's, or the reader's own. */
    readonly group: "included" | "team" | "private";
    /** What it serves, already worded, such as "OpenAI · 3 models". */
    readonly meta: string;
    /** Whether it can serve the reader now; one that can't is shown greyed. */
    readonly enabled: boolean;
    /** Its credentials, where the reader may see them. */
    readonly credentials?: readonly HappyAgentAiProviderCredentialRow[];
    /** Whether it can be renamed and rekeyed: one the team added, for those who manage it. */
    readonly editable?: boolean;
}

export interface HappyAgentAiProvidersProps {
    readonly connections: readonly HappyAgentAiProviderConnectionRow[];
    /** True until the first answer. */
    readonly loading?: boolean;
    /** Why the list could not be read. */
    readonly error?: string;
    /** Why the last change to a credential was refused. */
    readonly saveError?: string;
    /** Whether the team list's credentials may be changed by the reader. */
    readonly teamManageable: boolean;
    /** The add dialog, while it is open. */
    readonly add?: HappyAgentProviderAddDialogProps;
    /** The edit dialog, while it is open. */
    readonly edit?: HappyAgentProviderEditDialogProps;
    onAdd: () => void;
    onEdit?: (connectionId: string) => void;
    onCredentialEnabledChange: (
        connectionId: string,
        credentialId: string,
        enabled: boolean,
    ) => void;
    onCredentialRemove: (connectionId: string, credentialId: string) => void;
}

const GROUPS: readonly {
    readonly id: HappyAgentAiProviderConnectionRow["group"];
    readonly title: string;
}[] = [
    { id: "included", title: "Included" },
    { id: "team", title: "Team" },
    { id: "private", title: "My account" },
];

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

/**
 * Settings › AI providers on Happy Cloud: what conversations run on, in three
 * lists — what Happy includes, the team's, and the reader's own — with the
 * keys and sign-ins behind each, and the way to add more.
 */
export function HappyAgentAiProviders(props: HappyAgentAiProvidersProps) {
    return (
        <HappyAgentSettingsSection
            description="What your conversations run on. Add your own key or subscription to use your own account."
            title="AI providers"
        >
            <Box
                className="happy-agent-ai-providers"
                data-happy-desktop-ui="happy-agent-ai-providers"
            >
                <Box className="happy-agent-ai-providers__actions">
                    <Button icon="plus" onClick={props.onAdd} size="small" variant="secondary">
                        Add…
                    </Button>
                </Box>
                {props.saveError ? (
                    <Banner tone="danger" title="Not changed">
                        {props.saveError}
                    </Banner>
                ) : null}
                {props.error ? (
                    <Banner tone="danger" title="AI providers unavailable">
                        {props.error}
                    </Banner>
                ) : props.loading ? (
                    <Box className="happy-agent-settings__pending">
                        <Spinner size={16} />
                        <span>Reading AI providers…</span>
                    </Box>
                ) : (
                    GROUPS.map((group) => {
                        const rows = props.connections.filter((row) => row.group === group.id);
                        if (group.id === "included" && rows.length === 0) return null;
                        return (
                            <Box
                                className="happy-agent-ai-providers__group"
                                data-group={group.id}
                                data-happy-desktop-ui="happy-agent-ai-providers-group"
                                key={group.id}
                            >
                                <h3 className="happy-agent-ai-providers__group-title">
                                    {group.title}
                                </h3>
                                {rows.length === 0 ? (
                                    <span className="happy-agent-ai-providers__empty">
                                        Nothing added yet
                                    </span>
                                ) : (
                                    rows.map((row) => (
                                        <HappyAgentAiProviderConnection
                                            key={row.id}
                                            manageable={group.id !== "team" || props.teamManageable}
                                            row={row}
                                            {...(props.onEdit ? { onEdit: props.onEdit } : {})}
                                            onCredentialEnabledChange={
                                                props.onCredentialEnabledChange
                                            }
                                            onCredentialRemove={props.onCredentialRemove}
                                        />
                                    ))
                                )}
                            </Box>
                        );
                    })
                )}
            </Box>
            {props.add ? <HappyAgentProviderAddDialog {...props.add} /> : null}
            {props.edit ? <HappyAgentProviderEditDialog {...props.edit} /> : null}
        </HappyAgentSettingsSection>
    );
}

function HappyAgentAiProviderConnection(props: {
    readonly row: HappyAgentAiProviderConnectionRow;
    readonly manageable: boolean;
    onEdit?: (connectionId: string) => void;
    onCredentialEnabledChange: (
        connectionId: string,
        credentialId: string,
        enabled: boolean,
    ) => void;
    onCredentialRemove: (connectionId: string, credentialId: string) => void;
}) {
    const row = props.row;
    return (
        <Box
            className="happy-agent-ai-providers__connection"
            data-enabled={row.enabled ? "true" : "false"}
            data-happy-desktop-ui="happy-agent-ai-provider"
        >
            <Box className="happy-agent-ai-providers__connection-head">
                <Box className="happy-agent-ai-providers__text">
                    <span className="happy-agent-ai-providers__name">{row.name}</span>
                    <span className="happy-agent-ai-providers__meta">{row.meta}</span>
                </Box>
                {row.enabled ? null : <HappyAgentSettingsStatus label="Off" variant="neutral" />}
                {props.manageable && row.editable && props.onEdit ? (
                    <Button
                        aria-label={`Edit ${row.name}`}
                        icon="edit"
                        iconOnly
                        onClick={() => props.onEdit?.(row.id)}
                        size="small"
                        variant="ghost"
                    />
                ) : null}
            </Box>
            {row.credentials?.map((credential) => {
                const label = STATE_LABELS[credential.state];
                return (
                    <Box
                        className="happy-agent-ai-providers__credential"
                        data-happy-desktop-ui="happy-agent-ai-provider-credential"
                        data-state={credential.state}
                        key={credential.id}
                    >
                        <Icon name="lock" size={14} />
                        <Box className="happy-agent-ai-providers__text">
                            <span className="happy-agent-ai-providers__name">
                                {credential.label}
                            </span>
                            <span className="happy-agent-ai-providers__meta">
                                {credential.state === "cooling" && credential.coolingUntil
                                    ? `${credential.meta} · Tried again at ${credential.coolingUntil}`
                                    : credential.meta}
                            </span>
                        </Box>
                        {label ? (
                            <HappyAgentSettingsStatus
                                label={label}
                                variant={STATE_VARIANTS[credential.state]}
                            />
                        ) : null}
                        {credential.saving ? <Spinner size={16} /> : null}
                        {props.manageable ? (
                            <>
                                <Switch
                                    aria-label={`${credential.label} on`}
                                    checked={credential.enabled}
                                    disabled={credential.saving}
                                    onChange={(enabled) =>
                                        props.onCredentialEnabledChange(
                                            row.id,
                                            credential.id,
                                            enabled,
                                        )
                                    }
                                />
                                <Button
                                    aria-label={`Remove ${credential.label}`}
                                    disabled={credential.saving}
                                    icon="trash"
                                    iconOnly
                                    onClick={() => props.onCredentialRemove(row.id, credential.id)}
                                    size="small"
                                    variant="ghost"
                                />
                            </>
                        ) : null}
                    </Box>
                );
            })}
        </Box>
    );
}
