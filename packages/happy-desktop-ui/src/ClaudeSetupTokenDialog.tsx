import { useState } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { SetupCommand } from "./SetupCommand";
import { TextField } from "./TextField";

const SETUP_TOKEN_COMMAND = "claude setup-token";

export interface ClaudeSetupTokenDialogProps {
    readonly shell: "powershell" | "posix";
    /**
     * The command that installs Claude Code here, when this machine does not
     * have it yet. Absent, the steps start at making the token.
     */
    readonly installCommand?: string;
    /**
     * - `idle`: waiting for the token.
     * - `saving`: the token is on its way to Happy Agent.
     * - `failed`: it was refused; `error` says why.
     */
    readonly phase: "idle" | "saving" | "failed";
    readonly error?: string;
    /** The dialog's title; "Connect Claude" when absent. */
    readonly title?: string;
    /** The submit button's words; "Connect Claude" when absent. */
    readonly submitLabel?: string;
    /** The opening sentence, for a caller replacing a token rather than connecting. */
    readonly lead?: string;
    onClose(): void;
    /** The pasted token. It goes to Happy Agent and is not kept here. */
    onTokenSubmit(token: string): void;
    /** A command in the steps was copied. */
    onCommandCopy?(command: "install" | "setup-token"): void;
}

/**
 * C-341 ClaudeSetupTokenDialog — how Claude reaches Happy: a setup token
 * Claude Code makes for the person's own account, pasted here.
 *
 * Codex and Grok sign in from their cards. Claude's long-lived token is made
 * in Terminal by Claude Code itself, so this says exactly what to run, what
 * comes back, and where it goes. The token is held only while it is typed.
 *
 * Props only: whether Claude Code is installed, and what saving does, belong
 * to setup.
 */
export function ClaudeSetupTokenDialog(props: ClaudeSetupTokenDialogProps) {
    const [token, tokenSet] = useState("");
    const saving = props.phase === "saving";
    const normalized = claudeSetupTokenNormalize(token);
    const submit = () => {
        if (normalized && !saving) props.onTokenSubmit(normalized);
    };
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                className="happy-claude-setup-token"
                data-testid="claude-setup-token-dialog"
                footer={
                    <>
                        <Button disabled={saving} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={!normalized || saving}
                            loading={saving}
                            onClick={submit}
                            variant="primary"
                        >
                            {props.submitLabel ?? "Connect Claude"}
                        </Button>
                    </>
                }
                onClose={props.onClose}
                size="medium"
                title={props.title ?? "Connect Claude"}
            >
                <ClaudeSetupTokenSteps
                    {...props}
                    onSubmit={submit}
                    token={token}
                    tokenSet={tokenSet}
                />
            </Modal>
        </ModalOverlay>
    );
}

/** The token as Happy Agent takes it: every space and line break a terminal copy adds, gone. */
export function claudeSetupTokenNormalize(token: string): string {
    return token.replace(/[\s\p{White_Space}]/gu, "");
}

export type ClaudeSetupTokenStepsProps = Pick<
    ClaudeSetupTokenDialogProps,
    "shell" | "installCommand" | "phase" | "error" | "lead" | "onCommandCopy"
> & {
    readonly token: string;
    tokenSet(token: string): void;
    onSubmit(): void;
};

/**
 * The steps that make and paste a setup token, without a dialog around them,
 * for a sheet that shows them as one of its steps.
 */
export function ClaudeSetupTokenSteps(props: ClaudeSetupTokenStepsProps) {
    const saving = props.phase === "saving";
    const terminal = props.shell === "powershell" ? "PowerShell" : "Terminal";
    const submit = props.onSubmit;
    const token = props.token;
    const tokenSet = props.tokenSet;
    // The steps after installing are numbered on from it when it is there.
    const first = props.installCommand === undefined ? 1 : 2;
    return (
        <div className="happy-claude-setup-token__body">
            <p className="happy-claude-setup-token__lead">
                {props.lead ??
                    "Happy connects to Claude with a setup token: a key Claude Code makes for your own Claude account. It takes about a minute."}
            </p>
            <ol className="happy-claude-setup-token__steps">
                {props.installCommand === undefined ? null : (
                    <li className="happy-claude-setup-token__step">
                        <span className="happy-claude-setup-token__number">1</span>
                        <span className="happy-claude-setup-token__words">
                            <span>Install Claude Code. In {terminal}, run:</span>
                            <SetupCommand
                                command={props.installCommand}
                                label="Claude Code install command"
                                {...(props.onCommandCopy
                                    ? { onCopy: () => props.onCommandCopy?.("install") }
                                    : {})}
                            />
                        </span>
                    </li>
                )}
                <li className="happy-claude-setup-token__step">
                    <span className="happy-claude-setup-token__number">{first}</span>
                    <span className="happy-claude-setup-token__words">
                        <span>In {terminal}, run:</span>
                        <SetupCommand
                            command={SETUP_TOKEN_COMMAND}
                            label="Claude setup token command"
                            {...(props.onCommandCopy
                                ? { onCopy: () => props.onCommandCopy?.("setup-token") }
                                : {})}
                        />
                    </span>
                </li>
                <li className="happy-claude-setup-token__step">
                    <span className="happy-claude-setup-token__number">{first + 1}</span>
                    <span className="happy-claude-setup-token__words">
                        Your browser opens Claude. Sign in with the account Happy should use, and
                        allow access.
                    </span>
                </li>
                <li className="happy-claude-setup-token__step">
                    <span className="happy-claude-setup-token__number">{first + 2}</span>
                    <span className="happy-claude-setup-token__words">
                        <span>
                            Back in {terminal}, copy the token it prints. It starts with{" "}
                            <code>sk-ant-oat01-</code>. Paste it here:
                        </span>
                        <TextField
                            aria-label="Claude setup token"
                            autoComplete="off"
                            disabled={saving}
                            onSubmit={submit}
                            onValueChange={tokenSet}
                            placeholder="sk-ant-oat01-…"
                            type="password"
                            value={token}
                        />
                    </span>
                </li>
            </ol>
            {props.phase === "failed" && props.error ? (
                <Banner tone="danger">{props.error}</Banner>
            ) : null}
        </div>
    );
}
