import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import {
    CloudOnboardingProviderMark,
    type CloudOnboardingProvider,
} from "./CloudOnboardingProviderRows";
import { CopyButton } from "./CopyButton";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { SegmentedControl } from "./SegmentedControl";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** A provider that is connected in this dialog: every one but a custom endpoint. */
export type CloudOnboardingProviderDialogProvider = Exclude<CloudOnboardingProvider, "custom">;

/** One way to connect a provider: its plan, a Claude setup token, or an API key. */
export type CloudOnboardingProviderWay = "plan" | "token" | "key";

export interface CloudOnboardingProviderDialogProps {
    readonly provider: CloudOnboardingProviderDialogProvider;
    /** The ways this server offers for the provider, plan first. */
    readonly ways: readonly CloudOnboardingProviderWay[];
    readonly way: CloudOnboardingProviderWay;
    /** The server, as the save line names it: "Saved in Acme for everyone to use." */
    readonly team: string;
    /** Where the account is kept. */
    readonly saveTo: "team" | "private";
    /** Whether the reader may change where it is kept: they may add both for the team and for themselves. */
    readonly saveToSwitchable: boolean;
    /**
     * - `idle`: waiting on the person.
     * - `busy`: a request is out.
     * - `waiting`: a sign-in waits on the vendor's page.
     * - `done`: added.
     */
    readonly phase: "idle" | "busy" | "waiting" | "done";
    /** The sign-in the plan way started, once the server has its page. */
    readonly signIn?: { readonly url: string; readonly userCode?: string };
    /** Why the last attempt failed, said where it happened. */
    readonly error?: string;
    /** Whether the reader may set the region every team Bedrock key routes to. */
    readonly regionEditable: boolean;
    onWaySelect(way: CloudOnboardingProviderWay): void;
    onSaveToChange(to: "team" | "private"): void;
    onClose(): void;
    /** The same form again, for one more account. */
    onAddAnother(): void;
    /** Starts the plan's sign-in again after it failed. */
    onSignInStart(): void;
    onSignInCodeSubmit(code: string): void;
    onSetupTokenSubmit(token: string): void;
    /** A Bedrock key may name the region every team Bedrock key routes to. */
    onApiKeySubmit(secret: string, region?: string): void;
    onAwsKeysSubmit(input: {
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
        readonly region?: string;
    }): void;
    /** Opens a vendor's page; a browser tab when absent. */
    onExternalOpen?(url: string): void;
}

interface Vendor {
    readonly name: string;
    /** Who bills a key, and where to make one. */
    readonly keyVendor: string;
    readonly keyLabel: string;
    readonly keyPlaceholder: string;
    readonly keysUrl: string;
    readonly planLabel?: string;
    /**
     * The height of the dialog's tallest view, measured: its key form (Claude's
     * token form is as tall). The card's top is set so that view is centred,
     * and every other view hangs from the same top.
     */
    readonly tallest: number;
}

const VENDORS: Readonly<Record<CloudOnboardingProviderDialogProvider, Vendor>> = {
    chatgpt: {
        name: "ChatGPT",
        keyVendor: "OpenAI",
        keyLabel: "OpenAI API key",
        keyPlaceholder: "sk-…",
        keysUrl: "https://platform.openai.com/api-keys",
        planLabel: "ChatGPT plan",
        tallest: 476,
    },
    claude: {
        name: "Claude",
        keyVendor: "Anthropic",
        keyLabel: "Anthropic API key",
        keyPlaceholder: "sk-ant-…",
        keysUrl: "https://console.anthropic.com/settings/keys",
        planLabel: "Claude plan",
        tallest: 476,
    },
    xai: {
        name: "xAI",
        keyVendor: "xAI",
        keyLabel: "xAI API key",
        keyPlaceholder: "xai-…",
        keysUrl: "https://console.x.ai",
        tallest: 362,
    },
    bedrock: {
        name: "Amazon Bedrock",
        keyVendor: "AWS",
        keyLabel: "Bedrock API key",
        keyPlaceholder: "ABSK…",
        keysUrl: "https://console.aws.amazon.com/bedrock",
        tallest: 434,
    },
};

function wayLabel(
    provider: CloudOnboardingProviderDialogProvider,
    way: CloudOnboardingProviderWay,
) {
    const vendor = VENDORS[provider];
    if (way === "plan") return vendor.planLabel ?? vendor.name;
    if (way === "token") return "Setup token";
    return provider === "bedrock" ? "AWS keys" : vendor.keyLabel;
}

function wayNote(provider: CloudOnboardingProviderDialogProvider, way: CloudOnboardingProviderWay) {
    const vendor = VENDORS[provider];
    if (way === "plan")
        return `Uses the ${vendor.planLabel ?? vendor.name} you already pay for. No key needed.`;
    if (way === "token") return "Uses your Claude plan, through a token made by Claude Code.";
    return `Billed to your ${vendor.keyVendor} account for what agents use.`;
}

/** A visible label over a control that has none of its own. */
function Field(props: {
    readonly label: string;
    readonly note?: string;
    readonly children: ReactNode;
}) {
    return (
        <div className="happy-cloud-provider-field">
            <span className="happy-cloud-provider-field__label">{props.label}</span>
            {props.children}
            {props.note ? <span className="happy-cloud-provider-note">{props.note}</span> : null}
        </div>
    );
}

/** Numbered steps: what to do, in the order to do it. */
function Steps(props: { readonly children: ReactNode }) {
    return <ol className="happy-cloud-provider-steps">{props.children}</ol>;
}

function Step(props: {
    readonly n: number;
    readonly title: string;
    readonly children?: ReactNode;
}) {
    return (
        <li className="happy-cloud-provider-step">
            <span className="happy-cloud-provider-step__n">{`${String(props.n)}.`}</span>
            <div className="happy-cloud-provider-step__body">
                <span className="happy-cloud-provider-step__title">{props.title}</span>
                {props.children}
            </div>
        </li>
    );
}

/**
 * Where the account is saved, said once under the title in every view of the
 * dialog, so the switch never comes and goes while it is open. Only the person
 * changes it; picking a way never does.
 */
function SaveLine(props: {
    readonly team: string;
    readonly saveTo: "team" | "private";
    readonly teamOnly: boolean;
    /** Offered: the reader may keep it either way, and nothing is saved yet. */
    readonly switchable: boolean;
    readonly disabled: boolean;
    onChange(to: "team" | "private"): void;
}) {
    const team = props.saveTo === "team" || props.teamOnly;
    return (
        <div
            className="happy-cloud-provider-save"
            data-happy-desktop-ui="cloud-onboarding-provider-save"
        >
            <span className="happy-cloud-provider-save__icon">
                {team ? (
                    <Icon name="users" size={14} />
                ) : (
                    <Ionicon name="person-outline" size={14} />
                )}
            </span>
            <span className="happy-cloud-provider-save__text">
                {props.teamOnly
                    ? "Saved for the team. Bedrock is team only."
                    : team
                      ? `Saved in ${props.team} for everyone to use.`
                      : "Private. Only you can use it."}
            </span>
            {props.switchable && !props.teamOnly ? (
                // Held at the line's right edge both ways, so it does not move when it flips.
                <Button
                    disabled={props.disabled}
                    onClick={() => props.onChange(team ? "private" : "team")}
                    size="small"
                    variant="ghost"
                >
                    {team ? "Keep private instead" : "Share with the team"}
                </Button>
            ) : null}
        </div>
    );
}

/** AWS access keys while they are typed. */
interface AwsDraft {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly region: string;
}

const AWS_EMPTY: AwsDraft = { accessKeyId: "", secretAccessKey: "", region: "" };

/**
 * C-372 CloudOnboardingProviderDialog — one provider's dialog in Happy Cloud
 * onboarding's AI step, and nothing about any other provider. It opens the
 * same way for the first account and for another one.
 *
 * Its plan comes first where it has one, then a setup token, then an API key,
 * as a switch at the top of the body. The save line under the title says
 * where the account is kept, in every view. The card is as tall as what it
 * shows: its top is set once so the provider's tallest view is centred, and
 * its header, save line and switch hold still while only the bottom edge
 * moves. It has no Back. What the person types is held here only until it is
 * sent.
 */
export function CloudOnboardingProviderDialog(props: CloudOnboardingProviderDialogProps) {
    const [text, setText] = useState("");
    const [region, setRegion] = useState("");
    const [aws, setAws] = useState<AwsDraft | undefined>(AWS_EMPTY);
    const vendor = VENDORS[props.provider];
    const done = props.phase === "done";
    const busy = props.phase === "busy";
    const way = props.way;
    // A request carrying what the person typed: nothing may leave until it is answered.
    const locked = busy && (way !== "plan" || props.signIn !== undefined);
    const open = (url: string): void => {
        if (props.onExternalOpen) props.onExternalOpen(url);
        else window.open(url, "_blank", "noopener,noreferrer");
    };
    const forget = (): void => {
        setText("");
        setRegion("");
        setAws(AWS_EMPTY);
    };
    const waySelect = (next: string): void => {
        const chosen = props.ways.find((entry) => entry === next);
        if (!chosen || chosen === way) return;
        forget();
        props.onWaySelect(chosen);
    };
    const keySubmit = (): void => {
        if (props.provider === "bedrock" && aws) {
            props.onAwsKeysSubmit({
                accessKeyId: aws.accessKeyId,
                secretAccessKey: aws.secretAccessKey,
                ...(aws.region.trim() ? { region: aws.region } : {}),
            });
            return;
        }
        const routed = props.provider === "bedrock" ? region.trim() : "";
        props.onApiKeySubmit(text, routed === "" ? undefined : routed);
    };
    const close = (): void => {
        if (!locked) props.onClose();
    };
    const error = props.error;
    let body: ReactNode;
    // The primary stays pressable, as drawn: the store ignores an empty field.
    let primary: { readonly label: string; onClick(): void } | undefined;
    if (done)
        body = (
            <div
                className="happy-cloud-provider-success"
                data-happy-desktop-ui="cloud-onboarding-provider-success"
            >
                <span className="happy-cloud-provider-success__title">
                    <Icon name="check" size={18} />
                    {`${vendor.name} connected`}
                </span>
                <span className="happy-cloud-provider-success__detail">
                    {`${wayLabel(props.provider, way)}. ${
                        props.saveTo === "team" || props.provider === "bedrock"
                            ? `Everyone on ${props.team} can use it now.`
                            : "Only you can use it."
                    }`}
                </span>
            </div>
        );
    else if (way === "plan" && props.provider === "chatgpt") {
        const code = props.signIn?.userCode;
        body = (
            <Steps>
                <Step n={1} title="Copy this code">
                    <div
                        className="happy-cloud-provider-code"
                        data-happy-desktop-ui="cloud-onboarding-provider-code"
                    >
                        <span className="happy-cloud-provider-code__value">
                            {code ?? (error ? null : <Spinner size={16} />)}
                        </span>
                        {code ? (
                            <CopyButton
                                caption="Copy"
                                copiedCaption="Copied"
                                label="Copy code"
                                text={code}
                            />
                        ) : null}
                    </div>
                </Step>
                <Step n={2} title="Enter it at OpenAI">
                    <div className="happy-cloud-provider-line">
                        <Button
                            disabled={!props.signIn}
                            loading={busy && !props.signIn}
                            onClick={() => {
                                if (!props.signIn) return;
                                if (code)
                                    void navigator.clipboard
                                        ?.writeText(code)
                                        .catch(() => undefined);
                                open(props.signIn.url);
                            }}
                            size="small"
                            trailingIcon="open-external"
                        >
                            Copy code and open OpenAI
                        </Button>
                    </div>
                </Step>
                <Step n={3} title="Come back here">
                    <div
                        className="happy-cloud-provider-wait"
                        data-tone={error ? "attention" : undefined}
                        role="status"
                    >
                        {error ? <Icon name="alert" size={14} /> : <Spinner size={14} />}
                        <span>{error ?? "Waiting for OpenAI. This finishes by itself."}</span>
                    </div>
                    {/* A sign-in that stopped is started again here, so the card
                        keeps the one height every plan view has: no button row. */}
                    {props.phase === "idle" ? (
                        <div className="happy-cloud-provider-line">
                            <Button onClick={props.onSignInStart} size="small" variant="secondary">
                                Try again
                            </Button>
                        </div>
                    ) : null}
                </Step>
            </Steps>
        );
    } else if (way === "plan") {
        body = (
            <Steps>
                <Step n={1} title="Sign in at Claude">
                    <div className="happy-cloud-provider-line">
                        <Button
                            disabled={!props.signIn}
                            loading={busy && !props.signIn}
                            onClick={() => {
                                if (props.signIn) open(props.signIn.url);
                            }}
                            size="small"
                            trailingIcon="open-external"
                        >
                            Open Claude
                        </Button>
                    </div>
                </Step>
                <Step n={2} title="Paste the code Claude shows">
                    <TextField
                        aria-label="Code from Claude"
                        autoComplete="off"
                        disabled={locked}
                        fullWidth
                        onSubmit={() => props.onSignInCodeSubmit(text)}
                        onValueChange={setText}
                        placeholder="Code from Claude"
                        value={text}
                        {...(error
                            ? { error }
                            : { hint: "Claude shows it after you approve Happy." })}
                    />
                </Step>
            </Steps>
        );
        primary =
            props.phase === "idle" && !props.signIn
                ? { label: "Try again", onClick: props.onSignInStart }
                : {
                      label: "Connect",
                      onClick: () => props.onSignInCodeSubmit(text),
                  };
    } else if (way === "token") {
        body = (
            <Steps>
                <Step n={1} title="Run this where Claude Code is signed in">
                    <div className="happy-cloud-provider-command">
                        <code className="happy-cloud-provider-command__text">
                            claude setup-token
                        </code>
                        <CopyButton
                            caption="Copy"
                            copiedCaption="Copied"
                            label="Copy command"
                            text="claude setup-token"
                        />
                    </div>
                </Step>
                <Step n={2} title="Paste the token it prints">
                    <TextField
                        aria-label="Setup token"
                        autoComplete="off"
                        disabled={locked}
                        fullWidth
                        onSubmit={() => props.onSetupTokenSubmit(text)}
                        onValueChange={setText}
                        placeholder="sk-ant-oat01-…"
                        type="password"
                        value={text}
                        {...(error ? { error } : { hint: "It starts with sk-ant-oat01." })}
                    />
                </Step>
            </Steps>
        );
        primary = {
            label: "Connect",
            onClick: () => props.onSetupTokenSubmit(text),
        };
    } else if (props.provider === "bedrock") {
        body = (
            <div className="happy-cloud-provider-stack">
                <Field label="Sign with">
                    <SegmentedControl
                        aria-label="Sign with"
                        disabled={locked}
                        fullWidth
                        onChange={(kind) => {
                            setText("");
                            setRegion("");
                            setAws(kind === "aws" ? AWS_EMPTY : undefined);
                        }}
                        segments={[
                            { value: "apiKey", label: "Bedrock API key" },
                            { value: "aws", label: "AWS access keys" },
                        ]}
                        size="small"
                        value={aws ? "aws" : "apiKey"}
                    />
                </Field>
                {aws ? (
                    <>
                        <div className="happy-cloud-provider-pair">
                            <TextField
                                autoComplete="off"
                                className="happy-cloud-provider-pair__wide"
                                disabled={locked}
                                fullWidth
                                label="Access key ID"
                                onSubmit={keySubmit}
                                onValueChange={(accessKeyId) => setAws({ ...aws, accessKeyId })}
                                placeholder="AKIA…"
                                value={aws.accessKeyId}
                            />
                            <TextField
                                autoComplete="off"
                                className="happy-cloud-provider-pair__narrow"
                                disabled={locked}
                                fullWidth
                                label="Region"
                                onSubmit={keySubmit}
                                onValueChange={(value) => setAws({ ...aws, region: value })}
                                placeholder="us-east-1"
                                value={aws.region}
                            />
                        </div>
                        <TextField
                            autoComplete="off"
                            disabled={locked}
                            fullWidth
                            label="Secret access key"
                            onSubmit={keySubmit}
                            onValueChange={(secretAccessKey) => setAws({ ...aws, secretAccessKey })}
                            type="password"
                            value={aws.secretAccessKey}
                            {...(error
                                ? { error }
                                : { hint: "These keys call Bedrock in the region above." })}
                        />
                    </>
                ) : (
                    <div className="happy-cloud-provider-pair">
                        <TextField
                            autoComplete="off"
                            className="happy-cloud-provider-pair__wide"
                            disabled={locked}
                            fullWidth
                            label="Bedrock API key"
                            onSubmit={keySubmit}
                            onValueChange={setText}
                            placeholder={vendor.keyPlaceholder}
                            type="password"
                            value={text}
                            {...(error
                                ? { error }
                                : props.regionEditable
                                  ? {
                                        hint: "Every team Bedrock key routes to the region beside it.",
                                    }
                                  : {})}
                        />
                        {props.regionEditable ? (
                            <TextField
                                autoComplete="off"
                                className="happy-cloud-provider-pair__narrow"
                                disabled={locked}
                                fullWidth
                                label="Region"
                                onSubmit={keySubmit}
                                onValueChange={setRegion}
                                placeholder="us-east-1"
                                value={region}
                            />
                        ) : null}
                    </div>
                )}
            </div>
        );
        primary = {
            label: "Add keys",
            onClick: keySubmit,
        };
    } else {
        body = (
            <>
                <TextField
                    autoComplete="off"
                    disabled={locked}
                    fullWidth
                    label={vendor.keyLabel}
                    onSubmit={keySubmit}
                    onValueChange={setText}
                    placeholder={vendor.keyPlaceholder}
                    type="password"
                    value={text}
                    {...(error
                        ? { error }
                        : {
                              hint: `Happy checks the key with ${vendor.keyVendor} before saving it.`,
                          })}
                />
                <div
                    className="happy-cloud-provider-help"
                    data-happy-desktop-ui="cloud-onboarding-provider-help"
                >
                    <div className="happy-cloud-provider-help__text">
                        <span className="happy-cloud-provider-help__title">No key yet?</span>
                        <span className="happy-cloud-provider-note">
                            {`Create one on ${vendor.keyVendor}’s API keys page, then paste it above.`}
                        </span>
                    </div>
                    <Button
                        onClick={() => open(vendor.keysUrl)}
                        size="small"
                        trailingIcon="open-external"
                        variant="secondary"
                    >
                        {`Open ${vendor.keyVendor}`}
                    </Button>
                </div>
            </>
        );
        primary = { label: "Add key", onClick: keySubmit };
    }
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                anchorHeight={vendor.tallest}
                busy={locked}
                className="happy-cloud-provider-dialog"
                {...(done
                    ? {
                          footer: (
                              <>
                                  <Button
                                      onClick={() => {
                                          forget();
                                          props.onAddAnother();
                                      }}
                                      variant="secondary"
                                      width={128}
                                  >
                                      Add another
                                  </Button>
                                  <Button onClick={props.onClose} width={128}>
                                      Done
                                  </Button>
                              </>
                          ),
                      }
                    : primary
                      ? {
                            footer: (
                                <Button loading={locked} onClick={primary.onClick} width={128}>
                                    {primary.label}
                                </Button>
                            ),
                        }
                      : {})}
                frame="anchored"
                leading={
                    <span className="happy-cloud-provider-dialog__chip">
                        <CloudOnboardingProviderMark
                            provider={props.provider}
                            size={props.provider === "bedrock" ? 18 : 16}
                        />
                    </span>
                }
                onClose={close}
                size="medium"
                subheader={
                    <SaveLine
                        disabled={busy}
                        onChange={props.onSaveToChange}
                        saveTo={props.saveTo}
                        switchable={props.saveToSwitchable && !done}
                        team={props.team}
                        teamOnly={props.provider === "bedrock"}
                    />
                }
                title={vendor.name}
            >
                {props.ways.length > 1 && !done ? (
                    <Field label="Connect with" note={wayNote(props.provider, way)}>
                        <SegmentedControl
                            aria-label="Connect with"
                            disabled={locked}
                            fullWidth
                            onChange={waySelect}
                            segments={props.ways.map((entry) => ({
                                value: entry,
                                label: wayLabel(props.provider, entry),
                            }))}
                            size="medium"
                            value={way}
                        />
                    </Field>
                ) : null}
                {body}
            </Modal>
        </ModalOverlay>
    );
}
