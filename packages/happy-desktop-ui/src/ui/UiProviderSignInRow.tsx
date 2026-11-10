import { useState, type ReactNode } from "react";
import {
    providerCliAccounts,
    providerCliAccountName,
    providerCliAccountsCount,
    type ProviderCli,
    type ProviderCliAccount,
    type ReplyProviderId,
} from "happy-desktop-state";
import { AssistantMark, type AssistantMarkName } from "../AssistantMark";
import { Button } from "../Button";
import { CopyButton } from "../CopyButton";
import { TextField } from "../TextField";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { UiRow, UiRows } from "./UiRows";

const MARKS: Readonly<Record<ReplyProviderId, AssistantMarkName>> = {
    claude: "claude",
    codex: "openai",
    grok: "grok",
    antigravity: "gemini",
};

const NAMES: Readonly<Record<ReplyProviderId, string>> = {
    claude: "Claude Code",
    codex: "Codex",
    grok: "Grok",
    antigravity: "Antigravity",
};

/** Whether `provider` is an AI this build draws a mark for. */
export function uiProviderKnown(provider: string): provider is ReplyProviderId {
    return provider in MARKS;
}

/** The mark an AI's row or reply option wears. */
export function uiProviderMark(provider: ReplyProviderId): AssistantMarkName {
    return MARKS[provider];
}

/** What the person can do from the row. Absent, that control is inert. */
export type UiProviderSignInRowActions = {
    /** Signs in; installs the program first when it is missing. */
    readonly onSignIn?: () => void;
    readonly onCode?: (code: string) => void;
    /** A setup token or API key, for the person who chose that path. */
    readonly onToken?: (token: string) => void;
    readonly onCancel?: () => void;
    readonly onPageOpen?: (url: string) => void;
};

/**
 * `provider_sign_in` as one row: the AI's mark and name, one line on how it
 * stands, and the one control it needs now. "Set up" installs the program
 * and signs in after it; the page, the code or the field a sign-in needs
 * shows in place while it waits; a token field only once a sign-in is
 * running or has failed and the person chose it. A signed-in AI offers "Use"
 * until the person has chosen it. With `account: "new"` the row adds an
 * account beside the ones the program has.
 *
 * Its height is one row whatever it shows, so the transcript knows it from
 * the component alone.
 */
export function UiProviderSignInRow(
    props: UiProviderSignInRowActions & {
        readonly provider: string;
        /** The program as the server last described it; absent until read. */
        readonly cli?: ProviderCli;
        /** Adds another account instead of signing the default one in. */
        readonly account?: "new";
        /**
         * The person already chose this signed-in AI here (`sign_in` connects it
         * as it is): the row says so and offers nothing more.
         */
        readonly used?: boolean;
        /** A click from this window is on its way. */
        readonly requesting?: boolean;
        /** Why the last click was refused. */
        readonly error?: string;
        /** Pins the spinner on one frame, for a still fixture. */
        readonly spinnerFrame?: number;
        /** Opens the token field, for a still fixture. */
        readonly tokenOpen?: boolean;
    },
) {
    /* The person chose to paste a token instead: the row's field, until sent or closed. */
    const [tokenChosen, setTokenChosen] = useState(props.tokenOpen ?? false);
    const known = uiProviderKnown(props.provider) ? props.provider : undefined;
    const cli = props.cli;
    const name = cli?.name ?? (known ? NAMES[known] : props.provider);
    const accounts = cli ? providerCliAccounts(cli) : [];
    const op = cli?.operation;
    const adding = props.account === "new";
    const signingIn =
        op?.kind === "sign_in" && (op.status === "running" || op.status === "waiting");
    /* While another account signs in, the line counts it: "Adding account 3 · …". */
    const counted = (rest: string) =>
        adding && accounts.length > 0
            ? `Adding account ${String(accounts.length + 1)} · ${rest}`
            : rest.charAt(0).toUpperCase() + rest.slice(1);
    const spin = props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame };
    const row = (
        state: string,
        line: ReactNode,
        tone: "quiet" | "busy" | "done" | "error",
        controls: ReactNode,
    ) => (
        <UiRows data-happy-desktop-ui="chat-ui-provider-sign-in" label={name}>
            <UiRow
                beside={<UiAccountStack accounts={accounts} adding={adding && signingIn} />}
                controls={controls}
                line={line}
                mark={
                    known ? (
                        <AssistantMark name={MARKS[known]} size={20} />
                    ) : (
                        <Ionicon name="sparkles-outline" size={20} />
                    )
                }
                name={name}
                state={state}
                tone={tone}
                {...spin}
            />
        </UiRows>
    );
    const cancel = (
        <Button
            aria-label="Cancel"
            disabled={props.onCancel === undefined}
            icon="close"
            iconOnly
            onClick={() => {
                setTokenChosen(false);
                props.onCancel?.();
            }}
            size="medium"
            variant="ghost"
        />
    );
    const useToken = props.onToken ? (
        <Button onClick={() => setTokenChosen(true)} size="medium" variant="ghost">
            Use a token
        </Button>
    ) : null;
    const tryAgain = (
        <Button
            disabled={props.onSignIn === undefined}
            onClick={props.onSignIn}
            size="medium"
            variant="outline"
        >
            Try again
        </Button>
    );

    if (props.error)
        return row(
            "failed",
            props.error,
            "error",
            <>
                {useToken}
                {tryAgain}
            </>,
        );

    if (tokenChosen && op?.status !== "running")
        return row(
            "token",
            "Paste a setup token or API key",
            "quiet",
            <>
                <RowField
                    label={`${name} setup token or API key`}
                    onSend={(token) => {
                        props.onToken?.(token);
                        setTokenChosen(false);
                    }}
                    placeholder="Token or key"
                    secret
                    send="Save"
                />
                <Button
                    aria-label="Close"
                    icon="close"
                    iconOnly
                    onClick={() => setTokenChosen(false)}
                    size="medium"
                    variant="ghost"
                />
            </>,
        );

    if (cli === undefined)
        return row("checking", `Checking ${name} on this computer…`, "busy", null);

    if (op?.status === "waiting" && op.authorization) {
        const auth = op.authorization;
        const open = (
            <Button
                data-emphasis=""
                data-strong=""
                disabled={props.onPageOpen === undefined}
                onClick={() => props.onPageOpen?.(auth.url)}
                size="medium"
                variant={auth.openedByProgram ? "outline" : "primary"}
            >
                {auth.openedByProgram ? "Reopen page" : "Open sign-in page"}
            </Button>
        );
        if (auth.acceptsCode)
            return row(
                "code",
                counted("paste the code"),
                "busy",
                <>
                    <RowField
                        label="Code from the sign-in page"
                        onSend={(code) => props.onCode?.(code)}
                        placeholder="Code from the page"
                        send="Continue"
                    />
                    {cancel}
                </>,
            );
        if (auth.userCode)
            return row(
                "device",
                <>
                    Enter <code>{auth.userCode}</code> on {`${name}'s page`}
                </>,
                "busy",
                <>
                    <CopyButton label="Copy the code" text={auth.userCode} />
                    {open}
                    {cancel}
                </>,
            );
        return row(
            "browser",
            counted("finish in your browser"),
            "busy",
            <>
                {useToken}
                {open}
                {cancel}
            </>,
        );
    }

    if (op?.status === "running" || op?.status === "waiting")
        return row(
            op.kind === "install" ? "installing" : "starting",
            op.kind === "install" ? op.message : counted(op.message),
            "busy",
            cancel,
        );

    if (op?.status === "failed")
        return row(
            "failed",
            op.error?.message ?? op.message,
            "error",
            <>
                {useToken}
                {tryAgain}
            </>,
        );

    if (props.requesting) return row("starting", counted("starting…"), "busy", null);

    if (cli.installation.status === "missing")
        return row(
            "missing",
            cli.installer
                ? `Not on this computer yet · comes from ${cli.installer.sourceHost}`
                : "Not on this computer yet",
            "quiet",
            <Button
                disabled={props.onSignIn === undefined || cli.installer === null}
                onClick={props.onSignIn}
                size="medium"
                variant="ghost"
            >
                Set up
            </Button>,
        );

    const lapsed = accounts.find((account) => account.signIn === "signed_out");
    if (lapsed && !adding)
        return row(
            "lapsed",
            accounts.length > 1
                ? `${providerCliAccountsCount(accounts.length)} · ${providerCliAccountName(lapsed)} needs to sign in again`
                : `${providerCliAccountName(lapsed)} needs to sign in again`,
            "quiet",
            <Button
                disabled={props.onSignIn === undefined}
                onClick={props.onSignIn}
                size="medium"
                variant="outline"
            >
                Sign in again
            </Button>,
        );
    if (accounts.length === 0)
        return row(
            "signed-out",
            "Not signed in",
            "quiet",
            <Button
                disabled={props.onSignIn === undefined}
                onClick={props.onSignIn}
                size="medium"
                variant="ghost"
            >
                Sign in
            </Button>,
        );
    if (!adding && !props.used && props.onSignIn)
        return row(
            "signed-in",
            uiAccountsLine(accounts),
            "done",
            <Button
                data-emphasis=""
                data-strong=""
                onClick={props.onSignIn}
                size="medium"
                variant="primary"
            >
                {`Use ${name}`}
            </Button>,
        );
    return row(
        "connected",
        uiAccountsLine(accounts),
        "done",
        adding ? (
            <Button
                disabled={props.onSignIn === undefined}
                icon="plus"
                onClick={props.onSignIn}
                size="medium"
                variant="ghost"
            >
                Add account
            </Button>
        ) : null,
    );
}

/**
 * How many accounts a program has, in words: one is its name and plan; more
 * are "2 accounts · ada@example.com +1". Signed-out accounts still count.
 */
export function uiAccountsLine(accounts: readonly ProviderCliAccount[]): string {
    const first = accounts[0];
    if (first === undefined) return "Not signed in";
    if (accounts.length === 1)
        return [providerCliAccountName(first), first.plan].filter(Boolean).join(" · ");
    return `${providerCliAccountsCount(accounts.length)} · ${providerCliAccountName(first)} +${String(accounts.length - 1)}`;
}

const TONES = ["ocean", "mint", "ember"] as const;

/**
 * The accounts a program has, as one initial each, overlapping, up to three
 * and then "+N"; a sign-in adding one more is a dashed ring at the end.
 * Shown from two accounts, or from one while another is added.
 */
export function UiAccountStack(props: {
    readonly accounts: readonly ProviderCliAccount[];
    readonly adding?: boolean;
}) {
    const shown = props.accounts.slice(0, 3);
    const more = props.accounts.length - shown.length;
    if (props.accounts.length < 2 && !props.adding) return null;
    return (
        <span
            aria-label={providerCliAccountsCount(props.accounts.length)}
            className="happy-chat-accounts"
            role="img"
        >
            {shown.map((account, index) => (
                <span
                    className="happy-chat-accounts__one"
                    data-signed-out={account.signIn === "signed_out" ? "" : undefined}
                    data-tone={TONES[index % TONES.length]}
                    key={account.id}
                    title={providerCliAccountName(account)}
                >
                    {providerCliAccountName(account).slice(0, 1).toUpperCase()}
                </span>
            ))}
            {props.adding ? (
                <span className="happy-chat-accounts__one" data-adding="" title="Adding an account">
                    <Ionicon name="add-outline" size={10} />
                </span>
            ) : null}
            {more > 0 ? (
                <span className="happy-chat-accounts__count">{`+${String(more)}`}</span>
            ) : null}
        </span>
    );
}

/** A row's one field: a code or a token, sent with its button or Enter, emptied once sent. */
function RowField(props: {
    readonly label: string;
    readonly placeholder: string;
    readonly send: string;
    readonly secret?: boolean;
    readonly onSend: (value: string) => void;
}) {
    const [value, setValue] = useState("");
    const usable = value.trim() !== "";
    const submit = () => {
        if (!usable) return;
        props.onSend(value.trim());
        setValue("");
    };
    return (
        <>
            <span className="happy-chat-row__field">
                <TextField
                    aria-label={props.label}
                    autoComplete={props.secret ? "off" : "one-time-code"}
                    onSubmit={submit}
                    onValueChange={setValue}
                    placeholder={props.placeholder}
                    size="medium"
                    {...(props.secret ? { type: "password" as const } : {})}
                    value={value}
                />
            </span>
            <Button
                data-emphasis=""
                data-strong=""
                disabled={!usable}
                onClick={submit}
                size="medium"
                variant="primary"
            >
                {props.send}
            </Button>
        </>
    );
}
