import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { Icon, type IconName } from "../../Icon";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import {
    happyAgentProviderAgo,
    happyAgentProviderExpiryWarning,
    happyAgentProviderSince,
    happyAgentProviderUntil,
    type HappyAgentProviderAccountActivity,
} from "./happyAgentProviderAccountStatus";

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

/** One Codex, Claude, or Grok account's credential, as its provider card shows it. */
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
    /** A sign-in is running, from here or another window; the button goes back to it. */
    readonly running?: boolean;
}

export interface HappyAgentProviderLoginProps {
    readonly providerName: string;
    /** The account's credential, where the daemon can sign it in. */
    readonly signIn?: HappyAgentProviderSignInRow;
    /** How the account has been doing, from its usage entry. */
    readonly activity?: HappyAgentProviderAccountActivity;
    /** The time the facts are told against, in milliseconds. */
    readonly now: number;
    /** Why nothing may be changed here, such as the Happy Agent being offline. */
    readonly unavailable?: boolean;
    /** Why only the team owner may change how the account signs in. */
    readonly locked?: string;
    /** Starts a sign-in, or opens the one already running. */
    onSignIn: () => void;
    onTokenEditorOpen: () => void;
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
 * One account's login in its details: where the credential comes from, when
 * the daemon last refreshed it, when the access token runs out, why
 * refreshing has been failing, and the ways to replace it. Signing in again
 * runs in `HappyAgentProviderSignInDialog`.
 */
export function HappyAgentProviderLogin(props: HappyAgentProviderLoginProps) {
    const { signIn, activity, now } = props;
    const blocked = props.unavailable === true || props.locked !== undefined;
    const login = activity?.login;
    const refreshError = login?.refreshError ?? null;
    const expiry = happyAgentProviderExpiryWarning(login, now);
    const facts: { readonly label: string; readonly value: string; readonly tone?: string }[] = [];
    if (activity?.lastUsedAt !== undefined)
        facts.push({
            label: "Last used",
            value:
                activity.lastUsedAt === null
                    ? "Not used yet"
                    : happyAgentProviderAgo(activity.lastUsedAt, now),
        });
    if (login) {
        facts.push({
            label: "Last refresh",
            value:
                login.refreshedAt === null
                    ? "Not yet"
                    : happyAgentProviderAgo(login.refreshedAt, now),
        });
        if (login.expiresAt !== null)
            facts.push({
                label: "Access token expires",
                value: happyAgentProviderUntil(login.expiresAt, now),
                ...(expiry || login.expiresAt <= now ? { tone: "warning" } : {}),
            });
        if (refreshError)
            facts.push({
                label: "Last refresh error",
                value: [
                    refreshError.code,
                    refreshError.status === null
                        ? undefined
                        : `HTTP ${String(refreshError.status)}`,
                    `since ${happyAgentProviderSince(refreshError.since, now)}`,
                    `last tried ${happyAgentProviderAgo(refreshError.at, now)}`,
                ]
                    .filter(Boolean)
                    .join(" · "),
                tone: refreshError.permanent ? "danger" : "warning",
            });
    } else if (login === undefined && activity?.checkedAt !== undefined)
        facts.push({
            label: "Last checked",
            value: happyAgentProviderAgo(activity.checkedAt, now),
        });
    const note =
        signIn && !signIn.installed && signIn.methods.length > 0
            ? `${PROGRAM_NAMES[signIn.cli]} isn’t installed on the Happy Agent’s computer.`
            : undefined;
    const actions = signIn && (signIn.acceptsToken || signIn.methods.length > 0);
    return (
        <Box
            className="happy-agent-provider-login"
            data-happy-desktop-ui="happy-agent-provider-sign-in"
            {...(signIn ? { "data-source": signIn.source } : {})}
        >
            {signIn ? (
                <Box className="happy-agent-provider-login__source">
                    <Icon name={SOURCE_ICONS[signIn.source]} size={14} />
                    <span
                        className="happy-agent-provider-login__source-text"
                        data-happy-desktop-ui="happy-agent-provider-sign-in-source"
                    >
                        {[SOURCE_LABELS[signIn.source], signIn.account].filter(Boolean).join(" · ")}
                    </span>
                </Box>
            ) : null}
            {facts.length > 0 ? (
                <dl className="happy-agent-provider-login__facts">
                    {facts.map((fact) => (
                        <Box
                            className="happy-agent-provider-login__fact"
                            data-tone={fact.tone}
                            key={fact.label}
                        >
                            <dt>{fact.label}</dt>
                            <dd>{fact.value}</dd>
                        </Box>
                    ))}
                </dl>
            ) : null}
            {note ? <span className="happy-agent-provider-login__note">{note}</span> : null}
            {props.locked && actions ? (
                <span className="happy-agent-provider-login__note">{props.locked}</span>
            ) : null}
            {actions ? (
                <Box className="happy-agent-provider-login__actions">
                    {signIn.acceptsToken ? (
                        <Button
                            aria-label={`Update the token for ${props.providerName}`}
                            disabled={blocked || signIn.running === true}
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
                            disabled={blocked || !signIn.installed}
                            onClick={props.onSignIn}
                            size="small"
                            variant={
                                activity?.signIn === "signed_out" || refreshError?.permanent
                                    ? "primary"
                                    : "secondary"
                            }
                        >
                            {signIn.running ? "Continue sign-in" : "Sign in again"}
                        </Button>
                    ) : null}
                </Box>
            ) : null}
        </Box>
    );
}

export interface HappyAgentProviderSignInDialogProps {
    /** The account as its card names it, such as "Codex · Work". */
    readonly providerName: string;
    readonly cli: HappyAgentProviderSignInCliId;
    readonly methods: readonly HappyAgentProviderSignInMethodId[];
    /** Absent before a sign-in starts, or after one was cancelled. */
    readonly flow?: HappyAgentProviderSignInFlow;
    /** The signed-in account after success, already worded. */
    readonly account?: string;
    /** A request this window sent that has not been answered. */
    readonly busy?: "start" | "code" | "cancel";
    /** Why the last request was refused. */
    readonly error?: string;
    /** Closes the dialog; a running sign-in is cancelled with it. */
    onClose: () => void;
    onStart: (method?: HappyAgentProviderSignInMethodId) => void;
    onCodeSubmit: (code: string) => void;
    /** Opens the vendor's page; a browser tab when absent. */
    onExternalOpen?: (url: string) => void;
}

/**
 * Signing one account in to a login only Happy uses: the device code to
 * enter, the vendor's page, the code to paste back, and how it ended. The
 * code typed here goes straight to the handler and is not kept.
 */
export function HappyAgentProviderSignInDialog(props: HappyAgentProviderSignInDialogProps) {
    const [code, codeSet] = useState("");
    const vendor = VENDOR_NAMES[props.cli];
    const flow = props.flow;
    const live = flow?.kind === "starting" || flow?.kind === "waiting";
    const open = (url: string): void => {
        if (props.onExternalOpen) props.onExternalOpen(url);
        else window.open(url, "_blank", "noopener,noreferrer");
    };
    const codeSubmit = (): void => {
        if (!code.trim() || props.busy) return;
        props.onCodeSubmit(code);
        codeSet("");
    };
    const browserInstead =
        flow?.kind === "waiting" &&
        flow.method === "device" &&
        props.cli !== "claude" &&
        props.methods.includes("browser");
    const primary =
        flow?.kind === "waiting" ? (
            flow.acceptsCode ? (
                <Button
                    disabled={!code.trim()}
                    loading={props.busy === "code"}
                    onClick={codeSubmit}
                    variant="primary"
                >
                    Submit code
                </Button>
            ) : (
                <Button icon="open-external" onClick={() => open(flow.url)} variant="primary">
                    Open {vendor}
                </Button>
            )
        ) : flow?.kind === "succeeded" ? (
            <Button onClick={props.onClose} variant="primary">
                Done
            </Button>
        ) : flow?.kind === "starting" ? null : (
            <Button
                loading={props.busy === "start"}
                onClick={() => props.onStart()}
                variant="primary"
            >
                {flow?.kind === "failed" ? "Try again" : "Sign in"}
            </Button>
        );
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                className="happy-agent-provider-sign-in"
                data-testid="provider-sign-in-dialog"
                footer={
                    <>
                        {flow?.kind === "succeeded" ? null : (
                            <Button
                                loading={props.busy === "cancel"}
                                onClick={props.onClose}
                                variant="ghost"
                            >
                                {live ? "Cancel" : "Close"}
                            </Button>
                        )}
                        {primary}
                    </>
                }
                onClose={props.onClose}
                size="medium"
                title={`Sign in · ${props.providerName}`}
            >
                <Box
                    className="happy-agent-provider-sign-in__body"
                    data-flow={flow?.kind ?? "idle"}
                >
                    {flow?.kind === "succeeded" ? (
                        <Box className="happy-agent-provider-sign-in__done">
                            <Icon name="check-circle" size={20} />
                            <Box className="happy-agent-provider-sign-in__done-text">
                                <span>Signed in</span>
                                {props.account ? (
                                    <span className="happy-agent-provider-sign-in__hint">
                                        {props.account}
                                    </span>
                                ) : null}
                            </Box>
                        </Box>
                    ) : (
                        <span className="happy-agent-provider-sign-in__hint">{EXPLAINER}</span>
                    )}
                    {flow?.kind === "starting" ? (
                        <Box className="happy-agent-provider-sign-in__line">
                            <Spinner size={16} />
                            <span>Starting the sign-in…</span>
                        </Box>
                    ) : flow?.kind === "waiting" ? (
                        flow.userCode ? (
                            <>
                                <span className="happy-agent-provider-sign-in__text">
                                    Enter this code at {vendor}, on any device.
                                </span>
                                <Box className="happy-agent-provider-sign-in__line">
                                    <span
                                        className="happy-agent-provider-sign-in__code"
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
                                <Box className="happy-agent-provider-sign-in__line happy-agent-provider-sign-in__hint">
                                    <Spinner size={14} />
                                    <span>Waiting for you to finish…</span>
                                </Box>
                                {browserInstead ? (
                                    <Box className="happy-agent-provider-sign-in__line">
                                        <Button
                                            disabled={props.busy !== undefined}
                                            onClick={() => props.onStart("browser")}
                                            size="small"
                                            variant="secondary"
                                        >
                                            Use this computer’s browser instead
                                        </Button>
                                    </Box>
                                ) : null}
                            </>
                        ) : flow.acceptsCode ? (
                            <>
                                <span className="happy-agent-provider-sign-in__text">
                                    Sign in to {vendor} in the browser, then paste the code it
                                    shows.
                                </span>
                                <Box className="happy-agent-provider-sign-in__line">
                                    <Button
                                        icon="open-external"
                                        onClick={() => open(flow.url)}
                                        size="small"
                                        variant="secondary"
                                    >
                                        Open {vendor}
                                    </Button>
                                </Box>
                                <TextField
                                    aria-label={`Code from ${vendor}`}
                                    autoComplete="off"
                                    disabled={props.busy === "code"}
                                    onSubmit={codeSubmit}
                                    onValueChange={codeSet}
                                    placeholder="Paste the code"
                                    type="password"
                                    value={code}
                                />
                            </>
                        ) : (
                            <>
                                <span className="happy-agent-provider-sign-in__text">
                                    {flow.openedByProgram
                                        ? `Finish signing in to ${vendor} in the browser that opened on this computer.`
                                        : `Sign in to ${vendor} in the browser on this computer.`}
                                </span>
                                <Box className="happy-agent-provider-sign-in__line happy-agent-provider-sign-in__hint">
                                    <Spinner size={14} />
                                    <span>Waiting for you to finish…</span>
                                </Box>
                            </>
                        )
                    ) : flow?.kind === "failed" ? (
                        <Banner tone="danger" title={FAILURE_TITLES[flow.failure]}>
                            {flow.message}
                        </Banner>
                    ) : null}
                    {props.error ? <Banner tone="danger">{props.error}</Banner> : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
