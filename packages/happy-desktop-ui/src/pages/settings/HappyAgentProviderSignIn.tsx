import { useState } from "react";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { Icon, type IconName } from "../../Icon";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";

/** The assistant whose own program signs the account in. */
export type HappyAgentProviderSignInCliId = "codex" | "claude" | "grok";

/** Where the account's credential comes from. */
export type HappyAgentProviderCredentialSourceId = "internal" | "system" | "configured";

export type HappyAgentProviderSignInMethodId = "device" | "browser";

/** How a sign-in that ended badly ended. */
export type HappyAgentProviderSignInFailure = "failed" | "expired" | "save_failed";

/** Where the account's sign-in stands right now. */
export type HappyAgentProviderSignInFlow =
    /** Asked for, or started without its page yet. */
    | { readonly kind: "starting" }
    /** Waiting on the vendor's page. */
    | {
          readonly kind: "waiting";
          readonly method: HappyAgentProviderSignInMethodId | null;
          readonly url: string;
          /** The code to enter on the vendor's device page. */
          readonly userCode?: string;
          /** The page shows a code to paste back here. */
          readonly acceptsCode: boolean;
          /** The vendor's program already opened a browser on the daemon's computer. */
          readonly openedByProgram: boolean;
      }
    | { readonly kind: "succeeded" }
    | {
          readonly kind: "failed";
          readonly failure: HappyAgentProviderSignInFailure;
          /** The daemon's own sentence about what went wrong. */
          readonly message: string;
      };

/** One Codex, Claude, or Grok account's credential and its sign-in. */
export interface HappyAgentProviderSignInRow {
    readonly cli: HappyAgentProviderSignInCliId;
    readonly source: HappyAgentProviderCredentialSourceId;
    /** The signed-in account, already worded, such as "ada@example.com · Pro". */
    readonly account?: string;
    /** The ways this window can sign the account in, in the daemon's order. */
    readonly methods: readonly HappyAgentProviderSignInMethodId[];
    /** Whether a Claude setup token can be pasted for it. */
    readonly acceptsToken: boolean;
    /** False when the vendor's program is missing on the daemon's computer. */
    readonly installed: boolean;
    readonly flow?: HappyAgentProviderSignInFlow;
    /** A request this window sent that has not been answered. */
    readonly busy?: "start" | "code" | "cancel";
    /** Why the last request was refused. */
    readonly error?: string;
}

export interface HappyAgentProviderSignInProps {
    readonly providerName: string;
    readonly signIn: HappyAgentProviderSignInRow;
    /** Why nothing may be changed here, such as the Happy Agent being offline. */
    readonly unavailable?: boolean;
    /** Why only the team owner may change it; disables every action and says so. */
    readonly locked?: string;
    onStart: (method?: HappyAgentProviderSignInMethodId) => void;
    onCodeSubmit: (code: string) => void;
    onCancel: () => void;
    onTokenEditorOpen: () => void;
    /** Opens the vendor's page; a browser tab when absent. */
    onExternalOpen?: (url: string) => void;
}

const SOURCE_LABELS: Record<HappyAgentProviderCredentialSourceId, string> = {
    system: "Using system login",
    internal: "Signed in to Happy",
    configured: "Configured in config file",
};

const SOURCE_ICONS: Record<HappyAgentProviderCredentialSourceId, IconName> = {
    system: "link",
    internal: "lock",
    configured: "settings",
};

/** Whose page a sign-in opens. */
const VENDOR_NAMES: Record<HappyAgentProviderSignInCliId, string> = {
    codex: "OpenAI",
    claude: "Claude",
    grok: "xAI",
};

/** The program the daemon runs to sign in. */
const PROGRAM_NAMES: Record<HappyAgentProviderSignInCliId, string> = {
    codex: "Codex",
    claude: "Claude Code",
    grok: "Grok",
};

const FAILURE_TITLES: Record<HappyAgentProviderSignInFailure, string> = {
    failed: "Sign-in failed",
    expired: "Sign-in expired",
    save_failed: "Couldn't save the sign-in",
};

const EXPLAINER =
    "Signing in here gives this account a login only Happy uses, so it stops using the system login.";

/**
 * One account's credential under its provider card: where it comes from, and
 * signing it in again to a login only Happy uses. The flow runs in place: the
 * device code to enter, the vendor's page, the code to paste back, and how it
 * ended. The code typed here goes straight to the handler and is not kept.
 */
export function HappyAgentProviderSignIn(props: HappyAgentProviderSignInProps) {
    const { signIn } = props;
    const [code, codeSet] = useState("");
    const blocked = props.unavailable === true || props.locked !== undefined;
    const vendor = VENDOR_NAMES[signIn.cli];
    const flow = signIn.flow;
    const active = flow?.kind === "starting" || flow?.kind === "waiting";
    const open = (url: string): void => {
        if (props.onExternalOpen) props.onExternalOpen(url);
        else window.open(url, "_blank", "noopener,noreferrer");
    };
    const codeSubmit = (): void => {
        if (!code.trim() || signIn.busy) return;
        props.onCodeSubmit(code);
        codeSet("");
    };
    const browserInstead =
        flow?.kind === "waiting" &&
        flow.method === "device" &&
        signIn.cli !== "claude" &&
        signIn.methods.includes("browser");
    const meta =
        signIn.source === "internal"
            ? signIn.account
            : signIn.source === "system"
              ? EXPLAINER
              : undefined;
    return (
        <Box
            className="happy-agent-provider__sign-in"
            data-happy-desktop-ui="happy-agent-provider-sign-in"
            data-source={signIn.source}
        >
            <Box className="happy-agent-provider__sign-in-mark">
                <Icon name={SOURCE_ICONS[signIn.source]} size={14} />
            </Box>
            <Box className="happy-agent-provider__sign-in-body">
                <Box className="happy-agent-provider__sign-in-row">
                    <Box className="happy-agent-provider__model-text">
                        <span
                            className="happy-agent-provider__model-name"
                            data-happy-desktop-ui="happy-agent-provider-sign-in-source"
                        >
                            {SOURCE_LABELS[signIn.source]}
                        </span>
                        {meta ? (
                            <span
                                className="happy-agent-provider__sign-in-meta"
                                data-happy-desktop-ui="happy-agent-provider-sign-in-meta"
                            >
                                {meta}
                            </span>
                        ) : null}
                    </Box>
                    {signIn.acceptsToken ? (
                        <Button
                            aria-label={`Update the token for ${props.providerName}`}
                            disabled={blocked || active}
                            onClick={props.onTokenEditorOpen}
                            size="small"
                            variant="ghost"
                        >
                            Update token
                        </Button>
                    ) : null}
                    {signIn.methods.length > 0 ? (
                        <Button
                            aria-label={`Sign ${props.providerName} in again`}
                            disabled={blocked || active || !signIn.installed}
                            loading={signIn.busy === "start" && !active}
                            onClick={() => props.onStart()}
                            size="small"
                            variant="secondary"
                        >
                            Sign in again
                        </Button>
                    ) : null}
                </Box>
                {props.locked !== undefined ? (
                    <span
                        className="happy-agent-provider__sign-in-note"
                        data-happy-desktop-ui="happy-agent-provider-sign-in-locked"
                    >
                        {props.locked}
                    </span>
                ) : !signIn.installed && signIn.methods.length > 0 ? (
                    <span className="happy-agent-provider__sign-in-note">
                        {PROGRAM_NAMES[signIn.cli]} isn’t installed on the Happy Agent’s computer,
                        so it can’t sign in from here.
                    </span>
                ) : null}
                {flow?.kind === "starting" ? (
                    <Box
                        className="happy-agent-provider__sign-in-flow"
                        data-happy-desktop-ui="happy-agent-provider-sign-in-flow"
                        data-flow="starting"
                    >
                        <Box className="happy-agent-provider__sign-in-line">
                            <Spinner size={16} />
                            <span>Starting the sign-in…</span>
                            <Button
                                disabled={blocked || signIn.busy === "start"}
                                loading={signIn.busy === "cancel"}
                                onClick={props.onCancel}
                                size="small"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                        </Box>
                    </Box>
                ) : flow?.kind === "waiting" ? (
                    <Box
                        className="happy-agent-provider__sign-in-flow"
                        data-happy-desktop-ui="happy-agent-provider-sign-in-flow"
                        data-flow="waiting"
                    >
                        {flow.userCode ? (
                            <>
                                <span className="happy-agent-provider__sign-in-text">
                                    Enter this code at {vendor}, on any device.
                                </span>
                                <Box className="happy-agent-provider__sign-in-line">
                                    <span
                                        className="happy-agent-provider__sign-in-code"
                                        data-happy-desktop-ui="happy-agent-provider-sign-in-code"
                                    >
                                        {flow.userCode}
                                    </span>
                                    <CopyButton
                                        caption="Copy"
                                        copiedCaption="Copied"
                                        label="Copy code"
                                        text={flow.userCode}
                                    />
                                </Box>
                            </>
                        ) : flow.acceptsCode ? (
                            <span className="happy-agent-provider__sign-in-text">
                                Sign in to {vendor} in the browser, then paste the code it shows.
                            </span>
                        ) : flow.openedByProgram ? (
                            <span className="happy-agent-provider__sign-in-text">
                                Finish signing in to {vendor} in the browser that opened on this
                                computer.
                            </span>
                        ) : (
                            <span className="happy-agent-provider__sign-in-text">
                                Sign in to {vendor} in the browser on this computer.
                            </span>
                        )}
                        {flow.acceptsCode ? (
                            <TextField
                                aria-label={`Code from ${vendor}`}
                                autoComplete="off"
                                disabled={blocked || signIn.busy === "code"}
                                onSubmit={codeSubmit}
                                onValueChange={codeSet}
                                placeholder="Paste the code"
                                size="small"
                                type="password"
                                value={code}
                            />
                        ) : null}
                        <Box className="happy-agent-provider__sign-in-actions">
                            <Button
                                icon="open-external"
                                onClick={() => open(flow.url)}
                                size="small"
                                variant={flow.acceptsCode ? "secondary" : "primary"}
                            >
                                Open {vendor}
                            </Button>
                            {flow.acceptsCode ? (
                                <Button
                                    disabled={blocked || !code.trim()}
                                    loading={signIn.busy === "code"}
                                    onClick={codeSubmit}
                                    size="small"
                                    variant="primary"
                                >
                                    Submit code
                                </Button>
                            ) : null}
                            {browserInstead ? (
                                <Button
                                    disabled={blocked || signIn.busy !== undefined}
                                    onClick={() => props.onStart("browser")}
                                    size="small"
                                    variant="ghost"
                                >
                                    Use this computer’s browser
                                </Button>
                            ) : null}
                            <Button
                                disabled={blocked || signIn.busy === "cancel"}
                                loading={signIn.busy === "cancel"}
                                onClick={props.onCancel}
                                size="small"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                        </Box>
                        {flow.acceptsCode ? null : (
                            <Box className="happy-agent-provider__sign-in-line happy-agent-provider__sign-in-note">
                                <Spinner size={14} />
                                <span>Waiting for you to finish…</span>
                            </Box>
                        )}
                    </Box>
                ) : flow?.kind === "succeeded" ? (
                    <Box
                        className="happy-agent-provider__sign-in-line happy-agent-provider__sign-in-done"
                        data-happy-desktop-ui="happy-agent-provider-sign-in-flow"
                        data-flow="succeeded"
                    >
                        <Icon name="check-circle" size={16} />
                        <span>Signed in</span>
                    </Box>
                ) : flow?.kind === "failed" ? (
                    <Box
                        className="happy-agent-provider__sign-in-flow"
                        data-happy-desktop-ui="happy-agent-provider-sign-in-flow"
                        data-flow="failed"
                        role="alert"
                    >
                        <Box className="happy-agent-provider__sign-in-line happy-agent-provider__sign-in-failed">
                            <Icon name="alert" size={16} />
                            <span>{FAILURE_TITLES[flow.failure]}</span>
                        </Box>
                        {flow.message ? (
                            <span className="happy-agent-provider__sign-in-note">
                                {flow.message}
                            </span>
                        ) : null}
                        <Box className="happy-agent-provider__sign-in-actions">
                            <Button
                                disabled={blocked || !signIn.installed}
                                loading={signIn.busy === "start"}
                                onClick={() => props.onStart()}
                                size="small"
                                variant="secondary"
                            >
                                Try again
                            </Button>
                        </Box>
                    </Box>
                ) : null}
                {signIn.error && props.locked === undefined ? (
                    <span
                        className="happy-agent-provider__sign-in-error"
                        data-happy-desktop-ui="happy-agent-provider-sign-in-error"
                        role="alert"
                    >
                        {signIn.error}
                    </span>
                ) : null}
            </Box>
        </Box>
    );
}
