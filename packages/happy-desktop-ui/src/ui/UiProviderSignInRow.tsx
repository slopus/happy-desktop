import { useState, type ReactNode } from "react";
import {
    providerCliAccounts,
    providerCliAccountName,
    providerCliAccountsCount,
    type ProviderCli,
    type ProviderCliAccount,
    type ReplyProviderId,
} from "happy-desktop-state";
import { ASSISTANT_PROVIDER_MARKS, AssistantMark, type AssistantMarkName } from "../AssistantMark";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { UiFixedRow, UiRows } from "./UiRows";

const NAMES: Readonly<Record<ReplyProviderId, string>> = {
    claude: "Claude Code",
    codex: "Codex",
    grok: "Grok",
    antigravity: "Antigravity",
};

/** Whether `provider` is an AI this build draws a mark for. */
export function uiProviderKnown(provider: string): provider is ReplyProviderId {
    return Object.hasOwn(NAMES, provider);
}

/** The mark an AI's row or reply option wears. */
export function uiProviderMark(provider: ReplyProviderId): AssistantMarkName {
    return ASSISTANT_PROVIDER_MARKS[provider];
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

const ORDINALS = [
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
];

/** "Adding a second account…": the account a sign-in adds, by the count it makes. */
function addingLine(accounts: number): string {
    const ordinal = ORDINALS[accounts - 1];
    return ordinal ? `Adding a ${ordinal} account…` : "Adding another account…";
}

/**
 * `provider_sign_in` as one fixed row: the AI's mark and name, one short
 * status line, and the controls it needs now in two fixed slots, the primary
 * one and a dismiss. Whatever state the sign-in is in (checking, missing,
 * signed out, signed in, starting, waiting on the browser, a device code or a
 * pasted code, a token, failed, connected), the row keeps the frame's width
 * and one height, its slots keep their places, and its status is own short
 * copy that fits the narrowest column; a longer reason from the program goes
 * in the status's title. "Set up" installs the program and signs in after it.
 * A signed-in AI offers "Use" until the person has chosen it. With
 * `account: "new"` the row adds an account beside the ones the program has.
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
    /* What the person typed in the row's one field, a code or a token, until sent. */
    const [typed, setTyped] = useState("");
    const known = uiProviderKnown(props.provider) ? props.provider : undefined;
    const cli = props.cli;
    const name = cli?.name ?? (known ? NAMES[known] : props.provider);
    const accounts = cli ? providerCliAccounts(cli) : [];
    const op = cli?.operation;
    const adding = props.account === "new";
    const signingIn =
        op?.kind === "sign_in" && (op.status === "running" || op.status === "waiting");
    /* While another account signs in, the status says which one it will be. */
    const counted = (line: string) =>
        adding && accounts.length > 0 ? addingLine(accounts.length) : line;
    const spin = props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame };
    const row = (
        state: string,
        status: ReactNode,
        tone: "quiet" | "busy" | "done" | "error",
        slots: {
            readonly primary?: ReactNode;
            readonly dismiss?: ReactNode;
            readonly aside?: ReactNode;
            readonly field?: ReactNode;
            readonly title?: string;
        } = {},
    ) => (
        <UiRows data-happy-desktop-ui="chat-ui-provider-sign-in" label={name}>
            <UiFixedRow
                {...(slots.aside ? { aside: slots.aside } : {})}
                lead={<UiAccountStack accounts={accounts} adding={adding && signingIn} />}
                {...(slots.dismiss ? { dismiss: slots.dismiss } : {})}
                {...(slots.field ? { field: slots.field } : {})}
                mark={
                    known ? (
                        <AssistantMark name={uiProviderMark(known)} size={20} />
                    ) : (
                        <Ionicon name="sparkles-outline" size={20} />
                    )
                }
                name={name}
                {...(slots.primary ? { primary: slots.primary } : {})}
                state={state}
                status={status}
                {...(slots.title ? { statusTitle: slots.title } : {})}
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
    /* A token signs in the program's own account, so a row adding another offers none. */
    const useToken =
        props.onToken && !adding ? (
            <button
                className="happy-chat-fixed-row__link"
                onClick={() => {
                    setTyped("");
                    setTokenChosen(true);
                }}
                type="button"
            >
                Use a token
            </button>
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

    /*
     * The row's one field takes the name's place and its button the primary
     * slot; both stay inside the same row, so nothing remounts as it opens.
     */
    const field = (
        label: string,
        placeholder: string,
        secret: boolean,
        onSend: (value: string) => void,
    ) => {
        const usable = typed.trim() !== "";
        const submit = () => {
            if (!usable) return;
            onSend(typed.trim());
            setTyped("");
        };
        return {
            field: (
                <TextField
                    aria-label={label}
                    autoComplete={secret ? "off" : "one-time-code"}
                    onSubmit={submit}
                    onValueChange={setTyped}
                    placeholder={placeholder}
                    size="medium"
                    {...(secret ? { type: "password" as const } : {})}
                    value={typed}
                />
            ),
            submit,
            usable,
        };
    };
    const sendButton = (label: string, entry: { submit: () => void; usable: boolean }) => (
        <Button
            data-emphasis=""
            data-strong=""
            disabled={!entry.usable}
            onClick={entry.submit}
            size="medium"
            variant="primary"
        >
            {label}
        </Button>
    );

    if (props.error)
        return row("failed", "Didn't go through", "error", {
            primary: tryAgain,
            aside: useToken,
            title: props.error,
        });

    if (tokenChosen && op?.status !== "running") {
        const token = field(`${name} setup token or API key`, "Token", true, (value) => {
            props.onToken?.(value);
            setTokenChosen(false);
        });
        return row("token", "Paste a setup token or API key", "quiet", {
            field: token.field,
            primary: sendButton("Save", token),
            dismiss: (
                <Button
                    aria-label="Close"
                    icon="close"
                    iconOnly
                    onClick={() => {
                        setTokenChosen(false);
                        setTyped("");
                    }}
                    size="medium"
                    variant="ghost"
                />
            ),
        });
    }

    if (cli === undefined) return row("checking", "Checking this computer…", "busy");

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
                {auth.openedByProgram ? "Reopen" : "Open page"}
            </Button>
        );
        if (auth.acceptsCode) {
            const code = field("Code from the sign-in page", "Code", false, (value) =>
                props.onCode?.(value),
            );
            return row("code", counted("Paste the code from the page"), "busy", {
                field: code.field,
                primary: sendButton("Continue", code),
                dismiss: cancel,
            });
        }
        if (auth.userCode)
            return row(
                "device",
                <>
                    Enter <code>{auth.userCode}</code>
                </>,
                "busy",
                {
                    primary: open,
                    dismiss: cancel,
                    aside: <CopyLink text={auth.userCode} />,
                    title: `Enter ${auth.userCode} on ${name}'s page`,
                },
            );
        return row("browser", counted("Finish in your browser"), "busy", {
            primary: open,
            dismiss: cancel,
            aside: useToken,
            title: "Finish in your browser",
        });
    }

    if (op?.status === "running" || op?.status === "waiting")
        return op.kind === "install"
            ? row("installing", `Installing ${name}…`, "busy", {
                  dismiss: cancel,
                  title: op.message,
              })
            : row("starting", counted("Starting sign-in…"), "busy", {
                  dismiss: cancel,
                  title: op.message,
              });

    if (op?.status === "failed")
        return row("failed", "Sign-in didn't finish", "error", {
            primary: tryAgain,
            aside: useToken,
            title: op.error?.message ?? op.message,
        });

    if (props.requesting) return row("starting", counted("Starting sign-in…"), "busy");

    if (cli.installation.status === "missing")
        return row(
            "missing",
            cli.installer ? `Not installed · from ${cli.installer.sourceHost}` : "Not installed",
            "quiet",
            {
                primary: (
                    <Button
                        disabled={props.onSignIn === undefined || cli.installer === null}
                        onClick={props.onSignIn}
                        size="medium"
                        variant="outline"
                    >
                        Set up
                    </Button>
                ),
            },
        );

    const signIn = (label: string) => (
        <Button
            disabled={props.onSignIn === undefined}
            onClick={props.onSignIn}
            size="medium"
            variant="outline"
        >
            {label}
        </Button>
    );
    /* Some accounts signed out while others still work; all of them out is just signed out. */
    const lapsed = accounts.filter((account) => account.signIn === "signed_out");
    if (lapsed.length > 0 && lapsed.length < accounts.length && !adding)
        return row(
            "lapsed",
            `${String(lapsed.length)} of ${providerCliAccountsCount(accounts.length)} signed out`,
            "quiet",
            {
                primary: signIn("Sign in"),
                title: lapsed.map((account) => providerCliAccountName(account)).join(", "),
            },
        );
    if (lapsed.length === accounts.length)
        return row("signed-out", "Not signed in", "quiet", { primary: signIn("Sign in") });
    if (!adding && !props.used && props.onSignIn)
        return row("signed-in", uiAccountsLine(accounts), "done", {
            primary: (
                <Button
                    data-emphasis=""
                    data-strong=""
                    onClick={props.onSignIn}
                    size="medium"
                    variant="primary"
                >
                    Use
                </Button>
            ),
            title: accountNames(accounts),
        });
    return row("connected", uiAccountsLine(accounts), "done", {
        ...(adding
            ? {
                  primary: (
                      <Button
                          aria-label="Add account"
                          disabled={props.onSignIn === undefined}
                          icon="plus"
                          onClick={props.onSignIn}
                          size="medium"
                          variant="outline"
                      >
                          Add
                      </Button>
                  ),
              }
            : {}),
        title: uiAccountsLine(accounts),
    });
}

/**
 * How many accounts a program has, in words short enough for the narrowest
 * row: one is its name and plan; more are "2 accounts", their initials
 * opening the line. Signed-out accounts still count.
 */
export function uiAccountsLine(accounts: readonly ProviderCliAccount[]): string {
    const first = accounts[0];
    if (first === undefined) return "Not signed in";
    if (accounts.length === 1)
        return [providerCliAccountName(first), first.plan].filter(Boolean).join(" · ");
    return providerCliAccountsCount(accounts.length);
}

/** Every account by name, for the status's title. */
function accountNames(accounts: readonly ProviderCliAccount[]): string {
    return accounts.map((account) => providerCliAccountName(account)).join(", ");
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

/** A status line's copy action: the code to type on the vendor's page. */
function CopyLink(props: { readonly text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            className="happy-chat-fixed-row__link"
            onClick={() => {
                void navigator.clipboard?.writeText(props.text).then(() => setCopied(true));
            }}
            type="button"
        >
            {copied ? "Copied" : "Copy code"}
        </button>
    );
}
