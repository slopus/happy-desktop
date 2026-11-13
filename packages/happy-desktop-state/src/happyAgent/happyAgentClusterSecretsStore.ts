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
import { UserError } from "../types.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** `me` is the reader's own secret, which nobody else sees; `team` is the organization's. */
export type HappyAgentClusterSecretOwner = "me" | "team";

interface HappyAgentClusterSecretFields {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly owner: HappyAgentClusterSecretOwner;
    /** What the reader may do with it. */
    readonly access: ClusterSecretAccess;
    readonly uses: readonly ClusterSecretUse[];
    /** Sent as `If-Match` by every change. */
    readonly version: string;
    readonly createdAt: number;
    readonly updatedAt: number;
}

/** One catalog secret as metadata. Its value is write-only and never enters this shape. */
export type HappyAgentClusterSecret = HappyAgentClusterSecretFields &
    (
        | { readonly type: "endpoint"; readonly public: ClusterEndpointPublic }
        | { readonly type: "ssh_key"; readonly public: ClusterSshKeyPublic }
        | { readonly type: "git_credential"; readonly public: ClusterGitCredentialPublic }
        | { readonly type: "environment"; readonly public: ClusterEnvironmentPublic }
    );

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A new secret with its write-only material. Role rules are not edited here yet. */
export type HappyAgentClusterSecretCreateInput = DistributiveOmit<
    CreateClusterSecretRequest,
    "mutationId" | "roles"
>;

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
    /** Deletes one secret at `version`; one already gone counts as deleted. */
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
}

const EMPTY: HappyAgentClusterSecretsSnapshot = { loading: true, secrets: [], owners: [] };
/** The catalog has no event this client reads yet, so a watched list is read again this often. */
const POLL_INTERVAL_MS = 4_000;
const PAGE_SIZE = 100;
const CONFLICT_MESSAGE =
    "Someone changed this secret while you were editing it. Its current details are shown now; save again to replace them.";

/**
 * The cluster's typed secret catalog.
 *
 * Read while watched, and again every few seconds and after each change this
 * store makes. Values travel only in the outgoing create and update bodies;
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

    const pagesRead = async (signal: AbortSignal) => {
        const secrets: HappyAgentClusterSecret[] = [];
        let cursor: string | undefined;
        do {
            const page = await deps.client.listClusterSecrets(
                { limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
                { signal },
            );
            secrets.push(...page.secrets.map(clusterSecretProject));
            const next = page.nextCursor ?? undefined;
            if (next !== undefined && next === cursor)
                throw new Error("Happy Cloud returned a repeating secrets cursor.");
            cursor = next;
        } while (cursor !== undefined);
        return secrets;
    };

    const readAll = async (signal: AbortSignal) => {
        const [permissions, secrets] = await Promise.all([
            deps.request("GET", "v0/permissions"),
            pagesRead(signal),
        ]);
        return { secrets, owners: ownersRead(permissions) };
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
                ({ secrets, owners }) => {
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
                        },
                        true,
                    );
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

    const stop = (): void => {
        timerCancel();
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
        if (Value.Check(clusterSecretSchema, current)) secretAdopt(clusterSecretProject(current));
        return new UserError(CONFLICT_MESSAGE, "conflict", error);
    };

    return {
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
                    if (!disposed) secretAdopt(clusterSecretProject(response.secret));
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
                    if (!disposed) secretAdopt(clusterSecretProject(response.secret));
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
                try {
                    await deps.client.deleteClusterSecret(
                        secretId,
                        { mutationId: globalThis.crypto.randomUUID() },
                        { ifMatch: version, signal },
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
function clusterSecretProject(secret: ClusterSecret): HappyAgentClusterSecret {
    const fields: HappyAgentClusterSecretFields = {
        id: secret.id,
        name: secret.name,
        description: secret.description,
        owner: secret.owner,
        access: {
            use: secret.access.use,
            manage: secret.access.manage,
            attach: secret.access.attach,
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
            return { ...fields, type: secret.type, public: secret.public };
        case "environment":
            return { ...fields, type: secret.type, public: secret.public };
    }
}

/** Which owners `secrets.manage` (team) and `secrets.own` (me) let the reader create for. */
function ownersRead(permissions: unknown): readonly HappyAgentClusterSecretOwner[] {
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

const UNAVAILABLE: HappyAgentClusterSecretsSnapshot = { loading: false, secrets: [], owners: [] };

/** A settled stand-in while no Happy Cloud catalog is shown. */
export const happyAgentClusterSecretsStoreNoop: HappyAgentClusterSecretsStore = {
    get: () => UNAVAILABLE,
    subscribe: () => () => undefined,
    secretCreate: () => Promise.reject(new UserError("Happy Cloud is unavailable.")),
    secretUpdate: () => Promise.reject(new UserError("Happy Cloud is unavailable.")),
    secretDelete: () => Promise.reject(new UserError("Happy Cloud is unavailable.")),
    [Symbol.dispose]: () => undefined,
};
