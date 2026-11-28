import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { UserError } from "../types.js";
import type {
    HappyAgentCloudCapabilities,
    HappyAgentCloudConnection,
    HappyAgentCloudCredential,
    HappyAgentCloudCredentialAuth,
    HappyAgentCloudHeader,
    HappyAgentCloudKeyVendor,
    HappyAgentCloudProvidersApi,
    HappyAgentCloudScope,
    HappyAgentCloudSignIn,
    HappyAgentCloudSignInCli,
    HappyAgentCloudTarget,
} from "./happyAgentCloudProviders.js";
import {
    happyAgentCloudConnectionNamed,
    happyAgentCloudCredentialEndpointVendor,
    happyAgentCloudCredentialReplaceable,
} from "./happyAgentCloudProviders.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** What is being added, and how. */
export type HappyAgentCloudProviderAddFlow =
    | { readonly kind: "apiKey"; readonly vendor: HappyAgentCloudKeyVendor }
    /** ChatGPT's device sign-in. */
    | { readonly kind: "chatgpt" }
    /** Claude's browser sign-in, or pasting a setup token instead. */
    | { readonly kind: "claude"; readonly setupToken: boolean };

/** Whether what a flow adds can only be kept for the team: Bedrock keys run only in its `bedrock` connection. */
export function happyAgentCloudProviderAddTeamOnly(flow: HappyAgentCloudProviderAddFlow): boolean {
    return flow.kind === "apiKey" && flow.vendor === "bedrock";
}

/** Where what the add dialog adds is kept: a listed connection, or a new one by this name. */
export type HappyAgentCloudProviderAddDestination =
    | { readonly kind: "existing"; readonly connectionId: string }
    | { readonly kind: "new"; readonly name: string };

/** One connection the add dialog offers to keep what it adds in. */
export interface HappyAgentCloudProviderAddOption {
    readonly connectionId: string;
    readonly name: string;
}

/** The add dialog, while it is open. */
export interface HappyAgentCloudProviderAdd {
    readonly flow: HappyAgentCloudProviderAddFlow;
    /**
     * Set when it was opened from a provider's sheet, which shows it in a dialog over itself:
     * a token added to that provider, or `credentialId` signed in again.
     * Absent for the add dialog of its own.
     */
    readonly anchor?: { readonly connectionId: string; readonly credentialId?: string };
    /** Whose it is: the team's, or the reader's own. */
    readonly to: HappyAgentCloudScope;
    /** The name typed for what is added; empty keeps the one it is given by default. */
    readonly label: string;
    /**
     * The endpoint typed for an API key, such as a proxy; empty sends it to
     * the vendor's own API.
     */
    readonly endpoint: string;
    /** How the key signs requests to `endpoint`; `none` takes no key. Only with an endpoint. */
    readonly auth: HappyAgentCloudCredentialAuth;
    readonly destination: HappyAgentCloudProviderAddDestination;
    /**
     * - `idle`: waiting on the person.
     * - `busy`: a request is out.
     * - `waiting`: a sign-in waits on the vendor's page; `signIn` says where.
     * - `done`: added; `done` says what.
     */
    readonly phase: "idle" | "busy" | "waiting" | "done";
    readonly signIn?: {
        readonly url: string;
        /** The code to enter on the vendor's device page. */
        readonly userCode?: string;
        /** Whether the vendor's page shows a code to paste back. */
        readonly acceptsCode: boolean;
    };
    /** What was added, such as "ChatGPT connected". */
    readonly done?: string;
    /** Why the last attempt failed, worded for the dialog. */
    readonly error?: { readonly title: string; readonly message: string };
}

/**
 * The one action a provider's sheet has open, in a dialog over it: renaming the
 * provider, or renaming, replacing the key of, or removing one token.
 */
export type HappyAgentCloudProviderDetailAction =
    | { readonly kind: "name" }
    | { readonly kind: "label"; readonly credentialId: string }
    | { readonly kind: "secret"; readonly credentialId: string }
    | { readonly kind: "connection"; readonly credentialId: string }
    | { readonly kind: "remove"; readonly credentialId: string };

/** One provider's sheet, while it is open. */
export interface HappyAgentCloudProviderDetail {
    readonly connectionId: string;
    readonly action?: HappyAgentCloudProviderDetailAction;
    /** `busy` while the open action is out. */
    readonly phase: "idle" | "busy";
    /** Why the open action stopped. */
    readonly error?: { readonly title: string; readonly message: string };
}

export interface HappyAgentCloudProvidersSnapshot {
    /** True until the first answer, so "nothing added" is never claimed early. */
    readonly loading: boolean;
    readonly connections: readonly HappyAgentCloudConnection[];
    /** Whose providers the list shows; the team's until the reader picks their own. */
    readonly listScope: HappyAgentCloudScope;
    /** Whether the reader may add to their own account. */
    readonly privateAllowed: boolean;
    /** Whether the reader may add for the whole team. */
    readonly teamAllowed: boolean;
    /** The subscriptions this server signs in to now. */
    readonly signIns: ReadonlySet<HappyAgentCloudSignInCli>;
    /** Whether this server takes a Claude setup token. */
    readonly setupToken: boolean;
    /**
     * Whether an API key may name its own endpoint, such as a proxy, with how
     * it signs requests there and headers of its own.
     */
    readonly endpoints: boolean;
    /** Credentials whose change the server hasn't answered. */
    readonly credentialsSaving: ReadonlySet<string>;
    readonly add?: HappyAgentCloudProviderAdd;
    readonly detail?: HappyAgentCloudProviderDetail;
    /** Why the list could not be read. */
    readonly error?: UserError;
    /** Why the last change to a credential was refused. */
    readonly saveError?: UserError;
}

/**
 * Settings › AI providers on Happy Cloud: the providers the team and the
 * reader added, each opened on its own to see and edit its credentials one by
 * one, and adding to them by API key, setup token or subscription sign-in.
 * Follows `config.updated` while watched.
 */
export interface HappyAgentCloudProvidersStore {
    get(): HappyAgentCloudProvidersSnapshot;
    subscribe(listener: () => void): () => void;
    listScopeUpdate(scope: HappyAgentCloudScope): void;
    /**
     * Opens the add dialog of its own, on one flow when a link names it, with
     * what it adds kept in `connectionId` where that connection can take it.
     */
    addOpen(options?: {
        readonly flow?: HappyAgentCloudProviderAddFlow;
        readonly to?: HappyAgentCloudScope;
        readonly connectionId?: string;
    }): void;
    /** Opens adding a token to the open provider, in its sheet. */
    credentialAddOpen(): void;
    /** Signs one subscription token of the open provider in again, in its sheet. */
    credentialReauthStart(credentialId: string): void;
    addFlowSelect(flow: HappyAgentCloudProviderAddFlow): void;
    /** Stops adding; a sign-in waiting on the vendor is cancelled. */
    addClose(): void;
    addScopeUpdate(to: HappyAgentCloudScope): void;
    addLabelUpdate(label: string): void;
    /** Types the endpoint an API key being added sends to; empty for the vendor's own. */
    addEndpointUpdate(endpoint: string): void;
    /** Picks how the key being added signs requests to its endpoint. */
    addAuthUpdate(auth: HappyAgentCloudCredentialAuth): void;
    addDestinationSelect(connectionId: string): void;
    /** Keeps what is added in a new provider, named with `addDestinationNameUpdate`. */
    addDestinationNewSelect(): void;
    addDestinationNameUpdate(name: string): void;
    /**
     * Adds the API key of the open key flow. A Bedrock key may name the
     * region the team's Bedrock keys route to, which is saved first.
     */
    apiKeySubmit(
        secret: string,
        options?: {
            /** The region every team Bedrock key routes to. */
            readonly region?: string;
            /** Headers for the key's own endpoint; their values are secrets, held only until sent. */
            readonly headers?: readonly HappyAgentCloudHeader[];
        },
    ): void;
    /** Adds AWS access keys, in the open key flow for Bedrock. */
    awsKeysSubmit(input: {
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
        readonly region?: string;
    }): void;
    /** Adds a Claude setup token. */
    setupTokenSubmit(token: string): void;
    /** Starts the open flow's sign-in. */
    signInStart(): void;
    /** Sends the code Claude's page showed. */
    signInCodeSubmit(code: string): void;
    credentialEnabledUpdate(connectionId: string, credentialId: string, enabled: boolean): void;
    /** Removes a credential; one the sheet asked about closes its question once it is gone. */
    credentialRemove(connectionId: string, credentialId: string): void;
    /** Opens one provider's sheet. */
    detailOpen(connectionId: string): void;
    /** Closes the sheet, and whatever it was adding or signing in. */
    detailClose(): void;
    /** Opens renaming a named provider the reader may change. */
    connectionRenameOpen(): void;
    credentialRenameOpen(credentialId: string): void;
    /** Opens typing a new key or setup token to replace one. */
    credentialReplaceOpen(credentialId: string): void;
    /** Asks whether to remove one token. */
    credentialRemoveOpen(credentialId: string): void;
    /** Closes the open action without doing it. */
    detailActionCancel(): void;
    connectionNameSave(name: string): void;
    credentialLabelSave(label: string): void;
    /** Adds the new key, with the old one's settings, then removes the old one. */
    credentialSecretSave(secret: string): void;
    /** Opens changing where and how an API key connects. */
    credentialConnectionOpen(credentialId: string): void;
    /**
     * Points the open token at `baseUrl` with `auth`, or back at the vendor's
     * own API when it is empty. `headers` replaces the stored ones and they
     * are kept when it is absent; `secret` replaces the key, as a token that
     * took none needs one.
     */
    credentialConnectionSave(change: {
        readonly baseUrl: string;
        readonly auth: HappyAgentCloudCredentialAuth;
        readonly headers?: readonly HappyAgentCloudHeader[];
        readonly secret?: string;
    }): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentCloudProvidersStoreDeps {
    readonly api: HappyAgentCloudProvidersApi;
    /** The connection's input, whose `config.updated` says the list changed. */
    readonly sync?: HappyAgentSync;
}

/** How often a sign-in waiting on the vendor is read again. */
const SIGN_IN_POLL_INTERVAL_MS = 3_000;
const NO_SIGN_INS: ReadonlySet<HappyAgentCloudSignInCli> = new Set();
const NO_SAVING: ReadonlySet<string> = new Set();

const KEY_VENDOR_NAMES: Readonly<Record<HappyAgentCloudKeyVendor, string>> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    grok: "Grok",
    bedrock: "Amazon Bedrock",
};

/** The team's own connection a flow's credential lands in by default: its vendor's. */
function teamConnectionOf(flow: HappyAgentCloudProviderAddFlow): string {
    switch (flow.kind) {
        case "apiKey":
            return flow.vendor;
        case "chatgpt":
            return "codex";
        case "claude":
            return "claude-code";
    }
}

function teamConnectionName(flow: HappyAgentCloudProviderAddFlow): string {
    if (flow.kind === "apiKey") return KEY_VENDOR_NAMES[flow.vendor];
    return flow.kind === "chatgpt" ? "ChatGPT" : "Claude";
}

/**
 * Where a flow's credential may be kept for `to`, the default first: the
 * team's connection for its vendor, or the reader's own account, then the
 * named providers of the same scope. Bedrock keys run only in the team's.
 */
export function happyAgentCloudProviderAddOptions(
    connections: readonly HappyAgentCloudConnection[],
    flow: HappyAgentCloudProviderAddFlow,
    to: HappyAgentCloudScope,
): readonly HappyAgentCloudProviderAddOption[] {
    const team = teamConnectionOf(flow);
    const listed = (id: string) => connections.find((connection) => connection.id === id);
    const first: HappyAgentCloudProviderAddOption =
        to === "team"
            ? { connectionId: team, name: listed(team)?.name ?? teamConnectionName(flow) }
            : { connectionId: "private", name: "My account" };
    if (happyAgentCloudProviderAddTeamOnly(flow)) return [first];
    return [
        first,
        ...connections
            .filter(
                (connection) =>
                    connection.scope === to && happyAgentCloudConnectionNamed(connection),
            )
            .map((connection) => ({ connectionId: connection.id, name: connection.name })),
    ];
}

/**
 * Whether a provider takes what a flow adds: the team's own one for a vendor
 * takes only that vendor's, and any other takes all but Bedrock's.
 */
export function happyAgentCloudProviderAddFlowTaken(
    connection: HappyAgentCloudConnection,
    flow: HappyAgentCloudProviderAddFlow,
): boolean {
    if (connection.scope === "team" && !happyAgentCloudConnectionNamed(connection))
        return teamConnectionOf(flow) === connection.id;
    return !happyAgentCloudProviderAddTeamOnly(flow);
}

/** Whether a flow's credential may go in a new provider: all but Bedrock's. */
export function happyAgentCloudProviderAddNewAllowed(
    flow: HappyAgentCloudProviderAddFlow,
): boolean {
    return !happyAgentCloudProviderAddTeamOnly(flow);
}

/**
 * The name a credential is given when none is typed. A sign-in has none of
 * its own: the server names it after the account it signed in.
 */
export function happyAgentCloudProviderAddLabelDefault(
    flow: HappyAgentCloudProviderAddFlow,
): string | undefined {
    if (flow.kind === "apiKey") return `${KEY_VENDOR_NAMES[flow.vendor]} API key`;
    if (flow.kind === "claude" && flow.setupToken) return "Claude (setup token)";
    return undefined;
}

/** Every flow, in the add dialog's order. */
const FLOWS: readonly HappyAgentCloudProviderAddFlow[] = [
    { kind: "chatgpt" },
    { kind: "apiKey", vendor: "openai" },
    { kind: "claude", setupToken: false },
    { kind: "claude", setupToken: true },
    { kind: "apiKey", vendor: "anthropic" },
    { kind: "apiKey", vendor: "grok" },
    { kind: "apiKey", vendor: "bedrock" },
];

/**
 * The flows the open add form offers, in its order: those this server and
 * role can add, and from a provider's sheet only those that provider takes.
 */
export function happyAgentCloudProviderAddFlows(
    snapshot: HappyAgentCloudProvidersSnapshot,
): readonly HappyAgentCloudProviderAddFlow[] {
    const { add, signIns, setupToken, teamAllowed, connections } = snapshot;
    const anchor = add?.anchor
        ? connections.find((connection) => connection.id === add.anchor?.connectionId)
        : undefined;
    return FLOWS.filter((flow) => {
        if (flow.kind === "chatgpt" && !signIns.has("codex")) return false;
        if (flow.kind === "claude" && !(flow.setupToken ? setupToken : signIns.has("claude")))
            return false;
        if (happyAgentCloudProviderAddTeamOnly(flow) && !teamAllowed) return false;
        return !anchor || happyAgentCloudProviderAddFlowTaken(anchor, flow);
    });
}

/**
 * The headers to send: rows without a name dropped, names trimmed; `null`
 * when a named one has no value.
 */
function headersClean(
    headers: readonly HappyAgentCloudHeader[],
): readonly HappyAgentCloudHeader[] | null {
    const named = headers
        .map((header) => ({ name: header.name.trim(), value: header.value }))
        .filter((header) => header.name !== "");
    return named.some((header) => header.value.trim() === "") ? null : named;
}

/** Whether a flow adds an API key that may name its own endpoint. */
function endpointTaken(flow: HappyAgentCloudProviderAddFlow): boolean {
    return flow.kind === "apiKey" && flow.vendor !== "bedrock";
}

function signInCliOf(flow: HappyAgentCloudProviderAddFlow): HappyAgentCloudSignInCli | undefined {
    if (flow.kind === "chatgpt") return "codex";
    if (flow.kind === "claude" && !flow.setupToken) return "claude";
    return undefined;
}

export function happyAgentCloudProvidersStoreCreate(
    deps: HappyAgentCloudProvidersStoreDeps,
): HappyAgentCloudProvidersStore {
    const store = createStore<HappyAgentCloudProvidersSnapshot>()(() => ({
        loading: true,
        connections: [],
        listScope: "team",
        privateAllowed: true,
        teamAllowed: false,
        signIns: NO_SIGN_INS,
        setupToken: false,
        endpoints: false,
        credentialsSaving: NO_SAVING,
    }));
    /** The sign-ins `/v0/provider-clis` lists, before the server's capabilities narrow them. */
    let listedSignIns: ReadonlySet<HappyAgentCloudSignInCli> = NO_SIGN_INS;
    /** What the server says it can add; absent on servers that don't say. */
    let capabilities: HappyAgentCloudCapabilities | undefined;
    const listeners = new Set<() => void>();
    let disposed = false;
    let follow: AbortController | undefined;
    /** Only the newest list read may land. */
    let generation = 0;
    let signInTimer: ReturnType<typeof setTimeout> | undefined;
    /**
     * The sign-in this dialog started, the one key its retries reuse, where
     * it is kept, and the name to give what it stores.
     */
    let signIn:
        | {
              readonly cli: HappyAgentCloudSignInCli;
              readonly mutationId: string;
              readonly connectionId: string;
              readonly label: string;
          }
        | undefined;
    /**
     * The provider this dialog created for what it adds, so a retry after a
     * refused key goes into it rather than creating another.
     */
    let created:
        | { readonly name: string; readonly to: HappyAgentCloudScope; readonly id: string }
        | undefined;

    const addSet = (add: HappyAgentCloudProviderAdd | undefined): void => {
        if (add) {
            store.setState({ add }, false);
            return;
        }
        const { add: _closed, ...rest } = store.getState();
        store.setState(rest, true);
    };
    const addUpdate = (change: Partial<HappyAgentCloudProviderAdd>): void => {
        const add = store.getState().add;
        if (add) addSet({ ...add, ...change });
    };
    /** The add dialog without what the last attempt left behind. */
    const addFresh = (add: HappyAgentCloudProviderAdd): HappyAgentCloudProviderAdd => {
        const { error: _error, signIn: _signIn, done: _done, ...rest } = add;
        return { ...rest, phase: "idle" };
    };

    const listRead = (): void => {
        if (disposed) return;
        const ticket = ++generation;
        void deps.api.providersRead().then(
            ({ connections, capabilities: said }) => {
                if (disposed || ticket !== generation) return;
                capabilities = said;
                offersPublish();
                const current = store.getState();
                const { error: _cleared, ...rest } = current;
                store.setState(
                    {
                        ...rest,
                        loading: false,
                        connections: referencesPreserve(
                            current.connections,
                            connections.map((connection) => {
                                const before = current.connections.find(
                                    (candidate) => candidate.id === connection.id,
                                );
                                return before &&
                                    JSON.stringify(before) === JSON.stringify(connection)
                                    ? before
                                    : connection;
                            }),
                        ),
                    },
                    true,
                );
                detailReconcile();
            },
            (error: unknown) => {
                if (disposed || ticket !== generation) return;
                // A failed refresh keeps what was read; only the first read shows the error.
                if (store.getState().loading)
                    store.setState({ loading: false, error: happyAgentUserError(error) }, false);
            },
        );
    };

    const capabilitiesRead = (): void => {
        void deps.api.permissionsRead().then(
            (granted) => {
                if (disposed) return;
                store.setState(
                    {
                        privateAllowed: granted.has("providers.own"),
                        teamAllowed: granted.has("providers.manage"),
                    },
                    false,
                );
                const add = store.getState().add;
                if (add) addRetarget(add, flowOffered(add.flow), add.to);
            },
            () => undefined,
        );
        void deps.api.signInsRead().then(
            (signIns) => {
                if (disposed) return;
                listedSignIns = signIns;
                offersPublish();
            },
            () => undefined,
        );
    };

    /**
     * Publishes what may be added: a sign-in the server lists and, where it
     * says, can do; a setup token only where it says it takes one.
     */
    const offersPublish = (): void => {
        const signIns =
            capabilities?.claudeSignIn === false && listedSignIns.has("claude")
                ? new Set([...listedSignIns].filter((cli) => cli !== "claude"))
                : listedSignIns;
        const setupToken = capabilities?.claudeSetupToken === true;
        const endpoints = capabilities?.credentialEndpoints === true;
        const current = store.getState();
        const same =
            current.setupToken === setupToken &&
            current.endpoints === endpoints &&
            current.signIns.size === signIns.size &&
            [...signIns].every((cli) => current.signIns.has(cli));
        if (!same) store.setState({ signIns, setupToken, endpoints }, false);
        const add = store.getState().add;
        if (add) {
            const flow = flowOffered(add.flow);
            if (flow !== add.flow) addRetarget(add, flow, add.to);
        }
    };

    /** The scope asked for, where the reader may add to it and the flow may be kept. */
    const scopeOf = (
        to: HappyAgentCloudScope | undefined,
        flow: HappyAgentCloudProviderAddFlow | undefined,
    ): HappyAgentCloudScope => {
        const { privateAllowed, teamAllowed } = store.getState();
        if (flow && happyAgentCloudProviderAddTeamOnly(flow)) return "team";
        if (to === "team" && teamAllowed) return "team";
        if (!privateAllowed && teamAllowed) return "team";
        return "private";
    };

    /** What the add dialog opens on: ChatGPT, by sign-in where the server offers it. */
    const flowDefault = (): HappyAgentCloudProviderAddFlow =>
        store.getState().signIns.has("codex")
            ? { kind: "chatgpt" }
            : { kind: "apiKey", vendor: "openai" };

    /** The flow asked for, where this server offers it; its vendor's key otherwise. */
    const flowOffered = (flow: HappyAgentCloudProviderAddFlow): HappyAgentCloudProviderAddFlow => {
        const { signIns, setupToken, teamAllowed } = store.getState();
        if (flow.kind === "chatgpt" && !signIns.has("codex"))
            return { kind: "apiKey", vendor: "openai" };
        if (happyAgentCloudProviderAddTeamOnly(flow) && !teamAllowed) return flowDefault();
        if (flow.kind === "claude") {
            const signIn = signIns.has("claude");
            if (flow.setupToken ? setupToken : signIn) return flow;
            if (signIn || setupToken) return { kind: "claude", setupToken };
            return { kind: "apiKey", vendor: "anthropic" };
        }
        return flow;
    };

    /**
     * Where a flow's credential goes for `to`: the destination asked for while
     * it can take it, and the default one otherwise.
     */
    const destinationOf = (
        asked: HappyAgentCloudProviderAddDestination | undefined,
        flow: HappyAgentCloudProviderAddFlow,
        to: HappyAgentCloudScope,
    ): HappyAgentCloudProviderAddDestination => {
        const options = happyAgentCloudProviderAddOptions(store.getState().connections, flow, to);
        if (asked?.kind === "new" && happyAgentCloudProviderAddNewAllowed(flow)) return asked;
        if (
            asked?.kind === "existing" &&
            options.some((option) => option.connectionId === asked.connectionId)
        )
            return asked;
        return { kind: "existing", connectionId: options[0]?.connectionId ?? "private" };
    };

    /** Puts the open dialog on `flow` and `to`, keeping its destination where it still fits. */
    const addRetarget = (
        add: HappyAgentCloudProviderAdd,
        flow: HappyAgentCloudProviderAddFlow,
        asked: HappyAgentCloudScope,
    ): void => {
        // Adding from a provider's sheet keeps it in that provider.
        if (add.anchor) {
            if (flow !== add.flow) addSet({ ...add, flow });
            return;
        }
        const to = scopeOf(asked, flow);
        const destination = destinationOf(add.destination, flow, to);
        if (flow === add.flow && to === add.to && destination === add.destination) return;
        addSet({ ...add, flow, to, destination });
    };

    const followStart = (): void => {
        const sync = deps.sync;
        if (!sync || follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["config.updated"],
            })) {
                const greeting = !greeted;
                greeted = true;
                if (input.kind === "error") continue;
                if (input.kind === "update" && input.update.kind === "connected") continue;
                // The first read was sent after this subscription was installed.
                if (greeting && input.kind !== "update") continue;
                listRead();
            }
        })().catch(() => undefined);
    };

    const signInTimerCancel = (): void => {
        if (signInTimer !== undefined) clearTimeout(signInTimer);
        signInTimer = undefined;
    };

    const signInWord = (cli: HappyAgentCloudSignInCli): string =>
        cli === "codex" ? "ChatGPT" : "Claude";

    /** Shows where a sign-in this dialog started stands. */
    const signInSettle = (
        cli: HappyAgentCloudSignInCli,
        operation: HappyAgentCloudSignIn | null,
    ) => {
        const add = store.getState().add;
        const started = signIn;
        if (!add || started?.cli !== cli) return;
        if (operation === null || operation.status === "cancelled") {
            signIn = undefined;
            addSet(addFresh(add));
            return;
        }
        if (operation.status === "succeeded") {
            signIn = undefined;
            const connected = `${signInWord(cli)} connected`;
            const label = started.label;
            if (label === "" || operation.credentialId === null) {
                addDone(add, connected);
                return;
            }
            // A sign-in is stored under the account's name; the one typed replaces it.
            void deps.api
                .credentialLabelUpdate(started.connectionId, operation.credentialId, label)
                .then(
                    () => connected,
                    () => `${connected}, but its name wasn't saved`,
                )
                .then((done) => {
                    const open = store.getState().add;
                    if (!disposed && open) addDone(open, done);
                });
            return;
        }
        if (operation.status === "failed") {
            signIn = undefined;
            const code = operation.error?.code ?? "sign_in_failed";
            addSet({
                ...addFresh(add),
                error: {
                    title: code === "expired" ? "Code expired" : "Sign-in failed",
                    message:
                        operation.error?.message ||
                        `${signInWord(cli)} didn't accept the sign-in. Try again.`,
                },
            });
            return;
        }
        const authorization = operation.authorization;
        addSet({
            ...add,
            phase: authorization ? "waiting" : "busy",
            ...(authorization
                ? {
                      signIn: {
                          url: authorization.url,
                          ...(authorization.userCode === null
                              ? {}
                              : { userCode: authorization.userCode }),
                          acceptsCode: authorization.acceptsCode,
                      },
                  }
                : {}),
        });
        signInPoll(cli);
    };

    const signInPoll = (cli: HappyAgentCloudSignInCli): void => {
        if (disposed || signInTimer !== undefined) return;
        signInTimer = setTimeout(() => {
            signInTimer = undefined;
            if (disposed || signIn?.cli !== cli) return;
            void deps.api.signInRead(cli).then(
                (operation) => {
                    if (!disposed) signInSettle(cli, operation);
                },
                () => {
                    if (!disposed && signIn?.cli === cli) signInPoll(cli);
                },
            );
        }, SIGN_IN_POLL_INTERVAL_MS);
    };

    /** Lets go of a sign-in this dialog started, cancelling it on the server. */
    const signInAbandon = (): void => {
        signInTimerCancel();
        const abandoned = signIn;
        signIn = undefined;
        if (abandoned)
            void deps.api.signInCancel(abandoned.cli, crypto.randomUUID()).catch(() => undefined);
    };

    /**
     * Shows what was added. In a provider's sheet the new or signed-in token
     * itself says so, so adding there simply ends.
     */
    const addDone = (add: HappyAgentCloudProviderAdd, done: string): void => {
        signIn = undefined;
        created = undefined;
        addSet(add.anchor ? undefined : { ...addFresh(add), phase: "done", done });
        listRead();
    };

    const addFailed = (title: string, error: unknown): void => {
        addUpdate({ phase: "idle", error: { title, message: happyAgentUserError(error).message } });
    };

    /**
     * The ID of the connection the dialog keeps what it adds in, creating the
     * new provider it names the first time it is needed.
     */
    const destinationResolve = async (add: HappyAgentCloudProviderAdd): Promise<string> => {
        const destination = add.destination;
        if (destination.kind === "existing") return destination.connectionId;
        const name = destination.name.trim();
        if (created && created.name === name && created.to === add.to) return created.id;
        const { id } = await deps.api.connectionCreate(name, add.to);
        created = { name, to: add.to, id };
        return id;
    };

    /** Sends one credential the person typed to where the dialog keeps it. */
    const credentialSubmit = (
        input: {
            readonly vendor: string;
            readonly kind: "api_key" | "aws_keys" | "oauth_token";
        },
        secret: string,
        label: string,
        done: string,
        failed: string,
        before?: () => Promise<void>,
        headers?: readonly HappyAgentCloudHeader[],
    ): void => {
        const add = store.getState().add;
        if (disposed || !add || add.phase !== "idle") return;
        // How it signs and what it adds matter only to an endpoint of its own.
        const endpoint =
            store.getState().endpoints && endpointTaken(add.flow) ? add.endpoint.trim() : "";
        const auth: HappyAgentCloudCredentialAuth = endpoint === "" ? "default" : add.auth;
        const sent = endpoint === "" ? [] : headersClean(headers ?? []);
        if (!sent) return;
        // Only an endpoint that takes no key goes without one.
        if (auth !== "none" && secret.trim() === "") return;
        if (add.destination.kind === "new" && add.destination.name.trim() === "") return;
        const { error: _cleared, ...rest } = add;
        addSet({ ...rest, phase: "busy" });
        let creating = add.destination.kind === "new";
        void destinationResolve(add)
            .then(async (connectionId) => {
                creating = false;
                await (before ?? (() => Promise.resolve()))();
                return deps.api.credentialAdd(connectionId, {
                    ...input,
                    secret: auth === "none" ? "" : secret.trim(),
                    ...(endpoint === ""
                        ? {}
                        : {
                              baseUrl: endpoint,
                              ...(auth === "default" ? {} : { auth }),
                              ...(sent.length === 0 ? {} : { headers: sent }),
                          }),
                    label: add.label.trim() || label,
                });
            })
            .then(
                ({ duplicate }) => {
                    const open = store.getState().add;
                    if (!disposed && open) addDone(open, duplicate ? "Already added" : done);
                },
                (error: unknown) => {
                    if (!disposed)
                        addFailed(creating ? "Couldn't create the provider" : failed, error);
                },
            );
    };

    /** Marks one credential as changing until the server answers. */
    const change = (credentialId: string, send: () => Promise<unknown>): void => {
        const current = store.getState();
        if (disposed || current.credentialsSaving.has(credentialId)) return;
        const { saveError: _cleared, ...rest } = current;
        store.setState(
            { ...rest, credentialsSaving: new Set(current.credentialsSaving).add(credentialId) },
            true,
        );
        const settle = (saveError?: UserError): void => {
            const saving = new Set(store.getState().credentialsSaving);
            saving.delete(credentialId);
            store.setState(
                {
                    credentialsSaving: saving.size === 0 ? NO_SAVING : saving,
                    ...(saveError ? { saveError } : {}),
                },
                false,
            );
        };
        void send().then(
            () => {
                if (disposed) return;
                settle();
                listRead();
            },
            (error: unknown) => {
                if (!disposed) settle(happyAgentUserError(error));
            },
        );
    };

    const detailSet = (detail: HappyAgentCloudProviderDetail | undefined): void => {
        if (detail) {
            store.setState({ detail }, false);
            return;
        }
        const { detail: _closed, ...rest } = store.getState();
        store.setState(rest, true);
    };

    /** The open sheet's connection, while it is listed. */
    const detailConnection = (): HappyAgentCloudConnection | undefined => {
        const { detail, connections } = store.getState();
        return detail
            ? connections.find((connection) => connection.id === detail.connectionId)
            : undefined;
    };

    /** Whether the reader may change a connection's credentials and name. */
    const manageable = (connection: HappyAgentCloudConnection): boolean => {
        const { teamAllowed, privateAllowed } = store.getState();
        return (
            connection.source === "tenant" &&
            connection.credentials !== undefined &&
            (connection.scope === "team" ? teamAllowed : privateAllowed)
        );
    };

    /**
     * Keeps the open sheet on what is still listed: an action on a token
     * removed elsewhere closes.
     */
    const detailReconcile = (): void => {
        const detail = store.getState().detail;
        const action = detail?.action;
        if (!detail || detail.phase === "busy" || !action || action.kind === "name") return;
        const listed = detailConnection()?.credentials?.some(
            (credential) => credential.id === action.credentialId,
        );
        if (!listed) detailSet({ connectionId: detail.connectionId, phase: "idle" });
    };

    /** Opens one action in the sheet, in place of any other that was open. */
    const detailActionOpen = (action: HappyAgentCloudProviderDetailAction): void => {
        const detail = store.getState().detail;
        const connection = detailConnection();
        if (disposed || !detail || detail.phase === "busy" || !connection) return;
        if (!manageable(connection)) return;
        if (
            action.kind !== "name" &&
            !connection.credentials?.some((credential) => credential.id === action.credentialId)
        )
            return;
        if (action.kind === "name" && !happyAgentCloudConnectionNamed(connection)) return;
        const add = store.getState().add;
        if (add?.anchor && add.phase !== "busy") actions.addClose();
        detailSet({ connectionId: detail.connectionId, action, phase: "idle" });
    };

    /** Runs the sheet's open action in turn, then closes it; a refusal keeps it open with why. */
    const detailRun = (
        steps: readonly (() => Promise<unknown>)[],
        failed: (saved: number) => string,
    ): void => {
        const detail = store.getState().detail;
        if (disposed || !detail || detail.phase === "busy") return;
        const { error: _cleared, ...rest } = detail;
        detailSet({ ...rest, phase: "busy" });
        let saved = 0;
        void steps
            .reduce<Promise<unknown>>(
                (done, step) =>
                    done.then(step).then(() => {
                        saved += 1;
                    }),
                Promise.resolve(),
            )
            .then(
                () => {
                    if (disposed || store.getState().detail?.connectionId !== detail.connectionId)
                        return;
                    detailSet({ connectionId: detail.connectionId, phase: "idle" });
                    if (steps.length > 0) listRead();
                },
                (error: unknown) => {
                    if (disposed || store.getState().detail?.connectionId !== detail.connectionId)
                        return;
                    detailSet({
                        ...rest,
                        phase: "idle",
                        error: {
                            title: failed(saved),
                            message: happyAgentUserError(error).message,
                        },
                    });
                    listRead();
                },
            );
    };

    /** The open action's token, while it is listed. */
    const detailCredential = (
        kind: "label" | "secret" | "connection",
    ): HappyAgentCloudCredential | undefined => {
        const action = store.getState().detail?.action;
        if (action?.kind !== kind) return undefined;
        return detailConnection()?.credentials?.find((entry) => entry.id === action.credentialId);
    };

    const actions: HappyAgentCloudProvidersStore = {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                listRead();
                capabilitiesRead();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) {
                    follow?.abort();
                    follow = undefined;
                }
            };
        },
        listScopeUpdate(scope) {
            if (disposed || store.getState().listScope === scope) return;
            store.setState({ listScope: scope }, false);
        },
        addOpen(options) {
            if (disposed) return;
            signInAbandon();
            created = undefined;
            const flow = flowOffered(options?.flow ?? flowDefault());
            const to = scopeOf(options?.to, flow);
            addSet({
                flow,
                to,
                label: "",
                endpoint: "",
                auth: "default",
                destination: destinationOf(
                    options?.connectionId === undefined
                        ? undefined
                        : { kind: "existing", connectionId: options.connectionId },
                    flow,
                    to,
                ),
                phase: "idle",
            });
        },
        credentialAddOpen() {
            const detail = store.getState().detail;
            const connection = detailConnection();
            if (disposed || !detail || detail.phase === "busy" || !connection) return;
            if (!manageable(connection)) return;
            signInAbandon();
            created = undefined;
            detailSet({ connectionId: detail.connectionId, phase: "idle" });
            const preferred = flowDefault();
            const flow = happyAgentCloudProviderAddFlowTaken(connection, preferred)
                ? preferred
                : (FLOWS.map(flowOffered).find((candidate) =>
                      happyAgentCloudProviderAddFlowTaken(connection, candidate),
                  ) ?? preferred);
            addSet({
                flow,
                anchor: { connectionId: connection.id },
                to: connection.scope,
                label: "",
                endpoint: "",
                auth: "default",
                destination: { kind: "existing", connectionId: connection.id },
                phase: "idle",
            });
        },
        credentialReauthStart(credentialId) {
            const detail = store.getState().detail;
            const connection = detailConnection();
            const credential = connection?.credentials?.find((entry) => entry.id === credentialId);
            if (disposed || !detail || detail.phase === "busy" || !connection || !credential)
                return;
            if (!manageable(connection) || credential.kind !== "oauth") return;
            const cli: HappyAgentCloudSignInCli | undefined =
                credential.vendor === "codex"
                    ? "codex"
                    : credential.vendor === "claude-code"
                      ? "claude"
                      : undefined;
            if (!cli || !store.getState().signIns.has(cli)) return;
            signInAbandon();
            created = undefined;
            detailSet({ connectionId: detail.connectionId, phase: "idle" });
            addSet({
                flow: cli === "codex" ? { kind: "chatgpt" } : { kind: "claude", setupToken: false },
                anchor: { connectionId: connection.id, credentialId },
                to: connection.scope,
                // Signing the same account in again keeps the token's name.
                label: "",
                endpoint: "",
                auth: "default",
                destination: { kind: "existing", connectionId: connection.id },
                phase: "idle",
            });
            actions.signInStart();
        },
        addFlowSelect(flow) {
            const add = store.getState().add;
            if (disposed || !add || add.phase === "busy") return;
            signInAbandon();
            const offered = flowOffered(flow);
            if (add.anchor) {
                addSet({ ...addFresh(add), flow: offered });
                return;
            }
            const to = scopeOf(add.to, offered);
            addSet({
                ...addFresh(add),
                flow: offered,
                to,
                destination: destinationOf(add.destination, offered, to),
            });
        },
        addClose() {
            if (disposed || !store.getState().add) return;
            signInAbandon();
            created = undefined;
            addSet(undefined);
        },
        addScopeUpdate(to) {
            const add = store.getState().add;
            if (disposed || !add || add.anchor || add.phase !== "idle") return;
            const scope = scopeOf(to, add.flow);
            if (scope === add.to) return;
            addSet({
                ...add,
                to: scope,
                // A provider of the other scope cannot take it; a new one is named for this one.
                destination: destinationOf(
                    add.destination.kind === "new" ? add.destination : undefined,
                    add.flow,
                    scope,
                ),
            });
        },
        addLabelUpdate(label) {
            const add = store.getState().add;
            if (disposed || !add || add.phase !== "idle") return;
            addSet({ ...add, label });
        },
        addEndpointUpdate(endpoint) {
            const add = store.getState().add;
            if (disposed || !add || add.phase !== "idle") return;
            if (!store.getState().endpoints || !endpointTaken(add.flow)) return;
            addSet({ ...add, endpoint });
        },
        addAuthUpdate(auth) {
            const add = store.getState().add;
            if (disposed || !add || add.phase !== "idle") return;
            if (!store.getState().endpoints || !endpointTaken(add.flow)) return;
            addSet({ ...add, auth });
        },
        addDestinationSelect(connectionId) {
            const add = store.getState().add;
            if (disposed || !add || add.anchor || add.phase !== "idle") return;
            const destination = destinationOf({ kind: "existing", connectionId }, add.flow, add.to);
            addSet({ ...add, destination });
        },
        addDestinationNewSelect() {
            const add = store.getState().add;
            if (disposed || !add || add.anchor || add.phase !== "idle") return;
            if (add.destination.kind === "new" || !happyAgentCloudProviderAddNewAllowed(add.flow))
                return;
            addSet({ ...add, destination: { kind: "new", name: "" } });
        },
        addDestinationNameUpdate(name) {
            const add = store.getState().add;
            if (disposed || !add || add.phase !== "idle" || add.destination.kind !== "new") return;
            addSet({ ...add, destination: { kind: "new", name } });
        },
        apiKeySubmit(secret, options) {
            const flow = store.getState().add?.flow;
            if (flow?.kind !== "apiKey") return;
            const routed = flow.vendor === "bedrock" ? options?.region?.trim() : undefined;
            credentialSubmit(
                { vendor: flow.vendor, kind: "api_key" },
                secret,
                `${KEY_VENDOR_NAMES[flow.vendor]} API key`,
                "API key added",
                "Couldn't add the key",
                routed ? () => deps.api.bedrockRegionSave(routed) : undefined,
                options?.headers,
            );
        },
        awsKeysSubmit(input) {
            const flow = store.getState().add?.flow;
            if (flow?.kind !== "apiKey" || flow.vendor !== "bedrock") return;
            const accessKeyId = input.accessKeyId.trim();
            const secretAccessKey = input.secretAccessKey.trim();
            const region = input.region?.trim();
            if (accessKeyId === "" || secretAccessKey === "") return;
            credentialSubmit(
                { vendor: "bedrock", kind: "aws_keys" },
                JSON.stringify({ accessKeyId, secretAccessKey, ...(region ? { region } : {}) }),
                "AWS access keys",
                "Access keys added",
                "Couldn't add the keys",
            );
        },
        setupTokenSubmit(token) {
            const flow = store.getState().add?.flow;
            if (flow?.kind !== "claude" || !flow.setupToken) return;
            credentialSubmit(
                { vendor: "claude-code", kind: "oauth_token" },
                token,
                "Claude (setup token)",
                "Claude connected",
                "Couldn't add the token",
            );
        },
        signInStart() {
            const add = store.getState().add;
            const cli = add ? signInCliOf(add.flow) : undefined;
            if (disposed || !add || !cli || add.phase !== "idle") return;
            if (add.destination.kind === "new" && add.destination.name.trim() === "") return;
            signInTimerCancel();
            const mutationId = crypto.randomUUID();
            addSet({ ...addFresh(add), phase: "busy" });
            let creating = add.destination.kind === "new";
            let started: typeof signIn;
            void destinationResolve(add)
                .then((connectionId) => {
                    creating = false;
                    if (disposed || store.getState().add === undefined) return undefined;
                    started = { cli, mutationId, connectionId, label: add.label.trim() };
                    signIn = started;
                    const target: HappyAgentCloudTarget =
                        connectionId === "private"
                            ? { scope: "private" }
                            : { providerId: connectionId };
                    return deps.api.signInStart(cli, target, mutationId);
                })
                .then(
                    (operation) => {
                        if (!disposed && started && signIn === started)
                            signInSettle(cli, operation ?? null);
                    },
                    (error: unknown) => {
                        if (disposed) return;
                        if (creating) {
                            addFailed("Couldn't create the provider", error);
                            return;
                        }
                        if (signIn !== started) return;
                        signIn = undefined;
                        addFailed("Sign-in failed", error);
                    },
                );
        },
        signInCodeSubmit(code) {
            const add = store.getState().add;
            const started = signIn;
            if (disposed || !add || !started || add.phase !== "waiting" || code.trim() === "")
                return;
            signInTimerCancel();
            const { error: _cleared, ...rest } = add;
            addSet({ ...rest, phase: "busy" });
            void deps.api.signInCodeSubmit(started.cli, code.trim(), started.mutationId).then(
                (operation) => {
                    if (!disposed && signIn === started) signInSettle(started.cli, operation);
                },
                (error: unknown) => {
                    if (disposed || signIn !== started) return;
                    addUpdate({
                        phase: "waiting",
                        error: {
                            title: "Sign-in failed",
                            message: happyAgentUserError(error).message,
                        },
                    });
                    signInPoll(started.cli);
                },
            );
        },
        credentialEnabledUpdate(connectionId, credentialId, enabled) {
            change(credentialId, () =>
                deps.api.credentialEnabledUpdate(connectionId, credentialId, enabled),
            );
        },
        credentialRemove(connectionId, credentialId) {
            const action = store.getState().detail?.action;
            if (
                store.getState().detail?.connectionId === connectionId &&
                action?.kind === "remove" &&
                action.credentialId === credentialId
            ) {
                detailRun(
                    [() => deps.api.credentialRemove(connectionId, credentialId)],
                    () => "Not removed",
                );
                return;
            }
            change(credentialId, () => deps.api.credentialRemove(connectionId, credentialId));
        },
        detailOpen(connectionId) {
            const { connections, detail, add } = store.getState();
            const listed = connections.some((connection) => connection.id === connectionId);
            if (disposed || !listed || detail?.phase === "busy") return;
            if (add?.anchor) actions.addClose();
            detailSet({ connectionId, phase: "idle" });
        },
        detailClose() {
            const detail = store.getState().detail;
            if (disposed || !detail || detail.phase === "busy") return;
            if (store.getState().add?.anchor) actions.addClose();
            detailSet(undefined);
        },
        connectionRenameOpen() {
            detailActionOpen({ kind: "name" });
        },
        credentialRenameOpen(credentialId) {
            detailActionOpen({ kind: "label", credentialId });
        },
        credentialReplaceOpen(credentialId) {
            const credential = detailConnection()?.credentials?.find(
                (entry) => entry.id === credentialId,
            );
            if (credential && happyAgentCloudCredentialReplaceable(credential))
                detailActionOpen({ kind: "secret", credentialId });
        },
        credentialRemoveOpen(credentialId) {
            detailActionOpen({ kind: "remove", credentialId });
        },
        detailActionCancel() {
            const detail = store.getState().detail;
            if (disposed || !detail || detail.phase === "busy" || !detail.action) return;
            detailSet({ connectionId: detail.connectionId, phase: "idle" });
        },
        connectionNameSave(name) {
            const detail = store.getState().detail;
            const connection = detailConnection();
            if (detail?.action?.kind !== "name" || !connection) return;
            const trimmed = name.trim();
            detailRun(
                trimmed === "" || trimmed === connection.name
                    ? []
                    : [() => deps.api.connectionRename(connection.id, trimmed)],
                () => "Not renamed",
            );
        },
        credentialLabelSave(label) {
            const connection = detailConnection();
            const credential = detailCredential("label");
            if (!connection || !credential) return;
            const trimmed = label.trim();
            detailRun(
                trimmed === "" || trimmed === credential.label
                    ? []
                    : [() => deps.api.credentialLabelUpdate(connection.id, credential.id, trimmed)],
                () => "Not renamed",
            );
        },
        credentialSecretSave(secret) {
            const connection = detailConnection();
            const credential = detailCredential("secret");
            const typed = secret.trim();
            if (!connection || !credential || typed === "") return;
            if (!happyAgentCloudCredentialReplaceable(credential)) return;
            // A key on an endpoint of its own is replaced in place, so its headers, whose
            // values never come back, stay with it.
            if (credential.baseUrl !== undefined) {
                detailRun(
                    [
                        () =>
                            deps.api.credentialConnectionUpdate(connection.id, credential.id, {
                                secret: typed,
                            }),
                    ],
                    () => "Not replaced",
                );
                return;
            }
            let same = false;
            detailRun(
                [
                    async () => {
                        // The new key keeps the old one's name and settings: whether it is on, and when it is used.
                        const added = await deps.api.credentialAdd(connection.id, {
                            vendor: credential.vendor,
                            kind: credential.kind,
                            secret: typed,
                            label: credential.label,
                            enabled: credential.enabled,
                            ...(credential.usage === undefined ? {} : { usage: credential.usage }),
                        });
                        // The same key typed again is this credential: keep it. A duplicate of
                        // another one, such as a retry after a failed remove, still replaces it;
                        // where the server doesn't say which, the old key is kept, never lost.
                        same =
                            added.duplicate &&
                            (added.credentialId === undefined ||
                                added.credentialId === credential.id);
                    },
                    () =>
                        same
                            ? Promise.resolve()
                            : deps.api.credentialRemove(connection.id, credential.id),
                ],
                (saved) => (saved > 0 ? "Partly replaced" : "Not replaced"),
            );
        },
        credentialConnectionOpen(credentialId) {
            const credential = detailConnection()?.credentials?.find(
                (entry) => entry.id === credentialId,
            );
            if (
                store.getState().endpoints &&
                credential &&
                happyAgentCloudCredentialEndpointVendor(credential) !== undefined
            )
                detailActionOpen({ kind: "connection", credentialId });
        },
        credentialConnectionSave(change) {
            const connection = detailConnection();
            const credential = detailCredential("connection");
            if (!connection || !credential) return;
            const baseUrl = change.baseUrl.trim();
            const secret = change.secret?.trim() ?? "";
            const before: HappyAgentCloudCredentialAuth = credential.auth ?? "default";
            // Back to the vendor's own API: the server drops its auth and headers itself.
            const auth: HappyAgentCloudCredentialAuth = baseUrl === "" ? "default" : change.auth;
            const headers =
                baseUrl === "" ? undefined : change.headers && headersClean(change.headers);
            if (headers === null) return;
            // A token that took no key needs one to sign with.
            if (before === "none" && auth !== "none" && secret === "") return;
            const same =
                baseUrl === (credential.baseUrl ?? "") &&
                auth === before &&
                headers === undefined &&
                secret === "";
            detailRun(
                same
                    ? []
                    : [
                          () =>
                              deps.api.credentialConnectionUpdate(
                                  connection.id,
                                  credential.id,
                                  baseUrl === ""
                                      ? { baseUrl: null }
                                      : {
                                            baseUrl,
                                            auth,
                                            ...(headers === undefined ? {} : { headers }),
                                            ...(secret === "" || auth === "none" ? {} : { secret }),
                                        },
                              ),
                      ],
                () => "Connection not changed",
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            signInAbandon();
            disposed = true;
            follow?.abort();
            follow = undefined;
        },
    };
    return actions;
}

const INERT_SNAPSHOT: HappyAgentCloudProvidersSnapshot = {
    loading: false,
    connections: [],
    listScope: "team",
    privateAllowed: false,
    teamAllowed: false,
    signIns: NO_SIGN_INS,
    setupToken: false,
    endpoints: false,
    credentialsSaving: NO_SAVING,
};

/** Where there is no Happy Cloud: it lists nothing and never changes. */
export const happyAgentCloudProvidersStoreNoop: HappyAgentCloudProvidersStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    listScopeUpdate: () => undefined,
    addOpen: () => undefined,
    credentialAddOpen: () => undefined,
    credentialReauthStart: () => undefined,
    addFlowSelect: () => undefined,
    addClose: () => undefined,
    addScopeUpdate: () => undefined,
    addLabelUpdate: () => undefined,
    addEndpointUpdate: () => undefined,
    addAuthUpdate: () => undefined,
    addDestinationSelect: () => undefined,
    addDestinationNewSelect: () => undefined,
    addDestinationNameUpdate: () => undefined,
    apiKeySubmit: () => undefined,
    awsKeysSubmit: () => undefined,
    setupTokenSubmit: () => undefined,
    signInStart: () => undefined,
    signInCodeSubmit: () => undefined,
    credentialEnabledUpdate: () => undefined,
    credentialRemove: () => undefined,
    detailOpen: () => undefined,
    detailClose: () => undefined,
    connectionRenameOpen: () => undefined,
    credentialRenameOpen: () => undefined,
    credentialReplaceOpen: () => undefined,
    credentialRemoveOpen: () => undefined,
    detailActionCancel: () => undefined,
    connectionNameSave: () => undefined,
    credentialLabelSave: () => undefined,
    credentialSecretSave: () => undefined,
    credentialConnectionOpen: () => undefined,
    credentialConnectionSave: () => undefined,
    [Symbol.dispose]: () => undefined,
};
