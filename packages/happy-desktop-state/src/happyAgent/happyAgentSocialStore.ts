import type { CloudSocial, CloudSocialProfile, HappyAgentClient } from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

export interface HappyAgentSocialPerson {
    readonly firstName: string;
    readonly lastName?: string;
    readonly username: string;
}

export type HappyAgentSocialMutation =
    | { readonly kind: "send"; readonly username: string }
    | { readonly kind: "accept"; readonly username: string }
    | { readonly kind: "reject"; readonly username: string };

export interface HappyAgentSocialSnapshot {
    readonly status: "loading" | "unenrolled" | "ready" | "error";
    readonly friendUsername: string;
    readonly friends: readonly HappyAgentSocialPerson[];
    readonly incomingRequests: readonly HappyAgentSocialPerson[];
    readonly outgoingRequests: readonly HappyAgentSocialPerson[];
    readonly mutation?: HappyAgentSocialMutation;
    readonly error?: UserError;
}

export interface HappyAgentSocialStore {
    get(): HappyAgentSocialSnapshot;
    subscribe(listener: () => void): () => void;
    friendUsernameUpdate(value: string): void;
    friendRequestSend(): void;
    friendRequestAccept(username: string): void;
    friendRequestReject(username: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSocialStoreDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "approveCloudFriendRequest"
        | "getCloudSocial"
        | "getDesktopBootstrap"
        | "rejectCloudFriendRequest"
        | "sendCloudFriendRequest"
        | "updates"
    >;
}

const EMPTY: HappyAgentSocialSnapshot = {
    friendUsername: "",
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    status: "loading",
};
const UNAVAILABLE: HappyAgentSocialSnapshot = { ...EMPTY, status: "error" };

/** The on-demand, daemon-backed friends surface for one Happy Agent installation. */
export function happyAgentSocialStoreCreate(
    deps: HappyAgentSocialStoreDeps,
): HappyAgentSocialStore {
    const store = createStore<HappyAgentSocialSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let disposed = false;
    let readRequest = 0;

    const adopt = (social: CloudSocial, mutationSettled = false): void => {
        const current = store.getState();
        if (social.status === "unenrolled") {
            store.setState(
                {
                    friendUsername: current.friendUsername,
                    friends: [],
                    incomingRequests: [],
                    outgoingRequests: [],
                    status: "unenrolled",
                },
                true,
            );
            return;
        }
        store.setState(
            {
                friendUsername:
                    mutationSettled && current.mutation?.kind === "send"
                        ? ""
                        : current.friendUsername,
                friends: social.friends.map(personProject),
                incomingRequests: social.incomingRequests.map(personProject),
                outgoingRequests: social.outgoingRequests.map(personProject),
                status: "ready",
                ...(!mutationSettled && current.mutation ? { mutation: current.mutation } : {}),
            },
            true,
        );
    };

    const socialRead = (signal?: AbortSignal): void => {
        const request = ++readRequest;
        void deps.client.getCloudSocial({ signal }).then(
            (response) => {
                if (disposed || signal?.aborted || request !== readRequest) return;
                adopt(response.cloudSocial);
            },
            (error: unknown) => {
                if (disposed || signal?.aborted || request !== readRequest) return;
                const current = store.getState();
                store.setState(
                    {
                        error: happyAgentUserError(error),
                        ...(current.status === "loading" ? { status: "error" as const } : {}),
                    },
                    false,
                );
            },
        );
    };

    const follow = async (active: AbortController): Promise<void> => {
        for (;;) {
            const bootstrap = await deps.client.getDesktopBootstrap({ signal: active.signal });
            if (active.signal.aborted) return;
            if (bootstrap.cloudSocial) adopt(bootstrap.cloudSocial);
            else socialRead(active.signal);

            let reconcile = false;
            for await (const update of deps.client.updates({
                after: bootstrap.cursor,
                signal: active.signal,
            })) {
                if (
                    update.kind === "state_lost" ||
                    (update.kind === "daemon_started" && update.replaced)
                ) {
                    reconcile = true;
                    break;
                }
                if (update.kind === "event" && update.event.type === "cloud.social.updated")
                    socialRead(active.signal);
            }
            if (active.signal.aborted) return;
            if (!reconcile) throw new Error("Happy Social updates stopped.");
        }
    };

    const lifecycleEnsure = (): void => {
        if (disposed || controller) return;
        const active = new AbortController();
        controller = active;
        void follow(active)
            .catch((error: unknown) => {
                if (disposed || active.signal.aborted) return;
                const current = store.getState();
                store.setState(
                    {
                        error: happyAgentUserError(error),
                        ...(current.status === "loading" ? { status: "error" as const } : {}),
                    },
                    false,
                );
            })
            .finally(() => {
                if (controller === active) controller = undefined;
            });
    };

    const lifecycleStopIfIdle = (): void => {
        if (listeners.size > 0 || store.getState().mutation) return;
        controller?.abort();
        controller = undefined;
    };

    const mutate = (
        mutation: HappyAgentSocialMutation,
        run: (mutationId: string) => Promise<{ readonly cloudSocial: CloudSocial }>,
    ): void => {
        const current = store.getState();
        if (disposed || current.status !== "ready" || current.mutation) return;
        store.setState({ error: undefined, mutation }, false);
        const mutationId = globalThis.crypto.randomUUID();
        void run(mutationId)
            .then(
                (response) => {
                    if (disposed) return;
                    adopt(response.cloudSocial, true);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        { error: happyAgentUserError(error), mutation: undefined },
                        false,
                    );
                },
            )
            .finally(lifecycleStopIfIdle);
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) lifecycleEnsure();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                lifecycleStopIfIdle();
            };
        },
        friendUsernameUpdate(value) {
            const current = store.getState();
            if (disposed || current.status !== "ready" || current.mutation) return;
            store.setState({ error: undefined, friendUsername: value }, false);
        },
        friendRequestSend() {
            const username = store.getState().friendUsername.trim().replace(/^@/u, "");
            if (!/^[a-z0-9_]{3,24}$/u.test(username)) {
                store.setState(
                    {
                        error: happyAgentUserError(
                            new Error("Use 3–24 lowercase letters, digits, or underscores."),
                        ),
                    },
                    false,
                );
                return;
            }
            mutate({ kind: "send", username }, (mutationId) =>
                deps.client.sendCloudFriendRequest(username, { mutationId }),
            );
        },
        friendRequestAccept(username) {
            mutate({ kind: "accept", username }, (mutationId) =>
                deps.client.approveCloudFriendRequest(username, { mutationId }),
            );
        },
        friendRequestReject(username) {
            mutate({ kind: "reject", username }, (mutationId) =>
                deps.client.rejectCloudFriendRequest(username, { mutationId }),
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            readRequest += 1;
            controller?.abort();
            controller = undefined;
            listeners.clear();
        },
    };
}

function personProject(person: CloudSocialProfile): HappyAgentSocialPerson {
    return {
        firstName: person.firstName,
        ...(person.lastName ? { lastName: person.lastName } : {}),
        username: person.username,
    };
}

/** A settled stand-in for hosts that do not expose a social surface. */
export const happyAgentSocialStoreNoop: HappyAgentSocialStore = {
    get: () => UNAVAILABLE,
    subscribe: () => () => undefined,
    friendUsernameUpdate: () => undefined,
    friendRequestSend: () => undefined,
    friendRequestAccept: () => undefined,
    friendRequestReject: () => undefined,
    [Symbol.dispose]: () => undefined,
};
