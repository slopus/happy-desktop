import { useState, type ReactNode } from "react";
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
    SetupProviderPrompt,
    SetupProviderStep,
    SetupProviderSteps,
    SetupProviderWays,
    type SetupProviderDialogAction,
} from "./SetupProviderDialog";
import type { SetupProviderMark } from "./SetupProviderRows";
import { TextField } from "./TextField";

/**
 * A way in that Happy Agent cannot take from this window: an API key, AWS
 * keys or an endpoint, which only its own `happy.toml` holds. The steps hand a
 * prompt to the coding agent the person already uses, which writes it there.
 */
export interface LocalOnboardingHandOff {
    /** The way's name where it is one of several, for example "Anthropic API key". */
    readonly label: string;
    /** What it uses and who bills it, said under the choice. */
    readonly note: string;
    /** What the person's agent will ask them for, for example "your Anthropic API key". */
    readonly asks: string;
    /** Exactly what is copied for that agent. */
    readonly prompt: string;
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
    readonly key?: LocalOnboardingHandOff;
}

/** The dialog's subject: an assistant Happy Agent signs in, or access set up another way. */
export type LocalOnboardingProviderDialogTarget =
    | {
          readonly kind: "assistant";
          readonly assistant: LocalOnboardingAssistant;
          readonly vendor: LocalOnboardingProviderVendor;
      }
    | {
          readonly kind: "hand-off";
          readonly id: "bedrock" | "custom";
          readonly name: string;
          readonly mark: SetupProviderMark;
          readonly handOff: LocalOnboardingHandOff;
      };

/** Which way an assistant's dialog shows: its own sign-in, or an API key. */
export type LocalOnboardingProviderWay = "plan" | "key";

export interface LocalOnboardingProviderDialogProps {
    readonly target: LocalOnboardingProviderDialogTarget;
    /** The way it opens on. Absent, the plan. */
    readonly way?: LocalOnboardingProviderWay;
    readonly installShell: LocalOnboardingInstallShell;
    readonly claudeToken?: LocalOnboardingClaudeToken;
    readonly onClose: () => void;
    readonly onInstall?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onSignIn?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onSignInCode?: (assistant: LocalOnboardingAssistantId, code: string) => void;
    readonly onCancel?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onExternalOpen?: (url: string) => void;
    readonly onClaudeTokenSubmit?: (token: string) => void;
    /** A hand-off prompt was copied. */
    readonly onPromptCopy?: () => void;
}

/** One way's steps and the action under them. */
interface WayView {
    readonly steps: ReactNode;
    readonly action?: SetupProviderDialogAction;
}

/**
 * One provider's dialog on Connect your AI, opened from its row whether or
 * not it is connected. Claude takes a setup token made in Terminal; the other
 * assistants install and sign in through Happy Agent with the vendor's own
 * page, and a page that shows a code takes it back here. An API key, Amazon
 * Bedrock or a custom endpoint is handed to the person's own coding agent.
 * An assistant that also takes a key offers both, plan first.
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
    const close = { label: "Done", onSelect: props.onClose } as const;
    if (target.kind === "hand-off")
        return (
            <SetupProviderDialog
                action={close}
                data-testid="local-onboarding-provider-dialog"
                mark={target.mark}
                name={target.name}
                onClose={props.onClose}
            >
                {handOffSteps(target.handOff, target.name, props.onPromptCopy)}
            </SetupProviderDialog>
        );
    const { assistant, vendor } = target;
    const key = vendor.key;
    const shown = key && way === "key" ? key : undefined;
    const view: WayView = shown
        ? { action: close, steps: handOffSteps(shown, vendor.name, props.onPromptCopy) }
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
                        { label: key.label, note: key.note, value: "key" },
                    ]}
                />
            ) : null}
            {view.steps}
        </SetupProviderDialog>
    );
}

/** A prompt for the person's own coding agent, and what it will do with it. */
function handOffSteps(handOff: LocalOnboardingHandOff, name: string, onCopy?: () => void) {
    return (
        <SetupProviderSteps>
            <SetupProviderStep n={1} title="Copy this prompt">
                <SetupProviderPrompt
                    label={`${name} setup prompt`}
                    {...(onCopy ? { onCopy } : {})}
                    text={handOff.prompt}
                />
            </SetupProviderStep>
            <SetupProviderStep n={2} title="Paste it into the coding agent you already use">
                <SetupProviderHint>
                    {`It asks you for ${handOff.asks}, saves it in Happy Agent's settings and reloads Happy Agent. ${name} shows as connected here once it works.`}
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
