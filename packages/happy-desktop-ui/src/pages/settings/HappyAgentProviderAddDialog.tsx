import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { Icon } from "../../Icon";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { SegmentedControl } from "../../SegmentedControl";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";

/** Which way of adding a provider the dialog shows. */
export type HappyAgentProviderAddFlow =
    | { readonly kind: "choose" }
    | { readonly kind: "apiKey"; readonly vendor: "openai" | "anthropic" }
    | { readonly kind: "chatgpt" }
    | { readonly kind: "claude"; readonly setupToken: boolean };

export interface HappyAgentProviderAddDialogProps {
    readonly flow: HappyAgentProviderAddFlow;
    /** Where what is added is kept. */
    readonly to: "private" | "team";
    /** Whether the reader may choose: both "My account" and "Team" are allowed. */
    readonly destinationChoice: boolean;
    /**
     * - `idle`: waiting on the person.
     * - `busy`: a request is out.
     * - `waiting`: a sign-in waits on the vendor's page.
     * - `done`: added; `done` says what.
     */
    readonly phase: "idle" | "busy" | "waiting" | "done";
    readonly signIn?: {
        readonly url: string;
        readonly userCode?: string;
        readonly acceptsCode: boolean;
    };
    readonly done?: string;
    readonly error?: { readonly title: string; readonly message: string };
    /** Whether this server signs in to ChatGPT itself. */
    readonly chatgptAvailable: boolean;
    /** Whether this server signs in to Claude itself; a setup token works either way. */
    readonly claudeAvailable: boolean;
    onFlowSelect: (flow: HappyAgentProviderAddFlow) => void;
    onBack: () => void;
    onClose: () => void;
    onDestinationChange: (to: "private" | "team") => void;
    onApiKeySubmit: (secret: string) => void;
    onSetupTokenSubmit: (token: string) => void;
    onSignInStart: () => void;
    onSignInCodeSubmit: (code: string) => void;
    /** Opens a vendor's page; a browser tab when absent. */
    onExternalOpen?: (url: string) => void;
}

const VENDOR_NAMES = { openai: "OpenAI", anthropic: "Anthropic" } as const;

function titleOf(flow: HappyAgentProviderAddFlow): string {
    switch (flow.kind) {
        case "choose":
            return "Add an AI provider";
        case "apiKey":
            return "Add API key";
        case "chatgpt":
            return "Sign in with ChatGPT";
        case "claude":
            return flow.setupToken ? "Setup token" : "Sign in with Claude";
    }
}

/**
 * Adds an AI provider on Happy Cloud: a ChatGPT or Claude sign-in that the
 * server finishes itself, an OpenAI or Anthropic API key, or a Claude setup
 * token. What the person types is held here only until it is sent.
 */
export function HappyAgentProviderAddDialog(props: HappyAgentProviderAddDialogProps) {
    const [secret, setSecret] = useState("");
    const busy = props.phase === "busy";
    const open = (url: string): void => {
        if (props.onExternalOpen) props.onExternalOpen(url);
        else window.open(url, "_blank", "noopener,noreferrer");
    };
    const flowSelect = (flow: HappyAgentProviderAddFlow): void => {
        setSecret("");
        props.onFlowSelect(flow);
    };
    const back = (): void => {
        setSecret("");
        props.onBack();
    };
    const close = (): void => {
        if (!busy) props.onClose();
    };
    const flow = props.flow;
    const done = props.phase === "done";
    const primary = ((): { label: string; onClick: () => void; disabled?: boolean } | undefined => {
        if (done) return { label: "Done", onClick: props.onClose };
        if (flow.kind === "apiKey")
            return {
                label: busy ? "Checking the key…" : "Add",
                onClick: () => props.onApiKeySubmit(secret),
                disabled: secret.trim() === "",
            };
        if (flow.kind === "claude" && flow.setupToken)
            return {
                label: "Connect",
                onClick: () => props.onSetupTokenSubmit(secret),
                disabled: secret.trim() === "",
            };
        if (flow.kind === "claude" && props.phase === "waiting")
            return {
                label: "Connect",
                onClick: () => props.onSignInCodeSubmit(secret),
                disabled: secret.trim() === "",
            };
        if ((flow.kind === "chatgpt" || flow.kind === "claude") && props.phase !== "waiting")
            return {
                label: props.error ? "Try again" : "Continue",
                onClick: props.onSignInStart,
            };
        return undefined;
    })();
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                footer={
                    <>
                        {flow.kind === "choose" || done ? null : (
                            <Button disabled={busy} onClick={back} variant="ghost">
                                Back
                            </Button>
                        )}
                        {done ? null : (
                            <Button disabled={busy} onClick={close} variant="ghost">
                                Cancel
                            </Button>
                        )}
                        {primary ? (
                            <Button
                                disabled={primary.disabled === true && !busy}
                                loading={busy}
                                onClick={primary.onClick}
                            >
                                {primary.label}
                            </Button>
                        ) : null}
                    </>
                }
                icon="spark"
                onClose={busy ? undefined : close}
                size="medium"
                title={titleOf(flow)}
            >
                <Box
                    className="happy-agent-provider-add"
                    data-flow={flow.kind}
                    data-happy-desktop-ui="happy-agent-provider-add"
                >
                    {done ? (
                        <Box
                            className="happy-agent-provider-add__done"
                            data-happy-desktop-ui="happy-agent-provider-add-done"
                        >
                            <Icon name="check-circle" size={20} />
                            <span>{props.done}</span>
                        </Box>
                    ) : (
                        <>
                            {props.error ? (
                                <Banner tone="danger" title={props.error.title}>
                                    {props.error.message}
                                </Banner>
                            ) : null}
                            {props.destinationChoice && props.phase === "idle" ? (
                                <Box className="happy-agent-provider-add__field">
                                    <span className="happy-agent-provider-add__label">Save to</span>
                                    <SegmentedControl
                                        aria-label="Save to"
                                        onChange={(to) =>
                                            props.onDestinationChange(
                                                to === "team" ? "team" : "private",
                                            )
                                        }
                                        segments={[
                                            { value: "private", label: "My account" },
                                            { value: "team", label: "Team" },
                                        ]}
                                        size="small"
                                        value={props.to}
                                    />
                                </Box>
                            ) : null}
                            {flow.kind === "choose" ? (
                                <Box className="happy-agent-provider-add__choices">
                                    {props.chatgptAvailable ? (
                                        <Button
                                            onClick={() => flowSelect({ kind: "chatgpt" })}
                                            variant="secondary"
                                        >
                                            Sign in with ChatGPT
                                        </Button>
                                    ) : null}
                                    <Button
                                        onClick={() =>
                                            flowSelect({
                                                kind: "claude",
                                                setupToken: !props.claudeAvailable,
                                            })
                                        }
                                        variant="secondary"
                                    >
                                        {props.claudeAvailable
                                            ? "Sign in with Claude"
                                            : "Use a Claude setup token"}
                                    </Button>
                                    <Button
                                        onClick={() =>
                                            flowSelect({ kind: "apiKey", vendor: "openai" })
                                        }
                                        variant="secondary"
                                    >
                                        Add API key
                                    </Button>
                                </Box>
                            ) : flow.kind === "apiKey" ? (
                                <>
                                    <SegmentedControl
                                        aria-label="Vendor"
                                        disabled={busy}
                                        onChange={(vendor) =>
                                            flowSelect({
                                                kind: "apiKey",
                                                vendor:
                                                    vendor === "anthropic" ? "anthropic" : "openai",
                                            })
                                        }
                                        segments={[
                                            { value: "openai", label: VENDOR_NAMES.openai },
                                            { value: "anthropic", label: VENDOR_NAMES.anthropic },
                                        ]}
                                        size="small"
                                        value={flow.vendor}
                                    />
                                    <TextField
                                        autoComplete="off"
                                        autoFocus
                                        disabled={busy}
                                        label={`${VENDOR_NAMES[flow.vendor]} API key`}
                                        onSubmit={() => props.onApiKeySubmit(secret)}
                                        onValueChange={setSecret}
                                        placeholder={flow.vendor === "openai" ? "sk-…" : "sk-ant-…"}
                                        type="password"
                                        value={secret}
                                    />
                                </>
                            ) : flow.kind === "claude" && flow.setupToken ? (
                                <>
                                    <TextField
                                        autoComplete="off"
                                        autoFocus
                                        disabled={busy}
                                        label="Setup token"
                                        onSubmit={() => props.onSetupTokenSubmit(secret)}
                                        onValueChange={setSecret}
                                        placeholder="sk-ant-oat01-…"
                                        type="password"
                                        value={secret}
                                    />
                                    <span className="happy-agent-provider-add__hint">
                                        From <code>claude setup-token</code> on your computer.
                                    </span>
                                </>
                            ) : flow.kind === "claude" ? (
                                <>
                                    <span className="happy-agent-provider-add__text">
                                        Sign in to Claude in the browser, then paste the code it
                                        shows.
                                    </span>
                                    {props.phase === "waiting" && props.signIn ? (
                                        <>
                                            <Box className="happy-agent-provider-add__row">
                                                <Button
                                                    icon="open-external"
                                                    onClick={() => open(props.signIn!.url)}
                                                    size="small"
                                                    variant="secondary"
                                                >
                                                    Open Claude
                                                </Button>
                                            </Box>
                                            <TextField
                                                autoComplete="off"
                                                label="Code"
                                                onSubmit={() => props.onSignInCodeSubmit(secret)}
                                                onValueChange={setSecret}
                                                type="password"
                                                value={secret}
                                            />
                                        </>
                                    ) : null}
                                    <Box className="happy-agent-provider-add__row">
                                        <Button
                                            disabled={busy}
                                            onClick={() =>
                                                flowSelect({ kind: "claude", setupToken: true })
                                            }
                                            size="small"
                                            variant="ghost"
                                        >
                                            Use a setup token instead
                                        </Button>
                                    </Box>
                                </>
                            ) : props.phase === "waiting" && props.signIn ? (
                                <>
                                    <span className="happy-agent-provider-add__text">
                                        Enter this code at OpenAI
                                    </span>
                                    {props.signIn.userCode ? (
                                        <Box className="happy-agent-provider-add__code">
                                            <span
                                                className="happy-agent-provider-add__user-code"
                                                data-happy-desktop-ui="happy-agent-provider-add-code"
                                            >
                                                {props.signIn.userCode}
                                            </span>
                                            <CopyButton
                                                caption="Copy"
                                                copiedCaption="Copied"
                                                label="Copy code"
                                                text={props.signIn.userCode}
                                            />
                                        </Box>
                                    ) : null}
                                    <Box className="happy-agent-provider-add__row">
                                        <Button
                                            icon="open-external"
                                            onClick={() => open(props.signIn!.url)}
                                            size="small"
                                            variant="primary"
                                        >
                                            Open OpenAI
                                        </Button>
                                    </Box>
                                    <Box className="happy-agent-provider-add__waiting">
                                        <Spinner size={16} />
                                        <span>Waiting for you to finish…</span>
                                    </Box>
                                </>
                            ) : (
                                <span className="happy-agent-provider-add__text">
                                    Sign in with your ChatGPT account. Happy shows a code to enter
                                    at OpenAI; your password never passes through Happy.
                                </span>
                            )}
                        </>
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
