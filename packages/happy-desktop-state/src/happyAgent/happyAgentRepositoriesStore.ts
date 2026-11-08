import { createStore } from "zustand/vanilla";
import { UserError } from "../types.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
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
    /** The shared git credential everyone reaches it with; `null` picks one per person. */
    readonly credentialId: string | null;
    readonly lastCheck: HappyAgentRepositoryCheck | null;
    /** What a change sends back as `If-Match`. */
    readonly version: string;
}

/** A shared git credential a repository may be pinned to. Never its value. */
export interface HappyAgentGitCredential {
    readonly id: string;
    readonly name: string;
    readonly hosts: readonly string[];
}

/** Adding a repository, while its dialog is open. */
export interface HappyAgentRepositoryAdd {
    readonly url: string;
    readonly name: string;
    readonly credentialId: string | null;
    /** The shared credentials for the URL's host. */
    readonly credentials: readonly HappyAgentGitCredential[];
    readonly checking: boolean;
    /** What checking the URL as it is now found; cleared when the URL or credential changes. */
    readonly check?: HappyAgentRepositoryCheck;
    readonly submitting: boolean;
    readonly error?: UserError;
}

/** One repository's dialog, while it is open. */
export interface HappyAgentRepositoryOpen {
    readonly repositoryId: string;
    readonly credentials: readonly HappyAgentGitCredential[];
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
 * task or subtask starts in. Repository events are not typed by this client
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
    repositoryCredentialUpdate(credentialId: string | null): void;
    repositoryCheck(): void;
    /** Deletes the open repository; rejects with the reason to show. */
    repositoryDelete(): Promise<void>;
    /**
     * Reads a repository's branches into `branches`, for its dialog or for
     * starting work in one. Read once per repository; a failed read is tried
     * again on the next ask. Viewers may not list branches.
     */
    branchesLoad(repositoryId: string): void;
    [Symbol.dispose](): void;
}

const POLL_INTERVAL_MS = 4_000;

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

function repositoryRead(value: unknown): HappyAgentRepository | undefined {
    const entry = recordOf(value);
    if (!entry || typeof entry.id !== "string" || typeof entry.url !== "string") return undefined;
    return {
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : entry.id,
        url: entry.url,
        host: typeof entry.host === "string" ? entry.host : "",
        path: typeof entry.path === "string" ? entry.path : "",
        transport: entry.transport === "ssh" ? "ssh" : "https",
        defaultBranch: stringOrNull(entry.defaultBranch),
        credentialId: stringOrNull(entry.credentialId),
        lastCheck: checkRead(entry.lastCheck),
        version: typeof entry.version === "string" ? entry.version : "",
    };
}

function credentialsRead(value: unknown): readonly HappyAgentGitCredential[] {
    const list = recordOf(value)?.credentials;
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
        const entry = recordOf(item);
        if (!entry || typeof entry.id !== "string") return [];
        return [
            {
                id: entry.id,
                name: typeof entry.name === "string" ? entry.name : entry.id,
                hosts: Array.isArray(entry.hosts)
                    ? entry.hosts.filter((host): host is string => typeof host === "string")
                    : [],
            },
        ];
    });
}

/** The host a repository URL names, for its credential picker; nothing until it parses. */
function hostOf(url: string): string | undefined {
    const trimmed = url.trim();
    const scp = /^[^@\s]+@([^:/\s]+):/u.exec(trimmed);
    if (scp) return scp[1];
    try {
        return new URL(trimmed).hostname || undefined;
    } catch {
        return undefined;
    }
}

export function happyAgentRepositoriesStoreCreate(deps: {
    readonly request: HappyCloudRequest;
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
    /** Counts credential reads so an older host's answer never lands. */
    let credentialsTicket = 0;
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
        if (disposed || listeners.size === 0 || reading) return;
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
                schedule();
            },
            (error: unknown) => {
                reading = false;
                if (disposed) return;
                if (store.getState().loading)
                    store.setState({ loading: false, error: happyAgentUserError(error) }, false);
                schedule();
            },
        );
    }

    /** Reads the shared credentials for a host, for whichever dialog still wants them. */
    const credentialsFor = (
        host: string | undefined,
        land: (credentials: readonly HappyAgentGitCredential[]) => void,
    ): void => {
        const ticket = ++credentialsTicket;
        if (host === undefined) {
            land([]);
            return;
        }
        void deps
            .request("GET", `v0/git/credentials?host=${encodeURIComponent(host)}&shared=true`)
            .then(
                (answer) => {
                    if (!disposed && ticket === credentialsTicket) land(credentialsRead(answer));
                },
                () => undefined,
            );
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
                    const refused = happyAgentUserError(error);
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

    const actions: HappyAgentRepositoriesStore = {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) load();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0 && timer !== undefined) {
                    clearTimeout(timer);
                    timer = undefined;
                }
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
            const host = hostOf(url);
            const changedHost = host !== hostOf(add.url);
            addEdited({ url, ...(changedHost ? { credentialId: null, credentials: [] } : {}) });
            if (changedHost) credentialsFor(host, (credentials) => addUpdate({ credentials }));
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
                        addUpdate({ checking: false, error: happyAgentUserError(error) });
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
                            addUpdate({ submitting: false, error: happyAgentUserError(error) });
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
            credentialsFor(repository.host || undefined, (credentials) => {
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
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
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
