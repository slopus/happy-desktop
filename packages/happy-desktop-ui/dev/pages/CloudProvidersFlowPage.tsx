import { useState, type ReactNode } from "react";
import {
    HAPPY_AGENT_PROVIDER_ENDPOINT_VENDORS,
    HappyAgentAiProviders,
    HappyAgentSettingsShell,
    type HappyAgentAiProviderCredentialRow,
    type HappyAgentAiProviderRow,
    type HappyAgentAiProviderSheetAction,
    type HappyAgentAiProvidersScope,
    type HappyAgentProviderAddDestination,
    type HappyAgentProviderAddDialogProps,
    type HappyAgentProviderAddFlow,
    type HappyAgentProviderAddFormProps,
    type HappyAgentProviderAuth,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

const ANTHROPIC = HAPPY_AGENT_PROVIDER_ENDPOINT_VENDORS.anthropic;

/** The component plan this page documents. */
export const componentNumber = "P-050";

/** The window Happy opens at, and its smallest. */
const WINDOWS = [
    { width: 1280, height: 792 },
    { width: 760, height: 670 },
] as const;

const noop = () => undefined;

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { group: "Agents", icon: "doc", id: "instructions", label: "Instructions", tone: "purple" },
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
];

/** A provider of the fixture: its row, whose it is, and its tokens. */
interface AiProviderFixture {
    readonly row: HappyAgentAiProviderRow;
    readonly scope: HappyAgentAiProvidersScope;
    readonly named: boolean;
    readonly credentials: readonly HappyAgentAiProviderCredentialRow[];
}

const aiProviderFixtures: readonly AiProviderFixture[] = [
    {
        row: {
            id: "anthropic",
            name: "Anthropic",
            tile: { mark: "claude", tone: "orange" },
            meta: "2 tokens",
            tone: "ok",
        },
        scope: "team",
        named: false,
        credentials: [
            {
                id: "c1",
                label: "Anthropic API key",
                meta: "Anthropic · API key",
                enabled: true,
                state: "ready",
                replaceWith: "key",
                connection: { vendor: ANTHROPIC, auth: "default", headerNames: [] },
            },
            {
                id: "c2",
                label: "Backup key",
                meta: "Anthropic · API key",
                enabled: true,
                state: "cooling",
                coolingUntil: "3:40 PM",
                replaceWith: "key",
                connection: {
                    vendor: ANTHROPIC,
                    url: "https://llm-gateway.acme.dev/anthropic",
                    auth: "bearer",
                    headerNames: ["x-acme-team"],
                },
            },
        ],
    },
    {
        row: {
            id: "codex",
            name: "ChatGPT",
            tile: { mark: "openai", tone: "green" },
            meta: "1 token",
            tone: "ok",
        },
        scope: "team",
        named: false,
        credentials: [
            {
                id: "c3",
                label: "Team Pro",
                meta: "ChatGPT · Subscription",
                enabled: true,
                state: "ready",
                reauth: true,
            },
        ],
    },
    {
        row: {
            id: "p-research",
            name: "Research",
            tile: { mark: "openai", tone: "green" },
            meta: "1 token · Needs attention",
            tone: "danger",
        },
        scope: "team",
        named: true,
        credentials: [
            {
                id: "c4",
                label: "Research key",
                meta: "OpenAI · API key",
                enabled: true,
                state: "invalid",
                replaceWith: "key",
                connection: {
                    vendor: HAPPY_AGENT_PROVIDER_ENDPOINT_VENDORS.openai,
                    auth: "default",
                    headerNames: [],
                },
            },
        ],
    },
    {
        row: {
            id: "private",
            name: "My account",
            tile: { ionicon: "person-outline", tone: "blue" },
            meta: "2 tokens",
            tone: "ok",
        },
        scope: "private",
        named: false,
        credentials: [
            {
                id: "c5",
                label: "Claude Max",
                meta: "Claude · Setup token",
                enabled: true,
                state: "ready",
                replaceWith: "token",
            },
            {
                id: "c6",
                label: "Grok API key",
                meta: "Grok · API key",
                enabled: false,
                state: "disabled",
                replaceWith: "key",
                connection: {
                    vendor: HAPPY_AGENT_PROVIDER_ENDPOINT_VENDORS.grok,
                    auth: "default",
                    headerNames: [],
                },
            },
        ],
    },
];

/** Where each fixture flow lands for the team when nothing else is picked. */
function teamDefaultOf(flow: HappyAgentProviderAddFlow): { id: string; name: string } {
    if (flow.kind === "apiKey")
        return {
            id: flow.vendor,
            name: {
                openai: "OpenAI",
                anthropic: "Anthropic",
                grok: "Grok",
                bedrock: "Amazon Bedrock",
            }[flow.vendor],
        };
    if (flow.kind === "chatgpt") return { id: "codex", name: "ChatGPT" };
    return { id: "claude-code", name: "Claude" };
}

/** What this fixture server offers: no Claude sign-in, as Happy Cloud today. */
const FLOWS: readonly HappyAgentProviderAddFlow[] = [
    { kind: "chatgpt" },
    { kind: "apiKey", vendor: "openai" },
    { kind: "claude", setupToken: true },
    { kind: "apiKey", vendor: "anthropic" },
    { kind: "apiKey", vendor: "grok" },
    { kind: "apiKey", vendor: "bedrock" },
];

/** The flows a provider's sheet offers: a team vendor's own takes only that vendor's. */
function flowsOf(fixture: AiProviderFixture): readonly HappyAgentProviderAddFlow[] {
    if (fixture.named || fixture.scope === "private")
        return FLOWS.filter((flow) => !(flow.kind === "apiKey" && flow.vendor === "bedrock"));
    return FLOWS.filter((flow) => teamDefaultOf(flow).id === fixture.row.id);
}

function labelPlaceholderOf(flow: HappyAgentProviderAddFlow): string | undefined {
    if (flow.kind === "apiKey") return `${teamDefaultOf(flow).name} API key`;
    if (flow.kind === "claude" && flow.setupToken) return "Claude (setup token)";
    return undefined;
}

/** A token form a specimen opens on. */
type AiProvidersForm = Pick<
    HappyAgentProviderAddFormProps,
    "flow" | "phase" | "signIn" | "error"
> & {
    readonly label?: string;
    readonly endpoint?: string;
    readonly auth?: HappyAgentProviderAuth;
};

/** The add dialog a specimen opens on. */
type AiProvidersAdd = AiProvidersForm &
    Pick<HappyAgentProviderAddDialogProps, "done"> & {
        readonly destination?: HappyAgentProviderAddDestination;
    };

/** The provider sheet a specimen opens on: its open action, or its add form. */
interface AiProvidersDetail {
    readonly id: string;
    readonly action?: HappyAgentAiProviderSheetAction;
    readonly add?: AiProvidersForm & { readonly credentialId?: string };
}

/** The token form's props over a specimen's local state. */
function formProps(
    form: AiProvidersForm,
    flows: readonly HappyAgentProviderAddFlow[],
    set: (form: AiProvidersForm) => void,
): HappyAgentProviderAddFormProps {
    const labelPlaceholder = labelPlaceholderOf(form.flow);
    return {
        ...form,
        flows,
        label: form.label ?? "",
        ...(labelPlaceholder === undefined ? {} : { labelPlaceholder }),
        teamRoutingEditable: true,
        endpoints: true,
        endpoint: form.endpoint ?? "",
        auth: form.auth ?? "default",
        onEndpointChange: (endpoint) => set({ ...form, endpoint }),
        onAuthChange: (auth) => set({ ...form, auth }),
        onFlowSelect: (flow) => set({ flow, phase: "idle" }),
        onLabelChange: (label) => set({ ...form, label }),
        onApiKeySubmit: noop,
        onAwsKeysSubmit: noop,
        onSetupTokenSubmit: noop,
        onSignInStart: () =>
            set({
                ...form,
                phase: "waiting",
                signIn: {
                    url: "https://auth.openai.com/codex/device",
                    userCode: "ABCD-1234",
                    acceptsCode: false,
                },
            }),
        onSignInCodeSubmit: noop,
    };
}

const FIRST_FLOW: HappyAgentProviderAddFlow = { kind: "chatgpt" };

/** AI providers wired to local state, so the list, sheet and dialog answer. */
function AiProvidersSpecimen(props: {
    readonly scope?: HappyAgentAiProvidersScope;
    readonly empty?: boolean;
    readonly add?: AiProvidersAdd;
    readonly detail?: AiProvidersDetail;
}) {
    const [scope, scopeSet] = useState<HappyAgentAiProvidersScope>(props.scope ?? "team");
    const [add, addSet] = useState(props.add);
    const [to, toSet] = useState<"private" | "team">("team");
    const [detail, detailSet] = useState(props.detail);
    const fixtures = props.empty ? [] : aiProviderFixtures;
    const teamOnly = add?.flow.kind === "apiKey" && add.flow.vendor === "bedrock";
    const scopeOfAdd = teamOnly ? "team" : to;
    const destinations = add
        ? [
              scopeOfAdd === "team"
                  ? teamDefaultOf(add.flow)
                  : { id: "private", name: "My account" },
              ...(teamOnly
                  ? []
                  : fixtures
                        .filter((fixture) => fixture.named && fixture.scope === scopeOfAdd)
                        .map((fixture) => ({ id: fixture.row.id, name: fixture.row.name }))),
          ]
        : [];
    const destination: HappyAgentProviderAddDestination = add?.destination ?? {
        kind: "existing",
        id: destinations[0]?.id ?? "private",
    };
    const open = detail ? fixtures.find((fixture) => fixture.row.id === detail.id) : undefined;
    const sheetAdd = detail?.add;
    const actionSet = (action: HappyAgentAiProviderSheetAction | undefined) =>
        detail && detailSet({ id: detail.id, ...(action ? { action } : {}) });
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: "100%",
                transform: "translateZ(0)",
            }}
        >
            <HappyAgentSettingsShell
                activeCategoryId="providers"
                categories={categories}
                description="The models agents run on, and the accounts behind them"
                onCategorySelect={noop}
                onClose={noop}
                title="Inference"
            >
                <HappyAgentAiProviders
                    scope={scope}
                    providers={fixtures
                        .filter((fixture) => fixture.scope === scope)
                        .map((fixture) => fixture.row)}
                    {...(add
                        ? {
                              add: {
                                  ...formProps(add, FLOWS, (form) =>
                                      addSet({
                                          ...form,
                                          ...(add.destination
                                              ? { destination: add.destination }
                                              : {}),
                                      }),
                                  ),
                                  ...(add.done === undefined ? {} : { done: add.done }),
                                  to: scopeOfAdd,
                                  scopeChoice: !teamOnly,
                                  destinations,
                                  destination,
                                  newAllowed: !teamOnly,
                                  teamOnly,
                                  onClose: () => addSet(undefined),
                                  onScopeChange: toSet,
                                  onDestinationSelect: (id) =>
                                      addSet({ ...add, destination: { kind: "existing", id } }),
                                  onDestinationNewSelect: () =>
                                      addSet({ ...add, destination: { kind: "new", name: "" } }),
                                  onDestinationNameChange: (name) =>
                                      addSet({ ...add, destination: { kind: "new", name } }),
                                  onCustomProviderCreate: () => addSet(undefined),
                              },
                          }
                        : {})}
                    {...(detail && open
                        ? {
                              detail: {
                                  name: open.row.name,
                                  tile: open.row.tile,
                                  meta: `${open.scope === "team" ? "Team" : "Personal"} · ${open.row.meta}`,
                                  ...(detail.action ? { action: detail.action } : {}),
                                  ...(sheetAdd
                                      ? {
                                            add: {
                                                ...(sheetAdd.credentialId === undefined
                                                    ? {}
                                                    : { credentialId: sheetAdd.credentialId }),
                                                form: formProps(sheetAdd, flowsOf(open), (form) =>
                                                    detailSet({
                                                        id: detail.id,
                                                        add: { ...sheetAdd, ...form },
                                                    }),
                                                ),
                                                onClose: () => detailSet({ id: detail.id }),
                                            },
                                        }
                                      : {}),
                                  credentials: open.credentials,
                                  editable: true,
                                  onClose: () => detailSet(undefined),
                                  onCredentialEnabledChange: noop,
                                  onCredentialRenameOpen: (credentialId) =>
                                      actionSet({ kind: "label", credentialId }),
                                  onCredentialReplaceOpen: (credentialId) =>
                                      actionSet({ kind: "secret", credentialId }),
                                  onCredentialRemoveOpen: (credentialId) =>
                                      actionSet({ kind: "remove", credentialId }),
                                  onCredentialReauth: (credentialId) =>
                                      detailSet({
                                          id: detail.id,
                                          add: {
                                              flow: { kind: "chatgpt" },
                                              phase: "waiting",
                                              credentialId,
                                              signIn: {
                                                  url: "https://auth.openai.com/codex/device",
                                                  userCode: "ABCD-1234",
                                                  acceptsCode: false,
                                              },
                                          },
                                      }),
                                  onActionCancel: () => actionSet(undefined),
                                  onCredentialLabelSave: () => actionSet(undefined),
                                  onCredentialSecretSave: () => actionSet(undefined),
                                  onCredentialConnectionOpen: (credentialId) =>
                                      actionSet({ kind: "connection", credentialId }),
                                  onCredentialConnectionSave: () => actionSet(undefined),
                                  onCredentialRemove: () => actionSet(undefined),
                                  onAdd: () =>
                                      detailSet({
                                          id: detail.id,
                                          add: { flow: flowsOf(open)[0]!, phase: "idle" },
                                      }),
                                  ...(open.named
                                      ? { onRename: () => actionSet({ kind: "name" }) }
                                      : {}),
                                  onNameSave: () => actionSet(undefined),
                              },
                          }
                        : {})}
                    onScopeChange={scopeSet}
                    onProviderOpen={(id) => detailSet({ id })}
                    onAdd={() => addSet({ flow: FIRST_FLOW, phase: "idle" })}
                />
            </HappyAgentSettingsShell>
        </div>
    );
}

/** One screen of the flow, at each window size. */
function Screens(props: {
    readonly step: string;
    readonly label: string;
    readonly detail: string;
    readonly children: () => ReactNode;
}) {
    return (
        <>
            {WINDOWS.map((window) => (
                <FullScreenSpecimen
                    detail={props.detail}
                    key={window.width}
                    label={props.label}
                    number={`${props.step.slice(0, 2)}·${String(window.width)}`}
                    screen={`${props.step}-${String(window.width)}x${String(window.height)}`}
                    window={window}
                >
                    {props.children()}
                </FullScreenSpecimen>
            ))}
        </>
    );
}

/**
 * Settings › Inference on Happy Cloud, in the order a person meets it: the
 * team's providers, their own, nothing added yet, one provider opened with
 * each of a token's actions, then the add page.
 */
export function CloudProvidersFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Happy Cloud's AI providers: a short list of what the team or the reader added; a provider opens in one fixed card whose tokens carry their actions, each action opens a dialog of its own over it, and adding is one page in a card of the same size."
            title="Cloud AI providers"
            width={WINDOWS[0].width + 96}
        >
            <Screens
                detail="Only what the team added, with each vendor's mark and how many tokens it holds; Team is shown first"
                label="Team providers"
                step="01-list"
            >
                {() => <AiProvidersSpecimen />}
            </Screens>
            <Screens
                detail="The reader's own providers"
                label="Personal providers"
                step="02-personal"
            >
                {() => <AiProvidersSpecimen scope="private" />}
            </Screens>
            <Screens
                detail="Nothing added yet: no catalog of switched-off defaults, only a way to add one"
                label="No providers"
                step="03-empty"
            >
                {() => <AiProvidersSpecimen empty />}
            </Screens>
            <Screens
                detail="One provider opened: its tokens, each with its actions in plain sight and its switch"
                label="Provider"
                step="04-provider"
            >
                {() => <AiProvidersSpecimen detail={{ id: "anthropic" }} />}
            </Screens>
            <Screens
                detail="Rename opens a dialog of its own over the provider"
                label="Rename a token"
                step="05-rename-token"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{ id: "anthropic", action: { kind: "label", credentialId: "c2" } }}
                    />
                )}
            </Screens>
            <Screens
                detail="Replace key: a dialog over the provider with the new key and its button"
                label="Replace a key"
                step="06-replace-key"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{ id: "anthropic", action: { kind: "secret", credentialId: "c1" } }}
                    />
                )}
            </Screens>
            <Screens
                detail="Remove asks once, in a confirmation dialog"
                label="Remove a token"
                step="07-remove-token"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{ id: "anthropic", action: { kind: "remove", credentialId: "c2" } }}
                    />
                )}
            </Screens>
            <Screens
                detail="Sign in again runs a ChatGPT sign-in for that token, in a dialog over the provider"
                label="Sign in again"
                step="08-reauth"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{
                            id: "codex",
                            add: {
                                flow: { kind: "chatgpt" },
                                phase: "waiting",
                                credentialId: "c3",
                                signIn: {
                                    url: "https://auth.openai.com/codex/device",
                                    userCode: "ABCD-1234",
                                    acceptsCode: false,
                                },
                            },
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="Add token opens the form in a dialog over the provider: it goes to this provider, so only the way, the key and its name"
                label="Add a token here"
                step="09-add-token"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{
                            id: "p-research",
                            add: { flow: { kind: "apiKey", vendor: "openai" }, phase: "idle" },
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="A named provider someone created is renamed in a dialog"
                label="Rename a provider"
                step="10-rename-provider"
            >
                {() => (
                    <AiProvidersSpecimen detail={{ id: "p-research", action: { kind: "name" } }} />
                )}
            </Screens>
            <Screens
                detail="Adding is one page: the vendor, how to connect, whose, which provider, the name, then the key or the sign-in"
                label="Add a provider"
                step="11-add"
            >
                {() => <AiProvidersSpecimen add={{ flow: { kind: "chatgpt" }, phase: "idle" }} />}
            </Screens>
            <Screens
                detail="An Anthropic key kept in a new provider by name"
                label="Add: to a new provider"
                step="12-add-new-provider"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "apiKey", vendor: "anthropic" },
                            phase: "idle",
                            label: "Prod key",
                            destination: { kind: "new", name: "Evals" },
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="The vendor refused the key: the page stays as it was, with why"
                label="Add: refused"
                step="13-add-error"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "apiKey", vendor: "anthropic" },
                            phase: "idle",
                            error: {
                                title: "Couldn't add the key",
                                message: "The vendor rejected the credential.",
                            },
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="An Amazon Bedrock key: only the team's Bedrock provider takes it, with the region every team Bedrock key routes to"
                label="Add: Bedrock"
                step="14-add-bedrock"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{ flow: { kind: "apiKey", vendor: "bedrock" }, phase: "idle" }}
                    />
                )}
            </Screens>
            <Screens
                detail="ChatGPT's device sign-in, waiting for the code to be entered at OpenAI"
                label="Add: ChatGPT sign-in"
                step="15-add-chatgpt"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "chatgpt" },
                            phase: "waiting",
                            signIn: {
                                url: "https://auth.openai.com/codex/device",
                                userCode: "ABCD-1234",
                                acceptsCode: false,
                            },
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="Each key has its own connection: one on Anthropic itself, one through a gateway with its own auth and headers, whose values never come back"
                label="A key's connection"
                step="17-connection"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{
                            id: "anthropic",
                            action: { kind: "connection", credentialId: "c2" },
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="API key or custom endpoint: a proxy, how the token signs there, and headers of its own"
                label="Add: through a proxy"
                step="18-add-proxy"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "apiKey", vendor: "anthropic" },
                            phase: "idle",
                            label: "Gateway",
                            endpoint: "https://llm-gateway.acme.dev/anthropic",
                            auth: "bearer",
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="Claude: the subscription through a setup token, or the API and any endpoint that speaks it"
                label="Add: Claude subscription"
                step="19-add-claude"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{ flow: { kind: "claude", setupToken: true }, phase: "idle" }}
                    />
                )}
            </Screens>
            <Screens
                detail="Added: the dialog says what was connected"
                label="Added"
                step="16-add-done"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "chatgpt" },
                            phase: "done",
                            done: "ChatGPT connected",
                        }}
                    />
                )}
            </Screens>
        </ComponentPage>
    );
}
