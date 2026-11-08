import {
    HappyAgentApiError,
    type HappyAgentClient,
    type ProviderCli,
    type ProviderCliSignInRequest,
} from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import { cuid2Create } from "../utils/cuid2Create.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";

/**
 * The coding assistants' own programs on this Happy Agent's machine
 * (`capabilities.providerClis`, API.md "Provider CLIs"): whether each is
 * installed and signed in, and the install or sign-in running for it.
 *
 * Live while watched. The connection's bootstrap, reconciles, and
 * `provider_cli.updated` are delivery hints, each answered by one read of
 * `GET /v0/provider-clis`; every answer keeps, per program, the object with
 * the greater version. A sign-in code goes to its request and nowhere else.
 */
export type HappyAgentProviderClisSnapshot = {
    /**
     * `checking` until the connection has heard the server's health;
     * `unsupported` on a server that does not serve the routes.
     */
    readonly status: "checking" | "unsupported" | "ready";
    readonly clis: ReadonlyMap<string, ProviderCli>;
    /** Programs a request from this window is on its way for. */
    readonly pending: ReadonlySet<string>;
    /** Why the last request for a program was refused, until another is made. */
    readonly errors: ReadonlyMap<string, string>;
};

/**
 * Whose connection a sign-in makes on a team server, as a provider CLI figure's
 * `data-target` names it: the team's, or the caller's own. Absent, the server
 * decides; a team server then signs the caller in privately.
 */
export type HappyAgentProviderCliTarget = "team" | "private";

/**
 * Where a team server keeps a sign-in (API.md "Provider CLIs"): the team's
 * provider by its ID, or the caller's own. Not in the client's request type yet.
 */
type ProviderCliSignInPlace = { readonly providerId: string } | { readonly scope: "private" };

export interface HappyAgentProviderClisStore {
    get(): HappyAgentProviderClisSnapshot;
    subscribe(listener: () => void): () => void;
    /** Runs the vendor's official installer; the server signs in after it on its own. */
    cliInstall(cliId: string): void;
    /**
     * Starts the vendor's sign-in, made where `target` says exactly as the
     * figure carried it. Every caller passes it, so none drops it by omission.
     */
    cliSignIn(cliId: string, target: HappyAgentProviderCliTarget | undefined): void;
    /** Hands a waiting sign-in the code its page showed. The code is not kept. */
    cliSignInCodeSend(cliId: string, code: string): void;
    cliCancel(cliId: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentProviderClisStoreDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "listProviderClis"
        | "installProviderCli"
        | "signInProviderCli"
        | "sendProviderCliSignInCode"
        | "cancelProviderCli"
    >;
    readonly sync: HappyAgentSync;
    /** Opens a vendor's sign-in page in the machine's browser. */
    readonly linkOpen: (url: string) => void;
}

const NO_CLIS: ReadonlyMap<string, ProviderCli> = new Map();
const NO_PENDING: ReadonlySet<string> = new Set();
const NO_ERRORS: ReadonlyMap<string, string> = new Map();
const CHECKING: HappyAgentProviderClisSnapshot = {
    status: "checking",
    clis: NO_CLIS,
    pending: NO_PENDING,
    errors: NO_ERRORS,
};
const CLI_EVENTS = ["provider_cli.updated"] as const;
const RETRY_MS = 4_000;

export function happyAgentProviderClisStoreCreate(
    deps: HappyAgentProviderClisStoreDeps,
): HappyAgentProviderClisStore {
    const store = createStore<HappyAgentProviderClisSnapshot>()(() => CHECKING);
    const listeners = new Set<() => void>();
    const mutationIdNext = cuid2Create(Date.now);
    let disposed = false;
    let follower: AbortController | undefined;
    let reading: AbortController | undefined;
    let readAgain = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /* Sign-ins this window started, whose page it opens unless the program did. */
    const signingIn = new Set<string>();
    const pagesOpened = new Set<string>();

    const set = (next: Partial<HappyAgentProviderClisSnapshot>): void => {
        store.setState({ ...store.getState(), ...next }, true);
    };

    /** Keeps, per program, whichever object is newer, and opens a sign-in page it asked for. */
    const clisTake = (incoming: readonly ProviderCli[]): void => {
        const current = store.getState().clis;
        let clis: Map<string, ProviderCli> | undefined;
        for (const cli of incoming) {
            const held = (clis ?? current).get(cli.id);
            if (held !== undefined && held.version >= cli.version) continue;
            clis ??= new Map(current);
            clis.set(cli.id, cli);
            pageOpenIfAsked(cli);
        }
        if (clis !== undefined || store.getState().status !== "ready")
            set({ status: "ready", ...(clis ? { clis } : {}) });
    };

    const pageOpenIfAsked = (cli: ProviderCli): void => {
        const operation = cli.operation;
        const authorization = operation?.authorization;
        if (
            !signingIn.has(cli.id) ||
            operation?.kind !== "sign_in" ||
            operation.status !== "waiting" ||
            authorization == null ||
            authorization.openedByProgram
        )
            return;
        const key = `${operation.id}:${authorization.url}`;
        if (pagesOpened.has(key)) return;
        pagesOpened.add(key);
        deps.linkOpen(authorization.url);
    };

    const refresh = (): void => {
        if (disposed || listeners.size === 0) return;
        const health = deps.sync.health();
        if (health?.capabilities?.providerClis !== true) {
            set({ status: health === undefined ? "checking" : "unsupported" });
            return;
        }
        if (reading !== undefined) {
            readAgain = true;
            return;
        }
        const controller = new AbortController();
        reading = controller;
        void deps.client
            .listProviderClis({ signal: controller.signal })
            .then(
                ({ providerClis }) => {
                    if (reading === controller) clisTake(providerClis);
                },
                (error: unknown) => {
                    if (disposed || controller.signal.aborted || reading !== controller) return;
                    if (
                        error instanceof HappyAgentApiError &&
                        (error.status === 404 || error.status === 501)
                    ) {
                        set({ status: "unsupported" });
                        return;
                    }
                    if (retry === undefined)
                        retry = setTimeout(() => {
                            retry = undefined;
                            refresh();
                        }, RETRY_MS);
                },
            )
            .finally(() => {
                if (reading !== controller) return;
                reading = undefined;
                if (readAgain) {
                    readAgain = false;
                    refresh();
                }
            });
    };

    /** Sends one request for a program, holding it pending until the server answers. */
    const request = (cliId: string, send: () => Promise<{ providerCli: ProviderCli }>): void => {
        if (disposed || store.getState().pending.has(cliId)) return;
        const errors = new Map(store.getState().errors);
        errors.delete(cliId);
        set({ pending: new Set(store.getState().pending).add(cliId), errors });
        void send()
            .then(
                ({ providerCli }) => clisTake([providerCli]),
                (error: unknown) => {
                    if (disposed) return;
                    set({
                        errors: new Map(store.getState().errors).set(
                            cliId,
                            error instanceof Error ? error.message : String(error),
                        ),
                    });
                },
            )
            .finally(() => {
                if (disposed) return;
                const pending = new Set(store.getState().pending);
                pending.delete(cliId);
                set({ pending });
            });
    };

    const follow = (): void => {
        if (disposed || follower !== undefined || listeners.size === 0) return;
        const active = new AbortController();
        follower = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: CLI_EVENTS,
            })) {
                if (input.kind === "error") continue;
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    input.update.kind === "event" ||
                    input.update.kind === "connected"
                )
                    refresh();
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (follower === active) follower = undefined;
            });
        refresh();
    };

    const stop = (): void => {
        follower?.abort();
        follower = undefined;
        reading?.abort();
        reading = undefined;
        readAgain = false;
        if (retry !== undefined) clearTimeout(retry);
        retry = undefined;
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) follow();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        cliInstall(cliId) {
            // The server starts the sign-in once an install it ran succeeds,
            // and that sign-in's page is this window's to open.
            signingIn.add(cliId);
            const mutationId = mutationIdNext();
            request(cliId, () => deps.client.installProviderCli(cliId, { mutationId }));
        },
        cliSignIn(cliId, target) {
            let place: ProviderCliSignInPlace | undefined;
            if (target === "private") place = { scope: "private" };
            else if (target === "team") {
                const providerId = store.getState().clis.get(cliId)?.providerId;
                // A team sign-in names the team's provider. Without one it is
                // refused here rather than sent to land somewhere else.
                if (providerId == null) {
                    const errors = new Map(store.getState().errors);
                    errors.set(cliId, "This server didn't say which team provider to connect.");
                    set({ errors });
                    return;
                }
                place = { providerId };
            }
            signingIn.add(cliId);
            const mutationId = mutationIdNext();
            const body: ProviderCliSignInRequest & { readonly target?: ProviderCliSignInPlace } = {
                mutationId,
                ...(place === undefined ? {} : { target: place }),
            };
            request(cliId, () => deps.client.signInProviderCli(cliId, body));
        },
        cliSignInCodeSend(cliId, code) {
            const mutationId = mutationIdNext();
            request(cliId, () =>
                deps.client.sendProviderCliSignInCode(cliId, { code, mutationId }),
            );
        },
        cliCancel(cliId) {
            signingIn.delete(cliId);
            const mutationId = mutationIdNext();
            request(cliId, () => deps.client.cancelProviderCli(cliId, { mutationId }));
        },
        [Symbol.dispose]() {
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
