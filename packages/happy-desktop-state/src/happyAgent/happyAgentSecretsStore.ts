import type { HappyAgentClient, Secret } from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import { deepEqual, happyAgentUserError } from "./happyAgentSupport.js";

/** One environment variable supplied only while creating a secret. */
export interface HappyAgentSecretEnvironmentVariableInput {
    readonly name: string;
    readonly value: string;
}

/** The write-only input for one new environment-bundle secret. */
export interface HappyAgentSecretCreateInput {
    readonly availableToAgents: boolean;
    readonly description: string;
    readonly environmentVariables: readonly HappyAgentSecretEnvironmentVariableInput[];
}

/** Safe secret metadata. Environment values never enter this shape. */
export interface HappyAgentSecret {
    readonly availableToAgents: boolean;
    readonly createdAt: number;
    readonly description: string;
    readonly environmentVariables: readonly string[];
    readonly id: string;
    readonly managed: boolean;
    readonly updatedAt: number;
    readonly version: string;
}

export interface HappyAgentSecretsSnapshot {
    /** Why the first list read failed. A later successful read clears it. */
    readonly error?: UserError;
    /** True until the daemon first answers for the global list. */
    readonly loading: boolean;
    /** Every global secret, as safe metadata only. */
    readonly secrets: readonly HappyAgentSecret[];
}

/** The global secrets list and its write-only create action. */
export interface HappyAgentSecretsStore {
    get(): HappyAgentSecretsSnapshot;
    subscribe(listener: () => void): () => void;
    /** Creates one secret and rejects with a displayable refusal. */
    secretCreate(input: HappyAgentSecretCreateInput): Promise<void>;
    [Symbol.dispose](): void;
}

export interface HappyAgentSecretsStoreDeps {
    readonly client: Pick<HappyAgentClient, "createSecret" | "listSecrets">;
    readonly sync: HappyAgentSync;
}

const EMPTY: HappyAgentSecretsSnapshot = { loading: true, secrets: [] };
/** How long a failed read waits before it is tried again while the list is watched. */
const SECRETS_RETRY_MS = 4_000;
const SECRETS_PAGE_SIZE = 100;
/*
 * The events that change what the list shows. A grant attached or detached
 * changes no secret's metadata, so it does not cost a read.
 */
const SECRET_EVENTS = ["secret.created", "secret.updated", "secret.removed"] as const;

/**
 * Global environment-bundle secrets.
 *
 * Live while watched: the connection's bootstrap, reconciles and secret events
 * are delivery hints, each answered by one authoritative read of the list, and
 * the last unsubscribe stops following. Raw values remain local to the caller
 * and the outgoing create body; only the daemon's safe metadata response is
 * ever published.
 */
export function happyAgentSecretsStoreCreate(
    deps: HappyAgentSecretsStoreDeps,
): HappyAgentSecretsStore {
    const store = createStore<HappyAgentSecretsSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    const mutations = new Set<AbortController>();
    let disposed = false;
    let follower: AbortController | undefined;
    let readController: AbortController | undefined;
    /** A hint arrived while a read was out, so the read may predate what it hinted at. */
    let readAgain = false;
    let failed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const retryCancel = (): void => {
        if (retry === undefined) return;
        clearTimeout(retry);
        retry = undefined;
    };

    const retrySchedule = (): void => {
        if (disposed || listeners.size === 0 || retry !== undefined) return;
        retry = setTimeout(() => {
            retry = undefined;
            load();
        }, SECRETS_RETRY_MS);
    };

    const settleProjected = (next: readonly HappyAgentSecret[]): void => {
        const current = store.getState();
        const secrets = secretReferencesPreserve(current.secrets, next);
        store.setState({ loading: false, secrets }, true);
    };

    const settle = (next: readonly Secret[]): void => settleProjected(next.map(secretProject));

    const readAll = async (controller: AbortController): Promise<readonly Secret[]> => {
        const secrets: Secret[] = [];
        let cursor: string | undefined;
        do {
            const page = await deps.client.listSecrets(
                { limit: SECRETS_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
                { signal: controller.signal },
            );
            secrets.push(...page.secrets);
            const next = page.nextCursor ?? undefined;
            if (next !== undefined && next === cursor)
                throw new Error("Happy Agent returned a repeating secrets cursor.");
            cursor = next;
        } while (cursor !== undefined);
        return secrets;
    };

    const readFinish = (): void => {
        readController = undefined;
        if (!readAgain) return;
        readAgain = false;
        load();
    };

    /** Reads the list once, or once more after the read already out. */
    const load = (): void => {
        if (disposed || listeners.size === 0) return;
        if (readController !== undefined) {
            readAgain = true;
            return;
        }
        retryCancel();
        const controller = new AbortController();
        readController = controller;
        void readAll(controller).then(
            (secrets) => {
                if (disposed || readController !== controller) return;
                failed = false;
                settle(secrets);
                readFinish();
            },
            (error: unknown) => {
                if (disposed || readController !== controller || controller.signal.aborted) return;
                failed = true;
                if (store.getState().loading)
                    store.setState({ error: happyAgentUserError(error), loading: false }, false);
                readFinish();
                if (readController === undefined) retrySchedule();
            },
        );
    };

    const follow = (): void => {
        if (disposed || follower !== undefined || listeners.size === 0) return;
        const active = new AbortController();
        follower = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: SECRET_EVENTS,
            })) {
                if (input.kind === "error") continue;
                // A reconnect after a failed read is the moment to try again.
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    input.update.kind === "event" ||
                    (input.update.kind === "connected" && failed)
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
        retryCancel();
        readController?.abort();
        readController = undefined;
        readAgain = false;
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
        async secretCreate(input) {
            if (disposed) throw new UserError("The secrets store is no longer available.");
            // A read started before this write could answer afterward with the
            // old list. Stop it; the authoritative create response is adopted
            // immediately, and the secret's own event reads the list again.
            const reading = readController !== undefined || readAgain;
            readController?.abort();
            readController = undefined;
            readAgain = false;
            const controller = new AbortController();
            mutations.add(controller);
            const mutationId = globalThis.crypto.randomUUID();
            try {
                const response = await deps.client.createSecret(
                    {
                        availableToAgents: input.availableToAgents,
                        description: input.description,
                        environment: Object.fromEntries(
                            input.environmentVariables.map(({ name, value }) => [name, value]),
                        ),
                        mutationId,
                    },
                    { signal: controller.signal },
                );
                if (disposed) return;
                const current = store.getState();
                settleProjected([
                    secretProject(response.secret),
                    ...current.secrets.filter((secret) => secret.id !== response.secret.id),
                ]);
            } catch (error) {
                throw happyAgentUserError(error);
            } finally {
                mutations.delete(controller);
                // The read stopped above still owes its watcher an answer.
                if (reading) load();
            }
        },
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

function secretProject(secret: Secret): HappyAgentSecret {
    return {
        availableToAgents: secret.availableToAgents,
        createdAt: secret.createdAt,
        description: secret.description,
        environmentVariables: secret.environmentVariables,
        id: secret.id,
        managed: secret.managed,
        updatedAt: secret.updatedAt,
        version: secret.version,
    };
}

/** Keeps unchanged entities stable even when a new secret moves their indexes. */
function secretReferencesPreserve(
    previous: readonly HappyAgentSecret[],
    next: readonly HappyAgentSecret[],
): readonly HappyAgentSecret[] {
    const previousById = new Map(previous.map((secret) => [secret.id, secret]));
    const merged = next.map((secret) => {
        const before = previousById.get(secret.id);
        return before !== undefined && deepEqual(before, secret) ? before : secret;
    });
    return merged.length === previous.length &&
        merged.every((secret, index) => previous[index] === secret)
        ? previous
        : merged;
}

const UNAVAILABLE: HappyAgentSecretsSnapshot = { loading: false, secrets: [] };

/** A settled stand-in when this window has no Happy Agent secrets capability. */
export const happyAgentSecretsStoreNoop: HappyAgentSecretsStore = {
    get: () => UNAVAILABLE,
    subscribe: () => () => undefined,
    secretCreate: () => Promise.reject(new UserError("This Happy Agent is unavailable.")),
    [Symbol.dispose]: () => undefined,
};
