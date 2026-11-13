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

export interface HappyAgentProviderAddDialogProps {
    readonly flow: HappyAgentProviderAddFlow;
    /** Where what is added is kept. */
    readonly to: "private" | "team";
    /** Whether the reader may choose: both "My account" and "Team" are allowed. */
    readonly destinationChoice: boolean;
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
    onDestinationChange: (to: "private" | "team") => void;
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

const KEY_VENDORS: readonly HappyAgentProviderKeyVendor[] = [
    "openai",
    "anthropic",
    "grok",
    "bedrock",
];

const VENDOR_NAMES: Record<HappyAgentProviderKeyVendor, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    grok: "Grok",
    bedrock: "Amazon Bedrock",
};

const VENDOR_SHORT_NAMES: Record<HappyAgentProviderKeyVendor, string> = {
    ...VENDOR_NAMES,
    bedrock: "Bedrock",
};

const KEY_PLACEHOLDERS: Record<HappyAgentProviderKeyVendor, string> = {
    openai: "sk-…",
    anthropic: "sk-ant-…",
    grok: "xai-…",
    bedrock: "ABSK…",
};

function vendorOf(value: string): HappyAgentProviderKeyVendor {
    return KEY_VENDORS.find((vendor) => vendor === value) ?? "openai";
}

/** AWS access keys while they are typed. */
interface AwsDraft {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly region: string;
}

const AWS_EMPTY: AwsDraft = { accessKeyId: "", secretAccessKey: "", region: "" };

/** A row of the chooser: one vendor, with every way this server and role offer to add it. */
interface ProviderFamily {
    readonly id: "chatgpt" | "claude" | "grok" | "custom";
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
 * Grok, Custom, each only with a way to add it.
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
            return "Add API key";
        case "chatgpt":
            return "Sign in with ChatGPT";
        case "claude":
            return flow.setupToken ? "Setup token" : "Sign in with Claude";
    }
}

/**
 * Adds an AI provider on Happy Cloud. It opens on the families; one with two
 * ways or more asks which next, and a way is a ChatGPT or Claude sign-in that
 * the server finishes itself, an API key, a Claude setup token, or a custom
 * provider. Which family is open is held here, so Back from a way returns to
 * it; what the person types is held here only until it is sent.
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
    const families = familiesOf(props, flowSelect);
    const family =
        flow.kind === "choose"
            ? families.find((each) => each.id === familyId && each.methods.length > 1)
            : undefined;
    const primary = ((): { label: string; onClick: () => void; disabled?: boolean } | undefined => {
        if (done) return { label: "Done", onClick: props.onClose };
        if (flow.kind === "apiKey" && aws)
            return {
                label: busy ? "Checking the keys…" : "Add",
                onClick: awsSubmit,
                disabled: aws.accessKeyId.trim() === "" || aws.secretAccessKey.trim() === "",
            };
        if (flow.kind === "apiKey")
            return {
                label: busy ? "Checking the key…" : "Add",
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
                footer={
                    <>
                        {(flow.kind === "choose" && !family) || done ? null : (
                            <Button
                                disabled={busy}
                                onClick={family ? () => setFamilyId(undefined) : back}
                                variant="ghost"
                            >
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
                            {flow.kind === "choose" && family ? (
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
                                    <SegmentedControl
                                        aria-label="Vendor"
                                        disabled={busy}
                                        onChange={(vendor) =>
                                            flowSelect({ kind: "apiKey", vendor: vendorOf(vendor) })
                                        }
                                        segments={props.keyVendors.map((vendor) => ({
                                            value: vendor,
                                            label: VENDOR_SHORT_NAMES[vendor],
                                        }))}
                                        size="small"
                                        value={flow.vendor}
                                    />
                                    {props.teamOnly ? (
                                        <span className="happy-agent-provider-add__hint">
                                            {`${VENDOR_NAMES[flow.vendor]} keys run only in the team's connection, so this one is kept for the team.`}
                                        </span>
                                    ) : null}
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
