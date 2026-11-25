import { createStore } from "zustand/vanilla";
import type { HappyAgentClient } from "@slopus/happy-agent-client";
import { happyAgentHealthCapability } from "../happyAgentConnection/happyAgentHealthCapability.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { UserError } from "../types.js";
import {
    HAPPY_AGENT_PROVIDER_SIGN_IN_EVENT,
    happyAgentProviderAccountsProject,
    happyAgentProviderSignInOfRefusal,
    happyAgentProviderSignInRead,
    type HappyAgentProviderAccountCredential,
    type HappyAgentProviderSignIn,
    type HappyAgentProviderSignInApi,
    type HappyAgentProviderSignInCli,
    type HappyAgentProviderSignInMethod,
    type HappyAgentProviderSignInOperation,
} from "./happyAgentProviderSignIn.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/** A request this window sent for one account that the daemon has not answered yet. */
export type HappyAgentProviderSignInRequest = "start" | "code" | "cancel";

/** One account that can sign in to a credential this installation owns. */
export interface HappyAgentProviderSignInAccount {
    readonly providerId: string;
    readonly cli: HappyAgentProviderSignInCli;
    readonly credential: HappyAgentProviderAccountCredential;
    /**
     * The methods this window offers, in the daemon's order. A Codex or Grok
     * `browser` sign-in finishes on a page served on the daemon's machine, so
     * it is offered only when that machine is this computer.
     */
    readonly methods: readonly HappyAgentProviderSignInMethod[];
    /** Whether the vendor's program is installed there; null until the daemon has said. */
    readonly installed: boolean | null;
    /** The installation's own sign-in, when the vendor's program reveals it. */
    readonly account: { readonly email: string | null; readonly plan: string | null } | null;
    readonly operation: HappyAgentProviderSignInOperation | null;
    /**
     * The operation ended while this surface was watching it, so its outcome
     * is news. A result left from before, such as one a restart interrupted,
     * is not shown again.
     */
    readonly outcomeShown: boolean;
    readonly request?: HappyAgentProviderSignInRequest;
    /** Why the last request was refused. Cleared by the next one. */
    readonly error?: UserError;
}

/** The Claude setup token being pasted for one account, while its dialog is open. */
export interface HappyAgentProviderTokenEditor {
    readonly providerId: string;
    readonly saving: boolean;
    /** Why the token was refused. Cleared by the next attempt. */
    readonly error?: UserError;
}

export interface HappyAgentProviderSignInSnapshot {
    /** Every account that can sign in, by provider ID. Empty on a daemon without provider sign-in. */
    readonly accounts: ReadonlyMap<string, HappyAgentProviderSignInAccount>;
    /** True until the first answer arrives. */
    readonly loading: boolean;
    /**
     * The daemon refused a change because only the team owner may make it.
     * Everyone may still read where each account stands.
     */
    readonly forbidden: boolean;
    /** The account whose sign-in dialog is open. */
    readonly signInDialog?: { readonly providerId: string };
    readonly tokenEditor?: HappyAgentProviderTokenEditor;
}

/**
 * Settings › Inference's account sign-ins: where each Codex, Claude, and Grok
 * account's credential comes from, and signing one in to a credential only
 * this installation uses, which takes it off the machine's own vendor login.
 *
 * Subscribing reads the configuration and each account's sign-in once, then
 * follows `provider_sign_in.updated`, whose complete object replaces the held
 * one when its version is greater, and `config.updated`. Every action asks the
 * daemon and shows only what it answers; nothing here claims a sign-in
 * succeeded. Codes and tokens pass straight to the daemon and are never kept.
 */
export interface HappyAgentProviderSignInStore {
    get(): HappyAgentProviderSignInSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Opens the account's sign-in dialog and starts its sign-in, by `method` or
     * the first one offered. A sign-in already running by another method is
     * cancelled first; one by the same method is joined.
     */
    signInStart(providerId: string, method?: HappyAgentProviderSignInMethod): void;
    /** Opens the dialog of a sign-in already running, from here or another window. */
    signInDialogOpen(providerId: string): void;
    /** Closes the sign-in dialog, cancelling a sign-in still running in it. */
    signInDialogClose(): void;
    /** Hands the code the vendor's page showed to the waiting sign-in. */
    signInCodeSubmit(providerId: string, code: string): void;
    signInCancel(providerId: string): void;
    /** Opens the dialog that pastes a Claude setup token for one account. */
    tokenEditorOpen(providerId: string): void;
    tokenEditorClose(): void;
    /** Saves the pasted token; the dialog closes once the daemon accepts it. */
    tokenSave(token: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentProviderSignInStoreDeps {
    readonly client: Pick<HappyAgentClient, "getConfig">;
    readonly api: HappyAgentProviderSignInApi;
    readonly sync: HappyAgentSync;
    /** Whether the daemon runs on this computer, where a Codex or Grok browser sign-in can finish. */
    readonly daemonLocal: boolean;
}

const EMPTY: HappyAgentProviderSignInSnapshot = {
    accounts: new Map(),
    loading: true,
    forbidden: false,
};

function terminal(operation: HappyAgentProviderSignInOperation | null): boolean {
    return operation !== null && operation.status !== "running" && operation.status !== "waiting";
}

export function happyAgentProviderSignInStoreCreate(
    deps: HappyAgentProviderSignInStoreDeps,
): HappyAgentProviderSignInStore {
    const store = createStore<HappyAgentProviderSignInSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    /** The last sign-in object the daemon gave for each account. */
    const objects = new Map<string, HappyAgentProviderSignIn>();
    /** Operations seen running or waiting while the surface was watched. */
    const watched = new Set<string>();
    let disposed = false;
    let controller: AbortController | undefined;

    const methodsOffered = (
        cli: HappyAgentProviderSignInCli,
        methods: readonly HappyAgentProviderSignInMethod[],
    ): readonly HappyAgentProviderSignInMethod[] =>
        cli === "claude" || deps.daemonLocal
            ? methods
            : methods.filter((method) => method !== "browser");

    const accountUpdate = (
        providerId: string,
        change: (
            account: HappyAgentProviderSignInAccount,
        ) => HappyAgentProviderSignInAccount | undefined,
    ): void => {
        const current = store.getState();
        const account = current.accounts.get(providerId);
        if (disposed || !account) return;
        const next = change(account);
        if (next === account) return;
        const accounts = new Map(current.accounts);
        if (next) accounts.set(providerId, next);
        else accounts.delete(providerId);
        store.setState({ accounts }, false);
    };

    const errorless = (
        account: HappyAgentProviderSignInAccount,
        request?: HappyAgentProviderSignInRequest,
    ): HappyAgentProviderSignInAccount => {
        const { error: _error, request: _request, ...rest } = account;
        return request ? { ...rest, request } : rest;
    };

    /** Takes a sign-in object the daemon gave, unless a newer one is already held. */
    const objectApply = (signIn: HappyAgentProviderSignIn): void => {
        if (disposed) return;
        const held = objects.get(signIn.providerId);
        if (held && held.version >= signIn.version) return;
        objects.set(signIn.providerId, signIn);
        const operation = signIn.operation;
        if (operation && !terminal(operation) && listeners.size > 0) watched.add(operation.id);
        const current = store.getState();
        const previous = current.accounts.get(signIn.providerId);
        const accounts = new Map(current.accounts);
        accounts.set(signIn.providerId, {
            ...previous,
            providerId: signIn.providerId,
            cli: signIn.cliId,
            credential: signIn.credential,
            methods: methodsOffered(signIn.cliId, signIn.credential.methods),
            installed: signIn.installed,
            account: signIn.account,
            operation,
            outcomeShown:
                operation !== null &&
                terminal(operation) &&
                operation.status !== "cancelled" &&
                watched.has(operation.id),
        });
        store.setState({ accounts }, false);
    };

    const signInRead = (providerId: string, signal: AbortSignal): void => {
        void deps.api.signInRead(providerId).then(
            (signIn) => {
                if (!signal.aborted) objectApply(signIn);
            },
            // The account still shows its credential from the configuration;
            // the next event or reconnect reads it again.
            () => undefined,
        );
    };

    /**
     * Reads which accounts can sign in. The configuration's `credential` is as
     * current as any sign-in object, so it replaces the held one; each account
     * not read before has its sign-in read too, and `all` reads every one.
     */
    const configRead = (signal: AbortSignal, all: boolean): void => {
        if (!happyAgentHealthCapability(deps.sync.health(), "providerSignIn")) {
            if (store.getState().loading) store.setState({ loading: false }, false);
            return;
        }
        void deps.client.getConfig({ signal }).then(
            (response) => {
                if (disposed || signal.aborted) return;
                const projected = happyAgentProviderAccountsProject(response.config);
                const current = store.getState();
                const accounts = new Map<string, HappyAgentProviderSignInAccount>();
                for (const [providerId, { cli, credential }] of projected) {
                    const held = current.accounts.get(providerId);
                    accounts.set(providerId, {
                        ...(held ?? {
                            installed: null,
                            account: null,
                            operation: null,
                            outcomeShown: false,
                        }),
                        providerId,
                        cli,
                        credential,
                        methods: methodsOffered(cli, credential.methods),
                    });
                }
                for (const providerId of objects.keys())
                    if (!projected.has(providerId)) objects.delete(providerId);
                store.setState({ accounts, loading: false }, false);
                for (const providerId of projected.keys())
                    if (all || !objects.has(providerId)) signInRead(providerId, signal);
            },
            () => {
                if (disposed || signal.aborted) return;
                if (store.getState().loading) store.setState({ loading: false }, false);
            },
        );
    };

    const follow = async (signal: AbortSignal): Promise<void> => {
        /** The feed broke since the last read, so changes may have been missed. */
        let dropped = false;
        for await (const input of deps.sync.follow({
            signal,
            events: ["config.updated", HAPPY_AGENT_PROVIDER_SIGN_IN_EVENT],
        })) {
            if (input.kind === "error") {
                dropped = true;
                continue;
            }
            if (input.kind === "bootstrap" || input.kind === "reconcile") {
                dropped = false;
                configRead(signal, true);
                continue;
            }
            const update = input.update;
            if (update.kind === "disconnected" || update.kind === "state_lost") dropped = true;
            else if (update.kind === "connected") {
                if (dropped) configRead(signal, true);
                dropped = false;
            } else if (update.kind === "event") {
                // The published client does not name this event yet; its payload is read here.
                const event = update.event as { readonly type: string; readonly payload: unknown };
                if (event.type === HAPPY_AGENT_PROVIDER_SIGN_IN_EVENT) {
                    const payload = event.payload as { readonly providerSignIn?: unknown } | null;
                    const signIn = happyAgentProviderSignInRead(payload?.providerSignIn);
                    if (signIn) objectApply(signIn);
                } else if (event.type === "config.updated") configRead(signal, false);
            }
        }
    };

    /** Records a refusal: the owner-only gate for the whole surface, anything else on the account. */
    const refused = (providerId: string, error: unknown): UserError => {
        const signIn = happyAgentProviderSignInOfRefusal(error);
        if (signIn) objectApply(signIn);
        const reason = happyAgentUserError(error);
        if (reason.code === "forbidden" && !store.getState().forbidden)
            store.setState({ forbidden: true }, false);
        accountUpdate(providerId, (account) => ({ ...errorless(account), error: reason }));
        return reason;
    };

    const request = (
        providerId: string,
        kind: HappyAgentProviderSignInRequest,
        send: () => Promise<HappyAgentProviderSignIn>,
    ): Promise<boolean> => {
        const account = store.getState().accounts.get(providerId);
        if (disposed || !account || account.request) return Promise.resolve(false);
        accountUpdate(providerId, (current) => errorless(current, kind));
        return send().then(
            (signIn) => {
                if (disposed) return false;
                accountUpdate(providerId, (current) => errorless(current));
                objectApply(signIn);
                return true;
            },
            (error: unknown) => {
                if (!disposed) refused(providerId, error);
                return false;
            },
        );
    };

    const dialogOpenFor = (providerId: string): boolean =>
        store.getState().signInDialog?.providerId === providerId;

    const cancel = (providerId: string): Promise<boolean> =>
        request(providerId, "cancel", () => deps.api.signInCancel(providerId, crypto.randomUUID()));

    const signInStart = (providerId: string, method?: HappyAgentProviderSignInMethod): void => {
        const account = store.getState().accounts.get(providerId);
        if (disposed || !account) return;
        const chosen = method ?? account.methods[0];
        if (chosen === undefined || !account.methods.includes(chosen)) return;
        if (!dialogOpenFor(providerId)) store.setState({ signInDialog: { providerId } }, false);
        const running =
            account.operation && !terminal(account.operation) ? account.operation : null;
        const start = (): void => {
            void request(providerId, "start", () =>
                deps.api.signInStart(providerId, chosen, crypto.randomUUID()),
            ).then((started) => {
                // Closed while the start was on its way: nobody is left to finish it.
                if (started && !dialogOpenFor(providerId)) void cancel(providerId);
            });
        };
        // Starting while one runs joins it, so another method needs the running one stopped.
        const runningMethod = running?.authorization?.method;
        if (
            running &&
            runningMethod !== undefined &&
            runningMethod !== null &&
            runningMethod !== chosen
        ) {
            void cancel(providerId).then((cancelled) => {
                if (cancelled) start();
            });
            return;
        }
        start();
    };

    const tokenEditorUpdate = (
        providerId: string,
        change: Partial<Omit<HappyAgentProviderTokenEditor, "providerId">> | undefined,
    ): void => {
        const current = store.getState();
        if (disposed || current.tokenEditor?.providerId !== providerId) return;
        const { tokenEditor, ...rest } = current;
        if (!change) {
            store.setState(rest, true);
            return;
        }
        const { error: _error, ...editor } = tokenEditor;
        store.setState({ ...rest, tokenEditor: { ...editor, ...change } }, true);
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                const current = new AbortController();
                controller = current;
                void follow(current.signal).catch(() => undefined);
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size !== 0) return;
                controller?.abort();
                controller = undefined;
                // An outcome is news only to the visit that watched it happen.
                watched.clear();
            };
        },
        signInStart,
        signInCodeSubmit(providerId, code) {
            const trimmed = code.trim();
            if (!trimmed) return;
            void request(providerId, "code", () =>
                deps.api.signInCodeSubmit(providerId, trimmed, crypto.randomUUID()),
            );
        },
        signInCancel(providerId) {
            void cancel(providerId);
        },
        signInDialogOpen(providerId) {
            if (disposed || !store.getState().accounts.has(providerId)) return;
            store.setState({ signInDialog: { providerId } }, false);
        },
        signInDialogClose() {
            const providerId = store.getState().signInDialog?.providerId;
            if (disposed || providerId === undefined) return;
            const { signInDialog: _closed, ...rest } = store.getState();
            store.setState(rest, true);
            const account = rest.accounts.get(providerId);
            // A start still on its way cancels itself once it lands.
            if (account?.operation && account.request === undefined && !terminal(account.operation))
                void cancel(providerId);
            // What the dialog showed was seen; the next opening starts clean.
            accountUpdate(providerId, (current) =>
                current.error || current.outcomeShown
                    ? { ...errorless(current, current.request), outcomeShown: false }
                    : current,
            );
        },
        tokenEditorOpen(providerId) {
            const account = store.getState().accounts.get(providerId);
            if (disposed || !account?.credential.acceptsToken) return;
            store.setState({ tokenEditor: { providerId, saving: false } }, false);
        },
        tokenEditorClose() {
            const editor = store.getState().tokenEditor;
            if (disposed || !editor || editor.saving) return;
            tokenEditorUpdate(editor.providerId, undefined);
        },
        tokenSave(token) {
            const editor = store.getState().tokenEditor;
            const normalized = token.replace(/[\s\p{White_Space}]/gu, "");
            if (disposed || !editor || editor.saving || !normalized) return;
            const providerId = editor.providerId;
            tokenEditorUpdate(providerId, { saving: true });
            void deps.api.tokenSave(providerId, normalized, crypto.randomUUID()).then(
                (signIn) => {
                    if (disposed) return;
                    objectApply(signIn);
                    tokenEditorUpdate(providerId, undefined);
                },
                (error: unknown) => {
                    if (disposed) return;
                    const reason = happyAgentUserError(error);
                    if (reason.code === "forbidden" && !store.getState().forbidden)
                        store.setState({ forbidden: true }, false);
                    tokenEditorUpdate(providerId, { saving: false, error: reason });
                },
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            controller?.abort();
            controller = undefined;
            listeners.clear();
            objects.clear();
            watched.clear();
        },
    };
}

const INERT_SNAPSHOT: HappyAgentProviderSignInSnapshot = {
    accounts: new Map(),
    loading: false,
    forbidden: false,
};

/**
 * The sign-ins of a Happy Agent that has none to offer: one this window cannot
 * reach, or a daemon without provider sign-in. Permanently empty, so its
 * accounts show nothing new.
 */
export const happyAgentProviderSignInStoreNoop: HappyAgentProviderSignInStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    signInStart: () => undefined,
    signInCodeSubmit: () => undefined,
    signInCancel: () => undefined,
    signInDialogOpen: () => undefined,
    signInDialogClose: () => undefined,
    tokenEditorOpen: () => undefined,
    tokenEditorClose: () => undefined,
    tokenSave: () => undefined,
    [Symbol.dispose]: () => undefined,
};
