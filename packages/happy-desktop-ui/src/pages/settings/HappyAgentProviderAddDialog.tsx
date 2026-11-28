import { useState, type ReactNode } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { Icon } from "../../Icon";
import { IconTile, type IconTileProps } from "../../IconTile";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { SegmentedControl } from "../../SegmentedControl";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";

/** The vendors an API key is added for by hand; Bedrock also takes AWS access keys. */
export type HappyAgentProviderKeyVendor = "openai" | "anthropic" | "grok" | "bedrock";

/** One way of adding a token: a vendor's API key, a ChatGPT or Claude sign-in, or a setup token. */
export type HappyAgentProviderAddFlow =
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

/** The token form itself, as the add dialog and a provider's sheet both show it. */
export interface HappyAgentProviderAddFormProps {
    /** The ways offered, in order; a provider's sheet offers only those it takes. */
    readonly flows: readonly HappyAgentProviderAddFlow[];
    readonly flow: HappyAgentProviderAddFlow;
    /** The name typed for the token. */
    readonly label: string;
    /** The name it gets when none is typed; a sign-in is named after its account. */
    readonly labelPlaceholder?: string;
    /**
     * - `idle`: waiting on the person.
     * - `busy`: a request is out.
     * - `waiting`: a sign-in waits on the vendor's page.
     * - `done`: added; the dialog's `done` says what.
     */
    readonly phase: "idle" | "busy" | "waiting" | "done";
    readonly signIn?: {
        readonly url: string;
        readonly userCode?: string;
        readonly acceptsCode: boolean;
    };
    readonly error?: { readonly title: string; readonly message: string };
    /** Whether the reader may set team routing, such as Bedrock's region. */
    readonly teamRoutingEditable: boolean;
    onFlowSelect: (flow: HappyAgentProviderAddFlow) => void;
    onLabelChange: (label: string) => void;
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
}

export interface HappyAgentProviderAddDialogProps extends HappyAgentProviderAddFormProps {
    /** Whose it is: the team's, or the reader's own. */
    readonly to: "private" | "team";
    /** Whether the reader may choose: both Team and Personal are allowed. */
    readonly scopeChoice: boolean;
    /** The providers of `to` that can take it, the default first. */
    readonly destinations: readonly HappyAgentProviderAddDestinationOption[];
    readonly destination: HappyAgentProviderAddDestination;
    /** Whether it may go in a new provider; Bedrock's keys may not. */
    readonly newAllowed: boolean;
    /** Whether the chosen key can only be kept for the team, as Bedrock's is. */
    readonly teamOnly: boolean;
    /** What was added, once `phase` is `done`. */
    readonly done?: string;
    onClose: () => void;
    onScopeChange: (to: "private" | "team") => void;
    onDestinationSelect: (id: string) => void;
    onDestinationNewSelect: () => void;
    onDestinationNameChange: (name: string) => void;
    /** Starts a custom provider for the team; the Custom vendor is offered only with it. */
    onCustomProviderCreate?: () => void;
}

/**
 * The form inside a provider's sheet: a token added to that provider, or a
 * sign-in run again for one of its tokens (`reauth`), which asks for nothing
 * but the sign-in.
 */
export interface HappyAgentProviderAddPanelProps extends HappyAgentProviderAddFormProps {
    readonly reauth?: boolean;
    onCancel: () => void;
}

type FamilyId = "chatgpt" | "claude" | "grok" | "bedrock";

const FAMILIES: readonly {
    readonly id: FamilyId;
    readonly name: string;
    readonly tile: IconTileProps;
}[] = [
    { id: "chatgpt", name: "ChatGPT", tile: { mark: "openai", tone: "green", size: "small" } },
    { id: "claude", name: "Claude", tile: { mark: "claude", tone: "orange", size: "small" } },
    { id: "grok", name: "Grok", tile: { mark: "grok", tone: "gray", size: "small" } },
    {
        id: "bedrock",
        name: "Amazon Bedrock",
        tile: { ionicon: "cloud-outline", tone: "orange", size: "small" },
    },
];

const VENDOR_NAMES: Record<HappyAgentProviderKeyVendor, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    grok: "xAI",
    bedrock: "Amazon Bedrock",
};

const KEY_PLACEHOLDERS: Record<HappyAgentProviderKeyVendor, string> = {
    openai: "sk-…",
    anthropic: "sk-ant-…",
    grok: "xai-…",
    bedrock: "ABSK…",
};

function familyOf(flow: HappyAgentProviderAddFlow): FamilyId {
    if (flow.kind === "chatgpt") return "chatgpt";
    if (flow.kind === "claude") return "claude";
    if (flow.vendor === "openai") return "chatgpt";
    if (flow.vendor === "anthropic") return "claude";
    return flow.vendor;
}

/** A way's segment in "Connect with"; Bedrock's access keys are a segment of their own. */
type Method = "sign-in" | "setup-token" | "api-key" | "aws";

function methodOf(flow: HappyAgentProviderAddFlow): Method {
    if (flow.kind === "apiKey") return "api-key";
    return flow.kind === "claude" && flow.setupToken ? "setup-token" : "sign-in";
}

const METHOD_LABELS: Record<Method, string> = {
    "sign-in": "Sign in",
    "setup-token": "Setup token",
    "api-key": "API key",
    aws: "Access keys",
};

function flowKey(flow: HappyAgentProviderAddFlow): string {
    if (flow.kind === "apiKey") return `apiKey:${flow.vendor}`;
    return flow.kind === "claude" ? `claude:${String(flow.setupToken)}` : flow.kind;
}

/** What is typed for one way, held only while that way is shown. */
interface Draft {
    readonly flow: string;
    readonly aws: boolean;
    readonly secret: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly region: string;
    readonly code: string;
}

interface Primary {
    readonly label: string;
    readonly onClick: () => void;
    readonly disabled: boolean;
    readonly loading: boolean;
}

/**
 * The form's parts, for the dialog and the sheet to lay out: which vendor and
 * way, the token's name, and the key or the sign-in, with the one button that
 * sends it. A secret is held here only until it is sent.
 */
function useProviderAddForm(
    props: HappyAgentProviderAddFormProps & { readonly reauth?: boolean },
): {
    readonly chooser: ReactNode;
    readonly name: ReactNode;
    readonly credential: ReactNode;
    readonly primary?: Primary;
} {
    const key = flowKey(props.flow);
    const [held, setHeld] = useState<Draft | undefined>(undefined);
    const draft: Draft =
        held?.flow === key
            ? held
            : {
                  flow: key,
                  aws: false,
                  secret: "",
                  accessKeyId: "",
                  secretAccessKey: "",
                  region: "",
                  code: "",
              };
    const update = (change: Partial<Omit<Draft, "flow">>): void => setHeld({ ...draft, ...change });
    const busy = props.phase === "busy";
    const waiting = props.phase === "waiting";
    const idle = props.phase === "idle";
    const flow = props.flow;
    const open = (url: string): void => {
        if (props.onExternalOpen) props.onExternalOpen(url);
        else window.open(url, "_blank", "noopener,noreferrer");
    };
    const keySubmit = (): void => {
        const region = draft.region.trim();
        props.onApiKeySubmit(draft.secret, region === "" ? undefined : region);
    };
    const awsSubmit = (): void =>
        props.onAwsKeysSubmit({
            accessKeyId: draft.accessKeyId,
            secretAccessKey: draft.secretAccessKey,
            ...(draft.region.trim() ? { region: draft.region } : {}),
        });

    const family = familyOf(flow);
    const families = FAMILIES.filter((each) =>
        props.flows.some((offered) => familyOf(offered) === each.id),
    );
    const ways = props.flows.filter((offered) => familyOf(offered) === family);
    const methods: Method[] = ways.map(methodOf);
    if (flow.kind === "apiKey" && flow.vendor === "bedrock") methods.push("aws");
    const method: Method = draft.aws ? "aws" : methodOf(flow);
    const chooser = props.reauth ? null : (
        <>
            <Box className="happy-agent-provider-add__field">
                <span className="happy-agent-provider-add__label">Vendor</span>
                <Box
                    aria-label="Vendor"
                    className="happy-agent-provider-add__vendors"
                    data-happy-desktop-ui="happy-agent-provider-add-vendors"
                    role="radiogroup"
                >
                    {families.map((each) => (
                        <button
                            aria-checked={each.id === family}
                            className="happy-agent-provider-add__vendor"
                            data-vendor={each.id}
                            disabled={!idle && !waiting}
                            key={each.id}
                            onClick={() => {
                                if (each.id === family) return;
                                const first = props.flows.find(
                                    (offered) => familyOf(offered) === each.id,
                                );
                                if (first) props.onFlowSelect(first);
                            }}
                            role="radio"
                            type="button"
                        >
                            <IconTile {...each.tile} />
                            <span className="happy-agent-provider-add__vendor-name">
                                {each.name}
                            </span>
                        </button>
                    ))}
                </Box>
            </Box>
            {methods.length > 1 ? (
                <Box className="happy-agent-provider-add__field">
                    <span className="happy-agent-provider-add__label">Connect with</span>
                    <SegmentedControl
                        aria-label="Connect with"
                        disabled={busy}
                        onChange={(value) => {
                            if (value === "aws") {
                                update({ aws: true, secret: "" });
                                return;
                            }
                            if (draft.aws) update({ aws: false });
                            const picked = ways.find((offered) => methodOf(offered) === value);
                            if (picked && flowKey(picked) !== key) props.onFlowSelect(picked);
                        }}
                        segments={methods.map((value) => ({
                            value,
                            label: METHOD_LABELS[value],
                        }))}
                        size="small"
                        value={method}
                    />
                </Box>
            ) : null}
        </>
    );

    const signIn = flow.kind === "chatgpt" || (flow.kind === "claude" && !flow.setupToken);
    const name =
        props.reauth === true ? null : (
            <TextField
                autoComplete="off"
                disabled={!idle}
                fullWidth
                label="Token name"
                onValueChange={props.onLabelChange}
                {...(props.labelPlaceholder === undefined
                    ? { hint: "Leave empty to name it after the account you sign in with." }
                    : { placeholder: props.labelPlaceholder })}
                value={props.label}
            />
        );

    const credential = ((): ReactNode => {
        if (flow.kind === "apiKey" && draft.aws)
            return (
                <>
                    <TextField
                        autoComplete="off"
                        disabled={busy}
                        fullWidth
                        label="Access key ID"
                        onSubmit={awsSubmit}
                        onValueChange={(accessKeyId) => update({ accessKeyId })}
                        placeholder="AKIA…"
                        value={draft.accessKeyId}
                    />
                    <TextField
                        autoComplete="off"
                        disabled={busy}
                        fullWidth
                        label="Secret access key"
                        onSubmit={awsSubmit}
                        onValueChange={(secretAccessKey) => update({ secretAccessKey })}
                        type="password"
                        value={draft.secretAccessKey}
                    />
                    <TextField
                        autoComplete="off"
                        disabled={busy}
                        fullWidth
                        label="Region"
                        onSubmit={awsSubmit}
                        onValueChange={(region) => update({ region })}
                        placeholder="us-east-1"
                        value={draft.region}
                    />
                </>
            );
        if (flow.kind === "apiKey")
            return (
                <>
                    <TextField
                        autoComplete="off"
                        disabled={busy}
                        fullWidth
                        label={`${VENDOR_NAMES[flow.vendor]} API key`}
                        onSubmit={keySubmit}
                        onValueChange={(secret) => update({ secret })}
                        placeholder={KEY_PLACEHOLDERS[flow.vendor]}
                        type="password"
                        value={draft.secret}
                    />
                    {flow.vendor === "bedrock" && props.teamRoutingEditable ? (
                        <TextField
                            autoComplete="off"
                            disabled={busy}
                            fullWidth
                            hint="Every team Bedrock key routes to this region. Leave it empty to keep the current one."
                            label="Region"
                            onSubmit={keySubmit}
                            onValueChange={(region) => update({ region })}
                            placeholder="us-east-1"
                            value={draft.region}
                        />
                    ) : null}
                </>
            );
        if (flow.kind === "claude" && flow.setupToken)
            return (
                <TextField
                    autoComplete="off"
                    disabled={busy}
                    fullWidth
                    hint="Run claude setup-token on your computer and paste what it prints."
                    label="Setup token"
                    onSubmit={() => props.onSetupTokenSubmit(draft.secret)}
                    onValueChange={(secret) => update({ secret })}
                    placeholder="sk-ant-oat01-…"
                    type="password"
                    value={draft.secret}
                />
            );
        if (flow.kind === "claude")
            return waiting && props.signIn ? (
                <Box
                    className="happy-agent-provider-add__sign-in"
                    data-happy-desktop-ui="happy-agent-provider-add-sign-in"
                >
                    <span className="happy-agent-provider-add__text">
                        Sign in to Claude in the browser, then paste the code it shows.
                    </span>
                    <Box className="happy-agent-provider-add__row">
                        <Button
                            onClick={() => open(props.signIn!.url)}
                            size="small"
                            trailingIcon="open-external"
                            variant="secondary"
                        >
                            Open Claude
                        </Button>
                    </Box>
                    <TextField
                        autoComplete="off"
                        fullWidth
                        label="Code"
                        onSubmit={() => props.onSignInCodeSubmit(draft.code)}
                        onValueChange={(code) => update({ code })}
                        type="password"
                        value={draft.code}
                    />
                </Box>
            ) : (
                <span className="happy-agent-provider-add__text">
                    {props.reauth
                        ? "Sign in to Claude again with the same account. The token keeps its name, its usage and its switch."
                        : "Sign in with your Claude account in the browser, then paste the code it shows here."}
                </span>
            );
        return waiting && props.signIn ? (
            <Box
                className="happy-agent-provider-add__sign-in"
                data-happy-desktop-ui="happy-agent-provider-add-sign-in"
            >
                <span className="happy-agent-provider-add__text">Enter this code at OpenAI</span>
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
                        onClick={() => open(props.signIn!.url)}
                        size="small"
                        trailingIcon="open-external"
                        variant="secondary"
                    >
                        Open OpenAI
                    </Button>
                    <Box className="happy-agent-provider-add__waiting">
                        <Spinner size={14} />
                        <span>Waiting for you to finish…</span>
                    </Box>
                </Box>
            </Box>
        ) : (
            <span className="happy-agent-provider-add__text">
                {props.reauth
                    ? "Sign in to ChatGPT again with the same account. The token keeps its name, its usage and its switch."
                    : "Sign in with your ChatGPT account. Happy shows a code to enter at OpenAI; your password never passes through Happy."}
            </span>
        );
    })();

    const primary = ((): Primary | undefined => {
        if (props.phase === "done") return undefined;
        const base = { disabled: false, loading: busy };
        if (flow.kind === "apiKey" && draft.aws)
            return {
                ...base,
                label: "Add keys",
                onClick: awsSubmit,
                disabled:
                    !busy &&
                    (draft.accessKeyId.trim() === "" || draft.secretAccessKey.trim() === ""),
            };
        if (flow.kind === "apiKey")
            return {
                ...base,
                label: "Add key",
                onClick: keySubmit,
                disabled: !busy && draft.secret.trim() === "",
            };
        if (!signIn)
            return {
                ...base,
                label: "Add token",
                onClick: () => props.onSetupTokenSubmit(draft.secret),
                disabled: !busy && draft.secret.trim() === "",
            };
        if (flow.kind === "claude" && waiting)
            return {
                ...base,
                label: "Connect",
                onClick: () => props.onSignInCodeSubmit(draft.code),
                disabled: draft.code.trim() === "",
            };
        // A ChatGPT sign-in finishes on its own once the code is entered; it says it is waiting.
        if (waiting) return undefined;
        const label = flow.kind === "chatgpt" ? "Sign in with ChatGPT" : "Sign in with Claude";
        return { ...base, label, onClick: props.onSignInStart };
    })();
    return { chooser, name, credential, ...(primary ? { primary } : {}) };
}

function errorBanner(error: HappyAgentProviderAddFormProps["error"]) {
    return error ? (
        <Banner tone="danger" title={error.title}>
            {error.message}
        </Banner>
    ) : null;
}

const NEW_DESTINATION = "new";

/**
 * Adds an AI provider's token on Happy Cloud, all on one page in one fixed
 * card: the vendor and how to connect it, whose it is, which provider keeps
 * it — one already there or a new one by name — what the token is called,
 * and the key, or a button that runs the sign-in. Nothing opens over it and
 * nothing goes back.
 */
export function HappyAgentProviderAddDialog(props: HappyAgentProviderAddDialogProps) {
    const form = useProviderAddForm(props);
    const busy = props.phase === "busy";
    const idle = props.phase === "idle";
    const done = props.phase === "done";
    const close = (): void => {
        if (!busy) props.onClose();
    };
    const destination = props.destination;
    const primary = form.primary;
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                busy={busy}
                footer={
                    done ? (
                        <Button onClick={props.onClose}>Done</Button>
                    ) : primary ? (
                        <Button
                            disabled={primary.disabled && !primary.loading}
                            loading={primary.loading}
                            onClick={primary.onClick}
                        >
                            {primary.label}
                        </Button>
                    ) : undefined
                }
                icon="spark"
                onClose={close}
                size="sheet"
                title="Add a provider"
            >
                <Box
                    className="happy-agent-provider-add"
                    data-flow={props.flow.kind}
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
                            {errorBanner(props.error)}
                            {form.chooser}
                            {props.onCustomProviderCreate ? (
                                <span className="happy-agent-provider-add__hint">
                                    Another endpoint?{" "}
                                    <button
                                        className="happy-agent-provider-add__link"
                                        onClick={props.onCustomProviderCreate}
                                        type="button"
                                    >
                                        Add a custom provider
                                    </button>
                                </span>
                            ) : null}
                            <Box className="happy-agent-provider-add__divider" />
                            {props.scopeChoice ? (
                                <Box className="happy-agent-provider-add__field">
                                    <span className="happy-agent-provider-add__label">For</span>
                                    <SegmentedControl
                                        aria-label="For"
                                        disabled={!idle}
                                        onChange={(to) =>
                                            props.onScopeChange(to === "team" ? "team" : "private")
                                        }
                                        segments={[
                                            { value: "team", label: "Team" },
                                            { value: "private", label: "Personal" },
                                        ]}
                                        size="small"
                                        value={props.to}
                                    />
                                </Box>
                            ) : null}
                            <Select
                                disabled={!idle}
                                fullWidth
                                label="Add to"
                                onValueChange={(value) => {
                                    if (value === NEW_DESTINATION) props.onDestinationNewSelect();
                                    else props.onDestinationSelect(value.slice(1));
                                }}
                                options={[
                                    ...props.destinations.map((option) => ({
                                        // Prefixed so no provider's ID can be taken for "new".
                                        value: `:${option.id}`,
                                        label: option.name,
                                    })),
                                    ...(props.newAllowed
                                        ? [{ value: NEW_DESTINATION, label: "New provider…" }]
                                        : []),
                                ]}
                                {...(props.teamOnly
                                    ? {
                                          hint: "Amazon Bedrock keys run only in the team’s Bedrock provider.",
                                      }
                                    : {})}
                                value={
                                    destination.kind === "new"
                                        ? NEW_DESTINATION
                                        : `:${destination.id}`
                                }
                            />
                            {destination.kind === "new" ? (
                                <TextField
                                    autoComplete="off"
                                    autoFocus
                                    disabled={!idle}
                                    fullWidth
                                    label="Provider name"
                                    onValueChange={props.onDestinationNameChange}
                                    placeholder="Such as Research"
                                    value={destination.name}
                                />
                            ) : null}
                            {form.name}
                            <Box className="happy-agent-provider-add__divider" />
                            {form.credential}
                        </>
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

/**
 * The same form inside a provider's sheet, under its tokens: it adds to that
 * provider, so it asks only for the way, the name and the key. With `reauth`
 * it runs one token's sign-in again and asks for nothing else.
 */
export function HappyAgentProviderAddPanel(props: HappyAgentProviderAddPanelProps) {
    const form = useProviderAddForm(props);
    const busy = props.phase === "busy";
    const primary = form.primary;
    return (
        <Box
            className="happy-agent-provider-add happy-agent-provider-add--panel"
            data-flow={props.flow.kind}
            data-happy-desktop-ui={
                props.reauth ? "happy-agent-provider-reauth" : "happy-agent-provider-add-panel"
            }
        >
            {errorBanner(props.error)}
            {form.chooser}
            {form.name}
            {form.credential}
            <Box className="happy-agent-provider-add__buttons">
                <Button disabled={busy} onClick={props.onCancel} size="small" variant="ghost">
                    Cancel
                </Button>
                {primary ? (
                    <Button
                        disabled={primary.disabled && !primary.loading}
                        loading={primary.loading}
                        onClick={primary.onClick}
                        size="small"
                    >
                        {primary.label}
                    </Button>
                ) : null}
            </Box>
        </Box>
    );
}
