import { Value } from "@sinclair/typebox/value";
import { clusterSecretSchema } from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** What an access check found. `ok` is `null` for SSH, which the first checkout proves. */
export interface HappyAgentRepositoryCheck {
    readonly ok: boolean | null;
    readonly defaultBranch: string | null;
    /** How many branches it has. */
    readonly branches: number | null;
    /** Sentences for a person, shown as they are. */
    readonly error: { readonly code: string; readonly message: string } | null;
    readonly checkedAt: number;
}

export type HappyAgentRepositoryPluginStatus = "active" | "suspended" | "missing";

/** How a plugin's credential signs in to the repository's host. */
export type HappyAgentRepositoryPluginMethod = "github_app" | "token" | "ssh_key" | "password";

/**
 * How everyone reaches a repository. `none` reaches it without a credential, which
 * suits a public one; `credential` pins a team git credential from Settings ›
 * Secrets; `plugin` is a repository a plugin installation added and signs in for,
 * whose credential is never shown or changed here.
 */
export type HappyAgentRepositoryAuthentication =
    | { readonly kind: "none" }
    | { readonly kind: "credential"; readonly credentialId: string }
    | {
          readonly kind: "plugin";
          readonly plugin: { readonly id: string; readonly installationId: string };
          /** `null` for a method this client does not know yet. */
          readonly method: HappyAgentRepositoryPluginMethod | null;
          /** The account it signs in as, such as a GitHub organization. */
          readonly account: string | null;
          /**
           * `suspended` while the service suspended the installation, and `missing`
           * once its credential is gone: removed or disconnected, with no method or
           * account. Git is refused in both.
           */
          readonly status: HappyAgentRepositoryPluginStatus;
      };

/** One of the team's repositories on Happy Cloud. */
export interface HappyAgentRepository {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly host: string;
    /** `owner/name` on the host. */
    readonly path: string;
    readonly transport: "https" | "ssh";
    readonly defaultBranch: string | null;
    readonly authentication: HappyAgentRepositoryAuthentication;
    readonly lastCheck: HappyAgentRepositoryCheck | null;
    /** What a change sends back as `If-Match`. */
    readonly version: string;
}

/** A team `git_credential` secret from Settings › Secrets a repository may be pinned to. Never its value. */
export interface HappyAgentRepositoryCredential {
    readonly id: string;
    readonly name: string;
    /** The git server it signs in to, such as `github.com`. */
    readonly server: string;
}

/** Adding a repository, while its dialog is open. */
export interface HappyAgentRepositoryAdd {
    readonly url: string;
    readonly name: string;
    /** The pinned team secret; `null` reaches the repository without a credential. */
    readonly credentialId: string | null;
    /** The credentials the reader may pin for the URL. */
    readonly credentials: readonly HappyAgentRepositoryCredential[];
    readonly checking: boolean;
    /** What checking the URL as it is now found; cleared when the URL or credential changes. */
    readonly check?: HappyAgentRepositoryCheck;
    readonly submitting: boolean;
    readonly error?: UserError;
}

/** One repository's dialog, while it is open. */
export interface HappyAgentRepositoryOpen {
    readonly repositoryId: string;
    readonly credentials: readonly HappyAgentRepositoryCredential[];
    readonly checking: boolean;
    readonly saving: boolean;
    readonly error?: UserError;
}

export interface HappyAgentRepositoriesSnapshot {
    /** True until the first answer, so "no repositories" is never claimed early. */
    readonly loading: boolean;
    readonly repositories: readonly HappyAgentRepository[];
    /** Whether the reader may add, change and delete repositories. */
    readonly manage: boolean;
    /** Whether the reader may check access and list branches; viewers may not. */
    readonly checkAllowed: boolean;
    /** Each repository's branches, once asked for with `branchesLoad`. */
    readonly branches: ReadonlyMap<string, HappyAgentRepositoryBranches>;
    readonly add?: HappyAgentRepositoryAdd;
    readonly open?: HappyAgentRepositoryOpen;
    readonly error?: UserError;
}

/** A repository's branches, read for picking one to work on. */
export interface HappyAgentRepositoryBranches {
    readonly loading: boolean;
    /** By name, at most 500; empty until read. */
    readonly names: readonly string[];
    readonly error?: UserError;
}

/**
 * Settings › Repositories on Happy Cloud: the team's code sources, which a
 * task's agent attaches to work on. Repository events are not typed by this client
 * yet, so the list is read again every few seconds while it is on screen.
 */
export interface HappyAgentRepositoriesStore {
    get(): HappyAgentRepositoriesSnapshot;
    subscribe(listener: () => void): () => void;
    addOpen(): void;
    addClose(): void;
    addUrlUpdate(url: string): void;
    addNameUpdate(name: string): void;
    addCredentialUpdate(credentialId: string | null): void;
    addCheck(): void;
    addSubmit(): void;
    repositoryOpen(repositoryId: string): void;
    repositoryClose(): void;
    repositoryNameSave(name: string): void;
    repositoryDefaultBranchUpdate(branch: string): void;
    /** Pins a shared credential; does nothing for a repository a plugin manages. */
    repositoryCredentialUpdate(credentialId: string | null): void;
    repositoryCheck(): void;
    /** Deletes the open repository; rejects with the reason to show. */
    repositoryDelete(): Promise<void>;
    /**
     * Reads a repository's branches into `branches`, for its dialog. Read once per repository; a failed read is tried
     * again on the next ask. Viewers may not list branches.
     */
    branchesLoad(repositoryId: string): void;
    [Symbol.dispose](): void;
}

const POLL_INTERVAL_MS = 4_000;
const CREDENTIALS_DELAY_MS = 300;

/**
 * A request that pins a credential is refused with 403 when it is a team
 * secret whose role rules do not let the reader use it.
 */
function credentialRefusal(error: unknown, credentialId: unknown): UserError {
    if (
        typeof credentialId === "string" &&
        error instanceof HappyCloudRequestRefusal &&
        error.status === 403
    )
        return new UserError(
            "Your role can't use this credential. Pick another, or ask whoever manages it in Settings › Secrets to let your role use it.",
            "credential_forbidden",
            error,
        );
    return happyAgentUserError(error);
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function checkRead(value: unknown): HappyAgentRepositoryCheck | null {
    const check = recordOf(value);
    if (!check) return null;
    const error = recordOf(check.error);
    return {
        ok: typeof check.ok === "boolean" ? check.ok : null,
        defaultBranch: stringOrNull(check.defaultBranch),
        branches: typeof check.branches === "number" ? check.branches : null,
        error: error
            ? {
                  code: typeof error.code === "string" ? error.code : "unknown",
                  message: typeof error.message === "string" ? error.message : "",
              }
            : null,
        checkedAt: typeof check.checkedAt === "number" ? check.checkedAt : 0,
    };
}

const PLUGIN_METHODS: ReadonlySet<string> = new Set<HappyAgentRepositoryPluginMethod>([
    "github_app",
    "token",
    "ssh_key",
    "password",
]);

/** Nothing for an `authentication` this client cannot read, which drops its repository. */
function authenticationRead(value: unknown): HappyAgentRepositoryAuthentication | undefined {
    const authentication = recordOf(value);
    switch (authentication?.kind) {
        case "none":
            return { kind: "none" };
        case "credential": {
            const credentialId = stringOrNull(authentication.credentialId);
            return credentialId === null ? undefined : { kind: "credential", credentialId };
        }
        case "plugin": {
            const plugin = recordOf(authentication.plugin);
            if (
                typeof plugin?.id !== "string" ||
                plugin.id === "" ||
                typeof plugin.installationId !== "string"
            )
                return undefined;
            const method = authentication.method;
            const status = authentication.status;
            // A status this client cannot name might refuse git, so it is never read as healthy.
            if (status !== "active" && status !== "suspended" && status !== "missing")
                return undefined;
            return {
                kind: "plugin",
                plugin: { id: plugin.id, installationId: plugin.installationId },
                method:
                    typeof method === "string" && PLUGIN_METHODS.has(method)
                        ? (method as HappyAgentRepositoryPluginMethod)
                        : null,
                account: stringOrNull(authentication.account),
                status,
            };
        }
        default:
            return undefined;
    }
}

function repositoryRead(value: unknown): HappyAgentRepository | undefined {
    const entry = recordOf(value);
    if (!entry || typeof entry.id !== "string" || typeof entry.url !== "string") return undefined;
    const authentication = authenticationRead(entry.authentication);
    if (!authentication) return undefined;
    return {
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : entry.id,
        url: entry.url,
        host: typeof entry.host === "string" ? entry.host : "",
        path: typeof entry.path === "string" ? entry.path : "",
        transport: entry.transport === "ssh" ? "ssh" : "https",
        defaultBranch: stringOrNull(entry.defaultBranch),
        authentication,
        lastCheck: checkRead(entry.lastCheck),
        version: typeof entry.version === "string" ? entry.version : "",
    };
}

/** `GET v0/git/pinnable`: the team's catalog git credentials the reader may pin for a URL. */
function pinnableRead(value: unknown): readonly HappyAgentRepositoryCredential[] {
    const list = recordOf(value)?.credentials;
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
        const entry = recordOf(item);
        const secret: unknown = entry?.secret;
        if (
            typeof entry?.credentialId !== "string" ||
            !Value.Check(clusterSecretSchema, secret) ||
            secret.type !== "git_credential"
        )
            return [];
        return [{ id: entry.credentialId, name: secret.name, server: secret.public.server }];
    });
}

/** How a URL a person typed reaches its repository; `null` until it names a host. */
export function happyAgentRepositoryUrlTransport(url: string): "https" | "ssh" | null {
    const trimmed = url.trim();
    if (/^[^@\s]+@[^:/\s]+:/u.test(trimmed)) return "ssh";
    try {
        const parsed = new URL(trimmed);
        if (parsed.hostname === "") return null;
        return parsed.protocol === "ssh:" ? "ssh" : "https";
    } catch {
        return null;
    }
}

export function happyAgentRepositoriesStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    /** Where `repository.updated` arrives, as a hint to read the list again sooner. */
    readonly sync?: HappyAgentSync;
}): HappyAgentRepositoriesStore {
    const store = createStore<HappyAgentRepositoriesSnapshot>()(() => ({
        loading: true,
        repositories: [],
        manage: false,
        checkAllowed: false,
        branches: new Map(),
    }));
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let readAgain = false;
    let follow: AbortController | undefined;
    /** Counts credential reads so an older URL's answer never lands. */
    let credentialsTicket = 0;
    /** Waits for typing to pause before reading what a URL may pin. */
    let credentialsTimer: ReturnType<typeof setTimeout> | undefined;
    const repo = (id: string): string => `v0/repositories/${encodeURIComponent(id)}`;

    const repositoryOf = (id: string): HappyAgentRepository | undefined =>
        store.getState().repositories.find((repository) => repository.id === id);

    const listAccept = (repositories: readonly HappyAgentRepository[]): void => {
        const current = store.getState();
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                repositories: referencesPreserve(
                    current.repositories,
                    repositories.map((repository) => {
                        const before = current.repositories.find(
                            (candidate) => candidate.id === repository.id,
                        );
                        return before && JSON.stringify(before) === JSON.stringify(repository)
                            ? before
                            : repository;
                    }),
                ),
            },
            true,
        );
    };

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, POLL_INTERVAL_MS);
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        // A change heard during a read may have landed after the server answered it.
        if (reading) {
            readAgain = true;
            return;
        }
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        reading = true;
        void Promise.all([
            deps.request("GET", "v0/repositories"),
            deps.request("GET", "v0/permissions"),
        ]).then(
            ([list, permissions]) => {
                reading = false;
                if (disposed) return;
                const granted = recordOf(permissions)?.granted;
                const has = (permission: string): boolean =>
                    Array.isArray(granted) && granted.includes(permission);
                store.setState(
                    {
                        manage: has("repositories.manage"),
                        checkAllowed: has("content.write"),
                    },
                    false,
                );
                const entries = recordOf(list)?.repositories;
                listAccept(
                    Array.isArray(entries)
                        ? entries.flatMap((entry: unknown) => {
                              const read = repositoryRead(entry);
                              return read ? [read] : [];
                          })
                        : [],
                );
                settled();
            },
            (error: unknown) => {
                reading = false;
                if (disposed) return;
                if (store.getState().loading)
                    store.setState({ loading: false, error: happyAgentUserError(error) }, false);
                settled();
            },
        );
    }

    function settled(): void {
        if (!readAgain) {
            schedule();
            return;
        }
        readAgain = false;
        load();
    }

    /**
     * Reads what a repository URL may be pinned to, for whichever dialog still
     * wants it.
     */
    const credentialsFor = (
        url: string,
        land: (credentials: readonly HappyAgentRepositoryCredential[]) => void,
        delay = 0,
    ): void => {
        const ticket = ++credentialsTicket;
        if (credentialsTimer !== undefined) clearTimeout(credentialsTimer);
        credentialsTimer = undefined;
        if (happyAgentRepositoryUrlTransport(url) === null) {
            land([]);
            return;
        }
        const read = (): void => {
            credentialsTimer = undefined;
            void deps.request("GET", `v0/git/pinnable?url=${encodeURIComponent(url.trim())}`).then(
                (answer) => {
                    if (!disposed && ticket === credentialsTicket) land(pinnableRead(answer));
                },
                () => undefined,
            );
        };
        if (delay === 0) read();
        else credentialsTimer = setTimeout(read, delay);
    };

    const addUpdate = (change: Partial<HappyAgentRepositoryAdd>): void => {
        const add = store.getState().add;
        if (add) store.setState({ add: { ...add, ...change } }, false);
    };
    const openUpdate = (change: Partial<HappyAgentRepositoryOpen>): void => {
        const open = store.getState().open;
        if (open) store.setState({ open: { ...open, ...change } }, false);
    };
    /** The add dialog without its last check and refusal, after the URL or credential changed. */
    const addEdited = (change: Partial<HappyAgentRepositoryAdd>): void => {
        const add = store.getState().add;
        if (!add || add.submitting) return;
        const { check: _check, error: _error, ...rest } = add;
        store.setState({ add: { ...rest, ...change, checking: false } }, false);
    };

    /** Sends one change to the open repository with its version, then reads the list again. */
    const openChange = (body: Record<string, unknown>): void => {
        const open = store.getState().open;
        const repository = open ? repositoryOf(open.repositoryId) : undefined;
        if (disposed || !open || !repository || open.saving) return;
        const { error: _cleared, ...rest } = open;
        store.setState({ open: { ...rest, saving: true } }, false);
        void deps
            .request("PATCH", repo(repository.id), body, { "if-match": repository.version })
            .then(
                (answer) => {
                    if (disposed) return;
                    const read = repositoryRead(recordOf(answer)?.repository);
                    if (read)
                        listAccept(
                            store
                                .getState()
                                .repositories.map((entry) => (entry.id === read.id ? read : entry)),
                        );
                    openUpdate({ saving: false });
                    load();
                },
                (error: unknown) => {
                    if (disposed) return;
                    const refused = credentialRefusal(error, body.credentialId);
                    openUpdate({
                        saving: false,
                        error:
                            refused.code === "stale" || refused.code === "version_mismatch"
                                ? new UserError(
                                      "Someone changed this repository just now. Look again, then retry.",
                                      refused.code,
                                  )
                                : refused,
                    });
                    load();
                },
            );
    };

    /**
     * The event names what changed, such as a pinned secret's deletion setting
     * `authentication` to `none`; it is a hint, and the list read it starts is
     * what the store keeps.
     */
    const followStart = (): void => {
        const sync = deps.sync;
        if (!sync || follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["repository.updated"],
            })) {
                if (input.kind === "update") load();
            }
        })().catch(() => undefined);
    };

    const actions: HappyAgentRepositoriesStore = {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                load();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size > 0) return;
                follow?.abort();
                follow = undefined;
                if (timer !== undefined) clearTimeout(timer);
                timer = undefined;
            };
        },
        addOpen() {
            if (disposed) return;
            store.setState(
                {
                    add: {
                        url: "",
                        name: "",
                        credentialId: null,
                        credentials: [],
                        checking: false,
                        submitting: false,
                    },
                },
                false,
            );
        },
        addClose() {
            const { add, ...rest } = store.getState();
            if (disposed || !add || add.submitting) return;
            store.setState(rest, true);
        },
        addUrlUpdate(url) {
            const add = store.getState().add;
            if (!add) return;
            if (url.trim() === add.url.trim()) {
                addEdited({ url });
                return;
            }
            addEdited({ url });
            // What may be pinned depends on the whole URL, so a pick the new one no longer offers is let go.
            credentialsFor(
                url,
                (credentials) => {
                    const picked = store.getState().add?.credentialId ?? null;
                    addUpdate({
                        credentials,
                        ...(picked !== null && !credentials.some((entry) => entry.id === picked)
                            ? { credentialId: null }
                            : {}),
                    });
                },
                CREDENTIALS_DELAY_MS,
            );
        },
        addNameUpdate(name) {
            addUpdate({ name });
        },
        addCredentialUpdate(credentialId) {
            addEdited({ credentialId });
        },
        addCheck() {
            const add = store.getState().add;
            if (disposed || !add || add.checking || add.url.trim() === "") return;
            const { error: _cleared, check: _check, ...rest } = add;
            store.setState({ add: { ...rest, checking: true } }, false);
            const url = add.url.trim();
            void deps
                .request("POST", "v0/repositories/check", {
                    url,
                    ...(add.credentialId ? { credentialId: add.credentialId } : {}),
                })
                .then(
                    (answer) => {
                        const latest = store.getState().add;
                        if (disposed || latest?.url.trim() !== url) return;
                        const check = checkRead(recordOf(answer)?.check);
                        addUpdate({ checking: false, ...(check ? { check } : {}) });
                    },
                    (error: unknown) => {
                        if (disposed || store.getState().add?.url.trim() !== url) return;
                        addUpdate({
                            checking: false,
                            error: credentialRefusal(error, add.credentialId),
                        });
                    },
                );
        },
        addSubmit() {
            const add = store.getState().add;
            if (disposed || !add || add.submitting || add.url.trim() === "") return;
            const { error: _cleared, ...rest } = add;
            store.setState({ add: { ...rest, submitting: true } }, false);
            const defaultBranch = add.check?.defaultBranch;
            void deps
                .request("POST", "v0/repositories", {
                    url: add.url.trim(),
                    ...(add.name.trim() ? { name: add.name.trim() } : {}),
                    ...(defaultBranch ? { defaultBranch } : {}),
                    ...(add.credentialId ? { credentialId: add.credentialId } : {}),
                    mutationId: crypto.randomUUID(),
                })
                .then(
                    () => {
                        if (disposed) return;
                        const { add: _closed, ...closed } = store.getState();
                        store.setState(closed, true);
                        load();
                    },
                    (error: unknown) => {
                        if (!disposed)
                            addUpdate({
                                submitting: false,
                                error: credentialRefusal(error, add.credentialId),
                            });
                    },
                );
        },
        repositoryOpen(repositoryId) {
            const repository = repositoryOf(repositoryId);
            if (disposed || !repository) return;
            store.setState(
                {
                    open: { repositoryId, credentials: [], checking: false, saving: false },
                },
                false,
            );
            // A plugin signs in for its own repositories, so nothing is offered to pin.
            if (repository.authentication.kind !== "plugin")
                credentialsFor(repository.url, (credentials) => {
                    if (store.getState().open?.repositoryId === repositoryId)
                        openUpdate({ credentials });
                });
            actions.branchesLoad(repositoryId);
        },
        repositoryClose() {
            const { open, ...rest } = store.getState();
            if (disposed || !open || open.saving) return;
            store.setState(rest, true);
        },
        repositoryNameSave(name) {
            if (name.trim() === "") return;
            openChange({ name: name.trim() });
        },
        repositoryDefaultBranchUpdate(branch) {
            openChange({ defaultBranch: branch });
        },
        repositoryCredentialUpdate(credentialId) {
            const open = store.getState().open;
            const repository = open ? repositoryOf(open.repositoryId) : undefined;
            // The server refuses a credential for a repository a plugin manages.
            if (repository?.authentication.kind === "plugin") return;
            openChange({ credentialId });
        },
        repositoryCheck() {
            const open = store.getState().open;
            if (disposed || !open || open.checking) return;
            const repositoryId = open.repositoryId;
            const { error: _cleared, ...rest } = open;
            store.setState({ open: { ...rest, checking: true } }, false);
            void deps.request("POST", `${repo(repositoryId)}/check`, {}).then(
                () => {
                    if (disposed) return;
                    if (store.getState().open?.repositoryId === repositoryId)
                        openUpdate({ checking: false });
                    load();
                },
                (error: unknown) => {
                    if (!disposed && store.getState().open?.repositoryId === repositoryId)
                        openUpdate({ checking: false, error: happyAgentUserError(error) });
                },
            );
        },
        async repositoryDelete() {
            const open = store.getState().open;
            const repository = open ? repositoryOf(open.repositoryId) : undefined;
            if (disposed || !repository) return;
            try {
                await deps.request("DELETE", repo(repository.id), undefined, {
                    "if-match": repository.version,
                });
            } catch (error) {
                throw happyAgentUserError(error);
            }
            if (disposed) return;
            const { open: _closed, ...rest } = store.getState();
            store.setState(
                {
                    ...rest,
                    repositories: rest.repositories.filter((entry) => entry.id !== repository.id),
                },
                true,
            );
            load();
        },
        branchesLoad(repositoryId) {
            const known = store.getState().branches.get(repositoryId);
            if (disposed || known?.loading || (known && !known.error)) return;
            const branchesSet = (entry: HappyAgentRepositoryBranches): void => {
                const branches = new Map(store.getState().branches);
                branches.set(repositoryId, entry);
                store.setState({ branches }, false);
            };
            branchesSet({ loading: true, names: known?.names ?? [] });
            void deps.request("GET", `${repo(repositoryId)}/branches`).then(
                (answer) => {
                    if (disposed) return;
                    const listed = recordOf(answer)?.branches;
                    branchesSet({
                        loading: false,
                        names: Array.isArray(listed)
                            ? listed.flatMap((branch: unknown) => {
                                  const name = recordOf(branch)?.name;
                                  return typeof name === "string" ? [name] : [];
                              })
                            : [],
                    });
                },
                (error: unknown) => {
                    if (!disposed)
                        branchesSet({
                            loading: false,
                            names: [],
                            error: happyAgentUserError(error),
                        });
                },
            );
        },
        [Symbol.dispose]() {
            disposed = true;
            follow?.abort();
            follow = undefined;
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
            if (credentialsTimer !== undefined) clearTimeout(credentialsTimer);
            credentialsTimer = undefined;
        },
    };
    return actions;
}

const INERT_SNAPSHOT: HappyAgentRepositoriesSnapshot = {
    loading: false,
    repositories: [],
    manage: false,
    checkAllowed: false,
    branches: new Map(),
};

/** Where there are no repositories: it lists nothing and never changes. */
export const happyAgentRepositoriesStoreNoop: HappyAgentRepositoriesStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    addOpen: () => undefined,
    addClose: () => undefined,
    addUrlUpdate: () => undefined,
    addNameUpdate: () => undefined,
    addCredentialUpdate: () => undefined,
    addCheck: () => undefined,
    addSubmit: () => undefined,
    repositoryOpen: () => undefined,
    repositoryClose: () => undefined,
    repositoryNameSave: () => undefined,
    repositoryDefaultBranchUpdate: () => undefined,
    repositoryCredentialUpdate: () => undefined,
    repositoryCheck: () => undefined,
    repositoryDelete: () => Promise.resolve(),
    branchesLoad: () => undefined,
    [Symbol.dispose]: () => undefined,
};
