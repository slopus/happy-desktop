import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { Icon } from "../../Icon";
import { IconTile, type IconTileProps } from "../../IconTile";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { SegmentedControl } from "../../SegmentedControl";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";

/** The vendors an API key is added for by hand; Bedrock also takes AWS access keys. */
export type HappyAgentProviderKeyVendor = "openai" | "anthropic" | "grok" | "bedrock";

/** Which way of adding a provider the dialog shows. */
export type HappyAgentProviderAddFlow =
    | { readonly kind: "choose" }
    | { readonly kind: "apiKey"; readonly vendor: HappyAgentProviderKeyVendor }
    | { readonly kind: "chatgpt" }
    | { readonly kind: "claude"; readonly setupToken: boolean };

/** One provider the dialog offers to keep what it adds in. */
export interface HappyAgentProviderAddDestinationOption {
    readonly id: string;
    readonly name: string;
}

/** Where what is added is kept: a provider already listed, or a new one by this name. */
export type HappyAgentProviderAddDestination =
    | { readonly kind: "existing"; readonly id: string }
    | { readonly kind: "new"; readonly name: string };

export interface HappyAgentProviderAddDialogProps {
    readonly flow: HappyAgentProviderAddFlow;
    /**
     * Once a flow is chosen: `details` asks for a name and where it goes,
     * then `credential` takes the key or runs the sign-in.
     */
    readonly step: "details" | "credential";
    /** Whose it is: the team's, or the reader's own. */
    readonly to: "private" | "team";
    /** Whether the reader may choose: both Team and Personal are allowed. */
    readonly scopeChoice: boolean;
    /** The name typed for what is added. */
    readonly label: string;
    /** The name it gets when none is typed; a sign-in is named after its account. */
    readonly labelPlaceholder?: string;
    /** The providers of `to` that can take it, the default first. */
    readonly destinations: readonly HappyAgentProviderAddDestinationOption[];
    readonly destination: HappyAgentProviderAddDestination;
    /** Whether it may go in a new provider; Bedrock's keys may not. */
    readonly newAllowed: boolean;
    /** The vendors offered for a key; Bedrock only to those who manage the team's. */
    readonly keyVendors: readonly HappyAgentProviderKeyVendor[];
    /** Whether the chosen key can only be kept for the team, as Bedrock's is. */
    readonly teamOnly: boolean;
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
    /** Whether the reader may set team routing, such as Bedrock's region. */
    readonly teamRoutingEditable: boolean;
    /** Whether this server signs in to ChatGPT itself. */
    readonly chatgptAvailable: boolean;
    /** Whether this server signs in to Claude itself. */
    readonly claudeAvailable: boolean;
    /** Whether this server takes a Claude setup token. */
    readonly setupTokenAvailable: boolean;
    onFlowSelect: (flow: HappyAgentProviderAddFlow) => void;
    onBack: () => void;
    onClose: () => void;
    onScopeChange: (to: "private" | "team") => void;
    onLabelChange: (label: string) => void;
    onDestinationSelect: (id: string) => void;
    onDestinationNewSelect: () => void;
    onDestinationNameChange: (name: string) => void;
    /** From the name and destination on to the credential. */
    onDetailsSubmit: () => void;
    /** A Bedrock key may name the region every team Bedrock key routes to. */
    onApiKeySubmit: (secret: string, region?: string) => void;
    onAwsKeysSubmit: (input: {
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
        readonly region?: string;
    }) => void;
    onSetupTokenSubmit: (token: string) => void;
    onSignInStart: () => void;
    onSignInCodeSubmit: (code: string) => void;
    /** Opens a vendor's page; a browser tab when absent. */
    onExternalOpen?: (url: string) => void;
    /** Starts a custom provider for the team; the Custom family is offered only with it. */
    onCustomProviderCreate?: () => void;
}

const VENDOR_NAMES: Record<HappyAgentProviderKeyVendor, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    grok: "Grok",
    bedrock: "Amazon Bedrock",
};

const KEY_PLACEHOLDERS: Record<HappyAgentProviderKeyVendor, string> = {
    openai: "sk-…",
    anthropic: "sk-ant-…",
    grok: "xai-…",
    bedrock: "ABSK…",
};

/** AWS access keys while they are typed. */
interface AwsDraft {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly region: string;
}

const AWS_EMPTY: AwsDraft = { accessKeyId: "", secretAccessKey: "", region: "" };

/** A row of the chooser: one vendor, with every way this server and role offer to add it. */
interface ProviderFamily {
    readonly id: "chatgpt" | "claude" | "grok" | "bedrock" | "custom";
    readonly name: string;
    readonly tile: IconTileProps;
    /** The line under the name; Custom says what it takes instead. */
    readonly ways?: string;
    readonly methods: readonly ProviderMethod[];
}

/** One way of adding a family's provider; `way` is its word in the family's line. */
interface ProviderMethod {
    readonly id: string;
    readonly way: string;
    readonly title: string;
    readonly detail: string;
    readonly pick: () => void;
}

function waysOf(family: ProviderFamily): string {
    if (family.ways !== undefined) return family.ways;
    const ways = family.methods.map((method, index) =>
        index > 0 && /^\p{Lu}\p{Ll}/u.test(method.way)
            ? method.way[0]!.toLowerCase() + method.way.slice(1)
            : method.way,
    );
    return ways.length > 1 ? `${ways.slice(0, -1).join(", ")} or ${ways.at(-1)}` : ways.join("");
}

/**
 * The families in the native clients' order and words: ChatGPT, Claude,
 * Grok, then Bedrock for the team and Custom, each only with a way to add it.
 */
function familiesOf(
    props: HappyAgentProviderAddDialogProps,
    select: (flow: HappyAgentProviderAddFlow) => void,
): readonly ProviderFamily[] {
    const keys = (vendor: HappyAgentProviderKeyVendor): boolean =>
        props.keyVendors.includes(vendor);
    const key = (
        vendor: HappyAgentProviderKeyVendor,
        title: string,
        detail: string,
    ): ProviderMethod => ({
        id: `api-key-${vendor}`,
        way: "API key",
        title,
        detail,
        pick: () => select({ kind: "apiKey", vendor }),
    });
    const families: ProviderFamily[] = [
        {
            id: "chatgpt",
            name: "ChatGPT",
            tile: { mark: "openai", tone: "green" },
            methods: [
                ...(props.chatgptAvailable
                    ? [
                          {
                              id: "sign-in",
                              way: "Sign in",
                              title: "Sign in with ChatGPT",
                              detail: "Uses your ChatGPT plan",
                              pick: () => select({ kind: "chatgpt" }),
                          },
                      ]
                    : []),
                ...(keys("openai")
                    ? [key("openai", "OpenAI API key", "Billed to your OpenAI account")]
                    : []),
            ],
        },
        {
            id: "claude",
            name: "Claude",
            tile: { mark: "claude", tone: "orange" },
            methods: [
                ...(props.claudeAvailable
                    ? [
                          {
                              id: "sign-in",
                              way: "Sign in",
                              title: "Sign in with Claude",
                              detail: "Uses your Claude plan",
                              pick: () => select({ kind: "claude", setupToken: false }),
                          },
                      ]
                    : []),
                ...(props.setupTokenAvailable
                    ? [
                          {
                              id: "setup-token",
                              way: "Setup token",
                              title: "Use a setup token",
                              detail: "Uses your Claude plan, from claude setup-token",
                              pick: () => select({ kind: "claude", setupToken: true }),
                          },
                      ]
                    : []),
                ...(keys("anthropic")
                    ? [key("anthropic", "Anthropic API key", "Billed to your Anthropic account")]
                    : []),
            ],
        },
        {
            id: "grok",
            name: "Grok",
            tile: { ionicon: "flash-outline", tone: "gray" },
            methods: keys("grok")
                ? [
                      {
                          ...key("grok", "xAI API key", "Billed to your xAI account"),
                          way: "xAI API key",
                      },
                  ]
                : [],
        },
        {
            id: "bedrock",
            name: "Amazon Bedrock",
            tile: { ionicon: "cloud-outline", tone: "orange" },
            ways: "API key or AWS access keys, for the team",
            methods: keys("bedrock")
                ? [key("bedrock", "Amazon Bedrock key", "Billed to your AWS account")]
                : [],
        },
    ];
    const custom = props.onCustomProviderCreate;
    if (custom)
        families.push({
            id: "custom",
            name: "Custom",
            tile: { ionicon: "code-slash-outline", tone: "blue" },
            ways: "Any endpoint that speaks OpenAI’s API",
            methods: [
                {
                    id: "custom",
                    way: "",
                    title: "Custom provider",
                    detail: "An endpoint that speaks OpenAI’s Responses API.",
                    pick: custom,
                },
            ],
        });
    return families.filter((family) => family.methods.length > 0);
}

function titleOf(flow: HappyAgentProviderAddFlow): string {
    switch (flow.kind) {
        case "choose":
            return "Add a provider";
        case "apiKey":
            return `${VENDOR_NAMES[flow.vendor]} key`;
        case "chatgpt":
            return "Sign in with ChatGPT";
        case "claude":
            return flow.setupToken ? "Setup token" : "Sign in with Claude";
    }
}

/**
 * Adds an AI provider on Happy Cloud, one step at a time. It opens on the
 * families; one with two ways or more asks which next, and a way is a ChatGPT
 * or Claude sign-in that the server finishes itself, an API key, a Claude
 * setup token, or a custom provider. Then it asks what to call it and where
 * it goes — a provider already there or a new one — and only then for the
 * key or the sign-in. Which family is open is held here, so Back from a way
 * returns to it; a secret the person types is held here only until it is sent.
 */
export function HappyAgentProviderAddDialog(props: HappyAgentProviderAddDialogProps) {
    const [familyId, setFamilyId] = useState<ProviderFamily["id"] | undefined>(undefined);
    const [secret, setSecret] = useState("");
    const [aws, setAws] = useState<AwsDraft | undefined>(undefined);
    const [region, setRegion] = useState("");
    const keySubmit = (): void => {
        const routed = region.trim();
        props.onApiKeySubmit(secret, routed === "" ? undefined : routed);
    };
    const awsSubmit = (): void => {
        if (!aws) return;
        props.onAwsKeysSubmit({
            accessKeyId: aws.accessKeyId,
            secretAccessKey: aws.secretAccessKey,
            ...(aws.region.trim() ? { region: aws.region } : {}),
        });
    };
    const busy = props.phase === "busy";
    const open = (url: string): void => {
        if (props.onExternalOpen) props.onExternalOpen(url);
        else window.open(url, "_blank", "noopener,noreferrer");
    };
    const flowSelect = (flow: HappyAgentProviderAddFlow): void => {
        setSecret("");
        setAws(undefined);
        setRegion("");
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
    const details = flow.kind !== "choose" && props.step === "details";
    const families = familiesOf(props, flowSelect);
    const family =
        flow.kind === "choose"
            ? families.find((each) => each.id === familyId && each.methods.length > 1)
            : undefined;
    const primary = ((): { label: string; onClick: () => void; disabled?: boolean } | undefined => {
        if (done) return { label: "Done", onClick: props.onClose };
        if (details)
            return {
                label: "Continue",
                onClick: props.onDetailsSubmit,
                disabled: props.destination.kind === "new" && props.destination.name.trim() === "",
            };
        if (flow.kind === "apiKey" && aws)
            return {
                label: "Add",
                onClick: awsSubmit,
                disabled: aws.accessKeyId.trim() === "" || aws.secretAccessKey.trim() === "",
            };
        if (flow.kind === "apiKey")
            return {
                label: "Add",
                onClick: keySubmit,
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
                backLabel="Back to providers"
                busy={busy}
                footer={
                    primary ? (
                        <Button
                            disabled={primary.disabled === true && !busy}
                            loading={busy}
                            onClick={primary.onClick}
                        >
                            {primary.label}
                        </Button>
                    ) : undefined
                }
                frame="anchored"
                icon="spark"
                {...((flow.kind === "choose" && !family) || done
                    ? {}
                    : { onBack: family ? () => setFamilyId(undefined) : back })}
                onClose={close}
                size="medium"
                title={family ? family.name : titleOf(flow)}
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
                            {details ? (
                                <HappyAgentProviderAddDetails {...props} />
                            ) : flow.kind === "choose" && family ? (
                                <Box
                                    className="happy-agent-provider-add__choices"
                                    data-happy-desktop-ui="happy-agent-provider-add-methods"
                                >
                                    {family.methods.map((method) => (
                                        <button
                                            className="happy-agent-provider-add__choice"
                                            data-choice={method.id}
                                            key={method.id}
                                            onClick={method.pick}
                                            type="button"
                                        >
                                            <span className="happy-agent-provider-add__choice-text">
                                                <span className="happy-agent-provider-add__choice-name">
                                                    {method.title}
                                                </span>
                                                <span className="happy-agent-provider-add__choice-detail">
                                                    {method.detail}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </Box>
                            ) : flow.kind === "choose" ? (
                                <Box
                                    className="happy-agent-provider-add__choices"
                                    data-happy-desktop-ui="happy-agent-provider-add-families"
                                >
                                    {families.map((each) => (
                                        <button
                                            className="happy-agent-provider-add__choice"
                                            data-choice={each.id}
                                            key={each.id}
                                            onClick={
                                                each.methods.length > 1
                                                    ? () => setFamilyId(each.id)
                                                    : each.methods[0]!.pick
                                            }
                                            type="button"
                                        >
                                            <IconTile {...each.tile} />
                                            <span className="happy-agent-provider-add__choice-text">
                                                <span className="happy-agent-provider-add__choice-name">
                                                    {each.name}
                                                </span>
                                                <span className="happy-agent-provider-add__choice-detail">
                                                    {waysOf(each)}
                                                </span>
                                            </span>
                                            {each.methods.length > 1 ? (
                                                <Icon name="chevron-right" size={14} />
                                            ) : null}
                                        </button>
                                    ))}
                                </Box>
                            ) : flow.kind === "apiKey" ? (
                                <>
                                    {flow.vendor === "bedrock" ? (
                                        <SegmentedControl
                                            aria-label="Kind of key"
                                            disabled={busy}
                                            onChange={(kind) => {
                                                setSecret("");
                                                setAws(kind === "aws" ? AWS_EMPTY : undefined);
                                            }}
                                            segments={[
                                                { value: "apiKey", label: "API key" },
                                                { value: "aws", label: "Access keys" },
                                            ]}
                                            size="small"
                                            value={aws ? "aws" : "apiKey"}
                                        />
                                    ) : null}
                                    {flow.vendor === "bedrock" && aws ? (
                                        <>
                                            <TextField
                                                autoComplete="off"
                                                autoFocus
                                                disabled={busy}
                                                label="Access key ID"
                                                onSubmit={awsSubmit}
                                                onValueChange={(accessKeyId) =>
                                                    setAws({ ...aws, accessKeyId })
                                                }
                                                placeholder="AKIA…"
                                                value={aws.accessKeyId}
                                            />
                                            <TextField
                                                autoComplete="off"
                                                disabled={busy}
                                                label="Secret access key"
                                                onSubmit={awsSubmit}
                                                onValueChange={(secretAccessKey) =>
                                                    setAws({ ...aws, secretAccessKey })
                                                }
                                                type="password"
                                                value={aws.secretAccessKey}
                                            />
                                            <TextField
                                                autoComplete="off"
                                                disabled={busy}
                                                label="Region"
                                                onSubmit={awsSubmit}
                                                onValueChange={(region) =>
                                                    setAws({ ...aws, region })
                                                }
                                                placeholder="us-east-1"
                                                value={aws.region}
                                            />
                                        </>
                                    ) : (
                                        <TextField
                                            autoComplete="off"
                                            autoFocus
                                            disabled={busy}
                                            label={`${VENDOR_NAMES[flow.vendor]} API key`}
                                            onSubmit={keySubmit}
                                            onValueChange={setSecret}
                                            placeholder={KEY_PLACEHOLDERS[flow.vendor]}
                                            type="password"
                                            value={secret}
                                        />
                                    )}
                                    {flow.vendor === "bedrock" &&
                                    !aws &&
                                    props.teamRoutingEditable ? (
                                        <>
                                            <TextField
                                                autoComplete="off"
                                                disabled={busy}
                                                label="Region"
                                                onSubmit={keySubmit}
                                                onValueChange={setRegion}
                                                placeholder="us-east-1"
                                                value={region}
                                            />
                                            <span className="happy-agent-provider-add__hint">
                                                Every team Bedrock key routes to this region. Leave
                                                it empty to keep the current one.
                                            </span>
                                        </>
                                    ) : null}
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
                                                    trailingIcon="open-external"
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
                                    {props.setupTokenAvailable ? (
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
                                    ) : null}
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
                                            trailingIcon="open-external"
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

/**
 * The step between choosing a way and typing the key: whose it is, what it
 * is called, and which provider keeps it — one already there, or a new one.
 */
function HappyAgentProviderAddDetails(props: HappyAgentProviderAddDialogProps) {
    const idle = props.phase === "idle";
    const destination = props.destination;
    return (
        <>
            {props.scopeChoice ? (
                <Box className="happy-agent-provider-add__field">
                    <span className="happy-agent-provider-add__label">For</span>
                    <SegmentedControl
                        aria-label="For"
                        onChange={(to) => props.onScopeChange(to === "team" ? "team" : "private")}
                        segments={[
                            { value: "team", label: "Team" },
                            { value: "private", label: "Personal" },
                        ]}
                        size="small"
                        value={props.to}
                    />
                </Box>
            ) : null}
            {props.teamOnly ? (
                <span className="happy-agent-provider-add__hint">
                    Amazon Bedrock keys run only in the team&rsquo;s Bedrock provider, so this one
                    is kept for the team.
                </span>
            ) : null}
            <TextField
                autoComplete="off"
                autoFocus
                disabled={!idle}
                fullWidth
                label="Name"
                onSubmit={props.onDetailsSubmit}
                onValueChange={props.onLabelChange}
                {...(props.labelPlaceholder === undefined
                    ? { hint: "Leave empty to name it after the account you sign in with." }
                    : { placeholder: props.labelPlaceholder })}
                value={props.label}
            />
            <Box className="happy-agent-provider-add__destinations">
                <span className="happy-agent-provider-add__label">Add to</span>
                <Box
                    aria-label="Add to"
                    className="happy-agent-provider-add__options"
                    data-happy-desktop-ui="happy-agent-provider-add-destinations"
                    role="radiogroup"
                >
                    {props.destinations.map((option) => (
                        <button
                            aria-checked={
                                destination.kind === "existing" && destination.id === option.id
                            }
                            className="happy-agent-provider-add__option"
                            disabled={!idle}
                            key={option.id}
                            onClick={() => props.onDestinationSelect(option.id)}
                            role="radio"
                            type="button"
                        >
                            <span aria-hidden="true" className="happy-agent-provider-add__radio" />
                            <span className="happy-agent-provider-add__option-name">
                                {option.name}
                            </span>
                        </button>
                    ))}
                    {props.newAllowed ? (
                        <button
                            aria-checked={destination.kind === "new"}
                            className="happy-agent-provider-add__option"
                            disabled={!idle}
                            onClick={props.onDestinationNewSelect}
                            role="radio"
                            type="button"
                        >
                            <span aria-hidden="true" className="happy-agent-provider-add__radio" />
                            <span className="happy-agent-provider-add__option-name">
                                New provider
                            </span>
                        </button>
                    ) : null}
                </Box>
                {destination.kind === "new" ? (
                    <TextField
                        autoComplete="off"
                        autoFocus
                        disabled={!idle}
                        fullWidth
                        label="Provider name"
                        onSubmit={props.onDetailsSubmit}
                        onValueChange={props.onDestinationNameChange}
                        placeholder="Such as Research"
                        value={destination.name}
                    />
                ) : null}
            </Box>
        </>
    );
}
