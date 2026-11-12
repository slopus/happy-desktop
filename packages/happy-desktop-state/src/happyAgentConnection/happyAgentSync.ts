import type {
    HappyAgentClient,
    HappyAgentEvent,
    HappyAgentUpdate,
} from "@slopus/happy-agent-client";

type DesktopBootstrap = Awaited<ReturnType<HappyAgentClient["getDesktopBootstrap"]>>;

/** What a daemon says about itself on `GET /v0/health`, and in a current daemon's bootstrap. */
export type HappyAgentHealth = Awaited<ReturnType<HappyAgentClient["getHealth"]>>;

/** The only authenticated state available before a team member has a profile. */
export interface HappyAgentOnboardingInput {
    readonly onboarding: Awaited<ReturnType<HappyAgentClient["getOnboarding"]>>;
    readonly profile: DesktopBootstrap["profile"];
}

/** Private authoritative input to feature stores, never a product/UI snapshot. */
export type HappyAgentSyncInput =
    | { readonly kind: "bootstrap"; readonly bootstrap: DesktopBootstrap }
    | { readonly kind: "reconcile" }
    | { readonly kind: "update"; readonly update: HappyAgentUpdate }
    | { readonly kind: "error"; readonly error: Error };

type QueuedSyncInput =
    | HappyAgentSyncInput
    | { readonly kind: "onboarding"; readonly input: HappyAgentOnboardingInput | undefined };

/**
 * Events only Happy Cloud sends, which the daemon's protocol package does not
 * name. They carry no payload a follower reads; each is a hint to read again.
 */
export type HappyCloudEventType = "compute.nodes.updated" | "compute.approvals.updated";

/** One connection's transport input. Following it never opens another request or SSE stream. */
export interface HappyAgentSync {
    follow(options: {
        readonly signal: AbortSignal;
        readonly events: readonly (HappyAgentEvent["type"] | HappyCloudEventType)[];
        /**
         * Opts into live document frames, which carry typing as it happens and
         * would otherwise crowd every other follower's queue.
         */
        readonly documents?: boolean;
        /** Opts into narrow startup reads, without releasing protected surface reads. */
        readonly onOnboarding?: (input: HappyAgentOnboardingInput | undefined) => void;
    }): AsyncIterable<HappyAgentSyncInput>;
    /**
     * What the daemon this connection follows last said about its health, once
     * the connection has heard. The connection reads it again, or takes it from
     * the bootstrap, whenever a different process may be answering, so a
     * surface that only needs capabilities asks nothing of its own.
     */
    health(): HappyAgentHealth | undefined;
}

/**
 * The connection privately writes its bootstrap and ordered transport updates.
 * No aggregate product state or historical bootstrap is retained here. A late
 * surface reconciles its own endpoint with its subscription already installed.
 * Before bootstrap, only the narrow onboarding input is replayed to opted-in
 * consumers. It is discarded on bootstrap or failed reachability; ordinary
 * surfaces remain parked until protected synchronization is initialized.
 */
export function happyAgentSyncCreate() {
    const listeners = new Set<(input: QueuedSyncInput) => void>();
    let initialized = false;
    let closed = false;
    let connectionUpdate: HappyAgentUpdate | undefined;
    /** The latest connection, which names the stream documents subscribe on. */
    let connected: Extract<HappyAgentUpdate, { kind: "connected" }> | undefined;
    let onboarding: HappyAgentOnboardingInput | undefined;
    let health: HappyAgentHealth | undefined;
    const onboardingPublish = (input: HappyAgentOnboardingInput | undefined): void => {
        if (closed) return;
        onboarding = input;
        publish({ kind: "onboarding", input });
    };
    const publish = (input: QueuedSyncInput): void => {
        if (closed) return;
        for (const listener of listeners) listener(input);
    };
    const source: HappyAgentSync = {
        async *follow({ signal, events, documents, onOnboarding }) {
            if (closed || signal.aborted) return;
            // Every follower sees every event of the connection; most want few kinds.
            const wanted = new Set(events);
            const queue: QueuedSyncInput[] = [];
            let wake: (() => void) | undefined;
            const notify = (): void => {
                wake?.();
                wake = undefined;
            };
            const receive = (input: QueuedSyncInput): void => {
                if (input.kind === "onboarding" && !onOnboarding) return;
                if (
                    input.kind === "update" &&
                    input.update.kind === "event" &&
                    !wanted.has(input.update.event.type)
                )
                    return;
                if (input.kind === "update" && input.update.kind === "document" && !documents)
                    return;
                if (input.kind === "bootstrap") queue.length = 0;
                // A slow endpoint cannot accumulate an unbounded journal. The
                // authoritative narrow read repairs discarded delivery hints.
                if (queue.length >= 64) {
                    queue.length = 0;
                    // Before bootstrap there is no authorized reconciliation
                    // route for ordinary surfaces. Only replay narrow input.
                    if (initialized) queue.push({ kind: "reconcile" });
                    else if (onOnboarding) queue.push({ kind: "onboarding", input: onboarding });
                }
                queue.push(input);
                notify();
            };
            listeners.add(receive);
            signal.addEventListener("abort", notify, { once: true });
            try {
                if (onOnboarding && onboarding) receive({ kind: "onboarding", input: onboarding });
                if (initialized) {
                    receive({ kind: "reconcile" });
                    // A draining connection is still the stream documents are
                    // subscribed on, which only its connection named.
                    if (documents && connectionUpdate?.kind === "draining" && connected)
                        receive({ kind: "update", update: connected });
                    if (connectionUpdate) receive({ kind: "update", update: connectionUpdate });
                }
                while (!closed && !signal.aborted) {
                    const next = queue.shift();
                    // Consumer callbacks run in their follower, never inside
                    // the connection loop, and retain ordering with errors.
                    if (next?.kind === "onboarding") onOnboarding?.(next.input);
                    else if (next) yield next;
                    else
                        await new Promise<void>((resolve) => {
                            wake = resolve;
                        });
                }
            } finally {
                listeners.delete(receive);
                signal.removeEventListener("abort", notify);
                queue.length = 0;
            }
        },
        health: () => health,
    };
    return {
        source,
        writer: {
            onboardingReceived(input: HappyAgentOnboardingInput): void {
                onboardingPublish(input);
            },
            onboardingUnavailable(): void {
                onboardingPublish(undefined);
            },
            /** Recorded before anything that follows from it is published. */
            healthReceived(next: HappyAgentHealth): void {
                health = next;
            },
            bootstrapReceived(bootstrap: DesktopBootstrap): void {
                onboarding = undefined;
                initialized = true;
                publish({ kind: "bootstrap", bootstrap });
            },
            updateReceived(update: HappyAgentUpdate): void {
                if (update.kind === "connected") connected = update;
                else if (update.kind === "disconnected") connected = undefined;
                if (
                    update.kind === "connected" ||
                    update.kind === "disconnected" ||
                    update.kind === "draining"
                )
                    connectionUpdate = update;
                publish({ kind: "update", update });
            },
            errorReceived(error: unknown): void {
                onboardingPublish(undefined);
                publish({
                    kind: "error",
                    error: error instanceof Error ? error : new Error(String(error)),
                });
            },
            close(): void {
                closed = true;
                // Wake parked iterators so their finally blocks release listeners.
                for (const listener of listeners) listener({ kind: "reconcile" });
                listeners.clear();
                onboarding = undefined;
            },
        },
    };
}
