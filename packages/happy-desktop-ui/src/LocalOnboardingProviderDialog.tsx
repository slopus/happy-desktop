import { useState, type ReactNode } from "react";
import type { AssistantMarkName } from "./AssistantMark";
import { Button } from "./Button";
import { claudeSetupTokenNormalize } from "./ClaudeSetupTokenDialog";
import type {
    LocalOnboardingAssistant,
    LocalOnboardingAssistantId,
    LocalOnboardingClaudeToken,
    LocalOnboardingInstallShell,
    LocalOnboardingKeyAdd,
    LocalOnboardingKeyCredential,
} from "./LocalOnboardingScreen";
import { SetupCommand } from "./SetupCommand";
import {
    SetupProviderCode,
    SetupProviderDialog,
    SetupProviderHint,
    SetupProviderPrompt,
    SetupProviderStep,
    SetupProviderSteps,
    SetupProviderWays,
    type SetupProviderDialogAction,
} from "./SetupProviderDialog";
import type { SetupProviderMark } from "./SetupProviderRows";
import { TextField } from "./TextField";

/** An API key as an assistant's second way in. */
export interface LocalOnboardingApiKey {
    /** What Happy Agent's account for it is, for example `claude`. */
    readonly type: "claude" | "codex" | "grok";
    /** The way's name, for example "Anthropic API key". */
    readonly label: string;
    /** Who issues and bills it, for example "Anthropic". */
    readonly vendor: string;
    /** That vendor's page for making one. */
    readonly keysUrl: string;
    /** How the key starts, for the field's placeholder. */
    readonly placeholder: string;
}

/** What the dialog needs to know about the assistant it is for. */
export interface LocalOnboardingProviderVendor {
    readonly mark: AssistantMarkName;
    readonly name: string;
    /** Whose page signs in, for example "Google". */
    readonly vendor: string;
    /** That page shows a code to paste back here, rather than finishing by itself. */
    readonly pastesCode: boolean;
    readonly install: Record<LocalOnboardingInstallShell, string>;
    /** Signing in with the person's plan, as the choice names it, for example "Claude plan". */
    readonly plan: string;
    readonly planNote: string;
    /** An API key instead, where the assistant takes one. */
    readonly key?: LocalOnboardingApiKey;
}

/** The dialog's subject: an assistant, Amazon Bedrock, or a custom endpoint. */
export type LocalOnboardingProviderDialogTarget =
    | {
          readonly kind: "assistant";
          readonly assistant: LocalOnboardingAssistant;
          readonly vendor: LocalOnboardingProviderVendor;
      }
    | { readonly kind: "bedrock"; readonly name: string; readonly mark: SetupProviderMark }
    | {
          readonly kind: "custom";
          readonly name: string;
          readonly mark: SetupProviderMark;
          /** What is copied for the person's coding agent, which does the rest itself. */
          readonly prompt: string;
      };

/** Which way an assistant's dialog shows: its own sign-in, or an API key. */
export type LocalOnboardingProviderWay = "plan" | "key";

export interface LocalOnboardingProviderDialogProps {
    readonly target: LocalOnboardingProviderDialogTarget;
    /** The way it opens on. Absent, the plan. */
    readonly way?: LocalOnboardingProviderWay;
    readonly installShell: LocalOnboardingInstallShell;
    readonly claudeToken?: LocalOnboardingClaudeToken;
    /** Adding an account from a key: whether Happy Agent can, and how it went. */
    readonly keyAdd?: LocalOnboardingKeyAdd;
    readonly onClose: () => void;
    readonly onInstall?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onSignIn?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onSignInCode?: (assistant: LocalOnboardingAssistantId, code: string) => void;
    readonly onCancel?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onExternalOpen?: (url: string) => void;
    readonly onClaudeTokenSubmit?: (token: string) => void;
    /** A key or AWS keys to add as a new account. */
    readonly onKeyAdd?: (credential: LocalOnboardingKeyCredential) => void;
    /** The custom endpoint's prompt was copied. */
    readonly onPromptCopy?: () => void;
}

/** One way's body and the action under it. */
interface WayView {
    readonly steps: ReactNode;
    readonly action?: SetupProviderDialogAction;
}

/** What the person typed into a key form, kept by the dialog across ways. */
interface KeyFields {
    readonly apiKey: string;
    readonly apiKeySet: (value: string) => void;
    readonly accessKeyId: string;
    readonly accessKeyIdSet: (value: string) => void;
    readonly secretAccessKey: string;
    readonly secretAccessKeySet: (value: string) => void;
    readonly region: string;
    readonly regionSet: (value: string) => void;
}

/**
 * One provider's dialog on Connect your AI, opened from its row whether or
 * not it is connected. Claude takes a setup token made in Terminal; the other
 * assistants install and sign in through Happy Agent with the vendor's own
 * page, and a page that shows a code takes it back here. An API key or AWS
 * keys are pasted here and saved by Happy Agent as a new account; a custom
 * endpoint is set up by the person's own coding agent from one prompt. An
 * assistant that also takes a key offers both, plan first.
 */
export function LocalOnboardingProviderDialog(props: LocalOnboardingProviderDialogProps) {
    const target = props.target;
    const [way, waySet] = useState<LocalOnboardingProviderWay>(props.way ?? "plan");
    // What the person typed is kept across ways, so a look at the key way
    // does not lose a half-pasted token.
    const [token, tokenSet] = useState("");
    const [code, codeSet] = useState("");
    // A sign-in runs twice: starting, and checking a pasted code. Which one
    // this is, is the one thing only this dialog knows.
    const [codeSent, codeSentSet] = useState(false);
    const [apiKey, apiKeySet] = useState("");
    const [accessKeyId, accessKeyIdSet] = useState("");
    const [secretAccessKey, secretAccessKeySet] = useState("");
    const [region, regionSet] = useState("");
    const fields: KeyFields = {
        accessKeyId,
        accessKeyIdSet,
        apiKey,
        apiKeySet,
        region,
        regionSet,
        secretAccessKey,
        secretAccessKeySet,
    };
    if (target.kind !== "assistant") {
        const view =
            target.kind === "bedrock"
                ? bedrockView(props, fields)
                : {
                      action: { label: "Done", onSelect: props.onClose },
                      steps: customSteps(target.prompt, target.name, props.onPromptCopy),
                  };
        return (
            <SetupProviderDialog
                {...(view.action ? { action: view.action } : {})}
                data-testid="local-onboarding-provider-dialog"
                mark={target.mark}
                name={target.name}
                onClose={props.onClose}
            >
                {view.steps}
            </SetupProviderDialog>
        );
    }
    const { assistant, vendor } = target;
    const key = vendor.key;
    const shown = key && way === "key" ? key : undefined;
    const view: WayView = shown
        ? keyView(props, shown, fields)
        : assistant.id === "claude"
          ? claudeView(props, assistant, vendor, token, tokenSet)
          : signInView(props, assistant, vendor, {
                code,
                codeSent,
                codeSentSet,
                codeSet,
            });
    return (
        <SetupProviderDialog
            {...(view.action ? { action: view.action } : {})}
            data-testid="local-onboarding-provider-dialog"
            mark={{ kind: "assistant", name: vendor.mark }}
            name={vendor.name}
            onClose={props.onClose}
        >
            {key ? (
                <SetupProviderWays
                    onChange={(value) => waySet(value === "key" ? "key" : "plan")}
                    value={shown ? "key" : "plan"}
                    ways={[
                        { label: vendor.plan, note: vendor.planNote, value: "plan" },
                        {
                            label: key.label,
                            note: `Billed to your ${key.vendor} account for what agents use.`,
                            value: "key",
                        },
                    ]}
                />
            ) : null}
            {view.steps}
        </SetupProviderDialog>
    );
}

/**
 * Where a key form stands: still asking Happy Agent whether it takes keys, a
 * Happy Agent that does not, saving, or refused. One for this form's row only.
 */
function keyFormState(keyAdd: LocalOnboardingKeyAdd | undefined, row: string) {
    const mine = keyAdd?.row === row ? keyAdd : undefined;
    return {
        saving: mine?.phase === "saving",
        supported: keyAdd?.supported === true,
        ...(keyAdd?.supported === false
            ? {
                  problem:
                      "This version of Happy Agent can't add keys yet. Update Happy Agent, then try again.",
              }
            : mine?.phase === "failed" && mine.error
              ? { problem: mine.error }
              : {}),
    };
}

/** An assistant's API key: one field, where to get one, and Connect. */
function keyView(
    props: LocalOnboardingProviderDialogProps,
    key: LocalOnboardingApiKey,
    fields: KeyFields,
): WayView {
    const state = keyFormState(props.keyAdd, key.type);
    const value = fields.apiKey.trim();
    const submit = () => {
        if (value === "" || state.saving || !state.supported) return;
        props.onKeyAdd?.({ apiKey: value, kind: "api-key", type: key.type });
    };
    return {
        action: {
            disabled: value === "" || state.saving || !state.supported,
            label: "Connect",
            loading: state.saving,
            onSelect: submit,
        },
        steps: (
            <div className="happy-setup-provider-dialog__form">
                <TextField
                    autoComplete="off"
                    disabled={state.saving}
                    fullWidth
                    label={key.label}
                    onSubmit={submit}
                    onValueChange={fields.apiKeySet}
                    placeholder={key.placeholder}
                    type="password"
                    value={fields.apiKey}
                    {...(state.problem
                        ? { error: state.problem }
                        : { hint: `Happy checks the key with ${key.vendor} before using it.` })}
                />
                <span
                    className="happy-setup-provider-dialog__help"
                    data-happy-desktop-ui="setup-provider-dialog-help"
                >
                    <span className="happy-setup-provider-dialog__help-text">
                        <span className="happy-setup-provider-dialog__title">No key yet?</span>
                        <SetupProviderHint>
                            {`Create one on ${key.vendor}’s API keys page, then paste it above.`}
                        </SetupProviderHint>
                    </span>
                    <Button
                        icon="open-external"
                        onClick={() => props.onExternalOpen?.(key.keysUrl)}
                        size="small"
                        variant="secondary"
                    >
                        {`Open ${key.vendor}`}
                    </Button>
                </span>
            </div>
        ),
    };
}

/** Amazon Bedrock, signed with AWS access keys in one region. */
function bedrockView(props: LocalOnboardingProviderDialogProps, fields: KeyFields): WayView {
    const state = keyFormState(props.keyAdd, "bedrock");
    const credential = {
        accessKeyId: fields.accessKeyId.trim(),
        region: fields.region.trim(),
        secretAccessKey: fields.secretAccessKey.trim(),
    };
    const complete =
        credential.accessKeyId !== "" &&
        credential.region !== "" &&
        credential.secretAccessKey !== "";
    const submit = () => {
        if (!complete || state.saving || !state.supported) return;
        props.onKeyAdd?.({ ...credential, kind: "aws" });
    };
    return {
        action: {
            disabled: !complete || state.saving || !state.supported,
            label: "Connect",
            loading: state.saving,
            onSelect: submit,
        },
        steps: (
            <div className="happy-setup-provider-dialog__form">
                <div className="happy-setup-provider-dialog__pair">
                    <TextField
                        autoComplete="off"
                        className="happy-setup-provider-dialog__wide"
                        disabled={state.saving}
                        fullWidth
                        label="Access key ID"
                        onValueChange={fields.accessKeyIdSet}
                        placeholder="AKIA…"
                        value={fields.accessKeyId}
                    />
                    <TextField
                        autoComplete="off"
                        className="happy-setup-provider-dialog__narrow"
                        disabled={state.saving}
                        fullWidth
                        label="Region"
                        onValueChange={fields.regionSet}
                        placeholder="us-east-1"
                        value={fields.region}
                    />
                </div>
                <TextField
                    autoComplete="off"
                    disabled={state.saving}
                    fullWidth
                    label="Secret access key"
                    onSubmit={submit}
                    onValueChange={fields.secretAccessKeySet}
                    type="password"
                    value={fields.secretAccessKey}
                    {...(state.problem
                        ? { error: state.problem }
                        : {
                              hint: "Billed to your AWS account. Requests go to the region above.",
                          })}
                />
            </div>
        ),
    };
}

/** The custom endpoint: one prompt for the person's coding agent, which sets it up with them. */
function customSteps(prompt: string, name: string, onCopy?: () => void) {
    return (
        <SetupProviderSteps>
            <SetupProviderStep n={1} title="Copy this prompt for your coding agent">
                <SetupProviderPrompt
                    label={`${name} setup prompt`}
                    {...(onCopy ? { onCopy } : {})}
                    text={prompt}
                />
                <SetupProviderHint>
                    {`Your agent asks what you're adding, finds or asks for what it needs, and sets Happy Agent up itself. ${name} shows as connected here once it works.`}
                </SetupProviderHint>
            </SetupProviderStep>
        </SetupProviderSteps>
    );
}

const TERMINAL: Record<LocalOnboardingInstallShell, string> = {
    posix: "Terminal",
    powershell: "PowerShell",
};

function claudeView(
    props: LocalOnboardingProviderDialogProps,
    assistant: LocalOnboardingAssistant,
    vendor: LocalOnboardingProviderVendor,
    token: string,
    tokenSet: (token: string) => void,
): WayView {
    const phase = props.claudeToken?.phase ?? "idle";
    const saving = phase === "saving";
    const normalized = claudeSetupTokenNormalize(token);
    const submit = () => {
        if (normalized && !saving) props.onClaudeTokenSubmit?.(normalized);
    };
    const terminal = TERMINAL[props.installShell];
    const installed = assistant.connect.installed;
    const first = installed ? 1 : 2;
    return {
        action: {
            disabled: !normalized || saving,
            label: "Connect",
            loading: saving,
            onSelect: submit,
        },
        steps: (
            <SetupProviderSteps>
                {installed ? null : (
                    <SetupProviderStep n={1} title={`Install Claude Code. In ${terminal}, run:`}>
                        <SetupCommand
                            command={vendor.install[props.installShell]}
                            label="Claude Code install command"
                        />
                    </SetupProviderStep>
                )}
                <SetupProviderStep n={first} title={`In ${terminal}, run:`}>
                    <SetupCommand command="claude setup-token" label="Claude setup token command" />
                    <SetupProviderHint>
                        Your browser opens Claude. Approve Happy with the account it should use.
                    </SetupProviderHint>
                </SetupProviderStep>
                <SetupProviderStep n={first + 1} title="Paste the token it prints">
                    <TextField
                        aria-label="Claude setup token"
                        autoComplete="off"
                        disabled={saving}
                        fullWidth
                        onSubmit={submit}
                        onValueChange={tokenSet}
                        placeholder="sk-ant-oat01-…"
                        type="password"
                        value={token}
                    />
                    {phase === "failed" && props.claudeToken?.error ? (
                        <SetupProviderHint tone="danger">
                            {props.claudeToken.error}
                        </SetupProviderHint>
                    ) : (
                        <SetupProviderHint>It starts with sk-ant-oat01-.</SetupProviderHint>
                    )}
                </SetupProviderStep>
            </SetupProviderSteps>
        ),
    };
}

/** The pasted code and whether it was sent, which the dialog keeps. */
interface SignInCode {
    readonly code: string;
    readonly codeSet: (code: string) => void;
    readonly codeSent: boolean;
    readonly codeSentSet: (sent: boolean) => void;
}

function signInView(
    props: LocalOnboardingProviderDialogProps,
    assistant: LocalOnboardingAssistant,
    vendor: LocalOnboardingProviderVendor,
    { code, codeSet, codeSent, codeSentSet }: SignInCode,
): WayView {
    const id = assistant.id;
    const connect = assistant.connect;
    const operation = connect.operation;
    const installing = operation?.kind === "install" && operation.status === "running";
    const installFailed = operation?.kind === "install" && operation.status === "failed";
    const signingIn = operation?.kind === "sign-in" && operation.status === "running";
    const waiting = operation?.status === "waiting" ? operation : undefined;
    const signInFailed = operation?.kind === "sign-in" && operation.status === "failed";
    const checkingCode = signingIn && codeSent;
    const acceptsCode = waiting?.acceptsCode === true;
    const open = () => {
        codeSentSet(false);
        if (waiting) props.onExternalOpen?.(waiting.url);
        else props.onSignIn?.(id);
    };
    const submit = () => {
        if (!acceptsCode || code.trim() === "") return;
        codeSentSet(true);
        props.onSignInCode?.(id, code);
    };
    const first = connect.installed ? 1 : 2;
    const signInHint = (() => {
        if (signInFailed) return { danger: true, text: operation.message };
        if (assistant.authentication === "error" && assistant.message)
            return { danger: true, text: assistant.message };
        if (waiting && !vendor.pastesCode)
            return {
                danger: false,
                text: `Approve Happy at ${vendor.vendor}. This finishes by itself when you do.`,
            };
        return {
            danger: false,
            text: `Your browser opens ${vendor.vendor}. Sign in with the account Happy should use.`,
        };
    })();
    const action: SetupProviderDialogAction | undefined = vendor.pastesCode
        ? {
              disabled: !acceptsCode || code.trim() === "",
              label: "Connect",
              loading: checkingCode,
              onSelect: submit,
          }
        : waiting || signingIn
          ? { label: "Cancel", onSelect: () => props.onCancel?.(id), variant: "secondary" }
          : undefined;
    return {
        ...(action ? { action } : {}),
        steps: (
            <SetupProviderSteps>
                {connect.installed ? null : (
                    <SetupProviderStep n={1} title={`Install ${vendor.name}`}>
                        <Button
                            disabled={!connect.installable || props.onInstall === undefined}
                            loading={installing}
                            onClick={() => props.onInstall?.(id)}
                            size="small"
                        >
                            {installFailed ? "Try again" : "Install"}
                        </Button>
                        {installFailed ? (
                            <SetupProviderHint tone="danger">{operation.message}</SetupProviderHint>
                        ) : (
                            <SetupProviderHint>
                                {connect.installable
                                    ? `Happy installs it from ${vendor.vendor}.`
                                    : `${vendor.vendor} offers no installer for this computer.`}
                            </SetupProviderHint>
                        )}
                    </SetupProviderStep>
                )}
                <SetupProviderStep n={first} title={`Sign in at ${vendor.vendor}`}>
                    <Button
                        disabled={!connect.installed || checkingCode}
                        icon="open-external"
                        loading={signingIn && !codeSent}
                        onClick={open}
                        size="small"
                    >
                        {`Open ${vendor.vendor}`}
                    </Button>
                    {waiting?.userCode === undefined ? null : (
                        <>
                            <SetupProviderHint>Enter this code on the page:</SetupProviderHint>
                            <SetupProviderCode code={waiting.userCode} />
                        </>
                    )}
                    {vendor.pastesCode && !signInHint.danger ? null : (
                        <SetupProviderHint {...(signInHint.danger ? { tone: "danger" } : {})}>
                            {signInHint.text}
                        </SetupProviderHint>
                    )}
                </SetupProviderStep>
                {vendor.pastesCode ? (
                    <SetupProviderStep
                        n={first + 1}
                        title={`Paste the code ${vendor.vendor} shows`}
                    >
                        <TextField
                            aria-label={`Code from ${vendor.vendor}`}
                            autoComplete="off"
                            disabled={checkingCode}
                            fullWidth
                            onSubmit={submit}
                            onValueChange={codeSet}
                            placeholder={`Code from ${vendor.vendor}`}
                            value={code}
                        />
                        <SetupProviderHint>
                            {checkingCode
                                ? "Checking the code…"
                                : `${vendor.vendor} shows it after you approve.${
                                      waiting?.expiresAt === undefined
                                          ? ""
                                          : ` Waiting until ${new Date(
                                                waiting.expiresAt,
                                            ).toLocaleTimeString([], {
                                                hour: "numeric",
                                                minute: "2-digit",
                                                second: "2-digit",
                                            })}.`
                                  }`}
                        </SetupProviderHint>
                    </SetupProviderStep>
                ) : null}
            </SetupProviderSteps>
        ),
    };
}
