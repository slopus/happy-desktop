import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { UserError } from "../types.js";
import type {
    HappyAgentCloudConnection,
    HappyAgentCloudKeyVendor,
    HappyAgentCloudProvidersApi,
    HappyAgentCloudScope,
    HappyAgentCloudSignIn,
    HappyAgentCloudSignInCli,
    HappyAgentCloudTarget,
} from "./happyAgentCloudProviders.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** Which way of adding a provider the dialog shows. */
export type HappyAgentCloudProviderAddFlow =
    | { readonly kind: "choose" }
    | { readonly kind: "apiKey"; readonly vendor: HappyAgentCloudKeyVendor }
    /** ChatGPT's device sign-in. */
    | { readonly kind: "chatgpt" }
    /** Claude's browser sign-in, or pasting a setup token instead. */
    | { readonly kind: "claude"; readonly setupToken: boolean };

/**
 * Whether what a flow adds can only be kept for the team: Bedrock keys run
 * only in the team's `bedrock` connection, and Grok's, for now, in the team's.
 */
export function happyAgentCloudProviderAddTeamOnly(flow: HappyAgentCloudProviderAddFlow): boolean {
    return flow.kind === "apiKey" && (flow.vendor === "bedrock" || flow.vendor === "grok");
}

/** The add dialog, while it is open. */
export interface HappyAgentCloudProviderAdd {
    readonly flow: HappyAgentCloudProviderAddFlow;
    /** Where what is added is kept. */
    readonly to: HappyAgentCloudScope;
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

export interface HappyAgentCloudProvidersSnapshot {
    /** True until the first answer, so "nothing added" is never claimed early. */
    readonly loading: boolean;
    readonly connections: readonly HappyAgentCloudConnection[];
    /** Whether the reader may add to their own account. */
    readonly privateAllowed: boolean;
    /** Whether the reader may add for the whole team. */
    readonly teamAllowed: boolean;
    /** The subscriptions this server signs in to now. */
    readonly signIns: ReadonlySet<HappyAgentCloudSignInCli>;
    /** Credentials whose change the server hasn't answered. */
    readonly credentialsSaving: ReadonlySet<string>;
    readonly add?: HappyAgentCloudProviderAdd;
    /** Why the list could not be read. */
    readonly error?: UserError;
    /** Why the last change to a credential was refused. */
    readonly saveError?: UserError;
}

/**
 * Settings › AI providers on Happy Cloud: what conversations run on — Happy
 * (free), the team's, and the reader's own — and adding to them by API key,
 * setup token or subscription sign-in. Follows `config.updated` while watched.
 */
export interface HappyAgentCloudProvidersStore {
    get(): HappyAgentCloudProvidersSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens the add dialog, on one flow when a link names it. */
    addOpen(options?: {
        readonly flow?: HappyAgentCloudProviderAddFlow;
        readonly to?: HappyAgentCloudScope;
    }): void;
    addFlowSelect(flow: HappyAgentCloudProviderAddFlow): void;
    /** Back to the choices; a sign-in waiting on the vendor is cancelled. */
    addBack(): void;
    /** Closes the dialog; a sign-in waiting on the vendor is cancelled. */
    addClose(): void;
    addDestinationUpdate(to: HappyAgentCloudScope): void;
    /**
     * Adds the API key of the open key flow. A Bedrock key may name the
     * region the team's Bedrock keys route to, which is saved first.
     */
    apiKeySubmit(secret: string, region?: string): void;
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
    credentialRemove(connectionId: string, credentialId: string): void;
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
        privateAllowed: true,
        teamAllowed: false,
        signIns: NO_SIGN_INS,
        credentialsSaving: NO_SAVING,
    }));
    const listeners = new Set<() => void>();
    let disposed = false;
    let follow: AbortController | undefined;
    /** Only the newest list read may land. */
    let generation = 0;
    let signInTimer: ReturnType<typeof setTimeout> | undefined;
    /** The sign-in this dialog started, and the one key its retries reuse. */
    let signIn: { readonly cli: HappyAgentCloudSignInCli; readonly mutationId: string } | undefined;

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
        void deps.api.connectionsRead().then(
            (connections) => {
                if (disposed || ticket !== generation) return;
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
                if (add) {
                    const flow = flowOffered(add.flow);
                    addUpdate({ flow, to: destinationOf(add.to, flow) });
                }
            },
            () => undefined,
        );
        void deps.api.signInsRead().then(
            (signIns) => {
                if (disposed) return;
                store.setState({ signIns }, false);
                const add = store.getState().add;
                if (add) addUpdate({ flow: flowOffered(add.flow) });
            },
            () => undefined,
        );
    };

    /** The destination asked for, where the reader may add to it and the flow may be kept. */
    const destinationOf = (
        to: HappyAgentCloudScope | undefined,
        flow: HappyAgentCloudProviderAddFlow | undefined,
    ): HappyAgentCloudScope => {
        const { privateAllowed, teamAllowed } = store.getState();
        if (flow && happyAgentCloudProviderAddTeamOnly(flow)) return "team";
        if (to === "team" && teamAllowed) return "team";
        if (!privateAllowed && teamAllowed) return "team";
        return "private";
    };

    /** The flow asked for, where this server offers it. */
    const flowOffered = (flow: HappyAgentCloudProviderAddFlow): HappyAgentCloudProviderAddFlow => {
        const { signIns, teamAllowed } = store.getState();
        if (flow.kind === "chatgpt" && !signIns.has("codex")) return { kind: "choose" };
        if (happyAgentCloudProviderAddTeamOnly(flow) && !teamAllowed)
            return { kind: "apiKey", vendor: "openai" };
        if (flow.kind === "claude" && !flow.setupToken && !signIns.has("claude"))
            return { kind: "claude", setupToken: true };
        return flow;
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
        if (!add || signIn?.cli !== cli) return;
        if (operation === null || operation.status === "cancelled") {
            signIn = undefined;
            addSet(addFresh(add));
            return;
        }
        if (operation.status === "succeeded") {
            signIn = undefined;
            addSet({ ...addFresh(add), phase: "done", done: `${signInWord(cli)} connected` });
            listRead();
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

    const addFailed = (title: string, error: unknown): void => {
        addUpdate({ phase: "idle", error: { title, message: happyAgentUserError(error).message } });
    };

    /** Sends one credential the person typed to where the dialog keeps it. */
    const credentialSubmit = (
        input: {
            readonly vendor: string;
            readonly kind: "api_key" | "aws_keys" | "oauth_token";
        },
        secret: string,
        label: string,
        teamId: string,
        done: string,
        failed: string,
        before?: () => Promise<void>,
    ): void => {
        const add = store.getState().add;
        if (disposed || !add || add.phase === "busy" || secret.trim() === "") return;
        const { error: _cleared, ...rest } = add;
        addSet({ ...rest, phase: "busy" });
        void (before ?? (() => Promise.resolve()))()
            .then(() =>
                deps.api.credentialAdd(add.to === "team" ? teamId : "private", {
                    ...input,
                    secret: secret.trim(),
                    label,
                }),
            )
            .then(
                ({ duplicate }) => {
                    if (disposed || store.getState().add === undefined) return;
                    addUpdate({ phase: "done", done: duplicate ? "Already added" : done });
                    listRead();
                },
                (error: unknown) => {
                    if (!disposed) addFailed(failed, error);
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
        addOpen(options) {
            if (disposed) return;
            signInAbandon();
            const flow = flowOffered(options?.flow ?? { kind: "choose" });
            addSet({ flow, to: destinationOf(options?.to, flow), phase: "idle" });
        },
        addFlowSelect(flow) {
            const add = store.getState().add;
            if (disposed || !add || add.phase === "busy") return;
            signInAbandon();
            const offered = flowOffered(flow);
            addSet({ ...addFresh(add), flow: offered, to: destinationOf(add.to, offered) });
        },
        addBack() {
            actions.addFlowSelect({ kind: "choose" });
        },
        addClose() {
            if (disposed || !store.getState().add) return;
            signInAbandon();
            addSet(undefined);
        },
        addDestinationUpdate(to) {
            const add = store.getState().add;
            if (disposed || !add || add.phase !== "idle") return;
            addUpdate({ to: destinationOf(to, add.flow) });
        },
        apiKeySubmit(secret, region) {
            const flow = store.getState().add?.flow;
            if (flow?.kind !== "apiKey") return;
            const routed = flow.vendor === "bedrock" ? region?.trim() : undefined;
            credentialSubmit(
                { vendor: flow.vendor, kind: "api_key" },
                secret,
                `${KEY_VENDOR_NAMES[flow.vendor]} API key`,
                flow.vendor,
                "API key added",
                "Couldn't add the key",
                routed ? () => deps.api.bedrockRegionSave(routed) : undefined,
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
                "bedrock",
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
                "claude-code",
                "Claude connected",
                "Couldn't add the token",
            );
        },
        signInStart() {
            const add = store.getState().add;
            const cli = add ? signInCliOf(add.flow) : undefined;
            if (disposed || !add || !cli || add.phase === "busy" || add.phase === "waiting") return;
            signInTimerCancel();
            signIn = { cli, mutationId: crypto.randomUUID() };
            const started = signIn;
            const target: HappyAgentCloudTarget =
                add.to === "team"
                    ? { providerId: cli === "codex" ? "codex" : "claude-code" }
                    : { scope: "private" };
            addSet({ ...addFresh(add), phase: "busy" });
            void deps.api.signInStart(cli, target, started.mutationId).then(
                (operation) => {
                    if (!disposed && signIn === started) signInSettle(cli, operation);
                },
                (error: unknown) => {
                    if (disposed || signIn !== started) return;
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
            change(credentialId, () => deps.api.credentialRemove(connectionId, credentialId));
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
    privateAllowed: false,
    teamAllowed: false,
    signIns: NO_SIGN_INS,
    credentialsSaving: NO_SAVING,
};

/** Where there is no Happy Cloud: it lists nothing and never changes. */
export const happyAgentCloudProvidersStoreNoop: HappyAgentCloudProvidersStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    addOpen: () => undefined,
    addFlowSelect: () => undefined,
    addBack: () => undefined,
    addClose: () => undefined,
    addDestinationUpdate: () => undefined,
    apiKeySubmit: () => undefined,
    awsKeysSubmit: () => undefined,
    setupTokenSubmit: () => undefined,
    signInStart: () => undefined,
    signInCodeSubmit: () => undefined,
    credentialEnabledUpdate: () => undefined,
    credentialRemove: () => undefined,
    [Symbol.dispose]: () => undefined,
};
