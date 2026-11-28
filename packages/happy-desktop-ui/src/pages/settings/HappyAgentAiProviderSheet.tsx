import { useState } from "react";
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
    /** Whether a key or token can be typed again to replace it; a sign-in cannot. */
    readonly replaceable: boolean;
}

/** What the sheet shows: the provider's tokens, one of them to edit, or its name. */
export type HappyAgentAiProviderSheetView =
    | { readonly kind: "credentials" }
    | { readonly kind: "credential"; readonly credentialId: string }
    | { readonly kind: "rename" };

export interface HappyAgentAiProviderSheetProps {
    readonly name: string;
    readonly tile: IconTileProps;
    /** Whose it is and how many tokens it holds, already worded: "Team · 2 tokens". */
    readonly meta: string;
    readonly view: HappyAgentAiProviderSheetView;
    /** Its tokens, where the reader may see them. */
    readonly credentials?: readonly HappyAgentAiProviderCredentialRow[];
    /** Why the tokens are not listed, such as only managers seeing the team's. */
    readonly credentialsHidden?: string;
    /** Whether the reader may edit its tokens; each then opens on its own. */
    readonly editable: boolean;
    /** A change made in the sheet is out. */
    readonly busy?: boolean;
    readonly error?: { readonly title: string; readonly message: string };
    onClose: () => void;
    onBack: () => void;
    onCredentialOpen: (credentialId: string) => void;
    onCredentialSave: (changes: { readonly label: string; readonly secret?: string }) => void;
    onCredentialEnabledChange: (credentialId: string, enabled: boolean) => void;
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

function credentialMeta(credential: HappyAgentAiProviderCredentialRow): string {
    return credential.state === "cooling" && credential.coolingUntil
        ? `${credential.meta} · Tried again at ${credential.coolingUntil}`
        : credential.meta;
}

/** What is typed in a step, held only while that step is open. */
interface Draft {
    /** The step the draft belongs to; another step starts from what is stored. */
    readonly step: string;
    readonly label: string;
    readonly secret: string;
    readonly name: string;
}

/**
 * One provider behind its row: its tokens as a list, and each token opened
 * on its own to rename it, replace its key, switch it off or remove it. A
 * named provider's name is changed the same way. Every step is shown in the
 * same card; Back returns to the list.
 */
export function HappyAgentAiProviderSheet(props: HappyAgentAiProviderSheetProps) {
    const view = props.view;
    const credential =
        view.kind === "credential"
            ? props.credentials?.find((entry) => entry.id === view.credentialId)
            : undefined;
    const step =
        view.kind === "credential" && credential
            ? `credential:${credential.id}`
            : view.kind === "rename"
              ? "rename"
              : "credentials";
    const [held, setDraft] = useState<Draft | undefined>(undefined);
    const draft: Draft =
        held?.step === step
            ? held
            : { step, label: credential?.label ?? "", secret: "", name: props.name };
    const update = (change: Partial<Omit<Draft, "step">>): void =>
        setDraft({ ...draft, ...change });
    const busy = props.busy === true;
    const close = (): void => {
        if (!busy) props.onClose();
    };
    const credentialSave = (): void => {
        if (busy || !credential) return;
        props.onCredentialSave({
            label: draft.label,
            ...(credential.replaceable && draft.secret.trim() !== ""
                ? { secret: draft.secret }
                : {}),
        });
    };
    const nameSave = (): void => {
        if (!busy && draft.name.trim() !== "") props.onNameSave(draft.name);
    };
    const error = props.error ? (
        <Banner tone="danger" title={props.error.title}>
            {props.error.message}
        </Banner>
    ) : null;
    const parts = credential
        ? {
              title: credential.label,
              footer: (
                  <>
                      <Button
                          disabled={busy || credential.saving === true}
                          onClick={() => props.onCredentialRemove(credential.id)}
                          variant="ghost"
                      >
                          Remove
                      </Button>
                      <Button loading={busy} onClick={credentialSave}>
                          Save
                      </Button>
                  </>
              ),
              body: (
                  <>
                      <span className="happy-agent-ai-provider-sheet__meta">
                          {`${props.name} · ${credentialMeta(credential)}`}
                      </span>
                      {error}
                      <TextField
                          autoFocus
                          disabled={busy}
                          fullWidth
                          label="Name"
                          onSubmit={credentialSave}
                          onValueChange={(label) => update({ label })}
                          value={draft.label}
                      />
                      {credential.replaceable ? (
                          <TextField
                              autoComplete="off"
                              disabled={busy}
                              fullWidth
                              hint="Leave empty to keep the current one."
                              label="Replace with"
                              onSubmit={credentialSave}
                              onValueChange={(secret) => update({ secret })}
                              type="password"
                              value={draft.secret}
                          />
                      ) : null}
                      <Box className="happy-agent-ai-provider-sheet__switch">
                          <span className="happy-agent-ai-provider-sheet__switch-text">
                              Use this token
                          </span>
                          {credential.saving ? <Spinner size={14} /> : null}
                          <Switch
                              aria-label={`${credential.label} on`}
                              checked={credential.enabled}
                              disabled={busy || credential.saving === true}
                              onChange={(enabled) =>
                                  props.onCredentialEnabledChange(credential.id, enabled)
                              }
                          />
                      </Box>
                  </>
              ),
          }
        : view.kind === "rename"
          ? {
                title: "Rename provider",
                footer: (
                    <Button
                        disabled={draft.name.trim() === "" && !busy}
                        loading={busy}
                        onClick={nameSave}
                    >
                        Save
                    </Button>
                ),
                body: (
                    <>
                        {error}
                        <TextField
                            autoFocus
                            disabled={busy}
                            fullWidth
                            label="Name"
                            onSubmit={nameSave}
                            onValueChange={(name) => update({ name })}
                            value={draft.name}
                        />
                    </>
                ),
            }
          : {
                title: props.name,
                footer: props.onAdd ? (
                    <Button icon="plus" onClick={props.onAdd} variant="secondary">
                        Add token
                    </Button>
                ) : undefined,
                body: (
                    <>
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
                                    Rename
                                </Button>
                            ) : null}
                        </Box>
                        {error}
                        {credentialsList(props)}
                    </>
                ),
            };
    const top = step === "credentials";
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                backLabel={`Back to ${props.name}`}
                busy={busy}
                footer={parts.footer}
                frame="anchored"
                {...(top ? { leading: <IconTile {...props.tile} /> } : { onBack: props.onBack })}
                onClose={close}
                size="medium"
                title={parts.title}
            >
                <Box
                    className="happy-agent-ai-provider-sheet"
                    data-happy-desktop-ui="happy-agent-ai-provider-sheet"
                    data-view={view.kind}
                    key={step}
                >
                    {parts.body}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

/** The provider's tokens, each a row that opens it where the reader may edit them. */
function credentialsList(props: HappyAgentAiProviderSheetProps) {
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
                const content = (
                    <>
                        <Icon name="lock" size={14} />
                        <span className="happy-agent-provider-list__text">
                            <span className="happy-agent-provider-list__name">{entry.label}</span>
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
                        {props.editable ? <Icon name="chevron-right" size={14} /> : null}
                    </>
                );
                return (
                    <Box
                        className="happy-agent-provider-list__item"
                        data-happy-desktop-ui="happy-agent-ai-provider-credential"
                        data-state={entry.state}
                        key={entry.id}
                    >
                        {props.editable ? (
                            <button
                                aria-label={`Edit ${entry.label}`}
                                className="happy-agent-provider-list__row"
                                onClick={() => props.onCredentialOpen(entry.id)}
                                type="button"
                            >
                                {content}
                            </button>
                        ) : (
                            <span className="happy-agent-provider-list__row happy-agent-ai-provider-sheet__static">
                                {content}
                            </span>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}
