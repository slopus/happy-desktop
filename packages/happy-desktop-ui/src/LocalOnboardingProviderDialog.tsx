import { useState } from "react";
import type { AssistantMarkName } from "./AssistantMark";
import { Button } from "./Button";
import { claudeSetupTokenNormalize } from "./ClaudeSetupTokenDialog";
import type {
    LocalOnboardingAssistant,
    LocalOnboardingAssistantId,
    LocalOnboardingClaudeToken,
    LocalOnboardingInstallShell,
} from "./LocalOnboardingScreen";
import { SetupCommand } from "./SetupCommand";
import {
    SetupProviderCode,
    SetupProviderDialog,
    SetupProviderHint,
    SetupProviderStep,
    SetupProviderSteps,
    type SetupProviderDialogAction,
} from "./SetupProviderDialog";
import { TextField } from "./TextField";

/** What the dialog needs to know about the assistant it is for. */
export interface LocalOnboardingProviderVendor {
    readonly mark: AssistantMarkName;
    readonly name: string;
    /** Whose page signs in, for example "Google". */
    readonly vendor: string;
    /** That page shows a code to paste back here, rather than finishing by itself. */
    readonly pastesCode: boolean;
    readonly install: Record<LocalOnboardingInstallShell, string>;
}

export interface LocalOnboardingProviderDialogProps {
    readonly assistant: LocalOnboardingAssistant;
    readonly vendor: LocalOnboardingProviderVendor;
    readonly installShell: LocalOnboardingInstallShell;
    readonly claudeToken?: LocalOnboardingClaudeToken;
    readonly onClose: () => void;
    readonly onInstall?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onSignIn?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onSignInCode?: (assistant: LocalOnboardingAssistantId, code: string) => void;
    readonly onCancel?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onExternalOpen?: (url: string) => void;
    readonly onClaudeTokenSubmit?: (token: string) => void;
}

/**
 * One assistant's dialog on Subscriptions, opened from its row. Claude takes a
 * setup token made in Terminal; the others install and sign in through Happy
 * Agent with the vendor's own page, and a page that shows a code takes it
 * back here.
 */
export function LocalOnboardingProviderDialog(props: LocalOnboardingProviderDialogProps) {
    return props.assistant.id === "claude" ? (
        <ClaudeDialog {...props} />
    ) : (
        <SignInDialog {...props} />
    );
}

const TERMINAL: Record<LocalOnboardingInstallShell, string> = {
    posix: "Terminal",
    powershell: "PowerShell",
};

function ClaudeDialog(props: LocalOnboardingProviderDialogProps) {
    const [token, tokenSet] = useState("");
    const phase = props.claudeToken?.phase ?? "idle";
    const saving = phase === "saving";
    const normalized = claudeSetupTokenNormalize(token);
    const submit = () => {
        if (normalized && !saving) props.onClaudeTokenSubmit?.(normalized);
    };
    const terminal = TERMINAL[props.installShell];
    const installed = props.assistant.connect.installed;
    const first = installed ? 1 : 2;
    return (
        <SetupProviderDialog
            action={{
                disabled: !normalized || saving,
                label: "Connect",
                loading: saving,
                onSelect: submit,
            }}
            data-testid="local-onboarding-provider-dialog"
            mark={props.vendor.mark}
            name={props.vendor.name}
            onClose={props.onClose}
        >
            <SetupProviderSteps>
                {installed ? null : (
                    <SetupProviderStep n={1} title={`Install Claude Code. In ${terminal}, run:`}>
                        <SetupCommand
                            command={props.vendor.install[props.installShell]}
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
        </SetupProviderDialog>
    );
}

function SignInDialog(props: LocalOnboardingProviderDialogProps) {
    const { assistant, vendor } = props;
    const id = assistant.id;
    const connect = assistant.connect;
    const operation = connect.operation;
    const [code, codeSet] = useState("");
    // A sign-in runs twice: starting, and checking a pasted code. Which one
    // this is, is the one thing only this dialog knows.
    const [codeSent, codeSentSet] = useState(false);
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
    return (
        <SetupProviderDialog
            {...(action ? { action } : {})}
            data-testid="local-onboarding-provider-dialog"
            mark={vendor.mark}
            name={vendor.name}
            onClose={props.onClose}
        >
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
        </SetupProviderDialog>
    );
}
