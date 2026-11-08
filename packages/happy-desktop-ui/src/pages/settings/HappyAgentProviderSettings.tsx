import { useState } from "react";
import type { BadgeVariant } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { SegmentedControl } from "../../SegmentedControl";
import { TextField } from "../../TextField";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import {
    HAPPY_AGENT_CUSTOM_PROVIDER_PROTOCOL_LABELS,
    happyAgentCustomProviderProtocolOffered,
    type HappyAgentCustomProviderProtocolId,
} from "./HappyAgentCustomProviderDialog";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";
import { HappyAgentSettingsStatus } from "./HappyAgentSettingsStatus";

/** Why a provider is or is not usable, straight from the daemon's catalog. */
export type HappyAgentProviderStatus = "ready" | "not_authenticated" | "not_enabled" | "no_models";

export interface HappyAgentProviderModelRow {
    /** Stable row key, `${providerId}:${modelId}`. */
    readonly id: string;
    readonly name: string;
    /** The model's own identifier, shown as the machine-readable subtitle. */
    readonly modelId: string;
    readonly enabled: boolean;
    /** The workspace default; it is offered even when the rest are switched off. */
    readonly isDefault: boolean;
    readonly contextWindow?: number;
    /** Reasoning levels this model exposes, already labelled. */
    readonly efforts: readonly string[];
}

/** Where one team key stands, as the server reports it. */
export type HappyAgentProviderKeyState = "ready" | "cooling" | "invalid" | "disabled";

export interface HappyAgentProviderKeyRow {
    readonly id: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly state: HappyAgentProviderKeyState;
    /** When a cooling key is tried again, already formatted. */
    readonly coolingUntil?: string;
    /** A change asked for and not answered yet. */
    readonly saving?: boolean;
}

/** The team API keys a Happy Cloud server keeps for one provider. */
export interface HappyAgentProviderKeys {
    readonly list: readonly HappyAgentProviderKeyRow[];
    /** Whether a key can be added here; subscriptions sign in instead. */
    readonly addable: boolean;
    /**
     * Amazon Bedrock: takes AWS access keys as well as an API key, and asks
     * for the region, which applies to every Bedrock key on the server.
     */
    readonly aws?: boolean;
    /** Whose key answers now: the team's, Happy Cloud's, or nobody's. */
    readonly source: "tenant" | "operator" | null;
}

/** What adding a team key sends. */
export type HappyAgentProviderKeyInput =
    | {
          readonly kind: "apiKey";
          readonly label: string;
          readonly apiKey: string;
          readonly region?: string;
      }
    | {
          readonly kind: "aws";
          readonly label: string;
          readonly accessKeyId: string;
          readonly secretAccessKey: string;
          readonly sessionToken?: string;
          readonly region?: string;
      };

/**
 * The team subscription a Happy Cloud server signs in to for a provider, such
 * as a ChatGPT or Claude plan, and where its sign-in stands.
 */
export interface HappyAgentProviderSubscriptionRow {
    /** The vendor's name for it, such as "Codex" or "Claude Code". */
    readonly name: string;
    /** Who is signed in, already worded, while signed in. */
    readonly account?: string;
    readonly signedIn: boolean;
    readonly signIn?: {
        readonly status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
        readonly message: string;
        /** What the person does next, while the sign-in waits on them. */
        readonly authorization?: {
            readonly method: "browser" | "device";
            readonly url: string;
            readonly userCode?: string;
            readonly acceptsCode: boolean;
        };
        readonly error?: string;
    };
    /** A request this window sent and the server has not answered. */
    readonly pending?: boolean;
}

export interface HappyAgentProviderRow {
    readonly id: string;
    /** Service identity shown separately from the account's friendly name. */
    readonly typeName?: string;
    readonly name: string;
    readonly status: HappyAgentProviderStatus;
    /** Whether the machine will use this provider at all. */
    readonly enabled: boolean;
    /** A requested enablement change the machine has not confirmed yet. */
    readonly saving?: boolean;
    readonly models: readonly HappyAgentProviderModelRow[];
    /** Service tiers the provider offers, already labelled. */
    readonly serviceTiers: readonly string[];
    /** Team API keys, on a Happy Cloud server; absent on a Happy Agent. */
    readonly keys?: HappyAgentProviderKeys;
    /** The team's subscription sign-in, on a Happy Cloud server. */
    readonly subscription?: HappyAgentProviderSubscriptionRow;
    /** A provider the team added itself, with the protocol it speaks. */
    readonly custom?: { readonly protocol: HappyAgentCustomProviderProtocolId };
}

export type HappyAgentProviderSettingsProps = {
    providers: readonly HappyAgentProviderRow[];
    loading?: boolean;
    error?: string;
    /** Why the last provider change was refused. */
    saveError?: string;
    /** Why model enablement cannot currently be changed. */
    unavailable?: string;
    onModelEnabledChange: (id: string, enabled: boolean) => void;
    /** Switches one whole provider on or off for the machine. */
    onProviderEnabledChange: (id: string, enabled: boolean) => void;
    /** Adds a team key; rejects with the reason to show in the form. */
    onKeyAdd?: (providerId: string, input: HappyAgentProviderKeyInput) => Promise<void>;
    onKeyEnabledChange?: (providerId: string, keyId: string, enabled: boolean) => void;
    onKeyRemove?: (providerId: string, keyId: string) => void;
    onSubscriptionSignIn?: (providerId: string) => void;
    /** Hands the vendor's code to the waiting sign-in; rejects with the reason. */
    onSubscriptionCodeSubmit?: (providerId: string, code: string) => Promise<void>;
    onSubscriptionSignInCancel?: (providerId: string) => void;
    onSubscriptionSignOut?: (providerId: string) => void;
    /** Opens a vendor's sign-in page in the person's own browser. */
    onExternalOpen?: (url: string) => void;
    /** Opens the dialog that adds a provider of the team's own; absent when the reader may not. */
    onCustomProviderCreate?: () => void;
    /** Opens one of the team's own providers for editing; absent when the reader may not. */
    onCustomProviderEdit?: (providerId: string) => void;
};

const STATUS_LABELS: Record<HappyAgentProviderStatus, string> = {
    ready: "Connected",
    not_authenticated: "Not signed in",
    not_enabled: "Disabled",
    no_models: "No models",
};

const STATUS_VARIANTS: Record<HappyAgentProviderStatus, BadgeVariant> = {
    ready: "success",
    not_authenticated: "warning",
    not_enabled: "neutral",
    no_models: "neutral",
};

/** What has to happen in Happy Agent itself before the provider's models become usable. */
const STATUS_HINTS: Partial<Record<HappyAgentProviderStatus, string>> = {
    not_authenticated: "Sign it in from Happy Agent to use its models.",
    not_enabled: "No agent on this machine may use it.",
};

/**
 * The Providers category: every provider the daemon knows about, whether it is
 * usable, and which of its models the session pickers may offer. A provider that
 * is not signed in or switched off still lists its models — knowing what would be
 * available is the reason to go and connect it.
 */
export function HappyAgentProviderSettings(props: HappyAgentProviderSettingsProps) {
    if (props.error)
        return (
            <Banner tone="danger" title="Providers unavailable">
                {props.error}
            </Banner>
        );
    if (props.loading)
        return (
            <Box className="happy-agent-settings__pending">
                <Spinner size={16} />
                <span>Reading the model catalog…</span>
            </Box>
        );
    if (props.providers.length === 0)
        return (
            <EmptyState
                description="This Happy Agent daemon reports no model providers yet."
                icon="globe"
                title="No providers"
            />
        );
    return (
        <>
            {props.unavailable ? (
                <Banner tone="neutral" title="Happy Agent reconnecting">
                    {props.unavailable}
                </Banner>
            ) : null}
            {props.saveError ? (
                <Banner tone="danger" title="Provider unchanged">
                    {props.saveError}
                </Banner>
            ) : null}
            <HappyAgentSettingsSection
                description="Off for a provider stops every agent here using it. Off for a model only hides it from this window’s pickers."
                title="Model providers"
            >
                {props.providers.map((provider) => (
                    <article
                        className="happy-agent-provider"
                        data-happy-desktop-ui="happy-agent-provider"
                        data-status={provider.status}
                        key={provider.id}
                    >
                        <header className="happy-agent-provider__header">
                            <Box className="happy-agent-provider__identity">
                                <span
                                    className="happy-agent-provider__glyph"
                                    data-happy-desktop-ui="happy-agent-provider-glyph"
                                >
                                    <Icon name="globe" size={16} />
                                </span>
                                <Box className="happy-agent-provider__naming">
                                    <span
                                        className="happy-agent-provider__name"
                                        data-happy-desktop-ui="happy-agent-provider-name"
                                    >
                                        {provider.typeName
                                            ? `${provider.typeName} · ${provider.name}`
                                            : provider.name}
                                    </span>
                                    <span
                                        className="happy-agent-provider__meta"
                                        data-happy-desktop-ui="happy-agent-provider-meta"
                                    >
                                        {providerMeta(provider)}
                                    </span>
                                </Box>
                            </Box>
                            <HappyAgentSettingsStatus
                                label={STATUS_LABELS[provider.status]}
                                variant={STATUS_VARIANTS[provider.status]}
                            />
                            {provider.saving ? <Spinner size={16} /> : null}
                            {provider.custom && props.onCustomProviderEdit ? (
                                <Button
                                    aria-label={`Edit ${provider.name}`}
                                    disabled={props.unavailable !== undefined}
                                    icon="edit"
                                    onClick={() => props.onCustomProviderEdit?.(provider.id)}
                                    size="small"
                                    variant="ghost"
                                />
                            ) : null}
                            <Switch
                                aria-label={`${provider.typeName ? `${provider.typeName} · ` : ""}${provider.name} enabled`}
                                checked={provider.enabled}
                                disabled={props.unavailable !== undefined || provider.saving}
                                onChange={(enabled) =>
                                    props.onProviderEnabledChange(provider.id, enabled)
                                }
                            />
                        </header>
                        <Box className="happy-agent-provider__models">
                            {provider.models.map((model) => (
                                <Box
                                    className="happy-agent-provider__model"
                                    data-happy-desktop-ui="happy-agent-provider-model"
                                    key={model.id}
                                >
                                    <Box className="happy-agent-provider__model-text">
                                        <Box className="happy-agent-provider__model-title">
                                            <span
                                                className="happy-agent-provider__model-name"
                                                data-happy-desktop-ui="happy-agent-provider-model-name"
                                            >
                                                {model.name}
                                            </span>
                                            {model.isDefault ? (
                                                <span className="happy-agent-provider__model-default">
                                                    Default
                                                </span>
                                            ) : null}
                                        </Box>
                                        <span
                                            className="happy-agent-provider__model-meta"
                                            data-happy-desktop-ui="happy-agent-provider-model-meta"
                                        >
                                            {modelMeta(model)}
                                        </span>
                                    </Box>
                                    <Switch
                                        aria-label={`${model.name} enabled`}
                                        checked={model.enabled}
                                        disabled={
                                            props.unavailable !== undefined ||
                                            model.isDefault ||
                                            provider.status !== "ready"
                                        }
                                        onChange={(enabled) =>
                                            props.onModelEnabledChange(model.id, enabled)
                                        }
                                    />
                                </Box>
                            ))}
                            {provider.models.length === 0 ? (
                                <span
                                    className="happy-agent-provider__models-empty"
                                    data-happy-desktop-ui="happy-agent-provider-models-empty"
                                >
                                    This provider offers no models right now.
                                </span>
                            ) : null}
                        </Box>
                        {provider.subscription ? (
                            <HappyAgentProviderSubscription
                                providerId={provider.id}
                                subscription={provider.subscription}
                                unavailable={props.unavailable !== undefined}
                                {...(props.onSubscriptionSignIn
                                    ? { onSignIn: props.onSubscriptionSignIn }
                                    : {})}
                                {...(props.onSubscriptionCodeSubmit
                                    ? { onCodeSubmit: props.onSubscriptionCodeSubmit }
                                    : {})}
                                {...(props.onSubscriptionSignInCancel
                                    ? { onCancel: props.onSubscriptionSignInCancel }
                                    : {})}
                                {...(props.onSubscriptionSignOut
                                    ? { onSignOut: props.onSubscriptionSignOut }
                                    : {})}
                                {...(props.onExternalOpen
                                    ? { onExternalOpen: props.onExternalOpen }
                                    : {})}
                            />
                        ) : null}
                        {provider.keys ? (
                            <HappyAgentProviderKeyList
                                keys={provider.keys}
                                providerId={provider.id}
                                providerName={provider.name}
                                unavailable={props.unavailable !== undefined}
                                {...(props.onKeyAdd ? { onKeyAdd: props.onKeyAdd } : {})}
                                {...(props.onKeyEnabledChange
                                    ? { onKeyEnabledChange: props.onKeyEnabledChange }
                                    : {})}
                                {...(props.onKeyRemove ? { onKeyRemove: props.onKeyRemove } : {})}
                            />
                        ) : null}
                        {providerHint(provider) ? (
                            <p
                                className="happy-agent-provider__hint"
                                data-happy-desktop-ui="happy-agent-provider-hint"
                            >
                                {providerHint(provider)}
                            </p>
                        ) : null}
                    </article>
                ))}
                {props.onCustomProviderCreate ? (
                    <Box className="happy-agent-provider__add">
                        <Button
                            disabled={props.unavailable !== undefined}
                            icon="plus"
                            onClick={props.onCustomProviderCreate}
                            size="small"
                            variant="secondary"
                        >
                            Add a provider
                        </Button>
                        <span className="happy-agent-provider__add-note">
                            Any endpoint that speaks the OpenAI Responses API, such as vLLM or a
                            gateway.
                        </span>
                    </Box>
                ) : null}
            </HappyAgentSettingsSection>
        </>
    );
}

/**
 * What the reader has to do before a provider's models work. On a Happy Cloud
 * server a provider that takes a key and has none waits for one, rather than
 * for a sign-in on some machine.
 */
function providerHint(provider: HappyAgentProviderRow): string | undefined {
    if (provider.subscription) return undefined;
    if (provider.custom && !happyAgentCustomProviderProtocolOffered(provider.custom.protocol))
        return `Happy Cloud doesn’t serve ${HAPPY_AGENT_CUSTOM_PROVIDER_PROTOCOL_LABELS[provider.custom.protocol]} yet, so this provider offers no models.`;
    if (provider.keys?.addable && provider.keys.source === null)
        return "Add a team API key to use its models.";
    if (provider.keys) return undefined;
    return STATUS_HINTS[provider.status];
}

const KEY_STATE_LABELS: Record<HappyAgentProviderKeyState, string> = {
    ready: "Ready",
    cooling: "Resting",
    invalid: "Rejected",
    disabled: "Off",
};

const KEY_STATE_VARIANTS: Record<HappyAgentProviderKeyState, BadgeVariant> = {
    ready: "success",
    cooling: "warning",
    invalid: "danger",
    disabled: "neutral",
};

function keyMeta(key: HappyAgentProviderKeyRow): string {
    if (key.state === "cooling")
        return key.coolingUntil
            ? `Hit a limit; tried again at ${key.coolingUntil}.`
            : "Hit a limit; tried again soon.";
    if (key.state === "invalid") return "The provider refused this key. Add a new one.";
    if (key.state === "disabled") return "Not used until it is switched on.";
    return "Used for this team's turns.";
}

/**
 * A provider's team keys on a Happy Cloud server, and the form that adds one.
 * The draft lives here only while the form is open: the key goes straight to
 * the server and is never shown again.
 */
function HappyAgentProviderKeyList(props: {
    readonly providerId: string;
    readonly providerName: string;
    readonly keys: HappyAgentProviderKeys;
    readonly unavailable: boolean;
    readonly onKeyAdd?: (providerId: string, input: HappyAgentProviderKeyInput) => Promise<void>;
    readonly onKeyEnabledChange?: (providerId: string, keyId: string, enabled: boolean) => void;
    readonly onKeyRemove?: (providerId: string, keyId: string) => void;
}) {
    const [draft, setDraft] = useState<KeyDraft | undefined>(undefined);
    const submit = (): void => {
        if (!draft || draft.busy || !props.onKeyAdd) return;
        const input = keyInput(draft, props.keys.aws === true);
        if (typeof input === "string") {
            setDraft({ ...draft, error: input });
            return;
        }
        setDraft({ ...draft, busy: true, error: undefined });
        void props.onKeyAdd(props.providerId, input).then(
            () => setDraft(undefined),
            (error: unknown) =>
                setDraft((current) =>
                    current
                        ? {
                              ...current,
                              busy: false,
                              error: error instanceof Error ? error.message : String(error),
                          }
                        : current,
                ),
        );
    };
    return (
        <Box
            className="happy-agent-provider__keys"
            data-happy-desktop-ui="happy-agent-provider-keys"
        >
            {props.keys.source === "operator" && props.keys.list.length === 0 ? (
                <span className="happy-agent-provider__keys-note">
                    Happy Cloud provides this one. Add a team key to use your own account.
                </span>
            ) : null}
            {props.keys.list.map((key) => (
                <Box
                    className="happy-agent-provider__key"
                    data-happy-desktop-ui="happy-agent-provider-key"
                    data-state={key.state}
                    key={key.id}
                >
                    <Icon name="lock" size={14} />
                    <Box className="happy-agent-provider__model-text">
                        <span className="happy-agent-provider__model-name">{key.label}</span>
                        <span className="happy-agent-provider__key-meta">{keyMeta(key)}</span>
                    </Box>
                    <HappyAgentSettingsStatus
                        label={KEY_STATE_LABELS[key.state]}
                        variant={KEY_STATE_VARIANTS[key.state]}
                    />
                    {key.saving ? <Spinner size={16} /> : null}
                    <Switch
                        aria-label={`${key.label} enabled`}
                        checked={key.enabled}
                        disabled={props.unavailable || key.saving || !props.onKeyEnabledChange}
                        onChange={(enabled) =>
                            props.onKeyEnabledChange?.(props.providerId, key.id, enabled)
                        }
                    />
                    <Button
                        aria-label={`Remove ${key.label}`}
                        disabled={props.unavailable || key.saving || !props.onKeyRemove}
                        icon="trash"
                        iconOnly
                        onClick={() => props.onKeyRemove?.(props.providerId, key.id)}
                        size="small"
                        variant="ghost"
                    />
                </Box>
            ))}
            {props.keys.addable && props.onKeyAdd ? (
                draft ? (
                    <Box
                        className="happy-agent-provider__key-form"
                        data-happy-desktop-ui="happy-agent-provider-key-form"
                    >
                        <TextField
                            autoFocus
                            disabled={draft.busy}
                            label="Name"
                            onSubmit={submit}
                            onValueChange={(label) => setDraft({ ...draft, label })}
                            placeholder="Team key"
                            size="small"
                            value={draft.label}
                        />
                        {props.keys.aws ? (
                            <SegmentedControl
                                aria-label="Kind of key"
                                disabled={draft.busy}
                                onChange={(kind) =>
                                    setDraft({
                                        ...draft,
                                        kind: kind === "aws" ? "aws" : "apiKey",
                                        error: undefined,
                                    })
                                }
                                segments={[
                                    { value: "apiKey", label: "API key" },
                                    { value: "aws", label: "Access keys" },
                                ]}
                                size="small"
                                value={draft.kind}
                            />
                        ) : null}
                        {draft.kind === "apiKey" ? (
                            <TextField
                                autoComplete="off"
                                disabled={draft.busy}
                                label="API key"
                                onSubmit={submit}
                                onValueChange={(apiKey) => setDraft({ ...draft, apiKey })}
                                size="small"
                                type="password"
                                value={draft.apiKey}
                            />
                        ) : (
                            <>
                                <TextField
                                    autoComplete="off"
                                    disabled={draft.busy}
                                    label="Access key ID"
                                    onSubmit={submit}
                                    onValueChange={(accessKeyId) =>
                                        setDraft({ ...draft, accessKeyId })
                                    }
                                    size="small"
                                    value={draft.accessKeyId}
                                />
                                <TextField
                                    autoComplete="off"
                                    disabled={draft.busy}
                                    label="Secret access key"
                                    onSubmit={submit}
                                    onValueChange={(secretAccessKey) =>
                                        setDraft({ ...draft, secretAccessKey })
                                    }
                                    size="small"
                                    type="password"
                                    value={draft.secretAccessKey}
                                />
                                <TextField
                                    autoComplete="off"
                                    disabled={draft.busy}
                                    hint="Optional. Only for temporary credentials."
                                    label="Session token"
                                    onSubmit={submit}
                                    onValueChange={(sessionToken) =>
                                        setDraft({ ...draft, sessionToken })
                                    }
                                    size="small"
                                    type="password"
                                    value={draft.sessionToken}
                                />
                            </>
                        )}
                        {props.keys.aws ? (
                            <TextField
                                disabled={draft.busy}
                                hint="Optional. Applies to every Bedrock key on this server."
                                label="AWS region"
                                onSubmit={submit}
                                onValueChange={(region) => setDraft({ ...draft, region })}
                                placeholder="us-east-1"
                                size="small"
                                value={draft.region}
                            />
                        ) : null}
                        {draft.error ? (
                            <span
                                className="happy-agent-provider__key-error"
                                data-happy-desktop-ui="happy-agent-provider-key-error"
                                role="alert"
                            >
                                {draft.error}
                            </span>
                        ) : null}
                        <Box className="happy-agent-provider__key-actions">
                            <Button
                                disabled={draft.busy}
                                onClick={() => setDraft(undefined)}
                                size="small"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button
                                loading={draft.busy}
                                onClick={submit}
                                size="small"
                                variant="primary"
                            >
                                Add key
                            </Button>
                        </Box>
                    </Box>
                ) : (
                    <Box className="happy-agent-provider__key-add">
                        <Button
                            aria-label={`Add an API key for ${props.providerName}`}
                            disabled={props.unavailable}
                            icon="plus"
                            onClick={() => setDraft(KEY_DRAFT_EMPTY)}
                            size="small"
                            variant="secondary"
                        >
                            Add API key
                        </Button>
                    </Box>
                )
            ) : null}
        </Box>
    );
}

/**
 * A provider's team subscription on a Happy Cloud server: who it is signed in
 * as, or the sign-in that is under way. Codex confirms a code on any device;
 * Claude opens a page that shows a code to paste back here.
 */
function HappyAgentProviderSubscription(props: {
    readonly providerId: string;
    readonly subscription: HappyAgentProviderSubscriptionRow;
    readonly unavailable: boolean;
    readonly onSignIn?: (providerId: string) => void;
    readonly onCodeSubmit?: (providerId: string, code: string) => Promise<void>;
    readonly onCancel?: (providerId: string) => void;
    readonly onSignOut?: (providerId: string) => void;
    readonly onExternalOpen?: (url: string) => void;
}) {
    const [code, setCode] = useState("");
    const [codeError, setCodeError] = useState<string | undefined>(undefined);
    const subscription = props.subscription;
    const signIn = subscription.signIn;
    const active = signIn?.status === "running" || signIn?.status === "waiting";
    const authorization = signIn?.status === "waiting" ? signIn.authorization : undefined;
    const busy = props.unavailable || subscription.pending === true;
    const open = (url: string): void => {
        if (props.onExternalOpen) props.onExternalOpen(url);
        else window.open(url, "_blank", "noopener,noreferrer");
    };
    const codeSubmit = (): void => {
        const trimmed = code.trim();
        if (!trimmed || busy || !props.onCodeSubmit) return;
        setCodeError(undefined);
        void props.onCodeSubmit(props.providerId, trimmed).then(
            () => setCode(""),
            (error: unknown) =>
                setCodeError(error instanceof Error ? error.message : String(error)),
        );
    };
    return (
        <Box
            className="happy-agent-provider__keys"
            data-happy-desktop-ui="happy-agent-provider-subscription"
        >
            {active ? (
                <Box className="happy-agent-provider__key-form">
                    <Box className="happy-agent-provider__subscription-step">
                        {signIn.status === "running" ? <Spinner size={16} /> : null}
                        <span className="happy-agent-provider__model-name">{signIn.message}</span>
                    </Box>
                    {authorization?.method === "device" ? (
                        <>
                            <span className="happy-agent-provider__key-meta">
                                Open the page on any device and enter this code. Anyone on the team
                                can use the subscription once it is signed in.
                            </span>
                            {authorization.userCode ? (
                                <Box className="happy-agent-provider__subscription-code">
                                    <span data-happy-desktop-ui="happy-agent-provider-user-code">
                                        {authorization.userCode}
                                    </span>
                                    <CopyButton label="Copy code" text={authorization.userCode} />
                                </Box>
                            ) : null}
                        </>
                    ) : authorization ? (
                        <span className="happy-agent-provider__key-meta">
                            Sign in on the page, then paste the code it shows here. Anyone on the
                            team can use the subscription once it is signed in.
                        </span>
                    ) : null}
                    {authorization?.acceptsCode ? (
                        <TextField
                            autoComplete="off"
                            disabled={busy}
                            label="Code from the page"
                            onSubmit={codeSubmit}
                            onValueChange={(value) => {
                                setCode(value);
                                setCodeError(undefined);
                            }}
                            size="small"
                            type="password"
                            value={code}
                            {...(codeError ? { error: codeError } : {})}
                        />
                    ) : null}
                    <Box className="happy-agent-provider__key-actions">
                        <Button
                            disabled={busy || !props.onCancel}
                            onClick={() => props.onCancel?.(props.providerId)}
                            size="small"
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        {authorization ? (
                            <Button
                                icon="open-external"
                                onClick={() => open(authorization.url)}
                                size="small"
                                variant={authorization.acceptsCode ? "secondary" : "primary"}
                            >
                                Open sign-in page
                            </Button>
                        ) : null}
                        {authorization?.acceptsCode ? (
                            <Button
                                disabled={!code.trim()}
                                loading={subscription.pending === true}
                                onClick={codeSubmit}
                                size="small"
                                variant="primary"
                            >
                                Finish sign-in
                            </Button>
                        ) : null}
                    </Box>
                </Box>
            ) : subscription.signedIn ? (
                <Box className="happy-agent-provider__key" data-state="ready">
                    <Icon name="users" size={14} />
                    <Box className="happy-agent-provider__model-text">
                        <span className="happy-agent-provider__model-name">
                            {subscription.account ?? `Signed in to ${subscription.name}`}
                        </span>
                        <span className="happy-agent-provider__key-meta">
                            The team's subscription. Every agent on this server can use it.
                        </span>
                    </Box>
                    <Button
                        disabled={busy || !props.onSignIn}
                        onClick={() => props.onSignIn?.(props.providerId)}
                        size="small"
                        variant="ghost"
                    >
                        Switch account
                    </Button>
                    <Button
                        disabled={busy || !props.onSignOut}
                        onClick={() => props.onSignOut?.(props.providerId)}
                        size="small"
                        variant="danger"
                    >
                        Sign out
                    </Button>
                </Box>
            ) : (
                <Box className="happy-agent-provider__key-add">
                    <Box className="happy-agent-provider__model-text">
                        {signIn?.status === "failed" ? (
                            <span
                                className="happy-agent-provider__key-error"
                                data-happy-desktop-ui="happy-agent-provider-key-error"
                                role="alert"
                            >
                                {signIn.error ?? signIn.message}
                            </span>
                        ) : (
                            <span className="happy-agent-provider__key-meta">
                                Sign in with the team's {subscription.name} subscription so every
                                agent on this server can use it.
                            </span>
                        )}
                    </Box>
                    <Button
                        disabled={busy || !props.onSignIn}
                        loading={subscription.pending === true}
                        onClick={() => props.onSignIn?.(props.providerId)}
                        size="small"
                        variant="secondary"
                    >
                        {signIn?.status === "failed"
                            ? "Try again"
                            : `Sign in to ${subscription.name}`}
                    </Button>
                </Box>
            )}
        </Box>
    );
}

interface KeyDraft {
    readonly kind: "apiKey" | "aws";
    readonly label: string;
    readonly apiKey: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken: string;
    readonly region: string;
    readonly busy: boolean;
    readonly error?: string;
}

const KEY_DRAFT_EMPTY: KeyDraft = {
    kind: "apiKey",
    label: "",
    apiKey: "",
    accessKeyId: "",
    secretAccessKey: "",
    sessionToken: "",
    region: "",
    busy: false,
};

/** What the draft sends, or what is still missing from it. */
function keyInput(draft: KeyDraft, aws: boolean): HappyAgentProviderKeyInput | string {
    const label = draft.label.trim() || "Team key";
    const region = aws ? draft.region.trim() : "";
    const regioned = region ? { region } : {};
    if (draft.kind === "apiKey") {
        const apiKey = draft.apiKey.trim();
        if (!apiKey) return "Paste the API key.";
        return { kind: "apiKey", label, apiKey, ...regioned };
    }
    const accessKeyId = draft.accessKeyId.trim();
    const secretAccessKey = draft.secretAccessKey.trim();
    const sessionToken = draft.sessionToken.trim();
    if (!accessKeyId || !secretAccessKey)
        return "Paste the access key ID and the secret access key.";
    return {
        kind: "aws",
        label,
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
        ...regioned,
    };
}

function providerMeta(provider: HappyAgentProviderRow): string {
    const models = `${provider.models.length} ${provider.models.length === 1 ? "model" : "models"}`;
    return [models, provider.serviceTiers.join(", ")].filter(Boolean).join(" · ");
}

function modelMeta(model: HappyAgentProviderModelRow): string {
    const parts = [model.modelId];
    if (model.contextWindow !== undefined)
        parts.push(`${Math.round(model.contextWindow / 1000)}K context`);
    if (model.efforts.length > 0) parts.push(model.efforts.join(" · "));
    return parts.join("  —  ");
}
