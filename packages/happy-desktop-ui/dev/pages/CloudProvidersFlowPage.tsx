import { useState, type ReactNode } from "react";
import {
    HappyAgentAiProviders,
    HappyAgentSettingsShell,
    type HappyAgentAiProviderCredentialRow,
    type HappyAgentAiProviderRow,
    type HappyAgentAiProviderSheetView,
    type HappyAgentAiProvidersScope,
    type HappyAgentProviderAddDestination,
    type HappyAgentProviderAddDialogProps,
    type HappyAgentProviderAddFlow,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

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
                replaceable: true,
            },
            {
                id: "c2",
                label: "Backup key",
                meta: "Anthropic · API key",
                enabled: true,
                state: "cooling",
                coolingUntil: "3:40 PM",
                replaceable: true,
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
                replaceable: false,
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
                replaceable: true,
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
                replaceable: true,
            },
            {
                id: "c6",
                label: "Grok API key",
                meta: "Grok · API key",
                enabled: false,
                state: "disabled",
                replaceable: true,
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

/** The add dialog a specimen opens on. */
type AiProvidersAdd = Pick<
    HappyAgentProviderAddDialogProps,
    "flow" | "phase" | "signIn" | "done" | "error"
> & {
    readonly step?: "details" | "credential";
    readonly destination?: HappyAgentProviderAddDestination;
    readonly label?: string;
};

/** AI providers wired to local state, so the list, sheet and dialog answer. */
function AiProvidersSpecimen(props: {
    readonly scope?: HappyAgentAiProvidersScope;
    readonly empty?: boolean;
    readonly add?: AiProvidersAdd;
    readonly detail?: { readonly id: string; readonly view: HappyAgentAiProviderSheetView };
}) {
    const [scope, scopeSet] = useState<HappyAgentAiProvidersScope>(props.scope ?? "team");
    const [add, addSet] = useState(props.add);
    const [to, toSet] = useState<"private" | "team">("team");
    const [detail, detailSet] = useState(props.detail);
    const fixtures = props.empty ? [] : aiProviderFixtures;
    const teamOnly = add?.flow.kind === "apiKey" && add.flow.vendor === "bedrock";
    const scopeOfAdd = teamOnly ? "team" : to;
    const destinations =
        add && add.flow.kind !== "choose"
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
                                  ...add,
                                  step: add.step ?? "details",
                                  to: scopeOfAdd,
                                  scopeChoice: !teamOnly,
                                  label: add.label ?? "",
                                  ...(add.flow.kind === "apiKey"
                                      ? { labelPlaceholder: "Anthropic API key" }
                                      : {}),
                                  destinations,
                                  destination,
                                  newAllowed: !teamOnly,
                                  keyVendors: ["openai", "anthropic", "grok", "bedrock"],
                                  teamOnly,
                                  teamRoutingEditable: true,
                                  chatgptAvailable: true,
                                  claudeAvailable: false,
                                  setupTokenAvailable: true,
                                  onFlowSelect: (flow) =>
                                      addSet({ flow, step: "details", phase: "idle" }),
                                  onBack: () =>
                                      addSet(
                                          add.step === "credential"
                                              ? { ...add, step: "details" }
                                              : { flow: { kind: "choose" }, phase: "idle" },
                                      ),
                                  onClose: () => addSet(undefined),
                                  onScopeChange: toSet,
                                  onLabelChange: (label) => addSet({ ...add, label }),
                                  onDestinationSelect: (id) =>
                                      addSet({ ...add, destination: { kind: "existing", id } }),
                                  onDestinationNewSelect: () =>
                                      addSet({ ...add, destination: { kind: "new", name: "" } }),
                                  onDestinationNameChange: (name) =>
                                      addSet({ ...add, destination: { kind: "new", name } }),
                                  onDetailsSubmit: () => addSet({ ...add, step: "credential" }),
                                  onApiKeySubmit: noop,
                                  onAwsKeysSubmit: noop,
                                  onSetupTokenSubmit: noop,
                                  onSignInStart: noop,
                                  onSignInCodeSubmit: noop,
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
                                  view: detail.view,
                                  credentials: open.credentials,
                                  editable: true,
                                  onClose: () => detailSet(undefined),
                                  onBack: () =>
                                      detailSet({ id: detail.id, view: { kind: "credentials" } }),
                                  onCredentialOpen: (credentialId) =>
                                      detailSet({
                                          id: detail.id,
                                          view: { kind: "credential", credentialId },
                                      }),
                                  onCredentialSave: () =>
                                      detailSet({ id: detail.id, view: { kind: "credentials" } }),
                                  onCredentialEnabledChange: noop,
                                  onCredentialRemove: () =>
                                      detailSet({ id: detail.id, view: { kind: "credentials" } }),
                                  onAdd: () => {
                                      detailSet(undefined);
                                      addSet({ flow: { kind: "choose" }, phase: "idle" });
                                  },
                                  ...(open.named
                                      ? {
                                            onRename: () =>
                                                detailSet({
                                                    id: detail.id,
                                                    view: { kind: "rename" },
                                                }),
                                        }
                                      : {}),
                                  onNameSave: () =>
                                      detailSet({ id: detail.id, view: { kind: "credentials" } }),
                              },
                          }
                        : {})}
                    onScopeChange={scopeSet}
                    onProviderOpen={(id) => detailSet({ id, view: { kind: "credentials" } })}
                    onAdd={() => addSet({ flow: { kind: "choose" }, phase: "idle" })}
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
 * team's providers, their own, nothing added yet, one provider opened and one
 * token edited, then adding one step at a time.
 */
export function CloudProvidersFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Happy Cloud's AI providers: a short list of what the team or the reader added, each opened on its own sheet to edit its tokens one by one, and adding one step at a time."
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
                detail="One provider opened: its tokens, each opened on its own to edit"
                label="Provider"
                step="04-detail"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{ id: "anthropic", view: { kind: "credentials" } }}
                    />
                )}
            </Screens>
            <Screens
                detail="One token on its own: its name, a key to replace it, its switch, and removing it"
                label="Edit a token"
                step="05-edit-token"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{
                            id: "anthropic",
                            view: { kind: "credential", credentialId: "c2" },
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="A named provider someone created, with Rename"
                label="Named provider"
                step="06-named"
            >
                {() => (
                    <AiProvidersSpecimen
                        detail={{ id: "p-research", view: { kind: "credentials" } }}
                    />
                )}
            </Screens>
            <Screens detail="Its name, on its own" label="Rename a provider" step="07-rename">
                {() => (
                    <AiProvidersSpecimen detail={{ id: "p-research", view: { kind: "rename" } }} />
                )}
            </Screens>
            <Screens
                detail="Adding, step one: ChatGPT, Claude, Grok, Bedrock and Custom with their ways"
                label="Add: what"
                step="08-add-choose"
            >
                {() => <AiProvidersSpecimen add={{ flow: { kind: "choose" }, phase: "idle" }} />}
            </Screens>
            <Screens
                detail="Step two: whose it is, its name, and where it goes — a provider already there or a new one"
                label="Add: name and where"
                step="09-add-details"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "apiKey", vendor: "anthropic" },
                            step: "details",
                            phase: "idle",
                            label: "Prod key",
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="Step two, keeping it in a new provider"
                label="Add: to a new provider"
                step="10-add-new-provider"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "apiKey", vendor: "anthropic" },
                            step: "details",
                            phase: "idle",
                            destination: { kind: "new", name: "Evals" },
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="Step three: the Anthropic API key, which the vendor refused"
                label="Add: the key"
                step="11-add-key"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "apiKey", vendor: "anthropic" },
                            step: "credential",
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
                detail="An Amazon Bedrock key, with the region every team Bedrock key routes to"
                label="Add: Bedrock"
                step="12-add-bedrock"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "apiKey", vendor: "bedrock" },
                            step: "credential",
                            phase: "idle",
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="ChatGPT's device sign-in, waiting for the code to be entered at OpenAI"
                label="Add: ChatGPT sign-in"
                step="13-add-chatgpt"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "chatgpt" },
                            step: "credential",
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
                detail="A Claude setup token"
                label="Add: Claude setup token"
                step="14-add-token"
            >
                {() => (
                    <AiProvidersSpecimen
                        add={{
                            flow: { kind: "claude", setupToken: true },
                            step: "credential",
                            phase: "idle",
                        }}
                    />
                )}
            </Screens>
            <Screens
                detail="Added: the dialog says what was connected"
                label="Added"
                step="15-add-done"
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
