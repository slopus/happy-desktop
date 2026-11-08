import { useContext, useState, type ReactNode } from "react";
import {
    happyAgentThinkingLabel,
    type ChatFigure,
    type HappyAgentDefaultModelSelection,
    type HappyAgentDefaultModelSnapshot,
    type ProviderCli,
} from "happy-desktop-state";
import { AssistantMark, type AssistantMarkName } from "./AssistantMark";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { MessageSettingsLinksContext } from "./MessageMarkdown";
import { Select } from "./Select";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import { Ionicon } from "./vectorIcons/VectorIcon";

/**
 * The live figures an agent may put in a reply (C-338, happy-agent API.md
 * "Inline actions"): one provider CLI with its install and sign-in, the
 * default model for new chats, and a team server's ways into Settings. Each
 * fills the one fixed box `ChatActionBlock` gives its figure, whatever state it
 * is in, so the height the transcript reserved for it holds from missing to
 * signed in. They draw props only; the conversation's owner supplies the live
 * state.
 */

/** The marks of the programs this build knows; a newer one is drawn without. */
const PRODUCT_MARKS: ReadonlyMap<string, AssistantMarkName> = new Map([
    ["claude", "claude"],
    ["codex", "openai"],
    ["grok", "grok"],
    ["antigravity", "gemini"],
]);

const PRODUCT_NAMES: ReadonlyMap<string, string> = new Map([
    ["claude", "Claude Code"],
    ["codex", "Codex"],
    ["grok", "Grok"],
    ["antigravity", "Antigravity"],
]);

export type ChatProviderCliFigureProps = {
    readonly cliId: string;
    /** The program as the server last described it; absent until it has been read. */
    readonly cli?: ProviderCli;
    /** A request from this window is on its way. */
    readonly requesting?: boolean;
    /** Why the last request was refused. */
    readonly error?: string;
    readonly onInstall?: () => void;
    readonly onSignIn?: () => void;
    readonly onPageOpen?: (url: string) => void;
    readonly onCodeSend?: (code: string) => void;
    readonly onCancel?: () => void;
    /** Pins the spinner on one frame, for a still fixture. */
    readonly spinnerFrame?: number;
};

type CliState =
    | { readonly kind: "reading" }
    | { readonly kind: "missing"; readonly installer: ProviderCli["installer"] }
    | { readonly kind: "signedOut"; readonly version: string | null; readonly known: boolean }
    | {
          readonly kind: "busy";
          readonly message: string;
          readonly authorization: NonNullable<ProviderCli["operation"]>["authorization"];
      }
    | { readonly kind: "signedIn"; readonly email: string | null; readonly plan: string | null }
    | { readonly kind: "failed"; readonly message: string; readonly retry: "install" | "signIn" };

/** What the figure shows: the operation first, then what is installed and signed in. */
function cliState(cli: ProviderCli | undefined): CliState {
    if (!cli) return { kind: "reading" };
    const operation = cli.operation;
    if (operation?.status === "running" || operation?.status === "waiting")
        return {
            kind: "busy",
            message: operation.message,
            authorization: operation.authorization,
        };
    if (operation?.status === "failed")
        return {
            kind: "failed",
            message: operation.error?.message ?? operation.message,
            retry: cli.installation.status === "missing" ? "install" : "signIn",
        };
    /* A finished or cancelled operation draws as what it left behind. */
    if (cli.installation.status === "missing") return { kind: "missing", installer: cli.installer };
    if (cli.signIn.status === "signed_in")
        return {
            kind: "signedIn",
            email: cli.signIn.account?.email ?? null,
            plan: cli.signIn.account?.plan ?? null,
        };
    return {
        kind: "signedOut",
        version: cli.installation.version,
        known: cli.signIn.status === "signed_out",
    };
}

export function ChatProviderCliFigure(props: ChatProviderCliFigureProps) {
    const state = cliState(props.cli);
    const name = props.cli?.name ?? PRODUCT_NAMES.get(props.cliId) ?? props.cliId;
    const productMark = PRODUCT_MARKS.get(props.cliId);
    const vendor = props.cli?.vendor;
    const busy = props.requesting === true;
    let mark: ReactNode;
    let line: ReactNode;
    let controls: ReactNode = null;
    /* What installing runs, shown exactly before it is pressed: one line, the whole of it on hover and in the copy. */
    let command: string | undefined;
    const spinner = (
        <Spinner
            size={16}
            {...(props.spinnerFrame === undefined ? {} : { frame: props.spinnerFrame })}
        />
    );
    switch (state.kind) {
        case "reading":
            mark = spinner;
            line = `Checking ${name} on this computer…`;
            break;
        case "missing":
            mark = <Ionicon name="download-outline" size={16} />;
            if (state.installer) {
                line = `Not installed · official installer from ${state.installer.sourceHost}`;
                command = state.installer.command;
                controls = (
                    <FigureButton busy={busy} emphasized onPress={props.onInstall}>
                        Install and sign in
                    </FigureButton>
                );
            } else line = `Not installed, and Happy can't install ${name} here.`;
            break;
        case "signedOut": {
            mark = <Ionicon name="log-in-outline" size={16} />;
            const installed = state.version ? `Installed (${state.version}).` : "Installed.";
            line = state.known
                ? `${installed} Not signed in yet.`
                : `${installed} Happy can't tell whether it's signed in.`;
            controls = (
                <FigureButton busy={busy} emphasized onPress={props.onSignIn}>
                    Sign in
                </FigureButton>
            );
            break;
        }
        case "busy": {
            mark = spinner;
            const authorization = state.authorization;
            line = (
                <>
                    {state.message}
                    {authorization?.userCode ? (
                        <>
                            {" "}
                            Code{" "}
                            <code className="happy-chat-figure__user-code">
                                {authorization.userCode}
                            </code>
                        </>
                    ) : null}
                </>
            );
            const url = authorization?.url;
            controls = (
                <>
                    {url ? (
                        <FigureButton
                            emphasized
                            onPress={props.onPageOpen ? () => props.onPageOpen?.(url) : undefined}
                        >
                            Open sign-in page
                        </FigureButton>
                    ) : null}
                    {authorization?.acceptsCode ? (
                        <FigureCode busy={busy} onSend={props.onCodeSend} />
                    ) : null}
                    <FigureButton busy={busy} onPress={props.onCancel}>
                        Cancel
                    </FigureButton>
                </>
            );
            break;
        }
        case "signedIn":
            mark = <Ionicon name="checkmark-circle" size={16} />;
            line = state.email
                ? `Signed in as ${state.email}${state.plan ? ` · ${state.plan}` : ""}`
                : "Signed in";
            break;
        case "failed":
            mark = <Ionicon name="alert-circle" size={16} />;
            line = state.message;
            controls = (
                <FigureButton
                    busy={busy}
                    onPress={state.retry === "install" ? props.onInstall : props.onSignIn}
                >
                    Try again
                </FigureButton>
            );
            break;
    }
    return (
        <div
            className="happy-chat-figure happy-chat-figure--provider-cli"
            data-happy-desktop-ui="chat-figure-provider-cli"
            data-state={state.kind}
        >
            <div className="happy-chat-figure__head">
                {productMark ? (
                    <span className="happy-chat-figure__product">
                        <AssistantMark name={productMark} size={16} />
                    </span>
                ) : null}
                <span className="happy-chat-figure__name">{name}</span>
                {vendor ? <span className="happy-chat-figure__vendor">{vendor}</span> : null}
            </div>
            <div
                className="happy-chat-figure__line"
                data-error={props.error ? "" : undefined}
                data-state={state.kind}
                role="status"
            >
                <span className="happy-chat-figure__mark">
                    {props.error ? <Ionicon name="alert-circle" size={16} /> : mark}
                </span>
                {command && !props.error ? (
                    <span className="happy-chat-figure__text happy-chat-figure__disclosure">
                        <span className="happy-chat-figure__sentence">{line}</span>
                        <span className="happy-chat-figure__command-row">
                            <code className="happy-chat-figure__command" title={command}>
                                {command}
                            </code>
                            <CopyButton label="Copy command" text={command} />
                        </span>
                    </span>
                ) : (
                    <span className="happy-chat-figure__text">{props.error ?? line}</span>
                )}
            </div>
            <div className="happy-chat-figure__controls">{controls}</div>
        </div>
    );
}

function FigureButton(props: {
    readonly busy?: boolean;
    readonly children: ReactNode;
    readonly emphasized?: boolean;
    readonly onPress: (() => void) | undefined;
}) {
    return (
        <Button
            className="happy-chat-action__button"
            data-emphasis={props.emphasized ? "" : undefined}
            data-strong={props.emphasized ? "" : undefined}
            disabled={props.busy === true || props.onPress === undefined}
            onClick={() => props.onPress?.()}
            size="medium"
            variant="outline"
        >
            {props.children}
        </Button>
    );
}

/** The code a vendor's page shows, typed back; it goes to the sign-in only. */
function FigureCode(props: {
    readonly busy: boolean;
    readonly onSend: ((code: string) => void) | undefined;
}) {
    const [code, setCode] = useState("");
    const usable = code.trim() !== "" && !props.busy && props.onSend !== undefined;
    const send = () => {
        if (!usable) return;
        props.onSend?.(code.trim());
        setCode("");
    };
    return (
        <span className="happy-chat-figure__code">
            <TextField
                aria-label="Code from the sign-in page"
                autoComplete="one-time-code"
                className="happy-chat-figure__code-field"
                onSubmit={send}
                onValueChange={setCode}
                placeholder="Paste the code"
                size="medium"
                value={code}
            />
            <Button disabled={!usable} onClick={send} size="medium" variant="outline">
                Send
            </Button>
        </span>
    );
}

export type ChatDefaultModelFigureProps = {
    readonly state: HappyAgentDefaultModelSnapshot;
    /** Changes the default. Absent, the figure only shows it. */
    readonly onChange?: (selection: HappyAgentDefaultModelSelection) => void;
    /** Pins the spinner on one frame, for a still fixture. */
    readonly spinnerFrame?: number;
};

const choiceKey = (selection: { providerId: string; modelId: string }) =>
    `${selection.providerId}\u0000${selection.modelId}`;

/** The model new chats start on and its effort, each a select that changes it. */
export function ChatDefaultModelFigure(props: ChatDefaultModelFigureProps) {
    const state = props.state;
    /* While a change is on its way, the selects show it; the server's answer then holds. */
    const shown = state.saving ?? state.current;
    const choice = shown
        ? state.choices.find((candidate) => choiceKey(candidate) === choiceKey(shown))
        : undefined;
    const effort = shown?.effort ?? choice?.defaultEffort;
    const usable = props.onChange !== undefined && !state.loading && state.saving === undefined;
    const modelOptions = state.choices.map((candidate) => ({
        value: choiceKey(candidate),
        label: duplicateNamed(state.choices, candidate.modelName)
            ? `${candidate.modelName} · ${candidate.providerName}`
            : candidate.modelName,
    }));
    const line = state.saveError
        ? state.saveError.message
        : state.saving
          ? "Saving…"
          : state.loading
            ? "Reading the models this Happy Agent offers…"
            : "New chats start here. Chats you already have keep their own.";
    return (
        <div
            className="happy-chat-figure happy-chat-figure--setting"
            data-happy-desktop-ui="chat-figure-default-model"
        >
            <div className="happy-chat-figure__head">
                <span className="happy-chat-figure__name">Default model</span>
            </div>
            <div className="happy-chat-figure__controls">
                <Select
                    aria-label="Default model"
                    disabled={!usable || modelOptions.length === 0}
                    onValueChange={(value) => {
                        const next = state.choices.find(
                            (candidate) => choiceKey(candidate) === value,
                        );
                        if (next)
                            props.onChange?.({
                                providerId: next.providerId,
                                modelId: next.modelId,
                            });
                    }}
                    options={modelOptions}
                    placeholder={state.loading ? "Loading…" : "No models yet"}
                    size="medium"
                    value={choice ? choiceKey(choice) : ""}
                    width={280}
                />
                <Select
                    aria-label="Effort"
                    disabled={!usable || !choice || choice.efforts.length < 2}
                    onValueChange={(value) => {
                        const level = choice?.efforts.find((candidate) => candidate === value);
                        if (choice && level)
                            props.onChange?.({
                                providerId: choice.providerId,
                                modelId: choice.modelId,
                                effort: level,
                            });
                    }}
                    options={(choice?.efforts ?? []).map((level) => ({
                        value: level,
                        label: happyAgentThinkingLabel(level),
                    }))}
                    placeholder="Effort"
                    size="medium"
                    value={effort ?? ""}
                    width={140}
                />
            </div>
            <div
                className="happy-chat-figure__line"
                data-error={state.saveError ? "" : undefined}
                role="status"
            >
                <span className="happy-chat-figure__mark">
                    {state.saveError ? (
                        <Ionicon name="alert-circle" size={16} />
                    ) : state.saving || state.loading ? (
                        <Spinner
                            size={16}
                            {...(props.spinnerFrame === undefined
                                ? {}
                                : { frame: props.spinnerFrame })}
                        />
                    ) : (
                        <Ionicon name="information-circle-outline" size={16} />
                    )}
                </span>
                <span className="happy-chat-figure__text">{line}</span>
            </div>
        </div>
    );
}

function duplicateNamed(
    choices: HappyAgentDefaultModelSnapshot["choices"],
    modelName: string,
): boolean {
    let seen = 0;
    for (const candidate of choices) if (candidate.modelName === modelName) seen += 1;
    return seen > 1;
}

/** The team figures a reply may hold, each drawn as the way into one Settings page. */
export type ChatSettingsFigureType = Extract<
    ChatFigure["type"],
    "invite" | "members" | "providers" | "computeJoin" | "serverLink"
>;

/** Each team figure's Settings page, and what its way in says. */
export const CHAT_SETTINGS_FIGURES: ReadonlyMap<
    ChatSettingsFigureType,
    { readonly page: string; readonly title: string; readonly detail: string }
> = new Map([
    [
        "invite",
        {
            page: "members",
            title: "Invite teammates",
            detail: "Owners and admins create invite codes in Members.",
        },
    ],
    [
        "members",
        { page: "members", title: "Members", detail: "Everyone on this server, and their roles." },
    ],
    [
        "providers",
        {
            page: "providers",
            title: "AI providers",
            detail: "The subscriptions and keys this server's agents run on.",
        },
    ],
    [
        "computeJoin",
        {
            page: "computes",
            title: "Add a computer",
            detail: "Join a machine to this server so agents can work on it.",
        },
    ],
    [
        "serverLink",
        {
            page: "mobile-access",
            title: "Connect your phone",
            detail: "Link the Happy phone app to this server.",
        },
    ],
]);

/**
 * A team figure as the way into the Settings page that does what it shows,
 * opened through the conversation's settings links. Where the window has no
 * such page the button is drawn but cannot be pressed.
 */
export function ChatSettingsFigure(props: { readonly type: ChatSettingsFigureType }) {
    const links = useContext(MessageSettingsLinksContext);
    const settings = CHAT_SETTINGS_FIGURES.get(props.type);
    if (settings === undefined) return null;
    const open = links?.has(settings.page) === true ? links : undefined;
    return (
        <div
            className="happy-chat-figure happy-chat-figure--settings"
            data-happy-desktop-ui="chat-figure-settings"
        >
            <div className="happy-chat-figure__head">
                <span className="happy-chat-figure__name">{settings.title}</span>
            </div>
            <div className="happy-chat-figure__line">
                <span className="happy-chat-figure__text">{settings.detail}</span>
            </div>
            <div className="happy-chat-figure__controls">
                <Button
                    disabled={open === undefined}
                    onClick={() => open?.open(settings.page)}
                    size="medium"
                    variant="outline"
                >
                    Open Settings
                </Button>
            </div>
        </div>
    );
}
