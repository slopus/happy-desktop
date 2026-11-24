import { Value } from "@sinclair/typebox/value";
import {
    clusterSecretSchema,
    HappyAgentApiError,
    type ClusterEndpointPublic,
    type ClusterEnvironmentPublic,
    type ClusterGitCredentialPublic,
    type ClusterSecret,
    type ClusterSecretAccess,
    type ClusterSecretMaterial,
    type ClusterSecretUse,
    type ClusterSshKeyPublic,
    type CreateClusterSecretRequest,
    type HappyAgentClient,
    type UpdateClusterSecretRequest,
} from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/**
 * Who a person may create a secret for: `me` is the reader's own secret,
 * which nobody else sees; `team` is the organization's.
 */
export type HappyAgentClusterSecretOwner = "me" | "team";

/**
 * How a secret reaches agents: `team` through each grant, `global` to every
 * agent in the team with no grant, and `agent` to the one agent that owns it
 * and the subagents it shares it with.
 */
export type HappyAgentClusterSecretScope = "global" | "team" | "agent";

/** The scopes a person may create a secret in; agents alone create `agent` ones. */
export type HappyAgentClusterSecretCreateScope = Exclude<HappyAgentClusterSecretScope, "agent">;

/**
 * The secret fields scopes and expiry add to the cluster's wire contract,
 * which `@slopus/happy-agent-client` does not carry yet; checked here until it
 * does. A cluster from before scopes sends none of them, and its secrets mean
 * what they meant then: team scope, no expiry, deleted by whoever manages.
 */
interface ClusterSecretScopeFields {
    readonly scope?: HappyAgentClusterSecretScope;
    readonly owner: HappyAgentClusterSecretOwner | "agent";
    readonly ownerAgentId?: string | null;
    readonly sharedWithAgentIds?: readonly string[];
    /** Epoch milliseconds on the cluster's clock. */
    readonly expiresAt?: number | null;
    /** How far an expiring agent secret may still be extended, on the cluster's clock. */
    readonly maxExpiresAt?: number | null;
    readonly access: { readonly delete?: boolean };
}

function fieldOf(value: object, key: string): unknown {
    return (value as Record<string, unknown>)[key];
}

function optionalOf(value: unknown, check: (present: unknown) => boolean): boolean {
    return value === undefined || check(value);
}

const isNumberOrNull = (value: unknown) => value === null || typeof value === "number";

function isClusterSecretScopeFields(value: object): value is ClusterSecretScopeFields {
    const access = fieldOf(value, "access");
    return (
        optionalOf(fieldOf(value, "scope"), (scope) =>
            ["global", "team", "agent"].includes(scope as string),
        ) &&
        ["me", "team", "agent"].includes(fieldOf(value, "owner") as string) &&
        optionalOf(fieldOf(value, "ownerAgentId"), (id) => id === null || typeof id === "string") &&
        optionalOf(
            fieldOf(value, "sharedWithAgentIds"),
            (ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string"),
        ) &&
        optionalOf(fieldOf(value, "expiresAt"), isNumberOrNull) &&
        optionalOf(fieldOf(value, "maxExpiresAt"), isNumberOrNull) &&
        typeof access === "object" &&
        access !== null &&
        optionalOf(fieldOf(access, "delete"), (remove) => typeof remove === "boolean")
    );
}

/** The cluster's own clock beside a list read, in epoch milliseconds, when it sends one. */
function serverTimeOf(page: object): number | undefined {
    const serverTime = fieldOf(page, "serverTime");
    return typeof serverTime === "number" ? serverTime : undefined;
}

/** What the reader may do with a secret; `delete` alone is all a person has over an agent's. */
export type HappyAgentClusterSecretAccess = ClusterSecretAccess & { readonly delete: boolean };

interface HappyAgentClusterSecretFields {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly scope: HappyAgentClusterSecretScope;
    /** `agent` exactly when the scope is `agent`; a global secret is always the team's. */
    readonly owner: HappyAgentClusterSecretOwner | "agent";
    /** The agent that owns an `agent` secret; `null` for every other scope. */
    readonly ownerAgentId: string | null;
    /** The subagents an `agent` secret is shared with; empty for every other scope. */
    readonly sharedWithAgentIds: readonly string[];
    /** When the cluster deletes it, in epoch milliseconds on the cluster's clock; `null` keeps it. */
    readonly expiresAt: number | null;
    /** The latest an expiring `agent` secret may be extended to, on the cluster's clock. */
    readonly maxExpiresAt: number | null;
    /** What the reader may do with it. */
    readonly access: HappyAgentClusterSecretAccess;
    readonly uses: readonly ClusterSecretUse[];
    /** Sent as `If-Match` by every change. */
    readonly version: string;
    readonly createdAt: number;
    readonly updatedAt: number;
}

/**
 * A git credential's public data. A git credential reads and writes; the
 * protocol package still names a `sign` operation the server no longer has.
 */
export type HappyAgentClusterGitCredentialPublic = Omit<
    ClusterGitCredentialPublic,
    "operations"
> & {
    readonly operations: readonly ("read" | "write")[];
};

/** One catalog secret as metadata. Its value is write-only and never enters this shape. */
export type HappyAgentClusterSecret = HappyAgentClusterSecretFields &
    (
        | { readonly type: "endpoint"; readonly public: ClusterEndpointPublic }
        | { readonly type: "ssh_key"; readonly public: ClusterSshKeyPublic }
        | { readonly type: "git_credential"; readonly public: HappyAgentClusterGitCredentialPublic }
        | { readonly type: "environment"; readonly public: ClusterEnvironmentPublic }
    );

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * A new secret with its write-only material. Role rules are not edited here
 * yet. `scope` defaults to `team`; `expiresIn`, in seconds from when the
 * cluster stores it, is measured on the cluster's clock and so needs no
 * correction for this one's.
 */
export type HappyAgentClusterSecretCreateInput = DistributiveOmit<
    CreateClusterSecretRequest,
    "mutationId" | "roles"
> & {
    readonly scope?: HappyAgentClusterSecretCreateScope;
    readonly expiresIn?: number;
};

/** What an edit changes; an omitted field stays as it is. Material replaces the whole value. */
export interface HappyAgentClusterSecretUpdateInput {
    readonly name?: string;
    readonly description?: string;
    readonly material?: ClusterSecretMaterial;
}

export interface HappyAgentClusterSecretsSnapshot {
    /** True until the cluster first answers, so "no secrets" is never claimed early. */
    readonly loading: boolean;
    /** Why the first read failed. A later successful read clears it. */
    readonly error?: UserError;
    readonly secrets: readonly HappyAgentClusterSecret[];
    /** The owners the reader's role may create a secret for; empty when it may create none. */
    readonly owners: readonly HappyAgentClusterSecretOwner[];
    /**
     * How far the cluster's clock is ahead of this one, in milliseconds, as of
     * the last read: a secret expires at `expiresAt - serverClockOffset` here.
     */
    readonly serverClockOffset: number;
}

/** Settings › Secrets on Happy Cloud: the organization's typed secret catalog. */
export interface HappyAgentClusterSecretsStore {
    get(): HappyAgentClusterSecretsSnapshot;
    subscribe(listener: () => void): () => void;
    /** Creates one secret and rejects with a displayable refusal. */
    secretCreate(input: HappyAgentClusterSecretCreateInput): Promise<void>;
    /**
     * Changes one secret at `version`, the one the person's form was opened
     * at. When someone changed it since, the current secret replaces the stale
     * one and the promise rejects, so the person sees what changed first.
     */
    secretUpdate(
        secretId: string,
        version: string,
        input: HappyAgentClusterSecretUpdateInput,
    ): Promise<void>;
    /**
     * Deletes one secret at `version`; one already gone counts as deleted. An
     * agent's secret, which a person never manages, is deleted at whatever
     * version it is.
     */
    secretDelete(secretId: string, version: string): Promise<void>;
    [Symbol.dispose](): void;
}

export interface HappyAgentClusterSecretsStoreDeps {
    readonly client: Pick<
        HappyAgentClient,
        "createClusterSecret" | "deleteClusterSecret" | "listClusterSecrets" | "updateClusterSecret"
    >;
    /** The cluster's own routes, for the reader's role permissions. */
    readonly request: HappyCloudRequest;
    /** The connection's events; each cluster secret event reads the list again. */
    readonly sync?: HappyAgentSync;
    /** This machine's clock, for the cluster's clock offset and expiry reads. */
    readonly now?: () => number;
}

const EMPTY: HappyAgentClusterSecretsSnapshot = {
    loading: true,
    secrets: [],
    owners: [],
    serverClockOffset: 0,
};
/**
 * How long after a secret's expiry, on the cluster's clock, the list is read
 * again. The cluster stops listing it at that instant, so the read that
 * removes the row lands a moment after the countdown reaches zero.
 */
const EXPIRY_READ_DELAY_MS = 250;
/**
 * A watched list is also read again this often: the reader's role, which says
 * what they may create, has no event, and a secret the role newly reveals or
 * hides announces nothing to this reader.
 */
const POLL_INTERVAL_MS = 4_000;
/**
 * The events that change what the list shows. Each is a hint answered by one
 * read; `cluster_secret.removed` is also how a secret that expired leaves.
 */
const CLUSTER_SECRET_EVENTS = [
    "cluster_secret.created",
    "cluster_secret.updated",
    "cluster_secret.attached",
    "cluster_secret.detached",
    "cluster_secret.removed",
    "cluster_secrets.changed",
] as const;
const PAGE_SIZE = 100;
const CONFLICT_MESSAGE =
    "Someone changed this secret while you were editing it. Its current details are shown now; save again to replace them.";

/**
 * The cluster's typed secret catalog.
 *
 * Read while watched, on every cluster secret event, every few seconds, and
 * after each change this store makes. Values travel only in the outgoing create and update bodies;
 * the store keeps the cluster's metadata answer and nothing the caller typed.
 */
export function happyAgentClusterSecretsStoreCreate(
    deps: HappyAgentClusterSecretsStoreDeps,
): HappyAgentClusterSecretsStore {
    const store = createStore<HappyAgentClusterSecretsSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    const mutations = new Set<AbortController>();
    let disposed = false;
    let reading: AbortController | undefined;
    let readAgain = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let follower: AbortController | undefined;
    /** Counts settled changes, so a read that started before one is not trusted after it. */
    let writes = 0;

    const timerCancel = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
    };

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, POLL_INTERVAL_MS);
    };

    const secretsSet = (next: readonly HappyAgentClusterSecret[]): void => {
        const current = store.getState();
        const secrets = referencesPreserve(current.secrets, next);
        if (secrets !== current.secrets) store.setState({ secrets }, false);
    };

    const secretAdopt = (secret: HappyAgentClusterSecret): void => {
        const current = store.getState().secrets;
        secretsSet(
            current.some((existing) => existing.id === secret.id)
                ? current.map((existing) => (existing.id === secret.id ? secret : existing))
                : [secret, ...current],
        );
    };

    const secretForget = (secretId: string): void => {
        secretsSet(store.getState().secrets.filter((secret) => secret.id !== secretId));
    };

    const now = deps.now ?? Date.now;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    const expiryTimerCancel = (): void => {
        if (expiryTimer === undefined) return;
        clearTimeout(expiryTimer);
        expiryTimer = undefined;
    };

    /** Reads again just after the soonest expiry, so an expired secret leaves on time. */
    const expirySchedule = (): void => {
        expiryTimerCancel();
        if (disposed || listeners.size === 0) return;
        const { secrets, serverClockOffset } = store.getState();
        let soonest: number | undefined;
        for (const secret of secrets)
            if (secret.expiresAt !== null && (soonest === undefined || secret.expiresAt < soonest))
                soonest = secret.expiresAt;
        if (soonest === undefined) return;
        const delay = Math.max(0, soonest - serverClockOffset - now()) + EXPIRY_READ_DELAY_MS;
        expiryTimer = setTimeout(() => {
            expiryTimer = undefined;
            load();
        }, delay);
    };

    const pagesRead = async (signal: AbortSignal) => {
        const secrets: HappyAgentClusterSecret[] = [];
        let cursor: string | undefined;
        let serverClockOffset: number | undefined;
        do {
            const page = await deps.client.listClusterSecrets(
                { limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
                { signal },
            );
            // The first page's clock is the one the whole list was read at.
            const serverTime = serverTimeOf(page);
            if (serverClockOffset === undefined && serverTime !== undefined)
                serverClockOffset = serverTime - now();
            secrets.push(...page.secrets.map(happyAgentClusterSecretProject));
            const next = page.nextCursor ?? undefined;
            if (next !== undefined && next === cursor)
                throw new Error("Happy Cloud returned a repeating secrets cursor.");
            cursor = next;
        } while (cursor !== undefined);
        return { secrets, serverClockOffset: serverClockOffset ?? 0 };
    };

    const readAll = async (signal: AbortSignal) => {
        const [permissions, { secrets, serverClockOffset }] = await Promise.all([
            deps.request("GET", "v0/permissions"),
            pagesRead(signal),
        ]);
        return {
            secrets,
            serverClockOffset,
            owners: happyAgentClusterSecretOwnersRead(permissions),
        };
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        if (reading !== undefined) {
            readAgain = true;
            return;
        }
        timerCancel();
        const controller = new AbortController();
        reading = controller;
        readAgain = false;
        const startedAt = writes;
        void readAll(controller.signal)
            .then(
                ({ secrets, owners, serverClockOffset }) => {
                    if (disposed || reading !== controller) return;
                    // A change settled while this read was out, so it may predate it.
                    if (writes !== startedAt) {
                        readAgain = true;
                        return;
                    }
                    const current = store.getState();
                    store.setState(
                        {
                            loading: false,
                            secrets: referencesPreserve(current.secrets, secrets),
                            owners: referencesPreserve(current.owners, owners),
                            serverClockOffset,
                        },
                        true,
                    );
                    expirySchedule();
                },
                (error: unknown) => {
                    if (disposed || reading !== controller || controller.signal.aborted) return;
                    if (store.getState().loading)
                        store.setState(
                            { loading: false, error: happyAgentUserError(error) },
                            false,
                        );
                },
            )
            .finally(() => {
                if (reading !== controller) return;
                reading = undefined;
                if (readAgain) load();
                else schedule();
            });
    }

    const follow = (): void => {
        const sync = deps.sync;
        if (!sync || disposed || follower !== undefined || listeners.size === 0) return;
        const active = new AbortController();
        follower = active;
        void (async () => {
            for await (const input of sync.follow({
                signal: active.signal,
                events: CLUSTER_SECRET_EVENTS,
            })) {
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "event")
                )
                    load();
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (follower === active) follower = undefined;
            });
    };

    const stop = (): void => {
        follower?.abort();
        follower = undefined;
        timerCancel();
        expiryTimerCancel();
        reading?.abort();
        reading = undefined;
        readAgain = false;
    };

    /** Runs one change, then reads the list again whatever its outcome. */
    const mutate = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
        if (disposed) throw new UserError("The secrets store is no longer available.");
        const controller = new AbortController();
        mutations.add(controller);
        try {
            return await run(controller.signal);
        } finally {
            mutations.delete(controller);
            writes += 1;
            load();
        }
    };

    /** Adopts the current secret a `409` carries and says why nothing changed. */
    const conflictAdopt = (error: HappyAgentApiError): UserError => {
        const current = error.body?.secret;
        if (Value.Check(clusterSecretSchema, current))
            secretAdopt(happyAgentClusterSecretProject(current));
        return new UserError(CONFLICT_MESSAGE, "conflict", error);
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                follow();
                load();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        secretCreate: (input) =>
            mutate(async (signal) => {
                try {
                    const response = await deps.client.createClusterSecret(
                        { ...input, mutationId: globalThis.crypto.randomUUID() },
                        { signal },
                    );
                    if (!disposed) secretAdopt(happyAgentClusterSecretProject(response.secret));
                } catch (error) {
                    throw happyAgentUserError(error);
                }
            }),
        secretUpdate: (secretId, version, input) =>
            mutate(async (signal) => {
                const request = updateRequest(input);
                if (request === undefined) return;
                try {
                    const response = await deps.client.updateClusterSecret(secretId, request, {
                        ifMatch: version,
                        signal,
                    });
                    if (!disposed) secretAdopt(happyAgentClusterSecretProject(response.secret));
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 409)
                        throw conflictAdopt(error);
                    if (error instanceof HappyAgentApiError && error.status === 404) {
                        secretForget(secretId);
                        throw new UserError("This secret no longer exists.", "not_found", error);
                    }
                    throw happyAgentUserError(error);
                }
            }),
        secretDelete: (secretId, version) =>
            mutate(async (signal) => {
                const secret = store.getState().secrets.find((each) => each.id === secretId);
                // A person deletes an agent's secret without managing it, so at no version.
                const versioned = !(secret?.scope === "agent" && !secret.access.manage);
                try {
                    await deps.client.deleteClusterSecret(
                        secretId,
                        { mutationId: globalThis.crypto.randomUUID() },
                        versioned ? { ifMatch: version, signal } : { signal },
                    );
                    secretForget(secretId);
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 409)
                        throw conflictAdopt(error);
                    if (error instanceof HappyAgentApiError && error.status === 404) {
                        secretForget(secretId);
                        return;
                    }
                    throw happyAgentUserError(error);
                }
            }),
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            for (const controller of mutations) controller.abort();
            mutations.clear();
            listeners.clear();
        },
    };
}

/** Copies the metadata field by field, so a value the cluster ever sent would not be kept. */
export function happyAgentClusterSecretProject(secret: ClusterSecret): HappyAgentClusterSecret {
    const scoped: object = secret;
    if (!isClusterSecretScopeFields(scoped))
        throw new Error("Happy Cloud sent a secret with an unreadable scope.");
    const fields: HappyAgentClusterSecretFields = {
        id: secret.id,
        name: secret.name,
        description: secret.description,
        ...scopeProject(scoped),
        access: {
            use: secret.access.use,
            manage: secret.access.manage,
            attach: secret.access.attach,
            delete: scoped.access.delete ?? secret.access.manage,
        },
        uses: secret.uses,
        version: secret.version,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
    };
    switch (secret.type) {
        case "endpoint":
            return { ...fields, type: secret.type, public: secret.public };
        case "ssh_key":
            return { ...fields, type: secret.type, public: secret.public };
        case "git_credential":
            return {
                ...fields,
                type: secret.type,
                public: {
                    ...secret.public,
                    operations: secret.public.operations.filter(
                        (operation) => operation === "read" || operation === "write",
                    ),
                },
            };
        case "environment":
            return { ...fields, type: secret.type, public: secret.public };
    }
}

function scopeProject(
    fields: ClusterSecretScopeFields,
): Pick<
    HappyAgentClusterSecretFields,
    "scope" | "owner" | "ownerAgentId" | "sharedWithAgentIds" | "expiresAt" | "maxExpiresAt"
> {
    return {
        scope: fields.scope ?? "team",
        owner: fields.owner,
        ownerAgentId: fields.ownerAgentId ?? null,
        sharedWithAgentIds: [...(fields.sharedWithAgentIds ?? [])],
        expiresAt: fields.expiresAt ?? null,
        maxExpiresAt: fields.maxExpiresAt ?? null,
    };
}

/** Which owners `secrets.manage` (team) and `secrets.own` (me) let the reader create for. */
export function happyAgentClusterSecretOwnersRead(
    permissions: unknown,
): readonly HappyAgentClusterSecretOwner[] {
    const granted =
        typeof permissions === "object" && permissions !== null && "granted" in permissions
            ? permissions.granted
            : undefined;
    const has = (id: string) => Array.isArray(granted) && granted.includes(id);
    return [
        ...(has("secrets.manage") ? (["team"] as const) : []),
        ...(has("secrets.own") ? (["me"] as const) : []),
    ];
}

function updateRequest(
    input: HappyAgentClusterSecretUpdateInput,
): UpdateClusterSecretRequest | undefined {
    const mutationId = globalThis.crypto.randomUUID();
    const { name, description, material } = input;
    if (material !== undefined)
        return {
            material,
            mutationId,
            ...(name === undefined ? {} : { name }),
            ...(description === undefined ? {} : { description }),
        };
    if (name !== undefined)
        return { name, mutationId, ...(description === undefined ? {} : { description }) };
    if (description !== undefined) return { description, mutationId };
    return undefined;
}

const UNAVAILABLE: HappyAgentClusterSecretsSnapshot = {
    loading: false,
    secrets: [],
    owners: [],
    serverClockOffset: 0,
};

/** A settled stand-in while no Happy Cloud catalog is shown. */
export const happyAgentClusterSecretsStoreNoop: HappyAgentClusterSecretsStore = {
    get: () => UNAVAILABLE,
    subscribe: () => () => undefined,
    secretCreate: () => Promise.reject(new UserError("Happy Cloud is unavailable.")),
    secretUpdate: () => Promise.reject(new UserError("Happy Cloud is unavailable.")),
    secretDelete: () => Promise.reject(new UserError("Happy Cloud is unavailable.")),
    [Symbol.dispose]: () => undefined,
};
