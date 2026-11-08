import {
    HappyAgentApiError,
    type HappyAgentClient,
    type OnboardingFlow,
} from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import { cuid2Create } from "../utils/cuid2Create.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";

/**
 * Onboarding run by the server as a conversation (`capabilities.chatOnboarding`,
 * happy-agent API.md "Onboarding in a conversation").
 *
 * The server owns all of it: which recipe runs for the caller, what each
 * message says, which step comes next. The window draws that conversation like
 * any other. This store holds only what the window adds: whether the server
 * runs it at all, the flow object as the server last described it, starting it
 * once the host decides this is the moment, and opening its conversation.
 *
 * A server without the capability is `unsupported`, and the host keeps its own
 * welcome and setup. That is never read as onboarding being complete, and
 * nothing here ever marks onboarding complete.
 */
export type HappyAgentChatOnboardingSnapshot = {
    /**
     * `checking` until the connection has heard the server's health;
     * `unsupported` when it does not run onboarding as a conversation;
     * `available` once its flow has been read.
     */
    readonly status: "checking" | "unsupported" | "available";
    /** The flow as the server last described it, while `available`. */
    readonly flow?: OnboardingFlow;
    /** The host asked for onboarding to begin on this connection. */
    readonly begun: boolean;
    /** Why the last read or start failed, until one succeeds. */
    readonly error?: string;
};

export interface HappyAgentChatOnboardingStore {
    get(): HappyAgentChatOnboardingSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Starts onboarding when the server says it is owed and has not begun,
     * then opens its conversation; carries on where it stands otherwise. Safe
     * to call again: the server starts it once, and the conversation is opened
     * once per connection.
     */
    begin(): void;
    [Symbol.dispose](): void;
}

/**
 * Whether this window takes the onboarding a server runs as a conversation.
 * Off, every server is treated as one without it: the window keeps its own
 * welcome and setup, and no flow is ever started.
 */
export interface HappyAgentChatOnboardingGate {
    get(): boolean;
    subscribe(listener: () => void): () => void;
}

export interface HappyAgentChatOnboardingStoreDeps {
    readonly client: Pick<
        HappyAgentClient,
        "getOnboarding" | "getOnboardingFlow" | "startOnboardingFlow"
    >;
    readonly sync: HappyAgentSync;
    /** Opens the conversation onboarding runs in, by its agent ID. */
    readonly conversationOpen: (agentId: string) => void;
    /**
     * Drains and restarts the server, for a provider chosen during onboarding
     * that takes effect only after a restart. Absent where the window cannot
     * restart it, as for a team server.
     */
    readonly serverRestart?: () => Promise<void>;
    /** Absent, onboarding runs wherever the server offers it. */
    readonly gate?: HappyAgentChatOnboardingGate;
}

const CHECKING: HappyAgentChatOnboardingSnapshot = { status: "checking", begun: false };
const UNSUPPORTED: HappyAgentChatOnboardingSnapshot = { status: "unsupported", begun: false };

/** A server that runs no onboarding of its own, for surfaces with no connection behind them. */
export const happyAgentChatOnboardingStoreNoop: HappyAgentChatOnboardingStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    begin: () => undefined,
    [Symbol.dispose]: () => undefined,
};
/**
 * A saved profile is followed too: a team server refuses the flow to a member
 * without one, and nothing about the flow announces when it answers again.
 */
const FLOW_EVENTS = ["onboarding.flow.updated", "profile.updated"] as const;
/** How long a failed read or start waits before it is tried again while someone watches. */
const RETRY_MS = 4_000;

/** Whether onboarding is over for good in this flow: finished, or every requirement met. */
export function happyAgentChatOnboardingOver(flow: OnboardingFlow): boolean {
    return (
        flow.status === "finished" ||
        (flow.completedVersion !== null && flow.completedVersion >= flow.onboardingVersion)
    );
}

/** What onboarding asks of one conversation's composer while it runs there. */
export type HappyAgentChatOnboardingComposer = {
    /** The flow's scripted part takes no typing yet. */
    readonly disabled: boolean;
    readonly placeholder?: string;
};

/**
 * The composer `agentId`'s conversation has while onboarding runs in it, or
 * `undefined` anywhere else and once it has finished. A status this build does
 * not know counts as running, as the API says.
 */
export function happyAgentChatOnboardingComposer(
    snapshot: HappyAgentChatOnboardingSnapshot,
    agentId: string,
): HappyAgentChatOnboardingComposer | undefined {
    const flow = snapshot.flow;
    if (
        snapshot.status !== "available" ||
        flow === undefined ||
        flow.agentId !== agentId ||
        flow.status === "not_started" ||
        flow.status === "finished"
    )
        return undefined;
    return {
        disabled: flow.composer === "disabled",
        ...(flow.composerPlaceholder === null ? {} : { placeholder: flow.composerPlaceholder }),
    };
}

/**
 * The flow to keep. Each change to one flow advances its UUIDv7, so within one
 * flow the greater version wins. A server may replace the caller's flow with
 * another, such as a team's setup with the member's own Welcome, whose version
 * starts over; then the server's newer answer wins whatever its version. A
 * flow is told apart by its `id` (`null` before it starts) where the server
 * sends one, and by its recipe where it does not, as a standalone daemon.
 */
function flowNewer(current: OnboardingFlow | undefined, next: OnboardingFlow): OnboardingFlow {
    if (current === undefined) return next;
    const same =
        current.id !== undefined || next.id !== undefined
            ? current.id === next.id
            : current.recipe === next.recipe;
    if (!same) return next;
    return current.version >= next.version ? current : next;
}

/**
 * Follows one connection's onboarding flow while watched. The connection's
 * bootstrap, reconciles, and `onboarding.flow.updated` are delivery hints,
 * each answered by one read of `GET /v0/onboarding/flow`; nothing opens until
 * the first subscriber.
 */
export function happyAgentChatOnboardingStoreCreate(
    deps: HappyAgentChatOnboardingStoreDeps,
): HappyAgentChatOnboardingStore {
    const store = createStore<HappyAgentChatOnboardingSnapshot>()(() => CHECKING);
    const listeners = new Set<() => void>();
    const mutationIdNext = cuid2Create(Date.now);
    let disposed = false;
    let follower: AbortController | undefined;
    let gateStop: (() => void) | undefined;
    const enabled = (): boolean => deps.gate?.get() ?? true;
    let reading: AbortController | undefined;
    let readAgain = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let starting = false;
    /** One identity for the start, however many times it is attempted. */
    let startMutationId: string | undefined;
    /** The conversations already opened, so the window is moved there once. */
    const opened = new Set<string>();
    /** The flow version a restart was asked for, so one restart answers one request. */
    let restartedFor: string | undefined;
    /** The last read was refused until this person saves a profile. */
    let profileRequired = false;

    const set = (next: Partial<HappyAgentChatOnboardingSnapshot>): void => {
        const current = store.getState();
        const merged = { ...current, ...next };
        if (
            merged.status === current.status &&
            merged.flow === current.flow &&
            merged.begun === current.begun &&
            merged.error === current.error
        )
            return;
        store.setState(merged, true);
    };

    const retrySchedule = (): void => {
        if (disposed || listeners.size === 0 || retry !== undefined) return;
        retry = setTimeout(() => {
            retry = undefined;
            refresh();
        }, RETRY_MS);
    };

    /**
     * Takes a flow the server answered with, and does what it now asks of the
     * window. `started` is the answer to this store's own start.
     */
    const flowTake = (next: OnboardingFlow, started = false): void => {
        if (disposed) return;
        const flow = flowNewer(store.getState().flow, next);
        set({ status: "available", flow, error: undefined });
        const snapshot = store.getState();
        const over = happyAgentChatOnboardingOver(flow);
        // A flow can be over by the time its own start answers: a team
        // viewer's finishes in its first step. Its conversation still opens,
        // once. A flow read over, as on every later launch, opens nothing.
        if (!snapshot.begun || (over && !started)) return;
        if (flow.agentId !== null && !opened.has(flow.agentId)) {
            opened.add(flow.agentId);
            deps.conversationOpen(flow.agentId);
        }
        if (over) return;
        if (!flow.restartRequired) restartedFor = undefined;
        else if (deps.serverRestart && restartedFor === undefined) {
            restartedFor = flow.version;
            void deps
                .serverRestart()
                .catch(() => undefined)
                .finally(refresh);
        }
    };

    /** Reads the flow once, or once more after the read already out. */
    const refresh = (): void => {
        if (disposed || listeners.size === 0) return;
        if (!enabled()) {
            set({ status: "unsupported", flow: undefined, begun: false, error: undefined });
            return;
        }
        if (deps.sync.health()?.capabilities?.chatOnboarding !== true) {
            // A server that has not answered yet is still being checked; one
            // that answered without the capability does not run it.
            set(
                deps.sync.health() === undefined
                    ? { status: "checking", flow: undefined }
                    : { status: "unsupported", flow: undefined },
            );
            return;
        }
        if (reading !== undefined) {
            readAgain = true;
            return;
        }
        const controller = new AbortController();
        reading = controller;
        void deps.client
            .getOnboardingFlow({ signal: controller.signal })
            .then(
                ({ flow }) => {
                    if (reading === controller) {
                        profileRequired = false;
                        flowTake(flow);
                    }
                    if (store.getState().begun) startIfOwed();
                },
                (error: unknown) => {
                    if (disposed || controller.signal.aborted || reading !== controller) return;
                    set({ error: error instanceof Error ? error.message : String(error) });
                    // A team member without a profile is refused until they
                    // save one, and the saved profile's event reads it again.
                    profileRequired =
                        error instanceof HappyAgentApiError && error.code === "profile_required";
                    if (!profileRequired) retrySchedule();
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

    /**
     * Starts onboarding once the server says it is owed: its own
     * `GET /v0/onboarding` reports it incomplete and the flow has not begun.
     */
    const startIfOwed = (): void => {
        const flow = store.getState().flow;
        if (
            disposed ||
            starting ||
            !enabled() ||
            flow === undefined ||
            flow.status !== "not_started"
        )
            return;
        starting = true;
        startMutationId ??= mutationIdNext();
        const mutationId = startMutationId;
        void (async () => {
            const onboarding = await deps.client.getOnboarding();
            if (onboarding.completed || disposed) return;
            const { flow: started } = await deps.client.startOnboardingFlow({
                mutationId,
                device: "desktop",
            });
            flowTake(started, true);
        })()
            .catch((error: unknown) => {
                if (disposed) return;
                set({ error: error instanceof Error ? error.message : String(error) });
                retrySchedule();
            })
            .finally(() => {
                starting = false;
            });
    };

    const follow = (): void => {
        if (disposed || follower !== undefined || listeners.size === 0) return;
        const active = new AbortController();
        follower = active;
        // Turning it on or off reads the server again, or forgets its flow.
        gateStop = deps.gate?.subscribe(refresh);
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: FLOW_EVENTS,
            })) {
                if (input.kind === "error") continue;
                // Anyone's saved profile is announced; only one this read was
                // waiting on can change the answer.
                if (
                    input.kind === "update" &&
                    input.update.kind === "event" &&
                    input.update.event.type === "profile.updated" &&
                    !profileRequired
                )
                    continue;
                // Every new connection may be a different server, with or
                // without the capability, and its flow may have moved on.
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
        gateStop?.();
        gateStop = undefined;
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
        begin() {
            if (disposed || !enabled() || store.getState().begun) return;
            set({ begun: true });
            const flow = store.getState().flow;
            if (flow !== undefined) flowTake(flow);
            startIfOwed();
            // The flow may not have been read yet, or was refused before.
            if (flow === undefined) refresh();
        },
        [Symbol.dispose]() {
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
