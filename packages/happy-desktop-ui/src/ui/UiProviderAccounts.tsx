import { useState, type ReactNode } from "react";
import { AssistantMark, type AssistantMarkName } from "../AssistantMark";
import { Button } from "../Button";
import { CopyButton } from "../CopyButton";
import { TextField } from "../TextField";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { UiRow, UiRows } from "./UiRows";

/*
 * PROTOTYPE — chat UI onboarding experiment (branch
 * worktree/chat-ui-onboarding-experiments). These types mirror a proposed
 * `provider_sign_in` contract that happy-agent does not serve yet: several
 * providers in one component, and several accounts per provider, each sign-in
 * aimed at a new account or at one that needs signing in again. Today the
 * daemon's provider CLI has one sign-in per program and no account list; the
 * Blueprint feeds these from fixtures. See the experiment report for the
 * contract diff.
 */

/** The AI programs Happy signs in to. */
export type UiProviderKey = "claude" | "codex" | "grok" | "antigravity";

/** One account a provider is signed in with. `label` is what the vendor reports: an email or a name. */
export type UiProviderAccount = {
    readonly id: string;
    readonly label: string;
    readonly plan?: string;
    readonly signIn: "signed_in" | "signed_out" | "unknown";
};

/** What the vendor's page asks the person to do while a sign-in waits. */
export type UiProviderAuthorization = {
    readonly url: string;
    /** A code to type on the vendor's page (device sign-in). */
    readonly userCode?: string;
    /** The vendor's page shows a code to paste back here. */
    readonly acceptsCode: boolean;
    /** The program opened the page in the browser itself. */
    readonly openedByProgram: boolean;
};

/** The install or sign-in in progress, and which account a sign-in is for. */
export type UiProviderOperation =
    | { readonly kind: "install"; readonly status: "running"; readonly message: string }
    | {
          readonly kind: "sign_in";
          readonly account: "new" | string;
          readonly status: "running";
          readonly message: string;
      }
    | {
          readonly kind: "sign_in";
          readonly account: "new" | string;
          readonly status: "waiting";
          readonly authorization: UiProviderAuthorization;
      }
    | {
          readonly kind: "install" | "sign_in";
          readonly status: "failed";
          readonly message: string;
      };

/** One provider as the component draws it: whether its program is here, and its accounts. */
export type UiProviderAccounts = {
    readonly provider: UiProviderKey;
    readonly name: string;
    readonly installed: boolean;
    /** Where Happy installs the program from, said before anything runs. */
    readonly installerHost?: string;
    readonly accounts: readonly UiProviderAccount[];
    readonly operation?: UiProviderOperation;
};

/** What the person can do. Each goes to the component's own actions; absent, the control is inert. */
export type UiProviderAccountsActions = {
    /** Signs in a new account, or an account again; installs the program first when it is missing. */
    readonly onSignIn?: (provider: UiProviderKey, account: "new" | string) => void;
    readonly onCode?: (provider: UiProviderKey, code: string) => void;
    /** A setup token or API key, for the person who chose that path. */
    readonly onToken?: (provider: UiProviderKey, token: string) => void;
    readonly onCancel?: (provider: UiProviderKey) => void;
    readonly onPageOpen?: (url: string) => void;
};

const MARKS: Readonly<Record<UiProviderKey, AssistantMarkName>> = {
    claude: "claude",
    codex: "openai",
    grok: "grok",
    antigravity: "gemini",
};

/** The mark a provider's reply option or row wears. */
export function uiProviderMark(provider: UiProviderKey): AssistantMarkName {
    return MARKS[provider];
}

/**
 * `provider_sign_in`, all in one: every AI the person may use, one row each,
 * with the accounts it already has. Each row offers the one thing to do next
 * — sign in, add an account, set it up — and only a row that is signing in
 * shows the page, the code or the field it needs, in place. Tokens and API
 * keys wait behind "Use a token" until someone chooses that path. Drawn with
 * one provider, it is the single step an iterative chat shows.
 *
 * Its height is the number of providers times one row, whatever each row is
 * doing, so the transcript knows it from the component's props.
 */
export function UiProviderAccountsList(
    props: UiProviderAccountsActions & {
        readonly providers: readonly UiProviderAccounts[];
        /** Pins every spinner on one frame, for a still fixture. */
        readonly spinnerFrame?: number;
        /** Opens a row on its token field, for a still fixture. */
        readonly tokenOpen?: UiProviderKey;
    },
) {
    return (
        <UiRows data-happy-desktop-ui="chat-ui-provider-accounts" label="AI accounts">
            {props.providers.map((provider) => (
                <UiProviderAccountRow
                    actions={props}
                    key={provider.provider}
                    provider={provider}
                    {...(props.spinnerFrame === undefined
                        ? {}
                        : { spinnerFrame: props.spinnerFrame })}
                    tokenOpen={props.tokenOpen === provider.provider}
                />
            ))}
        </UiRows>
    );
}

function UiProviderAccountRow(props: {
    readonly provider: UiProviderAccounts;
    readonly actions: UiProviderAccountsActions;
    readonly spinnerFrame?: number;
    readonly tokenOpen: boolean;
}) {
    const p = props.provider;
    const a = props.actions;
    /* The person chose to paste a token instead: the row's field, until sent or closed. */
    const [tokenChosen, setTokenChosen] = useState(props.tokenOpen);
    const op = p.operation;
    const key = p.provider;
    const mark = <AssistantMark name={MARKS[key]} size={20} />;
    const adding = op?.kind === "sign_in" && op.status !== "failed" && op.account === "new";
    const beside = <UiAccountStack accounts={p.accounts} adding={adding} />;
    const spin = props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame };
    const cancel = (
        <Button
            aria-label="Cancel"
            disabled={a.onCancel === undefined}
            icon="close"
            iconOnly
            onClick={() => {
                setTokenChosen(false);
                a.onCancel?.(key);
            }}
            size="medium"
            variant="ghost"
        />
    );
    const useToken = a.onToken ? (
        <Button onClick={() => setTokenChosen(true)} size="medium" variant="ghost">
            Use a token
        </Button>
    ) : null;
    const row = (
        state: string,
        line: ReactNode,
        tone: "quiet" | "busy" | "done" | "error",
        controls: ReactNode,
    ) => (
        <UiRow
            beside={beside}
            controls={controls}
            line={line}
            mark={mark}
            name={p.name}
            state={state}
            tone={tone}
            {...spin}
        />
    );

    if (tokenChosen && op?.status !== "running")
        return row(
            "token",
            "Paste a setup token or API key",
            "quiet",
            <>
                <RowField
                    label={`${p.name} setup token or API key`}
                    onSend={(token) => {
                        a.onToken?.(key, token);
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

    if (op?.status === "running")
        return row(op.kind === "install" ? "installing" : "starting", op.message, "busy", cancel);

    if (op?.status === "waiting") {
        const auth = op.authorization;
        const open = (
            <Button
                data-emphasis=""
                data-strong=""
                disabled={a.onPageOpen === undefined}
                onClick={() => a.onPageOpen?.(auth.url)}
                size="medium"
                variant={auth.openedByProgram ? "outline" : "primary"}
            >
                {auth.openedByProgram ? "Reopen page" : "Open sign-in page"}
            </Button>
        );
        if (auth.acceptsCode)
            return row(
                "code",
                "Paste the code from the page",
                "busy",
                <>
                    <RowField
                        label="Code from the sign-in page"
                        onSend={(code) => a.onCode?.(key, code)}
                        placeholder="Code"
                        send="Continue"
                    />
                    {cancel}
                </>,
            );
        if (auth.userCode)
            return row(
                "device",
                <>
                    Enter <code>{auth.userCode}</code> on {p.name}'s page
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
            "Finish signing in in your browser",
            "busy",
            <>
                {useToken}
                {open}
                {cancel}
            </>,
        );
    }

    if (op?.status === "failed")
        return row(
            "failed",
            op.message,
            "error",
            <>
                {useToken}
                <Button
                    disabled={a.onSignIn === undefined}
                    onClick={() => a.onSignIn?.(key, "new")}
                    size="medium"
                    variant="outline"
                >
                    Try again
                </Button>
            </>,
        );

    if (!p.installed)
        return row(
            "missing",
            p.installerHost
                ? `Not on this computer yet · comes from ${p.installerHost}`
                : "Not on this computer yet",
            "quiet",
            <Button
                disabled={a.onSignIn === undefined || p.installerHost === undefined}
                onClick={() => a.onSignIn?.(key, "new")}
                size="medium"
                variant="ghost"
            >
                Set up
            </Button>,
        );

    const signedIn = p.accounts.filter((account) => account.signIn !== "signed_out");
    const lapsed = p.accounts.find((account) => account.signIn === "signed_out");
    if (lapsed)
        return row(
            "lapsed",
            `${lapsed.label} needs to sign in again`,
            "quiet",
            <Button
                disabled={a.onSignIn === undefined}
                onClick={() => a.onSignIn?.(key, lapsed.id)}
                size="medium"
                variant="outline"
            >
                Sign in again
            </Button>,
        );
    if (signedIn.length === 0)
        return row(
            "signed-out",
            "Not signed in",
            "quiet",
            <Button
                disabled={a.onSignIn === undefined}
                onClick={() => a.onSignIn?.(key, "new")}
                size="medium"
                variant="ghost"
            >
                Sign in
            </Button>,
        );
    const first = signedIn[0]!;
    return row(
        "connected",
        signedIn.length === 1
            ? [first.label, first.plan].filter(Boolean).join(" · ")
            : signedIn.map((account) => account.label).join(", "),
        "done",
        <Button
            disabled={a.onSignIn === undefined}
            icon="plus"
            onClick={() => a.onSignIn?.(key, "new")}
            size="medium"
            variant="ghost"
        >
            Add account
        </Button>,
    );
}

const TONES = ["ocean", "mint", "ember"] as const;

/**
 * The accounts a provider has, as one initial each, overlapping, up to three
 * and then "+N"; a sign-in adding one more is a dashed ring at the end.
 */
export function UiAccountStack(props: {
    readonly accounts: readonly UiProviderAccount[];
    readonly adding?: boolean;
}) {
    const shown = props.accounts.slice(0, 3);
    const more = props.accounts.length - shown.length;
    /* One account is the row's line already; the stack starts at two, or at one being added. */
    if (props.accounts.length < 2 && !props.adding) return null;
    return (
        <span
            aria-label={`${String(props.accounts.length)} account${props.accounts.length === 1 ? "" : "s"}`}
            className="happy-chat-accounts"
            role="img"
        >
            {shown.map((account, index) => (
                <span
                    className="happy-chat-accounts__one"
                    data-signed-out={account.signIn === "signed_out" ? "" : undefined}
                    data-tone={TONES[index % TONES.length]}
                    key={account.id}
                    title={account.label}
                >
                    {account.label.slice(0, 1).toUpperCase()}
                </span>
            ))}
            {props.adding ? (
                <span className="happy-chat-accounts__one" data-adding="" title="Adding an account">
                    <Ionicon name="add" size={10} />
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
