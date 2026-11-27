import { useState, type ReactNode } from "react";
import type { BadgeVariant } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import {
    claudeSetupTokenNormalize,
    ClaudeSetupTokenSteps,
    type ClaudeSetupTokenDialogProps,
} from "../../ClaudeSetupTokenDialog";
import { TextField } from "../../TextField";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { IconTile, type IconTileProps } from "../../IconTile";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import {
    HAPPY_AGENT_CUSTOM_PROVIDER_PROTOCOL_LABELS,
    happyAgentCustomProviderProtocolOffered,
    type HappyAgentCustomProviderProtocolId,
} from "./HappyAgentCustomProviderDialog";
import {
    happyAgentProviderAccountLine,
    type HappyAgentProviderAccountActivity,
    type HappyAgentProviderAccountLine,
} from "./happyAgentProviderAccountStatus";
import {
    HAPPY_AGENT_PROVIDER_PROGRAM_NAMES,
    HappyAgentProviderLogin,
    happyAgentProviderSignInStep,
    type HappyAgentProviderSignInDialogProps,
    type HappyAgentProviderSignInRow,
} from "./HappyAgentProviderSignIn";
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

/** The keys a Happy Cloud team keeps for one of its own providers. */
export interface HappyAgentProviderKeys {
    readonly list: readonly HappyAgentProviderKeyRow[];
    /** Whether a key can be added here. */
    readonly addable: boolean;
    /** Whose key answers now: the team's, Happy Cloud's, or nobody's. */
    readonly source: "tenant" | "operator" | null;
}

/** What adding a key sends. */
export interface HappyAgentProviderKeyInput {
    readonly label: string;
    readonly apiKey: string;
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
    /** The keys of one of a Happy Cloud team's own providers. */
    readonly keys?: HappyAgentProviderKeys;
    /** A provider the team added itself, with the protocol it speaks. */
    readonly custom?: { readonly protocol: HappyAgentCustomProviderProtocolId };
    /** A Codex, Claude, or Grok account's credential, where the daemon can sign it in. */
    readonly signIn?: HappyAgentProviderSignInRow;
    /** The vendor's own mark, for a provider that is one vendor's account. */
    readonly mark?: "openai" | "claude" | "grok";
    /** The plan the account is on, such as "Pro", when the vendor said. */
    readonly plan?: string;
    /**
     * How a Codex, Claude, or Grok account has been doing. Absent for any other
     * provider, which the list sums up by its models instead.
     */
    readonly activity?: HappyAgentProviderAccountActivity;
}

/** The Claude setup token dialog, while one account's token is being updated. */
export type HappyAgentProviderTokenEditorProps = Pick<
    ClaudeSetupTokenDialogProps,
    "shell" | "phase" | "error" | "onClose" | "onTokenSubmit"
> & {
    /** The account whose token is being replaced, by id. */
    readonly providerId: string;
};

export type HappyAgentProviderSettingsProps = {
    providers: readonly HappyAgentProviderRow[];
    loading?: boolean;
    error?: string;
    /** Why the last provider change was refused. */
    saveError?: string;
    /** Why model enablement cannot currently be changed. */
    unavailable?: string;
    /** The time the lines are told against, in milliseconds, from a ticking clock. */
    currentTime: number;
    /** The account whose details are open, by id. */
    detail?: string;
    /** Leaves the accounts switched off out of the list, as a Happy Agent does. */
    hideDisabled?: boolean;
    onDetailOpen?: (providerId: string) => void;
    onDetailClose?: () => void;
    onModelEnabledChange: (id: string, enabled: boolean) => void;
    /** Switches one whole provider on or off for the machine. */
    onProviderEnabledChange: (id: string, enabled: boolean) => void;
    /** Adds a team key; rejects with the reason to show in the form. */
    onKeyAdd?: (providerId: string, input: HappyAgentProviderKeyInput) => Promise<void>;
    onKeyEnabledChange?: (providerId: string, keyId: string, enabled: boolean) => void;
    onKeyRemove?: (providerId: string, keyId: string) => void;
    /** Opens the dialog that adds a provider of the team's own; absent when the reader may not. */
    onCustomProviderCreate?: () => void;
    /** Opens one of the team's own providers for editing; absent when the reader may not. */
    onCustomProviderEdit?: (providerId: string) => void;
    /** Why only the team owner may change how accounts sign in, once that is known. */
    signInLocked?: string;
    /** Starts an account's sign-in, or opens the one already running, in its dialog. */
    onSignIn?: (providerId: string) => void;
    onTokenEditorOpen?: (providerId: string) => void;
    /** The sign-in dialog, while it is open. */
    signInDialog?: HappyAgentProviderSignInDialogProps;
    /** The setup token dialog, while it is open. */
    tokenEditor?: HappyAgentProviderTokenEditorProps;
};

const STATUS_LABELS: Record<HappyAgentProviderStatus, string> = {
    ready: "Connected",
    not_authenticated: "Not signed in",
    not_enabled: "Off",
    no_models: "No models",
};

/** What has to happen in Happy Agent itself before the provider's models become usable. */
const STATUS_HINTS: Partial<Record<HappyAgentProviderStatus, string>> = {
    not_authenticated: "Sign it in from Happy Agent to use its models.",
    not_enabled: "No agent on this machine may use it.",
};

const MARK_TONES: Record<NonNullable<HappyAgentProviderRow["mark"]>, IconTileProps["tone"]> = {
    openai: "green",
    claude: "orange",
    grok: "gray",
};

/**
 * The Inference category: one row per account, saying only whether it needs
 * anything. Everything else about an account — its login, its models, its
 * keys — opens behind its row, and signing it in again runs as a step of
 * that, in place of the details until it ends.
 */
export function HappyAgentProviderSettings(props: HappyAgentProviderSettingsProps) {
    if (props.error)
        return (
            <Banner tone="danger" title="Inference unavailable">
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
                description="This Happy Agent reports no accounts to run on yet."
                icon="globe"
                title="No accounts"
            />
        );
    const now = props.currentTime;
    // An account switched off leaves a Happy Agent's list, but its sheet still
    // finds it, so switching it off does not close the sheet.
    const listed = props.hideDisabled
        ? props.providers.filter((provider) => provider.enabled)
        : props.providers;
    // The sheet is about one account, whichever step it is on.
    const sheetId = props.detail ?? props.signInDialog?.providerId ?? props.tokenEditor?.providerId;
    const sheet =
        sheetId === undefined
            ? undefined
            : props.providers.find((provider) => provider.id === sheetId);
    return (
        <>
            {props.unavailable ? (
                <Banner tone="neutral" title="Happy Agent reconnecting">
                    {props.unavailable}
                </Banner>
            ) : null}
            {props.saveError && !sheet ? (
                <Banner tone="danger" title="Account unchanged">
                    {props.saveError}
                </Banner>
            ) : null}
            {listed.length === 0 ? (
                <EmptyState
                    description="Every account on this Happy Agent is switched off."
                    icon="globe"
                    title="No accounts"
                />
            ) : (
                <HappyAgentSettingsSection
                    description="Each account agents here can run on. Open one to see its login and models."
                    title="Accounts"
                >
                    {listed.map((provider) => {
                        const line = providerLine(provider, now);
                        return (
                            <Box
                                className="happy-agent-provider-list__item"
                                data-happy-desktop-ui="happy-agent-provider"
                                data-status={provider.status}
                                key={provider.id}
                            >
                                <button
                                    aria-label={`${providerTitle(provider)}, ${line.text}`}
                                    className="happy-agent-provider-list__row"
                                    onClick={() => props.onDetailOpen?.(provider.id)}
                                    type="button"
                                >
                                    <ProviderTile provider={provider} />
                                    <span className="happy-agent-provider-list__text">
                                        <span
                                            className="happy-agent-provider-list__name"
                                            data-happy-desktop-ui="happy-agent-provider-name"
                                        >
                                            {providerTitle(provider)}
                                        </span>
                                        <span
                                            className="happy-agent-provider-list__line"
                                            data-happy-desktop-ui="happy-agent-provider-meta"
                                            data-tone={line.tone}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="happy-agent-provider-list__dot"
                                                data-tone={line.tone}
                                            />
                                            <span className="happy-agent-provider-list__line-text">
                                                {line.text}
                                            </span>
                                        </span>
                                    </span>
                                    {provider.saving || provider.signIn?.running ? (
                                        <Spinner size={14} />
                                    ) : null}
                                    <Icon name="chevron-right" size={14} />
                                </button>
                            </Box>
                        );
                    })}
                </HappyAgentSettingsSection>
            )}
            {props.onCustomProviderCreate ? (
                <Box className="happy-agent-provider__add">
                    <Button
                        disabled={props.unavailable !== undefined}
                        icon="plus"
                        onClick={props.onCustomProviderCreate}
                        size="small"
                        variant="secondary"
                    >
                        Add an account
                    </Button>
                    <span className="happy-agent-provider__add-note">
                        Any endpoint that speaks the OpenAI Responses API, such as vLLM or a
                        gateway.
                    </span>
                </Box>
            ) : null}
            {sheet ? (
                <HappyAgentProviderSheet
                    line={providerLine(sheet, now)}
                    now={now}
                    provider={sheet}
                    settings={props}
                />
            ) : null}
        </>
    );
}

/** "personal_steve · Codex · Pro": the account, its service, and its plan. */
function providerTitle(provider: HappyAgentProviderRow): string {
    return [provider.name, provider.typeName, provider.plan].filter(Boolean).join(" · ");
}

/**
 * The line under an account's name. A provider that is not one vendor's
 * account, such as a pool or a team's own endpoint, keeps its summary.
 */
function providerLine(provider: HappyAgentProviderRow, now: number): HappyAgentProviderAccountLine {
    if (provider.activity)
        return happyAgentProviderAccountLine(provider.enabled, provider.activity, now);
    if (!provider.enabled) return { tone: "off", text: "Off" };
    const summary = providerMeta(provider);
    return {
        tone:
            provider.status === "ready"
                ? "ok"
                : provider.status === "not_authenticated"
                  ? "danger"
                  : "unknown",
        text:
            provider.status === "ready"
                ? summary
                : [STATUS_LABELS[provider.status], summary].filter(Boolean).join(" · "),
    };
}

function ProviderTile(props: { readonly provider: HappyAgentProviderRow }) {
    return props.provider.mark ? (
        <IconTile mark={props.provider.mark} tone={MARK_TONES[props.provider.mark]} />
    ) : (
        <IconTile icon="globe" tone="indigo" />
    );
}

/**
 * One account behind its row, as an iPad form sheet: one fixed frame whose
 * header says who the account is and switches it on or off, and whose body
 * shows its details, or signing it in again, or updating its token, as steps
 * pushed in the same frame. Nothing in the frame changes size between
 * accounts, states, or steps; only the body scrolls.
 */
function HappyAgentProviderSheet(props: {
    readonly provider: HappyAgentProviderRow;
    readonly line: HappyAgentProviderAccountLine;
    readonly now: number;
    readonly settings: HappyAgentProviderSettingsProps;
}) {
    const { provider, settings } = props;
    // Drafts are held only while typed, and go straight to the handler.
    const [code, codeSet] = useState("");
    const [token, tokenSet] = useState("");
    const unavailable = settings.unavailable !== undefined;
    const signInDialog = settings.signInDialog;
    const tokenEditor = settings.tokenEditor;
    const step = signInDialog ? "sign-in" : tokenEditor ? "token" : "details";
    const back = (): void => {
        codeSet("");
        tokenSet("");
        if (signInDialog) signInDialog.onClose();
        else tokenEditor?.onClose();
    };
    // Closing from any step closes the sheet; a running sign-in is cancelled with it.
    const close = (): void => {
        if (step !== "details") back();
        settings.onDetailClose?.();
    };
    const parts =
        signInDialog !== undefined
            ? happyAgentProviderSignInStep(signInDialog, code, codeSet)
            : tokenEditor !== undefined
              ? tokenStep(tokenEditor, token, tokenSet, back)
              : detailsStep(provider, settings, props.now);
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                className="happy-agent-provider-sheet"
                data-step={step}
                data-testid="provider-detail-dialog"
                footer={parts.footer}
                backLabel={`Back to ${provider.name}`}
                leading={<ProviderTile provider={provider} />}
                {...(step === "details" ? {} : { onBack: back })}
                onClose={close}
                size="sheet"
                subheader={
                    <Box className="happy-agent-provider-sheet__identity">
                        <Box className="happy-agent-provider__naming">
                            <span className="happy-agent-provider__name">
                                {[provider.typeName ?? provider.name, provider.plan]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                            <span
                                className="happy-agent-provider-list__line"
                                data-tone={props.line.tone}
                                title={props.line.text}
                            >
                                <span
                                    aria-hidden="true"
                                    className="happy-agent-provider-list__dot"
                                    data-tone={props.line.tone}
                                />
                                <span className="happy-agent-provider-list__line-text">
                                    {props.line.text}
                                </span>
                            </span>
                        </Box>
                        {provider.saving ? <Spinner size={16} /> : null}
                        <Switch
                            aria-label={`${provider.typeName ? `${provider.typeName} · ` : ""}${provider.name} enabled`}
                            checked={provider.enabled}
                            disabled={unavailable || provider.saving}
                            onChange={(enabled) =>
                                settings.onProviderEnabledChange(provider.id, enabled)
                            }
                        />
                    </Box>
                }
                title={
                    step === "sign-in"
                        ? `Sign in · ${provider.name}`
                        : step === "token"
                          ? `Update token · ${provider.name}`
                          : provider.name
                }
            >
                {/* A new step cross-fades in; the frame around it stays put. */}
                <Box className="happy-agent-provider-sheet__step" key={step}>
                    {parts.body}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

/** The account's details: a notice line, Login, Models, and its keys. */
function detailsStep(
    provider: HappyAgentProviderRow,
    settings: HappyAgentProviderSettingsProps,
    now: number,
): { readonly body: ReactNode; readonly footer: ReactNode } {
    const unavailable = settings.unavailable !== undefined;
    const hint = providerHint(provider);
    const signIn = provider.signIn;
    const changeable = signIn !== undefined && (signIn.acceptsToken || signIn.methods.length > 0);
    const blocked = unavailable || settings.signInLocked !== undefined;
    const notice =
        (settings.saveError ? `Account unchanged: ${settings.saveError}` : undefined) ??
        (settings.signInLocked && changeable ? settings.signInLocked : undefined) ??
        (signIn && !signIn.installed && signIn.methods.length > 0
            ? `${HAPPY_AGENT_PROVIDER_PROGRAM_NAMES[signIn.cli]} isn’t installed on the Happy Agent’s computer.`
            : undefined) ??
        "";
    const needsSignIn =
        provider.activity?.signIn === "signed_out" ||
        provider.activity?.login?.refreshError?.permanent === true;
    return {
        footer: (
            <>
                {provider.custom && settings.onCustomProviderEdit ? (
                    <Button
                        disabled={unavailable}
                        icon="edit"
                        onClick={() => settings.onCustomProviderEdit?.(provider.id)}
                        variant="ghost"
                    >
                        Edit account
                    </Button>
                ) : null}
                {signIn?.acceptsToken ? (
                    <Button
                        aria-label={`Update the token for ${provider.name}`}
                        disabled={blocked || signIn.running === true}
                        onClick={() => settings.onTokenEditorOpen?.(provider.id)}
                        variant="ghost"
                    >
                        Update token
                    </Button>
                ) : null}
                {signIn && signIn.methods.length > 0 ? (
                    <Button
                        aria-label={`Sign ${provider.name} in again`}
                        disabled={blocked || !signIn.installed}
                        onClick={() => settings.onSignIn?.(provider.id)}
                        variant={needsSignIn ? "primary" : "secondary"}
                    >
                        {signIn.running ? "Continue sign-in" : "Sign in again"}
                    </Button>
                ) : null}
                <Button
                    onClick={() => settings.onDetailClose?.()}
                    variant={changeable ? "ghost" : "primary"}
                >
                    Done
                </Button>
            </>
        ),
        body: (
            <Box className="happy-agent-provider-sheet__body">
                {/* One line, always there, so a refusal or a note never moves what is under it. */}
                <span
                    className="happy-agent-provider-sheet__notice"
                    data-tone={settings.saveError ? "danger" : "neutral"}
                    title={notice}
                >
                    {notice}
                </span>
                {signIn || provider.activity ? (
                    <section className="happy-agent-provider-sheet__section">
                        <h3 className="happy-agent-provider-sheet__heading">Login</h3>
                        <HappyAgentProviderLogin
                            now={now}
                            {...(signIn ? { signIn } : {})}
                            {...(provider.activity ? { activity: provider.activity } : {})}
                        />
                    </section>
                ) : null}
                <section
                    className="happy-agent-provider-sheet__section"
                    data-status={provider.status}
                >
                    <h3 className="happy-agent-provider-sheet__heading">Models</h3>
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
                                        unavailable ||
                                        model.isDefault ||
                                        provider.status !== "ready"
                                    }
                                    onChange={(enabled) =>
                                        settings.onModelEnabledChange(model.id, enabled)
                                    }
                                />
                            </Box>
                        ))}
                        {provider.models.length === 0 ? (
                            <span
                                className="happy-agent-provider__models-empty"
                                data-happy-desktop-ui="happy-agent-provider-models-empty"
                            >
                                This account offers no models right now.
                            </span>
                        ) : null}
                    </Box>
                    <p
                        className="happy-agent-provider__hint"
                        data-happy-desktop-ui="happy-agent-provider-hint"
                    >
                        {hint ?? "Off for a model only hides it from this window’s pickers."}
                    </p>
                </section>
                {provider.keys ? (
                    <section className="happy-agent-provider-sheet__section">
                        <h3 className="happy-agent-provider-sheet__heading">API keys</h3>
                        <HappyAgentProviderKeyList
                            keys={provider.keys}
                            providerId={provider.id}
                            providerName={provider.name}
                            unavailable={unavailable}
                            {...(settings.onKeyAdd ? { onKeyAdd: settings.onKeyAdd } : {})}
                            {...(settings.onKeyEnabledChange
                                ? { onKeyEnabledChange: settings.onKeyEnabledChange }
                                : {})}
                            {...(settings.onKeyRemove ? { onKeyRemove: settings.onKeyRemove } : {})}
                        />
                    </section>
                ) : null}
            </Box>
        ),
    };
}

/** Pasting a new Claude setup token, as a step of the account's sheet. */
function tokenStep(
    editor: HappyAgentProviderTokenEditorProps,
    token: string,
    tokenSet: (token: string) => void,
    back: () => void,
): { readonly body: ReactNode; readonly footer: ReactNode } {
    const saving = editor.phase === "saving";
    const normalized = claudeSetupTokenNormalize(token);
    const submit = (): void => {
        if (!normalized || saving) return;
        editor.onTokenSubmit(normalized);
    };
    return {
        footer: (
            <>
                <Button disabled={saving} onClick={back} variant="ghost">
                    Back
                </Button>
                <Button
                    disabled={!normalized || saving}
                    loading={saving}
                    onClick={submit}
                    variant="primary"
                >
                    Update token
                </Button>
            </>
        ),
        body: (
            <ClaudeSetupTokenSteps
                {...(editor.error === undefined ? {} : { error: editor.error })}
                lead="Paste a new setup token for this account. Happy uses it instead of the system login."
                onSubmit={submit}
                phase={editor.phase}
                shell={editor.shell}
                token={token}
                tokenSet={tokenSet}
            />
        ),
    };
}

/**
 * What the reader has to do before a provider's models work. On a Happy Cloud
 * server a provider that takes a key and has none waits for one, rather than
 * for a sign-in on some machine.
 */
function providerHint(provider: HappyAgentProviderRow): string | undefined {
    if (provider.custom && !happyAgentCustomProviderProtocolOffered(provider.custom.protocol))
        return `Happy Cloud doesn’t serve ${HAPPY_AGENT_CUSTOM_PROVIDER_PROTOCOL_LABELS[provider.custom.protocol]} yet, so this account offers no models.`;
    if (provider.keys?.addable && provider.keys.source === null)
        return "Add a team API key to use its models.";
    if (provider.keys) return undefined;
    // An account that can sign in here says how under its name instead.
    if (provider.status === "not_authenticated" && provider.signIn?.methods.length)
        return undefined;
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
    if (key.state === "invalid") return "The service refused this key. Add a new one.";
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
        const input = keyInput(draft);
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

interface KeyDraft {
    readonly label: string;
    readonly apiKey: string;
    readonly busy: boolean;
    readonly error?: string;
}

const KEY_DRAFT_EMPTY: KeyDraft = { label: "", apiKey: "", busy: false };

/** What the draft sends, or what is still missing from it. */
function keyInput(draft: KeyDraft): HappyAgentProviderKeyInput | string {
    const apiKey = draft.apiKey.trim();
    if (!apiKey) return "Paste the API key.";
    return { label: draft.label.trim() || "Team key", apiKey };
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
